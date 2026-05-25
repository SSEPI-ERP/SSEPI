/**
 * Resumen de tablas locales tras reiniciar-ssepi.bat
 * Exit 0 = OK, 1 = faltan datos críticos
 */
import { getDb } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'ssepi-local.db');

const CHECKS = [
  { table: 'local_contactos', label: 'Contactos', min: 70 },
  { table: 'local_clientes_tabulador', label: 'Clientes tabulador', min: 25 },
  { table: 'local_calculadoras', label: 'Calculadoras', min: 2 },
  { table: 'local_calculadora_clientes', label: 'Calc. clientes', min: 25 },
  { table: 'local_calculadora_hoja_filas', label: 'Calc. hoja filas', min: 5 },
  { table: 'local_inventario', label: 'Inventario', min: 50 },
  { table: 'local_bom_automatizacion', label: 'BOM auto', min: 50 },
  { table: 'local_ordenes_taller', label: 'Ordenes taller', min: 20 },
  { table: 'local_ordenes_motores', label: 'Ordenes motores', min: 0 },
  { table: 'local_proyectos_automatizacion', label: 'Proyectos auto', min: 0 },
  { table: 'local_estado_pipeline_unificado', label: 'Pipeline', min: 1 },
  { table: 'local_cotizaciones', label: 'Cotizaciones', min: 0 },
];

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
const dbBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
console.log('\n========================================');
console.log('  VERIFICACION IMPORTACION LOCAL');
console.log('========================================');
console.log('BD:', DB_PATH);
console.log('Tamano:', dbBytes, 'bytes');
console.log('');

let failed = false;
for (const { table, label, min } of CHECKS) {
  const n = countTable(db, table);
  const ok = n >= min;
  const flag = ok ? 'OK' : (min > 0 ? 'FALTA' : '—');
  if (!ok && min > 0) failed = true;
  console.log(`${flag.padEnd(6)} ${label.padEnd(22)} ${String(n).padStart(5)}  (min ${min})`);
}

// Muestra orden ejemplo (SP-E0557 o primera con cliente legible)
try {
  const stmt = db.prepare(`
    SELECT json_extract(data,'$.folio') f, json_extract(data,'$.cliente_nombre') c
    FROM local_ordenes_taller
    WHERE json_extract(data,'$.cliente_nombre') NOT LIKE '%Crear%'
    ORDER BY id DESC LIMIT 3
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  if (rows.length) {
    console.log('\nOrdenes taller (muestra):');
    for (const r of rows) console.log(`  - ${r.f} | ${r.c}`);
  }
} catch { /* ignore */ }

console.log('========================================\n');
if (failed) {
  console.error('[verify] Faltan datos. Revisa los pasos del bat o ejecuta de nuevo reiniciar-ssepi.bat');
  process.exit(1);
}
console.log('[verify] Importacion local completa.');
process.exit(0);
