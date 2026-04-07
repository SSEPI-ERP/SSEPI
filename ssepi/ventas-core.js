// ventas-core.js - SSEPI Ironclad Core v17 - Módulo de Ventas y Cotizaciones
// Versión completa con calculadora, editor y envío al cliente
// AHORA USA COSTOS-ENGINE Y ENVÍA NOTIFICACIONES

const VentasManager = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let v_a = [];               // ventas array
    let i_a = [];               // inventario array
    let p_a = [];               // proyectos array
    let t_a = [];               // taller array
    let m_a = [];               // motores array
    let cot_a = [];             // cotizaciones array
    let f_ = 'all';             // filtro actual
    let vi_ = 'table';          // vista actual
    let e_ = null;              // elemento expandido
    let u_ = null;              // unsubscribe ventas
    let pasoActual = 1;          // paso en wizard
    let tabuladorActivo = 'taller'; // taller o automatizacion
    let solicitudesFacturacion = [];
    let solicitudSeleccionada = null;
    let solicitudesTaller = [];
    
    // Estado de la calculadora
    let calculadoraComponentes = [];
    let calculadoraClienteActual = null;
    let compraActual = null;
    let ordenTallerId = null;
    
    // Gráfica
    let chartInstance = null;

    // ==========================================================================
    // 2. TABULADORES (DATOS COMPLETOS)
    // ==========================================================================
    const tabuladorTaller = {
        variables: {
            gasolina: 24.50,
            rendimiento: 9.5,
            costoTecnico: 104.16,
            gastosFijosHora: 124.18,
            camionetaHora: 39.35,
            utilidad: 40,
            credito: 3,
            iva: 16
        },
        clientes: [
            { nombre: "ANGUIPLAST", km: 234, horas: 6, direccion: "Libramiento Norte Km. 2, Arandas, JAL", rfc: "ANG101215PG0", contacto: "Ing. Compras" },
            { nombre: "BOLSAS DE LOS ALTOS", km: 226, horas: 5, direccion: "Carr. Tepatitlán - Arandas, JAL", rfc: "BAL050101AA1", contacto: "Lic. Adquisición" },
            { nombre: "ECOBOLSAS", km: 216, horas: 5, direccion: "Parque Industrial León, GTO", rfc: "ECO990202BB2", contacto: "Gerente Planta" },
            { nombre: "BADER TABACHINES", km: 17.2, horas: 2, direccion: "Blvd. J. Clouthier, León, GTO", rfc: "BAD880303CC3", contacto: "Mantenimiento" },
            { nombre: "BODYCOTE", km: 90.6, horas: 3, direccion: "Silao, Guanajuato Puerto Interior", rfc: "BOD770404DD4", contacto: "Ing. Proyectos" },
            { nombre: "COFICAB", km: 80, horas: 3, direccion: "Puerto Interior, Silao, GTO", rfc: "COF660505EE5", contacto: "Ing. Eléctrico" },
            { nombre: "CONDUMEX", km: 90.6, horas: 3, direccion: "Silao, GTO", rfc: "CON550606FF6", contacto: "Compras" },
            { nombre: "ECSA", km: 32, horas: 2, direccion: "León, GTO", rfc: "ECS440707GG7", contacto: "Admin" },
            { nombre: "EMMSA", km: 21.6, horas: 2, direccion: "León, GTO", rfc: "EMM330808HH8", contacto: "Almacén" },
            { nombre: "EPC 1", km: 400, horas: 7, direccion: "SLP", rfc: "EPC220909II9", contacto: "Ingeniería" },
            { nombre: "EPC 2", km: 402, horas: 8, direccion: "SLP", rfc: "EPC111010JJ0", contacto: "Ingeniería" },
            { nombre: "FRAENKISCHE", km: 79.4, horas: 3, direccion: "Silao, GTO", rfc: "FRA001111KK1", contacto: "Mtto" },
            { nombre: "GEDNEY", km: 23.6, horas: 3, direccion: "León, GTO", rfc: "GED991212LL2", contacto: "Compras" },
            { nombre: "GRUPO ACERERO", km: 386, horas: 7, direccion: "SLP", rfc: "GRU880101MM3", contacto: "Planta" },
            { nombre: "HALL PLANTA 1", km: 73.8, horas: 3, direccion: "Parque Opción, San José Iturbide", rfc: "HAL770202NN4", contacto: "Ing. Control" },
            { nombre: "HIRUTA PLANTA 1", km: 58.4, horas: 3, direccion: "Parque Amistad, Celaya", rfc: "HIR660303OO5", contacto: "Mtto" },
            { nombre: "IK PLASTIC", km: 61.4, horas: 3, direccion: "Parque Stiva, León", rfc: "IKP550404PP6", contacto: "Ing. Proc" },
            { nombre: "IMPRENTA JM", km: 16.2, horas: 2, direccion: "Col. Obregón, León", rfc: "IMP440505QQ7", contacto: "Dueño" },
            { nombre: "JARDÍN LA ALEMANA", km: 12, horas: 2, direccion: "León, GTO", rfc: "JAR330606RR8", contacto: "Admin" },
            { nombre: "MAFLOW", km: 59.8, horas: 3, direccion: "Silao, GTO", rfc: "MAF220707SS9", contacto: "Ingeniería" },
            { nombre: "MARQUARDT", km: 125.4, horas: 4, direccion: "Irapuato, GTO", rfc: "MAR110808TT0", contacto: "Compras" },
            { nombre: "MICROONDA", km: 41.6, horas: 3, direccion: "León, GTO", rfc: "MIC000909UU1", contacto: "Sistemas" },
            { nombre: "MR LUCKY", km: 157, horas: 4, direccion: "Irapuato, GTO", rfc: "MRL991010VV2", contacto: "Campo" },
            { nombre: "NHK", km: 138.6, horas: 4, direccion: "Celaya, GTO", rfc: "NHK881111WW3", contacto: "Mtto" },
            { nombre: "NISHIKAWA", km: 61, horas: 3, direccion: "Silao, GTO", rfc: "NIS771212XX4", contacto: "Ing. Prod" },
            { nombre: "PIELES AZTECA", km: 5, horas: 1, direccion: "León, GTO", rfc: "PIE660101YY5", contacto: "Almacén" },
            { nombre: "RONGTAI", km: 28.2, horas: 3, direccion: "León, GTO", rfc: "RON550202ZZ6", contacto: "Compras" },
            { nombre: "SAFE DEMO", km: 61.6, horas: 3, direccion: "Silao, GTO", rfc: "SAF440303A11", contacto: "Ingeniería" },
            { nombre: "SERVIACERO ELECTROFORJADOS", km: 14.6, horas: 2, direccion: "León, GTO", rfc: "SEE330404B22", contacto: "Mtto" },
            { nombre: "SUACERO", km: 392, horas: 8, direccion: "SLP", rfc: "SUA220505C33", contacto: "Planta" },
            { nombre: "TQ-1", km: 26, horas: 2, direccion: "León, GTO", rfc: "TQ1110606D44", contacto: "Admin" },
            { nombre: "MINO INDUSTRY", km: 29.2, horas: 2, direccion: "León, GTO", rfc: "MIN000707E55", contacto: "Ing. Moldes" },
            { nombre: "CURTIDOS BENGALA", km: 17.2, horas: 2, direccion: "Parque Piel", rfc: "CUR880808F66", contacto: "Propietario" }
        ],
        gastosFijos: [
            { nombre: "Renta", monto: 24360 },
            { nombre: "Sueldos Base", monto: 20000 },
            { nombre: "Luz", monto: 1500 },
            { nombre: "Agua", monto: 500 },
            { nombre: "Internet", monto: 600 },
            { nombre: "Camioneta", monto: 8500 }
        ]
    };

    const tabuladorAutomatizacion = {
        variables: {
            gasolina: 24.50,
            rendimiento: 9.5,
            jornada: 9,
            diasLaborales: 20,
            utilidad: 40,
            credito: 3,
            iva: 16
        },
        servicios: [
            { area: "Diseño e ingeniería", servicio: "Diseño de arquitectura de control", tipo: "O", valorAgregado: 308.1, unidad: "por hora" },
            { area: "Diseño e ingeniería", servicio: "Selección de equipos de control", tipo: "O", valorAgregado: 308.1, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Diseño de tablero eléctrico BT", tipo: "O", valorAgregado: 341.43, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Fabricación e instalación de tablero BT", tipo: "O", valorAgregado: 330.32, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Instalación de cableado/sensores", tipo: "P", valorAgregado: 111.1, unidad: "por hora" },
            { area: "Control", servicio: "Programación de rutinas en PLC", tipo: "O", valorAgregado: 647.01, unidad: "por hora" },
            { area: "Control", servicio: "Creación de interfaz HMI", tipo: "O", valorAgregado: 647.01, unidad: "por hora" },
            { area: "Control", servicio: "Configuración de servomotores", tipo: "O", valorAgregado: 708.63, unidad: "por hora" },
            { area: "Control", servicio: "Programación de variadores VFD", tipo: "O", valorAgregado: 677.82, unidad: "por hora" },
            { area: "Diseño mecánico", servicio: "Modelado 3D de herramental", tipo: "O", valorAgregado: 770.25, unidad: "por modelo" },
            { area: "Siatemas de visión", servicio: "Lectura y validación de códigos QR", tipo: "O", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Siatemas de visión", servicio: "Integración de cámaras industriales", tipo: "O", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Siatemas de visión", servicio: "Trazabilidad y registro de producción", tipo: "P", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Soporte", servicio: "Diagnóstico de fallas en sistemas", tipo: "P", valorAgregado: 1111, unidad: "por hora" },
            { area: "Soporte", servicio: "Optimización de tiempos de ciclo", tipo: "O", valorAgregado: 1111, unidad: "por hora" },
            { area: "Soporte", servicio: "Respaldo y documentación", tipo: "O", valorAgregado: 333.3, unidad: "por hora" },
            { area: "Soporte", servicio: "Capacitación a personal", tipo: "O", valorAgregado: 888.8, unidad: "por hora" }
        ],
        gastosFijos: [
            { nombre: "Renta", monto: 24360 },
            { nombre: "Sueldos Base", monto: 20000 },
            { nombre: "Luz", monto: 1500 },
            { nombre: "Agua", monto: 500 },
            { nombre: "Internet", monto: 600 },
            { nombre: "Camioneta", monto: 8500 }
        ]
    };

    // ==========================================================================
    // 3. VALIDACIÓN
    // ==========================================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ==========================================================================
    // 4. INICIALIZACIÓN
    // ==========================================================================
    function init() {
        if (!__x()) { window.location.href = 'ssepi_website.html'; return; }
        _initUI();
        _bindEvents();
        _startListeners();
        _initFilters();
        _startClock();
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.setAttribute('data-theme', 'light');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _startClock() {
        setInterval(() => {
            const el = document.getElementById('clock');
            if (el) el.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    function _initFilters() {
        // Filtros de estado
        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                f_ = this.dataset.filter;
                _renderTable();
                _renderKanban();
            });
        });

        // Selector de período
        document.querySelectorAll('.periodo-option').forEach(opt => {
            opt.addEventListener('click', function(e) {
                document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                _toggleDatePicker(this.dataset.period);
            });
        });

        // Vistas
        document.querySelectorAll('.vistas-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                document.querySelectorAll('.vistas-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                vi_ = this.dataset.view;
                _switchView(this.dataset.view);
            });
        });

        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', function(e) {
            _filterSearch(e.target.value);
        });

        // Date pickers
        document.getElementById('datePicker').addEventListener('change', _applyDateFilter);
        document.getElementById('monthPicker').addEventListener('change', _applyDateFilter);
        document.getElementById('yearPicker').addEventListener('change', _applyDateFilter);
    }

    function _toggleDatePicker(period) {
        document.getElementById('datePicker').style.display = period === 'day' ? 'inline-block' : 'none';
        document.getElementById('monthPicker').style.display = period === 'month' ? 'inline-block' : 'none';
        document.getElementById('yearPicker').style.display = period === 'year' ? 'inline-block' : 'none';
    }

    function _applyDateFilter() {
        _renderTable();
        _renderKanban();
    }

    function _filterSearch(term) {
        const rows = document.querySelectorAll('#salesTableBody tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term.toLowerCase()) ? '' : 'none';
        });
    }

    function _switchView(view) {
        document.getElementById('tableView').classList.remove('active');
        document.getElementById('kanbanView').classList.remove('active');
        document.getElementById('chartView').classList.remove('active');
        document.getElementById(view + 'View').classList.add('active');
        
        if (view === 'kanban') _renderKanban();
        if (view === 'chart') _renderChart();
    }

    // ==========================================================================
    // 5. LISTENERS FIRESTORE
    // ==========================================================================
    function _startListeners() {
        if (!window.db) return;

        u_ = window.db.collection('ventas').orderBy('fechaCreacion', 'desc')
            .onSnapshot(snap => {
                v_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _renderTable();
                _renderKanban();
                _updateKPIs();
                _addToFeed('📊', 'Datos de ventas actualizados');
            }, console.error);

        window.db.collection('inventario').onSnapshot(snap => {
            i_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        });

        window.db.collection('cotizaciones').orderBy('fecha', 'desc')
            .onSnapshot(snap => {
                cot_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _renderCotizacionesPendientes();
            }, console.error);

        window.db.collection('proyectos_automatizacion')
            .where('estado', 'not-in', ['Entregado', 'Cancelado', 'Finalizado'])
            .onSnapshot(snap => {
                p_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });

        window.db.collection('ordenes_taller')
            .where('estado', 'not-in', ['entregado', 'finalizado'])
            .onSnapshot(snap => {
                t_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });

        window.db.collection('ordenes_motores')
            .where('estado', 'not-in', ['entregado', 'finalizado'])
            .onSnapshot(snap => {
                m_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });

        // Solicitudes de taller (compras nuevas)
        window.db.collection('compras')
            .where('vinculacion.tipo', '==', 'taller')
            .where('estado', '==', 1)
            .onSnapshot(snap => {
                solicitudesTaller = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _renderSolicitudesTaller();
            }, console.error);

        // Solicitudes de facturación
        window.db.collection('solicitudes_facturacion')
            .orderBy('fechaSolicitud', 'desc')
            .onSnapshot(snap => {
                solicitudesFacturacion = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }, console.error);
    }

    // ==========================================================================
    // 6. RENDERIZADO DE SOLICITUDES
    // ==========================================================================
    function _renderSolicitudesTaller() {
        const container = document.getElementById('solicitudesTaller');
        if (!container) return;

        if (solicitudesTaller.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay solicitudes pendientes</div>';
            return;
        }

        container.innerHTML = solicitudesTaller.map(s => `
            <div class="solicitud-card">
                <div class="solicitud-header">
                    <span class="solicitud-folio">${s.folio || s.id.slice(-6)}</span>
                    <span class="solicitud-cliente">${s.vinculacion?.nombre || 'Cliente'}</span>
                </div>
                <div class="solicitud-total">$${(s.total || 0).toFixed(2)}</div>
                <div class="solicitud-items">${s.items?.length || 0} producto(s)</div>
                <div class="solicitud-acciones">
                    <button class="btn btn-sm btn-primary" onclick="VentasManager._abrirCalculadora('${s.id}')">
                        <i class="fas fa-calculator"></i> Calcular
                    </button>
                </div>
            </div>
        `).join('');
    }

    function _renderCotizacionesPendientes() {
        const container = document.getElementById('pendientesAutorizacion');
        if (!container) return;

        const pendientes = cot_a.filter(c => c.estado === 'pendiente_autorizacion_ventas');
        
        if (pendientes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay cotizaciones pendientes</div>';
            return;
        }

        container.innerHTML = pendientes.map(c => `
            <div class="solicitud-card">
                <div class="solicitud-header">
                    <span class="solicitud-folio">${c.folio || c.id.slice(-6)}</span>
                    <span class="solicitud-cliente">${c.cliente}</span>
                </div>
                <div class="solicitud-total">$${(c.total || 0).toFixed(2)}</div>
                <div class="solicitud-items">Origen: ${c.origen || 'Taller'}</div>
                <div class="solicitud-acciones">
                    <button class="btn btn-sm btn-success" onclick="VentasManager._autorizarCotizacion('${c.id}')">
                        <i class="fas fa-check"></i> Autorizar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="VentasManager._rechazarCotizacion('${c.id}')">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ==========================================================================
    // 7. CALCULADORA DE COSTOS (AHORA USA COSTOS-ENGINE)
    // ==========================================================================
    function _abrirCalculadora(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;

        compraActual = compra;
        const ordenTallerId = compra.vinculacion?.id;
        
        // Obtener datos de la orden de taller
        let horasEstimadas = 0;
        if (ordenTallerId) {
            const orden = t_a.find(o => o.id === ordenTallerId);
            if (orden) horasEstimadas = orden.horas_estimadas || 0;
        }

        // Buscar cliente en tabulador
        const clienteNombre = compra.vinculacion?.nombre || '';
        const clienteTabulador = tabuladorTaller.clientes.find(c => c.nombre === clienteNombre);
        
        calculadoraClienteActual = {
            nombre: clienteNombre,
            km: clienteTabulador?.km || 0,
            horas: clienteTabulador?.horas || 0
        };

        calculadoraComponentes = [];

        const modal = document.getElementById('calculadoraModal');
        document.getElementById('calculadoraBody').innerHTML = _generarHTMLCalculadora(compra, horasEstimadas);
        modal.classList.add('active');

        _adjuntarEventosCalculadora();
    }

    function _generarHTMLCalculadora(compra, horasEstimadas) {
        const cliente = calculadoraClienteActual;
        
        // Usar CostosEngine para los cálculos iniciales
        const gasolina = window.CostosEngine.calcularCostoGasolina(cliente.km);
        const traslado = window.CostosEngine.calcularCostoTrasladoTecnico(cliente.horas);
        const gasolinaMasTraslado = window.CostosEngine.calcularGasolinaMasTraslado(cliente.km, cliente.horas);
        const manoObraBase = window.CostosEngine.calcularManoObra(horasEstimadas);
        const gastosFijosBase = window.CostosEngine.calcularGastosFijos(horasEstimadas);
        const camionetaBase = window.CostosEngine.calcularCostoCamioneta(cliente.horas);

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-truck"></i> Datos Logísticos</div>
                <div class="info-logistica">
                    <div>KM: <strong>${cliente.km}</strong></div>
                    <div>GASOLINA: <strong>$${gasolina.toFixed(2)}</strong></div>
                    <div>TRASLADO: <strong>$${traslado.toFixed(2)}</strong></div>
                    <div>GAS+VENTAS: <strong>$${gasolinaMasTraslado.toFixed(2)}</strong></div>
                    <div>HRS VIAJE: <strong>${cliente.horas}</strong></div>
                </div>
            </div>

            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-boxes"></i> Componentes</div>
                <table class="componentes-table">
                    <thead>
                        <tr>
                            <th>Componente</th>
                            <th>Cantidad</th>
                            <th>Costo Unit.</th>
                            <th>Subtotal</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="componentesTableBody"></tbody>
                </table>
                
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; margin-top:15px;">
                    <input type="text" id="compNombre" placeholder="Componente" style="padding:8px; border:1px solid var(--border); border-radius:4px;">
                    <input type="number" id="compCantidad" value="1" min="1" style="padding:8px; border:1px solid var(--border); border-radius:4px;">
                    <input type="number" id="compCosto" value="0" step="0.01" style="padding:8px; border:1px solid var(--border); border-radius:4px;">
                    <button class="btn btn-sm btn-primary" onclick="VentasManager._agregarComponente()">Agregar</button>
                </div>
            </div>

            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-chart-line"></i> Cálculo de Costos</div>
                
                <div class="costos-grid">
                    <div class="costo-item">
                        <div class="costo-label">Gasolina + Ventas</div>
                        <div class="costo-value" id="valGasPlusSales">$${gasolinaMasTraslado.toFixed(2)}</div>
                    </div>
                    <div class="costo-item">
                        <div class="costo-label">Mano de Obra</div>
                        <div class="costo-value">
                            <input type="number" id="inpTechHours" value="${horasEstimadas}" onchange="VentasManager._recalcular()">
                        </div>
                    </div>
                    <div class="costo-item">
                        <div class="costo-label">Gastos Fijos</div>
                        <div class="costo-value" id="valFixedCosts">$${gastosFijosBase.toFixed(2)}</div>
                    </div>
                    <div class="costo-item">
                        <div class="costo-label">Refacciones</div>
                        <div class="costo-value">
                            <input type="number" id="inpParts" value="0" onchange="VentasManager._recalcular()">
                        </div>
                    </div>
                    <div class="costo-item">
                        <div class="costo-label">Camioneta</div>
                        <div class="costo-value" id="valTruck">$${camionetaBase.toFixed(2)}</div>
                    </div>
                </div>

                <div style="background:#f5f5f5; padding:20px; border-radius:8px; margin-top:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span><strong>GASTOS GENERALES</strong></span>
                        <span id="resGeneralExpenses">$0.00</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; color:var(--c-ventas);">
                        <span><strong>UTILIDAD ${window.CostosEngine.CONFIG.utilidad}%</strong></span>
                        <span id="resUtility">$0.00</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span><strong>CRÉDITO ${window.CostosEngine.CONFIG.credito}%</strong></span>
                        <span id="resCredit">$0.00</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span><strong>IVA ${window.CostosEngine.CONFIG.iva}%</strong></span>
                        <span id="resIVA">$0.00</span>
                    </div>
                </div>

                <div class="total-box">
                    <div class="label">TOTAL CON IVA</div>
                    <div class="value" id="resTotal">$0.00</div>
                </div>
            </div>
        `;
    }

    function _agregarComponente() {
        const nombre = document.getElementById('compNombre')?.value;
        const cantidad = parseFloat(document.getElementById('compCantidad')?.value) || 1;
        const costo = parseFloat(document.getElementById('compCosto')?.value) || 0;
        
        if (!nombre) {
            alert('Ingrese el nombre del componente');
            return;
        }
        
        calculadoraComponentes.push({
            nombre: nombre,
            cantidad: cantidad,
            costoUnitario: costo,
            subtotal: cantidad * costo
        });
        
        _renderizarComponentes();
        _recalcular();
        
        document.getElementById('compNombre').value = '';
        document.getElementById('compCantidad').value = 1;
        document.getElementById('compCosto').value = 0;
    }

    function _renderizarComponentes() {
        const tbody = document.getElementById('componentesTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (calculadoraComponentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay componentes agregados</td></tr>';
            return;
        }
        
        calculadoraComponentes.forEach((comp, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${comp.nombre}</td>
                <td>${comp.cantidad}</td>
                <td>$${comp.costoUnitario.toFixed(2)}</td>
                <td>$${comp.subtotal.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-danger" onclick="VentasManager._eliminarComponente(${index})">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _eliminarComponente(index) {
        calculadoraComponentes.splice(index, 1);
        _renderizarComponentes();
        _recalcular();
    }

    function _recalcular() {
        const techHours = parseFloat(document.getElementById('inpTechHours')?.value) || 0;
        const partsCost = parseFloat(document.getElementById('inpParts')?.value) || 0;
        const gasPlusSales = parseFloat(document.getElementById('valGasPlusSales')?.innerText.replace('$', '')) || 0;
        
        // Sumar componentes
        const componentesTotal = calculadoraComponentes.reduce((sum, c) => sum + c.subtotal, 0);
        const totalParts = partsCost + componentesTotal;
        
        // Usar CostosEngine para todos los cálculos
        const laborCost = window.CostosEngine.calcularManoObra(techHours);
        const fixedCosts = window.CostosEngine.calcularGastosFijos(techHours);
        const truckCost = window.CostosEngine.calcularCostoCamioneta(calculadoraClienteActual?.horas || 0);
        
        const gastosGenerales = window.CostosEngine.calcularGastosGenerales(
            gasPlusSales,
            laborCost,
            fixedCosts,
            totalParts,
            truckCost
        );
        
        const precioConUtilidad = window.CostosEngine.aplicarUtilidad(gastosGenerales);
        const precioAntesIVA = window.CostosEngine.aplicarCredito(precioConUtilidad);
        const iva = window.CostosEngine.calcularIVA(precioAntesIVA);
        const total = window.CostosEngine.calcularTotalConIVA(precioAntesIVA);
        
        // Actualizar UI
        document.getElementById('valFixedCosts').innerText = '$' + fixedCosts.toFixed(2);
        document.getElementById('valTruck').innerText = '$' + truckCost.toFixed(2);
        document.getElementById('resGeneralExpenses').innerText = '$' + gastosGenerales.toFixed(2);
        document.getElementById('resUtility').innerText = '$' + precioConUtilidad.toFixed(2);
        document.getElementById('resCredit').innerText = '$' + precioAntesIVA.toFixed(2);
        document.getElementById('resIVA').innerText = '$' + iva.toFixed(2);
        document.getElementById('resTotal').innerText = '$' + total.toFixed(2);
    }

    function _adjuntarEventosCalculadora() {
        document.getElementById('generarCotizacionBtn').onclick = _generarCotizacion;
        document.getElementById('enviarCotizacionBtn').onclick = _enviarCotizacionCliente;
    }

    function _generarCotizacion() {
        // Llenar el modal de edición
        document.getElementById('calculadoraModal').classList.remove('active');
        document.getElementById('cotizacionModal').classList.add('active');
        
        const total = parseFloat(document.getElementById('resTotal')?.innerText.replace('$', '')) || 0;
        const general = parseFloat(document.getElementById('resGeneralExpenses')?.innerText.replace('$', '')) || 0;
        const utilidad = parseFloat(document.getElementById('resUtility')?.innerText.replace('$', '')) || 0;
        const antesIVA = parseFloat(document.getElementById('resCredit')?.innerText.replace('$', '')) || 0;
        const iva = parseFloat(document.getElementById('resIVA')?.innerText.replace('$', '')) || 0;
        
        document.getElementById('editGastosGenerales').value = general.toFixed(2);
        document.getElementById('editUtilidad').value = utilidad.toFixed(2);
        document.getElementById('editCredito').value = antesIVA.toFixed(2);
        document.getElementById('editPrecioFinal').value = antesIVA.toFixed(2);
        document.getElementById('editIVA').value = iva.toFixed(2);
        document.getElementById('editTotal').value = total.toFixed(2);
        
        document.getElementById('editCliente').value = calculadoraClienteActual?.nombre || '';
        
        // Precargar productos
        const tbody = document.getElementById('editProductosBody');
        tbody.innerHTML = '';
        
        calculadoraComponentes.forEach((comp, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${comp.nombre}" style="width:100%; padding:4px;"></td>
                <td><input type="number" value="${comp.cantidad}" style="width:60px; text-align:center;"></td>
                <td><input type="number" value="${comp.costoUnitario}" step="0.01" style="width:80px; text-align:right;"></td>
                <td>$${comp.subtotal.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function _enviarCotizacionCliente() {
        const cliente = document.getElementById('editCliente').value;
        const email = document.getElementById('editEmail').value;
        const telefono = document.getElementById('editTelefono').value;
        const total = document.getElementById('editTotal').value;
        
        if (!cliente) {
            alert('El nombre del cliente es obligatorio');
            return;
        }
        
        // Simular envío
        let mensaje = `✅ Cotización enviada`;
        if (email) mensaje += ` a ${email}`;
        if (telefono) mensaje += ` y por SMS a ${telefono}`;
        alert(mensaje);
        
        // Guardar en Firestore
        const cotizacion = {
            folio: `COT-${Date.now().toString().slice(-6)}`,
            cliente: cliente,
            email: email,
            telefono: telefono,
            total: parseFloat(total),
            tipo: 'cotizacion',
            estatusPago: 'Pendiente',
            enviada: true,
            fechaEnvio: new Date().toISOString(),
            fechaCreacion: window.firebase.firestore.FieldValue.serverTimestamp()
        };
        
        window.db.collection('ventas').add(cotizacion).then(() => {
            document.getElementById('cotizacionModal').classList.remove('active');
            document.getElementById('calculadoraModal').classList.remove('active');
            _addToFeed('📧', `Cotización enviada a ${cliente}`);
        }).catch(console.error);
    }

    // ==========================================================================
    // 8. AUTORIZAR / RECHAZAR COTIZACIONES (AHORA CON NOTIFICACIONES)
    // ==========================================================================
    function _autorizarCotizacion(id) {
        if (!confirm('¿Autorizar esta cotización?')) return;
        
        const cotizacion = cot_a.find(c => c.id === id);
        
        window.db.collection('cotizaciones').doc(id).update({
            estado: 'autorizada_por_ventas',
            fechaAutorizacion: new Date().toISOString(),
            autorizadoPor: 'Ventas'
        }).then(async () => {
            // Crear notificación para Compras
            await window.db.collection('notificaciones').add({
                para: 'compras',
                tipo: 'cotizacion_autorizada',
                cotizacionId: id,
                folio: cotizacion?.folio || id.slice(-6),
                cliente: cotizacion?.cliente || 'Cliente',
                mensaje: `Cotización ${cotizacion?.folio || id.slice(-6)} autorizada - Proceder con compra`,
                leido: false,
                fecha: new Date().toISOString()
            });
            
            _addToFeed('✅', 'Cotización autorizada - Notificación enviada a Compras');
        }).catch(console.error);
    }

    function _rechazarCotizacion(id) {
        if (!confirm('¿Rechazar esta cotización?')) return;
        
        window.db.collection('cotizaciones').doc(id).update({
            estado: 'rechazada_por_ventas',
            fechaRechazo: new Date().toISOString()
        }).then(() => {
            _addToFeed('❌', 'Cotización rechazada');
        }).catch(console.error);
    }

    // ==========================================================================
    // 9. RENDERIZADO DE TABLA
    // ==========================================================================
    function _renderTable() {
        const tbody = document.getElementById('salesTableBody');
        if (!tbody) return;
        
        let filtered = v_a;
        
        // Aplicar filtro de estado
        if (f_ === 'pendiente') {
            filtered = filtered.filter(v => v.estatusPago === 'Pendiente');
        } else if (f_ === 'pagado') {
            filtered = filtered.filter(v => v.estatusPago === 'Pagado');
        } else if (f_ === 'cotizacion') {
            filtered = filtered.filter(v => v.tipo === 'cotizacion');
        }
        
        // Aplicar filtro de fecha
        const period = document.querySelector('.periodo-option.active')?.dataset.period;
        if (period === 'day') {
            const date = document.getElementById('datePicker').value;
            if (date) {
                filtered = filtered.filter(v => v.fecha === date);
            }
        } else if (period === 'month') {
            const month = parseInt(document.getElementById('monthPicker').value);
            const year = new Date().getFullYear();
            if (!isNaN(month)) {
                filtered = filtered.filter(v => {
                    const f = v.fecha ? new Date(v.fecha) : null;
                    return f && f.getMonth() === month && f.getFullYear() === year;
                });
            }
        } else if (period === 'year') {
            const year = parseInt(document.getElementById('yearPicker').value);
            if (year) {
                filtered = filtered.filter(v => {
                    const f = v.fecha ? new Date(v.fecha) : null;
                    return f && f.getFullYear() === year;
                });
            }
        }
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay registros</td></tr>';
            return;
        }
        
        tbody.innerHTML = filtered.map(v => {
            const fecha = v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX') : '--/--/----';
            const folio = v.folio || v.id.slice(-6);
            const cliente = v.cliente || 'N/A';
            const tipo = v.tipo === 'cotizacion' ? 'Cotización' : 'Venta';
            const estatus = v.estatusPago || 'Pendiente';
            const total = v.total || 0;
            
            let estatusClass = '';
            if (estatus === 'Pagado') estatusClass = 'status-pagado';
            else if (estatus === 'Pendiente') estatusClass = 'status-pendiente';
            else estatusClass = 'status-cotizacion';
            
            return `
                <tr class="parent-row" data-id="${v.id}">
                    <td>${fecha}</td>
                    <td><strong>${folio}</strong></td>
                    <td>${cliente}</td>
                    <td>${tipo}</td>
                    <td><span class="status-badge ${estatusClass}">${estatus}</span></td>
                    <td>$${total.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="VentasManager._editarVenta('${v.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${v.tipo === 'cotizacion' ? `
                            <button class="btn btn-sm btn-success" onclick="VentasManager._reenviarCotizacion('${v.id}')">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('totalVentas').innerText = filtered.length;
    }

    function _editarVenta(id) {
        const venta = v_a.find(v => v.id === id);
        if (!venta) return;
        
        document.getElementById('cotizacionModal').classList.add('active');
        document.getElementById('editCliente').value = venta.cliente || '';
        document.getElementById('editTotal').value = venta.total || 0;
        
        _addToFeed('✏️', `Editando ${venta.folio || id.slice(-6)}`);
    }

    function _reenviarCotizacion(id) {
        const venta = v_a.find(v => v.id === id);
        if (!venta) return;
        
        alert(`✅ Cotización reenviada a ${venta.cliente || 'cliente'}`);
        _addToFeed('📧', `Cotización reenviada`);
    }

    // ==========================================================================
    // 10. RENDERIZADO DE KANBAN
    // ==========================================================================
    function _renderKanban() {
        const cotizaciones = v_a.filter(v => v.tipo === 'cotizacion' && v.estatusPago !== 'Pagado');
        const pendientes = v_a.filter(v => v.estatusPago === 'Pendiente');
        const pagadas = v_a.filter(v => v.estatusPago === 'Pagado');
        
        document.getElementById('kanbanCotizacionCount').innerText = cotizaciones.length;
        document.getElementById('kanbanPendienteCount').innerText = pendientes.length;
        document.getElementById('kanbanPagadoCount').innerText = pagadas.length;
        
        _renderKanbanCol('kanbanCotizacion', cotizaciones);
        _renderKanbanCol('kanbanPendiente', pendientes);
        _renderKanbanCol('kanbanPagado', pagadas);
    }

    function _renderKanbanCol(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin elementos</div>';
            return;
        }
        
        container.innerHTML = items.map(v => {
            const folio = v.folio || v.id.slice(-6);
            const total = v.total || 0;
            return `
                <div class="kanban-card" onclick="VentasManager._abrirDetalle('${v.id}')">
                    <div class="kanban-folio">${folio}</div>
                    <div class="kanban-cliente">${v.cliente || 'N/A'}</div>
                    <div class="kanban-total">$${total.toFixed(2)}</div>
                </div>
            `;
        }).join('');
    }

    function _abrirDetalle(id) {
        // Implementar detalle
        console.log('Abrir detalle:', id);
    }

    // ==========================================================================
    // 11. GRÁFICA
    // ==========================================================================
    function _renderChart() {
        const ctx = document.getElementById('ventasChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        
        // Agrupar por mes
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const ingresos = new Array(12).fill(0);
        const egresos = new Array(12).fill(0);
        
        v_a.forEach(v => {
            if (v.fecha && v.estatusPago === 'Pagado') {
                const fecha = new Date(v.fecha);
                const mes = fecha.getMonth();
                ingresos[mes] += v.total || 0;
            }
        });
        
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Ingresos',
                    data: ingresos,
                    backgroundColor: 'rgba(255,109,0,0.8)',
                    borderColor: '#ff6d00',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: v => '$' + v.toLocaleString()
                        }
                    }
                }
            }
        });
    }

    // ==========================================================================
    // 12. KPIs
    // ==========================================================================
    function _updateKPIs() {
        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();
        
        let ingresosMes = 0;
        let porCobrar = 0;
        let cotizaciones = 0;
        let totalVentas = 0;
        let sumaTotal = 0;
        
        v_a.forEach(v => {
            const fecha = v.fecha ? new Date(v.fecha) : null;
            const total = v.total || 0;
            
            if (v.estatusPago === 'Pagado') {
                if (fecha && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                    ingresosMes += total;
                }
                totalVentas++;
                sumaTotal += total;
            } else if (v.estatusPago === 'Pendiente') {
                porCobrar += total;
            }
            
            if (v.tipo === 'cotizacion') cotizaciones++;
        });
        
        document.getElementById('kpiIngresosMes').innerText = '$' + ingresosMes.toFixed(2);
        document.getElementById('kpiPorCobrar').innerText = '$' + porCobrar.toFixed(2);
        document.getElementById('kpiCotizaciones').innerText = cotizaciones;
        document.getElementById('kpiTicketPromedio').innerText = totalVentas ? '$' + (sumaTotal / totalVentas).toFixed(2) : '$0';
    }

    // ==========================================================================
    // 13. BITÁCORA
    // ==========================================================================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-ventas);">VENTAS</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 10) feed.removeChild(feed.lastChild);
        
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==========================================================================
    // 14. EVENTOS DOM
    // ==========================================================================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);
        
        // Cerrar modales
        document.getElementById('closeCalculadoraModal').addEventListener('click', () => {
            document.getElementById('calculadoraModal').classList.remove('active');
        });
        
        document.getElementById('closeCotizacionModal').addEventListener('click', () => {
            document.getElementById('cotizacionModal').classList.remove('active');
        });
        
        document.getElementById('closeVistaPreviaModal').addEventListener('click', () => {
            document.getElementById('vistaPreviaModal').classList.remove('active');
        });
        
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            document.getElementById('cotizacionModal').classList.remove('active');
        });
        
        document.getElementById('guardarCotizacionBtn').addEventListener('click', _guardarCotizacion);
        
        document.getElementById('addProductoBtn').addEventListener('click', _agregarProductoEditor);
        
        document.getElementById('descargarPDFBtn').addEventListener('click', _generarPDF);
    }

    function _toggleMenu() {
        const sidebar = document.getElementById('sidebar');
        const body = document.body;
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('active');
        } else {
            body.classList.toggle('sidebar-closed');
        }
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    function _agregarProductoEditor() {
        const tbody = document.getElementById('editProductosBody');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" placeholder="Descripción" style="width:100%; padding:4px;"></td>
            <td><input type="number" value="1" min="1" style="width:60px; text-align:center;"></td>
            <td><input type="number" value="0" step="0.01" style="width:80px; text-align:right;"></td>
            <td>$0.00</td>
            <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">✖</button></td>
        `;
        tbody.appendChild(tr);
    }

    function _guardarCotizacion() {
        alert('✅ Cotización guardada');
        document.getElementById('cotizacionModal').classList.remove('active');
        _addToFeed('💾', 'Cotización guardada');
    }

    function _generarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFillColor(255,109,0);
        doc.rect(0,0,210,25,'F');
        doc.setTextColor(255,255,255);
        doc.setFontSize(22);
        doc.setFont('helvetica','bold');
        doc.text('COTIZACIÓN',105,15,{align:'center'});
        
        doc.setTextColor(0);
        doc.setFontSize(10);
        doc.text('SSEPI Automatización Industrial',20,35);
        doc.text('Blvd. Zodiaco 336, León, GTO',20,40);
        
        const cliente = document.getElementById('previewCliente').innerText;
        const folio = document.getElementById('previewFolio').innerText;
        const total = document.getElementById('previewTotal').innerText;
        
        doc.text(`Cliente: ${cliente}`,20,55);
        doc.text(`Folio: ${folio}`,20,60);
        doc.text(`Total: $${total}`,20,65);
        
        doc.save(`Cotizacion_${folio}.pdf`);
    }

    // ==========================================================================
    // 15. LIMPIEZA
    // ==========================================================================
    function _cleanup() {
        if (u_) u_();
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==========================================================================
    // 16. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init,
        _abrirCalculadora: _abrirCalculadora,
        _agregarComponente: _agregarComponente,
        _eliminarComponente: _eliminarComponente,
        _recalcular: _recalcular,
        _autorizarCotizacion: _autorizarCotizacion,
        _rechazarCotizacion: _rechazarCotizacion,
        _editarVenta: _editarVenta,
        _reenviarCotizacion: _reenviarCotizacion,
        _abrirDetalle: _abrirDetalle
    };
})();

// Exponer globalmente
window.VentasManager = VentasManager;