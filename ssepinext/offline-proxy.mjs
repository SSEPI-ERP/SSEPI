import { prepareStatement, getSyncState } from './db.mjs';
import express from 'express';

export const TABLE_MAP = {
  'ventas': 'local_ventas',
  'compras': 'local_compras',
  'ordenes_taller': 'local_ordenes_taller',
  'ordenes_motores': 'local_ordenes_motores',
  'proyectos_automatizacion': 'local_proyectos_automatizacion',
  'cotizaciones': 'local_cotizaciones',
  'facturas': 'local_facturas',
  'inventario': 'local_inventario',
  'contactos': 'local_contactos',
  'orden_historial': 'local_orden_historial',
  'coi_sync_queue': 'local_coi_sync_queue',
  'usuarios': 'local_usuarios',
  'users': 'local_usuarios',
  'profiles': 'local_usuarios',
  'role_permissions': 'local_role_permissions',
  'users_ver_costos': 'local_users_ver_costos',
  'auth_logs': 'local_auth_logs',
  'audit_logs': 'local_audit_logs',
  'parametros_costos': 'local_parametros_costos',
  'clientes_tabulador': 'local_clientes_tabulador',
  'estado_pipeline_unificado': 'local_estado_pipeline_unificado',
  'eventos_contables_coi': 'local_eventos_contables_coi',
  'n8n_heartbeat': 'local_n8n_heartbeat',
  'n8n_insights': 'local_n8n_insights',
  'politicas_modulos': 'local_politicas_modulos',
  'inbound_emails': 'local_inbound_emails',
  'security_alerts': 'local_security_alerts',
  'user_module_permissions': 'local_user_module_permissions',
  'movimientos_inventario': 'local_movimientos_inventario',
  'bom_automatizacion': 'local_bom_automatizacion',
  'calculadoras': 'local_calculadoras',
  'calculadora_costos': 'local_calculadora_costos',
  'calculadora_clientes': 'local_calculadora_clientes',
  'calculadora_hoja_filas': 'local_calculadora_hoja_filas',
  'servicios_automatizacion': 'local_servicios_automatizacion',
  'ingresos_contabilidad': 'local_ingresos_contabilidad',
  'notificaciones': 'local_notificaciones',
  'suministros_items': 'local_suministros_items',
  'soporte_visitas': 'local_soporte_visitas',
  'actividades_diarias': 'local_actividades_diarias',
  'actividades_historial': 'local_actividades_historial',
  'actividades_subtareas': 'local_actividades_subtareas',
  'clientes_adeudos': 'local_clientes_adeudos',
  'pagos_nomina': 'local_pagos_nomina'
};

function parsePostgrestQuery(query) {
  const result = { select: '*', filters: [], orderCol: 'updated_at', orderDir: 'DESC', limit: 1000, offset: 0, single: false };
  for (const [key, val] of Object.entries(query)) {
    if (key === 'select') { result.select = val; continue; }
    if (key === 'order') {
      if (typeof val === 'string') {
        const m = val.match(/^(.+)\.(asc|desc)$/i);
        if (m) { result.orderCol = m[1]; result.orderDir = m[2].toUpperCase(); }
        else { result.orderCol = val; result.orderDir = 'ASC'; }
      }
      continue;
    }
    if (key === 'limit') { result.limit = parseInt(val, 10) || 1000; continue; }
    if (key === 'offset') { result.offset = parseInt(val, 10) || 0; continue; }
    if (key === 'single') { result.single = val === 'true'; continue; }
    // Saltar parámetros complejos no soportados (or, and, etc.)
    if (key === 'or' || key === 'and') continue;
    // Si val es array (parámetro repetido), tomar el primero
    const rawVal = Array.isArray(val) ? val[0] : val;
    if (typeof rawVal !== 'string') continue;

    const opMatchKey = key.match(/^(.+)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)$/);
    if (opMatchKey) {
      const col = opMatchKey[1], op = opMatchKey[2];
      let value = rawVal;
      if (op === 'in') value = rawVal.replace(/[()]/g, '').split(',').map(s => s.trim());
      result.filters.push({ col, op, value });
    } else {
      const opMatchVal = rawVal.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/);
      if (opMatchVal) {
        const op = opMatchVal[1];
        let value = opMatchVal[2];
        if (op === 'in') value = value.replace(/[()]/g, '').split(',').map(s => s.trim());
        if (op === 'is' && value === 'null') value = 'null';
        result.filters.push({ col: key, op, value });
      } else {
        result.filters.push({ col: key, op: 'eq', value: rawVal });
      }
    }
  }
  return result;
}

function _coerceValue(val) {
  if (val === 'true') return 1;
  if (val === 'false') return 0;
  return val;
}

function colRef(col) {
  return col === 'id' ? 'id' : `json_extract(data, '$.${col}')`;
}

