// ============================================================================
// supabase-config.js - Configuración centralizada para Supabase
// (Solo se declara una vez, se usa en todo el sistema)
// ============================================================================

const SUPABASE_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1MTc2NzMsImV4cCI6MjA2MTA5MzY3M30.J2z5oK7iSvKzW6vqNqPUUz8YFZSv9qQqK3qXqYqKqYg';

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