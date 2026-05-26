/**
 * Genera datos_preview_erp.json en formato laboratorio-1
 * para la prueba visual original (carpeta 05_Formato_Laboratorio_Import).
 *
 * Uso: node generar-datos-preview-formato.mjs
 */
import { getDb } from './db.mjs';
import { sanitizeReporteRecord } from './reportes-sanitize.mjs';
import { normalizeLabOrder } from '../scripts/imports/laboratorio-import.mjs';
import { resolveDatosOrdenesEditables } from '../scripts/imports/erp-paquete-paths.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON = path.join(__dirname, 'datos_preview_erp.json');
const SOURCE_JSON = resolveDatosOrdenesEditables();

function loadSourceMap() {
  const map = new Map();
  if (!SOURCE_JSON || !fs.existsSync(SOURCE_JSON)) return map;
  try {
    for (const r of JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8'))) {
      const k = r.referencia_reparacion;
      if (k) map.set(k, r);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function orderToRawRec(o, src) {
  const s = src || {};
  return {
    referencia_reparacion: o.folio,
    estado_actual: o.estado || s.estado_actual,
    cliente: s.cliente || o.cliente_nombre || o.cliente,
    equipo: s.equipo || o.equipo,
    marca: o.marca || s.marca,
    modelo: o.modelo || s.modelo,
    serie: o.serie || s.serie,
    componente: s.componente || o.serie || o.componente,
    condiciones: o.condiciones_fisicas || s.condiciones,
    falla: o.falla_reportada || s.falla,
    diagnostico: s.diagnostico || o.diagnostico || o.notas_internas || o.reparacion_resumen_diagnostico,
    descripcion: s.descripcion || o.descripcion,
    resumen_diagnostico: o.reparacion_resumen_diagnostico || s.diagnostico || o.diagnostico || '',
    notas: s.notas || '',
    historial_actividad: s.historial_actividad || o.historial_actividad,
    encargado: s.encargado || o.tecnico_responsable || o.encargado_recepcion,
    vendedor: s.vendedor || o.vendedor_externo || o.recibido_por,
    bajo_garantia: o.bajo_garantia || s.bajo_garantia,
    cliente_rfc: o.cliente_rfc || s.cliente_rfc,
    fecha_ingreso: o.fecha_ingreso || s.fecha_ingreso,
    numero_orden: o.referencia || s.numero_orden,
    imagenes_servicio: [
      ...(s.imagenes_servicio || []),
      ...(o.reporte_imagenes || []).map((i) => i.url || i.ruta).filter(Boolean),
    ],
    componentes_extras: o.componentes_extras || s.componentes_extras || [],
    componentes_inventario: o.componentes_inventario || s.componentes_inventario || [],
    componentes_compra: o.componentes_compra || s.componentes_compra || [],
    consumibles_usados: o.consumibles_usados || s.consumibles_usados || [],
    bitacora: o.bitacora || s.bitacora,
    formato: o.formato,
    datos_recepcion: o.datos_recepcion,
    etapas: o.etapas,
    etapa_actual: o.etapa_actual,
  };
}

function q(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const db = await getDb();
const sourceMap = loadSourceMap();
const rows = q(db, 'SELECT id, data FROM local_ordenes_taller ORDER BY json_extract(data, "$.folio")');

const out = [];
for (const row of rows) {
  let raw;
  try {
    raw = JSON.parse(row.data);
  } catch {
    continue;
  }
  if (!raw?.folio) continue;

  const rec = sanitizeReporteRecord(orderToRawRec(raw, sourceMap.get(raw.folio)));
  rec.falla = rec.falla_corta;
  rec.resumen_diagnostico = rec.diagnostico || rec.resumen_diagnostico || '';
  rec.descripcion = rec.diagnostico || '';
  rec.notas = '';
  const lab = normalizeLabOrder(rec);
  if (lab.datos_recepcion) {
    lab.datos_recepcion.falla = rec.falla_corta || lab.datos_recepcion.falla || '';
    lab.datos_recepcion.equipo = rec.equipo || lab.datos_recepcion.equipo;
    lab.datos_recepcion.serie = rec.componente || lab.datos_recepcion.serie || '';
  }
  lab.resumen_diagnostico = rec.diagnostico || lab.resumen_diagnostico || '';
  lab.reporte_tecnico = lab.resumen_diagnostico;

  lab.encargado = rec.encargado || lab.encargado || '';
  lab.vendedor = rec.vendedor || lab.vendedor || '';

  if (!lab.imagenes_reporte?.length && raw.reporte_imagenes?.length) {
    lab.imagenes_reporte = raw.reporte_imagenes
      .map((i) => i.url || i.ruta)
      .filter((u) => u && !/screenshot|captura|erp|odoo/i.test(u))
      .slice(0, 5)
      .map((u) => (u.startsWith('/') ? u : `/${u.replace(/^\.?\//, '')}`));
  }

  out.push(lab);
}

out.sort((a, b) => String(a.referencia_reparacion).localeCompare(String(b.referencia_reparacion)));
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2), 'utf8');
console.log('[preview-formato] Escrito:', OUT_JSON);
console.log('[preview-formato] Órdenes:', out.length);
