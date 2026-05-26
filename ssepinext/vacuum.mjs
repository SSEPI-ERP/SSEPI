import initSqlJs from 'sql.js';
import fs from 'fs';

const DB_PATH = './data/ssepi-local.db';
const SQL = await initSqlJs();
const buf = fs.readFileSync(DB_PATH);
console.log(`[VACUUM] BD original: ${buf.length.toLocaleString()} bytes`);
const db = new SQL.Database(buf);
console.log('[VACUUM] Ejecutando VACUUM...');
db.run('VACUUM');
const out = db.export();
fs.writeFileSync(DB_PATH, Buffer.from(out));
console.log(`[VACUUM] BD compactada: ${out.length.toLocaleString()} bytes`);
