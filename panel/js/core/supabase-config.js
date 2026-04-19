// ============================================================================
// supabase-config.js - Configuración centralizada para Supabase
// (Solo se declara una vez, se usa en todo el sistema)
// ============================================================================

const SUPABASE_URL = 'https://foytizbicwnndegeorny.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXRpemJpY3dubmRlZ2Vvcm55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTYwMjIsImV4cCI6MjA5MTc3MjAyMn0.GvT4buxZgvGG_Llr-T9b1lxaEBmXMrCN9FK7WZYOZyA';

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