// ================================================
// ARCHIVO: motores.js
// DESCRIPCIÓN: Módulo de Taller de Motores adaptado a Supabase
// BASADO EN: motores-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de órdenes de motores, diagnóstico, reparación, vinculación con compras
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';
import { CostosEngine } from '../core/costos-engine.js';
import { pdfGenerator } from '../core/pdf-generator.js';
import { getPrioritySuppliersForModule } from '../core/ssepi-runtime/priority-suppliers-catalog.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';
import { purgeDraftRecordKeys } from '../core/ssepi-runtime/draft-purge-keys.js';

const MotoresModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let orders = [];
    let clients = [];
    let tabuladorClientes = [];
    let inventory = [];
    let comprasVinculadas = {};  // { ordenId: { estado, folio, items } }
    let notificaciones = [];

    let currentOrder = null;
    let orderId = null;
    let isNewOrder = true;
    let currentStep = 1;
    let fechaInicioOrden = null;
    let fechasEtapas = {};

    let motoresDraftSessionKey = null;
    let motoresAutosaveCtrl = null;

    // Listas específicas
    let diagnosticoEnlaces = [];
    let diagnosticoInventario = [];
    let consumiblesUsados = [];
    let componentesInventario = [];
    let componentesCompra = [];
    let componentesExtras = [];

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroTecnico = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    // Servicios de datos
    const ordenesService = createDataService('ordenes_motores');
    const inventarioService = createDataService('inventario');
    const comprasService = createDataService('compras');
    const notificacionesService = createDataService('notificaciones');
    const contactosService = createDataService('contactos'); // para clientes

    function _supabase() { return window.supabase; }

    // Suscripciones para cleanup
    let subscriptions = [];

    function _motoresRecordKey() {
        if (orderId) return String(orderId);
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) return 'new:' + folio;
        if (!motoresDraftSessionKey) motoresDraftSessionKey = 'tmp:' + Date.now();
        return motoresDraftSessionKey;
    }

    function _motoresDraftKeysToPurge() {
        const keys = [];
        if (orderId) keys.push(String(orderId));
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) keys.push('new:' + folio);
        if (motoresDraftSessionKey) keys.push(motoresDraftSessionKey);
        return keys;
    }

    function _afterMotoresPersistOk() {
        purgeDraftRecordKeys('ordenes_motores', _motoresDraftKeysToPurge());
        motoresDraftSessionKey = null;
    }

    function _collectMotoresDraftPayload() {
        const folioEl = document.getElementById('inpFolio');
        return {
            v: 1,
            currentStep: currentStep,
            isNewOrder: isNewOrder,
            orderId: orderId,
            folio: folioEl ? folioEl.value : '',
            datos: _recolectarDatos(),
            diagnosticoEnlaces: diagnosticoEnlaces,
            diagnosticoInventario: diagnosticoInventario,
            consumiblesUsados: consumiblesUsados,
            componentesInventario: componentesInventario,
            componentesCompra: componentesCompra,
            fechaInicioOrden: fechaInicioOrden,
            fechasEtapas: fechasEtapas,
        };
    }

    function _applyMotoresDraft(w) {
        if (!w || !w.payload) return;
        const p = w.payload;
        const d = p.datos || {};
        const setv = (id, val, isCheck) => {
            const el = document.getElementById(id);
            if (!el || val === undefined) return;
            if (isCheck) el.checked = !!val;
            else el.value = val == null ? '' : val;
        };
        setv('selClient', d.cliente_nombre);
        setv('inpClientRef', d.referencia);
        setv('inpDateTime', d.fecha_ingreso);
        setv('inpMotorSelect', d.motor);
            var esOtroMotor = d.motor && !['Motores eléctricos','Rebobinadores'].includes(d.motor);
            if (esOtroMotor) {
                document.getElementById('inpMotorSelect').value = 'Otro';
                document.getElementById('inpMotorOtroWrap').style.display = 'block';
                document.getElementById('inpMotorOtro').value = d.motor;
            }
        setv('inpBrand', d.marca);
        setv('inpModel', d.modelo);
        setv('inpSerial', d.serie);
        setv('inpHp', d.hp);
        setv('inpRpm', d.rpm);
        setv('inpVoltaje', d.voltaje);
        setv('inpFail', d.falla_reportada);
        setv('inpCond', d.condiciones_fisicas);
        setv('inpReceptionBy', d.encargado_recepcion);
        setv('inpUnderWarranty', d.bajo_garantia, true);
        setv('techSelect', d.tecnico_responsable);
        setv('megger', d.megger);
        setv('ip', d.ip);
        setv('rU', d.rU);
        setv('rV', d.rV);
        setv('rW', d.rW);
        setv('internalNotes', d.notas_internas);
        setv('generalNotes', d.notas_generales);
        setv('horasEstimadas', d.horas_estimadas);
        setv('fechaEntrega', d.fecha_entrega);
        setv('recibeNombre', d.recibe_nombre);
        setv('recibeIdentificacion', d.recibe_identificacion);
        setv('facturaNumero', d.factura_numero);
        setv('entregaObs', d.entrega_obs);
        setv('recibidoPor', d.recibido_por);
        if (p.folio && document.getElementById('inpFolio')) document.getElementById('inpFolio').value = p.folio;
        if (Array.isArray(p.diagnosticoEnlaces)) diagnosticoEnlaces = p.diagnosticoEnlaces.slice();
        if (Array.isArray(p.diagnosticoInventario)) diagnosticoInventario = p.diagnosticoInventario.slice();
        if (Array.isArray(p.consumiblesUsados)) consumiblesUsados = p.consumiblesUsados.slice();
        if (Array.isArray(p.componentesInventario)) componentesInventario = p.componentesInventario.slice();
        if (Array.isArray(p.componentesCompra)) componentesCompra = p.componentesCompra.slice();
        if (p.fechaInicioOrden) fechaInicioOrden = p.fechaInicioOrden;
        if (p.fechasEtapas && typeof p.fechasEtapas === 'object') fechasEtapas = { ...p.fechasEtapas };
        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();
        if (p.currentStep) _irPaso(p.currentStep);
    }

    function _renderPrioritySupplierBarMotores() {
        const host = document.getElementById('motoresPrioritySuppliers');
        if (!host) return;
        const list = getPrioritySuppliersForModule('motores');
        const esc = (s) => {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        };
        let chips = '';
        list.forEach((s) => {
            chips += '<button type="button" class="prio-chip" data-url="' + esc(s.url) + '" data-nombre="' + esc(s.nombre) + '" title="' + esc(s.ubicacion) + '">' + esc(s.etiqueta) + ' · ' + esc(s.nombre) + '</button>';
        });
        host.innerHTML = '<div class="priority-suppliers-wrap"><div class="priority-suppliers-label">Proveedores rápidos (prioridad por tiempo de entrega)</div><div class="priority-suppliers-chips">' + chips + '</div></div>';
        host.querySelectorAll('.prio-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                diagnosticoEnlaces.push({
                    descripcion: (btn.getAttribute('data-nombre') || 'Proveedor') + ' (catálogo)',
                    sku: '',
                    cantidad: 1,
                    link: btn.getAttribute('data-url') || '',
                });
                _renderDiagnosticoEnlaces();
                if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule();
            });
        });
    }

    function _initMotoresAutosave() {
        motoresAutosaveCtrl = createAutosaveController({
            module: 'ordenes_motores',
            getRecordKey: _motoresRecordKey,
            collectPayload: _collectMotoresDraftPayload,
            getLabel: () => {
                const f = document.getElementById('inpFolio') && document.getElementById('inpFolio').value;
                return 'Motores ' + (f || 'borrador');
            },
            debounceMs: 1600,
        });
        const modal = document.getElementById('wsModal');
        if (modal) {
            modal.addEventListener('input', () => { if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule(); }, true);
            modal.addEventListener('change', () => { if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule(); }, true);
        }
    }

    function _tryResumeMotoresDraft() {
        const resume = new URLSearchParams(window.location.search).get('resume');
        if (!resume) return;
        const w = loadLocalDraft('ordenes_motores', resume);
        if (!w || !w.payload) return;
        if (!confirm('¿Recuperar borrador guardado en este equipo?')) {
            history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        orderId = w.payload.orderId || null;
        isNewOrder = !orderId;
        motoresDraftSessionKey = null;
        _resetForm();
        _applyMotoresDraft(w);
        if (document.getElementById('inpFolio') && w.payload.folio) document.getElementById('inpFolio').value = w.payload.folio;
        document.getElementById('wsModal').classList.add('active');
        _renderPrioritySupplierBarMotores();
        history.replaceState({}, document.title, window.location.pathname);
    }

    // ==================== CARGAR TÉCNICOS ====================
    async function _cargarTecnicos() {
        try {
            var tecnicos = await authService.getUsersByRol(['motores', 'admin', 'superadmin']);
            var select = document.getElementById('techSelect');
            if (!select) return;
            var valActual = select.value;
            select.innerHTML = '<option value="">Seleccionar</option>' +
                tecnicos.map(function(t) {
                    return '<option value="' + (t.nombre || t.email) + '">' + (t.nombre || t.email) + '</option>';
                }).join('');
            if (valActual) select.value = valActual;
        } catch (e) {
            console.error('[Motores] Error cargando técnicos:', e);
        }
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Motores] Conectado');
        await _initUI();
        _bindEvents();
        await _loadInitialData();
        _startClock();
        _setupRealtime();
        _cargarNotificaciones();
        _renderPrioritySupplierBarMotores();
        _initMotoresAutosave();
        _tryResumeMotoresDraft();
        _initExportButton();
        _cargarTecnicos();
        console.log('✅ Módulo motores iniciado');
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'folio', label: 'Folio' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'cliente_nombre', label: 'Cliente' },
                    { key: 'equipo', label: 'Equipo' },
                    { key: 'marca', label: 'Marca' },
                    { key: 'modelo', label: 'Modelo' },
                    { key: 'fecha_ingreso', label: 'Fecha Ingreso' },
                    { key: 'fecha_entrega', label: 'Fecha Entrega' },
                    { key: 'tecnico_responsable', label: 'Técnico' },
                    { key: 'costo_total', label: 'Costo Total' },
                    { key: 'rentabilidad_estado', label: 'Rentabilidad' }
                ];
                downloadCSV('ordenes_motores_' + new Date().toISOString().slice(0,10) + '.csv', orders, headers);
            });
        } catch (e) { console.warn('[Motores] Export CSV init:', e); }
    }

    async function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-moon"></i>';
        }
        const now = new Date();
        const dt = now.toISOString().slice(0,16);
        const fechaIngreso = document.getElementById('inpDateTime');
        if (fechaIngreso) fechaIngreso.value = dt;
        const fechaEntrega = document.getElementById('fechaEntrega');
        if (fechaEntrega) fechaEntrega.value = dt;
        _setFiltroMesActual();
    }

    function _setFiltroMesActual() {
        // Sin filtro por defecto (mostrar todas las órdenes)
        filtroFechaInicio = null;
        filtroFechaFin = null;
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.value = '';
        if (filtroFin) filtroFin.value = '';
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
        await Promise.all([
            _loadOrders(),
            _loadClients(),
            _loadInventory(),
            _loadComprasVinculadas(),
            _loadTabuladorClientes()
        ]);
        _populateClientSelect();
        _populateTecnicosFilter();
    }

    async function _loadOrders() {
        orders = await ordenesService.select({}, { orderBy: 'fecha_ingreso', ascending: false });
        // Enriquecer órdenes legacy/demo sin rentabilidad calculada
        orders.forEach(o => {
            if (!o.rentabilidad_estado && o.costo_total) {
                const pres = Number(o.costo_presupuestado) || Number(o.costo_total) || 0;
                const real = CostosEngine.calcularCostoRealMotores(o);
                o.costo_presupuestado = pres;
                o.costo_real = real;
                o.adeudo_generado = Math.max(0, real - pres);
                o.rentabilidad_estado = CostosEngine.determinarRentabilidad(pres, real);
            }
        });
        _applyFilters();
    }

    async function _loadClients() {
        // Obtener contactos de tipo cliente
        const contactos = await contactosService.select({ tipo: 'client' });
        clients = contactos;
    }

    async function _loadTabuladorClientes() {
        try {
            const { data, error } = await window.supabase
                .from('clientes_tabulador')
                .select('nombre_cliente, km, horas_viaje, activo')
                .eq('activo', true)
                .order('nombre_cliente');
            if (error) { console.warn('[Motores] Error cargando clientes_tabulador:', error); return; }
            tabuladorClientes = (data || []).map(c => ({
                nombre: c.nombre_cliente,
                km: Number(c.km) || 0,
                horas: Number(c.horas_viaje) || 0
            }));
            console.log('[Motores] clientes_tabulador cargados:', tabuladorClientes.length);
        } catch (e) {
            console.warn('[Motores] Error cargando tabulador:', e);
            tabuladorClientes = [];
        }
    }

    async function _loadInventory() {
        inventory = await inventarioService.select({ categoria: ['refaccion', 'consumible'] });
    }

    async function _loadComprasVinculadas() {
        const compras = await comprasService.select();
        compras
            .filter(c => c.vinculacion && c.vinculacion.tipo === 'motor')
            .forEach(c => {
                const ordenId = c.vinculacion?.id;
                if (ordenId) {
                    comprasVinculadas[ordenId] = {
                        estado: c.estado,
                        folio: c.folio,
                        items: c.items || []
                    };
                }
            });
    }

    function _populateClientSelect() {
        const sel = document.getElementById('selClient');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Seleccionar --</option>';
        // Combinar contactos + clientes del tabulador (sin duplicados)
        const nombres = new Set();
        clients.forEach(c => {
            const nombre = c.nombre || c.empresa;
            if (nombre && !nombres.has(nombre)) {
                nombres.add(nombre);
                const opt = document.createElement('option');
                opt.value = nombre;
                opt.textContent = nombre;
                sel.appendChild(opt);
            }
        });
        tabuladorClientes.forEach(tc => {
            if (tc.nombre && !nombres.has(tc.nombre)) {
                nombres.add(tc.nombre);
                const opt = document.createElement('option');
                opt.value = tc.nombre;
                opt.textContent = tc.nombre;
                sel.appendChild(opt);
            }
        });
        sel.removeEventListener('change', _onSelClientChange);
        sel.addEventListener('change', _onSelClientChange);
    }

    function _onSelClientChange() {
        const sel = document.getElementById('selClient');
        const nombre = sel ? sel.value : '';
        if (!nombre) return;
        const encontrado = tabuladorClientes.find(tc => tc.nombre && tc.nombre.toLowerCase().trim() === nombre.toLowerCase().trim());
        const kmEl = document.getElementById('motoresKmIda');
        const hrsEl = document.getElementById('motoresHorasViaje');
        if (kmEl) kmEl.value = encontrado ? encontrado.km : 0;
        if (hrsEl) hrsEl.value = encontrado ? encontrado.horas : 0;
    }

    function _populateTecnicosFilter() {
        const select = document.getElementById('filtroTecnico');
        if (!select) return;
        const tecnicos = new Set();
        orders.forEach(o => { if (o.tecnico_responsable) tecnicos.add(o.tecnico_responsable); });
        tecnicos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        // Canal para cambios en órdenes de motores
        const subOrdenes = supabase
            .channel('motores_ordenes_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_motores' }, payload => {
                _loadOrders();
                _addToFeed('📋', 'Datos de motores actualizados');
            })
            .subscribe();
        subscriptions.push(subOrdenes);

        // Canal para compras vinculadas a motor
        const subCompras = supabase
            .channel('motores_compras')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                if (payload.new.vinculacion?.tipo === 'motor') {
                    const ordenId = payload.new.vinculacion.id;
                    comprasVinculadas[ordenId] = {
                        estado: payload.new.estado,
                        folio: payload.new.folio,
                        items: payload.new.items || []
                    };
                    if (payload.new.estado === 5 && payload.eventType === 'UPDATE') {
                        _mostrarNotificacion({
                            tipo: 'material_entregado',
                            mensaje: `✅ Materiales de orden ${payload.new.folio} entregados a taller de motores`,
                            ordenTallerId: ordenId
                        });
                    }
                    _applyFilters();
                }
            })
            .subscribe();
        subscriptions.push(subCompras);

        // Canal para notificaciones de motores
        const subNotificaciones = supabase
            .channel('motores_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.motores' }, payload => {
                _mostrarNotificacion(payload.new);
            })
            .subscribe();
        subscriptions.push(subNotificaciones);
    }

    async function _cargarNotificaciones() {
        const notis = await notificacionesService.select({ para: 'motores', leido: false });
        notificaciones = notis;
        if (notis.length > 0) {
            _mostrarNotificacionesRecientes(notis);
            _actualizarBadgeNotificaciones(notis.length);
        }
    }

    function _mostrarNotificacionesRecientes(notis) {
        notis.slice(0,3).forEach(n => _mostrarNotificacion(n));
    }

    function _mostrarNotificacion(notif) {
        const notifDiv = document.createElement('div');
        notifDiv.style.cssText = `
            position: fixed; top: 80px; right: 20px; background: var(--c-motores); color: white;
            padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999; animation: slideIn 0.3s; cursor: pointer; border-left: 5px solid #4caf50;
        `;
        let icono = notif.tipo === 'material_recibido' ? '📥' : (notif.tipo === 'material_entregado' ? '✅' : '📦');
        notifDiv.innerHTML = `
            <div style="font-weight:800; margin-bottom:5px;">${icono} ${notif.tipo.replace('_',' ').toUpperCase()}</div>
            <div style="font-size:13px;">${notif.mensaje}</div>
            <div style="font-size:10px; margin-top:5px;">${new Date(notif.fecha).toLocaleTimeString()}</div>
        `;
        notifDiv.onclick = async () => {
            notifDiv.remove();
            if (notif.id) {
                const csrfToken = sessionStorage.getItem('csrfToken');
                await notificacionesService.update(notif.id, { leido: true }, csrfToken);
            }
            if (notif.ordenTallerId) {
                _abrirOrden(notif.ordenTallerId);
            }
        };
        document.body.appendChild(notifDiv);
        setTimeout(() => notifDiv.remove(), 10000);
    }

    function _actualizarBadgeNotificaciones(cantidad) {
        const badge = document.getElementById('notificacionesBadge');
        if (badge) {
            badge.innerText = cantidad;
            badge.style.display = cantidad > 0 ? 'flex' : 'none';
        }
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = orders;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(o => {
                const f = new Date(o.fecha_ingreso);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroTecnico !== 'todos') {
            filtered = filtered.filter(o => o.tecnico_responsable === filtroTecnico);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(o => o.estado === filtroEstado);
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(o => 
                (o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(term)) ||
                (o.motor && o.motor.toLowerCase().includes(term)) ||
                (o.folio && o.folio.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _renderKanban(ordenes) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const etapas = ['Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado'];
        let html = '';
        etapas.forEach(etapa => {
            const ordenesFiltradas = ordenes.filter(o => (o.estado || 'Nuevo') === etapa);
            html += `
                <div class="kanban-column">
                    <div class="kanban-header">
                        <span>${etapa}</span>
                        <span class="badge">${ordenesFiltradas.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${ordenesFiltradas.map(o => _crearCardKanban(o)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirOrden(card.dataset.id));
        });
    }

    function _crearCardKanban(orden) {
        const compraInfo = comprasVinculadas[orden.id];
        const tieneCompraPendiente = compraInfo && compraInfo.estado < 5;
        const compraCompletada = compraInfo && compraInfo.estado === 5;

        let badgeCompra = '';
        if (tieneCompraPendiente) {
            badgeCompra = `<span class="badge-warning" title="Compra en proceso: ${compraInfo.folio}">🛒 Compra #${compraInfo.folio}</span>`;
        } else if (compraCompletada) {
            badgeCompra = `<span class="badge-success" title="Material recibido">✅ Material listo</span>`;
        }

        const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(orden);
        const puedeBorrar = window.SSEPIStateMachine?.puedeEliminar(orden) ?? true;
        const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';

        let badgeRentabilidad = '';
        if (orden.rentabilidad_estado === 'rojo') {
            badgeRentabilidad = `<span class="badge-rentabilidad-rojo badge-rentabilidad-inline" title="Adeudo $${(orden.adeudo_generado||0).toFixed(2)}">🔴 $${(orden.adeudo_generado||0).toFixed(0)}</span>`;
        } else if (orden.rentabilidad_estado === 'verde') {
            badgeRentabilidad = `<span class="badge-rentabilidad-verde badge-rentabilidad-inline">🟢 OK</span>`;
        }

        let extrasHtml = '';
        const extras = orden.componentes_extras || [];
        const notas = orden.notas_internas || '';
        if (extras.length > 0 || notas) {
            const chips = extras.slice(0, 3).map(e => `<span class="extra-chip">${e.descripcion || 'Extra'}${e.cantidad > 1 ? ' x'+e.cantidad : ''}</span>`).join('');
            const mas = extras.length > 3 ? `<span class="extra-chip">+${extras.length - 3}</span>` : '';
            const preview = notas ? `<div class="nota-preview">${notas.slice(0, 90)}${notas.length > 90 ? '…' : ''}</div>` : '';
            extrasHtml = `<div class="card-extras">
                ${chips ? `<div class="extra-list">${chips}${mas}</div>` : ''}
                ${preview}
            </div>`;
        }

        return `
            <div class="kanban-card ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${orden.id}">
                <div class="card-header">
                    <div class="folio-line">
                        <span class="folio">${orden.folio || orden.id.slice(-6)}</span>
                        ${badgeRentabilidad}
                    </div>
                    <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                        ${badgeCompra}
                        ${badgeCuarentena}
                        <div class="card-actions">
                            <button class="btn-icon btn-edit" onclick="event.stopPropagation(); motoresModule._abrirOrden('${orden.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${puedeBorrar ? `<button class="btn-icon btn-delete" onclick="event.stopPropagation(); motoresModule._eliminarOrden('${orden.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="cliente">${orden.cliente_nombre || 'Cliente'}</div>
                    <div class="motor">${orden.motor || 'Motor'} ${orden.hp ? `(${orden.hp} HP)` : ''}</div>
                    ${extrasHtml}
                </div>
                <div class="card-footer">
                    <small>Ingreso: ${orden.fecha_ingreso ? new Date(orden.fecha_ingreso).toLocaleDateString() : ''}</small>
                    ${orden.fecha_reparacion ? `<small>Rep: ${new Date(orden.fecha_reparacion).toLocaleDateString()}</small>` : ''}
                    ${orden.recibido_por ? `<small><i class="fas fa-user"></i> ${orden.recibido_por}</small>` : ''}
                </div>
            </div>
        `;
    }

    function _renderLista(ordenes) {
        const container = document.getElementById('listaContainer');
        if (!container) return;
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Motor</th><th>HP</th><th>Técnico</th><th>Estado</th><th>Balance</th><th>Ingreso</th><th>Reparación</th><th>Recibido por</th><th>Acciones</th></tr></thead><tbody>';
        ordenes.forEach(o => {
            const compraInfo = comprasVinculadas[o.id];
            const recibidoPor = o.recibido_por || '—';
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(o);
            const puedeBorrar = window.SSEPIStateMachine?.puedeEliminar(o) ?? true;
            html += `<tr data-id="${o.id}" class="${enCuarentena ? 'row-cuarentena' : ''}" onclick="motoresModule._abrirOrden('${o.id}')">
                <td>${o.folio || o.id.slice(-6)} ${compraInfo ? '🛒' : ''}</td>
                <td>${o.cliente_nombre || ''}</td>
                <td>${o.motor || ''}</td>
                <td>${o.hp || ''}</td>
                <td>${o.tecnico_responsable || ''}</td>
                <td>${o.estado || 'Nuevo'}</td>
                <td>${o.rentabilidad_estado === 'rojo' ? `<span class="badge-rentabilidad-rojo" style="font-size:11px;padding:2px 6px;">🔴 $${(o.adeudo_generado||0).toFixed(0)}</span>` : (o.rentabilidad_estado === 'verde' ? `<span class="badge-rentabilidad-verde" style="font-size:11px;padding:2px 6px;">🟢 OK</span>` : '—')}</td>
                <td>${o.fecha_ingreso ? new Date(o.fecha_ingreso).toLocaleDateString() : ''}</td>
                <td>${o.fecha_reparacion ? new Date(o.fecha_reparacion).toLocaleDateString() : ''}</td>
                <td>${recibidoPor}</td>
                <td class="acciones">
                    <button class="btn-icon btn-edit" onclick="event.stopPropagation(); motoresModule._abrirOrden('${o.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    ${puedeBorrar ? `<button class="btn-icon btn-delete" onclick="event.stopPropagation(); motoresModule._eliminarOrden('${o.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function _renderGrafica(ordenes) {
        const ctx = document.getElementById('graficaCanvas').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        const estados = ['Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado'];
        const counts = estados.map(e => ordenes.filter(o => o.estado === e).length);
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: estados,
                datasets: [{
                    label: 'Órdenes por estado',
                    data: counts,
                    backgroundColor: ['#1976d2', '#ff9800', '#9c27b0', '#4caf50', '#607d8b']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    function _updateKPIs(ordenes) {
        const nuevo = ordenes.filter(o => o.estado === 'Nuevo').length;
        const diagnostico = ordenes.filter(o => o.estado === 'Diagnóstico').length;
        const espera = ordenes.filter(o => o.estado === 'En Espera').length;
        const reparado = ordenes.filter(o => o.estado === 'Reparado').length;
        const entregado = ordenes.filter(o => o.estado === 'Entregado').length;
        const conCompra = Object.keys(comprasVinculadas).filter(id => {
            const orden = ordenes.find(o => o.id === id);
            return orden && comprasVinculadas[id].estado < 5;
        }).length;

        document.getElementById('kpiNuevo').innerText = nuevo;
        document.getElementById('kpiDiagnostico').innerText = diagnostico;
        document.getElementById('kpiEspera').innerText = espera;
        document.getElementById('kpiReparado').innerText = reparado;
        document.getElementById('kpiEntregado').innerText = entregado;
        document.getElementById('kpiConCompra').innerText = conCompra;
    }

    // ==================== FUNCIONES DEL MODAL (5 PASOS) ====================
    async function _abrirOrden(id) {
        const orden = orders.find(o => String(o.id) === String(id));
        if (!orden) return;
        currentOrder = orden;
        orderId = id;
        isNewOrder = false;
        if (comprasVinculadas[id]) {
            orden.compraVinculada = comprasVinculadas[id];
        }
        _cargarDatosEnModal(orden);
        document.getElementById('wsModal').classList.add('active');
        _irPaso(_estadoToPaso(orden.estado || 'Nuevo'));
        _renderPrioritySupplierBarMotores();
        _renderTimelineMotores(orden.id, orden.estado || 'Nuevo');
        if (window.actividadesModule && window.actividadesModule.renderWidgetActividades) {
            window.actividadesModule.renderWidgetActividades('widgetActividadesMotores', id, 'ordenes_motores');
        }
    }

    async function _abrirNuevaOrden() {
        motoresDraftSessionKey = null;

        // Buscar cotizaciones pendientes de Ventas para Motores
        const cotizacionesPendientes = await _buscarCotizacionesPendientes();
        if (cotizacionesPendientes.length > 0) {
            const seleccion = await _mostrarSelectorCotizaciones(cotizacionesPendientes, 'Motores');
            if (seleccion) {
                await _cargarOrdenDesdeCotizacion(seleccion);
                return;
            }
        }

        // Crear orden en blanco si no hay cotizaciones o usuario cancela
        isNewOrder = true;
        currentOrder = null;
        orderId = null;
        diagnosticoEnlaces = [];
        diagnosticoInventario = [];
        consumiblesUsados = [];
        componentesInventario = [];
        componentesCompra = [];
        fechaInicioOrden = new Date().toISOString();
        fechasEtapas = {};
        _resetForm();
        _generarFolio();
        _populateClientSelect();
        _irPaso(1);
        document.getElementById('wsModal').classList.add('active');
        document.getElementById('fechaInicioDisplay').innerText = new Date().toLocaleString();
        _renderPrioritySupplierBarMotores();
        _renderTimelineMotores(null, 'Nuevo');
    }

    async function _eliminarOrden(id) {
        const orden = orders.find(o => String(o.id) === String(id));
        if (!orden) { _showErrorModal('Orden no encontrada', 'No se encontró la orden especificada.'); return; }
        // REGLA 1 + REGLA 2: validar cuarentena y etapa antes de eliminar
        if (window.SSEPIStateMachine) {
            if (window.SSEPIStateMachine.estaEnCuarentena(orden)) {
                _showErrorModal('Orden en cuarentena', 'No se puede eliminar una orden en cuarentena contable. Desactive la cuarentena primero.');
                return;
            }
            if (!window.SSEPIStateMachine.puedeEliminar(orden)) {
                _showErrorModal('Punto de no retorno', `La orden ${orden.folio} ya avanzó más allá de Diagnóstico. Solo puede cancelarse, no eliminarse.`);
                return;
            }
        }
        const folio = orden.folio || id.slice(-6);
        const cliente = orden.cliente_nombre || 'N/A';
        if (!confirm(`¿Eliminar orden ${folio} de ${cliente}?`)) return;
        try {
            const { error } = await window.supabase.from('ordenes_motores').delete().eq('id', id);
            if (error) throw error;
            _addToFeed('🗑️', 'Orden eliminada: ' + folio);
            await _loadOrders();
            _applyFilters();
        } catch (e) {
            console.error(e);
            _showErrorModal('Error al eliminar', e.message);
        }
    }

    async function _buscarCotizacionesPendientes() {
        const supabaseClient = _supabase();
        if (!supabaseClient) return [];

        const { data, error } = await supabaseClient
            .from('cotizaciones')
            .select('*')
            .eq('estado', 'aprobada')
            .in('departamento', ['Motores', 'Servicios de Motores'])
            .is('orden_origen_id', null)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) {
            console.error('[Motores] Error buscando cotizaciones:', error);
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
                            <p class="text-muted">Selecciona una cotización para cargar los datos automáticamente o crea una orden en blanco.</p>
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

    async function _cargarOrdenDesdeCotizacion(cotizacion) {
        console.log('[Motores] Cargando cotización:', cotizacion.folio);

        isNewOrder = true;
        currentOrder = null;
        orderId = null;
        diagnosticoEnlaces = [];
        diagnosticoInventario = [];
        consumiblesUsados = [];
        componentesInventario = [];
        componentesCompra = [];
        fechaInicioOrden = new Date().toISOString();
        fechasEtapas = {};

        _resetForm();

        // Llenar campos con datos de la cotización
        document.getElementById('inpFolio').value = ''; // Se generará uno nuevo
        document.getElementById('inpClientRef').value = cotizacion.folio || '';

        // Cargar cliente
        const supabaseClient = _supabase();
        if (supabaseClient && cotizacion.cliente_id) {
            const { data } = await supabaseClient
                .from('contactos')
                .select('nombre')
                .eq('id', cotizacion.cliente_id)
                .single();
            if (data) {
                document.getElementById('selClient').value = data.nombre || '';
            }
        }

        document.getElementById('inpDateTime').value = new Date().toISOString().slice(0, 16);
        document.getElementById('inpFail').value = cotizacion.notas || '';
        document.getElementById('internalNotes').value = cotizacion.notas_internas || '';

        _generarFolio();
        _populateClientSelect();
        _irPaso(1);
        document.getElementById('wsModal').classList.add('active');
        document.getElementById('fechaInicioDisplay').innerText = new Date().toLocaleString();
        _renderPrioritySupplierBarMotores();

        console.log('[Motores] Orden cargada desde cotización', cotizacion.folio);
    }

    function _estadoToPaso(estado) {
        const mapa = { 'Nuevo': 1, 'Diagnóstico': 2, 'En Espera': 3, 'Reparado': 4, 'Entregado': 5 };
        return mapa[estado] || 1;
    }

    function _pasoToEstado(paso) {
        const mapa = { 1: 'Nuevo', 2: 'Diagnóstico', 3: 'En Espera', 4: 'Reparado', 5: 'Entregado' };
        return mapa[paso] || 'Nuevo';
    }

    async function _renderTimelineMotores(ordenId, estadoActual) {
        const container = document.getElementById('motoresTimeline');
        if (!container) return;
        const steps = [
            { label: 'Recepción', key: 'Nuevo', icon: '1' },
            { label: 'Diagnóstico', key: 'Diagnóstico', icon: '2' },
            { label: 'En Espera', key: 'En Espera', icon: '3' },
            { label: 'Reparación', key: 'Reparado', icon: '4' },
            { label: 'Entrega', key: 'Entregado', icon: '5' }
        ];
        let historial = [];
        try {
            if (window.SSEPIStateMachine && window.SSEPIStateMachine.obtenerHistorialUnificado) {
                historial = await window.SSEPIStateMachine.obtenerHistorialUnificado(window.supabase, 'motor', ordenId);
            } else {
                const { data } = await window.supabase.from('orden_historial').select('*').eq('orden_motor_id', ordenId).order('creado_en', { ascending: true });
                historial = data || [];
            }
        } catch (e) { console.warn('[Motores] Error cargando historial:', e); }

        const fechasPorEstado = {};
        historial.forEach(h => {
            const desc = (h.descripcion || '').toLowerCase();
            const evt = h.evento;
            if (evt === 'creacion' || desc.includes('creada')) fechasPorEstado['Nuevo'] = h.creado_en;
            if (desc.includes('diagnóstico') || evt === 'diagnostico') fechasPorEstado['Diagnóstico'] = h.creado_en;
            if (desc.includes('espera') || evt === 'espera') fechasPorEstado['En Espera'] = h.creado_en;
            if (desc.includes('reparado') || desc.includes('reparación') || evt === 'reparado') fechasPorEstado['Reparado'] = h.creado_en;
            if (desc.includes('entregado') || evt === 'entrega') fechasPorEstado['Entregado'] = h.creado_en;
        });

        const pasoActual = _estadoToPaso(estadoActual);
        container.innerHTML = steps.map((s, idx) => {
            const num = idx + 1;
            let clase = '';
            if (num < pasoActual) clase = 'done';
            else if (num === pasoActual) clase = 'current';
            const fecha = fechasPorEstado[s.key];
            const fechaStr = fecha ? new Date(fecha).toLocaleDateString('es-MX', { day:'2-digit', month:'short' }) : '';
            return '<div class="tl-step ' + clase + '" data-step="' + num + '" title="' + s.label + (fechaStr ? ' — ' + fechaStr : '') + '" >' +
                '<div class="tl-dot">' + (clase === 'done' ? '<i class="fas fa-check"></i>' : s.icon) + '</div>' +
                '<div class="tl-label">' + s.label + '</div>' +
                (fechaStr ? '<div class="tl-date">' + fechaStr + '</div>' : '') +
                '</div>';
        }).join('');
    }

    function _cargarDatosEnModal(orden) {
        document.getElementById('inpFolio').value = orden.folio || '';
        document.getElementById('selClient').value = orden.cliente_nombre || '';
        document.getElementById('inpDateTime').value = (orden.fecha_ingreso ? orden.fecha_ingreso.slice(0, 16) : '');
        document.getElementById('inpClientRef').value = orden.referencia || '';
        document.getElementById('inpMotorSelect').value = orden.motor || '';
        document.getElementById('inpBrand').value = orden.marca || '';
        document.getElementById('inpModel').value = orden.modelo || '';
        document.getElementById('inpSerial').value = orden.serie || '';
        document.getElementById('inpHp').value = orden.hp || '';
        document.getElementById('inpRpm').value = orden.rpm || '';
        document.getElementById('inpVoltaje').value = orden.voltaje || '';
        document.getElementById('inpFail').value = orden.falla_reportada || '';
        document.getElementById('inpCond').value = orden.condiciones_fisicas || '';
        document.getElementById('inpReceptionBy').value = orden.encargado_recepcion || '';
        document.getElementById('inpUnderWarranty').checked = orden.bajo_garantia || false;
        document.getElementById('techSelect').value = orden.tecnico_responsable || '';
        document.getElementById('megger').value = orden.megger || '';
        document.getElementById('ip').value = orden.ip || '';
        document.getElementById('rU').value = orden.rU || '';
        document.getElementById('rV').value = orden.rV || '';
        document.getElementById('rW').value = orden.rW || '';
        document.getElementById('internalNotes').value = orden.notas_internas || '';
        document.getElementById('generalNotes').value = orden.notas_generales || '';
        document.getElementById('horasEstimadas').value = orden.horas_estimadas || 0;
        document.getElementById('recibidoPor').value = orden.recibido_por || '';
        // Costos
        document.getElementById('motoresKmIda').value = orden.km_distancia || 0;
        document.getElementById('motoresHorasViaje').value = orden.horas_viaje || 0;
        document.getElementById('motoresDiasEntrega').value = orden.tiempo_entrega_dias || 0;
        document.getElementById('motoresBecerra').value = orden.becerra || 0;
        document.getElementById('motoresUtilidadFactor').value = orden.utilidad_factor || 1.4;

        diagnosticoEnlaces = orden.refacciones_enlaces || [];
        diagnosticoInventario = orden.refacciones_inventario || [];
        consumiblesUsados = orden.consumibles_usados || [];
        componentesInventario = orden.componentes_inventario || [];
        componentesCompra = orden.componentes_compra || [];
        fechaInicioOrden = orden.fecha_inicio || new Date().toISOString();
        fechasEtapas = orden.fechas_etapas || {};
        _renderRegistroTiempos();

        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();
        componentesExtras = orden.componentes_extras || [];
        _renderComponentesExtras();
        _renderPanelRentabilidad();

        document.getElementById('resumenCliente').innerText = orden.cliente_nombre || '';
        document.getElementById('resumenMotor').innerText = orden.motor || '';
        document.getElementById('resumenMarca').innerText = orden.marca || '';
        document.getElementById('resumenModelo').innerText = orden.modelo || '';
        document.getElementById('resumenSerie').innerText = orden.serie || '';
        document.getElementById('resumenHP').innerText = orden.hp || '';
        document.getElementById('resumenFalla').innerText = orden.falla_reportada || '';
        document.getElementById('fechaInicioDisplay').innerText = new Date(fechaInicioOrden).toLocaleString();

        if (orden.compraVinculada) {
            const infoCompra = document.getElementById('infoCompraVinculada');
            if (infoCompra) {
                infoCompra.innerHTML = `
                    <div style="background:#e3f2fd; padding:10px; border-radius:6px; margin:10px 0;">
                        <i class="fas fa-shopping-cart"></i> 
                        <strong>Compra vinculada:</strong> ${orden.compraVinculada.folio} 
                        (Estado: ${orden.compraVinculada.estado}/5)
                    </div>
                `;
                infoCompra.style.display = 'block';
            }
        }
    }

    function _getEtapaLabels() {
        return ['Recepción','Diagnóstico','En Espera','Reparación','Entrega'];
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
        if (!panel || !currentOrder) return;
        const supabase = _supabase();
        if (!supabase) return;
        let html = '';
        try {
            const { data: cots } = await supabase.from('cotizaciones').select('folio,fechas_etapas,estado,created_at').eq('orden_origen_id', currentOrder.id).limit(5).order('created_at',{ascending:false});
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
        } catch(e) { console.warn('[Motores] tiempos ventas:', e); }
        try {
            const cliente = currentOrder.cliente_nombre || '';
            if (cliente) {
                const { data: autos } = await supabase.from('proyectos_automatizacion').select('folio,nombre,fechas_etapas,estado,created_at').ilike('cliente','%'+cliente+'%').limit(3).order('created_at',{ascending:false});
                if (autos && autos.length) {
                    html += '<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;"><strong style="color:#334155;font-size:13px;"><i class="fas fa-robot"></i> Automatización (mismo cliente)</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">';
                    autos.forEach(a => {
                        const fe = a.fechas_etapas || {};
                        const autoLabels = ['Levantamiento','Ingeniería','Materiales','Desarrollo','Entrega'];
                        let lineas = [];
                        for (let i=1;i<=5;i++) {
                            const ini = fe[`etapa${i}_inicio`];
                            const fin = fe[`etapa${i}_fin`];
                            if (ini || fin) {
                                const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                                const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                                lineas.push(`<span style="color:#64748b;">E${i} ${autoLabels[i-1]}: ${iniStr}→${finStr}</span>`);
                            }
                        }
                        if (lineas.length) html += `<div style="min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;"><strong>${a.folio||'SP-A'}</strong> · ${lineas.join(' | ')}</div>`;
                    });
                    html += '</div></div>';
                }
            }
        } catch(e) { console.warn('[Motores] tiempos auto:', e); }
        panel.innerHTML = html || '';
    }

    function _renderRegistroTiempos() {
        _renderRegistroTiemposBase();
        _renderRegistroTiemposRelacionados().catch(()=>{});
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`step-${paso}`).classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.ws-step-btn[data-step="${paso}"]`).classList.add('active');
        _actualizarBotonesPaso();
        // Registrar inicio de etapa automáticamente (solo la primera vez)
        const campoInicio = `etapa${paso}_inicio`;
        if (!fechasEtapas[campoInicio]) {
            fechasEtapas[campoInicio] = new Date().toISOString();
        }
        if (paso === 2) {
            _renderDiagnosticoEnlaces();
            _renderDiagnosticoInventario();
        }
        _renderRegistroTiempos();

        if (paso === 4) {
            _renderConsumibles();
            _renderComponentesInventario();
            _renderComponentesCompra();
            _renderComponentesExtras();
            _renderPanelRentabilidad();
        }
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveOrderBtn');
        const completeBtn = document.getElementById('completeOrderBtn');
        const sinReparacionBtn = document.getElementById('sinReparacionBtn');
        const reportePdfBtn = document.getElementById('btnReportePDFMotores');
        const vistaPreviaReporteBtn = document.getElementById('btnVistaPreviaReporteMotores');
        const isPaso5 = currentStep === 5;
        const isEntregadoFacturado = currentOrder && (currentOrder.estado === 'Entregado' || currentOrder.estado === 'Facturado');
        const mostrarReporte = isPaso5 && isEntregadoFacturado;
        if (reportePdfBtn) reportePdfBtn.classList.toggle('hidden', !mostrarReporte);
        if (vistaPreviaReporteBtn) vistaPreviaReporteBtn.classList.toggle('hidden', !mostrarReporte);

        if (currentStep === 1) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'flex';
            saveBtn.style.display = 'inline-flex';
            completeBtn.style.display = 'none';
            sinReparacionBtn.style.display = 'none';
        } else if (currentStep === 5) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'none';
            saveBtn.style.display = 'none';
            completeBtn.style.display = 'flex';
            sinReparacionBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
            saveBtn.style.display = 'inline-flex';
            completeBtn.style.display = 'none';
            sinReparacionBtn.style.display = currentStep === 2 ? 'flex' : 'none';
        }
    }

    function _prevStep() { if (currentStep > 1) _irPaso(currentStep - 1); }
    function _nextStep() { if (_validarPasoActual() && currentStep < 5) _irPaso(currentStep + 1); }

    function _validarPasoActual() {
        switch(currentStep) {
            case 1:
                if (!document.getElementById('selClient').value) { alert('Seleccione un cliente'); return false; }
                if (!document.getElementById('inpMotorSelect').value) { alert('Ingrese el motor'); return false; }
                break;
            case 2:
                if (!document.getElementById('techSelect').value) { alert('Seleccione técnico responsable'); return false; }
                if (parseFloat(document.getElementById('horasEstimadas').value) <= 0) { alert('Ingrese horas estimadas válidas'); return false; }
                break;
            case 5:
                if (!document.getElementById('recibeNombre').value) { alert('Ingrese el nombre de quien recibe'); return false; }
                if (!document.getElementById('fechaEntrega').value) { alert('Ingrese la fecha de entrega'); return false; }
                break;
        }
        return true;
    }

    // ==================== RENDERIZADO DE LISTAS ESPECÍFICAS ====================
    function _renderDiagnosticoEnlaces() {
        const tbody = document.getElementById('diagnosticoEnlacesBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (diagnosticoEnlaces.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay refacciones con enlace</td></tr>';
            return;
        }
        diagnosticoEnlaces.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${item.descripcion || ''}" placeholder="Descripción" data-index="${idx}" onchange="motoresModule._actualizarEnlace(${idx}, 'descripcion', this.value)"></td>
                <td><input type="text" value="${item.sku || ''}" placeholder="SKU" data-index="${idx}" onchange="motoresModule._actualizarEnlace(${idx}, 'sku', this.value)"></td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" data-index="${idx}" onchange="motoresModule._actualizarEnlace(${idx}, 'cantidad', this.value)"></td>
                <td><input type="url" value="${item.link || ''}" placeholder="https://..." data-index="${idx}" onchange="motoresModule._actualizarEnlace(${idx}, 'link', this.value)"></td>
                <td><button class="btn-remove" onclick="motoresModule._eliminarEnlace(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderDiagnosticoInventario() {
        const tbody = document.getElementById('diagnosticoInventarioBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (diagnosticoInventario.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay productos de inventario</td></tr>';
            return;
        }
        diagnosticoInventario.forEach((item, idx) => {
            const producto = inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <select data-index="${idx}" onchange="motoresModule._actualizarInventarioSeleccion(${idx}, this.value)">
                        <option value="">-- Seleccionar SKU --</option>
                        ${inventory.map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" value="${desc}" placeholder="Descripción" readonly></td>
                <td>${stock}</td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="motoresModule._actualizarInventarioCantidad(${idx}, this.value)"></td>
                <td><button class="btn-remove" onclick="motoresModule._eliminarInventario(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderConsumibles() {
        const tbody = document.getElementById('consumiblesBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (consumiblesUsados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay consumibles agregados</td></tr>';
            return;
        }
        consumiblesUsados.forEach((item, idx) => {
            const producto = inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <select data-index="${idx}" onchange="motoresModule._actualizarConsumibleSeleccion(${idx}, this.value)">
                        <option value="">-- Seleccionar SKU --</option>
                        ${inventory.filter(p => p.categoria === 'consumible').map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" value="${desc}" readonly></td>
                <td>${stock}</td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="motoresModule._actualizarConsumibleCantidad(${idx}, this.value)"></td>
                <td><button class="btn-remove" onclick="motoresModule._eliminarConsumible(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderComponentesInventario() {
        const tbody = document.getElementById('componentesInventarioBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const items = diagnosticoInventario.map(solicitado => {
            const existente = componentesInventario.find(c => c.sku === solicitado.sku);
            return {
                sku: solicitado.sku,
                descripcion: solicitado.descripcion,
                cantidad_solicitada: solicitado.cantidad,
                cantidad_usada: existente ? existente.cantidad_usada : solicitado.cantidad
            };
        });
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay componentes de inventario</td></tr>';
            return;
        }
        tbody.innerHTML = items.map((item, idx) => `
            <tr>
                <td>${item.sku}</td>
                <td>${item.descripcion}</td>
                <td>${item.cantidad_solicitada}</td>
                <td><input type="number" value="${item.cantidad_usada}" min="0" data-index="${idx}" onchange="motoresModule._actualizarComponenteInventario(${idx}, this.value)"></td>
                <td><button class="btn-remove" onclick="motoresModule._eliminarComponenteInventario(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _renderComponentesCompra() {
        const tbody = document.getElementById('componentesCompraBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (orderId && comprasVinculadas[orderId]) {
            const compra = comprasVinculadas[orderId];
            if (compra.items && compra.items.length > 0) {
                tbody.innerHTML = compra.items.map((item, idx) => `
                    <tr>
                        <td>${item.desc || 'Producto'}</td>
                        <td>${item.sku || '—'}</td>
                        <td>${item.qty || 0}</td>
                        <td><input type="number" value="${item.qty || 0}" min="0" data-index="${idx}" onchange="motoresModule._actualizarComponenteCompra(${idx}, this.value)"></td>
                        <td><button class="btn-remove" onclick="motoresModule._eliminarComponenteCompra(${idx})">✖</button></td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Compra sin items registrados</td></tr>';
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay compra vinculada a esta orden</td></tr>';
        }
    }

    // ==================== ACTUALIZACIÓN DE LISTAS (desde inputs) ====================
    function _actualizarEnlace(idx, campo, valor) {
        diagnosticoEnlaces[idx][campo] = campo === 'cantidad' ? parseInt(valor) || 1 : valor;
        if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule();
    }
    function _eliminarEnlace(idx) {
        diagnosticoEnlaces.splice(idx, 1);
        _renderDiagnosticoEnlaces();
        if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule();
    }
    function _actualizarInventarioSeleccion(idx, sku) {
        const producto = inventory.find(p => p.sku === sku);
        diagnosticoInventario[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: diagnosticoInventario[idx]?.cantidad || 1
        };
        _renderDiagnosticoInventario();
    }
    function _actualizarInventarioCantidad(idx, cantidad) {
        diagnosticoInventario[idx].cantidad = parseInt(cantidad) || 1;
    }
    function _eliminarInventario(idx) {
        diagnosticoInventario.splice(idx, 1);
        _renderDiagnosticoInventario();
    }
    function _actualizarConsumibleSeleccion(idx, sku) {
        const producto = inventory.find(p => p.sku === sku);
        consumiblesUsados[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: consumiblesUsados[idx]?.cantidad || 1
        };
        _renderConsumibles();
    }
    function _actualizarConsumibleCantidad(idx, cantidad) {
        consumiblesUsados[idx].cantidad = parseInt(cantidad) || 1;
    }
    function _eliminarConsumible(idx) {
        consumiblesUsados.splice(idx, 1);
        _renderConsumibles();
    }
    function _actualizarComponenteInventario(idx, cantidad) {
        if (!componentesInventario[idx]) {
            componentesInventario[idx] = { sku: diagnosticoInventario[idx]?.sku, cantidad_usada: 0 };
        }
        componentesInventario[idx].cantidad_usada = parseInt(cantidad) || 0;
    }
    function _eliminarComponenteInventario(idx) {
        componentesInventario.splice(idx, 1);
        _renderComponentesInventario();
    }
    function _actualizarComponenteCompra(idx, cantidad) {
        if (!componentesCompra[idx]) componentesCompra[idx] = {};
        componentesCompra[idx].cantidad_usada = parseInt(cantidad) || 0;
    }
    function _eliminarComponenteCompra(idx) {
        componentesCompra.splice(idx, 1);
        _renderComponentesCompra();
    }

    // ==================== COMPONENTES EXTRAS Y RENTABILIDAD ====================
    function _renderComponentesExtras() {
        const tbody = document.getElementById('componentesExtrasBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (componentesExtras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay componentes extras</td></tr>';
        } else {
            componentesExtras.forEach((item, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.descripcion || ''}</td>
                    <td>${item.cantidad || 0}</td>
                    <td>$${(item.costo_unitario || 0).toFixed(2)}</td>
                    <td><strong>$${(item.subtotal || 0).toFixed(2)}</strong></td>
                    <td><button class="btn-remove" onclick="motoresModule._eliminarComponenteExtra(${idx})">✖</button></td>
                `;
                tbody.appendChild(tr);
            });
        }
        const total = componentesExtras.reduce((s, i) => s + (i.subtotal || 0), 0);
        const disp = document.getElementById('extrasTotalDisplay');
        if (disp) disp.textContent = total.toFixed(2);
    }

    function _agregarComponenteExtra() {
        const descEl = document.getElementById('extraDescInput');
        const cantEl = document.getElementById('extraCantInput');
        const costoEl = document.getElementById('extraCostoInput');
        const desc = (descEl?.value || '').trim();
        const cant = parseFloat(cantEl?.value) || 0;
        const costo = parseFloat(costoEl?.value) || 0;
        if (!desc) { _showToast('Ingresa la descripción del componente extra', 'warning'); return; }
        if (cant <= 0) { _showToast('La cantidad debe ser mayor a 0', 'warning'); return; }
        if (costo < 0) { _showToast('El costo no puede ser negativo', 'warning'); return; }
        componentesExtras.push({ descripcion: desc, cantidad: cant, costo_unitario: costo, subtotal: cant * costo });
        _renderComponentesExtras();
        _renderPanelRentabilidad();
        if (descEl) descEl.value = '';
        if (cantEl) cantEl.value = '1';
        if (costoEl) costoEl.value = '';
        if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule();
    }

    function _eliminarComponenteExtra(idx) {
        componentesExtras.splice(idx, 1);
        _renderComponentesExtras();
        _renderPanelRentabilidad();
        if (motoresAutosaveCtrl) motoresAutosaveCtrl.schedule();
    }

    function _renderPanelRentabilidad() {
        const panel = document.getElementById('panelRentabilidad');
        if (!panel) return;
        const data = _recolectarDatos();
        const costoPresupuestado = currentOrder?.costo_presupuestado || currentOrder?.costo_total || data.costo_total || 0;
        const costoReal = CostosEngine.calcularCostoRealMotores({ ...data, costo_total: costoPresupuestado });
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
            badge.textContent = estado === 'verde' ? 'Orden rentable' : 'Números rojos';
        }
        if (presEl) presEl.textContent = '$' + (costoPresupuestado || 0).toFixed(2);
        if (realEl) realEl.textContent = '$' + (costoReal || 0).toFixed(2);
        if (adeudoRow) adeudoRow.style.display = adeudo > 0 ? 'flex' : 'none';
        if (adeudoEl) adeudoEl.textContent = '$' + (adeudo || 0).toFixed(2);
    }

    // ==================== ACCIONES ESPECIALES ====================
    async function _sinReparacion() {
        if (!confirm('¿Marcar como "Sin reparación"? Esto moverá la orden a "En espera" y notificará a compras.')) return;

        await _guardarOrden(true);

        const data = _recolectarDatos();
        data.estado = 'En Espera';
        data.sin_reparacion = true;
        data.fecha_sin_reparacion = new Date().toISOString();

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fecha_ingreso = new Date().toISOString();
                await ordenesService.insert(data, csrfToken);
            } else {
                await ordenesService.update(orderId, data, csrfToken);
            }

            await notificacionesService.insert({
                para: 'compras',
                tipo: 'sin_reparacion',
                orden_id: orderId || 'nueva',
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} marcada como sin reparación - evaluar compra de motor nuevo`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            _afterMotoresPersistOk();
            _cerrarModal();
            _addToFeed('⚠️', `Orden marcada sin reparación`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _generarSolicitudCompra() {
        console.log('[Motores] Click en Generar Solicitud de Compra');
        if (!orderId && !isNewOrder) {
            alert('Primero guarde la orden de taller');
            return;
        }

        await _guardarOrden(true);

        const data = _recolectarDatos();
        if (!data.cliente_nombre) { alert('Seleccione cliente'); _irPaso(1); return; }
        if (!data.motor) { alert('Ingrese el motor'); _irPaso(1); return; }
        if (diagnosticoEnlaces.length === 0 && diagnosticoInventario.length === 0) {
            alert('Debe agregar al menos una refacción a comprar');
            return;
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            let ordenTallerId = orderId;
            let folioTaller = data.folio;

            if (isNewOrder) {
                folioTaller = document.getElementById('inpFolio').value;
                const nuevaOrden = {
                    ...data,
                    folio: folioTaller,
                    estado: 'En Espera',
                    fecha_ingreso: new Date().toISOString(),
                    fecha_inicio: fechaInicioOrden,
                    fechas_etapas: fechasEtapas
                };
                const fotoInput = document.getElementById('productImage');
                if (fotoInput && fotoInput.files[0]) {
                    nuevaOrden.foto_ingreso = await _subirFoto(fotoInput.files[0], 'motores/nueva');
                }
                const inserted = await ordenesService.insert(nuevaOrden, csrfToken);
                ordenTallerId = inserted.id;
                orderId = ordenTallerId;
                isNewOrder = false;
                if (window.SSEPIStateMachine) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'motor', ordenTallerId, 'creacion', `Orden ${folioTaller} creada y enviada a compras`, csrfToken);
                }
            } else {
                data.estado = 'En Espera';
                data.fecha_envio_compra = new Date().toISOString();
                await ordenesService.update(orderId, data, csrfToken);
                if (window.SSEPIStateMachine) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'motor', orderId, 'cambio_estado', `Estado cambiado a En Espera (solicitud de compra generada)`, csrfToken);
                }
            }

            const itemsCompra = [
                ...diagnosticoEnlaces.map(e => ({ sku: e.sku || '', descripcion: e.descripcion || '', cantidad: Number(e.cantidad) || 1, link: e.link || '' })),
                ...diagnosticoInventario.map(i => ({ sku: i.sku || '', descripcion: i.descripcion || '', cantidad: Number(i.cantidad) || 1 }))
            ];
            const nuevaCompra = {
                folio: `PO-${folioTaller}`,
                proveedor: 'Por asignar',
                departamento: 'Taller Motores',
                vinculacion: { tipo: 'motor', id: ordenTallerId, nombre: data.cliente_nombre, folio_taller: folioTaller },
                items: itemsCompra,
                estado: 1,
                updated_at: new Date().toISOString()
            };

            const compraRef = await comprasService.insert(nuevaCompra, csrfToken);

            await ordenesService.update(ordenTallerId, {
                compra_vinculada: compraRef.id,
                compra_folio: nuevaCompra.folio,
                estado: 'En Espera',
                fecha_envio_compra: new Date().toISOString()
            }, csrfToken);

            await notificacionesService.insert({
                para: 'compras',
                tipo: 'nueva_solicitud',
                orden_id: ordenTallerId,
                compra_id: compraRef.id,
                folio: nuevaCompra.folio,
                cliente: data.cliente_nombre,
                mensaje: `Nueva solicitud de compra ${nuevaCompra.folio} desde taller de motores`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            _showSuccessAlert('✅ Solicitud de compra generada. La orden pasó a estado "En Espera".');
            _addToFeed('🛒', `Solicitud de compra creada para ${folioTaller}`);
            _afterMotoresPersistOk();
            _cerrarModal();

        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _terminarReparacion() {
        if (!confirm('¿Finalizar la reparación? Se registrará la fecha y hora actual.')) return;

        const data = _recolectarDatos();
        data.estado = 'Reparado';
        data.fecha_reparacion = new Date().toISOString();
        data.componentes_inventario = componentesInventario;
        data.componentes_compra = componentesCompra;
        data.consumibles_usados = consumiblesUsados;

        for (let item of componentesInventario) {
            if (item.cantidad_usada > 0 && item.sku) {
                const producto = inventory.find(p => p.sku === item.sku);
                if (producto) {
                    const csrfToken = sessionStorage.getItem('csrfToken');
                    const nuevoStock = (producto.stock || 0) - item.cantidad_usada;
                    await inventarioService.update(producto.id, { stock: nuevoStock }, csrfToken);
                }
            }
        }
        for (let item of consumiblesUsados) {
            if (item.cantidad > 0 && item.sku) {
                const producto = inventory.find(p => p.sku === item.sku);
                if (producto) {
                    const csrfToken = sessionStorage.getItem('csrfToken');
                    const nuevoStock = (producto.stock || 0) - item.cantidad;
                    await inventarioService.update(producto.id, { stock: nuevoStock }, csrfToken);
                }
            }
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fecha_ingreso = new Date().toISOString();
                await ordenesService.insert(data, csrfToken);
            } else {
                await ordenesService.update(orderId, data, csrfToken);
            }

            await notificacionesService.insert({
                para: 'facturacion',
                tipo: 'taller_terminado',
                orden_id: orderId,
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} reparada - Listo para facturar`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            _irPaso(4);
            _afterMotoresPersistOk();
            alert('✅ Reparación finalizada');
            _addToFeed('✅', `Reparación completada para ${data.folio}`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _terminarEtapa(etapa) {
        const campo = `etapa${etapa}_fin`;
        fechasEtapas[campo] = new Date().toISOString();
        if (orderId) {
            const csrfToken = sessionStorage.getItem('csrfToken');
            await ordenesService.update(orderId, { fechas_etapas: fechasEtapas }, csrfToken);
        }
        _renderRegistroTiempos();
        alert(`✅ Etapa ${etapa} finalizada`);
        if (etapa < 5) _irPaso(etapa + 1);
    }

    async function _guardarOrden(silencioso = false) {
        const data = _recolectarDatos();
        // Auto-guardado: siempre guardar, solo advertir en modo manual si faltan campos
        if (!silencioso && (!data.cliente_nombre || !data.motor)) {
            if (!confirm('Faltan campos obligatorios. ¿Guardar como borrador?')) { _irPaso(1); return; }
        }

        const fotoInput = document.getElementById('productImage');
        if (fotoInput && fotoInput.files[0]) {
            data.foto_ingreso = await _subirFoto(fotoInput.files[0], 'motores/' + (orderId || 'nueva'));
        }

        data.refacciones_enlaces = diagnosticoEnlaces;
        data.refacciones_inventario = diagnosticoInventario;
        data.consumibles_usados = consumiblesUsados;
        data.componentes_inventario = componentesInventario;
        data.componentes_compra = componentesCompra;
        data.fecha_inicio = fechaInicioOrden;
        data.fechas_etapas = fechasEtapas;
        data.recibido_por = document.getElementById('recibidoPor')?.value || '';

        // Calcular costos vía CostosEngine (Motores)
        try {
            await CostosEngine.loadFromDatabase('motores');
            const desglose = CostosEngine.calcularMotores(
                data.tiempo_entrega_dias || 0,
                data.km_distancia || 0,
                data.becerra || 0,
                data.utilidad_factor || 1.4
            );
            data.costo_gasolina = desglose.gasolina || 0;
            data.costo_ventas = desglose.ventas || 0;
            data.costo_camioneta = desglose.camioneta || 0;
            data.costo_total = desglose.credito || 0;
            console.log(`[SSEPI-COSTOS] Orden ${data.folio || 'nueva'}: gasolina=$${(desglose.gasolina||0).toFixed(2)}, camioneta=$${(desglose.camioneta||0).toFixed(2)}, total=$${(desglose.credito||0).toFixed(2)}`);
        } catch (ce) {
            console.warn('[SSEPI-COSTOS] Error calculando costos:', ce);
        }

        // Calcular rentabilidad y adeudo
        try {
            const costoPresupuestado = currentOrder?.costo_presupuestado || data.costo_total || 0;
            const costoReal = CostosEngine.calcularCostoRealMotores({ ...data, costo_total: costoPresupuestado });
            data.costo_presupuestado = costoPresupuestado;
            data.costo_real = costoReal;
            data.adeudo_generado = Math.max(0, costoReal - costoPresupuestado);
            data.rentabilidad_estado = CostosEngine.determinarRentabilidad(costoPresupuestado, costoReal);
        } catch (re) {
            console.warn('[SSEPI-RENTABILIDAD] Error calculando rentabilidad:', re);
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.estado = 'Nuevo';
                data.fecha_ingreso = new Date().toISOString();
                const inserted = await ordenesService.insert(data, csrfToken);
                orderId = inserted.id;
                isNewOrder = false;
                if (!silencioso) alert('✅ Orden guardada correctamente');
                if (window.SSEPIStateMachine) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'motor', orderId, 'creacion', `Orden ${data.folio} creada en Motores`, csrfToken);
                }
                // Auto-avance: si guardó paso 1, pasar a Diagnóstico
                if (currentStep === 1 && data.estado === 'Nuevo') {
                    await ordenesService.update(orderId, { estado: 'Diagnóstico' }, csrfToken);
                    data.estado = 'Diagnóstico';
                    if (window.SSEPIStateMachine) {
                        await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'motor', orderId, 'cambio_estado', `Estado cambiado a Diagnóstico (auto-avance paso 1)`, csrfToken);
                    }
                }
            } else {
                await ordenesService.update(orderId, data, csrfToken);
                if (!silencioso) alert('✅ Orden actualizada correctamente');
                if (window.SSEPIStateMachine && data.estado) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'motor', orderId, 'actualizacion', `Orden ${data.folio} actualizada`, csrfToken);
                }
            }
            _afterMotoresPersistOk();
            _addToFeed('💾', `Orden ${data.folio} guardada`);

            // Generar adeudo si la orden salió en números rojos
            if (data.adeudo_generado > 0 && orderId) {
                try {
                    const clienteNombre = document.getElementById('selClient')?.value || '';
                    const contacto = clients.find(c => c.nombre === clienteNombre);
                    const clienteId = contacto?.id || currentOrder?.cliente_id;
                    if (clienteId && window.supabase) {
                        const adeudoData = {
                            cliente_id: clienteId,
                            orden_origen_id: orderId,
                            orden_tipo: 'motores',
                            folio_orden: data.folio,
                            monto_adeudo: data.adeudo_generado,
                            motivo: `Excedente de costos en orden ${data.folio}`,
                            recuperado: false
                        };
                        await window.supabase.from('clientes_adeudos').insert(adeudoData);
                        await window.supabase.rpc('actualizar_adeudo_cliente', { p_cliente_id: clienteId });
                        const notaAdeudo = `[${new Date().toLocaleString('es-MX')}] Sistema: Adeudo generado $${(data.adeudo_generado || 0).toFixed(2)} por excedente de costos en orden ${data.folio}.`;
                        data.notas_internas = (data.notas_internas || '') + '\n' + notaAdeudo;
                        await ordenesService.update(orderId, { notas_internas: data.notas_internas }, csrfToken);
                    }
                } catch (e) {
                    console.warn('[Motores] Error generando adeudo:', e);
                }
            }

        } catch (error) {
            console.error(error);
            if (!silencioso) alert('Error al guardar: ' + error.message);
        }
    }

    function _obtenerMotor() {
        var sel = document.getElementById('inpMotorSelect');
        if (!sel) return '';
        var val = sel.value;
        if (val === 'Otro') {
            var otro = document.getElementById('inpMotorOtro');
            return otro ? (otro.value.trim() || 'Otro') : 'Otro';
        }
        return val;
    }

    function _recolectarDatos() {
        return {
            cliente_nombre: document.getElementById('selClient').value,
            referencia: document.getElementById('inpClientRef').value,
            fecha_ingreso: document.getElementById('inpDateTime').value,
            motor: _obtenerMotor(),
            marca: document.getElementById('inpBrand').value,
            modelo: document.getElementById('inpModel').value,
            serie: document.getElementById('inpSerial').value,
            hp: parseFloat(document.getElementById('inpHp').value) || 0,
            rpm: parseFloat(document.getElementById('inpRpm').value) || 0,
            voltaje: document.getElementById('inpVoltaje').value,
            falla_reportada: document.getElementById('inpFail').value,
            condiciones_fisicas: document.getElementById('inpCond').value,
            encargado_recepcion: document.getElementById('inpReceptionBy').value,
            bajo_garantia: document.getElementById('inpUnderWarranty').checked,
            tecnico_responsable: document.getElementById('techSelect').value,
            megger: parseFloat(document.getElementById('megger').value) || 0,
            ip: parseFloat(document.getElementById('ip').value) || 0,
            rU: parseFloat(document.getElementById('rU').value) || 0,
            rV: parseFloat(document.getElementById('rV').value) || 0,
            rW: parseFloat(document.getElementById('rW').value) || 0,
            notas_internas: document.getElementById('internalNotes').value,
            notas_generales: document.getElementById('generalNotes').value,
            horas_estimadas: parseFloat(document.getElementById('horasEstimadas').value) || 0,
            fecha_entrega: document.getElementById('fechaEntrega').value,
            recibe_nombre: document.getElementById('recibeNombre').value,
            recibe_identificacion: document.getElementById('recibeIdentificacion').value,
            factura_numero: document.getElementById('facturaNumero').value,
            entrega_obs: document.getElementById('entregaObs').value,
            recibido_por: document.getElementById('recibidoPor')?.value || '',
            // Campos costos
            km_distancia: parseFloat(document.getElementById('motoresKmIda')?.value) || 0,
            horas_viaje: parseFloat(document.getElementById('motoresHorasViaje')?.value) || 0,
            tiempo_entrega_dias: parseFloat(document.getElementById('motoresDiasEntrega')?.value) || 0,
            becerra: parseFloat(document.getElementById('motoresBecerra')?.value) || 0,
            utilidad_factor: parseFloat(document.getElementById('motoresUtilidadFactor')?.value) || 1.4,
            componentes_extras: componentesExtras || [],
            fecha_inicio: fechaInicioOrden || new Date().toISOString(),
            fechas_etapas: fechasEtapas || {},
            updated_at: new Date().toISOString()
        };
    }

    async function _completarEntrega() {
        if (!_validarPasoActual()) return;

        const data = _recolectarDatos();
        data.estado = 'Entregado';
        data.fecha_entrega = new Date().toISOString();

        const fotoInput = document.getElementById('fotoEntrega');
        if (fotoInput && fotoInput.files[0]) {
            data.foto_entrega = await _subirFoto(fotoInput.files[0], 'motores/' + (orderId || 'nueva'));
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fecha_ingreso = new Date().toISOString();
                await ordenesService.insert(data, csrfToken);
            } else {
                await ordenesService.update(orderId, data, csrfToken);
            }

            await notificacionesService.insert({
                para: 'facturacion',
                tipo: 'taller_entregado',
                orden_id: orderId,
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} entregada a ventas`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            _afterMotoresPersistOk();
            _cerrarModal();
            alert('✅ Orden entregada a ventas');
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _subirFoto(file, carpeta) {
        if (!file) return null;
        const supabase = _supabase();
        if (!supabase) return null;
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const isOffline = window.location.port === '3333' || window.location.port === '3443' || window.location.hostname.endsWith('.trycloudflare.com') || window.__SSEPI_NEXT_MODE__;
            if (isOffline) {
                const uploadName = `${carpeta}/${fileName}`;
                const res = await fetch('/api/upload', { method: 'POST', headers: { 'X-Filename': uploadName }, body: file });
                const json = await res.json();
                return json.data.url;
            }
            const { data, error } = await supabase.storage
                .from('pdfs')
                .upload(`${carpeta}/${fileName}`, file);
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(data.path);
            return urlData.publicUrl;
        } catch (error) {
            console.error('Error subiendo foto:', error);
            return null;
        }
    }

    function _generarFolio() {
        const now = new Date();
        const folio = `MTR-${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        document.getElementById('inpFolio').value = folio;
    }

    function _resetForm() {
        document.getElementById('inpFolio').value = '';
        document.getElementById('selClient').value = '';
        document.getElementById('inpDateTime').value = new Date().toISOString().slice(0,16);
        document.getElementById('inpClientRef').value = '';
        document.getElementById('inpMotorSelect').value = '';
        document.getElementById('inpBrand').value = '';
        document.getElementById('inpModel').value = '';
        document.getElementById('inpSerial').value = '';
        document.getElementById('inpHp').value = '';
        document.getElementById('inpRpm').value = '';
        document.getElementById('inpVoltaje').value = '';
        document.getElementById('inpFail').value = '';
        document.getElementById('inpCond').value = '';
        document.getElementById('inpReceptionBy').value = '';
        document.getElementById('inpUnderWarranty').checked = false;
        document.getElementById('techSelect').value = '';
        document.getElementById('megger').value = '';
        document.getElementById('ip').value = '';
        document.getElementById('rU').value = '';
        document.getElementById('rV').value = '';
        document.getElementById('rW').value = '';
        document.getElementById('internalNotes').value = '';
        document.getElementById('generalNotes').value = '';
        document.getElementById('horasEstimadas').value = 0;
        document.getElementById('fechaEntrega').value = new Date().toISOString().slice(0,16);
        document.getElementById('recibeNombre').value = '';
        document.getElementById('recibeIdentificacion').value = '';
        document.getElementById('facturaNumero').value = '';
        document.getElementById('entregaObs').value = '';
        document.getElementById('recibidoPor').value = '';
        document.getElementById('motoresKmIda').value = 0;
        document.getElementById('motoresHorasViaje').value = 0;
        document.getElementById('motoresDiasEntrega').value = 0;
        document.getElementById('motoresBecerra').value = 0;
        document.getElementById('motoresUtilidadFactor').value = 1.4;
        document.getElementById('productImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        diagnosticoEnlaces = [];
        diagnosticoInventario = [];
        consumiblesUsados = [];
        componentesInventario = [];
        componentesCompra = [];
        componentesExtras = [];
        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();
        _renderComponentesExtras();
    }

    function _previewImage() {
        const input = document.getElementById('productImage');
        const preview = document.getElementById('imagePreview');
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%; max-height:120px;">`;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(input.files[0]);
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    function _cerrarModal() {
        document.getElementById('wsModal').classList.remove('active');
        currentOrder = null;
        orderId = null;
        isNewOrder = true;
    }

    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-motores);">MOTORES</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    function _showSuccessAlert(message) {
        const alertDiv = document.createElement('div');
        alertDiv.style.cssText = `
            position: fixed;
            top: 90px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 10px 18px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-size: 13px;
        `;
        alertDiv.textContent = message;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 4000);
    }

    async function _generarCotizacionMotores(preview = false) {
        if (!currentOrder) { _showToast('No hay orden activa', 'warning'); return; }
        const user = await authService.getCurrentProfile();
        const orden = currentOrder;
        const folio = _formVal('inpFolio') || orden.folio || 'SP-M000000';
        const items = [];
        if (orden.refacciones && orden.refacciones.length) {
            orden.refacciones.forEach(r => {
                items.push({ descripcion: r.descripcion || r.nombre || 'Refacción', especificaciones: r.sku || '', unidad: 'Pza', precio: Number(r.costo) || 0, cantidad: parseInt(r.cantidad) || 1, entrega: '' });
            });
        }
        if (!items.length) items.push({ descripcion: '(Sin refacciones cargadas)', especificaciones: '', unidad: '', precio: 0, cantidad: 1, entrega: '' });
        const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        const pdfData = {
            folio,
            cliente: _formVal('selClient') || orden.cliente_nombre || '',
            rfc: orden.rfc || '',
            direccion: orden.direccion || '',
            fecha: orden.fecha ? new Date(orden.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vendedor: orden.tecnico || '',
            departamento: 'Taller Motores',
            items,
            subtotal,
            iva,
            total
        };
        try {
            await pdfGenerator.generateCotizacion(pdfData, user, preview);
            if (!preview) _showToast('Cotización PDF generada: ' + folio, 'success');
        } catch (err) {
            _showToast('Error al generar cotización: ' + err.message, 'error');
        }
    }

    async function _generarReporteMotores(preview = false) {
        if (!currentOrder) { _showToast('No hay orden activa', 'warning'); return; }
        const orden = currentOrder;
        const user = await authService.getCurrentProfile();

        const folio = _formVal('inpFolio') || orden.folio || 'BORRADOR';
        const cliente = _formVal('selClient') || orden.cliente_nombre || '—';
        const motor = _formVal('inpEquip') || orden.motor || '—';
        const marca = _formVal('inpBrand') || orden.marca || '—';
        const modelo = _formVal('inpModel') || orden.modelo || '—';
        const serie = _formVal('inpSerial') || orden.serie || '—';
        const hp = _formVal('inpHP') || orden.hp || '—';
        const rpm = _formVal('inpRPM') || orden.rpm || '—';
        const voltaje = _formVal('inpVoltaje') || orden.voltaje || '—';
        const falla = _formVal('inpFail') || orden.falla_reportada || '—';
        const cond = _formVal('inpCond') || orden.condiciones_fisicas || '—';
        const tecnico = _formVal('techSelect') || orden.tecnico_responsable || '—';
        const notasInt = _formVal('internalNotes') || orden.notas_internas || '';
        const notasCli = _formVal('generalNotes') || orden.notas_generales || '';
        const repNotas = _formVal('reparacionNotas') || '';
        const entRecibe = _formVal('recibeNombre') || '';
        const entFecha = _formVal('fechaEntrega') || '';
        const entObs = _formVal('entregaObs') || '';

        const descServ = [
            'Motor: ' + motor,
            'Marca/Modelo: ' + marca + ' / ' + modelo,
            'Serie: ' + serie,
            'HP: ' + hp + ' | RPM: ' + rpm + ' | Voltaje: ' + voltaje,
            'Falla reportada: ' + falla,
            'Condiciones físicas: ' + cond,
            '',
            'Trabajo realizado:',
            repNotas || notasInt || '—'
        ].join('\n');

        const hallazgos = [
            'Técnico responsable: ' + tecnico,
            'Notas internas: ' + (notasInt || '—'),
            'Notas generales: ' + (notasCli || '—')
        ].join('\n');

        const refacciones = [
            'Enlaces de refacción: ' + (diagnosticoEnlaces.length ? diagnosticoEnlaces.map(e => e.descripcion).join(', ') : 'Ninguno'),
            'Inventario usado: ' + (diagnosticoInventario.length ? diagnosticoInventario.map(e => e.descripcion).join(', ') : 'Ninguno'),
            'Consumibles: ' + (consumiblesUsados.length ? consumiblesUsados.map(e => e.descripcion).join(', ') : 'Ninguno')
        ].join('\n');

        const recomendaciones = [
            'Entregado a: ' + entRecibe,
            'Fecha de entrega: ' + entFecha,
            'Observaciones: ' + (entObs || '—')
        ].join('\n');

        const imgs = [];
        const previewEntrega = document.getElementById('previewEntrega');
        if (previewEntrega) {
            previewEntrega.querySelectorAll('img').forEach(img => {
                if (img.src && img.src.startsWith('data:')) imgs.push(img.src);
            });
        }

        const pdfData = {
            folio: folio,
            cliente: cliente,
            fecha: new Date().toLocaleDateString('es-MX', {day:'2-digit',month:'2-digit',year:'numeric'}),
            vendedor: tecnico,
            departamento: 'Taller Motores',
            repDescripcion: descServ,
            repHallazgos: hallazgos,
            repRefacciones: refacciones,
            repRecomendaciones: recomendaciones,
            imagenes: imgs
        };

        pdfGenerator.generateReport(pdfData, user, preview)
            .then(() => { if (!preview) _showToast('Reporte generado', 'success'); })
            .catch(err => { console.error(err); _showToast('Error al generar reporte', 'error'); });
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('newOrderBtn').addEventListener('click', _abrirNuevaOrden);
        document.getElementById('closeWsBtn').addEventListener('click', _cerrarModal);
        document.getElementById('cancelWsBtn').addEventListener('click', _cerrarModal);
        const reportePdfBtn = document.getElementById('btnReportePDFMotores');
        if (reportePdfBtn) reportePdfBtn.addEventListener('click', () => _generarReporteMotores(false));
        const prevReporteBtn = document.getElementById('btnVistaPreviaReporteMotores');
        if (prevReporteBtn) prevReporteBtn.addEventListener('click', () => _generarReporteMotores(true));
        const cotPdfBtn = document.getElementById('btnCotizacionPDFMotores');
        if (cotPdfBtn) cotPdfBtn.addEventListener('click', () => _generarCotizacionMotores(false));
        document.querySelectorAll('.ws-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => _irPaso(parseInt(e.target.dataset.step)));
        });
        document.getElementById('prevStepBtn').addEventListener('click', _prevStep);
        document.getElementById('nextStepBtn').addEventListener('click', _nextStep);
        document.getElementById('saveOrderBtn').addEventListener('click', () => _guardarOrden(false));
        document.getElementById('completeOrderBtn').addEventListener('click', _completarEntrega);
        document.getElementById('sinReparacionBtn').addEventListener('click', _sinReparacion);
        document.getElementById('generarCompraBtn').addEventListener('click', _generarSolicitudCompra);

        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`terminarEtapa${i}`);
            if (btn) btn.addEventListener('click', () => _terminarEtapa(i));
        }

        document.getElementById('terminarReparacionBtn').addEventListener('click', _terminarReparacion);
        document.getElementById('addEnlaceBtn').addEventListener('click', () => {
            diagnosticoEnlaces.push({ descripcion: '', sku: '', cantidad: 1, link: '' });
            _renderDiagnosticoEnlaces();
        });
        document.getElementById('addInventarioBtn').addEventListener('click', () => {
            diagnosticoInventario.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderDiagnosticoInventario();
        });
        document.getElementById('addConsumibleBtn').addEventListener('click', () => {
            consumiblesUsados.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderConsumibles();
        });
        const addComponenteExtraBtn = document.getElementById('addComponenteExtraBtn');
        if (addComponenteExtraBtn) addComponenteExtraBtn.addEventListener('click', _agregarComponenteExtra);

        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            filtroTecnico = document.getElementById('filtroTecnico').value;
            filtroEstado = document.getElementById('filtroEstado').value;
            filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _applyFilters();
        });

        document.getElementById('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaLista').addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
            _applyFilters();
        });

        document.getElementById('productImage').addEventListener('change', _previewImage);
        document.getElementById('fotoEntrega').addEventListener('change', (e) => {
            const preview = document.getElementById('previewEntrega');
            if (e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%; max-height:120px;">`;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(e.target.files[0]);
            } else {
                preview.innerHTML = '';
                preview.style.display = 'none';
            }
        });
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
        if (window.innerWidth <= 768) s.classList.toggle('active');
        else b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ==================== MODALES ====================
    function _showErrorModal(title, message) {
        const existing = document.getElementById('ssepiErrorModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'ssepiErrorModal';
        modal.className = 'ssepi-modal-overlay';
        modal.innerHTML = `
            <div class="ssepi-error-modal">
                <div class="ssepi-modal-header">
                    <div class="ssepi-modal-icon error">
                        <i class="fas fa-circle-xmark"></i>
                    </div>
                    <h3 class="ssepi-modal-title">${title}</h3>
                </div>
                <div class="ssepi-modal-body">
                    <p class="ssepi-error-message">${message}</p>
                </div>
                <div class="ssepi-modal-footer">
                    <button class="ssepi-btn ssepi-btn-primary">Aceptar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
        modal.querySelector('.ssepi-btn-primary').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        });
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
        _abrirOrden,
        _abrirNuevaOrden,
        _eliminarOrden,
        _actualizarEnlace,
        _eliminarEnlace,
        _actualizarInventarioSeleccion,
        _actualizarInventarioCantidad,
        _eliminarInventario,
        _actualizarConsumibleSeleccion,
        _actualizarConsumibleCantidad,
        _eliminarConsumible,
        _actualizarComponenteInventario,
        _eliminarComponenteInventario,
        _actualizarComponenteCompra,
        _eliminarComponenteCompra
    };
})();

window.motoresModule = MotoresModule;