/**
 * Seed local ERP maestro → local_contactos + local_clientes_tabulador
 * Fuentes (en orden):
 * 1) simulaciones/Pac_Contactos/04_Datos_muestra/listado_tabulador_odoo.json (empresa + vendedores Odoo)
 * 2) Pac_Contactos rastro OCR + tabulador master (RFC, email, tel)
 * 3) datos_embebidos.js / datos_comparador.json (catálogo Odoo)
 *
 * Uso: node seed-erp-maestro-local.mjs [--replace-contactos]
 */
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalExcelName, isGarbageName, isValidEmpresaTabuladorName, RFC_BY_COMPANY } from '../scripts/imports/erp-maestro-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Preferir el paquete ERP (odooCatalog con tel/email) si existe.
const DATOS_PATH = path.resolve(__dirname, '../simulaciones/escaner de imagenes/info/datos_comparador.json');
const DATOS_EMBEBIDOS_JS = path.resolve(__dirname, '../simulaciones/SSEPI_Paquete_ERP/01_Comparador_Odoo_Excel/datos_embebidos.js');
const PAC_LISTADO_JSON = path.resolve(__dirname, '../simulaciones/Pac_Contactos/04_Datos_muestra/listado_tabulador_odoo.json');
const PAC_DATOS_COMPARADOR = path.resolve(__dirname, '../simulaciones/Pac_Contactos/01_Comparador_Odoo_Excel/datos_comparador.json');
const PAC_RASTRO_JSON = path.resolve(__dirname, '../simulaciones/Pac_Contactos/01_Comparador_Odoo_Excel/rastro_capturas_ejemplo.json');
const PAC_RASTRO_FULL = path.resolve(__dirname, '../simulaciones/Pac_Contactos/01_Comparador_Odoo_Excel/rastro_capturas.json');
const PAC_CAPTURAS_DIR = path.resolve(__dirname, '../simulaciones/Pac_Contactos/CapturasOdoo');
const TABULADOR_MASTER_JSON = path.resolve(__dirname, 'data/master/clientes_tabulador.json');
const REPLACE = process.argv.includes('--replace-contactos');

function norm(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function loadRastroIndex() {
  const map = new Map();
  const byFile = new Map();
  const paths = [PAC_RASTRO_FULL, PAC_RASTRO_JSON].filter((p) => fs.existsSync(p));
  for (const p of paths) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const capturas = raw.capturas || raw;
      for (const [fname, entry] of Object.entries(capturas)) {
        if (!entry || typeof entry !== 'object') continue;
        const key = norm(entry.nombreEnImagen || entry.contactoPersona || '');
        const row = {
          nombreEnImagen: String(entry.nombreEnImagen || '').trim(),
          nombreLineaCompleta: String(entry.nombreLineaCompleta || '').trim(),
          email: String(entry.emailImagen || '').trim(),
          telefono: String(entry.telImagen || '').trim(),
          rfc: String(entry.rfcImagen || '').trim(),
          direccion: String(entry.direccionImagen || '').trim(),
          puesto: String(entry.puestoImagen || '').trim(),
          sitio_web: String(entry.sitioWebImagen || '').trim(),
        };
        if (key && !map.has(key)) map.set(key, row);
        if (fname && !byFile.has(fname)) byFile.set(fname, row);
      }
    } catch (e) {
      console.warn('[ERP Maestro Local] rastro OCR:', p, e?.message || e);
    }
  }
  map._byFile = byFile;
  return map;
}

function loadTabuladorRfcIndex() {
  const map = new Map();
  if (!fs.existsSync(TABULADOR_MASTER_JSON)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(TABULADOR_MASTER_JSON, 'utf8'));
    for (const r of raw.records || []) {
      const name = canonicalExcelName(r.nombre_cliente || r.nombre || '');
      if (!name) continue;
      map.set(norm(name), {
        rfc: (r.rfc || '').trim(),
        km: Number(r.km) || 0,
        direccion: (r.direccion_fiscal || r.direccion || '').trim(),
      });
    }
  } catch (e) {
    console.warn('[ERP Maestro Local] tabulador master:', e?.message || e);
  }
  return map;
}

function buildCatalogIndex(odooCatalog) {
  const map = new Map();
  for (const o of odooCatalog || []) {
    for (const key of [o.nombre, o.nombreBase, o.nombreContacto, o.contactoPersona]) {
      const k = norm(key);
      if (!k) continue;
      if (!map.has(k)) {
        map.set(k, {
          email: String(o.email || '').trim(),
          telefono: String(o.tel || o.telefono || '').trim(),
        });
      }
    }
  }
  return map;
}

function buildCatalogById(odooCatalog) {
  const map = new Map();
  for (const o of odooCatalog || []) {
    if (o.id == null) continue;
    map.set(String(o.id), {
      email: String(o.email || '').trim(),
      telefono: String(o.tel || o.telefono || '').trim(),
      rfc: String(o.excel?.rfc || o.rfc || '').trim(),
      direccion: String(o.excel?.address || '').trim(),
    });
  }
  return map;
}

