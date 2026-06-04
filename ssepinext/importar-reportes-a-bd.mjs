import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import { sanitizeReporteRecord, folderCandidates, normalizeFolioRef } from './reportes-sanitize.mjs';
import { normalizeLabOrder, imagenesReporte, imagenesCaptura, urlImagen } from '../scripts/imports/laboratorio-import.mjs';
import {
  PAQUETE_ERP,
  PAQUETE_ERP_NUEVO,
  resolveDatosOrdenesEditables,
  resolveReportesLabDir,
} from '../scripts/imports/erp-paquete-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// CONFIG — Paquete ERP (nuevo paq primero, luego legacy)
// ================================================================
const PAQUETE_DIR = fs.existsSync(PAQUETE_ERP_NUEVO) ? PAQUETE_ERP_NUEVO : PAQUETE_ERP;
const SOURCE_DIR = PAQUETE_DIR;
const REPORTES_JSON_EDITABLES = resolveDatosOrdenesEditables();
const REPORTES_DIR = resolveReportesLabDir();
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'reportes');

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
const DOC_EXTS = new Set(['.pdf']);

// Palabras clave para clasificacion
const MOTORES_KEYWORDS = /servo|servodrive|servo drive|variador de frecuencia|variador|inverter|encoder|encode|controlador de motor|motor trifasico|motor electrico|motor dc|bomba/i;
const AUTO_KEYWORDS = /plc|automatizacion|automatización|hmi|cobot|robot industrial|tablero electrico|programa|cnc/i;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('[Import] Error leyendo', filePath, e.message);
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const ESTADO_OVERRIDE = process.argv.includes('--todo-cancelado')
  ? 'Cancelado'
  : process.argv.includes('--todo-reparado')
    ? 'Reparado'
    : null;

function parseFechaToIso(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const mon = monthNames.findIndex(x => m[2].toLowerCase().startsWith(x));
    if (mon >= 0) {
      const d = new Date(parseInt(m[3], 10), mon, day, 12, 0, 0);
      return d.toISOString().slice(0, 16);
    }
  }
  const m2 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = parseInt(m2[2], 10) - 1;
    let year = parseInt(m2[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day, 12, 0, 0);
    return d.toISOString().slice(0, 16);
  }
  return null;
}

/** Estados compatibles con KANBAN_STAGES en panel/js/modules/taller.js.
 *  Para importaciones históricas del paquete ERP: todo es Reparado o Cancelado.
 */
function normalizeEstado(est) {
  if (ESTADO_OVERRIDE) return ESTADO_OVERRIDE;
  if (!est) return 'Reparado';
  const lo = String(est).toLowerCase();
  if (lo.includes('cancel')) return 'Cancelado';
  // Historial cerrado: cualquier otro estado se trata como Reparado
  return 'Reparado';
}

function classifyModule(rec, folio) {
  const f = folio.toUpperCase();
  // Folio comercial SSEPI: SP-E = laboratorio/taller, SP-M = motores, SP-A = automatización
  if (f.startsWith('SP-A')) return 'automatizacion';
  if (f.startsWith('SP-M')) return 'motores';
  if (f.startsWith('SP-E')) return 'taller';
  const text = `${rec.equipo || ''} ${rec.componente || ''} ${rec.diagnostico || ''} ${rec.numero_orden || ''} ${rec.solucion || ''}`;
  if (MOTORES_KEYWORDS.test(text)) return 'motores';
  if (AUTO_KEYWORDS.test(text)) return 'automatizacion';
  return 'taller';
}

