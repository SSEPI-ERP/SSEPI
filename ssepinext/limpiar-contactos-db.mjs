/**
 * Limpia contactos y tabulador inventados antes de reimportar datos reales.
 * Usa sql.js (db.mjs), sin better-sqlite3.
 */
import { getDb, persistDb } from './db.mjs';

const db = await getDb();
db.exec('DELETE FROM local_contactos');
db.exec('DELETE FROM local_clientes_tabulador');
persistDb();
console.log('[limpiar] OK - Contactos y tabulador limpiados');
