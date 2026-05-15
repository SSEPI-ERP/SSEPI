import fs from 'fs';
import path from 'path';
import { getDb, persistDb, prepareStatement } from './db.mjs';

const MASTER_DIR = path.join(process.cwd(), 'data', 'master');

function readJson(fileName) {
  const p = path.join(MASTER_DIR, fileName);
  if (!fs.existsSync(p)) {
    console.warn(`[DataLoader] ${fileName} no encontrado en ${MASTER_DIR}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[DataLoader] Error parseando ${fileName}:`, e.message);
    return null;
  }
}

async function loadClientesTabulador(db) {
  const payload = readJson('clientes_tabulador.json');
  if (!payload || !Array.isArray(payload.records)) return 0;
  const stmt = await prepareStatement(db, 'local_clientes_tabulador');
  let inserted = 0;
  let updated = 0;
  for (const rec of payload.records) {
    if (!rec.nombre_cliente) continue;
    const existing = await stmt.query(`json_extract(data, '$.nombre_cliente') = ?`, [rec.nombre_cliente], 'id ASC', 1);
    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      await stmt.update(localId, rec);
      updated++;
    } else {
      await stmt.insert(null, rec);
      inserted++;
    }
  }
  persistDb();
  console.log(`[SSEPI-DATA] clientes_tabulador.json cargado: ${inserted} insertados, ${updated} actualizados`);
  return inserted + updated;
}

async function loadParametrosCostos(db) {
  const payload = readJson('parametros_costos.json');
  if (!payload || !Array.isArray(payload.records)) return 0;
  const stmt = await prepareStatement(db, 'local_parametros_costos');
  let inserted = 0;
  let updated = 0;
  for (const rec of payload.records) {
    if (!rec.clave) continue;
    const dept = rec.departamento || 'general';
    const existing = await stmt.query(
      `json_extract(data, '$.clave') = ? AND json_extract(data, '$.departamento') = ?`,
      [rec.clave, dept],
      'id ASC', 1
    );
    const record = { ...rec, activo: true, created_at: new Date().toISOString() };
    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      await stmt.update(localId, record);
      updated++;
    } else {
      await stmt.insert(null, record);
      inserted++;
    }
  }
  persistDb();
  console.log(`[SSEPI-DATA] parametros_costos.json cargado: ${inserted} insertados, ${updated} actualizados`);
  return inserted + updated;
}

async function loadServiciosAutomatizacion(db) {
  const payload = readJson('servicios_automatizacion.json');
  if (!payload || !Array.isArray(payload.records)) return 0;
  const stmt = await prepareStatement(db, 'local_servicios_automatizacion');
  let inserted = 0;
  let updated = 0;
  for (const rec of payload.records) {
    if (!rec.clave) continue;
    const existing = await stmt.query(`json_extract(data, '$.clave') = ?`, [rec.clave], 'id ASC', 1);
    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      await stmt.update(localId, rec);
      updated++;
    } else {
      await stmt.insert(null, rec);
      inserted++;
    }
  }
  persistDb();
  console.log(`[SSEPI-DATA] servicios_automatizacion.json cargado: ${inserted} insertados, ${updated} actualizados`);
  return inserted + updated;
}

async function loadBomAutomatizacion(db) {
  const payload = readJson('bom_automatizacion.json');
  if (!payload || !Array.isArray(payload.records)) return 0;
  const stmt = await prepareStatement(db, 'local_bom_automatizacion');
  let inserted = 0;
  let updated = 0;
  for (const rec of payload.records) {
    if (!rec.sku) continue;
    const existing = await stmt.query(`json_extract(data, '$.sku') = ?`, [rec.sku], 'id ASC', 1);
    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      await stmt.update(localId, rec);
      updated++;
    } else {
      await stmt.insert(null, rec);
      inserted++;
    }
  }
  persistDb();
  console.log(`[SSEPI-DATA] bom_automatizacion.json cargado: ${inserted} insertados, ${updated} actualizados`);
  return inserted + updated;
}

export async function loadMasterData(db) {
  if (!db) db = await getDb();
  const total =
    (await loadClientesTabulador(db)) +
    (await loadParametrosCostos(db)) +
    (await loadServiciosAutomatizacion(db)) +
    (await loadBomAutomatizacion(db));
  console.log(`[SSEPI-DATA] Master data total cargado: ${total} registros`);
  return total;
}

// CLI directo
if (import.meta.url === `file://${process.argv[1]}`) {
  loadMasterData().then(total => {
    console.log(`[DataLoader] Ejecucion directa completada: ${total} registros`);
    process.exit(0);
  }).catch(err => {
    console.error('[DataLoader] Error:', err);
    process.exit(1);
  });
}
