// ================================================
// ARCHIVO: servicios.js
// DESCRIPCIÓN: Módulo de Automatización Industrial adaptado a Supabase
// BASADO EN: servicios-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de proyectos de automatización con 5 pasos,
//                épicas, tareas, subtareas, materiales, cronograma Gantt.
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { getPrioritySuppliersForModule } from '../core/ssepi-runtime/priority-suppliers-catalog.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';

const ServiciosModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let projects = [];
    let inventory = [];
    let currentProject = null;
    let projectId = null;
    let isNewProject = true;
    let currentStep = 1;
    let fechaInicio = null;

    // Listas específicas
    let actividades = [];
    let materiales = [];
    let epicas = [];
    let apartados = [];

    // Catálogo de servicios (fijo)
    const catalogoServicios = [
        { area: "Diseño", servicio: "Diseño arquitectura de control", tipo: "O", horasBase: 6 },
        { area: "Eléctrica", servicio: "Diseño tablero BT", tipo: "O", horasBase: 8 },
        { area: "Eléctrica", servicio: "Instalación cableado", tipo: "P", horasBase: 4 },
        { area: "Control", servicio: "Programación PLC", tipo: "O", horasBase: 10 },
        { area: "Control", servicio: "Configuración variadores", tipo: "O", horasBase: 6 },
        { area: "Visión", servicio: "Integración cámaras", tipo: "P", horasBase: 8 },
        { area: "Soporte", servicio: "Diagnóstico en sitio", tipo: "P", horasBase: 4 }
    ];

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroIngeniero = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    // Servicios de datos
    const proyectosService = createDataService('proyectos_automatizacion');
    const inventarioService = createDataService('inventario');
    const comprasService = createDataService('compras');

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];
    let serviciosAutosaveCtrl = null;
    let serviciosDraftSessionKey = null;

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Automatización] Conectado');
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
            await _loadInitialData();
            _startClock();
            _setupRealtime();
        } catch (e) {
            console.error('[Automatización] init error:', e);
        }
        _renderAutoPriorityChips();
        _initServiciosAutosave();
        _tryResumeServiciosDraft();
        console.log('✅ Módulo automatización iniciado');
    }

    function _serviciosRecordKey() {
        if (projectId) return String(projectId);
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) return 'new:' + folio;
        if (!serviciosDraftSessionKey) serviciosDraftSessionKey = 'tmp:' + Date.now();
        return serviciosDraftSessionKey;
    }

    function _collectServiciosDraftPayload() {
        return {
            v: 1,
            currentStep: currentStep,
            projectId: projectId,
            isNewProject: isNewProject,
            folio: document.getElementById('inpFolio') ? document.getElementById('inpFolio').value : '',
            paso1_nombre: document.getElementById('paso1_nombre') ? document.getElementById('paso1_nombre').value : '',
            paso1_cliente: document.getElementById('paso1_cliente') ? document.getElementById('paso1_cliente').value : '',
            paso1_fecha: document.getElementById('paso1_fecha') ? document.getElementById('paso1_fecha').value : '',
            paso1_vendedor: document.getElementById('paso1_vendedor') ? document.getElementById('paso1_vendedor').value : '',
            paso1_notasGenerales: document.getElementById('paso1_notasGenerales') ? document.getElementById('paso1_notasGenerales').value : '',
            paso1_notasInternas: document.getElementById('paso1_notasInternas') ? document.getElementById('paso1_notasInternas').value : '',
            actividades: actividades,
            materiales: materiales,
            epicas: epicas,
            apartados: apartados,
        };
    }

    function _applyServiciosDraft(w) {
        if (!w || !w.payload) return;
        const p = w.payload;
        const setv = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val == null ? '' : val;
        };
        setv('inpFolio', p.folio);
        setv('paso1_nombre', p.paso1_nombre);
        setv('paso1_cliente', p.paso1_cliente);
        setv('paso1_fecha', p.paso1_fecha);
        setv('paso1_vendedor', p.paso1_vendedor);
        setv('paso1_notasGenerales', p.paso1_notasGenerales);
        setv('paso1_notasInternas', p.paso1_notasInternas);
        if (Array.isArray(p.actividades)) actividades = p.actividades.slice();
        if (Array.isArray(p.materiales)) materiales = p.materiales.slice();
        if (Array.isArray(p.epicas)) epicas = p.epicas.slice();
        if (Array.isArray(p.apartados)) apartados = p.apartados.slice();
        projectId = p.projectId || null;
        isNewProject = p.isNewProject !== false && !projectId;
        currentStep = p.currentStep || 1;
        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
        _irPaso(currentStep);
    }

    function _renderAutoPriorityChips() {
        const host = document.getElementById('autoPrioritySuppliers');
        if (!host) return;
        const list = getPrioritySuppliersForModule('automatizacion');
        const esc = (s) => {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        };
        let chips = '';
        list.forEach((s) => {
            chips += '<button type="button" class="prio-chip" data-url="' + esc(s.url) + '" title="' + esc(s.ubicacion) + '">' + esc(s.etiqueta) + ' · ' + esc(s.nombre) + '</button>';
        });
        host.innerHTML = '<div class="priority-suppliers-wrap"><div class="priority-suppliers-label">Tiendas de componentes (abrir en nueva pestaña)</div><div class="priority-suppliers-chips">' + chips + '</div></div>';
        host.querySelectorAll('.prio-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const u = btn.getAttribute('data-url');
                if (u) window.open(u, '_blank', 'noopener,noreferrer');
            });
        });
    }

    function _initServiciosAutosave() {
        serviciosAutosaveCtrl = createAutosaveController({
            module: 'proyectos_automatizacion',
            getRecordKey: _serviciosRecordKey,
            collectPayload: _collectServiciosDraftPayload,
            getLabel: () => {
                const n = document.getElementById('paso1_nombre') && document.getElementById('paso1_nombre').value;
                return 'Auto ' + (n || 'borrador');
            },
            debounceMs: 1800,
        });
        const modal = document.getElementById('wsModal');
        if (modal) {
            modal.addEventListener('input', () => { if (serviciosAutosaveCtrl) serviciosAutosaveCtrl.schedule(); }, true);
            modal.addEventListener('change', () => { if (serviciosAutosaveCtrl) serviciosAutosaveCtrl.schedule(); }, true);
        }
    }

    function _tryResumeServiciosDraft() {
        const resume = new URLSearchParams(window.location.search).get('resume');
        if (!resume) return;
        const w = loadLocalDraft('proyectos_automatizacion', resume);
        if (!w || !w.payload) return;
        if (!confirm('¿Recuperar borrador guardado en este equipo?')) {
            history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        serviciosDraftSessionKey = resume.indexOf('tmp:') === 0 ? resume : null;
        currentProject = null;
        projectId = w.payload.projectId || null;
        isNewProject = !projectId;
        _resetForm();
        _applyServiciosDraft(w);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        history.replaceState({}, document.title, window.location.pathname);
    }

    function _setVistaInicial() {
        const kanban = document.getElementById('kanbanContainer');
        const lista = document.getElementById('listaContainer');
        const grafica = document.getElementById('graficaContainer');
        if (kanban) kanban.style.display = vistaActual === 'kanban' ? 'flex' : 'none';
        if (lista) lista.style.display = vistaActual === 'lista' ? 'block' : 'none';
        if (grafica) grafica.style.display = vistaActual === 'grafica' ? 'block' : 'none';
        document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
        if (vistaActual === 'kanban') { const b = document.getElementById('vistaKanban'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'lista') { const b = document.getElementById('vistaLista'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'grafica') { const b = document.getElementById('vistaGrafica'); if (b) b.classList.add('active'); }
    }

    async function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        const themeBtn = document.getElementById('themeBtn');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
        const paso1Fecha = document.getElementById('paso1_fecha');
        if (paso1Fecha) paso1Fecha.value = new Date().toISOString().split('T')[0];
        _setFiltroMesActual();
    }

    function _setFiltroMesActual() {
        const now = new Date();
        filtroFechaInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        filtroFechaFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.valueAsDate = filtroFechaInicio;
        if (filtroFin) filtroFin.valueAsDate = filtroFechaFin;
    }

    function _getEtapaLabel(etapaNum) {
        const labels = { 1: 'Levantamiento', 2: 'Ingeniería', 3: 'Materiales', 4: 'Desarrollo', 5: 'Entrega' };
        return labels[etapaNum] || '—';
    }

    function _getAvanceYProceso(proyecto) {
        const etapa = proyecto.etapa_actual != null ? proyecto.etapa_actual : (proyecto.estado === 'completado' ? 5 : proyecto.estado === 'progreso' ? 3 : 1);
        const avance = proyecto.avance != null ? proyecto.avance : Math.round((etapa / 5) * 100);
        return { avance, etapa, proceso: _getEtapaLabel(etapa) };
    }

    function _getLineaTiempo(proyecto) {
        const inicio = proyecto.fecha_creacion || proyecto.created_at || proyecto.fecha;
        const fin = proyecto.updated_at || proyecto.fecha;
        if (!inicio) return '—';
        const dInicio = new Date(inicio);
        const dFin = fin ? new Date(fin) : null;
        const fmt = d => d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
        return dFin ? `${fmt(dInicio)} → ${fmt(dFin)}` : `Desde ${fmt(dInicio)}`;
    }

    function _startClock() {
        function fmt24() {
            var d = new Date();
            var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
            return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }
        var el = document.getElementById('clock');
        if (el) el.innerText = fmt24();
        setInterval(function () {
            var el = document.getElementById('clock');
            if (el) el.innerText = fmt24();
        }, 1000);
    }

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        try {
            await Promise.all([
                _loadProjects(),
                _loadInventory(),
                _loadCalcCostsFromSupabase()
            ]);
            _populateIngenierosFilter();
            _recalcCostosServicios();
        } catch (e) {
            console.warn('[Automatización] Error cargando datos iniciales:', e);
            projects = [];
            inventory = [];
            _applyFilters();
        }
    }

    async function _loadCalcCostsFromSupabase() {
        const sb = _supabase();
        if (!sb) return;
        try {
            const partial = {};
            const ingest = (rows) => {
                (rows || []).forEach(({ concepto, costo }) => {
                    const k = String(concepto || '').toLowerCase().replace(/\s/g, '');
                    const n = Number(costo);
                    if (!Number.isFinite(n)) return;
                    if (k === 'gasolina' || k.includes('paramgasolina')) partial.gasolina = n;
                    if (k === 'rendimiento') partial.rendimiento = n;
                    if (k === 'costotecnico') partial.costoTecnico = n;
                    if (k.includes('auto:camioneta') || k === 'camionetahora') partial.camionetaHora = n;
                });
            };
            const { data: lab } = await sb.from('calculadoras').select('id').ilike('nombre', '%Laboratorio%').limit(1).maybeSingle();
            if (lab?.id) {
                const { data } = await sb.from('calculadora_costos').select('concepto,costo').eq('calculadora_id', lab.id);
                ingest(data);
            }
            const { data: aut } = await sb.from('calculadoras').select('id').ilike('nombre', '%Automatiz%').limit(1).maybeSingle();
            if (aut?.id) {
                const { data } = await sb.from('calculadora_costos').select('concepto,costo').eq('calculadora_id', aut.id);
                ingest(data);
            }
            CostosEngine.applyConfig(partial);
        } catch (e) {
            console.warn('[Automatización] calculadora_costos:', e);
        }
    }

    function _sumMaterialesCostoInventario() {
        let sum = 0;
        materiales.forEach((m) => {
            const q = parseInt(m.cantidad, 10) || 0;
            if (m.costo_unitario != null && Number(m.costo_unitario) >= 0) {
                sum += Number(m.costo_unitario) * q;
                return;
            }
            const sku = String(m.sku || '').trim();
            if (!sku) return;
            const p = inventory.find((x) => x.sku === sku);
            if (p && p.costo != null) sum += Number(p.costo) * q;
        });
        return sum;
    }

    function _recalcCostosServicios() {
        const el = document.getElementById('serviciosCostosResumen');
        if (!el) return;
        const km = Number(document.getElementById('autoCostoKm')?.value) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || 0;
        const mat = _sumMaterialesCostoInventario();
        const gas = CostosEngine.calcularCostoGasolina(km);
        const cam = CostosEngine.calcularCostoCamioneta(hrsCam);
        const sub = mat + gas + cam;
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
        el.innerHTML =
            `<div><strong>Materiales (costo × cantidad, por SKU en inventario):</strong> ${fmt(mat)}</div>` +
            `<div><strong>Gasolina estimada (${km} km):</strong> ${fmt(gas)}</div>` +
            `<div><strong>Camioneta (${hrsCam} h):</strong> ${fmt(cam)}</div>` +
            `<div style="margin-top:8px;font-weight:800;color:var(--c-automatizacion,#7c3aed);">Subtotal referencia: ${fmt(sub)}</div>`;
    }

    async function _loadProjects() {
        try {
            projects = await proyectosService.select({}, { orderBy: 'fecha', ascending: false });
        } catch (e) {
            console.warn('[Automatización] Error cargando proyectos:', e);
            projects = [];
        }
        _applyFilters();
    }

    async function _loadInventory() {
        try {
            inventory = await inventarioService.select({});
        } catch (e) {
            console.warn('[Automatización] Error cargando inventario:', e);
            inventory = [];
        }
        _populateInventarioSelect();
    }

    function _populateInventarioSelect() {
        const select = document.getElementById('inventarioSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Seleccionar producto</option>';
        inventory.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.sku;
            const costoTxt = p.costo != null && Number(p.costo) > 0 ? ` · $${Number(p.costo).toFixed(2)}` : '';
            opt.textContent = `${p.sku} - ${p.nombre}${costoTxt}`;
            select.appendChild(opt);
        });
    }

    function _populateIngenierosFilter() {
        const select = document.getElementById('filtroIngeniero');
        if (!select) return;
        const ingenieros = new Set();
        projects.forEach(p => { if (p.vendedor) ingenieros.add(p.vendedor); });
        ingenieros.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            select.appendChild(opt);
        });
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        const subProyectos = supabase
            .channel('automatizacion_proyectos_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_automatizacion' }, payload => {
                _loadProjects();
                _addToFeed('📋', 'Datos de proyectos actualizados');
            })
            .subscribe();
        subscriptions.push(subProyectos);
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = projects;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(p => {
                const f = new Date(p.fecha);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroIngeniero !== 'todos') {
            filtered = filtered.filter(p => p.vendedor === filtroIngeniero);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(p => p.estado === filtroEstado);
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(p => 
                (p.nombre && p.nombre.toLowerCase().includes(term)) ||
                (p.cliente && p.cliente.toLowerCase().includes(term)) ||
                (p.folio && p.folio.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _renderKanban(proyectos) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const etapas = [
            { id: 'pendiente', label: 'Pendientes', color: '#ff9800' },
            { id: 'progreso', label: 'En Progreso', color: '#2196f3' },
            { id: 'completado', label: 'Completados', color: '#4caf50' }
        ];
        let html = '';
        etapas.forEach(etapa => {
            const filtrados = proyectos.filter(p => p.estado === etapa.id);
            html += `
                <div class="kanban-column">
                    <div class="kanban-header" style="border-bottom-color: ${etapa.color};">
                        <span>${etapa.label}</span>
                        <span class="badge" style="background: ${etapa.color};">${filtrados.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${filtrados.map(p => _crearCardKanban(p)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirProyecto(card.dataset.id));
        });
    }

    function _crearCardKanban(proyecto) {
        const { avance, proceso } = _getAvanceYProceso(proyecto);
        const linea = _getLineaTiempo(proyecto);
        return `
            <div class="kanban-card" data-id="${proyecto.id}">
                <div class="card-header">
                    <span class="folio">${proyecto.folio || proyecto.id.slice(-6)}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${proyecto.nombre || 'Sin nombre'}</div>
                    <div class="equipo">${proyecto.cliente || 'Cliente'}</div>
                    <div class="card-avance">
                        <div class="avance-bar"><div class="avance-fill" style="width:${avance}%"></div></div>
                        <span class="avance-pct">${avance}%</span> · ${proceso}
                    </div>
                    <div class="card-timeline"><small>${linea}</small></div>
                </div>
                <div class="card-footer">
                    <small>Fecha: ${proyecto.fecha ? new Date(proyecto.fecha).toLocaleDateString() : ''}</small>
                    <small>${proyecto.vendedor || ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(proyectos) {
        const container = document.getElementById('listaContainer');
        if (!container) return;
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Proyecto</th><th>Cliente</th><th>Vendedor</th><th>Avance</th><th>Proceso</th><th>Línea de tiempo</th><th>Estado</th></tr></thead><tbody>';
        proyectos.forEach(p => {
            const { avance, proceso } = _getAvanceYProceso(p);
            const linea = _getLineaTiempo(p);
            html += `<tr onclick="serviciosModule._abrirProyecto('${p.id}')">
                <td>${p.folio || p.id.slice(-6)}</td>
                <td>${p.nombre || ''}</td>
                <td>${p.cliente || ''}</td>
                <td>${p.vendedor || ''}</td>
                <td><span class="avance-pct">${avance}%</span></td>
                <td>${proceso}</td>
                <td><small>${linea}</small></td>
                <td><span class="status-badge" style="background:${p.estado==='pendiente'?'#ff9800':(p.estado==='progreso'?'#2196f3':'#4caf50')}; color:white;">${p.estado}</span></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function _renderGrafica(proyectos) {
        const canvas = document.getElementById('graficaCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (chartInstance) chartInstance.destroy();
        const estados = ['pendiente', 'progreso', 'completado'];
        const labels = ['Pendientes', 'En Progreso', 'Completados'];
        const counts = estados.map(e => proyectos.filter(p => p.estado === e).length);
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: counts, backgroundColor: ['#ff9800', '#2196f3', '#4caf50'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function _updateKPIs(proyectos) {
        const kpiTotal = document.getElementById('kpiTotal');
        const kpiPendiente = document.getElementById('kpiPendiente');
        const kpiProgreso = document.getElementById('kpiProgreso');
        const kpiCompletado = document.getElementById('kpiCompletado');
        if (kpiTotal) kpiTotal.innerText = proyectos.length;
        if (kpiPendiente) kpiPendiente.innerText = proyectos.filter(p => p.estado === 'pendiente').length;
        if (kpiProgreso) kpiProgreso.innerText = proyectos.filter(p => p.estado === 'progreso').length;
        if (kpiCompletado) kpiCompletado.innerText = proyectos.filter(p => p.estado === 'completado').length;
    }

    // ==================== FUNCIONES DEL MODAL ====================
    async function _abrirProyecto(id) {
        const proyecto = projects.find(p => p.id === id);
        if (!proyecto) return;
        currentProject = proyecto;
        projectId = id;
        isNewProject = false;
        if (proyecto.etapa_actual != null && proyecto.etapa_actual >= 1 && proyecto.etapa_actual <= 5) {
            currentStep = proyecto.etapa_actual;
        }
        _cargarDatosEnModal(proyecto);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        _irPaso(currentStep);
    }

    function _abrirNuevoProyecto() {
        isNewProject = true;
        currentProject = null;
        projectId = null;
        fechaInicio = new Date().toISOString();
        actividades = [];
        materiales = [];
        epicas = [];
        apartados = [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];
        _resetForm();
        _generarFolio();
        _irPaso(1);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
    }

    function _cargarDatosEnModal(proyecto) {
        document.getElementById('inpFolio').value = proyecto.folio || '';
        document.getElementById('paso1_nombre').value = proyecto.nombre || '';
        document.getElementById('paso1_cliente').value = proyecto.cliente || '';
        document.getElementById('paso1_fecha').value = proyecto.fecha || '';
        document.getElementById('paso1_vendedor').value = proyecto.vendedor || '';
        document.getElementById('paso1_notasGenerales').value = proyecto.notas_generales || '';
        document.getElementById('paso1_notasInternas').value = proyecto.notas_internas || '';

        actividades = proyecto.actividades || [];
        materiales = proyecto.materiales || [];
        epicas = proyecto.epicas || [];
        apartados = proyecto.apartados || [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];

        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        const stepEl = document.getElementById(`step-${paso}`);
        if (stepEl) stepEl.classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        const stepBtn = document.querySelector(`.ws-step-btn[data-step="${paso}"]`);
        if (stepBtn) stepBtn.classList.add('active');
        _actualizarBotonesPaso();
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveProjectBtn');
        if (!prevBtn && !nextBtn && !saveBtn) return;
        if (currentStep === 1) {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else if (currentStep === 5) {
            if (prevBtn) prevBtn.style.display = 'inline-flex';
            if (nextBtn) nextBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else {
            if (prevBtn) prevBtn.style.display = 'inline-flex';
            if (nextBtn) nextBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        }
    }

    function _prevStep() { if (currentStep > 1) _irPaso(currentStep - 1); }
    function _nextStep() { if (_validarPasoActual() && currentStep < 5) _irPaso(currentStep + 1); }

    function _validarPasoActual() {
        switch(currentStep) {
            case 1:
                if (!document.getElementById('paso1_nombre').value) { alert('Ingrese el nombre del proyecto'); return false; }
                if (!document.getElementById('paso1_cliente').value) { alert('Ingrese el cliente'); return false; }
                break;
        }
        return true;
    }

    // ==================== PASO 2: INGENIERÍA ====================
    function _renderActividades() {
        const tbody = document.getElementById('actividadesBody');
        if (!tbody) return;
        if (actividades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay actividades</td></tr>';
            return;
        }
        tbody.innerHTML = actividades.map((act, idx) => {
            let areaOptions = '<option value="">Seleccionar</option>';
            catalogoServicios.forEach(s => {
                areaOptions += `<option value="${s.area}" ${act.area === s.area ? 'selected' : ''}>${s.area}</option>`;
            });
            let servicioOptions = '<option value="">Seleccionar</option>';
            catalogoServicios.filter(s => s.area === act.area).forEach(s => {
                servicioOptions += `<option value="${s.servicio}" ${act.servicio === s.servicio ? 'selected' : ''}>${s.servicio}</option>`;
            });
            return `
                <tr>
                    <td><select onchange="serviciosModule._actualizarActividad(${idx}, 'area', this.value)">${areaOptions}</select></td>
                    <td><select onchange="serviciosModule._actualizarActividad(${idx}, 'servicio', this.value)">${servicioOptions}</select></td>
                    <td><select onchange="serviciosModule._actualizarActividad(${idx}, 'tipo', this.value)"><option value="O" ${act.tipo==='O'?'selected':''}>Oficina</option><option value="P" ${act.tipo==='P'?'selected':''}>Planta</option></select></td>
                    <td><input type="number" value="${act.horas}" min="0" step="0.5" onchange="serviciosModule._actualizarActividad(${idx}, 'horas', this.value)"></td>
                    <td><button class="btn-remove" onclick="serviciosModule._eliminarActividad(${idx})">✖</button></td>
                </tr>
            `;
        }).join('');
    }

    function _actualizarActividad(idx, campo, valor) {
        if (actividades[idx]) {
            actividades[idx][campo] = campo === 'horas' ? parseFloat(valor) || 0 : valor;
            if (campo === 'area') {
                actividades[idx].servicio = '';
                _renderActividades();
            }
        }
    }

    function _eliminarActividad(idx) {
        actividades.splice(idx, 1);
        _renderActividades();
    }

    function _agregarActividad() {
        actividades.push({ area: '', servicio: '', tipo: 'O', horas: 0 });
        _renderActividades();
    }

    function _generarCronograma() {
        const ganttContainer = document.getElementById('ganttContainer');
        const ganttHeader = document.getElementById('ganttHeader');
        const ganttBody = document.getElementById('ganttBody');

        if (actividades.length === 0) {
            alert('Agregue actividades primero');
            return;
        }

        let totalHoras = actividades.reduce((sum, a) => sum + (parseFloat(a.horas) || 0), 0);
        if (totalHoras === 0) {
            alert('Las actividades deben tener horas asignadas');
            return;
        }

        const diasTotales = Math.ceil(totalHoras / 8);
        const fechaInicio = new Date();

        let headerHtml = '<div style="width:200px;"></div>';
        for (let i = 0; i < diasTotales; i++) {
            const fecha = new Date(fechaInicio);
            fecha.setDate(fecha.getDate() + i);
            headerHtml += `<div style="width:40px; text-align:center; font-size:10px;">D${i+1}</div>`;
        }
        ganttHeader.innerHTML = headerHtml;

        let bodyHtml = '';
        let inicioAcumulado = 0;

        actividades.forEach((act, index) => {
            if (!act.servicio || !act.horas) return;
            const horas = parseFloat(act.horas);
            const dias = horas / 8;
            const ancho = Math.round(dias * 40);
            const inicio = inicioAcumulado * 40;
            bodyHtml += `
                <div class="gantt-row">
                    <div class="gantt-label">${act.servicio}</div>
                    <div class="gantt-bar-container">
                        <div class="gantt-bar ${act.tipo === 'O' ? 'gantt-office' : 'gantt-plant'}" 
                             style="width: ${ancho}px; margin-left: ${inicio}px;">
                            ${horas}h
                        </div>
                    </div>
                </div>
            `;
            inicioAcumulado += dias;
        });

        ganttBody.innerHTML = bodyHtml;
        ganttContainer.style.display = 'block';
    }

    function _exportarCronogramaPDF() {
        alert('Función de exportar PDF pendiente de implementación');
    }

    // ==================== PASO 3: MATERIALES ====================
    function _renderMateriales() {
        const tbody = document.getElementById('materialesBody');
        if (!tbody) return;
        if (materiales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay materiales</td></tr>';
            return;
        }
        tbody.innerHTML = materiales.map((mat, idx) => {
            const cu = mat.costo_unitario != null ? Number(mat.costo_unitario) : 0;
            const q = parseInt(mat.cantidad, 10) || 1;
            const sub = (q * cu).toFixed(2);
            return `
            <tr>
                <td><input type="text" value="${mat.nombre}" onchange="serviciosModule._actualizarMaterial(${idx}, 'nombre', this.value)"></td>
                <td><input type="text" value="${mat.descripcion}" onchange="serviciosModule._actualizarMaterial(${idx}, 'descripcion', this.value)"></td>
                <td><input type="number" value="${mat.cantidad}" min="1" onchange="serviciosModule._actualizarMaterial(${idx}, 'cantidad', this.value)"></td>
                <td><input type="text" value="${mat.sku}" onchange="serviciosModule._actualizarMaterial(${idx}, 'sku', this.value)"></td>
                <td><input type="number" step="0.01" min="0" value="${cu}" onchange="serviciosModule._actualizarMaterial(${idx}, 'costo_unitario', this.value)"></td>
                <td style="text-align:right;font-weight:600;">$${sub}</td>
                <td><button class="btn-remove" onclick="serviciosModule._eliminarMaterial(${idx})">✖</button></td>
            </tr>
        `;
        }).join('');
    }

    function _actualizarMaterial(idx, campo, valor) {
        if (materiales[idx]) {
            if (campo === 'cantidad') {
                materiales[idx].cantidad = parseInt(valor, 10) || 1;
            } else if (campo === 'costo_unitario') {
                materiales[idx].costo_unitario = parseFloat(valor) || 0;
            } else {
                materiales[idx][campo] = valor;
            }
            if (campo === 'sku') {
                const p = inventory.find((x) => x.sku === String(valor || '').trim());
                if (p && p.costo != null && (materiales[idx].costo_unitario == null || materiales[idx].costo_unitario === 0)) {
                    materiales[idx].costo_unitario = Number(p.costo);
                }
            }
            _renderMateriales();
            _recalcCostosServicios();
        }
    }

    function _eliminarMaterial(idx) {
        materiales.splice(idx, 1);
        _renderMateriales();
        _recalcCostosServicios();
    }

    function _agregarDesdeInventario() {
        const select = document.getElementById('inventarioSelect');
        const sku = select.value;
        if (!sku) return;
        const producto = inventory.find(p => p.sku === sku);
        if (producto) {
            const cu = producto.costo != null ? Number(producto.costo) : 0;
            materiales.push({
                nombre: producto.nombre,
                descripcion: producto.descripcion || '',
                cantidad: 1,
                sku: producto.sku,
                costo_unitario: cu,
            });
            _renderMateriales();
            _recalcCostosServicios();
        }
    }

    function _agregarMaterialManual() {
        materiales.push({ nombre: '', descripcion: '', cantidad: 1, sku: '', costo_unitario: 0 });
        _renderMateriales();
        _recalcCostosServicios();
    }

    async function _guardarMateriales() {
        if (projectId) {
            const csrfToken = sessionStorage.getItem('csrfToken');
            await proyectosService.update(projectId, { materiales: materiales }, csrfToken);
            alert('✅ Materiales guardados');
        }
    }

    // ==================== PASO 4: DESARROLLO ====================
    function _renderEpicas() {
        const container = document.getElementById('epicasContainer');
        if (!container) return;
        if (epicas.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-light);">No hay épicas</p>';
            return;
        }
        container.innerHTML = epicas.map((epica, epicaIndex) => `
            <div class="epica-item">
                <div class="epica-header">
                    <span class="epica-titulo">${epica.titulo}</span>
                    <span class="epica-key">${epica.key || 'EP-'+ (epicaIndex+1)}</span>
                </div>
                <div class="tareas-container" id="tareas-${epica.id}">
                    ${_renderTareas(epica.tareas, epica.id, epicaIndex)}
                </div>
                <button class="btn-add" onclick="serviciosModule._agregarTarea(${epicaIndex})">
                    <i class="fas fa-plus"></i> Agregar tarea
                </button>
            </div>
        `).join('');
    }

    function _renderTareas(tareas, epicaId, epicaIndex) {
        if (!tareas || tareas.length === 0) return '<p style="color:var(--text-light);">No hay tareas</p>';
        return tareas.map((tarea, tIndex) => `
            <div class="tarea-item">
                <div class="tarea-header">
                    <span class="tarea-titulo">${tarea.titulo}</span>
                    <span class="tarea-asignado">${tarea.asignado || 'Sin asignar'}</span>
                </div>
                <div class="subtareas-list" id="subtareas-${epicaId}-${tIndex}">
                    ${_renderSubtareas(tarea.subtareas, epicaId, tIndex)}
                </div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" id="nuevaSubtarea-${epicaId}-${tIndex}" placeholder="Nueva subtarea..." style="flex:1; padding:5px;">
                    <button onclick="serviciosModule._agregarSubtarea('${epicaId}', ${tIndex})">➕</button>
                </div>
            </div>
        `).join('');
    }

    function _renderSubtareas(subtareas, epicaId, tareaIndex) {
        if (!subtareas || subtareas.length === 0) return '';
        return subtareas.map((sub, sIndex) => `
            <div class="subtarea-item">
                <div class="subtarea-checkbox ${sub.completado ? 'checked' : ''}" 
                     onclick="serviciosModule._toggleSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})">
                    ${sub.completado ? '✓' : ''}
                </div>
                <span class="${sub.completado ? 'completado' : ''}">${sub.texto}</span>
                <button onclick="serviciosModule._eliminarSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function _crearEpica() {
        const input = document.getElementById('nuevaEpica');
        const titulo = input.value.trim();
        if (!titulo) return;
        epicas.push({
            id: 'ep' + Date.now() + Math.random().toString(36).substr(2, 5),
            titulo: titulo,
            key: `EP-${epicas.length + 1}`,
            tareas: []
        });
        input.value = '';
        _renderEpicas();
    }

    function _agregarTarea(epicaIndex) {
        const titulo = prompt('Título de la tarea:');
        if (!titulo) return;
        epicas[epicaIndex].tareas.push({
            titulo: titulo,
            asignado: '',
            subtareas: []
        });
        _renderEpicas();
    }

    function _agregarSubtarea(epicaId, tareaIndex) {
        const input = document.getElementById(`nuevaSubtarea-${epicaId}-${tareaIndex}`);
        const texto = input.value.trim();
        if (!texto) return;
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex]) {
            epica.tareas[tareaIndex].subtareas.push({
                texto: texto,
                completado: false
            });
            input.value = '';
            _renderEpicas();
        }
    }

    function _toggleSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex] && epica.tareas[tareaIndex].subtareas[subIndex]) {
            epica.tareas[tareaIndex].subtareas[subIndex].completado = 
                !epica.tareas[tareaIndex].subtareas[subIndex].completado;
            _renderEpicas();
        }
    }

    function _eliminarSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex]) {
            epica.tareas[tareaIndex].subtareas.splice(subIndex, 1);
            _renderEpicas();
        }
    }

    // ==================== PASO 5: ENTREGA ====================
    function _renderApartados() {
        const container = document.getElementById('apartadosContainer');
        if (!container) return;
        container.innerHTML = apartados.map(ap => `
            <div class="apartado-card">
                <div class="apartado-header">
                    <input type="text" class="apartado-titulo-input" value="${ap.titulo}" 
                           onchange="serviciosModule._actualizarTituloApartado('${ap.id}', this.value)">
                    <div class="apartado-actions">
                        <button onclick="serviciosModule._subirArchivo('${ap.id}')"><i class="fas fa-upload"></i></button>
                        <button onclick="serviciosModule._eliminarApartado('${ap.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <textarea class="apartado-nota" placeholder="Notas..." 
                          onchange="serviciosModule._actualizarNotaApartado('${ap.id}', this.value)">${ap.nota || ''}</textarea>
                <div id="archivos-${ap.id}">
                    ${_renderArchivos(ap.archivos, ap.id)}
                </div>
            </div>
        `).join('');
    }

    function _renderArchivos(archivos, apartadoId) {
        if (!archivos || archivos.length === 0) return '';
        return archivos.map(arch => `
            <div class="archivo-item">
                <i class="fas fa-file"></i> ${arch.nombre}
                <button onclick="serviciosModule._eliminarArchivo('${apartadoId}', '${arch.nombre}')" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function _crearNuevoApartado() {
        const titulo = prompt('Título del nuevo apartado:');
        if (!titulo) return;
        apartados.push({
            id: 'ap' + Date.now() + Math.random().toString(36).substr(2, 5),
            titulo: titulo,
            nota: '',
            archivos: []
        });
        _renderApartados();
    }

    function _actualizarTituloApartado(id, nuevoTitulo) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.titulo = nuevoTitulo;
    }

    function _actualizarNotaApartado(id, nota) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.nota = nota;
    }

    function _subirArchivo(id) {
        alert('Simulación: Seleccionar archivo para subir');
    }

    function _eliminarArchivo(apartadoId, nombreArchivo) {
        const ap = apartados.find(a => a.id === apartadoId);
        if (ap && ap.archivos) {
            ap.archivos = ap.archivos.filter(a => a.nombre !== nombreArchivo);
            _renderApartados();
        }
    }

    function _eliminarApartado(id) {
        if (confirm('¿Eliminar este apartado?')) {
            apartados = apartados.filter(a => a.id !== id);
            _renderApartados();
        }
    }

    // ==================== GUARDAR PROYECTO ====================
    async function _guardarProyecto() {
        const data = {
            folio: document.getElementById('inpFolio').value,
            nombre: document.getElementById('paso1_nombre').value,
            cliente: document.getElementById('paso1_cliente').value,
            fecha: document.getElementById('paso1_fecha').value,
            vendedor: document.getElementById('paso1_vendedor').value,
            notas_generales: document.getElementById('paso1_notasGenerales').value,
            notas_internas: document.getElementById('paso1_notasInternas').value,
            actividades: actividades,
            materiales: materiales,
            epicas: epicas,
            apartados: apartados,
            estado: currentStep === 5 ? 'completado' : (currentStep >= 2 ? 'progreso' : 'pendiente'),
            etapa_actual: currentStep,
            avance: Math.round((currentStep / 5) * 100),
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewProject) {
                var yy = new Date().getFullYear().toString().slice(-2);
                var mm = (new Date().getMonth() + 1).toString().padStart(2, '0');
                data.folio = data.folio || 'SP-A' + yy + mm + '/1';
                data.fecha_creacion = new Date().toISOString();
                const inserted = await proyectosService.insert(data, csrfToken);
                projectId = inserted.id;
                isNewProject = false;
                alert('✅ Proyecto guardado');
            } else {
                await proyectosService.update(projectId, data, csrfToken);
                alert('✅ Proyecto actualizado');
            }
            _addToFeed('💾', `Proyecto ${data.folio} guardado`);
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _completarEntrega() {
        if (currentStep !== 5) return;
        await _guardarProyecto();
    }

    function _generarFolio() {
        var inp = document.getElementById('inpFolio');
        if (!window.folioFormats || !window.folioFormats.getNextFolioAutomatizacion) {
            var now = new Date();
            var folio = 'SP-A' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + '/1';
            if (inp) inp.value = folio;
            return;
        }
        window.folioFormats.getNextFolioAutomatizacion().then(function (folio) {
            if (inp) inp.value = folio;
        }).catch(function () {
            var now = new Date();
            if (inp) inp.value = 'SP-A' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + '/1';
        });
    }

    function _resetForm() {
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('inpFolio', '');
        setVal('paso1_nombre', '');
        setVal('paso1_cliente', '');
        setVal('paso1_fecha', new Date().toISOString().split('T')[0]);
        setVal('paso1_vendedor', '');
        setVal('paso1_notasGenerales', '');
        setVal('paso1_notasInternas', '');
        actividades = [];
        materiales = [];
        epicas = [];
        apartados = [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];
        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
    }

    function _cerrarModal() {
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.remove('active');
        currentProject = null;
        projectId = null;
        isNewProject = true;
    }

    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-automatizacion);">AUTOMATIZACIÓN</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    function _showSuccessAlert(mensaje) {
        const alertBox = document.createElement('div');
        alertBox.style.cssText = `
            position: fixed;
            top: 90px;
            right: 30px;
            background: #dcfce7;
            border: 1px solid #16a34a;
            color: #14532d;
            padding: 12px 16px;
            border-radius: 12px;
            font-weight: 800;
            z-index: 9999;
        `;
        alertBox.textContent = mensaje;
        document.body.appendChild(alertBox);
        setTimeout(() => alertBox.remove(), 2600);
    }

    async function _ensureProjectSavedForLinkage() {
        if (projectId && !isNewProject) return projectId;

        const data = {
            folio: document.getElementById('inpFolio').value || (await (window.folioFormats && window.folioFormats.getNextFolioAutomatizacion ? window.folioFormats.getNextFolioAutomatizacion() : Promise.resolve('SP-A' + new Date().getFullYear().toString().slice(-2) + (new Date().getMonth() + 1).toString().padStart(2, '0') + '/1'))),
            nombre: document.getElementById('paso1_nombre').value,
            cliente: document.getElementById('paso1_cliente').value,
            fecha: document.getElementById('paso1_fecha').value,
            vendedor: document.getElementById('paso1_vendedor').value,
            notas_generales: document.getElementById('paso1_notasGenerales').value,
            notas_internas: document.getElementById('paso1_notasInternas').value,
            actividades,
            materiales,
            epicas,
            apartados,
            estado: currentStep === 5 ? 'completado' : (currentStep >= 2 ? 'progreso' : 'pendiente'),
            updated_at: new Date().toISOString(),
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        const inserted = await proyectosService.insert(data, csrfToken);
        projectId = inserted.id;
        isNewProject = false;
        document.getElementById('inpFolio').value = inserted.folio || data.folio;
        _addToFeed('💾', `Proyecto ${data.folio} guardado (auto)`);
        return projectId;
    }

    async function _generarRequerimientoCompra() {
        console.log('✅ [Automatización] Click Generar Requerimiento');

        if (!materiales || materiales.length === 0) {
            alert('Agrega materiales antes de generar el requerimiento.');
            return;
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const id = await _ensureProjectSavedForLinkage();
            const folioProyecto = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;
            const nombreProyecto = document.getElementById('paso1_nombre').value;

            const items = materiales
                .filter(m => (m.nombre || m.descripcion || m.sku) && (parseInt(m.cantidad) || 0) > 0)
                .map(m => ({
                    sku: m.sku || '',
                    nombre: m.nombre || '',
                    descripcion: m.descripcion || '',
                    cantidad: parseInt(m.cantidad) || 1
                }));

            const compra = {
                folio: `REQ-AUT-${Date.now().toString().slice(-6)}`,
                proveedor: 'PENDIENTE',
                departamento: 'Automatización',
                vinculacion: { tipo: 'proyecto', id, folio: folioProyecto, cliente, nombre: nombreProyecto },
                items,
                total: 0,
                estado: 1,
                updated_at: new Date().toISOString()
            };

            await comprasService.insert(compra, csrfToken);
            _showSuccessAlert('✅ Requerimiento generado y enviado a Compras');
            _addToFeed('🧾', `Requerimiento generado (${compra.folio})`);
        } catch (error) {
            console.error(error);
            alert('Error al generar requerimiento: ' + error.message);
        }
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        const byId = id => document.getElementById(id);
        if (byId('toggleMenu')) byId('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        if (byId('newProjectBtn')) byId('newProjectBtn').addEventListener('click', _abrirNuevoProyecto);
        if (byId('closeWsBtn')) byId('closeWsBtn').addEventListener('click', _cerrarModal);
        if (byId('cancelWsBtn')) byId('cancelWsBtn').addEventListener('click', _cerrarModal);
        document.querySelectorAll('.ws-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const step = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.step;
                if (step) _irPaso(parseInt(step, 10));
            });
        });
        if (byId('prevStepBtn')) byId('prevStepBtn').addEventListener('click', _prevStep);
        if (byId('nextStepBtn')) byId('nextStepBtn').addEventListener('click', _nextStep);
        if (byId('saveProjectBtn')) byId('saveProjectBtn').addEventListener('click', _guardarProyecto);
        if (byId('completarEntregaBtn')) byId('completarEntregaBtn').addEventListener('click', _completarEntrega);

        if (byId('guardarPaso1')) byId('guardarPaso1').addEventListener('click', _guardarProyecto);
        if (byId('agregarActividad')) byId('agregarActividad').addEventListener('click', _agregarActividad);
        if (byId('generarCronograma')) byId('generarCronograma').addEventListener('click', _generarCronograma);
        if (byId('exportarCronogramaPDF')) byId('exportarCronogramaPDF').addEventListener('click', _exportarCronogramaPDF);
        if (byId('agregarDesdeInventario')) byId('agregarDesdeInventario').addEventListener('click', _agregarDesdeInventario);
        if (byId('agregarMaterialManual')) byId('agregarMaterialManual').addEventListener('click', _agregarMaterialManual);
        if (byId('guardarMateriales')) byId('guardarMateriales').addEventListener('click', _guardarMateriales);
        if (byId('btnRecalcCostosServicios')) byId('btnRecalcCostosServicios').addEventListener('click', _recalcCostosServicios);
        ['autoCostoKm', 'autoCostoHrsCam'].forEach((id) => {
            const el = byId(id);
            if (el) el.addEventListener('input', _recalcCostosServicios);
        });
        const reqBtn = byId('generarRequerimientoCompraBtn');
        if (reqBtn) reqBtn.addEventListener('click', _generarRequerimientoCompra);
        if (byId('crearEpica')) byId('crearEpica').addEventListener('click', _crearEpica);
        if (byId('crearNuevoApartado')) byId('crearNuevoApartado').addEventListener('click', _crearNuevoApartado);

        for (let i = 1; i <= 4; i++) {
            const btn = byId(`terminarEtapa${i}`);
            if (btn) btn.addEventListener('click', () => _irPaso(i + 1));
        }

        const aplicarBtn = byId('aplicarFiltrosBtn');
        if (aplicarBtn) aplicarBtn.addEventListener('click', () => {
            const fi = byId('filtroFechaInicio');
            const ff = byId('filtroFechaFin');
            filtroFechaInicio = fi ? fi.valueAsDate : null;
            filtroFechaFin = ff ? ff.valueAsDate : null;
            const ing = byId('filtroIngeniero');
            const est = byId('filtroEstado');
            const bus = byId('filtroBuscar');
            filtroIngeniero = ing ? ing.value : 'todos';
            filtroEstado = est ? est.value : 'todos';
            filtroBuscar = bus ? bus.value.trim() : '';
            _applyFilters();
        });

        const vistaKanban = byId('vistaKanban');
        if (vistaKanban) vistaKanban.addEventListener('click', () => {
            vistaActual = 'kanban';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'flex'; if (l) l.style.display = 'none'; if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaKanban.classList.add('active');
            _applyFilters();
        });
        const vistaLista = byId('vistaLista');
        if (vistaLista) vistaLista.addEventListener('click', () => {
            vistaActual = 'lista';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'none'; if (l) l.style.display = 'block'; if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaLista.classList.add('active');
            _applyFilters();
        });
        const vistaGrafica = byId('vistaGrafica');
        if (vistaGrafica) vistaGrafica.addEventListener('click', () => {
            vistaActual = 'grafica';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'none'; if (l) l.style.display = 'none'; if (g) g.style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaGrafica.classList.add('active');
            _applyFilters();
        });
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar');
        const b = document.body;
        if (!s) return;
        if (window.innerWidth <= 768) s.classList.toggle('active');
        else b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirProyecto,
        _actualizarActividad,
        _eliminarActividad,
        _actualizarMaterial,
        _eliminarMaterial,
        _agregarTarea,
        _agregarSubtarea,
        _toggleSubtarea,
        _eliminarSubtarea,
        _actualizarTituloApartado,
        _actualizarNotaApartado,
        _subirArchivo,
        _eliminarArchivo,
        _eliminarApartado
    };
})();

window.serviciosModule = ServiciosModule;