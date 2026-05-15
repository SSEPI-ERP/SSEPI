import { getDb } from './db.mjs';

const db = await getDb();

try {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM local_ordenes_taller');
  stmt.step();
  console.log('Total ordenes taller:', stmt.getAsObject().total);
  stmt.free();

  const stmt2 = db.prepare('SELECT id, data FROM local_ordenes_taller');
  while(stmt2.step()) {
    const row = stmt2.getAsObject();
    const d = JSON.parse(row.data);
    console.log('ORDEN:', d.folio, '| estado:', d.estado, '| cliente:', d.cliente_nombre);
  }
  stmt2.free();
} catch(e) {
  console.log('Error:', e.message);
}
