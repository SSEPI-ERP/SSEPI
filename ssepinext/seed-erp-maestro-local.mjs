/**
 * Seed local ERP maestro → local_contactos + local_clientes_tabulador
 * Fuente única: simulaciones/escaner de imagenes/info/datos_comparador.json
 * (generado con build-erp-maestro.mjs — paquete simulaciones)
 *
 * Uso: node seed-erp-maestro-local.mjs [--replace-contactos]
 */
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalExcelName, isGarbageName } from '../scripts/imports/erp-maestro-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATOS_PATH = path.resolve(__dirname, '../simulaciones/escaner de imagenes/info/datos_comparador.json');
const REPLACE = process.argv.includes('--replace-contactos');

function norm(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function seed() {
  setDeferPersist(true);
  const db = await getDb();
  const stmtContactos = await prepareStatement(db, 'local_contactos');
  const stmtTabulador = await prepareStatement(db, 'local_clientes_tabulador');

  if (!fs.existsSync(DATOS_PATH)) {
    setDeferPersist(false);
    console.error('[ERP Maestro Local] Falta datos_comparador.json — ejecuta: cd scripts/imports && node build-erp-maestro.mjs');
    process.exit(1);
  }

  if (REPLACE) {
    db.exec('DELETE FROM local_contactos');
    console.log('[ERP Maestro Local] Contactos anteriores eliminados (--replace-contactos)');
  }

  const raw = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));
  const relacion = raw.relacionErp || raw.tabuladorErp?.relacionErp || [];
  const odoo = raw.odoo || [];
  const meta = raw.meta || raw.stats || {};

  console.log(`[ERP Maestro Local] odoo: ${odoo.length} capturas | relacionErp: ${relacion.length} empresas tabulador`);
  if (meta.totalImages) console.log(`[ERP Maestro Local] meta.totalImages: ${meta.totalImages}`);

  const contactoByNorm = new Map();
  const contactoByOdooId = new Map();
  const tabuladorByNorm = new Map();

  // Cargar contactos existentes para idempotencia (segunda pasada sin --replace)
  if (!REPLACE) {
    const existing = db.prepare('SELECT id, data FROM local_contactos');
    while (existing.step()) {
      const row = existing.getAsObject();
      try {
        const c = JSON.parse(row.data);
        if (c.nombre) contactoByNorm.set(norm(c.nombre), { ...c, id: row.id });
        if (c.odoo_captura_id) contactoByOdooId.set(String(c.odoo_captura_id), { ...c, id: row.id });
        if (c.empresa_tabulador) empresaIdMap.set(norm(c.empresa_tabulador), row.id);
      } catch { /* ignore */ }
    }
    existing.free();
    console.log(`[ERP Maestro Local] Contactos existentes cargados: ${contactoByNorm.size}`);
  }

  let odooInsertados = 0;
  let odooActualizados = 0;
  let empresasInsertadas = 0;
  let empresasActualizadas = 0;
  let tabuladorInsertado = 0;
  let tabuladorActualizado = 0;

  const empresaIdMap = new Map();

  // ── 1) Todas las capturas Odoo → contactos (139 o las que haya en comparador) ──
  for (const o of odoo) {
    const tabRaw = o.excelMatch || o.empresaAsociada || '';
    const tab = tabRaw ? canonicalExcelName(tabRaw) : '';
    let nombre = '';
    let tipo_ficha = o.tipoFicha || 'contacto_solo';
    let empresa = tab || (o.empresaAsociada || '').toUpperCase();

    if (tipo_ficha === 'empresa') {
      nombre = tab || o.nombreContacto || o.nombreBase || '';
      empresa = nombre.toUpperCase();
    } else if (tipo_ficha === 'contacto_empresa') {
      nombre = o.nombreContacto || o.contactoPersona || o.nombreBase || '';
    } else {
      nombre = o.nombreContacto || o.nombreBase || o.contactoPersona || '';
      if (tab) empresa = tab.toUpperCase();
    }

    nombre = (nombre || '').trim();
    if (!nombre || isGarbageName(nombre)) continue;

    const odooKey = o.id != null ? String(o.id) : null;
    const dedupeKey = odooKey ? `odoo:${odooKey}` : norm(`${nombre}|${empresa}|${tipo_ficha}`);

    let ex = odooKey && contactoByOdooId.get(odooKey);
    if (!ex) ex = contactoByNorm.get(norm(nombre));

    const payload = {
      nombre: nombre.toUpperCase(),
      empresa: empresa || nombre.toUpperCase(),
      empresa_tabulador: tab || null,
      tipo_ficha,
      tipo: 'client',
      puesto: o.puesto || (tipo_ficha === 'contacto_empresa' ? 'Vendedor' : ''),
      email: o.email || '',
      telefono: o.tel || '',
      rfc: o.excel?.rfc || '',
      odoo_captura_id: odooKey,
      match_score: o.matchScore ?? null,
      etiquetas: ['erp_maestro_2026'],
      legacy_import: false,
      fuente: 'datos_comparador_odoo',
      updated_at: new Date().toISOString(),
    };

    if (ex) {
      await stmtContactos.update(ex.id, { ...ex, ...payload });
      odooActualizados++;
      contactoByNorm.set(norm(nombre), { ...ex, ...payload, id: ex.id });
      if (odooKey) contactoByOdooId.set(odooKey, { id: ex.id, ...payload });
      if (tipo_ficha === 'empresa' && tab) empresaIdMap.set(norm(tab), ex.id);
    } else {
      const inserted = await stmtContactos.insert(null, { ...payload, created_at: new Date().toISOString() });
      odooInsertados++;
      contactoByNorm.set(norm(nombre), inserted);
      if (odooKey) contactoByOdooId.set(odooKey, inserted);
      if (tipo_ficha === 'empresa' && tab) empresaIdMap.set(norm(tab), inserted.id);
    }
  }

  // ── 2) Enriquecer empresas tabulador + vincular vendedores ──
  for (const rel of relacion) {
    const tabName = rel.empresaTabulador;
    if (!tabName) continue;
    const nTab = norm(tabName);

    const ex = contactoByNorm.get(nTab);
    const payload = {
      nombre: tabName.toUpperCase(),
      empresa: tabName.toUpperCase(),
      empresa_tabulador: tabName,
      tipo_ficha: 'empresa',
      tipo: 'client',
      rfc: rel.rfc || '',
      telefono: rel.telefono || '',
      email: rel.email || '',
      direccion: rel.direccion || '',
      km: Number(rel.km || rel.viajeDani?.km || 0),
      horas_viaje: Number(rel.viajeDani?.horas || 0),
      etiquetas: ['erp_maestro_2026'],
      legacy_import: false,
      fuente: 'datos_comparador_relacion',
      updated_at: new Date().toISOString(),
    };

    if (ex) {
      await stmtContactos.update(ex.id, { ...ex, ...payload });
      empresaIdMap.set(nTab, ex.id);
      empresasActualizadas++;
    } else {
      const inserted = await stmtContactos.insert(null, { ...payload, created_at: new Date().toISOString() });
      empresaIdMap.set(nTab, inserted.id);
      contactoByNorm.set(nTab, inserted);
      empresasInsertadas++;
    }

    for (const co of rel.contactosOdoo || []) {
      const nombreV = co.persona || co.nombre || co.nombreEnImagen;
      if (!nombreV || isGarbageName(nombreV)) continue;
      const nNombre = norm(nombreV);
      const empresaLocalId = empresaIdMap.get(nTab);
      const vPayload = {
        nombre: nombreV.toUpperCase(),
        empresa: tabName.toUpperCase(),
        empresa_tabulador: tabName,
        tipo_ficha: co.tipoFicha || 'contacto_empresa',
        tipo: 'client',
        empresa_padre_id: empresaLocalId || null,
        puesto: co.puesto || '',
        email: co.email || '',
        telefono: co.tel || '',
        odoo_captura_id: co.id ? String(co.id) : null,
        match_score: co.matchScore || null,
        etiquetas: ['erp_maestro_2026'],
        legacy_import: false,
        fuente: 'datos_comparador_relacion',
        updated_at: new Date().toISOString(),
      };
      const exV = contactoByNorm.get(nNombre);
      if (exV && exV.tipo_ficha === 'empresa') continue;
      if (exV) {
        await stmtContactos.update(exV.id, { ...exV, ...vPayload });
      } else {
        const ins = await stmtContactos.insert(null, { ...vPayload, created_at: new Date().toISOString() });
        contactoByNorm.set(nNombre, ins);
      }
    }

    const exTab = tabuladorByNorm.get(nTab) || (await stmtTabulador.query("json_extract(data, '$.nombre_cliente') = ?", [tabName], 'id ASC', 1))[0];
    const tabPayload = {
      nombre_cliente: tabName,
      empresa_tabulador: tabName,
      rfc: rel.rfc || '',
      km: Number(rel.km || rel.viajeDani?.km || 0),
      horas_viaje: Number(rel.viajeDani?.horas || 0),
      gasolina: Number(rel.viajeDani?.gasolina || 0),
      total_viaje: Number(rel.viajeDani?.totalViaje || 0),
      modulos_costo: rel.modulos || {},
      tipo_servicio: 'taller',
      activo: true,
      etiquetas: ['erp_maestro_2026'],
      updated_at: new Date().toISOString(),
    };
    if (exTab) {
      await stmtTabulador.update(exTab.id, { ...exTab, ...tabPayload });
      tabuladorActualizado++;
    } else {
      await stmtTabulador.insert(null, { ...tabPayload, created_at: new Date().toISOString() });
      tabuladorInsertado++;
    }
    tabuladorByNorm.set(nTab, tabPayload);
  }

  setDeferPersist(false);
  persistDb();

  const totalContactos = db.prepare('SELECT COUNT(*) c FROM local_contactos');
  totalContactos.step();
  const total = totalContactos.getAsObject().c;
  totalContactos.free();

  console.log(`[ERP Maestro Local] Odoo: +${odooInsertados} / ~${odooActualizados}`);
  console.log(`[ERP Maestro Local] Empresas tabulador: +${empresasInsertadas} / ~${empresasActualizadas}`);
  console.log(`[ERP Maestro Local] Tabulador: +${tabuladorInsertado} / ~${tabuladorActualizado}`);
  console.log(`[ERP Maestro Local] Total contactos en BD: ${total} (capturas comparador: ${odoo.length})`);
}

seed().catch(err => {
  setDeferPersist(false);
  console.error('[ERP Maestro Local] Error:', err);
  process.exit(1);
});
