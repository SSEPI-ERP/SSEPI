/**
 * Rutas centralizadas del paquete ERP (simulaciones/) para scripts de importación.
 * Ver docs/IMPORT-PAQUETE-ERP.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const PAQUETE_ERP = path.join(REPO_ROOT, 'simulaciones', 'SSEPI_Paquete_ERP');
export const COMPARADOR_PY_DIR = path.join(PAQUETE_ERP, '01_Comparador_Odoo_Excel');
export const EDITOR_ORDENES_DIR = path.join(PAQUETE_ERP, '02_Editor_Ordenes');

export const ESCANER_ROOT = path.join(REPO_ROOT, 'simulaciones', 'escaner de imagenes');
export const ESCANER_INFO = path.join(ESCANER_ROOT, 'info');
export const ESCANER_REPORTES = path.join(ESCANER_ROOT, 'reportes');

export const PATHS = {
  tabuladorXlsxCandidates: [
    path.join(ESCANER_INFO, 'TABULADOR DE COTIZACIÓN actualizado.xlsx'),
    path.join(ESCANER_INFO, 'TABULADOR DE COTIZACIÓN.xlsx'),
    path.join(COMPARADOR_PY_DIR, 'TABULADOR DE COTIZACIÓN actualizado.xlsx'),
    path.join(COMPARADOR_PY_DIR, 'TABULADOR DE COTIZACIÓN.xlsx'),
    path.join(REPO_ROOT, 'scripts', 'imports', 'fuente', 'TABULADOR DE COTIZACIÓN actualizado.xlsx'),
  ],
  contactosOdooXlsx: [
    path.join(ESCANER_INFO, 'contactos_odoo.xlsx'),
    path.join(COMPARADOR_PY_DIR, 'contactos_odoo.xlsx'),
  ],
  capturasDir: [
    path.join(ESCANER_INFO, 'Screenshots'),
    path.join(ESCANER_INFO, 'SistemaContactos', 'CapturasOdoo'),
    path.join(COMPARADOR_PY_DIR, 'SistemaContactos', 'CapturasOdoo'),
  ],
  ocrResults: path.join(ESCANER_INFO, 'ocr_results.json'),
  rastroCapturas: path.join(ESCANER_INFO, 'rastro_capturas.json'),
  datosComparador: path.join(ESCANER_INFO, 'datos_comparador.json'),
  datosReportesOcr: path.join(ESCANER_ROOT, 'datos_reportes_ocr.json'),
  datosOrdenesEditables: path.join(ESCANER_ROOT, 'datos_ordenes_editables.json'),
  muestraComparador: path.join(PAQUETE_ERP, '04_Datos_muestra', 'muestra_comparador_estructura.json'),
  tabuladorJsonFallback: path.join(REPO_ROOT, 'ssepinext', 'data', 'master', 'clientes_tabulador.json'),
  importsOut: path.join(REPO_ROOT, 'scripts', 'imports', 'out'),
  generarRastroPy: path.join(COMPARADOR_PY_DIR, 'generar_rastro.py'),
  buildComparadorPy: path.join(COMPARADOR_PY_DIR, 'build_comparador.py'),
};

export function resolveFirstExisting(candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export function resolveTabuladorXlsx() {
  return resolveFirstExisting(PATHS.tabuladorXlsxCandidates);
}

export function resolveCapturasDir() {
  const dir = resolveFirstExisting(PATHS.capturasDir);
  if (dir) return dir;
  return PATHS.capturasDir[0];
}

export function ensureImportsOut() {
  if (!fs.existsSync(PATHS.importsOut)) fs.mkdirSync(PATHS.importsOut, { recursive: true });
}

export function printPathsStatus() {
  const rows = [
    ['Tabulador xlsx', resolveTabuladorXlsx()],
    ['OCR results', fs.existsSync(PATHS.ocrResults) ? PATHS.ocrResults : null],
    ['Rastro capturas', fs.existsSync(PATHS.rastroCapturas) ? PATHS.rastroCapturas : null],
    ['Capturas dir', resolveCapturasDir()],
    ['datos_comparador.json', fs.existsSync(PATHS.datosComparador) ? PATHS.datosComparador : null],
    ['datos_reportes_ocr.json', fs.existsSync(PATHS.datosReportesOcr) ? PATHS.datosReportesOcr : null],
    ['Reportes lab', fs.existsSync(ESCANER_REPORTES) ? ESCANER_REPORTES : null],
  ];
  console.log('Rutas paquete ERP (simulaciones/):');
  for (const [label, p] of rows) {
    console.log(`  ${label}: ${p || '(no encontrado)'}`);
  }
}
