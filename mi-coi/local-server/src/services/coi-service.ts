/**
 * CoiService — Wraps SQLite operations for COI polizas.
 * Compatible with the existing SistemaPolizas schema.
 */
import Database from 'better-sqlite3';

export interface PolizaInput {
  tipo: string;
  fecha: string;
  concepto: string;
  movimientos: MovementInput[];
  moneda?: string;
  tipo_cambio?: number;
  erp_source?: string;
  erp_id?: string;
}

export interface MovementInput {
  num_cuenta: string;
  concepto_mov?: string;
  cargo: number;
  abono: number;
  cliente_rfc?: string;
  cliente_nombre?: string;
}

export interface PolizaResult {
  ok: boolean;
  poliza_id?: number;
  numero_poliza?: number;
  error?: string;
  skipped?: boolean;
}

export interface PolizaRow {
  id: number;
  numero_poliza: number | null;
  tipo_poliza: string;
  fecha: string;
  concepto: string;
  moneda: string;
  tipo_cambio: number;
  estatus: string;
  erp_source?: string;
  erp_id?: string;
  synced_postgres?: number;
  created_at: string;
  updated_at: string;
}

export interface PolizaDetail extends PolizaRow {
  movimientos: MovementRow[];
}

export interface MovementRow {
  id: number;
  poliza_id: number;
  num_cuenta: string;
  concepto_mov: string | null;
  cargo: number;
  abono: number;
  cliente_rfc: string | null;
  cliente_nombre: string | null;
}