/** Copiar email/tel/RFC/dirección de capturas hijas a la ficha corta del tabulador. */
function rollupFieldsFromSiblings(ficha, siblings) {
  const patch = {};
  for (const c of siblings) {
    if (!c || c.id === ficha.id) continue;
    if (!ficha.email && c.email) patch.email = String(c.email).trim();
    if (!ficha.telefono && c.telefono) patch.telefono = String(c.telefono).trim();
    if (!ficha.rfc && c.rfc) patch.rfc = String(c.rfc).trim();
    if (!ficha.direccion && c.direccion) patch.direccion = String(c.direccion).trim();
    if (!ficha.puesto && c.puesto) patch.puesto = String(c.puesto).trim();
  }
  return patch;
}

function resolveRfc(tabName, listadoRfc, tabuladorRfc) {
  const k = norm(canonicalExcelName(tabName));
  return (listadoRfc || '').trim()
    || (tabuladorRfc.get(k)?.rfc || '').trim()
    || (RFC_BY_COMPANY[k] || '').trim();
}

/** No pisar email/tel/RFC ya capturados en pasos anteriores. */
/** OCR a veces lee el botón "Agregar Contacto" de Odoo como nombre; usar nombreLineaCompleta. */
function buildExcelMatchSet(capturas) {
  const set = new Set();
  for (const o of capturas || []) {
    const em = o.excelMatch || o.excel?.nameExcel || o.excel?.name || '';
    if (em) set.add(norm(canonicalExcelName(em)));
  }
  return set;
}

function stripLeadingOcrNoise(name) {
  let s = String(name || '').trim();
  s = s.replace(/^[A-Za-z]{1,2}\)\s*/, ''); // Ta) Anguiplast
  s = s.replace(/^[A-Za-z]{1,2}\s+(?=[A-ZÁÉÍÓÚÑ0-9])/, ''); // H Hebillas, Le LA MANERA
  s = s.replace(/^[)\]}\-_,.;:!?¡¿]+\s*/, '');
  return s.trim();
}

/** Resolver nombre legible: OCR → rastro → persona → excelMatch. */
function resolveNombreCaptura(o, di, ocr) {
  const candidates = [
    o.nombreContacto,
    o.nombreBase,
    di.nombreLineaCompleta,
    ocr.nombreLineaCompleta,
    di.nombreEnImagen,
    ocr.nombreEnImagen,
    o.contactoPersona,
    o.person,
    di.personaImagen,
    ocr.contactoPersona,
    o.empresaAsociada,
    o.empresaOdoo,
    di.empresaImagen,
    o.excelMatch ? canonicalExcelName(o.excelMatch) : '',
  ];
  for (const raw of candidates) {
    const n = stripLeadingOcrNoise(String(raw || '').trim());
    if (n && !isGarbageName(n)) return n;
  }
  return stripLeadingOcrNoise(String(candidates.find((c) => c && String(c).trim()) || '').trim());
}

