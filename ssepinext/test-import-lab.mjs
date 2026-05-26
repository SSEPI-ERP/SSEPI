/**
 * Test rápido: laboratorio + imágenes por URL (paquete ERP)
 */
import { getDb } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, 'uploads', 'reportes');
const PAQUETE_REPORTES = path.join(__dirname, '..', 'simulaciones', 'SSEPI_Paquete_ERP', 'reportes');

const db = await getDb();

function q(sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const totalTaller = q('SELECT COUNT(*) c FROM local_ordenes_taller')[0].c;
const spE = q(`SELECT COUNT(*) c FROM local_ordenes_taller WHERE upper(json_extract(data,'$.folio')) LIKE 'SP-E%'`)[0].c;
const wh = q(`SELECT COUNT(*) c FROM local_ordenes_taller WHERE upper(json_extract(data,'$.folio')) LIKE 'WH%'`)[0].c;
const spEAuto = q(`SELECT COUNT(*) c FROM local_proyectos_automatizacion WHERE upper(json_extract(data,'$.folio')) LIKE 'SP-E%'`)[0].c;

const withUrl = q(`
  SELECT COUNT(*) c FROM local_ordenes_taller
  WHERE json_extract(data,'$.reporte_imagenes') IS NOT NULL
  AND json_extract(data,'$.reporte_imagenes') != '[]'
  AND (
    json_extract(data,'$.reporte_imagenes') LIKE '%"url":%'
    OR json_extract(data,'$.reporte_imagenes') LIKE '%/uploads/reportes/%'
  )
`)[0].c;

const withDataUrl = q(`
  SELECT COUNT(*) c FROM local_ordenes_taller
  WHERE json_extract(data,'$.reporte_imagenes') LIKE '%data:image%'
`)[0].c;

const withResumen = q(`
  SELECT COUNT(*) c FROM local_ordenes_taller
  WHERE length(coalesce(json_extract(data,'$.resumen_carpeta'),'')) > 20
`)[0].c;

const reparado = q(`SELECT COUNT(*) c FROM local_ordenes_taller WHERE json_extract(data,'$.estado') = 'Reparado'`)[0].c;

const sample = q(`
  SELECT id,
    json_extract(data,'$.folio') folio,
    json_extract(data,'$.estado') estado,
    json_extract(data,'$.cliente_nombre') cliente,
    length(json_extract(data,'$.reporte_imagenes')) img_len
  FROM local_ordenes_taller
  WHERE json_extract(data,'$.folio') = 'SP-E0557'
  LIMIT 1
`);

let sampleImg = null;
if (sample.length) {
  const row = q(`SELECT data FROM local_ordenes_taller WHERE id = ${sample[0].id}`)[0];
  const data = JSON.parse(row.data);
  const imgs = data.reporte_imagenes || [];
  sampleImg = imgs[0] || null;
}

const uploadDirs = fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS).length : 0;
const paqueteDirs = fs.existsSync(PAQUETE_REPORTES) ? fs.readdirSync(PAQUETE_REPORTES).length : 0;
const contactos = q('SELECT COUNT(*) c FROM local_contactos')[0].c;
const erpTag = q(`SELECT COUNT(*) c FROM local_contactos WHERE json_extract(data,'$.fuente') LIKE '%comparador%'`)[0].c;

console.log('\n=== TEST IMPORT LAB + IMÁGENES ===\n');
console.log('Paquete reportes/ carpetas:', paqueteDirs);
console.log('uploads/reportes/ carpetas:', uploadDirs);
console.log('Contactos BD:', contactos, '| fuente comparador:', erpTag);
console.log('Órdenes taller:', totalTaller, '| SP-E:', spE, '| WH/RO:', wh);
console.log('SP-E en proyectos_auto (debe ~0):', spEAuto);
console.log('Con url /uploads en imágenes:', withUrl);
console.log('Con dataUrl base64 (viejo):', withDataUrl);
console.log('Con resumen_carpeta:', withResumen);
console.log('Estado Reparado:', reparado);

if (sample.length) {
  console.log('\nMuestra SP-E0557:', sample[0]);
  console.log('Primera imagen:', sampleImg ? { nombre: sampleImg.nombre, url: sampleImg.url?.slice(0, 80), hasDataUrl: !!sampleImg.dataUrl } : 'sin imágenes');
  if (sampleImg?.url) {
    const rel = sampleImg.url.replace(/^\/uploads\//, '');
    const disk = path.join(__dirname, 'uploads', rel.replace(/\//g, path.sep));
    console.log('Archivo en disco:', fs.existsSync(disk) ? 'OK' : 'FALTA', disk);
  }
}

let ok = totalTaller >= 20 && spE > 0 && spEAuto < 5;
if (withUrl === 0 && withDataUrl > 0) {
  console.log('\n⚠ Reimportar: node importar-reportes-a-bd.mjs (imágenes aún en base64 viejo)');
  ok = false;
}
console.log(ok ? '\n✓ Test básico OK' : '\n✗ Revisar import / reiniciar-ssepi.bat');
process.exit(ok ? 0 : 1);
