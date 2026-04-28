// supabase-config.js para scripts Node.js
// Usa variables de entorno o fallback al proyecto actual
const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co',
  anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDk5NzAsImV4cCI6MjA4NzYyNTk3MH0.y9AEScz9PWu3Tqnd-7R7fxf0smvVCosZF0edLg2j31A'
};

module.exports = SUPABASE_CONFIG;