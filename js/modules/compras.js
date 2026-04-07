// ================================================
// ARCHIVO: compras.js
// DESCRIPCIÓN: Módulo de Compras adaptado a Supabase
// BASADO EN: compras-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de órdenes de compra, proveedores, vinculación con talleres
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { notifyCompraIfEligible } from '../core/coi-sync-engine.js';

const ComprasModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let compras = [];
    let proveedores = [];
    let contactos = [];
    let ordenesTaller = [];
    let ordenesMotores = [];
    let proyectos = [];
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
        console.log('✅ Módulo compras iniciado');
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
        _populateProveedoresSelect();
        _renderProveedores();
        _renderSolicitudesTaller();
    }

    async function _loadCompras() {
        compras = await comprasService.select({}, { orderBy: 'fecha_creacion', ascending: false });
        _applyFilters();
    }

    async function _loadProveedores() {
        proveedores = await contactosService.select({ tipo: 'provider' });
    }

    async function _loadContactos() {
        contactos = await contactosService.select({});
    }

    async function _loadTaller() {
        ordenesTaller = await tallerService.select({ estado: ['Diagnóstico', 'En Espera'] });
    }

    async function _loadMotores() {
        ordenesMotores = await motoresService.select({ estado: ['Diagnóstico', 'En Espera'] });
    }

    async function _loadProyectos() {
        proyectos = await proyectosService.select({ estado: ['pendiente', 'progreso'] });
    }

    function _populateProveedoresSelect() {
        const select = document.getElementById('proveedorSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Seleccionar proveedor</option>';
        proveedores.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.nombre || p.empresa;
            opt.textContent = p.nombre || p.empresa;
            select.appendChild(opt);
        });
    }

    function _renderProveedores() {
        const container = document.getElementById('proveedoresContainer');
        if (!container) return;
        if (proveedores.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">No hay proveedores registrados</div>';
            return;
        }
        container.innerHTML = proveedores.slice(0, 6).map(p => `
            <div class="proveedor-card">
                <div class="proveedor-header">
                    <span class="proveedor-nombre">${p.nombre || p.empresa}</span>
                    <span class="proveedor-rfc">${p.rfc || ''}</span>
                </div>
                <div class="proveedor-contacto">${p.contacto || p.puesto || ''}</div>
                <div class="proveedor-email">${p.email || ''}</div>
                <div class="proveedor-acciones">
                    <button class="btn btn-sm btn-secondary" onclick="comprasModule._verProveedor('${p.id}')">Ver</button>
                </div>
            </div>
        `).join('');
    }

    function _renderSolicitudesTaller() {
        const container = document.getElementById('solicitudesTaller');
        if (!container) return;
        const solicitudes = [
            ...ordenesTaller.map(o => ({ ...o, tipo: 'taller', folio: o.folio, cliente: o.cliente_nombre })),
            ...ordenesMotores.map(o => ({ ...o, tipo: 'motor', folio: o.folio, cliente: o.cliente_nombre })),
            ...proyectos.map(p => ({ ...p, tipo: 'proyecto', folio: p.folio, cliente: p.cliente }))
        ].filter(s => s.estado !== 'Entregado' && s.estado !== 'completado');
        if (solicitudes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">No hay solicitudes pendientes</div>';
            return;
        }
        container.innerHTML = solicitudes.slice(0, 6).map(s => `
            <div class="solicitud-card">
                <div class="solicitud-header">
                    <span class="solicitud-folio">${s.folio || s.id.slice(-6)}</span>
                    <span class="solicitud-tipo">${s.tipo}</span>
                </div>
                <div class="solicitud-cliente">${s.cliente || 'Cliente'}</div>
                <div class="solicitud-acciones">
                    <button class="btn btn-sm btn-primary" onclick="comprasModule._crearOrdenDesdeSolicitud('${s.id}', '${s.tipo}')">
                        <i class="fas fa-cart-plus"></i> Crear Orden
                    </button>
                </div>
            </div>
        `).join('');
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, payload => {
                _loadProveedores();
                _renderProveedores();
            })
            .subscribe();
        subscriptions.push(subProveedores);
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
        return `
            <div class="kanban-card" data-id="${compra.id}">
                <div class="card-header">
                    <span class="folio">${compra.folio || compra.id.slice(-6)}</span>
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
        tbody.innerHTML = ordenes.map(c => `
            <tr onclick="comprasModule._abrirDetalle('${c.id}')">
                <td><strong>${c.folio || c.id.slice(-6)}</strong></td>
                <td>${c.proveedor || '—'}</td>
                <td>${c.departamento || '—'}</td>
                <td>${c.vinculacion ? `${c.vinculacion.tipo}: ${c.vinculacion.nombre || ''}` : '—'}</td>
                <td>$${(c.total || 0).toFixed(2)}</td>
                <td><span class="status-badge estado-${c.estado}">${_getEstadoLabel(c.estado)}</span></td>
            </tr>
        `).join('');
    }

    function _getEstadoLabel(estado) {
        const labels = { 0: 'Borrador', 1: 'Solicitud', 2: 'Cotización', 3: 'Confirmada', 4: 'Recibida', 5: 'Entregada' };
        return labels[estado] || 'Desconocido';
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
        contenido.innerHTML = _generarDetalleHTML(compra);
        document.getElementById('editarOrdenBtn').style.display = 'inline-flex';
        document.getElementById('editarOrdenBtn').onclick = () => _editarOrden(id);
        modal.classList.add('active');
    }

    function _generarDetalleHTML(compra) {
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
            </div>
            ${compra.vinculacion ? `
            <div class="detalle-section">
                <h4>Vinculación</h4>
                <div><strong>Tipo:</strong> ${compra.vinculacion.tipo}</div>
                <div><strong>ID:</strong> ${compra.vinculacion.id}</div>
                <div><strong>Cliente/Orden:</strong> ${compra.vinculacion.nombre || ''}</div>
                <div><strong>Folio Taller:</strong> ${compra.vinculacion.folio_taller || ''}</div>
            </div>
            ` : ''}
            <div class="detalle-section">
                <h4>Productos</h4>
                <table class="items-table">
                    <thead><tr><th>Descripción</th><th>SKU</th><th>Cantidad</th><th>Precio Unit.</th><th>Total</th><th>Link</th></tr></thead>
                    <tbody>
                        ${compra.items && compra.items.length ? compra.items.map(item => `
                            <tr>
                                <td>${item.desc || ''}</td>
                                <td>${item.sku || ''}</td>
                                <td>${item.qty || 0}</td>
                                <td>$${(item.price || 0).toFixed(2)}</td>
                                <td>$${((item.qty || 0) * (item.price || 0)).toFixed(2)}</td>
                                <td>${item.link ? `<a href="${item.link}" target="_blank">Ver</a>` : '—'}</td>
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
        document.getElementById('departamentoSelect').value = 'Taller Electrónica';
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
            departamento: departamento || 'Taller Electrónica',
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
            fecha_creacion: new Date().toISOString(),
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
            items,
            total,
            estado: 1,
            pasos: [{
                paso: 1,
                fecha: new Date().toISOString(),
                usuario: (await authService.getCurrentProfile())?.nombre || 'Sistema',
                accion: compraId ? 'Orden confirmada desde borrador' : 'Orden creada'
            }],
            confirmado_ventas: false,
            fecha_creacion: (currentCompra && currentCompra.fecha_creacion) || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (compraId) {
                await comprasService.update(compraId, nuevaCompra, csrfToken);
                alert('✅ Orden confirmada');
                document.getElementById('nuevaOrdenModal').classList.remove('active');
                _addToFeed('➕', `Orden ${folio} confirmada`);
            } else {
                const inserted = await comprasService.insert(nuevaCompra, csrfToken);
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
                        mensaje: `Nueva orden de compra ${folio} creada para taller`,
                        leido: false,
                        fecha: new Date().toISOString()
                    }, csrfToken);
                }
                alert('✅ Orden de compra creada');
                document.getElementById('nuevaOrdenModal').classList.remove('active');
                _addToFeed('➕', `Orden ${folio} creada`);
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
            } else if (tipo === 'proyecto') {
                const proy = await proyectosService.getById(id);
                return proy?.cliente || '';
            }
        } catch (e) {
            console.error(e);
        }
        return '';
    }

    function _crearOrdenDesdeSolicitud(id, tipo) {
        console.log('[Compras] Click en Crear Orden desde Solicitud', { id, tipo });
        // Precargar vinculación
        document.getElementById('vinculacionTipo').value = tipo;
        document.getElementById('vinculacionId').value = id;
        _nuevaOrden();
    }

    function _verProveedor(id) {
        alert('Ver proveedor ' + id);
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
            var ventana = window.open('', '_blank');
            ventana.document.write('<!DOCTYPE html><html><head><title>Orden de compra</title><style>body{font-family:Inter,sans-serif;padding:20px;} table{border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;}</style></head><body><h2>Orden de compra</h2>' + el.innerHTML + '</body></html>');
            ventana.document.close();
            ventana.focus();
            setTimeout(function () { ventana.print(); ventana.close(); }, 300);
        });
        var descargarPDFOC = document.getElementById('descargarPDFOrdenCompraBtn');
        if (descargarPDFOC) descargarPDFOC.addEventListener('click', async function () {
            if (!currentCompra || !window.pdfGenerator) return;
            var user = await authService.getCurrentProfile();
            var data = {
                folio: currentCompra.folio,
                proveedor: currentCompra.proveedor,
                fecha_requerida: currentCompra.fecha_requerida,
                items: (currentCompra.items || []).map(function (i) { return { desc: i.desc, sku: i.sku, qty: i.qty, price: i.price }; }),
                total: currentCompra.total
            };
            window.pdfGenerator.generateOrdenCompra(data, user);
        });
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
        _verProveedor
    };
})();

window.comprasModule = ComprasModule;