// ================================================
// ARCHIVO: compras.js
// DESCRIPCIÓN: Módulo de Compras adaptado a Supabase
// BASADO EN: compras-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de órdenes de compra, proveedores, vinculación con talleres
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { notifyCompraIfEligible } from '../core/coi-sync-engine.js';
import { mergePriorityProvidersFirst } from '../core/ssepi-runtime/priority-suppliers-merge.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';
import { filterOrdenesOperativas } from '../core/ssepi-runtime/lab-order-filter.js';

const ComprasModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let compras = [];
    let proveedores = [];
    /** Proveedores para UI (select + tarjetas): catálogo prioridad + resto. */
    let proveedoresVista = [];
    let contactos = [];
    let ordenesTaller = [];
    let ordenesMotores = [];
    let proyectos = [];
    /** Pestaña activa en el panel Laboratorio / Motores / Automatización */
    let operativasTabCompras = 'taller';
    let currentCompra = null;
    let compraId = null;
    let isNewCompra = true;

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroDepartamento = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    // Servicios de datos
    const comprasService = createDataService('compras');
    const contactosService = createDataService('contactos');
    const tallerService = createDataService('ordenes_taller');
    const motoresService = createDataService('ordenes_motores');
    const proyectosService = createDataService('proyectos_automatizacion');
    const notificacionesService = createDataService('notificaciones');
    const comprasItemsService = createDataService('compras_items');
    const cotizacionesService = createDataService('cotizaciones');

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];
    let perfilUsuario = null;

    function _esAdmin() {
        return perfilUsuario && (perfilUsuario.ver_costos || ['admin','superadmin','contabilidad'].includes(perfilUsuario.rol));
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Compras] Conectado');
        try { perfilUsuario = await authService.getCurrentProfile(); } catch(e) {}
        _bindEvents();
        await _initUI();
        try {
            await _loadInitialData();
        } catch (e) {
            console.warn('[Compras] Carga inicial falló:', e);
        }
        _startClock();
        _setupRealtime();
        _bindOperativasComprasPanel();
        _renderOperativasComprasList();
        setTimeout(_consumeVinculacionUrlParams, 500);
        console.log('✅ Módulo compras iniciado');
        _initExportButton();
    }

    async function _initUI() {
        try {
            const savedTheme = localStorage.getItem('theme');
            const themeBtn = document.getElementById('themeBtn');
            if (savedTheme === 'dark') {
                document.body.setAttribute('data-theme', 'dark');
                if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
            } else {
                document.body.removeAttribute('data-theme');
                if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
            }
        } catch (e) {
            console.warn('[Compras] _initUI:', e);
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
                    { key: 'proveedor', label: 'Proveedor' },
                    { key: 'departamento', label: 'Departamento' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'total', label: 'Total' },
                    { key: 'fecha_solicitud', label: 'Fecha Solicitud' },
                    { key: 'fecha_entrega', label: 'Fecha Entrega' },
                    { key: 'urgencia', label: 'Urgencia' }
                ];
                downloadCSV('compras_' + new Date().toISOString().slice(0,10) + '.csv', compras, headers);
            });
        } catch (e) { console.warn('[Compras] Export CSV init:', e); }
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

    /** Desde Contabilidad: ?desde=&hasta=&departamento= */
    function _applyUrlQueryFilters() {
        const p = new URLSearchParams(window.location.search);
        const desde = p.get('desde');
        const hasta = p.get('hasta');
        const dep = p.get('departamento');
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
        if (dep) {
            const sel = document.getElementById('filtroDepartamento');
            if (sel && [...sel.options].some(o => o.value === dep)) {
                filtroDepartamento = dep;
                sel.value = dep;
            }
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

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        await Promise.all([
            _loadCompras(),
            _loadProveedores(),
            _loadContactos(),
            _loadTaller(),
            _loadMotores(),
            _loadProyectos()
        ]);
        _rebuildProveedoresVista();
        _populateProveedoresSelect();
        _renderProveedores();
    }

    async function _loadCompras() {
        try {
            compras = await comprasService.select({}, { orderBy: 'created_at', ascending: false, page: 0, pageSize: 500 });
        } catch (e) {
            console.warn('[Compras] Error cargando compras:', e);
            compras = [];
        }
        _applyFilters();
    }

    async function _loadProveedores() {
        proveedores = await contactosService.select({ tipo: 'provider' }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 });
    }

    async function _loadContactos() {
        contactos = await contactosService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 3000 });
    }

    function _rebuildProveedoresVista() {
        proveedoresVista = mergePriorityProvidersFirst(contactos && contactos.length ? contactos : proveedores, 'taller');
    }

    async function _loadTaller() {
        const raw = await tallerService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 });
        ordenesTaller = filterOrdenesOperativas(raw || []);
        _renderOperativasComprasList();
    }

    async function _loadMotores() {
        ordenesMotores = await motoresService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 });
        _renderOperativasComprasList();
    }

    async function _loadProyectos() {
        proyectos = await proyectosService.select({}, { orderBy: 'fecha', ascending: false, page: 0, pageSize: 800 });
        _renderOperativasComprasList();
    }

    function _populateProveedoresSelect() {
        const select = document.getElementById('proveedorSelect');
        if (!select) return;
        const prev = select.value;
        select.innerHTML = '<option value="">Seleccionar proveedor</option>';
        proveedoresVista.forEach(p => {
            const label = (p.nombre || p.empresa || '').trim();
            if (!label) return;
            const opt = document.createElement('option');
            opt.value = label;
            const hint = p.puesto ? ' · ' + p.puesto : '';
            opt.textContent = label + hint;
            select.appendChild(opt);
        });
        if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
    }

    function _renderProveedores() {
        const container = document.getElementById('proveedoresContainer');
        if (!container) return;
        if (proveedoresVista.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">No hay proveedores registrados</div>';
            return;
        }
        const esc = (s) => {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        };
        const top = proveedoresVista.slice(0, 6);
        container.innerHTML = top.map(p => {
            const idRaw = p.id != null ? String(p.id) : '';
            const idAttr = esc(idRaw);
            return `
            <div class="proveedor-card">
                <div class="proveedor-header">
                    <span class="proveedor-nombre">${esc(p.nombre || p.empresa)}</span>
                    <span class="proveedor-rfc">${esc(p.rfc || '')}</span>
                </div>
                <div class="proveedor-contacto">${esc(p.contacto || p.puesto || '')}</div>
                <div class="proveedor-email">${esc(p.email || '')}</div>
                <div class="proveedor-acciones">
                    <button type="button" class="btn btn-sm btn-secondary" data-prov-id="${idAttr}">Ver</button>
                </div>
            </div>
        `;
        }).join('');
        container.querySelectorAll('[data-prov-id]').forEach(btn => {
            btn.addEventListener('click', () => _verProveedor(btn.getAttribute('data-prov-id')));
        });
    }


    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        const subCompras = supabase
            .channel('compras_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                _loadCompras();
                _addToFeed('📦', 'Datos de compras actualizados');
                if (payload.new && payload.eventType !== 'DELETE') {
                    notifyCompraIfEligible(payload.new, payload.old);
                }
            })
            .subscribe();
        subscriptions.push(subCompras);

        const subProveedores = supabase
            .channel('contactos_proveedores')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, async () => {
                await _loadProveedores();
                await _loadContactos();
                _rebuildProveedoresVista();
                _populateProveedoresSelect();
                _renderProveedores();
            })
            .subscribe();
        subscriptions.push(subProveedores);

        const subNotificaciones = supabase
            .channel('compras_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.compras' }, payload => {
                _addToFeed('🔔', payload.new?.mensaje || 'Nueva notificación');
                _loadCompras();
                _loadTaller();
                _loadMotores();
            })
            .subscribe();
        subscriptions.push(subNotificaciones);

        // Realtime para orden_historial: refrescar cuando órdenes cambien de estado
        const subHistorial = supabase
            .channel('compras_historial_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orden_historial' }, payload => {
                const ev = payload.new;
                if (ev.evento === 'cambio_estado' || ev.evento === 'creacion' || ev.evento === 'compra_vinculada') {
                    _loadCompras();
                    _loadTaller();
                    _loadMotores();
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = compras;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(c => {
                const f = new Date(c.fecha_creacion);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroDepartamento !== 'todos') {
            filtered = filtered.filter(c => c.departamento === filtroDepartamento);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(c => c.estado === parseInt(filtroEstado));
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(c => 
                (c.folio && c.folio.toLowerCase().includes(term)) ||
                (c.proveedor && c.proveedor.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _renderKanban(ordenes) {
        const esAdminC = _esAdmin();
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const estados = [
            { num: 0, label: 'Borrador', color: '#9e9e9e' },
            { num: 1, label: 'Solicitud', color: '#ff9800' },
            { num: 2, label: 'Cotización', color: '#2196f3' },
            { num: 3, label: 'Confirmada', color: '#4caf50' },
            { num: 4, label: 'Recibida', color: '#9c27b0' },
            { num: 5, label: 'Entregada', color: '#607d8b' }
        ];
        let html = '';
        estados.forEach(estado => {
            const filtrados = ordenes.filter(c => c.estado === estado.num);
            html += `
                <div class="kanban-column">
                    <div class="kanban-header" style="border-bottom-color: ${estado.color};">
                        <span>${estado.label}</span>
                        <span class="badge" style="background: ${estado.color};">${filtrados.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${filtrados.map(c => _crearCardKanban(c, esAdminC)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id));
        });
    }

    function _crearCardKanban(compra, esAdminC) {
        const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(compra);
        const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';
        return `
            <div class="kanban-card ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${compra.id}">
                <div class="card-header">
                    <span class="folio">${compra.folio || compra.id.slice(-6)}</span>
                    ${badgeCuarentena}
                </div>
                <div class="card-body">
                    <div class="proveedor">${compra.proveedor || 'Proveedor'}</div>
                    ${esAdminC ? `<div class="total">$${(compra.total || 0).toFixed(2)}</div>` : ''}
                </div>
                <div class="card-footer">
                    <small>${compra.fecha_requerida ? new Date(compra.fecha_requerida).toLocaleDateString() : ''}</small>
                    <small>${compra.departamento || ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(ordenes) {
        const esAdminC = _esAdmin();
        const tbody = document.getElementById('comprasTableBody');
        if (!tbody) return;
        if (ordenes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No hay órdenes</td></tr>';
            return;
        }
        tbody.innerHTML = ordenes.map(c => {
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(c);
            const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';
            return `
            <tr class="${enCuarentena ? 'row-cuarentena' : ''}" onclick="comprasModule._abrirDetalle('${c.id}')">
                <td><strong>${c.folio || c.id.slice(-6)}</strong> ${badgeCuarentena}</td>
                <td>${c.proveedor || '—'}</td>
                <td>${c.departamento || '—'}</td>
                <td>${c.vinculacion ? `<span style="color:#0369a1;font-weight:600;">${c.vinculacion.folio_taller || c.vinculacion.folio || ''}</span>` : '—'}</td>
                <td>${esAdminC ? '$' + (c.total || 0).toFixed(2) : '—'}</td>
                <td><span class="status-badge estado-${c.estado}">${_getEstadoLabel(c.estado)}</span></td>
            </tr>
            `;
        }).join('');
    }

    function _getEstadoLabel(estado) {
        const labels = { 0: 'Borrador', 1: 'Solicitud', 2: 'Cotización', 3: 'Confirmada', 4: 'Recibida', 5: 'Entregada' };
        return labels[estado] || 'Desconocido';
    }

    // ==================== RECIBIR COMPRA ====================
    async function _recibirCompra(compraId) {
        const compra = compras.find(c => c.id === compraId);
        if (!compra) { _showToast('Compra no encontrada', 'error'); return; }

        // REGLA 2: validar cuarentena antes de recibir
        if (window.SSEPIStateMachine && window.SSEPIStateMachine.estaEnCuarentena(compra)) {
            _showToast('Compra en cuarentena contable. No se puede recibir.', 'error');
            return;
        }

        if (!confirm('¿Confirmar recepción de materiales? Esta acción actualizará el inventario.')) return;

        const csrfToken = sessionStorage.getItem('csrfToken');
        const profile = await authService.getCurrentProfile();
        const usuarioId = profile?.usuarios_id || profile?.id;

        try {
            const { error } = await window.supabase.rpc('recibir_compra', {
                p_compra_id: compraId,
                p_usuario_id: usuarioId
            });

            if (error) throw error;

            _showToast('✅ Compra recibida. Inventario actualizado.', 'success');
            // H13: Notificar a Laboratorio si la compra estaba vinculada
            if (compra.vinculacion && compra.vinculacion.tipo === 'taller' && compra.vinculacion.id) {
                try {
                    const ordenId = compra.vinculacion.id;
                    const folio = compra.folio || compraId;
                    await notificacionesService.insert({
                        para: 'admin',
                        tipo: 'compra_autorizada',
                        compra_id: compraId,
                        folio,
                        orden_id: ordenId,
                        mensaje: `Compra ${folio} autorizada/recibida. Materiales listos para Laboratorio.`,
                        leido: false,
                        fecha: new Date().toISOString()
                    });
                    const historialService = createDataService('orden_historial');
                    await historialService.insert({
                        orden_id: ordenId,
                        evento: 'compra_autorizada',
                        descripcion: `Compra #${folio} autorizada/recibida. Materiales disponibles.`,
                        usuario: profile?.nombre || 'Sistema',
                        fecha: new Date().toISOString()
                    });
                } catch (h13Err) {
                    console.warn('[Compras] H13 notificación error:', h13Err);
                }
            }
            await _loadCompras();
            _abrirDetalle(compraId);
        } catch (error) {
            console.error('[Compras] Error al recibir:', error);
            _showToast('Error: ' + error.message, 'error');
        }
    }

    async function _descargarOC() {
        const compra = currentCompra;
        if (!compra) { _showToast('No hay compra seleccionada', 'error'); return; }
        try {
            // Cargar plantilla OC.xlsx desde el servidor
            const resp = await fetch('/excel/OC.xlsx');
            if (!resp.ok) throw new Error('No se pudo cargar la plantilla OC.xlsx');
            const arrayBuffer = await resp.arrayBuffer();
            const wb = XLSX.read(arrayBuffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];

            // Llenar datos del encabezado
            // F1 C5 = FOLIO
            if (!ws['E1']) ws['E1'] = {};
            ws['E1'].v = compra.folio || '';
            ws['E1'].t = 's';

            // F9 C2 = Numero de orden, F9 C6 = Fecha
            if (!ws['B9']) ws['B9'] = {};
            ws['B9'].v = compra.folio || '';
            ws['B9'].t = 's';
            if (!ws['F9']) ws['F9'] = {};
            ws['F9'].v = compra.created_at ? new Date(compra.created_at).toLocaleDateString('es-MX') : '';
            ws['F9'].t = 's';

            // F12 C2 = Servicio/Departamento
            if (!ws['B12']) ws['B12'] = {};
            ws['B12'].v = compra.departamento || '';
            ws['B12'].t = 's';

            // Llenar items (filas 14-29 = max 16 items)
            const items = currentCompra.itemsData || compra.items || [];
            for (let i = 0; i < Math.min(items.length, 16); i++) {
                const item = items[i];
                const row = 14 + i;
                // N.º
                if (!ws['A' + row]) ws['A' + row] = {};
                ws['A' + row].v = i + 1;
                ws['A' + row].t = 'n';
                // Descripción
                if (!ws['B' + row]) ws['B' + row] = {};
                ws['B' + row].v = item.descripcion || '';
                ws['B' + row].t = 's';
                // Cantidad
                if (!ws['C' + row]) ws['C' + row] = {};
                ws['C' + row].v = Number(item.cantidad || 0);
                ws['C' + row].t = 'n';
                // Costo USD
                if (!ws['D' + row]) ws['D' + row] = {};
                ws['D' + row].v = Number(item.costo_unitario || 0);
                ws['D' + row].t = 'n';
                // Costo MNX (si existe)
                if (!ws['E' + row]) ws['E' + row] = {};
                ws['E' + row].v = Number(item.costo_unitario_mxn || item.costo_unitario || 0);
                ws['E' + row].t = 'n';
                // Total (cantidad * costo)
                if (!ws['F' + row]) ws['F' + row] = {};
                ws['F' + row].v = Number(item.costo_total || (item.cantidad * item.costo_unitario) || 0);
                ws['F' + row].t = 'n';
            }

            // Subtotal fila 30 col F
            if (!ws['F30']) ws['F30'] = {};
            ws['F30'].v = Number(compra.subtotal || compra.total || 0);
            ws['F30'].t = 'n';

            // Impuesto fila 31 col F
            if (!ws['F31']) ws['F31'] = {};
            const iva = Number(compra.iva || compra.impuesto || (compra.total * 0.16) || 0);
            ws['F31'].v = iva;
            ws['F31'].t = 'n';

            // Total fila 32 col F
            if (!ws['F32']) ws['F32'] = {};
            ws['F32'].v = Number(compra.total || 0);
            ws['F32'].t = 'n';

            // Comentarios fila 34 col A
            if (!ws['A34']) ws['A34'] = {};
            ws['A34'].v = compra.notas || compra.comentarios || '';
            ws['A34'].t = 's';

            // Descargar
            XLSX.writeFile(wb, `OC_${compra.folio || compra.id}.xlsx`);
            _showToast('OC descargada correctamente', 'success');
        } catch (e) {
            console.error('[Compras] Error descargando OC:', e);
            _showToast('Error al descargar OC: ' + e.message, 'error');
        }
    }

    function _renderGrafica(ordenes) {
        const canvas = document.getElementById('comprasChart');
        if (!canvas) return;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const estados = [0, 1, 2, 3, 4, 5];
        const counts = estados.map(e => ordenes.filter(c => c.estado === e).length);
        try {
            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Borrador', 'Solicitud', 'Cotización', 'Confirmada', 'Recibida', 'Entregada'],
                    datasets: [{
                        label: 'Órdenes por estado',
                        data: counts,
                        backgroundColor: ['#ff9800', '#2196f3', '#4caf50', '#9c27b0', '#607d8b']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        } catch (e) {
            console.warn('[Compras] Error al dibujar gráfica:', e);
        }
    }

    function _updateKPIs(ordenes) {
        const esAdminC = _esAdmin();
        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();
        let totalMes = 0;
        ordenes.forEach(c => {
            const fecha = c.fecha_creacion ? new Date(c.fecha_creacion) : null;
            if (fecha && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                totalMes += c.total || 0;
            }
        });
        document.getElementById('kpiComprasMes').innerHTML = esAdminC ? `$${totalMes.toFixed(2)}` : '—';
        document.getElementById('kpiPendientes').innerText = ordenes.filter(c => c.estado < 4).length;
        document.getElementById('kpiCompletadas').innerText = ordenes.filter(c => c.estado === 5).length;
        document.getElementById('kpiProveedores').innerText = proveedores.length;
    }

    // ==================== DETALLE DE ORDEN ====================
    async function _abrirDetalle(id) {
        const compra = compras.find(c => c.id === id);
        if (!compra) return;
        currentCompra = compra;
        compraId = id;
        isNewCompra = false;
        const modal = document.getElementById('detalleModal');
        const contenido = document.getElementById('detalleContenido');
        contenido.innerHTML = '<div style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i><p>Cargando...</p></div>';
        document.getElementById('editarOrdenBtn').style.display = 'inline-flex';
        document.getElementById('editarOrdenBtn').onclick = () => _editarOrden(id);

        // Cargar items desde tabla compras_items
        const { data: itemsData } = await window.supabase
            .from('compras_items')
            .select('*')
            .eq('compra_id', id)
            .order('created_at', { ascending: true });

        currentCompra.itemsData = itemsData || [];

        const html = await _generarDetalleHTML(compra);
        contenido.innerHTML = html;
        modal.classList.add('active');
    }

    async function _generarDetalleHTML(compra) {
        const esAdminC = _esAdmin();
        // Obtener estatus de la orden operativa vinculada
        let estatusOrden = null;
        if (compra.vinculacion) {
            try {
                if (compra.vinculacion.tipo === 'taller') {
                    const { data: ordenTaller } = await window.supabase
                        .from('ordenes_taller')
                        .select('folio, estado, cliente_nombre, equipo')
                        .eq('id', compra.vinculacion.id)
                        .single();
                    if (ordenTaller) {
                        estatusOrden = {
                            modulo: 'Laboratorio',
                            folio: ordenTaller.folio,
                            estado: ordenTaller.estado,
                            cliente: ordenTaller.cliente_nombre,
                            equipo: ordenTaller.equipo
                        };
                    }
                } else if (compra.vinculacion.tipo === 'motor') {
                    const { data: ordenMotores } = await window.supabase
                        .from('ordenes_motores')
                        .select('folio, estado, cliente_nombre, motor')
                        .eq('id', compra.vinculacion.id)
                        .single();
                    if (ordenMotores) {
                        estatusOrden = {
                            modulo: 'Motores',
                            folio: ordenMotores.folio,
                            estado: ordenMotores.estado,
                            cliente: ordenMotores.cliente_nombre,
                            equipo: ordenMotores.motor
                        };
                    }
                } else if (compra.vinculacion.tipo === 'proyecto' || compra.vinculacion.tipo === 'automatizacion') {
                    const { data: proyecto } = await window.supabase
                        .from('proyectos_automatizacion')
                        .select('folio, estado, cliente, nombre')
                        .eq('id', compra.vinculacion.id)
                        .single();
                    if (proyecto) {
                        estatusOrden = {
                            modulo: compra.vinculacion.tipo === 'automatizacion' ? 'Automatización' : 'Proyectos',
                            folio: proyecto.folio,
                            estado: proyecto.estado,
                            cliente: proyecto.cliente,
                            equipo: proyecto.nombre
                        };
                    }
                }
            } catch (e) {
                console.warn('[Compras] Error obteniendo estatus de orden vinculada:', e);
            }
        }

        const clienteInfo = (compra.data && compra.data.cliente_info) ? compra.data.cliente_info : null;
        const itemsProveedor = (currentCompra.itemsData || []).filter(i => i.link_proveedor);
        const itemsInventario = (currentCompra.itemsData || []).filter(i => !i.link_proveedor);

        return `
            <div class="detalle-section">
                <h4>Información General</h4>
                <div class="detalle-grid">
                    <div><strong>Folio:</strong> ${compra.folio}</div>
                    <div><strong>Proveedor:</strong> ${compra.proveedor || 'PENDIENTE'}</div>
                    <div><strong>Departamento:</strong> ${compra.departamento}</div>
                    <div><strong>Fecha Requerida:</strong> ${compra.fecha_requerida ? new Date(compra.fecha_requerida).toLocaleDateString() : '—'}</div>
                    <div><strong>Prioridad:</strong> ${compra.prioridad || 'Normal'}</div>
                    <div><strong>Estado:</strong> ${_getEstadoLabel(compra.estado)}</div>
                    <div><strong>Tipo de Orden:</strong> ${(compra.data && compra.data.orden_tipo) || 'sencilla'}</div>
                    <div><strong>BOM Generado:</strong> ${(compra.data && compra.data.fecha_generacion_bom) || '—'}</div>
                    <div><strong>Esperada Llegada:</strong> ${(compra.data && compra.data.fecha_esperada_llegada) || '—'}</div>
                </div>
                <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="comprasModule._descargarOC()" class="btn-ssepi btn-compras" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-excel"></i> Descargar OC
                    </button>
                    <button onclick="comprasModule._generarPDFCompra(true)" class="btn-ssepi btn-compras" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-eye"></i> Ver PDF
                    </button>
                    <button onclick="comprasModule._generarPDFCompra(false)" class="btn-ssepi btn-compras" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-download"></i> Descargar PDF
                    </button>
                    ${(compra.departamento === 'Suministro' || compra.vinculacion?.tipo === 'cotizacion_suministro') && !compra.confirmado_ventas ? `
                    <button onclick="comprasModule._enviarAVentas('${compra.id}')" class="btn-ssepi btn-ventas" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-paper-plane"></i> Enviar a Ventas
                    </button>` : ''}
                </div>
            </div>
            ${compra.vinculacion ? `
            <div class="detalle-section">
                <h4>Vinculación con Orden Operativa</h4>
                <div class="detalle-grid">
                    <div><strong>Módulo:</strong> ${compra.vinculacion.tipo}</div>
                    <div><strong>Folio Origen:</strong> <span style="color:#0369a1;font-weight:600;">${compra.vinculacion.folio_taller || compra.vinculacion.folio || ''}</span></div>
                    <div><strong>Cliente/Orden:</strong> ${compra.vinculacion.nombre || ''}</div>
                </div>
                ${clienteInfo ? `
                <div style="margin-top: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <div style="color: #475569; font-weight: 600; margin-bottom: 8px;"><i class="fas fa-user"></i> Información del Cliente</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                        <div><strong>Nombre:</strong> ${clienteInfo.nombre || '—'}</div>
                        <div><strong>RFC:</strong> ${clienteInfo.rfc || '—'}</div>
                        <div><strong>Teléfono:</strong> ${clienteInfo.telefono || '—'}</div>
                        <div><strong>Email:</strong> ${clienteInfo.email || '—'}</div>
                        <div><strong>Dirección:</strong> ${clienteInfo.direccion || '—'}</div>
                        <div><strong>CP:</strong> ${clienteInfo.cp || '—'}</div>
                    </div>
                </div>` : ''}
                ${estatusOrden ? `
                <div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;">
                    <div style="color: #0369a1; font-weight: 600; margin-bottom: 8px;">
                        <i class="fas fa-${estatusOrden.modulo === 'Laboratorio' ? 'microchip' : estatusOrden.modulo === 'Motores' ? 'industry' : 'robot'}"></i>
                        Estatus en ${estatusOrden.modulo}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                        <div><strong>Folio:</strong> ${estatusOrden.folio}</div>
                        <div><strong>Estado:</strong> <span style="color: ${estatusOrden.estado === 'Entregado' ? '#059669' : '#d97706'}">${estatusOrden.estado}</span></div>
                        <div><strong>Cliente:</strong> ${estatusOrden.cliente}</div>
                        <div><strong>Equipo/Proyecto:</strong> ${estatusOrden.equipo}</div>
                    </div>
                </div>
                ` : '<div style="margin-top: 12px; color: #666; font-size: 13px;"><em>No se pudo obtener el estatus de la orden vinculada</em></div>'}
            </div>
            ` : ''}
            <div class="detalle-section">
                <h4><i class="fas fa-truck"></i> Materiales de Proveedores (${itemsProveedor.length})</h4>
                <table class="items-table">
                    <thead><tr><th>Producto</th><th>Cant.</th><th>Recibido</th><th>Facturado</th>${esAdminC ? '<th>Precio Unit.</th><th>Impuestos (16%)</th>' : ''}<th>Desc.%</th>${esAdminC ? '<th>Importe</th>' : ''}</tr></thead>
                    <tbody>
                        ${itemsProveedor.length ? itemsProveedor.map(item => {
                            const pu = Number(item.costo_unitario) || 0;
                            const qty = Number(item.cantidad) || 0;
                            const desc = Number(item.descuento_pct) || 0;
                            const base = pu * qty;
                            const descMonto = base * (desc / 100);
                            const sub = base - descMonto;
                            const iva = sub * 0.16;
                            const totalItem = sub + iva;
                            return `
                            <tr>
                                <td>${item.nombre || item.descripcion || '—'}</td>
                                <td>${qty}</td>
                                <td>${compra.estado >= 4 ? '✅ ' + (compra.fecha_recepcion ? new Date(compra.fecha_recepcion).toLocaleDateString() : '') : '—'}</td>
                                <td>${compra.estado >= 5 ? '✅' : '—'}</td>
                                ${esAdminC ? `<td>$${pu.toFixed(2)}</td><td>$${iva.toFixed(2)}</td>` : ''}
                                <td>${desc > 0 ? desc + '%' : '—'}</td>
                                ${esAdminC ? `<td>$${totalItem.toFixed(2)}</td>` : ''}
                            </tr>`;
                        }).join('') : `<tr><td colspan="${esAdminC ? 8 : 4}">No hay materiales de proveedores</td></tr>`}
                    </tbody>
                </table>
            </div>
            <div class="detalle-section">
                <h4><i class="fas fa-warehouse"></i> Materiales de Inventario (${itemsInventario.length})</h4>
                <table class="items-table">
                    <thead><tr><th>Producto</th><th>Cant.</th><th>Recibido</th><th>Facturado</th>${esAdminC ? '<th>Precio Unit.</th><th>Impuestos (16%)</th>' : ''}<th>Desc.%</th>${esAdminC ? '<th>Importe</th>' : ''}</tr></thead>
                    <tbody>
                        ${itemsInventario.length ? itemsInventario.map(item => {
                            const pu = Number(item.costo_unitario) || 0;
                            const qty = Number(item.cantidad) || 0;
                            const desc = Number(item.descuento_pct) || 0;
                            const base = pu * qty;
                            const descMonto = base * (desc / 100);
                            const sub = base - descMonto;
                            const iva = sub * 0.16;
                            const totalItem = sub + iva;
                            return `
                            <tr>
                                <td>${item.nombre || item.descripcion || '—'}</td>
                                <td>${qty}</td>
                                <td>${compra.estado >= 4 ? '✅ ' + (compra.fecha_recepcion ? new Date(compra.fecha_recepcion).toLocaleDateString() : '') : '—'}</td>
                                <td>${compra.estado >= 5 ? '✅' : '—'}</td>
                                ${esAdminC ? `<td>$${pu.toFixed(2)}</td><td>$${iva.toFixed(2)}</td>` : ''}
                                <td>${desc > 0 ? desc + '%' : '—'}</td>
                                ${esAdminC ? `<td>$${totalItem.toFixed(2)}</td>` : ''}
                            </tr>`;
                        }).join('') : `<tr><td colspan="${esAdminC ? 8 : 4}">No hay materiales de inventario</td></tr>`}
                    </tbody>
                </table>
                ${esAdminC ? `<div class="total-final">
                    <div><strong>Subtotal:</strong> $${(compra.subtotal || (compra.total ? compra.total / 1.16 : 0)).toFixed(2)}</div>
                    <div><strong>IVA (16%):</strong> $${(compra.iva || (compra.total ? compra.total - (compra.total / 1.16) : 0)).toFixed(2)}</div>
                    ${compra.descuento_general > 0 ? `<div><strong>Descuento general (${compra.descuento_general}%):</strong> -$${((compra.total || 0) * (compra.descuento_general / 100)).toFixed(2)}</div>` : ''}
                    <div style="font-size:18px; margin-top:8px;"><strong>TOTAL:</strong> $${(compra.total || 0).toFixed(2)}</div>
                </div>` : ''}
            </div>
            ${compra.pasos ? `
            <div class="detalle-section">
                <h4>Historial de Pasos</h4>
                ${compra.pasos.map(paso => `
                    <div class="paso-item">
                        <div><strong>Paso ${paso.paso}:</strong> ${new Date(paso.fecha).toLocaleString()}</div>
                        <div>${paso.accion} por ${paso.usuario}</div>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            ${compra.estado < 4 ? `
            <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;">
                <h4 style="color: #166534; margin-bottom: 12px;">📦 Recepción de Materiales</h4>
                <p style="color: #15803d; font-size: 14px; margin-bottom: 12px;">Confirma que todos los materiales han llegado y están en buen estado.</p>
                <button onclick="comprasModule._recibirCompra('${compra.id}')"
                    style="background: #16a34a; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    ✅ Confirmar Recepción
                </button>
            </div>
            ` : ''}
        `;
    }

    async function _editarOrden(id) {
        const compra = compras.find(c => c.id === id) || currentCompra;
        if (!compra) { _showToast('Orden no encontrada', 'error'); return; }

        // Cerrar modal de detalle
        document.getElementById('detalleModal').classList.remove('active');

        // Abrir modal de nueva orden
        const modal = document.getElementById('nuevaOrdenModal');
        const title = modal.querySelector('.modal-title');
        if (title) title.innerHTML = '<i class="fas fa-edit"></i> Editar Orden de Compra';

        isNewCompra = false;
        currentCompra = compra;
        compraId = id;

        // Rellenar campos
        document.getElementById('proveedorSelect').value = compra.proveedor || '';
        document.getElementById('departamentoSelect').value = compra.departamento || 'Laboratorio de Electrónica';
        document.getElementById('fechaRequerida').value = compra.fecha_requerida ? compra.fecha_requerida.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('prioridadSelect').value = compra.prioridad || 'Normal';
        document.getElementById('ordenTipoSelect').value = (compra.data && compra.data.orden_tipo) || 'sencilla';
        document.getElementById('fechaGeneracionBom').value = (compra.data && compra.data.fecha_generacion_bom) || '';
        document.getElementById('fechaEsperadaLlegada').value = (compra.data && compra.data.fecha_esperada_llegada) || '';
        if (compra.vinculacion) {
            document.getElementById('vinculacionTipo').value = compra.vinculacion.tipo || '';
            document.getElementById('vinculacionId').value = compra.vinculacion.id || '';
        } else {
            document.getElementById('vinculacionTipo').value = '';
            document.getElementById('vinculacionId').value = '';
        }

        // Cliente info
        const cliDiv = document.getElementById('clienteInfoCompra');
        const cliGrid = document.getElementById('clienteInfoGrid');
        if (compra.data && compra.data.cliente_info) {
            const ci = compra.data.cliente_info;
            cliDiv.style.display = 'block';
            cliGrid.innerHTML = `
                <div><strong>Nombre:</strong> ${ci.nombre || '—'}</div>
                <div><strong>RFC:</strong> ${ci.rfc || '—'}</div>
                <div><strong>Teléfono:</strong> ${ci.telefono || '—'}</div>
                <div><strong>Email:</strong> ${ci.email || '—'}</div>
                <div><strong>Dirección:</strong> ${ci.direccion || '—'}</div>
                <div><strong>CP:</strong> ${ci.cp || '—'}</div>
            `;
            window._clienteInfoCompra = ci;
        } else {
            cliDiv.style.display = 'none';
            cliGrid.innerHTML = '';
            window._clienteInfoCompra = null;
        }

        // Limpiar y cargar items
        document.getElementById('itemsBody').innerHTML = '';
        document.getElementById('itemsBodyInventario').innerHTML = '';
        try {
            const { data: itemsData } = await window.supabase
                .from('compras_items')
                .select('*')
                .eq('compra_id', id)
                .order('created_at', { ascending: true });
            if (itemsData && itemsData.length) {
                itemsData.forEach(it => {
                    if (it.link_proveedor) {
                        _agregarItemRowConDatos(it);
                    } else {
                        _agregarItemRowInventarioConDatos(it);
                    }
                });
            } else {
                _agregarItemRow();
            }
        } catch (e) {
            console.warn('[Compras] Error cargando items para edición:', e);
            _agregarItemRow();
        }

        modal.classList.add('active');
    }

    function _agregarItemRowConDatos(it) {
        const tbody = document.getElementById('itemsBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre" value="${it.nombre || ''}"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc" value="${it.descripcion || ''}"></td>
            <td><input type="text" placeholder="SKU" class="item-sku" value="${it.sku || ''}"></td>
            <td><input type="number" value="${it.cantidad || 1}" min="1" class="item-qty"></td>
            <td><input type="number" value="${(it.costo_unitario || 0).toFixed(2)}" step="0.01" class="item-price"></td>
            <td><input type="url" placeholder="Link" class="item-link" value="${it.link_proveedor || ''}"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
    }

    function _agregarItemRowInventarioConDatos(it) {
        const tbody = document.getElementById('itemsBodyInventario');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre" value="${it.nombre || ''}"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc" value="${it.descripcion || ''}"></td>
            <td><input type="text" placeholder="SKU" class="item-sku" value="${it.sku || ''}"></td>
            <td><input type="number" value="${it.cantidad || 1}" min="1" class="item-qty"></td>
            <td><input type="number" value="${(it.costo_unitario || 0).toFixed(2)}" step="0.01" class="item-price"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
    }

    async function _cargarItemsDesdeVinculacion(tipo, idOrden) {
        if (!tipo || !idOrden) return;
        try {
            let enlaces = [];
            let inventario = [];
            if (tipo === 'taller') {
                const { data } = await window.supabase.from('ordenes_taller').select('*').eq('id', idOrden).single();
                if (data) {
                    const rawEnlaces = data.refacciones_enlaces || (data.data && data.data.refacciones_enlaces) || [];
                    const rawInv = data.refacciones_inventario || (data.data && data.data.refacciones_inventario) || [];
                    const rawCompCompra = data.componentes_compra || (data.data && data.data.componentes_compra) || [];
                    const rawCompInv = data.componentes_inventario || (data.data && data.data.componentes_inventario) || [];
                    enlaces = [
                        ...rawEnlaces.map(e => ({ nombre: e.nombre || '', sku: e.sku || '', descripcion: e.descripcion || '', cantidad: e.cantidad || 1, link: e.link || '' })),
                        ...rawCompCompra.map(e => ({ nombre: e.nombre || '', sku: e.sku || '', descripcion: e.descripcion || '', cantidad: e.cantidad || 1, link: e.link || '' }))
                    ];
                    inventario = [
                        ...rawInv.map(i => ({ nombre: i.nombre || '', sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1 })),
                        ...rawCompInv.map(i => ({ nombre: i.nombre || '', sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1 }))
                    ];
                }
            } else if (tipo === 'motor') {
                const { data } = await window.supabase.from('ordenes_motores').select('*').eq('id', idOrden).single();
                if (data) {
                    const rawEnlaces = data.refacciones_enlaces || (data.data && data.data.refacciones_enlaces) || [];
                    const rawInv = data.refacciones_inventario || (data.data && data.data.refacciones_inventario) || [];
                    const rawCompCompra = data.componentes_compra || (data.data && data.data.componentes_compra) || [];
                    const rawCompInv = data.componentes_inventario || (data.data && data.data.componentes_inventario) || [];
                    enlaces = [
                        ...rawEnlaces.map(e => ({ nombre: e.nombre || '', sku: e.sku || '', descripcion: e.descripcion || '', cantidad: e.cantidad || 1, link: e.link || '' })),
                        ...rawCompCompra.map(e => ({ nombre: e.nombre || '', sku: e.sku || '', descripcion: e.descripcion || '', cantidad: e.cantidad || 1, link: e.link || '' }))
                    ];
                    inventario = [
                        ...rawInv.map(i => ({ nombre: i.nombre || '', sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1 })),
                        ...rawCompInv.map(i => ({ nombre: i.nombre || '', sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1 }))
                    ];
                }
            } else if (tipo === 'automatizacion' || tipo === 'proyecto') {
                const { data } = await window.supabase.from('proyectos_automatizacion').select('*').eq('id', idOrden).single();
                if (data) {
                    const mats = data.materiales || (data.data && data.data.materiales) || [];
                    enlaces = mats.map(m => ({
                        nombre: m.nombre || '',
                        sku: m.sku || '',
                        descripcion: m.descripcion || '',
                        cantidad: m.cantidad || 1,
                        link: ''
                    }));
                }
            }

            const tbodyProv = document.getElementById('itemsBody');
            const tbodyInv = document.getElementById('itemsBodyInventario');
            tbodyProv.innerHTML = '';
            tbodyInv.innerHTML = '';

            if (enlaces.length > 0) {
                enlaces.forEach(it => _agregarItemRowConDatos({
                    nombre: it.nombre,
                    descripcion: it.descripcion,
                    sku: it.sku,
                    cantidad: it.cantidad,
                    costo_unitario: 0,
                    link_proveedor: it.link || ''
                }));
            }
            if (inventario.length > 0) {
                inventario.forEach(it => _agregarItemRowInventarioConDatos({
                    nombre: it.nombre,
                    descripcion: it.descripcion,
                    sku: it.sku,
                    cantidad: it.cantidad,
                    costo_unitario: 0
                }));
            }

            const total = enlaces.length + inventario.length;
            if (total > 0) {
                _showToast(`${enlaces.length} proveedor + ${inventario.length} inventario importados`, 'success');
            } else {
                _showToast('La orden vinculada no tiene materiales registrados', 'warning');
            }
        } catch (e) {
            console.warn('[Compras] Error cargando items desde vinculación:', e);
            _showToast('No se pudieron cargar los items de la orden vinculada', 'error');
        }
    }

    async function _enviarAVentas(id) {
        const compra = compras.find(c => c.id === id) || currentCompra;
        if (!compra) { _showToast('Orden no encontrada', 'error'); return; }
        try {
            const { data: itemsData } = await window.supabase
                .from('compras_items')
                .select('*')
                .eq('compra_id', compra.id)
                .order('created_at', { ascending: true });

            // Buscar cotización original por folio vinculado
            let cotizacionOriginal = null;
            const folioSuministro = compra.vinculacion?.folio;
            if (folioSuministro) {
                const { data: cotData } = await window.supabase
                    .from('cotizaciones')
                    .select('*')
                    .eq('folio', folioSuministro)
                    .limit(1)
                    .single();
                cotizacionOriginal = cotData;
            }

            const ventaData = {
                folio: cotizacionOriginal?.folio || compra.folio,
                cliente: cotizacionOriginal?.cliente_nombre || compra.proveedor_nombre || 'Cliente',
                estado: 'registro',
                departamento: 'Suministro',
                tipo: 'cotizacion',
                origen: 'suministro',
                orden_origen_id: compra.id,
                vinculacion: { tipo: 'compra', id: compra.id, folio: compra.folio },
                total: compra.total || 0,
                subtotal: (compra.total || 0) / 1.16,
                iva: (compra.total || 0) - ((compra.total || 0) / 1.16),
                items: (itemsData || []).map(i => ({
                    descripcion: i.descripcion || i.nombre || '',
                    cantidad: i.cantidad || 1,
                    precio_unitario: i.costo_unitario || 0,
                    importe: i.costo_total || 0
                })),
                observaciones: `Derivado de compra ${compra.folio}`,
                created_at: new Date().toISOString()
            };

            await cotizacionesService.insert(ventaData);
            await comprasService.update(compra.id, { confirmado_ventas: true });
            await notificacionesService.insert({
                para: 'ventas',
                tipo: 'nueva_venta_suministro',
                compra_id: compra.id,
                folio: ventaData.folio,
                mensaje: `Nueva cotización de Suministros ${ventaData.folio} enviada a Ventas`,
                leido: false,
                fecha: new Date().toISOString()
            });
            _showToast('Enviado a Ventas correctamente', 'success');
            _addToFeed('🚀', `Compra ${compra.folio} enviada a Ventas`);
        } catch (e) {
            console.error('[Compras] Error enviando a Ventas:', e);
            _showToast('Error al enviar a Ventas: ' + (e.message || e), 'error');
        }
    }

    // ==================== NUEVA ORDEN ====================
    function _nuevaOrden() {
        console.log('✅ [Compras] Click en Nueva Orden → abriendo modal');
        const modal = document.getElementById('nuevaOrdenModal');
        if (!modal) {
            console.error('[Compras] No se encontró #nuevaOrdenModal');
            return;
        }
        isNewCompra = true;
        currentCompra = null;
        compraId = null;
        try {
            _resetFormulario();
            _agregarItemRow();
        } catch (e) {
            console.warn('[Compras] _nuevaOrden preparación:', e);
        }
        modal.classList.add('active');
    }

    function _resetFormulario() {
        document.getElementById('proveedorSelect').value = '';
        document.getElementById('departamentoSelect').value = 'Laboratorio de Electrónica';
        document.getElementById('fechaRequerida').value = new Date().toISOString().split('T')[0];
        document.getElementById('prioridadSelect').value = 'Normal';
        document.getElementById('vinculacionTipo').value = '';
        document.getElementById('vinculacionId').value = '';
        document.getElementById('ordenTipoSelect').value = 'sencilla';
        document.getElementById('fechaGeneracionBom').value = '';
        document.getElementById('fechaEsperadaLlegada').value = '';
        document.getElementById('itemsBody').innerHTML = '';
        document.getElementById('itemsBodyInventario').innerHTML = '';
        const cliDiv = document.getElementById('clienteInfoCompra');
        if (cliDiv) cliDiv.style.display = 'none';
        const cliGrid = document.getElementById('clienteInfoGrid');
        if (cliGrid) cliGrid.innerHTML = '';
        window._clienteInfoCompra = null;
    }

    function _agregarItemRow() {
        const tbody = document.getElementById('itemsBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc"></td>
            <td><input type="text" placeholder="SKU" class="item-sku"></td>
            <td><input type="number" value="1" min="1" class="item-qty"></td>
            <td><input type="number" value="0" step="0.01" class="item-price"></td>
            <td><input type="url" placeholder="Link" class="item-link"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
    }

    function _agregarItemRowInventario() {
        const tbody = document.getElementById('itemsBodyInventario');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc"></td>
            <td><input type="text" placeholder="SKU" class="item-sku"></td>
            <td><input type="number" value="1" min="1" class="item-qty"></td>
            <td><input type="number" value="0" step="0.01" class="item-price"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
    }

    async function _guardarBorrador() {
        console.log('[Compras] Guardar borrador (avance sin cerrar)');
        const proveedor = document.getElementById('proveedorSelect').value || 'PENDIENTE';
        const departamento = document.getElementById('departamentoSelect').value;
        const fechaRequerida = document.getElementById('fechaRequerida').value;
        const prioridad = document.getElementById('prioridadSelect').value;
        const vinculacionTipo = document.getElementById('vinculacionTipo').value;
        const vinculacionId = document.getElementById('vinculacionId').value;
        const ordenTipo = document.getElementById('ordenTipoSelect').value || 'sencilla';
        const fechaGeneracionBom = document.getElementById('fechaGeneracionBom').value;
        const fechaEsperadaLlegada = document.getElementById('fechaEsperadaLlegada').value;

        const items = [];
        document.querySelectorAll('#itemsBody tr').forEach(tr => {
            const nombre = tr.querySelector('.item-nombre')?.value;
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            const link = tr.querySelector('.item-link')?.value;
            items.push({ nombre: nombre || '', desc: desc || '', sku: sku || '', qty: qty || 0, price: price || 0, link: link || '', origen: 'proveedor' });
        });
        document.querySelectorAll('#itemsBodyInventario tr').forEach(tr => {
            const nombre = tr.querySelector('.item-nombre')?.value;
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            items.push({ nombre: nombre || '', desc: desc || '', sku: sku || '', qty: qty || 0, price: price || 0, link: '', origen: 'inventario' });
        });

        const total = items.reduce((sum, i) => sum + (i.qty * i.price), 0);
        const vinculacion = vinculacionTipo && vinculacionId ? { tipo: vinculacionTipo, id: vinculacionId, nombre: '' } : null;
        const clienteInfo = window._clienteInfoCompra || null;
        let folio = compraId ? (currentCompra && currentCompra.folio) : null;
        if (!folio) {
            folio = (window.folioFormats && window.folioFormats.getNextFolioOrdenCompra)
                ? await window.folioFormats.getNextFolioOrdenCompra()
                : 'SP-OC' + new Date().getFullYear().toString().slice(-2) + (new Date().getMonth() + 1).toString().padStart(2, '0') + '1';
        }
        const payload = {
            folio,
            proveedor: proveedor || 'PENDIENTE',
            departamento: departamento || 'Laboratorio de Electrónica',
            fecha: new Date().toISOString(),
            fecha_requerida: fechaRequerida || new Date().toISOString().split('T')[0],
            prioridad: prioridad || 'Normal',
            vinculacion,
            items,
            total,
            estado: 0,
            pasos: [{
                paso: 0,
                fecha: new Date().toISOString(),
                usuario: (await authService.getCurrentProfile())?.nombre || 'Sistema',
                accion: 'Borrador guardado'
            }],
            confirmado_ventas: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            data: {
                orden_tipo: ordenTipo,
                fecha_generacion_bom: fechaGeneracionBom,
                fecha_esperada_llegada: fechaEsperadaLlegada,
                cliente_info: clienteInfo
            }
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (compraId) {
                await comprasService.update(compraId, payload, csrfToken);
            } else {
                const inserted = await comprasService.insert(payload, csrfToken);
                if (inserted && inserted.id) {
                    compraId = inserted.id;
                    currentCompra = { ...payload, id: inserted.id };
                }
            }
            alert('Borrador guardado. Puedes seguir editando.');
            _addToFeed('💾', 'Borrador de orden guardado');
        } catch (e) {
            console.warn('[Compras] Guardar borrador:', e);
            alert('No se pudo guardar el borrador. Comprueba que la tabla compras acepte estado 0.');
        }
    }

    async function _guardarNuevaOrden() {
        console.log('[Compras] Click en Guardar Nueva Orden');
        const proveedor = document.getElementById('proveedorSelect').value || 'PENDIENTE';
        const departamento = document.getElementById('departamentoSelect').value;
        const fechaRequerida = document.getElementById('fechaRequerida').value;
        const prioridad = document.getElementById('prioridadSelect').value;
        const vinculacionTipo = document.getElementById('vinculacionTipo').value;
        const vinculacionId = document.getElementById('vinculacionId').value;
        const ordenTipo = document.getElementById('ordenTipoSelect').value || 'sencilla';
        const fechaGeneracionBom = document.getElementById('fechaGeneracionBom').value;
        const fechaEsperadaLlegada = document.getElementById('fechaEsperadaLlegada').value;

        if (!departamento) {
            alert('Seleccione un departamento');
            return;
        }

        const items = [];
        document.querySelectorAll('#itemsBody tr').forEach(tr => {
            const nombre = tr.querySelector('.item-nombre')?.value;
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            const link = tr.querySelector('.item-link')?.value;
            if ((nombre || desc) && qty > 0) {
                items.push({ nombre, desc, sku, qty, price, link, origen: 'proveedor' });
            }
        });
        document.querySelectorAll('#itemsBodyInventario tr').forEach(tr => {
            const nombre = tr.querySelector('.item-nombre')?.value;
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            if ((nombre || desc) && qty > 0) {
                items.push({ nombre, desc, sku, qty, price, link: '', origen: 'inventario' });
            }
        });

        if (items.length === 0) {
            alert('Debe agregar al menos un producto');
            return;
        }

        const total = items.reduce((sum, i) => sum + (i.qty * i.price), 0);

        const vinculacion = vinculacionTipo && vinculacionId ? {
            tipo: vinculacionTipo,
            id: vinculacionId,
            nombre: await _getNombreVinculacion(vinculacionTipo, vinculacionId)
        } : null;

        let folio;
        if (compraId && currentCompra) {
            folio = currentCompra.folio || compraId;
        } else {
            folio = (window.folioFormats && window.folioFormats.getNextFolioOrdenCompra)
                ? await window.folioFormats.getNextFolioOrdenCompra()
                : 'SP-OC' + new Date().getFullYear().toString().slice(-2) + (new Date().getMonth() + 1).toString().padStart(2, '0') + '1';
        }
        const clienteInfo = window._clienteInfoCompra || null;
        const nuevaCompra = {
            folio,
            proveedor,
            departamento,
            fecha_requerida: fechaRequerida,
            prioridad,
            vinculacion,
            items: [],  // Items van en tabla compras_items
            total,
            estado: 1,
            pasos: [{
                paso: 1,
                fecha: new Date().toISOString(),
                usuario: (await authService.getCurrentProfile())?.nombre || 'Sistema',
                accion: compraId ? 'Orden confirmada desde borrador' : 'Orden creada'
            }],
            confirmado_ventas: false,
            created_at: (currentCompra && currentCompra.created_at) || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            data: {
                orden_tipo: ordenTipo,
                fecha_generacion_bom: fechaGeneracionBom,
                fecha_esperada_llegada: fechaEsperadaLlegada,
                cliente_info: clienteInfo
            }
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            let inserted;
            if (compraId) {
                const veniaDeSolicitud = currentCompra && currentCompra.estado_interno === 'esperando_cotizacion';
                if (veniaDeSolicitud) {
                    nuevaCompra.estado = 2;
                    nuevaCompra.estado_interno = 'cotizado_enviado_ventas';
                }
                await comprasService.update(compraId, nuevaCompra, csrfToken);
                inserted = { id: compraId };

                // Notificar a Ventas si venía de solicitud de cotización
                if (veniaDeSolicitud && vinculacion) {
                    try {
                        await notificacionesService.insert({
                            para: 'ventas',
                            tipo: 'esperando_cotizacion_compras',
                            compra_id: compraId,
                            folio,
                            orden_id: vinculacion.id,
                            cliente: vinculacion.nombre || '',
                            mensaje: `Compras envió cotización para ${folio}. Precios reales capturados. Calcule precio final y presente al cliente.`,
                            leido: false,
                            fecha: new Date().toISOString()
                        }, csrfToken);
                    } catch (nerr) { console.warn('[Compras] Error notificando a Ventas:', nerr); }
                }

                alert('✅ Orden confirmada');
                document.getElementById('nuevaOrdenModal').classList.remove('active');
                _addToFeed('➕', `Orden ${folio} confirmada`);
                if (window.SSEPIStateMachine) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'compra', compraId, 'actualizacion', `Orden de compra ${folio} confirmada`, csrfToken);
                }
            } else {
                inserted = await comprasService.insert(nuevaCompra, csrfToken);

                // Insertar items en tabla compras_items
                const itemsService = createDataService('compras_items');
                for (const item of items) {
                    await itemsService.insert({
                        compra_id: inserted.id,
                        nombre: item.nombre || '',
                        sku: item.sku || '',
                        descripcion: item.desc || '',
                        cantidad: item.qty || 1,
                        costo_unitario: item.price || 0,
                        costo_total: (item.qty || 1) * (item.price || 0),
                        link_proveedor: item.link || ''
                    }, csrfToken);
                }

                if (window.emailService) {
                    const profile = await authService.getCurrentProfile();
                    const to = profile && profile.email ? profile.email : null;
                    if (to) {
                        const fromVendedor = (profile.nombre || 'SSEPI') + ' <' + profile.email + '>';
                        const html = '<p>Se ha creado la orden de compra <strong>' + folio + '</strong> (proveedor: ' + (proveedor || 'N/A') + ').</p><p>— SSEPI Compras</p>';
                        window.emailService.send(to, 'Nueva orden de compra - ' + folio, html, undefined, fromVendedor).then(function (r) {
                            if (r.error) console.warn('Correo no enviado:', r.error);
                        });
                    }
                }
                if (vinculacion && vinculacion.tipo === 'taller') {
                    await notificacionesService.insert({
                        para: 'taller',
                        tipo: 'nueva_orden_compra',
                        compra_id: inserted.id,
                        folio,
                        orden_id: vinculacion.id,
                        mensaje: `Nueva orden de compra ${folio} creada para Laboratorio`,
                        leido: false,
                        fecha: new Date().toISOString()
                    }, csrfToken);
                }
                alert('✅ Orden de compra creada');
                document.getElementById('nuevaOrdenModal').classList.remove('active');
                _addToFeed('➕', `Orden ${folio} creada`);
                if (window.SSEPIStateMachine && inserted?.id) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'compra', inserted.id, 'creacion', `Orden de compra ${folio} creada`, csrfToken);
                }
            }
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    async function _getNombreVinculacion(tipo, id) {
        try {
            if (tipo === 'taller') {
                const orden = await tallerService.getById(id);
                return orden?.cliente_nombre || '';
            } else if (tipo === 'motor') {
                const orden = await motoresService.getById(id);
                return orden?.cliente_nombre || '';
            } else if (tipo === 'proyecto' || tipo === 'automatizacion') {
                const proy = await proyectosService.getById(id);
                return proy?.cliente || proy?.nombre || '';
            }
        } catch (e) {
            console.error(e);
        }
        return '';
    }

    async function _abrirCotizacionDesdeSolicitud(compraId) {
        console.log('[Compras] Abrir cotización desde solicitud', compraId);
        const compra = compras.find(c => c.id === compraId);
        if (!compra) { _showToast('Solicitud no encontrada', 'error'); return; }
        currentCompra = compra;
        compraId = compra.id;
        isNewCompra = false;
        const modal = document.getElementById('nuevaOrdenModal');
        const title = modal.querySelector('.modal-title');
        if (title) title.innerHTML = '<i class="fas fa-file-invoice"></i> Cotizar Solicitud ' + (compra.folio || '');
        document.getElementById('proveedorSelect').value = compra.proveedor || 'PENDIENTE';
        document.getElementById('departamentoSelect').value = compra.departamento || 'Laboratorio de Electrónica';
        document.getElementById('fechaRequerida').value = new Date().toISOString().split('T')[0];
        document.getElementById('prioridadSelect').value = compra.prioridad || 'Normal';
        if (compra.vinculacion) {
            document.getElementById('vinculacionTipo').value = compra.vinculacion.tipo || '';
            document.getElementById('vinculacionId').value = compra.vinculacion.id || '';
        }
        // Cargar items existentes
        const itemsBody = document.getElementById('itemsBody');
        itemsBody.innerHTML = '';
        try {
            const { data: itemsData } = await window.supabase.from('compras_items').select('*').eq('compra_id', compra.id).order('created_at', { ascending: true });
            (itemsData || []).forEach(it => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><input type="text" class="item-nombre" value="' + (it.nombre || '') + '" placeholder="Nombre"></td>' +
                    '<td><input type="text" class="item-desc" value="' + (it.descripcion || '') + '" placeholder="Descripción"></td>' +
                    '<td><input type="text" class="item-sku" value="' + (it.sku || '') + '" placeholder="SKU"></td>' +
                    '<td><input type="number" class="item-qty" value="' + (it.cantidad || 1) + '" min="1"></td>' +
                    '<td><input type="number" class="item-price" value="' + (it.costo_unitario || 0) + '" step="0.01"></td>' +
                    '<td><input type="text" class="item-link" value="' + (it.link_proveedor || '') + '" placeholder="Link"></td>' +
                    '<td><button type="button" class="btn-icon btn-remove-item"><i class="fas fa-trash"></i></button></td>';
                itemsBody.appendChild(tr);
            });
        } catch (e) { console.warn('[Compras] Error cargando items:', e); }
        modal.classList.add('active');
        _showToast('Captura precios reales de proveedores y guarda para enviar a Ventas', 'info');
    }

    async function _crearOrdenDesdeSolicitud(id, tipo) {
        console.log('[Compras] Crear orden desde solicitud', { id, tipo });

        let compraData = null;
        let ordenTallerData = null;
        let departamentoPorDefecto = 'Laboratorio de Electrónica';

        try {
            if (tipo === 'taller') {
                ordenTallerData = await tallerService.getById(id);
                departamentoPorDefecto = 'Laboratorio de Electrónica';
                console.log('[Compras] Orden taller:', ordenTallerData);
            } else if (tipo === 'motor') {
                ordenTallerData = await motoresService.getById(id);
                departamentoPorDefecto = 'Taller Motores';
            } else if (tipo === 'proyecto' || tipo === 'automatizacion') {
                ordenTallerData = await proyectosService.getById(id);
                departamentoPorDefecto = tipo === 'automatizacion' ? 'Automatización' : 'Proyectos';
            }

            if (ordenTallerData) {
                const vincTipo = tipo === 'automatizacion' ? 'proyecto' : tipo;
                const { data: comprasList, error } = await window.supabase
                    .from('compras')
                    .select('*')
                    .eq('vinculacion->>tipo', vincTipo)
                    .eq('vinculacion->>id', id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (!error && comprasList && comprasList.length > 0) {
                    compraData = comprasList[0];
                    console.log('[Compras] Solicitud de compra encontrada:', compraData);
                } else {
                    console.log('[Compras] No hay solicitud de compra creada aún para esta orden');
                }
            }
        } catch (e) {
            console.error('[Compras] Error obteniendo datos:', e);
        }

        // Precargar formulario
        isNewCompra = true;
        currentCompra = null;
        compraId = null;
        document.getElementById('vinculacionTipo').value = tipo;
        document.getElementById('vinculacionId').value = id;
        document.getElementById('departamentoSelect').value = departamentoPorDefecto;
        document.getElementById('proveedorSelect').value = '';
        document.getElementById('ordenTipoSelect').value = 'sencilla';
        document.getElementById('fechaGeneracionBom').value = new Date().toISOString().split('T')[0];
        const hoyMas7 = new Date(); hoyMas7.setDate(hoyMas7.getDate() + 7);
        document.getElementById('fechaEsperadaLlegada').value = hoyMas7.toISOString().split('T')[0];

        const itemsBody = document.getElementById('itemsBody');
        const itemsBodyInv = document.getElementById('itemsBodyInventario');
        itemsBody.innerHTML = '';
        itemsBodyInv.innerHTML = '';
        const clienteInfoDiv = document.getElementById('clienteInfoCompra');
        const clienteInfoGrid = document.getElementById('clienteInfoGrid');
        clienteInfoDiv.style.display = 'none';
        clienteInfoGrid.innerHTML = '';

        // === IMPORTAR DATOS DEL CLIENTE ===
        if (ordenTallerData) {
            const clienteNombre = ordenTallerData.cliente_nombre || ordenTallerData.cliente || '';
            let clienteInfo = { nombre: clienteNombre };
            if (clienteNombre) {
                try {
                    const contactosList = await contactosService.select({ tipo: 'client' }, { page: 0, pageSize: 500 });
                    const contacto = contactosList.find(c => (c.nombre || '').toLowerCase().trim() === clienteNombre.toLowerCase().trim());
                    if (contacto) {
                        clienteInfo = {
                            nombre: contacto.nombre || clienteNombre,
                            rfc: contacto.rfc || '',
                            direccion: contacto.direccion || '',
                            cp: contacto.cp || contacto.codigo_postal || '',
                            telefono: contacto.telefono || '',
                            email: contacto.email || '',
                            ciudad: contacto.ciudad || ''
                        };
                    }
                } catch (e) { console.warn('[Compras] Error buscando contacto:', e); }
            }
            if (clienteInfo.nombre) {
                clienteInfoDiv.style.display = 'block';
                clienteInfoGrid.innerHTML = `
                    <div><strong>Nombre:</strong> ${clienteInfo.nombre || '—'}</div>
                    <div><strong>RFC:</strong> ${clienteInfo.rfc || '—'}</div>
                    <div><strong>Teléfono:</strong> ${clienteInfo.telefono || '—'}</div>
                    <div><strong>Email:</strong> ${clienteInfo.email || '—'}</div>
                    <div><strong>Dirección:</strong> ${clienteInfo.direccion || '—'}</div>
                    <div><strong>CP:</strong> ${clienteInfo.cp || '—'}</div>
                `;
                window._clienteInfoCompra = clienteInfo;
            }
        }

        // === IMPORTAR ITEMS: dos listas separadas ===
        let enlaces = [];
        let inventario = [];

        if (ordenTallerData) {
            // Nombres de campo reales en taller.js: refacciones_enlaces, refacciones_inventario, componentes_compra, componentes_inventario
            const rawEnlaces = ordenTallerData.refacciones_enlaces || (ordenTallerData.data && ordenTallerData.data.refacciones_enlaces) || [];
            const rawInv = ordenTallerData.refacciones_inventario || (ordenTallerData.data && ordenTallerData.data.refacciones_inventario) || [];
            const rawCompCompra = ordenTallerData.componentes_compra || (ordenTallerData.data && ordenTallerData.data.componentes_compra) || [];
            const rawCompInv = ordenTallerData.componentes_inventario || (ordenTallerData.data && ordenTallerData.data.componentes_inventario) || [];
            enlaces = [
                ...rawEnlaces.map(e => ({ nombre: e.nombre || '', descripcion: e.descripcion || '', sku: e.sku || '', cantidad: Number(e.cantidad) || 1, link: e.link || '' })),
                ...rawCompCompra.map(e => ({ nombre: e.nombre || '', descripcion: e.descripcion || '', sku: e.sku || '', cantidad: Number(e.cantidad) || 1, link: e.link || '' }))
            ];
            inventario = [
                ...rawInv.map(i => ({ nombre: i.nombre || '', descripcion: i.descripcion || '', sku: i.sku || '', cantidad: Number(i.cantidad) || 1 })),
                ...rawCompInv.map(i => ({ nombre: i.nombre || '', descripcion: i.descripcion || '', sku: i.sku || '', cantidad: Number(i.cantidad) || 1 }))
            ];
        }

        // Fallback: si no hay arrays directos, usar items de compra existente
        if (enlaces.length === 0 && inventario.length === 0 && compraData) {
            const itemsFallback = compraData.items || [];
            enlaces = itemsFallback.map(it => ({ nombre: it.nombre || '', descripcion: it.descripcion || '', sku: it.sku || '', cantidad: Number(it.cantidad) || 1, link: it.link || '' }));
        }

        // Fallback DB
        if (enlaces.length === 0 && inventario.length === 0 && compraData?.id) {
            try {
                const { data: itemsDB } = await window.supabase.from('compras_items').select('*').eq('compra_id', compraData.id).order('created_at', { ascending: true });
                if (itemsDB && itemsDB.length > 0) {
                    enlaces = itemsDB.map(it => ({
                        nombre: it.nombre || it.descripcion || '',
                        descripcion: it.descripcion || '',
                        sku: it.sku || '',
                        cantidad: it.cantidad || 1,
                        link: it.link_proveedor || ''
                    }));
                }
            } catch (e) { console.warn('[Compras] Error cargando items DB:', e); }
        }

        // Renderizar enlaces (proveedores)
        if (enlaces.length > 0) {
            enlaces.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" value="${item.nombre || ''}" class="item-nombre"></td>
                    <td><input type="text" value="${item.descripcion || ''}" class="item-desc"></td>
                    <td><input type="text" value="${item.sku || ''}" class="item-sku"></td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" class="item-qty"></td>
                    <td><input type="number" value="${item.precio_unitario || 0}" step="0.01" class="item-price"></td>
                    <td><input type="url" value="${item.link || ''}" placeholder="Link" class="item-link"></td>
                    <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
                `;
                itemsBody.appendChild(row);
            });
        }

        // Renderizar inventario
        if (inventario.length > 0) {
            inventario.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" value="${item.nombre || ''}" class="item-nombre"></td>
                    <td><input type="text" value="${item.descripcion || ''}" class="item-desc"></td>
                    <td><input type="text" value="${item.sku || ''}" class="item-sku"></td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" class="item-qty"></td>
                    <td><input type="number" value="${item.precio_unitario || 0}" step="0.01" class="item-price"></td>
                    <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
                `;
                itemsBodyInv.appendChild(row);
            });
        }

        // Si no hay nada, crear fila genérica con info del equipo
        if (enlaces.length === 0 && inventario.length === 0) {
            const equipo = ordenTallerData?.equipo || 'Equipo sin nombre';
            const marca = ordenTallerData?.marca || '';
            const modelo = ordenTallerData?.modelo || '';
            const serie = ordenTallerData?.serie || '';
            const falla = ordenTallerData?.falla_reportada || 'Servicio requerido';
            const desc = `${falla} - ${equipo}${marca ? ' ' + marca : ''}${modelo ? ' ' + modelo : ''}${serie ? ' S/N: ' + serie : ''}`;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" placeholder="Nombre" class="item-nombre"></td>
                <td><input type="text" value="${desc}" class="item-desc"></td>
                <td><input type="text" placeholder="SKU" class="item-sku"></td>
                <td><input type="number" value="1" min="1" class="item-qty"></td>
                <td><input type="number" value="0" step="0.01" class="item-price"></td>
                <td><input type="url" placeholder="Link" class="item-link"></td>
                <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
            `;
            itemsBody.appendChild(row);
        }

        document.getElementById('nuevaOrdenModal').classList.add('active');
        _showToast(`Importados: ${enlaces.length} proveedor, ${inventario.length} inventario`, 'success');
    }

    function _verProveedor(id) {
        const p = proveedoresVista.find(x => String(x.id) === String(id))
            || contactos.find(c => String(c.id) === String(id));
        if (p && p.sitio_web) {
            window.open(p.sitio_web, '_blank', 'noopener,noreferrer');
            return;
        }
        alert(p ? (p.nombre || p.empresa || 'Proveedor') : ('Proveedor ' + id));
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-compras);">COMPRAS</span><span>${new Date().toLocaleTimeString()}</span></div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== PDF ====================
    async function _generarPDFCompra(preview = false) {
        if (!currentCompra || !window.pdfGenerator) return;
        var user = await authService.getCurrentProfile();
        var data = {
            folio: currentCompra.folio,
            proveedor: currentCompra.proveedor,
            fecha_requerida: currentCompra.fecha_requerida,
            departamento: currentCompra.departamento || 'Compras',
            items: (currentCompra.itemsData || []).map(function (i) {
                return { desc: i.descripcion || i.nombre, sku: i.sku, qty: i.cantidad, price: i.costo_unitario };
            }),
            total: currentCompra.total
        };
        await window.pdfGenerator.generateOrdenCompra(data, user, preview);
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('newPurchaseBtn').addEventListener('click', _nuevaOrden);
        document.getElementById('closeDetalleModal').addEventListener('click', () => {
            document.getElementById('detalleModal').classList.remove('active');
        });
        var imprimirOC = document.getElementById('imprimirOrdenCompraBtn');
        if (imprimirOC) imprimirOC.addEventListener('click', function () {
            var el = document.getElementById('detalleContenido');
            if (!el) return;
            var html = '<!DOCTYPE html><html><head><title>Orden de compra</title><style>body{font-family:Inter,sans-serif;padding:20px;} table{border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;}</style></head><body><h2>Orden de compra</h2>' + el.innerHTML + '</body></html>';
            var blob = new Blob([html], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
        });
        var descargarPDFOC = document.getElementById('descargarPDFOrdenCompraBtn');
        if (descargarPDFOC) descargarPDFOC.addEventListener('click', () => _generarPDFCompra(false));
        var vistaPreviaPDFOC = document.getElementById('vistaPreviaPDFOrdenCompraBtn');
        if (vistaPreviaPDFOC) vistaPreviaPDFOC.addEventListener('click', () => _generarPDFCompra(true));
        document.getElementById('closeNuevaOrdenModal').addEventListener('click', () => {
            document.getElementById('nuevaOrdenModal').classList.remove('active');
        });
        document.getElementById('cancelNuevaOrden').addEventListener('click', () => {
            document.getElementById('nuevaOrdenModal').classList.remove('active');
        });
        document.getElementById('addItemBtn').addEventListener('click', _agregarItemRow);
        var addItemInvBtn = document.getElementById('addItemInventarioBtn');
        if (addItemInvBtn) addItemInvBtn.addEventListener('click', _agregarItemRowInventario);
        document.getElementById('guardarNuevaOrden').addEventListener('click', _guardarNuevaOrden);
        var guardarBorradorBtn = document.getElementById('guardarBorradorBtn');
        if (guardarBorradorBtn) guardarBorradorBtn.addEventListener('click', _guardarBorrador);

        // Auto-cargar items al perder foco en vinculación
        var vincIdInput = document.getElementById('vinculacionId');
        var vincTipoSelect = document.getElementById('vinculacionTipo');
        if (vincIdInput && vincTipoSelect) {
            vincIdInput.addEventListener('blur', function() {
                var tipo = vincTipoSelect.value;
                var id = vincIdInput.value.trim();
                if (tipo && id && document.getElementById('nuevaOrdenModal').classList.contains('active')) {
                    _cargarItemsDesdeVinculacion(tipo, id);
                }
            });
        }

        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            filtroDepartamento = document.getElementById('filtroDepartamento').value;
            filtroEstado = document.getElementById('filtroEstado').value;
            filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _applyFilters();
        });

        document.getElementById('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            const graficaEl = document.getElementById('graficaContainer');
            graficaEl.style.display = 'none';
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaLista').addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            const graficaEl = document.getElementById('graficaContainer');
            graficaEl.style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
            requestAnimationFrame(() => {
                _applyFilters();
            });
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

    function _operativaVigente(row) {
        const s = String(row.estado || '').toLowerCase();
        return !s.includes('cancel');
    }

    function _bindOperativasComprasPanel() {
        const host = document.getElementById('operativasTabsCompras');
        if (!host) return;
        host.querySelectorAll('button[data-op-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                operativasTabCompras = btn.getAttribute('data-op-tab') || 'taller';
                host.querySelectorAll('button[data-op-tab]').forEach(function (b) {
                    b.classList.toggle('active', b.getAttribute('data-op-tab') === operativasTabCompras);
                });
                _renderOperativasComprasList();
            });
        });
    }

    function _renderOperativasComprasList() {
        const list = document.getElementById('operativasListCompras');
        if (!list) return;
        const nt = (ordenesTaller || []).filter(_operativaVigente).length;
        const nm = (ordenesMotores || []).filter(_operativaVigente).length;
        const np = (proyectos || []).filter(_operativaVigente).length;
        const solicitudes = (compras || []).filter(c => (c.estado === 1 || c.estado === 2) && c.estado_interno === 'esperando_cotizacion');
        const c1 = document.getElementById('opCountTaller');
        const c2 = document.getElementById('opCountMotor');
        const c3 = document.getElementById('opCountAuto');
        const c4 = document.getElementById('opCountSolicitudes');
        if (c1) c1.textContent = '(' + nt + ')';
        if (c2) c2.textContent = '(' + nm + ')';
        if (c3) c3.textContent = '(' + np + ')';
        if (c4) c4.textContent = '(' + solicitudes.length + ')';

        if (operativasTabCompras === 'solicitudes') {
            function esc(s) {
                const d = document.createElement('div');
                d.textContent = s == null ? '' : String(s);
                return d.innerHTML;
            }
            if (!solicitudes.length) {
                list.innerHTML = '<div class="op-empty">No hay solicitudes de cotización pendientes.</div>';
                return;
            }
            list.innerHTML = solicitudes.map(function (r) {
                const folio = r.folio || (r.id && String(r.id).slice(-8)) || '—';
                const cliente = (r.vinculacion && r.vinculacion.cliente) || (r.vinculacion && r.vinculacion.nombre) || '—';
                const st = r.estado === 1 ? 'Solicitud' : (r.estado === 2 ? 'Cotización' : '—');
                const id = r.id;
                return '<div class="op-row">' +
                    '<div><strong>' + esc(folio) + '</strong> · ' + esc(cliente) + '<br><span class="op-meta">Estado: ' + esc(st) + ' · Esperando cotización</span></div>' +
                    '<div class="op-actions">' +
                    '<button type="button" class="btn-ssepi btn-compras op-cotizar" style="font-size:12px;padding:6px 12px;" data-compra-id="' + esc(id) + '">Cotizar y enviar a Ventas</button>' +
                    '</div></div>';
            }).join('');
            list.querySelectorAll('.op-cotizar').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const cid = btn.getAttribute('data-compra-id');
                    _abrirCotizacionDesdeSolicitud(cid);
                });
            });
            return;
        }

        let rows = operativasTabCompras === 'motor' ? ordenesMotores : (operativasTabCompras === 'auto' ? proyectos : ordenesTaller);
        rows = (rows || []).filter(_operativaVigente).slice(0, 50);
        function esc(s) {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        }
        if (!rows.length) {
            list.innerHTML = '<div class="op-empty">No hay órdenes o proyectos en esta pestaña (o sin permiso de lectura).</div>';
            return;
        }
        const tipoVinc = operativasTabCompras === 'motor' ? 'motor' : (operativasTabCompras === 'auto' ? 'automatizacion' : 'taller');
        list.innerHTML = rows.map(function (r) {
            const folio = r.folio || (r.id && String(r.id).slice(-8)) || '—';
            const cliente = r.cliente_nombre || r.cliente || r.nombre || '—';
            const st = r.estado || '—';
            const id = r.id;
            return '<div class="op-row">' +
                '<div><strong>' + esc(folio) + '</strong> · ' + esc(cliente) + '<br><span class="op-meta">' + esc(st) + '</span></div>' +
                '<div class="op-actions">' +
                '<button type="button" class="btn-ssepi btn-compras op-go" style="font-size:12px;padding:6px 12px;" data-vinc-tipo="' + esc(tipoVinc) + '" data-vinc-id="' + esc(id) + '">Nueva compra vinculada</button>' +
                '</div></div>';
        }).join('');
        list.querySelectorAll('.op-go').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const t = btn.getAttribute('data-vinc-tipo');
                const vid = btn.getAttribute('data-vinc-id');
                _crearOrdenDesdeSolicitud(vid, t);
            });
        });
    }

    function _consumeVinculacionUrlParams() {
        const p = new URLSearchParams(window.location.search);
        const vt = p.get('vincTipo');
        const vid = p.get('vincId');
        if (!vt || !vid) return;
        _crearOrdenDesdeSolicitud(vid, vt);
        try {
            history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { /* ignore */ }
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
        _crearOrdenDesdeSolicitud,
        _editarOrden,
        _cargarItemsDesdeVinculacion,
        _verProveedor,
        _recibirCompra,
        _descargarOC,
        _enviarAVentas,
        _generarPDFCompra
    };
})();

window.comprasModule = ComprasModule;