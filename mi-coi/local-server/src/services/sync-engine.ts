/**
 * SyncEngine — Bidirectional sync between Postgres (Supabase) and SQLite (local COI).
 * Pull: Postgres coi_polizas → SQLite polizas
 * Push: SQLite polizas → Postgres coi_polizas
 */
import Database from 'better-sqlite3';
import { SupabaseClient } from '@supabase/supabase-js';

export interface SyncResult {
  pulled: number;
  pushed: number;
  failed: number;
  errors: string[];
}

export interface SyncStatus {
  lastPull: string | null;
  lastPush: string | null;
  pendingLocal: number;
  pendingRemote: number;
  sqliteOk: boolean;
  postgresOk: boolean;
}

export class SyncEngine {
  private db: Database.Database;
  private supabase: SupabaseClient | null;

  constructor(db: Database.Database, supabase: SupabaseClient | null) {
    this.db = db;
    this.supabase = supabase;
  }

  /**
   * Pull polizas from Postgres that haven't been synced locally.
   */
  async pullFromPostgres(): Promise<SyncResult> {
    if (!this.supabase) return { pulled: 0, pushed: 0, failed: 0, errors: ['No Supabase connection'] };

    const result: SyncResult = { pulled: 0, pushed: 0, failed: 0, errors: [] };
    const startTime = new Date().toISOString();

    try {
      // Fetch polizas not yet synced to local
      const { data: polizas, error: fetchError } = await this.supabase
        .from('coi_polizas')
        .select('*, coi_movimientos(*)')
        .eq('synced_local', false)
        .order('created_at', { ascending: true })
        .limit(50);

      if (fetchError) {
        result.errors.push(fetchError.message);
        return result;
      }

      if (!polizas || polizas.length === 0) {
        this.logSync('pull', 0, 0, startTime);
        return result;
      }

      for (const poliza of polizas) {
        try {
          // Check idempotency
          const existing = this.db.prepare(
            'SELECT poliza_id FROM ssepi_erp_sync WHERE source = ? AND erp_id = ?'
          ).get(poliza.erp_source, poliza.erp_id) as { poliza_id: number } | undefined;

          if (existing) {
            // Already synced, just mark as synced in Postgres
            await this.markSyncedLocal(poliza.id);
            continue;
          }

          // Insert into SQLite
          const insertPoliza = this.db.prepare(`
            INSERT INTO polizas (tipo_poliza, fecha, concepto, moneda, tipo_cambio, estatus, erp_source, erp_id, synced_postgres)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `);

          const polizaResult = insertPoliza.run(
            poliza.tipo_poliza, poliza.fecha, poliza.concepto,
            poliza.moneda || 'MXN', poliza.tipo_cambio || 1.0,
            poliza.estatus || 'V', poliza.erp_source, poliza.erp_id
          );

          const localId = polizaResult.lastInsertRowid as number;

          // Insert movements
          if (poliza.coi_movimientos && poliza.coi_movimientos.length > 0) {
            const insertMov = this.db.prepare(
              'INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono, cliente_rfc, cliente_nombre) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            for (const mov of poliza.coi_movimientos) {
              insertMov.run(localId, mov.num_cuenta, mov.concepto_mov, mov.cargo, mov.abono, mov.cliente_rfc, mov.cliente_nombre);
            }
          }

          // Mark idempotency
          this.db.prepare(
            'INSERT OR REPLACE INTO ssepi_erp_sync (source, erp_id, poliza_id) VALUES (?, ?, ?)'
          ).run(poliza.erp_source, poliza.erp_id, localId);

          // Mark as synced in Postgres
          await this.markSyncedLocal(poliza.id);

          result.pulled++;
        } catch (err) {
          result.failed++;
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      }

      this.logSync('pull', result.pulled, result.failed, startTime);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    return result;
  }

  /**
   * Push local polizas to Postgres that haven't been synced remotely.
   */
  async pushToPostgres(): Promise<SyncResult> {
    if (!this.supabase) return { pulled: 0, pushed: 0, failed: 0, errors: ['No Supabase connection'] };

    const result: SyncResult = { pulled: 0, pushed: 0, failed: 0, errors: [] };
    const startTime = new Date().toISOString();

    try {
      // Find local polizas not yet synced to Postgres
      const localPolizas = this.db.prepare(
        'SELECT * FROM polizas WHERE synced_postgres = 0 AND erp_source IS NOT NULL AND erp_id IS NOT NULL AND erp_source != \'\' AND erp_id != \'\''
      ).all() as any[];

      for (const poliza of localPolizas) {
        try {
          // Get movements
          const movements = this.db.prepare('SELECT * FROM movimientos WHERE poliza_id = ?').all(poliza.id) as any[];

          // Check if already exists in Postgres
          const { data: existing } = await this.supabase
            .from('coi_polizas')
            .select('id')
            .eq('erp_source', poliza.erp_source)
            .eq('erp_id', poliza.erp_id)
            .maybeSingle();

          if (existing) {
            // Already exists, just mark local as synced
            this.db.prepare('UPDATE polizas SET synced_postgres = 1 WHERE id = ?').run(poliza.id);
            continue;
          }

          // Insert into Postgres
          const { data: remotePoliza, error: insertError } = await this.supabase
            .from('coi_polizas')
            .insert({
              tipo_poliza: poliza.tipo_poliza,
              fecha: poliza.fecha,
              concepto: poliza.concepto,
              moneda: poliza.moneda || 'MXN',
              tipo_cambio: poliza.tipo_cambio || 1.0,
              estatus: poliza.estatus || 'V',
              erp_source: poliza.erp_source,
              erp_id: poliza.erp_id,
              synced_local: true,
            })
            .select()
            .single();

          if (insertError) {
            result.failed++;
            result.errors.push(insertError.message);
            continue;
          }

          // Insert movements into Postgres
          if (movements.length > 0 && remotePoliza) {
            const movsData = movements.map((m: any, i: number) => ({
              poliza_id: remotePoliza.id,
              numero_linea: i + 1,
              num_cuenta: m.num_cuenta,
              concepto_mov: m.concepto_mov,
              cargo: m.cargo,
              abono: m.abono,
              cliente_rfc: m.cliente_rfc,
              cliente_nombre: m.cliente_nombre,
            }));

            await this.supabase.from('coi_movimientos').insert(movsData);
          }

          // Mark local poliza as synced
          this.db.prepare('UPDATE polizas SET synced_postgres = 1 WHERE id = ?').run(poliza.id);
          result.pushed++;

        } catch (err) {
          result.failed++;
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      }

      this.logSync('push', result.pushed, result.failed, startTime);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    return result;
  }

  /**
   * Get sync status.
   */
  async getSyncStatus(): Promise<SyncStatus> {
    let postgresOk = false;
    let pendingRemote = 0;

    if (this.supabase) {
      try {
        const { count, error } = await this.supabase
          .from('coi_polizas')
          .select('*', { count: 'exact', head: true })
          .eq('synced_local', false);
        postgresOk = !error;
        pendingRemote = count || 0;
      } catch (_) { postgresOk = false; }
    }

    const pendingLocal = (this.db.prepare('SELECT COUNT(*) as c FROM polizas WHERE synced_postgres = 0 AND erp_source IS NOT NULL AND erp_id IS NOT NULL AND erp_source != \'\' AND erp_id != \'\'').get() as { c: number }).c;

    const lastPull = (this.db.prepare("SELECT completed_at FROM sync_history WHERE direction = 'pull' AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { completed_at: string } | undefined)?.completed_at || null;
    const lastPush = (this.db.prepare("SELECT completed_at FROM sync_history WHERE direction = 'push' AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { completed_at: string } | undefined)?.completed_at || null;

    return {
      lastPull,
      lastPush,
      pendingLocal,
      pendingRemote,
      sqliteOk: true,
      postgresOk,
    };
  }

  private async markSyncedLocal(polizaId: number): Promise<void> {
    if (!this.supabase) return;
    await this.supabase
      .from('coi_polizas')
      .update({ synced_local: true })
      .eq('id', polizaId);
  }

  private logSync(direction: 'pull' | 'push', processed: number, failed: number, startedAt: string): void {
    this.db.prepare(`
      INSERT INTO sync_history (direction, records_processed, records_failed, started_at, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(direction, processed, failed, startedAt);
  }
}