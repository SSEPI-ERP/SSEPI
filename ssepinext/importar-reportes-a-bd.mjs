import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import { sanitizeReporteRecord, folderCandidates, normalizeFolioRef } from './reportes-sanitize.mjs';
import { normalizeLabOrder, imagenesReporte, urlImagen } from '../scripts/imports/laboratorio-import.mjs';
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

/** Estados compatibles con KANBAN_STAGES en panel/js/modules/taller.js */
function normalizeEstado(est) {
  if (ESTADO_OVERRIDE) return ESTADO_OVERRIDE;
  if (!est) return 'Nuevo';
  const lo = String(est).toLowerCase();
  if (lo.includes('cancel')) return 'Cancelado';
  if (lo.includes('entreg') || lo.includes('factur')) return 'Entregado';
  if (lo.includes('reparado') || lo.includes('listo')) return 'Reparado';
  if (lo.includes('reparaci')) return 'En reparación';
  if (lo.includes('confirm')) return 'Confirmado';
  if (lo.includes('cotiz')) return 'Esperando Cotización';
  if (lo.includes('esperando') && lo.includes('confirm')) return 'Esperando Confirmación Cliente';
  if (lo.includes('diagn')) return 'Diagnóstico';
  if (lo.includes('garant')) return 'Garantía';
  if (lo.includes('nuevo') || lo.includes('registr')) return 'Nuevo';
  return 'Nuevo';
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
function buildBaseOrder(rec, reporteImagenes, documentosAdjuntos, resumenCarpeta) {
  const lab = normalizeLabOrder(rec);
  const recp = lab.datos_recepcion || {};
  const fechaIso = parseFechaToIso(rec.fecha_ingreso || rec.fecha);
  const folio = rec.referencia_reparacion || rec._folder || 'SIN-FOLIO';
  const imgsLab = imagenesReporte(lab).map(urlImagen).filter(Boolean);
  return {
    folio,
    formato: lab.formato || 'laboratorio-1',
    etapa_actual: lab.etapa_actual || 1,
    etapas: lab.etapas || [],
    datos_recepcion: lab.datos_recepcion || recp,
    resumen_diagnostico: lab.resumen_diagnostico || rec.diagnostico || '',
    imagenes_reporte: imgsLab,
    estado: normalizeEstado(rec.estado_actual),
    resumen_carpeta: resumenCarpeta || '',
    cliente_nombre: recp.cliente || rec.cliente || 'Cliente por identificar',
    cliente_id: null,
    referencia: rec.referencia_odoo || lab.numero_orden_wh || '',
    equipo: recp.equipo || rec.equipo || 'Equipo por identificar',
    marca: recp.marca || '',
    modelo: recp.modelo || '',
    serie: recp.serie || rec.componente || '',
    falla_reportada: recp.falla || rec.falla_corta || 'Por diagnosticar',
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
async function cleanPreviousImports(db, folios) {
  const folioList = folios.map(f => `'${f.replace(/'/g, "''")}'`).join(',');
  if (!folioList) return;
  const tables = ['local_ordenes_taller', 'local_ordenes_motores', 'local_proyectos_automatizacion'];
  let totalDeleted = 0;
  for (const t of tables) {
    try {
      const stmt = db.prepare(`DELETE FROM ${t} WHERE json_extract(data, '$.folio') IN (${folioList})`);
      stmt.run([]);
      stmt.free();
      totalDeleted += db.getRowsModified ? db.getRowsModified() : 0;
    } catch (e) {
      console.warn(`[Clean] Error limpiando ${t}:`, e.message);
    }
  }
  if (totalDeleted) {
    console.log(`[Clean] ${totalDeleted} registros anteriores eliminados`);
    persistDb();
  }
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
