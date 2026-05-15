import { getDb } from './db.mjs';

const db = await getDb();

const TABLAS = [
  { name: 'local_ventas', label: 'Ventas' },
  { name: 'local_compras', label: 'Compras' },
  { name: 'local_ordenes_taller', label: 'Laboratorio (Taller)' },
  { name: 'local_ordenes_motores', label: 'Motores' },
  { name: 'local_proyectos_automatizacion', label: 'Automatización / Proyectos' },
  { name: 'local_cotizaciones', label: 'Cotizaciones' },
  { name: 'local_facturas', label: 'Facturas' },
  { name: 'local_inventario', label: 'Inventario' },
  { name: 'local_contactos', label: 'Contactos' },
  { name: 'local_soporte_visitas', label: 'Soporte (Visitas)' },
  { name: 'local_actividades_diarias', label: 'Actividades Diarias' },
  { name: 'local_actividades_subtareas', label: 'Subtareas' },
  { name: 'local_bom_automatizacion', label: 'BOM Automatización' },
  { name: 'local_movimientos_inventario', label: 'Movimientos Inventario' }
];

console.log('========================================');
console.log('  SSEPI ERP - TEST DE CONEXION MODULOS');
console.log('========================================\n');

let ok = 0;
let fail = 0;

for (const t of TABLAS) {
  try {
    const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`);
    stmt.step();
    const count = stmt.getAsObject().c || 0;
    stmt.free();

    // Muestra algunos folios si hay datos
    let muestra = '';
    if (count > 0) {
      const stmt2 = db.prepare(`SELECT id, data FROM ${t.name} ORDER BY id DESC LIMIT 3`);
      const rows = [];
      while (stmt2.step()) rows.push(stmt2.getAsObject());
      stmt2.free();
      const folios = rows.map(r => {
        try {
          const d = JSON.parse(r.data);
          return d.folio || d.nombre || d.sku || `#${r.id}`;
        } catch { return `#${r.id}`; }
      });
      muestra = ' -> ' + folios.join(', ');
    }

    const estado = count > 0 ? 'OK' : 'VACIO';
    const icon = count > 0 ? '✅' : '⚠️';
    console.log(`${icon} ${t.label.padEnd(30)} ${String(count).padStart(4)} registros${muestra}`);
    if (count > 0) ok++; else fail++;
  } catch (e) {
    console.log(`❌ ${t.label.padEnd(30)} ERROR: ${e.message}`);
    fail++;
  }
}

// Verificar usuarios offline
console.log('\n--- USUARIOS OFFLINE ---');
try {
  const stmt = db.prepare(`SELECT COUNT(*) as c FROM offline_usuarios`);
  stmt.step();
  const count = stmt.getAsObject().c || 0;
  stmt.free();
  console.log(`✅ Usuarios offline: ${count}`);

  const stmt2 = db.prepare(`SELECT email, nombre, rol FROM offline_usuarios LIMIT 5`);
  const rows = [];
  while (stmt2.step()) rows.push(stmt2.getAsObject());
  stmt2.free();
  rows.forEach(u => console.log(`   ${u.email} (${u.nombre}, ${u.rol})`));
} catch (e) {
  console.log(`❌ Usuarios offline: ${e.message}`);
}

// Verificar tamaño de base de datos
import fs from 'fs';
const stats = fs.statSync('./data/ssepi-local.db');
const mb = (stats.size / 1024 / 1024).toFixed(2);
console.log(`\n📦 Base de datos: ${mb} MB`);

console.log('\n========================================');
console.log(`  RESULTADO: ${ok} tablas con datos, ${fail} tablas vacias/fallidas`);
console.log('========================================');

process.exit(fail > 5 ? 1 : 0);
