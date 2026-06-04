/**
 * Quita perfiles ocultos de local_vacaciones_empleados (sin re-seed completo).
 * Uso: node ssepinext/purge-hidden-vacaciones.mjs
 */
import { getDb, persistDb } from './db.mjs';
import { isHiddenProfile } from './hidden-profiles.mjs';

const db = await getDb();
const rows = db.exec("SELECT id, data FROM local_vacaciones_empleados");
if (!rows.length || !rows[0].values.length) {
  console.log('[purge-hidden-vacaciones] Sin filas en local_vacaciones_empleados');
  process.exit(0);
}

let removed = 0;
for (const [id, dataJson] of rows[0].values) {
  let row;
  try {
    row = JSON.parse(dataJson);
  } catch {
    continue;
  }
  if (!isHiddenProfile(row)) continue;
  db.run('DELETE FROM local_vacaciones_empleados WHERE id = ?', [id]);
  removed++;
  console.log('[purge-hidden-vacaciones] Eliminado:', row.nombre || id);
}

persistDb();
console.log(`[purge-hidden-vacaciones] Total eliminados: ${removed}`);
