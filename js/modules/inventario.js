// ================================================
// ARCHIVO: inventario.js
// DESCRIPCIÓN: Módulo de Inventario Maestro adaptado a Supabase
// BASADO EN: inventario-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de productos, importación Excel, movimientos, alertas de stock
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';

const InventarioModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let productos = [];
    let categoriaActual = 'refaccion';
    let busqueda = '';
    let vistaActual = 'table';
    let chartInstance = null;
    let excelColumnMap = null;
    /** Perfil Ventas: no mostrar costos ni valor (solo precio venta y stock). */
    let isVentasProfile = false;
    /** Solo admin/superadmin/contabilidad (y no ventas) pueden editar inventario y ver costos. */
    let canEditInventario = true;

    // Servicios de datos
    const inventarioService = createDataService('inventario');

    function _supabase() { return window.supabase; }

    function _normalizarTexto(s) {
        return String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\u0300-\u036f/g, '');
    }
    function _fmtMoney(n) {
        const num = Number(n);
        if (num !== num) return '—';
        return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function _fmtInt(n) {
        const num = parseInt(n, 10);
        return (num === num ? num : 0).toString();
    }
    function _escapeHtml(s) {
        if (s == null || s === '') return '—';
        const t = String(s);
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _detectarColumnas(headerRow) {
        if (!headerRow || !Array.isArray(headerRow)) return null;
        const map = {};
        for (let i = 0; i < headerRow.length; i++) {
            const cell = _normalizarTexto(headerRow[i]);
            if (!cell) continue;
            if ((/sku|codigo|marking|code|clave|ref|modelo/.test(cell)) && map.sku === undefined) map.sku = i;
            else if ((/nombre|producto|descripcion|articulo/.test(cell)) && map.nombre === undefined) map.nombre = i;
            else if ((/stock|cantidad|existencia|qty|unidades/.test(cell)) && map.stock === undefined) map.stock = i;
            else if ((/ubicacion|location|almacen|sucursal|estante/.test(cell)) && map.ubicacion === undefined) map.ubicacion = i;
            else if ((/costo|coste|c\/u|unitario/.test(cell)) && !/venta|precio/.test(cell) && map.costo === undefined) map.costo = i;
            else if ((/precio|venta|total\s*linea|precios\s*ssepi|importe/.test(cell)) && map.precio === undefined) map.precio = i;
        }
        if (map.sku !== undefined && map.nombre !== undefined) return map;
        return null;
    }
    function _buscarFilaEncabezados(rows) {
        if (!rows || !rows.length) return null;
        for (let r = 0; r < Math.min(rows.length, 15); r++) {
            const map = _detectarColumnas(rows[r]);
            if (map) return { headerRowIndex: r, columnMap: map };
        }
        return null;
    }
    function _obtenerDatosDeWorkbook(workbook) {
        const sheetNames = workbook.SheetNames || [];
        let best = { data: [], columnMap: null };
        for (let s = 0; s < sheetNames.length; s++) {
            const sheet = workbook.Sheets[sheetNames[s]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const rows = json.filter(fila => fila.some(celda => celda != null && String(celda).trim() !== ''));
            const found = _buscarFilaEncabezados(rows);
            if (found && found.headerRowIndex < rows.length - 1) {
                const dataRows = rows.slice(found.headerRowIndex + 1).filter(f => {
                    const { sku, nombre } = _extraerFila(f, found.columnMap);
                    return (sku || nombre);
                });
                if (dataRows.length > best.data.length) best = { data: dataRows, columnMap: found.columnMap };
            }
        }
        return best.data.length ? best : null;
    }
    function _extraerFila(fila, map) {
        const m = map || { sku: 0, nombre: 1, stock: 2, ubicacion: 3, costo: 4, precio: 5 };
        const get = (key, def) => {
            const idx = m[key];
            if (idx === undefined) return def;
            const v = fila[idx];
            return v != null ? v : def;
        };
        return {
            sku: String(get('sku', '')).trim(),
            nombre: String(get('nombre', '')).trim(),
            stock: !isNaN(parseFloat(get('stock', 0))) ? parseFloat(get('stock', 0)) : 0,
            ubicacion: (String(get('ubicacion', '')).trim() || 'Sin ubicación'),
            costo: !isNaN(parseFloat(get('costo', 0))) ? parseFloat(get('costo', 0)) : 0,
            precioVenta: !isNaN(parseFloat(get('precio', 0))) ? parseFloat(get('precio', 0)) : 0
        };
    }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Inventario] Conectado');
        try {
            const profile = await authService.getCurrentProfile();
            const rol = (profile && profile.rol) ? String(profile.rol).toLowerCase() : (document.body.dataset.rol || sessionStorage.getItem('ssepi_rol') || '').toLowerCase();
            if (profile && profile.rol) {
                try { sessionStorage.setItem('ssepi_rol', profile.rol); } catch (e) {}
                document.body.dataset.rol = profile.rol;
            }
            // Visibilidad de costos por tabla users_ver_costos (ver_costos === false = no ver costos/valor)
            isVentasProfile = (profile && profile.ver_costos === false);
            canEditInventario = !isVentasProfile;
        } catch (e) {
            const rol = (document.body.dataset.rol || sessionStorage.getItem('ssepi_rol') || '').toLowerCase();
            isVentasProfile = (rol === 'ventas' || rol === 'ventas_sin_compras');
            canEditInventario = !isVentasProfile;
        }
        if (isVentasProfile) document.body.classList.add('inventario-perfil-ventas');
        else document.body.classList.remove('inventario-perfil-ventas');
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
            _applyPerfilVentasUI();
            _applyAdminButtons();
            _startListeners();
            _startClock();
        } catch (e) {
            console.error('[Inventario] init error:', e);
        }
        console.log('✅ Módulo inventario iniciado');
    }

    /** Oculta columnas Costo/Valor y KPI valor total para perfil Ventas. Oculta crear/editar para ventas. */
    function _applyPerfilVentasUI() {
        if (!isVentasProfile) return;
        // Por atributo: ocultar todo lo marcado con data-hide-for-ventas (tarjeta Valor Total, botones, th Costo/Valor)
        document.querySelectorAll('.page-inventario [data-hide-for-ventas="true"], .inventario-perfil-ventas [data-hide-for-ventas="true"]').forEach(function (el) {
            el.classList.add('hide-for-ventas');
            el.style.display = 'none';
        });
        // Encabezados tabla: columnas Costo (índice 7) y Valor (índice 9)
        document.querySelectorAll('.inventory-table thead th').forEach(function (th, i) {
            if (i === 7 || i === 9) {
                th.classList.add('hide-for-ventas');
                th.style.display = 'none';
            }
        });
        // Tarjeta VALOR TOTAL: por ID por si no tiene el atributo
        var kpiValor = document.getElementById('kpiValorTotal');
        if (kpiValor) {
            var card = kpiValor.closest('.kpi-card');
            if (card) {
                card.classList.add('hide-for-ventas');
                card.style.display = 'none';
            }
            kpiValor.textContent = 'N/D';
        }
        var costGroup = document.getElementById('productCostGroup');
        if (costGroup) {
            costGroup.style.display = 'none';
            costGroup.classList.add('hide-for-ventas');
        }
        // Ventas: no crear ni importar
        var newBtn = document.getElementById('newProductBtn');
        if (newBtn) { newBtn.style.display = 'none'; newBtn.classList.add('hide-for-ventas'); }
        var importGeneralBtn = document.getElementById('importGeneralBtn');
        if (importGeneralBtn) { importGeneralBtn.style.display = 'none'; importGeneralBtn.classList.add('hide-for-ventas'); }
        var importBtn = document.getElementById('importExcelBtn');
        if (importBtn) { importBtn.style.display = 'none'; importBtn.classList.add('hide-for-ventas'); }
        var initBtn = document.getElementById('initDataBtn');
        if (initBtn) { initBtn.style.display = 'none'; initBtn.classList.add('hide-for-ventas'); }
    }

    /** Muestra/oculta botones Actualizar y Guardar solo para administradores (quienes pueden editar). */
    function _applyAdminButtons() {
        var footerAdmin = document.getElementById('modalFooterAdminActions');
        var updateBtn = document.getElementById('updateProductBtn');
        if (footerAdmin) footerAdmin.style.display = canEditInventario ? 'flex' : 'none';
        if (updateBtn) updateBtn.style.display = 'none';
    }

    function _setVistaInicial() {
        const gridView = document.getElementById('gridView');
        const tableView = document.getElementById('tableView');
        const chartView = document.getElementById('chartView');
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        if (vistaActual === 'grid' && gridView) gridView.classList.add('active');
        else if (vistaActual === 'table' && tableView) tableView.classList.add('active');
        else if (vistaActual === 'chart' && chartView) chartView.classList.add('active');
        document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('vistaGrid') || document.getElementById('vistaLista') || document.getElementById('vistaGrafica');
        if (vistaActual === 'grid') { const b = document.getElementById('vistaGrid'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'table') { const b = document.getElementById('vistaLista'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'chart') { const b = document.getElementById('vistaGrafica'); if (b) b.classList.add('active'); }
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
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'flex';
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

    function _bindEvents() {
        const byId = id => document.getElementById(id);
        if (byId('toggleMenu')) byId('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */

        document.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                categoriaActual = this.dataset.cat;
                _filtrarYRenderizar();
                _actualizarCategoriaImport();
            });
        });

        if (byId('searchInput')) byId('searchInput').addEventListener('input', function(e) {
            busqueda = e.target.value.toLowerCase();
            _filtrarYRenderizar();
        });

        if (byId('vistaGrid')) byId('vistaGrid').addEventListener('click', () => _cambiarVista('grid'));
        if (byId('vistaLista')) byId('vistaLista').addEventListener('click', () => _cambiarVista('table'));
        if (byId('vistaGrafica')) byId('vistaGrafica').addEventListener('click', () => _cambiarVista('chart'));

        if (byId('newProductBtn')) byId('newProductBtn').addEventListener('click', _abrirModalNuevo);
        if (byId('importGeneralBtn')) byId('importGeneralBtn').addEventListener('click', _abrirImportacionGeneral);
        if (byId('importExcelBtn')) byId('importExcelBtn').addEventListener('click', _abrirModalImportacion);
        if (byId('initDataBtn')) byId('initDataBtn').addEventListener('click', _cargarDatosIniciales);

        if (byId('modalClose')) byId('modalClose').addEventListener('click', _cerrarModal);
        if (byId('cancelBtn')) byId('cancelBtn').addEventListener('click', _cerrarModal);
        if (byId('saveProductBtn')) byId('saveProductBtn').addEventListener('click', _guardarProducto);
        if (byId('updateProductBtn')) byId('updateProductBtn').addEventListener('click', _guardarProducto);
        if (byId('deleteProductBtn')) byId('deleteProductBtn').addEventListener('click', _eliminarProducto);
        if (byId('increaseStock')) byId('increaseStock').addEventListener('click', () => _ajustarStock(1));
        if (byId('decreaseStock')) byId('decreaseStock').addEventListener('click', () => _ajustarStock(-1));
        if (byId('stockInput')) byId('stockInput').addEventListener('input', _actualizarStockDisplay);

        if (byId('importModalClose')) byId('importModalClose').addEventListener('click', _cerrarModalImportacion);
        if (byId('cancelImportBtn')) byId('cancelImportBtn').addEventListener('click', _cerrarModalImportacion);
        if (byId('selectFileBtn')) byId('selectFileBtn').addEventListener('click', () => { const f = byId('excelFile'); if (f) f.click(); });
        if (byId('excelFile')) byId('excelFile').addEventListener('change', _manejarArchivoExcel);
        if (byId('processImportBtn')) byId('processImportBtn').addEventListener('click', _procesarImportacion);
        if (byId('fileInput')) byId('fileInput').addEventListener('change', _manejarArchivoDirecto);
        if (byId('generalImportInput')) byId('generalImportInput').addEventListener('change', _manejarImportacionGeneral);

        const productModal = byId('productModal');
        if (productModal) productModal.addEventListener('click', function(e) {
            if (e.target === this) _cerrarModal();
        });
        const importModal = byId('importModal');
        if (importModal) importModal.addEventListener('click', function(e) {
            if (e.target === this) _cerrarModalImportacion();
        });
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
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
        if (chartInstance) _renderChart();
    }

    // ==================== LISTENERS SUPABASE ====================
    function _startListeners() {
        const supabase = _supabase();
        if (!supabase) return;
        const subInventario = supabase
            .channel('inventario_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, payload => {
                _loadProductos();
            })
            .subscribe();
        subscriptions.push(subInventario);
        _loadProductos();
    }

    async function _loadProductos() {
        try {
            productos = await inventarioService.select({}, { orderBy: 'sku', ascending: true });
            productos = (productos || []).map(p => ({ ...p, stock: p.stock != null ? p.stock : (p.existencia != null ? p.existencia : 0) }));
        } catch (error) {
            console.warn('[Inventario] Error cargando productos:', error);
            productos = [];
        }
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'none';
        _filtrarYRenderizar();
        _actualizarKPIs();
        if (isVentasProfile) _applyPerfilVentasUI();
        _addToFeed('📦', `Inventario actualizado (${productos.length} productos)`);
    }

    // ==================== FILTRADO Y RENDERIZADO ====================
    function _filtrarYRenderizar() {
        let filtrados = productos.filter(p => p.categoria === categoriaActual);
        if (busqueda) {
            filtrados = filtrados.filter(p => 
                (p.sku && p.sku.toLowerCase().includes(busqueda)) ||
                (p.nombre && p.nombre.toLowerCase().includes(busqueda)) ||
                (p.ubicacion && p.ubicacion.toLowerCase().includes(busqueda))
            );
        }
        const totalEl = document.getElementById('totalCount');
        const filteredEl = document.getElementById('filteredCount');
        if (totalEl) totalEl.innerText = productos.length;
        if (filteredEl) filteredEl.innerText = filtrados.length;

        if (filtrados.length === 0) {
            const emptyState = document.getElementById('emptyState');
            const productsGrid = document.getElementById('productsGrid');
            if (emptyState) emptyState.style.display = 'block';
            if (productsGrid) productsGrid.innerHTML = '';
        } else {
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.style.display = 'none';
            _renderizarGrid(filtrados);
            _renderizarTabla(filtrados);
        }
        const initDataBtn = document.getElementById('initDataBtn');
        if (initDataBtn) initDataBtn.style.display = productos.length === 0 ? 'flex' : 'none';
    }

    function _renderizarGrid(productos) {
        const container = document.getElementById('productsGrid');
        if (!container) return;
        container.innerHTML = productos.map(p => _crearCard(p)).join('');
        container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => _abrirModalEdicion(card.dataset.id));
        });
    }

    function _crearCard(p) {
        let stockClass = 'stock-empty';
        if (p.stock > (p.minimo || 0)) stockClass = 'stock-high';
        else if (p.stock > 0) stockClass = 'stock-medium';
        else if (p.stock === 0) stockClass = 'stock-low';

        let badgeClass = '';
        let badgeText = '';
        switch(p.categoria) {
            case 'refaccion': badgeClass = 'badge-refaccion'; badgeText = 'Refacción'; break;
            case 'almacenable': badgeClass = 'badge-almacenable'; badgeText = 'Almacenable'; break;
            case 'consumible': badgeClass = 'badge-consumible'; badgeText = 'Consumible'; break;
            case 'servicio': badgeClass = 'badge-servicio'; badgeText = 'Servicio'; break;
        }

        return `
            <div class="product-card" data-id="${p.id}">
                <div class="card-header">
                    <span class="card-sku">${p.sku || 'S/N'}</span>
                    <span class="stock-indicator ${stockClass}"></span>
                </div>
                <div class="card-name">${p.nombre || 'Sin nombre'}</div>
                <div class="card-info">
                    <div class="info-row"><span class="info-label">Ubicación:</span> <span class="info-value">${p.ubicacion || '—'}</span></div>
                    <div class="info-row"><span class="info-label">Categoría:</span> <span class="info-value"><span class="category-badge ${badgeClass}">${badgeText}</span></span></div>
                    <div class="info-row"><span class="info-label">Stock mínimo:</span> <span class="info-value">${p.minimo || 0}</span></div>
                </div>
                <div class="card-footer">
                    <div class="stock-display">${p.stock || 0} <span>unidades</span></div>
                    ${isVentasProfile ? '' : `<div class="card-cost">$${(p.costo || 0).toFixed(2)}</div>`}
                </div>
            </div>
        `;
    }

    function _renderizarTabla(productos) {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        tbody.innerHTML = productos.map(p => {
            const valor = (Number(p.costo) || 0) * (parseInt(p.stock, 10) || 0);
            const catLabel = { refaccion: 'Refacción', almacenable: 'Almacenable', consumible: 'Consumible', servicio: 'Servicio' }[p.categoria] || p.categoria || '—';
            if (isVentasProfile) {
                return `
            <tr onclick="inventarioModule._abrirModalEdicion('${p.id}')" role="button" tabindex="0">
                <td><strong>${_escapeHtml(p.sku)}</strong></td>
                <td>${_escapeHtml(p.nombre)}</td>
                <td class="col-desc" title="${_escapeHtml(p.descripcion || '')}">${_escapeHtml(p.descripcion)}</td>
                <td>${_escapeHtml(catLabel)}</td>
                <td>${_escapeHtml(p.ubicacion)}</td>
                <td class="col-num">${_fmtInt(p.stock)}</td>
                <td class="col-num">${_fmtInt(p.minimo)}</td>
                <td class="col-num">${_fmtMoney(p.precio_venta)}</td>
            </tr>
            `;
            }
            return `
            <tr onclick="inventarioModule._abrirModalEdicion('${p.id}')" role="button" tabindex="0">
                <td><strong>${_escapeHtml(p.sku)}</strong></td>
                <td>${_escapeHtml(p.nombre)}</td>
                <td class="col-desc" title="${_escapeHtml(p.descripcion || '')}">${_escapeHtml(p.descripcion)}</td>
                <td>${_escapeHtml(catLabel)}</td>
                <td>${_escapeHtml(p.ubicacion)}</td>
                <td class="col-num">${_fmtInt(p.stock)}</td>
                <td class="col-num">${_fmtInt(p.minimo)}</td>
                <td class="col-num">${_fmtMoney(p.costo)}</td>
                <td class="col-num">${_fmtMoney(p.precio_venta)}</td>
                <td class="col-num">${_fmtMoney(valor)}</td>
            </tr>
            `;
        }).join('');
    }

    function _cambiarVista(vista) {
        vistaActual = vista;
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        const viewId = vista === 'grid' ? 'gridView' : (vista === 'table' ? 'tableView' : 'chartView');
        const viewEl = document.getElementById(viewId);
        if (viewEl) viewEl.classList.add('active');
        document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
        const btnId = vista === 'grid' ? 'vistaGrid' : (vista === 'table' ? 'vistaLista' : 'vistaGrafica');
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.add('active');
        if (vista === 'chart') _renderChart();
    }

    function _renderChart() {
        const canvas = document.getElementById('inventoryChart');
        const chartContainer = canvas ? canvas.closest('.chart-container') : null;
        const msgEl = document.getElementById('chartVentasMsg');
        if (isVentasProfile) {
            if (chartInstance) chartInstance.destroy();
            chartInstance = null;
            if (canvas) canvas.style.display = 'none';
            if (msgEl) msgEl.style.display = 'block';
            return;
        }
        if (msgEl) msgEl.style.display = 'none';
        if (canvas) canvas.style.display = '';
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (chartInstance) chartInstance.destroy();
        const categorias = ['refaccion', 'almacenable', 'consumible', 'servicio'];
        const nombres = ['Refacciones', 'Almacenables', 'Consumibles', 'Servicios'];
        const valores = categorias.map(cat => 
            productos.filter(p => p.categoria === cat).reduce((sum, p) => sum + ((p.costo || 0) * (p.stock || 0)), 0)
        );
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: nombres,
                datasets: [{
                    data: valores,
                    backgroundColor: ['#0277bd', '#2e7d32', '#ef6c00', '#7b1fa2'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    // ==================== KPIs ====================
    async function _actualizarKPIs() {
        const valorTotal = productos.reduce((sum, p) => sum + ((p.costo || 0) * (p.stock || 0)), 0);
        var kpiValorEl = document.getElementById('kpiValorTotal');
        if (kpiValorEl && !isVentasProfile) kpiValorEl.innerHTML = '$' + valorTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        document.getElementById('kpiProductos').innerText = productos.length;
        const bajoStock = productos.filter(p => p.stock > 0 && p.stock <= (p.minimo || 0)).length;
        document.getElementById('kpiBajoStock').innerText = bajoStock;
        await _cargarMovimientosMes();
    }

    async function _cargarMovimientosMes() {
        const now = new Date();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const supabase = _supabase();
        if (!supabase) {
            document.getElementById('kpiMovimientos').innerText = '0';
            return;
        }
        try {
            const { count, error } = await supabase
                .from('movimientos_inventario')
                .select('*', { count: 'exact', head: true })
                .gte('fecha', inicioMes)
                .lte('fecha', finMes);
            if (error) throw error;
            document.getElementById('kpiMovimientos').innerText = count || 0;
        } catch (e) {
            console.error(e);
            document.getElementById('kpiMovimientos').innerText = '0';
        }
    }

    // ==================== CRUD DE PRODUCTOS ====================
    function _abrirModalNuevo() {
        document.getElementById('modalTitle').innerText = 'Nuevo Producto';
        document.getElementById('productId').value = '';
        document.getElementById('productForm').reset();
        document.getElementById('productCategory').value = categoriaActual;
        document.getElementById('stockInput').value = 0;
        document.getElementById('deleteProductBtn').style.display = 'none';
        var updateBtn = document.getElementById('updateProductBtn');
        if (updateBtn) updateBtn.style.display = 'none';
        document.getElementById('skuError').style.display = 'none';
        _actualizarStockDisplay();
        document.getElementById('productModal').classList.add('active');
        document.getElementById('productSku').focus();
    }

    function _abrirModalEdicion(id) {
        const producto = productos.find(p => p.id === id);
        if (!producto) return;
        document.getElementById('modalTitle').innerText = 'Editar Producto';
        document.getElementById('productId').value = producto.id;
        document.getElementById('productSku').value = producto.sku || '';
        document.getElementById('productName').value = producto.nombre || '';
        document.getElementById('productCategory').value = producto.categoria || 'refaccion';
        document.getElementById('productLocation').value = producto.ubicacion || '';
        document.getElementById('productMinStock').value = producto.minimo || 0;
        document.getElementById('productCost').value = producto.costo || 0;
        document.getElementById('productPrice').value = producto.precio_venta || 0;
        document.getElementById('stockInput').value = producto.stock || 0;
        document.getElementById('deleteProductBtn').style.display = canEditInventario ? 'flex' : 'none';
        var updateBtn = document.getElementById('updateProductBtn');
        if (updateBtn) updateBtn.style.display = canEditInventario ? 'inline-flex' : 'none';
        document.getElementById('skuError').style.display = 'none';
        _actualizarStockDisplay();
        document.getElementById('productModal').classList.add('active');
    }

    function _cerrarModal() {
        document.getElementById('productModal').classList.remove('active');
    }

    function _ajustarStock(cambio) {
        const input = document.getElementById('stockInput');
        const valor = parseInt(input.value) || 0;
        input.value = Math.max(0, valor + cambio);
        _actualizarStockDisplay();
    }

    function _actualizarStockDisplay() {
        document.getElementById('minStockInfo').innerHTML = `Stock mínimo: <span>${document.getElementById('productMinStock').value || 0}</span>`;
    }

    async function _guardarProducto() {
        const sku = document.getElementById('productSku').value.trim();
        const nombre = document.getElementById('productName').value.trim();
        const categoria = document.getElementById('productCategory').value;
        const ubicacion = document.getElementById('productLocation').value.trim();
        const minimo = parseInt(document.getElementById('productMinStock').value) || 0;
        const costo = parseFloat(document.getElementById('productCost').value) || 0;
        const precioVenta = parseFloat(document.getElementById('productPrice').value) || 0;
        const nuevoStock = parseInt(document.getElementById('stockInput').value) || 0;

        if (!sku || !nombre) {
            _mostrarError('SKU y nombre son obligatorios');
            return;
        }

        const existe = productos.find(p => 
            p.sku.toLowerCase() === sku.toLowerCase() && 
            p.categoria === categoria && 
            p.id !== document.getElementById('productId').value
        );
        if (existe) {
            _mostrarError(`El SKU "${sku}" ya existe en esta categoría`);
            return;
        }

        const data = {
            sku,
            nombre,
            categoria,
            ubicacion,
            minimo,
            costo,
            precio_venta: precioVenta,
            stock: nuevoStock,
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const id = document.getElementById('productId').value;
            let oldStock = 0;
            if (id) {
                const old = productos.find(p => p.id === id);
                oldStock = old ? old.stock : 0;
                await inventarioService.update(id, data, csrfToken);
            } else {
                data.created_at = new Date().toISOString();
                const inserted = await inventarioService.insert(data, csrfToken);
                document.getElementById('productId').value = inserted.id;
            }
            if (id && nuevoStock !== oldStock) {
                await _registrarMovimiento(id || document.getElementById('productId').value, sku, oldStock, nuevoStock, 'ajuste', 'Edición manual');
            }
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    function _mostrarError(msg) {
        const err = document.getElementById('skuError');
        err.textContent = msg;
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }

    async function _eliminarProducto() {
        const id = document.getElementById('productId').value;
        if (!id || !confirm('¿Eliminar permanentemente este producto?')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await inventarioService.delete(id, csrfToken);
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error al eliminar: ' + error.message);
        }
    }

    // ==================== MOVIMIENTOS ====================
    async function _registrarMovimiento(productoId, sku, stockAnterior, stockNuevo, tipo, notas) {
        const cantidad = Math.abs(stockNuevo - stockAnterior);
        const tipoMovimiento = tipo === 'ajuste' ? 'ajuste' : (stockNuevo > stockAnterior ? 'entrada' : 'salida');
        const profile = await authService.getCurrentProfile();
        const movimiento = {
            producto_id: productoId,
            sku,
            tipo_movimiento: tipoMovimiento,
            cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: stockNuevo,
            motivo: notas || '',
            usuario_id: profile?.id || null
        };
        const supabase = _supabase();
        if (supabase) {
            try {
                await supabase.from('movimientos_inventario').insert(movimiento);
            } catch (e) {
                console.error('Error registrando movimiento:', e);
            }
        }
    }

    // ==================== IMPORTACIÓN EXCEL ====================
    let excelData = null;

    function _abrirImportacionGeneral() {
        const input = document.getElementById('generalImportInput');
        if (!input) return;
        input.value = '';
        input.click();
    }

    function _categoriaPorNombreArchivo(fileName) {
        const n = _normalizarTexto(fileName || '');
        if (n.includes('electronica')) return 'refaccion';
        if (n.includes('automatizacion')) return 'almacenable';
        if (n.includes('herramienta') || n.includes('herramientas')) return 'almacenable';
        if (n.includes('costo') || n.includes('costos') || n.includes('precio') || n.includes('precios')) return 'refaccion';
        return categoriaActual || 'refaccion';
    }

    async function _leerArchivoComoArrayBuffer(file) {
        if (file.arrayBuffer) return await file.arrayBuffer();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function _leerArchivoComoTexto(file) {
        if (file.text) return await file.text();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(String(ev.target.result || ''));
            reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
            reader.readAsText(file);
        });
    }

    async function _manejarImportacionGeneral(e) {
        const input = e.target;
        const files = Array.from(input?.files || []);
        if (!files.length) return;
        const progress = document.querySelector('.import-progress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        if (progress) progress.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = 'Preparando importación...';

        let okFiles = 0;
        const errores = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const name = (file.name || '').toLowerCase();
            if (name.endsWith('.pdf') || file.type === 'application/pdf') continue;
            const categoria = _categoriaPorNombreArchivo(file.name);
            try {
                if (progressText) progressText.textContent = `Leyendo ${file.name} (${i + 1}/${files.length})...`;
                let workbook = null;
                if (name.endsWith('.csv') || file.type === 'text/csv') {
                    const csv = await _leerArchivoComoTexto(file);
                    workbook = XLSX.read(csv, { type: 'string' });
                } else {
                    const ab = await _leerArchivoComoArrayBuffer(file);
                    const data = new Uint8Array(ab);
                    workbook = XLSX.read(data, { type: 'array' });
                }
                const result = _obtenerDatosDeWorkbook(workbook);
                if (!result || !result.data || result.data.length === 0) {
                    throw new Error('No se detectaron columnas/filas válidas');
                }
                if (progressText) progressText.textContent = `Importando ${file.name} → ${categoria} (${result.data.length} filas)...`;
                await _procesarFilas(result.data, categoria, result.columnMap);
                okFiles++;
            } catch (err) {
                errores.push(`${file.name}: ${err?.message || String(err)}`);
            }
            const pct = Math.round(((i + 1) / files.length) * 100);
            if (progressFill) progressFill.style.width = `${pct}%`;
        }
        if (progress) progress.style.display = 'none';
        input.value = '';
        if (errores.length) {
            alert(`✅ Archivos importados: ${okFiles}\n❌ Con error: ${errores.length}\n\n- ${errores.slice(0, 8).join('\n- ')}${errores.length > 8 ? '\n- ...' : ''}`);
        } else {
            alert(`✅ Archivos importados: ${okFiles}`);
        }
    }

    function _abrirModalImportacion() {
        document.getElementById('importModal').classList.add('active');
        document.querySelector('.import-progress').style.display = 'none';
        document.getElementById('processImportBtn').style.display = 'none';
        document.getElementById('excelFile').value = '';
        excelData = null;
    }

    function _cerrarModalImportacion() {
        document.getElementById('importModal').classList.remove('active');
    }

    function _manejarArchivoExcel(e) {
        const file = e.target.files[0];
        if (!file) return;
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') {
            alert('Para importar datos use Excel (.xlsx, .xls) o CSV. El PDF se acepta solo como referencia.');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = new Uint8Array(ev.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const result = _obtenerDatosDeWorkbook(workbook);
                if (result) {
                    excelData = result.data;
                    excelColumnMap = result.columnMap;
                    document.getElementById('processImportBtn').style.display = 'flex';
                    document.getElementById('processImportBtn').innerHTML = 'Procesar ' + excelData.length + ' productos';
                } else {
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    const raw = json.filter(fila => fila.some(celda => celda != null && celda !== ''));
                    if (raw.length === 0) {
                        alert('El archivo no contiene datos válidos. Use una hoja con columnas como Código/SKU, Descripción/Nombre, Existencia/Stock, Ubicación, Costo, Precio.');
                        return;
                    }
                    excelColumnMap = _detectarColumnas(raw[0]);
                    if (excelColumnMap) {
                        excelData = raw.slice(1);
                    } else {
                        if (typeof raw[0][0] === 'string' && _normalizarTexto(raw[0][0]).includes('sku')) {
                            excelData = raw.slice(1);
                        } else {
                            excelData = raw.slice(0);
                        }
                        excelColumnMap = null;
                    }
                    if (excelData.length > 0) {
                        document.getElementById('processImportBtn').style.display = 'flex';
                        document.getElementById('processImportBtn').innerHTML = 'Procesar ' + excelData.length + ' productos';
                    } else {
                        alert('No se encontró fila de encabezados. Incluya columnas como: Código/SKU, Descripción/Nombre, Existencia, Ubicación, Costo, Precio.');
                    }
                }
            } catch (ex) {
                console.error(ex);
                alert('Error al leer el archivo');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _manejarArchivoDirecto(e) {
        const file = e.target.files[0];
        if (!file) return;
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') {
            alert('Para importar datos use Excel (.xlsx, .xls) o CSV. El PDF se acepta solo como referencia.');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                const data = new Uint8Array(ev.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const result = _obtenerDatosDeWorkbook(workbook);
                if (result && result.data.length > 0) {
                    await _procesarFilas(result.data, categoriaActual, result.columnMap);
                } else {
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    let filas = json.filter(f => f.some(c => c != null && c !== ''));
                    let colMap = _detectarColumnas(filas[0]);
                    if (colMap) filas = filas.slice(1);
                    else if (filas.length > 0 && typeof filas[0][0] === 'string' && _normalizarTexto(filas[0][0]).includes('sku')) {
                        filas = filas.slice(1);
                    }
                    if (filas.length > 0) await _procesarFilas(filas, categoriaActual, colMap);
                }
            } catch (ex) {
                console.error(ex);
                alert('Error al leer el archivo');
            }
            document.getElementById('fileInput').value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    async function _procesarImportacion() {
        if (!excelData || excelData.length === 0) return;
        const categoria = document.getElementById('importCategory').value;
        await _procesarFilas(excelData, categoria, excelColumnMap);
        _cerrarModalImportacion();
    }

    async function _procesarFilas(filas, categoria, columnMap) {
        const progress = document.querySelector('.import-progress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        progress.style.display = 'block';
        document.getElementById('processImportBtn').style.display = 'none';

        let importados = 0, omitidos = 0, errores = [];
        const csrfToken = sessionStorage.getItem('csrfToken');
        const map = columnMap || null;

        for (let i = 0; i < filas.length; i++) {
            const fila = filas[i];
            const { sku, nombre, stock, ubicacion, costo, precioVenta } = _extraerFila(fila, map);

            if (!sku || !nombre) { omitidos++; continue; }

            try {
                const existe = productos.find(p => p.sku.toLowerCase() === sku.toLowerCase() && p.categoria === categoria);
                const now = new Date().toISOString();
                if (existe) {
                    const oldStock = existe.stock || 0;
                    await inventarioService.update(existe.id, { stock, ubicacion, costo, precio_venta: precioVenta, updated_at: now }, csrfToken);
                    existe.stock = stock;
                    existe.ubicacion = ubicacion;
                    existe.costo = costo;
                    existe.precio_venta = precioVenta;
                    existe.updated_at = now;
                    if (stock !== oldStock) {
                        await _registrarMovimiento(existe.id, sku, oldStock, stock, 'importe', 'Actualización por importación');
                    }
                } else {
                    const newProduct = {
                        sku, nombre, categoria, ubicacion, minimo: 0, costo, precio_venta: precioVenta, stock,
                        created_at: now, updated_at: now
                    };
                    const inserted = await inventarioService.insert(newProduct, csrfToken);
                    productos.push({ ...newProduct, id: inserted?.id || inserted?.[0]?.id || inserted?.data?.id });
                    await _registrarMovimiento(inserted.id, sku, 0, stock, 'importe', 'Importación inicial');
                }
                importados++;
            } catch (err) {
                errores.push(`Fila ${i+1}: ${err.message}`);
            }

            const progreso = Math.round((i + 1) / filas.length * 100);
            progressFill.style.width = `${progreso}%`;
            progressText.textContent = `Procesando ${i+1} de ${filas.length}...`;
            await new Promise(r => setTimeout(r, 10));
        }
        alert(`✅ Importados: ${importados}\n⚠️ Omitidos: ${omitidos}\n❌ Errores: ${errores.length}`);
        progress.style.display = 'none';
    }

    function _actualizarCategoriaImport() {
        const select = document.getElementById('importCategory');
        if (select) select.value = categoriaActual;
    }

    // ==================== DATOS INICIALES ====================
    async function _cargarDatosIniciales() {
        const datosDemo = [
            { sku: 'LM339', nombre: 'Amplificador Comparador', categoria: 'refaccion', ubicacion: 'Estante A1', stock: 15, minimo: 5, costo: 45.50, precio_venta: 85.00 },
            { sku: 'SERV-001', nombre: 'Servicio de Reparación', categoria: 'servicio', ubicacion: 'Taller', stock: 999, minimo: 0, costo: 350.00, precio_venta: 650.00 },
            { sku: 'CONS-001', nombre: 'Soldadura 60/40', categoria: 'consumible', ubicacion: 'Cajón Q1', stock: 12, minimo: 3, costo: 85.00, precio_venta: 150.00 },
            { sku: 'ALM-001', nombre: 'Motor Siemens Reparado', categoria: 'almacenable', ubicacion: 'Rack 3', stock: 1, minimo: 0, costo: 12500.00, precio_venta: 18500.00 },
            { sku: 'CD4046BE', nombre: 'Circuito Sincronizador', categoria: 'refaccion', ubicacion: 'Estante A2', stock: 8, minimo: 2, costo: 120.75, precio_venta: 210.00 }
        ];
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            for (let p of datosDemo) {
                await inventarioService.insert(p, csrfToken);
            }
            alert('✅ 5 productos de ejemplo cargados');
        } catch (e) {
            console.error(e);
            alert('Error cargando datos iniciales');
        }
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-stock);">INVENTARIO</span><span>${new Date().toLocaleTimeString()}</span></div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
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
        _abrirModalEdicion
    };
})();

window.inventarioModule = InventarioModule;