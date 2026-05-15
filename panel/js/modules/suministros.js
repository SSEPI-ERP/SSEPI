// ================================================
// ARCHIVO: suministros.js
// DESCRIPCIÓN: Módulo de Suministros — Catálogo BOM + Inventario
// FUNCIONALIDAD: Grid cards, imágenes, carrito, cotización SP-S, pipeline/kanban
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { enqueueCoiJob } from '../core/coi-queue.js';

const SuministrosModule = (function() {
    // ==================== ESTADO ====================
    let bomItems = [];
    let inventarioItems = [];
    let catalogoUnificado = [];
    let carrito = [];
    let cotizaciones = [];
    let contactos = [];
    let vistaActual = 'grid';
    let paginaActual = 1;
    const ITEMS_POR_PAGINA = 48;

    // Servicios
    const bomService = createDataService('bom_automatizacion');
    const inventarioService = createDataService('inventario');
    const cotizacionService = createDataService('cotizaciones');
    const movimientoService = createDataService('movimientos_inventario');
    const contactoService = createDataService('contactos');

    // ==================== INICIALIZACIÓN ====================
    var perfilUsuario = null;

    async function init() {
        console.log('[Suministros] Inicializando módulo...');
        try { perfilUsuario = await authService.getCurrentProfile(); } catch(e) {}
        await _loadData();
        _bindEvents();
    }

    async function _loadData() {
        try {
            const [bom, inv, cont] = await Promise.all([
                bomService.select({}, { orderBy: 'numero_item', ascending: true, page: 0, pageSize: 500 }),
                inventarioService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 500 }),
                contactoService.select({ tipo: 'cliente' }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 200 })
            ]);
            bomItems = (bom || []).map(i => ({ ...i, _source: 'BOM' }));
            inventarioItems = (inv || []).map(i => ({ ...i, _source: i.tipo_inventario === 'consumible' ? 'CONSUMIBLE' : 'STOCK' }));
            contactos = cont || [];
        } catch (e) {
            console.warn('[Suministros] Supabase error, intentando offline:', e);
            await _tryOfflineLoad();
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
        set('kpiTotalItems', catalogoUnificado.length);
        set('kpiCarritoItems', carrito.reduce((s, i) => s + i.qty, 0));
        set('kpiCarritoTotal', '$' + carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0).toLocaleString('es-MX', {minimumFractionDigits: 2}));
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
            container.innerHTML = `<table class="data-table"><thead><tr><th>Fuente</th><th>Código</th><th>Descripción</th><th>Categoría</th><th>Precio</th><th>Stock/Prov.</th><th></th></tr></thead><tbody>${page.map(item => _renderRow(item)).join('')}</tbody></table>`;
        }
        _renderPagination(filtered.length);
    }

    function _renderCard(item) {
        try {
        const badge = item.source === 'BOM' ? '<span class="source-badge source-badge-bom">BOM</span>' :
                      item.source === 'CONSUMIBLE' ? '<span class="source-badge source-badge-consumible">CONS</span>' :
                      '<span class="source-badge source-badge-stock">STOCK</span>';
        const precio = (item.precio || 0) > 0 ? `$${Number(item.precio).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
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
                    <span class="card-price">${precio}</span>
                    ${stockInfo}
                    ${inCart ? '<span class="card-added">✓</span>' : `<button class="btn-add-item" onclick="suministrosModule._addToCartDirect('${item.id}','${item.source}')">+ Agregar</button>`}
                </div>
                ${provArr.length > 0 ? `<div class="card-prov-row">${provArr.slice(0,2).map(p => p.precio > 0 ? `<span class="card-prov-chip">${_esc(p.nombre)}: $${Number(p.precio).toLocaleString('es-MX',{minimumFractionDigits:2})}</span>` : '').join('')}</div>` : ''}
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
        const precio = (item.precio || 0) > 0 ? `$${Number(item.precio).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—';
        const stockInfo = item.stock !== null && item.stock !== undefined ? `<strong>${item.stock}</strong> pzas` :
                          provArr.length > 0 ? `${provArr.length} prov.` : '—';
        const inCart = carrito.some(c => c.id === item.id && c.source === item.source);
        const desc = item.descripcion || '';
        return `<tr>
            <td>${badge}</td><td><strong>${_esc(item.codigo)}</strong></td>
            <td title="${_esc(desc)}">${_esc(desc.substring(0,60))}${desc.length>60?'…':''}</td>
            <td>${_esc(item.categoria)}</td><td>${precio}</td><td>${stockInfo}</td>
            <td>${inCart ? '<span style="color:#10b981">✓</span>' : `<button class="btn-add-item" onclick="suministrosModule._addToCartDirect('${item.id}','${item.source}')">+</button>`}</td>
        </tr>`;
        } catch(e) { console.error('[Suministros] Error rendering row:', e, item); return '<tr><td colspan="7">Error</td></tr>'; }
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
    function _addToCartDirect(id, source) {
        const item = catalogoUnificado.find(c => c.id == id && c.source === source);
        if (!item) return;
        const existing = carrito.find(c => c.id === item.id && c.source === item.source);
        if (existing) { existing.qty++; } else { carrito.push({ ...item, qty: 1 }); }
        _renderCatalogo();
        _renderCarrito();
        _renderKPIs();
    }

    function _removeFromCart(idx) {
        carrito.splice(idx, 1);
        _renderCatalogo(); _renderCarrito(); _renderKPIs();
    }

    function _updateCartQty(idx, qty) {
        if (qty <= 0) { _removeFromCart(idx); return; }
        carrito[idx].qty = qty;
        _renderCarrito(); _renderKPIs();
    }

    function _vaciarCarrito() {
        carrito = [];
        _renderCatalogo(); _renderCarrito(); _renderKPIs();
    }

    function _renderCarrito() {
        const tbody = document.getElementById('carritoBody');
        const totalItems = document.getElementById('carritoTotalItems');
        const totalPrecio = document.getElementById('carritoTotalPrecio');
        if (!tbody) return;
        if (carrito.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="carrito-empty">Agrega artículos del catálogo</td></tr>';
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
            return `<tr>
                <td>${badge}</td>
                <td><strong>${_esc(item.codigo)}</strong> — ${_esc(item.descripcion.substring(0,40))}</td>
                <td><input type="number" value="${item.qty}" min="1" style="width:55px" onchange="suministrosModule._updateCartQty(${idx},parseInt(this.value))">${stockWarn}</td>
                <td>$${(item.precio||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td><strong>$${sub.toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></td>
                <td>${item.link ? `<a href="${item.link}" target="_blank" class="supplier-link"><i class="fas fa-external-link-alt"></i></a>` : '—'}</td>
                <td><button class="btn-remove" onclick="suministrosModule._removeFromCart(${idx})">✖</button></td>
            </tr>`;
        }).join('');
        if (totalItems) totalItems.textContent = carrito.reduce((s,i)=>s+i.qty,0);
        if (totalPrecio) totalPrecio.textContent = '$' + grandTotal.toLocaleString('es-MX',{minimumFractionDigits:2});
    }

    // ==================== COTIZACIÓN ====================
    function _recalcularCostos() {
        const dias = parseInt(document.getElementById('cotDias')?.value) || 1;
        const km = parseInt(document.getElementById('cotKm')?.value) || 0;
        const utilidadPct = parseInt(document.getElementById('cotUtilidad')?.value) || 40;
        const proveedor = carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0);
        const engine = new CostosEngine();
        const resultado = engine.calcularSuministros(dias, km, proveedor, utilidadPct / 100 + 1);
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = '$' + (val||0).toLocaleString('es-MX',{minimumFractionDigits:2}); };
        set('costoProveedor', resultado.proveedor);
        set('costoGasolina', resultado.gasolina);
        set('costoGastos', resultado.totalGasVentas + resultado.camioneta);
        set('costoUtilidad', resultado.utilidad - resultado.totalGasVentas - resultado.camioneta - resultado.proveedor);
        set('costoCredito', resultado.credito - resultado.utilidad);
        set('costoIva', resultado.credito * 0.16);
        set('costoGranTotal', resultado.credito * 1.16);
        const u = document.getElementById('utilidadPct'); if (u) u.textContent = utilidadPct;
    }

    async function _guardarCotizacion() {
        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return; }
        const clienteId = document.getElementById('cotCliente')?.value;
        const cliente = contactos.find(c => (c.id || c.nombre) == clienteId);
        if (!cliente) { _showToast('Selecciona un cliente', 'warning'); return; }

        const dias = parseInt(document.getElementById('cotDias')?.value) || 1;
        const km = parseInt(document.getElementById('cotKm')?.value) || 0;
        const utilidadPct = parseInt(document.getElementById('cotUtilidad')?.value) || 40;
        const proveedor = carrito.reduce((s, i) => s + (i.precio || 0) * i.qty, 0);
        const engine = new CostosEngine();
        const resultado = engine.calcularSuministros(dias, km, proveedor, utilidadPct / 100 + 1);

        const folio = await _generateFolio();
        const cotizacionData = {
            folio,
            cliente_nombre: cliente.nombre || '',
            cliente_id: cliente.id || cliente.nombre,
            estado: 'cotizacion',
            origen: 'suministro',
            departamento: 'Suministro',
            subtotal: resultado.proveedor,
            iva: resultado.credito * 0.16,
            total: resultado.credito * 1.16,
            cerebro_registro: { dias, km, proveedor, utilidadPct, resultado },
            componentes: carrito.map(item => ({
                source: item.source, id: item.id, codigo: item.codigo, descripcion: item.descripcion,
                categoria: item.categoria, cantidad: item.qty, precio_unitario: item.precio,
                subtotal: item.precio * item.qty, link: item.link, proveedores: item.proveedores, stock: item.stock
            })),
            observaciones: `Cotización de suministros - ${carrito.length} artículos`
        };

        try {
            await cotizacionService.insert(cotizacionData);
            try {
                await enqueueCoiJob({ erp_source: 'cotizacion_suministro', erp_id: folio, folio, idempotency_key: `suministro:${folio}:cotizacion`, payload_json: cotizacionData });
                console.log('[Suministros] Cotización encolada en COI:', folio);
            } catch (coiErr) { console.warn('[Suministros] COI queue error:', coiErr?.message || coiErr); }
            _showToast(`Cotización ${folio} guardada`, 'success');
            document.getElementById('cotFolio').value = folio;
            _loadCotizaciones();
        } catch (e) {
            console.error('[Suministros] Error guardando:', e);
            _showToast('Error al guardar: ' + e.message, 'error');
        }
    }

    async function _enviarACompras() {
        if (carrito.length === 0) { _showToast('Agrega artículos al carrito', 'warning'); return; }
        const folio = document.getElementById('cotFolio')?.value;
        if (!folio) { _showToast('Guarda la cotización primero', 'warning'); return; }

        const comprasService = createDataService('compras');
        const itemsCompra = carrito.map(item => ({
            descripcion: item.descripcion, sku: item.codigo, cantidad: item.qty,
            precio_unitario: item.precio, link_proveedor: item.link, source: item.source
        }));
        const compraData = {
            folio: 'CMP-' + folio,
            proveedor_nombre: (carrito.find(i => i.proveedores?.length > 0)?.proveedores?.[0]?.nombre) || '',
            departamento: 'Suministro', estado: 3, items: itemsCompra,
            vinculacion: { tipo: 'cotizacion_suministro', folio },
            observaciones: `Compra derivada de suministro ${folio}`
        };

        try {
            await comprasService.insert(compraData);
            try {
                await enqueueCoiJob({ erp_source: 'compra', erp_id: compraData.folio, folio: compraData.folio, idempotency_key: `compra:suministro:${folio}`, payload_json: compraData });
            } catch (coiErr) { console.warn('[Suministros] COI compra error:', coiErr?.message || coiErr); }
            _showToast(`Orden de compra ${compraData.folio} creada`, 'success');
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

    function _limpiarCot() {
        carrito = [];
        _renderCatalogo(); _renderCarrito();
        document.getElementById('cotCliente').value = '';
        document.getElementById('cotFolio').value = '';
        document.getElementById('cotDias').value = '1';
        document.getElementById('cotKm').value = '0';
        document.getElementById('cotUtilidad').value = '40';
        _recalcularCostos();
    }

    async function _generateFolio() {
        const now = new Date();
        const y = now.getFullYear().toString().slice(-2);
        const m = String(now.getMonth()+1).padStart(2,'0');
        const d = String(now.getDate()).padStart(2,'0');
        const count = cotizaciones.filter(c => (c.origen || (c.data && c.data.origen)) === 'suministro').length + 1;
        return `SP-S${y}${m}${d}-${String(count).padStart(2,'0')}`;
    }

    // ==================== COTIZACIONES / HISTORIAL ====================
    async function _loadCotizaciones() {
        try {
            cotizaciones = await cotizacionService.select({ origen: 'suministro' }, { orderBy: 'created_at', ascending: false, page: 0, pageSize: 50 });
        } catch(e) { cotizaciones = []; }
        _renderCotizaciones();
        _renderKPIs();
    }

    function _renderCotizaciones() {
        const tbody = document.getElementById('cotizacionesBody');
        if (!tbody) return;
        if (!cotizaciones || cotizaciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">Sin cotizaciones de suministro</td></tr>';
            return;
        }
        tbody.innerHTML = cotizaciones.map(c => {
            const data = c.data || c;
            const estado = data.estado || 'cotizacion';
            const estadoClass = { cotizacion:'estado-cotizacion', aprobada:'estado-aprobada', cancelada:'estado-cancelada', en_compra:'estado-en-compra', entregada:'estado-entregada' }[estado] || 'estado-cotizacion';
            const comps = data.componentes || [];
            return `<tr>
                <td><strong>${data.folio || '—'}</strong></td>
                <td>${data.cliente_nombre || '—'}</td>
                <td>${comps.length}</td>
                <td>$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td><span class="estado-badge ${estadoClass}">${estado}</span></td>
                <td>${(data.created_at||'').substring(0,10)}</td>
                <td><button class="btn btn-sm btn-outline" onclick="suministrosModule._verCotizacion('${data.folio}')"><i class="fas fa-eye"></i></button></td>
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
        titulo.textContent = `Cotización ${folio} — ${data.cliente_nombre || ''}`;
        body.innerHTML = `
            <p><strong>Estado:</strong> ${data.estado} · <strong>Fecha:</strong> ${(data.created_at||'').substring(0,10)}</p>
            <p><strong>Subtotal:</strong> $${(data.subtotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})} · <strong>IVA:</strong> $${(data.iva||0).toLocaleString('es-MX',{minimumFractionDigits:2})} · <strong>Total:</strong> $${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</p>
            <table class="data-table"><thead><tr><th>Fuente</th><th>Código</th><th>Descripción</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>
            ${comps.map(c => `<tr><td>${c.source}</td><td>${c.codigo||'—'}</td><td>${(c.descripcion||'').substring(0,50)}</td><td>${c.cantidad}</td><td>$${(c.precio_unitario||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td><td>$${(c.subtotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>`).join('')}
            </tbody></table>`;
        modal.classList.add('active');
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
        document.getElementById('btnEnviarCompras')?.addEventListener('click', _enviarACompras);
        document.getElementById('btnLimpiarCot')?.addEventListener('click', _limpiarCot);
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
        sel.innerHTML = '<option value="">-- Seleccionar cliente --</option>' + contactos.map(c => `<option value="${c.id || c.nombre}">${c.nombre}</option>`).join('');
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
        _deducirInventario, _limpiarCot, _verCotizacion,
        getCarrito: () => carrito, getCatalogo: () => catalogoUnificado
    };
})();

window.suministrosModule = SuministrosModule;
document.addEventListener('DOMContentLoaded', () => SuministrosModule.init());