import { getDb } from './db.mjs';

const db = await getDb();
try {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM clientes_tabulador');
  stmt.step();
  console.log('clientes_tabulador count:', stmt.getAsObject().total);
  stmt.free();
  const stmt2 = db.prepare('SELECT id, nombre_cliente, localidad FROM clientes_tabulador LIMIT 5');
  while(stmt2.step()) console.log(stmt2.getAsObject());
  stmt2.free();
} catch(e) {
  console.log('Error:', e.message);
  const stmt2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = [];
  while(stmt2.step()) tables.push(stmt2.getAsObject().name);
  stmt2.free();
  console.log('Tables:', tables);
}
