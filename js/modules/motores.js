// ================================================
// ARCHIVO: motores.js
// DESCRIPCIÓN: Módulo de Taller de Motores adaptado a Supabase
// BASADO EN: motores-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de órdenes de motores, diagnóstico, reparación, vinculación con compras
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';

const MotoresModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let orders = [];
    let clients = [];
    let inventory = [];
    let comprasVinculadas = {};  // { ordenId: { estado, folio, items } }
    let notificaciones = [];

    let currentOrder = null;
    let orderId = null;
    let isNewOrder = true;
    let currentStep = 1;
    let fechaInicioOrden = null;
    let fechasEtapas = {};

    // Listas específicas
    let diagnosticoEnlaces = [];
    let diagnosticoInventario = [];
    let consumiblesUsados = [];
    let componentesInventario = [];
    let componentesCompra = [];

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

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Motores] Conectado');
        await _initUI();
        _bindEvents();
        await _loadInitialData();
        _startClock();
        _setupRealtime();
        _cargarNotificaciones();
        console.log('✅ Módulo motores iniciado');
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
        const now = new Date();
        filtroFechaInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        filtroFechaFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.valueAsDate = filtroFechaInicio;
        if (filtroFin) filtroFin.valueAsDate = filtroFechaFin;
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
            _loadComprasVinculadas()
        ]);
        _populateClientSelect();
        _populateTecnicosFilter();
    }

    async function _loadOrders() {
        orders = await ordenesService.select({}, { orderBy: 'fecha_ingreso', ascending: false });
        _applyFilters();
    }

    async function _loadClients() {
        // Obtener contactos de tipo cliente
        const contactos = await contactosService.select({ tipo: 'client' });
        clients = contactos;
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
        clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nombre || c.empresa;
            opt.textContent = c.nombre || c.empresa;
            sel.appendChild(opt);
        });
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

        // Canal para notificaciones de taller (motores)
        const subNotificaciones = supabase
            .channel('motores_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.taller' }, payload => {
                _mostrarNotificacion(payload.new);
            })
            .subscribe();
        subscriptions.push(subNotificaciones);
    }

    async function _cargarNotificaciones() {
        const notis = await notificacionesService.select({ para: 'taller', leido: false });
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

        let badgeHtml = '';
        if (tieneCompraPendiente) {
            badgeHtml = `<span class="badge-warning" title="Compra en proceso: ${compraInfo.folio}">🛒 Compra #${compraInfo.folio}</span>`;
        } else if (compraCompletada) {
            badgeHtml = `<span class="badge-success" title="Material recibido">✅ Material listo</span>`;
        }

        return `
            <div class="kanban-card" data-id="${orden.id}">
                <div class="card-header">
                    <span class="folio">${orden.folio || orden.id.slice(-6)}</span>
                    ${badgeHtml}
                </div>
                <div class="card-body">
                    <div class="cliente">${orden.cliente_nombre || 'Cliente'}</div>
                    <div class="motor">${orden.motor || 'Motor'} ${orden.hp ? `(${orden.hp} HP)` : ''}</div>
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
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Motor</th><th>HP</th><th>Técnico</th><th>Estado</th><th>Ingreso</th><th>Reparación</th><th>Recibido por</th></tr></thead><tbody>';
        ordenes.forEach(o => {
            const compraInfo = comprasVinculadas[o.id];
            const recibidoPor = o.recibido_por || '—';
            html += `<tr onclick="motoresModule._abrirOrden('${o.id}')">
                <td>${o.folio || o.id.slice(-6)} ${compraInfo ? '🛒' : ''}</td>
                <td>${o.cliente_nombre || ''}</td>
                <td>${o.motor || ''}</td>
                <td>${o.hp || ''}</td>
                <td>${o.tecnico_responsable || ''}</td>
                <td>${o.estado || 'Nuevo'}</td>
                <td>${o.fecha_ingreso ? new Date(o.fecha_ingreso).toLocaleDateString() : ''}</td>
                <td>${o.fecha_reparacion ? new Date(o.fecha_reparacion).toLocaleDateString() : ''}</td>
                <td>${recibidoPor}</td>
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
        const orden = orders.find(o => o.id === id);
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
    }

    function _abrirNuevaOrden() {
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
    }

    function _estadoToPaso(estado) {
        const mapa = { 'Nuevo': 1, 'Diagnóstico': 2, 'En Espera': 3, 'Reparado': 4, 'Entregado': 5 };
        return mapa[estado] || 1;
    }

    function _pasoToEstado(paso) {
        const mapa = { 1: 'Nuevo', 2: 'Diagnóstico', 3: 'En Espera', 4: 'Reparado', 5: 'Entregado' };
        return mapa[paso] || 'Nuevo';
    }

    function _cargarDatosEnModal(orden) {
        document.getElementById('inpFolio').value = orden.folio || '';
        document.getElementById('selClient').value = orden.cliente_nombre || '';
        document.getElementById('inpDateTime').value = orden.fecha_ingreso || '';
        document.getElementById('inpClientRef').value = orden.referencia || '';
        document.getElementById('inpMotor').value = orden.motor || '';
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

        diagnosticoEnlaces = orden.refacciones_enlaces || [];
        diagnosticoInventario = orden.refacciones_inventario || [];
        consumiblesUsados = orden.consumibles_usados || [];
        componentesInventario = orden.componentes_inventario || [];
        componentesCompra = orden.componentes_compra || [];
        fechaInicioOrden = orden.fecha_inicio || new Date().toISOString();
        fechasEtapas = orden.fechas_etapas || {};

        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();

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

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`step-${paso}`).classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.ws-step-btn[data-step="${paso}"]`).classList.add('active');
        _actualizarBotonesPaso();
        if (paso === 2) {
            _renderDiagnosticoEnlaces();
            _renderDiagnosticoInventario();
        }
        if (paso === 4) {
            _renderConsumibles();
            _renderComponentesInventario();
            _renderComponentesCompra();
        }
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveOrderBtn');
        const completeBtn = document.getElementById('completeOrderBtn');
        const sinReparacionBtn = document.getElementById('sinReparacionBtn');

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
                if (!document.getElementById('inpMotor').value) { alert('Ingrese el motor'); return false; }
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
    }
    function _eliminarEnlace(idx) {
        diagnosticoEnlaces.splice(idx, 1);
        _renderDiagnosticoEnlaces();
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
                    historial: [{ fecha: new Date().toISOString(), usuario: 'Motores', accion: 'Orden creada y enviada a compras' }],
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
            } else {
                data.estado = 'En Espera';
                data.fecha_envio_compra = new Date().toISOString();
                await ordenesService.update(orderId, data, csrfToken);
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
        alert(`✅ Etapa ${etapa} finalizada`);
        if (etapa < 5) _irPaso(etapa + 1);
    }

    async function _guardarOrden(silencioso = false) {
        const data = _recolectarDatos();
        if (!data.cliente_nombre) { if (!silencioso) alert('Seleccione cliente'); _irPaso(1); return; }
        if (!data.motor) { if (!silencioso) alert('Ingrese el motor'); _irPaso(1); return; }

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

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.estado = 'Nuevo';
                data.fecha_ingreso = new Date().toISOString();
                data.historial = [{ fecha: new Date().toISOString(), usuario: 'Motores', accion: 'Orden creada' }];
                const inserted = await ordenesService.insert(data, csrfToken);
                orderId = inserted.id;
                isNewOrder = false;
                if (!silencioso) alert('✅ Orden guardada correctamente');
            } else {
                await ordenesService.update(orderId, data, csrfToken);
                if (!silencioso) alert('✅ Orden actualizada correctamente');
            }
            _addToFeed('💾', `Orden ${data.folio} guardada`);
        } catch (error) {
            console.error(error);
            if (!silencioso) alert('Error al guardar: ' + error.message);
        }
    }

    function _recolectarDatos() {
        return {
            cliente_nombre: document.getElementById('selClient').value,
            referencia: document.getElementById('inpClientRef').value,
            fecha_ingreso: document.getElementById('inpDateTime').value,
            motor: document.getElementById('inpMotor').value,
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
        document.getElementById('inpMotor').value = '';
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
        document.getElementById('productImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        diagnosticoEnlaces = [];
        diagnosticoInventario = [];
        consumiblesUsados = [];
        componentesInventario = [];
        componentesCompra = [];
        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();
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

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('newOrderBtn').addEventListener('click', _abrirNuevaOrden);
        document.getElementById('closeWsBtn').addEventListener('click', _cerrarModal);
        document.getElementById('cancelWsBtn').addEventListener('click', _cerrarModal);
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