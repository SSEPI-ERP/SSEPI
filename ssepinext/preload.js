/**
 * SSEPI-NEXT Preload
 * Puente seguro entre el renderer y el proceso principal
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Obtener datos de Supabase
  getData: (table, filters) => ipcRenderer.invoke('get-data', { table, filters }),

  // Exportar datos
  exportData: (data, format) => ipcRenderer.invoke('export-data', { data, format }),

  // Versión de la app
  getVersion: () => process.versions.electron
});

console.log('[SSEPI-NEXT] Preload cargado correctamente');
