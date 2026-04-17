/**
 * security-logger.js
 * Sistema de logs y alertas de seguridad para el ERP
 *
 * Registra eventos críticos y envía alertas cuando se detectan anomalías
 */

(function() {
    'use strict';

    /**
     * Tipos de eventos de seguridad
     */
    const EventoSeguridad = {
        // Autenticación
        LOGIN_EXITOSO: 'auth.login.success',
        LOGIN_FALLIDO: 'auth.login.failed',
        LOGOUT: 'auth.logout',
        MFA_EXITOSO: 'auth.mfa.success',
        MFA_FALLIDO: 'auth.mfa.failed',
        MFA_ENROLL: 'auth.mfa.enroll',
        SESION_EXPIRADA: 'auth.session.expired',
        SESION_REVOCADA: 'auth.session.revoked',

        // Autorización
        ACCESO_CONCEDIDO: 'authz.access.granted',
        ACCESO_DENEGADO: 'authz.access.denied',
        PERMISO_INSUFICIENTE: 'authz.permission.insufficient',
        ROL_NO_AUTORIZADO: 'authz.role.unauthorized',

        // Datos
        DATO_CREADO: 'data.create',
        DATO_MODIFICADO: 'data.update',
        DATO_ELIMINADO: 'data.delete',
        DATO_EXPORTADO: 'data.export',
        DATO_IMPORTADO: 'data.import',
        DATO_SENSIBLE_ACCEDIDO: 'data.sensitive.access',

        // Administración
        CAMBIO_PERMISO: 'admin.permission.changed',
        CAMBIO_ROL: 'admin.role.changed',
        USUARIO_CREADO: 'admin.user.created',
        USUARIO_ELIMINADO: 'admin.user.deleted',
        CONFIG_MODIFICADA: 'admin.config.modified',

        // Seguridad
        ANOMALIA_DETECTADA: 'security.anomaly',
        RATE_LIMIT_EXCEDIDO: 'security.rate_limit.exceeded',
        INTENTO_INYECCION: 'security.injection.attempt',
        INTENTO_XSS: 'security.xss.attempt',
        CSRF_DETECTADO: 'security.csrf.detected',
        TOKEN_INVALIDO: 'security.token.invalid',

        // Archivo
        ARCHIVO_SUBIDO: 'file.upload',
        ARCHIVO_DESCARGADO: 'file.download',
        ARCHIVO_ELIMINADO: 'file.delete'
    };

    /**
     * Niveles de severidad
     */
    const Severidad = {
        BAJO: 'low',
        MEDIO: 'medium',
        ALTO: 'high',
        CRITICO: 'critical'
    };

    /**
     * Mapeo de eventos a severidad
     */
    const SEVERIDAD_POR_EVENTO = {
        [EventoSeguridad.LOGIN_FALLIDO]: Severidad.BAJO,
        [EventoSeguridad.MFA_FALLIDO]: Severidad.MEDIO,
        [EventoSeguridad.ACCESO_DENEGADO]: Severidad.BAJO,
        [EventoSeguridad.RATE_LIMIT_EXCEDIDO]: Severidad.MEDIO,
        [EventoSeguridad.INTENTO_INYECCION]: Severidad.ALTO,
        [EventoSeguridad.INTENTO_XSS]: Severidad.ALTO,
        [EventoSeguridad.ANOMALIA_DETECTADA]: Severidad.CRITICO,
        [EventoSeguridad.TOKEN_INVALIDO]: Severidad.ALTO
    };

    /**
     * Cola de eventos pendientes de envío
     */
    const colaEventos = [];

    /**
     * Registrar evento de seguridad
     * @param {string} evento - Tipo de evento
     * @param {object} datos - Datos adicionales
     * @param {Severidad} severidadOverride - Severidad explícita (opcional)
     */
    async function registrarEvento(evento, datos = {}, severidadOverride = null) {
        const timestamp = new Date().toISOString();
        const severidad = severidadOverride || SEVERIDAD_POR_EVENTO[evento] || Severidad.BAJO;

        // Obtener información del usuario
        const { data: { session } } = await window.supabase.auth.getSession();
        const usuario = session?.user;

        // Obtener IP (si está disponible)
        let ipOrigen = 'unknown';
        try {
            const { data } = await window.supabase.rpc('get_client_ip');
            if (data) ipOrigen = data;
        } catch {}

        const eventoCompleto = {
            evento,
            severidad,
            usuario_id: usuario?.id || 'anon',
            usuario_email: usuario?.email || 'anon',
            datos,
            ip_origen: ipOrigen,
            user_agent: navigator.userAgent,
            url_origen: window.location.href,
            timestamp
        };

        // Agregar a cola
        colaEventos.push(eventoCompleto);

        // Enviar inmediatamente si es crítico
        if (severidad === Severidad.CRITICO || severidad === Severidad.ALTO) {
            await enviarEvento(eventoCompleto);
            await enviarAlerta(eventoCompleto);
        }

        // Log en consola para desarrollo
        if (window.location.hostname === 'localhost') {
            console.log('[Security]', evento, eventoCompleto);
        }
    }

    /**
     * Enviar evento a la base de datos
     */
    async function enviarEvento(evento) {
        try {
            await window.supabase
                .from('audit_log')
                .insert({
                    tabla: 'erp_security',
                    operacion: evento.evento,
                    usuario_id: evento.usuario_id,
                    usuario_email: evento.usuario_email,
                    usuario_rol: evento.rol,
                    datos_nuevos: evento.datos,
                    ip_origen: evento.ip_origen,
                    timestamp: evento.timestamp
                });
        } catch (error) {
            console.warn('[SecurityLogger] Error guardando evento:', error);
        }
    }

    /**
     * Enviar alerta para eventos críticos
     */
    async function enviarAlerta(evento) {
        // Solo enviar alertas para eventos de alta/crítica severidad
        if (![Severidad.ALTO, Severidad.CRITICO].includes(evento.severidad)) {
            return;
        }

        try {
            // Notificar a admins (implementación específica)
            const mensaje = `🚨 ALERTA DE SEGURIDAD\n\nEvento: ${evento.evento}\nUsuario: ${evento.usuario_email}\nIP: ${evento.ip_origen}\nHora: ${evento.timestamp}`;

            // Aquí se integraría con Slack, email, SMS, etc.
            console.warn('[Security Alert]', mensaje);

            // Registrar en cola de alertas pendientes
            await window.supabase
                .from('security_alerts')
                .insert({
                    evento: evento.evento,
                    severidad: evento.severidad,
                    datos: evento.datos,
                    usuario_id: evento.usuario_id,
                    leida: false
                });
        } catch (error) {
            console.warn('[SecurityLogger] Error enviando alerta:', error);
        }
    }

    /**
     * Enviar eventos pendientes de la cola
     */
    async function flushCola() {
        if (colaEventos.length === 0) return;

        const eventos = [...colaEventos];
        colaEventos.length = 0;

        for (const evento of eventos) {
            if (evento.severidad !== Severidad.CRITICO && evento.severidad !== Severidad.ALTO) {
                await enviarEvento(evento);
            }
        }
    }

    // Enviar cola cada 30 segundos
    setInterval(flushCola, 30000);

    /**
     * Detectar anomalías básicas
     */
    function detectarAnomalias() {
        // Detectar múltiples intentos de login fallido
        const loginFallidos = colaEventos.filter(e =>
            e.evento === EventoSeguridad.LOGIN_FALLIDO &&
            Date.now() - new Date(e.timestamp).getTime() < 300000 // 5 min
        ).length;

        if (loginFallidos >= 5) {
            registrarEvento(
                EventoSeguridad.ANOMALIA_DETECTADA,
                { tipo: 'multiple_login_failures', count: loginFallidos },
                Severidad.ALTO
            );
        }
    }

    // Ejecutar detección cada minuto
    setInterval(detectarAnomalias, 60000);

    // Exponer globalmente
    window.securityLogger = {
        registrarEvento,
        EventoSeguridad,
        Severidad
    };

    console.log('✅ security-logger.js cargado - Monitoreo de seguridad activado');
})();
