import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';
import { getDb, persistDb } from './db.mjs';
import { createOfflineProxyRouter } from './offline-proxy.mjs';
import { loginOfflineUser, verifyOfflineToken, getOfflineUserById, registerOfflineUser, listOfflineUsers, updateOfflineUser, changeOfflinePassword, signOfflineToken } from './offline-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

const db = await getDb();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Seed usuarios offline por defecto si la tabla esta vacia (no bloqueante)
(async function seedDefaultUsers() {
  try {
    const check = db.prepare(`SELECT COUNT(*) as c FROM offline_usuarios`);
    let count = 0;
    if (check.step()) count = check.getAsObject().c || 0;
    check.free();
    if (count === 0) {
      console.log('[offline-server] offline_usuarios vacia. Creando usuarios por defecto...');
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
        try {
          const passHash = await registerOfflineUser(u.email, u.password, u.nombre, u.rol, u.departamento, u.id);
        } catch (e) { /* ya existe o error */ }
      }
      console.log('[offline-server] Usuarios por defecto creados.');
    }
  } catch (e) {
    console.warn('[offline-server] Seed usuarios skipped:', e.message);
  }
})();

// ========================================
// AUTH LOCAL
// ========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Faltan email o password' });
    const result = await loginOfflineUser(email, password);
    res.json({ data: result });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Logout local (elimina token en cliente)' });
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = verifyOfflineToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido o expirado' });
    const user = await getOfflineUserById(payload.sub);
    if (!user || !user.activo) return res.status(401).json({ error: 'Usuario inactivo' });
    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: { nombre: user.nombre, rol: user.rol, departamento: user.departamento }
        },
        session: {
          access_token: token,
          token_type: 'bearer',
          expires_at: payload.exp
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/user', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = verifyOfflineToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });
    const user = await getOfflineUserById(payload.sub);
    if (!user) return res.status(404).json({ error: 'No encontrado' });
    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: { nombre: user.nombre, rol: user.rol, departamento: user.departamento }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = verifyOfflineToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });
    const newPayload = { ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 24*60*60 };
    const newToken = signOfflineToken(newPayload);
    res.json({ data: { session: { access_token: newToken, token_type: 'bearer', expires_at: newPayload.exp } } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: listar usuarios
app.get('/api/auth/users', async (req, res) => {
  try {
    const rows = await listOfflineUsers();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: crear usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nombre, rol, departamento } = req.body;
    const user = await registerOfflineUser(email, password, nombre, rol, departamento);
    res.json({ data: user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================
// PROXY OFFLINE (PostgREST compatible)
// ========================================
app.use('/proxy', createOfflineProxyRouter(db));

// ========================================
// API SEARCH ENDPOINTS (BOM + Inventario)
// ========================================
app.get('/api/bom-search', (req, res) => {
  try {
    const { q, categoria, limit } = req.query;
    const term = (q || '').toLowerCase().trim();
    const lim = parseInt(limit) || 50;
    let sql = 'SELECT id, data FROM local_bom_automatizacion WHERE 1=1';
    const params = [];
    if (term) {
      sql += ' AND (LOWER(JSON_EXTRACT(data, "$.descripcion")) LIKE ? OR LOWER(JSON_EXTRACT(data, "$.part_number")) LIKE ? OR LOWER(JSON_EXTRACT(data, "$.categoria_original")) LIKE ?)';
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (categoria) {
      sql += ' AND JSON_EXTRACT(data, "$.categoria") = ?';
      params.push(categoria);
    }
    sql += ` ORDER BY id ASC LIMIT ${lim}`;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    const result = rows.map(r => {
      const d = JSON.parse(r.data);
      let provs = [];
      try { provs = JSON.parse(d.proveedores || '[]'); } catch(e) {}
      return { id: r.id, numero_item: d.numero_item, part_number: d.part_number, descripcion: d.descripcion, categoria: d.categoria, categoria_original: d.categoria_original, estado_actualizacion: d.estado_actualizacion, mejor_precio: d.mejor_precio, tiene_imagen: d.tiene_imagen, proveedores: provs };
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory-search', (req, res) => {
  try {
    const { q, categoria, tipo, limit } = req.query;
    const term = (q || '').toLowerCase().trim();
    const lim = parseInt(limit) || 100;
    let sql = 'SELECT id, data FROM local_inventario WHERE 1=1';
    const params = [];
    if (term) {
      sql += ' AND (LOWER(JSON_EXTRACT(data, "$.nombre")) LIKE ? OR LOWER(JSON_EXTRACT(data, "$.sku")) LIKE ? OR LOWER(JSON_EXTRACT(data, "$.descripcion")) LIKE ?)';
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (categoria) {
      sql += ' AND JSON_EXTRACT(data, "$.categoria") = ?';
      params.push(categoria);
    }
    if (tipo) {
      sql += ' AND JSON_EXTRACT(data, "$.tipo_inventario") = ?';
      params.push(tipo);
    }
    sql += ` ORDER BY id ASC LIMIT ${lim}`;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    const result = rows.map(r => {
      const d = JSON.parse(r.data);
      return { id: r.id, sku: d.sku, nombre: d.nombre, descripcion: d.descripcion, categoria: d.categoria, ubicacion: d.ubicacion, stock: d.stock, costo: d.costo, costo_local: d.costo_local, costo_online: d.costo_online, precio_venta: d.precio_venta, encapsulado: d.encapsulado, tipo_inventario: d.tipo_inventario, link_octopart: d.link_octopart, link_digikey: d.link_digikey, link_mouser: d.link_mouser };
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// Health
// ========================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'ssepi-offline', db_path: 'data/ssepi-local.db' });
});

// ========================================
// REALTIME fallback (WebSocket no disponible offline)
// ========================================
app.get('/proxy/realtime/v1/websocket', (_req, res) => {
  res.status(426).json({ message: 'Realtime offline no disponible' });
});

// ========================================
// SERVIR ERP WEB + ASSETS
// ========================================
app.use('/panel', express.static(path.join(__dirname, '..', 'panel')));
app.use('/assets', express.static(path.join(__dirname, '..', 'panel', 'assets')));

app.get('/', (_req, res) => {
  res.redirect('/panel/login.html');
});

// ========================================
// INICIO: HTTP + HTTPS
// ========================================

function getLocalIPs() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

const httpServer = http.createServer(app);
const httpPort = PORT;

// HTTPS con certificado auto-firmado para acceso desde otros dispositivos
const certPath = path.join(__dirname, 'certs', 'ssepi-local-cert.pem');
const keyPath = path.join(__dirname, 'certs', 'ssepi-local-key.pem');
let httpsServer = null;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  httpsServer = https.createServer(httpsOptions, app);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`[SSEPI-OFFLINE] HTTPS en https://localhost:${HTTPS_PORT}`);
    getLocalIPs().forEach(ip => console.log(`[SSEPI-OFFLINE] HTTPS LAN: https://${ip}:${HTTPS_PORT}/panel/panel.html`));
  });
  httpsServer.on('upgrade', (req, socket) => {
    socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
    socket.destroy();
  });
} else {
  console.log('[SSEPI-OFFLINE] Sin certs/ — HTTPS no disponible (solo HTTP)');
}

httpServer.listen(httpPort, '0.0.0.0', () => {
  console.log(`[SSEPI-OFFLINE] HTTP  en http://localhost:${httpPort}`);
  console.log(`[SSEPI-OFFLINE] ERP:  http://localhost:${httpPort}/panel/panel.html`);
  console.log(`[SSEPI-OFFLINE] Auth local: POST /api/auth/login`);
  console.log(`[SSEPI-OFFLINE] Proxy local: /proxy/rest/v1/{tabla}`);
  console.log(`[SSEPI-OFFLINE] SQLite: ./data/ssepi-local.db`);
});

httpServer.on('upgrade', (req, socket) => {
  console.log('[SSEPI-OFFLINE] WebSocket rechazado (realtime offline)');
  socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
  socket.destroy();
});

