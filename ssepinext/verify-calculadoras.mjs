/**
 * Verifica tablas calculadoras en SQLite local y en proxy HTTP (servidor debe estar arriba).
 */
import { getDb } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'ssepi-local.db');

function countTable(db, table) {
  try {
    const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${table}`);
    stmt.step();
    const c = stmt.getAsObject().c || 0;
    stmt.free();
    return c;
  } catch {
    return -1;
  }
}

const db = await getDb();
const size = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
console.log('[verify] DB bytes:', size);
for (const t of [
  'local_calculadoras',
  'local_calculadora_clientes',
  'local_calculadora_hoja_filas',
  'local_clientes_tabulador',
  'local_contactos',
]) {
  console.log(`[verify] ${t}:`, countTable(db, t));
}

const base = 'http://localhost:3333/proxy/rest/v1';
const headers = { apikey: 'anon-key', Authorization: 'Bearer test' };
for (const table of ['calculadora_clientes', 'calculadora_hoja_filas', 'calculadoras']) {
  try {
    const url = `${base}/${table}?select=id&limit=1`;
    const r = await fetch(url, { headers });
    console.log(`[verify] GET ${table}:`, r.status, r.status === 404 ? await r.text() : 'ok');
  } catch (e) {
    console.log(`[verify] GET ${table}: servidor no disponible -`, e.message);
  }
}

process.exit(0);
