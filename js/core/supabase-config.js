// ============================================================================
// supabase-config.js - Configuración centralizada para Supabase
// (Solo se declara una vez, se usa en todo el sistema)
// ============================================================================

const SUPABASE_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
// Pega aquí tu Anon Key desde el dashboard de Supabase (Project Settings > API):
const SUPABASE_ANON_KEY = '***ANON_REMOVED***';

if (!window.__SUPABASE_INITIALIZED__) {
    // Exponer URL para que otros módulos (p. ej. CSP) puedan ajustarse sin hardcode.
    window.SSEPI_SUPABASE_URL = SUPABASE_URL;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        },
        global: {
            headers: {
                'X-Client-Info': 'ssepi-erp'
            }
        }
    });
    window.supabase = client;
    window.__SUPABASE_INITIALIZED__ = true;
    console.log('Supabase Core: Cliente inicializado');
} else {
    console.log('Supabase ya estaba inicializado');
}