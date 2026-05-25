/**
 * Renombra carpetas de reportes SP-#### → SP-E#### y actualiza rutas en datos_reportes_ocr.json.
 * Uso: node normalize-lab-folio-carpetas.mjs [--dry-run] [--apply]
 */
import fs from 'fs';
import path from 'path';
import { PATHS, ESCANER_REPORTES } from './erp-paquete-paths.mjs';
import { normalizeLabFolio } from './ocr-ssepi-rules.mjs';

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;

function renameFolder(oldName, newName) {
  const oldPath = path.join(ESCANER_REPORTES, oldName);
  const newPath = path.join(ESCANER_REPORTES, newName);
  if (!fs.existsSync(oldPath)) return { ok: false, reason: 'missing' };
  if (oldName === newName) return { ok: true, skipped: true };
  if (fs.existsSync(newPath)) return { ok: false, reason: 'target_exists', newPath };
  if (dryRun) return { ok: true, dryRun: true, from: oldPath, to: newPath };
  fs.renameSync(oldPath, newPath);
  return { ok: true, from: oldPath, to: newPath };
}

function patchJsonPaths(jsonPath) {
  if (!fs.existsSync(jsonPath)) return 0;
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let n = 0;
  for (const row of rows) {
    const raw = row.referencia_reparacion || row.numero_orden || '';
    const folio = normalizeLabFolio(raw);
    if (folio && folio !== raw) {
      row.referencia_reparacion = folio;
      n++;
    }
    if (row.carpeta && typeof row.carpeta === 'string') {
      const base = path.basename(row.carpeta);
      const normBase = normalizeLabFolio(base);
      if (normBase && normBase !== base) {
        row.carpeta = row.carpeta.replace(/[\\/][^\\/]+$/, path.sep + normBase);
        n++;
      }
    }
  }
  if (!dryRun && n) fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');
  return n;
}

function main() {
  if (!fs.existsSync(ESCANER_REPORTES)) {
    console.error('No existe carpeta reportes:', ESCANER_REPORTES);
    process.exit(1);
  }
  const dirs = fs.readdirSync(ESCANER_REPORTES, { withFileTypes: true }).filter((d) => d.isDirectory());
  let renamed = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const d of dirs) {
    const target = normalizeLabFolio(d.name);
    if (!target || target === d.name) {
      skipped++;
      continue;
    }
    const res = renameFolder(d.name, target);
    if (res.ok && !res.skipped) renamed++;
    else if (res.reason === 'target_exists') conflicts++;
    else skipped++;
  }

  const jsonPatches = patchJsonPaths(PATHS.datosReportesOcr);
  console.log('Modo:', dryRun ? 'dry-run' : 'apply');
  console.log('Carpetas renombradas:', renamed, '| Conflictos (ya existe SP-E):', conflicts, '| Sin cambio:', skipped);
  console.log('Filas JSON ajustadas:', jsonPatches, PATHS.datosReportesOcr);
  if (dryRun) console.log('Usa --apply para renombrar en disco y guardar JSON.');
}

main();
