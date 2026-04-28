const { prepareStatement, getSyncState, setSyncState } = require('./db');

const TABLE_MAP = {
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
  'usuarios': 'local_usuarios'
};

function parsePostgrestQuery(query) {
  const result = {
    select: '*',
    filters: [],
    order: null,
    limit: 1000,
    offset: 0,
    single: false
  };

  for (const [key, val] of Object.entries(query)) {
    if (key === 'select') {
      result.select = val;
    } else if (key === 'order') {
      result.order = val;
    } else if (key === 'limit') {
      result.limit = parseInt(val, 10) || 1000;
    } else if (key === 'offset') {
      result.offset = parseInt(val, 10) || 0;
    } else if (key === 'single') {
      result.single = val === 'true';
    } else {
      // Parse filter operators: eq, neq, gt, gte, lt, lte, like, ilike, in, is
      const opMatch = key.match(/^(.+)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)$/);
      if (opMatch) {
        const col = opMatch[1];
        const op = opMatch[2];
        let value = val;
        if (op === 'in') {
          value = val.replace(/[()]/g, '').split(',').map(s => s.trim());
        }
        result.filters.push({ col, op, value });
      } else {
        // Fallback: treat as eq
        result.filters.push({ col: key, op: 'eq', value: val });
      }
    }
  }

  return result;
}

function buildSqliteWhere(filters) {
  const clauses = [];
  const params = [];

  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        clauses.push(`json_extract(data, '$.${f.col}') = ?`);
        params.push(f.value);
        break;
      case 'neq':
        clauses.push(`json_extract(data, '$.${f.col}') != ?`);
        params.push(f.value);
        break;
      case 'gt':
        clauses.push(`json_extract(data, '$.${f.col}') > ?`);
        params.push(f.value);
        break;
      case 'gte':
        clauses.push(`json_extract(data, '$.${f.col}') >= ?`);
        params.push(f.value);
        break;
      case 'lt':
        clauses.push(`json_extract(data, '$.${f.col}') < ?`);
        params.push(f.value);
        break;
      case 'lte':
        clauses.push(`json_extract(data, '$.${f.col}') <= ?`);
        params.push(f.value);
        break;
      case 'like':
        clauses.push(`json_extract(data, '$.${f.col}') LIKE ?`);
        params.push(f.value);
        break;
      case 'ilike':
        clauses.push(`LOWER(json_extract(data, '$.${f.col}')) LIKE LOWER(?)`);
        params.push(f.value);
        break;
      case 'in':
        const placeholders = f.value.map(() => '?').join(',');
        clauses.push(`json_extract(data, '$.${f.col}') IN (${placeholders})`);
        params.push(...f.value);
        break;
      case 'is':
        if (f.value === 'null') {
          clauses.push(`json_extract(data, '$.${f.col}') IS NULL`);
        } else {
          clauses.push(`json_extract(data, '$.${f.col}') = ?`);
          params.push(f.value);
        }
        break;
    }
  }

  return { where: clauses.join(' AND '), params };
}