/** Dirección mal parseada tipo "Cz = RFC' BEU160404M89" → extraer RFC. */
function cleanDireccionRfc(direccion, rfc) {
  const d = String(direccion || '').trim();
  if (!d) return { direccion: '', rfc: String(rfc || '').trim() };
  const m = d.match(/RFC[\u2019'\s:]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);
  if (m && (/rfc/i.test(d) || /^cz\s*=/i.test(d) || d.length < 40)) {
    return { direccion: '', rfc: String(rfc || m[1]).trim().toUpperCase() };
  }
  return { direccion: d, rfc: String(rfc || '').trim() };
}

function mergeContacto(base, patch) {
  const out = { ...base, ...patch };
  for (const k of ['email', 'telefono', 'rfc', 'direccion', 'puesto', 'odoo_captura_id', 'match_score', 'empresa_tabulador', 'empresa_padre_id', 'categoria', 'tipo_ficha']) {
    const next = patch[k];
    const prev = base[k];
    if ((next === '' || next == null) && prev) out[k] = prev;
  }
  return out;
}

async function seed() {
  setDeferPersist(true);
  const db = await getDb();
  const stmtContactos = await prepareStatement(db, 'local_contactos');
  const stmtTabulador = await prepareStatement(db, 'local_clientes_tabulador');

  const hasPacDatos = fs.existsSync(PAC_DATOS_COMPARADOR);
  const hasComparador = fs.existsSync(DATOS_PATH);
  const hasEmbebidos = fs.existsSync(DATOS_EMBEBIDOS_JS);
  if (!hasPacDatos && !hasComparador && !hasEmbebidos) {
    setDeferPersist(false);
    console.error('[ERP Maestro Local] Falta fuente de datos. Esperado uno de:');
    console.error(' -', PAC_DATOS_COMPARADOR);
    console.error(' -', DATOS_EMBEBIDOS_JS);
    console.error(' -', DATOS_PATH);
    console.error('[ERP Maestro Local] Ejecuta: cd simulaciones/Pac_Contactos/01_Comparador_Odoo_Excel && python build_comparador.py');
    process.exit(1);
  }

  if (REPLACE) {
    db.exec('DELETE FROM local_contactos');
    console.log('[ERP Maestro Local] Contactos anteriores eliminados (--replace-contactos)');
  }

  let raw = {};
  if (hasPacDatos) {
    raw = JSON.parse(fs.readFileSync(PAC_DATOS_COMPARADOR, 'utf8'));
    raw._source = 'pac_datos_comparador.json';
  } else if (hasEmbebidos) {
    const js = fs.readFileSync(DATOS_EMBEBIDOS_JS, 'utf8');
    // datos_embebidos.js: window.DATOS_COMPARADOR = {...};
    try {
      const idx = js.indexOf('window.DATOS_COMPARADOR');
      const start = js.indexOf('{', idx >= 0 ? idx : 0);
      const end = js.lastIndexOf('}');
      if (start >= 0 && end > start) {
        raw = JSON.parse(js.slice(start, end + 1));
        raw._source = 'datos_embebidos.js';
      } else {
        throw new Error('No se encontró bloque JSON en datos_embebidos.js');
      }
    } catch (e) {
      console.warn('[ERP Maestro Local] No se pudo parsear datos_embebidos.js, usando datos_comparador.json si existe.', e?.message || e);
      if (hasComparador) raw = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));
    }
  } else {
    raw = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));
  }
  const relacion = raw.relacionErp || raw.tabuladorErp?.relacionErp || raw.relacion || [];
  /** 139 capturas Odoo con email/tel/RFC desde rastro + build_comparador. */
  const odooCapturas = Array.isArray(raw.odoo) && raw.odoo.length >= 100 ? raw.odoo : [];
  const odooCatalog = raw.odooCatalog || [];
  const odoo = odooCapturas.length ? odooCapturas : (odooCatalog.length ? odooCatalog : (raw.odoo || []));
  const meta = raw.meta || raw.stats || {};
  const usePacCapturas = odooCapturas.length >= 100;

  // Excel (RFC/dirección/km/horas): en algunos builds, `datos_embebidos.js` viene sin address.
  // Si existe `datos_comparador.json`, usar SU sección excel como fuente de dirección.
  let excelSource = raw.excel || [];
  if (hasComparador) {
    try {
      const raw2 = JSON.parse(fs.readFileSync(DATOS_PATH, 'utf8'));
      if (Array.isArray(raw2.excel) && raw2.excel.length) {
        excelSource = raw2.excel;
      }
    } catch { /* ignore */ }
  }

  console.log(`[ERP Maestro Local] fuente: ${raw._source || 'desconocida'}`);
  console.log(`[ERP Maestro Local] capturas Odoo: ${odooCapturas.length || odoo.length} | catalogo: ${odooCatalog.length} | relacionErp: ${relacion.length}`);
  if (fs.existsSync(PAC_CAPTURAS_DIR)) {
    const nImg = fs.readdirSync(PAC_CAPTURAS_DIR).filter((f) => /\.png$/i.test(f)).length;
    console.log(`[ERP Maestro Local] PNG en CapturasOdoo: ${nImg}`);
  }
  if (meta.totalImages) console.log(`[ERP Maestro Local] meta.totalImages: ${meta.totalImages}`);

  const contactoByNorm = new Map();
  const contactoByOdooId = new Map();
  const empresaIdMap = new Map();
  const tabuladorByNorm = new Map();
  const excelByNorm = new Map();
  try {
    const excel = excelSource || [];
    for (const e of excel) {
      const name = e?.nameExcel || e?.name || '';
      if (!name) continue;
      excelByNorm.set(norm(canonicalExcelName(name)), e);
    }
  } catch { /* ignore */ }

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

  const rastroIndex = loadRastroIndex();
  const tabuladorRfc = loadTabuladorRfcIndex();
  const catalogIndex = buildCatalogIndex(odoo);
  const catalogById = buildCatalogById(odoo);
  console.log(`[ERP Maestro Local] Índices: rastro=${rastroIndex.size} nombres | tabulador RFC=${tabuladorRfc.size} | odoo id=${catalogById.size}`);

  async function upsertContacto(ex, payload) {
    const nNombre = payload.nombre ? norm(payload.nombre) : '';
    if (ex) {
      const merged = mergeContacto(ex, payload);
      await stmtContactos.update(ex.id, merged);
      const out = { ...merged, id: ex.id };
      if (nNombre) contactoByNorm.set(nNombre, out);
      if (payload.odoo_captura_id) contactoByOdooId.set(String(payload.odoo_captura_id), out);
      return { updated: true, row: out };
    }
    const inserted = await stmtContactos.insert(null, { ...payload, created_at: new Date().toISOString() });
    if (nNombre) contactoByNorm.set(nNombre, inserted);
    if (payload.odoo_captura_id) contactoByOdooId.set(String(payload.odoo_captura_id), inserted);
    return { updated: false, row: inserted };
  }

  // ── 0) Pac_Contactos listado tabulador (solo si NO hay las 139 capturas ya consolidadas) ──
  // Con usePacCapturas el Excel tabulador solo sirve para match/km en build_comparador, no contactos extra.
  let pacFilas = 0;
  let pacCapturas = 0;
  if (!usePacCapturas && fs.existsSync(PAC_LISTADO_JSON)) {
    const pac = JSON.parse(fs.readFileSync(PAC_LISTADO_JSON, 'utf8'));
    const filas = pac.en_tabulador_con_odoo || [];
    for (const rel of filas) {
      const tabName = canonicalExcelName(rel.empresa_tabulador || '');
      if (!tabName) continue;
      const nTab = norm(tabName);
      const rfcTab = resolveRfc(tabName, rel.rfc, tabuladorRfc);
      const tabExtra = tabuladorRfc.get(nTab) || {};

      // Ficha corta del tabulador (SOSER, ANGUIPLAST, …)
      const fichaPayload = {
        nombre: tabName.toUpperCase(),
        empresa: tabName.toUpperCase(),
        empresa_tabulador: tabName,
        tipo_ficha: 'empresa',
        categoria: 'empresa',
        tipo: 'client',
        rfc: rfcTab,
        direccion: tabExtra.direccion || '',
        km: Number(rel.km ?? tabExtra.km) || 0,
        etiquetas: ['erp_maestro_2026', 'pac_contactos'],
        legacy_import: false,
        fuente: 'pac_listado_tabulador',
        updated_at: new Date().toISOString(),
      };
      let exFicha = contactoByNorm.get(nTab);
      const rFicha = await upsertContacto(exFicha, fichaPayload);
      exFicha = rFicha.row;
      empresaIdMap.set(nTab, exFicha.id);
      if (rFicha.updated) empresasActualizadas++;
      else empresasInsertadas++;
      pacFilas++;

      if (!usePacCapturas) {
      for (const co of rel.contactos_odoo || []) {
        const nombreImg = String(co.nombre_imagen || '').trim();
        if (!nombreImg || isGarbageName(nombreImg)) continue;
        const odooKey = co.id_captura != null ? String(co.id_captura) : null;
        const tipo_ficha = co.tipo === 'empresa' ? 'empresa' : 'contacto_empresa';
        const nNombre = norm(nombreImg);
        const ocr = rastroIndex.get(nNombre) || {};
        const catById = odooKey ? (catalogById.get(odooKey) || {}) : {};
        const cat = catById.email || catById.telefono
          ? catById
          : (catalogIndex.get(nNombre) || catalogIndex.get(norm(co.empresa_odoo || '')) || {});
        const empresaOdoo = String(co.empresa_odoo || '').trim();

        const payload = {
          nombre: nombreImg.toUpperCase(),
          empresa: (tipo_ficha === 'empresa' ? tabName : (empresaOdoo || tabName)).toUpperCase(),
          empresa_tabulador: tabName,
          tipo_ficha,
          categoria: tipo_ficha === 'empresa' ? 'empresa' : 'persona',
          tipo: 'client',
          empresa_padre_id: exFicha.id,
          puesto: ocr.puesto || (tipo_ficha === 'contacto_empresa' ? 'Vendedor / contacto' : ''),
          email: cat.email || ocr.email || '',
          telefono: cat.telefono || ocr.telefono || '',
          rfc: tipo_ficha === 'empresa' ? (ocr.rfc || rfcTab) : (ocr.rfc || ''),
          direccion: ocr.direccion || tabExtra.direccion || '',
          odoo_captura_id: odooKey,
          match_score: co.match_tabulador_pct ?? null,
          etiquetas: ['erp_maestro_2026', 'pac_contactos'],
          legacy_import: false,
          fuente: 'pac_listado_odoo',
          updated_at: new Date().toISOString(),
        };

        let ex = odooKey ? contactoByOdooId.get(odooKey) : null;
        if (!ex) ex = contactoByNorm.get(nNombre);
        if (ex && ex.tipo_ficha === 'empresa' && norm(ex.nombre) === nTab) {
          // No reemplazar la ficha corta del tabulador con captura Odoo del mismo nombre
          ex = null;
        }
        const r = await upsertContacto(ex, payload);
        if (r.updated) odooActualizados++;
        else odooInsertados++;
        pacCapturas++;
      }
      }

      // Ficha corta "SOSER" hereda email/tel de capturas Odoo del mismo tabulador
      const siblings = [...contactoByNorm.values()].filter(
        c => norm(c.empresa_tabulador || '') === nTab || c.empresa_padre_id === exFicha.id
      );
      const patchFicha = rollupFieldsFromSiblings(exFicha, siblings);
      if (Object.keys(patchFicha).length) {
        const mergedF = mergeContacto(exFicha, patchFicha);
        await stmtContactos.update(exFicha.id, mergedF);
        exFicha = { ...mergedF, id: exFicha.id };
        contactoByNorm.set(nTab, exFicha);
      }
    }

    let soloExcelFilas = 0;
    const soloExcel = pac.solo_excel_calculadora || [];
    for (const rel of soloExcel) {
      const tabName = canonicalExcelName(rel.empresa_tabulador || '');
      if (!tabName) continue;
      const nTab = norm(tabName);
      const rfcTab = resolveRfc(tabName, rel.rfc, tabuladorRfc);
      const tabExtra = tabuladorRfc.get(nTab) || {};
      const fichaPayload = {
        nombre: tabName.toUpperCase(),
        empresa: tabName.toUpperCase(),
        empresa_tabulador: tabName,
        tipo_ficha: 'empresa',
        categoria: 'empresa',
        tipo: 'client',
        rfc: rfcTab,
        direccion: tabExtra.direccion || '',
        km: Number(rel.km ?? tabExtra.km) || 0,
        etiquetas: ['erp_maestro_2026', 'pac_contactos', 'solo_excel'],
        legacy_import: false,
        fuente: 'pac_solo_excel',
        updated_at: new Date().toISOString(),
      };
      const exFicha = contactoByNorm.get(nTab);
      const rFicha = await upsertContacto(exFicha, fichaPayload);
      empresaIdMap.set(nTab, rFicha.row.id);
      if (rFicha.updated) empresasActualizadas++;
      else empresasInsertadas++;
      soloExcelFilas++;
    }

    console.log(`[ERP Maestro Local] Pac_Contactos: ${pacFilas} con Odoo, ${soloExcelFilas} solo Excel, ${pacCapturas} capturas`);
  } else if (usePacCapturas) {
    console.log('[ERP Maestro Local] Pac_Contactos: 139 capturas + solo Excel calculadora (sin duplicar capturas)');
  } else {
    console.warn('[ERP Maestro Local] Falta', PAC_LISTADO_JSON);
  }

  // ── 1) Las 139 capturas Odoo (email, tel, RFC, dirección desde rastro + build_comparador) ──
  let capturasOmitidas = 0;
  const omitidasLog = [];
  if (usePacCapturas) {
    for (const o of odooCapturas) {
      const di = o.datosImagen || {};
      const rastroByFile = rastroIndex._byFile?.get(o.file) || {};
      const rastroNom = rastroIndex.get(norm(o.nombreContacto || o.nombreBase || '')) || {};
      const ocr = { ...rastroNom, ...rastroByFile };

      const tipo_ficha = o.tipoFicha || 'contacto_solo';
      const tabRaw = o.excelMatch || o.excel?.nameExcel || o.excel?.name || '';
      const tab = tabRaw ? canonicalExcelName(tabRaw) : '';
      const nombre = resolveNombreCaptura(o, di, ocr);
      if (!nombre || isGarbageName(nombre)) {
        capturasOmitidas++;
        omitidasLog.push(`#${o.id} ${String(o.nombreContacto || '').slice(0, 40)}`);
        continue;
      }

      let rfcRaw = String(o.rfc || di.rfcImagen || ocr.rfc || '').trim();
      rfcRaw = /^no aplica/i.test(rfcRaw) ? '' : rfcRaw;
      const dirClean = cleanDireccionRfc(
        String(o.direccion || di.direccionImagen || ocr.direccion || '').trim(),
        rfcRaw
      );
      const rfc = dirClean.rfc;

      let empresaFinal = '';
      if (tipo_ficha === 'empresa') {
        empresaFinal = (nombre || tab || '').toUpperCase();
      } else if (tipo_ficha === 'contacto_empresa') {
        empresaFinal = (o.empresaAsociada || o.empresaOdoo || tab || nombre).toUpperCase();
      } else {
        empresaFinal = tab ? tab.toUpperCase() : nombre.toUpperCase();
      }

      const odooKey = String(o.id);
      const payload = {
        nombre: nombre.toUpperCase(),
        empresa: empresaFinal,
        empresa_tabulador: tab || null,
        tipo_ficha,
        categoria: tipo_ficha === 'empresa' ? 'empresa' : 'persona',
        tipo: 'client',
        puesto: String(o.puesto || di.puestoImagen || ocr.puesto || '').trim(),
        email: String(o.email || di.emailImagen || ocr.email || '').trim(),
        telefono: String(o.tel || di.telImagen || ocr.telefono || '').trim(),
        rfc: rfc || (tab && tipo_ficha === 'empresa' ? resolveRfc(tab, '', tabuladorRfc) : ''),
        direccion: dirClean.direccion,
        sitio_web: String(o.sitioWeb || di.sitioWebImagen || ocr.sitio_web || '').trim(),
        odoo_captura_id: odooKey,
        captura_archivo: o.file || null,
        match_score: o.matchScore ?? null,
        etiquetas: ['erp_maestro_2026', 'pac_captura'],
        legacy_import: false,
        fuente: 'pac_datos_comparador',
        updated_at: new Date().toISOString(),
      };
      if (tab && empresaIdMap.has(norm(tab))) {
        payload.empresa_padre_id = empresaIdMap.get(norm(tab));
      }

      const ex = contactoByOdooId.get(odooKey);
      const r = await upsertContacto(ex, payload);
      if (r.updated) odooActualizados++;
      else odooInsertados++;
    }
    // Vincular vendedores → ficha empresa captura del mismo tabulador
    let vinculosPadre = 0;
    for (const c of [...contactoByOdooId.values()]) {
      if (c.tipo_ficha !== 'contacto_empresa' || !c.empresa_tabulador || c.empresa_padre_id) continue;
      const nTab = norm(c.empresa_tabulador);
      const ficha = [...contactoByOdooId.values()].find(
        (x) => x.tipo_ficha === 'empresa' && norm(x.empresa_tabulador || '') === nTab
      );
      if (!ficha) continue;
      const merged = mergeContacto(c, { empresa_padre_id: ficha.id });
      await stmtContactos.update(c.id, merged);
      const out = { ...merged, id: c.id };
      contactoByOdooId.set(String(c.odoo_captura_id), out);
      contactoByNorm.set(norm(c.nombre), out);
      vinculosPadre++;
    }
    if (vinculosPadre) console.log(`[ERP Maestro Local] Vínculos vendedor→empresa captura: ${vinculosPadre}`);

    // ── 1b) Empresas solo Excel (calculadora): sin captura Odoo vinculada ──
    const excelMatched = buildExcelMatchSet(odooCapturas);
    let soloExcelInsertados = 0;
    let soloExcelOmitidos = 0;
    if (fs.existsSync(PAC_LISTADO_JSON)) {
      const pac = JSON.parse(fs.readFileSync(PAC_LISTADO_JSON, 'utf8'));
      for (const rel of pac.solo_excel_calculadora || []) {
        const tabName = canonicalExcelName(rel.empresa_tabulador || '');
        if (!isValidEmpresaTabuladorName(tabName)) {
          soloExcelOmitidos++;
          continue;
        }
        const nTab = norm(tabName);
        if (excelMatched.has(nTab)) {
          soloExcelOmitidos++;
          continue;
        }
        const rfcTab = resolveRfc(tabName, rel.rfc, tabuladorRfc);
        const tabExtra = tabuladorRfc.get(nTab) || {};
        const fichaPayload = {
          nombre: tabName.toUpperCase(),
          empresa: tabName.toUpperCase(),
          empresa_tabulador: tabName,
          tipo_ficha: 'empresa',
          categoria: 'empresa',
          tipo: 'client',
          rfc: rfcTab,
          direccion: tabExtra.direccion || '',
          km: Number(rel.km ?? tabExtra.km) || 0,
          total_gastos: Number(rel.total_gastos) || 0,
          etiquetas: ['erp_maestro_2026', 'pac_contactos', 'solo_excel', 'calculadora'],
          legacy_import: false,
          fuente: 'pac_solo_excel',
          updated_at: new Date().toISOString(),
        };
        const exFicha = contactoByNorm.get(nTab);
        const rFicha = await upsertContacto(exFicha, fichaPayload);
        empresaIdMap.set(nTab, rFicha.row.id);
        if (rFicha.updated) empresasActualizadas++;
        else {
          empresasInsertadas++;
          soloExcelInsertados++;
        }
      }
    }
    console.log(`[ERP Maestro Local] Solo Excel calculadora: +${soloExcelInsertados} (omitidos/duplicados: ${soloExcelOmitidos})`);
    if (capturasOmitidas) {
      console.log(`[ERP Maestro Local] Capturas omitidas (nombre OCR basura): ${capturasOmitidas}`);
      omitidasLog.slice(0, 8).forEach((l) => console.log(`   ${l}`));
    }

    console.log(`[ERP Maestro Local] Capturas Pac importadas: ${odooCapturas.length - capturasOmitidas} (+${odooInsertados} / ~${odooActualizados})`);
  } else for (const o of odoo) {
    const tabRaw = o.excelMatch || o.empresaAsociada || '';
    const tab = tabRaw ? canonicalExcelName(tabRaw) : '';
    const excel = tab ? (excelByNorm.get(norm(tab)) || null) : null;
    let nombre = '';
    let tipo_ficha = o.tipoFicha || 'contacto_solo';
    let empresa = tab || (o.empresaAsociada || '').toUpperCase();

    if (tipo_ficha === 'empresa') {
      nombre = tab || o.nombreContacto || o.nombreBase || '';
      empresa = nombre.toUpperCase();
    } else if (tipo_ficha === 'contacto_empresa') {
      nombre = o.nombreContacto || o.contactoPersona || o.nombreBase || '';
      empresa = (tab || (o.empresaAsociada || '')).toUpperCase();
    } else {
      nombre = o.nombreContacto || o.nombreBase || o.contactoPersona || '';
      empresa = tab ? tab.toUpperCase() : '';
    }

    nombre = (nombre || '').trim();
    if (!nombre || isGarbageName(nombre)) continue;

    const odooKey = o.id != null ? String(o.id) : null;
    const dedupeKey = odooKey ? `odoo:${odooKey}` : norm(`${nombre}|${empresa}|${tipo_ficha}`);

    let ex = odooKey && contactoByOdooId.get(odooKey);
    if (!ex) ex = contactoByNorm.get(norm(nombre));

    const empresaFinal = tipo_ficha === 'empresa'
      ? (nombre || empresa || '').toUpperCase()
      : (empresa || '').toUpperCase();

    const payload = {
      nombre: nombre.toUpperCase(),
      empresa: empresaFinal,
      empresa_tabulador: tab || null,
      tipo_ficha,
      tipo: 'client',
      puesto: o.puesto || (tipo_ficha === 'contacto_empresa' ? 'Vendedor' : ''),
      email: o.email || '',
      telefono: o.tel || '',
      rfc: o.excel?.rfc || excel?.rfc || '',
      direccion: o.excel?.address || excel?.address || '',
      odoo_captura_id: odooKey,
      match_score: o.matchScore ?? null,
      etiquetas: ['erp_maestro_2026'],
      legacy_import: false,
      fuente: 'datos_comparador_odoo',
      updated_at: new Date().toISOString(),
    };

    if (ex) {
      const merged = mergeContacto(ex, payload);
      await stmtContactos.update(ex.id, merged);
      odooActualizados++;
      contactoByNorm.set(norm(nombre), { ...merged, id: ex.id });
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

  // ── 2) Enriquecer empresas tabulador (solo sin las 139 capturas consolidadas) ──
  if (!usePacCapturas) for (const rel of relacion) {
    const tabName = rel.empresaTabulador;
    if (!tabName) continue;
    const nTab = norm(tabName);
    const excel = excelByNorm.get(norm(canonicalExcelName(tabName))) || null;

    const ex = contactoByNorm.get(nTab);
    const payload = {
      nombre: tabName.toUpperCase(),
      empresa: tabName.toUpperCase(),
      empresa_tabulador: tabName,
      tipo_ficha: 'empresa',
      categoria: 'empresa',
      tipo: 'client',
      rfc: rel.rfc || '',
      telefono: rel.telefono || '',
      email: rel.email || '',
      direccion: rel.direccion || excel?.address || '',
      km: Number(rel.km || rel.viajeDani?.km || 0),
      horas_viaje: Number(rel.viajeDani?.horas || 0),
      etiquetas: ['erp_maestro_2026'],
      legacy_import: false,
      fuente: 'datos_comparador_relacion',
      updated_at: new Date().toISOString(),
    };

    if (ex) {
      const merged = mergeContacto(ex, payload);
      // Preservar fuente mas especifica y etiqueta 'solo_excel' si la ficha venia de Pac_Contactos
      if (ex.fuente === 'pac_solo_excel' || ex.fuente === 'pac_listado_odoo') {
        merged.fuente = ex.fuente;
        const tagsActuales = Array.isArray(ex.etiquetas) ? ex.etiquetas : [];
        if (!tagsActuales.includes('solo_excel')) tagsActuales.push('solo_excel');
        if (!tagsActuales.includes('pac_contactos')) tagsActuales.push('pac_contactos');
        merged.etiquetas = tagsActuales;
      }
      await stmtContactos.update(ex.id, merged);
      empresaIdMap.set(nTab, ex.id);
      contactoByNorm.set(nTab, { ...merged, id: ex.id });
      empresasActualizadas++;
    } else {
      const inserted = await stmtContactos.insert(null, { ...payload, created_at: new Date().toISOString() });
      empresaIdMap.set(nTab, inserted.id);
      contactoByNorm.set(nTab, inserted);
      empresasInsertadas++;
    }

    if (!usePacCapturas) {
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
      const exV = co.id ? contactoByOdooId.get(String(co.id)) : contactoByNorm.get(nNombre);
      if (exV && exV.tipo_ficha === 'empresa') continue;
      if (exV) {
        const mergedV = mergeContacto(exV, vPayload);
        await stmtContactos.update(exV.id, mergedV);
        const out = { ...mergedV, id: exV.id };
        contactoByNorm.set(nNombre, out);
        if (co.id) contactoByOdooId.set(String(co.id), out);
      } else {
        const ins = await stmtContactos.insert(null, { ...vPayload, created_at: new Date().toISOString() });
        contactoByNorm.set(nNombre, ins);
        if (co.id) contactoByOdooId.set(String(co.id), ins);
      }
    }
    }

    // NOTA: Ya no se modifica local_clientes_tabulador aquí.
    // La fuente única del tabulador (50 empresas) es `seed-tabulador-50.mjs`.
  }

  // ── 3) Reaplicar email/tel/RFC del catálogo Odoo por odoo_captura_id ──
  let catalogEnriquecidos = 0;
  const catalogSource = odooCapturas.length ? odooCapturas : odoo;
  for (const o of catalogSource) {
    const odooKey = o.id != null ? String(o.id) : null;
    const ex = odooKey ? contactoByOdooId.get(odooKey) : null;
    if (!ex) continue;
    const di = o.datosImagen || {};
    const rastroByFile = o.file ? (rastroIndex._byFile?.get(o.file) || {}) : {};
    const rastroNom = rastroIndex.get(norm(o.nombreContacto || o.nombreBase || '')) || {};
    const ocr = { ...rastroNom, ...rastroByFile };
    const patch = {};
    const email = String(o.email || di.emailImagen || ocr.email || '').trim();
    const tel = String(o.tel || di.telImagen || ocr.telefono || '').trim();
    const rfcRaw = String(o.rfc || di.rfcImagen || ocr.rfc || '').trim();
    const rfc = /^no aplica/i.test(rfcRaw) ? '' : rfcRaw;
    if (email) patch.email = email;
    if (tel) patch.telefono = tel;
    if (rfc) patch.rfc = rfc;
    const dir = String(o.direccion || di.direccionImagen || ocr.direccion || '').trim();
    if (dir) patch.direccion = dir;
    if (!Object.keys(patch).length) continue;
    const merged = mergeContacto(ex, patch);
    if (merged.email === ex.email && merged.telefono === ex.telefono
      && merged.rfc === ex.rfc && merged.direccion === ex.direccion) continue;
    await stmtContactos.update(ex.id, merged);
    const out = { ...merged, id: ex.id };
    contactoByNorm.set(norm(ex.nombre), out);
    contactoByOdooId.set(odooKey, out);
    catalogEnriquecidos++;
  }
  console.log(`[ERP Maestro Local] Catálogo email/tel reaplicados: ${catalogEnriquecidos}`);

  // ── 4) Rollup global: fichas empresa tabulador ← mejores datos de hijos/capturas ──
  const byTab = new Map();
  for (const c of contactoByNorm.values()) {
    const tab = (c.empresa_tabulador || '').trim();
    if (!tab) continue;
    const k = norm(tab);
    if (!byTab.has(k)) byTab.set(k, []);
    byTab.get(k).push(c);
  }
  let rollupGlobal = 0;
  for (const [k, list] of byTab) {
    const ficha = list.find(c => c.tipo_ficha === 'empresa' && norm(c.nombre) === k)
      || list.find(c => c.tipo_ficha === 'empresa');
    if (!ficha) continue;
    const patch = rollupFieldsFromSiblings(ficha, list);
    if (!Object.keys(patch).length) continue;
    const merged = mergeContacto(ficha, patch);
    if (merged.email === ficha.email && merged.telefono === ficha.telefono
      && merged.rfc === ficha.rfc && merged.direccion === ficha.direccion) continue;
    await stmtContactos.update(ficha.id, merged);
    contactoByNorm.set(norm(ficha.nombre), { ...merged, id: ficha.id });
    rollupGlobal++;
  }
  console.log(`[ERP Maestro Local] Rollup fichas empresa tabulador: ${rollupGlobal}`);

  // ── 4b) Rollup entre capturas del mismo tabulador (ej. Anguiplast id 8 ← email de id 9) ──
  let rollupCapturas = 0;
  for (const [, list] of byTab) {
    if (list.length < 2) continue;
    for (const c of list) {
      const patch = rollupFieldsFromSiblings(c, list);
      if (!Object.keys(patch).length) continue;
      const merged = mergeContacto(c, patch);
      if (merged.email === c.email && merged.telefono === c.telefono && merged.rfc === c.rfc) continue;
      await stmtContactos.update(c.id, merged);
      const out = { ...merged, id: c.id };
      contactoByNorm.set(norm(c.nombre), out);
      if (c.odoo_captura_id) contactoByOdooId.set(String(c.odoo_captura_id), out);
      rollupCapturas++;
    }
  }
  if (rollupCapturas) console.log(`[ERP Maestro Local] Rollup capturas mismo tabulador: ${rollupCapturas}`);

  // ── 5) Dedupe: un registro por odoo_captura_id (conservar el más completo) ──
  if (!REPLACE) {
    const allRows = [];
    const scan = db.prepare('SELECT id, data FROM local_contactos');
    while (scan.step()) {
      const row = scan.getAsObject();
      try {
        allRows.push({ id: row.id, ...JSON.parse(row.data) });
      } catch { /* ignore */ }
    }
    scan.free();

    const groups = new Map();
    for (const c of allRows) {
      if (!c.odoo_captura_id) continue;
      const k = String(c.odoo_captura_id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }

    let deduped = 0;
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const ranked = list.map(c => ({
        c,
        score: [c.email, c.telefono, c.rfc, c.direccion].filter(Boolean).length,
      })).sort((a, b) => b.score - a.score);
      for (const { c } of ranked.slice(1)) {
        db.run('DELETE FROM local_contactos WHERE id = ?', [c.id]);
        deduped++;
      }
    }
    if (deduped) console.log(`[ERP Maestro Local] Duplicados odoo_captura_id eliminados: ${deduped}`);
  }

  // ── 6) Purga contactos con nombre OCR basura (no empresa tabulador válida) ──
  let purgedGarbage = 0;
  const purgeScan = db.prepare('SELECT id, data FROM local_contactos');
  while (purgeScan.step()) {
    const row = purgeScan.getAsObject();
    try {
      const c = JSON.parse(row.data);
      if (c.fuente === 'pac_solo_excel' && isValidEmpresaTabuladorName(c.empresa_tabulador || c.nombre)) continue;
      if (!isGarbageName(c.nombre || '')) continue;
      db.run('DELETE FROM local_contactos WHERE id = ?', [row.id]);
      purgedGarbage++;
    } catch { /* ignore */ }
  }
  purgeScan.free();
  if (purgedGarbage) console.log(`[ERP Maestro Local] Contactos basura OCR eliminados: ${purgedGarbage}`);

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
