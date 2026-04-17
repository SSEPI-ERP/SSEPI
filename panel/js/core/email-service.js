/**
 * email-service.js — Envío de correos desde el ERP vía Resend (Supabase Edge Function).
 * La clave de Resend debe estar en Supabase Secrets (RESEND_API_KEY); nunca en este archivo.
 */

(function () {
    'use strict';

    function getSupabase() {
        return window.supabase || null;
    }

    /**
     * Envía un correo usando la Edge Function send-email (Resend).
     * @param {string|string[]} to - Email o array de emails
     * @param {string} subject - Asunto
     * @param {string} [html] - Cuerpo HTML (opcional)
     * @param {string} [text] - Cuerpo texto plano (opcional; si no hay html se usa uno por defecto)
     * @param {string} [from] - Remitente (opcional; por defecto SSEPI <onboarding@resend.dev>)
     * @returns {Promise<{id?: string, ok?: boolean, error?: string}>}
     */
    function sendEmail(to, subject, html, text, from) {
        var supabase = getSupabase();
        if (!supabase) {
            return Promise.reject(new Error('Supabase no disponible'));
        }
        var body = { to: to, subject: subject };
        if (html) body.html = html;
        if (text) body.text = text;
        if (from) body.from = from;
        return supabase.functions.invoke('send-email', { body: body }).then(function (r) {
            if (r.error) {
                return { error: r.error.message || r.error };
            }
            return r.data || {};
        });
    }

    window.emailService = {
        send: sendEmail
    };
})();
