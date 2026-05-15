import { getDb } from './db.mjs';

const db = await getDb();

try {
  const stmt = db.prepare("PRAGMA table_info(local_clientes_tabulador)");
  while(stmt.step()) {
    const row = stmt.getAsObject();
    console.log('COLUMN:', row.name, row.type);
  }
  stmt.free();

  const stmt2 = db.prepare('SELECT * FROM local_clientes_tabulador LIMIT 1');
  stmt2.step();
  const row = stmt2.getAsObject();
  console.log('\nSAMPLE ROW:', JSON.stringify(row, null, 2));
  stmt2.free();
} catch(e) {
  console.log('Error:', e.message);
}
