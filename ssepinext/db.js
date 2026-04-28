const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'ssepi-local.db');

const TABLES = [
  {
    name: 'local_ventas',
    indexCols: ['folio', 'estado', 'cliente_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_compras',
    indexCols: ['folio', 'estado', 'proveedor_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_ordenes_taller',
    indexCols: ['folio', 'estatus_actual', 'cliente_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_ordenes_motores',
    indexCols: ['folio', 'estatus_actual', 'cliente_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_proyectos_automatizacion',
    indexCols: ['folio', 'estatus_actual', 'cliente_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_cotizaciones',
    indexCols: ['folio', 'estado', 'cliente_nombre']
  },
  {
    name: 'local_facturas',
    indexCols: ['folio', 'estado', 'cliente_nombre', 'bloqueo_contable']
  },
  {
    name: 'local_inventario',
    indexCols: ['codigo', 'nombre', 'categoria', 'activo']
  },
  {
    name: 'local_contactos',
    indexCols: ['nombre', 'tipo', 'email']
  },
  {
    name: 'local_orden_historial',
    indexCols: ['orden_id', 'tabla_origen', 'evento']
  },
  {
    name: 'local_coi_sync_queue',
    indexCols: ['tabla_origen', 'registro_id', 'estatus']
  },
  {
    name: 'local_usuarios',
    indexCols: ['email', 'rol', 'activo']
  }
];

function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Core local tables with flexible JSON storage
  for (const t of TABLES) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${t.name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cloud_id TEXT UNIQUE,
        data TEXT NOT NULL DEFAULT '{}',
        sync_status TEXT NOT NULL DEFAULT 'pending_push' CHECK(sync_status IN ('pending_push', 'synced', 'conflict', 'deleted')),
        synced_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    for (const col of t.indexCols) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${t.name}_${col} ON ${t.name}(${col})`);
      } catch (_) { /* Some indexes may already exist with different definitions */ }
    }
  }

  // Sync state / metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_pull_at TEXT,
      last_push_at TEXT,
      server_online INTEGER DEFAULT 0,
      server_checked_at TEXT,
      pending_push_count INTEGER DEFAULT 0
    )
  `);
  db.prepare(`INSERT OR IGNORE INTO sync_state (id) VALUES (1)`).run();

  // Pending operations queue (for operations that need to be replayed to cloud)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('insert', 'update', 'delete')),
      cloud_id TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    )
  `);

  // Local sequence counters for folios when offline
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_sequences (
      prefix TEXT PRIMARY KEY,
      last_number INTEGER DEFAULT 0
    )
  `);

  return db;
}

// Helper to extract indexed columns from JSON and store them as virtual columns
function prepareStatement(db, tableName) {
  const t = TABLES.find(x => x.name === tableName);
  const indexCols = t ? t.indexCols : [];

  function extract(json, col) {
    try {
      const obj = JSON.parse(json);
      return obj[col] ?? null;
    } catch {
      return null;
    }
  }

  function insert(cloudId, dataObj) {
    const data = JSON.stringify(dataObj);
    const stmt = db.prepare(`INSERT INTO ${tableName} (cloud_id, data, sync_status, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`);
    const result = stmt.run(cloudId || null, data, cloudId ? 'synced' : 'pending_push');
    return { id: result.lastInsertRowid, ...dataObj };
  }

  function update(localId, dataObj) {
    const data = JSON.stringify(dataObj);
    const stmt = db.prepare(`UPDATE ${tableName} SET data = ?, sync_status = CASE WHEN cloud_id IS NULL THEN 'pending_push' ELSE 'pending_push' END, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(data, localId);
    return { id: localId, ...dataObj };
  }

  function upsertByCloudId(cloudId, dataObj) {
    const existing = db.prepare(`SELECT id FROM ${tableName} WHERE cloud_id = ?`).get(cloudId);
    if (existing) {
      const data = JSON.stringify(dataObj);
      db.prepare(`UPDATE ${tableName} SET data = ?, sync_status = 'synced', synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(data, existing.id);
      return { id: existing.id, ...dataObj };
    } else {
      return insert(cloudId, dataObj);
    }
  }

  function getById(localId) {
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(localId);
    if (!row) return null;
    try {
      return { local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) };
    } catch {
      return null;
    }
  }

  function getByCloudId(cloudId) {
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE cloud_id = ?`).get(cloudId);
    if (!row) return null;
    try {
      return { local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) };
    } catch {
      return null;
    }
  }

  function query(whereClause = '', params = [], orderBy = 'id DESC', limit = 1000) {
    const sql = `SELECT * FROM ${tableName} ${whereClause ? 'WHERE ' + whereClause : ''} ORDER BY ${orderBy} LIMIT ${limit}`;
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => {
      try {
        return { local_id: r.id, cloud_id: r.cloud_id, sync_status: r.sync_status, ...JSON.parse(r.data) };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  function remove(localId) {
    db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(localId);
  }

  function markDeleted(cloudId) {
    db.prepare(`UPDATE ${tableName} SET sync_status = 'deleted', updated_at = datetime('now') WHERE cloud_id = ?`).run(cloudId);
  }

  function getPendingPush() {
    return query("sync_status = 'pending_push'", [], 'updated_at ASC', 1000);
  }

  function setSynced(localId, cloudId) {
    db.prepare(`UPDATE ${tableName} SET cloud_id = COALESCE(cloud_id, ?), sync_status = 'synced', synced_at = datetime('now') WHERE id = ?`).run(cloudId, localId);
  }

  return {
    insert, update, upsertByCloudId, getById, getByCloudId, query, remove,
    markDeleted, getPendingPush, setSynced, extract
  };
}

function getSyncState(db) {
  return db.prepare('SELECT * FROM sync_state WHERE id = 1').get();
}

function setSyncState(db, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const cols = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE sync_state SET ${cols} WHERE id = 1`).run(...keys.map(k => updates[k]));
}

function queueOperation(db, tableName, operation, cloudId, payload) {
  db.prepare(`INSERT INTO pending_ops (table_name, operation, cloud_id, payload) VALUES (?, ?, ?, ?)`)
    .run(tableName, operation, cloudId || null, JSON.stringify(payload || {}));
}

function getPendingOps(db, limit = 100) {
  return db.prepare(`SELECT * FROM pending_ops ORDER BY created_at ASC LIMIT ?`).all(limit);
}

function removePendingOp(db, id) {
  db.prepare(`DELETE FROM pending_ops WHERE id = ?`).run(id);
}

function incrementRetry(db, id, error) {
  db.prepare(`UPDATE pending_ops SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`).run(error || null, id);
}

function getNextFolio(db, prefix) {
  const row = db.prepare(`SELECT last_number FROM local_sequences WHERE prefix = ?`).get(prefix);
  const next = (row ? row.last_number : 0) + 1;
  db.prepare(`INSERT INTO local_sequences (prefix, last_number) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET last_number = ?`).run(prefix, next, next);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

module.exports = {
  DB_PATH,
  initDb,
  TABLES,
  prepareStatement,
  getSyncState,
  setSyncState,
  queueOperation,
  getPendingOps,
  removePendingOp,
  incrementRetry,
  getNextFolio
};
