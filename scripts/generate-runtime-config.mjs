// ============================================================================
// generate-runtime-config.mjs
// Genera panel/js/config.runtime.js con la URL/anon key de Supabase y la URL
// del backend CFDI, leyéndolas de variables de entorno (Vercel build) o de
// .env.local (desarrollo local). El archivo generado queda en .gitignore y
// NUNCA debe commitearse: contiene la anon key del proyecto.
//
// Uso:
//   node scripts/generate-runtime-config.mjs          # lee process.env / .env.local
//
// Env vars esperadas:
//   SSEPI_SUPABASE_URL        (ej: https://xxxx.supabase.co)
//   SSEPI_SUPABASE_ANON_KEY   (anon key del proyecto — pública, protegida por RLS)
//   SSEPI_CFDI_BACKEND_URL    (ej: https://cfdi.ssepi.com — Fase 1.1, opcional)
// ============================================================================
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'panel', 'js', 'core', 'config.runtime.js');

// --- 1. Cargar .env.local en desarrollo (si process.env no trae los valores) ---
function loadEnvLocal() {
    const envPath = join(ROOT, '.env.local');
    if (!existsSync(envPath)) return;
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        if (!(k in process.env)) process.env[k] = v;
    }
}

loadEnvLocal();

// --- 2. Resolver valores con fallback seguro para dev ---
// En dev sin env, apuntamos al proxy local SSEPI-NEXT (no requiere cloud key).
const url = process.env.SSEPI_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.SSEPI_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const cfdiBackendUrl = process.env.SSEPI_CFDI_BACKEND_URL || '';

const hasCloudConfig = url && anonKey;

// Si no hay config de cloud y no estamos en Vercel, usar proxy local por defecto.
const isVercel = !!process.env.VERCEL || !!process.env.CI;
const finalUrl = url || (isVercel ? '' : (typeof window !== 'undefined' && window.location ? window.location.origin + '/proxy' : ''));
const finalAnonKey = anonKey;

if (isVercel && !hasCloudConfig) {
    console.error('❌ [generate-runtime-config] Falta SSEPI_SUPABASE_URL / SSEPI_SUPABASE_ANON_KEY en env (Vercel).');
    process.exit(1);
}

if (!hasCloudConfig) {
    console.warn('⚠️  [generate-runtime-config] Sin env de cloud. Generando config para modo local/dev (proxy SSEPI-NEXT). Ejecuta con SSEPI_SUPABASE_URL/SSEPI_SUPABASE_ANON_KEY para apuntar a cloud.');
}

// --- 3. Escribir config.runtime.js ---
mkdirSync(dirname(OUT), { recursive: true });

const payload = {
    url: finalUrl,
    anonKey: finalAnonKey,
    cfdiBackendUrl,
    generatedAt: new Date().toISOString()
};

const js = `// AUTOGENERADO por scripts/generate-runtime-config.mjs — NO EDITAR, NO COMMITEAR.
// Contiene la anon key del proyecto (pública, protegida por RLS).
window.__SSEPI_RUNTIME__ = ${JSON.stringify(payload, null, 2)};
`;

writeFileSync(OUT, js, 'utf8');

console.log(`✅ [generate-runtime-config] Escrito: ${OUT}`);
console.log(`   url: ${finalUrl || '(vacío — modo local)'}`);
console.log(`   anonKey: ${finalAnonKey ? finalAnonKey.slice(0, 12) + '…' : '(vacío)'}`);
console.log(`   cfdiBackendUrl: ${cfdiBackendUrl || '(sin configurar — Fase 1.1)'}`);