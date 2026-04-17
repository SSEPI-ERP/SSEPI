/**
 * auth-config.js
 * Configuración segura de autenticación con Supabase
 *
 * Características:
 * - PKCE flow (más seguro que implicit)
 * - Auto-refresh de tokens
 * - Detección de sesión en URL desactivada
 * - MFA obligatorio para admins
 */

(function() {
    'use strict';

    // Configuración de Supabase
    const SUPABASE_URL = window.SUPABASE_CONFIG?.url || 'https://foytizbicwnndegeorny.supabase.co';
    const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';

    /**
     * Configuración segura del cliente Supabase
     */
    const supabaseAuthConfig = {
        auth: {
            // PKCE flow es más seguro que implicit flow
            flowType: 'pkce',

            // Auto-refresh habilitado para renovación automática
            autoRefreshToken: true,

            // Persistencia de sesión
            persistSession: true,

            // No detectar sesión en URL (previene ataques de fijación)
            detectSessionInUrl: false,

            // Almacenamiento seguro
            storage: window.localStorage,

            // Tiempo de renovación (5 minutos antes de expirar)
            autoRefreshInterval: 300,

            // URL de redirección después de login
            redirectTo: window.location.origin + '/panel/panel.html',

            // URLs permitidas para deep links
            onlyFirstParty = true
        }
    };

    /**
     * Forzar MFA para usuarios admin/superadmin
     * @param {string} userId - ID del usuario
     * @returns {Promise<{enrolled: boolean, factorId: string}>}
     */
    async function forzarMFA(userId) {
        try {
            const { data: profile } = await window.supabase
                .from('usuarios')
                .select('rol')
                .eq('id', userId)
                .single();

            // Solo requerir MFA para admins
            if (!['admin', 'superadmin'].includes(profile?.rol)) {
                return { enrolled: false, reason: 'no_requerido' };
            }

            // Verificar si ya tiene MFA enrolled
            const { data: factors, error } = await window.supabase.auth.mfa.listFactors();

            if (error) throw error;

            const totpFactor = factors?.totp?.find(f => f.status === 'verified');

            if (totpFactor) {
                return { enrolled: true, factorId: totpFactor.id };
            }

            // Enroll nuevo factor TOTP
            const { data: enrollData, error: enrollError } = await window.supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'SSEPI Admin MFA'
            });

            if (enrollError) throw enrollError;

            return { enrolled: false, requiresEnrollment: true, ...enrollData };
        } catch (error) {
            console.error('[MFA] Error:', error);
            return { enrolled: false, error: error.message };
        }
    }

    /**
     * Verificar código MFA
     * @param {string} codigo - Código TOTP de 6 dígitos
     * @param {string} factorId - ID del factor MFA
     * @returns {Promise<{success: boolean, session?: object}>}
     */
    async function verificarMFA(codigo, factorId) {
        try {
            const { data, error } = await window.supabase.auth.mfa.challengeAndVerify({
                factorId: factorId,
                code: codigo
            });

            if (error) throw error;

            return { success: true, session: data };
        } catch (error) {
            console.error('[MFA] Verificación fallida:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Desafiar MFA (generar challenge)
     * @param {string} factorId - ID del factor MFA
     * @returns {Promise<{challengeId: string, expiresAt: number}>}
     */
    async function challengeMFA(factorId) {
        try {
            const { data, error } = await window.supabase.auth.mfa.challenge({
                factorId: factorId,
                channel: 'totp'
            });

            if (error) throw error;

            return {
                challengeId: data.id,
                expiresAt: data.expires_at
            };
        } catch (error) {
            console.error('[MFA] Challenge fallido:', error);
            return { error: error.message };
        }
    }

    /**
     * Verificar si el token está en lista negra
     * @param {string} token - Access token
     * @returns {Promise<boolean>}
     */
    async function verificarListaNegra(token) {
        try {
            // Hash del token para búsqueda
            const tokenHash = await crypto.subtle.digest('SHA-256',
                new TextEncoder().encode(token)
            );
            const hashHex = Array.from(new Uint8Array(tokenHash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            const { data } = await window.supabase
                .from('token_blacklist')
                .select('id')
                .eq('token_hash', hashHex)
                .gt('expires_at', new Date().toISOString())
                .single();

            return !!data;
        } catch (error) {
            console.warn('[Auth] No se pudo verificar lista negra:', error);
            return false;
        }
    }

    /**
     * Invalidar sesión (logout seguro)
     * @param {string} userId - ID del usuario
     * @returns {Promise<void>}
     */
    async function invalidarSesion(userId) {
        try {
            // Agregar token actual a lista negra
            const { data: { session } } = await window.supabase.auth.getSession();

            if (session?.access_token) {
                const tokenHash = await crypto.subtle.digest('SHA-256',
                    new TextEncoder().encode(session.access_token)
                );
                const hashHex = Array.from(new Uint8Array(tokenHash))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                await window.supabase
                    .from('token_blacklist')
                    .insert({
                        user_id: userId,
                        token_hash: hashHex,
                        expires_at: new Date(Date.now() + 86400000).toISOString() // 24 horas
                    });
            }

            // Cerrar sesión
            await window.supabase.auth.signOut();
        } catch (error) {
            console.error('[Auth] Error invalidando sesión:', error);
        }
    }

    /**
     * Middleware de validación de sesión
     * @returns {Promise<{valid: boolean, session?: object, reason?: string}>}
     */
    async function validarSesion() {
        try {
            const { data: { session }, error } = await window.supabase.auth.getSession();

            if (error || !session) {
                return { valid: false, reason: 'no_session' };
            }

            // Verificar expiración
            const expiresAt = session.expires_at * 1000;
            if (Date.now() >= expiresAt) {
                return { valid: false, reason: 'expirada' };
            }

            // Verificar lista negra
            const enListaNegra = await verificarListaNegra(session.access_token);
            if (enListaNegra) {
                return { valid: false, reason: 'revocada' };
            }

            return { valid: true, session };
        } catch (error) {
            console.error('[Auth] Error validando sesión:', error);
            return { valid: false, reason: 'error', error: error.message };
        }
    }

    /**
     * Generar nonce para CSP
     * @returns {string}
     */
    function generarNonce() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    // Exponer funciones globalmente
    window.authConfig = {
        supabaseAuthConfig,
        forzarMFA,
        verificarMFA,
        challengeMFA,
        verificarListaNegra,
        invalidarSesion,
        validarSesion,
        generarNonce
    };

    console.log('✅ auth-config.js cargado - Configuración segura de autenticación');
})();
