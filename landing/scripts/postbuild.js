// scripts/postbuild.js
// Aplica ofuscación al bundle de producción después del build de Vite

import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist', 'assets');
const isProduction = process.env.NODE_ENV === 'production';

// Configuración de ofuscación para producción
const obfuscatorConfig = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: isProduction,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: isProduction,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

function ofuscarArchivos() {
  console.log('🔒 Ofuscando bundle de producción...\n');

  // Leer archivos JS del build
  const archivos = fs.readdirSync(DIST_DIR)
    .filter(f => f.endsWith('.js'));

  if (archivos.length === 0) {
    console.log('⚠️  No se encontraron archivos JS en dist/assets');
    return;
  }

  archivos.forEach(archivo => {
    const ruta = path.join(DIST_DIR, archivo);
    const contenido = fs.readFileSync(ruta, 'utf8');

    console.log(`📄 Procesando: ${archivo}`);

    const codigoOfuscado = JavaScriptObfuscator.obfuscate(
      contenido,
      obfuscatorConfig
    ).getObfuscatedCode();

    fs.writeFileSync(ruta, codigoOfuscado);
    console.log(`   ✅ Ofuscado`);
  });

  console.log('\n✅ Ofuscación completada');
  console.log(`📦 Archivos procesados: ${archivos.length}`);
}

// Solo ejecutar en producción
if (isProduction) {
  ofuscarArchivos();
} else {
  console.log('ℹ️  Desarrollo: ofuscación omitida');
}
