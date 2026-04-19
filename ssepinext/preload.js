/**
 * SSEPI-NEXT Preload — Secure bridge between renderer and main process.
 * Exposes: auth, data, coi, export, realtime APIs.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  getSession: () => ipcRenderer.invoke('auth:session'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Data
  query: (table, filters, opts) => ipcRenderer.invoke('data:query', { table, filters, columns: opts?.columns, orderBy: opts?.orderBy, limit: opts?.limit }),

  // COI Bridge
  coiStatus: () => ipcRenderer.invoke('coi:status'),
  coiPolizas: (filters) => ipcRenderer.invoke('coi:polizas', filters || {}),
  coiPolizaDetail: (id) => ipcRenderer.invoke('coi:poliza-detail', { id }),
  coiSyncStatus: () => ipcRenderer.invoke('coi:sync-status'),
  coiSyncPull: () => ipcRenderer.invoke('coi:sync-pull'),
  coiSyncPush: () => ipcRenderer.invoke('coi:sync-push'),

  // Export
  exportCSV: (filename, data) => ipcRenderer.invoke('export:csv', { filename, data }),

  // Realtime
  subscribe: (table, event, filter) => ipcRenderer.invoke('realtime:subscribe', { table, event, filter }),
  unsubscribe: (channel) => ipcRenderer.invoke('realtime:unsubscribe', { channel }),
  onRealtimeEvent: (callback) => ipcRenderer.on('realtime:event', (_e, data) => callback(data)),
  onRealtimeStatus: (callback) => ipcRenderer.on('realtime:status', (_e, data) => callback(data)),

  // App info
  getVersion: () => process.versions.electron,
});

console.log('[SSEPI-NEXT] Preload cargado — API completa');