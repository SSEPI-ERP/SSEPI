import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, 'data');
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
  { name: 'local_actividades_contactos', indexCols: ['contacto_id','fecha','tipo'] },
  { name: 'local_orden_historial', indexCols: ['orden_id','tabla_origen','evento'] },
  { name: 'local_coi_sync_queue', indexCols: ['tabla_origen','registro_id','estatus'] },
  { name: 'local_usuarios', indexCols: ['email','rol','activo'] },
  { name: 'local_role_permissions', indexCols: ['rol','module','action'] },
  { name: 'local_users_ver_costos', indexCols: ['auth_user_id'] },
  { name: 'local_auth_logs', indexCols: ['email_hash','timestamp'] },
  { name: 'local_audit_logs', indexCols: ['usuario_id','accion','created_at'] },
  { name: 'local_parametros_costos', indexCols: ['clave'] },
  { name: 'local_clientes_tabulador', indexCols: ['nombre','tipo_servicio'] },
  { name: 'local_estado_pipeline_unificado', indexCols: ['tabla_origen','estado_actual'] },
  { name: 'local_eventos_contables_coi', indexCols: ['tabla_origen','estatus'] },
  { name: 'local_n8n_heartbeat', indexCols: [] },
  { name: 'local_n8n_insights', indexCols: ['dismissed'] },
  { name: 'local_politicas_modulos', indexCols: ['modulo'] },
  { name: 'local_inbound_emails', indexCols: ['leido'] },
  { name: 'local_security_alerts', indexCols: ['estado'] },
  { name: 'local_user_module_permissions', indexCols: ['user_id','module'] },
  { name: 'local_movimientos_inventario', indexCols: ['producto_id','tipo_movimiento'] },
  { name: 'local_bom_automatizacion', indexCols: ['proyecto_id','tipo'] },
  { name: 'local_calculadoras', indexCols: ['nombre','departamento'] },
  { name: 'local_calculadora_costos', indexCols: ['calculadora_id','concepto'] },
  { name: 'local_calculadora_clientes', indexCols: ['calculadora_id','cliente_nombre'] },
  { name: 'local_calculadora_hoja_filas', indexCols: ['calculadora_id','fila_orden'] },
  { name: 'local_servicios_automatizacion', indexCols: ['nombre','categoria'] },
  { name: 'local_ingresos_contabilidad', indexCols: ['estatus','monto_total'] },
  { name: 'local_notificaciones', indexCols: ['para','leido','tipo'] },
  { name: 'local_suministros_items', indexCols: ['suministro_id','source','sku'] },
  { name: 'local_soporte_visitas', indexCols: ['folio','estado','cliente','origen'] },
  { name: 'local_actividades_diarias', indexCols: ['fecha','estado','user_id'] },
  { name: 'local_actividades_historial', indexCols: ['actividad_id','evento'] },
  { name: 'local_actividades_subtareas', indexCols: ['actividad_id','done','orden'] },
  { name: 'local_clientes_adeudos', indexCols: ['cliente_id','recuperado'] },
  { name: 'local_pagos_nomina', indexCols: ['empleado_nombre','fecha_pago','estado'] },
  { name: 'local_vacaciones_empleados', indexCols: ['nombre','rol','email','orden'] },
  { name: 'local_vacaciones_dias_feriados', indexCols: ['fecha','tipo','anio'] },
  { name: 'local_vacaciones_balance', indexCols: ['user_id','anio'] },
  { name: 'local_vacaciones_solicitudes', indexCols: ['user_id','estado','fecha_desde','fecha_hasta'] }
];

let _sql = null;
let _db = null;
let _deferPersist = false;

/** Evita reescribir el .db en cada insert (seeds por lote). */
export function setDeferPersist(defer) {
  _deferPersist = !!defer;
}

async function getSQL() {
  if (!_sql) _sql = await initSqlJs();
  return _sql;
}

