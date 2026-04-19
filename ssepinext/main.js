/**
 * SSEPI-NEXT — Main process
 * Auth, IPC, auto-update, COI bridge status, graceful shutdown.
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDk5NzAsImV4cCI6MjA4NzYyNTk3MH0.y9AEScz9PWu3Tqnd-7R7fxf0smvVCosZF0edLg2j31A';
const COI_BRIDGE_URL = process.env.COI_BRIDGE_URL || 'http://localhost:8765';

let mainWindow = null;
let supabase = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
    backgroundColor: '#050a0a',
    title: 'SSEPI-NEXT',
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==================== AUTH IPC ====================

ipcMain.handle('auth:login', async (_e, { email, password }) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, session: { access_token: data.session.access_token, user: data.user } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:session', async () => {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { ok: true, session: null };
    return { ok: true, session: { access_token: data.session.access_token, user: data.session.user } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    await supabase.auth.signOut();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('auth:onAuthStateChange', async () => {
  const { data } = await supabase.auth.getSession();
  return data.session
    ? { access_token: data.session.access_token, user: data.session.user }
    : null;
});

// ==================== DATA IPC ====================

ipcMain.handle('data:query', async (_e, { table, filters, columns, orderBy, limit }) => {
  try {
    let query = supabase.from(table).select(columns || '*');
    if (filters) {
      for (const [key, val] of Object.entries(filters)) {
        if (val === null || val === undefined) continue;
        if (Array.isArray(val)) {
          query = query.in(key, val);
        } else {
          query = query.eq(key, val);
        }
      }
    }
    if (orderBy) {
      for (const col of Array.isArray(orderBy) ? orderBy : [orderBy]) {
        const desc = col.startsWith('-');
        query = query.order(desc ? col.slice(1) : col, { ascending: !desc });
      }
    }
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ==================== COI BRIDGE IPC ====================

ipcMain.handle('coi:status', async () => {
  try {
    const res = await fetch(`${COI_BRIDGE_URL}/health`);
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'COI Bridge no disponible' };
  }
});

ipcMain.handle('coi:polizas', async (_e, { tipo, fechaDesde, fechaHasta, estatus, limit }) => {
  try {
    const params = new URLSearchParams();
    if (tipo) params.set('tipo', tipo);
    if (fechaDesde) params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params.set('fechaHasta', fechaHasta);
    if (estatus) params.set('estatus', estatus);
    if (limit) params.set('limit', String(limit));
    const res = await fetch(`${COI_BRIDGE_URL}/polizas?${params}`);
    const data = await res.json();
    return { ok: data.ok, data: data.data, count: data.count, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coi:poliza-detail', async (_e, { id }) => {
  try {
    const res = await fetch(`${COI_BRIDGE_URL}/polizas/${id}`);
    const data = await res.json();
    return { ok: data.ok, data: data.data, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coi:sync-status', async () => {
  try {
    const res = await fetch(`${COI_BRIDGE_URL}/sync/status`);
    const data = await res.json();
    return { ok: data.ok, data: data.data, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coi:sync-pull', async () => {
  try {
    const res = await fetch(`${COI_BRIDGE_URL}/sync/pull`);
    const data = await res.json();
    return { ok: data.ok, data: data.data, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('coi:sync-push', async () => {
  try {
    const res = await fetch(`${COI_BRIDGE_URL}/sync/push`, { method: 'POST' });
    const data = await res.json();
    return { ok: data.ok, data: data.data, error: data.error };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ==================== EXPORT IPC ====================

ipcMain.handle('export:csv', async (_e, { filename, data }) => {
  try {
    if (!data || data.length === 0) return { ok: false, error: 'Sin datos para exportar' };
    const headers = Object.keys(data[0]);
    const BOM = '\uFEFF';
    const csv = BOM + [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(','))
    ].join('\n');

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || `ssepi-export-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (canceled || !filePath) return { ok: false, error: 'Cancelado' };

    fs.writeFileSync(filePath, csv, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ==================== REALTIME IPC ====================

const activeChannels = new Map();

ipcMain.handle('realtime:subscribe', async (_e, { table, event = '*', filter }) => {
  try {
    const channelName = `${table}-${event}-${Date.now()}`;
    let channel = supabase.channel(channelName);

    if (filter) {
      channel = channel.on('postgres_changes', { event, schema: 'public', table, filter: filter }, (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('realtime:event', { table, event, payload });
        }
      });
    } else {
      channel = channel.on('postgres_changes', { event, schema: 'public', table }, (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('realtime:event', { table, event, payload });
        }
      });
    }

    channel.subscribe((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('realtime:status', { channel: channelName, status });
      }
    });

    activeChannels.set(channelName, channel);
    return { ok: true, channel: channelName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('realtime:unsubscribe', async (_e, { channel }) => {
  try {
    const ch = activeChannels.get(channel);
    if (ch) {
      supabase.removeChannel(ch);
      activeChannels.delete(channel);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ==================== GRACEFUL SHUTDOWN ====================

function cleanup() {
  for (const [name, ch] of activeChannels) {
    try { supabase.removeChannel(ch); } catch (_) {}
    activeChannels.delete(name);
  }
  try { supabase.removeAllChannels(); } catch (_) {}
}

app.on('before-quit', cleanup);
process.on('SIGTERM', () => { cleanup(); app.quit(); });
process.on('SIGINT', () => { cleanup(); app.quit(); });