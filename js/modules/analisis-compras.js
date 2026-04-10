import { createDataService } from '../core/data-service.js';

const comprasService = createDataService('compras');

function _monthKey(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function _setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v == null ? '—' : String(v);
}

let _chartEstados = null;
let _chartMes = null;

async function init() {
  let rows = [];
  try {
    rows = await comprasService.select({}, { orderBy: 'fecha_creacion', ascending: false, limit: 2000 });
  } catch (e) {
    console.warn('[Análisis Compras] No se pudo cargar compras:', e?.message || e);
    rows = [];
  }

  const total = rows.length;
  const pend = rows.filter(r => (r.estado || 1) <= 2).length;
  const conf = rows.filter(r => (r.estado || 1) === 3).length;
  const rec = rows.filter(r => (r.estado || 1) >= 4).length;
  _setText('kpiComprasTotal', total);
  _setText('kpiComprasPend', pend);
  _setText('kpiComprasConf', conf);
  _setText('kpiComprasRec', rec);

  // Chart: estados
  const ctx1 = document.getElementById('chartComprasEstados');
  if (ctx1 && window.Chart) {
    if (_chartEstados) _chartEstados.destroy();
    _chartEstados = new Chart(ctx1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Pendiente (1-2)', 'Confirmada (3)', 'Recibida/Entregada (4-5)'],
        datasets: [{
          label: 'Compras',
          data: [pend, conf, rec],
          backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart: por mes
  const buckets = new Map();
  rows.forEach(r => {
    const k = _monthKey(r.fecha_creacion || r.created_at || r.updated_at || new Date().toISOString());
    buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  const labels = Array.from(buckets.keys()).sort();
  const data = labels.map(k => buckets.get(k) || 0);
  const ctx2 = document.getElementById('chartComprasMes');
  if (ctx2 && window.Chart) {
    if (_chartMes) _chartMes.destroy();
    _chartMes = new Chart(ctx2.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Compras por mes',
          data,
          borderColor: '#111827',
          backgroundColor: 'rgba(17,24,39,0.08)',
          tension: 0.25,
          fill: true
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

window.analisisCompras = { init };
export { init };

