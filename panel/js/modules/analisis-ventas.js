/**
 * analisis-ventas.js — Análisis del departamento Ventas: resumen, gráficas, tabla y reporte (vista previa, imprimir, descarga PDF admin).
 */
import { createDataService } from '../core/data-service.js';

const ESTATUS = ['Pagado', 'Pendiente'];
const COLORS = ['#22c55e', '#f59e0b'];

const AnalisisVentas = (function() {
    let chartInstance = null;
    let lastVentas = [];
    let lastDesde = null;
    let lastHasta = null;
    let previewChartInstance = null;
    const ventasService = createDataService('ventas');

    function setDefaultDates() {
        const hoy = new Date();
        const hace30 = new Date(hoy);
        hace30.setDate(hace30.getDate() - 30);
        const desde = document.getElementById('filtroDesde');
        const hasta = document.getElementById('filtroHasta');
        if (desde && !desde.value) desde.value = hace30.toISOString().slice(0, 10);
        if (hasta && !hasta.value) hasta.value = hoy.toISOString().slice(0, 10);
    }

    function getFiltroFechas() {
        const desde = document.getElementById('filtroDesde');
        const hasta = document.getElementById('filtroHasta');
        const d = desde && desde.value ? new Date(desde.value + 'T00:00:00') : null;
        const h = hasta && hasta.value ? new Date(hasta.value + 'T23:59:59') : null;
        return { desde: d, hasta: h };
    }

    async function loadAll() {
        try {
            const rows = await ventasService.select();
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[AnalisisVentas] Error cargando ventas:', e);
            return [];
        }
    }

    function filterByDate(list, desde, hasta) {
        if (!desde || !hasta) return list;
        return list.filter(v => {
            const f = v.fecha ? new Date(v.fecha) : null;
            return f && f >= desde && f <= hasta;
        });
    }

    function getTotalsByEstatus(ventas) {
        const out = { Pagado: { total: 0, count: 0 }, Pendiente: { total: 0, count: 0 } };
        ventas.forEach(v => {
            const est = (v.estatus_pago || 'Pendiente') === 'Pagado' ? 'Pagado' : 'Pendiente';
            out[est].total += Number(v.total) || 0;
            out[est].count += 1;
        });
        return out;
    }

    function updateKPIs(ventas) {
        const t = getTotalsByEstatus(ventas);
        const totalPeriodo = t.Pagado.total + t.Pendiente.total;
        const cantidad = t.Pagado.count + t.Pendiente.count;
        const elTotal = document.getElementById('kpiTotalPeriodo');
        const elPagado = document.getElementById('kpiPagado');
        const elPend = document.getElementById('kpiPendiente');
        const elCant = document.getElementById('kpiCantidad');
        if (elTotal) elTotal.textContent = '$' + totalPeriodo.toLocaleString();
        if (elPagado) elPagado.textContent = '$' + t.Pagado.total.toLocaleString();
        if (elPend) elPend.textContent = '$' + t.Pendiente.total.toLocaleString();
        if (elCant) elCant.textContent = cantidad;
    }

    function updateTablaResumen(ventas) {
        const tbody = document.getElementById('tablaResumenBody');
        if (!tbody) return;
        const t = getTotalsByEstatus(ventas);
        tbody.innerHTML = `
            <tr><td>Pagado</td><td>$${t.Pagado.total.toLocaleString()}</td><td>${t.Pagado.count}</td></tr>
            <tr><td>Pendiente</td><td>$${t.Pendiente.total.toLocaleString()}</td><td>${t.Pendiente.count}</td></tr>
        `;
    }

    function updateTablaUltimas(ventas, desde, hasta) {
        const tbody = document.getElementById('tablaUltimasBody');
        if (!tbody) return;
        const filtered = filterByDate(ventas, desde, hasta);
        filtered.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
        const list = filtered.slice(0, 50);
        tbody.innerHTML = list.map(v => {
            const fecha = v.fecha ? new Date(v.fecha).toLocaleDateString() : '—';
            const est = (v.estatus_pago || 'Pendiente') === 'Pagado' ? 'Pagado' : 'Pendiente';
            const total = (Number(v.total) || 0).toLocaleString();
            return `<tr><td>${v.folio || '—'}</td><td>${(v.cliente || '').slice(0, 30)}</td><td>${fecha}</td><td>${est}</td><td>$${total}</td></tr>`;
        }).join('');
    }

    function updateChart(ventas) {
        const t = getTotalsByEstatus(ventas);
        const data = [t.Pagado.total, t.Pendiente.total];
        const canvas = document.getElementById('chartEstatus');
        if (!canvas) return;
        if (chartInstance) chartInstance.destroy();
        chartInstance = new window.Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Pagado', 'Pendiente'],
                datasets: [{ data, backgroundColor: COLORS, borderWidth: 1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    async function refresh() {
        setDefaultDates();
        const { desde, hasta } = getFiltroFechas();
        const ventas = await loadAll();
        const filtered = filterByDate(ventas, desde, hasta);
        lastVentas = ventas;
        lastDesde = desde;
        lastHasta = hasta;
        updateKPIs(filtered);
        updateTablaResumen(filtered);
        updateTablaUltimas(ventas, desde, hasta);
        updateChart(filtered);
    }

    function getReportTotals() {
        const filtered = filterByDate(lastVentas, lastDesde, lastHasta);
        return getTotalsByEstatus(filtered);
    }

    function showPreview() {
        const pre = document.getElementById('reportePreview');
        if (pre) {
            pre.classList.remove('hidden');
            pre.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function hidePreview() {
        const pre = document.getElementById('reportePreview');
        if (pre) pre.classList.add('hidden');
        const content = document.getElementById('reportePreviewContent');
        if (content) content.innerHTML = '';
        if (previewChartInstance) {
            previewChartInstance.destroy();
            previewChartInstance = null;
        }
    }

    function showPreviewGrafica() {
        const content = document.getElementById('reportePreviewContent');
        if (!content) return;
        content.innerHTML = '<canvas id="previewChartCanvas" width="400" height="280"></canvas>';
        const t = getReportTotals();
        const data = [t.Pagado.total, t.Pendiente.total];
        const canvas = document.getElementById('previewChartCanvas');
        if (previewChartInstance) previewChartInstance.destroy();
        previewChartInstance = new window.Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Pagado', 'Pendiente'],
                datasets: [{ data, backgroundColor: COLORS, borderWidth: 1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
        showPreview();
    }

    function showPreviewTabla() {
        const content = document.getElementById('reportePreviewContent');
        if (!content) return;
        const t = getReportTotals();
        content.innerHTML = `
            <table class="lista-table">
                <thead><tr><th>Estatus</th><th>Total $</th><th>Cantidad</th></tr></thead>
                <tbody>
                    <tr><td>Pagado</td><td>$${t.Pagado.total.toLocaleString()}</td><td>${t.Pagado.count}</td></tr>
                    <tr><td>Pendiente</td><td>$${t.Pendiente.total.toLocaleString()}</td><td>${t.Pendiente.count}</td></tr>
                </tbody>
            </table>
        `;
        showPreview();
    }

    function imprimirReporte() {
        const pre = document.getElementById('reportePreview');
        if (pre && !pre.classList.contains('hidden')) {
            const content = document.getElementById('reportePreviewContent');
            const ventana = window.open('', '_blank');
            ventana.document.write('<html><head><title>Reporte Análisis Ventas</title><link rel="stylesheet" href="/panel/css/main.css"></head><body style="padding:20px;">');
            ventana.document.write('<h2>Reporte Análisis Ventas</h2><p>Generado: ' + new Date().toLocaleString('es') + '</p>');
            if (content) ventana.document.write(content.innerHTML);
            ventana.document.write('</body></html>');
            ventana.document.close();
            ventana.print();
            ventana.close();
        } else {
            showPreviewTabla();
            setTimeout(() => imprimirReporte(), 300);
        }
    }

    function downloadReport() {
        const auth = window.authService;
        if (!auth) return;
        auth.getCurrentProfile().then(profile => {
            if (profile.rol !== 'admin' && profile.rol !== 'superadmin') return;
            const JsPDF = window.jspdf?.jsPDF;
            if (!JsPDF) { alert('No se puede generar PDF.'); return; }
            const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const t = getReportTotals();
            doc.setFontSize(16);
            doc.text('Reporte Análisis Ventas', 14, 20);
            doc.setFontSize(10);
            doc.text('Generado: ' + new Date().toLocaleString('es'), 14, 28);
            let y = 38;
            doc.setFontSize(11);
            doc.text('Resumen por estatus', 14, y); y += 8;
            doc.text('Pagado: $' + t.Pagado.total.toLocaleString() + ' (' + t.Pagado.count + ' ventas)', 20, y); y += 6;
            doc.text('Pendiente: $' + t.Pendiente.total.toLocaleString() + ' (' + t.Pendiente.count + ' ventas)', 20, y); y += 10;
            doc.text('Total periodo: $' + (t.Pagado.total + t.Pendiente.total).toLocaleString(), 14, y);
            doc.save('reporte-analisis-ventas-' + new Date().toISOString().slice(0, 10) + '.pdf');
        });
    }

    function setupReporteSection() {
        const btnGrafica = document.getElementById('btnPreviewGrafica');
        const btnTabla = document.getElementById('btnPreviewTabla');
        const btnImprimir = document.getElementById('btnImprimirReporte');
        const btnDescargar = document.getElementById('btnDescargarReporte');
        const btnCerrar = document.getElementById('btnCerrarPreview');
        if (btnGrafica) btnGrafica.addEventListener('click', showPreviewGrafica);
        if (btnTabla) btnTabla.addEventListener('click', showPreviewTabla);
        if (btnCerrar) btnCerrar.addEventListener('click', hidePreview);
        if (btnImprimir) btnImprimir.addEventListener('click', imprimirReporte);
        if (btnDescargar) {
            btnDescargar.addEventListener('click', downloadReport);
            window.authService.getCurrentProfile().then(profile => {
                if (profile && (profile.rol === 'admin' || profile.rol === 'superadmin')) {
                    btnDescargar.classList.remove('hidden');
                }
            }).catch(() => {});
        }
    }

    function bindEvents() {
        const toggleBtn = document.getElementById('toggleMenu');
        if (toggleBtn) toggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-closed'));
        /* #themeBtn lo gestiona theme-clock.js */
        const aplicar = document.getElementById('aplicarFiltro');
        if (aplicar) aplicar.addEventListener('click', refresh);
        setupReporteSection();
    }

    function startClock() {
        const el = document.getElementById('clock');
        if (el) {
            function tick() {
                const d = new Date();
                el.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ':' + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
            }
            tick();
            setInterval(tick, 1000);
        }
    }

    async function init() {
        setDefaultDates();
        bindEvents();
        startClock();
        await refresh();
    }

    window.analisisVentas = { init, refresh };
    return { init, refresh };
})();

export default AnalisisVentas;
