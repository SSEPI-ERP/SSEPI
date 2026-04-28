const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const app = express();
const PORT = process.env.PORT || 3333;

// Configuración Supabase local (o nube si no hay local)
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzQwNTAwMDAsImV4cCI6MTk4OTYyNjAwMH0.LOCAL_PLACEHOLDER_REPLACE_WITH_SUPABASE_STATUS';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/panel', express.static(path.join(__dirname, '..', 'panel')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'ssepi-next-local', supabase_url: SUPABASE_URL });
});

// =====================================================
// PROXY / BRIDGE para SSEPICOI
// =====================================================

// 1) Obtener órdenes de taller (para SSEPICOI)
app.get('/api/coi/ordenes-taller', async (_req, res) => {
  const { data, error } = await supabase.from('ordenes_taller').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2) Obtener órdenes de motores (para SSEPICOI)
app.get('/api/coi/ordenes-motores', async (_req, res) => {
  const { data, error } = await supabase.from('ordenes_motores').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 3) Obtener cotizaciones (para SSEPICOI)
app.get('/api/coi/cotizaciones', async (_req, res) => {
  const { data, error } = await supabase.from('cotizaciones').select('*').order('fecha_cotizacion', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 4) Obtener inventario (para SSEPICOI)
app.get('/api/coi/inventario', async (_req, res) => {
  const { data, error } = await supabase.from('inventario').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 5) Insertar movimiento / actualizar stock (SSEPICOI -> SSEPI)
app.post('/api/coi/movimiento', async (req, res) => {
  const { producto_id, tipo_movimiento, cantidad, referencia } = req.body;
  if (!producto_id || !tipo_movimiento || !cantidad) {
    return res.status(400).json({ error: 'Faltan campos: producto_id, tipo_movimiento, cantidad' });
  }
  const { data, error } = await supabase.from('movimientos_inventario').insert({
    producto_id,
    tipo_movimiento,
    cantidad,
    referencia: referencia || 'SSEPICOI',
    created_at: new Date().toISOString()
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// 6) Webhook genérico para eventos SSEPICOI
app.post('/api/coi/webhook', async (req, res) => {
  console.log('[SSEPI-NEXT] Webhook SSEPICOI:', req.body);
  res.json({ received: true });
});

// =====================================================
// SERVIR ERP WEB
// =====================================================
app.get('/', (_req, res) => {
  res.redirect('/panel/panel.html');
});

app.listen(PORT, () => {
  console.log(`[SSEPI-NEXT] Servidor local en http://localhost:${PORT}`);
  console.log(`[SSEPI-NEXT] ERP: http://localhost:${PORT}/panel/panel.html`);
  console.log(`[SSEPI-NEXT] Supabase: ${SUPABASE_URL}`);
  console.log(`[SSEPI-NEXT] SSEPICOI Bridge: http://localhost:${PORT}/api/coi/*`);
});
