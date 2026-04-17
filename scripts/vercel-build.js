// Build script para Vercel - Landing en raíz + Panel ERP en /panel/
import { copyFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'vercel-output');

// Limpiar output
try { rmSync(OUTPUT, { recursive: true }); } catch {}
mkdirSync(OUTPUT, { recursive: true });

// 1. Build del landing
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

// 2. Copiar landing/dist a output (raíz)
console.log('📦 Copying landing to root...');
const landingDist = join(ROOT, 'landing', 'dist');
if (existsSync(landingDist)) {
  copyDir(landingDist, OUTPUT);
} else {
  console.error('❌ Landing dist not found:', landingDist);
  process.exit(1);
}

// 3. Crear estructura /panel/ para el ERP
console.log('📦 Setting up /panel/ for ERP...');
const panelDest = join(OUTPUT, 'panel');
mkdirSync(panelDest, { recursive: true });

// 4. Copiar panel HTML files a /panel/
const panelSrc = join(ROOT, 'panel');
copyDir(panelSrc, panelDest);

// 5. Copiar css, js, pages, assets a /panel/
const dirsToCopy = ['css', 'js', 'pages', 'assets'];
for (const dir of dirsToCopy) {
  const src = join(ROOT, 'panel', dir);
  const dest = join(panelDest, dir);
  if (existsSync(src)) {
    console.log(`📦 Copying ${dir}...`);
    mkdirSync(dest, { recursive: true });
    copyDir(src, dest);
  }
}

// 6. Copiar assets globales también a /assets/ en raíz (para landing)
const assetsSrc = join(ROOT, 'assets');
const assetsDest = join(OUTPUT, 'assets');
if (existsSync(assetsSrc)) {
  console.log('📦 Copying global assets...');
  mkdirSync(assetsDest, { recursive: true });
  copyDir(assetsSrc, assetsDest);
}

console.log('✅ Build completo!');

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
