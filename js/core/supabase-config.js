// ============================================================================
// supabase-config.js - Configuración centralizada para Supabase
// (Solo se declara una vez, se usa en todo el sistema)
// ============================================================================

const SUPABASE_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
// Pega aquí tu Anon Key desde el dashboard de Supabase (Project Settings > API):
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDk5NzAsImV4cCI6MjA4NzYyNTk3MH0.y9AEScz9PWu3Tqnd-7R7fxf0smvVCosZF0edLg2j31A';

if (!window.__SUPABASE_INITIALIZED__) {
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