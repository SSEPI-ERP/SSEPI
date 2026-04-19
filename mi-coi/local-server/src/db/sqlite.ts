/**
 * SQLite database initialization and migration.
 * Uses better-sqlite3 for sync access (no async needed).
 * Extends the existing SistemaPolizas schema with sync tracking columns.
 */
import Database from 'better-sqlite3';

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Ensure core tables exist (compatible with existing SistemaPolizas schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS polizas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_poliza INTEGER,
      tipo_poliza TEXT NOT NULL,
      fecha TEXT NOT NULL,
      concepto TEXT NOT NULL,
      moneda TEXT DEFAULT 'MXN',
      tipo_cambio REAL DEFAULT 1.0,
      estatus TEXT DEFAULT 'C',
      usuario_afectacion TEXT,
      ts_afectacion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poliza_id INTEGER NOT NULL,
      num_cuenta TEXT NOT NULL,
      concepto_mov TEXT,
      cargo REAL DEFAULT 0,
      abono REAL DEFAULT 0,
      cliente_rfc TEXT,
      cliente_nombre TEXT,
      FOREIGN KEY (poliza_id) REFERENCES polizas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saldos_mensuales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      num_cuenta TEXT NOT NULL,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      cargo REAL DEFAULT 0,
      abono REAL DEFAULT 0,
      saldo REAL DEFAULT 0
    );

    -- Idempotency table (replaces sync_state.py)
    CREATE TABLE IF NOT EXISTS ssepi_erp_sync (
      source TEXT NOT NULL,
      erp_id TEXT NOT NULL,
      poliza_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (source, erp_id)
    );

    -- Sync tracking columns (added if not existing)
  `);

  // Add sync columns if they don't exist (SQLite ALTER TABLE is limited)
  const syncColumns = [
    { name: 'synced_postgres', type: 'INTEGER DEFAULT 0' },
    { name: 'erp_source', type: "TEXT DEFAULT ''" },
    { name: 'erp_id', type: "TEXT DEFAULT ''" },
  ];

  for (const col of syncColumns) {
    try {
      db.exec(`ALTER TABLE polizas ADD COLUMN ${col.name} ${col.type}`);
    } catch (_) { /* Column already exists */ }
  }

  // Sync history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK(direction IN ('push', 'pull')),
      records_processed INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT
    );
  `);

  return db;
}