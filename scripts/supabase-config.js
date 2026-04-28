// supabase-config.js para scripts Node.js
// Usa variables de entorno o fallback al proyecto actual
const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || '***ANON_REMOVED***'
};

module.exports = SUPABASE_CONFIG;