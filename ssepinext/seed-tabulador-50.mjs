/**
 * Fuente única: 50 empresas del TABULADOR DE COTIZACIÓN actualizado.xlsx
 * → local_clientes_tabulador (para Ventas / cotización)
 *
 * Uso: node seed-tabulador-50.mjs
 */
import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_JSON = path.join(__dirname, 'data', 'master', 'clientes_tabulador.json');

/** @type {Array<{orden:number, nombre:string, rfc?:string, lab?:number, mot?:number, sum?:number, auto?:number, km?:number}>} */
const TABULADOR_50 = [
  { orden: 1, nombre: 'AEROPUERTO', lab: 740, mot: 740, sum: 740, auto: 222, km: 0 },
  { orden: 2, nombre: 'ANGUIPLAST', rfc: 'ANG101215PG0', lab: 1872, mot: 1872, sum: 1872, auto: 618, km: 234 },
  { orden: 3, nombre: 'ARCOSA', rfc: 'ECS440707GG7', lab: 834, mot: 906, sum: 906, auto: 661, km: 32 },
  { orden: 4, nombre: 'BADER TABACHINES', rfc: 'BAD880303CC3', lab: 489, mot: 489, sum: 489, auto: 62, km: 17.2 },
  { orden: 5, nombre: 'BODYCOTE', rfc: 'BOD770404DD4', lab: 994, mot: 994, sum: 994, auto: 278, km: 90.6 },
  { orden: 6, nombre: 'BOLSAS DE LOS ALTOS', rfc: 'BAL050101AA1', lab: 1872, mot: 1939, sum: 1939, auto: 618, km: 226 },
  { orden: 7, nombre: 'BRUSAROSCO', lab: 489, mot: 489, sum: 489, auto: 49, km: 0 },
  { orden: 8, nombre: 'CARTOTEC', lab: 489, mot: 489, sum: 489, auto: 49, km: 0 },
  { orden: 9, nombre: 'COFICAB', rfc: 'COF660505EE5', lab: 950, mot: 950, sum: 950, auto: 247, km: 80 },
  { orden: 10, nombre: 'CONDUMEX', rfc: 'CON550606FF6', lab: 994, mot: 994, sum: 994, auto: 278, km: 90.6 },
  { orden: 11, nombre: 'DI-CENTRAL', lab: 682, mot: 682, sum: 682, auto: 56, km: 0 },
  { orden: 12, nombre: 'ECOBOLSAS', rfc: 'ECO990202BB2', lab: 1872, mot: 1872, sum: 1872, auto: 618, km: 216 },
  { orden: 13, nombre: 'EMMSA', rfc: 'EMM330808HH8', lab: 489, mot: 489, sum: 489, auto: 49, km: 21.6 },
  { orden: 14, nombre: 'EMMSA SILAO', lab: 776, mot: 776, sum: 776, auto: 247, km: 0 },
  { orden: 15, nombre: 'EPC 1', rfc: 'EPC220909II9', km: 400 },
  { orden: 16, nombre: 'EPC 2', rfc: 'EPC111010JJ0', lab: 2737, mot: 2737, sum: 2737, auto: 1236, km: 402 },
  { orden: 17, nombre: 'EPC1', lab: 2737, mot: 2737, sum: 2737, auto: 1236, km: 0 },
  { orden: 18, nombre: 'FAMO ALIMENTOS', lab: 805, mot: 777, sum: 777, auto: 124, km: 0 },
  { orden: 19, nombre: 'FAS', lab: 1498, mot: 1757, sum: 1757, auto: 680, km: 0 },
  { orden: 20, nombre: 'FRAENKISCHE', rfc: 'FRA001111KK1', lab: 994, mot: 994, sum: 994, auto: 278, km: 0 },
  { orden: 21, nombre: 'GEDNEY', rfc: 'GED991212LL2', lab: 699, mot: 699, sum: 699, auto: 68, km: 23.6 },
  { orden: 22, nombre: 'GRANOS Y SEMILLAS', lab: 1498, mot: 1498, sum: 1498, auto: 494, km: 0 },
  { orden: 23, nombre: 'GRUPO ACERERO', rfc: 'GRU880101MM3', lab: 2737, mot: 2737, sum: 2737, auto: 1236, km: 386 },
  { orden: 24, nombre: 'GRUPO ZAHONERO', lab: 471, mot: 471, sum: 471, auto: 37, km: 0 },
  { orden: 25, nombre: 'HALLIBURTON', rfc: 'HAL770202NN4', lab: 907, mot: 907, sum: 907, auto: 216, km: 73.8 },
  { orden: 26, nombre: 'HIELO REGIA', lab: 596, mot: 596, sum: 596, auto: 124, km: 0 },
  { orden: 27, nombre: 'HIRUTA', rfc: 'HIR660303OO5', lab: 907, mot: 907, sum: 907, auto: 216, km: 58.4 },
  { orden: 28, nombre: 'HORMAS PALACIOS', lab: 489, mot: 489, sum: 489, auto: 49, km: 0 },
  { orden: 29, nombre: 'IK PLASTIC', rfc: 'IKP550404PP6', lab: 924, mot: 924, sum: 924, auto: 229, km: 61.4 },
  { orden: 30, nombre: 'IMPRENTA JM', rfc: 'IMP440505QQ7', lab: 481, mot: 481, sum: 481, auto: 56, km: 16.2 },
  { orden: 31, nombre: 'JARDÍN LA ALEMANA', rfc: 'JAR330606RR8', lab: 455, mot: 455, sum: 455, auto: 37, km: 12 },
  { orden: 32, nombre: 'MAFLOW', rfc: 'MAF220707SS9', lab: 714, mot: 714, sum: 714, auto: 222, km: 59.8 },
  { orden: 33, nombre: 'MARQUARDT', rfc: 'MAR110808TT0', lab: 1210, mot: 1210, sum: 1210, auto: 433, km: 125.4 },
  { orden: 34, nombre: 'MICROONDA', rfc: 'MIC000909UU1', lab: 435, mot: 435, sum: 435, auto: 167, km: 41.6 },
  { orden: 35, nombre: 'MINO INDUSTRY', rfc: 'MIN000707E55', lab: 533, mot: 533, sum: 533, auto: 93, km: 29.2 },
  { orden: 36, nombre: 'MR LUCKY', rfc: 'MRL991010VV2', lab: 1262, mot: 1262, sum: 1262, auto: 470, km: 157 },
  { orden: 37, nombre: 'NHK', rfc: 'NHK881111WW3', lab: 1210, mot: 1210, sum: 1210, auto: 433, km: 138.6 },
  { orden: 38, nombre: 'NISHIKAWA', rfc: 'NIS771212XX4', lab: 916, mot: 1210, sum: 1210, auto: 222, km: 61 },
  { orden: 39, nombre: 'PIELES AZTECA', rfc: 'PIE660101YY5', lab: 429, mot: 714, sum: 714, auto: 19, km: 5 },
  { orden: 40, nombre: 'PILSAC', lab: 471, mot: 471, sum: 471, auto: 37, km: 0 },
  { orden: 41, nombre: 'PRELOSA', lab: 850, mot: 850, sum: 850, auto: 155, km: 0 },
  { orden: 42, nombre: 'RONGTAI', rfc: 'RON550202ZZ6', lab: 743, mot: 743, sum: 743, auto: 99, km: 28.2 },
  { orden: 43, nombre: 'SADDLEBACK', lab: 507, mot: 507, sum: 507, auto: 62, km: 0 },
  { orden: 44, nombre: 'SAFE DEMO', rfc: 'SAF440303A11', lab: 680, mot: 680, sum: 680, auto: 198, km: 61.6 },
  { orden: 45, nombre: 'SERVIACERO ELECTROFORJADOS', rfc: 'SEE330404B22', lab: 472, mot: 472, sum: 472, auto: 49, km: 14.6 },
  { orden: 46, nombre: 'SOSER', lab: 489, mot: 507, sum: 507, auto: 49, km: 0 },
  { orden: 47, nombre: 'SUACERO', rfc: 'SUA220505C33', lab: 2737, mot: 2737, sum: 2737, auto: 1236, km: 392 },
  { orden: 48, nombre: 'TENERÍA VARGAS', lab: 507, mot: 507, sum: 507, auto: 62, km: 0 },
  { orden: 49, nombre: 'TORNIMASTER', lab: 689, mot: 689, sum: 689, auto: 43, km: 0 },
  { orden: 50, nombre: 'TQ-1', rfc: 'TQ1110606D44', lab: 515, mot: 515, sum: 515, auto: 80, km: 26 },
];

