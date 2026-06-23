// ============================================================================
// inject-runtime-script.mjs
// Inserta <script src=".../config.runtime.js"></script> inmediatamente ANTES
// del <script src=".../supabase-config.js..."> en cada HTML del panel, de forma
// idempotente (no duplica si ya existe).
//
// Mantiene el mismo prefijo de ruta que usa cada página para supabase-config.js
// (absoluto /panel/js/core/ o relativo ../js/core/).
// ============================================================================
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PANEL = join(ROOT, 'panel');

const RUNTIME_MARKER = 'config.runtime.js';
// Coincide con <script ... src="PATHsupabase-config.js..."> ... </script> (con o sin type="module")
const SUPABASE_CONFIG_RE = /<script\b[^>]*\bsrc="([^"]*?)(supabase-config\.js[^"]*)"[^>]*><\/script>/;

function listHtml(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) listHtml(full, acc);
        else if (entry.name.endsWith('.html')) acc.push(full);
    }
    return acc;
}

let modified = 0, skipped = 0, untouched = 0;

for (const file of listHtml(PANEL)) {
    const orig = readFileSync(file, 'utf8');
    if (orig.includes(RUNTIME_MARKER)) { skipped++; continue; }
    const match = orig.match(SUPABASE_CONFIG_RE);
    if (!match) { untouched++; continue; }
    const prefix = match[1]; // ruta hasta supabase-config.js, ej: /panel/js/core/ o ../js/core/
    const runtimeTag = `<script src="${prefix}config.runtime.js"></script>`;
    const inserted = orig.replace(SUPABASE_CONFIG_RE, `${runtimeTag}\n    $&`);
    writeFileSync(file, inserted, 'utf8');
    modified++;
}

console.log(`✅ Inyección de config.runtime.js: ${modified} modificados, ${skipped} ya tenían, ${untouched} sin supabase-config.js.`);