function buildSqliteWhere(filters) {
  const clauses = [], params = [];
  for (const f of filters) {
    const v = _coerceValue(f.value);
    const ref = colRef(f.col);
    switch (f.op) {
      case 'eq': clauses.push(`${ref} = ?`); params.push(v); break;
      case 'neq': clauses.push(`${ref} != ?`); params.push(v); break;
      case 'gt': clauses.push(`${ref} > ?`); params.push(v); break;
      case 'gte': clauses.push(`${ref} >= ?`); params.push(v); break;
      case 'lt': clauses.push(`${ref} < ?`); params.push(v); break;
      case 'lte': clauses.push(`${ref} <= ?`); params.push(v); break;
      case 'like': clauses.push(`${ref} LIKE ?`); params.push(v); break;
      case 'ilike': clauses.push(`LOWER(${ref}) LIKE LOWER(?)`); params.push(v); break;
      case 'in': {
        const coerced = Array.isArray(f.value) ? f.value.map(_coerceValue) : [v];
        const ph = coerced.map(() => '?').join(',');
        clauses.push(`${ref} IN (${ph})`);
        params.push(...coerced);
        break;
      }
      case 'is':
        if (v === 'null') clauses.push(`${ref} IS NULL`);
        else { clauses.push(`${ref} = ?`); params.push(v); }
        break;
    }
  }
  return { where: clauses.join(' AND '), params };
}

export function createOfflineProxyRouter(db) {
  const router = express.Router();
  router.use(express.json({ limit: '10mb' }));

  router.get('/status', async (_req, res) => {
    try {
      const state = await getSyncState(db);
      res.json({
        mode: 'ssepi-offline',
        server_online: false,
        last_pull_at: state?.last_pull_at,
        last_push_at: state?.last_push_at,
        pending_push_count: state?.pending_push_count,
        db_path: 'data/ssepi-local.db'
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) return res.status(404).json({ message: 'Tabla no existe en modo offline' });

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const orderBy = `${parsed.orderCol} ${parsed.orderDir}`;
    const stmt = await prepareStatement(db, localTable);

    try {
      // Merge Range header (Supabase-js .range()) con query params
      let offset = parsed.offset;
      let limit = parsed.limit;
      const rangeHeader = req.headers['range'];
      if (rangeHeader) {
        const m = rangeHeader.match(/^(\d+)-(\d+)$/);
        if (m) {
          offset = parseInt(m[1], 10);
          limit = parseInt(m[2], 10) - offset + 1;
        }
      }

      const rows = await stmt.query(where, params, orderBy, 100000);
      const total = rows.length;
      const paginated = rows.slice(offset, offset + limit);

      // Content-Range para compatibilidad con Supabase-js .range() y Prefer: count=exact
      const wantsCount = req.headers['prefer'] && req.headers['prefer'].includes('count=exact');
      if (rangeHeader || wantsCount) {
        const end = paginated.length > 0 ? offset + paginated.length - 1 : offset;
        res.setHeader('Content-Range', `${offset}-${end}/${total}`);
      }

      if (parsed.single) {
        if (paginated.length === 0) {
          return res.status(406).json({ message: 'The result contains 0 rows' });
        }
        if (paginated.length > 1) {
          return res.status(406).json({ message: 'The result contains more than 1 row' });
        }
        return res.status(200).json(paginated[0]);
      }

      res.status(200).json(paginated);
    } catch (err) {
      console.error('[OfflineProxy] GET error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.post('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) return res.status(404).json({ message: 'Tabla no existe en modo offline' });

    const stmt = await prepareStatement(db, localTable);
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    try {
      for (const item of payload) {
        const result = await stmt.insert(null, item);
        results.push(result);
      }
      res.status(201).json(Array.isArray(req.body) ? results : results[0]);
    } catch (err) {
      console.error('[OfflineProxy] POST error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.patch('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) return res.status(404).json({ message: 'Tabla no existe en modo offline' });

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const stmt = await prepareStatement(db, localTable);

    try {
      const rows = await stmt.query(where, params, 'id ASC', 1000);
      if (rows.length === 0) return res.status(404).json({ message: 'No rows matched' });
      const results = [];
      for (const row of rows) {
        const updated = { ...row, ...req.body };
        delete updated.local_id; delete updated.cloud_id; delete updated.sync_status;
        await stmt.update(row.local_id, updated);
        results.push({ ...updated, local_id: row.local_id, cloud_id: row.cloud_id, sync_status: 'pending_push' });
      }
      res.status(200).json(results.length === 1 ? results[0] : results);
    } catch (err) {
      console.error('[OfflineProxy] PATCH error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.delete('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) return res.status(404).json({ message: 'Tabla no existe en modo offline' });

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const stmt = await prepareStatement(db, localTable);

    try {
      const rows = await stmt.query(where, params, 'id ASC', 1000);
      for (const row of rows) {
        if (row.cloud_id) await stmt.markDeleted(row.cloud_id);
        else await stmt.remove(row.local_id);
      }
      res.status(204).send();
    } catch (err) {
      console.error('[OfflineProxy] DELETE error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.post('/rpc/:rpc', async (req, res) => {
    res.status(501).json({ message: 'RPC no disponible en modo offline' });
  });

  return router;
}
