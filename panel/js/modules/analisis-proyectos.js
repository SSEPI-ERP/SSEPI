import { createDataService } from '../core/data-service.js';

const visitasService = createDataService('soporte_visitas');

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
    rows = await visitasService.select({}, { orderBy: 'fecha', ascending: false, limit: 2500 });
  } catch (e) {
    console.warn('[Análisis Proyectos] No se pudo cargar soporte_visitas:', e?.message || e);
    rows = [];
  }

  const total = rows.length;
  const pend = rows.filter(r => (r.estado || '') === 'pendiente').length;
  const conv = rows.filter(r => (r.estado || '') === 'proyecto').length;
  const comp = rows.filter(r => (r.estado || '') === 'completado').length;
  _setText('kpiVisitas', total);
  _setText('kpiVisPend', pend);
  _setText('kpiVisConv', conv);
  _setText('kpiVisComp', comp);

  const ctx1 = document.getElementById('chartVisitasEstados');
  if (ctx1 && window.Chart) {
    if (_chartEstados) _chartEstados.destroy();
    _chartEstados = new Chart(ctx1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Pendiente', 'Convertida a proyecto', 'Completada'],
        datasets: [{ label: 'Visitas', data: [pend, conv, comp], backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const buckets = new Map();
  rows.forEach(r => {
    const k = _monthKey(r.fecha || r.created_at || r.updated_at || new Date().toISOString());
    buckets.set(k, (buckets.get(k) || 0) + 1);
  });
  const labels = Array.from(buckets.keys()).sort();
  const data = labels.map(k => buckets.get(k) || 0);
  const ctx2 = document.getElementById('chartVisitasMes');
  if (ctx2 && window.Chart) {
    if (_chartMes) _chartMes.destroy();
    _chartMes = new Chart(ctx2.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Visitas por mes', data, borderColor: '#111827', backgroundColor: 'rgba(17,24,39,0.08)', tension: 0.25, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

window.analisisProyectos = { init };
export { init };

