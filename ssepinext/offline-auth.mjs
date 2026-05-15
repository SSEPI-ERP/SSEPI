import crypto from 'crypto';
import { getDb, persistDb } from './db.mjs';

const JWT_SECRET = process.env.JWT_SECRET || 'ssepi-offline-secret-cambiar-en-produccion';
const JWT_EXPIRES = 24 * 60 * 60; // 24h

function base64UrlEscape(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function base64UrlUnescape(str) {
  str += new Array(5 - (str.length % 4)).join('=');
  return str.replace(/\-/g, '+').replace(/\_/g, '/');
}

function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const segments = [];
  segments.push(base64UrlEscape(Buffer.from(JSON.stringify(header)).toString('base64')));
  segments.push(base64UrlEscape(Buffer.from(JSON.stringify(payload)).toString('base64')));
  const signingInput = segments.join('.');
  const hmac = crypto.createHmac('sha256', secret).update(signingInput).digest('base64');
  segments.push(base64UrlEscape(hmac));
  return segments.join('.');
}

function verify(token, secret) {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const signingInput = segments[0] + '.' + segments[1];
  const hmac = crypto.createHmac('sha256', secret).update(signingInput).digest('base64');
  if (base64UrlEscape(hmac) !== segments[2]) return null;
  try {
    const payload = JSON.parse(Buffer.from(base64UrlUnescape(segments[1]), 'base64').toString());
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch { return null; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return derived === hash;
}

export async function registerOfflineUser(email, password, nombre, rol, departamento, customId) {
  const db = await getDb();
  const check = db.prepare(`SELECT id FROM offline_usuarios WHERE email = ?`);
  check.bind([email]);
  let exists = false;
  if (check.step()) exists = true;
  check.free();
  if (exists) throw new Error('Usuario ya existe');

  const id = customId || crypto.randomUUID();
  const passHash = hashPassword(password);
  const stmt = db.prepare(`INSERT INTO offline_usuarios (id, email, password_hash, nombre, rol, departamento, activo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`);
  stmt.run([id, email, passHash, nombre, rol, departamento || null]);
  stmt.free();
  persistDb();
  return { id, email, nombre, rol };
}

export async function loginOfflineUser(email, password) {
  const db = await getDb();
  const stmt = db.prepare(`SELECT * FROM offline_usuarios WHERE email = ? AND activo = 1`);
  stmt.bind([email]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  if (!row) throw new Error('Credenciales inválidas');
  if (!verifyPassword(password, row.password_hash)) throw new Error('Credenciales inválidas');

  const payload = {
    sub: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol,
    departamento: row.departamento,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES
  };
  const token = sign(payload, JWT_SECRET);
  const userMeta = { nombre: row.nombre, rol: row.rol, departamento: row.departamento };
  return {
    user: { id: row.id, email: row.email, user_metadata: userMeta },
    session: {
      access_token: token,
      token_type: 'bearer',
      expires_in: JWT_EXPIRES,
      expires_at: payload.exp,
      user: { id: row.id, email: row.email, user_metadata: userMeta }
    }
  };
}

export function verifyOfflineToken(token) {
  return verify(token, JWT_SECRET);
}

export function signOfflineToken(payload) {
  return sign(payload, JWT_SECRET);
}

export async function getOfflineUserById(id) {
  const db = await getDb();
  const stmt = db.prepare(`SELECT id, email, nombre, rol, departamento, activo, created_at, updated_at FROM offline_usuarios WHERE id = ?`);
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

export async function listOfflineUsers() {
  const db = await getDb();
  const stmt = db.prepare(`SELECT id, email, nombre, rol, departamento, activo, created_at, updated_at FROM offline_usuarios ORDER BY nombre`);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export async function updateOfflineUser(id, updates) {
  const db = await getDb();
  const allowed = ['nombre', 'rol', 'departamento', 'activo'];
  const cols = [];
  const vals = [];
  for (const k of allowed) {
    if (updates[k] !== undefined) { cols.push(`${k} = ?`); vals.push(updates[k]); }
  }
  if (cols.length === 0) return null;
  vals.push(id);
  const stmt = db.prepare(`UPDATE offline_usuarios SET ${cols.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
  stmt.run(vals);
  stmt.free();
  persistDb();
  return getOfflineUserById(id);
}

export async function changeOfflinePassword(id, newPassword) {
  const db = await getDb();
  const passHash = hashPassword(newPassword);
  const stmt = db.prepare(`UPDATE offline_usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`);
  stmt.run([passHash, id]);
  stmt.free();
  persistDb();
  return true;
}
