import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

export const DB_PATH = path.join(DB_DIR, 'ssepi-local.db');

export const TABLES = [
  { name: 'local_ventas', indexCols: ['folio','estado','cliente_nombre','bloqueo_contable'] },
  { name: 'local_compras', indexCols: ['folio','estado','proveedor_nombre','bloqueo_contable'] },
  { name: 'local_ordenes_taller', indexCols: ['folio','estatus_actual','cliente_nombre','bloqueo_contable'] },
  { name: 'local_ordenes_motores', indexCols: ['folio','estatus_actual','cliente_nombre','bloqueo_contable'] },
  { name: 'local_proyectos_automatizacion', indexCols: ['folio','estatus_actual','cliente_nombre','bloqueo_contable'] },
  { name: 'local_cotizaciones', indexCols: ['folio','estado','cliente_nombre'] },
  { name: 'local_facturas', indexCols: ['folio','estado','cliente_nombre','bloqueo_contable'] },
  { name: 'local_inventario', indexCols: ['codigo','nombre','categoria','activo'] },
  { name: 'local_contactos', indexCols: ['nombre','tipo','email'] },
  { name: 'local_orden_historial', indexCols: ['orden_id','tabla_origen','evento'] },
  { name: 'local_coi_sync_queue', indexCols: ['tabla_origen','registro_id','estatus'] },
  { name: 'local_usuarios', indexCols: ['email','rol','activo'] }
];

let _sql = null;
let _db = null;

async function getSQL() {
  if (!_sql) _sql = await initSqlJs();
  return _sql;
}

