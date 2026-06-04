/**
 * Seed módulo Vacaciones en BD local (SSEPI-NEXT).
 * Uso: node ssepinext/seed-vacaciones-local.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, prepareStatement, persistDb, setDeferPersist } from './db.mjs';
import { SSEPI_USERS } from './users-catalog.mjs';
import { filterVisibleProfiles } from './hidden-profiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    return row;
  });
}

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const EMPLEADOS_DEFAULT = [
  { nombre: 'Eduardo Amezcua', rol: 'ventas', email: 'ventas1@ssepi.org', color: '#3b82f6', orden: 1 },
  { nombre: 'Ivan Gutierrez', rol: 'automatizacion', email: 'ivang.ssepi@gmail.com', color: '#8b5cf6', orden: 2 },
  { nombre: 'Aaron Garcia', rol: 'taller', email: 'electronica.ssepi@gmail.com', color: '#22c55e', orden: 3 },
  { nombre: 'Javier Cruz', rol: 'taller', email: 'laboratorio1@ssepi.org', color: '#f59e0b', orden: 4 },
  { nombre: 'Ana Moreno', rol: 'administracion', email: 'administracion@ssepi.org', color: '#ec4899', orden: 5 },
  { nombre: 'Arturo Moreno', rol: 'automatizacion', email: 'automatizacion@ssepi.org', color: '#06b6d4', orden: 6 },
  { nombre: 'Misael Moreno', rol: 'contabilidad', email: '', color: '#6366f1', orden: 7 },
  { nombre: 'Daniel Zuniga', rol: 'ventas', email: 'ventas@ssepi.org', color: '#14b8a6', orden: 8 },
  { nombre: 'Alejandro Becerra', rol: 'motores', email: 'motores1@ssepi.org', color: '#84cc16', orden: 10 },
  { nombre: 'Carlos Calderon', rol: 'ventas', email: 'ventas1@ssepi.org', color: '#0ea5e9', orden: 11 },
  { nombre: 'Itzel', rol: 'compras', email: 'compras@ssepi.org', color: '#a855f7', orden: 12 },
  { nombre: 'Aron', rol: 'taller', email: 'electronica.ssepi@gmail.com', color: '#22c55e', orden: 13 },
];

const FERIADOS_DEFAULT = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo', tipo: 'legal' },
  { fecha: '2026-02-02', nombre: 'Día de la Constitución', tipo: 'legal' },
  { fecha: '2026-03-16', nombre: 'Natalicio de Benito Juárez', tipo: 'legal' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo', tipo: 'legal' },
  { fecha: '2026-09-16', nombre: 'Día de la Independencia', tipo: 'legal' },
  { fecha: '2026-11-16', nombre: 'Revolución Mexicana', tipo: 'legal' },
  { fecha: '2026-12-25', nombre: 'Navidad', tipo: 'legal' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo', tipo: 'religioso' },
  { fecha: '2026-11-02', nombre: 'Día de Muertos', tipo: 'suspension_labores' },
  { fecha: '2026-12-12', nombre: 'Día de la Virgen de Guadalupe', tipo: 'religioso' },
];

const db = await getDb();
setDeferPersist(true);

const stmtEmp = await prepareStatement(db, 'local_vacaciones_empleados');
const stmtFer = await prepareStatement(db, 'local_vacaciones_dias_feriados');
const stmtBal = await prepareStatement(db, 'local_vacaciones_balance');
const stmtSol = await prepareStatement(db, 'local_vacaciones_solicitudes');

const userByEmail = Object.fromEntries(SSEPI_USERS.map((u) => [u.email.toLowerCase(), u.id]));
const userByName = {};
SSEPI_USERS.forEach((u) => { userByName[normName(u.nombre)] = u.id; });

let empleadosRows = EMPLEADOS_DEFAULT;
const csvEmp = path.join(ROOT, 'scripts/fixes/cvs/vacaciones_empleados_rows.csv');
if (fs.existsSync(csvEmp)) {
  const fromCsv = readCsv(csvEmp).map((r) => ({
    id: r.id || null,
    nombre: r.nombre,
    rol: r.rol,
    email: r.email || '',
    color: r.color || '#3b82f6',
    orden: parseInt(r.orden, 10) || 0,
  }));
  if (fromCsv.length) empleadosRows = fromCsv;
}

empleadosRows = filterVisibleProfiles(empleadosRows);

let feriadosRows = FERIADOS_DEFAULT;
const csvFer = path.join(ROOT, 'scripts/fixes/cvs/vacaciones_dias_feriados_rows.csv');
if (fs.existsSync(csvFer)) {
  const fromCsv = readCsv(csvFer).map((r) => ({
    fecha: r.fecha,
    nombre: r.nombre,
    tipo: r.tipo || 'legal',
    anio: r.anio ? parseInt(r.anio, 10) : parseInt(String(r.fecha).slice(0, 4), 10),
  }));
  if (fromCsv.length) feriadosRows = fromCsv;
}

// Limpiar tablas vacaciones (solo locales)
for (const table of ['local_vacaciones_solicitudes', 'local_vacaciones_balance', 'local_vacaciones_dias_feriados', 'local_vacaciones_empleados']) {
  db.run(`DELETE FROM ${table}`);
}

let empCount = 0;
for (const e of empleadosRows) {
  const email = (e.email || '').toLowerCase();
  let userId = userByEmail[email] || userByName[normName(e.nombre)] || null;
  if (!userId && normName(e.nombre).includes('aaron')) userId = userByEmail['electronica.ssepi@gmail.com'];
  await stmtEmp.insert(e.id || null, {
    user_id: userId,
    nombre: e.nombre,
    rol: e.rol,
    email: e.email || null,
    color: e.color || '#3b82f6',
    orden: e.orden ?? 0,
    created_at: new Date().toISOString(),
  });
  empCount++;
}

let ferCount = 0;
const feriadosSeen = new Set();
for (const f of feriadosRows) {
  if (!f.fecha || feriadosSeen.has(f.fecha)) continue;
  feriadosSeen.add(f.fecha);
  await stmtFer.insert(f.id || null, {
    fecha: f.fecha,
    nombre: f.nombre,
    tipo: f.tipo || 'legal',
    anio: f.anio || parseInt(String(f.fecha).slice(0, 4), 10),
    created_at: new Date().toISOString(),
  });
  ferCount++;
}

const anio = new Date().getFullYear();
let balCount = 0;
for (const u of SSEPI_USERS) {
  await stmtBal.insert(null, {
    user_id: u.id,
    anio,
    dias_asignados: 15,
    dias_solicitados: 0,
    updated_at: new Date().toISOString(),
  });
  balCount++;
}

setDeferPersist(false);
persistDb();

console.log(`[seed-vacaciones-local] Empleados: ${empCount}`);
console.log(`[seed-vacaciones-local] Días feriados: ${ferCount}`);
console.log(`[seed-vacaciones-local] Balances ${anio}: ${balCount} usuarios`);