function createProxyRouter(db, supabaseConfig) {
  const express = require('express');
  const router = express.Router();

  // Middleware to parse body as JSON for all proxy routes
  router.use(express.json({ limit: '10mb' }));

  // Health / status
  router.get('/status', (_req, res) => {
    const state = getSyncState(db);
    res.json({
      mode: 'ssepi-next-proxy',
      server_online: !!state.server_online,
      last_pull_at: state.last_pull_at,
      last_push_at: state.last_push_at,
      pending_push_count: state.pending_push_count,
      db_path: require('./db').DB_PATH
    });
  });

  // GET /rest/v1/:table — List/Query
  router.get('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) {
      // Unknown table: proxy directly if online, else 503
      return proxyOr503(req, res, supabaseConfig);
    }

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const orderBy = parsed.order || 'updated_at DESC';
    const stmt = prepareStatement(db, localTable);

    try {
      const rows = stmt.query(where, params, orderBy, parsed.limit);
      // Apply offset manually
      const paginated = rows.slice(parsed.offset, parsed.offset + parsed.limit);

      // If online, try to refresh from cloud in background (non-blocking)
      if (isServerOnline(db)) {
        refreshFromCloud(db, supabaseConfig, req.params.table, parsed.filters).catch(() => {});
      }

      res.status(200).json(paginated);
    } catch (err) {
      console.error('[Proxy] GET error:', err);
      res.status(500).json({ message: err.message, hint: '', details: '' });
    }
  });

  // POST /rest/v1/:table — Insert
  router.post('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) {
      return proxyOr503(req, res, supabaseConfig);
    }

    const stmt = prepareStatement(db, localTable);
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    try {
      for (const item of payload) {
        // If offline or preference=local, insert locally only
        if (!isServerOnline(db) || req.headers['x-ssepi-prefer'] === 'local') {
          const result = stmt.insert(null, item);
          results.push(result);
        } else {
          // Try cloud first; if success, cache locally as synced
          try {
            const cloudRes = await proxyToSupabase(req, res, supabaseConfig, req.params.table, item);
            if (cloudRes && cloudRes[0]) {
              stmt.upsertByCloudId(cloudRes[0].id, cloudRes[0]);
              results.push(cloudRes[0]);
            } else {
              throw new Error('Cloud insert returned empty');
            }
          } catch (cloudErr) {
            // Fallback to local pending
            const result = stmt.insert(null, { ...item, _cloud_error: cloudErr.message });
            results.push(result);
          }
        }
      }
      res.status(201).json(Array.isArray(req.body) ? results : results[0]);
    } catch (err) {
      console.error('[Proxy] POST error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // PATCH /rest/v1/:table — Update
  router.patch('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) {
      return proxyOr503(req, res, supabaseConfig);
    }

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const stmt = prepareStatement(db, localTable);

    try {
      const rows = stmt.query(where, params, 'id ASC', 1000);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'No rows matched', hint: '', details: '' });
      }

      const results = [];
      for (const row of rows) {
        const updated = { ...row, ...req.body };
        delete updated.local_id;
        delete updated.cloud_id;
        delete updated.sync_status;

        if (!isServerOnline(db) || req.headers['x-ssepi-prefer'] === 'local') {
          stmt.update(row.local_id, updated);
          results.push({ ...updated, local_id: row.local_id, cloud_id: row.cloud_id, sync_status: 'pending_push' });
        } else {
          try {
            const cloudRes = await proxyToSupabase(req, res, supabaseConfig, req.params.table, updated, row.cloud_id);
            stmt.update(row.local_id, updated);
            stmt.setSynced(row.local_id, row.cloud_id);
            results.push({ ...updated, local_id: row.local_id, cloud_id: row.cloud_id, sync_status: 'synced' });
          } catch (cloudErr) {
            stmt.update(row.local_id, { ...updated, _cloud_error: cloudErr.message });
            results.push({ ...updated, local_id: row.local_id, cloud_id: row.cloud_id, sync_status: 'pending_push' });
          }
        }
      }

      res.status(200).json(results.length === 1 ? results[0] : results);
    } catch (err) {
      console.error('[Proxy] PATCH error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // DELETE /rest/v1/:table — Delete
  router.delete('/rest/v1/:table', async (req, res) => {
    const localTable = TABLE_MAP[req.params.table];
    if (!localTable) {
      return proxyOr503(req, res, supabaseConfig);
    }

    const parsed = parsePostgrestQuery(req.query);
    const { where, params } = buildSqliteWhere(parsed.filters);
    const stmt = prepareStatement(db, localTable);

    try {
      const rows = stmt.query(where, params, 'id ASC', 1000);
      for (const row of rows) {
        if (row.cloud_id) {
          stmt.markDeleted(row.cloud_id);
        } else {
          stmt.remove(row.local_id);
        }
      }
      res.status(204).send();
    } catch (err) {
      console.error('[Proxy] DELETE error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // RPC passthrough (minimal support)
  router.post('/rest/v1/rpc/:rpc', async (req, res) => {
    return proxyOr503(req, res, supabaseConfig);
  });

  return router;
}

function isServerOnline(db) {
  const state = getSyncState(db);
  if (!state.server_checked_at) return false;
  const checked = new Date(state.server_checked_at).getTime();
  return state.server_online && (Date.now() - checked < 30000); // 30s staleness
}

async function proxyToSupabase(req, res, supabaseConfig, table, payload, cloudId) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (req.method === 'POST') {
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  } else if (req.method === 'PATCH') {
    let q = supabase.from(table).update(payload);
    // Rebuild filters from req.query
    for (const [key, val] of Object.entries(req.query)) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const opMatch = key.match(/^(.+)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)$/);
      if (opMatch) {
        const col = opMatch[1];
        const op = opMatch[2];
        if (op === 'eq') q = q.eq(col, val);
        else if (op === 'in') {
          const arr = val.replace(/[()]/g, '').split(',').map(s => s.trim());
          q = q.in(col, arr);
        }
      } else {
        q = q.eq(key, val);
      }
    }
    const { data, error } = await q.select();
    if (error) throw error;
    return data;
  }
}

async function proxyOr503(req, res, supabaseConfig) {
  if (!isServerOnline(require('./db').initDb())) {
    return res.status(503).json({
      message: 'Servidor offline y tabla no cacheada localmente',
      hint: 'Conecte a internet o use tablas soportadas',
      details: ''
    });
  }
  // Actual proxy (simple fetch passthrough)
  try {
    const targetUrl = `${supabaseConfig.url}${req.originalUrl.replace('/proxy', '')}`;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'apikey': supabaseConfig.anonKey,
        'Authorization': req.headers.authorization || `Bearer ${supabaseConfig.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': req.headers.prefer || 'return=representation',
        'X-Client-Info': 'ssepi-next-proxy'
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });
    const body = await response.json().catch(() => null);
    res.status(response.status).json(body);
  } catch (err) {
    res.status(503).json({ message: err.message });
  }
}

async function refreshFromCloud(db, supabaseConfig, table, filters) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let q = supabase.from(table).select('*');
  for (const f of filters) {
    if (f.op === 'eq') q = q.eq(f.col, f.value);
    else if (f.op === 'in') q = q.in(f.col, f.value);
  }

  try {
    const { data, error } = await q.limit(1000);
    if (error || !data) return;
    const localTable = TABLE_MAP[table];
    const stmt = prepareStatement(db, localTable);
    for (const row of data) {
      stmt.upsertByCloudId(row.id, row);
    }
    setSyncState(db, { last_pull_at: new Date().toISOString() });
  } catch (err) {
    console.warn('[Proxy] Background refresh failed:', err.message);
  }
}

module.exports = { createProxyRouter, isServerOnline, TABLE_MAP };
