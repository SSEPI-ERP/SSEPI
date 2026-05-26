/**
 * Seed de contactos manuales (lista del usuario) → local_contactos
 * Fuente: data/contactos_manual_2026.json
 * Uso: node seed-contactos-manual.mjs
 */
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, 'data/contactos_manual_2026.json');

function norm(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function seed() {
  setDeferPersist(true);
  const db = await getDb();
  const stmt = await prepareStatement(db, 'local_contactos');

  if (!fs.existsSync(JSON_PATH)) {
    setDeferPersist(false);
    console.error('[Contactos Manual] Falta', JSON_PATH);
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  // Cargar contactos existentes para dedupe
  const existing = new Map();
  const exStmt = db.prepare('SELECT id, data FROM local_contactos');
  while (exStmt.step()) {
    const row = exStmt.getAsObject();
    try {
      const c = JSON.parse(row.data);
      if (c.nombre) existing.set(norm(c.nombre), { ...c, id: row.id });
    } catch { /* ignore */ }
  }
  exStmt.free();
  console.log(`[Contactos Manual] Contactos existentes: ${existing.size}`);

  let insertados = 0;
  let actualizados = 0;
  let saltados = 0;

  for (const rec of records) {
    const empresa = (rec.empresa || '').trim();
    const contacto = (rec.contacto || '').trim();
    const tipo = rec.tipo || 'empresa';

    let nombre = '';
    let tipo_ficha = 'empresa';
    let empresaFinal = '';

    if (tipo === 'empresa') {
      nombre = empresa;
      empresaFinal = empresa;
      tipo_ficha = 'empresa';
    } else if (tipo === 'contacto') {
      nombre = contacto || empresa;
      empresaFinal = '';
      tipo_ficha = 'contacto_solo';
    } else if (tipo === 'contacto_empresa') {
      nombre = contacto;
      empresaFinal = empresa;
      tipo_ficha = 'contacto_empresa';
    }

    if (!nombre) { saltados++; continue; }

    const nNombre = norm(nombre);
    const ex = existing.get(nNombre);

    const payload = {
      nombre: nombre.toUpperCase(),
      empresa: empresaFinal ? empresaFinal.toUpperCase() : (nombre.toUpperCase()),
      tipo_ficha,
      tipo: 'client',
      puesto: tipo === 'contacto_empresa' ? 'Contacto' : '',
      email: '',
      telefono: '',
      rfc: '',
      etiquetas: ['lista_manual_2026'],
      legacy_import: false,
      fuente: 'contactos_manual_2026',
      updated_at: new Date().toISOString(),
    };

    if (ex) {
      await stmt.update(ex.id, { ...ex, ...payload });
      actualizados++;
      existing.set(nNombre, { ...ex, ...payload, id: ex.id });
    } else {
      const inserted = await stmt.insert(null, { ...payload, created_at: new Date().toISOString() });
      insertados++;
      existing.set(nNombre, inserted);
    }
  }

  setDeferPersist(false);
  await persistDb();
  console.log(`[Contactos Manual] Insertados: ${insertados} | Actualizados: ${actualizados} | Saltados: ${saltados}`);
  console.log(`[Contactos Manual] Total en BD ahora: ${existing.size}`);
}

seed().catch(e => { console.error(e); process.exit(1); });
