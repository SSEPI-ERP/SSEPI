// scripts/build-secure.js
// Cifra módulos del core con AES-256-GCM y deriva claves por módulo

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CORE_DIR = path.join(__dirname, '..', 'core');
const ENC_DIR = path.join(CORE_DIR, '.enc');
const KEYS_DIR = path.join(CORE_DIR, 'keys');

// Obtener clave maestra de variable de entorno (mínimo 64 caracteres hex = 32 bytes)
const MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY;
if (!MASTER_KEY || MASTER_KEY.length < 64) {
  throw new Error('MASTER_ENCRYPTION_KEY debe tener al menos 64 caracteres hex');
}

const masterKeyBuffer = Buffer.from(MASTER_KEY, 'hex');

/**
 * Deriva una clave hija única para cada módulo usando HKDF
 * Esto asegura que si extraen un módulo, no pueden descifrar otros
 */
function derivarClaveHija(nombreModulo) {
  return crypto.hkdfSync(
    'sha256',
    masterKeyBuffer,
    nombreModulo,
    'erp-modulo-v1',
    32
  );
}

/**
 * Cifra código fuente con AES-256-GCM
 * Retorna objeto con IV, tag y datos cifrados
 */
function cifrarModulo(codigoFuente, claveModulo) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', claveModulo, iv);
  let cifrado = cipher.update(codigoFuente, 'utf8', 'hex');
  cifrado += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    datos: cifrado
  };
}

/**
 * Procesa un archivo del core
 * 1. Lee el código fuente
 * 2. Deriva clave hija
 * 3. Cifra el contenido
 * 4. Guarda archivo .enc.js
 * 5. Guarda metadatos de clave (sin la clave misma)
 */
function procesarArchivo(rutaEntrada, nombreModulo) {
  console.log(`🔐 Procesando: ${nombreModulo}`);

  const codigoFuente = fs.readFileSync(rutaEntrada, 'utf8');
  const claveHija = derivarClaveHija(nombreModulo);
  const cifrado = cifrarModulo(codigoFuente, claveHija);

  // Guardar archivo cifrado
  const rutaCifrada = path.join(ENC_DIR, `${nombreModulo}.enc.js`);
  fs.writeFileSync(rutaCifrada, JSON.stringify(cifrado, null, 2));

  // Guardar metadatos (IV y nombre, NO la clave)
  const rutaMetadatos = path.join(KEYS_DIR, `${nombreModulo}.meta.json`);
  fs.writeFileSync(rutaMetadatos, JSON.stringify({
    modulo: nombreModulo,
    iv: cifrado.iv,
    creado: new Date().toISOString()
  }, null, 2));

  console.log(`   ✅ Cifrado: ${rutaCifrada}`);
  console.log(`   📝 Metadatos: ${rutaMetadatos}`);
}

/**
 * Escanea el directorio core y procesa todos los archivos .js/.ts
 */
function cifrarCore() {
  console.log('🔒 Iniciando cifrado del core...\n');

  // Asegurar directorios de salida
  if (!fs.existsSync(ENC_DIR)) fs.mkdirSync(ENC_DIR, { recursive: true });
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

  // Limpiar archivos anteriores
  fs.readdirSync(ENC_DIR).forEach(f => {
    if (f.endsWith('.enc.js')) fs.unlinkSync(path.join(ENC_DIR, f));
  });

  // Procesar archivos del core
  const archivos = fs.readdirSync(CORE_DIR)
    .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
    .filter(f => !f.startsWith('.'));

  if (archivos.length === 0) {
    console.log('⚠️  No hay archivos en /core para cifrar');
    console.log('   Coloca aquí los módulos con lógica sensible');
    return;
  }

  archivos.forEach(archivo => {
    const ruta = path.join(CORE_DIR, archivo);
    const nombre = archivo.replace(/\.ts$/, '.js').replace(/\.js$/, '');
    procesarArchivo(ruta, nombre);
  });

  console.log('\n✅ Cifrado completado');
  console.log(`📦 Archivos cifrados: ${archivos.length}`);
  console.log('🔑 Guarda las claves en un lugar seguro (1Password, Bitwarden, AWS Secrets Manager)');
}

// Ejecutar
cifrarCore();
