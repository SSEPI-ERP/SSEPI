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

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Compras] Conectado');
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
        // Misma amplitud que Laboratorio/Ventas: órdenes fuera de Nuevo/Diagnóstico/En espera siguen siendo vinculables en pruebas
        ordenesTaller = await tallerService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 });
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
                        ${filtrados.map(c => _crearCardKanban(c)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id));
        });
    }

    function _crearCardKanban(compra) {
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
                    <div class="total">$${(compra.total || 0).toFixed(2)}</div>
                </div>
                <div class="card-footer">
                    <small>${compra.fecha_requerida ? new Date(compra.fecha_requerida).toLocaleDateString() : ''}</small>
                    <small>${compra.departamento || ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(ordenes) {
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
                <td>${c.vinculacion ? `${c.vinculacion.tipo}: ${c.vinculacion.nombre || ''}` : '—'}</td>
                <td>$${(c.total || 0).toFixed(2)}</td>
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
        document.getElementById('kpiComprasMes').innerHTML = `$${totalMes.toFixed(2)}`;
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

        return `
            <div class="detalle-section">
                <h4>Información General</h4>
                <div class="detalle-grid">
                    <div><strong>Folio:</strong> ${compra.folio}</div>
                    <div><strong>Proveedor:</strong> ${compra.proveedor}</div>
                    <div><strong>Departamento:</strong> ${compra.departamento}</div>
                    <div><strong>Fecha Requerida:</strong> ${compra.fecha_requerida ? new Date(compra.fecha_requerida).toLocaleDateString() : '—'}</div>
                    <div><strong>Prioridad:</strong> ${compra.prioridad || 'Normal'}</div>
                    <div><strong>Estado:</strong> ${_getEstadoLabel(compra.estado)}</div>
                </div>
                <div style="margin-top: 16px;">
                    <button onclick="comprasModule._descargarOC()" class="btn-ssepi btn-compras" style="display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-excel"></i> Descargar OC
                    </button>
                </div>
            </div>
            ${compra.vinculacion ? `
            <div class="detalle-section">
                <h4>Vinculación con Orden Operativa</h4>
                <div class="detalle-grid">
                    <div><strong>Tipo:</strong> ${compra.vinculacion.tipo}</div>
                    <div><strong>ID:</strong> ${compra.vinculacion.id}</div>
                    <div><strong>Cliente/Orden:</strong> ${compra.vinculacion.nombre || ''}</div>
                    <div><strong>Folio Laboratorio:</strong> ${compra.vinculacion.folio_taller || ''}</div>
                </div>
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
                <h4>Productos</h4>
                <table class="items-table">
                    <thead><tr><th>Descripción</th><th>SKU</th><th>Cantidad</th><th>Precio Unit.</th><th>Total</th><th>Link</th></tr></thead>
                    <tbody>
                        ${currentCompra.itemsData && currentCompra.itemsData.length ? currentCompra.itemsData.map(item => `
                            <tr>
                                <td>${item.descripcion || ''}</td>
                                <td>${item.sku || ''}</td>
                                <td>${item.cantidad || 0}</td>
                                <td>$${(item.costo_unitario || 0).toFixed(2)}</td>
                                <td>$${(item.costo_total || 0).toFixed(2)}</td>
                                <td>${item.link_proveedor ? `<a href="${item.link_proveedor}" target="_blank">Ver</a>` : '—'}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="6">No hay productos</td></tr>'}
                    </tbody>
                </table>
                <div class="total-final"><strong>Total:</strong> $${(compra.total || 0).toFixed(2)}</div>
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

    function _editarOrden(id) {
        alert('Función de edición pendiente de implementación');
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
        document.getElementById('itemsBody').innerHTML = '';
    }

    function _agregarItemRow() {
        const tbody = document.getElementById('itemsBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Descripción" class="item-desc"></td>
            <td><input type="text" placeholder="SKU" class="item-sku"></td>
            <td><input type="number" value="1" min="1" class="item-qty"></td>
            <td><input type="number" value="0" step="0.01" class="item-price"></td>
            <td><input type="url" placeholder="Link" class="item-link"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
    }

    async function _guardarBorrador() {
        console.log('[Compras] Guardar borrador (avance sin cerrar)');
        const proveedor = document.getElementById('proveedorSelect').value;
        const departamento = document.getElementById('departamentoSelect').value;
        const fechaRequerida = document.getElementById('fechaRequerida').value;
        const prioridad = document.getElementById('prioridadSelect').value;
        const vinculacionTipo = document.getElementById('vinculacionTipo').value;
        const vinculacionId = document.getElementById('vinculacionId').value;

        const items = [];
        document.querySelectorAll('#itemsBody tr').forEach(tr => {
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            const link = tr.querySelector('.item-link')?.value;
            items.push({ desc: desc || '', sku: sku || '', qty: qty || 0, price: price || 0, link: link || '' });
        });

        const total = items.reduce((sum, i) => sum + (i.qty * i.price), 0);
        const vinculacion = vinculacionTipo && vinculacionId ? { tipo: vinculacionTipo, id: vinculacionId, nombre: '' } : null;
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
            updated_at: new Date().toISOString()
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
        const proveedor = document.getElementById('proveedorSelect').value;
        const departamento = document.getElementById('departamentoSelect').value;
        const fechaRequerida = document.getElementById('fechaRequerida').value;
        const prioridad = document.getElementById('prioridadSelect').value;
        const vinculacionTipo = document.getElementById('vinculacionTipo').value;
        const vinculacionId = document.getElementById('vinculacionId').value;

        if (!proveedor || !departamento) {
            alert('Complete los campos obligatorios');
            return;
        }

        const items = [];
        document.querySelectorAll('#itemsBody tr').forEach(tr => {
            const desc = tr.querySelector('.item-desc')?.value;
            const sku = tr.querySelector('.item-sku')?.value;
            const qty = parseInt(tr.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            const link = tr.querySelector('.item-link')?.value;
            if (desc && qty > 0) {
                items.push({ desc, sku, qty, price, link });
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
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            let inserted;
            if (compraId) {
                await comprasService.update(compraId, nuevaCompra, csrfToken);
                inserted = { id: compraId };
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

    async function _crearOrdenDesdeSolicitud(id, tipo) {
        console.log('[Compras] Crear orden desde solicitud', { id, tipo });

        let compraData = null;
        let ordenTallerData = null;
        let departamentoPorDefecto = 'Laboratorio de Electrónica';

        try {
            // Primero obtener datos de la orden de taller
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

            // Buscar la orden de compra vinculada (creada por Laboratorio)
            if (ordenTallerData) {
                const { data: comprasList, error } = await window.supabase
                    .from('compras')
                    .select('*')
                    .eq('vinculacion->>tipo', 'taller')
                    .eq('vinculacion->>id', id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (error) {
                    console.error('[Compras] Error buscando compra vinculada:', error);
                } else if (comprasList && comprasList.length > 0) {
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
        document.getElementById('vinculacionTipo').value = tipo;
        document.getElementById('vinculacionId').value = id;
        document.getElementById('departamentoSelect').value = departamentoPorDefecto;

        // Importar items desde la orden de compras (creada por Laboratorio)
        const itemsBody = document.getElementById('itemsBody');
        itemsBody.innerHTML = '';
        const itemsAImportar = compraData?.items || [];

        console.log('[Compras] Items a importar:', itemsAImportar.length);
        console.log('[Compras] Equipo info:', ordenTallerData?.equipo, ordenTallerData?.marca, ordenTallerData?.modelo, ordenTallerData?.serie);

        if (itemsAImportar.length > 0) {
            itemsAImportar.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" value="${item.descripcion || item.desc || ''}" class="item-desc"></td>
                    <td><input type="text" value="${item.sku || ''}" class="item-sku"></td>
                    <td><input type="number" value="${item.cantidad || item.qty || 1}" min="1" class="item-qty"></td>
                    <td><input type="number" value="${item.precio_unitario || item.price || 0}" step="0.01" class="item-price"></td>
                    <td><input type="url" value="${item.link || ''}" placeholder="Link" class="item-link"></td>
                    <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
                `;
                itemsBody.appendChild(row);
            });
        } else {
            // Sin items - crear uno con info del equipo
            const equipo = ordenTallerData?.equipo || 'Equipo sin nombre';
            const marca = ordenTallerData?.marca || '';
            const modelo = ordenTallerData?.modelo || '';
            const serie = ordenTallerData?.serie || '';
            const falla = ordenTallerData?.falla_reportada || 'Servicio requerido';

            const row = document.createElement('tr');
            const desc = `${falla} - ${equipo}${marca ? ' ' + marca : ''}${modelo ? ' ' + modelo : ''}${serie ? ' S/N: ' + serie : ''}`;
            row.innerHTML = `
                <td><input type="text" value="${desc}" class="item-desc"></td>
                <td><input type="text" placeholder="SKU" class="item-sku"></td>
                <td><input type="number" value="1" min="1" class="item-qty"></td>
                <td><input type="number" value="0" step="0.01" class="item-price"></td>
                <td><input type="url" placeholder="Link" class="item-link"></td>
                <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
            `;
            itemsBody.appendChild(row);
        }

        _nuevaOrden();
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
        async function _generarPDFCompra(preview = false) {
            if (!currentCompra || !window.pdfGenerator) return;
            var user = await authService.getCurrentProfile();
            var data = {
                folio: currentCompra.folio,
                proveedor: currentCompra.proveedor,
                fecha_requerida: currentCompra.fecha_requerida,
                items: (currentCompra.items || []).map(function (i) { return { desc: i.desc, sku: i.sku, qty: i.qty, price: i.price }; }),
                total: currentCompra.total
            };
            await window.pdfGenerator.generateOrdenCompra(data, user, preview);
        }
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
        document.getElementById('guardarNuevaOrden').addEventListener('click', _guardarNuevaOrden);
        var guardarBorradorBtn = document.getElementById('guardarBorradorBtn');
        if (guardarBorradorBtn) guardarBorradorBtn.addEventListener('click', _guardarBorrador);

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
        const c1 = document.getElementById('opCountTaller');
        const c2 = document.getElementById('opCountMotor');
        const c3 = document.getElementById('opCountAuto');
        if (c1) c1.textContent = '(' + nt + ')';
        if (c2) c2.textContent = '(' + nm + ')';
        if (c3) c3.textContent = '(' + np + ')';
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
                const dep = document.getElementById('departamentoSelect');
                if (dep) {
                    if (t === 'taller') dep.value = 'Laboratorio de Electrónica';
                    else if (t === 'motor') dep.value = 'Taller Motores';
                    else dep.value = 'Automatización';
                }
                const selTipo = document.getElementById('vinculacionTipo');
                if (selTipo) selTipo.value = t === 'automatizacion' ? 'automatizacion' : t;
                const selId = document.getElementById('vinculacionId');
                if (selId) selId.value = vid;
                _nuevaOrden();
            });
        });
    }

    function _consumeVinculacionUrlParams() {
        const p = new URLSearchParams(window.location.search);
        const vt = p.get('vincTipo');
        const vid = p.get('vincId');
        if (!vt || !vid) return;
        const dep = document.getElementById('departamentoSelect');
        if (dep) {
            if (vt === 'taller') dep.value = 'Laboratorio de Electrónica';
            else if (vt === 'motor') dep.value = 'Taller Motores';
            else if (vt === 'automatizacion' || vt === 'proyecto') dep.value = 'Automatización';
        }
        const selTipo = document.getElementById('vinculacionTipo');
        if (selTipo) selTipo.value = vt === 'proyecto' ? 'proyecto' : vt;
        const selId = document.getElementById('vinculacionId');
        if (selId) selId.value = vid;
        _nuevaOrden();
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
        _verProveedor,
        _recibirCompra,
        _descargarOC
    };
})();

window.comprasModule = ComprasModule;