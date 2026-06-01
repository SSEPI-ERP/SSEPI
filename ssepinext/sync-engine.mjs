import { prepareStatement, getSyncState, setSyncState, getPendingOps, removePendingOp, incrementRetry } from './db.mjs';
import { createClient } from '@supabase/supabase-js';

// Tablas sincronizadas bidireccionalmente con Supabase cloud.
// Las 15 tablas agregadas el 2026-06-01 cierran la brecha de visibilidad
// (auth/permisos/auditoria/calculadoras) — antes solo existian en local.
const TABLES_TO_SYNC = [
  // === Operativas (27 originales) ===
  'ventas','compras','ordenes_taller','ordenes_motores',
  'proyectos_automatizacion','cotizaciones','facturas',
  'inventario','contactos','orden_historial','coi_sync_queue',
  'actividades_diarias','actividades_historial','actividades_subtareas',
  'clientes_adeudos','notificaciones','suministros_items',
  'soporte_visitas','ingresos_contabilidad','bom_automatizacion',
  'calculadoras','calculadora_costos','servicios_automatizacion',
  'parametros_costos','clientes_tabulador','estado_pipeline_unificado',
  'pagos_nomina',
  // === Auth + permisos + auditoria (5) ===
  'usuarios','role_permissions','users_ver_costos','user_module_permissions',
  'audit_logs','auth_logs',
  // === Seguridad + comunicacion (2) ===
  'security_alerts','inbound_emails',
  // === Integraciones (3) ===
  'eventos_contables_coi','n8n_heartbeat','n8n_insights',
  // === Catalogo + politicas (2) ===
  'politicas_modulos','movimientos_inventario',
  // === Calculadoras avanzado (2) ===
  'calculadora_clientes','calculadora_hoja_filas'
];

export class SyncEngine {
  constructor(db, supabaseConfig) {
    this.db = db;
    this.supabaseConfig = supabaseConfig;
    this.running = false;
  }

  async start(intervalMs = 30000) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.sync(), intervalMs);
    console.log(`[SyncEngine] Started interval ${intervalMs}ms`);
    await this.sync();
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    console.log('[SyncEngine] Stopped');
  }

  async sync() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkConnectivity();
      const state = await getSyncState(this.db);
      if (!state || !state.server_online) {
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
      const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await supabase.from('usuarios').select('id').limit(1);
      const online = !error && data !== null;
      await setSyncState(this.db, { server_online: online ? 1 : 0, server_checked_at: new Date().toISOString() });
      return online;
    } catch {
      await setSyncState(this.db, { server_online: 0, server_checked_at: new Date().toISOString() });
      return false;
    }
  }

  async pull() {
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const state = await getSyncState(this.db);
    const lastPull = state?.last_pull_at;

    for (const table of TABLES_TO_SYNC) {
      try {
        let q = supabase.from(table).select('*');
        if (lastPull) q = q.gt('updated_at', lastPull);
        const { data, error } = await q.limit(1000);
        if (error || !data || data.length === 0) continue;

        const stmt = await prepareStatement(this.db, `local_${table}`);
        let upserted = 0;
        for (const row of data) {
          const local = await stmt.getByCloudId(row.id);
          if (local && local.sync_status === 'pending_push') {
            const localUpdated = local.updated_at || local.created_at;
            const cloudUpdated = row.updated_at;
            if (cloudUpdated && localUpdated && new Date(cloudUpdated) <= new Date(localUpdated)) continue;
          }
          await stmt.upsertByCloudId(row.id, row);
          upserted++;
        }
        console.log(`[SyncEngine] Pulled ${data.length} from ${table} (${upserted} upserted)`);
      } catch (err) {
        console.warn(`[SyncEngine] Pull ${table} exception:`, err.message);
      }
    }
    await setSyncState(this.db, { last_pull_at: new Date().toISOString() });
  }

  async push() {
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    for (const table of TABLES_TO_SYNC) {
      const stmt = await prepareStatement(this.db, `local_${table}`);
      const pending = await stmt.getPendingPush();
      if (pending.length === 0) continue;
      console.log(`[SyncEngine] Pushing ${pending.length} from ${table}`);

      for (const row of pending) {
        try {
          const payload = { ...row };
          delete payload.local_id; delete payload.cloud_id; delete payload.sync_status;
          delete payload.synced_at; delete payload.created_at; delete payload.updated_at;

          if (row.cloud_id) {
            const { data, error } = await supabase.from(table).update(payload).eq('id', row.cloud_id).select();
            if (error) throw error;
            if (data && data[0]) {
              await stmt.setSynced(row.local_id, data[0].id);
              await stmt.upsertByCloudId(data[0].id, data[0]);
            }
          } else {
            const { data, error } = await supabase.from(table).insert(payload).select();
            if (error) throw error;
            if (data && data[0]) {
              await stmt.setSynced(row.local_id, data[0].id);
              await stmt.upsertByCloudId(data[0].id, data[0]);
            }
          }
        } catch (err) {
          console.error(`[SyncEngine] Push ${row.local_id} (${table}) failed:`, err.message);
        }
      }
    }

    let totalPending = 0;
    for (const table of TABLES_TO_SYNC) {
      const stmt = await prepareStatement(this.db, `local_${table}`);
      totalPending += (await stmt.getPendingPush()).length;
    }
    await setSyncState(this.db, { pending_push_count: totalPending, last_push_at: new Date().toISOString() });
  }

  async processPendingOps() {
    const ops = await getPendingOps(this.db, 50);
    if (ops.length === 0) return;
    const supabase = createClient(this.supabaseConfig.url, this.supabaseConfig.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

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
        } else if (op.operation === 'update') {
          if (op.cloud_id) {
            const { error } = await supabase.from(op.table_name).update(payload).eq('id', op.cloud_id);
            if (error) throw error;
          }
        }
        await removePendingOp(this.db, op.id);
      } catch (err) {
        console.error(`[SyncEngine] Pending op ${op.id} failed:`, err.message);
        await incrementRetry(this.db, op.id, err.message);
        if (op.retry_count >= 5) {
          console.warn(`[SyncEngine] Pending op ${op.id} exceeded retries, removing`);
          await removePendingOp(this.db, op.id);
        }
      }
    }
  }
}
