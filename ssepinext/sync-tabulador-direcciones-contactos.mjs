/**
 * Enriquece clientes_tabulador y contactos (ficha empresa) con RFC, dirección y contacto del Excel.
 * Uso: node ssepinext/sync-tabulador-direcciones-contactos.mjs
 */
import { getDb, persistDb, prepareStatement } from './db.mjs';
import { TABULADOR_DIRECCIONES, buildDireccionesLookup, normTabuladorKey } from './data/tabulador-direcciones-contacto.mjs';

const lookup = buildDireccionesLookup();
const db = await getDb();
const stmtTab = await prepareStatement(db, 'local_clientes_tabulador');
const stmtContactos = await prepareStatement(db, 'local_contactos');

let tabUp = 0;
let contactUp = 0;
let contactCreated = 0;

const tabRows = db.exec('SELECT id, data FROM local_clientes_tabulador');
if (tabRows.length && tabRows[0].values) {
  for (const [id, dataStr] of tabRows[0].values) {
    let rec;
    try { rec = JSON.parse(dataStr); } catch { continue; }
    const key = normTabuladorKey(rec.nombre_cliente);
    const enr = lookup.get(key);
    if (!enr) continue;
    const next = {
      ...rec,
      rfc: enr.rfc || rec.rfc,
      direccion_fiscal: enr.direccion,
      contacto_referencia: enr.contacto,
      km: enr.km ?? rec.km,
      updated_at: new Date().toISOString(),
    };
    await stmtTab.update(id, next);
    tabUp++;
  }
}

const contactRows = db.exec('SELECT id, data FROM local_contactos');
if (contactRows.length && contactRows[0].values) {
  for (const [id, dataStr] of contactRows[0].values) {
    let c;
    try { c = JSON.parse(dataStr); } catch { continue; }
    const keys = [
      normTabuladorKey(c.empresa_tabulador),
      normTabuladorKey(c.empresa),
      normTabuladorKey(c.nombre),
    ].filter(Boolean);
    let enr = null;
    for (const k of keys) {
      if (lookup.has(k)) { enr = lookup.get(k); break; }
    }
    if (!enr) continue;

    const isEmpresa = c.tipo_ficha === 'empresa' || c.categoria === 'empresa';
    const patch = {
      ...c,
      rfc: enr.rfc || c.rfc,
      direccion: enr.direccion || c.direccion,
      updated_at: new Date().toISOString(),
    };
    if (isEmpresa) {
      patch.puesto = enr.contacto || c.puesto;
      await stmtContactos.update(id, patch);
      contactUp++;
    } else if (c.tipo_ficha === 'contacto_empresa') {
      if (!c.puesto) patch.puesto = enr.contacto;
      await stmtContactos.update(id, patch);
      contactUp++;
    }
  }
}

for (const enr of TABULADOR_DIRECCIONES) {
  const key = normTabuladorKey(enr.nombre);
  const exists = contactRows[0]?.values?.some(([, dataStr]) => {
    try {
      const c = JSON.parse(dataStr);
      return normTabuladorKey(c.empresa_tabulador || c.nombre) === key && (c.tipo_ficha === 'empresa' || c.categoria === 'empresa');
    } catch { return false; }
  });
  if (exists) continue;
  await stmtContactos.insert(null, {
    nombre: enr.nombre.toUpperCase(),
    empresa: enr.nombre.toUpperCase(),
    empresa_tabulador: enr.nombre.toUpperCase(),
    tipo_ficha: 'empresa',
    tipo: 'client',
    categoria: 'empresa',
    rfc: enr.rfc,
    direccion: enr.direccion,
    puesto: enr.contacto,
    km: enr.km,
    etiquetas: ['tabulador_excel_50', 'direccion_enriquecida'],
    fuente: 'tabulador_direcciones',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  contactCreated++;
}

persistDb();
console.log(`[sync-tabulador-direcciones] Tabulador actualizados: ${tabUp}`);
console.log(`[sync-tabulador-direcciones] Contactos actualizados: ${contactUp}`);
console.log(`[sync-tabulador-direcciones] Fichas empresa creadas: ${contactCreated}`);
