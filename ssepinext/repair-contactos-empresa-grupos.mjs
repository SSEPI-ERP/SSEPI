/**
 * Repara contactos con empresa = nombre (contacto_solo) para agrupación Pac_Contactos.
 * Uso: node ssepinext/repair-contactos-empresa-grupos.mjs
 */
import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();
const stmt = await prepareStatement(db, 'local_contactos');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let fixed = 0;
const rows = db.exec('SELECT id, data FROM local_contactos');
if (rows.length && rows[0].values) {
  for (const [id, dataStr] of rows[0].values) {
    let c;
    try {
      c = JSON.parse(dataStr);
    } catch {
      continue;
    }
    const tipo = c.tipo_ficha || '';
    const n = norm(c.nombre);
    const e = norm(c.empresa);
    let changed = false;
    if (tipo === 'contacto_solo' || !tipo) {
      if (e && n && e === n && !c.empresa_tabulador) {
        c.empresa = '';
        changed = true;
      }
    }
    if (tipo === 'contacto_empresa' && e && n && e === n && c.empresa_tabulador) {
      c.empresa = String(c.empresa_tabulador).toUpperCase();
      changed = true;
    }
    if (changed) {
      c.updated_at = new Date().toISOString();
      await stmt.update(id, c);
      fixed++;
    }
  }
}

persistDb();
console.log(`[repair-contactos] Registros corregidos: ${fixed}`);
