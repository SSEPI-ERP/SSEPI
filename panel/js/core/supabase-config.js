// ============================================================================
// supabase-config.js — ÚNICA fuente de verdad para Supabase en frontend
// FASE 1: Switch dinámico con fallback a SSEPI NEXT local (localhost:3333)
// Cargar SIEMPRE después de <script src="...@supabase/supabase-js@2"></script>
// ============================================================================
(function() {
    // Detect SSEPI NEXT local proxy mode (server-local.mjs on port 3333 or 3443)
    var isSSEPINEXT = window.location.port === '3333' || window.location.port === '3443' || window.location.hostname.endsWith('.trycloudflare.com') || window.__SSEPI_NEXT_MODE__ === true;
    var isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    var isLocal = isLocalDev && !isSSEPINEXT;

    var CLOUD_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
    var LOCAL_PROXY_URL = isSSEPINEXT ? (window.location.origin + '/proxy') : 'http://localhost:3333/proxy';
    var URL = isSSEPINEXT ? LOCAL_PROXY_URL : (isLocal ? 'http://127.0.0.1:54321' : CLOUD_URL);

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

    // =====================================================
    // MODO OFFLINE TOTAL: Auth local contra SSEPI NEXT
    // =====================================================
    if (isSSEPINEXT) {
        (function() {
            var tokenKey = 'sb-offline-token';
            var sessionTokenKey = 'sb-offline-token-sess';
            var refreshTimer = null;

            function getToken() { return localStorage.getItem(tokenKey) || sessionStorage.getItem(sessionTokenKey) || null; }
            function setToken(t) { localStorage.setItem(tokenKey, t); try { sessionStorage.setItem(sessionTokenKey, t); } catch(e){} }
            function clearToken() { localStorage.removeItem(tokenKey); try { sessionStorage.removeItem(sessionTokenKey); } catch(e){} }

            async function api(path, opts) {
                var url = window.location.origin + '/api/auth' + path;
                var headers = Object.assign({}, opts && opts.headers || {});
                var t = getToken();
                if (t) headers['Authorization'] = 'Bearer ' + t;
                var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
                var body = await res.json().catch(function() { return null; });
                if (!res.ok) throw new Error((body && body.error) || ('HTTP ' + res.status));
                return body;
            }

            var offlineAuth = {
                signInWithPassword: async function(creds) {
                    var body = await api('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
                    if (body.data && body.data.session && body.data.session.access_token) {
                        setToken(body.data.session.access_token);
                        try {
                            var rol = body.data.user && body.data.user.user_metadata && body.data.user.user_metadata.rol;
                            if (rol) sessionStorage.setItem('ssepi_rol', rol);
                        } catch(e){}
                    }
                    return { data: body.data, error: null };
                },
                signUp: async function(creds) {
                    return { data: null, error: new Error('Registro offline solo vía admin') };
                },
                signOut: async function() {
                    clearToken();
                    try { sessionStorage.removeItem('ssepi_rol'); } catch(e){}
                    return { error: null };
                },
                getUser: async function() {
                    try {
                        var body = await api('/user');
                        return { data: { user: body.data.user }, error: null };
                    } catch (err) {
                        return { data: { user: null }, error: err };
                    }
                },
                getSession: async function() {
                    var t = getToken();
                    if (!t) return { data: { session: null }, error: null };
                    try {
                        var body = await api('/session');
                        return { data: { session: body.data.session }, error: null };
                    } catch (err) {
                        clearToken();
                        return { data: { session: null }, error: err };
                    }
                },
                updateUser: async function(attrs) {
                    return { data: { user: null }, error: new Error('updateUser offline no implementado') };
                },
                resetPasswordForEmail: async function(email) {
                    return { data: {}, error: new Error('Reset de password offline no implementado') };
                },
                onAuthStateChange: function(callback) {
                    var t = getToken();
                    if (t) {
                        setTimeout(function() {
                            callback('SIGNED_IN', { session: { access_token: t } });
                        }, 0);
                    }
                    return { data: { subscription: { unsubscribe: function(){} } } };
                },
                mfa: {
                    listFactors: async function() { return { data: { factors: [] }, error: null }; },
                    enroll: async function() { return { data: null, error: new Error('MFA offline no disponible') }; },
                    challengeAndVerify: async function() { return { data: null, error: new Error('MFA offline no disponible') }; },
                    challenge: async function() { return { data: null, error: new Error('MFA offline no disponible') }; }
                }
            };

            // Reemplazar auth del SDK por auth local offline
            window.supabase.auth = offlineAuth;

            // Desactivar realtime (channels) en modo offline
            var dummyChannel = {
                on: function() { return dummyChannel; },
                subscribe: function(cb) { if (typeof cb === 'function') cb('SUBSCRIBED'); return dummyChannel; },
                unsubscribe: function() {}
            };
            window.supabase.channel = function() { return dummyChannel; };
            if (window.supabase.realtime) {
                try { window.supabase.realtime.setAuth = function(){}; } catch(e){}
            }

            console.log('[supabase-config] Auth local offline activado (realtime desactivado)');
        })();
    }
})();
