// ================================================
// ARCHIVO: encryption-utils.js
// DESCRIPCIÓN: Funciones para encriptación/desencriptación de datos sensibles
// SEGURIDAD: AES-256-GCM con pgcrypto (del lado de la base de datos)
//            Aquí solo se definen métodos de ayuda para enviar datos encriptados
//            pero la encriptación real ocurre en la BD mediante triggers/funciones.
// ================================================

/**
 * Estructura para datos encriptados que se enviarán a la BD.
 * El backend (Supabase) debe tener una función que reciba estos datos y los encripte.
 */
export class EncryptedField {
  constructor(plaintext) {
    this.plaintext = plaintext;
    this.encrypted = null;
    this.iv = null;
  }

  // Método para usar en consultas SQL (simulado)
  toSQL() {
    // En un entorno real, esto sería manejado por la función de encriptación de la BD
    // Por ejemplo: SELECT encrypt_data($1, $2) 
    return { plaintext: this.plaintext };
  }
}

/**
 * Función para marcar un campo como sensible y que debe ser encriptado.
 * Se usa en las operaciones de inserción/actualización para indicar al backend
 * que el valor debe ser procesado con pgcrypto.
 */
export function encryptField(value) {
  return value ? new EncryptedField(value) : null;
}

/**
 * Función para desencriptar un campo (solo para uso en el backend).
 * En el frontend nunca se desencripta, se recibe ya desencriptado desde la BD
 * gracias a las políticas de RLS y funciones seguras.
 */
export function decryptField(encryptedValue) {
  // Este método no debe ser llamado en frontend.
  console.warn('decryptField no debe ser usado en el cliente');
  return null;
}

/**
 * Genera un hash SHA-256 de un string (para integridad de registros).
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Calcula el hash de un objeto completo (para auditoría de integridad).
 */
export async function calculateRecordHash(record, excludeFields = ['id', 'created_at', 'updated_at', 'hash']) {
  const copy = { ...record };
  excludeFields.forEach(field => delete copy[field]);
  const jsonString = JSON.stringify(copy, Object.keys(copy).sort());
  return await sha256(jsonString);
}