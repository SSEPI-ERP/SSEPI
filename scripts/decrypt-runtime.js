// scripts/decrypt-runtime.js
// Descifra módulos en tiempo de ejecución (solo en servidor)
// NUNCA usar en el cliente

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENC_DIR = path.join(__dirname, '..', 'core', '.enc');
const KEYS_DIR = path.join(__dirname, '..', 'core', 'keys');

// Cache de módulos descifrados
const moduloCache = new Map();

/**
 * Deriva una clave hija única para cada módulo usando HKDF
 * Debe coincidir con la lógica de build-secure.js
 */
function derivarClaveHija(masterKeyBuffer, nombreModulo) {
  return crypto.hkdfSync(
    'sha256',
    masterKeyBuffer,
    nombreModulo,
    'erp-modulo-v1',
    32
  );
}

/**
 * Descifra un módulo cifrado con AES-256-GCM
 */
function descifrarModulo(cifrado, claveModulo) {
  const iv = Buffer.from(cifrado.iv, 'hex');
  const authTag = Buffer.from(cifrado.tag, 'hex');
  const datos = Buffer.from(cifrado.datos, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', claveModulo, iv);
  decipher.setAuthTag(authTag);

  let descifrado = decipher.update(datos, 'hex', 'utf8');
  descifrado += decipher.final('utf8');

  return descifrado;
}

/**
 * Carga y descifra un módulo del core
 * Usa cache para evitar descifrar múltiples veces
 */
export async function cargarModuloCifrado(nombreModulo) {
  // Verificar cache
  if (moduloCache.has(nombreModulo)) {
    return moduloCache.get(nombreModulo);
  }

  // Validar variable de entorno
  const MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY;
  if (!MASTER_KEY || MASTER_KEY.length < 64) {
    throw new Error('MASTER_ENCRYPTION_KEY no válida o ausente');
  }

  const masterKeyBuffer = Buffer.from(MASTER_KEY, 'hex');

  // Leer archivo cifrado
  const rutaCifrada = path.join(ENC_DIR, `${nombreModulo}.enc.js`);
  if (!fs.existsSync(rutaCifrada)) {
    throw new Error(`Módulo cifrado no encontrado: ${nombreModulo}`);
  }

  const cifrado = JSON.parse(fs.readFileSync(rutaCifrada, 'utf8'));

  // Derivar clave y descifrar
  const claveHija = derivarClaveHija(masterKeyBuffer, nombreModulo);
  const codigoDescifrado = descifrarModulo(cifrado, claveHija);

  // Ejecutar módulo y cachear resultado
  const modulo = eval(codigoDescifrado);
  moduloCache.set(nombreModulo, modulo);

  return modulo;
}

/**
 * Limpia el cache de módulos (útil para hot reload en desarrollo)
 */
export function limpiarCache() {
  moduloCache.clear();
}

/**
 * Verifica que un módulo cifrado sea válido (tiene IV y tag correctos)
 */
export function verificarIntegridadModulo(nombreModulo) {
  try {
    const rutaCifrada = path.join(ENC_DIR, `${nombreModulo}.enc.js`);
    if (!fs.existsSync(rutaCifrada)) return false;

    const cifrado = JSON.parse(fs.readFileSync(rutaCifrada, 'utf8'));
    return !!(cifrado.iv && cifrado.tag && cifrado.datos);
  } catch {
    return false;
  }
}
