// Build script para Vercel - Copia landing + panel al output
import { copyFileSync, mkdirSync, rmSync, readdirSync, statSync, accessSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'vercel-output');

// Limpiar output
try { rmSync(OUTPUT, { recursive: true }); } catch {}
mkdirSync(OUTPUT, { recursive: true });

// 1. Build del landing (asumimos que npm install ya se ejecutó en Vercel)
console.log('🔨 Building landing...');
try {
  execSync('npm run build --prefix landing', {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
} catch (error) {
  console.error('❌ Error building landing:', error.message);
  process.exit(1);
}

// 2. Copiar landing/dist a output
console.log('📦 Copying landing...');
const landingDist = join(ROOT, 'landing', 'dist');
if (existsSync(landingDist)) {
  copyDir(landingDist, OUTPUT);
} else {
  console.error('❌ Landing dist not found:', landingDist);
  process.exit(1);
}

// 3. Copiar panel a output/panel
console.log('📦 Copying panel...');
const panelSrc = join(ROOT, 'panel');
const panelDest = join(OUTPUT, 'panel');
mkdirSync(panelDest, { recursive: true });
copyDir(panelSrc, panelDest);

// 4. Copiar assets (si existen fuera del landing)
const assetsSrc = join(ROOT, 'assets');
const assetsDest = join(OUTPUT, 'assets');
if (existsSync(assetsSrc)) {
  console.log('📦 Copying assets...');
  mkdirSync(assetsDest, { recursive: true });
  copyDir(assetsSrc, assetsDest);
}

console.log('✅ Build completo!');

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  const entries = readdirSync(src);
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