export function persistDb() {
  if (!_db || _deferPersist) return;
  const data = _db.export();
  if (!data || data.length < 16) return;
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export async function getDb() {
  if (_db) return _db;
  const SQL = await getSQL();
  if (fs.existsSync(DB_PATH)) {
    const stat = fs.statSync(DB_PATH);
    if (stat.size < 16) {
      console.warn('[db] ssepi-local.db vacío o corrupto — se recrea desde cero');
      try { fs.unlinkSync(DB_PATH); } catch { /* ignore */ }
      _db = new SQL.Database();
    } else {
      const filebuffer = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(filebuffer);
    }
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

    CREATE TABLE IF NOT EXISTS offline_usuarios (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'ventas',
      departamento TEXT,
      activo INTEGER DEFAULT 1,
      auth_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migracion segura: asegurar auth_user_id en tablas existentes
  try {
    _db.exec(`ALTER TABLE offline_usuarios ADD COLUMN auth_user_id TEXT`);
  } catch(e) { /* ya existe */ }

  persistDb();
  return _db;
}

export async function prepareStatement(_db, tableName) {
  function run(sql, params) {
    const stmt = _db.prepare(sql);
    const info = stmt.run(params);
    stmt.free();
    return info;
  }

  function get(sql, params) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  function all(sql, params) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  async function insert(cloudId, dataObj) {
    const data = JSON.stringify(dataObj);
    run(
      `INSERT INTO ${tableName} (cloud_id, data, sync_status, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [cloudId || null, data, cloudId ? 'synced' : 'pending_push']
    );
    const idRes = _db.exec("SELECT last_insert_rowid()")[0];
    const id = idRes.values[0][0];
    const dataWithId = JSON.stringify({ ...dataObj, id });
    run(`UPDATE ${tableName} SET data = ? WHERE id = ?`, [dataWithId, id]);
    persistDb();
    return { id, ...dataObj };
  }

  async function update(localId, dataObj) {
    const data = JSON.stringify({ ...dataObj, id: localId });
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
    try { return { id: row.id, local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) }; }
    catch { return null; }
  }

  async function getByCloudId(cloudId) {
    const row = get(`SELECT * FROM ${tableName} WHERE cloud_id = ?`, [cloudId]);
    if (!row) return null;
    try { return { id: row.id, local_id: row.id, cloud_id: row.cloud_id, sync_status: row.sync_status, ...JSON.parse(row.data) }; }
    catch { return null; }
  }

  function normalizeOrderBy(orderByStr) {
    const REAL_COLS = new Set(['id','cloud_id','sync_status','synced_at','created_at','updated_at']);
    return orderByStr.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s+(ASC|DESC)/gi, (_match, col, dir) => {
      if (REAL_COLS.has(col)) return `${col} ${dir}`;
      return `json_extract(data, '$.${col}') ${dir}`;
    });
  }

  async function query(whereClause = '', params = [], orderBy = 'updated_at DESC', limit = 1000) {
    const normalizedOrder = normalizeOrderBy(orderBy);
    const sql = `SELECT * FROM ${tableName} ${whereClause ? 'WHERE ' + whereClause : ''} ORDER BY ${normalizedOrder} LIMIT ${limit}`;
    const rows = all(sql, params);
    return rows.map(r => {
      try { return { id: r.id, local_id: r.id, cloud_id: r.cloud_id, sync_status: r.sync_status, ...JSON.parse(r.data) }; }
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
  stmt.run(keys.map(k => updates[k]));
  stmt.free();
  persistDb();
}

export async function queueOperation(_db, tableName, operation, cloudId, payload) {
  const stmt = _db.prepare(`INSERT INTO pending_ops (table_name, operation, cloud_id, payload) VALUES (?, ?, ?, ?)`);
  stmt.run([tableName, operation, cloudId || null, JSON.stringify(payload || {})]);
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

/** Laboratorio: prefix SP-E → SP-E0687 (sin guion extra). Otros: PREFIX-0001 */
export async function getNextFolio(_db, prefix) {
  const p = String(prefix || '').toUpperCase();
  let row = get(`SELECT last_number FROM local_sequences WHERE prefix = ?`, [p]);
  const next = (row ? row.last_number : 0) + 1;
  const stmt = _db.prepare(`INSERT INTO local_sequences (prefix, last_number) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET last_number = ?`);
  stmt.run([p, next, next]);
  stmt.free();
  persistDb();
  if (p === 'SP-E') return `SP-E${String(next).padStart(4, '0')}`;
  return `${p}-${String(next).padStart(4, '0')}`;
}