// ================================================================
// LOAD RECORDS (merge new OCR + legacy complete)
// ================================================================
function mergeRecord(base, extra, overwrite = false) {
  if (!extra) return base || {};
  const out = { ...(base || {}) };
  for (const k of Object.keys(extra)) {
    if (k.startsWith('_') && k !== '_folder' && k !== '_limpiado') continue;
    const v = extra[k];
    if (v == null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (overwrite || !out[k] || String(out[k]).trim() === '') out[k] = v;
  }
  return out;
}

function loadRecords() {
  const byFolio = new Map();

  // Fuente: datos_ordenes_editables.json (escáner o paquete nuevo)
  if (!REPORTES_JSON_EDITABLES) {
    console.error('[Import] No se encontró datos_ordenes_editables.json');
    return [];
  }
  console.log('[Import] JSON órdenes:', REPORTES_JSON_EDITABLES);
  const sources = [
    { data: readJson(REPORTES_JSON_EDITABLES), name: path.basename(REPORTES_JSON_EDITABLES), priority: 100 },
  ].filter((s) => s.data?.length);

  for (const src of sources) {
    for (const raw of src.data) {
      const key = normalizeFolioRef(raw.referencia_reparacion || raw._folder || '');
      if (!key) continue;
      const prev = byFolio.get(key);
      const overwrite = !prev || src.priority >= (prev._priority || 0);
      byFolio.set(key, {
        ...mergeRecord(prev, raw, overwrite),
        _source: src.name,
        _priority: src.priority,
        _folder: raw._folder || prev?._folder || key.replace(/^SP-E/, 'SP-'),
      });
    }
    console.log(`[Import] +${src.data.length} desde ${src.name} (prioridad ${src.priority})`);
  }

  const records = [...byFolio.values()].map((r) => sanitizeReporteRecord(r));
  const garbage = records.filter((r) => {
    const c = r.cliente || '';
    return /crear\s*cotizaci|cancelar\s*reparaci|whatsapp\s*actividad/i.test(c);
  }).length;

  console.log(`[Import] Registros únicos: ${records.length} | Con UI residual en cliente: ${garbage}`);
  if (!records.length) console.error('[Import] No se encontraron registros en ninguna fuente');
  return records;
}

// ================================================================
// FILE SCANNER
// ================================================================
function resolvePaquetePath(relPath) {
  if (!relPath) return null;
  const clean = String(relPath).replace(/^\.?[\\/]+/, '').replace(/\//g, path.sep);
  const candidates = [
    path.join(PAQUETE_DIR, clean),
    path.join(PAQUETE_DIR, 'reportes', path.basename(clean)),
    REPORTES_DIR ? path.join(REPORTES_DIR, path.basename(path.dirname(clean)), path.basename(clean)) : null,
    REPORTES_DIR ? path.join(REPORTES_DIR, path.basename(clean)) : null,
    path.join(__dirname, '..', 'simulaciones', 'escaner de imagenes', clean),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function getFilesInFolder(rec) {
  const names = folderCandidates(rec);
  let folderPath = null;
  for (const name of names) {
    const dirs = [
      path.join(SOURCE_DIR, 'reportes', name),
      REPORTES_DIR ? path.join(REPORTES_DIR, name) : null,
    ].filter(Boolean);
    for (const p of dirs) {
      if (fs.existsSync(p)) {
        folderPath = p;
        break;
      }
    }
    if (folderPath) break;
  }
  const images = [];
  const documents = [];
  if (folderPath) {
    const files = fs.readdirSync(folderPath);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      const full = path.join(folderPath, f);
      if (!fs.statSync(full).isFile()) continue;
      if (IMG_EXTS.has(ext)) images.push(full);
      else if (DOC_EXTS.has(ext)) documents.push(full);
    }
  }
  if (images.length === 0 && documents.length === 0) {
    const relPaths = [
      ...(rec.imagenes_erp || []),
      ...(rec.imagenes_servicio || []),
      ...(rec.archivos_pdf || []),
    ];
    for (const rel of relPaths) {
      const abs = resolvePaquetePath(rel);
      if (!abs) continue;
      const ext = path.extname(abs).toLowerCase();
      if (IMG_EXTS.has(ext)) images.push(abs);
      else if (DOC_EXTS.has(ext)) documents.push(abs);
    }
  }
  return { images, documents, folderPath };
}

function buildResumenCarpeta(rec, imageNames, docNames) {
  const lines = [
    `Folio: ${rec.referencia_reparacion || ''}`,
    `Estado (paquete): ${rec.estado_actual || ''}`,
    `Cliente: ${rec.cliente || ''}`,
    `Equipo: ${rec.equipo || ''}`,
    `Diagnóstico: ${rec.diagnostico || ''}`,
    `Solución: ${rec.solucion || ''}`,
    `Vendedor: ${rec.vendedor || ''}`,
    `Encargado: ${rec.encargado || ''}`,
    '',
    `Archivos (${imageNames.length + docNames.length}):`,
    ...imageNames.map((n) => `  [img] ${n}`),
    ...docNames.map((n) => `  [pdf] ${n}`),
  ];
  return lines.filter(Boolean).join('\n').trim();
}

// ================================================================
// BUILD ORDER DATA
// ================================================================
// ================================================================
// Helpers — clasificación de strings del OCR / paquete ERP
// ================================================================
const FORBIDDEN_STRINGS = /^(equipo por identificar|cliente por identificar|s\/n|s\/d|n\/a|undefined|null|none)$/i;
const FALLA_HINTS = /no funciona|no enciende|no arranca|reparaci[oó]n|falla|descompost|quemad|roto|golpe|sin se[ñn]al|sin video|sin imagen|chocado|muestra|marca|parpadea|ruido|huele|olor|corto|abierto|cerrado|sale|emite|enciende|apaga|disparo|dañad|averiad/i;

function isValidText(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 4) return false;
  if (FORBIDDEN_STRINGS.test(t)) return false;
  return true;
}

function looksLikeFalla(s) {
  if (!s) return false;
  return FALLA_HINTS.test(String(s).toLowerCase());
}

/** Resuelve el cliente final con prioridad y heurísticas anti-confusión. */
function resolverCliente(rec, recp) {
  const recCli = isValidText(rec.cliente) ? rec.cliente.trim() : '';
  const recpCli = isValidText(recp.cliente) ? recp.cliente.trim() : '';
  // recp.cliente es a veces la falla (caso RE-0170: "dice que el compresor no funciona")
  if (recpCli && !looksLikeFalla(recpCli)) return recpCli;
  if (recCli && !looksLikeFalla(recCli)) return recCli;
  if (recpCli) return recpCli; // ultima instancia: aunque parezca falla, lo guardamos
  if (recCli) return recCli;
  return '';
}

/** Resuelve la falla final. Prioriza recp.falla; si vacio, busca en descripcion/diagnostico. */
function resolverFalla(rec, recp) {
  if (isValidText(recp.falla)) return recp.falla.trim();
  if (isValidText(rec.falla_corta)) return rec.falla_corta.trim();
  if (isValidText(rec.falla)) return rec.falla.trim();
  if (isValidText(recp.condiciones)) return recp.condiciones.trim();
  if (isValidText(rec.diagnostico)) return String(rec.diagnostico).trim();
  return '';
}

/** Resuelve el equipo. Si el top es placeholder o vacio, usa recp.equipo. */
function resolverEquipo(rec, recp) {
  const recEq = isValidText(rec.equipo) ? rec.equipo.trim() : '';
  const recpEq = isValidText(recp.equipo) ? recp.equipo.trim() : '';
  if (recEq && recEq.length >= 3 && !FORBIDDEN_STRINGS.test(recEq)) return recEq;
  if (recpEq && recpEq.length >= 3 && !FORBIDDEN_STRINGS.test(recpEq)) return recpEq;
  return recEq || recpEq || '';
}

function buildBaseOrder(rec, reporteImagenes, documentosAdjuntos, resumenCarpeta) {
  const lab = normalizeLabOrder(rec);
  const recp = lab.datos_recepcion || {};
  const fechaIso = parseFechaToIso(rec.fecha_ingreso || rec.fecha);
  // Normalizar folio (2026-06-01): usar SIEMPRE la forma canónica (WH/RO/00108)
  // para que cleanPreviousImports encuentre y reemplace las filas previas.
  const folioRaw = rec.referencia_reparacion || rec._folder || 'SIN-FOLIO';
  const folio = normalizeFolioRef(folioRaw) || folioRaw;
  const imgsLab = imagenesReporte(lab).map(urlImagen).filter(Boolean);
  const capturas = imagenesCaptura(lab).map(urlImagen).filter(Boolean);
  const capturaOrden = capturas[0] || null;

  // Propagación corregida (2026-06-01): el front lee `cliente`, `falla` y `equipo`
  // top-level, no solo `cliente_nombre` / `falla_reportada`. Antes de este fix
  // las 181 órdenes importadas tenían cliente/falla vacíos en el top-level.
  const clienteTop = resolverCliente(rec, recp);
  const fallaTop = resolverFalla(rec, recp);
  const equipoTop = resolverEquipo(rec, recp);

  return {
    folio,
    origen: 'import_erp',
    formato: lab.formato || 'laboratorio-1',
    etapa_actual: lab.etapa_actual || 1,
    etapas: lab.etapas || [],
    datos_recepcion: lab.datos_recepcion || recp,
    resumen_diagnostico: lab.resumen_diagnostico || rec.diagnostico || '',
    imagenes_reporte: imgsLab,
    imagen_captura_orden: capturaOrden,
    estado: normalizeEstado(rec.estado_actual),
    resumen_carpeta: resumenCarpeta || '',
    // === Top-level (lo que lee el front en taller.js) ===
    cliente: clienteTop,
    falla: fallaTop,
    equipo: equipoTop,
    // === Aliases historicas (no romper) ===
    cliente_nombre: clienteTop || rec.cliente || 'Cliente por identificar',
    cliente_id: null,
    referencia: rec.referencia_odoo || lab.numero_orden_wh || '',
    marca: recp.marca || '',
    modelo: recp.modelo || '',
    serie: recp.serie || rec.componente || '',
    falla_reportada: fallaTop || 'Por diagnosticar',
    condiciones_fisicas: recp.condiciones || '',
    notas_internas: lab.resumen_diagnostico || rec.diagnostico || rec.notas || '',
    notas_generales: resumenCarpeta || [rec.solucion, rec.historial_actividad].filter(Boolean).join('\n').trim(),
    reparacion_resumen_diagnostico: lab.resumen_diagnostico || rec.diagnostico || '',
    diagnostico: lab.resumen_diagnostico || rec.diagnostico || '',
    solucion: rec.solucion || '',
    historial_actividad: rec.historial_actividad || '',
    vendedor_externo: rec.vendedor || '',
    recibido_por: rec.vendedor || '',
    bajo_garantia: !!rec.bajo_garantia,
    cliente_rfc: rec.cliente_rfc || '',
    tecnico_responsable: rec.encargado || 'Por asignar',
    encargado_recepcion: rec.encargado || 'Recepción SSEPI',
    prioridad: 'media',
    fecha_ingreso: fechaIso || new Date().toISOString().slice(0, 16),
    fecha_entrega: '',
    recibe_nombre: '',
    entrega_obs: '',
    horas_estimadas: 0,
    horas_invertido: 0,
    tiempo_entrega_dias: 0,
    reporte_imagenes: reporteImagenes,
    documentos_adjuntos: documentosAdjuntos,
    costo_mano_obra: 0,
    costo_refacciones: 0,
    costo_consumibles: 0,
    costo_total: 0,
    km_distancia: 0,
    horas_viaje: 0,
    utilidad_factor: 1.4,
    refacciones_enlaces: [],
    refacciones_inventario: [],
    consumibles_usados: [],
    diagnosticoEnlaces: [],
    diagnosticoInventario: [],
    consumiblesUsados: [],
    componentes_inventario: [],
    componentes_compra: [],
    componentesInventario: [],
    componentesCompra: [],
    componentes_extras: [],
    reparacion_notas: rec.solucion || '',
  };
}

function buildAutoOrder(rec, reporteImagenes, documentosAdjuntos) {
  const fechaIso = parseFechaToIso(rec.fecha_ingreso || rec.fecha);
  return {
    folio: rec.referencia_reparacion || rec._folder || 'SIN-FOLIO',
    estado: normalizeEstado(rec.estado_actual).toLowerCase(),
    etapa_actual: 1,
    avance: 0,
    cliente_nombre: rec.cliente || 'Cliente por identificar',
    cliente: rec.cliente || 'Cliente por identificar',
    rfc: rec.cliente_rfc || '',
    direccion: '',
    nombre: rec.equipo || 'Proyecto por identificar',
    vendedor: rec.vendedor || '',
    ingeniero: rec.encargado || 'Por asignar',
    fecha_creacion: fechaIso ? fechaIso.slice(0, 10) : new Date().toISOString().slice(0, 10),
    fecha: fechaIso ? fechaIso.slice(0, 10) : new Date().toISOString().slice(0, 10),
    notas_generales: rec.notas || '',
    notas_internas: rec.diagnostico || '',
    materiales: [],
    actividades: [],
    epicas: [],
    fecha_entrega: '',
    costo_mano_obra: 0,
    costo_materiales: 0,
    costo_total: 0,
    reporte_imagenes: reporteImagenes,
    documentos_adjuntos: documentosAdjuntos,
  };
}

// ================================================================
// CLEAN PREVIOUS IMPORTS
// ================================================================
// Recibe folios en formato normalizado (WH/RO/00108) Y formato crudo (WHRO00108)
// y borra cualquier variante que exista en BD.
async function cleanPreviousImports(db, folios) {
  if (!folios || !folios.length) return;
  const tables = ['local_ordenes_taller', 'local_ordenes_motores', 'local_proyectos_automatizacion'];
  let totalDeleted = 0;
  for (const t of tables) {
    try {
      // Construir lista IN con TODAS las variantes del folio
      const variants = new Set();
      for (const f of folios) {
        variants.add(f);
        const norm = normalizeFolioRef(f);
        if (norm) variants.add(norm);
        // Variante sin slash: WHRO00108 -> WHRO00108
        const noSlash = f.replace(/\//g, '');
        if (noSlash !== f) variants.add(noSlash);
        // Variante con zero pad
        const m = f.match(/(\d+)$/);
        if (m) variants.add(f.replace(/\d+$/, m[1].padStart(5, '0')));
      }
      const list = [...variants].filter(Boolean).map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
      if (!list) continue;
      const stmt = db.prepare(`DELETE FROM ${t} WHERE json_extract(data, '$.folio') IN (${list})`);
      stmt.run();
      stmt.free();
      const rows = db.getRowsModified ? db.getRowsModified() : 0;
      if (rows > 0) {
        totalDeleted += rows;
        console.log(`[Clean] ${rows} folios previos eliminados de ${t}`);
      }
    } catch (e) {
      console.warn(`[Clean] Error limpiando ${t}:`, e.message);
    }
  }
  if (totalDeleted) persistDb();
}

async function cleanDemoData(db) {
  // Eliminar datos de prueba en motores y automatizacion (seeds anteriores)
  let totalDeleted = 0;
  for (const t of ['local_ordenes_motores', 'local_proyectos_automatizacion']) {
    try {
      const stmt = db.prepare(`DELETE FROM ${t}`);
      stmt.run([]);
      stmt.free();
      const rowsMod = db.getRowsModified ? db.getRowsModified() : 0;
      if (rowsMod) {
        console.log(`[Clean] ${rowsMod} registros demo eliminados de ${t}`);
        totalDeleted += rowsMod;
      }
    } catch (e) {
      console.warn(`[Clean] Error limpiando demo ${t}:`, e.message);
    }
  }
  if (totalDeleted) persistDb();
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  const records = loadRecords();
  if (!records.length) {
    console.error('[Import] No hay registros para importar');
    process.exit(1);
  }

  ensureDir(UPLOADS_DIR);

  const db = await getDb();
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');
  const stmtAuto = await prepareStatement(db, 'local_proyectos_automatizacion');

  // Limpiar datos de prueba en motores y automatizacion
  await cleanDemoData(db);

  // Limpiar folios que vamos a reimportar
  const foliosToImport = records.map((r) => (r.referencia_reparacion || '').toUpperCase().trim()).filter(Boolean);
  await cleanPreviousImports(db, [...new Set(foliosToImport)]);

  let insertedTaller = 0, updatedTaller = 0;
  let insertedMotores = 0, updatedMotores = 0;
  let insertedAuto = 0, updatedAuto = 0;
  let skipped = 0;
  let totalImages = 0;
  let totalDocs = 0;

  setDeferPersist(true);
  for (let idx = 0; idx < records.length; idx++) {
    if (idx > 0 && idx % 20 === 0) console.log(`[Import] Progreso ${idx}/${records.length}...`);
    const rec = records[idx];
    const folio = (rec.referencia_reparacion || '').toUpperCase().trim();
    if (!folio) { skipped++; continue; }

    const modulo = classifyModule(rec, folio);

    const { images, documents } = getFilesInFolder(rec);
    totalImages += images.length;
    totalDocs += documents.length;

    // Preparar directorio destino en uploads
    const folioDir = path.join(UPLOADS_DIR, folio.replace(/[^a-zA-Z0-9_-]/g, '_'));
    ensureDir(folioDir);

    const folioSlug = folio.replace(/[^a-zA-Z0-9_-]/g, '_');
    const reporteImagenes = [];
    const imageNames = [];
    for (let i = 0; i < images.length; i++) {
      const imgPath = images[i];
      const baseName = path.basename(imgPath);
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(folioDir, safeName);
      fs.copyFileSync(imgPath, destPath);
      const url = `/uploads/reportes/${folioSlug}/${encodeURIComponent(safeName)}`;
      reporteImagenes.push({
        id: `img-${folioSlug}-${i}`,
        nombre: baseName,
        url,
      });
      imageNames.push(baseName);
    }

    const documentosAdjuntos = [];
    const docNames = [];
    for (let i = 0; i < documents.length; i++) {
      const docPath = documents[i];
      const baseName = path.basename(docPath);
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(folioDir, safeName);
      fs.copyFileSync(docPath, destPath);
      const url = `/uploads/reportes/${folioSlug}/${encodeURIComponent(safeName)}`;
      documentosAdjuntos.push({
        id: `doc-${folioSlug}-${i}`,
        nombre: baseName,
        url,
        tipo: 'pdf',
      });
      docNames.push(baseName);
    }

    const resumenCarpeta = buildResumenCarpeta(rec, imageNames, docNames);

    if (modulo === 'taller') {
      const existing = await stmtTaller.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
      const data = buildBaseOrder(rec, reporteImagenes, documentosAdjuntos, resumenCarpeta);
      if (existing.length > 0) {
        const localId = existing[0].local_id || existing[0].id;
        await stmtTaller.update(localId, data);
        updatedTaller++;
        console.log(`[Taller] Actualizado: ${folio} (${images.length} imgs, ${documents.length} docs)`);
      } else {
        const result = await stmtTaller.insert(null, data);
        insertedTaller++;
        console.log(`[Taller] Insertado: ${folio} (ID: ${result.id}, ${images.length} imgs, ${documents.length} docs)`);
      }
    } else if (modulo === 'motores') {
      const existing = await stmtMotores.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
      const data = buildBaseOrder(rec, reporteImagenes, documentosAdjuntos);
      if (existing.length > 0) {
        const localId = existing[0].local_id || existing[0].id;
        await stmtMotores.update(localId, data);
        updatedMotores++;
        console.log(`[Motores] Actualizado: ${folio} (${images.length} imgs, ${documents.length} docs)`);
      } else {
        const result = await stmtMotores.insert(null, data);
        insertedMotores++;
        console.log(`[Motores] Insertado: ${folio} (ID: ${result.id}, ${images.length} imgs, ${documents.length} docs)`);
      }
    } else {
      const existing = await stmtAuto.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
      const data = buildAutoOrder(rec, reporteImagenes, documentosAdjuntos);
      if (existing.length > 0) {
        const localId = existing[0].local_id || existing[0].id;
        await stmtAuto.update(localId, data);
        updatedAuto++;
        console.log(`[Auto] Actualizado: ${folio} (${images.length} imgs, ${documents.length} docs)`);
      } else {
        const result = await stmtAuto.insert(null, data);
        insertedAuto++;
        console.log(`[Auto] Insertado: ${folio} (ID: ${result.id}, ${images.length} imgs, ${documents.length} docs)`);
      }
    }
  }

  setDeferPersist(false);
  persistDb();
  console.log('\n========================================');
  console.log('  RESUMEN IMPORTACION REPORTES');
  console.log('========================================');
  console.log(`Taller      : ${insertedTaller} insertados, ${updatedTaller} actualizados`);
  console.log(`Motores     : ${insertedMotores} insertados, ${updatedMotores} actualizados`);
  console.log(`Automatiz.  : ${insertedAuto} insertados, ${updatedAuto} actualizados`);
  console.log(`Omitidos    : ${skipped}`);
  console.log(`Imagenes    : ${totalImages}`);
  console.log(`Documentos  : ${totalDocs}`);
  console.log('========================================\n');
}

main().catch(err => {
  setDeferPersist(false);
  console.error('[Import] Error fatal:', err);
  process.exit(1);
});
