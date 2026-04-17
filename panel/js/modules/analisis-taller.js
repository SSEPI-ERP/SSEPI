/**
 * analisis-taller.js — Módulo de Análisis Laboratorio (órdenes reparadas, entregadas, por estado).
 * Solo visible para rol con permiso ordenes_taller (taller + admin).
 */
import { createDataService } from '../core/data-service.js';

const ESTADOS = ['Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado', 'Facturado'];
const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#ef4444'];

const AnalisisTaller = (function() {
    let chartInstance = null;
    let lastOrdenes = [];
    let lastDesde = null;
    let lastHasta = null;
    let previewChartInstance = null;
    const ordenesService = createDataService('ordenes_taller');

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
            const rows = await ordenesService.select();
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[AnalisisTaller] Error cargando órdenes:', e);
            return [];
        }
    }

    function updateKPIs(ordenes) {
        const counts = {};
        ESTADOS.forEach(est => { counts[est] = 0; });
        let sinReparacion = 0;
        ordenes.forEach(o => {
            if (o.estado && counts.hasOwnProperty(o.estado)) counts[o.estado]++;
            if (o.sin_reparacion) sinReparacion++;
        });
        ESTADOS.forEach(est => {
            const id = 'kpi' + est.replace(/\s/g, '');
            const el = document.getElementById(id);
            if (el) el.textContent = counts[est] || 0;
        });
        const elSin = document.getElementById('kpiSinReparacion');
        if (elSin) elSin.textContent = sinReparacion;
    }

    function updateTablaResumen(ordenes, desde, hasta) {
        const tbody = document.getElementById('tablaResumenBody');
        if (!tbody) return;
        let filtered = ordenes;
        if (desde && hasta) {
            filtered = ordenes.filter(o => {
                const f = o.fecha_ingreso ? new Date(o.fecha_ingreso) : null;
                return f && f >= desde && f <= hasta;
            });
        }
        const counts = {};
        ESTADOS.forEach(est => { counts[est] = 0; });
        filtered.forEach(o => {
            if (o.estado && counts.hasOwnProperty(o.estado)) counts[o.estado]++;
        });
        tbody.innerHTML = ESTADOS.map(est => `
            <tr><td>${est}</td><td>${counts[est] || 0}</td></tr>
        `).join('');
    }

    function updateTablaUltimas(ordenes, desde, hasta) {
        const tbody = document.getElementById('tablaUltimasBody');
        if (!tbody) return;
        const reparadoEntregado = ordenes.filter(o =>
            o.estado === 'Reparado' || o.estado === 'Entregado' || o.estado === 'Facturado'
        );
        let filtered = reparadoEntregado;
        if (desde && hasta) {
            filtered = reparadoEntregado.filter(o => {
                const f = o.fecha_reparacion || o.fecha_entrega || o.fecha_ingreso;
                const d = f ? new Date(f) : null;
                return d && d >= desde && d <= hasta;
            });
        }
        filtered.sort((a, b) => {
            const da = new Date(a.fecha_entrega || a.fecha_reparacion || a.fecha_ingreso || 0);
            const db = new Date(b.fecha_entrega || b.fecha_reparacion || b.fecha_ingreso || 0);
            return db - da;
        });
        const list = filtered.slice(0, 50);
        tbody.innerHTML = list.map(o => {
            const fr = o.fecha_reparacion ? new Date(o.fecha_reparacion).toLocaleDateString() : '—';
            const fe = o.fecha_entrega ? new Date(o.fecha_entrega).toLocaleDateString() : '—';
            return `<tr>
                <td>${o.folio || '—'}</td>
                <td>${(o.cliente_nombre || '').slice(0, 30)}</td>
                <td>${(o.equipo || '').slice(0, 25)}</td>
                <td>${o.estado || '—'}</td>
                <td>${fr}</td>
                <td>${fe}</td>
            </tr>`;
        }).join('');
    }

    function updateChart(ordenes) {
        const counts = {};
        ESTADOS.forEach(est => { counts[est] = 0; });
        ordenes.forEach(o => {
            if (o.estado && counts.hasOwnProperty(o.estado)) counts[o.estado]++;
        });
        const data = ESTADOS.map(est => counts[est] || 0);
        const canvas = document.getElementById('chartEstados');
        if (!canvas) return;
        if (chartInstance) chartInstance.destroy();
        chartInstance = new window.Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ESTADOS,
                datasets: [{ data, backgroundColor: COLORS, borderWidth: 1 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    async function refresh() {
        setDefaultDates();
        const { desde, hasta } = getFiltroFechas();
        const ordenes = await loadAll();
        lastOrdenes = ordenes;
        lastDesde = desde;
        lastHasta = hasta;
        updateKPIs(ordenes);
        updateTablaResumen(ordenes, desde, hasta);
        updateTablaUltimas(ordenes, desde, hasta);
        updateChart(ordenes);
    }

    function getReportCounts(ordenes, desde, hasta) {
        let list = ordenes;
        if (desde && hasta) {
            list = ordenes.filter(o => {
                const f = o.fecha_ingreso ? new Date(o.fecha_ingreso) : null;
                return f && f >= desde && f <= hasta;
            });
        }
        const counts = {};
        ESTADOS.forEach(est => { counts[est] = 0; });
        list.forEach(o => {
            if (o.estado && counts.hasOwnProperty(o.estado)) counts[o.estado]++;
        });
        return counts;
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

    /** Vista previa del reporte = mismo contenido que el PDF / impresión (solo módulo Laboratorio). */
    function showPreviewReporte() {
        const content = document.getElementById('reportePreviewContent');
        if (!content) return;
        const counts = getReportCounts(lastOrdenes, lastDesde, lastHasta);
        const desdeStr = lastDesde ? lastDesde.toLocaleDateString('es') : '—';
        const hastaStr = lastHasta ? lastHasta.toLocaleDateString('es') : '—';
        const rows = ESTADOS.map(est => `<tr><td>${est}</td><td>${counts[est] || 0}</td></tr>`).join('');
        content.innerHTML = `
            <div class="reporte-preview-pdf">
                <h2>Reporte Análisis Laboratorio</h2>
                <p><strong>Generado:</strong> ${new Date().toLocaleString('es')}</p>
                <p><strong>Periodo:</strong> ${desdeStr} — ${hastaStr}</p>
                <p><strong>Resumen por estado</strong> (módulo Laboratorio)</p>
                <table class="lista-table"><thead><tr><th>Estado</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>
            </div>`;
        showPreview();
    }

    /** Devuelve el HTML del reporte (mismo contenido que PDF/impresión, solo módulo Taller). */
    function getReporteHtml() {
        const counts = getReportCounts(lastOrdenes, lastDesde, lastHasta);
        const desdeStr = lastDesde ? lastDesde.toLocaleDateString('es') : '—';
        const hastaStr = lastHasta ? lastHasta.toLocaleDateString('es') : '—';
        const rows = ESTADOS.map(est => `<tr><td>${est}</td><td>${counts[est] || 0}</td></tr>`).join('');
        return `<h2>Reporte Análisis Laboratorio</h2>
            <p><strong>Generado:</strong> ${new Date().toLocaleString('es')}</p>
            <p><strong>Periodo:</strong> ${desdeStr} — ${hastaStr}</p>
            <p><strong>Resumen por estado</strong> (módulo Laboratorio)</p>
            <table class="lista-table"><thead><tr><th>Estado</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function imprimirReporte() {
        const ventana = window.open('', '_blank');
        ventana.document.write('<html><head><title>Reporte Análisis Laboratorio</title><link rel="stylesheet" href="/panel/css/main.css"></head><body style="padding:20px;">');
        ventana.document.write(getReporteHtml());
        ventana.document.write('</body></html>');
        ventana.document.close();
        ventana.print();
        ventana.close();
    }

    function downloadReport() {
        const auth = window.authService;
        if (!auth) return;
        auth.getCurrentProfile().then(profile => {
            if (profile.rol !== 'admin' && profile.rol !== 'superadmin') return;
            const JsPDF = window.jspdf?.jsPDF;
            if (!JsPDF) { alert('No se puede generar PDF.'); return; }
            const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const counts = getReportCounts(lastOrdenes, lastDesde, lastHasta);
            const desdeStr = lastDesde ? lastDesde.toLocaleDateString('es') : '—';
            const hastaStr = lastHasta ? lastHasta.toLocaleDateString('es') : '—';
            doc.setFontSize(16);
            doc.text('Reporte Análisis Laboratorio', 14, 20);
            doc.setFontSize(10);
            doc.text('Generado: ' + new Date().toLocaleString('es'), 14, 28);
            doc.text('Periodo: ' + desdeStr + ' — ' + hastaStr, 14, 34);
            let y = 42;
            doc.setFontSize(11);
            doc.text('Resumen por estado (módulo Laboratorio)', 14, y); y += 8;
            ESTADOS.forEach(est => {
                doc.text(est + ': ' + (counts[est] || 0), 20, y);
                y += 6;
            });
            doc.save('reporte-analisis-laboratorio-' + new Date().toISOString().slice(0, 10) + '.pdf');
        });
    }

    function setupReporteSection() {
        const btnPreview = document.getElementById('btnPreviewReporte');
        const btnDescargar = document.getElementById('btnDescargarReporte');
        const btnCerrar = document.getElementById('btnCerrarPreview');
        if (btnPreview) btnPreview.addEventListener('click', showPreviewReporte);
        if (btnCerrar) btnCerrar.addEventListener('click', hidePreview);
        if (btnDescargar) {
            btnDescargar.addEventListener('click', downloadReport);
            window.authService.getCurrentProfile().then(profile => {
                if (profile && (profile.rol === 'admin' || profile.rol === 'superadmin')) {
                    btnDescargar.classList.remove('hidden');
                }
            }).catch(() => {});
        }
        var btnImprimir = document.getElementById('btnImprimirReporte');
        if (btnImprimir) btnImprimir.addEventListener('click', imprimirReporte);
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
                const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
                el.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
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

    window.analisisTaller = { init, refresh };
    return { init, refresh };
})();

export default AnalisisTaller;
