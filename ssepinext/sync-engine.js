const { prepareStatement, getSyncState, setSyncState, queueOperation, getPendingOps, removePendingOp, incrementRetry } = require('./db');

const TABLES_TO_SYNC = [
  'ventas', 'compras', 'ordenes_taller', 'ordenes_motores',
  'proyectos_automatizacion', 'cotizaciones', 'facturas',
  'inventario', 'contactos', 'orden_historial', 'coi_sync_queue'
];

class SyncEngine {
  constructor(db, supabaseConfig) {
    this.db = db;
    this.supabaseConfig = supabaseConfig;
    this.running = false;
  }

  async start(intervalMs = 30000) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.sync(), intervalMs);
    console.log(`[SyncEngine] Started with interval ${intervalMs}ms`);
    // Initial sync
    await this.sync();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[SyncEngine] Stopped');
  }

  async sync() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkConnectivity();
      const state = getSyncState(this.db);
      if (!state.server_online) {
        console.log('[SyncEngine] Server offline, skipping sync');
        return;
      }
      await this.push();
      await this.pull();
      await this.processPendingOps();
    } catch (err) {
      console.error('[SyncEngine] Sync error:', err);
    } finally {
      this.running = false;
    }
  }

  async checkConnectivity() {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { error } = await supabase.from('ventas').select('id', { head: true, count: 'exact' }).limit(1);
      const online = !error;
      setSyncState(this.db, {
        server_online: online ? 1 : 0,
        server_checked_at: new Date().toISOString()
      });
      return online;
    } catch {
      setSyncState(this.db, {
        server_online: 0,
        server_checked_at: new Date().toISOString()
      });
      return false;
    }
  }

  async pull() {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const state = getSyncState(this.db);
    const lastPull = state.last_pull_at;

    for (const table of TABLES_TO_SYNC) {
      try {
        let q = supabase.from(table).select('*');
        if (lastPull) {
          q = q.gt('updated_at', lastPull);
        }
        const { data, error } = await q.limit(1000);
        if (error) {
          console.warn(`[SyncEngine] Pull ${table} failed:`, error.message);
          continue;
        }
        if (!data || data.length === 0) continue;

        const localTable = `local_${table}`;
        const stmt = prepareStatement(this.db, localTable);
        let upserted = 0;
        for (const row of data) {
          // Don't overwrite local pending changes unless they are older
          const local = stmt.getByCloudId(row.id);
          if (local && local.sync_status === 'pending_push') {
            const localUpdated = local.updated_at || local.created_at;
            const cloudUpdated = row.updated_at;
            if (cloudUpdated && localUpdated && new Date(cloudUpdated) <= new Date(localUpdated)) {
              continue; // Local is newer, keep pending
            }
          }
          stmt.upsertByCloudId(row.id, row);
          upserted++;
        }
        console.log(`[SyncEngine] Pulled ${data.length} rows from ${table} (${upserted} upserted)`);
      } catch (err) {
        console.warn(`[SyncEngine] Pull ${table} exception:`, err.message);
      }
    }

    setSyncState(this.db, { last_pull_at: new Date().toISOString() });
  }

  async push() {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    for (const table of TABLES_TO_SYNC) {
      const localTable = `local_${table}`;
      const stmt = prepareStatement(this.db, localTable);
      const pending = stmt.getPendingPush();
      if (pending.length === 0) continue;

      console.log(`[SyncEngine] Pushing ${pending.length} rows from ${table}`);

      for (const row of pending) {
        try {
          const payload = { ...row };
          delete payload.local_id;
          delete payload.cloud_id;
          delete payload.sync_status;
          delete payload.synced_at;
          delete payload.created_at;
          delete payload.updated_at;

          if (row.cloud_id) {
            // Update existing
            const { data, error } = await supabase.from(table).update(payload).eq('id', row.cloud_id).select();
            if (error) throw error;
            if (data && data[0]) {
              stmt.setSynced(row.local_id, data[0].id);
              stmt.upsertByCloudId(data[0].id, data[0]);
            }
          } else {
            // Insert new
            const { data, error } = await supabase.from(table).insert(payload).select();
            if (error) throw error;
            if (data && data[0]) {
              stmt.setSynced(row.local_id, data[0].id);
              stmt.upsertByCloudId(data[0].id, data[0]);
            }
          }
        } catch (err) {
          console.error(`[SyncEngine] Push row ${row.local_id} (${table}) failed:`, err.message);
          // Keep as pending for retry
        }
      }
    }

    // Update pending count
    let totalPending = 0;
    for (const table of TABLES_TO_SYNC) {
      const stmt = prepareStatement(this.db, `local_${table}`);
      totalPending += stmt.getPendingPush().length;
    }
    setSyncState(this.db, { pending_push_count: totalPending, last_push_at: new Date().toISOString() });
  }

  async processPendingOps() {
    const ops = getPendingOps(this.db, 50);
    if (ops.length === 0) return;

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    for (const op of ops) {
      try {
        const payload = JSON.parse(op.payload || '{}');
        if (op.operation === 'delete') {
          if (op.cloud_id) {
            const { error } = await supabase.from(op.table_name).delete().eq('id', op.cloud_id);
            if (error) throw error;
          }
        } else if (op.operation === 'insert') {
          const { data, error } = await supabase.from(op.table_name).insert(payload).select();
          if (error) throw error;
          // Update local mapping if needed
        } else if (op.operation === 'update') {
          if (op.cloud_id) {
            const { error } = await supabase.from(op.table_name).update(payload).eq('id', op.cloud_id);
            if (error) throw error;
          }
        }
        removePendingOp(this.db, op.id);
      } catch (err) {
        console.error(`[SyncEngine] Pending op ${op.id} failed:`, err.message);
        incrementRetry(this.db, op.id, err.message);
        if (op.retry_count >= 5) {
          console.warn(`[SyncEngine] Pending op ${op.id} exceeded retries, removing`);
          removePendingOp(this.db, op.id);
        }
      }
    }
  }
}

module.exports = { SyncEngine };
