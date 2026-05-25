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
import { pdfGenerator } from '../core/pdf-generator.js';
import { getPrioritySuppliersForModule } from '../core/ssepi-runtime/priority-suppliers-catalog.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';
import { purgeDraftRecordKeys } from '../core/ssepi-runtime/draft-purge-keys.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';

const ServiciosModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let projects = [];
    let inventory = [];
    let currentProject = null;
    let projectId = null;
    let isNewProject = true;
    let currentStep = 1;
    let fechaInicio = null;
    let fechasEtapas = {};

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
const notificacionesService = createDataService('notificaciones');
    const inventarioService = createDataService('inventario');
    const comprasService = createDataService('compras');

    // ===== Mapeo de estados del flujo comercial =====
    function _estadoToPaso(estado) {
        const mapa = {
            'Nuevo': 1, 'Registrado': 1, 'pendiente': 1,
            'Diagnóstico': 2, 'Garantía': 2, 'progreso': 2,
            'Esperando Cotización': 3,
            'Esperando Confirmación Cliente': 3,
            'Confirmado': 4, 'En ejecución': 4, 'Reparado / Listo': 4,
            'completado': 5, 'Completado': 5, 'Entregado': 5, 'Facturado': 5,
            'Cancelado': 0
        };
        return mapa[estado] || 1;
    }

    function _pasoToEstado(paso) {
        const mapa = { 1: 'Registrado', 2: 'Diagnóstico', 3: 'Esperando Cotización', 4: 'En ejecución', 5: 'Completado' };
        return mapa[paso] || 'Registrado';
    }

    function _estadoPrioridad(estado) {
        const mapa = {
            'Nuevo': 1, 'Registrado': 1, 'pendiente': 1,
            'Diagnóstico': 2, 'Garantía': 2, 'progreso': 2,
            'Esperando Cotización': 3, 'Esperando Confirmación Cliente': 3,
            'Confirmado': 4, 'En ejecución': 4, 'Reparado / Listo': 4,
            'Completado': 5, 'completado': 5, 'Entregado': 5, 'Facturado': 5,
            'Cancelado': 0
        };
        return mapa[estado] || 1;
    }

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];
    let serviciosAutosaveCtrl = null;
    let serviciosDraftSessionKey = null;
    let perfilUsuario = null;

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Automatización] Conectado');
        try { perfilUsuario = await authService.getCurrentProfile(); } catch(e) {}
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
            await _loadInitialData();
            try {
                var openId = new URLSearchParams(window.location.search).get('open');
                if (openId) { setTimeout(function () { _abrirProyecto(openId); }, 400); }
            } catch (e) {}
            _startClock();
            _setupRealtime();
        } catch (e) {
            console.error('[Automatización] init error:', e);
        }
        _renderAutoPriorityChips();
        _initServiciosAutosave();
        _tryResumeServiciosDraft();
        _initExportButton();
        console.log('✅ Módulo automatización iniciado');
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'folio', label: 'Folio' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'nombre', label: 'Proyecto' },
                    { key: 'vendedor', label: 'Ingeniero' },
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'etapa_actual', label: 'Etapa' },
                    { key: 'avance', label: 'Avance %' },
                    { key: 'costo_total', label: 'Costo Total' },
                    { key: 'rentabilidad_estado', label: 'Rentabilidad' }
                ];
                downloadCSV('proyectos_automatizacion_' + new Date().toISOString().slice(0,10) + '.csv', projects, headers);
            });
        } catch (e) { console.warn('[Automatización] Export CSV init:', e); }
    }

    function _serviciosRecordKey() {
        if (projectId) return String(projectId);
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) return 'new:' + folio;
        if (!serviciosDraftSessionKey) serviciosDraftSessionKey = 'tmp:' + Date.now();
        return serviciosDraftSessionKey;
    }

    function _serviciosDraftKeysToPurge() {
        const keys = [];
        if (projectId) keys.push(String(projectId));
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) keys.push('new:' + folio);
        if (serviciosDraftSessionKey) keys.push(serviciosDraftSessionKey);
        return keys;
    }

    function _afterServiciosPersistOk() {
        purgeDraftRecordKeys('proyectos_automatizacion', _serviciosDraftKeysToPurge());
        serviciosDraftSessionKey = null;
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
        // Por defecto sin filtro de fecha (mostrar todos los proyectos)
        filtroFechaInicio = null;
        filtroFechaFin = null;
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.value = '';
        if (filtroFin) filtroFin.value = '';
    }

    function _getEtapaLabel(etapaNum) {
        const labels = { 1: 'Levantamiento', 2: 'Ingeniería', 3: 'Materiales', 4: 'Desarrollo', 5: 'Entrega' };
        return labels[etapaNum] || '—';
    }

    function _getAvanceYProceso(proyecto) {
        const etapa = _estadoToPaso(proyecto.estado) || proyecto.etapa_actual || 1;
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

    function _calcularCostoActualServicios() {
        const km = Number(document.getElementById('autoCostoKm')?.value) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || 0;
        const mat = _sumMaterialesCostoInventario();
        const gas = CostosEngine.calcularCostoGasolina(km);
        const cam = CostosEngine.calcularCostoCamioneta(hrsCam);
        const act = (actividades || []).reduce((s, a) => s + (Number(a.horas) || 0) * (Number(a.tarifa) || 0), 0);
        return mat + gas + cam + act;
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
        _renderPanelRentabilidad();
    }

    function _renderPanelRentabilidad() {
        const panel = document.getElementById('panelRentabilidad');
        if (!panel) return;
        const costoPresupuestado = currentProject?.costo_presupuestado || currentProject?.costo_total || 0;
        const costoReal = _calcularCostoActualServicios();
        const estado = CostosEngine.determinarRentabilidad(costoPresupuestado, costoReal);
        const adeudo = Math.max(0, costoReal - costoPresupuestado);

        panel.style.display = 'block';
        panel.className = 'form-section panel-rentabilidad-' + estado;
        const badge = document.getElementById('rentabilidadBadge');
        const presEl = document.getElementById('rentabilidadPresupuestado');
        const realEl = document.getElementById('rentabilidadReal');
        const adeudoRow = document.getElementById('rentabilidadAdeudoRow');
        const adeudoEl = document.getElementById('rentabilidadAdeudo');

        if (badge) {
            badge.className = estado === 'verde' ? 'badge-rentabilidad-verde' : 'badge-rentabilidad-rojo';
            badge.textContent = estado === 'verde' ? 'Proyecto rentable' : 'Números rojos';
        }
        if (presEl) presEl.textContent = '$' + (costoPresupuestado || 0).toFixed(2);
        if (realEl) realEl.textContent = '$' + (costoReal || 0).toFixed(2);
        if (adeudoRow) adeudoRow.style.display = adeudo > 0 ? 'flex' : 'none';
        if (adeudoEl) adeudoEl.textContent = '$' + (adeudo || 0).toFixed(2);
    }

    async function _loadProjects() {
        try {
            projects = await proyectosService.select({}, { orderBy: 'fecha', ascending: false });
        } catch (e) {
            console.warn('[Automatización] Error cargando proyectos:', e);
            projects = [];
        }
        // Enriquecer proyectos legacy/demo sin rentabilidad calculada
        projects.forEach(p => {
            if (!p.rentabilidad_estado && p.costo_total) {
                const pres = Number(p.costo_presupuestado) || Number(p.costo_total) || 0;
                const real = CostosEngine.calcularCostoRealAutomatizacion(p);
                p.costo_presupuestado = pres;
                p.costo_real = real;
                p.adeudo_generado = Math.max(0, real - pres);
                p.rentabilidad_estado = CostosEngine.determinarRentabilidad(pres, real);
            }
        });
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

        // Compras vinculadas a proyectos de automatización
        const subCompras = supabase
            .channel('automatizacion_compras')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                const nueva = payload.new;
                if (nueva?.vinculacion?.tipo === 'proyecto') {
                    _addToFeed('📦', `Compra actualizada: ${nueva.folio || ''}`);
                }
            })
            .subscribe();
        subscriptions.push(subCompras);

        // Notificaciones para automatización
        const subNotif = supabase
            .channel('automatizacion_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.automatizacion' }, payload => {
                const notif = payload.new || {};
                _addToFeed('🔔', notif.mensaje || 'Nueva notificación');
                // Si es confirmación de cliente para el proyecto actual, actualizar estado local
                if (notif.tipo === 'cliente_confirmo' && currentProject && currentProject.id === notif.orden_id) {
                    currentProject.estado = 'Confirmado';
                    _showToast('✅ Cliente confirmó la cotización. Puede avanzar a Desarrollo.', 'success');
                }
                // Si es garantía activada, recargar para mostrar nueva orden
                if (notif.tipo === 'garantia_activada') {
                    _showToast('🔔 ' + (notif.mensaje || 'Garantía activada'), 'info');
                }
                _loadProjects();
            })
            .subscribe();
        subscriptions.push(subNotif);

        // Listener de orden_historial para sincronizar cambios de estado desde otros módulos
        const subHistorial = supabase
            .channel('automatizacion_historial')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orden_historial' }, payload => {
                const ev = payload.new;
                if (ev && ev.proyecto_id) {
                    _loadProjects();
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);
    }

    /** Normaliza variantes de BD a los estados del flujo comercial. */
    function _normEstadoProyecto(estado) {
        const s = String(estado == null ? '' : estado).trim().toLowerCase();
        if (!s) return 'pendiente';
        if (['registrado', 'pendiente', 'borrador', 'nuevo', 'planificacion', 'planificación'].includes(s)) return 'pendiente';
        if (['diagnostico', 'diagnóstico', 'levantamiento'].includes(s)) return 'pendiente';
        if (['esperando cotizacion', 'esperando cotización', 'espera cotizacion', 'cotizacion pendiente'].includes(s)) return 'esperando_cotizacion';
        if (['esperando confirmacion cliente', 'esperando confirmación cliente', 'confirmacion pendiente'].includes(s)) return 'esperando_confirmacion';
        if (['confirmado', 'progreso', 'en progreso', 'activo', 'ejecucion', 'ejecución', 'en ejecucion', 'en ejecución', 'en ejecucion', 'desarrollo'].includes(s)) return 'progreso';
        if (['reparado', 'reparado / listo', 'listo', 'puesta en marcha'].includes(s)) return 'progreso';
        if (['completado', 'cerrado', 'entregado', 'facturado', 'finalizado'].includes(s)) return 'completado';
        if (['cancelado', 'cancelada'].includes(s)) return 'cancelado';
        if (['garantia', 'garantía'].includes(s)) return 'garantia';
        return s;
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = projects;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(p => {
                const raw = p.fecha || p.created_at || p.updated_at;
                if (!raw) return true;
                const f = new Date(raw);
                if (Number.isNaN(f.getTime())) return true;
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroIngeniero !== 'todos') {
            filtered = filtered.filter(p => p.vendedor === filtroIngeniero);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(p => _normEstadoProyecto(p.estado) === filtroEstado);
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
            { label: 'Registrado', match: s => s === 'Nuevo' || s === 'Registrado' || s === 'pendiente' },
            { label: 'Diagnóstico', match: s => s === 'Diagnóstico' || s === 'Garantía' },
            { label: 'Esperando Cotización', match: s => s === 'Esperando Cotización' || s === 'En Espera' },
            { label: 'Esperando Confirmación', match: s => s === 'Esperando Confirmación Cliente' },
            { label: 'En ejecución', match: s => s === 'Confirmado' || s === 'En ejecución' },
            { label: 'Completado', match: s => s === 'Completado' || s === 'completado' || s === 'Entregado' || s === 'Facturado' || s === 'Reparado / Listo' },
            { label: 'Cancelado', match: s => s === 'Cancelado' || s === 'Cancelada' },
        ];
        let html = '';
        etapas.forEach(etapa => {
            const filtrados = proyectos.filter(p => etapa.match(p.estado));
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
        const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(proyecto);
        const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';

        let badgeRentabilidad = '';
        if (proyecto.rentabilidad_estado === 'rojo') {
            badgeRentabilidad = `<span class="badge-rentabilidad-rojo badge-rentabilidad-inline" title="Adeudo $${(proyecto.adeudo_generado||0).toFixed(2)}">🔴 $${(proyecto.adeudo_generado||0).toFixed(0)}</span>`;
        } else if (proyecto.rentabilidad_estado === 'verde') {
            badgeRentabilidad = `<span class="badge-rentabilidad-verde badge-rentabilidad-inline">🟢 OK</span>`;
        }

        let extrasHtml = '';
        const materiales = proyecto.materiales || [];
        const notas = proyecto.notas_internas || '';
        if (materiales.length > 0 || notas) {
            const chips = materiales.slice(0, 3).map(m => `<span class="extra-chip">${m.nombre || 'Material'}${m.cantidad > 1 ? ' x'+m.cantidad : ''}</span>`).join('');
            const mas = materiales.length > 3 ? `<span class="extra-chip">+${materiales.length - 3}</span>` : '';
            const preview = notas ? `<div class="nota-preview">${notas.slice(0, 90)}${notas.length > 90 ? '…' : ''}</div>` : '';
            extrasHtml = `<div class="card-extras">
                ${chips ? `<div class="extra-list">${chips}${mas}</div>` : ''}
                ${preview}
            </div>`;
        }

        return `
            <div class="kanban-card ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${proyecto.id}">
                <div class="card-header">
                    <div class="folio-line">
                        <span class="folio">${proyecto.folio || proyecto.id.slice(-6)}</span>
                        ${badgeRentabilidad}
                    </div>
                    <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                        ${badgeCuarentena}
                    </div>
                </div>
                <div class="card-body">
                    <div class="cliente">${proyecto.nombre || 'Sin nombre'}</div>
                    <div class="equipo">${proyecto.cliente || 'Cliente'}</div>
                    ${extrasHtml}
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
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Proyecto</th><th>Cliente</th><th>Vendedor</th><th>Avance</th><th>Etapa</th><th>Línea de tiempo</th><th>Estado</th><th>Balance</th></tr></thead><tbody>';
        proyectos.forEach(p => {
            const { avance, proceso } = _getAvanceYProceso(p);
            const linea = _getLineaTiempo(p);
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(p);
            html += `<tr onclick="serviciosModule._abrirProyecto('${p.id}')" class="${enCuarentena ? 'row-cuarentena' : ''}">
                <td>${p.folio || p.id.slice(-6)} ${enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : ''}</td>
                <td>${p.nombre || ''}</td>
                <td>${p.cliente || ''}</td>
                <td>${p.vendedor || ''}</td>
                <td><span class="avance-pct">${avance}%</span></td>
                <td>${proceso}</td>
                <td><small>${linea}</small></td>
                <td><span class="status-badge" style="background:${(function(){ const s=_normEstadoProyecto(p.estado); if(s==='pendiente') return '#ff9800'; if(s==='esperando_cotizacion'||s==='esperando_confirmacion') return '#9c27b0'; if(s==='progreso'||s==='garantia') return '#2196f3'; if(s==='cancelado') return '#f44336'; return '#4caf50'; })()}; color:white;">${p.estado}</span> · ${proceso}</td>
                <td>${p.rentabilidad_estado === 'rojo' ? `<span class="badge-rentabilidad-rojo" style="font-size:11px;padding:2px 6px;">🔴 $${(p.adeudo_generado||0).toFixed(0)}</span>` : (p.rentabilidad_estado === 'verde' ? `<span class="badge-rentabilidad-verde" style="font-size:11px;padding:2px 6px;">🟢 OK</span>` : '—')}</td>
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
        const norm = e => _normEstadoProyecto(e);
        const labels = ['Pendientes', 'En Progreso', 'Completados'];
        const counts = [
            proyectos.filter(p => ['pendiente','esperando_cotizacion','esperando_confirmacion'].includes(norm(p.estado))).length,
            proyectos.filter(p => ['progreso','garantia'].includes(norm(p.estado))).length,
            proyectos.filter(p => norm(p.estado) === 'completado').length
        ];
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
        const norm = e => _normEstadoProyecto(e);
        if (kpiTotal) kpiTotal.innerText = proyectos.length;
        if (kpiPendiente) kpiPendiente.innerText = proyectos.filter(p => ['pendiente','esperando_cotizacion','esperando_confirmacion'].includes(norm(p.estado))).length;
        if (kpiProgreso) kpiProgreso.innerText = proyectos.filter(p => ['progreso','garantia'].includes(norm(p.estado))).length;
        if (kpiCompletado) kpiCompletado.innerText = proyectos.filter(p => norm(p.estado) === 'completado').length;
    }

    // ==================== FUNCIONES DEL MODAL ====================
    async function _abrirProyecto(id) {
        const proyecto = projects.find(p => p.id === id);
        if (!proyecto) return;
        currentProject = proyecto;
        projectId = id;
        isNewProject = false;
        currentStep = _estadoToPaso(proyecto.estado);
        if (proyecto.etapa_actual != null && proyecto.etapa_actual >= 1 && proyecto.etapa_actual <= 5) {
            // Mantener compatibilidad: si el estado no mapea bien, usar etapa_actual
            if (_estadoToPaso(proyecto.estado) === 1 && proyecto.etapa_actual > 1) {
                currentStep = proyecto.etapa_actual;
            }
        }
        _cargarDatosEnModal(proyecto);
        _initWsChatterUI(proyecto);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        _irPaso(currentStep);
        // Cargar widget de actividades vinculadas
        if (window.actividadesModule && window.actividadesModule.renderWidgetActividades) {
            window.actividadesModule.renderWidgetActividades('widgetActividadesProyecto', id, 'proyectos_automatizacion');
        }
    }

    async function _abrirNuevoProyecto() {
        isNewProject = true;

        // Buscar cotizaciones pendientes de Ventas para Automatización
        const cotizacionesPendientes = await _buscarCotizacionesPendientes();
        if (cotizacionesPendientes.length > 0) {
            const seleccion = await _mostrarSelectorCotizaciones(cotizacionesPendientes, 'Automatización');
            if (seleccion) {
                await _cargarProyectoDesdeCotizacion(seleccion);
                return;
            }
        }

        // Crear proyecto en blanco si no hay cotizaciones o usuario cancela
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

    async function _buscarCotizacionesPendientes() {
        const supabaseClient = _supabase();
        if (!supabaseClient) return [];

        const { data, error } = await supabaseClient
            .from('cotizaciones')
            .select('*')
            .eq('estado', 'aprobada')
            .in('departamento', ['Automatización', 'Servicios de Automatización'])
            .is('orden_origen_id', null)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) {
            console.error('[Automatización] Error buscando cotizaciones:', error);
            return [];
        }
        return data || [];
    }

    function _mostrarSelectorCotizaciones(cotizaciones, departamento) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Cotizaciones Pendientes de ${departamento}</h3>
                            <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted">Selecciona una cotización para cargar los datos automáticamente o crea un proyecto en blanco.</p>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Folio</th>
                                            <th>Cliente</th>
                                            <th>Fecha</th>
                                            <th>Total</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cotizaciones.map(c => `
                                            <tr>
                                                <td>${c.folio || '—'}</td>
                                                <td>${c.cliente_nombre || c.contacto || '—'}</td>
                                                <td>${c.fecha ? new Date(c.fecha).toLocaleDateString() : '—'}</td>
                                                <td>$${(c.total || 0).toFixed(2)}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-primary" data-folio="${c.folio}">
                                                        Cargar
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Crear en blanco</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Bind click events
            modal.querySelectorAll('button[data-folio]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const folio = btn.dataset.folio;
                    const cotizacion = cotizaciones.find(c => c.folio === folio);
                    modal.remove();
                    resolve(cotizacion);
                });
            });

            // Handle backdrop click
            modal.querySelector('.modal-backdrop').addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
        });
    }

    async function _cargarProyectoDesdeCotizacion(cotizacion) {
        console.log('[Automatización] Cargando cotización:', cotizacion.folio);

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

        // Llenar campos con datos de la cotización
        document.getElementById('inpFolio').value = ''; // Se generará uno nuevo
        document.getElementById('paso1_nombre').value = cotizacion.concepto || cotizacion.notas || '';
        document.getElementById('paso1_cliente').value = cotizacion.cliente_nombre || '';
        document.getElementById('paso1_fecha').value = new Date().toISOString().slice(0, 10);
        document.getElementById('paso1_notasGenerales').value = cotizacion.notas || '';
        document.getElementById('paso1_notasInternas').value = cotizacion.notas_internas || '';

        _generarFolio();
        _irPaso(1);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');

        console.log('[Automatización] Proyecto cargado desde cotización', cotizacion.folio);
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
        fechaInicio = proyecto.fecha_inicio || new Date().toISOString();
        fechasEtapas = proyecto.fechas_etapas || {};
        _renderRegistroTiempos();

        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
        _renderPanelRentabilidad();
        _initWsChatterUI(currentProject || proyecto);
    }

    function _getEtapaLabels() {
        return ['Levantamiento','Ingeniería','Materiales','Desarrollo','Entrega'];
    }

    function _renderRegistroTiemposBase() {
        const panel = document.getElementById('registroTiemposPanel');
        if (!panel) return;
        const labels = _getEtapaLabels();
        let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
        for (let i = 1; i <= labels.length; i++) {
            const ini = fechasEtapas[`etapa${i}_inicio`];
            const fin = fechasEtapas[`etapa${i}_fin`];
            let badge = '';
            if (ini && fin) {
                const d = new Date(fin) - new Date(ini);
                const mins = Math.round(d / 60000);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
                badge = `<span style="color:#059669;font-weight:600;">${dur}</span>`;
            } else if (ini) {
                badge = `<span style="color:#d97706;font-weight:600;">En curso</span>`;
            } else {
                badge = `<span style="color:#94a3b8;">—</span>`;
            }
            const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            html += `<div style="min-width:160px;"><strong style="color:#334155;">Etapa ${i}:</strong> ${labels[i-1]}<br><span style="color:#64748b;">${iniStr} → ${finStr}</span> · ${badge}</div>`;
        }
        html += '</div>';
        panel.innerHTML = html;
    }

    async function _renderRegistroTiemposRelacionados() {
        const panel = document.getElementById('registroTiemposRelacionados');
        if (!panel || !currentProject) return;
        const supabase = _supabase();
        if (!supabase) return;
        let html = '';
        try {
            const { data: cots } = await supabase.from('cotizaciones').select('folio,fechas_etapas,estado,created_at').eq('orden_origen_id', currentProject.id).limit(5).order('created_at',{ascending:false});
            if (cots && cots.length) {
                html += '<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;"><strong style="color:#334155;font-size:13px;"><i class="fas fa-file-invoice-dollar"></i> Ventas (cotizaciones vinculadas)</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">';
                cots.forEach(c => {
                    const fe = c.fechas_etapas || {};
                    const ventasLabels = ['Registro','Espera','Cotización','Seguimiento'];
                    let lineas = [];
                    for (let i=1;i<=4;i++) {
                        const ini = fe[`etapa${i}_inicio`];
                        const fin = fe[`etapa${i}_fin`];
                        if (ini || fin) {
                            const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                            const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                            lineas.push(`<span style="color:#64748b;">P${i} ${ventasLabels[i-1]}: ${iniStr}→${finStr}</span>`);
                        }
                    }
                    if (lineas.length) html += `<div style="min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;"><strong>${c.folio||'COT'}</strong> · ${lineas.join(' | ')}</div>`;
                });
                html += '</div></div>';
            }
        } catch(e) { console.warn('[Auto] tiempos ventas:', e); }
        try {
            const cliente = currentProject.cliente || '';
            if (cliente) {
                const { data: talleres } = await supabase.from('ordenes_taller').select('folio,cliente_nombre,fechas_etapas,estado,created_at').ilike('cliente_nombre','%'+cliente+'%').limit(3).order('created_at',{ascending:false});
                if (talleres && talleres.length) {
                    html += '<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;"><strong style="color:#334155;font-size:13px;"><i class="fas fa-microchip"></i> Laboratorio (mismo cliente)</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">';
                    talleres.forEach(t => {
                        const fe = t.fechas_etapas || {};
                        const labLabels = ['Recepción','Confirmado / Diagnóstico','En espera / En reparación','Reparado','Entregado / Facturado'];
                        let lineas = [];
                        for (let i=1;i<=5;i++) {
                            const ini = fe[`etapa${i}_inicio`];
                            const fin = fe[`etapa${i}_fin`];
                            if (ini || fin) {
                                const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                                const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                                lineas.push(`<span style="color:#64748b;">E${i} ${labLabels[i-1]}: ${iniStr}→${finStr}</span>`);
                            }
                        }
                        if (lineas.length) html += `<div style="min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;"><strong>${t.folio||'SP-E'}</strong> · ${lineas.join(' | ')}</div>`;
                    });
                    html += '</div></div>';
                }
            }
        } catch(e) { console.warn('[Auto] tiempos lab:', e); }
        panel.innerHTML = html || '';
    }

    function _renderRegistroTiempos() {
        _renderRegistroTiemposBase();
        _renderRegistroTiemposRelacionados().catch(()=>{});
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        // Bloqueo comercial: no avanzar a Desarrollo (paso 4) si aún esperamos confirmación del cliente
        if (paso === 4 && currentProject) {
            const est = String(currentProject.estado || '').trim();
            if (est === 'Esperando Cotización' || est === 'Esperando Confirmación Cliente' || est === 'esperando_cotizacion' || est === 'esperando_confirmacion_cliente') {
                _showToast('⏳ Esperando confirmación del cliente. Ventas presentará cotización y notificará cuando el cliente confirme.', 'warning');
                return;
            }
        }
        currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        const stepEl = document.getElementById(`step-${paso}`);
        if (stepEl) stepEl.classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        const stepBtn = document.querySelector(`.ws-step-btn[data-step="${paso}"]`);
        if (stepBtn) stepBtn.classList.add('active');
        _actualizarBotonesPaso();
        const campoInicio = `etapa${paso}_inicio`;
        if (!fechasEtapas[campoInicio]) {
            fechasEtapas[campoInicio] = new Date().toISOString();
        }
        _renderRegistroTiempos();
        if (paso === 5) _renderPanelRentabilidad();
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveProjectBtn');
        const btnNotificar = document.getElementById('btnNotificarVentasCompletado');
        const btnClienteConfirmado = document.getElementById('btnClienteConfirmadoAuto');
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
        if (btnNotificar) btnNotificar.style.display = currentStep === 5 ? 'inline-flex' : 'none';
        // Mostrar botón de "Cliente confirmó" solo en paso 3 cuando se espera confirmación
        if (btnClienteConfirmado && currentStep === 3 && currentProject) {
            const est = String(currentProject.estado || '').trim();
            const esperando = est === 'Esperando Cotización' || est === 'Esperando Confirmación Cliente' || est === 'esperando_cotizacion' || est === 'esperando_confirmacion_cliente';
            btnClienteConfirmado.style.display = esperando ? 'inline-flex' : 'none';
        } else if (btnClienteConfirmado) {
            btnClienteConfirmado.style.display = 'none';
        }
    }

    function _terminarEtapa(etapa) {
        const campo = `etapa${etapa}_fin`;
        fechasEtapas[campo] = new Date().toISOString();
        const csrfToken = sessionStorage.getItem('csrfToken');
        if (projectId) {
            proyectosService.update(projectId, { fechas_etapas: fechasEtapas }, csrfToken).catch(e => console.warn('[Auto] update fechas_etapas:', e));
        }
        _renderRegistroTiempos();
        alert(`Etapa ${etapa} finalizada`);
        if (etapa < 5) _irPaso(etapa + 1);
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
        _generarCronogramaPDFInterno(false);
    }

    async function _generarCotizacionAuto(preview = false) {
        if (!currentProject) { _showToast('Abre un proyecto primero', 'info'); return; }
        const user = await authService.getCurrentProfile();
        const p = currentProject;
        const items = materiales.map(m => ({
            descripcion: m.nombre + (m.descripcion ? ' — ' + m.descripcion : ''),
            especificaciones: m.sku || '',
            unidad: 'Pza',
            precio: Number(m.costo_unitario) || 0,
            cantidad: parseInt(m.cantidad) || 1,
            entrega: ''
        }));
        actividades.forEach(a => {
            if (a.servicio) {
                items.push({
                    descripcion: a.servicio,
                    especificaciones: a.area || '',
                    unidad: 'Horas',
                    precio: (Number(a.horas) || 1) * (a.tipo === 'P' ? 80 : 87),
                    cantidad: 1,
                    entrega: ''
                });
            }
        });
        const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        const km = Number(document.getElementById('autoCostoKm')?.value) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || 0;
        if (km > 0 || hrsCam > 0) {
            const costoGas = CostosEngine.calcularCostoGasolina(km);
            const costoCam = CostosEngine.calcularCostoCamioneta(hrsCam);
            if (costoGas > 0) items.push({ descripcion: 'Gasolina (traslado)', especificaciones: km + ' km ida y vuelta', unidad: 'Viaje', precio: costoGas, cantidad: 1, entrega: '' });
            if (costoCam > 0) items.push({ descripcion: 'Camioneta (traslado)', especificaciones: hrsCam + ' horas', unidad: 'Horas', precio: costoCam, cantidad: 1, entrega: '' });
        }
        const folio = p.folio || 'SP-A000000';
        const pdfData = {
            folio,
            cliente: p.cliente_nombre || p.cliente || '',
            rfc: p.rfc || '',
            direccion: p.direccion || '',
            fecha: p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vence: p.vence || '',
            vendedor: p.vendedor || p.ingeniero || '',
            departamento: 'Automatización',
            items,
            subtotal,
            iva,
            total
        };
        try {
            await pdfGenerator.generateCotizacion(pdfData, user, preview);
            if (!preview) _showToast('Cotización PDF generada: ' + folio, 'success');
        } catch (error) {
            _showToast('Error al generar PDF: ' + error.message, 'error');
        }
    }

    async function _generarReporteAuto(preview = false) {
        if (!currentProject) { _showToast('Abre un proyecto primero', 'info'); return; }
        const user = await authService.getCurrentProfile();
        const p = currentProject;
        const folio = p.folio || 'SP-A000000';
        const actividadesTexto = actividades.map(a => `${a.area ? '[' + a.area + '] ' : ''}${a.servicio || a.nombre} — ${a.horas || 0} hrs`).join('\n');
        const materialesTexto = materiales.map(m => `${m.nombre}${m.sku ? ' (' + m.sku + ')' : ''} ×${m.cantidad || 1}`).join('\n');
        const epicasTexto = epicas.map(e => `${e.titulo}: ${(e.tareas || []).map(t => t.nombre).join(', ') || 'Sin tareas'}`).join('\n');
        const pdfData = {
            folio,
            cliente: p.cliente_nombre || p.cliente || '',
            rfc: p.rfc || '',
            direccion: p.direccion || '',
            fecha: p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vendedor: p.vendedor || p.ingeniero || '',
            departamento: 'Automatización',
            repDescripcion: p.notas_generales || actividadesTexto || 'Servicio de automatización realizado',
            repHallazgos: p.notas_internas || '',
            repRefacciones: materialesTexto || '',
            repRecomendaciones: epicasTexto || '',
            imagenes: (p.reporte_imagenes || []).map(img => img.dataUrl || img.src).filter(Boolean)
        };
        try {
            await pdfGenerator.generateReport(pdfData, user, preview);
            if (!preview) _showToast('Reporte PDF generado: ' + folio, 'success');
        } catch (error) {
            _showToast('Error al generar reporte PDF: ' + error.message, 'error');
        }
    }

    function _generarCronogramaPDFInterno(preview = false) {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) { _showToast('jsPDF no disponible', 'error'); return; }
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const PW = 210, PH = 297, ML = 15, MR = 15, TW = PW - ML - MR;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(0, 47, 108);
        doc.text('CRONOGRAMA DE ACTIVIDADES', ML, 20);
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(currentProject?.folio || '', ML, 28);
        doc.text(currentProject?.cliente_nombre || currentProject?.cliente || '', ML, 34);
        doc.text(new Date().toLocaleDateString('es-MX'), PW - MR, 28, { align: 'right' });
        const head = [['#', 'Área', 'Actividad', 'Tipo', 'Horas', 'Inicio', 'Fin']];
        const rows = actividades.map((a, i) => [
            i + 1,
            a.area || '',
            a.servicio || a.nombre || '',
            a.tipo === 'P' ? 'Planta' : 'Oficina',
            a.horas || 0,
            a.inicio || '',
            a.fin || ''
        ]);
        doc.autoTable({
            head,
            body: rows,
            startY: 40,
            margin: { left: ML, right: MR },
            styles: { fontSize: 8, font: 'helvetica' },
            headStyles: { fillColor: [0, 47, 108], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });
        if (preview){
            const blobUrl = doc.output('bloburl');
            const a = document.createElement('a');
            a.href = blobUrl; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        else doc.save('Cronograma_' + (currentProject?.folio || 'auto') + '.pdf');
    }

    // ==================== PASO 3: MATERIALES ====================
    function _renderMateriales() {
        const tbody = document.getElementById('materialesBody');
        if (!tbody) return;
        if (materiales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay materiales</td></tr>';
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
                <td><input type="text" placeholder="Distribuidor" value="${mat.proveedor || ''}" onchange="serviciosModule._actualizarMaterial(${idx}, 'proveedor', this.value)"></td>
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
        // REGLA 2: validar cuarentena si es edición de proyecto existente
        if (!isNewProject && currentProject && window.SSEPIStateMachine && window.SSEPIStateMachine.estaEnCuarentena(currentProject)) {
            alert('Proyecto en cuarentena contable. No se puede modificar hasta desbloquearlo.');
            return;
        }

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
            // Flujo comercial: avanzar estado, nunca retroceder
            estado: (function() {
                const pasoEstado = _pasoToEstado(currentStep);
                if (!isNewProject && currentProject && currentProject.estado) {
                    const prioridadActual = _estadoPrioridad(currentProject.estado);
                    const prioridadNueva = _estadoPrioridad(pasoEstado);
                    if (prioridadNueva <= prioridadActual) return currentProject.estado;
                }
                return pasoEstado;
            })(),
            etapa_actual: currentStep,
            avance: Math.round((currentStep / 5) * 100),
            fecha_inicio: currentProject?.fecha_inicio || fechaInicio || new Date().toISOString(),
            fechas_etapas: fechasEtapas,
            updated_at: new Date().toISOString()
        };

        // Calcular rentabilidad y adeudo
        try {
            const costoPresupuestado = currentProject?.costo_presupuestado || currentProject?.costo_total || _calcularCostoActualServicios();
            const costoReal = _calcularCostoActualServicios();
            data.costo_presupuestado = costoPresupuestado;
            data.costo_real = costoReal;
            data.adeudo_generado = Math.max(0, costoReal - costoPresupuestado);
            data.rentabilidad_estado = CostosEngine.determinarRentabilidad(costoPresupuestado, costoReal);
        } catch (re) {
            console.warn('[SSEPI-RENTABILIDAD] Error calculando rentabilidad:', re);
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        const fueNuevo = isNewProject;
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
                // Registrar en historial unificado
                if (window.SSEPIStateMachine) {
                    await window.SSEPIStateMachine.actualizarEstadoOrden(
                        window.supabase, 'proyecto', projectId,
                        'creacion', `Proyecto ${data.folio} creado en Automatización`, csrfToken
                    );
                }
            } else {
                await proyectosService.update(projectId, data, csrfToken);
                alert('✅ Proyecto actualizado');
                // Registrar cambio de estado en historial si aplica
                if (window.SSEPIStateMachine && currentProject && currentProject.estado !== data.estado) {
                    await window.SSEPIStateMachine.actualizarEstadoOrden(
                        window.supabase, 'proyecto', projectId,
                        'cambio_estado', `Proyecto ${data.folio} pasó a ${data.estado}`, csrfToken
                    );
                }
            }
            // Notificar a Ventas si el proyecto está completado
            if (data.estado === 'Completado' && (!currentProject || currentProject.estado !== 'Completado')) {
                try {
                    await notificacionesService.insert({
                        para: 'ventas',
                        tipo: 'trabajo_terminado',
                        orden_id: projectId,
                        folio: data.folio,
                        cliente: data.cliente,
                        mensaje: `Proyecto ${data.folio} completado en Automatización. Listo para facturación y entrega.`,
                        leido: false,
                        fecha: new Date().toISOString()
                    }, csrfToken);
                } catch (notifErr) { console.warn('[Auto] Error notificando a Ventas:', notifErr); }
            }
            _afterServiciosPersistOk();
            _addToFeed('💾', `Proyecto ${data.folio} guardado`);

            // E8: Registrar en orden_historial
            try {
                const historialService = createDataService('orden_historial');
                await historialService.insert({
                    proyecto_id: projectId,
                    evento: fueNuevo ? 'creacion' : 'actualizacion',
                    descripcion: `Proyecto ${data.folio} ${fueNuevo ? 'creado' : 'guardado'} — estado: ${data.estado}`,
                    usuario: perfilUsuario?.nombre || 'Sistema',
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (histErr) { console.warn('[Automatización] Error historial:', histErr); }

            // Crear actividad Kanban automática
            try {
                const actividadesService = createDataService('actividades_diarias');
                const perfilAct = await authService.getCurrentProfile();
                const ahora = new Date();
                const horaStr = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                const apartado = data.estado || 'pendiente';
                await actividadesService.insert({
                    departamento: 'automatizacion',
                    orden_origen_id: projectId,
                    orden_origen_tipo: 'proyectos_automatizacion',
                    resumen: 'Proyecto ' + data.folio + ' - ' + data.cliente,
                    estado: 'pendiente',
                    tecnico: data.vendedor || 'Por asignar',
                    fecha: ahora.toISOString().split('T')[0],
                    notas: `Generado automáticamente desde Automatización. Estado: ${data.estado}. Hora: ${horaStr}. Apartado: ${apartado}.`,
                    user_id: perfilAct ? perfilAct.id : null,
                    creado_por: perfilAct ? perfilAct.id : null
                }, csrfToken);
            } catch (actErr) {
                console.warn('[Automatización] Error creando actividad automática:', actErr);
            }

            _cerrarModal();

            // Generar adeudo si el proyecto salió en números rojos
            if (data.adeudo_generado > 0 && projectId) {
                try {
                    let clienteId = null;
                    if (window.supabase && data.cliente) {
                        const { data: contactos } = await window.supabase.from('contactos').select('id').eq('nombre', data.cliente).limit(1);
                        if (contactos && contactos.length > 0) clienteId = contactos[0].id;
                    }
                    if (clienteId) {
                        const adeudoData = {
                            cliente_id: clienteId,
                            orden_origen_id: projectId,
                            orden_tipo: 'automatizacion',
                            folio_orden: data.folio,
                            monto_adeudo: data.adeudo_generado,
                            motivo: `Excedente de costos en proyecto ${data.folio}`,
                            recuperado: false
                        };
                        await window.supabase.from('clientes_adeudos').insert(adeudoData);
                        await window.supabase.rpc('actualizar_adeudo_cliente', { p_cliente_id: clienteId });
                        const notaAdeudo = `[${new Date().toLocaleString('es-MX')}] Sistema: Adeudo generado $${(data.adeudo_generado || 0).toFixed(2)} por excedente de costos en proyecto ${data.folio}.`;
                        await proyectosService.update(projectId, { notas_internas: (data.notas_internas || '') + '\n' + notaAdeudo }, csrfToken);
                    }
                } catch (e) {
                    console.warn('[Automatización] Error generando adeudo:', e);
                }
            }
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _completarEntrega() {
        if (currentStep !== 5) return;
        fechasEtapas['etapa5_fin'] = new Date().toISOString();
        _renderRegistroTiempos();
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
        fechaInicio = new Date().toISOString();
        fechasEtapas = {};
        const panel = document.getElementById('registroTiemposPanel');
        if (panel) panel.innerHTML = '';
        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
        _renderPanelRentabilidad();
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
            estado: _pasoToEstado(currentStep),
            updated_at: new Date().toISOString(),
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        const inserted = await proyectosService.insert(data, csrfToken);
        projectId = inserted.id;
        isNewProject = false;
        document.getElementById('inpFolio').value = inserted.folio || data.folio;
        if (data.estado === 'Completado') {
            try {
                await notificacionesService.insert({
                    para: 'ventas',
                    tipo: 'trabajo_terminado',
                    orden_id: projectId,
                    folio: data.folio,
                    cliente: data.cliente,
                    mensaje: `Proyecto ${data.folio} completado en Automatización. Listo para facturación y entrega.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (notifErr) { console.warn('[Auto] Error notificando a Ventas:', notifErr); }
        }
        _afterServiciosPersistOk();
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
            const vendedor = document.getElementById('paso1_vendedor').value;

            // Buscar info completa del cliente (RFC, dirección, etc.)
            let clienteInfo = { nombre: cliente, rfc: '', direccion: '', telefono: '' };
            let gasolinaCosto = 0;
            try {
                if (window.supabase) {
                    const { data: cData } = await window.supabase.from('contactos').select('*').eq('nombre', cliente).limit(1).single();
                    if (cData) {
                        clienteInfo = {
                            nombre: cData.nombre || cliente,
                            rfc: cData.rfc || '',
                            direccion: cData.direccion || '',
                            telefono: cData.telefono || '',
                            nombre_comercial: cData.nombre_comercial || ''
                        };
                    }
                    // Buscar km en tabulador para calcular gasolina
                    const { data: tabData } = await window.supabase.from('clientes_tabulador').select('km').ilike('nombre_cliente', '%' + cliente + '%').limit(1).single();
                    const km = tabData ? (tabData.km || 0) : 0;
                    if (km > 0 && window.CostosEngine) {
                        gasolinaCosto = window.CostosEngine.calcularCostoGasolina(km);
                    }
                }
            } catch (cErr) { console.warn('[Automatización] Error buscando info cliente:', cErr); }

            // Agrupar materiales por proveedor
            const grupos = {};
            materiales.forEach(m => {
                const prov = (m.proveedor || 'PENDIENTE').trim();
                if (!grupos[prov]) grupos[prov] = [];
                grupos[prov].push({
                    sku: m.sku || '',
                    nombre: m.nombre || '',
                    descripcion: m.descripcion || '',
                    cantidad: parseInt(m.cantidad) || 1
                });
            });

            const proveedores = Object.keys(grupos);
            const foliosGenerados = [];

            for (let i = 0; i < proveedores.length; i++) {
                const prov = proveedores[i];
                const items = grupos[prov];
                // Si hay varios proveedores, se usa el mismo folio base sin sufijo (permitido por schema local)
                // En cloud, si folio es único, el primero usa folioProyecto, los demás folioProyecto-i
                const folioCompra = (i === 0) ? folioProyecto : folioProyecto + '-' + (i + 1);

                const compra = {
                    folio: folioCompra,
                    proveedor: prov,
                    departamento: 'Automatización',
                    fecha: new Date().toISOString(),
                    vinculacion: { tipo: 'proyecto', id, folio: folioProyecto, cliente, nombre: nombreProyecto, proveedor: prov },
                    items,
                    total: 0,
                    estado: 1,
                    observaciones: 'Generado desde Automatización. Cliente: ' + clienteInfo.nombre + (clienteInfo.rfc ? ' · RFC: ' + clienteInfo.rfc : '') + (gasolinaCosto > 0 ? ' · Gasolina incluida: $' + gasolinaCosto.toFixed(2) : ''),
                    pasos: [{ paso: 1, fecha: new Date().toISOString(), accion: 'Requerimiento generado desde Automatización', usuario: vendedor || 'Sistema' }],
                    data: { cliente_info: clienteInfo, gasolina: gasolinaCosto, origen: 'automatizacion' },
                    updated_at: new Date().toISOString()
                };

                try {
                    const compraRef = await comprasService.insert(compra, csrfToken);
                    foliosGenerados.push(compraRef.folio || folioCompra);
                    // Insertar items en compras_items
                    try {
                        const itemsService = createDataService('compras_items');
                        for (let ii = 0; ii < items.length; ii++) {
                            const it = items[ii];
                            await itemsService.insert({
                                compra_id: compraRef.id,
                                sku: it.sku || '',
                                descripcion: it.descripcion || '',
                                cantidad: it.cantidad || 1,
                                costo_unitario: 0,
                                costo_total: 0,
                                link_proveedor: ''
                            }, csrfToken);
                        }
                    } catch (itemsErr) {
                        console.warn('[Automatización] Error insertando items:', itemsErr);
                    }
                } catch (folioErr) {
                    // Si falla por folio duplicado (único en cloud), intentar con sufijo
                    if (String(folioErr?.message || '').toLowerCase().includes('duplicate') || String(folioErr?.code || '').includes('23505')) {
                        compra.folio = folioProyecto + '-' + (i + 1);
                        const compraRef = await comprasService.insert(compra, csrfToken);
                        foliosGenerados.push(compraRef.folio || compra.folio);
                        try {
                            const itemsService = createDataService('compras_items');
                            for (let ii = 0; ii < items.length; ii++) {
                                const it = items[ii];
                                await itemsService.insert({
                                    compra_id: compraRef.id,
                                    sku: it.sku || '',
                                    descripcion: it.descripcion || '',
                                    cantidad: it.cantidad || 1,
                                    costo_unitario: 0,
                                    costo_total: 0,
                                    link_proveedor: ''
                                }, csrfToken);
                            }
                        } catch (itemsErr2) { console.warn('[Automatización] Error insertando items (retry):', itemsErr2); }
                    } else {
                        throw folioErr;
                    }
                }
            }

            _showSuccessAlert('✅ ' + foliosGenerados.length + ' requerimiento(s) generado(s) y enviado(s) a Compras: ' + foliosGenerados.join(', '));
            _addToFeed('🧾', `Requerimientos generados (${foliosGenerados.join(', ')})`);
        } catch (error) {
            console.error(error);
            alert('Error al generar requerimiento: ' + error.message);
        }
    }

    async function _enviarListaMaterialesACompras() {
        console.log('[Auto] Enviando lista de materiales a Compras');
        if (!materiales || materiales.length === 0) {
            alert('Agrega materiales antes de enviar la lista a Compras.');
            return;
        }
        await _guardarProyecto();
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const id = projectId || await _ensureProjectSavedForLinkage();
            const folioProyecto = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;

            const itemsCompra = materiales.map(m => ({
                sku: m.sku || '', nombre: m.nombre || '', descripcion: m.descripcion || '', cantidad: parseInt(m.cantidad) || 1
            }));

            // Buscar preregistro de compra desde Ventas
            let compraExistente = null;
            try {
                const { data: ex } = await window.supabase.from('compras').select('*').eq('vinculacion->>tipo', 'proyecto').eq('vinculacion->>id', id).limit(1).single();
                compraExistente = ex;
            } catch (e) { /* no existe */ }

            let compraRef;
            let compraFolio;
            if (compraExistente) {
                compraFolio = compraExistente.folio || `PO-${folioProyecto}`;
                await comprasService.update(compraExistente.id, {
                    items: itemsCompra, estado: 1, estado_interno: 'esperando_cotizacion',
                    observaciones: 'Solicitud de cotización desde Automatización. Esperando precios de proveedores.',
                    updated_at: new Date().toISOString()
                }, csrfToken);
                compraRef = { id: compraExistente.id };
                try { await window.supabase.from('compras_items').delete().eq('compra_id', compraExistente.id); } catch (de) {}
            } else {
                compraFolio = `PO-${folioProyecto}`;
                const nuevaCompra = {
                    folio: compraFolio, proveedor: 'Por asignar', departamento: 'Automatización',
                    fecha: new Date().toISOString(),
                    vinculacion: { tipo: 'proyecto', id, folio: folioProyecto, cliente },
                    items: itemsCompra, estado: 1, estado_interno: 'esperando_cotizacion',
                    observaciones: 'Solicitud de cotización desde Automatización. Esperando precios de proveedores.',
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
                };
                compraRef = await comprasService.insert(nuevaCompra, csrfToken);
            }

            // Insertar items
            try {
                const itemsService = createDataService('compras_items');
                for (const it of itemsCompra) {
                    await itemsService.insert({ compra_id: compraRef.id, sku: it.sku || '', descripcion: it.descripcion || '', cantidad: it.cantidad || 1, costo_unitario: 0, costo_total: 0 }, csrfToken);
                }
            } catch (itemsErr) { console.warn('[Auto] Error insertando items:', itemsErr); }

            await proyectosService.update(id, { compra_vinculada: compraRef.id, compra_folio: compraFolio, estado: 'Esperando Cotización' }, csrfToken);

            await notificacionesService.insert({
                para: 'compras', tipo: 'solicitud_cotizacion', orden_id: id, compra_id: compraRef.id,
                folio: compraFolio, cliente,
                mensaje: `Automatización envió lista de materiales para cotización: ${compraFolio}. Cotice con proveedores y envíe precios a Ventas.`,
                leido: false, fecha: new Date().toISOString()
            }, csrfToken);

            await notificacionesService.insert({
                para: 'ventas', tipo: 'diagnostico_completado', orden_id: id, folio: folioProyecto, cliente,
                mensaje: `Automatización completó diagnóstico para ${folioProyecto}. Lista de materiales enviada a Compras para cotización. Esperando precios de proveedores.`,
                leido: false, fecha: new Date().toISOString()
            }, csrfToken);

            _showSuccessAlert('✅ Lista de materiales enviada a Compras para cotización.');
            _addToFeed('📤', `Lista de materiales enviada a Compras: ${folioProyecto}`);
        } catch (error) {
            console.error(error);
            alert('Error al enviar lista a Compras: ' + error.message);
        }
    }

    async function _marcarClienteConfirmado() {
        console.log('[Auto] Marcando cliente confirmado y avanzando a Desarrollo');
        if (!projectId) { alert('Primero guarde el proyecto'); return; }
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await proyectosService.update(projectId, { estado: 'Confirmado', updated_at: new Date().toISOString() }, csrfToken);
            if (currentProject) currentProject.estado = 'Confirmado';
            _showToast('✅ Cliente confirmó. Avanzando a Desarrollo.', 'success');
            _irPaso(4);
        } catch (error) {
            console.error(error);
            alert('Error al marcar confirmación: ' + error.message);
        }
    }

    async function _notificarVentasCompletado() {
        console.log('[Auto] Notificando a Ventas que proyecto está completado');
        if (!projectId) { alert('Primero guarde el proyecto'); return; }
        await _guardarProyecto();
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const folio = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;
            await proyectosService.update(projectId, { estado: 'Completado' }, csrfToken);
            await notificacionesService.insert({
                para: 'ventas', tipo: 'trabajo_terminado', orden_id: projectId, folio, cliente,
                mensaje: `Proyecto ${folio} completado en Automatización. Listo para facturación y entrega.`,
                leido: false, fecha: new Date().toISOString()
            }, csrfToken);
            _showSuccessAlert('✅ Proyecto completado. Ventas ha sido notificado.');
            _addToFeed('✅', `Proyecto completado. Notificado a Ventas: ${folio}`);
        } catch (error) {
            console.error(error);
            alert('Error al notificar a Ventas: ' + error.message);
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

        const btnClienteConfirmado = byId('btnClienteConfirmadoAuto');
        if (btnClienteConfirmado) btnClienteConfirmado.addEventListener('click', _marcarClienteConfirmado);
        if (byId('guardarPaso1')) byId('guardarPaso1').addEventListener('click', _guardarProyecto);
        if (byId('agregarActividad')) byId('agregarActividad').addEventListener('click', _agregarActividad);
        if (byId('generarCronograma')) byId('generarCronograma').addEventListener('click', _generarCronograma);
        if (byId('exportarCronogramaPDF')) byId('exportarCronogramaPDF').addEventListener('click', _exportarCronogramaPDF);
        if (byId('btnCotizacionPDFAuto')) byId('btnCotizacionPDFAuto').addEventListener('click', () => _generarCotizacionAuto(false));
        if (byId('btnVistaPreviaCotAuto')) byId('btnVistaPreviaCotAuto').addEventListener('click', () => _generarCotizacionAuto(true));
        if (byId('btnReportePDFAuto')) byId('btnReportePDFAuto').addEventListener('click', () => _generarReporteAuto(false));
        if (byId('btnVistaPreviaRepAuto')) byId('btnVistaPreviaRepAuto').addEventListener('click', () => _generarReporteAuto(true));
        if (byId('agregarDesdeInventario')) byId('agregarDesdeInventario').addEventListener('click', _agregarDesdeInventario);
        if (byId('agregarMaterialManual')) byId('agregarMaterialManual').addEventListener('click', _agregarMaterialManual);
        if (byId('guardarMateriales')) byId('guardarMateriales').addEventListener('click', _guardarMateriales);
        if (byId('btnRecalcCostosServicios')) byId('btnRecalcCostosServicios').addEventListener('click', _recalcCostosServicios);
        ['autoCostoKm', 'autoCostoHrsCam'].forEach((id) => {
            const el = byId(id);
            if (el) el.addEventListener('input', _recalcCostosServicios);
        });
        const reqBtn = byId('generarRequerimientoCompraBtn');
        if (reqBtn) reqBtn.addEventListener('click', _enviarListaMaterialesACompras);
        if (byId('btnNotificarVentasCompletado')) byId('btnNotificarVentasCompletado').addEventListener('click', _notificarVentasCompletado);
        if (byId('crearEpica')) byId('crearEpica').addEventListener('click', _crearEpica);
        if (byId('crearNuevoApartado')) byId('crearNuevoApartado').addEventListener('click', _crearNuevoApartado);

        for (let i = 1; i <= 4; i++) {
            const btn = byId(`terminarEtapa${i}`);
            if (btn) btn.addEventListener('click', () => _terminarEtapa(i));
        }
        const btnTerminar5 = byId('terminarEtapa5');
        if (btnTerminar5) btnTerminar5.addEventListener('click', () => _terminarEtapa(5));

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

    // ==================== WS-CHATTER ====================
    function _escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function _initWsChatterUI(proyecto) {
        const folio = proyecto?.folio || '';
        const folioEl = document.getElementById('wsChatterFolio');
        if (folioEl) folioEl.textContent = folio ? `Proyecto ${folio}` : '—';
        _bindWsChatterTabs();
        _renderWsNotesFromOrden(proyecto);
        _loadWsActividad(proyecto).catch(() => {});
    }

    function _bindWsChatterTabs() {
        const tabs = document.querySelectorAll('.ws-chatter-tab');
        if (!tabs || !tabs.length) return;
        tabs.forEach(btn => {
            btn.onclick = () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.querySelectorAll('.ws-chatter-pane').forEach(p => p.classList.remove('active'));
                const pane = document.querySelector(`.ws-chatter-pane[data-pane="${tab}"]`);
                if (pane) pane.classList.add('active');
            };
        });
        const addBtn = document.getElementById('wsAddNoteBtn');
        if (addBtn && !addBtn.dataset.bound) {
            addBtn.dataset.bound = '1';
            addBtn.addEventListener('click', _wsAddNote);
        }
    }

    function _splitNotes(text) {
        const raw = String(text || '').trim();
        if (!raw) return [];
        return raw.split(/\n-{3,}\n/).map(s => s.trim()).filter(Boolean);
    }

    function _renderWsNotesFromOrden(proyecto) {
        const list = document.getElementById('wsNotesList');
        if (!list) return;
        const chunks = _splitNotes(proyecto?.notas_internas || '');
        if (!chunks.length) {
            list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Sin notas internas.</div></div>`;
            return;
        }
        list.innerHTML = chunks.map((c) => {
            const m = c.match(/^\[(.+?)\]\s*(.+?):\s*([\s\S]*)$/);
            const when = m ? m[1] : '';
            const who = m ? m[2] : 'Usuario';
            const body = m ? m[3] : c;
            return `
              <div class="ws-note-item">
                <div class="ws-note-meta"><span>${_escapeHtml(who)}</span><span>${_escapeHtml(when)}</span></div>
                <div class="ws-note-body">${_escapeHtml(body)}</div>
              </div>
            `;
        }).join('');
    }

    async function _wsAddNote() {
        if (!projectId || !currentProject) return;
        const ta = document.getElementById('wsNoteText');
        const txt = String(ta?.value || '').trim();
        if (!txt) return;
        const profile = await authService.getCurrentProfile();
        const who = profile?.nombre || profile?.email || 'Usuario';
        const when = new Date().toLocaleString('es-MX');
        const block = `[${when}] ${who}: ${txt}`;
        const next = (String(currentProject.notas_internas || '').trim() ? (String(currentProject.notas_internas).trim() + `\n---\n`) : '') + block;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await proyectosService.update(projectId, { notas_internas: next }, csrfToken);
            currentProject.notas_internas = next;
            if (ta) ta.value = '';
            _renderWsNotesFromOrden(currentProject);
            _addToFeed('📝', `Nota registrada en ${currentProject.folio || 'proyecto'}`);
        } catch (e) {
            console.error(e);
            _showToast('No se pudo registrar la nota', 'error');
        }
    }

    async function _loadWsActividad(proyecto) {
        const list = document.getElementById('wsActivityList');
        if (!list) return;
        list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Cargando actividad…</div></div>`;
        const supabase = _supabase();
        const items = [];
        const fe = proyecto?.fechas_etapas || {};
        const push = (title, iso, body) => {
            if (!iso) return;
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return;
            items.push({ when: d.toLocaleString('es-MX'), title, body: body || '' });
        };
        push('Levantamiento', fe['etapa1_inicio'], 'Levantamiento iniciado');
        push('Ingeniería', fe['etapa2_inicio'], 'Ingeniería en curso');
        push('Materiales', fe['etapa3_inicio'], 'Materiales en curso');
        push('Desarrollo', fe['etapa4_inicio'], 'Desarrollo en curso');
        push('Entrega', fe['etapa5_inicio'], 'Entrega registrada');
        if (supabase && proyecto?.id) {
            try {
                let rows = [];
                const q1 = await supabase
                    .from('audit_logs')
                    .select('timestamp,action,table_name')
                    .eq('table_name', 'proyectos_automatizacion')
                    .eq('record_id', proyecto.id)
                    .order('timestamp', { ascending: false })
                    .limit(30);
                if (!q1.error && q1.data) {
                    rows = q1.data;
                } else if (q1.error && String(q1.error.message || '').includes('table_name')) {
                    const q2 = await supabase
                        .from('audit_logs')
                        .select('timestamp,action,metadata')
                        .eq('record_id', proyecto.id)
                        .order('timestamp', { ascending: false })
                        .limit(40);
                    if (!q2.error && q2.data) {
                        rows = (q2.data || []).filter((l) => {
                            const t = (l.metadata && l.metadata.table) || '';
                            return !t || t === 'proyectos_automatizacion';
                        }).slice(0, 30);
                    }
                }
                if (rows.length) {
                    rows.forEach(l => {
                        const d = l.timestamp ? new Date(l.timestamp) : null;
                        items.push({ when: d ? d.toLocaleString('es-MX') : '—', title: String(l.action || 'EVENTO'), body: 'proyectos_automatizacion' });
                    });
                }
            } catch (e) { /* audit_logs opcional */ }
            try {
                const { data: histRows } = await supabase
                    .from('orden_historial')
                    .select('fecha,evento,descripcion,usuario')
                    .eq('proyecto_id', proyecto.id)
                    .order('fecha', { ascending: false })
                    .limit(30);
                if (histRows && histRows.length) {
                    histRows.forEach(h => {
                        const d = h.fecha ? new Date(h.fecha) : null;
                        items.push({ when: d ? d.toLocaleString('es-MX') : '—', title: String(h.evento || 'EVENTO').toUpperCase(), body: String(h.descripcion || '') + (h.usuario ? ` — ${h.usuario}` : '') });
                    });
                }
            } catch (e) { /* orden_historial opcional */ }
        }
        if (!items.length) {
            list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Sin actividad.</div></div>`;
            return;
        }
        items.sort((a, b) => String(b.when).localeCompare(String(a.when)));
        list.innerHTML = items.map(it => `
          <div class="ws-activity-item">
            <div class="ws-activity-meta"><span>${_escapeHtml(it.title)}</span><span>${_escapeHtml(it.when)}</span></div>
            <div class="ws-activity-body">${_escapeHtml(it.body)}</div>
          </div>
        `).join('');
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
        _eliminarApartado,
        _generarCotizacionAuto,
        _generarReporteAuto
    };
})();

window.serviciosModule = ServiciosModule;