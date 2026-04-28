// ============================================================================
// supabase-config.js — ÚNICA fuente de verdad para Supabase en frontend
// Cargar SIEMPRE después de <script src="...@supabase/supabase-js@2"></script>
// ============================================================================
(function() {
    // Detect SSEPI NEXT local proxy mode (server-local.js on port 3333)
    var isSSEPINEXT = window.location.port === '3333' || window.__SSEPI_NEXT_MODE__ === true;
    var isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    var isLocal = isLocalDev && !isSSEPINEXT;

    var URL = isSSEPINEXT ? (window.location.origin + '/proxy') : (isLocal ? 'http://127.0.0.1:54321' : 'https://knzmdwjmrhcoytmebdwa.supabase.co');
    // IMPORTANTE: Ejecuta `supabase status` y reemplaza ANON_KEY_LOCAL con tu clave real
    var ANON_KEY_LOCAL = window.__SSEPI_LOCAL_ANON_KEY__ || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzQwNTAwMDAsImV4cCI6MTk4OTYyNjAwMH0.REPLACE_WITH_SUPABASE_STATUS_ANON_KEY';
    var ANON_KEY = isLocal ? ANON_KEY_LOCAL : '***ANON_REMOVED***';

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