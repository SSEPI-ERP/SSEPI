import { createDataService } from '../core/data-service.js';

const motoresService = createDataService('ordenes_motores');

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
    rows = await motoresService.select({}, { orderBy: 'fecha_ingreso', ascending: false, limit: 2500 });
  } catch (e) {
    console.warn('[Análisis Motores] No se pudo cargar:', e?.message || e);
    rows = [];
  }

  const total = rows.length;
  const pend = rows.filter(r => ['Diagnóstico', 'En Espera', 'Confirmado'].includes(r.estado || '')).length;
  const rep = rows.filter(r => (r.estado || '') === 'Reparado').length;
  const ent = rows.filter(r => ['Entregado', 'Facturado'].includes(r.estado || '')).length;
  _setText('kpiMotoresTotal', total);
  _setText('kpiMotoresPend', pend);
  _setText('kpiMotoresRep', rep);
  _setText('kpiMotoresEnt', ent);

  const ctx1 = document.getElementById('chartMotoresEstados');
  if (ctx1 && window.Chart) {
    if (_chartEstados) _chartEstados.destroy();
    _chartEstados = new Chart(ctx1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Pendiente', 'Reparado', 'Entregado'],
        datasets: [{ label: 'Órdenes', data: [pend, rep, ent], backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const buckets = new Map();
  rows.forEach(r => {
    const k = _monthKey(r.fecha_ingreso || r.created_at || r.updated_at || new Date().toISOString());
    buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  const labels = Array.from(buckets.keys()).sort();
  const data = labels.map(k => buckets.get(k) || 0);
  const ctx2 = document.getElementById('chartMotoresMes');
  if (ctx2 && window.Chart) {
    if (_chartMes) _chartMes.destroy();
    _chartMes = new Chart(ctx2.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Órdenes por mes', data, borderColor: '#111827', backgroundColor: 'rgba(17,24,39,0.08)', tension: 0.25, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

window.analisisMotores = { init };
export { init };

