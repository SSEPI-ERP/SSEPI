/**
 * Mueve órdenes SP-E/SP-M/SP-A al módulo correcto (bulk SQL, sin re-copiar base64).
 */
import { getDb, persistDb } from './db.mjs';

const MOVES = [
  { from: 'local_proyectos_automatizacion', to: 'local_ordenes_taller', like: 'SP-E%' },
  { from: 'local_proyectos_automatizacion', to: 'local_ordenes_motores', like: 'SP-M%' },
  { from: 'local_ordenes_taller', to: 'local_proyectos_automatizacion', like: 'SP-A%' },
  { from: 'local_ordenes_taller', to: 'local_ordenes_motores', like: 'SP-M%' },
  { from: 'local_ordenes_motores', to: 'local_ordenes_taller', like: 'SP-E%' },
  { from: 'local_ordenes_motores', to: 'local_proyectos_automatizacion', like: 'SP-A%' },
];

function countTable(db, table) {
  const s = db.prepare(`SELECT COUNT(*) c FROM ${table}`);
  s.step();
  const c = s.getAsObject().c;
  s.free();
  return c;
}

function moveFolios(db, from, to, likePattern) {
  const sel = db.prepare(`
    SELECT id, cloud_id, data, sync_status, created_at, updated_at
    FROM ${from}
    WHERE upper(json_extract(data, '$.folio')) LIKE ?
  `);
  sel.bind([likePattern.toUpperCase()]);
  const rows = [];
  while (sel.step()) rows.push(sel.getAsObject());
  sel.free();
  if (!rows.length) return 0;

  const ins = db.prepare(`
    INSERT INTO ${to} (cloud_id, data, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const del = db.prepare(`DELETE FROM ${from} WHERE id = ?`);
  const exists = db.prepare(`
    SELECT id FROM ${to} WHERE upper(json_extract(data, '$.folio')) = upper(json_extract(?, '$.folio')) LIMIT 1
  `);

  let moved = 0;
  for (const row of rows) {
    exists.bind([row.data]);
    const dup = exists.step() ? exists.getAsObject() : null;
    exists.reset();
    if (dup) {
      del.run([row.id]);
      moved++;
      continue;
    }
    ins.run([row.cloud_id, row.data, row.sync_status, row.created_at, row.updated_at]);
    del.run([row.id]);
    moved++;
  }
  ins.free();
  del.free();
  exists.free();
  console.log(`[fix] ${likePattern}: ${moved} filas ${from} → ${to}`);
  return moved;
}

const db = await getDb();
let total = 0;
for (const m of MOVES) {
  total += moveFolios(db, m.from, m.to, m.like);
}
persistDb();

console.log('\n[fix] Total movidas:', total);
console.log('[fix] Taller:', countTable(db, 'local_ordenes_taller'));
console.log('[fix] Motores:', countTable(db, 'local_ordenes_motores'));
console.log('[fix] Auto:', countTable(db, 'local_proyectos_automatizacion'));
