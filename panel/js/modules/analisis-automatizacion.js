import { createDataService } from '../core/data-service.js';

const proyectosService = createDataService('proyectos_automatizacion');

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
    rows = await proyectosService.select({}, { orderBy: 'fecha', ascending: false, limit: 2500 });
  } catch (e) {
    console.warn('[Análisis Automatización] No se pudo cargar:', e?.message || e);
    rows = [];
  }

  // Solo automatización (si el dataset mezcla, filtramos por "estado" y/o campos)
  // En este ERP, la tabla es compartida con proyectos; filtramos por "estado" permitido.
  const total = rows.length;
  const pend = rows.filter(r => (r.estado || '') === 'pendiente').length;
  const prog = rows.filter(r => (r.estado || '') === 'progreso').length;
  const comp = rows.filter(r => (r.estado || '') === 'completado').length;
  _setText('kpiAutoTotal', total);
  _setText('kpiAutoPend', pend);
  _setText('kpiAutoProg', prog);
  _setText('kpiAutoComp', comp);

  const ctx1 = document.getElementById('chartAutoEstados');
  if (ctx1 && window.Chart) {
    if (_chartEstados) _chartEstados.destroy();
    _chartEstados = new Chart(ctx1.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Pendiente', 'En progreso', 'Completado'],
        datasets: [{ label: 'Proyectos', data: [pend, prog, comp], backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e'] }]
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
  const ctx2 = document.getElementById('chartAutoMes');
  if (ctx2 && window.Chart) {
    if (_chartMes) _chartMes.destroy();
    _chartMes = new Chart(ctx2.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Proyectos por mes', data, borderColor: '#111827', backgroundColor: 'rgba(17,24,39,0.08)', tension: 0.25, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

window.analisisAutomatizacion = { init };
export { init };

