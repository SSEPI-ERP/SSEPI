/**
 * rate-limit.js
 * Protección contra ataques de fuerza bruta y abuso de API
 *
 * Usa Supabase para almacenamiento distribuido del contador
 */

(function() {
    'use strict';

    // Configuración de límites
    const LIMITES = {
        login: { max: 5, ventana: 300 },        // 5 intentos en 5 min
        registro: { max: 3, ventana: 3600 },    // 3 registros en 1 hora
        exportar: { max: 10, ventana: 3600 },   // 10 exportaciones en 1 hora
        api: { max: 100, ventana: 60 },         // 100 req en 1 min
        mfa: { max: 3, ventana: 300 }           // 3 intentos MFA en 5 min
    };

    // Cache local de intentos (para reducir consultas a DB)
    const cacheLocal = new Map();

    /**
     * Generar clave única para rate limit
     * @param {string} accion - Tipo de acción
     * @param {string} identificador - IP o user_id
     * @returns {string}
     */
    function generarClave(accion, identificador) {
        return `rl:${accion}:${identificador}`;
    }

    /**
     * Verificar si se excedió el límite
     * @param {string} accion - Tipo de acción
     * @param {string} identificador - IP o user_id
     * @returns {Promise<{permitido: boolean, restantes: number, reset: number}>}
     */
    async function verificarRateLimit(accion, identificador) {
        const config = LIMITES[accion] || LIMITES.api;
        const clave = generarClave(accion, identificador);

        // Verificar cache local primero
        const cached = cacheLocal.get(clave);
        if (cached) {
            const ahora = Date.now();
            const edad = ahora - cached.timestamp;

            if (edad < config.ventana * 1000) {
                if (cached.intentos >= config.max) {
                    const reset = Math.ceil((config.ventana * 1000 - edad) / 1000);
                    return {
                        permitido: false,
                        restantes: 0,
                        reset: reset,
                        mensaje: `Demasiados intentos. Reintenta en ${reset}s`
                    };
                }

                return {
                    permitido: true,
                    restantes: config.max - cached.intentos,
                    reset: Math.ceil((config.ventana * 1000 - edad) / 1000)
                };
            }

            // Cache expirado, limpiar
            cacheLocal.delete(clave);
        }

        // Verificar en Supabase
        try {
            const { data, error } = await window.supabase.rpc('check_rate_limit', {
                accion: accion,
                max_intentos: config.max,
                ventana_segundos: config.ventana
            });

            if (error) throw error;

            const permitido = data !== false;

            // Actualizar cache local
            if (permitido) {
                const entry = cacheLocal.get(clave) || { intentos: 0, timestamp: Date.now() };
                entry.intentos++;
                entry.timestamp = Date.now();
                cacheLocal.set(clave, entry);
            }

            return {
                permitido,
                restantes: permitido ? config.max - (cacheLocal.get(clave)?.intentos || 0) : 0,
                reset: config.ventana,
                mensaje: permitido ? null : 'Límite de intentos excedido'
            };
        } catch (error) {
            console.warn('[RateLimit] Error verificando límite:', error);
            // Fallar abierto (permitir) para no bloquear usuarios legítimos
            return { permitido: true, restantes: config.max, reset: config.ventana };
        }
    }

    /**
     * Registrar intento (para acciones que no requieren verificación previa)
     */
    async function registrarIntento(accion, identificador) {
        const clave = generarClave(accion, identificador);
        const entry = cacheLocal.get(clave) || { intentos: 0, timestamp: Date.now() };
        entry.intentos++;
        entry.timestamp = Date.now();
        cacheLocal.set(clave, entry);

        // También registrar en DB
        try {
            await window.supabase
                .from('rate_limit_log')
                .insert({
                    accion: accion,
                    usuario_id: identificador.startsWith('user:') ? identificador.slice(5) : null,
                    ip_origen: identificador.startsWith('ip:') ? identificador.slice(3) : null
                });
        } catch (error) {
            console.warn('[RateLimit] Error registrando intento:', error);
        }
    }

    /**
     * Middleware para proteger funciones
     * @param {string} accion - Tipo de acción
     * @param {Function} fn - Función a proteger
     * @returns {Function}
     */
    function conRateLimit(accion, fn) {
        return async function(...args) {
            // Obtener identificador (IP o user_id)
            const identificador = await obtenerIdentificador();

            // Verificar límite
            const resultado = await verificarRateLimit(accion, identificador);

            if (!resultado.permitido) {
                // Registrar evento de seguridad
                await registrarEventoSeguridad('rate_limit_excedido', {
                    accion,
                    identificador,
                    limite: LIMITES[accion]?.max || LIMITES.api.max
                });

                throw new Error(resultado.mensaje);
            }

            // Ejecutar función original
            return await fn(...args);
        };
    }

    /**
     * Obtener identificador único del usuario
     * @returns {Promise<string>}
     */
    async function obtenerIdentificador() {
        // Intentar obtener IP del servidor
        try {
            const { data } = await window.supabase.rpc('get_client_ip');
            if (data) return `ip:${data}`;
        } catch {}

        // Fallback a session ID
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session?.user?.id) return `user:${session.user.id}`;

        // Último fallback: ID aleatorio
        return `anon:${crypto.randomUUID()}`;
    }

    /**
     * Registrar evento de seguridad
     */
    async function registrarEventoSeguridad(evento, datos) {
        console.warn('[Security]', evento, datos);
        // Aquí se podría enviar a un sistema de monitoreo
    }

    /**
     * Limpiar cache local periódicamente
     */
    setInterval(() => {
        const ahora = Date.now();
        const maxEdad = 3600 * 1000; // 1 hora

        for (const [clave, valor] of cacheLocal.entries()) {
            if (ahora - valor.timestamp > maxEdad) {
                cacheLocal.delete(clave);
            }
        }
    }, 60000); // Limpiar cada minuto

    // Exponer globalmente
    window.rateLimit = {
        verificar: verificarRateLimit,
        registrar: registrarIntento,
        conRateLimit,
        LIMITES
    };

    console.log('✅ rate-limit.js cargado - Protección contra abuso activada');
})();
