// ================================================
// ARCHIVO: facturacion.js
// DESCRIPCIÓN: Módulo de Facturación adaptado a Supabase
// BASADO EN: facturacion-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Visibilidad 360°, cálculo de costos, emisión de CFDI, notificaciones
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { ContactosFormulas } from '../core/contactos-formulas.js';
import { notifyVentaIfEligible } from '../core/coi-sync-engine.js';
import { enqueueCoiJob } from '../core/coi-queue.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';

const FacturacionModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    const ESTADOS_LISTOS_FACTURAR = [
        'Reparado', 'Reparado / Listo', 'Terminado', 'Entregado',
        'Listo para facturar', 'Completado', 'completado', 'cerrado'
    ];
    let ordenesTaller = [];
    let ordenesMotores = [];
    let ordenesProyectos = [];        // proyectos automatización listos para facturar
    let ventas = [];                  // ventas pagadas (para consultar clientes)
    let contactos = [];               // contactos (para datos fiscales)
    let facturas = [];                // facturas emitidas

    let ordenSeleccionada = null;     // { tipo: 'taller', id: '...', data: {...} }
    let chartInstance = null;

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroEstado = 'todos';
    let filtroArea = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';

    // Servicios de datos
    const tallerService = createDataService('ordenes_taller');
    const motoresService = createDataService('ordenes_motores');
    const proyectosService = createDataService('proyectos_automatizacion');
    const ventasService = createDataService('ventas');
    const cotizacionesService = createDataService('cotizaciones');
    const contactosService = createDataService('contactos');
    const facturasService = createDataService('facturas');
    const ingresosService = createDataService('ingresos_contabilidad');
    const notificacionesService = createDataService('notificaciones');

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Facturación] Conectado');
        await _initUI();
        _bindEvents();
        _startListeners();
        _startClock();
        console.log('✅ Módulo facturación iniciado');
        _initExportButton();
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
        _setFiltroMesActual();
        _applyUrlQueryFilters();
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'folio', label: 'Folio' },
                    { key: 'cliente_nombre', label: 'Cliente' },
                    { key: 'fecha_emision', label: 'Fecha Emisión' },
                    { key: 'total', label: 'Total' },
                    { key: 'estado', label: 'Estado' }
                ];
                downloadCSV('facturas_' + new Date().toISOString().slice(0,10) + '.csv', facturas, headers);
            });
        } catch (e) { console.warn('[Facturación] Export CSV init:', e); }
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

    function _parseYmdLocal(s) {
        if (!s || typeof s !== 'string') return null;
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    function _departamentoToFiltroArea(dep) {
        if (!dep) return 'todos';
        const d = String(dep).trim();
        if (d === 'Laboratorio de Electrónica') return 'taller_electronica';
        if (d === 'Taller Motores') return 'taller_motores';
        if (d === 'Automatización' || d === 'Proyectos') return 'automatizacion';
        return 'todos';
    }

    /** Desde Contabilidad: ?desde=&hasta=&estado=&departamento= */
    function _applyUrlQueryFilters() {
        const p = new URLSearchParams(window.location.search);
        const desde = p.get('desde');
        const hasta = p.get('hasta');
        const estado = p.get('estado');
        const departamento = p.get('departamento');
        if (desde) {
            const d = _parseYmdLocal(desde);
            if (d) {
                filtroFechaInicio = d;
                const el = document.getElementById('filtroFechaInicio');
                if (el) el.valueAsDate = d;
            }
        }
        if (hasta) {
            const d = _parseYmdLocal(hasta);
            if (d) {
                filtroFechaFin = d;
                const el = document.getElementById('filtroFechaFin');
                if (el) el.valueAsDate = d;
            }
        }
        if (estado && ['todos', 'pendiente', 'emitida'].includes(estado)) {
            filtroEstado = estado;
            const sel = document.getElementById('filtroEstado');
            if (sel) sel.value = estado;
        }
        if (departamento) {
            filtroArea = _departamentoToFiltroArea(departamento);
            const selA = document.getElementById('filtroArea');
            if (selA) selA.value = filtroArea;
        }
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

    // ==================== LISTENERS SUPABASE ====================
    function _startListeners() {
        const sb = _supabase();
        if (!sb) return;

        // Órdenes de taller listas para facturar
        const subTaller = sb
            .channel('taller_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_taller', filter: 'estado=in.(Reparado,"Reparado / Listo",Terminado,Entregado,"Listo para facturar",Completado)' }, () => {
                _loadTaller();
            })
            .subscribe();
        subscriptions.push(subTaller);

        // Órdenes de motores listas para facturar
        const subMotores = sb
            .channel('motores_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_motores', filter: 'estado=in.(Reparado,"Reparado / Listo",Terminado,Entregado,"Listo para facturar",Completado)' }, () => {
                _loadMotores();
            })
            .subscribe();
        subscriptions.push(subMotores);

        // Ventas (para clientes)
        const subVentas = sb
            .channel('ventas_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, payload => {
                _loadVentas();
                if (payload.new && payload.eventType !== 'DELETE') {
                    notifyVentaIfEligible(payload.new, payload.old);
                }
            })
            .subscribe();
        subscriptions.push(subVentas);

        // Contactos
        const subContactos = sb
            .channel('contactos_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => {
                _loadContactos();
            })
            .subscribe();
        subscriptions.push(subContactos);

        // Facturas emitidas
        const subFacturas = sb
            .channel('facturas_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, () => {
                _loadFacturas();
            })
            .subscribe();
        subscriptions.push(subFacturas);

        // Notificaciones para facturación
        const subNotif = sb
            .channel('facturacion_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.facturacion' }, payload => {
                _addToFeed('🔔', payload.new?.mensaje || 'Nueva notificación');
                _loadTaller();
                _loadMotores();
                _loadProyectosFacturacion();
            })
            .subscribe();
        subscriptions.push(subNotif);

        // Realtime para orden_historial: refrescar cuando órdenes cambien a reparado/entregado
        const subHistorial = sb
            .channel('facturacion_historial_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orden_historial' }, payload => {
                const ev = payload.new;
                if (ev.evento === 'cambio_estado' || ev.evento === 'actualizacion') {
                    _loadTaller();
                    _loadMotores();
                    _loadProyectosFacturacion();
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);

        const subProyectos = sb
            .channel('facturacion_proyectos')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_automatizacion' }, () => {
                _loadProyectosFacturacion();
            })
            .subscribe();
        subscriptions.push(subProyectos);

        // Carga inicial
        _loadTaller();
        _loadMotores();
        _loadProyectosFacturacion();
        _loadVentas();
        _loadContactos();
        _loadFacturas();
    }

    function _proyectoListoParaFacturar(p) {
        const s = String(p.estado || '').trim().toLowerCase();
        if (!s || s.includes('cancel')) return false;
        if (s.includes('factur')) return false;
        if (p.por_facturar === true) return true;
        return ['completado', 'entregado', 'cerrado', 'finalizado'].some((x) => s === x || s.includes(x));
    }

    function _enrichProyectosClientes() {
        if (!ordenesProyectos.length) return;
        ordenesProyectos = ordenesProyectos.map((p) => {
            let nom = p.cliente_nombre;
            if ((!nom || nom === 'Cliente') && p.cliente_id) {
                const c = contactos.find((x) => x.id === p.cliente_id);
                if (c) nom = c.nombre || c.empresa || nom;
            }
            if (!nom || nom === 'Cliente') {
                nom = p.cliente || p.nombre_proyecto || p.nombre || 'Cliente';
            }
            return nom === p.cliente_nombre ? p : { ...p, cliente_nombre: nom };
        });
    }

    function _contactoParaOrden(orden) {
        const n = orden.cliente_nombre;
        const cCliente = orden.cliente;
        return contactos.find((c) =>
            (n && (c.nombre === n || c.empresa === n)) ||
            (cCliente && (c.nombre === cCliente || c.empresa === cCliente)) ||
            (orden.cliente_id && c.id === orden.cliente_id)
        );
    }

    function _ivaDesdeTotalBruto(totalBruto) {
        const t = Number(totalBruto) || 0;
        if (t <= 0) return { total: 0, precioAntesIVA: 0, iva: 0 };
        const precioAntesIVA = t / 1.16;
        const iva = t - precioAntesIVA;
        return { total: t, precioAntesIVA, iva };
    }

    async function _loadTaller() {
        const supabase = _supabase();
        if (!supabase) return;
        const { data, error } = await supabase
            .from('ordenes_taller')
            .select('*')
            .in('estado', ESTADOS_LISTOS_FACTURAR)
            .order('fecha_reparacion', { ascending: false });
        if (error) console.error(error);
        else {
            ordenesTaller = data.map(d => ({ ...d, tipoOrigen: 'taller' }));
            _actualizarTodo();
        }
    }

    async function _loadMotores() {
        const supabase = _supabase();
        if (!supabase) return;
        const { data, error } = await supabase
            .from('ordenes_motores')
            .select('*')
            .in('estado', ESTADOS_LISTOS_FACTURAR)
            .order('fecha_reparacion', { ascending: false });
        if (error) console.error(error);
        else {
            ordenesMotores = data.map(d => ({ ...d, tipoOrigen: 'motor' }));
            _actualizarTodo();
        }
    }

    async function _loadProyectosFacturacion() {
        const supabase = _supabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('proyectos_automatizacion')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(300);
            if (error) throw error;
            ordenesProyectos = (data || []).filter(_proyectoListoParaFacturar).map(p => ({
                ...p,
                tipoOrigen: 'proyecto',
                cliente_nombre: p.cliente || p.cliente_nombre || p.nombre || p.nombre_proyecto || 'Cliente',
                fecha_reparacion: p.fecha_entrega || p.updated_at || p.fecha || p.fecha_inicio,
                orden_tipo: 'proyecto'
            }));
            _enrichProyectosClientes();
        } catch (e) {
            console.warn('[Facturación] proyectos listo facturar:', e);
            ordenesProyectos = [];
        }
        _actualizarTodo();
    }

    async function _loadVentas() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase.from('ventas').select('*');
            if (error) console.error(error);
            else ventas = data;
        }
    }

    async function _loadContactos() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase.from('contactos').select('*');
            if (error) console.error(error);
            else {
                contactos = data;
                _enrichProyectosClientes();
                _actualizarTodo();
            }
        }
    }

    async function _loadFacturas() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase
                .from('facturas')
                .select('*')
                .order('fecha_emision', { ascending: false });
            if (error) console.error(error);
            else facturas = data;
        }
    }

    function _actualizarTodo() {
        _aplicarFiltros();
        _updateKPIs();
    }

    // ==================== FILTROS Y VISTAS ====================
    function _aplicarFiltros() {
        let tOrd = [...ordenesTaller];
        let mOrd = [...ordenesMotores];
        let pOrd = [...ordenesProyectos];
        if (filtroArea === 'taller_electronica') { mOrd = []; pOrd = []; }
        else if (filtroArea === 'taller_motores') { tOrd = []; pOrd = []; }
        else if (filtroArea === 'automatizacion') { tOrd = []; mOrd = []; }
        let pendientes = [...tOrd, ...mOrd, ...pOrd];
        let emitidas = facturas;

        // Filtrar por fecha
        if (filtroFechaInicio && filtroFechaFin) {
            pendientes = pendientes.filter(o => {
                const f = new Date(o.fecha_reparacion || o.fecha_ingreso);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
            emitidas = emitidas.filter(f => {
                const fecha = new Date(f.fecha_emision);
                return fecha >= filtroFechaInicio && fecha <= filtroFechaFin;
            });
        }

        // Filtrar por estado
        if (filtroEstado !== 'todos') {
            if (filtroEstado === 'pendiente') emitidas = [];
            else if (filtroEstado === 'emitida') pendientes = [];
        }

        // Filtrar por búsqueda
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            pendientes = pendientes.filter(o =>
                (o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(term)) ||
                (o.folio && o.folio.toLowerCase().includes(term)) ||
                (o.nombre_proyecto && o.nombre_proyecto.toLowerCase().includes(term)) ||
                (o.nombre && String(o.nombre).toLowerCase().includes(term))
            );
            emitidas = emitidas.filter(f => 
                (f.cliente && f.cliente.toLowerCase().includes(term)) ||
                (f.folio_factura && f.folio_factura.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(pendientes, emitidas);
        else if (vistaActual === 'lista') _renderLista(pendientes, emitidas);
        else if (vistaActual === 'grafica') _renderGrafica(emitidas);
    }

    function _renderKanban(pendientes, emitidas) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        let html = `
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #ff9800;">
                    <span>⏳ Pendientes de Facturar</span>
                    <span class="badge" style="background: #ff9800;">${pendientes.length}</span>
                </div>
                <div class="kanban-cards">
                    ${pendientes.map(o => _crearCardPendiente(o)).join('')}
                </div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #4caf50;">
                    <span>✅ Facturas Emitidas</span>
                    <span class="badge" style="background: #4caf50;">${emitidas.length}</span>
                </div>
                <div class="kanban-cards">
                    ${emitidas.map(f => _crearCardFactura(f)).join('')}
                </div>
            </div>
        `;
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card[data-id]').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id, card.dataset.tipo));
        });
    }

    function _crearCardPendiente(orden) {
        const fecha = orden.fecha_reparacion ? new Date(orden.fecha_reparacion).toLocaleDateString() : '';
        const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(orden);
        const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';
        const tipoLabel = orden.tipoOrigen === 'taller' ? '🔧 Laboratorio' : (orden.tipoOrigen === 'motor' ? '⚙️ Motor' : '🤖 Auto');
        const fechaLabel = orden.tipoOrigen === 'proyecto' ? 'Cierre' : 'Reparación';
        return `
            <div class="kanban-card ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${orden.id}" data-tipo="${orden.tipoOrigen}">
                <div class="card-header">
                    <span class="folio">${orden.folio || orden.id.slice(-6)}</span>
                    <span class="badge tipo-${orden.tipoOrigen}">${tipoLabel}</span>
                    ${badgeCuarentena}
                </div>
                <div class="card-body">
                    <div class="cliente">${orden.cliente_nombre || 'Cliente'}</div>
                </div>
                <div class="card-footer">
                    <small>${fechaLabel}: ${fecha}</small>
                </div>
            </div>
        `;
    }

    function _crearCardFactura(factura) {
        return `
            <div class="kanban-card" data-id="${factura.id}" data-tipo="factura">
                <div class="card-header">
                    <span class="folio">${factura.folio_factura || factura.id.slice(-6)}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${factura.cliente || 'Cliente'}</div>
                    <div class="total">$${(factura.total || 0).toFixed(2)}</div>
                </div>
                <div class="card-footer">
                    <small>${factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString() : ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(pendientes, emitidas) {
        const tbody = document.getElementById('facturacionTableBody');
        if (!tbody) return;
        let html = '';

        pendientes.forEach(o => {
            const fecha = o.fecha_reparacion ? new Date(o.fecha_reparacion).toLocaleDateString() : '—';
            const folio = o.folio || o.id.slice(-6);
            const cliente = o.cliente_nombre || 'N/A';
            const tipo = o.tipoOrigen === 'taller' ? 'Laboratorio' : (o.tipoOrigen === 'motor' ? 'Motor' : 'Automatización');
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(o);
            const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';
            html += `
                <tr class="${enCuarentena ? 'row-cuarentena' : ''}" onclick="facturacionModule._abrirDetalle('${o.id}', '${o.tipoOrigen}')">
                    <td><span class="tipo-badge tipo-${o.tipoOrigen}">${tipo}</span></td>
                    <td><strong>${folio}</strong> ${badgeCuarentena}</td>
                    <td>${cliente}</td>
                    <td>${fecha}</td>
                    <td><span class="status-badge status-pendiente">Pendiente</span></td>
                    <td>—</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); facturacionModule._generarFactura('${o.id}', '${o.tipoOrigen}')" ${enCuarentena ? 'disabled' : ''}>
                            <i class="fas fa-file-invoice"></i> Facturar
                        </button>
                    </td>
                </tr>
            `;
        });

        emitidas.forEach(f => {
            html += `
                <tr style="opacity:0.8;" onclick="facturacionModule._verPDF('${f.id}')">
                    <td><span class="tipo-badge tipo-factura">Factura</span></td>
                    <td><strong>${f.folio_factura || 'N/A'}</strong></td>
                    <td>${f.cliente || 'N/A'}</td>
                    <td>${f.fecha_emision ? new Date(f.fecha_emision).toLocaleDateString() : '—'}</td>
                    <td><span class="status-badge status-emitida">Emitida</span></td>
                    <td>$${(f.total || 0).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-success" title="Enviar a COI (cola)" onclick="event.stopPropagation(); facturacionModule._enviarFacturaACoi('${f.id}')">
                            <i class="fas fa-file-invoice"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); facturacionModule._verPDF('${f.id}')">
                            <i class="fas fa-file-pdf"></i> Ver
                        </button>
                    </td>
                </tr>
            `;
        });

        if (html === '') {
            html = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay órdenes listas para facturar.<br><small style="color:#999;">Estados considerados: Reparado, Terminado, Entregado, Listo para facturar</small></td></tr>';
        }
        tbody.innerHTML = html;
    }

    function _renderGrafica(emitidas) {
        const ctx = document.getElementById('facturacionChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const facturadoPorMes = new Array(12).fill(0);

        emitidas.forEach(f => {
            if (f.fecha_emision) {
                const fecha = new Date(f.fecha_emision);
                const mes = fecha.getMonth();
                facturadoPorMes[mes] += f.total || 0;
            }
        });

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Facturación ($)',
                    data: facturadoPorMes,
                    backgroundColor: 'rgba(0,82,204,0.1)',
                    borderColor: '#0052cc',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#0052cc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
            }
        });
    }

    function _pendientesCountForKpis() {
        let t = ordenesTaller.length;
        let m = ordenesMotores.length;
        let p = ordenesProyectos.length;
        if (filtroArea === 'taller_electronica') { m = 0; p = 0; }
        else if (filtroArea === 'taller_motores') { t = 0; p = 0; }
        else if (filtroArea === 'automatizacion') { t = 0; m = 0; }
        return t + m + p;
    }

    function _updateKPIs() {
        const pendientes = _pendientesCountForKpis();

        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();

        let facturasMes = 0;
        let totalFacturadoMes = 0;

        facturas.forEach(f => {
            if (f.fecha_emision) {
                const fecha = new Date(f.fecha_emision);
                if (fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                    facturasMes++;
                    totalFacturadoMes += f.total || 0;
                }
            }
        });

        document.getElementById('kpiPendientes').innerText = pendientes;
        document.getElementById('kpiFacturasMes').innerText = facturasMes;
        document.getElementById('kpiTotalFacturado').innerHTML = `$${totalFacturadoMes.toFixed(2)}`;
        document.getElementById('kpiEmitidas').innerText = facturas.length;
    }

    // ==================== DETALLE DE ORDEN ====================
    async function _abrirDetalle(id, tipo) {
        let orden = null;
        if (tipo === 'taller') orden = ordenesTaller.find(o => o.id === id);
        else if (tipo === 'motor') orden = ordenesMotores.find(o => o.id === id);
        else if (tipo === 'proyecto') orden = ordenesProyectos.find(o => o.id === id);
        else if (tipo === 'factura') return _verPDF(id);
        if (!orden) return;

        ordenSeleccionada = { ...orden, tipo };

        // Obtener datos del cliente desde contactos
        const contacto = _contactoParaOrden(orden);

        // Calcular costos usando el motor
        const resultadoCalculo = await _calcularCostosOrden(orden, contacto);

        _renderDetalleHTML(orden, contacto, resultadoCalculo);

        document.getElementById('detalleModal').classList.add('active');
        document.getElementById('generarFacturaBtn').style.display = 'inline-flex';
        document.getElementById('generarFacturaBtn').onclick = () => _generarFactura(orden.id, tipo);
    }

    async function _calcularCostosOrden(orden, contacto) {
        const sb = _supabase();
        const vacio = { compras: 0, refacciones: 0, mano_obra: 0, viaticos: 0, gastos_fijos: 0, total: 0, precioAntesIVA: 0, iva: 0, desdeBD: false };
        if (!sb) return vacio;

        const _packBd = (costos) => {
            const totalBruto = Number(costos.costo_total) || 0;
            const iv = _ivaDesdeTotalBruto(totalBruto);
            return {
                compras: costos.compras_total || 0,
                refacciones: costos.refacciones_total || 0,
                mano_obra: costos.mano_obra_total || 0,
                viaticos: costos.viaticos_total || 0,
                gastos_fijos: costos.gastos_fijos_total || 0,
                total: iv.total,
                precioAntesIVA: iv.precioAntesIVA,
                iva: iv.iva,
                desdeBD: true
            };
        };

        if (orden.tipoOrigen === 'proyecto') {
            const sub = Number(orden.subtotal) || 0;
            const ivStored = Number(orden.iva) || 0;
            const totStored = Number(orden.total) || 0;
            if (sub > 0 || ivStored > 0 || totStored > 0) {
                const total = totStored > 0 ? totStored : (sub + ivStored);
                const precioAntesIVA = sub > 0 ? sub : (ivStored > 0 ? (total - ivStored) : _ivaDesdeTotalBruto(total).precioAntesIVA);
                const iva = ivStored > 0 ? ivStored : (total - precioAntesIVA);
                return { compras: 0, refacciones: 0, mano_obra: 0, viaticos: 0, gastos_fijos: 0, total, precioAntesIVA, iva, desdeBD: totStored > 0 && sub > 0 };
            }
            const tipos = [orden.orden_tipo || 'proyecto', 'proyecto', 'automatizacion'];
            for (let i = 0; i < tipos.length; i++) {
                const ot = tipos[i];
                const { data: costos } = await sb.from('costos_por_orden').select('*').eq('orden_id', orden.id).eq('orden_tipo', ot).maybeSingle();
                if (costos && Number(costos.costo_total) > 0) return _packBd(costos);
            }
            const raw = Number(orden.costo_total) || Number(orden.costo_presupuestado) || 0;
            if (raw > 0) {
                const iv = _ivaDesdeTotalBruto(raw);
                return { compras: 0, refacciones: 0, mano_obra: 0, viaticos: 0, gastos_fijos: 0, total: iv.total, precioAntesIVA: iv.precioAntesIVA, iva: iv.iva, desdeBD: false };
            }
            const km = contacto ? ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa) : 0;
            const ce = CostosEngine.calcularPrecioFinal({ km, horasViaje: km > 0 ? Math.ceil(km / 50) : 0, horasTaller: 0, costoRefacciones: 0 });
            return {
                compras: 0,
                refacciones: ce.refacciones || 0,
                mano_obra: ce.manoObra || 0,
                viaticos: ce.gasolinaMasTraslado || 0,
                gastos_fijos: ce.gastosFijos || 0,
                total: ce.total,
                precioAntesIVA: ce.precioAntesIVA,
                iva: ce.iva,
                desdeBD: false
            };
        }

        const ordenTipo = orden.orden_tipo || (orden.tipoOrigen === 'motor' ? 'motor' : 'taller');
        const { data: costos, error } = await sb
            .from('costos_por_orden')
            .select('*')
            .eq('orden_id', orden.id)
            .eq('orden_tipo', ordenTipo)
            .maybeSingle();

        if (!error && costos && Number(costos.costo_total) > 0) {
            return _packBd(costos);
        }

        const km = contacto ? ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa) : 0;
        const horasViaje = km > 0 ? Math.ceil(km / 50) : 0;
        const horasTaller = orden.horas_estimadas || 0;

        let costoRefacciones = 0;
        if (orden.componentes_inventario) {
            orden.componentes_inventario.forEach(comp => {
                costoRefacciones += (comp.costo_unitario || 100) * (comp.cantidad_usada || 0);
            });
        }
        if (orden.componentes_compra) {
            orden.componentes_compra.forEach(comp => {
                costoRefacciones += (comp.costo_unitario || 50) * (comp.cantidad_usada || 0);
            });
        }

        const ce = CostosEngine.calcularPrecioFinal({ km, horasViaje, horasTaller, costoRefacciones });
        return {
            compras: 0,
            refacciones: ce.refacciones || 0,
            mano_obra: ce.manoObra || 0,
            viaticos: ce.gasolinaMasTraslado || 0,
            gastos_fijos: ce.gastosFijos || 0,
            total: ce.total,
            precioAntesIVA: ce.precioAntesIVA,
            iva: ce.iva,
            desdeBD: false
        };
    }

    function _renderDetalleHTML(orden, contacto, calculo) {
        const container = document.getElementById('detalleContenido');
        const fechaReparacion = orden.fecha_reparacion ? new Date(orden.fecha_reparacion).toLocaleString() : '—';
        const rfc = contacto?.rfc || 'XAXX010101000';
        const fechaLabel = orden.tipoOrigen === 'proyecto' ? 'Fecha cierre / actualización' : 'Fecha reparación';

        let html = `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Resumen de la Orden</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><strong>Folio:</strong> ${orden.folio || orden.id.slice(-6)}</div>
                    <div><strong>Cliente:</strong> ${orden.cliente_nombre || 'N/A'}</div>
                    <div><strong>RFC:</strong> ${rfc}</div>
                    <div><strong>${fechaLabel}:</strong> ${fechaReparacion}</div>
                </div>
            </div>
        `;

        const desdeBD = calculo.desdeBD ? '<span style="color:var(--c-exitos); font-size:12px;">✓ Costos reales desde BD</span>' : '<span style="color:var(--c-advertencias); font-size:12px;">⚠ Costos estimados (sin datos en BD)</span>';

        html += `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h4 style="color:var(--c-facturacion); margin:0;">Detalle de Costos</h4>
                    ${desdeBD}
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><strong>Compras:</strong> $${calculo.compras.toFixed(2)}</div>
                    <div><strong>Refacciones:</strong> $${calculo.refacciones.toFixed(2)}</div>
                    <div><strong>Mano de Obra:</strong> $${calculo.mano_obra.toFixed(2)}</div>
                    <div><strong>Viáticos:</strong> $${calculo.viaticos.toFixed(2)}</div>
                    <div><strong>Gastos Fijos:</strong> $${calculo.gastos_fijos.toFixed(2)}</div>
                </div>
                <div style="margin-top:15px; padding-top:15px; border-top:1px dashed var(--border);">
                    <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:800; color:var(--c-facturacion);">
                        <span>TOTAL:</span> <span>$${calculo.total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;

        if (orden.historial && orden.historial.length > 0) {
            html += `
                <div style="background:var(--bg-body); padding:20px; border-radius:12px;">
                    <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Historial</h4>
                    ${orden.historial.slice().reverse().map(h => `
                        <div style="border-bottom:1px solid var(--border); padding:8px 0;">
                            <small style="color:var(--text-muted);">${new Date(h.fecha).toLocaleString()}</small>
                            <div>${h.accion || h.mensaje || ''}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // ==================== GENERACIÓN DE FACTURA ====================
    async function _generarFactura(id, tipo) {
        let orden = null;
        if (tipo === 'taller') orden = ordenesTaller.find(o => o.id === id);
        else if (tipo === 'motor') orden = ordenesMotores.find(o => o.id === id);
        else if (tipo === 'proyecto') orden = ordenesProyectos.find(o => o.id === id);
        if (!orden) return;

        const contacto = _contactoParaOrden(orden);
        const calculo = await _calcularCostosOrden(orden, contacto);

        const folioFactura = `F-${Date.now().toString().slice(-8)}`;
        const fecha = new Date().toISOString();
        const cliente = orden.cliente_nombre || 'Cliente';
        const rfc = contacto?.rfc || 'XAXX010101000';
        const total = calculo.total;
        const uuid = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        const descLine = orden.tipoOrigen === 'proyecto'
            ? `Servicio de automatización (${orden.folio || orden.id.slice(-6)})`
            : `Servicio de reparación (${orden.folio || orden.id.slice(-6)})`;

        const preview = document.getElementById('facturaPreview');
        preview.innerHTML = `
            <div class="factura-header">
                <div class="factura-logo">
                    <h2>SSEPI</h2>
                    <p style="font-size:12px; color:#666;">Soluciones en Sistemas Eléctricos</p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px; color:#666;">FACTURA CFDI 4.0</div>
                    <div style="font-size:18px; font-weight:bold; color:var(--c-facturacion);">${folioFactura}</div>
                </div>
            </div>
            <div class="factura-datos">
                <div>
                    <strong>Emisor:</strong><br>
                    SSEPI AUTOMATIZACIÓN INDUSTRIAL<br>
                    RFC: SSE240317XXX<br>
                    Blvd. Zodiaco 336, Los Limones, León, GTO
                </div>
                <div>
                    <strong>Receptor:</strong><br>
                    ${cliente}<br>
                    RFC: ${rfc}
                </div>
            </div>
            <div style="margin:20px 0;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--c-facturacion); color:white;">
                            <th style="padding:10px; text-align:left;">Cant.</th>
                            <th style="padding:10px; text-align:left;">Descripción</th>
                            <th style="padding:10px; text-align:right;">Precio Unit.</th>
                            <th style="padding:10px; text-align:right;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding:8px; border-bottom:1px solid #ddd;">1</td>
                            <td style="padding:8px; border-bottom:1px solid #ddd;">${descLine}</td>
                            <td style="padding:8px; text-align:right; border-bottom:1px solid #ddd;">$${(calculo.precioAntesIVA).toFixed(2)}</td>
                            <td style="padding:8px; text-align:right; border-bottom:1px solid #ddd;">$${(calculo.precioAntesIVA).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div style="text-align:right; margin-top:20px;">
                <div><strong>Subtotal:</strong> $${(calculo.precioAntesIVA).toFixed(2)}</div>
                <div><strong>IVA 16%:</strong> $${(calculo.iva).toFixed(2)}</div>
                <div style="font-size:18px; font-weight:800; color:var(--c-facturacion);">Total: $${(calculo.total).toFixed(2)}</div>
            </div>
            <div style="margin-top:30px; padding:15px; background:#f5f5f5; border-radius:8px; font-size:11px;">
                <p><strong>UUID:</strong> ${uuid}</p>
                <p><strong>Fecha de timbrado:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Sello digital:</strong> 5OCvBu8CEl2yERjGyZgntfev+Bk=</p>
            </div>
        `;

        document.getElementById('facturaModal').classList.add('active');
        document.getElementById('detalleModal').classList.remove('active');

        document.getElementById('timbrarFacturaBtn').onclick = () => _timbrarFactura(orden, folioFactura, uuid, calculo, contacto);
    }

    async function _timbrarFactura(orden, folioFactura, uuidPrevio, calculo, contacto) {
        // REGLA 2: validar cuarentena antes de timbrar
        if (window.SSEPIStateMachine && window.SSEPIStateMachine.estaEnCuarentena(orden)) {
            alert('La orden está en cuarentena contable. No se puede facturar hasta desbloquearla.');
            return;
        }

        const isLocal = window.location.port === '3333' || window.location.port === '3443' || window.location.hostname.endsWith('.trycloudflare.com') || window.__SSEPI_NEXT_MODE__;
        let uuid = uuidPrevio;
        let xmlTimbrado = '';
        let finkokOk = true;

        // Si estamos en modo SSEPI-NEXT local, timbrar con Finkok real
        if (isLocal) {
            const descLine = orden.tipoOrigen === 'proyecto'
                ? `Servicio de automatizacion (${orden.folio || String(orden.id).slice(-6)})`
                : `Servicio de reparacion (${orden.folio || String(orden.id).slice(-6)})`;
            const payload = {
                receptor: {
                    rfc: (contacto?.rfc || 'XAXX010101000').trim(),
                    nombre: (contacto?.nombre || orden.cliente_nombre || 'PUBLICO EN GENERAL').trim(),
                    domicilio_fiscal: String(contacto?.codigo_postal || contacto?.cp || '00000').trim(),
                    regimen_fiscal: String(contacto?.regimen_fiscal || '616').trim(),
                    uso_cfdi: String(contacto?.uso_cfdi || 'S01').trim()
                },
                conceptos: [{
                    descripcion: descLine,
                    cantidad: 1,
                    valor_unitario: parseFloat(calculo.precioAntesIVA) || 0,
                    clave_prod_serv: '84111506',
                    unidad: 'Servicio',
                    clave_unidad: 'E48'
                }],
                folio: folioFactura
            };
            try {
                const r = await fetch('/api/facturar/timbrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await r.json();
                if (data.exito && data.uuid) {
                    uuid = data.uuid;
                    xmlTimbrado = data.xml_timbrado || '';
                    _addToFeed('✅', `Finkok: UUID ${uuid} recibido`, 'ok');
                } else {
                    finkokOk = false;
                    const errMsg = data.error || 'Finkok no timbro la factura';
                    console.error('[Facturacion] Finkok error:', errMsg, data);
                    alert('Error timbrando con Finkok:\n' + errMsg + '\n\nLa factura se guardara como borrador.');
                    // Guardar como borrador sin UUID real
                }
            } catch (e) {
                finkokOk = false;
                console.error('[Facturacion] Error llamando endpoint Finkok:', e);
                alert('Error de conexion con el timbrador local:\n' + e.message + '\n\nLa factura se guardara como borrador.');
            }
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            // Buscar la venta/cotización vinculada a esta orden
            let ventaVinculada = null;
            try {
                const ventasRelacionadas = await ventasService.select({ orden_origen_id: orden.id }, { pageSize: 10 });
                ventaVinculada = ventasRelacionadas && ventasRelacionadas.length > 0 ? ventasRelacionadas[0] : null;
                if (!ventaVinculada) {
                    const cotizacionesRelacionadas = await cotizacionesService.select({ orden_origen_id: orden.id }, { pageSize: 10 });
                    ventaVinculada = cotizacionesRelacionadas && cotizacionesRelacionadas.length > 0 ? cotizacionesRelacionadas[0] : null;
                }
            } catch (vErr) { console.warn('[Facturacion] No se pudo buscar venta/cotización vinculada:', vErr); }

            const facturaData = {
                folio_factura: folioFactura,
                orden_taller_id: orden.tipoOrigen === 'taller' ? orden.id : null,
                orden_motor_id: orden.tipoOrigen === 'motor' ? orden.id : null,
                venta_id: ventaVinculada?.id || null,
                cliente: orden.cliente_nombre || 'Cliente',
                rfc: contacto?.rfc || 'XAXX010101000',
                fecha_emision: new Date().toISOString(),
                subtotal: calculo.precioAntesIVA,
                iva: calculo.iva,
                total: calculo.total,
                uuid_cfdi: uuid,
                estatus: 'activa',
                pdf_url: '',
                xml_url: xmlTimbrado ? `/facturas_timbradas/${uuid}.xml` : '',
                created_at: new Date().toISOString()
            };
            const facturaRef = await facturasService.insert(facturaData, csrfToken);
            // Encolar para COI (factura timbrada)
            enqueueCoiJob({
                erp_source: 'factura',
                erp_id: String(facturaRef?.id || uuid || folioFactura),
                folio: folioFactura,
                idempotency_key: `factura:${facturaRef?.id || uuid || folioFactura}`,
                payload_json: { ...facturaData, id: facturaRef?.id },
            }).then(r => {
                if (!r.ok) console.warn('[COI queue] Factura no encolada:', r.error?.message || r.error || r);
            });

            // Actualizar la orden de taller/motor/proyecto a "Facturado"
            const updateData = { estado: 'Facturado', factura_id: facturaRef.id, folio_factura: folioFactura, fecha_factura: new Date().toISOString() };
            const sbMeta = window.supabase || _supabase();
            const tipoOrdenSm = orden.tipoOrigen === 'taller' ? 'taller' : (orden.tipoOrigen === 'motor' ? 'motor' : 'proyecto');
            if (orden.tipoOrigen === 'taller') {
                await tallerService.update(orden.id, updateData, csrfToken);
            } else if (orden.tipoOrigen === 'motor') {
                await motoresService.update(orden.id, updateData, csrfToken);
            } else if (orden.tipoOrigen === 'proyecto') {
                const notaFact = `\nFactura ${folioFactura} (${new Date().toISOString().slice(0, 10)})`;
                await proyectosService.update(orden.id, {
                    estado: 'Facturado',
                    notas: ((orden.notas || '') + notaFact).trim()
                }, csrfToken);
            }

            // Registrar evento en historial unificado
            if (window.SSEPIStateMachine && sbMeta) {
                await window.SSEPIStateMachine.actualizarEstadoOrden(
                    sbMeta, tipoOrdenSm, orden.id,
                    'facturacion', `Factura ${folioFactura} emitida. Orden pasó a Facturado.`,
                    csrfToken, { folio_factura: folioFactura, uuid_cfdi: uuid }
                );
            }

            // Actualizar la venta vinculada como facturada
            if (ventaVinculada) {
                try {
                    await ventasService.update(ventaVinculada.id, {
                        facturado: true,
                        uuid_factura: uuid,
                        folio_factura: folioFactura,
                        fecha_factura: new Date().toISOString(),
                        estatus_pago: 'Pagado'
                    }, csrfToken);
                } catch (vUpErr) { console.warn('[Facturacion] No se pudo actualizar venta:', vUpErr); }
            }

            // Registrar ingreso en contabilidad
            await ingresosService.insert({
                folio: folioFactura,
                monto_total: calculo.total,
                iva: calculo.iva,
                subtotal: calculo.precioAntesIVA,
                cliente: orden.cliente_nombre || 'Cliente',
                fecha_pago: new Date().toISOString().split('T')[0],
                tipo_servicio: orden.tipoOrigen === 'proyecto' ? 'automatizacion' : 'reparacion',
                orden_taller_id: orden.tipoOrigen === 'taller' ? orden.id : null,
                orden_motor_id: orden.tipoOrigen === 'motor' ? orden.id : null,
                uuid_cfdi: uuid,
                timestamp: new Date().toISOString()
            }, csrfToken);

            // Notificar a Ventas
            await notificacionesService.insert({
                para: 'ventas',
                tipo: 'factura_generada',
                orden_id: orden.id,
                folio: folioFactura,
                cliente: orden.cliente_nombre || 'Cliente',
                mensaje: `Factura ${folioFactura} generada — lista para entrega`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            alert('✅ Factura timbrada y registrada correctamente');
            document.getElementById('facturaModal').classList.remove('active');
            _addToFeed('✅', `Factura ${folioFactura} generada para ${orden.cliente_nombre || 'Cliente'}`);
            _loadFacturas();
            _loadTaller();
            _loadMotores();
            _loadProyectosFacturacion();
        } catch (error) {
            console.error(error);
            alert('Error al timbrar factura: ' + error.message);
        }
    }

    async function _enviarFacturaACoi(facturaId) {
        const f = (facturas || []).find(x => x.id === facturaId);
        if (!f) { alert('Factura no encontrada.'); return; }
        try {
            const payload = { ...f };
            const r = await enqueueCoiJob({
                erp_source: 'factura',
                erp_id: String(f.id || f.uuid_cfdi || f.folio_factura),
                folio: f.folio_factura || null,
                idempotency_key: `factura:${f.id || f.uuid_cfdi || f.folio_factura}`,
                payload_json: payload
            });
            if (!r.ok) throw (r.error || new Error('No se pudo encolar'));
            alert('✅ Enviada a COI (cola).');
        } catch (e) {
            alert('Error: ' + (e?.message || e));
        }
    }

    function _verPDF(id) {
        alert('Funcionalidad: Visualizar PDF de factura (pendiente implementación)');
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-facturacion);">FACTURACIÓN</span><span>${new Date().toLocaleTimeString()}</span></div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('closeDetalleModal').addEventListener('click', () => {
            document.getElementById('detalleModal').classList.remove('active');
        });
        document.getElementById('closeFacturaModal').addEventListener('click', () => {
            document.getElementById('facturaModal').classList.remove('active');
        });

        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            filtroEstado = document.getElementById('filtroEstado').value;
            const fa = document.getElementById('filtroArea');
            filtroArea = fa ? fa.value : 'todos';
            filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _aplicarFiltros();
        });

        document.getElementById('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _aplicarFiltros();
        });
        document.getElementById('vistaLista').addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _aplicarFiltros();
        });
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
            _aplicarFiltros();
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

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirDetalle,
        _generarFactura,
        _verPDF,
        _enviarFacturaACoi
    };
})();

window.facturacionModule = FacturacionModule;