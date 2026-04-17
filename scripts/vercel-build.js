// Build script para Vercel - Copia landing + panel al output
import { copyFileSync, mkdirSync, rmSync, readdirSync, statSync, accessSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'vercel-output');

// Limpiar output
try { rmSync(OUTPUT, { recursive: true }); } catch {}
mkdirSync(OUTPUT, { recursive: true });

// 1. Build del landing
console.log('🔨 Building landing...');
// Usar npm en lugar de pnpm para compatibilidad con Vercel
execSync('npm install --prefix landing', {
  stdio: 'inherit'
});
execSync('npm run build --prefix landing', {
  stdio: 'inherit'
});

// 2. Copiar landing/dist a output
console.log('📦 Copying landing...');
const landingDist = join(ROOT, 'landing', 'dist');
copyDir(landingDist, OUTPUT);

// 3. Copiar panel a output/panel
console.log('📦 Copying panel...');
const panelSrc = join(ROOT, 'panel');
const panelDest = join(OUTPUT, 'panel');
mkdirSync(panelDest, { recursive: true });
copyDir(panelSrc, panelDest);

// 4. Copiar assets (si existen fuera del landing)
const assetsSrc = join(ROOT, 'assets');
const assetsDest = join(OUTPUT, 'assets');
if (exists(assetsSrc)) {
  console.log('📦 Copying assets...');
  mkdirSync(assetsDest, { recursive: true });
  copyDir(assetsSrc, assetsDest);
}

console.log('✅ Build completo!');

function copyDir(src, dest) {
  const entries = [...new Set([...readdirSync(src)])];
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function exists(p) {
  try { accessSync(p); return true; } catch { return false; }
}
