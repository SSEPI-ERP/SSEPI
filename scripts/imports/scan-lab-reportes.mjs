/**
 * Consolida / limpia datos_reportes_ocr.json con reglas ocr-ssepi-rules.
 * Uso: node scan-lab-reportes.mjs [--dry-run] [--write]
 */
import fs from 'fs';
import path from 'path';
import { PATHS, ESCANER_REPORTES, ensureImportsOut } from './erp-paquete-paths.mjs';
import { parseReporteFromOcrRow, isValidLabFolio, normKey, normalizeLabFolio } from './ocr-ssepi-rules.mjs';
import { findExcelMatch } from './erp-maestro-lib.mjs';

const write = process.argv.includes('--write');
const dryRun = process.argv.includes('--dry-run') || !write;

function loadAliasHints() {
  const hints = [];
  if (fs.existsSync(PATHS.datosComparador)) {
    const d = JSON.parse(fs.readFileSync(PATHS.datosComparador, 'utf8'));
    for (const rel of d.relacionErp || []) {
      hints.push({ name: rel.empresaTabulador, rfc: rel.rfc });
    }
  }
  return hints;
}

function scanReportFolders() {
  const out = [];
  if (!fs.existsSync(ESCANER_REPORTES)) return out;
  const dirs = fs.readdirSync(ESCANER_REPORTES, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of dirs) {
    const folder = path.join(ESCANER_REPORTES, d.name);
    const files = fs.readdirSync(folder).filter((f) => /\.(png|jpe?g|pdf)$/i.test(f));
    if (!files.length) continue;
    const folio = normalizeLabFolio(d.name);
    out.push({
      referencia_reparacion: folio,
      carpeta: folder,
      archivos: files.map((f) => path.join(folder, f)),
      cliente: '',
      estado_actual: '',
      equipo: '',
      vendedor: '',
      diagnostico: '',
      solucion: '',
      historial_actividad: '',
    });
  }
  return out;
}

function main() {
  let raw = [];
  if (fs.existsSync(PATHS.datosReportesOcr)) {
    raw = JSON.parse(fs.readFileSync(PATHS.datosReportesOcr, 'utf8'));
  }
  const folderRows = scanReportFolders();
  const byFolio = new Map();
  for (const r of raw) {
    const p = parseReporteFromOcrRow(r);
    if (p.folio) byFolio.set(normKey(p.folio), { ...r, ...p });
  }
  for (const fr of folderRows) {
    const k = normKey(fr.referencia_reparacion);
    if (!byFolio.has(k)) byFolio.set(k, fr);
    else {
      const prev = byFolio.get(k);
      prev.archivos = [...(prev.archivos || []), ...(fr.archivos || [])];
      if (!prev.carpeta) prev.carpeta = fr.carpeta;
    }
  }

  const excelHints = loadAliasHints();
  const cleaned = [];
  let dropped = 0;
  for (const row of byFolio.values()) {
    const p = parseReporteFromOcrRow(row);
    if (!p.folio || !isValidLabFolio(p.folio)) {
      dropped++;
      continue;
    }
    if (!p.cliente && !row.carpeta) {
      dropped++;
      continue;
    }
    let empresaTabulador = null;
    if (p.cliente && excelHints.length) {
      const { match } = findExcelMatch(p.cliente, p.cliente_rfc, excelHints.map((h) => ({ name: h.name, rfc: h.rfc })));
      empresaTabulador = match?.name || null;
    }
    cleaned.push({
      ...p,
      carpeta: row.carpeta || null,
      archivos: row.archivos || [],
      empresa_tabulador: empresaTabulador,
      cliente_raw: row.cliente || p.cliente,
    });
  }

  ensureImportsOut();
  const csvPath = path.join(PATHS.importsOut, 'lab_reportes_limpios.csv');
  const hdr = ['folio', 'cliente', 'empresa_tabulador', 'equipo', 'estado', 'vendedor', 'carpeta'];
  const lines = [hdr.join(',')];
  for (const c of cleaned) {
    lines.push(
      hdr
        .map((h) => `"${String(c[h] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');

  console.log('Entrada OCR:', raw.length, '| Carpetas:', folderRows.length);
  console.log('Salida limpia:', cleaned.length, '| Descartadas:', dropped);
  console.log('CSV:', csvPath);

  if (dryRun) {
    console.log('Modo dry-run. Usa --write para actualizar datos_reportes_ocr.json');
    return;
  }

  const exportRows = cleaned.map((c) => ({
    referencia_reparacion: c.folio,
    estado_actual: c.estado,
    cliente: c.cliente,
    cliente_rfc: c.cliente_rfc,
    equipo: c.equipo,
    vendedor: c.vendedor,
    diagnostico: c.diagnostico,
    solucion: c.solucion,
    historial_actividad: c.historial_actividad,
    encargado: c.encargado,
    fecha_ingreso: c.fecha_ingreso,
    empresa_tabulador: c.empresa_tabulador,
    carpeta: c.carpeta,
    archivos: c.archivos,
  }));
  fs.writeFileSync(PATHS.datosReportesOcr, JSON.stringify(exportRows, null, 2), 'utf8');
  console.log('Escrito:', PATHS.datosReportesOcr);
}

main();
