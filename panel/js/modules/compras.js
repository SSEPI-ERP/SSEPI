// ================================================
// ARCHIVO: compras.js
// DESCRIPCIÓN: Módulo de Compras adaptado a Supabase
// BASADO EN: compras-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de órdenes de compra, proveedores, vinculación con talleres
// ================================================

import { authService } from '../core/auth-service.js';
import { canSeeCostsInModule, applyBodyFinancialClass } from '../core/ssepi-runtime/cost-visibility.js';
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
    /** Tabulador Excel cargado en memoria (clientes_tabulador) para enriquecer PDFs
     *  con RFC/dirección/contacto_referencia/km cuando el contacto Pac no lo trae. */
    let _tabuladorLookup = new Map();
    let _tabuladorLookupReady = null;
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
    const inventarioService = createDataService('inventario');
    const bomService = createDataService('bom_automatizacion');

    let catalogoPreciosCache = null;

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];
    let perfilUsuario = null;

    function _verCostosCompras() {
        return canSeeCostsInModule(perfilUsuario, 'compras');
    }

    function _esAdminSistema() {
        const rol = String(perfilUsuario?.rol || '').toLowerCase();
        return rol === 'admin' || rol === 'superadmin';
    }

    /** Checkbox 3% administrativo: solo admin/superadmin con visibilidad financiera. */
    function _puedeAjuste3pct() {
        return false;
    }

    function _esCompraAutomatizacion(compra) {
        const v = compra?.vinculacion;
        if (v && ['proyecto', 'automatizacion'].includes(v.tipo)) return true;
        return /automatiz/i.test(String(compra?.departamento || ''));
    }

    function _filtrarSoloMaterialesCompra(items) {
        return (items || []).filter((i) => {
            const t = String(i.tipo || 'material').toLowerCase();
            return !t || t === 'material' || t === 'consumible' || t === 'inventario';
        });
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Compras] Conectado');
        try {
            perfilUsuario = await authService.getCurrentProfile();
            applyBodyFinancialClass(perfilUsuario);
        } catch(e) {}
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
        ['imprimirOrdenCompraBtn', 'vistaPreviaPDFOrdenCompraBtn', 'descargarPDFOrdenCompraBtn'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
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

    function _isSsepiNextLocal() {
        return window.location.port === '3333'
            || window.location.port === '3443'
            || (typeof window.location.hostname === 'string' && window.location.hostname.endsWith('.trycloudflare.com'))
            || window.__SSEPI_NEXT_MODE__ === true;
    }

    /** En SSEPI-NEXT los ítems viven en compras.items (JSON), no en tabla compras_items. */
    async function _fetchItemsCompraDb(compra, compraId) {
        if (_isSsepiNextLocal()) return _itemsDesdeJsonCompra(compra);
        try {
            const { data: itemsRows, error } = await window.supabase
                .from('compras_items')
                .select('*')
                .eq('compra_id', compraId)
                .order('created_at', { ascending: true });
            if (!error && itemsRows?.length) return itemsRows;
        } catch (e) { /* cloud sin tabla */ }
        return _itemsDesdeJsonCompra(compra);
    }

    function _itemsDesdeJsonCompra(compra) {
        if (!compra || !Array.isArray(compra.items) || !compra.items.length) return [];
        return compra.items.map((it, idx) => ({
            id: 'local-item-' + idx,
            sku: it.sku || '',
            nombre: it.nombre || '',
            descripcion: [it.nombre, it.descripcion].filter(Boolean).join(' — ')
                || it.descripcion || it.nombre || it.sku || 'Material',
            cantidad: parseInt(it.cantidad, 10) || 1,
            costo_unitario: Number(it.costo_unitario ?? it.precio ?? it.price) || 0,
            costo_total: Number(it.costo_total) || 0,
            link_proveedor: it.link_proveedor || it.link || '',
            tipo: it.tipo || 'material'
        }));
    }

    function _decodeHtmlFolio(s) {
        if (!s || typeof s !== 'string') return s;
        return s.replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&amp;/g, '&');
    }

    function _parseJsonArray(val) {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string' && val.trim()) {
            try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
    }

    function _normalizeCompraRow(c) {
        const row = { ...c };
        if (typeof row.data === 'string') {
            try { row.data = JSON.parse(row.data); } catch { row.data = {}; }
        }
        if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
            if (!row.items?.length && Array.isArray(row.data.items)) row.items = row.data.items;
        }
        if (typeof row.vinculacion === 'string') {
            try { row.vinculacion = JSON.parse(row.vinculacion); } catch { row.vinculacion = null; }
        }
        if (row.folio) row.folio = _decodeHtmlFolio(row.folio);
        if (row.estado != null && row.estado !== '') row.estado = Number(row.estado);
        if (!row.fecha_creacion) row.fecha_creacion = row.created_at || row.fecha;
        if (Array.isArray(row.items) === false && row.items && typeof row.items === 'string') {
            try { row.items = JSON.parse(row.items); } catch { row.items = []; }
        }
        return row;
    }

    async function _loadCompras() {
        try {
            const raw = await comprasService.select({}, { orderBy: 'created_at', ascending: false, page: 0, pageSize: 500 });
            compras = (raw || []).map(_normalizeCompraRow);
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

    function _escCompraAttr(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function _esOrdenPorProveedorEnTabla() {
        const tipo = document.getElementById('ordenTipoSelect')?.value || 'sencilla';
        const dept = document.getElementById('departamentoSelect')?.value || '';
        return tipo === 'personalizada' || /automatiz/i.test(dept);
    }

    function _actualizarColumnasProveedorTabla() {
        const show = _esOrdenPorProveedorEnTabla();
        document.querySelectorAll('.col-proveedor-item').forEach((th) => {
            th.style.display = show ? '' : 'none';
        });
        document.querySelectorAll('.item-proveedor').forEach((inp) => {
            const td = inp.closest('td');
            if (td) td.style.display = show ? '' : 'none';
        });
    }

    function _populateProveedoresSelect() {
        const inp = document.getElementById('proveedorSelect');
        const list = document.getElementById('proveedoresCompraList');
        if (!inp || !list) return;
        const prev = inp.value;
        list.innerHTML = '';
        proveedoresVista.forEach(p => {
            const label = (p.nombre || p.empresa || '').trim();
            if (!label) return;
            const opt = document.createElement('option');
            opt.value = label;
            list.appendChild(opt);
        });
        if (prev) inp.value = prev;
        _actualizarColumnasProveedorTabla();
    }

    function _celdaProveedorTd(it) {
        const show = _esOrdenPorProveedorEnTabla();
        const prov = it?.proveedor || it?.proveedor_nombre || '';
        if (!show) return '';
        return `<td class="td-proveedor-item"><input type="text" class="item-proveedor" list="proveedoresCompraList" value="${_escCompraAttr(prov)}" placeholder="Proveedor"></td>`;
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
                const raw = c.fecha_creacion || c.created_at || c.fecha;
                if (!raw) return true;
                const f = new Date(raw);
                if (Number.isNaN(f.getTime())) return true;
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroDepartamento !== 'todos') {
            filtered = filtered.filter(c => c.departamento === filtroDepartamento);
        }
        if (filtroEstado !== 'todos') {
            const estNum = parseInt(filtroEstado, 10);
            filtered = filtered.filter(c => Number(c.estado) === estNum);
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
        const esAdminC = _verCostosCompras();
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
        const esAdminC = _verCostosCompras();
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
        const esAdminC = _verCostosCompras();
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
        const compra = compras.find(c => String(c.id) === String(id));
        if (!compra) return;
        currentCompra = compra;
        compraId = id;
        isNewCompra = false;
        const modal = document.getElementById('detalleModal');
        const contenido = document.getElementById('detalleContenido');
        contenido.innerHTML = '<div style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i><p>Cargando...</p></div>';
        document.getElementById('editarOrdenBtn').style.display = 'inline-flex';
        document.getElementById('editarOrdenBtn').onclick = () => _editarOrden(id);

        let itemsData = await _cargarItemsCompra(compra, id);
        itemsData = await _enriquecerItemsDesdeProyecto(compra, itemsData);
        if (_esCompraAutomatizacion(compra)) itemsData = _filtrarSoloMaterialesCompra(itemsData);
        currentCompra.itemsData = itemsData;
        _recalcularTotalesCompra(currentCompra);
        await _persistirItemsRecalculados(compra);

        const html = await _generarDetalleHTML(compra);
        contenido.innerHTML = html;
        modal.classList.add('active');
    }

    async function _cargarItemsCompra(compra, compraId) {
        return _fetchItemsCompraDb(compra, compraId);
    }

    async function _loadCatalogoPrecios() {
        if (catalogoPreciosCache) return catalogoPreciosCache;
        const bySku = new Map();
        const byNombre = [];
        try {
            const [bomData, invData] = await Promise.all([
                bomService.select({}, { orderBy: 'numero_item', ascending: true, page: 0, pageSize: 2500 }),
                inventarioService.select({ activo: true }, { orderBy: 'sku', ascending: true, page: 0, pageSize: 2500 })
            ]);
            (bomData || []).forEach((b) => {
                const sku = String(b.part_number || b.numero_parte || b.codigo || '').trim().toUpperCase();
                const costo = Number(b.mejor_precio) || Number(b.precio) || 0;
                const nombre = String(b.descripcion || b.description || b.part_number || '').trim();
                if (sku && costo > 0) bySku.set(sku, { costo, nombre, sku });
                if (nombre && costo > 0) byNombre.push({ key: nombre.toLowerCase(), costo, nombre, sku });
            });
            (invData || []).forEach((i) => {
                const sku = String(i.sku || i.codigo || '').trim().toUpperCase();
                const costo = Number(i.costo ?? i.precio ?? i.precio_venta) || 0;
                const nombre = String(i.nombre || i.descripcion || '').trim();
                if (sku && costo > 0 && !bySku.has(sku)) bySku.set(sku, { costo, nombre, sku });
                if (nombre && costo > 0) byNombre.push({ key: nombre.toLowerCase(), costo, nombre, sku });
            });
        } catch (e) {
            console.warn('[Compras] catálogo precios:', e);
        }
        catalogoPreciosCache = { bySku, byNombre };
        return catalogoPreciosCache;
    }

    function _costoDesdeCatalogo(item, catalogo) {
        const sku = String(item.sku || '').trim().toUpperCase();
        if (sku && catalogo.bySku.has(sku)) return catalogo.bySku.get(sku).costo;
        const texto = String(item.nombre || item.descripcion || '').trim().toLowerCase();
        if (!texto || texto.length < 8) return 0;
        const hit = catalogo.byNombre.find((e) => e.key === texto || e.key.includes(texto) || texto.includes(e.key));
        return hit ? hit.costo : 0;
    }

    function _costoUnitarioMaterial(m, catalogo) {
        const directo = Number(m.costo_unitario ?? m.costo ?? m.precio);
        if (directo > 0) return directo;
        return _costoDesdeCatalogo(m, catalogo);
    }

    async function _aplicarPreciosCatalogoAItems(itemsData) {
        if (!itemsData?.length) return itemsData || [];
        const catalogo = await _loadCatalogoPrecios();
        return itemsData.map((it, idx) => {
            let cu = Number(it.costo_unitario ?? it.precio ?? it.price) || 0;
            if (cu <= 0) cu = _costoDesdeCatalogo(it, catalogo);
            const q = parseInt(it.cantidad, 10) || 1;
            const nombre = it.nombre || it.descripcion || (cu > 0 ? 'Material' : '');
            const descripcion = it.descripcion || it.nombre || '';
            return {
                ...it,
                id: it.id || 'item-' + idx,
                nombre: nombre || 'Material',
                descripcion,
                cantidad: q,
                costo_unitario: cu,
                costo_total: Number(it.costo_total) > 0 ? Number(it.costo_total) : cu * q
            };
        });
    }

    async function _lineasDesdeProyectoAuto(proy, compra) {
        const catalogo = await _loadCatalogoPrecios();
        const markupPct = compra.data?.costo_resumen?.markup_materiales_pct ?? 17;
        const materiales = _parseJsonArray(proy.materiales);
        const actividades = _parseJsonArray(proy.actividades);
        const lineas = [];
        let matBase = 0;

        materiales.forEach((m, idx) => {
            const cu = _costoUnitarioMaterial(m, catalogo);
            const q = parseInt(m.cantidad, 10) || 1;
            const ct = cu * q;
            matBase += ct;
            const nombre = m.nombre || m.descripcion || m.sku || 'Material';
            lineas.push({
                id: 'proy-m-' + idx,
                sku: m.sku || '',
                nombre,
                descripcion: m.descripcion || m.sku || '',
                cantidad: q,
                costo_unitario: cu,
                costo_total: ct,
                tipo: 'material'
            });
        });

        const markupMonto = matBase * (markupPct / 100);
        if (markupMonto > 0.005) {
            lineas.push({
                id: 'proy-markup',
                nombre: `Recargo materiales (${markupPct}%)`,
                descripcion: 'Markup ingeniería / automatización',
                cantidad: 1,
                costo_unitario: markupMonto,
                costo_total: markupMonto,
                tipo: 'markup'
            });
        }

        actividades.forEach((a, idx) => {
            if (!a.servicio) return;
            const hrs = Number(a.horas) || 1;
            const tarifa = Number(a.tarifa) || (a.tipo === 'P' ? 80 : 120);
            lineas.push({
                id: 'proy-s-' + idx,
                nombre: a.servicio,
                descripcion: a.area || 'Ingeniería',
                cantidad: hrs,
                costo_unitario: tarifa,
                costo_total: hrs * tarifa,
                tipo: 'servicio'
            });
        });

        const km = Number(proy.auto_costo_km) || 0;
        const hrsCam = Number(proy.auto_costo_hrs_cam) || 0;
        if (typeof CostosEngine !== 'undefined') {
            const costoGas = CostosEngine.calcularCostoGasolina(km);
            const costoCam = CostosEngine.calcularCostoCamioneta(hrsCam);
            if (costoGas > 0) {
                lineas.push({
                    id: 'proy-gas',
                    nombre: 'Gasolina (traslado)',
                    descripcion: km + ' km',
                    cantidad: 1,
                    costo_unitario: costoGas,
                    costo_total: costoGas,
                    tipo: 'traslado'
                });
            }
            if (costoCam > 0) {
                lineas.push({
                    id: 'proy-cam',
                    nombre: 'Camioneta (traslado)',
                    descripcion: hrsCam + ' h',
                    cantidad: 1,
                    costo_unitario: costoCam,
                    costo_total: costoCam,
                    tipo: 'traslado'
                });
            }
        }

        return lineas;
    }

    function _subtotalItems(items) {
        return (items || []).reduce((s, it) => {
            const pu = Number(it.costo_unitario) || 0;
            const q = Number(it.cantidad) || 0;
            return s + (Number(it.costo_total) || pu * q);
        }, 0);
    }

    async function _enriquecerItemsDesdeProyecto(compra, itemsData) {
        let items = await _aplicarPreciosCatalogoAItems(itemsData || []);
        const vinc = compra.vinculacion;
        const esAuto = vinc && ['proyecto', 'automatizacion'].includes(vinc.tipo);

        if (esAuto) {
            try {
                const proy = await proyectosService.getById(vinc.id);
                if (proy) {
                    const rebuilt = await _lineasDesdeProyectoAuto(proy, compra);
                    if (rebuilt.length) {
                        const subRebuilt = _subtotalItems(rebuilt);
                        const subItems = _subtotalItems(items);
                        if (subRebuilt > subItems || subItems <= 0) items = rebuilt;
                    }
                }
            } catch (e) {
                console.warn('[Compras] enriquecer desde proyecto:', e);
            }
        }

        if (_subtotalItems(items) <= 0) {
            items = await _aplicarPreciosCatalogoAItems(items);
        }

        return items;
    }

    async function _persistirItemsRecalculados(compra) {
        const sub = _subtotalItems(compra.itemsData);
        if (sub <= 0) return;
        const itemsPlain = (compra.itemsData || []).map((it) => ({
            sku: it.sku || '',
            nombre: it.nombre || '',
            descripcion: it.descripcion || '',
            cantidad: parseInt(it.cantidad, 10) || 1,
            costo_unitario: Number(it.costo_unitario) || 0,
            costo_total: Number(it.costo_total) || 0,
            tipo: it.tipo || 'material',
            link_proveedor: it.link_proveedor || ''
        }));
        const itemsChanged = JSON.stringify(compra.items || []) !== JSON.stringify(itemsPlain);
        const antesSinCosto = !(compra.items || []).some((i) => Number(i.costo_unitario) > 0);
        if (!itemsChanged && !antesSinCosto) return;

        compra.items = itemsPlain;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await comprasService.update(compra.id, {
                items: itemsPlain,
                subtotal: compra.subtotal,
                iva: compra.iva,
                total: compra.total,
                updated_at: new Date().toISOString()
            }, csrfToken);
            const idx = compras.findIndex((c) => String(c.id) === String(compra.id));
            if (idx >= 0) compras[idx] = { ...compras[idx], ...compra };
        } catch (e) {
            console.warn('[Compras] persistir items recalculados:', e);
        }
    }

    function _recalcularTotalesCompra(compra) {
        const items = compra.itemsData || [];
        const sub = items.reduce((s, it) => {
            const pu = Number(it.costo_unitario) || 0;
            const q = Number(it.cantidad) || 0;
            const ct = Number(it.costo_total) || (pu * q);
            it.costo_total = ct;
            return s + ct;
        }, 0);
        if (_esCompraAutomatizacion(compra)) {
            compra.subtotal = sub;
            compra.iva = 0;
            compra.total = sub;
            compra._extra3pct = 0;
            return;
        }
        const aplica3 = _puedeAjuste3pct() && compra.data?.ajuste_3pct === true;
        const extra3 = aplica3 ? sub * 0.02 : 0;
        const subCon3 = sub + extra3;
        compra.subtotal = subCon3;
        compra.iva = subCon3 * 0.16;
        compra.total = subCon3 + compra.iva;
        compra._extra3pct = extra3;
    }

    async function _toggleAjuste3pct(compraId, activar) {
        if (!_puedeAjuste3pct()) return;
        const compra = compras.find((c) => String(c.id) === String(compraId)) || currentCompra;
        if (!compra) return;
        compra.data = { ...(compra.data || {}), ajuste_3pct: !!activar };
        _recalcularTotalesCompra(compra);
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await comprasService.update(compra.id, {
                data: compra.data,
                subtotal: compra.subtotal,
                iva: compra.iva,
                total: compra.total,
                updated_at: new Date().toISOString()
            }, csrfToken);
        } catch (e) { console.warn('[Compras] guardar 3%:', e); }
        if (currentCompra && String(currentCompra.id) === String(compraId)) {
            const contenido = document.getElementById('detalleContenido');
            if (contenido) contenido.innerHTML = await _generarDetalleHTML(compra);
        }
    }

    function _resolverOrdenVinculada(vinc) {
        if (!vinc) return null;
        const id = vinc.id;
        const tipo = vinc.tipo;
        if (tipo === 'taller') {
            const o = ordenesTaller.find((t) => String(t.id) === String(id));
            if (!o) return null;
            return { modulo: 'Laboratorio', folio: o.folio, estado: o.estado || o.estatus_actual, cliente: o.cliente_nombre, equipo: o.equipo };
        }
        if (tipo === 'motor') {
            const o = ordenesMotores.find((m) => String(m.id) === String(id));
            if (!o) return null;
            return { modulo: 'Motores', folio: o.folio, estado: o.estado || o.estatus_actual, cliente: o.cliente_nombre, equipo: o.motor || o.equipo };
        }
        if (tipo === 'proyecto' || tipo === 'automatizacion') {
            const p = proyectos.find((pr) => String(pr.id) === String(id));
            if (!p) return null;
            return {
                modulo: tipo === 'automatizacion' ? 'Automatización' : 'Proyectos',
                folio: p.folio || vinc.folio || vinc.folio_taller,
                estado: p.estado || p.estatus_actual,
                cliente: p.cliente || p.cliente_nombre,
                equipo: p.nombre
            };
        }
        return null;
    }

    async function _fetchEstatusVinculacionRemota(vinc) {
        const local = _resolverOrdenVinculada(vinc);
        if (local && local.folio) return local;
        if (!vinc || !window.supabase) return local;
        try {
            const id = vinc.id;
            if (vinc.tipo === 'taller') {
                const { data: o } = await window.supabase.from('ordenes_taller').select('*').eq('id', id).maybeSingle();
                if (o) return { modulo: 'Laboratorio', folio: o.folio, estado: o.estado, cliente: o.cliente_nombre, equipo: o.equipo };
            } else if (vinc.tipo === 'motor') {
                const { data: o } = await window.supabase.from('ordenes_motores').select('*').eq('id', id).maybeSingle();
                if (o) return { modulo: 'Motores', folio: o.folio, estado: o.estado, cliente: o.cliente_nombre, equipo: o.motor || o.equipo };
            } else if (vinc.tipo === 'proyecto' || vinc.tipo === 'automatizacion') {
                const { data: p } = await window.supabase.from('proyectos_automatizacion').select('*').eq('id', id).maybeSingle();
                if (p) {
                    return {
                        modulo: vinc.tipo === 'automatizacion' ? 'Automatización' : 'Proyectos',
                        folio: p.folio,
                        estado: p.estado,
                        cliente: p.cliente,
                        equipo: p.nombre
                    };
                }
            }
        } catch (e) {
            console.warn('[Compras] Error obteniendo estatus de orden vinculada:', e);
        }
        return local;
    }

    async function _generarDetalleHTML(compra) {
        const esAdminC = _verCostosCompras();
        let estatusOrden = compra.vinculacion ? await _fetchEstatusVinculacionRemota(compra.vinculacion) : null;

        const clienteInfo = (compra.data && compra.data.cliente_info) ? compra.data.cliente_info : null;
        const soloAuto = _esCompraAutomatizacion(compra);
        const itemsProveedor = soloAuto ? [] : (currentCompra.itemsData || []).filter(i => i.link_proveedor);
        const itemsInventario = soloAuto
            ? (currentCompra.itemsData || [])
            : (currentCompra.itemsData || []).filter(i => !i.link_proveedor);
        const colEntrega = soloAuto ? '<th>Tiempo entrega (días)</th>' : '';
        const fmtEntrega = (item) => {
            const d = item.tiempo_entrega_dias ?? item.lead_time_dias;
            return d != null && d !== '' ? String(d) : '—';
        };

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
            ${compra.vinculacion?.tipo === 'taller' && compra.estado_interno === 'preregistro' && (itemsProveedor.length + itemsInventario.length === 0) ? `
            <div class="preregistro-banner">
                <i class="fas fa-info-circle"></i>
                <span><strong>Preregistro · ${compra.folio || ''}</strong> ·
                Esta orden es un <strong>preregistro del Laboratorio</strong>: aún no se han asignado materiales.
                ${estatusOrden?.cliente ? 'Cliente: <strong>' + (estatusOrden.cliente) + '</strong>. ' : ''}
                Espere a que el técnico agregue las refacciones en la orden de Laboratorio.
                </span>
            </div>
            ` : ''}
            ${soloAuto ? '' : `<div class="detalle-section">
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
            </div>`}
            <div class="detalle-section">
                <h4><i class="fas fa-warehouse"></i> ${soloAuto ? 'Materiales requeridos' : 'Materiales de Inventario'} (${itemsInventario.length})</h4>
                <table class="items-table">
                    <thead><tr><th>Descripción</th><th>Cant.</th>${soloAuto ? colEntrega : '<th>Recibido</th><th>Facturado</th>'}${esAdminC ? '<th>Costo unit. compra</th>' : ''}${soloAuto ? '' : (esAdminC ? '<th>Impuestos (16%)</th>' : '')}<th>${soloAuto ? 'Importe' : 'Desc.%'}</th>${esAdminC && !soloAuto ? '<th>Importe</th>' : ''}</tr></thead>
                    <tbody>
                        ${itemsInventario.length ? itemsInventario.map(item => {
                            const pu = Number(item.costo_unitario) || 0;
                            const qty = Number(item.cantidad) || 0;
                            const desc = Number(item.descuento_pct) || 0;
                            const base = pu * qty;
                            const descMonto = base * (desc / 100);
                            const sub = base - descMonto;
                            const iva = soloAuto ? 0 : sub * 0.16;
                            const totalItem = soloAuto ? sub : sub + iva;
                            return `
                            <tr>
                                <td>${item.nombre || item.descripcion || '—'}${item.sku ? `<br><small>${item.sku}</small>` : ''}</td>
                                <td>${qty}</td>
                                ${soloAuto ? `<td>${fmtEntrega(item)}</td>` : `
                                <td>${compra.estado >= 4 ? '✅ ' + (compra.fecha_recepcion ? new Date(compra.fecha_recepcion).toLocaleDateString() : '') : '—'}</td>
                                <td>${compra.estado >= 5 ? '✅' : '—'}</td>`}
                                ${esAdminC ? `<td>$${pu.toFixed(2)}</td>` : ''}
                                ${soloAuto ? '' : (esAdminC ? `<td>$${iva.toFixed(2)}</td>` : '')}
                                <td>${soloAuto ? (esAdminC ? `$${totalItem.toFixed(2)}` : '—') : (desc > 0 ? desc + '%' : '—')}</td>
                                ${esAdminC && !soloAuto ? `<td>$${totalItem.toFixed(2)}</td>` : ''}
                            </tr>`;
                        }).join('') : `<tr><td colspan="${soloAuto ? (esAdminC ? 5 : 3) : (esAdminC ? 8 : 4)}">No hay materiales</td></tr>`}
                    </tbody>
                </table>
                ${soloAuto ? `
                <div class="total-final" style="margin-top:12px;">
                    <div style="font-size:18px;"><strong>Total compra (materiales):</strong> ${esAdminC ? '$' + (compra.total || 0).toFixed(2) : '—'}</div>
                    <p style="font-size:12px;color:#64748b;margin-top:6px;">Margen, servicios y cotización al cliente se gestionan en Ventas.</p>
                </div>` : ''}
                ${(!soloAuto && compra.data?.costo_resumen && esAdminC) ? `
                <div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;">
                    <strong>Resumen Automatización</strong>
                    <div>Materiales base: $${Number(compra.data.costo_resumen.materiales_base || 0).toFixed(2)}</div>
                    <div>Markup ${compra.data.costo_resumen.markup_materiales_pct || 17}%: $${Number(compra.data.costo_resumen.markup_materiales_monto || 0).toFixed(2)}</div>
                </div>` : ''}
                ${(!soloAuto && _puedeAjuste3pct()) ? `
                <div style="margin-top:12px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;">
                        <input type="checkbox" ${compra.data?.ajuste_3pct ? 'checked' : ''} onchange="comprasModule._toggleAjuste3pct('${compra.id}', this.checked)">
                        Añadir 2% administrativo (solo en esta pantalla, no va al PDF)
                    </label>
                    ${compra._extra3pct > 0 ? `<div style="margin-top:6px;color:#92400e;">Cargo 2%: $${compra._extra3pct.toFixed(2)}</div>` : ''}
                </div>
                <div class="total-final">
                    <div><strong>Subtotal:</strong> $${(compra.subtotal || 0).toFixed(2)}</div>
                    <div><strong>IVA (16%):</strong> $${(compra.iva || 0).toFixed(2)}</div>
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

    async function _poblarModalEdicionCompra(compra, opts = {}) {
        const modal = document.getElementById('nuevaOrdenModal');
        const title = modal.querySelector('.modal-title');
        if (title) {
            title.innerHTML = opts.titulo || '<i class="fas fa-edit"></i> Editar Orden de Compra';
        }

        document.getElementById('proveedorSelect').value = compra.proveedor || '';
        document.getElementById('departamentoSelect').value = compra.departamento || 'Laboratorio de Electrónica';
        document.getElementById('fechaRequerida').value = compra.fecha_requerida
            ? String(compra.fecha_requerida).split('T')[0]
            : new Date().toISOString().split('T')[0];
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

        const cliDiv = document.getElementById('clienteInfoCompra');
        const cliGrid = document.getElementById('clienteInfoGrid');
        let ci = (compra.data && compra.data.cliente_info) ? compra.data.cliente_info : null;
        if (!ci && compra.vinculacion) {
            const est = _resolverOrdenVinculada(compra.vinculacion) || await _fetchEstatusVinculacionRemota(compra.vinculacion);
            if (est?.cliente) ci = { nombre: est.cliente };
        }
        if (ci && ci.nombre) {
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

        document.getElementById('itemsBody').innerHTML = '';
        document.getElementById('itemsBodyInventario').innerHTML = '';
        let itemsData = await _cargarItemsCompra(compra, compra.id);
        itemsData = await _enriquecerItemsDesdeProyecto(compra, itemsData);
        const soloAuto = _esCompraAutomatizacion(compra);
        if (soloAuto) itemsData = _filtrarSoloMaterialesCompra(itemsData);
        if (itemsData.length) {
            itemsData.forEach((it) => {
                if (!soloAuto && it.link_proveedor) _agregarItemRowConDatos(it);
                else _agregarItemRowInventarioConDatos(it);
            });
        } else {
            _agregarItemRow();
        }
        modal.classList.add('active');
    }

    async function _editarOrden(id) {
        const compra = compras.find((c) => String(c.id) === String(id)) || currentCompra;
        if (!compra) { _showToast('Orden no encontrada', 'error'); return; }

        document.getElementById('detalleModal').classList.remove('active');

        isNewCompra = false;
        currentCompra = compra;
        compraId = compra.id;

        await _poblarModalEdicionCompra(compra, {
            titulo: '<i class="fas fa-edit"></i> Editar Orden de Compra'
        });
    }

    function _agregarItemRowConDatos(it) {
        const tbody = document.getElementById('itemsBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre" value="${_escCompraAttr(it.nombre)}"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc" value="${_escCompraAttr(it.descripcion)}"></td>
            <td><input type="text" placeholder="SKU" class="item-sku" value="${_escCompraAttr(it.sku)}"></td>
            ${_celdaProveedorTd(it)}
            <td><input type="number" value="${it.cantidad || 1}" min="1" class="item-qty"></td>
            <td><input type="number" value="${(Number(it.costo_unitario) || 0).toFixed(2)}" step="0.01" class="item-price"></td>
            <td><input type="url" placeholder="Link" class="item-link" value="${_escCompraAttr(it.link_proveedor)}"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
        _actualizarColumnasProveedorTabla();
    }

    function _agregarItemRowInventarioConDatos(it) {
        const tbody = document.getElementById('itemsBodyInventario');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="Nombre" class="item-nombre" value="${_escCompraAttr(it.nombre)}"></td>
            <td><input type="text" placeholder="Descripción" class="item-desc" value="${_escCompraAttr(it.descripcion)}"></td>
            <td><input type="text" placeholder="SKU" class="item-sku" value="${_escCompraAttr(it.sku)}"></td>
            ${_celdaProveedorTd(it)}
            <td><input type="number" value="${it.cantidad || 1}" min="1" class="item-qty"></td>
            <td><input type="number" value="${(Number(it.costo_unitario) || 0).toFixed(2)}" step="0.01" class="item-price"></td>
            <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(row);
        _actualizarColumnasProveedorTabla();
    }

    function _leerItemsDesdeFormulario() {
        const defProv = (document.getElementById('proveedorSelect')?.value || '').trim();
        const items = [];
        const pushRow = (tr, origen) => {
            const nombre = tr.querySelector('.item-nombre')?.value?.trim() || '';
            const desc = tr.querySelector('.item-desc')?.value?.trim() || '';
            const sku = tr.querySelector('.item-sku')?.value?.trim() || '';
            const qty = parseInt(tr.querySelector('.item-qty')?.value, 10) || 0;
            const price = parseFloat(tr.querySelector('.item-price')?.value) || 0;
            const link = tr.querySelector('.item-link')?.value?.trim() || '';
            const proveedor = tr.querySelector('.item-proveedor')?.value?.trim() || defProv || '';
            if (!(nombre || desc) || qty <= 0) return;
            items.push({
                nombre: nombre || desc,
                descripcion: desc || nombre,
                sku,
                cantidad: qty,
                qty,
                costo_unitario: price,
                price,
                link_proveedor: link,
                link,
                origen,
                proveedor,
                tipo: 'material'
            });
        };
        document.querySelectorAll('#itemsBody tr').forEach((tr) => pushRow(tr, 'proveedor'));
        document.querySelectorAll('#itemsBodyInventario tr').forEach((tr) => pushRow(tr, 'inventario'));
        return items;
    }

    function _itemsParaPayloadDb(items) {
        return items.map((i) => ({
            nombre: i.nombre,
            descripcion: i.descripcion,
            sku: i.sku,
            cantidad: i.cantidad,
            costo_unitario: i.costo_unitario,
            costo_total: (i.cantidad || 0) * (i.costo_unitario || 0),
            link_proveedor: i.link_proveedor || '',
            proveedor: i.proveedor || '',
            tipo: 'material',
            tiempo_entrega_dias: i.tiempo_entrega_dias
        }));
    }

    async function _guardarComprasSegmentadasPorProveedor(ctx) {
        if (ctx.editingId || compraId) return false;
        const ordenTipo = ctx.ordenTipo || 'sencilla';
        if (ordenTipo !== 'personalizada') return false;
        const defProv = (document.getElementById('proveedorSelect')?.value || '').trim();
        const groups = new Map();
        ctx.items.forEach((it) => {
            const p = (it.proveedor || defProv || 'PENDIENTE').trim() || 'PENDIENTE';
            if (!groups.has(p)) groups.set(p, []);
            groups.get(p).push(it);
        });
        if (groups.size <= 1) return false;

        const csrfToken = sessionStorage.getItem('csrfToken');
        const folios = [];
        let n = 0;
        for (const [prov, list] of groups.entries()) {
            n += 1;
            const folio = (window.folioFormats?.getNextFolioOrdenCompra)
                ? await window.folioFormats.getNextFolioOrdenCompra()
                : ('PO-A-' + Date.now().toString(36).toUpperCase().slice(-4) + n);
            const total = list.reduce((s, i) => s + (i.cantidad * i.costo_unitario), 0);
            const payload = {
                folio,
                proveedor: prov,
                departamento: ctx.departamento,
                fecha_requerida: ctx.fechaRequerida,
                prioridad: ctx.prioridad,
                vinculacion: ctx.vinculacion,
                items: _itemsParaPayloadDb(list),
                total,
                estado: ctx.estado ?? 1,
                pasos: ctx.pasos,
                confirmado_ventas: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                data: {
                    ...ctx.data,
                    orden_tipo: 'personalizada',
                    segmento_proveedor: prov,
                    compras_segmento: n,
                    compras_segmento_total: groups.size
                }
            };
            await comprasService.insert(payload, csrfToken);
            folios.push(folio);
        }
        if (ctx.vinculacion?.id && folios.length) {
            try {
                const proy = await proyectosService.getById(ctx.vinculacion.id);
                if (proy) {
                    await proyectosService.update(ctx.vinculacion.id, {
                        ...proy,
                        compras_folios: folios,
                        compra_folio: folios[0],
                        compras_segmentadas: folios
                    }, csrfToken);
                }
            } catch (e) { console.warn('[Compras] sync folios proyecto:', e); }
        }
        alert('Se crearon ' + groups.size + ' órdenes de compra (una por proveedor):\n' + folios.join('\n'));
        _addToFeed('🛒', groups.size + ' órdenes de compra por proveedor');
        await _loadCompras();
        document.getElementById('nuevaOrdenModal')?.classList.remove('active');
        return true;
    }

    /**
     * Banner para preregistros de Laboratorio sin materiales.
     * Se inserta ANTES del `<tbody>` de proveedores (no agrega fila).
     */
    function _renderBannerPreregistro(refTbody, opts) {
        const tbody = refTbody || document.getElementById('itemsBody');
        if (!tbody) return;
        // Evitar duplicados
        const prev = tbody.parentElement?.querySelector('.preregistro-banner');
        if (prev) prev.remove();
        const banner = document.createElement('div');
        banner.className = 'preregistro-banner';
        banner.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <span><strong>Preregistro ${opts?.folio ? '· ' + esc(opts.folio) : ''}</strong> ·
            Esta orden es un <strong>preregistro del Laboratorio</strong>: aún no se han asignado materiales.
            ${opts?.cliente ? 'Cliente: <strong>' + esc(opts.cliente) + '</strong>. ' : ''}
            Espere a que el técnico agregue las refacciones en la orden de Laboratorio o agregue materiales manualmente abajo.
        `;
        // Insertar antes del primer `<h4>` de la sección de items, o antes del tbody si no se encuentra
        const parent = tbody.closest('.modal-section, .modal-body, .modal-content, div') || tbody.parentElement;
        if (parent) parent.insertBefore(banner, tbody);
        function esc(s) {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        }
    }

    /**
     * Auto-clasifica items de "enlaces" (proveedor) contra `local_inventario`.
     * Si el SKU del item matchea con uno en inventario y hay stock suficiente,
     * se mueve a `inventario` con `_inventario_id`. Si hay stock parcial,
     * divide: parte a inventario, resto a proveedor.
     *
     * @param {Array<{nombre,sku,cantidad,...}>} enlaces - items de proveedor
     * @param {Array<{id,sku,nombre,stock}>} inventarioCache - productos de local_inventario
     * @returns {{enlaces, inventario}}
     */
    function _mapInventarioMatch(enlaces, inventarioCache) {
        const out = { enlaces: [], inventario: [] };
        if (!Array.isArray(enlaces)) enlaces = [];
        if (!Array.isArray(inventarioCache) || inventarioCache.length === 0) {
            out.enlaces = enlaces.slice();
            return out;
        }
        const normKey = s => String(s || '').toLowerCase().normalize('NFD')
            .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
        const skuMap = new Map();
        const nameMap = new Map();
        for (const p of inventarioCache) {
            if (p.activo === false) continue;
            if (p.sku) skuMap.set(String(p.sku).toLowerCase().trim(), p);
            if (p.nombre) nameMap.set(normKey(p.nombre), p);
        }
        for (const item of enlaces) {
            const qty = Number(item.cantidad) || 1;
            const sku = (item.sku || '').toLowerCase().trim();
            let match = sku ? skuMap.get(sku) : null;
            if (!match && item.nombre) match = nameMap.get(normKey(item.nombre));
            if (match && Number(match.stock) > 0) {
                const stockDisponible = Number(match.stock) || 0;
                if (stockDisponible >= qty) {
                    out.inventario.push({ ...item, cantidad: qty, _inventario_id: match.id });
                } else {
                    out.inventario.push({ ...item, cantidad: stockDisponible, _inventario_id: match.id });
                    out.enlaces.push({ ...item, cantidad: qty - stockDisponible });
                }
            } else {
                out.enlaces.push(item);
            }
        }
        return out;
    }

    /**
     * Carga cache de inventario activo (top ~2000). Usado por auto-clasificador.
     */
    async function _loadInventarioCache() {
        try {
            const all = await inventarioService.select(
                { activo: true },
                { orderBy: 'sku', ascending: true, page: 0, pageSize: 2000 }
            );
            return all || [];
        } catch (e) {
            console.warn('[Compras] _loadInventarioCache:', e);
            return [];
        }
    }

    /**
     * Helper compartido: lee refacciones/componentes de una orden (taller/motor/proyecto)
     * y devuelve { enlaces, inventario, ordenData }. Reutilizado por:
     *   - _cargarItemsDesdeVinculacion (L1010)
     *   - _crearOrdenDesdeSolicitud    (L1551)
     */
    async function _itemsDesdeVinculacion(tipo, idOrden) {
        if (!tipo || !idOrden) return { enlaces: [], inventario: [], ordenData: null };
        const tableByTipo = {
            taller: 'ordenes_taller',
            motor: 'ordenes_motores',
            automatizacion: 'proyectos_automatizacion',
            proyecto: 'proyectos_automatizacion',
        };
        const table = tableByTipo[tipo];
        if (!table) return { enlaces: [], inventario: [], ordenData: null };

        let data = null;
        try {
            const res = await window.supabase.from(table).select('*').eq('id', idOrden).single();
            data = res.data || null;
        } catch (e) {
            console.warn(`[Compras] _itemsDesdeVinculacion: error leyendo ${table}/${idOrden}:`, e);
            return { enlaces: [], inventario: [], ordenData: null };
        }
        if (!data) return { enlaces: [], inventario: [], ordenData: null };

        const dataInner = data.data || {};
        const norm = e => ({
            nombre: e?.nombre || '',
            descripcion: e?.descripcion || '',
            sku: e?.sku || '',
            cantidad: Number(e?.cantidad) || 1,
            link: e?.link || ''
        });
        const normInv = i => ({
            nombre: i?.nombre || '',
            descripcion: i?.descripcion || '',
            sku: i?.sku || '',
            cantidad: Number(i?.cantidad) || 1
        });

        let enlaces = [];
        let inventario = [];
        if (tipo === 'automatizacion' || tipo === 'proyecto') {
            const mats = data.materiales || dataInner.materiales || [];
            enlaces = mats.map(m => ({
                nombre: m.nombre || '',
                descripcion: m.descripcion || '',
                sku: m.sku || '',
                cantidad: Number(m.cantidad) || 1,
                link: ''
            }));
        } else {
            enlaces = [
                ...(data.refacciones_enlaces || dataInner.refacciones_enlaces || []).map(norm),
                ...(data.componentes_compra  || dataInner.componentes_compra  || []).map(norm)
            ];
            inventario = [
                ...(data.refacciones_inventario || dataInner.refacciones_inventario || []).map(normInv),
                ...(data.componentes_inventario  || dataInner.componentes_inventario  || []).map(normInv)
            ];
        }
        return { enlaces, inventario, ordenData: data };
    }

    async function _cargarItemsDesdeVinculacion(tipo, idOrden) {
        if (!tipo || !idOrden) return;
        try {
            let { enlaces, inventario } = await _itemsDesdeVinculacion(tipo, idOrden);
            // Auto-clasificar contra stock físico: items con SKU en inventario
            // se mueven de proveedor → inventario si hay stock suficiente.
            const invCache = await _loadInventarioCache();
            if (invCache.length && enlaces.length) {
                const split = _mapInventarioMatch(enlaces, invCache);
                enlaces = split.enlaces;
                inventario = inventario.concat(split.inventario);
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
            const itemsData = await _fetchItemsCompraDb(compra, compra.id);

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
        _agregarItemRowConDatos({ nombre: '', descripcion: '', sku: '', cantidad: 1, costo_unitario: 0, link_proveedor: '' });
    }

    function _agregarItemRowInventario() {
        _agregarItemRowInventarioConDatos({ nombre: '', descripcion: '', sku: '', cantidad: 1, costo_unitario: 0 });
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

        const items = _leerItemsDesdeFormulario();
        const total = items.reduce((sum, i) => sum + (i.cantidad * i.costo_unitario), 0);
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
            items: _itemsParaPayloadDb(items),
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

        const items = _leerItemsDesdeFormulario();
        if (items.length === 0) {
            alert('Debe agregar al menos un producto');
            return;
        }

        const vinculacion = vinculacionTipo && vinculacionId ? {
            tipo: vinculacionTipo,
            id: vinculacionId,
            nombre: await _getNombreVinculacion(vinculacionTipo, vinculacionId)
        } : null;

        const clienteInfo = window._clienteInfoCompra || null;
        const segmentado = await _guardarComprasSegmentadasPorProveedor({
            items,
            ordenTipo,
            departamento,
            fechaRequerida,
            prioridad,
            vinculacion,
            estado: 1,
            pasos: [{
                paso: 1,
                fecha: new Date().toISOString(),
                usuario: (await authService.getCurrentProfile())?.nombre || 'Sistema',
                accion: 'Orden creada (por proveedor)'
            }],
            data: {
                orden_tipo: ordenTipo,
                fecha_generacion_bom: fechaGeneracionBom,
                fecha_esperada_llegada: fechaEsperadaLlegada,
                cliente_info: clienteInfo
            }
        });
        if (segmentado) return;

        const total = items.reduce((sum, i) => sum + (i.cantidad * i.costo_unitario), 0);

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
            items: _itemsParaPayloadDb(items),
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

                    const patchOrden = {
                        estado: 'Esperando Confirmación Cliente',
                        updated_at: new Date().toISOString()
                    };
                    try {
                        if (vinculacion.tipo === 'taller') {
                            await tallerService.update(vinculacion.id, patchOrden, csrfToken);
                        } else if (vinculacion.tipo === 'motor') {
                            await motoresService.update(vinculacion.id, patchOrden, csrfToken);
                        } else if (vinculacion.tipo === 'proyecto' || vinculacion.tipo === 'automatizacion') {
                            await proyectosService.update(vinculacion.id, patchOrden, csrfToken);
                        }
                    } catch (ordErr) {
                        console.warn('[Compras] Error actualizando orden vinculada tras cotizar:', ordErr);
                    }
                }

                alert('✅ Orden confirmada');
                document.getElementById('nuevaOrdenModal').classList.remove('active');
                _addToFeed('➕', `Orden ${folio} confirmada`);
                if (window.SSEPIStateMachine) {
                    await SSEPIStateMachine.actualizarEstadoOrden(window.supabase, 'compra', compraId, 'actualizacion', `Orden de compra ${folio} confirmada`, csrfToken);
                }
            } else {
                inserted = await comprasService.insert(nuevaCompra, csrfToken);

                if (!_isSsepiNextLocal()) {
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
        const compra = compras.find((c) => String(c.id) === String(compraId));
        if (!compra) { _showToast('Solicitud no encontrada', 'error'); return; }
        currentCompra = compra;
        compraId = compra.id;
        isNewCompra = false;
        await _poblarModalEdicionCompra(compra, {
            titulo: '<i class="fas fa-file-invoice"></i> Cotizar Solicitud ' + (compra.folio || '')
        });
        _showToast('Captura precios reales de proveedores y guarda para enviar a Ventas', 'info');
    }

    function _vincTipoCompra(tipo) {
        return tipo === 'automatizacion' ? 'proyecto' : tipo;
    }

    function _compraVinculadaLocal(id, tipo) {
        const vincTipo = _vincTipoCompra(tipo);
        return compras.find((c) => {
            let v = c.vinculacion;
            if (typeof v === 'string') {
                try { v = JSON.parse(v); } catch { v = null; }
            }
            return v
                && (v.tipo === vincTipo || (tipo === 'automatizacion' && v.tipo === 'automatizacion'))
                && String(v.id) === String(id);
        }) || null;
    }

    async function _buscarCompraVinculada(id, tipo) {
        const vincTipo = _vincTipoCompra(tipo);
        try {
            const { data: comprasList, error } = await window.supabase
                .from('compras')
                .select('*')
                .eq('vinculacion->>tipo', vincTipo)
                .eq('vinculacion->>id', String(id))
                .order('created_at', { ascending: false })
                .limit(1);
            if (!error && comprasList?.length) return _normalizeCompraRow(comprasList[0]);
        } catch (_) { /* proxy local */ }
        return _compraVinculadaLocal(id, tipo);
    }

    function _labelEstadoCompra(estado) {
        const labels = { 0: 'Borrador', 1: 'Solicitud', 2: 'Cotización', 3: 'Confirmada', 4: 'Recibida', 5: 'Entregada' };
        return labels[Number(estado)] || '—';
    }

    async function _resolverClienteInfoOperativa(ordenData) {
        const clienteNombre = ordenData?.cliente_nombre || ordenData?.cliente || '';
        let clienteInfo = { nombre: clienteNombre };
        if (!clienteNombre) return clienteInfo;
        try {
            const n = clienteNombre.toLowerCase().trim();
            const contacto = (contactos || []).find((c) => {
                const a = String(c.nombre || '').trim().toLowerCase();
                const e = String(c.empresa || '').trim().toLowerCase();
                return a === n || e === n;
            });
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
        } catch (e) { console.warn('[Compras] Error buscando contacto operativa:', e); }
        return clienteInfo;
    }

    async function _itemsConfirmadosDesdeOperativa(tipo, id, ordenData) {
        const res = await _itemsDesdeVinculacion(tipo, id);
        let enlaces = res.enlaces || [];
        let inventario = res.inventario || [];
        const invCache = await _loadInventarioCache();
        if (invCache.length && enlaces.length) {
            const split = _mapInventarioMatch(enlaces, invCache);
            enlaces = split.enlaces;
            inventario = inventario.concat(split.inventario);
        }
        const mats = ordenData?.materiales || ordenData?.data?.materiales || [];
        const costByKey = {};
        mats.forEach((m) => {
            if (m.sku) costByKey[String(m.sku).toLowerCase()] = Number(m.costo_unitario) || 0;
            if (m.nombre) costByKey[String(m.nombre).toLowerCase()] = Number(m.costo_unitario) || 0;
        });
        const toItem = (it, origen) => {
            const skuK = String(it.sku || '').toLowerCase();
            const nomK = String(it.nombre || '').toLowerCase();
            const costo = costByKey[skuK] || costByKey[nomK] || Number(it.costo_unitario) || 0;
            return {
                nombre: it.nombre || '',
                descripcion: it.descripcion || it.nombre || '',
                sku: it.sku || '',
                cantidad: Number(it.cantidad) || 1,
                costo_unitario: costo,
                link_proveedor: it.link || it.link_proveedor || '',
                proveedor: origen === 'inventario' ? 'INVENTARIO SSEPI' : ''
            };
        };
        let items = enlaces.map((it) => toItem(it, 'proveedor')).concat(inventario.map((it) => toItem(it, 'inventario')));
        if (!items.length && ordenData) {
            const equipo = ordenData.equipo || ordenData.nombre || 'Servicio vinculado';
            items = [{
                nombre: equipo,
                descripcion: ordenData.falla_reportada || ordenData.descripcion || equipo,
                sku: '',
                cantidad: 1,
                costo_unitario: 0,
                link_proveedor: ''
            }];
        }
        return items;
    }

    async function _autoCrearCompraConfirmadaDesdeOperativa(id, tipo, ordenData, departamento) {
        const vincTipo = _vincTipoCompra(tipo);
        const clienteInfo = await _resolverClienteInfoOperativa(ordenData);
        const items = await _itemsConfirmadosDesdeOperativa(tipo, id, ordenData);
        const total = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.costo_unitario) || 0), 0);
        const folio = (window.folioFormats && window.folioFormats.getNextFolioOrdenCompra)
            ? await window.folioFormats.getNextFolioOrdenCompra()
            : 'SP-OC' + Date.now().toString().slice(-8);
        const user = (await authService.getCurrentProfile()) || { nombre: 'Sistema' };
        const now = new Date().toISOString();
        const vinculacion = {
            tipo: vincTipo,
            id: String(id),
            folio: ordenData?.folio || '',
            cliente: clienteInfo.nombre || ordenData?.cliente || ordenData?.cliente_nombre || '',
            nombre: ordenData?.nombre || ordenData?.equipo || ordenData?.folio || ''
        };
        const proveedor = ordenData?.proveedor_preferido || (tipo === 'automatizacion' ? 'DIMEINT / Siemens' : 'PENDIENTE PROVEEDOR');
        const payload = {
            folio,
            proveedor,
            departamento,
            fecha_requerida: new Date().toISOString().split('T')[0],
            prioridad: 'Normal',
            vinculacion,
            items: _itemsParaPayloadDb(items),
            total,
            estado: 3,
            estado_interno: 'confirmada',
            pasos: [
                { paso: 1, fecha: now, usuario: user.nombre || 'Sistema', accion: 'Orden creada desde operativa vinculada' },
                { paso: 2, fecha: now, usuario: user.nombre || 'Sistema', accion: 'Materiales importados de ' + (ordenData?.folio || tipo) },
                { paso: 3, fecha: now, usuario: user.nombre || 'Sistema', accion: 'Orden confirmada' }
            ],
            confirmado_ventas: false,
            created_at: now,
            updated_at: now,
            data: {
                orden_tipo: 'sencilla',
                fecha_generacion_bom: now.split('T')[0],
                fecha_esperada_llegada: now.split('T')[0],
                cliente_info: clienteInfo
            }
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        const inserted = await comprasService.insert(payload, csrfToken);
        const newId = inserted?.id || inserted?.local_id;
        if (!newId) throw new Error('No se pudo crear la orden de compra');
        await _loadCompras();
        _renderOperativasComprasList();
        _addToFeed('✅', `OC ${folio} confirmada desde ${ordenData?.folio || tipo}`);
        _showToast(`Orden ${folio} creada en Confirmada`, 'success');
        _abrirDetalle(newId);
    }

    async function _precargarFormularioCompraVinculada(id, tipo, ordenTallerData, departamentoPorDefecto, compraData) {
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

        if (ordenTallerData) {
            const clienteInfo = await _resolverClienteInfoOperativa(ordenTallerData);
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

        let enlaces = [];
        let inventario = [];
        if (ordenTallerData) {
            const res = await _itemsDesdeVinculacion(tipo, id);
            enlaces = res.enlaces;
            inventario = res.inventario;
            const invCache = await _loadInventarioCache();
            if (invCache.length && enlaces.length) {
                const split = _mapInventarioMatch(enlaces, invCache);
                enlaces = split.enlaces;
                inventario = inventario.concat(split.inventario);
            }
        }
        if (enlaces.length === 0 && inventario.length === 0 && compraData) {
            const itemsFallback = compraData.items || [];
            enlaces = itemsFallback.map(it => ({ nombre: it.nombre || '', descripcion: it.descripcion || '', sku: it.sku || '', cantidad: Number(it.cantidad) || 1, link: it.link || '' }));
        }
        if (enlaces.length === 0 && inventario.length === 0 && compraData?.id) {
            try {
                const itemsDB = await _fetchItemsCompraDb(compraData, compraData.id);
                if (itemsDB?.length) {
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

        if (enlaces.length > 0) {
            enlaces.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" value="${item.nombre || ''}" class="item-nombre"></td>
                    <td><input type="text" value="${item.descripcion || ''}" class="item-desc"></td>
                    <td><input type="text" value="${item.sku || ''}" class="item-sku"></td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" class="item-qty"></td>
                    <td><input type="number" value="${item.precio_unitario || item.costo_unitario || 0}" step="0.01" class="item-price"></td>
                    <td><input type="url" value="${item.link || ''}" placeholder="Link" class="item-link"></td>
                    <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
                `;
                itemsBody.appendChild(row);
            });
        }
        if (inventario.length > 0) {
            inventario.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" value="${item.nombre || ''}" class="item-nombre"></td>
                    <td><input type="text" value="${item.descripcion || ''}" class="item-desc"></td>
                    <td><input type="text" value="${item.sku || ''}" class="item-sku"></td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" class="item-qty"></td>
                    <td><input type="number" value="${item.precio_unitario || item.costo_unitario || 0}" step="0.01" class="item-price"></td>
                    <td><button type="button" class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
                `;
                itemsBodyInv.appendChild(row);
            });
        }
        if (enlaces.length === 0 && inventario.length === 0) {
            const esPreregTaller = compraData?.vinculacion?.tipo === 'taller'
                && (compraData?.estado_interno === 'preregistro' || !compraData);
            if (esPreregTaller) {
                _renderBannerPreregistro(itemsBody, {
                    folio: compraData?.folio || `PO-${ordenTallerData?.folio || '—'}`,
                    cliente: ordenTallerData?.cliente_nombre || ordenTallerData?.cliente || ''
                });
            } else if (ordenTallerData) {
                const equipo = ordenTallerData.equipo || 'Equipo sin nombre';
                const marca = ordenTallerData.marca || '';
                const modelo = ordenTallerData.modelo || '';
                const serie = ordenTallerData.serie || '';
                const falla = ordenTallerData.falla_reportada || 'Servicio requerido';
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
        }
        document.getElementById('nuevaOrdenModal').classList.add('active');
        _showToast(`Importados: ${enlaces.length} proveedor, ${inventario.length} inventario`, 'success');
    }

    async function _crearOrdenDesdeSolicitud(id, tipo) {
        console.log('[Compras] Crear orden desde operativa', { id, tipo });
        let ordenTallerData = null;
        let departamentoPorDefecto = 'Laboratorio de Electrónica';
        try {
            if (tipo === 'taller') {
                ordenTallerData = await tallerService.getById(id);
                departamentoPorDefecto = 'Laboratorio de Electrónica';
            } else if (tipo === 'motor') {
                ordenTallerData = await motoresService.getById(id);
                departamentoPorDefecto = 'Taller Motores';
            } else if (tipo === 'proyecto' || tipo === 'automatizacion') {
                ordenTallerData = await proyectosService.getById(id);
                departamentoPorDefecto = tipo === 'automatizacion' ? 'Automatización' : 'Proyectos';
            }
        } catch (e) {
            console.error('[Compras] Error obteniendo operativa:', e);
            _showToast('No se pudo cargar la orden operativa', 'error');
            return;
        }

        const compraData = await _buscarCompraVinculada(id, tipo);
        if (compraData?.id) {
            _showToast('Abriendo OC vinculada ' + (compraData.folio || ''), 'info');
            _abrirDetalle(compraData.id);
            return;
        }

        if (!ordenTallerData) {
            _showToast('Orden operativa no encontrada', 'error');
            return;
        }

        try {
            await _autoCrearCompraConfirmadaDesdeOperativa(id, tipo, ordenTallerData, departamentoPorDefecto);
        } catch (e) {
            console.warn('[Compras] Auto-confirm falló, abriendo formulario:', e);
            await _precargarFormularioCompraVinculada(id, tipo, ordenTallerData, departamentoPorDefecto, compraData);
        }
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
    /** Normaliza para matchear contra el tabulador: lowercase + sin acentos + sin símbolos. */
    function _normTabuladorKey(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Carga perezosamente el tabulador Excel (clientes_tabulador) y construye un
     *  Map<key, row> con normalización. Si falla o no hay supabase, devuelve Map vacío. */
    async function _loadTabuladorLookup() {
        if (_tabuladorLookupReady) return _tabuladorLookupReady;
        _tabuladorLookupReady = (async () => {
            const map = new Map();
            const sb = _supabase();
            if (!sb) return map;
            try {
                const { data, error } = await sb
                    .from('clientes_tabulador')
                    .select('nombre_cliente,rfc,direccion_fiscal,contacto_referencia,km,empresa_alias');
                if (error) {
                    console.warn('[Compras] clientes_tabulador enriquecer PDF:', error.message);
                    return map;
                }
                (data || []).forEach((r) => {
                    const k = _normTabuladorKey(r.nombre_cliente);
                    if (k && !map.has(k)) map.set(k, r);
                    // Alias opcional para clientes con nombre distinto al tabulador
                    const aliasK = _normTabuladorKey(r.empresa_alias);
                    if (aliasK && !map.has(aliasK)) map.set(aliasK, r);
                });
            } catch (e) {
                console.warn('[Compras] clientes_tabulador enriquecer PDF:', e?.message || e);
            }
            _tabuladorLookup = map;
            return map;
        })();
        return _tabuladorLookupReady;
    }

    async function _resolverClienteContactoPdf(nombreCliente) {
        const empty = { nombre: nombreCliente || '', empresa: '', email: '', telefono: '', rfc: '', direccion: '', puesto: '', logo_url: null };
        if (!nombreCliente) return empty;
        // 1) Lookup principal: contactos Pac_Contactos / Odoo
        let c = null;
        if (contactos?.length) {
            const n = String(nombreCliente).trim().toLowerCase();
            c = contactos.find((x) => {
                const a = String(x.nombre || x.empresa || '').trim().toLowerCase();
                const e = String(x.empresa || '').trim().toLowerCase();
                return a === n || e === n || a.includes(n) || n.includes(a) || (e && (e.includes(n) || n.includes(e)));
            });
        }
        // 2) Fallback enriquecido: clientes_tabulador (RFC/dir/km del Excel maestro)
        const tabMap = await _loadTabuladorLookup();
        const tabKey = _normTabuladorKey(nombreCliente);
        const tabRow = tabKey ? tabMap.get(tabKey) : null;

        if (!c) {
            // Sin contacto: usa tabulador para RFC/dirección/km
            if (tabRow) {
                return {
                    nombre: nombreCliente,
                    empresa: tabRow.nombre_cliente || nombreCliente,
                    email: '',
                    telefono: '',
                    rfc: tabRow.rfc || '',
                    direccion: tabRow.direccion_fiscal || '',
                    puesto: tabRow.contacto_referencia || '',
                    km: tabRow.km ?? null,
                    logo_url: null,
                    fuente: 'tabulador',
                };
            }
            return { ...empty, fuente: 'sin_datos' };
        }
        // 3) Mezcla: contacto real + hueco de tabulador
        return {
            nombre: c.nombre || nombreCliente,
            empresa: c.empresa || tabRow?.nombre_cliente || '',
            email: c.email || '',
            telefono: c.telefono || '',
            rfc: (c.rfc && String(c.rfc).trim()) || tabRow?.rfc || '',
            direccion: (c.direccion && String(c.direccion).trim()) || tabRow?.direccion_fiscal || '',
            puesto: c.puesto || tabRow?.contacto_referencia || '',
            km: c.km ?? tabRow?.km ?? null,
            logo_url: c.logo_url || null,
            fuente: (tabRow && (c.rfc || c.direccion) ? 'contacto+tabulador' : (tabRow ? 'contacto+tabulador' : 'contacto')),
        };
    }

    function _nombreMaterialPdf(i) {
        const nombre = String(i.nombre || '').trim();
        if (nombre) return nombre;
        const desc = String(i.descripcion || '').trim();
        if (!desc) return 'Concepto';
        const sep = desc.indexOf(' — ');
        return sep > 0 ? desc.slice(0, sep).trim() : desc;
    }

    async function _generarPDFCompra(preview = false) {
        if (!currentCompra || !window.pdfGenerator) return;
        const user = await authService.getCurrentProfile();
        const vinc = currentCompra.vinculacion || {};
        const clienteNombre = vinc.cliente || vinc.nombre || currentCompra.data?.cliente_info?.nombre || '';
        const clienteContacto = await _resolverClienteContactoPdf(clienteNombre);
        const itemsPdf = (currentCompra.itemsData || [])
            .filter((i) => {
                const n = String(i.nombre || i.descripcion || '').toLowerCase();
                return !/gasolina|camioneta|traslado|markup|servicio|ingenier/i.test(n);
            })
            .map((i) => {
                const titulo = _nombreMaterialPdf(i);
                return {
                    nombre: titulo,
                    descripcion: titulo,
                    sku: i.sku || '',
                    especificaciones: i.sku || '',
                    cantidad: Number(i.cantidad) || 1,
                    precio: Number(i.costo_unitario) || 0,
                    qty: Number(i.cantidad) || 1,
                    price: Number(i.costo_unitario) || 0
                };
            });
        const sub = itemsPdf.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const iva = sub * 0.16;
        const data = {
            folio: _decodeHtmlFolio(currentCompra.folio),
            proveedor: currentCompra.proveedor,
            fecha_requerida: currentCompra.fecha_requerida,
            fecha: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            departamento: (vinc.tipo === 'proyecto' || vinc.tipo === 'automatizacion') ? 'Automatización' : (currentCompra.departamento || 'Compras'),
            cliente: clienteContacto.empresa || clienteContacto.nombre || clienteNombre,
            clienteEmpresa: clienteContacto.empresa || '',
            clienteContacto,
            vendedor: currentCompra.data?.vendedor || user?.nombre || '',
            direccion: clienteContacto.direccion || currentCompra.data?.cliente_info?.direccion || '',
            rfc: clienteContacto.rfc || currentCompra.data?.cliente_info?.rfc || '',
            email: clienteContacto.email || '',
            telefono: clienteContacto.telefono || '',
            clienteLogo: clienteContacto.logo_url || null,
            conceptos: itemsPdf,
            items: itemsPdf,
            subtotal: sub,
            iva,
            total: sub + iva,
            omitirPoliticas: true,
            tipoDoc: 'orden_compra'
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
        const ordenTipoSel = document.getElementById('ordenTipoSelect');
        const deptSel = document.getElementById('departamentoSelect');
        if (ordenTipoSel) ordenTipoSel.addEventListener('change', _actualizarColumnasProveedorTabla);
        if (deptSel) deptSel.addEventListener('change', _actualizarColumnasProveedorTabla);

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
            const ocVinc = _compraVinculadaLocal(id, tipoVinc);
            const ocMeta = ocVinc
                ? '<br><span class="op-meta">OC: <strong>' + esc(ocVinc.folio || '—') + '</strong> · ' + esc(_labelEstadoCompra(ocVinc.estado)) + '</span>'
                : '';
            const btnLabel = ocVinc ? 'Ver OC vinculada' : 'Nueva compra vinculada';
            return '<div class="op-row">' +
                '<div><strong>' + esc(folio) + '</strong> · ' + esc(cliente) + '<br><span class="op-meta">' + esc(st) + '</span>' + ocMeta + '</div>' +
                '<div class="op-actions">' +
                '<button type="button" class="btn-ssepi btn-compras op-go" style="font-size:12px;padding:6px 12px;" data-vinc-tipo="' + esc(tipoVinc) + '" data-vinc-id="' + esc(id) + '">' + esc(btnLabel) + '</button>' +
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
        _generarPDFCompra,
        _toggleAjuste3pct
    };
})();

window.comprasModule = ComprasModule;