/**
 * Wrapper: invoca generar_rastro.py del paquete (si existe Python + capturas).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import { PATHS, ESCANER_INFO, printPathsStatus } from './erp-paquete-paths.mjs';

const py = PATHS.generarRastroPy;
if (!fs.existsSync(py)) {
  console.warn('No existe generar_rastro.py en', py);
  process.exit(0);
}

console.log('Generando rastro de capturas…');
printPathsStatus();

const env = {
  ...process.env,
  SSEPI_CAPTURAS_DIR: process.env.SSEPI_CAPTURAS_DIR || '',
  SSEPI_RASTRO_JSON: PATHS.rastroCapturas,
};

const r = spawnSync('python', [py], {
  cwd: ESCANER_INFO,
  env,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (r.status !== 0) {
  console.warn('generar_rastro terminó con código', r.status, '(opcional si ya hay rastro_capturas.json)');
}
if (fs.existsSync(PATHS.rastroCapturas)) {
  console.log('OK:', PATHS.rastroCapturas);
}
