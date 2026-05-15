import { getDb } from './db.mjs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedIfEmpty(db) {
  function count(table) {
    const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${table}`);
    stmt.step();
    const c = stmt.getAsObject().c || 0;
    stmt.free();
    return c;
  }

  function runSeed(name) {
    console.log(`\n[SeedCheck] Ejecutando ${name} (tabla vacía)...`);
    try {
      execSync(`node ${name}`, { cwd: __dirname, stdio: 'inherit' });
    } catch (e) {
      console.warn(`[SeedCheck] ${name} falló:`, e.message);
    }
  }

  if (count('local_contactos') === 0) runSeed('seed-limpiar-contactos.mjs');
  if (count('local_inventario') === 0) runSeed('seed-inventario.mjs');
  if (count('local_bom_automatizacion') === 0) runSeed('seed-bom.mjs');
  if (count('local_calculadoras') === 0) runSeed('seed-calculadoras.mjs');
  if (count('local_actividades_diarias') === 0) runSeed('seed-actividades.mjs');
  if (count('local_ordenes_taller') === 0) runSeed('seed-ordenes-ejemplo.mjs');
  if (count('local_proyectos_automatizacion') === 0) runSeed('seed-proyectos-automatizacion.mjs');
  if (count('local_estado_pipeline_unificado') === 0) runSeed('seed-pipeline.mjs');
}

// Solo ejecutar si se corre directamente (no al importar desde otro módulo)
const isMain = process.argv[1] && process.argv[1].endsWith('seed-all-check.mjs');
if (isMain) {
  const db = await getDb();
  await seedIfEmpty(db);
  console.log('\n[SeedCheck] Verificación completada.');
}