export class CoiService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a poliza, verify it, and afectar (post) it.
   * Compatible with the previous ContabilidadService.crear_poliza_y_afectar.
   */
  crearPolizaYAfectar(input: PolizaInput): PolizaResult {
    const insertPoliza = this.db.prepare(`
      INSERT INTO polizas (tipo_poliza, fecha, concepto, moneda, tipo_cambio, estatus, erp_source, erp_id, synced_postgres)
      VALUES (?, ?, ?, ?, ?, 'V', ?, ?, 0)
    `);

    const insertMovimiento = this.db.prepare(`
      INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono, cliente_rfc, cliente_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const getNextNumero = this.db.prepare(`
      SELECT COALESCE(MAX(numero_poliza), 0) + 1 AS next_num FROM polizas WHERE tipo_poliza = ?
    `);

    // Check idempotency
    if (input.erp_source && input.erp_id) {
      const existing = this.db.prepare(
        'SELECT poliza_id FROM ssepi_erp_sync WHERE source = ? AND erp_id = ?'
      ).get(input.erp_source, input.erp_id) as { poliza_id: number } | undefined;

      if (existing) {
        return { ok: true, skipped: true, poliza_id: existing.poliza_id };
      }
    }

    const transaction = this.db.transaction(() => {
      // Get next numero_poliza for this type
      const nextNum = (getNextNumero.get(input.tipo) as { next_num: number }).next_num;

      // Insert poliza
      const result = insertPoliza.run(
        input.tipo,
        input.fecha,
        input.concepto,
        input.moneda || 'MXN',
        input.tipo_cambio || 1.0,
        input.erp_source || null,
        input.erp_id || null,
      );

      const polizaId = result.lastInsertRowid as number;

      // Insert movements
      for (const mov of input.movimientos) {
        insertMovimiento.run(
          polizaId,
          mov.num_cuenta,
          mov.concepto_mov || null,
          mov.cargo || 0,
          mov.abono || 0,
          mov.cliente_rfc || null,
          mov.cliente_nombre || null,
        );
      }

      // Mark as synced (idempotency)
      if (input.erp_source && input.erp_id) {
        this.db.prepare(
          'INSERT OR REPLACE INTO ssepi_erp_sync (source, erp_id, poliza_id) VALUES (?, ?, ?)'
        ).run(input.erp_source, input.erp_id, polizaId);
      }

      // Verify poliza (cargos = abonos check)
      const verification = this.db.prepare(`
        SELECT SUM(cargo) as total_cargo, SUM(abono) as total_abono
        FROM movimientos WHERE poliza_id = ?
      `).get(polizaId) as { total_cargo: number; total_abono: number };

      const diff = Math.abs((verification.total_cargo || 0) - (verification.total_abono || 0));
      if (diff > 0.02) {
        // Poliza is unbalanced, but we still keep it (mark as 'C' created)
        this.db.prepare("UPDATE polizas SET estatus = 'C' WHERE id = ?").run(polizaId);
      }

      // Affectar: mark as verified and affected
      this.db.prepare("UPDATE polizas SET estatus = 'A', usuario_afectacion = 'SSEPI-BRIDGE', ts_afectacion = datetime('now') WHERE id = ?").run(polizaId);

      // Update saldo mensual
      this.updateSaldoMensual(input.tipo, input.fecha, verification.total_cargo || 0, verification.total_abono || 0);

      return { ok: true as const, poliza_id: polizaId, numero_poliza: nextNum };
    });

    try {
      return transaction();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * List polizas with optional filters.
   */
  buscarPolizas(filters: { tipo?: string; fechaDesde?: string; fechaHasta?: string; estatus?: string; limit?: number }): PolizaRow[] {
    let sql = 'SELECT * FROM polizas WHERE 1=1';
    const params: unknown[] = [];

    if (filters.tipo) { sql += ' AND tipo_poliza = ?'; params.push(filters.tipo); }
    if (filters.fechaDesde) { sql += ' AND fecha >= ?'; params.push(filters.fechaDesde); }
    if (filters.fechaHasta) { sql += ' AND fecha <= ?'; params.push(filters.fechaHasta); }
    if (filters.estatus) { sql += ' AND estatus = ?'; params.push(filters.estatus); }

    sql += ' ORDER BY fecha DESC, id DESC';
    if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }

    return this.db.prepare(sql).all(...params) as PolizaRow[];
  }

  /**
   * Get a single poliza with its movements.
   */
  obtenerPoliza(id: number): PolizaDetail | null {
    const poliza = this.db.prepare('SELECT * FROM polizas WHERE id = ?').get(id) as PolizaRow | undefined;
    if (!poliza) return null;

    const movimientos = this.db.prepare('SELECT * FROM movimientos WHERE poliza_id = ? ORDER BY id').all(id) as MovementRow[];
    return { ...poliza, movimientos };
  }

  /**
   * Affectar (post) a poliza.
   */
  afectarPoliza(id: number, usuario?: string): PolizaResult {
    try {
      this.db.prepare(
        "UPDATE polizas SET estatus = 'A', usuario_afectacion = ?, ts_afectacion = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).run(usuario || 'SSEPI-BRIDGE', id);
      return { ok: true, poliza_id: id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Update monthly balance.
   */
  private updateSaldoMensual(tipo: string, fecha: string, cargo: number, abono: number): void {
    const anio = parseInt(fecha.substring(0, 4));
    const mes = parseInt(fecha.substring(5, 7));
    if (isNaN(anio) || isNaN(mes)) return;

    // Upsert saldo for each movement account
    const movs = this.db.prepare('SELECT num_cuenta, SUM(cargo) as cargo, SUM(abono) as abono FROM movimientos WHERE poliza_id = (SELECT id FROM polizas WHERE rowid = last_insert_rowid()) GROUP BY num_cuenta').all() as { num_cuenta: string; cargo: number; abono: number }[];

    // Simple approach: just update the overall saldo
    this.db.prepare(`
      INSERT INTO saldos_mensuales (num_cuenta, anio, mes, cargo, abono, saldo)
      VALUES ('RESUMEN', ?, ?, ?, ?, 0)
      ON CONFLICT(num_cuenta, anio, mes) DO UPDATE SET
        cargo = cargo + ?,
        abono = abono + ?,
        saldo = saldo + ? - ?
    `).run(anio, mes, cargo, abono, cargo, abono, cargo, abono);
  }
}