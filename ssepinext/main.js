/**
 * SSEPI-NEXT Data Viewer
 * Aplicación de escritorio para ver datos del ERP SSEPI
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.js')
    },
    icon: join(__dirname, '../panel/assets/logo-ssepi.png'),
    backgroundColor: '#050a0a'
  });

  mainWindow.loadFile('index.html');

  // Abrir DevTools en desarrollo
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handlers IPC para comunicación con Supabase
ipcMain.handle('get-data', async (event, { table, filters }) => {
  // Los datos vienen del renderer que ya consultó Supabase
  return { success: true };
});

ipcMain.handle('export-data', async (event, { data, format }) => {
  // Exportar datos a CSV/Excel
  return { success: true };
});