function persistDb() {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export async function getDb() {
  if (_db) return _db;
  const SQL = await getSQL();
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(filebuffer);
  } else {
    _db = new SQL.Database();
  }

  for (const t of TABLES) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS ${t.name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cloud_id TEXT UNIQUE,
        data TEXT NOT NULL DEFAULT '{}',
        sync_status TEXT NOT NULL DEFAULT 'pending_push' CHECK(sync_status IN ('pending_push','synced','conflict','deleted')),
        synced_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_pull_at TEXT,
      last_push_at TEXT,
      server_online INTEGER DEFAULT 0,
      server_checked_at TEXT,
      pending_push_count INTEGER DEFAULT 0
    );
    INSERT OR IGNORE INTO sync_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS pending_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
      cloud_id TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS local_sequences (
      prefix TEXT PRIMARY KEY,
      last_number INTEGER DEFAULT 0
    );
  `);

  persistDb();
  return _db;
}

export async function prepareStatement(_db, tableName) {
  function run(sql, params) {
    const stmt = _db.prepare(sql);
    const info = stmt.run(...params);
    stmt.free();
    return info;
  }

  function get(sql, params) {
    const stmt = _db.prepare(sql);
    const row = stmt.get(...params);
    stmt.free();
    return row || null;
  }

  function all(sql, params) {
    const stmt = _db.prepare(sql);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  async function insert(cloudId, dataObj) {
    const data = JSON.stringify(dataObj);
    const info = run(
      `INSERT INTO ${tableName} (cloud_id, data, sync_status, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [cloudId || null, data, cloudId ? 'synced' : 'pending_push']
    );
    persistDb();
    return { id: info.lastInsertRowid, ...dataObj };
  }

  async function update(localId, dataObj) {
    const data = JSON.stringify(dataObj);
    run(
      `UPDATE ${tableName} SET data = ?, sync_status = CASE WHEN cloud_id IS NULL THEN 'pending_push' ELSE 'pending_push' END, updated_at = datetime('now') WHERE id = ?`,
      [data, localId]
    );
    persistDb();
    return { id: localId, ...dataObj };
  }

  async function upsertByCloudId(cloudId, dataObj) {
    const existing = get(`SELECT id FROM ${tableName} WHERE cloud_id = ?`, [cloudId]);
    if (existing) {
      const data = JSON.stringify(dataObj);
      run(
        `UPDATE ${tableName} SET data = ?, sync_status = 'synced', synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [data, existing.id]
      );
      persistDb();
      return { id: existing.id, ...dataObj };
    } else {
      return insert(cloudId, dataObj);
    }
  }

  async function getById(localId) {
    const row = get(`SELECT * FROM ${tableName} WHERE id = ?`, [localId]);
    if (!row) return null;
    try { return { local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) }; }
    catch { return null; }
  }

  async function getByCloudId(cloudId) {
    const row = get(`SELECT * FROM ${tableName} WHERE cloud_id = ?`, [cloudId]);
    if (!row) return null;
    try { return { local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) }; }
    catch { return null; }
  }

  async function query(whereClause = '', params = [], orderBy = 'updated_at DESC', limit = 1000) {
    const sql = `SELECT * FROM ${tableName} ${whereClause ? 'WHERE ' + whereClause : ''} ORDER BY ${orderBy} LIMIT ${limit}`;
    const rows = all(sql, params);
    return rows.map(r => {
      try { return { local_id: r.id, cloud_id: r.cloud_id, sync_status: r.sync_status, ...JSON.parse(r.data) }; }
      catch { return null; }
    }).filter(Boolean);
  }

  async function remove(localId) {
    run(`DELETE FROM ${tableName} WHERE id = ?`, [localId]);
    persistDb();
  }

  async function markDeleted(cloudId) {
    run(`UPDATE ${tableName} SET sync_status = 'deleted', updated_at = datetime('now') WHERE cloud_id = ?`, [cloudId]);
    persistDb();
  }

  async function getPendingPush() {
    return query("sync_status = 'pending_push'", [], 'updated_at ASC', 1000);
  }

  async function setSynced(localId, cloudId) {
    run(
      `UPDATE ${tableName} SET cloud_id = COALESCE(cloud_id, ?), sync_status = 'synced', synced_at = datetime('now') WHERE id = ?`,
      [cloudId, localId]
    );
    persistDb();
  }

  return { insert, update, upsertByCloudId, getById, getByCloudId, query, remove, markDeleted, getPendingPush, setSynced };
}

export async function getSyncState(_db) {
  const stmt = _db.prepare('SELECT * FROM sync_state WHERE id = 1');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row || null;
}

export async function setSyncState(_db, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const cols = keys.map(k => `${k} = ?`).join(', ');
  const stmt = _db.prepare(`UPDATE sync_state SET ${cols} WHERE id = 1`);
  stmt.run(...keys.map(k => updates[k]));
  stmt.free();
  persistDb();
}

export async function queueOperation(_db, tableName, operation, cloudId, payload) {
  const stmt = _db.prepare(`INSERT INTO pending_ops (table_name, operation, cloud_id, payload) VALUES (?, ?, ?, ?)`);
  stmt.run(tableName, operation, cloudId || null, JSON.stringify(payload || {}));
  stmt.free();
  persistDb();
}

export async function getPendingOps(_db, limit = 100) {
  const stmt = _db.prepare(`SELECT * FROM pending_ops ORDER BY created_at ASC LIMIT ?`);
  const rows = [];
  stmt.bind([limit]);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export async function removePendingOp(_db, id) {
  const stmt = _db.prepare(`DELETE FROM pending_ops WHERE id = ?`);
  stmt.run([id]);
  stmt.free();
  persistDb();
}

export async function incrementRetry(_db, id, error) {
  const stmt = _db.prepare(`UPDATE pending_ops SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`);
  stmt.run([error || null, id]);
  stmt.free();
  persistDb();
}

export async function getNextFolio(_db, prefix) {
  let row = get(`SELECT last_number FROM local_sequences WHERE prefix = ?`, [prefix]);
  const next = (row ? row.last_number : 0) + 1;
  const stmt = _db.prepare(`INSERT INTO local_sequences (prefix, last_number) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET last_number = ?`);
  stmt.run([prefix, next, next]);
  stmt.free();
  persistDb();
  return `${prefix}-${String(next).padStart(4, '0')}`;
}
