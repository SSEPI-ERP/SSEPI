// js/modules/analisis.js
import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { ContactosFormulas } from '../core/contactos-formulas.js';

const AnalisisModule = (function() {
    let ventas = [], compras = [], inventario = [], proyectos = [], taller = [], motores = [], contactos = [], ingresosContabilidad = [], facturas = [], movimientosInv = [];
    let dateRange = { start: moment().startOf('week').toDate(), end: moment().endOf('week').toDate() };
    let charts = { balance: null, gastos: null, radar: null };

    function _supabase() { return window.supabase; }
    let subscriptions = [];

    async function init() {
        console.log('✅ [Análisis] Conectado');
        _bindEvents();
        try {
            await _initUI();
            await _loadInitialData();
            _startClock();
            _setupRealtime();
        } catch (e) {
            console.error('[Análisis] init error:', e);
        }
        console.log('✅ Módulo análisis iniciado');
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
        const now = new Date();
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        if (startDate) startDate.valueAsDate = moment(now).startOf('week').toDate();
        if (endDate) endDate.valueAsDate = moment(now).endOf('week').toDate();
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

    async function _loadInitialData() {
        const ventasService = createDataService('ventas');
        const comprasService = createDataService('compras');
        const inventarioService = createDataService('inventario');
        const proyectosService = createDataService('proyectos_automatizacion');
        const tallerService = createDataService('ordenes_taller');
        const motoresService = createDataService('ordenes_motores');
        const contactosService = createDataService('contactos');
        const ingresosService = createDataService('ingresos_contabilidad');
        const facturasService = createDataService('facturas');

        try {
            ventas = await ventasService.select({});
        } catch (e) { console.warn('Análisis: ventas', e); ventas = []; }
        try {
            compras = await comprasService.select({});
        } catch (e) { console.warn('Análisis: compras', e); compras = []; }
        try {
            inventario = await inventarioService.select({});
        } catch (e) { console.warn('Análisis: inventario', e); inventario = []; }
        try {
            proyectos = await proyectosService.select({});
        } catch (e) { console.warn('Análisis: proyectos', e); proyectos = []; }
        try {
            taller = await tallerService.select({});
        } catch (e) { console.warn('Análisis: taller', e); taller = []; }
        try {
            motores = await motoresService.select({});
        } catch (e) { console.warn('Análisis: motores', e); motores = []; }
        try {
            contactos = await contactosService.select({});
        } catch (e) { console.warn('Análisis: contactos', e); contactos = []; }
        try {
            ingresosContabilidad = await ingresosService.select({});
        } catch (e) { console.warn('Análisis: ingresos', e); ingresosContabilidad = []; }
        try {
            facturas = await facturasService.select({});
        } catch (e) { console.warn('Análisis: facturas', e); facturas = []; }

        const supabase = _supabase();
        if (supabase) {
            try {
                const { data } = await supabase.from('movimientos_inventario').select('*').order('timestamp', { ascending: false }).limit(500);
                movimientosInv = data || [];
            } catch (e) { console.warn('Análisis: movimientos_inventario', e); movimientosInv = []; }
        }

        _recalcularTodo();
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        const tables = ['ventas','compras','inventario','proyectos_automatizacion','ordenes_taller','ordenes_motores','contactos','ingresos_contabilidad','facturas'];
        tables.forEach(table => {
            const sub = supabase
                .channel(`${table}_analisis`)
                .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                    _loadInitialData();
                })
                .subscribe();
            subscriptions.push(sub);
        });
    }

    function _bindEvents() {
        const byId = id => document.getElementById(id);
        if (byId('toggleMenu')) byId('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        if (byId('timePreset')) byId('timePreset').addEventListener('change', _onPresetChange);
        if (byId('applyFilterBtn')) byId('applyFilterBtn').addEventListener('click', _aplicarFiltro);
        if (byId('simularBtn')) byId('simularBtn').addEventListener('click', _simularEscenario);
        if (byId('exportPDFBtn')) byId('exportPDFBtn').addEventListener('click', _exportarPDF);
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
        _recalcularTodo();
    }

    function _onPresetChange(e) {
        const val = e.target.value;
        const customRange = document.getElementById('customRange');
        if (customRange) customRange.style.display = val === 'custom' ? 'flex' : 'none';
        if (val !== 'custom') _aplicarFiltro();
    }

    function _aplicarFiltro() {
        const preset = document.getElementById('timePreset')?.value;
        if (!preset) return;
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
        } else {
            return;
        }
        dateRange = { start, end };
        _recalcularTodo();
        const lastSync = document.getElementById('lastSync');
        if (lastSync) lastSync.innerText = moment().format('HH:mm:ss');
    }

    function _filtrarPorFecha(arr, campoFecha) {
        if (!arr || !dateRange.start) return arr;
        return arr.filter(item => {
            let fecha = item[campoFecha];
            if (!fecha) return false;
            fecha = new Date(fecha);
            return fecha >= dateRange.start && fecha <= dateRange.end;
        });
    }

    function _recalcularTodo() {
        if (!dateRange.start) return;

        const ingresosContabFiltrados = _filtrarPorFecha(ingresosContabilidad, 'fecha_pago');
        const ventasPagadasFiltradas = _filtrarPorFecha(ventas.filter(v => v.estatus_pago === 'Pagado'), 'fecha');
        const ingresosReales = [...ingresosContabFiltrados, ...ventasPagadasFiltradas]
            .reduce((s, i) => s + (i.monto_total || i.total || 0), 0);

        const comprasFiltradas = _filtrarPorFecha(compras, 'fecha_creacion');
        const egresosReales = comprasFiltradas.reduce((s, c) => s + (c.total || 0), 0);

        const saldoCaja = ingresosReales - egresosReales;
        const setKpi = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        setKpi('kpiSaldoCaja', '$' + saldoCaja.toLocaleString());

        const valorInventario = inventario.reduce((s, i) => s + ((i.costo || 0) * (i.stock || 0)), 0);
        const totalProductos = inventario.reduce((s, i) => s + (i.stock || 0), 0);
        setKpi('valorInventario', '$' + valorInventario.toLocaleString());
        setKpi('totalProductos', totalProductos);
        setKpi('valorReposicion', '$' + valorInventario.toLocaleString());

        const cuentasPorCobrar = ventas.filter(v => v.estatus_pago === 'Pendiente').reduce((s, v) => s + (v.total || 0), 0);
        const valorImperio = saldoCaja + valorInventario + cuentasPorCobrar;
        setKpi('kpiValorImperio', '$' + valorImperio.toLocaleString());

        const ordenesTerminadas = [...taller, ...motores].filter(o => o.fecha_entrega && o.fecha_ingreso);
        let totalDias = 0, count = 0;
        ordenesTerminadas.forEach(o => {
            const inicio = new Date(o.fecha_ingreso);
            const fin = new Date(o.fecha_entrega);
            const diff = (fin - inicio) / (1000 * 3600 * 24);
            if (diff > 0) { totalDias += diff; count++; }
        });
        const eficiencia = count > 0 ? (totalDias / count).toFixed(1) : 0;
        setKpi('kpiEficiencia', eficiencia);
        setKpi('kpiProyeccionUtilidad', '$' + (ingresosReales - egresosReales).toLocaleString());

        _renderBalanceChart();
        _renderGastosDoughnut();
        _renderRadar();
        _renderHeatmapCiudades();
        _renderVip();
    }

    function _renderBalanceChart() {
        const canvas = document.getElementById('balanceChart');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        if (charts.balance) charts.balance.destroy();

        const labels = [], ingresos = [], egresos = [];
        for (let i = 5; i >= 0; i--) {
            const m = moment().subtract(i, 'month');
            labels.push(m.format('MMM'));
            const inicio = m.startOf('month').toDate();
            const fin = m.endOf('month').toDate();

            const ing = ingresosContabilidad.filter(x => {
                const f = x.fecha_pago ? new Date(x.fecha_pago) : null;
                return f && f >= inicio && f <= fin;
            }).reduce((s, i) => s + (i.monto_total || 0), 0);
            const vtas = ventas.filter(v => v.estatus_pago === 'Pagado').filter(x => {
                const f = x.fecha ? new Date(x.fecha) : null;
                return f && f >= inicio && f <= fin;
            }).reduce((s, v) => s + (v.total || 0), 0);
            ingresos.push(ing + vtas);

            const eg = compras.filter(x => {
                const f = x.fecha_creacion ? new Date(x.fecha_creacion) : null;
                return f && f >= inicio && f <= fin;
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
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } } }
        });
    }

    function _renderGastosDoughnut() {
        const canvas = document.getElementById('gastosDoughnutChart');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        if (charts.gastos) charts.gastos.destroy();

        let cobre = 0, refacciones = 0, gasolina = 0, nomina = 0, otros = 0;
        compras.forEach(c => {
            if (c.items) {
                c.items.forEach(item => {
                    const desc = (item.desc || '').toLowerCase();
                    const total = (item.qty || 0) * (item.price || 0);
                    if (desc.includes('cobre') || desc.includes('alambre')) cobre += total;
                    else if (desc.includes('rodamiento') || desc.includes('balero')) refacciones += total;
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
        const canvas = document.getElementById('radarTalleresChart');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        if (charts.radar) charts.radar.destroy();

        const talleres = ['Electrónica', 'Motores', 'Proyectos'];
        const margenes = talleres.map(t => {
            let ventasTaller = ventas.filter(v => v.vinculacion?.tipo === t.toLowerCase() && v.estatus_pago === 'Pagado');
            let ing = ventasTaller.reduce((s, v) => s + (v.total || 0), 0);
            let costo = 0;
            ventasTaller.forEach(v => {
                if (v.items) v.items.forEach(item => {
                    const inv = inventario.find(i => i.sku === item.sku);
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
                    backgroundColor: 'rgba(0,82,204,0.25)',
                    borderColor: '#0052cc',
                    borderWidth: 3,
                    pointBackgroundColor: '#0052cc'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } } }
        });
    }

    function _renderHeatmapCiudades() {
        const container = document.getElementById('heatmapCiudades');
        if (!container) return;
        container.innerHTML = '';

        const ciudadMap = new Map();
        contactos.forEach(ct => {
            const ciudad = (ct.direccion || '').split('\n').pop() || 'México';
            const km = ContactosFormulas.getKmPorCliente(ct.nombre || ct.empresa);
            if (km > 0) {
                ciudadMap.set(ciudad, (ciudadMap.get(ciudad) || 0) + km);
            }
        });

        const sorted = Array.from(ciudadMap.entries()).sort((a,b) => b[1] - a[1]).slice(0,8);
        const maxKM = sorted.length ? sorted[0][1] : 1;
        sorted.forEach(([ciudad, km]) => {
            const intensity = Math.min(km / maxKM, 1);
            const color = `rgba(0,82,204, ${intensity.toFixed(2)})`;
            container.innerHTML += `
                <div class="heatmap-item">
                    <span class="heatmap-ciudad">${ciudad}</span>
                    <div class="heatmap-bar-container">
                        <div class="heatmap-bar" style="width:${intensity*100}%; background:${color};"></div>
                    </div>
                    <span class="heatmap-km">${km.toFixed(1)} km</span>
                </div>
            `;
        });
        const heatmapLabel = document.getElementById('heatmapCiudadLabel');
        if (heatmapLabel) heatmapLabel.innerHTML = `${sorted.length} ciudades`;
    }

    function _renderVip() {
        const container = document.getElementById('vipContainer');
        if (!container) return;
        container.innerHTML = '';

        const ventasPagadas = ventas.filter(v => v.estatus_pago === 'Pagado');
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
                    <span><i class="fas fa-star" style="color: #0052cc;"></i> ${cliente}</span>
                    <span class="vip-monto">$${total.toLocaleString()}</span>
                </div>
            `;
        });
        const vipCount = document.getElementById('vipCount');
        if (vipCount) vipCount.innerHTML = sorted.length;
    }

    function _simularEscenario() {
        const input = document.getElementById('simuladorGasto');
        const gastoExtra = parseFloat(input && input.value) || 0;
        const ingresosReales = _filtrarPorFecha(ingresosContabilidad, 'fecha_pago').reduce((s,i)=>s+(i.monto_total||0),0) +
                              _filtrarPorFecha(ventas.filter(v=>v.estatus_pago==='Pagado'),'fecha').reduce((s,v)=>s+(v.total||0),0);
        const egresosReales = _filtrarPorFecha(compras, 'fecha_creacion').reduce((s,c)=>s+(c.total||0),0);
        const utilidadActual = ingresosReales - egresosReales;
        const utilidadProyectada = utilidadActual - gastoExtra;
        document.getElementById('utilidadProyectada').innerHTML = '$' + utilidadProyectada.toLocaleString();
        document.getElementById('kpiProyeccionUtilidad').innerHTML = '$' + utilidadProyectada.toLocaleString();
    }

        const utilidadProyectada = utilidadActual - gastoExtra;
        const utilEl = document.getElementById('utilidadProyectada');
        const kpiEl = document.getElementById('kpiProyeccionUtilidad');
        if (utilEl) utilEl.innerHTML = '$' + utilidadProyectada.toLocaleString();
        if (kpiEl) kpiEl.innerHTML = '$' + utilidadProyectada.toLocaleString();
    }

    function _exportarPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('No se pudo cargar la librería PDF. Recarga la página e intenta de nuevo.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        const pageW = doc.internal.pageSize.getWidth();
        let y = 20;

        doc.setFillColor(0, 82, 204);
        doc.rect(0, 0, pageW, 70, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text('SSEPI - REPORTE EJECUTIVO', 40, 45);
        doc.setFontSize(11);
        doc.text('Análisis contable y consumible por departamento', 40, 60);
        doc.text(`Generado: ${moment().format('DD/MM/YYYY HH:mm')}`, pageW - 150, 60);
        y = 90;

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.text('1. Resumen ejecutivo', 40, y);
        y += 20;

        const ingresosContabF = _filtrarPorFecha(ingresosContabilidad, 'fecha_pago');
        const ventasPagadasF = _filtrarPorFecha(ventas.filter(v => v.estatus_pago === 'Pagado'), 'fecha');
        const ingresosReales = [...ingresosContabF, ...ventasPagadasF].reduce((s, i) => s + (i.monto_total || i.total || 0), 0);
        const comprasF = _filtrarPorFecha(compras, 'fecha_creacion');
        const egresosReales = comprasF.reduce((s, c) => s + (c.total || 0), 0);
        const saldoCaja = ingresosReales - egresosReales;
        const valorInv = inventario.reduce((s, i) => s + ((i.costo || 0) * (i.stock || 0)), 0);
        const cxc = ventas.filter(v => v.estatus_pago === 'Pendiente').reduce((s, v) => s + (v.total || 0), 0);

        const resumen = [
            ['Saldo de caja (período)', '$' + saldoCaja.toLocaleString()],
            ['Ingresos (período)', '$' + ingresosReales.toLocaleString()],
            ['Egresos (período)', '$' + egresosReales.toLocaleString()],
            ['Valor inventario', '$' + valorInv.toLocaleString()],
            ['Cuentas por cobrar', '$' + cxc.toLocaleString()],
            ['Valor total (caja+inv+cxc)', '$' + (saldoCaja + valorInv + cxc).toLocaleString()]
        ];
        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                startY: y,
                head: [['Indicador', 'Valor']],
                body: resumen,
                theme: 'grid',
                margin: { left: 40 }
            });
            y = doc.lastAutoTable.finalY + 20;
        } else {
            resumen.forEach(([k, v]) => {
                doc.setFontSize(10);
                doc.text(`${k}: ${v}`, 40, y);
                y += 14;
            });
            y += 10;
        }

        doc.setFontSize(14);
        doc.text('2. Movimientos por departamento', 40, y);
        y += 22;

        const deptos = [
            { nombre: 'Ventas', datos: _filtrarPorFecha(ventas, 'fecha'), total: (arr) => arr.reduce((s, v) => s + (v.total || 0), 0), cols: ['Folio', 'Cliente', 'Total', 'Fecha'] },
            { nombre: 'Compras', datos: comprasF, total: (arr) => arr.reduce((s, c) => s + (c.total || 0), 0), cols: ['Folio', 'Proveedor', 'Total', 'Fecha'] },
            { nombre: 'Taller (órdenes)', datos: _filtrarPorFecha(taller, 'fecha_ingreso'), total: () => 0, cols: ['Folio', 'Estado', 'Fecha ingreso'] },
            { nombre: 'Motores (órdenes)', datos: _filtrarPorFecha(motores, 'fecha_ingreso'), total: () => 0, cols: ['Folio', 'Estado', 'Fecha ingreso'] },
            { nombre: 'Automatización (proyectos)', datos: _filtrarPorFecha(proyectos, 'fecha'), total: () => 0, cols: ['Folio', 'Cliente', 'Estado'] },
            { nombre: 'Contabilidad (ingresos)', datos: ingresosContabF, total: (arr) => arr.reduce((s, i) => s + (i.monto_total || 0), 0), cols: ['Concepto', 'Monto', 'Fecha'] }
        ];

        deptos.forEach(depto => {
            if (y > 240) {
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(11);
            doc.setTextColor(0, 82, 204);
            doc.text(depto.nombre, 40, y);
            y += 14;
            doc.setTextColor(0, 0, 0);
            const totalDepto = depto.total(depto.datos);
            if (totalDepto > 0) {
                doc.setFontSize(10);
                doc.text(`Total período: $${totalDepto.toLocaleString()}`, 40, y);
                y += 12;
            }
            const filas = depto.datos.slice(0, 15).map(item => {
                if (depto.nombre === 'Ventas') return [item.folio || '-', (item.cliente || '').substring(0, 25), '$' + (item.total || 0).toLocaleString(), item.fecha ? moment(item.fecha).format('DD/MM/YY') : ''];
                if (depto.nombre === 'Compras') return [item.folio || '-', (item.proveedor || item.vinculacion?.nombre || '-').substring(0, 25), '$' + (item.total || 0).toLocaleString(), item.fecha_creacion ? moment(item.fecha_creacion).format('DD/MM/YY') : ''];
                if (depto.nombre === 'Taller (órdenes)') return [item.folio || '-', item.estado || '-', item.fecha_ingreso ? moment(item.fecha_ingreso).format('DD/MM/YY') : ''];
                if (depto.nombre === 'Motores (órdenes)') return [item.folio || '-', item.estado || '-', item.fecha_ingreso ? moment(item.fecha_ingreso).format('DD/MM/YY') : ''];
                if (depto.nombre === 'Automatización (proyectos)') return [item.folio || '-', (item.cliente || '').substring(0, 25), item.estado || '-'];
                if (depto.nombre === 'Contabilidad (ingresos)') return [(item.concepto || '-').substring(0, 30), '$' + (item.monto_total || 0).toLocaleString(), item.fecha_pago ? moment(item.fecha_pago).format('DD/MM/YY') : ''];
                return [];
            }).filter(r => r.length);
            if (filas.length && typeof doc.autoTable === 'function') {
                doc.autoTable({
                    startY: y,
                    head: [depto.cols],
                    body: filas,
                    theme: 'striped',
                    margin: { left: 40 },
                    fontSize: 8
                });
                y = doc.lastAutoTable.finalY + 16;
            } else if (filas.length) {
                filas.forEach(fila => {
                    doc.setFontSize(8);
                    doc.text(fila.join(' | '), 40, y);
                    y += 10;
                });
                y += 8;
            } else {
                doc.setFontSize(9);
                doc.text('Sin movimientos en el período.', 45, y);
                y += 14;
            }
        });

        if (movimientosInv.length > 0 && y < 260) {
            if (y > 220) {
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(11);
            doc.setTextColor(0, 82, 204);
            doc.text('Inventario (últimos movimientos)', 40, y);
            y += 16;
            doc.setTextColor(0, 0, 0);
            const bodyMov = movimientosInv.slice(0, 20).map(m => [
                m.sku || '-',
                m.tipo || '-',
                m.direccion || '-',
                (m.cantidad || 0).toString(),
                m.timestamp ? moment(m.timestamp).format('DD/MM/YY HH:mm') : ''
            ]);
            if (typeof doc.autoTable === 'function') {
                doc.autoTable({
                    startY: y,
                    head: [['SKU', 'Tipo', 'Dirección', 'Cantidad', 'Fecha']],
                    body: bodyMov,
                    theme: 'striped',
                    margin: { left: 40 },
                    fontSize: 7
                });
            }
        }

        doc.save(`SSEPI_Reporte_Ejecutivo_${moment().format('YYYYMMDD_HHmm')}.pdf`);
    }

    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        Object.values(charts).forEach(c => c && c.destroy());
    }
    window.addEventListener('beforeunload', _cleanup);

    return { init };
})();

window.analisisModule = AnalisisModule;