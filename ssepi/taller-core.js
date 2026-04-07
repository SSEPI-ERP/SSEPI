// taller-core.js - SSEPI Laboratorio de Electrónica V19
// COMPLETO - Con guardado automático, fotos opcionales y vinculación con compras

const TallerCore = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let p_orders = [];               // órdenes de taller
    let p_clients = [];              // clientes desde tabulador de ventas
    let p_inventory = [];            // productos de inventario (para selección)
    let p_config = {
        gasPrice: 24.50,
        kmPerLiter: 9.5,
        hourlyRate: 104.16,
        fixedPerHour: 124.18,
        truckPerHour: 39.35,
        utilityPercent: 40,
        creditPercent: 3,
        ivaPercent: 16
    };
    let p_currentOrder = null;
    let p_orderId = null;
    let p_isNewOrder = true;
    let p_currentStep = 1;
    let p_unsubscribe = null;
    let p_tabuladorTaller = null;
    let p_comprasVinculadas = {};    // { ordenTallerId: { estado, folio, id } }

    // Listas específicas (para la orden actual)
    let p_diagnosticoEnlaces = [];     // refacciones con link de compra
    let p_diagnosticoInventario = [];  // productos desde inventario (solo SKU, cantidad)
    let p_consumiblesUsados = [];      // consumibles usados en reparación (paso 4)
    let p_componentesInventario = [];  // componentes usados desde inventario (con cantidad final)
    let p_componentesCompra = [];      // componentes usados desde compra (con cantidad final)

    // Filtros
    let p_filtroFechaInicio = null;
    let p_filtroFechaFin = null;
    let p_filtroTecnico = 'todos';
    let p_filtroEstado = 'todos';
    let p_filtroBuscar = '';
    let p_vistaActual = 'kanban'; // kanban, lista, grafica

    // Gráfica
    let p_chartInstance = null;

    // Fechas de etapas
    let p_fechaInicioOrden = null;
    let p_fechasEtapas = {}; // { etapa1_fin: timestamp, etapa2_fin: timestamp, ... }

    // ==========================================================================
    // 2. VALIDACIÓN
    // ==========================================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ==========================================================================
    // 3. INICIALIZACIÓN
    // ==========================================================================
    function init() {
        if (!__x()) { window.location.href = 'ssepi_website.html'; return; }
        _initUI();
        _bindEvents();
        _startListeners();
        _loadTabuladores();
        _loadInventory();
        _populateTecnicosFilter();
        _startClock();
        _setFiltroMesActual();
        _cargarNotificaciones();
        console.log('✅ TallerCore iniciado correctamente');
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '☀️';
        } else {
            document.body.setAttribute('data-theme', 'light');
            document.getElementById('themeBtn').innerHTML = '🌙';
        }
        const now = new Date();
        const dt = now.toISOString().slice(0,16);
        const fechaIngreso = document.getElementById('inpDateTime');
        if (fechaIngreso) fechaIngreso.value = dt;
        const fechaEntrega = document.getElementById('fechaEntrega');
        if (fechaEntrega) fechaEntrega.value = dt;
    }

    function _setFiltroMesActual() {
        const now = new Date();
        p_filtroFechaInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        p_filtroFechaFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.valueAsDate = p_filtroFechaInicio;
        if (filtroFin) filtroFin.valueAsDate = p_filtroFechaFin;
    }

    function _startClock() {
        setInterval(() => {
            const el = document.getElementById('clock');
            if (el) el.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    function _cargarNotificaciones() {
        // Escuchar notificaciones de compras
        if (!window.db) return;
        
        window.db.collection('notificaciones')
            .where('para', '==', 'taller')
            .where('leido', '==', false)
            .onSnapshot(snap => {
                const notificaciones = snap.docs.length;
                if (notificaciones > 0) {
                    _mostrarNotificacion(`📬 ${notificaciones} notificaciones de compras`);
                    _actualizarBadgeNotificaciones(notificaciones);
                }
            });
    }

    function _mostrarNotificacion(mensaje) {
        // Crear elemento de notificación flotante
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: var(--c-taller);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s;
            cursor: pointer;
        `;
        notif.innerHTML = `<i class="fas fa-bell"></i> ${mensaje}`;
        notif.onclick = () => notif.remove();
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 5000);
    }

    function _actualizarBadgeNotificaciones(cantidad) {
        const badge = document.getElementById('notificacionesBadge');
        if (badge) {
            badge.innerText = cantidad;
            badge.style.display = cantidad > 0 ? 'flex' : 'none';
        }
    }

    // ==========================================================================
    // 4. LISTENERS FIRESTORE Y CARGA DE DATOS
    // ==========================================================================
    function _startListeners() {
        if (!window.db) return;

        p_unsubscribe = window.db.collection('ordenes_taller')
            .orderBy('fechaIngreso', 'desc')
            .onSnapshot(snap => {
                p_orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _aplicarFiltros();
                _verificarComprasVinculadas();
            }, console.error);

        window.db.collection('config_taller').doc('principal').onSnapshot(doc => {
            if (doc.exists) {
                p_tabuladorTaller = doc.data();
                p_clients = p_tabuladorTaller.clientes || [];
                _populateClientSelect();
            }
        }, console.error);

        // Escuchar compras vinculadas a taller
        window.db.collection('compras')
            .where('vinculacion.tipo', '==', 'taller')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    const compra = { id: change.doc.id, ...change.doc.data() };
                    const tallerId = compra.vinculacion?.id;
                    if (tallerId) {
                        p_comprasVinculadas[tallerId] = {
                            estado: compra.estado,
                            folio: compra.folio,
                            id: compra.id,
                            items: compra.items || []
                        };
                        
                        // Si la compra se completó (estado 5), notificar
                        if (compra.estado === 5 && change.type === 'modified') {
                            _mostrarNotificacion(`✅ Materiales de orden ${compra.folio} entregados a taller`);
                        }
                    }
                });
                _aplicarFiltros();
            }, console.error);
    }

    async function _loadTabuladores() {
        if (!window.db) return;
        try {
            const doc = await window.db.collection('config_taller').doc('principal').get();
            if (doc.exists) {
                p_tabuladorTaller = doc.data();
                p_clients = p_tabuladorTaller.clientes || [];
            } else {
                p_clients = [
                    { nombre: "ANGUIPLAST", km: 234, horas: 6, direccion: "Libramiento Norte Km. 2, Arandas, JAL", rfc: "ANG101215PG0", contacto: "Ing. Compras" },
                    { nombre: "BOLSAS DE LOS ALTOS", km: 226, horas: 5, direccion: "Carr. Tepatitlán - Arandas, JAL", rfc: "BAL050101AA1", contacto: "Lic. Adquisición" },
                    { nombre: "ECOBOLSAS", km: 216, horas: 5, direccion: "Parque Industrial León, GTO", rfc: "ECO990202BB2", contacto: "Gerente Planta" },
                    { nombre: "BADER TABACHINES", km: 17.2, horas: 2, direccion: "Blvd. J. Clouthier, León, GTO", rfc: "BAD880303CC3", contacto: "Mantenimiento" },
                    { nombre: "BODYCOTE", km: 90.6, horas: 3, direccion: "Silao, Guanajuato Puerto Interior", rfc: "BOD770404DD4", contacto: "Ing. Proyectos" },
                    { nombre: "COFICAB", km: 80, horas: 3, direccion: "Puerto Interior, Silao, GTO", rfc: "COF660505EE5", contacto: "Ing. Eléctrico" },
                    { nombre: "CONDUMEX", km: 90.6, horas: 3, direccion: "Silao, GTO", rfc: "CON550606FF6", contacto: "Compras" },
                    { nombre: "ECSA", km: 32, horas: 2, direccion: "León, GTO", rfc: "ECS440707GG7", contacto: "Admin" }
                ];
            }
            _populateClientSelect();
        } catch (e) { console.error(e); }
    }

    async function _loadInventory() {
        if (!window.db) return;
        try {
            const snap = await window.db.collection('inventario')
                .where('categoria', 'in', ['refaccion', 'consumible'])
                .get();
            p_inventory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error(e); }
    }

    function _populateTecnicosFilter() {
        const select = document.getElementById('filtroTecnico');
        if (!select) return;
        // Obtener técnicos únicos de las órdenes existentes
        const tecnicos = new Set();
        p_orders.forEach(o => { if (o.tecnico_responsable) tecnicos.add(o.tecnico_responsable); });
        tecnicos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    }

    function _verificarComprasVinculadas() {
        // Actualizar badges en el Kanban según compras vinculadas
        p_orders.forEach(orden => {
            if (p_comprasVinculadas[orden.id]) {
                orden.tieneCompra = true;
                orden.compraEstado = p_comprasVinculadas[orden.id].estado;
                orden.compraFolio = p_comprasVinculadas[orden.id].folio;
            } else {
                orden.tieneCompra = false;
            }
        });
    }

    // ==========================================================================
    // 5. FILTROS Y VISTAS
    // ==========================================================================
    function _aplicarFiltros() {
        let filtradas = p_orders;

        // Filtro por fecha
        if (p_filtroFechaInicio && p_filtroFechaFin) {
            filtradas = filtradas.filter(o => {
                const f = new Date(o.fechaIngreso);
                return f >= p_filtroFechaInicio && f <= p_filtroFechaFin;
            });
        }

        // Filtro por técnico
        if (p_filtroTecnico !== 'todos') {
            filtradas = filtradas.filter(o => o.tecnico_responsable === p_filtroTecnico);
        }

        // Filtro por estado
        if (p_filtroEstado !== 'todos') {
            filtradas = filtradas.filter(o => o.estado === p_filtroEstado);
        }

        // Filtro por búsqueda
        if (p_filtroBuscar) {
            const term = p_filtroBuscar.toLowerCase();
            filtradas = filtradas.filter(o => 
                (o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(term)) ||
                (o.equipo && o.equipo.toLowerCase().includes(term)) ||
                (o.folio && o.folio.toLowerCase().includes(term))
            );
        }

        if (p_vistaActual === 'kanban') _renderKanban(filtradas);
        else if (p_vistaActual === 'lista') _renderLista(filtradas);
        else if (p_vistaActual === 'grafica') _renderGrafica(filtradas);

        _updateKPIs(filtradas);
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
        const compraInfo = p_comprasVinculadas[orden.id];
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
                    <div class="equipo">${orden.equipo || 'Equipo'}</div>
                </div>
                <div class="card-footer">
                    <small>Ingreso: ${orden.fechaIngreso ? new Date(orden.fechaIngreso).toLocaleDateString() : ''}</small>
                    ${orden.fechaReparacion ? `<small>Rep: ${new Date(orden.fechaReparacion).toLocaleDateString()}</small>` : ''}
                    ${orden.recibidoPor ? `<small><i class="fas fa-user"></i> ${orden.recibidoPor}</small>` : ''}
                </div>
            </div>
        `;
    }

    function _renderLista(ordenes) {
        const container = document.getElementById('listaContainer');
        if (!container) return;
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Equipo</th><th>Técnico</th><th>Estado</th><th>Ingreso</th><th>Reparación</th><th>Recibido por</th></tr></thead><tbody>';
        ordenes.forEach(o => {
            const compraInfo = p_comprasVinculadas[o.id];
            const recibidoPor = o.recibidoPor || '—';
            html += `<tr onclick="TallerCore._abrirOrden('${o.id}')">
                <td>${o.folio || o.id.slice(-6)} ${compraInfo ? '🛒' : ''}</td>
                <td>${o.cliente_nombre || ''}</td>
                <td>${o.equipo || ''}</td>
                <td>${o.tecnico_responsable || ''}</td>
                <td>${o.estado || 'Nuevo'}</td>
                <td>${o.fechaIngreso ? new Date(o.fechaIngreso).toLocaleDateString() : ''}</td>
                <td>${o.fechaReparacion ? new Date(o.fechaReparacion).toLocaleDateString() : ''}</td>
                <td>${recibidoPor}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function _renderGrafica(ordenes) {
        const ctx = document.getElementById('graficaCanvas').getContext('2d');
        if (p_chartInstance) p_chartInstance.destroy();

        const estados = ['Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado'];
        const counts = estados.map(e => ordenes.filter(o => o.estado === e).length);

        p_chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: estados,
                datasets: [{
                    label: 'Órdenes por estado',
                    data: counts,
                    backgroundColor: ['#1976d2', '#ff9800', '#9c27b0', '#4caf50', '#607d8b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // ==========================================================================
    // 6. FUNCIONES DEL MODAL (5 PASOS) - CORREGIDO CON GUARDADO
    // ==========================================================================
    function _abrirOrden(id) {
        const orden = p_orders.find(o => o.id === id);
        if (!orden) return;
        
        p_currentOrder = orden;
        p_orderId = id;
        p_isNewOrder = false;
        
        // Verificar si tiene compra vinculada
        if (p_comprasVinculadas[id]) {
            orden.compraVinculada = p_comprasVinculadas[id];
        }
        
        _cargarDatosEnModal(orden);
        document.getElementById('wsModal').classList.add('active');
        _irPaso(orden.estado ? _etapaToPaso(orden.estado) : 1);
    }

    function _abrirNuevaOrden() {
        p_isNewOrder = true;
        p_currentOrder = null;
        p_orderId = null;
        p_diagnosticoEnlaces = [];
        p_diagnosticoInventario = [];
        p_consumiblesUsados = [];
        p_componentesInventario = [];
        p_componentesCompra = [];
        p_fechaInicioOrden = new Date().toISOString();
        p_fechasEtapas = {};
        _resetForm();
        _generateFolio();
        _populateClientSelect();
        _populateInventorySelect();
        _irPaso(1);
        document.getElementById('wsModal').classList.add('active');
    }

    function _etapaToPaso(etapa) {
        const mapa = { 'Nuevo': 1, 'Diagnóstico': 2, 'En Espera': 3, 'Reparado': 4, 'Entregado': 5 };
        return mapa[etapa] || 1;
    }

    function _pasoToEtapa(paso) {
        const mapa = { 1: 'Nuevo', 2: 'Diagnóstico', 3: 'En Espera', 4: 'Reparado', 5: 'Entregado' };
        return mapa[paso] || 'Nuevo';
    }

    function _cargarDatosEnModal(orden) {
        document.getElementById('inpFolio').value = orden.folio || '';
        document.getElementById('selClient').value = orden.cliente_nombre || '';
        document.getElementById('inpDateTime').value = orden.fechaIngreso || '';
        document.getElementById('inpClientRef').value = orden.referencia || '';
        document.getElementById('inpEquip').value = orden.equipo || '';
        document.getElementById('inpBrand').value = orden.marca || '';
        document.getElementById('inpModel').value = orden.modelo || '';
        document.getElementById('inpSerial').value = orden.serie || '';
        document.getElementById('inpFail').value = orden.falla_reportada || '';
        document.getElementById('inpCond').value = orden.condiciones_fisicas || '';
        document.getElementById('inpReceptionBy').value = orden.encargado_recepcion || '';
        document.getElementById('inpUnderWarranty').checked = orden.bajo_garantia || false;
        document.getElementById('techSelect').value = orden.tecnico_responsable || '';
        document.getElementById('internalNotes').value = orden.notas_internas || '';
        document.getElementById('generalNotes').value = orden.notas_generales || '';
        document.getElementById('horasEstimadas').value = orden.horas_estimadas || 0;
        document.getElementById('recibidoPor').value = orden.recibidoPor || '';

        p_diagnosticoEnlaces = orden.refacciones_enlaces || [];
        p_diagnosticoInventario = orden.refacciones_inventario || [];
        p_consumiblesUsados = orden.consumibles_usados || [];
        p_componentesInventario = orden.componentes_inventario || [];
        p_componentesCompra = orden.componentes_compra || [];
        p_fechaInicioOrden = orden.fecha_inicio || new Date().toISOString();
        p_fechasEtapas = orden.fechas_etapas || {};

        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();

        // Actualizar resumen en paso 4
        document.getElementById('resumenCliente').textContent = orden.cliente_nombre || '';
        document.getElementById('resumenEquipo').textContent = orden.equipo || '';
        document.getElementById('resumenMarca').textContent = orden.marca || '';
        document.getElementById('resumenModelo').textContent = orden.modelo || '';
        document.getElementById('resumenSerie').textContent = orden.serie || '';
        document.getElementById('resumenFalla').textContent = orden.falla_reportada || '';
        document.getElementById('resumenCond').textContent = orden.condiciones_fisicas || '';

        document.getElementById('fechaInicioDisplay').textContent = new Date(p_fechaInicioOrden).toLocaleString();
        
        // Mostrar info de compra si existe
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
            }
        }
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        p_currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`step-${paso}`).classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.ws-step-btn[data-step="${paso}"]`).classList.add('active');
        _actualizarBotonesPaso();

        if (paso === 2) {
            _populateClientSelect();
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

        if (p_currentStep === 1) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'flex';
            saveBtn.style.display = 'inline-flex'; // Mostrar guardar en paso 1
            completeBtn.style.display = 'none';
            sinReparacionBtn.style.display = 'none';
        } else if (p_currentStep === 5) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'none';
            saveBtn.style.display = 'none';
            completeBtn.style.display = 'flex';
            sinReparacionBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
            saveBtn.style.display = 'inline-flex'; // Mostrar guardar en todos los pasos
            completeBtn.style.display = 'none';
            sinReparacionBtn.style.display = p_currentStep === 2 ? 'flex' : 'none';
        }
    }

    function _prevStep() { if (p_currentStep > 1) _irPaso(p_currentStep - 1); }
    function _nextStep() { if (_validarPasoActual() && p_currentStep < 5) _irPaso(p_currentStep + 1); }

    function _validarPasoActual() {
        switch(p_currentStep) {
            case 1:
                if (!document.getElementById('selClient').value) { alert('Seleccione un cliente'); return false; }
                if (!document.getElementById('inpEquip').value) { alert('Ingrese el equipo'); return false; }
                // Foto opcional - no validamos
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

    // ==========================================================================
    // 7. LISTAS ESPECÍFICAS (render y acciones)
    // ==========================================================================
    function _renderDiagnosticoEnlaces() {
        const tbody = document.getElementById('diagnosticoEnlacesBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (p_diagnosticoEnlaces.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay refacciones con enlace</td></tr>';
            return;
        }
        p_diagnosticoEnlaces.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${item.descripcion || ''}" placeholder="Descripción" data-index="${idx}" onchange="TallerCore._actualizarEnlace(${idx}, 'descripcion', this.value)"></td>
                <td><input type="text" value="${item.sku || ''}" placeholder="SKU" data-index="${idx}" onchange="TallerCore._actualizarEnlace(${idx}, 'sku', this.value)"></td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" data-index="${idx}" onchange="TallerCore._actualizarEnlace(${idx}, 'cantidad', this.value)"></td>
                <td><input type="url" value="${item.link || ''}" placeholder="https://..." data-index="${idx}" onchange="TallerCore._actualizarEnlace(${idx}, 'link', this.value)"></td>
                <td><button type="button" class="btn-remove" onclick="TallerCore._eliminarEnlace(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderDiagnosticoInventario() {
        const tbody = document.getElementById('diagnosticoInventarioBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (p_diagnosticoInventario.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay productos de inventario</td></tr>';
            return;
        }
        p_diagnosticoInventario.forEach((item, idx) => {
            const producto = p_inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <select data-index="${idx}" onchange="TallerCore._actualizarInventarioSeleccion(${idx}, this.value)">
                        <option value="">-- Seleccionar SKU --</option>
                        ${p_inventory.map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" value="${desc}" placeholder="Descripción" readonly></td>
                <td>${stock}</td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="TallerCore._actualizarInventarioCantidad(${idx}, this.value)"></td>
                <td><button type="button" class="btn-remove" onclick="TallerCore._eliminarInventario(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderConsumibles() {
        const tbody = document.getElementById('consumiblesBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (p_consumiblesUsados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay consumibles agregados</td></tr>';
            return;
        }
        p_consumiblesUsados.forEach((item, idx) => {
            const producto = p_inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <select data-index="${idx}" onchange="TallerCore._actualizarConsumibleSeleccion(${idx}, this.value)">
                        <option value="">-- Seleccionar SKU --</option>
                        ${p_inventory.filter(p => p.categoria === 'consumible').map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" value="${desc}" readonly></td>
                <td>${stock}</td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="TallerCore._actualizarConsumibleCantidad(${idx}, this.value)"></td>
                <td><button type="button" class="btn-remove" onclick="TallerCore._eliminarConsumible(${idx})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _renderComponentesInventario() {
        const tbody = document.getElementById('componentesInventarioBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        // Combinar con lo solicitado en diagnóstico
        const items = p_diagnosticoInventario.map(solicitado => {
            const existente = p_componentesInventario.find(c => c.sku === solicitado.sku);
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
                <td><input type="number" value="${item.cantidad_usada}" min="0" data-index="${idx}" onchange="TallerCore._actualizarComponenteInventario(${idx}, this.value)"></td>
                <td><button type="button" class="btn-remove" onclick="TallerCore._eliminarComponenteInventario(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _renderComponentesCompra() {
        const tbody = document.getElementById('componentesCompraBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Verificar si hay compra vinculada
        if (p_orderId && p_comprasVinculadas[p_orderId]) {
            const compra = p_comprasVinculadas[p_orderId];
            
            if (compra.items && compra.items.length > 0) {
                tbody.innerHTML = compra.items.map((item, idx) => `
                    <tr>
                        <td>${item.desc || 'Producto'}</td>
                        <td>${item.sku || '—'}</td>
                        <td>${item.qty || 0}</td>
                        <td><input type="number" value="${item.qty || 0}" min="0" data-index="${idx}" onchange="TallerCore._actualizarComponenteCompra(${idx}, this.value)"></td>
                        <td><button type="button" class="btn-remove" onclick="TallerCore._eliminarComponenteCompra(${idx})">✖</button></td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Compra sin items registrados</td></tr>';
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay compra vinculada a esta orden</td></tr>';
        }
    }

    // Funciones de actualización de listas (expuestas globalmente)
    function _actualizarEnlace(idx, campo, valor) {
        p_diagnosticoEnlaces[idx][campo] = campo === 'cantidad' ? parseInt(valor) || 1 : valor;
    }
    function _eliminarEnlace(idx) {
        p_diagnosticoEnlaces.splice(idx, 1);
        _renderDiagnosticoEnlaces();
    }
    function _actualizarInventarioSeleccion(idx, sku) {
        const producto = p_inventory.find(p => p.sku === sku);
        p_diagnosticoInventario[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: p_diagnosticoInventario[idx]?.cantidad || 1
        };
        _renderDiagnosticoInventario();
    }
    function _actualizarInventarioCantidad(idx, cantidad) {
        p_diagnosticoInventario[idx].cantidad = parseInt(cantidad) || 1;
    }
    function _eliminarInventario(idx) {
        p_diagnosticoInventario.splice(idx, 1);
        _renderDiagnosticoInventario();
    }
    function _actualizarConsumibleSeleccion(idx, sku) {
        const producto = p_inventory.find(p => p.sku === sku);
        p_consumiblesUsados[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: p_consumiblesUsados[idx]?.cantidad || 1
        };
        _renderConsumibles();
    }
    function _actualizarConsumibleCantidad(idx, cantidad) {
        p_consumiblesUsados[idx].cantidad = parseInt(cantidad) || 1;
    }
    function _eliminarConsumible(idx) {
        p_consumiblesUsados.splice(idx, 1);
        _renderConsumibles();
    }
    function _actualizarComponenteInventario(idx, cantidad) {
        p_componentesInventario[idx].cantidad_usada = parseInt(cantidad) || 0;
    }
    function _eliminarComponenteInventario(idx) {
        p_componentesInventario.splice(idx, 1);
        _renderComponentesInventario();
    }
    function _actualizarComponenteCompra(idx, cantidad) {
        p_componentesCompra[idx].cantidad_usada = parseInt(cantidad) || 0;
    }
    function _eliminarComponenteCompra(idx) {
        p_componentesCompra.splice(idx, 1);
        _renderComponentesCompra();
    }

    // ==========================================================================
    // 8. ACCIONES ESPECIALES (CORREGIDAS)
    // ==========================================================================
    async function _sinReparacion() {
        if (!confirm('¿Marcar como "Sin reparación"? Esto moverá la orden a "En espera" y notificará a compras.')) return;
        
        // Primero guardar la orden actual
        await _guardarOrden(true); // true = silencioso (sin alert)

        const data = _recolectarDatos();
        data.estado = 'En Espera';
        data.sin_reparacion = true;
        data.fecha_sin_reparacion = new Date().toISOString();
        
        try {
            if (p_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_taller').add(data);
            } else {
                await window.db.collection('ordenes_taller').doc(p_orderId).update(data);
            }
            
            // Crear una notificación en compras
            await window.db.collection('notificaciones').add({
                para: 'compras',
                tipo: 'sin_reparacion',
                ordenId: p_orderId || 'nueva',
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} marcada como sin reparación - evaluar compra de equipo nuevo`,
                leido: false,
                fecha: new Date().toISOString()
            });

            _cerrarModal();
            alert('✅ Orden marcada como sin reparación');
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _generarSolicitudCompra() {
        if (!__x() || !window.db) return;

        // PRIMERO: Guardar la orden de taller con los datos actuales
        await _guardarOrden(true); // true = silencioso (sin alert)

        const data = _recolectarDatos();
        
        if (!data.cliente_nombre) { 
            alert('Seleccione cliente'); 
            _irPaso(1); 
            return; 
        }
        
        if (!data.equipo) { 
            alert('Ingrese el equipo'); 
            _irPaso(1); 
            return; 
        }

        if (p_diagnosticoEnlaces.length === 0 && p_diagnosticoInventario.length === 0) {
            alert('Debe agregar al menos una refacción a comprar');
            return;
        }

        try {
            let ordenTallerId = p_orderId;
            let folioTaller = data.folio;
            
            // Si es nueva orden, guardarla primero
            if (p_isNewOrder) {
                folioTaller = `T-${Date.now().toString().slice(-6)}`;
                const nuevaOrden = {
                    ...data,
                    folio: folioTaller,
                    estado: 'En Espera',
                    fechaIngreso: new Date().toISOString(),
                    historial: [{ 
                        fecha: new Date().toISOString(), 
                        usuario: 'Taller', 
                        accion: 'Orden creada y enviada a compras' 
                    }],
                    fecha_inicio: p_fechaInicioOrden,
                    fechas_etapas: p_fechasEtapas
                };
                
                const fotoInput = document.getElementById('productImage');
                if (fotoInput && fotoInput.files[0]) {
                    nuevaOrden.foto_ingreso = await _subirFoto(fotoInput.files[0], 'taller/nueva');
                }
                
                const docRef = await window.db.collection('ordenes_taller').add(nuevaOrden);
                ordenTallerId = docRef.id;
                p_orderId = ordenTallerId;
                p_isNewOrder = false;
            } else {
                // Actualizar la orden existente a estado "En Espera"
                data.estado = 'En Espera';
                data.fechaEnvioCompra = new Date().toISOString();
                await window.db.collection('ordenes_taller').doc(p_orderId).update(data);
            }

            // AHORA SÍ: Crear la orden de compra vinculada
            const items = p_diagnosticoEnlaces.map(e => ({
                sku: e.sku || '',
                desc: e.descripcion,
                qty: e.cantidad,
                price: 0,
                link: e.link
            }));

            const nuevaCompra = {
                folio: `PO-${folioTaller}`,
                proveedor: 'Por asignar',
                departamento: 'Taller Electrónica',
                fechaRequerida: new Date().toISOString().split('T')[0],
                prioridad: 'Normal',
                vinculacion: { 
                    tipo: 'taller', 
                    id: ordenTallerId, 
                    nombre: data.cliente_nombre,
                    folio_taller: folioTaller
                },
                items: items,
                total: 0,
                estado: 1,
                pasos: [{
                    paso: 1,
                    fecha: new Date().toISOString(),
                    usuario: 'Taller',
                    accion: 'Solicitud creada desde taller',
                    fotoUrl: null
                }],
                confirmadoVentas: false,
                fechaCreacion: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            const compraRef = await window.db.collection('compras').add(nuevaCompra);
            
            // Actualizar la orden de taller con el ID de la compra
            await window.db.collection('ordenes_taller').doc(ordenTallerId).update({
                compraVinculada: compraRef.id,
                compraFolio: nuevaCompra.folio,
                estado: 'En Espera',
                fechaEnvioCompra: new Date().toISOString()
            });

            // Crear notificación para compras
            await window.db.collection('notificaciones').add({
                para: 'compras',
                tipo: 'nueva_solicitud',
                ordenId: ordenTallerId,
                compraId: compraRef.id,
                folio: nuevaCompra.folio,
                cliente: data.cliente_nombre,
                mensaje: `Nueva solicitud de compra ${nuevaCompra.folio} desde taller`,
                leido: false,
                fecha: new Date().toISOString()
            });

            alert('✅ Solicitud de compra generada. La orden pasó a estado "En Espera".');
            _addToFeed('🛒', `Solicitud de compra creada para ${folioTaller}`);
            
            // Cerrar el modal de taller
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
        data.fechaReparacion = new Date().toISOString();
        data.componentes_inventario = p_componentesInventario;
        data.componentes_compra = p_componentesCompra;
        data.consumibles_usados = p_consumiblesUsados;

        // Descontar del inventario
        for (let item of p_componentesInventario) {
            if (item.cantidad_usada > 0 && item.sku) {
                const producto = p_inventory.find(p => p.sku === item.sku);
                if (producto) {
                    await window.db.collection('inventario').doc(producto.id).update({
                        stock: window.firebase.firestore.FieldValue.increment(-item.cantidad_usada)
                    });
                }
            }
        }

        for (let item of p_consumiblesUsados) {
            if (item.cantidad > 0 && item.sku) {
                const producto = p_inventory.find(p => p.sku === item.sku);
                if (producto) {
                    await window.db.collection('inventario').doc(producto.id).update({
                        stock: window.firebase.firestore.FieldValue.increment(-item.cantidad)
                    });
                }
            }
        }

        try {
            if (p_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_taller').add(data);
            } else {
                await window.db.collection('ordenes_taller').doc(p_orderId).update(data);
            }

            // Notificar a facturación que la orden está reparada
            await window.db.collection('notificaciones').add({
                para: 'facturacion',
                tipo: 'taller_terminado',
                ordenId: p_orderId,
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} reparada - Listo para facturar`,
                leido: false,
                fecha: new Date().toISOString()
            });

            _irPaso(4);
            alert('✅ Reparación finalizada');
            _addToFeed('✅', `Reparación completada para ${data.folio}`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _terminarEtapa(etapa) {
        // Registrar fecha de fin de etapa
        const campo = `etapa${etapa}_fin`;
        p_fechasEtapas[campo] = new Date().toISOString();
        
        // Guardar la orden antes de avanzar
        if (p_orderId) {
            await window.db.collection('ordenes_taller').doc(p_orderId).update({
                fechas_etapas: p_fechasEtapas
            });
        }
        
        alert(`✅ Etapa ${etapa} finalizada`);
        // Avanzar al siguiente paso si no es el último
        if (etapa < 5) {
            _irPaso(etapa + 1);
        }
    }

    // ==========================================================================
    // 9. GUARDAR ORDEN (completa) - CORREGIDO
    // ==========================================================================
    async function _guardarOrden(silencioso = false) {
        if (!__x() || !window.db) return;
        
        const data = _recolectarDatos();
        if (!data.cliente_nombre) { 
            if (!silencioso) alert('Seleccione cliente'); 
            _irPaso(1); 
            return; 
        }
        if (!data.equipo) { 
            if (!silencioso) alert('Ingrese el equipo'); 
            _irPaso(1); 
            return; 
        }
        
        const fotoInput = document.getElementById('productImage');
        if (fotoInput && fotoInput.files[0]) {
            data.foto_ingreso = await _subirFoto(fotoInput.files[0], 'taller/' + (p_orderId || 'nueva'));
        }
        
        // Guardar listas
        data.refacciones_enlaces = p_diagnosticoEnlaces;
        data.refacciones_inventario = p_diagnosticoInventario;
        data.consumibles_usados = p_consumiblesUsados;
        data.componentes_inventario = p_componentesInventario;
        data.componentes_compra = p_componentesCompra;
        data.fecha_inicio = p_fechaInicioOrden;
        data.fechas_etapas = p_fechasEtapas;
        data.recibidoPor = document.getElementById('recibidoPor')?.value || '';

        try {
            if (p_isNewOrder) {
                data.folio = `T-${Date.now().toString().slice(-6)}`;
                data.estado = 'Nuevo';
                data.fechaIngreso = new Date().toISOString();
                data.historial = [{ fecha: new Date().toISOString(), usuario: 'Taller', accion: 'Orden creada' }];
                const docRef = await window.db.collection('ordenes_taller').add(data);
                p_orderId = docRef.id;
                p_isNewOrder = false;
                if (!silencioso) alert('✅ Orden guardada correctamente');
            } else {
                await window.db.collection('ordenes_taller').doc(p_orderId).update(data);
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
            fechaIngreso: document.getElementById('inpDateTime').value,
            equipo: document.getElementById('inpEquip').value,
            marca: document.getElementById('inpBrand').value,
            modelo: document.getElementById('inpModel').value,
            serie: document.getElementById('inpSerial').value,
            falla_reportada: document.getElementById('inpFail').value,
            condiciones_fisicas: document.getElementById('inpCond').value,
            encargado_recepcion: document.getElementById('inpReceptionBy').value,
            bajo_garantia: document.getElementById('inpUnderWarranty').checked,
            tecnico_responsable: document.getElementById('techSelect').value,
            notas_internas: document.getElementById('internalNotes').value,
            notas_generales: document.getElementById('generalNotes').value,
            horas_estimadas: parseFloat(document.getElementById('horasEstimadas').value) || 0,
            fecha_entrega: document.getElementById('fechaEntrega').value,
            recibe_nombre: document.getElementById('recibeNombre').value,
            recibe_identificacion: document.getElementById('recibeIdentificacion').value,
            factura_numero: document.getElementById('facturaNumero').value,
            entrega_obs: document.getElementById('entregaObs').value,
            recibidoPor: document.getElementById('recibidoPor')?.value || '',
            actualizado: new Date().toISOString()
        };
    }

    async function _completarEntrega() {
        if (!_validarPasoActual()) return;
        
        const data = _recolectarDatos();
        data.estado = 'Entregado';
        data.fechaEntrega = new Date().toISOString();
        
        const fotoInput = document.getElementById('fotoEntrega');
        if (fotoInput && fotoInput.files[0]) {
            data.foto_entrega = await _subirFoto(fotoInput.files[0], 'taller/' + p_orderId);
        }

        try {
            if (p_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_taller').add(data);
            } else {
                await window.db.collection('ordenes_taller').doc(p_orderId).update(data);
            }
            
            // Notificar a facturación
            await window.db.collection('notificaciones').add({
                para: 'facturacion',
                tipo: 'taller_entregado',
                ordenId: p_orderId,
                folio: data.folio,
                cliente: data.cliente_nombre,
                mensaje: `Orden ${data.folio} entregada a ventas`,
                leido: false,
                fecha: new Date().toISOString()
            });

            _cerrarModal();
            alert('✅ Orden entregada a ventas');
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    // ==========================================================================
    // 10. SUBIDA DE FOTOS A STORAGE
    // ==========================================================================
    async function _subirFoto(file, carpeta) {
        if (!file) return null;
        // Foto opcional - si no hay archivo, retornamos null
        if (!firebase.storage) return null;
        
        try {
            const storageRef = firebase.storage().ref();
            const fileName = `${Date.now()}_${file.name}`;
            const fileRef = storageRef.child(`${carpeta}/${fileName}`);
            await fileRef.put(file);
            return await fileRef.getDownloadURL();
        } catch (error) {
            console.error('Error subiendo foto:', error);
            return null;
        }
    }

    // ==========================================================================
    // 11. KPIs
    // ==========================================================================
    function _updateKPIs(ordenes) {
        const nuevo = ordenes.filter(o => o.estado === 'Nuevo').length;
        const diagnostico = ordenes.filter(o => o.estado === 'Diagnóstico').length;
        const espera = ordenes.filter(o => o.estado === 'En Espera').length;
        const reparado = ordenes.filter(o => o.estado === 'Reparado').length;
        const entregado = ordenes.filter(o => o.estado === 'Entregado').length;
        const conCompra = Object.keys(p_comprasVinculadas).filter(id => {
            const orden = ordenes.find(o => o.id === id);
            return orden && p_comprasVinculadas[id].estado < 5;
        }).length;
        
        document.getElementById('kpiNuevo').innerText = nuevo;
        document.getElementById('kpiDiagnostico').innerText = diagnostico;
        document.getElementById('kpiEspera').innerText = espera;
        document.getElementById('kpiReparado').innerText = reparado;
        document.getElementById('kpiEntregado').innerText = entregado;
        document.getElementById('kpiConCompra').innerText = conCompra;
    }

    // ==========================================================================
    // 12. EVENTOS DOM (ACTUALIZADO)
    // ==========================================================================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);
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

        // Botones de terminar etapa
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`terminarEtapa${i}`);
            if (btn) {
                btn.addEventListener('click', () => _terminarEtapa(i));
            }
        }

        // Botones para listas
        document.getElementById('addEnlaceBtn').addEventListener('click', () => {
            p_diagnosticoEnlaces.push({ descripcion: '', sku: '', cantidad: 1, link: '' });
            _renderDiagnosticoEnlaces();
        });
        document.getElementById('addInventarioBtn').addEventListener('click', () => {
            p_diagnosticoInventario.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderDiagnosticoInventario();
        });
        document.getElementById('addConsumibleBtn').addEventListener('click', () => {
            p_consumiblesUsados.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderConsumibles();
        });

        // Filtros
        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            p_filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            p_filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            p_filtroTecnico = document.getElementById('filtroTecnico').value;
            p_filtroEstado = document.getElementById('filtroEstado').value;
            p_filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _aplicarFiltros();
        });
        
        document.getElementById('vistaKanban').addEventListener('click', () => {
            p_vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _aplicarFiltros();
        });
        
        document.getElementById('vistaLista').addEventListener('click', () => {
            p_vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _aplicarFiltros();
        });
        
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            p_vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
            _aplicarFiltros();
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
        document.getElementById('selClient').addEventListener('change', _onClienteSelect);
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
        window.innerWidth <= 768 ? s.classList.toggle('active') : b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '🌙';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '☀️';
        }
    }

    function _cerrarModal() {
        document.getElementById('wsModal').classList.remove('active');
        p_currentOrder = null;
        p_orderId = null;
        p_isNewOrder = true;
    }

    function _resetForm() {
        document.getElementById('inpFolio').value = '';
        document.getElementById('selClient').value = '';
        document.getElementById('inpDateTime').value = new Date().toISOString().slice(0,16);
        document.getElementById('inpClientRef').value = '';
        document.getElementById('inpEquip').value = '';
        document.getElementById('inpBrand').value = '';
        document.getElementById('inpModel').value = '';
        document.getElementById('inpSerial').value = '';
        document.getElementById('inpFail').value = '';
        document.getElementById('inpCond').value = '';
        document.getElementById('inpReceptionBy').value = '';
        document.getElementById('inpUnderWarranty').checked = false;
        document.getElementById('techSelect').value = '';
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
        p_diagnosticoEnlaces = [];
        p_diagnosticoInventario = [];
        p_consumiblesUsados = [];
        p_componentesInventario = [];
        p_componentesCompra = [];
        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();
    }

    function _generateFolio() {
        const now = new Date();
        const folio = `T-${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        document.getElementById('inpFolio').value = folio;
    }

    function _populateClientSelect() {
        const sel = document.getElementById('selClient');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Seleccionar --</option>';
        p_clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nombre;
            opt.textContent = c.nombre;
            sel.appendChild(opt);
        });
    }

    function _populateInventorySelect() {
        // No necesario, se maneja en cada fila
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

    function _onClienteSelect() {}

    // ==========================================================================
    // 13. FEED Y LOGS
    // ==========================================================================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-taller);">TALLER</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
    }

    // ==========================================================================
    // 14. LIMPIEZA
    // ==========================================================================
    function _cleanup() {
        if (p_unsubscribe) p_unsubscribe();
        if (p_chartInstance) p_chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==========================================================================
    // 15. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init,
        _abrirOrden: _abrirOrden,
        _actualizarEnlace: _actualizarEnlace,
        _eliminarEnlace: _eliminarEnlace,
        _actualizarInventarioSeleccion: _actualizarInventarioSeleccion,
        _actualizarInventarioCantidad: _actualizarInventarioCantidad,
        _eliminarInventario: _eliminarInventario,
        _actualizarConsumibleSeleccion: _actualizarConsumibleSeleccion,
        _actualizarConsumibleCantidad: _actualizarConsumibleCantidad,
        _eliminarConsumible: _eliminarConsumible,
        _actualizarComponenteInventario: _actualizarComponenteInventario,
        _eliminarComponenteInventario: _eliminarComponenteInventario,
        _actualizarComponenteCompra: _actualizarComponenteCompra,
        _eliminarComponenteCompra: _eliminarComponenteCompra
    };
})();

// Asignar a window para que las llamadas onclick funcionen
window.TallerCore = TallerCore;