import crypto from 'crypto';
import { getDb, persistDb } from './db.mjs';

const db = await getDb();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

const users = [
  { id: 'user-001', email: 'norbertomoro4@gmail.com', password: 'Ssepi2025!', nombre: 'Norberto Moro', rol: 'superadmin', departamento: 'Administracion' },
  { id: 'user-002', email: 'ventas1@ssepi.org', password: 'Ssepi2025!', nombre: 'Ventas 1', rol: 'ventas', departamento: 'Ventas' },
  { id: 'user-003', email: 'laboratorio1@ssepi.org', password: 'Ssepi2025!', nombre: 'Laboratorio 1', rol: 'admin', departamento: 'Laboratorio' },
  { id: 'user-004', email: 'motores1@ssepi.org', password: 'Ssepi2025!', nombre: 'Motores 1', rol: 'admin', departamento: 'Motores' },
  { id: 'user-005', email: 'automatizacion1@ssepi.org', password: 'Ssepi2025!', nombre: 'Automatizacion 1', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-006', email: 'ivang.ssepi@gmail.com', password: 'Ssepi2025!', nombre: 'Ivan Garcia', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-007', email: 'administracion@ssepi.org', password: 'Ssepi2025!', nombre: 'Admin SSEPI', rol: 'admin', departamento: 'Administracion' }
];

for (const u of users) {
  const passHash = hashPassword(u.password);
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO offline_usuarios (id, email, password_hash, nombre, rol, departamento, activo, auth_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`);
    stmt.run([u.id, u.email, passHash, u.nombre, u.rol, u.departamento || null, u.id]);
    stmt.free();
    console.log(`[OK] Usuario creado: ${u.email} (${u.rol})`);
  } catch (e) {
    console.error(`[ERROR] ${u.email}:`, e.message);
  }
}

persistDb();
console.log('[seed-usuarios] Listo. Usuarios offline creados.');
