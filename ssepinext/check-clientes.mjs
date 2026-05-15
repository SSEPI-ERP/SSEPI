import { getDb } from './db.mjs';

const db = await getDb();

try {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM local_clientes_tabulador');
  stmt.step();
  console.log('local_clientes_tabulador count:', stmt.getAsObject().total);
  stmt.free();

  const stmt2 = db.prepare('SELECT id, nombre_cliente, localidad FROM local_clientes_tabulador LIMIT 10');
  while(stmt2.step()) console.log('ROW:', JSON.stringify(stmt2.getAsObject()));
  stmt2.free();
} catch(e) {
  console.log('Error:', e.message);
}
