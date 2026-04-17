/**
 * electron-security.js
 * Configuración de seguridad para la app Electron (SSEPI-NEXT)
 *
 * CRÍTICO: Estas configuraciones previenen vulnerabilidades comunes
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// URL permitida (solo tu dominio)
const ALLOWED_URL = 'https://ssepi-erp.vercel.app';
const ALLOWED_URL_PATTERN = /^https:\/\/ssepi-erp\.vercel\.app\/.*/;

/**
 * Configurar ventana segura
 * @returns {BrowserWindow}
 */
function createSecureWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            // CRÍTICO: Prevenir acceso directo a Node.js desde el renderer
            nodeIntegration: false,

            // CRÍTICO: Aislar contexto del renderer
            contextIsolation: true,

            // CRÍTICO: Habilitar sandboxing
            sandbox: true,

            // CRÍTICO: No deshabilitar webSecurity
            webSecurity: true,

            // Prevenir contenido mixto
            allowRunningInsecureContent: false,

            // Prevenir navegación a file://
            enableRemoteModule: false,

            // Script de preload (único punto de comunicación)
            preload: path.join(__dirname, 'preload.js'),

            // Deshabilitar experimentos
            experimentalFeatures: false,

            // Background throttling para rendimiento
            backgroundThrottling: true
        },
        show: false,
        backgroundColor: '#050a0a'
    });

    // Cargar solo URL permitida
    win.loadURL(ALLOWED_URL);

    // Mostrar ventana cuando esté lista
    win.once('ready-to-show', () => {
        win.show();
        win.focus();
    });

    // ================================================
    // PREVENIR NAVEGACIÓN NO AUTORIZADA
    // ================================================

    // Prevenir navegación en la ventana principal
    win.webContents.on('will-navigate', (event, url) => {
        if (!ALLOWED_URL_PATTERN.test(url)) {
            console.warn('[Security] Navegación bloqueada:', url);
            event.preventDefault();
        }
    });

    // Prevenir navegación en frames
    win.webContents.on('will-frame-navigate', (event, url) => {
        if (!ALLOWED_URL_PATTERN.test(url)) {
            console.warn('[Security] Frame navigation bloqueada:', url);
            event.preventDefault();
        }
    });

    // ================================================
    // PREVENIR VENTANAS EMERGENTES NO AUTORIZADAS
    // ================================================

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (!ALLOWED_URL_PATTERN.test(url)) {
            console.warn('[Security] Popup bloqueado:', url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // ================================================
    // FILTRAR PERMISOS
    // ================================================

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        // Denegar todos los permisos por defecto
        const allowedPermissions = ['clipboard-sanitized-write'];

        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            console.warn('[Security] Permiso denegado:', permission);
            callback(false);
        }
    });

    // ================================================
    // FILTRAR HEADERS DE SEGURIDAD
    // ================================================

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'X-Frame-Options': ['DENY'],
                'X-Content-Type-Options': ['nosniff'],
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline'; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src 'self' data: https:; " +
                    "connect-src 'self' https://*.supabase.co"
                ]
            }
        });
    });

    return win;
}

/**
 * Validar origen de mensajes IPC
 * @param {WebContents} sender
 * @returns {boolean}
 */
function validarOrigen(sender) {
    const url = sender.getURL();
    return ALLOWED_URL_PATTERN.test(url);
}

/**
 * Registrar handlers IPC seguros
 */
function setupSecureIPCHandlers() {
    // Ejemplo: Handler con validación
    ipcMain.handle('operacion-segura', async (event, datos) => {
        if (!validarOrigen(event.sender)) {
            throw new Error('[Security] Origen no autorizado');
        }

        // Validar estructura de datos
        if (!datos || typeof datos !== 'object') {
            throw new Error('[Security] Datos inválidos');
        }

        // Procesar operación
        return await procesarOperacion(datos);
    });

    // Handler para archivos locales (si es necesario)
    ipcMain.handle('leer-archivo-local', async (event, ruta) => {
        if (!validarOrigen(event.sender)) {
            throw new Error('[Security] Origen no autorizado');
        }

        // Prevenir path traversal
        const baseDir = app.getPath('userData');
        const rutaResuelta = path.resolve(ruta);

        if (!rutaResuelta.startsWith(baseDir)) {
            throw new Error('[Security] Acceso fuera del directorio permitido');
        }

        // Leer archivo con validación
        const fs = require('fs').promises;
        return await fs.readFile(rutaResuelta, 'utf8');
    });
}

/**
 * Procesar operación (implementación específica)
 */
async function procesarOperacion(datos) {
    // Implementar lógica de negocio
    console.log('[IPC] Operación recibida:', datos);
    return { success: true };
}

/**
 * Hardening adicional al iniciar
 */
app.on('ready', () => {
    // Deshabilitar auto-complete en forms
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.responseHeaders?.['set-cookie']) {
            details.responseHeaders['set-cookie'] = details.responseHeaders['set-cookie']
                .map(cookie => cookie + '; Secure; HttpOnly; SameSite=Strict');
        }
        callback({ responseHeaders: details.responseHeaders });
    });
});

module.exports = {
    createSecureWindow,
    setupSecureIPCHandlers,
    validarOrigen
};