function horasViajeDesdeKm(km) {
  const k = Number(km) || 0;
  if (k <= 0) return 0;
  if (k <= 12) return 2;
  if (k <= 30) return 3;
  if (k <= 80) return 4;
  if (k <= 160) return 5;
  if (k <= 250) return 6;
  if (k <= 400) return 7;
  return 8;
}

function litrosDesdeKm(km) {
  const k = Number(km) || 0;
  if (k <= 0) return 0;
  return Math.round((k / 9.5) * 100) / 100;
}

function buildMasterRecords() {
  const now = new Date().toISOString();
  return TABULADOR_50.map((row) => {
    const km = Number(row.km) || 0;
    const horas = horasViajeDesdeKm(km);
    const litros = litrosDesdeKm(km);
    const gasolina = Math.round(litros * 27 * 100) / 100;
    const tecnico = horas * 125;
    const total = Math.round((gasolina + tecnico) * 100) / 100;
    return {
      id: `tab-${String(row.orden).padStart(3, '0')}`,
      orden: row.orden,
      nombre_cliente: row.nombre,
      rfc: row.rfc || '',
      km,
      horas_viaje: horas,
      litros,
      costo_gasolina: gasolina,
      costo_tecnico: tecnico,
      total,
      costo_km: 12,
      tarifa_km: 18,
      utilidad_factor: 1.4,
      tipo_servicio: 'viajes',
      activo: true,
      precio_lab_3pct: row.lab ?? null,
      precio_mot_3pct: row.mot ?? null,
      precio_sum_3pct: row.sum ?? null,
      precio_auto_venta: row.auto ?? null,
      fuente: 'tabulador_excel_50',
      created_at: now,
      updated_at: now,
    };
  });
}

async function seed() {
  setDeferPersist(true);
  const db = await getDb();
  const stmtTab = await prepareStatement(db, 'local_clientes_tabulador');

  const records = buildMasterRecords();

  fs.mkdirSync(path.dirname(MASTER_JSON), { recursive: true });
  fs.writeFileSync(
    MASTER_JSON,
    JSON.stringify(
      {
        _schema_version: 2,
        _last_updated: new Date().toISOString(),
        _source: 'TABULADOR DE COTIZACIÓN actualizado.xlsx — 50 empresas',
        records,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('[Tabulador50] JSON maestro:', MASTER_JSON, '→', records.length, 'registros');

  db.exec('DELETE FROM local_clientes_tabulador');
  let tabCount = 0;
  for (const rec of records) {
    await stmtTab.insert(null, rec);
    tabCount++;
  }
  console.log('[Tabulador50] clientes_tabulador:', tabCount);

  setDeferPersist(false);
  persistDb();
  console.log('[Tabulador50] Listo — Ventas debe mostrar exactamente', records.length, 'clientes del tabulador (desde clientes_tabulador).');
}

seed().catch((e) => {
  console.error('[Tabulador50] Error:', e);
  process.exit(1);
});
