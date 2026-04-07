// ================================================
// ARCHIVO: supabase-config.js
// DESCRIPCIÓN: Configuración centralizada de Supabase
// SEGURIDAD: Claves de API manejadas en variables de entorno
// ================================================

// NOTA: En producción, estas variables deben venir del servidor
// (process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
// pero para el desarrollo local se definen aquí.

const SUPABASE_CONFIG = {
  url: 'https://knzmdwjmrhcoytmebdwa.supabase.co',
  anonKey: '***ANON_REMOVED***'
};

// Inicializar cliente Supabase
const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Exponer globalmente para uso en todos los módulos
window.supabase = supabase;

// Verificar conexión inicial
(async () => {
  try {
    const { data, error } = await supabase.from('health_check').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Supabase conectado correctamente');
  } catch (err) {
    console.error('❌ Error al conectar con Supabase:', err.message);
  }
})();

export default supabase;