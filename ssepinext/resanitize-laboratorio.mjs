/**
 * ssepinext/resanitize-laboratorio.mjs
 *
 * One-shot: re-sanitiza todas las filas de `local_ordenes_taller` aplicando
 * `sanitizeReporteRecord` (de reportes-sanitize.mjs). Persiste cambios.
 *
 * Uso:
 *   node ssepinext/resanitize-laboratorio.mjs --dry-run
 *   node ssepinext/resanitize-laboratorio.mjs
 *
 * Conservador: si el campo actual es "válido" (no vacío, no basura UI),
 * se mantiene. Si está vacío o parece OCR basura, se reemplaza por el
 * valor saneado. Imágenes, folios y estados NO se tocan.
 */
import { getDb, persistDb, setDeferPersist } from './db.mjs';
import { sanitizeReporteRecord, isOdooUiGarbage } from './reportes-sanitize.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// Campos top-level que se re-sanitizan. NO incluye folio, estado, items, imágenes.
const FIELDS_TO_SANITIZE = [
  'cliente', 'cliente_nombre',
  'equipo',
  'falla', 'falla_reportada', 'falla_corta',
  'diagnostico', 'reparacion_resumen_diagnostico',
  'notas_internas', 'notas_generales',
  'descripcion', 'solucion',
  'historial_actividad', 'materiales',
  'cliente_rfc',
  'vendedor', 'encargado',
];

function isValid(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (s.length < 3) return false;
  if (isOdooUiGarbage(s)) return false;
  return true;
}

/** Construye el "rec" que sanitizeReporteRecord espera a partir del JSON actual. */
function buildRec(actual) {
  return {
    cliente: actual.cliente || actual.cliente_nombre || '',
    cliente_rfc: actual.cliente_rfc || '',
    equipo: actual.equipo || '',
    componente: actual.componente || '',
    diagnostico: actual.diagnostico || actual.reparacion_resumen_diagnostico || '',
    descripcion: actual.descripcion || '',
    notas: actual.notas_internas || actual.notas_generales || '',
    historial_actividad: actual.historial_actividad || '',
    materiales: actual.materiales || '',
    encargado: actual.encargado || actual.encargado_recepcion || '',
    vendedor: actual.vendedor || actual.vendedor_externo || '',
    estado_actual: actual.estado_actual || actual.estatus_actual || '',
    numero_orden: actual.numero_orden || actual.referencia || '',
    referencia_reparacion: actual.folio || '',
    _folder: actual.folio || '',
    fecha_ingreso: actual.fecha_ingreso || '',
    fecha: actual.fecha || '',
    bajo_garantia: actual.bajo_garantia || '',
    falla: actual.falla || actual.falla_reportada || '',
    falla_corta: actual.falla_corta || '',
  };
}

/** Merge conservador: gana `actual` si es válido, sino gana `saneado`. */
function mergeConservador(actual, saneado) {
  const out = { ...actual };
  const cambios = {};

  for (const field of FIELDS_TO_SANITIZE) {
    const a = actual[field];
    const s = saneado[field];
    if (isValid(a)) continue; // actual válido: NO tocar
    if (!isValid(s)) continue; // ninguno válido: dejar como está
    out[field] = s;
    cambios[field] = { antes: (a || '').slice(0, 80), despues: String(s).slice(0, 80) };
  }
  return { out, cambios };
}

async function main() {
  const db = await getDb();
  const stmt = db.prepare('SELECT id, data FROM local_ordenes_taller');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  console.log(`[resanitize] ${rows.length} órdenes en local_ordenes_taller`);
  if (DRY_RUN) console.log('[resanitize] *** MODO DRY-RUN — no se persiste nada ***');

  let totalModificadas = 0;
  let totalSinCambios = 0;
  const cambiosPorCampo = {};
  const ejemplos = []; // primeras 8 modificaciones para inspección

  setDeferPersist(true);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let actual;
    try { actual = JSON.parse(row.data); } catch { continue; }
    if (!actual || typeof actual !== 'object') continue;

    const rec = buildRec(actual);
    let saneado;
    try {
      saneado = sanitizeReporteRecord(rec);
    } catch (e) {
      console.warn(`[resanitize] id=${row.id} folio=${actual.folio} error sanitizando: ${e.message}`);
      continue;
    }

    const { out, cambios } = mergeConservador(actual, saneado);
    const keys = Object.keys(cambios);
    if (keys.length === 0) { totalSinCambios++; continue; }

    totalModificadas++;
    for (const k of keys) cambiosPorCampo[k] = (cambiosPorCampo[k] || 0) + 1;
    if (ejemplos.length < 8) {
      ejemplos.push({ id: row.id, folio: actual.folio, cambios });
    }

    if (!DRY_RUN) {
      const newData = JSON.stringify(out);
      const upd = db.prepare('UPDATE local_ordenes_taller SET data = ?, updated_at = datetime(\'now\') WHERE id = ?');
      upd.run([newData, row.id]);
      upd.free();
    }
  }

  if (!DRY_RUN) {
    persistDb();
    console.log('[resanitize] Cambios persistidos en ssepi-local.db');
  } else {
    console.log('[resanitize] *** DRY-RUN: 0 escrituras ***');
  }

  console.log('\n=== Resumen ===');
  console.log(`Total órdenes:     ${rows.length}`);
  console.log(`Modificadas:       ${totalModificadas}`);
  console.log(`Sin cambios:       ${totalSinCambios}`);
  console.log('\n=== Cambios por campo ===');
  for (const [k, n] of Object.entries(cambiosPorCampo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(35)} ${n}`);
  }
  if (ejemplos.length) {
    console.log('\n=== Ejemplos (primeras 8) ===');
    for (const ex of ejemplos) {
      console.log(`\n  id=${ex.id} folio=${ex.folio}`);
      for (const [k, c] of Object.entries(ex.cambios)) {
        console.log(`    ${k}:`);
        console.log(`      antes:   "${c.antes}"`);
        console.log(`      despues: "${c.despues}"`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
