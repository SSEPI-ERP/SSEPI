import crypto from 'crypto';
import { getDb, persistDb, prepareStatement } from './db.mjs';
import { SSEPI_USERS } from './users-catalog.mjs';

const db = await getDb();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

async function syncLocalUsuarios(u) {
  const stmtUsers = await prepareStatement(db, 'local_usuarios');
  const existing = await stmtUsers.query(`json_extract(data, '$.email') = ?`, [u.email], 'id ASC', 1);
  const record = {
    id: u.id,
    auth_user_id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    departamento: u.departamento || null,
    telefono: null,
    sede: null,
    nivel_riesgo: null,
    activo: true,
    updated_at: new Date().toISOString(),
  };
  if (existing.length === 0) {
    record.created_at = new Date().toISOString();
    await stmtUsers.insert(null, record);
  } else {
    const localId = existing[0].local_id || existing[0].id;
    await stmtUsers.update(localId, { ...existing[0], ...record });
  }
}

for (const u of SSEPI_USERS) {
  const passHash = hashPassword(u.password);
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO offline_usuarios (id, email, password_hash, nombre, rol, departamento, activo, auth_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`);
    stmt.run([u.id, u.email, passHash, u.nombre, u.rol, u.departamento || null, u.id]);
    stmt.free();
    await syncLocalUsuarios(u);
    console.log(`[OK] Usuario: ${u.email} (${u.nombre} / ${u.rol})`);
  } catch (e) {
    console.error(`[ERROR] ${u.email}:`, e.message);
  }
}

persistDb();
console.log('[seed-usuarios] Listo. Usuarios offline + local_usuarios sincronizados.');
