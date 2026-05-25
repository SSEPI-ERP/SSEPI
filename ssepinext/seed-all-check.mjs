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

  if (count('local_contactos') < 20) {
    console.warn('[SeedCheck] Pocos contactos — ejecuta manual: node seed-erp-maestro-local.mjs --replace-contactos');
    // No correr seed-contactos-imagenes (obsoleto); el ERP maestro es la fuente única.
  }
  if (count('local_inventario') === 0) runSeed('seed-inventario.mjs');
  if (count('local_bom_automatizacion') === 0) runSeed('seed-bom.mjs');
  if (count('local_calculadoras') === 0) runSeed('seed-calculadoras.mjs');
  else {
    if (count('local_clientes_tabulador') === 0 || count('local_calculadora_clientes') === 0) {
      runSeed('seed-calculadoras.mjs');
    }
    if (count('local_calculadora_hoja_filas') === 0) runSeed('seed-calculadoras.mjs');
  }
  if (count('local_actividades_diarias') === 0) runSeed('seed-actividades.mjs');
  if (count('local_ordenes_taller') < 15) {
    console.log('[SeedCheck] Pocas ordenes taller — ejecutando importar-reportes-a-bd.mjs...');
    try {
      execSync('node importar-reportes-a-bd.mjs', { cwd: __dirname, stdio: 'inherit', timeout: 600000 });
    } catch (e) {
      console.warn('[SeedCheck] importar-reportes falló:', e.message);
    }
  }
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
