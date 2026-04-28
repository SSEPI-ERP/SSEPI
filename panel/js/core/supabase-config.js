// ============================================================================
// supabase-config.js — ÚNICA fuente de verdad para Supabase en frontend
// FASE 1: Switch dinámico con fallback a SSEPI NEXT local (localhost:3333)
// Cargar SIEMPRE después de <script src="...@supabase/supabase-js@2"></script>
// ============================================================================
(function() {
    // Detect SSEPI NEXT local proxy mode (server-local.mjs on port 3333)
    var isSSEPINEXT = window.location.port === '3333' || window.__SSEPI_NEXT_MODE__ === true;
    var isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    var isLocal = isLocalDev && !isSSEPINEXT;

    var CLOUD_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
    var LOCAL_PROXY_URL = isSSEPINEXT ? (window.location.origin + '/proxy') : 'http://localhost:3333/proxy';
    var URL = isSSEPINEXT ? LOCAL_PROXY_URL : (isLocal ? 'http://127.0.0.1:54321' : CLOUD_URL);

    // IMPORTANTE: Ejecuta `supabase status` y reemplaza ANON_KEY_LOCAL con tu clave real
    var ANON_KEY_LOCAL = window.__SSEPI_LOCAL_ANON_KEY__ || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzQwNTAwMDAsImV4cCI6MTk4OTYyNjAwMH0.REPLACE_WITH_SUPABASE_STATUS_ANON_KEY';
    var ANON_KEY = isLocal ? ANON_KEY_LOCAL : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDk5NzAsImV4cCI6MjA4NzYyNTk3MH0.y9AEScz9PWu3Tqnd-7R7fxf0smvVCosZF0edLg2j31A';

    if (window.__SUPABASE_INITIALIZED__) {
        console.log('[supabase-config] Ya inicializado, saltando');
        return;
    }

    if (typeof supabase === 'undefined') {
        console.error('[supabase-config] SDK de Supabase no cargado');
        return;
    }

    // Interceptor de fetch: intenta Supabase (nube), si falla por red/timeout → fallback a SSEPI NEXT local
    function createSsepiFetch(primaryUrl, fallbackUrl) {
        return async function ssepiFetch(url, options) {
            var finalUrl = url;
            // Si estamos en SSEPI NEXT mode, ya va por /proxy (mismo origin)
            if (isSSEPINEXT) {
                return fetch(url, options);
            }

            // Si la URL no apunta al primary (cloud), no interceptar
            if (typeof url === 'string' && !url.includes(primaryUrl.replace(/^https?:\/\//, ''))) {
                return fetch(url, options);
            }

            // Intento 1: Supabase nube con timeout de 5 segundos
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 5000);
            try {
                var response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
                clearTimeout(timeoutId);
                return response;
            } catch (err) {
                clearTimeout(timeoutId);
                var isNetworkError = err.name === 'AbortError' || err.name === 'TypeError' ||
                    (err.message && (
                        err.message.includes('Failed to fetch') ||
                        err.message.includes('NetworkError') ||
                        err.message.includes('net::ERR') ||
                        err.message.includes('fetch')
                    ));

                if (isNetworkError) {
                    // Fallback a SSEPI NEXT local
                    var localUrl = url;
                    if (typeof url === 'string') {
                        localUrl = url.replace(primaryUrl, fallbackUrl);
                    }
                    console.warn('[supabase-config] Sin conexión a Supabase. Fallback a SSEPI NEXT:', localUrl);
                    try {
                        return await fetch(localUrl, options);
                    } catch (localErr) {
                        console.error('[supabase-config] Fallback local también falló:', localErr.message);
                        throw localErr;
                    }
                }
                throw err;
            }
        };
    }

    var customFetch = createSsepiFetch(CLOUD_URL, LOCAL_PROXY_URL);

    // Exponer para otros módulos (CSP, auth-config, etc.)
    window.SUPABASE_URL = URL;
    window.SUPABASE_ANON_KEY = ANON_KEY;
    window.SSEPI_SUPABASE_URL = URL;
    window.SSEPI_CLOUD_URL = CLOUD_URL;
    window.SSEPI_LOCAL_PROXY_URL = LOCAL_PROXY_URL;

    window.supabase = supabase.createClient(URL, ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        },
        global: {
            headers: { 'X-Client-Info': 'ssepi-erp' },
            fetch: customFetch
        }
    });

    window.__SUPABASE_INITIALIZED__ = true;
    console.log('[supabase-config] Cliente Supabase inicializado. Modo:', isSSEPINEXT ? 'SSEPI-NEXT-LOCAL' : (isLocal ? 'LOCAL-DEV' : 'CLOUD'));
})();
