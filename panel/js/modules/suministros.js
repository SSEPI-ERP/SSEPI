// ================================================
// ARCHIVO: suministros.js
// DESCRIPCIÓN: Módulo de Suministros — Catálogo BOM + Inventario
// FUNCIONALIDAD: Grid cards, imágenes, carrito, cotización SP-S, pipeline/kanban
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { pdfGenerator } from '../core/pdf-generator.js?v=8';
import { enqueueCoiJob } from '../core/coi-queue.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';
import { ssepiOn, SSEPI_EVENTS } from '../core/ssepi-runtime/ssepi-event-bus.js';
import { canSeeCostsInModule, isSuministrosAdmin, applyBodyFinancialClass } from '../core/ssepi-runtime/cost-visibility.js';

const SuministrosModule = (function() {
    // ==================== ESTADO ====================
    let bomItems = [];
    let inventarioItems = [];
    let catalogoUnificado = [];
    let carrito = [];
    let cotizaciones = [];
    let cotizacionesFiltradas = [];
    let contactos = [];
    let historialFiltros = { desde: '', hasta: '', estado: '', vendedorId: '', compradorId: '', autoId: '' };
    let historialUsuarios = { ventas: [], compras: [], automatizacion: [] };
    let vistaActual = 'grid';
    let paginaActual = 1;
    const ITEMS_POR_PAGINA = 48;
    let editingCotizacionId = null;
    let cotEstadoActual = 'cotizacion';
    let suministrosAutosaveCtrl = null;

    const SUMINISTROS_PIPELINE = [
        { id: 'cotizacion', label: 'Cotización' },
        { id: 'pendiente_admin', label: 'Revisión Admin' },
        { id: 'en_compra', label: 'En compras' },
        { id: 'aprobada', label: 'Aprobada' },
        { id: 'entregada', label: 'Entregada' }
    ];

    // Servicios
    const bomService = createDataService('bom_automatizacion');
    const inventarioService = createDataService('inventario');
    const cotizacionService = createDataService('cotizaciones');
    const movimientoService = createDataService('movimientos_inventario');
    const contactoService = createDataService('contactos');
    const notificacionesService = createDataService('notificaciones');

    // ==================== INICIALIZACIÓN ====================
    var perfilUsuario = null;

    function _verCostosSuministros() {
        return canSeeCostsInModule(perfilUsuario, 'suministros');
    }

    function _suministrosRecordKey() {
        const folio = (document.getElementById('cotFolio') || {}).value || '';
        return folio.trim() || 'carrito-borrador';
    }

    function _collectSuministrosDraft() {
        return {
            v: 1,
            carrito: carrito.slice(),
            cotFolio: (document.getElementById('cotFolio') || {}).value || '',
            cotCliente: (document.getElementById('cotCliente') || {}).value || '',
            cotDias: (document.getElementById('cotDias') || {}).value || '',
            cotKm: (document.getElementById('cotKm') || {}).value || '',
            cotUtilidad: (document.getElementById('cotUtilidad') || {}).value || ''
        };
    }

    function _initSuministrosAutosave() {
        suministrosAutosaveCtrl = createAutosaveController({
            module: 'suministros',
            getRecordKey: _suministrosRecordKey,
            collectPayload: _collectSuministrosDraft,
            getLabel: () => 'Suministros ' + (_suministrosRecordKey()),
            debounceMs: 1600
        });
        const cotRoot = document.querySelector('.cotizacion-sidebar') || document.getElementById('mainContent') || document.body;
        cotRoot.addEventListener('input', () => {
            if (suministrosAutosaveCtrl) suministrosAutosaveCtrl.schedule();
        }, true);
        cotRoot.addEventListener('change', () => {
            if (suministrosAutosaveCtrl) suministrosAutosaveCtrl.schedule();
        }, true);
    }

    function _applySuministrosDraft(w) {
        if (!w?.payload) return;
        if (w.payload.carrito) carrito = w.payload.carrito.slice();
        const setv = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val == null ? '' : val;
        };
        setv('cotFolio', w.payload.cotFolio);
        setv('cotCliente', w.payload.cotCliente);
        setv('cotDias', w.payload.cotDias);
        setv('cotKm', w.payload.cotKm);
        setv('cotUtilidad', w.payload.cotUtilidad);
        _renderCarrito();
        _renderKPIs();
        _updateCotResumen();
    }

    function _resumeSuministrosDraftKey(recordKey) {
        const w = loadLocalDraft('suministros', recordKey);
        if (!w?.payload) {
            _showToast('No se encontró el borrador', 'warning');
            return;
        }
        _applySuministrosDraft(w);
        document.getElementById('cotizacionSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function _tryResumeSuministrosDraft() {
        const resume = new URLSearchParams(window.location.search).get('resume');
        if (!resume) return;
        const w = loadLocalDraft('suministros', resume);
        if (!w?.payload?.carrito) return;
        if (!confirm('¿Recuperar borrador de suministros guardado en este equipo?')) return;
        _applySuministrosDraft(w);
        history.replaceState({}, document.title, window.location.pathname);
    }

    function _flushSuministrosAutosave() {
        if (suministrosAutosaveCtrl) suministrosAutosaveCtrl.flush();
    }

    async function init() {
        console.log('[Suministros] Inicializando módulo...');
        try {
            perfilUsuario = await authService.getCurrentProfile();
            applyBodyFinancialClass(perfilUsuario);
        } catch(e) {}
        _cargarCarritoPersistido();
        await _loadData();
        _bindEvents();
        _initSuministrosAutosave();
        _tryResumeSuministrosDraft();
        ssepiOn(SSEPI_EVENTS.RESUME_DRAFT, (detail) => {
            if (!detail || detail.module !== 'suministros') return;
            _resumeSuministrosDraftKey(detail.recordKey);
        });
        window.addEventListener('beforeunload', _flushSuministrosAutosave);
        _aplicarVisibilidadCostos();
        _renderCarrito();
        _renderKPIs();
        _updateCotResumen();
        _renderSuministrosPipeline();
        await _initHistorialFiltros();
        _configurarPermisosSuministrosUI();
        const editFolio = new URLSearchParams(window.location.search).get('edit');
        if (editFolio) {
            setTimeout(function () {
                _editarCotizacion(editFolio);
                document.getElementById('cotizacionSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 400);
        }
    }

    function _configurarPermisosSuministrosUI() {
        const verCostos = _verCostosSuministros();
        const admin = isSuministrosAdmin(perfilUsuario);
        document.body.classList.toggle('suministros-sin-costos', !verCostos);
        document.body.classList.toggle('suministros-es-admin', admin);
        const bandeja = document.getElementById('adminBandejaSection');
        if (bandeja) bandeja.hidden = !admin;
        const btnEnv = document.getElementById('btnEnviarCompras');
        if (btnEnv) {
            if (admin) {
                btnEnv.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar a Compras';
                btnEnv.title = 'Crear orden de compra y notificar a Compras';
            } else {
                btnEnv.innerHTML = '<i class="fas fa-user-shield"></i> Enviar a revisión Admin';
                btnEnv.title = 'Un administrador revisará costos antes de enviar a Compras';
            }
        }
        _aplicarVisibilidadCostos();
        _renderAdminBandeja();
        document.body.addEventListener('ssepi:cost-visibility-changed', _aplicarVisibilidadCostos);
    }

    function _esAdminSuministros() {
        return isSuministrosAdmin(perfilUsuario);
    }

    async function _initHistorialFiltros() {
        const admin = _esAdminSuministros();
        ['histFiltroVendedorWrap', 'histFiltroCompradorWrap', 'histFiltroAutoWrap'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.hidden = !admin;
        });
        if (!admin) return;
        try {
            const [ventas, compras, auto] = await Promise.all([
                authService.getUsersByRol(['ventas', 'ventas_sin_compras', 'facturacion', 'administracion']),
                authService.getUsersByRol(['compras', 'administracion']),
                authService.getUsersByRol(['automatizacion', 'motores', 'taller']),
            ]);
            historialUsuarios = { ventas: ventas || [], compras: compras || [], automatizacion: auto || [] };
            _fillHistorialSelect('histVendedor', historialUsuarios.ventas);
            _fillHistorialSelect('histComprador', historialUsuarios.compras);
            _fillHistorialSelect('histAutomatizacion', historialUsuarios.automatizacion);
        } catch (e) {
            console.warn('[Suministros] Filtros usuarios admin:', e);
        }
    }

    function _fillHistorialSelect(id, users) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">Todos</option>' + (users || []).map((u) => {
            const label = (u.nombre || u.email || u.id || '').trim();
            return `<option value="${u.id}">${label}</option>`;
        }).join('');
        if (cur) sel.value = cur;
    }

    function _cotData(c) {
        return c.data || c;
    }

    function _cotCreadorId(data) {
        return data.creado_por_id || data.usuario_id || '';
    }

    function _aplicarFiltrosHistorial() {
        let list = cotizaciones.slice();
        const { desde, hasta, estado, vendedorId, compradorId, autoId } = historialFiltros;
        if (desde) {
            list = list.filter((c) => {
                const d = (_cotData(c).created_at || '').substring(0, 10);
                return d && d >= desde;
            });
        }
        if (hasta) {
            list = list.filter((c) => {
                const d = (_cotData(c).created_at || '').substring(0, 10);
                return d && d <= hasta;
            });
        }
        if (estado) {
            list = list.filter((c) => (_cotData(c).estado || 'cotizacion') === estado);
        }
        if (vendedorId) {
            list = list.filter((c) => _cotCreadorId(_cotData(c)) === vendedorId);
        }
        if (compradorId) {
            list = list.filter((c) => {
                const data = _cotData(c);
                return data.comprador_id === compradorId || data.asignado_compras_id === compradorId;
            });
        }
        if (autoId) {
            list = list.filter((c) => {
                const data = _cotData(c);
                return data.automatizacion_id === autoId || data.tecnico_id === autoId;
            });
        }
        cotizacionesFiltradas = list.length ? list : (desde || hasta || estado || vendedorId || compradorId || autoId ? [] : cotizaciones.slice());
    }

    function _onHistorialFiltroChange() {
        historialFiltros = {
            desde: document.getElementById('histFechaDesde')?.value || '',
            hasta: document.getElementById('histFechaHasta')?.value || '',
            estado: document.getElementById('histEstado')?.value || '',
            vendedorId: document.getElementById('histVendedor')?.value || '',
            compradorId: document.getElementById('histComprador')?.value || '',
            autoId: document.getElementById('histAutomatizacion')?.value || '',
        };
        _aplicarFiltrosHistorial();
        _renderCotizaciones();
    }

    function _limpiarHistorialFiltros() {
        ['histFechaDesde', 'histFechaHasta', 'histEstado', 'histVendedor', 'histComprador', 'histAutomatizacion'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        historialFiltros = { desde: '', hasta: '', estado: '', vendedorId: '', compradorId: '', autoId: '' };
        _aplicarFiltrosHistorial();
        _renderCotizaciones();
    }

    function _aplicarVisibilidadCostos() {
        const verCostos = _verCostosSuministros();
        const hide = (sel) => document.querySelectorAll(sel).forEach((el) => { el.style.display = verCostos ? '' : 'none'; });
        hide('.col-costo-compra');
        hide('.col-precio-suministros');
        hide('#costosDesglose');
        hide('.cot-resumen-total');
        hide('#kpiCarritoTotalWrap');
        hide('.form-group-utilidad');
        hide('.carrito-col-precio');
        hide('.historial-col-total');
        if (!verCostos) {
            const t = document.getElementById('cotResumenTotal');
            if (t) t.textContent = '—';
        }
    }

    async function _loadClientesSuministros() {
        const normKey = (s) => (s || '').toString().toLowerCase().trim();
        let tabRows = [];
        try {
            if (window.supabase) {
                const { data, error } = await window.supabase
                    .from('clientes_tabulador')
                    .select('id, nombre_cliente, km, rfc, activo, orden')
                    .eq('activo', true)
                    .order('orden', { ascending: true });
                if (!error && data) tabRows = data.filter((c) => c.nombre_cliente);
            }
        } catch (e) { console.warn('[Suministros] clientes_tabulador:', e); }

        let all = [];
        try {
            const c1 = await contactoService.select({ tipo: 'client' }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 500 }) || [];
            const c2 = await contactoService.select({ tipo: 'cliente' }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 200 }) || [];
            const seen = new Set();
            for (const c of [...c1, ...c2]) {
                const k = String(c.id || c.nombre);
                if (!seen.has(k)) { seen.add(k); all.push(c); }
            }
        } catch (e) { console.warn('[Suministros] contactos:', e); }

        if (tabRows.length) {
            contactos = tabRows.map((t) => {
                const nombre = (t.nombre_cliente || '').trim().toUpperCase();
                const key = normKey(nombre);
                const match = all.find((c) => normKey(c.empresa_tabulador || c.nombre || c.empresa) === key);
                return {
                    id: match?.id || ('tab-' + key.replace(/\s+/g, '-')),
                    nombre,
                    empresa: nombre,
                    empresa_tabulador: nombre,
                    tipo: 'client',
                    rfc: t.rfc || match?.rfc || '',
                    km: Number(t.km) || 0,
                    _fromTabulador: true
                };
            });
            return;
        }
        contactos = all.filter((c) =>
            c.tipo === 'client' || c.tipo === 'cliente' || c.empresa_tabulador || c.es_tabulador
        );
    }

    async function _loadData() {
        try {
            const [bom, inv] = await Promise.all([
                bomService.select({}, { orderBy: 'numero_item', ascending: true, page: 0, pageSize: 500 }),
                inventarioService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 500 })
            ]);
            bomItems = (bom || []).map(i => ({ ...i, _source: 'BOM' }));
            inventarioItems = (inv || []).map(i => ({ ...i, _source: i.tipo_inventario === 'consumible' ? 'CONSUMIBLE' : 'STOCK' }));
            await _loadClientesSuministros();
        } catch (e) {
            console.warn('[Suministros] Supabase error, intentando offline:', e);
            await _tryOfflineLoad();
            await _loadClientesSuministros();
        }
        _buildCatalogo();
        _populateCategorias();
        _populateClientes();
        _render();
        _loadCotizaciones();
    }

    async function _tryOfflineLoad() {
        try {
            const [bomRes, invRes] = await Promise.all([
                fetch('/api/bom-search?limit=500').then(r => r.json()),
                fetch('/api/inventory-search?limit=500').then(r => r.json())
            ]);
            bomItems = (bomRes?.data || []).map(i => ({ ...i, _source: 'BOM' }));
            inventarioItems = (invRes?.data || []).map(i => ({ ...i, _source: i.tipo_inventario === 'consumible' ? 'CONSUMIBLE' : 'STOCK' }));
        } catch (e2) {
            console.error('[Suministros] Sin datos offline:', e2);
        }
    }

    function _bomImageUrl(item) {
        const idx = window.BOM_IMAGE_INDEX;
        if (!idx) return '';
        // 1. Item number lookup (most reliable — from image_map.json)
        const num = item.numero_item || item.item || '';
        if (num && idx[String(num)]) return '/panel/assets/bom/' + idx[String(num)];
        // 2. Part number lookup (normalized: lowercase, remove spaces, dots→dashes, underscores→dashes)
        const pn = (item.part_number || item.numero_parte || '').toLowerCase().replace(/\s+/g, '').replace(/\./g, '-').replace(/_/g, '-');
        if (pn && idx[pn]) return '/panel/assets/bom/' + idx[pn];
        // 3. Part number with underscores preserved
        const pn2 = (item.part_number || item.numero_parte || '').toLowerCase().replace(/\s+/g, '').replace(/\./g, '-');
        if (pn2 && idx[pn2]) return '/panel/assets/bom/' + idx[pn2];
        return '';
    }

    function _invImageUrl(item) {
        const sku = (item.sku || item.codigo || '').replace(/[^a-zA-Z0-9-]/g, '');
        return sku ? `/panel/assets/bom/${sku}.jpg` : '';
    }

    function _buildCatalogo() {
        catalogoUnificado = [];
        bomItems.forEach(b => {
            let provs = [];
            try { provs = typeof b.proveedores === 'string' ? JSON.parse(b.proveedores) : (b.proveedores || []); } catch(e) {}
            catalogoUnificado.push({
                id: b.id || b.numero_item,
                source: 'BOM',
                numero_item: b.numero_item || b.item,
                codigo: b.part_number || '',
                descripcion: b.descripcion || b.description || b.part_number || '',
                categoria: b.categoria_original || b.categoria || '',
                categoriaERP: b.categoria || '',
                precio: b.mejor_precio || 0,
                stock: null,
                proveedores: provs,
                link: provs.length > 0 ? (provs.sort((a,b2) => (a.precio||Infinity) - (b2.precio||Infinity))[0]?.link || '') : '',
                estado: b.estado_actualizacion || '',
                tieneImagen: b.tiene_imagen || false,
                ubicacion: '',
                imageUrl: _bomImageUrl(b)
            });
        });
        inventarioItems.forEach(i => {
            const links = [i.link_octopart, i.link_digikey, i.link_mouser].filter(Boolean);
            catalogoUnificado.push({
                id: i.id,
                source: i.tipo_inventario === 'consumible' ? 'CONSUMIBLE' : 'STOCK',
                numero_item: '',
                codigo: i.sku || '',
                descripcion: i.nombre || i.descripcion || '',
                categoria: _categoriaLabel(i.categoria),
                categoriaERP: i.categoria || '',
                precio: i.costo_online || i.costo_local || i.costo || 0,
                stock: i.stock || 0,
                proveedores: links.map(l => ({ nombre: _linkToName(l), precio: i.costo_online || i.costo || 0, link: l })),
                link: links[0] || '',
                estado: '',
                tieneImagen: false,
                ubicacion: i.ubicacion || '',
                imageUrl: _invImageUrl(i)
            });
        });
    }

    function _categoriaLabel(cat) {
        const map = { plc:"PLC's",hmi:"HMI's",servodrive:'Servodrives',servomotor:'Servo Motor',sensor:'Sensores',encoder:'Encoder',comunicacion:'Comunicación',alimentacion:'Alimentación',proteccion_electrica:'Protección Eléctrica',motor:'Motores',variador:'Variador',material_electrico:'Material Eléctrico',accesorio:'Accesorios',material_mecanico:'Materiales Mecánicos',seguridad_industrial:'Seguridad Industrial',flejadota:'Flejadoras',camara:'Cámara',semiconductor_potencia:'Semiconductores',capacitor:'Capacitores',resistencia:'Resistencias',diodo:'Diodos',transistor:'Transistores',optoacoplador:'Optoacopladores',ic_analogo:'IC Análogos',ic_digital:'IC Digitales',fuente_regulador:'Fuentes/Reguladores',fusible:'Fusibles',relevador:'Relevadores',bateria:'Baterías',memoria:'Memorias',interfaz_comunicacion:'Interfaces',conector_accesorio:'Conectores',controlador:'Controladores',consumible_soldadura:'Soldadura',consumible_limpieza:'Limpieza',consumible_quimico:'Químicos',consumible_termico:'Térmico',consumible_proteccion:'Protección',refaccion:'Refacción' };
        return map[cat] || cat;
    }

    function _linkToName(url) {
        if (!url) return '';
        if (url.includes('digikey')) return 'DigiKey';
        if (url.includes('mouser')) return 'Mouser';
        if (url.includes('octopart')) return 'Octopart';
        try { return new URL(url).hostname.replace('www.', ''); } catch(e) { return ''; }
    }

    // ==================== RENDER PRINCIPAL ====================
    function _render() {
        _renderKPIs();
        _renderCatalogo();
        _renderCotizaciones();
    }

    function _renderKPIs() {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const verCostos = _verCostosSuministros();
        set('kpiTotalItems', catalogoUnificado.length);
        set('kpiCarritoItems', carrito.reduce((s, i) => s + i.qty, 0));
        set('kpiCarritoTotal', verCostos ? '$' + carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0).toLocaleString('es-MX', {minimumFractionDigits: 2}) : '—');
        set('kpiCotizaciones', cotizaciones ? cotizaciones.length : 0);
    }

    function _getFilteredCatalogo() {
        const term = (document.getElementById('catalogoBusqueda')?.value || '').toLowerCase().trim();
        const cat = document.getElementById('catalogoCategoria')?.value || '';
        const activeChip = document.querySelector('.fuente-chip.active');
        const fuente = activeChip ? (activeChip.dataset.fuente || '') : (document.getElementById('catalogoFuente')?.value || '');
        return catalogoUnificado.filter(item => {
            if (term && !item.descripcion.toLowerCase().includes(term) && !item.codigo.toLowerCase().includes(term) && !item.categoria.toLowerCase().includes(term)) return false;
            if (cat && item.categoria !== cat) return false;
            if (fuente === 'BOM' && item.source !== 'BOM') return false;
            if (fuente === 'STOCK' && item.source !== 'STOCK') return false;
            if (fuente === 'CONSUMIBLE' && item.source !== 'CONSUMIBLE') return false;
            return true;
        });
    }

    // ==================== GRID / LISTA CATÁLOGO ====================
    function _renderCatalogo() {
        const filtered = _getFilteredCatalogo();
        const start = (paginaActual - 1) * ITEMS_POR_PAGINA;
        const page = filtered.slice(start, start + ITEMS_POR_PAGINA);
        const container = document.getElementById('catalogoContainer');
        if (!container) return;

        // Actualizar count de resultados
        const countEl = document.getElementById('filtroResultCount');
        if (countEl) countEl.textContent = filtered.length + ' artículo' + (filtered.length !== 1 ? 's' : '');

        if (vistaActual === 'grid') {
            container.innerHTML = page.map(item => _renderCard(item)).join('');
        } else {
            container.innerHTML = `<table class="data-table"><thead><tr><th>Fuente</th><th>Código</th><th>Descripción</th><th>Categoría</th><th>Precio Venta</th><th class="col-costo-compra">Costo Compra</th><th>Stock/Prov.</th><th></th></tr></thead><tbody>${page.map(item => _renderRow(item)).join('')}</tbody></table>`;
        }
        _renderPagination(filtered.length);
        _aplicarVisibilidadCostos();
    }

    function _renderCard(item) {
        try {
        const badge = item.source === 'BOM' ? '<span class="source-badge source-badge-bom">BOM</span>' :
                      item.source === 'CONSUMIBLE' ? '<span class="source-badge source-badge-consumible">CONS</span>' :
                      '<span class="source-badge source-badge-stock">STOCK</span>';
        const costoCompra = item.precio || 0;
        const precioVenta = costoCompra > 0 ? costoCompra * 1.4 : 0;
        const verCostos = _verCostosSuministros();
        const precioBadge = verCostos && precioVenta > 0 ? `<span class="card-price-venta col-precio-suministros">Venta: $${Number(precioVenta).toLocaleString('es-MX',{minimumFractionDigits:2})}</span>` : '';
        const costoBadge = verCostos && costoCompra > 0 ? `<span class="card-price-costo">Costo: $${Number(costoCompra).toLocaleString('es-MX',{minimumFractionDigits:2})}</span>` : '';
        const provArr = Array.isArray(item.proveedores) ? item.proveedores : [];
        const stockInfo = item.stock !== null && item.stock !== undefined ? `<span class="card-stock">${item.stock} pzas</span>` :
                          provArr.length > 0 ? `<span class="card-provs">${provArr.length} prov.</span>` : '';
        const inCart = carrito.some(c => c.id === item.id && c.source === item.source);
        const imgUrl = item.imageUrl || '';
        const imgHtml = imgUrl ? `<div class="card-img" style="background-image:url('${imgUrl}')" onerror="this.style.backgroundImage='none';this.classList.add('card-img-icon');this.innerHTML='<i class=\\'fas fa-cube\\'></i>'"></div>` :
                        item.source !== 'BOM' ? `<div class="card-img card-img-icon"><i class="fas fa-${item.source === 'CONSUMIBLE' ? 'flask' : 'microchip'}"></i></div>` :
                        `<div class="card-img card-img-icon"><i class="fas fa-cube"></i></div>`;
        const desc = item.descripcion || '';
        return `<div class="sum-card${inCart ? ' sum-card-in-cart' : ''}" data-id="${item.id}" data-source="${item.source}">
            ${imgHtml}
            <div class="card-body">
                <div class="card-header-row">${badge} <span class="card-code">${_esc(item.codigo)}</span></div>
                <div class="card-desc" title="${_esc(desc)}">${_esc(desc.substring(0,55))}${desc.length > 55 ? '…' : ''}</div>
                <div class="card-cat">${_esc(item.categoria)}</div>
                <div class="card-footer">
                    ${precioBadge}
                    ${costoBadge}
                    ${stockInfo}
                    ${inCart ? '<span class="card-added">✓</span>' : `<button class="btn-add-item" onclick="suministrosModule._addToCartDirect('${item.id}','${item.source}')">+ Agregar</button>`}
                </div>
                ${provArr.length > 0 ? `<div class="card-prov-row">${provArr.slice(0,2).map(p => `<span class="card-prov-chip">${_esc(p.nombre)}${verCostos && p.precio > 0 ? ': $' + Number(p.precio).toLocaleString('es-MX',{minimumFractionDigits:2}) : ''}</span>`).join('')}</div>` : ''}
            </div>
        </div>`;
        } catch(e) { console.error('[Suministros] Error rendering card:', e, item); return ''; }
    }

    function _renderRow(item) {
        try {
        const provArr = Array.isArray(item.proveedores) ? item.proveedores : [];
        const badge = item.source === 'BOM' ? '<span class="source-badge source-badge-bom">BOM</span>' :
                      item.source === 'CONSUMIBLE' ? '<span class="source-badge source-badge-consumible">CONS</span>' :
                      '<span class="source-badge source-badge-stock">STOCK</span>';
        const costoCompra = item.precio || 0;
        const precioVenta = costoCompra > 0 ? costoCompra * 1.4 : 0;
        const verCostos = _verCostosSuministros();
        const precioVentaStr = verCostos && precioVenta > 0 ? `$${Number(precioVenta).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
        const costoCompraStr = verCostos && costoCompra > 0 ? `$${Number(costoCompra).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
        const stockInfo = item.stock !== null && item.stock !== undefined ? `<strong>${item.stock}</strong> pzas` :
                          provArr.length > 0 ? `${provArr.length} prov.` : '—';
        const inCart = carrito.some(c => c.id === item.id && c.source === item.source);
        const desc = item.descripcion || '';
        return `<tr>
            <td>${badge}</td><td><strong>${_esc(item.codigo)}</strong></td>
            <td title="${_esc(desc)}">${_esc(desc.substring(0,60))}${desc.length>60?'…':''}</td>
            <td>${_esc(item.categoria)}</td><td class="col-precio-suministros">${precioVentaStr}</td><td class="col-costo-compra">${costoCompraStr}</td><td>${stockInfo}</td>
            <td>${inCart ? '<span style="color:#10b981">✓</span>' : `<button class="btn-add-item" onclick="suministrosModule._addToCartDirect('${item.id}','${item.source}')">+</button>`}</td>
        </tr>`;
        } catch(e) { console.error('[Suministros] Error rendering row:', e, item); return '<tr><td colspan="8">Error</td></tr>'; }
    }

    function _renderPagination(total) {
        const pages = Math.ceil(total / ITEMS_POR_PAGINA);
        const cont = document.getElementById('catalogoPaginacion');
        if (!cont) return;
        if (pages <= 1) { cont.innerHTML = ''; return; }
        let html = '';
        for (let i = 1; i <= pages; i++) html += `<button class="${i===paginaActual?'active':''}" onclick="suministrosModule._goToPage(${i})">${i}</button>`;
        cont.innerHTML = html;
    }

    // ==================== CARRITO ====================
    const CARRITO_STORAGE_KEY = 'ssepi_suministros_carrito';

    function _persistirCarrito() {
        try { localStorage.setItem(CARRITO_STORAGE_KEY, JSON.stringify(carrito)); } catch(e) {}
        if (suministrosAutosaveCtrl) suministrosAutosaveCtrl.schedule();
    }

    function _cargarCarritoPersistido() {
        try {
            const raw = localStorage.getItem(CARRITO_STORAGE_KEY);
            if (raw) carrito = JSON.parse(raw) || [];
        } catch(e) { carrito = []; }
    }

    function _limpiarCarritoPersistido() {
        try { localStorage.removeItem(CARRITO_STORAGE_KEY); } catch(e) {}
    }

    function _addToCartDirect(id, source) {
        const item = catalogoUnificado.find(c => c.id == id && c.source === source);
        if (!item) return;
        const existing = carrito.find(c => c.id === item.id && c.source === item.source);
        if (existing) { existing.qty++; } else { carrito.push({ ...item, qty: 1 }); }
        _persistirCarrito();
        _renderCatalogo();
        _renderCarrito();
        _renderKPIs();
    }

    function _removeFromCart(idx) {
        carrito.splice(idx, 1);
        _persistirCarrito();
        _renderCatalogo(); _renderCarrito(); _renderKPIs();
    }

    function _updateCartQty(idx, qty) {
        if (qty <= 0) { _removeFromCart(idx); return; }
        carrito[idx].qty = qty;
        _persistirCarrito();
        _renderCarrito(); _renderKPIs();
    }

    function _vaciarCarrito() {
        carrito = [];
        _limpiarCarritoPersistido();
        _renderCatalogo(); _renderCarrito(); _renderKPIs();
    }

    function _renderCarrito() {
        const tbody = document.getElementById('carritoBody');
        const totalItems = document.getElementById('carritoTotalItems');
        const totalPrecio = document.getElementById('carritoTotalPrecio');
        if (!tbody) return;
        const verCostos = _verCostosSuministros();
        if (carrito.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="carrito-empty">Agrega artículos del catálogo</td></tr>`;
            if (totalItems) totalItems.textContent = '0';
            if (totalPrecio) totalPrecio.textContent = '$0.00';
            return;
        }
        let grandTotal = 0;
        tbody.innerHTML = carrito.map((item, idx) => {
            const sub = (item.precio || 0) * item.qty;
            grandTotal += sub;
            const badge = item.source === 'BOM' ? '<span class="source-badge source-badge-bom">BOM</span>' :
                          item.source === 'CONSUMIBLE' ? '<span class="source-badge source-badge-consumible">CONS</span>' :
                          '<span class="source-badge source-badge-stock">STOCK</span>';
            const stockWarn = (item.source === 'STOCK' || item.source === 'CONSUMIBLE') && item.stock !== null && item.qty > item.stock ?
                ` <span style="color:#dc2626;font-size:.75rem">(stock:${item.stock})</span>` : '';
            const costoCompraStr = verCostos ? `$${(item.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
            const subtotalStr = verCostos ? `$${sub.toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
            return `<tr>
                <td>${badge}</td>
                <td><strong>${_esc(item.codigo)}</strong> — ${_esc(item.descripcion.substring(0,40))}</td>
                <td><input type="number" value="${item.qty}" min="1" style="width:55px" onchange="suministrosModule._updateCartQty(${idx},parseInt(this.value))">${stockWarn}</td>
                <td class="carrito-col-precio col-precio-suministros">${verCostos ? `$${(item.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—'}</td>
                <td class="col-costo-compra carrito-col-precio">${costoCompraStr}</td>
                <td class="carrito-col-precio"><strong>${subtotalStr}</strong></td>
                <td>${item.link ? `<a href="${item.link}" target="_blank" class="supplier-link"><i class="fas fa-external-link-alt"></i></a>` : '—'}</td>
                <td><button class="btn-remove" onclick="suministrosModule._removeFromCart(${idx})">✖</button></td>
            </tr>`;
        }).join('');
        if (totalItems) totalItems.textContent = carrito.reduce((s,i)=>s+i.qty,0);
        if (totalPrecio) totalPrecio.textContent = verCostos ? '$' + grandTotal.toLocaleString('es-MX',{minimumFractionDigits:2}) : '—';
    }

    // ==================== COTIZACIÓN ====================
    function _recalcularCostos() {
        const dias = parseInt(document.getElementById('cotDias')?.value) || 1;
        const km = parseInt(document.getElementById('cotKm')?.value) || 0;
        const utilidadPct = parseInt(document.getElementById('cotUtilidad')?.value) || 40;
        const proveedor = carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0);
        const resultado = CostosEngine.calcularSuministros(dias, km, proveedor, utilidadPct / 100 + 1);
        const verCostos = _verCostosSuministros();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = verCostos ? '$' + (val||0).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'; };
        set('costoProveedor', resultado.proveedor);
        set('costoGasolina', resultado.gasolina);
        set('costoGastos', resultado.totalGasVentas + resultado.camioneta);
        set('costoUtilidad', resultado.utilidad - resultado.totalGasVentas - resultado.camioneta - resultado.proveedor);
        set('costoCredito', resultado.credito - resultado.utilidad);
        set('costoIva', resultado.credito * 0.16);
        set('costoGranTotal', resultado.credito * 1.16);
        const u = document.getElementById('utilidadPct'); if (u) u.textContent = utilidadPct;
        _updateCotResumen(resultado.credito * 1.16);
    }

    function _updateCotResumen(totalEst) {
        const folioEl = document.getElementById('cotResumenFolio');
        const clienteEl = document.getElementById('cotResumenCliente');
        const itemsEl = document.getElementById('cotResumenItems');
        const totalEl = document.getElementById('cotResumenTotal');
        const estadoEl = document.getElementById('cotResumenEstado');
        const folioIn = document.getElementById('cotFolio');
        const clienteSel = document.getElementById('cotCliente');
        if (folioEl && folioIn) folioEl.textContent = folioIn.value.trim() || '—';
        if (clienteEl && clienteSel) {
            clienteEl.textContent = clienteSel.selectedIndex > 0
                ? clienteSel.options[clienteSel.selectedIndex].text
                : '—';
        }
        if (itemsEl) itemsEl.textContent = String(carrito.reduce((s, i) => s + i.qty, 0));
        if (totalEl) {
            totalEl.textContent = _verCostosSuministros()
                ? '$' + (totalEst || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
                : '—';
        }
        if (estadoEl) {
            const folioVal = folioIn && folioIn.value.trim();
            if (!folioVal) estadoEl.textContent = 'Sin registrar';
            else {
                const step = SUMINISTROS_PIPELINE.find(s => s.id === cotEstadoActual);
                estadoEl.textContent = step ? step.label : cotEstadoActual;
            }
        }
        const tipoEl = document.getElementById('cotResumenTipo');
        const tipoHidden = document.getElementById('cotTipoOrden');
        if (tipoEl) {
            tipoEl.textContent = (tipoHidden && tipoHidden.value) || (folioIn && folioIn.value.trim() ? COT_TIPO_ORDEN_LABEL : '—');
        }
    }

    async function _guardarCotizacion(opts) {
        const skipClear = opts && opts.skipClear;
        const estadoOverride = opts && opts.estadoOverride;
        const silent = opts && opts.silent;
        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return null; }
        const clienteId = document.getElementById('cotCliente')?.value;
        const cliente = contactos.find(c => (c.id || c.nombre) == clienteId);
        if (!cliente) { _showToast('Selecciona un cliente', 'warning'); return null; }

        const dias = parseInt(document.getElementById('cotDias')?.value) || 1;
        const km = parseInt(document.getElementById('cotKm')?.value) || 0;
        const utilidadPct = parseInt(document.getElementById('cotUtilidad')?.value) || 40;
        const proveedor = carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0);
        const resultado = CostosEngine.calcularSuministros(dias, km, proveedor, utilidadPct / 100 + 1);

        let folio = (document.getElementById('cotFolio')?.value || '').trim();
        if (!folio) folio = await _generateFolio();

        const fechaConfirmacion = document.getElementById('cotFechaConfirmacion')?.value || '';
        const fechaCertificacion = document.getElementById('cotFechaCertificacion')?.value || '';
        const entregaEsperada = document.getElementById('cotEntregaEsperada')?.value || '';
        const llegada = document.getElementById('cotLlegada')?.value || '';
        const precorsoImportes = document.getElementById('cotPrecorsoImportes')?.value || '';
        const precorsoImporto = document.getElementById('cotPrecorsoImporto')?.value || '';

        const totalVenta = resultado.credito * 1.16;
        const factorVenta = proveedor > 0 ? totalVenta / proveedor : 0;

        const componentes = carrito.map(item => {
            const costoCompra = item.precio || 0;
            const subtotalCosto = costoCompra * item.qty;
            const precioVentaUnitario = costoCompra * factorVenta;
            const subtotalVenta = precioVentaUnitario * item.qty;
            return {
                source: item.source, id: item.id, codigo: item.codigo, descripcion: item.descripcion,
                categoria: item.categoria, cantidad: item.qty, precio_unitario: item.precio,
                subtotal: subtotalCosto, link: item.link, proveedores: item.proveedores, stock: item.stock,
                costo_compra: costoCompra, subtotal_costo: subtotalCosto,
                precio_venta_unitario: precioVentaUnitario, subtotal_venta: subtotalVenta
            };
        });

        const cotizacionData = {
            folio,
            cliente_nombre: cliente.nombre || '',
            cliente_id: cliente.id || cliente.nombre,
            estado: estadoOverride || cotEstadoActual || 'cotizacion',
            origen: 'suministro',
            tipo_orden: COT_TIPO_ORDEN,
            departamento: 'Suministro',
            creado_por_id: perfilUsuario?.id || perfilUsuario?.auth_user_id || '',
            creado_por_nombre: perfilUsuario?.nombre || sessionStorage.getItem('ssepi_nombre') || '',
            creado_por_rol: perfilUsuario?.rol || sessionStorage.getItem('ssepi_rol') || '',
            subtotal: resultado.proveedor,
            iva: resultado.credito * 0.16,
            total: totalVenta,
            cerebro_registro: { dias, km, proveedor, utilidadPct, resultado, fecha_confirmacion: fechaConfirmacion, fecha_certificacion: fechaCertificacion, entrega_esperada: entregaEsperada, llegada, precorso_importes: precorsoImportes, precorso_importo: precorsoImporto, cliente_nombre: cliente.nombre || '', cliente_id: cliente.id || cliente.nombre },
            componentes,
            observaciones: `Cotización de suministros - ${carrito.length} artículos`
        };

        try {
            if (editingCotizacionId) {
                await cotizacionService.update(editingCotizacionId, cotizacionData);
                if (!silent) _showToast(`Cotización ${folio} actualizada`, 'success');
            } else {
                const existe = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
                if (existe) { _showToast('Ya existe una cotización con ese folio', 'warning'); return null; }
                const inserted = await cotizacionService.insert(cotizacionData);
                editingCotizacionId = inserted?.id || editingCotizacionId;
                try {
                    await enqueueCoiJob({ erp_source: 'cotizacion_suministro', erp_id: folio, folio, idempotency_key: `suministro:${folio}:cotizacion`, payload_json: cotizacionData });
                    console.log('[Suministros] Cotización encolada en COI:', folio);
                } catch (coiErr) { console.warn('[Suministros] COI queue error:', coiErr?.message || coiErr); }
                if (!silent) _showToast(`Cotización ${folio} guardada`, 'success');
            }
            document.getElementById('cotFolio').value = folio;
            _setCotTipoOrden();
            cotEstadoActual = cotizacionData.estado;
            _renderSuministrosPipeline();
            if (!skipClear) _limpiarCot();
            await _loadCotizaciones();
            return { folio, cotizacionData, cotId: editingCotizacionId };
        } catch (e) {
            console.error('[Suministros] Error guardando:', e);
            _showToast('Error al guardar: ' + e.message, 'error');
            return null;
        }
    }

    async function _enviarRevisionAdmin() {
        if (isSuministrosAdmin(perfilUsuario)) {
            return _enviarACompras();
        }
        return _enviarAAdmin();
    }

    async function _enviarAAdmin() {
        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return; }
        const saved = await _guardarCotizacion({ skipClear: true, estadoOverride: 'pendiente_admin', silent: true });
        if (!saved) return;
        const { folio } = saved;
        const csrfToken = sessionStorage.getItem('csrfToken');
        const clienteTxt = document.getElementById('cotCliente')?.options?.[document.getElementById('cotCliente')?.selectedIndex]?.text || '';
        const solicitante = perfilUsuario?.nombre || sessionStorage.getItem('ssepi_nombre') || 'Ventas';
        try {
            if (saved.cotId) {
                await cotizacionService.update(saved.cotId, {
                    ...saved.cotizacionData,
                    estado: 'pendiente_admin',
                    enviado_admin_at: new Date().toISOString(),
                });
            }
            cotEstadoActual = 'pendiente_admin';
            _renderSuministrosPipeline();
            await notificacionesService.insert({
                para: 'admin',
                tipo: 'suministro_revision_admin',
                folio,
                cliente: clienteTxt,
                mensaje: `${solicitante} envió cotización de suministros ${folio} para revisión de costos antes de Compras.`,
                leido: false,
                fecha: new Date().toISOString(),
            }, csrfToken);
            _showToast(`Cotización ${folio} enviada a revisión del administrador`, 'success');
            _limpiarCot();
            await _loadCotizaciones();
        } catch (e) {
            console.error('[Suministros] Enviar a admin:', e);
            _showToast('Error al enviar a admin: ' + (e.message || e), 'error');
        }
    }

    async function _enviarACompras() {
        if (!isSuministrosAdmin(perfilUsuario)) {
            return _enviarAAdmin();
        }
        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return; }
        const folio = document.getElementById('cotFolio')?.value;
        if (!folio) { _showToast('Guarda la cotización primero', 'warning'); return; }

        const comprasService = createDataService('compras');
        const cliente = document.getElementById('cotCliente')?.value;
        const itemsCompra = carrito.map(item => ({
            sku: item.codigo || '',
            descripcion: item.descripcion || '',
            cantidad: item.qty || 1,
            costo_unitario: item.precio || 0,
            costo_total: (item.qty || 1) * (item.precio || 0),
            link_proveedor: item.link || ''
        }));
        const compraData = {
            folio: 'CMP-' + folio,
            proveedor_nombre: (carrito.find(i => i.proveedores?.length > 0)?.proveedores?.[0]?.nombre) || '',
            departamento: 'Suministro',
            estado: 0, // Borrador: esperando que Compras verifique stock/cotice
            estado_interno: 'esperando_diagnostico',
            vinculacion: { tipo: 'cotizacion_suministro', folio, cliente },
            items: itemsCompra,
            observaciones: `Suministros: verificar stock y cotizar para ${folio}. No proceder hasta confirmación de cliente.`
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await comprasService.insert(compraData, csrfToken);
            const compraId = inserted?.id || inserted?.[0]?.id;
            if (compraId) {
                const itemsService = createDataService('compras_items');
                for (const item of itemsCompra) {
                    await itemsService.insert({ compra_id: compraId, ...item }, csrfToken);
                }
            }
            // Notificar a Compras para que verifique stock y cotice
            try {
                await notificacionesService.insert({
                    para: 'compras',
                    tipo: 'solicitud_cotizacion',
                    orden_id: compraId,
                    folio: compraData.folio,
                    cliente: document.getElementById('cotCliente')?.options?.[document.getElementById('cotCliente')?.selectedIndex]?.text || cliente || '',
                    mensaje: `Suministros solicita verificar stock y cotizar: ${compraData.folio}. Verifique disponibilidad en inventario o cotice con proveedores.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (nErr) { console.warn('[Suministros] Error notificando a Compras:', nErr); }
            // Notificar a Ventas que hay una solicitud de suministro en proceso
            try {
                await notificacionesService.insert({
                    para: 'ventas',
                    tipo: 'diagnostico_completado',
                    orden_id: compraId,
                    folio: compraData.folio,
                    cliente: document.getElementById('cotCliente')?.options?.[document.getElementById('cotCliente')?.selectedIndex]?.text || cliente || '',
                    mensaje: `Suministros envió ${compraData.folio} a Compras para verificar stock/cotización. Espere precios para presentar cotización al cliente.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (nErr) { console.warn('[Suministros] Error notificando a Ventas:', nErr); }
            try {
                await enqueueCoiJob({ erp_source: 'compra', erp_id: compraData.folio, folio: compraData.folio, idempotency_key: `compra:suministro:${folio}`, payload_json: compraData });
            } catch (coiErr) { console.warn('[Suministros] COI compra error:', coiErr?.message || coiErr); }
            cotEstadoActual = 'en_compra';
            _renderSuministrosPipeline();
            try {
                const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
                const cotId = cot?.id || editingCotizacionId;
                if (cotId) {
                    await cotizacionService.update(cotId, { estado: 'en_compra', folio });
                }
            } catch (upErr) { console.warn('[Suministros] Actualizar estado cotización:', upErr); }
            _showToast(`Orden de compra ${compraData.folio} creada como borrador. Esperando stock/cotización de Compras.`, 'success');
            _addToFeed('📤', `Suministros envió ${folio} a Compras como borrador`);
        } catch (e) {
            _showToast('Error al crear compra: ' + (e.message || e), 'error');
        }
    }

    async function _deducirInventario(componentes, folio) {
        let deducidos = 0;
        for (const comp of componentes) {
            if (comp.source !== 'STOCK' && comp.source !== 'CONSUMIBLE') continue;
            try {
                await movimientoService.insert({
                    producto_id: comp.codigo || String(comp.id), tipo_movimiento: 'salida',
                    cantidad: comp.cantidad, costo_unitario: comp.precio_unitario || 0,
                    referencia: `Suministro ${folio}`, departamento: 'Suministro', created_at: new Date().toISOString()
                });
                deducidos++;
                try {
                    await enqueueCoiJob({ erp_source: 'movimiento_inventario', erp_id: comp.codigo || String(comp.id), folio, idempotency_key: `inv:suministro:${comp.codigo}:${folio}`, payload_json: { tipo_movimiento: 'salida', cantidad: comp.cantidad, producto: comp.codigo, referencia: `Suministro ${folio}` } });
                } catch (coiErr) { console.warn('[Suministros] COI mov error:', coiErr?.message || coiErr); }
            } catch (e) { console.warn('[Suministros] Error deduciendo', comp.codigo, e); }
        }
        return deducidos;
    }

    const COT_TIPO_ORDEN = 'suministro';
    const COT_TIPO_ORDEN_LABEL = 'Suministro (SP-S)';

    function _setCotTipoOrden() {
        const hidden = document.getElementById('cotTipoOrden');
        if (hidden) hidden.value = COT_TIPO_ORDEN;
        const tipoEl = document.getElementById('cotResumenTipo');
        if (tipoEl) tipoEl.textContent = COT_TIPO_ORDEN_LABEL;
    }

    function _expandCotForm() {
        const panel = document.getElementById('cotFormPanel');
        const btn = document.getElementById('btnToggleCotRegistro');
        const icon = document.getElementById('cotToggleIcon');
        const label = document.getElementById('cotToggleLabel');
        if (panel) panel.classList.remove('is-collapsed');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (label) label.textContent = 'Ocultar datos de la orden';
    }

    function _collapseCotForm() {
        const panel = document.getElementById('cotFormPanel');
        const btn = document.getElementById('btnToggleCotRegistro');
        const icon = document.getElementById('cotToggleIcon');
        const label = document.getElementById('cotToggleLabel');
        if (panel) panel.classList.add('is-collapsed');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (icon) icon.className = 'fas fa-chevron-down';
        if (label) label.textContent = 'Registrar datos de la orden';
    }

    function _toggleCotForm() {
        const panel = document.getElementById('cotFormPanel');
        if (!panel) return;
        if (panel.classList.contains('is-collapsed')) _expandCotForm();
        else _collapseCotForm();
    }

    async function _ensureCotFolio() {
        const el = document.getElementById('cotFolio');
        if (!el || el.value.trim()) return el ? el.value.trim() : '';
        const folio = await _generateFolio();
        el.value = folio;
        _setCotTipoOrden();
        _updateCotResumen();
        return folio;
    }

    async function _iniciarRegistroOrdenSuministro() {
        editingCotizacionId = null;
        cotEstadoActual = 'cotizacion';
        _renderSuministrosPipeline();
        document.getElementById('cotCliente').value = '';
        document.getElementById('cotDias').value = '1';
        document.getElementById('cotKm').value = '0';
        document.getElementById('cotUtilidad').value = '40';
        ['cotFechaConfirmacion', 'cotFechaCertificacion', 'cotEntregaEsperada', 'cotLlegada', 'cotPrecorsoImportes', 'cotPrecorsoImporto'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const folioEl = document.getElementById('cotFolio');
        if (folioEl) folioEl.value = '';
        const btnGuardar = document.getElementById('btnGuardarCot');
        if (btnGuardar) btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar Cotización';
        _recalcularCostos();
        _expandCotForm();
        try {
            const folio = await _ensureCotFolio();
            _showToast(`Orden ${folio} — tipo ${COT_TIPO_ORDEN_LABEL}`, 'success');
            document.getElementById('cotizacionSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.warn('[Suministros] Folio:', e);
            _showToast('No se pudo generar el folio. Reintenta.', 'warning');
        }
    }

    function _renderSuministrosPipeline() {
        const host = document.getElementById('suministrosPipeline');
        if (!host) return;
        const idx = SUMINISTROS_PIPELINE.findIndex(s => s.id === cotEstadoActual);
        host.innerHTML = SUMINISTROS_PIPELINE.map((s, i) => {
            const done = i < idx;
            const active = s.id === cotEstadoActual;
            const cls = active ? 'sum-pipe-step active' : (done ? 'sum-pipe-step done' : 'sum-pipe-step');
            return `<div class="${cls}" data-step="${s.id}"><span class="sum-pipe-num">${i + 1}</span><span class="sum-pipe-label">${s.label}</span></div>`;
        }).join('');
        _actualizarBtnSiguiente();
    }

    function _actualizarBtnSiguiente() {
        const btn = document.getElementById('btnSiguientePipeline');
        if (!btn) return;
        const idx = SUMINISTROS_PIPELINE.findIndex(s => s.id === cotEstadoActual);
        if (idx < 0 || idx >= SUMINISTROS_PIPELINE.length - 1) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check"></i> Flujo completo';
            btn.title = 'La orden ya está en el último paso';
            return;
        }
        const next = SUMINISTROS_PIPELINE[idx + 1];
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-arrow-right"></i> Siguiente: ${next.label}`;
        btn.title = `Avanzar a ${next.label}`;
    }

    async function _avanzarPipelineSiguiente() {
        const idx = SUMINISTROS_PIPELINE.findIndex(s => s.id === cotEstadoActual);
        if (idx < 0 || idx >= SUMINISTROS_PIPELINE.length - 1) {
            _showToast('Ya estás en el último paso del flujo', 'info');
            return;
        }
        const next = SUMINISTROS_PIPELINE[idx + 1];

        if (cotEstadoActual === 'cotizacion' && next.id === 'pendiente_admin') {
            if (isSuministrosAdmin(perfilUsuario)) {
                const saved = await _guardarCotizacion({ skipClear: true, estadoOverride: 'pendiente_admin', silent: true });
                if (!saved) return;
                cotEstadoActual = 'pendiente_admin';
                _renderSuministrosPipeline();
                _updateCotResumen();
                _showToast(`Avanzado a: ${next.label}`, 'success');
                await _loadCotizaciones();
            } else {
                await _enviarAAdmin();
            }
            return;
        }

        if (cotEstadoActual === 'pendiente_admin' && next.id === 'en_compra') {
            if (!isSuministrosAdmin(perfilUsuario)) {
                _showToast('Solo un administrador puede enviar a Compras', 'warning');
                return;
            }
            await _enviarACompras();
            return;
        }

        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return; }
        const saved = await _guardarCotizacion({ skipClear: true, estadoOverride: next.id, silent: true });
        if (!saved) return;
        cotEstadoActual = next.id;
        _renderSuministrosPipeline();
        _updateCotResumen();
        if (next.id === 'entregada' && saved.cotizacionData?.componentes?.length) {
            await _deducirInventario(saved.cotizacionData.componentes, saved.folio);
        }
        _showToast(`Avanzado a: ${next.label}`, 'success');
        await _loadCotizaciones();
    }

    function _limpiarCot() {
        carrito = [];
        _limpiarCarritoPersistido();
        _renderCatalogo(); _renderCarrito();
        document.getElementById('cotCliente').value = '';
        cotEstadoActual = 'cotizacion';
        _renderSuministrosPipeline();
        const folioEl = document.getElementById('cotFolio');
        if (folioEl) folioEl.value = '';
        const tipoHidden = document.getElementById('cotTipoOrden');
        if (tipoHidden) tipoHidden.value = '';
        const tipoRes = document.getElementById('cotResumenTipo');
        if (tipoRes) tipoRes.textContent = '—';
        _collapseCotForm();
        document.getElementById('cotDias').value = '1';
        document.getElementById('cotKm').value = '0';
        document.getElementById('cotUtilidad').value = '40';
        document.getElementById('cotFechaConfirmacion').value = '';
        document.getElementById('cotFechaCertificacion').value = '';
        document.getElementById('cotEntregaEsperada').value = '';
        document.getElementById('cotLlegada').value = '';
        document.getElementById('cotPrecorsoImportes').value = '';
        document.getElementById('cotPrecorsoImporto').value = '';
        editingCotizacionId = null;
        const btnGuardar = document.getElementById('btnGuardarCot');
        if (btnGuardar) btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar Cotización';
        _recalcularCostos();
    }

    async function _generateFolio() {
        if (window.folioFormats && window.folioFormats.getNextFolioCotizacionSuministro) {
            return window.folioFormats.getNextFolioCotizacionSuministro();
        }
        const now = new Date();
        const y = now.getFullYear().toString().slice(-2);
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const prefix = `SP-S${y}${m}${d}-`;
        let max = 0;
        cotizaciones.forEach((c) => {
            const f = c.folio || (c.data && c.data.folio) || '';
            if (!String(f).startsWith(prefix)) return;
            const m2 = String(f).match(/-(\d+)$/);
            if (m2) max = Math.max(max, parseInt(m2[1], 10) || 0);
        });
        return prefix + (max + 1);
    }

    // ==================== COTIZACIONES / HISTORIAL ====================
    async function _loadCotizaciones() {
        try {
            cotizaciones = await cotizacionService.select({ origen: 'suministro' }, { orderBy: 'created_at', ascending: false, page: 0, pageSize: 200 });
        } catch(e) { cotizaciones = []; }
        _aplicarFiltrosHistorial();
        _renderCotizaciones();
        _renderAdminBandeja();
        _renderKPIs();
    }

    function _renderAdminBandeja() {
        const tbody = document.getElementById('adminBandejaBody');
        if (!tbody || !isSuministrosAdmin(perfilUsuario)) return;
        const pending = cotizaciones.filter((c) => (_cotData(c).estado || '') === 'pendiente_admin');
        const badge = document.getElementById('adminBandejaCount');
        if (badge) badge.textContent = String(pending.length);
        if (!pending.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:16px;">Sin solicitudes pendientes de revisión</td></tr>';
            return;
        }
        tbody.innerHTML = pending.map((c) => {
            const data = _cotData(c);
            const folio = data.folio || '—';
            const folioEsc = _esc(folio).replace(/'/g, "\\'");
            const comps = data.componentes || [];
            return `<tr>
                <td><strong>${_esc(folio)}</strong></td>
                <td>${_esc(data.cliente_nombre || '—')}</td>
                <td>${comps.length}</td>
                <td>${_esc(data.creado_por_nombre || '—')}</td>
                <td>${(data.enviado_admin_at || data.updated_at || data.created_at || '').substring(0, 16).replace('T', ' ')}</td>
                <td class="historial-acciones">
                    <button type="button" class="btn btn-sm btn-outline" onclick="suministrosModule._verCotizacion('${folioEsc}')" title="Ver detalle"><i class="fas fa-eye"></i></button>
                    <button type="button" class="btn btn-sm btn-primary" onclick="suministrosModule._aprobarBandejaYEnviarCompras('${folioEsc}')" title="Aprobar y enviar a Compras"><i class="fas fa-check"></i> Aprobar → Compras</button>
                </td>
            </tr>`;
        }).join('');
    }

    async function _crearCompraDesdeCotizacion(folio, data) {
        const comps = data.componentes || [];
        const itemsCompra = comps.map((comp) => ({
            sku: comp.codigo || '',
            descripcion: comp.descripcion || '',
            cantidad: comp.cantidad || 1,
            costo_unitario: comp.costo_compra || comp.precio_unitario || 0,
            costo_total: (comp.cantidad || 1) * (comp.costo_compra || comp.precio_unitario || 0),
            link_proveedor: comp.link || '',
        }));
        const compraData = {
            folio: 'CMP-' + folio,
            proveedor_nombre: '',
            departamento: 'Suministro',
            estado: 0,
            estado_interno: 'esperando_diagnostico',
            vinculacion: { tipo: 'cotizacion_suministro', folio, cliente: data.cliente_nombre || data.cliente_id || '' },
            items: itemsCompra,
            observaciones: `Suministros ${folio} aprobado por admin. Verificar stock y cotizar.`,
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        const comprasService = createDataService('compras');
        const inserted = await comprasService.insert(compraData, csrfToken);
        const compraId = inserted?.id || inserted?.[0]?.id;
        if (compraId) {
            const itemsService = createDataService('compras_items');
            for (const item of itemsCompra) {
                await itemsService.insert({ compra_id: compraId, ...item }, csrfToken);
            }
        }
        await notificacionesService.insert({
            para: 'compras',
            tipo: 'solicitud_cotizacion',
            orden_id: compraId,
            folio: compraData.folio,
            cliente: data.cliente_nombre || '',
            mensaje: `Admin aprobó suministro ${folio}. Cotización ${compraData.folio} lista para Compras.`,
            leido: false,
            fecha: new Date().toISOString(),
        }, csrfToken);
        const cot = cotizaciones.find((c) => (_cotData(c).folio) === folio);
        const cotId = cot?.id;
        if (cotId) {
            await cotizacionService.update(cotId, { ...data, estado: 'en_compra', folio, aprobado_admin_at: new Date().toISOString() });
        }
        try {
            await enqueueCoiJob({ erp_source: 'compra', erp_id: compraData.folio, folio: compraData.folio, idempotency_key: `compra:suministro:${folio}`, payload_json: compraData });
        } catch (coiErr) { console.warn('[Suministros] COI compra error:', coiErr); }
        return compraData.folio;
    }

    async function _aprobarBandejaYEnviarCompras(folio) {
        if (!isSuministrosAdmin(perfilUsuario)) return;
        const cot = cotizaciones.find((c) => (_cotData(c).folio) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = _cotData(cot);
        if ((data.estado || '') !== 'pendiente_admin') {
            _showToast('Esta cotización no está pendiente de revisión', 'warning');
            return;
        }
        try {
            const compraFolio = await _crearCompraDesdeCotizacion(folio, data);
            _showToast(`Aprobada y enviada a Compras (${compraFolio})`, 'success');
            await _loadCotizaciones();
        } catch (e) {
            _showToast('Error al aprobar: ' + (e.message || e), 'error');
        }
    }

    function _renderCotizaciones() {
        const tbody = document.getElementById('cotizacionesBody');
        const countEl = document.getElementById('historialCount');
        const list = cotizacionesFiltradas;
        if (countEl) {
            countEl.textContent = list.length === cotizaciones.length
                ? `${list.length} órdenes`
                : `${list.length} de ${cotizaciones.length} órdenes`;
        }
        if (!tbody) return;
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;padding:20px;">Sin cotizaciones que coincidan con los filtros</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(c => {
            const data = _cotData(c);
            const folio = data.folio || '—';
            const estado = data.estado || 'cotizacion';
            const estadoLabel = { cotizacion: 'Cotización', pendiente_admin: 'Revisión Admin', en_compra: 'En compras', aprobada: 'Aprobada', entregada: 'Entregada', cancelada: 'Cancelada' }[estado] || estado;
            const estadoClass = { cotizacion:'estado-cotizacion', pendiente_admin:'estado-pendiente-admin', aprobada:'estado-aprobada', cancelada:'estado-cancelada', en_compra:'estado-en-compra', entregada:'estado-entregada' }[estado] || 'estado-cotizacion';
            const verCostos = _verCostosSuministros();
            const totalStr = verCostos ? `$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
            const comps = data.componentes || [];
            const creador = data.creado_por_nombre || '—';
            const folioEsc = _esc(folio).replace(/'/g, "\\'");
            return `<tr>
                <td><strong>${_esc(folio)}</strong></td>
                <td>${_esc(data.cliente_nombre || '—')}</td>
                <td>${comps.length}</td>
                <td class="historial-col-total">${totalStr}</td>
                <td><span class="estado-badge ${estadoClass}">${estadoLabel}</span></td>
                <td>${(data.created_at||'').substring(0,10)}</td>
                <td class="historial-creador">${_esc(creador)}</td>
                <td class="col-historial-pdf">
                    <button type="button" class="btn btn-sm btn-outline btn-pdf-hist" onclick="suministrosModule._generarPDF('${folioEsc}', true)" title="Vista previa PDF"><i class="fas fa-file-pdf"></i></button>
                    <button type="button" class="btn btn-sm btn-primary btn-pdf-hist" onclick="suministrosModule._generarPDF('${folioEsc}', false)" title="Descargar PDF"><i class="fas fa-download"></i></button>
                </td>
                <td class="historial-acciones">
                    <button type="button" class="btn btn-sm btn-outline" onclick="suministrosModule._verCotizacion('${folioEsc}')" title="Ver detalle"><i class="fas fa-eye"></i></button>
                    <button type="button" class="btn btn-sm btn-outline" onclick="suministrosModule._editarCotizacion('${folioEsc}')" title="Editar"><i class="fas fa-edit"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    function _verCotizacion(folio) {
        const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = cot.data || cot;
        const comps = data.componentes || [];
        const modal = document.getElementById('modalDetalleBom');
        const titulo = document.getElementById('modalDetalleTitulo');
        const body = document.getElementById('modalDetalleBody');
        const verCostos = _verCostosSuministros();
        titulo.textContent = `Cotización ${folio}`;

        // --- Recuperar datos del cerebro_registro o del root ---
        const cr = data.cerebro_registro || {};
        const dias = cr.dias || data.dias_gestion || '—';
        const km = cr.km || data.km_distancia || '—';
        const utilidadPct = cr.utilidadPct || data.utilidad_pct || 40;
        const fechaConfirmacion = cr.fecha_confirmacion || data.fecha_confirmacion || '';
        const fechaCertificacion = cr.fecha_certificacion || data.fecha_certificacion || '';
        const entregaEsperada = cr.entrega_esperada || data.entrega_esperada || '';
        const llegada = cr.llegada || data.llegada_oficina || '';
        const precorsoImportes = cr.precorso_importes || data.precorso_importes || '';
        const precorsoImporto = cr.precorso_importo || data.precorso_importo || '';

        // --- Costos ---
        const proveedor = data.subtotal || 0;
        const gasolina = cr.resultado?.gasolina || data.costo_gasolina || 0;
        const gastosGenerales = (cr.resultado?.totalGasVentas || 0) + (cr.resultado?.camioneta || data.costo_camioneta || 0);
        const utilidadMonto = (cr.resultado?.utilidad || data.utilidad || 0) - gastosGenerales - proveedor;
        const creditoMonto = (cr.resultado?.credito || data.credito || 0) - (cr.resultado?.utilidad || data.utilidad || 0);
        const ivaMonto = (cr.resultado?.credito || data.credito || 0) * 0.16;
        const granTotal = (cr.resultado?.credito || data.credito || 0) * 1.16;

        // --- Tabla de componentes ---
        let totalCosto = 0;
        let totalVenta = 0;
        const filas = comps.map(c => {
            const costoCompra = c.costo_compra || c.precio_unitario || 0;
            const subtotalCosto = c.subtotal_costo || c.subtotal || 0;
            const precioVenta = c.precio_venta_unitario || c.precio_unitario || 0;
            const subtotalVenta = c.subtotal_venta || c.subtotal || 0;
            totalCosto += subtotalCosto;
            totalVenta += subtotalVenta;
            const costoCol = verCostos ? `<td>$${costoCompra.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td>$${subtotalCosto.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>` : '';
            const ventaCols = verCostos
                ? `<td>$${precioVenta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td>$${subtotalVenta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>`
                : '';
            return `<tr><td>${c.source}</td><td>${c.codigo||'—'}</td><td>${_esc((c.descripcion||'').substring(0,60))}</td><td>${c.cantidad}</td>${costoCol}${ventaCols}</tr>`;
        }).join('');
        const utilidadBruta = totalVenta - totalCosto;
        const headerCostos = verCostos ? '<th>Costo Unit.</th><th>Subtotal Costo</th>' : '';
        const headerVenta = verCostos ? '<th>Precio Venta</th><th>Subtotal Venta</th>' : '';
        const totalesRow = verCostos ? `
            <tr style="font-weight:bold;background:#f8fafc"><td colspan="5">Totales</td><td>$${totalCosto.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td></td><td>$${totalVenta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>
            <tr style="font-weight:bold;background:#f0fdf4"><td colspan="6">Utilidad bruta</td><td colspan="2" style="color:#166534">$${utilidadBruta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>` : '';

        // --- Fechas formateadas ---
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX') : '—';
        const estadoClass = { cotizacion:'estado-cotizacion', pendiente_admin:'estado-pendiente-admin', aprobada:'estado-aprobada', cancelada:'estado-cancelada', en_compra:'estado-en-compra', entregada:'estado-entregada' }[data.estado] || 'estado-cotizacion';
        const totalHeader = verCostos
            ? `<div style="text-align:right;"><div style="font-size:1.1rem;font-weight:700;color:var(--primary,#0052cc);">$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</div><div style="font-size:.75rem;color:var(--text-muted,#9ca3af);">Total con IVA</div></div>`
            : '';

        body.innerHTML = `
            <div class="cot-preview-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
                <div>
                    <div style="font-size:1.35rem;font-weight:800;color:var(--primary,#0052cc);margin-bottom:2px;">${folio}</div>
                    <div style="font-size:.95rem;color:var(--text-primary,#111827);"><strong>Cliente:</strong> ${data.cliente_nombre || '—'}</div>
                    <div style="font-size:.8rem;color:var(--text-muted,#9ca3af);margin-top:2px;">Creada: ${fmtDate(data.created_at)} · Estado: <span class="estado-badge ${estadoClass}">${data.estado}</span></div>
                </div>
                ${totalHeader}
            </div>

            <div class="cot-preview-fields" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:14px;background:var(--bg-tertiary,#f9fafb);padding:12px;border-radius:8px;font-size:.82rem;">
                <div><span style="color:#9ca3af;font-size:.7rem;">Días gestión</span><br><strong>${dias}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Km</span><br><strong>${km}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Utilidad</span><br><strong>${utilidadPct}%</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Fecha confirmación</span><br><strong>${fmtDate(fechaConfirmacion)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Fecha certificación</span><br><strong>${fmtDate(fechaCertificacion)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Entrega esperada</span><br><strong>${entregaEsperada || '—'}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Llegada oficina</span><br><strong>${fmtDate(llegada)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Notas — lista o referencia de importes</span><br><strong>${precorsoImportes || '—'}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Notas — importador o proveedor extranjero</span><br><strong>${precorsoImporto || '—'}</strong></div>
            </div>

            ${verCostos ? `<div class="costos-desglose" style="margin-bottom:14px;">
                <div class="costo-linea"><span>Costo suministros</span><span>$${proveedor.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea"><span>Gasolina</span><span>$${gasolina.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea"><span>Gastos generales</span><span>$${gastosGenerales.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea"><span>Utilidad (${utilidadPct}%)</span><span>$${utilidadMonto.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea"><span>Crédito (3%)</span><span>$${creditoMonto.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea total"><span>IVA (16%)</span><span>$${ivaMonto.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="costo-linea gran-total"><strong>GRAN TOTAL</strong><strong>$${granTotal.toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></div>
            </div>` : '<p style="font-size:.85rem;color:#64748b;margin-bottom:14px;">Los importes se muestran al administrador tras la revisión.</p>'}

            <table class="data-table" style="margin-bottom:14px;"><thead><tr><th>Fuente</th><th>Código</th><th>Descripción</th><th>Cant</th>${headerCostos}${headerVenta}</tr></thead><tbody>
            ${filas}
            ${totalesRow}
            </tbody></table>

            ${data.observaciones ? `<p style="font-size:.8rem;color:#64748b;margin-bottom:12px;"><strong>Observaciones:</strong> ${_esc(data.observaciones)}</p>` : ''}

            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px;">
                <button class="btn btn-outline" onclick="document.getElementById('modalDetalleBom').classList.remove('active')"><i class="fas fa-times"></i> Cerrar</button>
                <button class="btn btn-secondary" onclick="suministrosModule._imprimirCotizacion('${folio}')"><i class="fas fa-print"></i> Imprimir</button>
                <button class="btn btn-secondary" onclick="suministrosModule._generarPDF('${folio}', true)"><i class="fas fa-eye"></i> Visualizar PDF</button>
                <button class="btn btn-primary" onclick="suministrosModule._generarPDF('${folio}', false)"><i class="fas fa-download"></i> Descargar PDF</button>
                ${isSuministrosAdmin(perfilUsuario) && data.estado === 'pendiente_admin' ? `<button class="btn btn-primary" onclick="suministrosModule._aprobarBandejaYEnviarCompras('${folio}')"><i class="fas fa-check"></i> Aprobar → Compras</button>` : ''}
                ${isSuministrosAdmin(perfilUsuario) && data.estado !== 'pendiente_admin' && data.estado !== 'en_compra' ? `<button class="btn btn-primary" onclick="suministrosModule._enviarAComprasDesdeHistorial('${folio}')"><i class="fas fa-paper-plane"></i> Enviar a Compras</button>` : ''}
            </div>`;
        modal.classList.add('active');
    }

    function _editarCotizacion(folio) {
        const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = cot.data || cot;
        const comps = data.componentes || [];
        editingCotizacionId = cot.id || null;

        // Cargar cliente (robusto: por ID, por nombre, o option temporal)
        const clienteSel = document.getElementById('cotCliente');
        if (clienteSel) {
            let clienteVal = data.cliente_id || data.cerebro_registro?.cliente_id || '';
            let clienteNombre = data.cliente_nombre || data.cerebro_registro?.cliente_nombre || '';
            let optionExists = Array.from(clienteSel.options).some(o => o.value === clienteVal);
            if (!optionExists && clienteNombre) {
                optionExists = Array.from(clienteSel.options).some(o => o.textContent.trim().toLowerCase() === clienteNombre.trim().toLowerCase());
                if (optionExists) {
                    clienteVal = Array.from(clienteSel.options).find(o => o.textContent.trim().toLowerCase() === clienteNombre.trim().toLowerCase()).value;
                } else {
                    const opt = document.createElement('option');
                    opt.value = clienteNombre;
                    opt.textContent = clienteNombre + ' (guardado)';
                    clienteSel.appendChild(opt);
                    clienteVal = clienteNombre;
                }
            }
            clienteSel.value = clienteVal;
        }

        document.getElementById('cotFolio').value = data.folio || '';
        cotEstadoActual = data.estado || 'cotizacion';
        _renderSuministrosPipeline();
        _setCotTipoOrden();
        _expandCotForm();
        document.getElementById('cotDias').value = (data.cerebro_registro?.dias) || 1;
        document.getElementById('cotKm').value = (data.cerebro_registro?.km) || 0;
        document.getElementById('cotUtilidad').value = (data.cerebro_registro?.utilidadPct) || 40;
        document.getElementById('cotFechaConfirmacion').value = data.cerebro_registro?.fecha_confirmacion || '';
        document.getElementById('cotFechaCertificacion').value = data.cerebro_registro?.fecha_certificacion || '';
        document.getElementById('cotEntregaEsperada').value = data.cerebro_registro?.entrega_esperada || '';
        document.getElementById('cotLlegada').value = data.cerebro_registro?.llegada || '';
        document.getElementById('cotPrecorsoImportes').value = data.cerebro_registro?.precorso_importes || '';
        document.getElementById('cotPrecorsoImporto').value = data.cerebro_registro?.precorso_importo || '';

        carrito = comps.map(c => ({
            id: c.id, source: c.source, codigo: c.codigo || '', descripcion: c.descripcion || '',
            categoria: c.categoria || '', precio: c.costo_compra || c.precio_unitario || 0,
            qty: c.cantidad || 1, link: c.link || '', proveedores: c.proveedores || [], stock: c.stock || null
        }));
        _renderCarrito();
        _recalcularCostos();

        const btnGuardar = document.getElementById('btnGuardarCot');
        if (btnGuardar) btnGuardar.innerHTML = '<i class="fas fa-save"></i> Actualizar Cotización';
        _showToast(`Cotización ${folio} cargada para editar`, 'info');
        window.scrollTo({ top: document.getElementById('cotizacionSection').offsetTop - 20, behavior: 'smooth' });
    }

    async function _generarPDF(folio, preview = false) {
        const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = cot.data || cot;
        const comps = data.componentes || [];
        try {
            let user = null;
            try {
                const { data: { user: u } } = await window.supabase.auth.getUser();
                user = u;
            } catch (authErr) {
                // Fallback offline
                user = { user_metadata: { nombre: (perfilUsuario?.nombre || 'Usuario') } };
            }
            const conceptos = comps.map(c => ({
                cantidad: c.cantidad,
                descripcion: c.descripcion || c.codigo || '',
                precio: c.precio_venta_unitario || c.precio_unitario || 0,
                subtotal: c.subtotal_venta || c.subtotal || 0
            }));
            await pdfGenerator.generateCotizacion({
                folio: data.folio,
                cliente: data.cliente_nombre || 'Cliente',
                departamento: 'Compras',
                conceptos,
                subtotal: data.subtotal || 0,
                iva: data.iva || 0,
                total: data.total || 0
            }, user, preview);
            if (!preview) _showToast(`PDF ${folio} descargado`, 'success');
        } catch (err) {
            console.error('[Suministros] Error PDF:', err);
            _showToast('Error al generar PDF: ' + (err.message || err), 'error');
        }
    }

    function _imprimirCotizacion(folio) {
        const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = cot.data || cot;
        const comps = data.componentes || [];
        const verCostos = _verCostosSuministros();
        const cr = data.cerebro_registro || {};
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX') : '—';
        const dias = cr.dias || data.dias_gestion || '—';
        const km = cr.km || data.km_distancia || '—';
        const utilidadPct = cr.utilidadPct || data.utilidad_pct || 40;

        let totalCosto = 0, totalVenta = 0;
        const headerCostos = verCostos ? '<th style="background:#f1f5f9;">Costo Unit.</th><th style="background:#f1f5f9;">Subtotal Costo</th>' : '';
        const filas = comps.map(c => {
            const cc = c.costo_compra || c.precio_unitario || 0;
            const sc = c.subtotal_costo || c.subtotal || 0;
            const pv = c.precio_venta_unitario || c.precio_unitario || 0;
            const sv = c.subtotal_venta || c.subtotal || 0;
            totalCosto += sc; totalVenta += sv;
            const costoCols = verCostos ? `<td>$${cc.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td>$${sc.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>` : '';
            return `<tr><td>${c.source}</td><td>${c.codigo||'—'}</td><td>${(c.descripcion||'').substring(0,60)}</td><td>${c.cantidad}</td>${costoCols}<td>$${pv.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td>$${sv.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>`;
        }).join('');
        const utilidadBruta = totalVenta - totalCosto;
        const totalesRow = verCostos ? `
            <tr style="font-weight:bold;background:#f8fafc"><td colspan="5">Totales</td><td>$${totalCosto.toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td></td><td>$${totalVenta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>
            <tr style="font-weight:bold;background:#f0fdf4"><td colspan="6">Utilidad bruta</td><td colspan="2" style="color:#166534">$${utilidadBruta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>` : `
            <tr style="font-weight:bold;background:#f8fafc"><td colspan="3">Totales</td><td></td><td>$${totalVenta.toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>`;

        const w = window.open('', '_blank');
        w.document.write(`
            <html><head><title>Cotización ${folio}</title><style>
            body{font-family:Inter,sans-serif;padding:32px;color:#1e293b;max-width:900px;margin:0 auto}
            h2{color:#0f172a;margin-bottom:4px;font-size:1.4rem} .sub{color:#64748b;font-size:.9rem;margin-bottom:20px}
            .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:8px}
            .header-grid div{font-size:.82rem}
            .header-grid strong{font-size:.95rem;color:#111827}
            table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.85rem}
            th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
            th{background:#f1f5f9;font-weight:600}
            .costos-box{background:#f9fafb;border-radius:8px;padding:14px;margin:16px 0;display:flex;flex-direction:column;gap:6px;font-size:.9rem}
            .costos-box .line{display:flex;justify-content:space-between}
            .costos-box .line.total{border-top:1px solid #e2e8f0;padding-top:6px;font-weight:600}
            .costos-box .line.gran-total{font-size:1.1rem;color:#0052cc;font-weight:800}
            .right{text-align:right}
            .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600;background:#dbeafe;color:#1e40af}
            @media print{.no-print{display:none}}
            </style></head><body>
            <h2>SSEPI · Cotización de Suministros</h2>
            <div class="sub">Folio: ${data.folio} · Cliente: ${data.cliente_nombre || '—'} · Fecha: ${(data.created_at||'').substring(0,10)} · Estado: <span class="badge">${data.estado}</span></div>

            <div class="header-grid">
                <div><span style="color:#9ca3af;font-size:.7rem;">Días gestión</span><br><strong>${dias}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Km</span><br><strong>${km}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Utilidad</span><br><strong>${utilidadPct}%</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Fecha confirmación</span><br><strong>${fmtDate(cr.fecha_confirmacion || data.fecha_confirmacion)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Fecha certificación</span><br><strong>${fmtDate(cr.fecha_certificacion || data.fecha_certificacion)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Entrega esperada</span><br><strong>${cr.entrega_esperada || data.entrega_esperada || '—'}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Llegada oficina</span><br><strong>${fmtDate(cr.llegada || data.llegada_oficina)}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Notas — lista o referencia de importes</span><br><strong>${cr.precorso_importes || data.precorso_importes || '—'}</strong></div>
                <div><span style="color:#9ca3af;font-size:.7rem;">Notas — importador o proveedor extranjero</span><br><strong>${cr.precorso_importo || data.precorso_importo || '—'}</strong></div>
            </div>

            ${verCostos ? `<div class="costos-box">
                <div class="line"><span>Costo suministros</span><span>$${(data.subtotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line"><span>Gasolina</span><span>$${(cr.resultado?.gasolina || data.costo_gasolina || 0).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line"><span>Gastos generales</span><span>$${((cr.resultado?.totalGasVentas||0)+(cr.resultado?.camioneta||data.costo_camioneta||0)).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line"><span>Utilidad (${utilidadPct}%)</span><span>$${((cr.resultado?.utilidad||data.utilidad||0) - (cr.resultado?.totalGasVentas||0) - (cr.resultado?.camioneta||data.costo_camioneta||0) - (data.subtotal||0)).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line"><span>Crédito (3%)</span><span>$${((cr.resultado?.credito||data.credito||0) - (cr.resultado?.utilidad||data.utilidad||0)).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line total"><span>IVA (16%)</span><span>$${(data.iva||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
                <div class="line gran-total"><span>GRAN TOTAL</span><span>$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
            </div>` : `<div class="costos-box"><div class="line gran-total"><span>TOTAL</span><span>$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div></div>`}

            <table><thead><tr><th>Fuente</th><th>Código</th><th>Descripción</th><th>Cant</th>${headerCostos}<th>Precio Venta</th><th>Subtotal Venta</th></tr></thead><tbody>${filas}${totalesRow}</tbody></table>
            <p class="right" style="margin-top:16px;font-size:1.1rem"><strong>Total (con IVA): $${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></p>
            </body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    }

    async function _enviarAComprasDesdeHistorial(folio) {
        const cot = cotizaciones.find(c => (c.folio || (c.data && c.data.folio)) === folio);
        if (!cot) { _showToast('Cotización no encontrada', 'warning'); return; }
        const data = cot.data || cot;
        const comprasService = createDataService('compras');
        const itemsCompra = (data.componentes || []).map(item => ({
            nombre: item.codigo || '',
            sku: item.codigo || '',
            descripcion: item.descripcion || '',
            cantidad: item.cantidad || 1,
            costo_unitario: item.costo_compra || item.precio_unitario || 0,
            costo_total: (item.cantidad || 1) * (item.costo_compra || item.precio_unitario || 0),
            link_proveedor: item.link || ''
        }));
        const compraData = {
            folio: 'CMP-' + folio,
            proveedor_nombre: (data.componentes?.find(i => i.proveedores?.length > 0)?.proveedores?.[0]?.nombre) || '',
            departamento: 'Suministro',
            estado: 0, // Borrador: esperando que Compras verifique stock/cotice
            estado_interno: 'esperando_diagnostico',
            vinculacion: { tipo: 'cotizacion_suministro', folio, cotizacion_id: cot.id, cliente: data.cliente_nombre || data.cliente },
            items: itemsCompra,
            observaciones: `Suministros: verificar stock y cotizar para ${folio}. No proceder hasta confirmación de cliente.`
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await comprasService.insert(compraData, csrfToken);
            const compraId = inserted?.id || inserted?.[0]?.id;
            if (compraId) {
                const itemsService = createDataService('compras_items');
                for (const item of itemsCompra) {
                    await itemsService.insert({ compra_id: compraId, ...item }, csrfToken);
                }
            }
            // Notificar a Compras y Ventas
            try {
                await notificacionesService.insert({
                    para: 'compras', tipo: 'solicitud_cotizacion', orden_id: compraId, folio: compraData.folio,
                    cliente: data.cliente_nombre || data.cliente || '',
                    mensaje: `Suministros solicita verificar stock y cotizar: ${compraData.folio}. Verifique disponibilidad en inventario o cotice con proveedores.`,
                    leido: false, fecha: new Date().toISOString()
                }, csrfToken);
            } catch (nErr) { console.warn('[Suministros] Error notificando a Compras:', nErr); }
            try {
                await notificacionesService.insert({
                    para: 'ventas', tipo: 'diagnostico_completado', orden_id: compraId, folio: compraData.folio,
                    cliente: data.cliente_nombre || data.cliente || '',
                    mensaje: `Suministros envió ${compraData.folio} a Compras para verificar stock/cotización. Espere precios para presentar cotización al cliente.`,
                    leido: false, fecha: new Date().toISOString()
                }, csrfToken);
            } catch (nErr) { console.warn('[Suministros] Error notificando a Ventas:', nErr); }
            if (cot.id) {
                await cotizacionService.update(cot.id, { ...data, estado: 'esperando_cotizacion' }, csrfToken);
            }
            _showToast(`Orden de compra ${compraData.folio} creada como borrador. Esperando stock/cotización de Compras.`, 'success');
            _loadCotizaciones();
        } catch (e) {
            _showToast('Error al crear compra: ' + (e.message || e), 'error');
        }
    }

    function _showBomDetail(id) {
        const item = catalogoUnificado.find(c => c.id == id);
        if (!item) return;
        const modal = document.getElementById('modalDetalleBom');
        const titulo = document.getElementById('modalDetalleTitulo');
        const body = document.getElementById('modalDetalleBody');
        titulo.textContent = item.codigo || item.descripcion;
        const provs = item.proveedores || [];
        const bestPrice = Math.min(...provs.filter(p => p.precio > 0).map(p => p.precio));
        body.innerHTML = `
            ${item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:200px;max-height:150px;border-radius:8px;margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
            <p><strong>Descripción:</strong> ${item.descripcion}</p>
            <p><strong>Categoría:</strong> ${item.categoria} · <strong>Precio mejor:</strong> $${(item.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</p>
            ${item.stock !== null ? `<p><strong>Stock:</strong> ${item.stock} pzas · <strong>Ubicación:</strong> ${item.ubicacion || '—'}</p>` : ''}
            <h4>Proveedores (${provs.length})</h4>
            ${provs.length === 0 ? '<p style="color:#999">Sin proveedores registrados</p>' : provs.map(p => `
                <div class="proveedor-row">
                    <span class="proveedor-nombre">${p.nombre||'—'}${p.precio===bestPrice&&bestPrice>0?'<span class="proveedor-mejor">Mejor precio</span>':''}</span>
                    <span class="proveedor-precio">${p.precio>0?'$'+p.precio.toLocaleString('es-MX',{minimumFractionDigits:2}):'—'}</span>
                    <span>${p.entrega||'—'}</span>
                    <span>${p.link?`<a href="${p.link}" target="_blank" class="supplier-link"><i class="fas fa-external-link-alt"></i></a>`:''}</span>
                </div>
            `).join('')}
            <div style="margin-top:12px;text-align:right;"><button class="btn btn-primary" onclick="suministrosModule._addToCartDirect(${item.id},'${item.source}');document.getElementById('modalDetalleBom').classList.remove('active');">+ Agregar al carrito</button></div>
        `;
        modal.classList.add('active');
    }

    // ==================== EVENTS ====================
    function _bindEvents() {
        const debounced = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
        document.getElementById('catalogoBusqueda')?.addEventListener('input', debounced(() => { paginaActual = 1; _renderCatalogo(); }, 300));
        document.getElementById('catalogoCategoria')?.addEventListener('change', () => { paginaActual = 1; _renderCatalogo(); });

        // Fuente chips (reemplazan al select catalogoFuente)
        document.querySelectorAll('.fuente-chip').forEach(chip => {
            chip.addEventListener('click', function() {
                document.querySelectorAll('.fuente-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                // Sincronizar con el select oculto si existe
                const sel = document.getElementById('catalogoFuente');
                if (sel) sel.value = this.dataset.fuente;
                paginaActual = 1;
                _renderCatalogo();
            });
        });

        document.getElementById('btnVaciarCarrito')?.addEventListener('click', _vaciarCarrito);
        document.getElementById('btnGuardarCot')?.addEventListener('click', _guardarCotizacion);
        document.getElementById('btnSiguientePipeline')?.addEventListener('click', _avanzarPipelineSiguiente);
        document.getElementById('btnEnviarCompras')?.addEventListener('click', _enviarRevisionAdmin);
        document.getElementById('btnLimpiarCot')?.addEventListener('click', _limpiarCot);
        document.getElementById('btnNuevaOrdenSuministro')?.addEventListener('click', () => { _iniciarRegistroOrdenSuministro(); });
        document.getElementById('btnToggleCotRegistro')?.addEventListener('click', async () => {
            const panel = document.getElementById('cotFormPanel');
            const willOpen = panel && panel.classList.contains('is-collapsed');
            _toggleCotForm();
            if (willOpen && !(document.getElementById('cotFolio')?.value || '').trim()) {
                await _ensureCotFolio();
            }
        });
        document.getElementById('btnVistaGrid')?.addEventListener('click', () => {
            vistaActual = 'grid';
            document.getElementById('btnVistaGrid')?.classList.add('active');
            document.getElementById('btnVistaLista')?.classList.remove('active');
            _renderCatalogo();
        });
        document.getElementById('btnVistaLista')?.addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('btnVistaLista')?.classList.add('active');
            document.getElementById('btnVistaGrid')?.classList.remove('active');
            _renderCatalogo();
        });
        ['cotDias', 'cotKm', 'cotUtilidad'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', _recalcularCostos);
        });
        document.getElementById('cotCliente')?.addEventListener('change', () => _updateCotResumen());
        document.getElementById('cotFolio')?.addEventListener('input', () => _updateCotResumen());
        ['histFechaDesde', 'histFechaHasta', 'histEstado', 'histVendedor', 'histComprador', 'histAutomatizacion'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', _onHistorialFiltroChange);
        });
        document.getElementById('histLimpiarFiltros')?.addEventListener('click', _limpiarHistorialFiltros);
    }

    function _goToPage(p) { paginaActual = p; _renderCatalogo(); }

    function _populateCategorias() {
        const cats = [...new Set(catalogoUnificado.map(c => c.categoria))].sort();
        const sel = document.getElementById('catalogoCategoria');
        if (!sel) return;
        sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    function _populateClientes() {
        const sel = document.getElementById('cotCliente');
        if (!sel) return;
        const opts = contactos.map(c => {
            const label = (c.empresa_tabulador || c.empresa || c.nombre || '').trim();
            const sub = (c.nombre && label !== c.nombre) ? ` — ${c.nombre}` : '';
            return `<option value="${c.id || c.nombre}">${label}${sub}</option>`;
        }).join('');
        sel.innerHTML = '<option value="">-- Seleccionar cliente (tabulador) --</option>' + opts;
    }

    // ==================== UTILS ====================
    function _esc(s) { if (s == null) return '—'; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _showToast(msg, type) {
        const container = document.body;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type || 'info'}`;
        toast.textContent = msg;
        toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-size:.9rem;z-index:9999;max-width:400px;' + (type==='error'?'background:#dc2626':type==='warning'?'background:#f59e0b':type==='success'?'background:#10b981':'background:#2563eb');
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    return {
        init, _addToCartDirect, _removeFromCart, _updateCartQty, _vaciarCarrito,
        _goToPage, _showBomDetail, _guardarCotizacion, _enviarACompras,
        _deducirInventario, _limpiarCot, _verCotizacion, _editarCotizacion,
        _generarPDF, _imprimirCotizacion, _enviarAComprasDesdeHistorial, _aprobarBandejaYEnviarCompras,
        getCarrito: () => carrito, getCatalogo: () => catalogoUnificado
    };
})();

window.suministrosModule = SuministrosModule;
document.addEventListener('DOMContentLoaded', () => SuministrosModule.init());