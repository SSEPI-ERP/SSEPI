/**
 * Genera preview-lab-import.html — vista tipo modal Laboratorio del ERP.
 *
 * Uso:
 *   node generar-preview-lab.mjs
 *   abrir-preview-lab.bat  → http://localhost:3334/preview-lab-import.html
 */
import { getDb } from './db.mjs';
import { sanitizeReporteRecord } from './reportes-sanitize.mjs';
import { normalizeLabOrder } from '../scripts/imports/laboratorio-import.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_HTML = path.join(__dirname, 'preview-lab-import.html');
const MAX_ORDERS = 6;
const MAX_IMGS_PER_ORDER = 8;

const STEPS = [
  'Registrado',
  'Diagnóstico',
  'Esperando cotización',
  'Reparación',
  'Entregado',
];

function q(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseOrder(row) {
  try {
    return { id: row.id, ...JSON.parse(row.data) };
  } catch {
    return null;
  }
}

function imgSrcForHtml(url) {
  if (!url) return null;
  if (url.startsWith('/uploads/')) return url;
  if (url.startsWith('uploads/')) return `/${url}`;
  return url;
}

function orderToRawRec(o) {
  return {
    referencia_reparacion: o.folio,
    estado_actual: o.estado,
    cliente: o.cliente_nombre || o.cliente,
    equipo: o.equipo || o.nombre_producto,
    componente: o.serie || o.componente,
    diagnostico: o.diagnostico || o.notas_internas || o.reparacion_resumen_diagnostico,
    descripcion: o.descripcion,
    notas: o.notas_generales,
    historial_actividad: o.historial_actividad || o.notas_generales,
    encargado: o.tecnico_responsable || o.encargado_recepcion,
    vendedor: o.vendedor_externo,
    solucion: o.solucion || o.reparacion_notas,
    bajo_garantia: o.bajo_garantia,
    cliente_rfc: o.cliente_rfc,
    fecha_ingreso: o.fecha_ingreso,
  };
}

function estadoToPaso(estado) {
  const map = {
    Nuevo: 1,
    Registrado: 1,
    Diagnóstico: 2,
    Garantía: 2,
    'Esperando Cotización': 3,
    'En Espera': 3,
    Confirmado: 4,
    'En reparación': 4,
    Reparado: 4,
    'Reparado / Listo': 4,
    Entregado: 5,
    Facturado: 5,
    Cancelado: 0,
  };
  return map[estado] ?? 1;
}

function renderStepper(pasoActual) {
  return STEPS.map((label, i) => {
    const n = i + 1;
    let cls = '';
    if (pasoActual === 0) cls = 'cancel';
    else if (n < pasoActual) cls = 'done';
    else if (n === pasoActual) cls = 'current';
    return `<div class="tl-step ${cls}"><div class="tl-dot">${n < pasoActual ? '✓' : n}</div><div class="tl-label">${esc(label)}</div></div>`;
  }).join('');
}

function renderLabModal(o) {
  const paso = estadoToPaso(o.estado);
  const gar = o.bajo_garantia ? '<span class="chip warn">Bajo garantía</span>' : '';
  const vend = o.vendedor ? `<span class="chip">${esc(o.vendedor)}</span>` : '';
  const enc = o.encargado && o.encargado !== 'Por asignar' && o.encargado !== 'Recepción SSEPI'
    ? esc(o.encargado)
    : '—';

  const thumbs = o.imgs
    .map((img) => {
      const src = img.src || img.dataUrl || '';
      if (!src) return '';
      return `<a class="thumb" href="${esc(src)}" target="_blank" rel="noopener">
        <img src="${esc(src)}" alt="${esc(img.nombre)}" loading="lazy" onerror="this.closest('.thumb').classList.add('err')">
      </a>`;
    })
    .join('');

  return `<section class="lab-modal" data-folio="${esc(o.folio)}">
    <div class="lab-modal-head">
      <div>
        <p class="module-tag">Laboratorio · Orden de reparación</p>
        <h2>${esc(o.folio)}</h2>
      </div>
      <span class="estado-pill">${esc(o.estado)}</span>
    </div>
    <div class="timeline">${renderStepper(paso)}</div>
    <div class="lab-body">
      <div class="panel active" data-step="1">
        <h3>Recepción</h3>
        <div class="field-grid">
          <label><span>Cliente</span><input class="inp" value="${esc(o.cliente)}"></label>
          <label><span>Fecha ingreso</span><input class="inp" value="${esc(o.fecha_ingreso || '—')}"></label>
          <label><span>Equipo</span><input class="inp" value="${esc(o.equipo)}"></label>
          <label><span>Serie / componente</span><input class="inp" value="${esc(o.serie || '—')}"></label>
          <label><span>Falla reportada</span><input class="inp" value="${esc(o.falla)}"></label>
          <label><span>Recibió (encargado)</span><input class="inp" value="${esc(enc)}"></label>
          <label><span>Vendedor</span><input class="inp" value="${esc(o.vendedor || '—')}"></label>
          <label><span>Garantía</span><input class="inp" value="${esc(o.bajo_garantia ? 'Sí' : 'No')}"></label>
        </div>
        <div class="chips">${gar} ${vend}</div>
      </div>
      <div class="panel active" data-step="2">
        <h3>Diagnóstico</h3>
        <label class="block"><span>Resumen técnico (sin nombres ni bitácora Odoo)</span>
          <textarea class="ta" rows="4">${esc(o.diagnostico || '')}</textarea>
        </label>
        <label class="block"><span>Solución</span><textarea class="ta" rows="3">${esc(o.solucion || '')}</textarea></label>
      </div>
      <div class="panel">
        <h3>Evidencia fotográfica</h3>
        <div class="gallery">${thumbs || '<p class="muted">Sin imágenes en carpeta</p>'}</div>
      </div>
    </div>
  </section>`;
}

const db = await getDb();

const stats = {
  taller: q(db, 'SELECT COUNT(*) c FROM local_ordenes_taller')[0].c,
  withUrl: q(db, `SELECT COUNT(*) c FROM local_ordenes_taller WHERE json_extract(data,'$.reporte_imagenes') LIKE '%"url":%'`)[0].c,
  reparado: q(db, `SELECT COUNT(*) c FROM local_ordenes_taller WHERE json_extract(data,'$.estado') = 'Reparado'`)[0].c,
  contactos: q(db, 'SELECT COUNT(*) c FROM local_contactos')[0].c,
};

const rows = q(db, `
  SELECT id, data FROM local_ordenes_taller
  WHERE json_extract(data,'$.reporte_imagenes') IS NOT NULL
  AND json_extract(data,'$.reporte_imagenes') != '[]'
  ORDER BY
    CASE WHEN json_extract(data,'$.folio') = 'SP-E0557' THEN 0 ELSE 1 END,
    length(json_extract(data,'$.reporte_imagenes')) DESC
  LIMIT ${MAX_ORDERS * 4}
`);

const orders = [];
for (const row of rows) {
  const raw = parseOrder(row);
  if (!raw?.folio) continue;
  const imgs = (raw.reporte_imagenes || []).filter((i) => i && (i.url || i.dataUrl));
  if (imgs.length === 0) continue;

  const rec = sanitizeReporteRecord(orderToRawRec(raw));
  const lab = normalizeLabOrder(rec);
  const recp = lab.datos_recepcion || {};

  orders.push({
    folio: rec.referencia_reparacion || raw.folio,
    estado: rec.estado_actual || raw.estado || '—',
    cliente: recp.cliente || rec.cliente,
    equipo: recp.equipo || rec.equipo,
    serie: recp.serie || rec.componente,
    falla: recp.falla || rec.falla_corta,
    diagnostico: lab.resumen_diagnostico || rec.diagnostico,
    solucion: rec.solucion,
    encargado: rec.encargado,
    vendedor: rec.vendedor,
    bajo_garantia: rec.bajo_garantia,
    fecha_ingreso: raw.fecha_ingreso ? String(raw.fecha_ingreso).slice(0, 10) : rec.fecha_ingreso,
    datos_recepcion: recp,
    etapa_actual: lab.etapa_actual,
    etapas: lab.etapas,
    imgs: imgs.slice(0, MAX_IMGS_PER_ORDER).map((img) => ({
      nombre: img.nombre || 'imagen',
      src: imgSrcForHtml(img.url) || (img.dataUrl && img.dataUrl.length < 400000 ? img.dataUrl : null),
    })),
  });
  if (orders.length >= MAX_ORDERS) break;
}

const generatedAt = new Date().toLocaleString('es-MX');
const modals = orders.map(renderLabModal).join('\n');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SSEPI — Laboratorio (preview import)</title>
  <style>
    :root { --bg:#0b0f14; --panel:#151b24; --border:#2a3548; --text:#e8edf4; --muted:#8b9cb3; --accent:#3b82f6; --ok:#22c55e; --warn:#f59e0b; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; }
    .app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .side { background: #0a0f15; border-right: 1px solid var(--border); padding: 18px 14px; }
    .brand { font-weight: 700; letter-spacing: .04em; margin: 0 0 10px; }
    .nav { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .nav a { text-decoration: none; color: var(--muted); padding: 10px 10px; border-radius: 10px; border: 1px solid transparent; }
    .nav a.active { color: var(--text); background: #121a25; border-color: var(--border); }
    .nav a:hover { background: #0f1722; }
    .main { padding: 20px 24px 40px; }
    h1 { font-size: 1.15rem; margin: 0 0 6px; }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 13px; }
    .stat b { color: var(--accent); margin-right: 6px; }
    .hint { background: #1a2744; border: 1px solid #2563eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 20px; }
    .stack { display: flex; flex-direction: column; gap: 24px; max-width: 980px; }
    .lab-modal { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,.35); }
    .lab-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px; border-bottom: 1px solid var(--border); background: #1a2230; }
    .module-tag { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
    .lab-modal-head h2 { margin: 0; font-family: ui-monospace, monospace; font-size: 1.15rem; }
    .estado-pill { background: #243044; color: var(--ok); padding: 6px 12px; border-radius: 20px; font-size: 12px; white-space: nowrap; }
    .timeline { display: flex; gap: 4px; padding: 12px 16px; border-bottom: 1px solid var(--border); overflow-x: auto; }
    .tl-step { flex: 1; min-width: 72px; text-align: center; opacity: .45; }
    .tl-step.done, .tl-step.current { opacity: 1; }
    .tl-step.current .tl-dot { background: var(--accent); border-color: var(--accent); color: #fff; }
    .tl-step.done .tl-dot { background: var(--ok); border-color: var(--ok); color: #fff; font-size: 11px; }
    .tl-dot { width: 28px; height: 28px; margin: 0 auto 6px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
    .tl-label { font-size: 10px; color: var(--muted); line-height: 1.2; }
    .lab-body { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 18px; }
    .panel h3 { margin: 0 0 10px; font-size: 14px; color: #93c5fd; font-weight: 600; }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
  @media (max-width: 640px) { .field-grid { grid-template-columns: 1fr; } }
    .field-grid label span, .block > span { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .inp { width: 100%; background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; font-size: 14px; color: var(--text); outline: none; }
    .inp:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
    .ta { width: 100%; resize: vertical; background: #0d1117; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 14px; line-height: 1.5; color: var(--text); outline: none; }
    .ta:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
    .chip { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #334155; margin-left: 6px; }
    .chip.warn { background: #78350f; color: #fcd34d; }
    .chips { margin-top: 10px; }
    .gallery { display: flex; flex-wrap: wrap; gap: 8px; }
    .thumb img { width: 100px; height: 75px; object-fit: cover; border-radius: 6px; border: 2px solid var(--border); }
    .thumb.err img { border-color: var(--warn); opacity: .35; }
    .muted { color: var(--muted); font-size: 13px; }
    code { background: #243044; padding: 2px 6px; border-radius: 4px; }
    a { color: #93c5fd; }
    @media (max-width: 900px) {
      .app { grid-template-columns: 72px 1fr; }
      .brand { display: none; }
      .nav a { font-size: 12px; padding: 10px 8px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="side">
      <div class="brand">SSEPI</div>
      <nav class="nav">
        <a class="active" href="#">Laboratorio</a>
        <a href="#">Ventas</a>
        <a href="#">Inventario</a>
        <a href="#">Contactos</a>
        <a href="#">Vacaciones</a>
      </nav>
      <p class="muted" style="margin-top:14px; font-size:12px;">
        Preview offline (solo UI).<br>
        Encargado: Javier/Aron.<br>
        Vendedor: Daniel/Carlos.
      </p>
    </aside>
    <main class="main">
      <h1>Laboratorio — Vista previa (como en el ERP)</h1>
      <p class="meta">Generado: ${esc(generatedAt)} · ${orders.length} órdenes · campos editables (solo visual)</p>
      <div class="stats">
        <div class="stat"><b>${stats.taller}</b> órdenes</div>
        <div class="stat"><b>${stats.withUrl}</b> con fotos /uploads</div>
        <div class="stat"><b>${stats.reparado}</b> reparadas</div>
        <div class="stat"><b>${stats.contactos}</b> contactos</div>
      </div>
      <div class="hint">
        Abre con <code>abrir-preview-lab.bat</code> o
        <a href="http://localhost:3334/preview-lab-import.html">localhost:3334</a>.
        Si cambias filtros, vuelve a correr <code>node importar-reportes-a-bd.mjs</code> y <code>node generar-preview-lab.mjs</code>.
      </div>
      <div class="stack">
        ${modals || '<p class="muted">Sin órdenes con imágenes. Importa reportes primero.</p>'}
      </div>
    </main>
  </div>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, html, 'utf8');
console.log('[preview] Escrito:', OUT_HTML);
console.log('[preview] Órdenes:', orders.length);
