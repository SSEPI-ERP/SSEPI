import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'data', 'ssepi-local.db'));
db.exec('DELETE FROM local_contactos');
db.exec('DELETE FROM local_clientes_tabulador');
db.close();
console.log('OK - Contactos y tabulador limpiados');
