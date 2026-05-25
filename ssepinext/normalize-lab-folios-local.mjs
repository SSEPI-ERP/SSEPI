/**
 * Normaliza folios de laboratorio en SQLite local (ssepi-local.db).
 * SP-#### / SP.#### / SP#### → SP-E####
 *
 * Uso: node normalize-lab-folios-local.mjs [--dry-run]
 */
import { getDb, persistDb, DB_PATH } from './db.mjs';
import { normalizeLabFolio } from '../scripts/imports/ocr-ssepi-rules.mjs';

const dryRun = process.argv.includes('--dry-run');
const TABLE_TALLER = 'local_ordenes_taller';
const TABLE_COMPRAS = 'local_compras';
const TABLE_COT = 'local_cotizaciones';

function patchVinculacion(vinc) {
  if (!vinc || typeof vinc !== 'object') return vinc;
  const out = { ...vinc };
  if (out.folio_taller) out.folio_taller = normalizeLabFolio(out.folio_taller);
  if (out.tipo === 'taller' && out.folio) out.folio = normalizeLabFolio(out.folio);
  return out;
}

function loadTable(db, tableName) {
  const rows = [];
  const stmt = db.prepare(`SELECT id, data FROM ${tableName}`);
  while (stmt.step()) {
    const r = stmt.getAsObject();
    let data = {};
    try {
      data = JSON.parse(r.data || '{}');
    } catch {
      /* skip */
    }
    rows.push({ id: r.id, data });
  }
  stmt.free();
  return rows;
}

function maxSpENumberFromRows(rows, folioKey = 'folio') {
  let max = 0;
  for (const { data } of rows) {
    const m = String(data[folioKey] || '').match(/^SP-E(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max;
}

async function main() {
  const db = await getDb();
  const upd = db.prepare(`UPDATE ${TABLE_TALLER} SET data = ?, updated_at = datetime('now') WHERE id = ?`);
  const del = db.prepare(`DELETE FROM ${TABLE_TALLER} WHERE id = ?`);

  const ordenes = loadTable(db, TABLE_TALLER);
  const byFolio = new Map();
  for (const row of ordenes) {
    const f = row.data.folio;
    if (f) byFolio.set(f, row.id);
  }

  let updatedOrdenes = 0;
  let deletedDupes = 0;
  const toDelete = new Set();

  for (const row of ordenes) {
    const oldFolio = row.data.folio;
    if (!oldFolio) continue;
    const newFolio = normalizeLabFolio(oldFolio);
    if (!newFolio || newFolio === oldFolio) continue;

    const existingId = byFolio.get(newFolio);
    if (existingId != null && existingId !== row.id && !toDelete.has(existingId)) {
      const existing = ordenes.find((x) => x.id === existingId);
      const keepCanon = existing && String(existing.data.folio || '').toUpperCase().startsWith('SP-E');
      if (keepCanon) {
        toDelete.add(row.id);
        deletedDupes++;
        continue;
      }
      toDelete.add(existingId);
      deletedDupes++;
    }

    row.data.folio = newFolio;
    if (!dryRun) {
      upd.run([JSON.stringify(row.data), row.id]);
    }
    byFolio.delete(oldFolio);
    byFolio.set(newFolio, row.id);
    updatedOrdenes++;
  }

  if (!dryRun) {
    for (const id of toDelete) del.run([id]);
    upd.free();
    del.free();
  }

  let updatedCompras = 0;
  const compras = loadTable(db, TABLE_COMPRAS);
  const updC = db.prepare(`UPDATE ${TABLE_COMPRAS} SET data = ?, updated_at = datetime('now') WHERE id = ?`);
  for (const row of compras) {
    const patched = patchVinculacion(row.data.vinculacion);
    if (JSON.stringify(patched) === JSON.stringify(row.data.vinculacion)) continue;
    row.data.vinculacion = patched;
    if (!dryRun) updC.run([JSON.stringify(row.data), row.id]);
    updatedCompras++;
  }
  if (!dryRun) updC.free();

  let updatedCot = 0;
  const cots = loadTable(db, TABLE_COT);
  const updCo = db.prepare(`UPDATE ${TABLE_COT} SET data = ?, updated_at = datetime('now') WHERE id = ?`);
  for (const row of cots) {
    const origen = (row.data.origen || '').toLowerCase();
    if (!['taller', 'electronicos', 'laboratorio'].includes(origen)) continue;
    const nf = normalizeLabFolio(row.data.folio);
    if (!nf || nf === row.data.folio) continue;
    row.data.folio = nf;
    if (!dryRun) updCo.run([JSON.stringify(row.data), row.id]);
    updatedCot++;
  }
  if (!dryRun) updCo.free();

  const ordenesAfter = dryRun ? ordenes : loadTable(db, TABLE_TALLER);
  if (!dryRun) {
    for (const row of ordenesAfter) {
      if (toDelete.has(row.id)) row.data.folio = null;
    }
  }
  const maxNum = maxSpENumberFromRows(
    ordenesAfter.filter((r) => !toDelete.has(r.id))
  );

  if (!dryRun && maxNum > 0) {
    const cur = db.prepare(`SELECT last_number FROM local_sequences WHERE prefix = 'SP-E'`);
    cur.step();
    const prevRow = cur.getAsObject();
    cur.free();
    const prev = prevRow?.last_number ? Number(prevRow.last_number) : 0;
    const final = Math.max(prev, maxNum);
    const seq = db.prepare(
      `INSERT INTO local_sequences (prefix, last_number) VALUES ('SP-E', ?)
       ON CONFLICT(prefix) DO UPDATE SET last_number = ?`
    );
    seq.run([final, final]);
    seq.free();
    persistDb();
  } else if (!dryRun && updatedOrdenes + deletedDupes + updatedCompras + updatedCot > 0) {
    persistDb();
  }

  const legacy = ordenesAfter.filter((r) => {
    if (toDelete.has(r.id)) return false;
    const f = r.data.folio || '';
    return /^SP-\d/i.test(f) || /^SP\.\d/i.test(f) || /^SP\d{3,}$/i.test(f);
  });

  console.log('BD:', DB_PATH);
  console.log('Modo:', dryRun ? 'dry-run' : 'apply');
  console.log('Órdenes actualizadas:', updatedOrdenes);
  console.log('Duplicados eliminados:', deletedDupes);
  console.log('Compras:', updatedCompras, '| Cotizaciones:', updatedCot);
  console.log('Secuencia SP-E max:', maxNum);
  console.log('Legacy sin SP-E:', legacy.length);
  if (legacy.length) console.log('Ejemplos:', legacy.slice(0, 5).map((r) => r.data.folio).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
