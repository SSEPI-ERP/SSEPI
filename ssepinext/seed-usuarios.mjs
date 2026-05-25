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
  { id: 'user-002', email: 'ventas1@ssepi.org', password: 'Ssepi2025!', nombre: 'Carlos Calderon', rol: 'ventas', departamento: 'Ventas' },
  { id: 'user-003', email: 'ventas@ssepi.org', password: 'Ssepi2025!', nombre: 'Daniel Zuniga', rol: 'admin', departamento: 'Ventas' },
  { id: 'user-004', email: 'compras@ssepi.org', password: 'Ssepi2025!', nombre: 'Itzel', rol: 'compras', departamento: 'Compras' },
  { id: 'user-005', email: 'motores1@ssepi.org', password: 'Ssepi2025!', nombre: 'Becerra', rol: 'motores', departamento: 'Motores' },
  { id: 'user-006', email: 'automatizacion1@ssepi.org', password: 'Ssepi2025!', nombre: 'Tecnico', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-007', email: 'ivang.ssepi@gmail.com', password: 'Ssepi2025!', nombre: 'Ivan', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-008', email: 'administracion@ssepi.org', password: 'Ssepi2025!', nombre: 'Administracion', rol: 'administracion', departamento: 'Administracion' },
  { id: 'user-009', email: 'automatizacion@ssepi.org', password: 'Ssepi2025!', nombre: 'Arturo', rol: 'admin', departamento: 'Automatizacion' },
  { id: 'user-010', email: 'electronica@ssepi.org', password: 'Ssepi2025!', nombre: 'Javier', rol: 'admin', departamento: 'Laboratorio de Electronica' },
  { id: 'user-011', email: 'electronica.ssepi@gmail.com', password: 'Ssepi2025!', nombre: 'Aron', rol: 'taller', departamento: 'Laboratorio de Electronica' }
];

for (const u of users) {
  const passHash = hashPassword(u.password);
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO offline_usuarios (id, email, password_hash, nombre, rol, departamento, activo, auth_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`);
    stmt.run([u.id, u.email, passHash, u.nombre, u.rol, u.departamento || null, u.id]);
    stmt.free();
    console.log(`[OK] Usuario creado: ${u.email} (${u.nombre} / ${u.rol})`);
  } catch (e) {
    console.error(`[ERROR] ${u.email}:`, e.message);
  }
}

persistDb();
console.log('[seed-usuarios] Listo. Usuarios offline creados.');
