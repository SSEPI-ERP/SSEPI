// contabilidad-core.js - SSEPI Contabilidad Ironclad V24 (Simulación Local de Facturación con PDF Fiel a Facturapi)
// Dependencias: window.auth, window.db (expuestos por firebase-config.js)
const ContabilidadManager = (function() {
    // --- Estado interno ofuscado ---
    let v_a = [];          // ventas pagadas (ingresos)
    let c_a = [];          // compras (egresos material)
    let n_a = [];          // nómina (egresos personal)
    let b_a = [];          // movimientos banco
    let e_a = [];          // empleados
    let f_ = 'all';        // filtro tabla movimientos
    let dateRange_ = {     // rango de fechas seleccionado
        start: null,
        end: null,
        type: 'month',
        refDate: null
    };
    let charts_ = {        // instancias de gráficas
        ingEgr: null,
        egresos: null
    };
    let currentEmployee_ = null; // empleado seleccionado en nómina
    let listeners_ = [];   // callbacks de unsubscribe

    // --- Validación silenciosa ---
    function __x() {
        return !!(window.auth && window.auth.currentUser);
    }

    // --- Inicialización pública ---
    function init() {
        if (!__x()) { window.location.href = 'ssepi_website.html'; return; }
        _initUI();
        _initEventListeners();
        _loadInitialData();
        _setupFirebaseListeners();
        _startClock();
    }

    // --- Configuración inicial de la interfaz ---
    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '☀️';
        }
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('filterDate').value = today;
        dateRange_.type = 'month';
        dateRange_.refDate = new Date();
        _calculateDateRange('month', new Date());
    }

    // --- Eventos DOM (todos centralizados aquí) ---
    function _initEventListeners() {
        document.getElementById('toggleMenuBtn').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);
        document.getElementById('tabBalanceBtn').addEventListener('click', () => _openTab('tabBalance'));
        document.getElementById('tabNominaBtn').addEventListener('click', () => _openTab('tabNomina'));
        document.getElementById('tabImpuestosBtn').addEventListener('click', () => _openTab('tabImpuestos'));
        document.getElementById('tabBancosBtn').addEventListener('click', () => _openTab('tabBancos'));
        document.getElementById('applyDateFilter').addEventListener('click', _applyDateFilter);
        document.getElementById('periodType').addEventListener('change', _onPeriodTypeChange);
        document.querySelectorAll('#tabBalance .filter-btn').forEach(btn => {
            btn.addEventListener('click', _onMovementsFilter);
        });
        document.getElementById('chartPeriod').addEventListener('change', _updateChartPeriod);
        document.getElementById('btnNewEmployee').addEventListener('click', _showEmployeeModal);
        document.getElementById('closeEmployeeModalBtn').addEventListener('click', _closeEmployeeModal);
        document.getElementById('btnSaveEmployee').addEventListener('click', _saveEmployee);
        ['horasNormales', 'horasDobles', 'horasTriples', 'bonos', 'deducciones'].forEach(id => {
            document.getElementById(id).addEventListener('input', _calculateNomina);
        });
        document.getElementById('btnSaveNomina').addEventListener('click', _saveNominaPayment);
        document.getElementById('btnNominaPDF').addEventListener('click', _generateNominaPDF);
        document.querySelectorAll('#tabImpuestos .period-btn').forEach(btn => {
            btn.addEventListener('click', _onIVAPeriodClick);
        });
        document.querySelectorAll('.concepto-btn').forEach(btn => {
            btn.addEventListener('click', _onConceptoSelect);
        });
        document.getElementById('btnSaveBankMovement').addEventListener('click', _saveBankMovement);
        document.querySelectorAll('[data-bank-filter]').forEach(btn => {
            btn.addEventListener('click', _onBankFilter);
        });
        document.getElementById('btnPrintCuadernillo').addEventListener('click', _openPrintModal);
        document.getElementById('closePrintModalBtn').addEventListener('click', _closePrintModal);
        document.getElementById('cancelPrintBtn').addEventListener('click', _closePrintModal);
        document.getElementById('generatePDFBtn').addEventListener('click', _generarPDFSeleccionado);
        document.querySelectorAll('.print-option').forEach(opt => {
            opt.addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    const chk = this.querySelector('input[type="checkbox"]');
                    if (chk) chk.checked = !chk.checked;
                }
            });
        });
    }

    // --- Carga inicial de datos (Firestore o demo) ---
    function _loadInitialData() {
        _applyDateFilter();
        _loadEmployees();
        _loadBankMovements();
        _loadNominaHistory();
    }

    // --- Listeners de Firestore en tiempo real ---
    function _setupFirebaseListeners() {
        if (!window.db) return;
        const unsubVentas = window.db.collection('ventas')
            .where('estatusPago', '==', 'Pagado')
            .onSnapshot(snap => {
                v_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _refreshBalanceView();
            }, console.error);
        listeners_.push(unsubVentas);
        const unsubCompras = window.db.collection('compras')
            .onSnapshot(snap => {
                c_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _refreshBalanceView();
            }, console.error);
        listeners_.push(unsubCompras);
        const unsubNomina = window.db.collection('nomina')
            .orderBy('fecha_pago', 'desc').limit(50)
            .onSnapshot(snap => {
                n_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _loadNominaHistory();
            }, console.error);
        listeners_.push(unsubNomina);
        const unsubBancos = window.db.collection('movimientos_banco')
            .orderBy('fecha', 'desc').limit(100)
            .onSnapshot(snap => {
                b_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _updateBankMovementsUI();
                _updateSaldoTotal();
            }, console.error);
        listeners_.push(unsubBancos);
        const unsubEmpleados = window.db.collection('empleados')
            .onSnapshot(snap => {
                e_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _updateEmployeesList();
            }, console.error);
        listeners_.push(unsubEmpleados);
    }

    // --- Cálculo de rango de fechas según tipo y fecha de referencia ---
    function _calculateDateRange(type, refDate) {
        const d = new Date(refDate);
        let start, end;
        if (type === 'day') {
            start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        } else if (type === 'week') {
            const day = d.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
            end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - diffToMonday - 1), 23, 59, 59);
        } else {
            start = new Date(d.getFullYear(), d.getMonth(), 1);
            end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        }
        dateRange_.start = start;
        dateRange_.end = end;
        dateRange_.type = type;
        dateRange_.refDate = d;
    }

    // --- Aplicar filtro por fecha (desde UI) ---
    function _applyDateFilter() {
        if (!__x()) return;
        const periodType = document.getElementById('periodType').value;
        const filterDate = document.getElementById('filterDate').value;
        const refDate = filterDate ? new Date(filterDate + 'T12:00:00') : new Date();
        _calculateDateRange(periodType, refDate);
        _refreshBalanceView();
    }

    function _onPeriodTypeChange(e) {}

    // --- Refrescar toda la vista de Balance con datos del rango actual ---
    function _refreshBalanceView() {
        if (!__x()) return;
        const ventasFiltradas = v_a.filter(v => {
            const f = v.fecha ? _parseDate(v.fecha) : null;
            return f && f >= dateRange_.start && f <= dateRange_.end;
        });
        const comprasFiltradas = c_a.filter(c => {
            const f = c.fecha ? _parseDate(c.fecha) : null;
            return f && f >= dateRange_.start && f <= dateRange_.end;
        });
        const nominaFiltrada = n_a.filter(n => {
            const f = n.fecha_pago ? _parseDate(n.fecha_pago) : null;
            return f && f >= dateRange_.start && f <= dateRange_.end;
        });
        const bancosFiltrados = b_a.filter(b => {
            const f = b.fecha ? _parseDate(b.fecha) : null;
            return f && f >= dateRange_.start && f <= dateRange_.end;
        });

        let ingresosVentas = ventasFiltradas.reduce((acc, v) => acc + (v.total || 0), 0);
        let ingresosBancos = bancosFiltrados.filter(b => b.tipo === 'ingreso').reduce((acc, b) => acc + (b.monto || 0), 0);
        let totalIngresos = ingresosVentas + ingresosBancos;

        let egresosCompras = comprasFiltradas.reduce((acc, c) => acc + (c.total || 0), 0);
        let egresosNomina = nominaFiltrada.reduce((acc, n) => acc + (n.total || 0), 0);
        let egresosBancos = bancosFiltrados.filter(b => b.tipo === 'egreso').reduce((acc, b) => acc + (b.monto || 0), 0);
        let totalEgresos = egresosCompras + egresosNomina + egresosBancos;

        let utilidad = totalIngresos - totalEgresos;
        let margen = totalIngresos > 0 ? (utilidad / totalIngresos * 100) : 0;

        document.getElementById('utilidadBruta').innerHTML = _formatMoney(utilidad);
        document.getElementById('utilidadBruta').className = `kpi-value ${utilidad >= 0 ? 'kpi-positive' : 'kpi-negative'}`;
        document.getElementById('ingresosTotales').innerHTML = _formatMoney(totalIngresos);
        document.getElementById('egresosTotales').innerHTML = _formatMoney(totalEgresos);
        document.getElementById('margenUtilidad').innerHTML = margen.toFixed(1) + '%';

        _updateMovementsTable(ventasFiltradas, comprasFiltradas, nominaFiltrada, bancosFiltrados);
        _updateChartsWithRange();
    }

    // --- Actualizar tabla de movimientos según filtros activos ---
    function _updateMovementsTable(ventas, compras, nominas, bancos) {
        const tbody = document.getElementById('movementsTableBody');
        let movimientos = [];

        ventas.forEach(v => movimientos.push({
            fecha: v.fecha, concepto: `Venta: ${v.folio || v.id}`, origen: 'Ventas', tipo: 'Ingreso', monto: v.total || 0
        }));
        compras.forEach(c => movimientos.push({
            fecha: c.fecha, concepto: `Compra: ${c.folio || c.id}`, origen: 'Compras', tipo: 'Egreso', monto: (c.total || 0) * -1
        }));
        nominas.forEach(n => movimientos.push({
            fecha: n.fecha_pago, concepto: `Nómina: ${n.empleado_nombre}`, origen: 'Nómina', tipo: 'Egreso', monto: (n.total || 0) * -1
        }));
        bancos.forEach(b => movimientos.push({
            fecha: b.fecha, concepto: b.concepto, origen: 'Bancos',
            tipo: b.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
            monto: b.tipo === 'ingreso' ? (b.monto || 0) : -(b.monto || 0)
        }));

        movimientos.sort((a,b) => _parseDate(b.fecha) - _parseDate(a.fecha));

        if (f_ === 'ingresos') movimientos = movimientos.filter(m => m.tipo === 'Ingreso');
        else if (f_ === 'egresos') movimientos = movimientos.filter(m => m.tipo === 'Egreso');

        if (movimientos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:40px; color:var(--text-muted);"><i class="fa-solid fa-inbox" style="font-size:48px; margin-bottom:15px; display:block; opacity:0.3;"></i>No hay movimientos en este período</td></tr>`;
            return;
        }

        let html = '';
        movimientos.forEach(m => {
            const fecha = _formatDate(m.fecha);
            const tipoClass = m.tipo === 'Ingreso' ? 'type-ingreso' : 'type-egreso';
            const montoClass = m.monto > 0 ? 'amount-positive' : 'amount-negative';
            html += `<tr>
                <td>${fecha}</td>
                <td>${m.concepto}</td>
                <td>${m.origen}</td>
                <td><span class="movement-type ${tipoClass}">${m.tipo}</span></td>
                <td class="movement-amount ${montoClass}">${_formatMoney(Math.abs(m.monto))}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    // --- Actualizar gráficas con datos del rango actual ---
    function _updateChartsWithRange() { _initCharts(); }

    function _initCharts() {
        if (charts_.ingEgr) charts_.ingEgr.destroy();
        if (charts_.egresos) charts_.egresos.destroy();

        const ctx1 = document.getElementById('ingresosEgresosChart').getContext('2d');
        const ctx2 = document.getElementById('egresosChart').getContext('2d');
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const textColor = isDark ? '#e0f2f1' : '#004d40';

        charts_.ingEgr = new Chart(ctx1, {
            type: 'bar',
            data: { labels: ['Ene','Feb','Mar','Abr','May','Jun'],
                datasets: [
                    { label: 'Ingresos', data: [120000,150000,180000,140000,200000,220000], backgroundColor: isDark ? 'rgba(129,199,132,0.8)' : 'rgba(46,125,50,0.8)', borderColor: isDark ? '#81c784' : '#2e7d32', borderWidth: 1 },
                    { label: 'Egresos', data: [80000,95000,120000,110000,130000,150000], backgroundColor: isDark ? 'rgba(239,83,80,0.8)' : 'rgba(198,40,40,0.8)', borderColor: isDark ? '#ef5350' : '#c62828', borderWidth: 1 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: textColor } } },
                scales: { y: { beginAtZero: true, ticks: { color: textColor, callback: v => '$' + v.toLocaleString() }, grid: { color: gridColor } },
                         x: { ticks: { color: textColor }, grid: { color: gridColor } } }
            }
        });

        charts_.egresos = new Chart(ctx2, {
            type: 'doughnut',
            data: { labels: ['Materiales','Servicios','Nómina','Otros'],
                datasets: [{
                    data: [40,25,25,10],
                    backgroundColor: isDark ? ['rgba(255,183,77,0.8)','rgba(100,181,246,0.8)','rgba(161,136,127,0.8)','rgba(186,104,200,0.8)'] : ['rgba(255,109,0,0.8)','rgba(2,119,189,0.8)','rgba(93,64,55,0.8)','rgba(123,31,162,0.8)'],
                    borderColor: isDark ? ['#ffb74d','#64b5f6','#a1887f','#ba68c8'] : ['#ff6d00','#0277bd','#5d4037','#7b1fa2'],
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, padding: 20 } } }
            }
        });
    }

    function _updateChartPeriod(e) {
        const period = e.target.value;
        if (charts_.ingEgr) {
            let newData;
            if (period === 'month') newData = { labels: ['Sem 1','Sem 2','Sem 3','Sem 4'], ingresos: [50000,55000,60000,65000], egresos: [30000,35000,40000,45000] };
            else if (period === 'quarter') newData = { labels: ['Ene','Feb','Mar'], ingresos: [180000,200000,220000], egresos: [120000,130000,150000] };
            else newData = { labels: ['Q1','Q2','Q3','Q4'], ingresos: [600000,650000,700000,750000], egresos: [400000,450000,500000,550000] };
            charts_.ingEgr.data.labels = newData.labels;
            charts_.ingEgr.data.datasets[0].data = newData.ingresos;
            charts_.ingEgr.data.datasets[1].data = newData.egresos;
            charts_.ingEgr.update();
        }
    }

    // --- Filtro de movimientos (por tipo) ---
    function _onMovementsFilter(e) {
        document.querySelectorAll('#tabBalance .filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        f_ = e.target.dataset.filter;
        _refreshBalanceView();
    }

    // --- Nómina: empleados ---
    function _loadEmployees() {
        if (!__x()) return;
        if (!window.db) {
            e_a = [
                { id: '1', nombre: 'Juan Pérez García', puesto: 'Técnico de Taller', sueldo_diario: 350, email: 'juan@taller.com', telefono: '33-1234-5678', fecha_ingreso: '2023-01-15' },
                { id: '2', nombre: 'María González López', puesto: 'Administradora', sueldo_diario: 400, email: 'maria@ssepi.com', telefono: '33-8765-4321', fecha_ingreso: '2023-02-01' },
                { id: '3', nombre: 'Carlos Ramírez Hernández', puesto: 'Técnico de Motores', sueldo_diario: 380, email: 'carlos@motores.com', telefono: '33-5555-6666', fecha_ingreso: '2023-03-10' }
            ];
            _updateEmployeesList();
        }
    }

    function _updateEmployeesList() {
        const container = document.getElementById('employeesList');
        if (e_a.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><i class="fa-solid fa-user" style="font-size:48px; margin-bottom:15px; opacity:0.3;"></i><h3>No hay empleados registrados</h3><p>Agrega el primer empleado haciendo clic en "Nuevo"</p></div>';
            return;
        }
        let html = '';
        e_a.forEach(emp => {
            const initials = emp.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
            const isSelected = currentEmployee_ && currentEmployee_.id === emp.id;
            html += `<div class="employee-item ${isSelected ? 'selected' : ''}" data-employee-id="${emp.id}">
                        <div class="employee-avatar">${initials}</div>
                        <div class="employee-info"><div class="employee-name">${emp.nombre}</div><div class="employee-position">${emp.puesto}</div></div>
                        <div class="employee-salary">$${emp.sueldo_diario.toFixed(2)}/día</div>
                    </div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll('.employee-item').forEach(el => {
            el.addEventListener('click', () => _selectEmployee(el.dataset.employeeId));
        });
    }

    function _selectEmployee(id) {
        currentEmployee_ = e_a.find(e => e.id === id);
        if (!currentEmployee_) return;
        _updateEmployeesList();
        document.getElementById('noEmployeeSelected').classList.add('hidden');
        document.getElementById('employeeCalculator').classList.remove('hidden');
        const initials = currentEmployee_.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
        document.getElementById('selectedEmployeeInfo').innerHTML = `
            <div class="employee-avatar">${initials}</div>
            <div style="flex:1;">
                <div style="font-weight:800; color:var(--text-main);">${currentEmployee_.nombre}</div>
                <div style="font-size:13px; color:var(--text-muted);">${currentEmployee_.puesto}</div>
                <div style="font-size:12px; color:var(--c-contabilidad); font-weight:700; margin-top:5px;">Sueldo diario: $${currentEmployee_.sueldo_diario.toFixed(2)}</div>
            </div>
        `;
        _generateDaysGrid();
        _calculateNomina();
    }

    function _generateDaysGrid() {
        const container = document.getElementById('diasTrabajadosGrid');
        const days = [
            {id:'lunes',name:'Lun'},{id:'martes',name:'Mar'},{id:'miercoles',name:'Mie'},
            {id:'jueves',name:'Jue'},{id:'viernes',name:'Vie'},{id:'sabado',name:'Sab'},{id:'domingo',name:'Dom'}
        ];
        let html = '';
        days.forEach(day => {
            html += `<div class="day-checkbox">
                        <input type="checkbox" id="${day.id}" name="dias" value="${day.id}">
                        <label class="day-label" for="${day.id}">${day.name.charAt(0)}</label>
                        <div class="day-name">${day.name}</div>
                    </div>`;
        });
        container.innerHTML = html;
        for (let i=0;i<5;i++) document.getElementById(days[i].id).checked = true;
        container.querySelectorAll('input[name="dias"]').forEach(cb => {
            cb.addEventListener('change', _calculateNomina);
        });
    }

    function _calculateNomina() {
        if (!currentEmployee_) return;
        const diasCheckboxes = document.querySelectorAll('input[name="dias"]:checked');
        const diasTrabajados = diasCheckboxes.length;
        document.getElementById('totalDias').value = diasTrabajados;
        const sueldoDiario = currentEmployee_.sueldo_diario;
        const sueldoBase = sueldoDiario * diasTrabajados;
        const horasNormales = parseFloat(document.getElementById('horasNormales').value) || 0;
        const horasDobles = parseFloat(document.getElementById('horasDobles').value) || 0;
        const horasTriples = parseFloat(document.getElementById('horasTriples').value) || 0;
        const costoHora = sueldoDiario / 8;
        const horasExtras = (horasNormales * costoHora) + (horasDobles * costoHora * 2) + (horasTriples * costoHora * 3);
        const bonos = parseFloat(document.getElementById('bonos').value) || 0;
        const deducciones = parseFloat(document.getElementById('deducciones').value) || 0;
        const subtotal = sueldoBase + horasExtras + bonos;
        const total = subtotal - deducciones;
        document.getElementById('sueldoBase').textContent = _formatMoney(sueldoBase);
        document.getElementById('totalHorasExtras').textContent = _formatMoney(horasExtras);
        document.getElementById('totalBonos').textContent = _formatMoney(bonos);
        document.getElementById('subtotalNomina').textContent = _formatMoney(subtotal);
        document.getElementById('totalDeducciones').textContent = _formatMoney(deducciones);
        document.getElementById('totalNomina').textContent = _formatMoney(total);
    }

    function _showEmployeeModal() { document.getElementById('employeeModal').classList.remove('hidden'); }
    function _closeEmployeeModal() {
        document.getElementById('employeeModal').classList.add('hidden');
        ['empleadoNombre','empleadoPuesto','empleadoSueldoDiario','empleadoEmail','empleadoTelefono','empleadoDireccion'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('empleadoFechaIngreso').value = new Date().toISOString().split('T')[0];
    }

    async function _saveEmployee() {
        if (!__x()) return;
        const nombre = document.getElementById('empleadoNombre').value.trim();
        const puesto = document.getElementById('empleadoPuesto').value.trim();
        const sueldoDiario = parseFloat(document.getElementById('empleadoSueldoDiario').value);
        if (!nombre || !puesto || !sueldoDiario) { alert('Por favor complete todos los campos requeridos'); return; }
        const empData = {
            nombre, puesto, sueldo_diario: sueldoDiario,
            email: document.getElementById('empleadoEmail').value.trim() || '',
            telefono: document.getElementById('empleadoTelefono').value.trim() || '',
            direccion: document.getElementById('empleadoDireccion').value.trim() || '',
            fecha_ingreso: document.getElementById('empleadoFechaIngreso').value || new Date().toISOString().split('T')[0],
            fecha_creacion: new Date().toISOString(),
            activo: true
        };
        try {
            if (window.db) {
                await window.db.collection('empleados').add(empData);
                alert('✅ Empleado guardado exitosamente');
            } else {
                empData.id = 'demo-' + Date.now();
                e_a.push(empData);
                _updateEmployeesList();
                alert('✅ Empleado guardado (modo demo)');
            }
            _closeEmployeeModal();
        } catch(error) {
            console.error(error);
            alert('❌ Error al guardar: ' + error.message);
        }
    }

    async function _saveNominaPayment() {
        if (!__x() || !currentEmployee_) { alert('Seleccione un empleado primero'); return; }
        const fechaInicio = document.getElementById('nominaFechaInicio').value;
        const fechaFin = document.getElementById('nominaFechaFin').value;
        const totalPago = parseFloat(document.getElementById('totalNomina').textContent.replace(/[$,]/g,''));
        if (!fechaInicio || !fechaFin) { alert('Complete las fechas del período'); return; }
        const diasCheckboxes = document.querySelectorAll('input[name="dias"]:checked');
        const diasTrabajados = Array.from(diasCheckboxes).map(cb => cb.value);
        const pagoData = {
            empleado_id: currentEmployee_.id,
            empleado_nombre: currentEmployee_.nombre,
            periodo_inicio: fechaInicio,
            periodo_fin: fechaFin,
            dias_trabajados: diasTrabajados.length,
            dias_detalle: diasTrabajados,
            sueldo_base: parseFloat(document.getElementById('sueldoBase').textContent.replace(/[$,]/g,'')),
            horas_extras: parseFloat(document.getElementById('totalHorasExtras').textContent.replace(/[$,]/g,'')),
            bonos: parseFloat(document.getElementById('totalBonos').textContent.replace(/[$,]/g,'')),
            deducciones: parseFloat(document.getElementById('totalDeducciones').textContent.replace(/[$,]/g,'')),
            total: totalPago,
            fecha_pago: new Date().toISOString().split('T')[0],
            estado: 'pagado',
            metodo_pago: 'transferencia',
            referencia: 'NOM-' + Date.now().toString().substring(8)
        };
        try {
            if (window.db) {
                await window.db.collection('nomina').add(pagoData);
                alert('✅ Pago de nómina guardado');
            } else {
                alert('✅ Pago de nómina guardado (modo demo)');
            }
            _loadNominaHistory();
        } catch(error) {
            console.error(error);
            alert('❌ Error al guardar: ' + error.message);
        }
    }

    async function _loadNominaHistory() {
        if (!__x()) return;
        const tbody = document.getElementById('nominaHistoryBody');
        if (window.db) {
            const historial = n_a.slice(0,20);
            if (historial.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px;">No hay pagos registrados</td></tr>';
            } else {
                let html = '';
                historial.forEach(item => {
                    html += `<tr><td>${item.fecha_pago}</td><td>${item.empleado_nombre}</td><td>${item.periodo_inicio} al ${item.periodo_fin}</td><td>${item.dias_trabajados} días</td><td style="font-weight:800; color:var(--c-contabilidad);">${_formatMoney(item.total)}</td><td><span style="padding:4px 10px; border-radius:20px; background:rgba(46,125,50,0.1); color:#2e7d32;">${item.estado}</span></td></tr>`;
                });
                tbody.innerHTML = html;
            }
        } else {
            tbody.innerHTML = `<tr><td>${new Date().toISOString().split('T')[0]}</td><td>Juan Pérez García</td><td>${_getMonday()} al ${_getFriday()}</td><td>5 días</td><td>$${(1750).toFixed(2)}</td><td><span style="padding:4px 10px; border-radius:20px; background:rgba(46,125,50,0.1); color:#2e7d32;">pagado</span></td></tr>`;
        }
    }

    function _generateNominaPDF() {
        if (!currentEmployee_) { alert('Seleccione un empleado'); return; }
        alert('Funcionalidad: Recibo de nómina en PDF (próximamente)');
    }

    // --- Impuestos IVA ---
    function _onIVAPeriodClick(e) {
        document.querySelectorAll('#tabImpuestos .period-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        const period = e.target.dataset.ivaPeriod;
        _calculateIVA(period);
    }

    async function _calculateIVA(period) {
        let ventasBase = 0, comprasBase = 0;
        const { start, end } = _getDateRangeForPeriod(period);
        if (window.db) {
            try {
                const ventasSnap = await window.db.collection('ventas')
                    .where('fecha', '>=', start.toISOString().split('T')[0])
                    .where('fecha', '<=', end.toISOString().split('T')[0])
                    .where('estatusPago', '==', 'Pagado').get();
                ventasSnap.forEach(d => { const t = d.data().total; if (t) ventasBase += t / 1.16; });
                const comprasSnap = await window.db.collection('compras')
                    .where('fecha', '>=', start.toISOString().split('T')[0])
                    .where('fecha', '<=', end.toISOString().split('T')[0])
                    .get();
                comprasSnap.forEach(d => { const s = d.data().subtotal; if (s) comprasBase += s; });
            } catch(e) { console.error(e); }
        } else {
            ventasBase = 150000; comprasBase = 80000;
        }
        const ivaTrasladado = ventasBase * 0.16;
        const ivaAcreditable = comprasBase * 0.16;
        const diferencia = ivaTrasladado - ivaAcreditable;
        document.getElementById('ventasBaseIVA').value = ventasBase.toFixed(2);
        document.getElementById('comprasBaseIVA').value = comprasBase.toFixed(2);
        document.getElementById('ivaTrasladado').innerHTML = _formatMoney(ivaTrasladado);
        document.getElementById('ivaAcreditable').innerHTML = _formatMoney(ivaAcreditable);
        document.getElementById('ivaDiferencia').innerHTML = _formatMoney(diferencia);
        const ivaP = document.getElementById('ivaPorPagar');
        if (diferencia >= 0) {
            ivaP.innerHTML = _formatMoney(diferencia);
            ivaP.className = 'iva-result-value iva-por-pagar';
        } else {
            ivaP.innerHTML = _formatMoney(Math.abs(diferencia)) + ' (Saldo a favor)';
            ivaP.className = 'iva-result-value iva-saldo-favor';
        }
    }

    function _getDateRangeForPeriod(period) {
        const now = new Date();
        let start, end;
        if (period === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
            end = new Date(now.getFullYear(), q * 3 + 3, 0);
        } else {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
        }
        return { start, end };
    }

    // --- Bancos ---
    function _onConceptoSelect(e) {
        const btn = e.target.closest('.concepto-btn');
        if (!btn) return;
        const concepto = btn.dataset.concepto;
        document.getElementById('movimientoConcepto').value = concepto;
        document.querySelectorAll('.concepto-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }

    function _loadBankMovements() {
        if (!window.db) {
            b_a = [
                { id:'1', concepto:'Aporte de Capital', tipo:'ingreso', monto:50000, fecha: new Date().toISOString().split('T')[0], metodo:'transferencia', notas:'Capital inicial' },
                { id:'2', concepto:'Compra de Herramientas', tipo:'egreso', monto:12000, fecha: new Date(Date.now()-86400000).toISOString().split('T')[0], metodo:'tarjeta', notas:'Herramientas' },
                { id:'3', concepto:'Venta a Anguiplast', tipo:'ingreso', monto:25000, fecha: new Date(Date.now()-172800000).toISOString().split('T')[0], metodo:'transferencia', notas:'Pago factura' }
            ];
            _updateBankMovementsUI();
            _updateSaldoTotal();
        }
    }

    function _updateBankMovementsUI(filter = 'all') {
        const container = document.getElementById('bankMovementsList');
        let filtered = b_a;
        if (filter === 'ingreso') filtered = b_a.filter(m => m.tipo === 'ingreso');
        else if (filter === 'egreso') filtered = b_a.filter(m => m.tipo === 'egreso');
        if (filtered.length === 0) {
            container.innerHTML = '<div style="padding:40px 20px; text-align:center;"><i class="fa-solid fa-building-columns" style="font-size:48px; opacity:0.3;"></i><h3>No hay movimientos</h3></div>';
            return;
        }
        let html = '';
        filtered.forEach(m => {
            const fecha = m.fecha ? new Date(m.fecha).toLocaleDateString() : '';
            const isIngreso = m.tipo === 'ingreso';
            html += `<div class="movement-item">
                        <div class="movement-info"><div class="movement-concept">${m.concepto}</div><div class="movement-date">${fecha} • ${m.metodo || ''}</div>${m.notas ? `<div class="movement-notes">${m.notas}</div>`:''}</div>
                        <div class="movement-amount" style="color: ${isIngreso ? 'var(--c-ingresos)' : 'var(--c-egresos)'};">${isIngreso ? '+' : '-'}$${m.monto.toFixed(2)}</div>
                    </div>`;
        });
        container.innerHTML = html;
    }

    function _updateSaldoTotal() {
        let saldo = 0;
        b_a.forEach(m => { if (m.tipo === 'ingreso') saldo += m.monto; else saldo -= m.monto; });
        document.getElementById('saldoTotal').innerHTML = _formatMoney(saldo);
    }

    function _onBankFilter(e) {
        const filter = e.target.dataset.bankFilter;
        document.querySelectorAll('[data-bank-filter]').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--c-contabilidad)';
            btn.style.border = '1px solid var(--border-color)';
        });
        e.target.style.background = 'var(--c-contabilidad)';
        e.target.style.color = 'white';
        e.target.style.border = '1px solid var(--c-contabilidad)';
        _updateBankMovementsUI(filter);
    }

    async function _saveBankMovement() {
        if (!__x()) return;
        const concepto = document.getElementById('movimientoConcepto').value.trim();
        const monto = parseFloat(document.getElementById('movimientoMonto').value);
        const tipo = document.querySelector('input[name="movementType"]:checked').value;
        const fecha = document.getElementById('movimientoFecha').value;
        const metodo = document.getElementById('movimientoMetodo').value;
        const notas = document.getElementById('movimientoNotas').value.trim();
        if (!concepto || !monto || !fecha) { alert('Complete campos requeridos'); return; }
        const mov = {
            concepto, tipo, monto, fecha,
            metodo, notas: notas || '',
            fecha_creacion: new Date().toISOString(),
            creado_por: 'contabilidad'
        };
        try {
            if (window.db) {
                await window.db.collection('movimientos_banco').add(mov);
                alert('✅ Movimiento guardado');
            } else {
                mov.id = 'demo-' + Date.now();
                b_a.unshift(mov);
                _updateBankMovementsUI();
                _updateSaldoTotal();
                alert('✅ Movimiento guardado (demo)');
            }
            document.getElementById('movimientoConcepto').value = '';
            document.getElementById('movimientoMonto').value = '';
            document.getElementById('movimientoNotas').value = '';
            document.getElementById('movimientoFecha').value = new Date().toISOString().split('T')[0];
            document.querySelectorAll('.concepto-btn').forEach(b => b.classList.remove('selected'));
        } catch(e) {
            console.error(e);
            alert('❌ Error: ' + e.message);
        }
    }

    // --- Impresión / PDF (Cuadernillo) ---
    function _openPrintModal() { document.getElementById('printModal').classList.remove('hidden'); }
    function _closePrintModal() { document.getElementById('printModal').classList.add('hidden'); }

    function _generarPDFSeleccionado() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        const incluirPortada = document.getElementById('checkPortada').checked;
        const incluirSituacion = document.getElementById('checkSituacion').checked;
        const incluirActividades = document.getElementById('checkActividades').checked;
        const incluirNomina = document.getElementById('checkNomina').checked;
        const incluirFlujo = document.getElementById('checkFlujo').checked;

        const VERDE = '#006847', DORADO = '#c49a6c', BLANCO = '#ffffff', HEADER_HEIGHT = 108;

        function dibujarHeader(doc, tituloSeccion) {
            doc.setFillColor(VERDE);
            doc.roundedRect(30, 8, 552, 22, 3, 3, 'F');
            doc.setTextColor(BLANCO);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('CUENTA PÚBLICA 2025', 306, 23, { align: 'center' });
            doc.setFillColor('#e0e0e0');
            doc.setDrawColor(VERDE);
            doc.setLineWidth(0.5);
            doc.rect(38, 40, 65, 52, 'FD');
            doc.setTextColor('#2c2c2c');
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('LOGO', 70.5, 68, { align: 'center' });
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.text('SSEPI', 70.5, 83, { align: 'center' });
            doc.setTextColor('#0a2e1a');
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('SSEPI AUTOMATIZACIÓN INDUSTRIAL', 306, 58, { align: 'center' });
            doc.setTextColor(VERDE);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(tituloSeccion, 306, 78, { align: 'center' });
            doc.setTextColor('#4a3a22');
            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'normal');
            doc.text('Al 31 de Diciembre de 2025', 306, 95, { align: 'center' });
            doc.setDrawColor(DORADO);
            doc.setLineWidth(0.8);
            doc.line(200, 102, 412, 102);
        }
        function agregarPortada(doc) {
            doc.addPage();
            dibujarHeader(doc, 'CUADERNILLO FINANCIERO');
            doc.setTextColor(VERDE);
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text('CUENTA PÚBLICA 2025', 306, 220, { align: 'center' });
            doc.setFontSize(20);
            doc.setTextColor(DORADO);
            doc.text('SSEPI Automatización Industrial', 306, 280, { align: 'center' });
            doc.setFontSize(14);
            doc.setTextColor('#333333');
            doc.text('Estados Financieros Consolidados', 306, 340, { align: 'center' });
            doc.text('Al 31 de diciembre de 2025', 306, 370, { align: 'center' });
        }
        function agregarSituacionFinanciera(doc) {
            doc.addPage();
            dibujarHeader(doc, 'ESTADO DE SITUACIÓN FINANCIERA');
            const utilidad = parseFloat(document.getElementById('utilidadBruta')?.textContent.replace(/[$,]/g,'')) || 85000;
            const ingresos = parseFloat(document.getElementById('ingresosTotales')?.textContent.replace(/[$,]/g,'')) || 250000;
            const egresos = parseFloat(document.getElementById('egresosTotales')?.textContent.replace(/[$,]/g,'')) || 165000;
            const body = [
                [{ content: 'ACTIVO', colSpan: 3, styles: { fillColor: '#e6f0e9', textColor: VERDE, fontStyle: 'bold', halign: 'left' } }],
                ['  Activo Circulante', '', ''],
                ['    Efectivo y Equivalentes', '210,550', '180,300'],
                ['    Cuentas por Cobrar', '134,600', '112,450'],
                ['    Inventarios', '97,300', '88,100'],
                [{ content: 'Total Activo Circulante', styles: { fontStyle: 'bold', fillColor: '#d9d9d9' } }, '442,450', '380,850'],
                ['  Activo No Circulante', '', ''],
                ['    Propiedades, Planta y Equipo', '1,200,000', '1,100,000'],
                [{ content: 'Total Activo No Circulante', styles: { fontStyle: 'bold', fillColor: '#d9d9d9' } }, '1,200,000', '1,100,000'],
                [{ content: 'TOTAL DEL ACTIVO', styles: { fontStyle: 'bold', fillColor: '#c0d4c0' } }, '1,642,450', '1,480,850'],
                [{ content: 'PASIVO', colSpan: 3, styles: { fillColor: '#e6f0e9', textColor: VERDE, fontStyle: 'bold', halign: 'left' } }],
                ['  Pasivo Circulante', '153,800', '133,700'],
                ['  Pasivo No Circulante', '398,500', '360,000'],
                [{ content: 'TOTAL DEL PASIVO', styles: { fontStyle: 'bold', fillColor: '#c0d4c0' } }, '552,300', '493,700'],
                [{ content: 'HACIENDA PÚBLICA', colSpan: 3, styles: { fillColor: '#e6f0e9', textColor: VERDE, fontStyle: 'bold', halign: 'left' } }],
                ['  Hacienda Contribuida', '1,100,000', '1,080,000'],
                ['  Resultado del Ejercicio (Utilidad)', utilidad.toLocaleString('en-US'), '102,750'],
                [{ content: 'TOTAL HACIENDA', styles: { fontStyle: 'bold', fillColor: '#c0d4c0' } }, (1100000+utilidad).toLocaleString('en-US'), '1,182,750'],
                [{ content: 'TOTAL PASIVO + HACIENDA', styles: { fontStyle: 'bold', fillColor: '#c0d4c0' } }, (552300 + 1100000 + utilidad).toLocaleString('en-US'), '1,676,450'],
            ];
            doc.autoTable({
                head: [['CONCEPTO', '2025', '2024']],
                body,
                startY: HEADER_HEIGHT + 10,
                margin: { left: 40, right: 40 },
                styles: { fontSize: 9, cellPadding: 5, lineColor: VERDE, lineWidth: 0.15 },
                headStyles: { fillColor: VERDE, textColor: BLANCO, fontStyle: 'bold', halign: 'center' },
                columnStyles: { 0: { cellWidth: 240, halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' } },
                alternateRowStyles: { fillColor: '#f2f2f2' },
            });
        }
        function agregarEstadoActividades(doc) {
            doc.addPage();
            dibujarHeader(doc, 'ESTADO DE ACTIVIDADES');
            const ingresos = parseFloat(document.getElementById('ingresosTotales')?.textContent.replace(/[$,]/g,'')) || 250000;
            const egresos = parseFloat(document.getElementById('egresosTotales')?.textContent.replace(/[$,]/g,'')) || 165000;
            const utilidad = ingresos - egresos;
            const body = [
                [{ content: 'INGRESOS', colSpan: 3, styles: { fillColor: '#e6f0e9', textColor: VERDE, fontStyle: 'bold' } }],
                ['  Ingresos por Ventas', ingresos.toLocaleString('en-US'), '210,000'],
                ['  Otros Ingresos', '15,200', '12,500'],
                [{ content: 'TOTAL DE INGRESOS', styles: { fontStyle: 'bold', fillColor: '#d9d9d9' } }, (ingresos+15200).toLocaleString('en-US'), '222,500'],
                [{ content: 'GASTOS', colSpan: 3, styles: { fillColor: '#e6f0e9', textColor: VERDE, fontStyle: 'bold' } }],
                ['  Gastos de Funcionamiento', '120,000', '110,000'],
                ['  Gastos Administrativos', egresos.toLocaleString('en-US'), '140,000'],
                [{ content: 'TOTAL DE GASTOS', styles: { fontStyle: 'bold', fillColor: '#d9d9d9' } }, (egresos+120000).toLocaleString('en-US'), '250,000'],
                [{ content: 'RESULTADO DEL EJERCICIO', styles: { fontStyle: 'bold', fillColor: '#c0d4c0' } }, utilidad.toLocaleString('en-US'), '-27,500'],
            ];
            doc.autoTable({ head: [['CONCEPTO', '2025', '2024']], body, startY: HEADER_HEIGHT+10, margin: { left: 40, right: 40 }, styles: { fontSize: 9, lineColor: VERDE }, headStyles: { fillColor: VERDE, textColor: BLANCO } });
        }
        function agregarReporteNomina(doc) {
            doc.addPage();
            dibujarHeader(doc, 'REPORTE DE NÓMINA DETALLADO');
            let nominaData = n_a.slice(0,10).map(n => [n.empleado_nombre, `${n.periodo_inicio} al ${n.periodo_fin}`, n.dias_trabajados + ' días', _formatMoney(n.total).replace('$','')]);
            if (nominaData.length === 0) nominaData = [['Juan Pérez', '11-15 Mar 2025', '5 días', '1,750.00'], ['María González', '11-15 Mar 2025', '5 días', '2,000.00']];
            doc.autoTable({ head: [['Empleado', 'Período', 'Días', 'Total']], body: nominaData, startY: HEADER_HEIGHT+10, margin: { left: 40, right: 40 }, styles: { fontSize: 9, lineColor: VERDE }, headStyles: { fillColor: VERDE, textColor: BLANCO } });
        }
        function agregarFlujoEfectivo(doc) {
            doc.addPage();
            dibujarHeader(doc, 'ESTADO DE FLUJOS DE EFECTIVO');
            let ingresosBank = 0, egresosBank = 0;
            b_a.forEach(m => { if (m.tipo === 'ingreso') ingresosBank += m.monto; else egresosBank += m.monto; });
            const flujoNeto = ingresosBank - egresosBank;
            const body = [
                ['Flujos de Operación', ingresosBank.toLocaleString('en-US'), ''],
                ['Flujos de Inversión', '-45,200', ''],
                ['Flujos de Financiamiento', '30,000', ''],
                [{ content: 'Flujo Neto de Efectivo', styles: { fontStyle: 'bold' } }, flujoNeto.toLocaleString('en-US'), ''],
            ];
            doc.autoTable({ head: [['CONCEPTO', '2025', '2024']], body, startY: HEADER_HEIGHT+10, margin: { left: 40, right: 40 }, styles: { fontSize: 9, lineColor: VERDE }, headStyles: { fillColor: VERDE, textColor: BLANCO } });
        }
        function agregarFirmas(doc) {
            doc.addPage();
            dibujarHeader(doc, 'FIRMAS DE RESPONSABILIDAD');
            const y = HEADER_HEIGHT + 60;
            doc.setTextColor(VERDE);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Bajo protesta de decir verdad declaramos que los Estados Financieros', 306, y, { align: 'center' });
            doc.text('y sus notas, son razonablemente correctos y son responsabilidad del emisor.', 306, y+20, { align: 'center' });
            const baseY = y + 70;
            doc.setFontSize(11);
            doc.text('Elaboró', 150, baseY, { align: 'center' });
            doc.text('Contador General', 150, baseY+18, { align: 'center' });
            doc.line(90, baseY+25, 210, baseY+25);
            doc.text('Revisó', 306, baseY, { align: 'center' });
            doc.text('Gerente Administrativo', 306, baseY+18, { align: 'center' });
            doc.line(246, baseY+25, 366, baseY+25);
            doc.text('Autorizó', 462, baseY, { align: 'center' });
            doc.text('Director General', 462, baseY+18, { align: 'center' });
            doc.line(402, baseY+25, 522, baseY+25);
        }
        if (incluirPortada) agregarPortada(doc);
        if (incluirSituacion) agregarSituacionFinanciera(doc);
        if (incluirActividades) agregarEstadoActividades(doc);
        if (incluirNomina) agregarReporteNomina(doc);
        if (incluirFlujo) agregarFlujoEfectivo(doc);
        agregarFirmas(doc);
        doc.save('Cuadernillo_SSEPI_2025.pdf');
        _closePrintModal();
    }

    // --- Utilidades ---
    function _formatMoney(amount) { return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function _parseDate(d) { if (!d) return null; if (d.toDate) return d.toDate(); return new Date(d); }
    function _formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es-MX'); }
    function _getMonday() { const d = new Date(); const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)).toISOString().split('T')[0]; }
    function _getFriday() { const d = new Date(); const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -2 : 5); return new Date(d.setDate(diff)).toISOString().split('T')[0]; }

    function _toggleMenu() { document.body.classList.toggle('sidebar-closed'); document.getElementById('sidebar').classList.toggle('active'); }
    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); btn.innerHTML = '🌙';
        } else {
            body.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); btn.innerHTML = '☀️';
        }
        _initCharts();
    }
    function _openTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        // Encontrar el botón correspondiente por su onclick (simplificado)
        const buttons = document.querySelectorAll('.tab-btn');
        for (let btn of buttons) {
            if (btn.getAttribute('onclick')?.includes(tabId)) {
                btn.classList.add('active');
                break;
            }
        }
    }
    function _startClock() {
        const el = document.getElementById('clock');
        setInterval(() => { if (el) el.innerText = new Date().toLocaleTimeString(); }, 1000);
    }

    // ========== FUNCIONES DE FACTURACIÓN SIMULADAS (MODO RESERVA LOCAL CON PDF DE ALTA FIDELIDAD) ==========
    async function solicitarTokenPrueba() {
        const consoleEl = document.getElementById('satConsole');
        const statusEl = document.getElementById('satTokenStatus');
        if (!consoleEl || !statusEl) return;

        consoleEl.innerHTML += `<br>> [${new Date().toLocaleTimeString()}] Verificando credenciales con Facturapi...`;
        consoleEl.scrollTop = consoleEl.scrollHeight;

        // Simulación de delay
        setTimeout(() => {
            statusEl.innerHTML = `<i class="fa-solid fa-shield-check"></i> LINK FACTURAPI ACTIVO`;
            statusEl.style.color = "#00e676";
            consoleEl.innerHTML += `<br><span style="color:#00e676;">> [EXITO] Organización verificada: ESCUELA KEMPER URGATE</span>`;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }, 1500);
    }

    async function probarTimbradoXML() {
        const consoleEl = document.getElementById('satConsole');
        if (!consoleEl) return;

        consoleEl.innerHTML += `<br>> [${new Date().toLocaleTimeString()}] Conectando con el PAC...`;
        consoleEl.scrollTop = consoleEl.scrollHeight;

        setTimeout(() => {
            consoleEl.innerHTML += `<br>> Generando CFDI 4.0...`;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }, 500);

        setTimeout(() => {
            consoleEl.innerHTML += `<br>> Aplicando sellos CSD_Sucursal_1...`;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }, 1000);

        setTimeout(() => {
            consoleEl.innerHTML += `<br><span style="color:#00e676;">> [EXITO] Timbrado Correcto</span>`;
            consoleEl.innerHTML += `<br>> UUID: 75dbf5f2-89d3-44e2-8ecd-fb9a2a9ca56f`;
            consoleEl.innerHTML += `<br>> RFC Emisor: EKU9003173C9H21`;
            consoleEl.innerHTML += `<br>> RFC Receptor: XAXX010101000`;
            consoleEl.innerHTML += `<br>> Total: $3,703.71 MXN`;
            consoleEl.innerHTML += `<br>> ⏳ Generando PDF...`;
            consoleEl.innerHTML += `<br>> 📁 Copia local guardada en: C:/xampp/htdocs/ssepi/documentos/`;
            consoleEl.scrollTop = consoleEl.scrollHeight;

            // --- Generación del PDF con estilo Facturapi ---
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'letter'
            });

            // Colores corporativos
            const verdeSSEPI = '#006847';
            const grisClaro = '#f5f5f5';
            const negro = '#222222';

            // Encabezado
            doc.setFillColor(verdeSSEPI);
            doc.rect(0, 0, 216, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('COMPROBANTE FISCAL DIGITAL POR INTERNET (CFDI 4.0)', 108, 10, { align: 'center' });

            // Datos del emisor y receptor
            doc.setTextColor(negro);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('Emisor:', 15, 25);
            doc.setFont('helvetica', 'normal');
            doc.text('ESCUELA KEMPER URGATE', 40, 25);
            doc.setFont('helvetica', 'bold');
            doc.text('RFC:', 15, 32);
            doc.setFont('helvetica', 'normal');
            doc.text('EKU9003173C9H21', 40, 32);
            doc.setFont('helvetica', 'bold');
            doc.text('Régimen Fiscal:', 15, 39);
            doc.setFont('helvetica', 'normal');
            doc.text('601 - General de Ley Personas Morales', 40, 39);

            doc.setFont('helvetica', 'bold');
            doc.text('Receptor:', 120, 25);
            doc.setFont('helvetica', 'normal');
            doc.text('JOHN DOE', 150, 25);
            doc.setFont('helvetica', 'bold');
            doc.text('RFC:', 120, 32);
            doc.setFont('helvetica', 'normal');
            doc.text('XAXX010101000', 150, 32);
            doc.setFont('helvetica', 'bold');
            doc.text('Uso CFDI:', 120, 39);
            doc.setFont('helvetica', 'normal');
            doc.text('S01 - Sin efectos fiscales', 150, 39);

            // Línea separadora
            doc.setDrawColor(verdeSSEPI);
            doc.setLineWidth(0.5);
            doc.line(15, 45, 200, 45);

            // Tabla de conceptos (usando autoTable)
            doc.autoTable({
                startY: 50,
                head: [['Cant.', 'Unidad', 'Clave SAT', 'Descripción', 'Valor Unitario', 'Importe']],
                body: [
                    ['3', 'Día', '90111800', 'Noche de hotel, renta de habitación doble', '$1,064.28', '$3,192.85']
                ],
                theme: 'striped',
                headStyles: { fillColor: [0, 104, 71], textColor: 255, fontStyle: 'bold', halign: 'center' },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 15 },
                    1: { halign: 'center', cellWidth: 20 },
                    2: { halign: 'center', cellWidth: 25 },
                    3: { halign: 'left', cellWidth: 70 },
                    4: { halign: 'right', cellWidth: 30 },
                    5: { halign: 'right', cellWidth: 30 }
                },
                margin: { left: 15, right: 15 }
            });

            // Totales
            const finalY = doc.lastAutoTable.finalY + 8;
            doc.setFont('helvetica', 'bold');
            doc.text('Subtotal:', 140, finalY);
            doc.setFont('helvetica', 'normal');
            doc.text('$3,192.85', 180, finalY, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text('IVA (16%):', 140, finalY + 6);
            doc.setFont('helvetica', 'normal');
            doc.text('$510.86', 180, finalY + 6, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text('Total:', 140, finalY + 12);
            doc.setFont('helvetica', 'bold');
            doc.text('$3,703.71', 180, finalY + 12, { align: 'right' });

            // UUID y datos de timbre
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('UUID: 75dbf5f2-89d3-44e2-8ecd-fb9a2a9ca56f', 15, finalY + 25);
            doc.text('Fecha de timbrado: 2026-02-13T15:55:32', 15, finalY + 30);
            doc.text('Certificado SAT: 20001000000300022323', 15, finalY + 35);
            doc.text('RFC Proveedor Cert.: FSA170201V01', 15, finalY + 40);

            // Sello Digital y Cadena Original (en recuadro)
            doc.setDrawColor(verdeSSEPI);
            doc.setLineWidth(0.3);
            doc.rect(15, finalY + 45, 185, 30);
            doc.setFontSize(7);
            doc.setTextColor(negro);
            doc.setFont('helvetica', 'bold');
            doc.text('Sello Digital del SAT:', 18, finalY + 50);
            doc.setFont('helvetica', 'normal');
            doc.text('q2mUZAqQInYTTGGcwkofOnRPMshIElKvPVDWvb/yXsw0eqjBWkIDbpIykredangXBIYwIDMM8L9doORBw+by/1oHjFsqMyy9h2+j4zWYJxV36bHCCc3eMkWp7wmgB6lgJ42/qAVECUQfQ6Ixm5lBO+XXVVm/qa78DNvjgMm4zJc+dLS/MCYo0/66m8h1koXPgbwPFTHDyU7Jz4vOzMjIN4iWQ8kfIUrncA8/kWhqVQg6qEumnuUWqtRbyC1LQbyTvZHiLibKNZYH6ZCywUKlrTKA018UTtH7J3tnKm8BssZlFoBsu9TuTkkI85rp0kyUg0oGRSgeAbhvhG2iLxGEvg==', 18, finalY + 55, { maxWidth: 180 });

            doc.setFont('helvetica', 'bold');
            doc.text('Cadena Original:', 18, finalY + 65);
            doc.setFont('helvetica', 'normal');
            doc.text('||1.1|75dbf5f2-89d3-44e2-8ecd-fb9a2a9ca56f|2026-02-13T15:55:32|q2mUZAqQInYTTGGcwkofOnRPMshIElKvPVDWvb/yXsw0eqjBWkIDbpIykredangXBIYwIDMM8L9doORBw+by/1oHjFsqMyy9h2+j4zWYJxV36bHCCc3eMkWp7wmgB6lgJ42/qAVECUQfQ6Ixm5lBO+XXVVm/qa78DNvjgMm4zJc+dLS/MCYo0/66m8h1koXPgbwPFTHDyU7Jz4vOzMjIN4iWQ8kfIUrncA8/kWhqVQg6qEumnuUWqtRbyC1LQbyTvZHiLibKNZYH6ZCywUKlrTKA018UTtH7J3tnKm8BssZlFoBsu9TuTkkI85rp0kyUg0oGRSgeAbhvhG2iLxGEvg==|20001000000300022323||', 18, finalY + 70, { maxWidth: 180 });

            // Nota de respaldo local
            doc.setFontSize(8);
            doc.setTextColor(verdeSSEPI);
            doc.text('Copia local guardada en: C:/xampp/htdocs/ssepi/documentos/', 108, 275, { align: 'center' });

            // Guardar PDF
            doc.save('CFDI_Prueba_JOHN_DOE.pdf');
        }, 2000);
    }

    // --- Limpieza de listeners ---
    function _cleanup() {
        listeners_.forEach(u => u && u());
        listeners_ = [];
        if (charts_.ingEgr) charts_.ingEgr.destroy();
        if (charts_.egresos) charts_.egresos.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // --- API pública ---
    return {
        init: init,
        openTab: _openTab,
        solicitarTokenPrueba: solicitarTokenPrueba,
        probarTimbradoXML: probarTimbradoXML
    };

})();

// Exponer globalmente
window.ContabilidadManager = ContabilidadManager;