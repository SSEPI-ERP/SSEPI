// ============================================================================
// supabase-config.js — ÚNICA fuente de verdad para Supabase en frontend
// Cargar SIEMPRE después de <script src="...@supabase/supabase-js@2"></script>
// ============================================================================
(function() {
    var URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
    var ANON_KEY = '***ANON_REMOVED***';

    if (window.__SUPABASE_INITIALIZED__) {
        console.log('[supabase-config] Ya inicializado, saltando');
        return;
    }

    if (typeof supabase === 'undefined') {
        console.error('[supabase-config] SDK de Supabase no cargado');
        return;
    }

    // Exponer para otros módulos (CSP, auth-config, etc.)
    window.SUPABASE_URL = URL;
    window.SUPABASE_ANON_KEY = ANON_KEY;
    window.SSEPI_SUPABASE_URL = URL;

    window.supabase = supabase.createClient(URL, ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        },
        global: {
            headers: { 'X-Client-Info': 'ssepi-erp' }
        }
    });

    window.__SUPABASE_INITIALIZED__ = true;
    console.log('[supabase-config] Cliente Supabase inicializado');
})();