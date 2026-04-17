/**
 * preload.js
 * Script de preload para Electron - ÚNICO punto de comunicación segura
 *
 * CRÍTICO: Solo exponer lo mínimo necesario via contextBridge
 * NUNCA exponer: require, fs, shell, process, node
 */

const { contextBridge, ipcRenderer } = require('electron');

// Validar que estamos en contexto de preload
if (!process.contextIsolated) {
    console.error('[Security] contextIsolation debe estar habilitado');
}

/**
 * API expuesta al renderer (window.erpAPI)
 * Solo métodos específicos y validados
 */
contextBridge.exposeInMainWorld('erpAPI', {
    /**
     * Ejecutar operación segura en el proceso principal
     * @param {string} accion - Nombre de la acción
     * @param {object} datos - Datos de la operación
     * @returns {Promise<any>}
     */
    ejecutar: (accion, datos) => {
        // Validar que accion sea string
        if (typeof accion !== 'string') {
            return Promise.reject(new Error('Acción debe ser string'));
        }

        // Whitelist de acciones permitidas
        const accionesPermitidas = [
            'guardar-archivo',
            'leer-archivo',
            'imprimir',
            'exportar-pdf',
            'abrir-external',
            'clipboard-write'
        ];

        if (!accionesPermitidas.includes(accion)) {
            return Promise.reject(new Error(`Acción no permitida: ${accion}`));
        }

        return ipcRenderer.invoke('operacion-segura', { accion, datos });
    },

    /**
     * Escribir en portapapeles de forma segura
     * @param {string} texto
     * @returns {Promise<void>}
     */
    clipboard: {
        write: (texto) => {
            if (typeof texto !== 'string') {
                return Promise.reject(new Error('Texto debe ser string'));
            }
            return ipcRenderer.invoke('clipboard-write', texto);
        },
        read: () => {
            return ipcRenderer.invoke('clipboard-read');
        }
    },

    /**
     * Información segura de la app
     */
    app: {
        getVersion: () => process.version,
        getPlatform: () => process.platform
    },

    /**
     * Escuchar eventos del proceso principal
     */
    onEvent: (evento, callback) => {
        const eventosPermitidos = [
            'archivo-guardado',
            'impresion-completada',
            'actualizacion-disponible',
            'sesion-expirada'
        ];

        if (!eventosPermitidos.includes(evento)) {
            console.warn('[Security] Evento no permitido:', evento);
            return () => {};
        }

        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on(evento, subscription);

        // Retornar función para limpiar listener
        return () => {
            ipcRenderer.removeListener(evento, subscription);
        };
    },

    /**
     * Eliminar todos los listeners (para cleanup)
     */
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners();
    }
});

/**
 * Configurar notificaciones de seguridad
 */
ipcRenderer.on('security-alert', (event, message) => {
    console.warn('[Security Alert]', message);
});

console.log('[Preload] erpAPI expuesta de forma segura');
