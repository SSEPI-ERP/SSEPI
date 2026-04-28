import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getDb, getSyncState, setSyncState, queueOperation, getPendingOps, removePendingOp, incrementRetry } from './db.mjs';
import { createProxyRouter } from './proxy.mjs';
import { SyncEngine } from './sync-engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const app = express();
const PORT = process.env.PORT || 3333;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseConfig = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceKey: SUPABASE_SERVICE_KEY };

const db = await getDb();
const syncEngine = new SyncEngine(db, supabaseConfig);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const state = await getSyncState(db);
    res.json({
      status: 'ok',
      mode: 'ssepi-next-local',
      supabase_url: SUPABASE_URL,
      server_online: !!state?.server_online,
      last_pull_at: state?.last_pull_at,
      last_push_at: state?.last_push_at,
      pending_push_count: state?.pending_push_count,
      db_path: './data/ssepi-local.db'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Force sync
app.post('/api/sync/force', async (_req, res) => {
  try {
    await syncEngine.sync();
    const state = await getSyncState(db);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync status
app.get('/api/sync/status', async (_req, res) => {
  try {
    const state = await getSyncState(db);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// FASE 2: Endpoint genérico para operaciones offline
// =====================================================
app.post('/api/sync-offline', async (req, res) => {
  try {
    const { table, operation, payload, cloud_id } = req.body;
    if (!table || !operation || !payload) {
      return res.status(400).json({ error: 'Faltan campos: table, operation, payload' });
    }
    // Guardar en pending_ops para que el worker lo suba cuando haya red
    await queueOperation(db, table, operation, cloud_id || null, payload);
    res.status(200).json({ ok: true, message: 'Operación guardada localmente. Se sincronizará cuando haya conexión.' });
  } catch (err) {
    console.error('[SyncOffline] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// Legacy COI Bridge
// =====================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

app.get('/api/coi/ordenes-taller', async (_req, res) => {
  const { data, error } = await supabase.from('ordenes_taller').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/coi/ordenes-motores', async (_req, res) => {
  const { data, error } = await supabase.from('ordenes_motores').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/coi/cotizaciones', async (_req, res) => {
  const { data, error } = await supabase.from('cotizaciones').select('*').order('fecha_cotizacion', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/coi/inventario', async (_req, res) => {
  const { data, error } = await supabase.from('inventario').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/coi/movimiento', async (req, res) => {
  const { producto_id, tipo_movimiento, cantidad, referencia } = req.body;
  if (!producto_id || !tipo_movimiento || !cantidad) {
    return res.status(400).json({ error: 'Faltan campos: producto_id, tipo_movimiento, cantidad' });
  }
  const { data, error } = await supabase.from('movimientos_inventario').insert({
    producto_id, tipo_movimiento, cantidad, referencia: referencia || 'SSEPICOI', created_at: new Date().toISOString()
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

app.post('/api/coi/webhook', async (req, res) => {
  console.log('[SSEPI-NEXT] Webhook SSEPICOI:', req.body);
  res.json({ received: true });
});

// =====================================================
// PROXY /rest/v1/*
// =====================================================
app.use('/proxy', createProxyRouter(db, supabaseConfig));

// =====================================================
// Auth passthrough
// =====================================================
app.all('/auth/v1/*', async (req, res) => {
  try {
    const target = `${SUPABASE_URL}${req.path}`;
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': req.headers.authorization || `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        ...Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host','connection'].includes(k.toLowerCase())))
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });
    const body = await response.json().catch(() => null);
    res.status(response.status).json(body);
  } catch (err) {
    res.status(503).json({ message: 'Auth service unavailable', error: err.message });
  }
});

// =====================================================
// SERVIR ERP WEB
// =====================================================
app.use('/panel', express.static(path.join(__dirname, '..', 'panel')));

app.get('/', (_req, res) => {
  res.redirect('/panel/panel.html');
});

app.listen(PORT, () => {
  console.log(`[SSEPI-NEXT] Servidor local en http://localhost:${PORT}`);
  console.log(`[SSEPI-NEXT] ERP: http://localhost:${PORT}/panel/panel.html`);
  console.log(`[SSEPI-NEXT] Supabase: ${SUPABASE_URL}`);
  console.log(`[SSEPI-NEXT] Proxy: http://localhost:${PORT}/proxy/rest/v1/{tabla}`);
  console.log(`[SSEPI-NEXT] Auth passthrough: /auth/v1/*`);
  console.log(`[SSEPI-NEXT] SQLite: ./data/ssepi-local.db`);
  syncEngine.start(30000);
});
