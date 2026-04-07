// analisis-core.js - Cerebro de Inteligencia Empresarial Ironclad V15
const AnalisisManager = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO (ofuscado)
    // ==========================================================================
    let d_v = [];           // ventas
    let d_c = [];           // compras
    let d_i = [];           // inventario
    let d_p = [];           // proyectos
    let d_t = [];           // ordenes taller
    let d_m = [];           // ordenes motores
    let d_ct = [];          // contactos
    let d_ic = [];          // ingresos_contabilidad

    let u_v = null, u_c = null, u_i = null, u_p = null, u_t = null, u_m = null, u_ct = null, u_ic = null;

    let dateRange = { start: moment().startOf('week').toDate(), end: moment().endOf('week').toDate() };
    let charts = { balance: null, gastos: null, radar: null, heatmap: null };
    let clienteKMData = []; // para heatmap

    // ==========================================================================
    // 2. VALIDACIÓN SILENCIOSA
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
        _initTheme();
        _updateFirebaseStatus();
    }

    function _initUI() {
        // Fecha por defecto: semana actual
        const now = new Date();
        document.getElementById('startDate').valueAsDate = moment(now).startOf('week').toDate();
        document.getElementById('endDate').valueAsDate = moment(now).endOf('week').toDate();
    }

    function _bindEvents() {
        // Toggle menú
        document.getElementById('toggleMenuBtn').addEventListener('click', _toggleMenu);
        // Tema
        document.getElementById('themeToggle').addEventListener('click', _toggleTheme);
        // Filtro temporal
        document.getElementById('timePreset').addEventListener('change', _onPresetChange);
        document.getElementById('applyFilterBtn').addEventListener('click', () => _aplicarFiltro());
        // Simulador
        document.getElementById('simularBtn').addEventListener('click', _simularEscenario);
        // Exportar PDF
        document.getElementById('exportPDFBtn').addEventListener('click', _exportarPDF);
    }

    function _toggleMenu() {
        document.body.classList.toggle('sidebar-closed');
    }

    function _initTheme() {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') {
            document.body.setAttribute('data-theme', 'light');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeToggle');
        if (body.getAttribute('data-theme') === 'dark') {
            body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _onPresetChange(e) {
        const val = e.target.value;
        document.getElementById('customRange').style.display = val === 'custom' ? 'flex' : 'none';
        if (val !== 'custom') _aplicarFiltro();
    }

    function _aplicarFiltro() {
        const preset = document.getElementById('timePreset').value;
        let start, end;
        const now = new Date();
        if (preset === 'today') {
            start = moment(now).startOf('day').toDate();
            end = moment(now).endOf('day').toDate();
        } else if (preset === 'week') {
            start = moment(now).startOf('week').toDate();
            end = moment(now).endOf('week').toDate();
        } else if (preset === 'month') {
            start = moment(now).startOf('month').toDate();
            end = moment(now).endOf('month').toDate();
        } else if (preset === 'year') {
            start = moment(now).startOf('year').toDate();
            end = moment(now).endOf('year').toDate();
        } else if (preset === 'custom') {
            start = document.getElementById('startDate').valueAsDate;
            end = document.getElementById('endDate').valueAsDate;
            if (!start || !end) return;
            end.setHours(23,59,59,999);
        }
        dateRange = { start, end };
        _recalcularTodo();
        document.getElementById('lastSync').innerText = moment().format('HH:mm:ss');
    }

    // ==========================================================================
    // 4. LISTENERS FIRESTORE (OPTIMIZADOS)
    // ==========================================================================
    function _startListeners() {
        if (!window.db) return;

        u_v = window.db.collection('ventas').onSnapshot(s => { d_v = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_c = window.db.collection('compras').onSnapshot(s => { d_c = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_i = window.db.collection('inventario').onSnapshot(s => { d_i = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_p = window.db.collection('proyectos_automatizacion').onSnapshot(s => { d_p = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_t = window.db.collection('ordenes_taller').onSnapshot(s => { d_t = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_m = window.db.collection('ordenes_motores').onSnapshot(s => { d_m = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_ct = window.db.collection('contactos').onSnapshot(s => { d_ct = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
        u_ic = window.db.collection('ingresos_contabilidad').onSnapshot(s => { d_ic = s.docs.map(d => ({ id: d.id, ...d.data() })); _recalcularTodo(); });
    }

    // ==========================================================================
    // 5. FILTROS POR FECHA
    // ==========================================================================
    function _filtrarPorFecha(arr, campoFecha) {
        if (!arr) return [];
        return arr.filter(item => {
            let fecha = item[campoFecha];
            if (!fecha) return false;
            if (fecha.toDate) fecha = fecha.toDate();
            else fecha = new Date(fecha);
            return fecha >= dateRange.start && fecha <= dateRange.end;
        });
    }

    // ==========================================================================
    // 6. MOTOR DE CÁLCULO PRINCIPAL
    // ==========================================================================
    function _recalcularTodo() {
        if (!dateRange.start) return;

        // ----- Ingresos reales (contabilidad + ventas pagadas en el período) -----
        const ingresosContabFiltrados = _filtrarPorFecha(d_ic, 'fecha_pago');
        const ventasPagadasFiltradas = _filtrarPorFecha(d_v.filter(v => v.estatusPago === 'Pagado'), 'fechaPago');
        const ingresosReales = [...ingresosContabFiltrados, ...ventasPagadasFiltradas]
            .reduce((s, i) => s + (i.monto_total || i.total || 0), 0);

        // ----- Egresos (compras en el período) -----
        const comprasFiltradas = _filtrarPorFecha(d_c, 'fecha');
        const egresosReales = comprasFiltradas.reduce((s, c) => s + (c.total || 0), 0);

        // ----- Saldo de caja -----
        const saldoCaja = ingresosReales - egresosReales;
        document.getElementById('kpiSaldoCaja').innerHTML = `$${saldoCaja.toLocaleString()}`;

        // ----- Valor del inventario (costo * stock) -----
        const valorInventario = d_i.reduce((s, i) => s + ((i.costo || 0) * (i.stock || 0)), 0);
        const totalProductos = d_i.reduce((s, i) => s + (i.stock || 0), 0);
        document.getElementById('valorInventario').innerHTML = `$${valorInventario.toLocaleString()}`;
        document.getElementById('totalProductos').innerHTML = totalProductos;
        document.getElementById('valorReposicion').innerHTML = `$${valorInventario.toLocaleString()}`;

        // ----- Cuentas por cobrar (ventas pendientes) -----
        const cuentasPorCobrar = d_v.filter(v => v.estatusPago === 'Pendiente').reduce((s, v) => s + (v.total || 0), 0);

        // ----- Valor del Imperio -----
        const valorImperio = saldoCaja + valorInventario + cuentasPorCobrar;
        document.getElementById('kpiValorImperio').innerHTML = `$${valorImperio.toLocaleString()}`;

        // ----- Índice de eficiencia (días promedio en taller) -----
        const ordenesTerminadas = [...d_t, ...d_m].filter(o => o.fecha_entrega && o.fecha_ingreso);
        let totalDias = 0;
        let count = 0;
        ordenesTerminadas.forEach(o => {
            const inicio = o.fecha_ingreso.toDate ? o.fecha_ingreso.toDate() : new Date(o.fecha_ingreso);
            const fin = o.fecha_entrega.toDate ? o.fecha_entrega.toDate() : new Date(o.fecha_entrega);
            const diff = (fin - inicio) / (1000 * 3600 * 24);
            if (diff > 0) { totalDias += diff; count++; }
        });
        const eficiencia = count > 0 ? (totalDias / count).toFixed(1) : 0;
        document.getElementById('kpiEficiencia').innerHTML = eficiencia;

        // ----- Proyección utilidad (base) -----
        document.getElementById('kpiProyeccionUtilidad').innerHTML = `$${(ingresosReales - egresosReales).toLocaleString()}`;

        // ----- BALANCE MENSUAL (gráfica) -----
        _renderBalanceChart();

        // ----- DOUGHNUT DE GASTOS -----
        _renderGastosDoughnut();

        // ----- RADAR DE RENDIMIENTO -----
        _renderRadar();

        // ----- MAPA DE CALOR POR CIUDAD (KM) -----
        _renderHeatmapCiudades();

        // ----- CLIENTES VIP -----
        _renderVip();

        // ----- ACTUALIZAR FIRESTATUS -----
        _updateFirebaseStatus();
    }

    // ==========================================================================
    // 7. GRÁFICAS
    // ==========================================================================
    function _renderBalanceChart() {
        const ctx = document.getElementById('balanceChart').getContext('2d');
        if (charts.balance) charts.balance.destroy();

        // Últimos 6 meses
        const labels = [];
        const ingresos = [];
        const egresos = [];
        for (let i = 5; i >= 0; i--) {
            const m = moment().subtract(i, 'month');
            labels.push(m.format('MMM'));
            const inicio = m.startOf('month').toDate();
            const fin = m.endOf('month').toDate();
            const ing = _filtrarPorFecha(d_ic, 'fecha_pago').filter(x => {
                const f = x.fecha_pago?.toDate ? x.fecha_pago.toDate() : new Date(x.fecha_pago);
                return f >= inicio && f <= fin;
            }).reduce((s, i) => s + (i.monto_total || 0), 0);
            const vtas = _filtrarPorFecha(d_v.filter(v => v.estatusPago === 'Pagado'), 'fechaPago').filter(x => {
                const f = x.fechaPago?.toDate ? x.fechaPago.toDate() : new Date(x.fechaPago);
                return f >= inicio && f <= fin;
            }).reduce((s, v) => s + (v.total || 0), 0);
            ingresos.push(ing + vtas);
            const eg = _filtrarPorFecha(d_c, 'fecha').filter(x => {
                const f = x.fecha?.toDate ? x.fecha.toDate() : new Date(x.fecha);
                return f >= inicio && f <= fin;
            }).reduce((s, c) => s + (c.total || 0), 0);
            egresos.push(eg);
        }

        charts.balance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Ingresos', data: ingresos, backgroundColor: 'rgba(46,204,113,0.8)', borderColor: '#2ecc71', borderWidth: 1 },
                    { label: 'Egresos', data: egresos, backgroundColor: 'rgba(255,94,94,0.8)', borderColor: '#ff5e5e', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    function _renderGastosDoughnut() {
        const ctx = document.getElementById('gastosDoughnutChart').getContext('2d');
        if (charts.gastos) charts.gastos.destroy();

        // Clasificar compras por categoría (basado en items o en tipo)
        let cobre = 0, refacciones = 0, gasolina = 0, nomina = 0, otros = 0;
        d_c.forEach(c => {
            if (c.items) {
                c.items.forEach(item => {
                    const desc = (item.desc || '').toLowerCase();
                    const total = (item.qty || 0) * (item.price || 0);
                    if (desc.includes('cobre') || desc.includes('alambre')) cobre += total;
                    else if (desc.includes('rodamiento') || desc.includes('balero') || desc.includes('balín')) refacciones += total;
                    else if (desc.includes('gasolina') || desc.includes('combustible')) gasolina += total;
                    else if (desc.includes('sueldo') || desc.includes('nomina')) nomina += total;
                    else otros += total;
                });
            } else {
                otros += c.total || 0;
            }
        });

        charts.gastos = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Cobre', 'Refacciones', 'Gasolina', 'Nómina', 'Otros'],
                datasets: [{
                    data: [cobre, refacciones, gasolina, nomina, otros],
                    backgroundColor: ['#b8860b', '#5dade2', '#ffb74d', '#2ecc71', '#a0aab5'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    }

    function _renderRadar() {
        const ctx = document.getElementById('radarTalleresChart').getContext('2d');
        if (charts.radar) charts.radar.destroy();

        // Calcular margen neto por taller
        const talleres = ['Electrónica', 'Motores', 'Proyectos'];
        const margenes = talleres.map(t => {
            let ventas = d_v.filter(v => v.vinculacion?.tipo === t.toLowerCase() && v.estatusPago === 'Pagado');
            let ing = ventas.reduce((s, v) => s + (v.total || 0), 0);
            let costo = 0;
            ventas.forEach(v => {
                if (v.items) v.items.forEach(item => {
                    const inv = d_i.find(i => i.sku === item.sku);
                    if (inv && inv.costo) costo += (item.qty || 0) * inv.costo;
                });
            });
            return ing > 0 ? ((ing - costo) / ing * 100).toFixed(1) : 0;
        });

        charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: talleres,
                datasets: [{
                    label: 'Margen neto %',
                    data: margenes,
                    backgroundColor: 'rgba(212,175,55,0.25)',
                    borderColor: '#d4af37',
                    borderWidth: 3,
                    pointBackgroundColor: '#d4af37'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } } }
        });
    }

    function _renderHeatmapCiudades() {
        const container = document.getElementById('heatmapCiudades');
        container.innerHTML = '';

        // Obtener clientes con dirección y calcular km desde contactos-formulas
        const ciudadMap = new Map();
        d_ct.forEach(ct => {
            const ciudad = (ct.direccion || '').split('\n').pop() || ct.pais || 'México';
            const km = window.ContactosFormulas.getKmPorCliente(ct.nombre || ct.empresa);
            if (km > 0) {
                ciudadMap.set(ciudad, (ciudadMap.get(ciudad) || 0) + km);
            }
        });

        const sorted = Array.from(ciudadMap.entries()).sort((a,b) => b[1] - a[1]).slice(0,8);
        const maxKM = sorted.length ? sorted[0][1] : 1;
        sorted.forEach(([ciudad, km]) => {
            const intensity = Math.min(km / maxKM, 1);
            const color = `rgba(212,175,55, ${intensity.toFixed(2)})`;
            container.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-weight:600;">${ciudad}</span>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="color:var(--text-muted);">${km.toFixed(1)} km</span>
                        <div style="width:100px; height:12px; background:var(--bg-elevated); border-radius:20px;">
                            <div style="width:${intensity*100}%; height:12px; background:${color}; border-radius:20px;"></div>
                        </div>
                    </div>
                </div>
            `;
        });
        document.getElementById('heatmapCiudadLabel').innerHTML = `${sorted.length} ciudades`;
    }

    function _renderVip() {
        const container = document.getElementById('vipContainer');
        container.innerHTML = '';

        // Agrupar ventas pagadas por cliente
        const ventasPagadas = d_v.filter(v => v.estatusPago === 'Pagado');
        const clienteVolumen = new Map();
        ventasPagadas.forEach(v => {
            if (v.cliente) {
                clienteVolumen.set(v.cliente, (clienteVolumen.get(v.cliente) || 0) + (v.total || 0));
            }
        });

        const sorted = Array.from(clienteVolumen.entries()).sort((a,b) => b[1] - a[1]).slice(0,5);
        sorted.forEach(([cliente, total]) => {
            container.innerHTML += `
                <div class="vip-item">
                    <span><i class="fas fa-star" style="color: var(--accent-gold);"></i> ${cliente}</span>
                    <span style="font-weight:700;">$${total.toLocaleString()}</span>
                </div>
            `;
        });
        document.getElementById('vipCount').innerHTML = sorted.length;
    }

    // ==========================================================================
    // 8. SIMULADOR DE ESCENARIOS
    // ==========================================================================
    function _simularEscenario() {
        const gastoExtra = parseFloat(document.getElementById('simuladorGasto').value) || 0;

        const ingresosReales = _filtrarPorFecha(d_ic, 'fecha_pago').reduce((s,i)=>s+(i.monto_total||0),0) +
                              _filtrarPorFecha(d_v.filter(v=>v.estatusPago==='Pagado'),'fechaPago').reduce((s,v)=>s+(v.total||0),0);
        const egresosReales = _filtrarPorFecha(d_c, 'fecha').reduce((s,c)=>s+(c.total||0),0);
        const utilidadActual = ingresosReales - egresosReales;
        const utilidadProyectada = utilidadActual - gastoExtra;
        document.getElementById('utilidadProyectada').innerHTML = `$${utilidadProyectada.toLocaleString()}`;
        document.getElementById('kpiProyeccionUtilidad').innerHTML = `$${utilidadProyectada.toLocaleString()}`;
    }

    // ==========================================================================
    // 9. EXPORTACIÓN PDF EJECUTIVO
    // ==========================================================================
    function _exportarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 40;

        doc.setFillColor(10,12,14);
        doc.rect(0,0,pageWidth,70,'F');
        doc.setTextColor(212,175,55);
        doc.setFontSize(30);
        doc.text('SSEPI - REPORTE EJECUTIVO', 40, 50);
        doc.setTextColor(240,243,245);
        doc.setFontSize(12);
        doc.text(`Generado: ${moment().format('DD/MM/YYYY HH:mm')}`, 40, 70);

        y = 90;
        doc.setTextColor(212,175,55);
        doc.setFontSize(16);
        doc.text('INDICADORES CLAVE', 40, y);
        y += 30;
        doc.setTextColor(255,255,255);
        doc.setFontSize(12);
        doc.text(`Saldo de Caja Real: $${document.getElementById('kpiSaldoCaja').innerText}`, 40, y);
        y += 20;
        doc.text(`Valor del Imperio: $${document.getElementById('kpiValorImperio').innerText}`, 40, y);
        y += 20;
        doc.text(`Índice de Eficiencia: ${document.getElementById('kpiEficiencia').innerText} días`, 40, y);
        y += 20;
        doc.text(`Valor de Inventario: $${document.getElementById('valorInventario').innerText}`, 40, y);
        y += 30;

        doc.setTextColor(212,175,55);
        doc.setFontSize(16);
        doc.text('CLIENTES VIP', 40, y);
        y += 25;
        doc.setFontSize(11);
        doc.setTextColor(200,200,200);
        const vips = document.querySelectorAll('.vip-item');
        vips.forEach(vip => {
            const texto = vip.innerText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
            doc.text(texto, 40, y);
            y += 18;
        });

        y += 20;
        doc.setTextColor(212,175,55);
        doc.setFontSize(16);
        doc.text('RESUMEN DE GASTOS', 40, y);
        y += 30;
        doc.autoTable({
            startY: y,
            head: [['Categoría', 'Monto']],
            body: [
                ['Cobre', document.getElementById('gastosDoughnutChart')?.dataset?.data?.[0] ? `$${chart.gastos?.data?.datasets?.[0]?.data?.[0]?.toLocaleString() || '0'}` : '$0'],
                ['Refacciones', document.getElementById('gastosDoughnutChart')?.dataset?.data?.[1] ? `$${chart.gastos?.data?.datasets?.[0]?.data?.[1]?.toLocaleString() || '0'}` : '$0'],
                ['Gasolina', document.getElementById('gastosDoughnutChart')?.dataset?.data?.[2] ? `$${chart.gastos?.data?.datasets?.[0]?.data?.[2]?.toLocaleString() || '0'}` : '$0'],
                ['Nómina', document.getElementById('gastosDoughnutChart')?.dataset?.data?.[3] ? `$${chart.gastos?.data?.datasets?.[0]?.data?.[3]?.toLocaleString() || '0'}` : '$0'],
                ['Otros', document.getElementById('gastosDoughnutChart')?.dataset?.data?.[4] ? `$${chart.gastos?.data?.datasets?.[0]?.data?.[4]?.toLocaleString() || '0'}` : '$0']
            ],
            theme: 'grid',
            headStyles: { fillColor: [212,175,55], textColor: [0,0,0], fontStyle: 'bold' },
            styles: { cellPadding: 8, fontSize: 10, textColor: [255,255,255], fillColor: [22,27,31] },
            alternateRowStyles: { fillColor: [30,38,43] }
        });

        doc.save(`SSEPI_Reporte_Ejecutivo_${moment().format('YYYYMMDD_HHmm')}.pdf`);
    }

    // ==========================================================================
    // 10. ESTADO FIREBASE
    // ==========================================================================
    function _updateFirebaseStatus() {
        const el = document.getElementById('firebaseStatus');
        if (el) el.innerHTML = `⚡ Conectado · ${d_v.length + d_c.length + d_i.length + d_p.length + d_t.length + d_m.length + d_ct.length + d_ic.length} docs`;
    }

    // ==========================================================================
    // 11. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init
    };
})();

window.AnalisisManager = AnalisisManager;