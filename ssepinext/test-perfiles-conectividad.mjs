/**
 * TEST: Conectividad de Perfiles y Módulos SSEPI Offline
 * Verifica login de cada usuario demo, qué registros ve, y flujos cross-módulo.
 * Uso: node test-perfiles-conectividad.mjs
 */

const BASE = process.env.SSEPI_URL || 'http://localhost:3333';
const PASSWORD = 'Ssepi2025!';

const USUARIOS = [
  { email: 'norbertomoro4@gmail.com', nombre: 'Norberto Moro', rol: 'superadmin', deptosEsperados: null /* todos */ },
  { email: 'ventas1@ssepi.org', nombre: 'Ventas 1', rol: 'ventas', deptosEsperados: ['Ventas'] },
  { email: 'laboratorio1@ssepi.org', nombre: 'Laboratorio 1', rol: 'admin', deptosEsperados: ['Laboratorio'] },
  { email: 'motores1@ssepi.org', nombre: 'Motores 1', rol: 'admin', deptosEsperados: ['Motores'] },
  { email: 'automatizacion1@ssepi.org', nombre: 'Automatizacion 1', rol: 'automatizacion', deptosEsperados: ['Automatizacion'] },
  { email: 'ivang.ssepi@gmail.com', nombre: 'Ivan Garcia', rol: 'automatizacion', deptosEsperados: ['Automatizacion'] },
  { email: 'administracion@ssepi.org', nombre: 'Admin SSEPI', rol: 'admin', deptosEsperados: ['Administracion'] },
  { email: 'automatizacion@ssepi.org', nombre: 'Automatización', rol: 'admin', deptosEsperados: ['Automatizacion'] },
  { email: 'ventas@ssepi.org', nombre: 'Ventas Admin', rol: 'admin', deptosEsperados: ['Ventas'] },
  { email: 'electronica@ssepi.org', nombre: 'Electrónica Admin', rol: 'admin', deptosEsperados: ['Electrónica'] },
  { email: 'electronica.ssepi@gmail.com', nombre: 'Ventas SSEPI', rol: 'ventas_sin_compras', deptosEsperados: ['Ventas'] },
];

const TABLAS = [
  { name: 'actividades_diarias', rolFilter: null },
  { name: 'ordenes_taller', rolFilter: null },
  { name: 'ordenes_motores', rolFilter: null },
  { name: 'proyectos_automatizacion', rolFilter: null },
  { name: 'soporte_visitas', rolFilter: null },
  { name: 'compras', rolFilter: null },
  { name: 'ventas', rolFilter: null },
  { name: 'contactos', rolFilter: null },
  { name: 'inventario', rolFilter: null },
  { name: 'cotizaciones', rolFilter: null },
  { name: 'clientes_adeudos', rolFilter: null },
];

function log(type, msg, data) {
  const icon = type === 'ok' ? '✅' : type === 'fail' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`${icon} ${msg}`, data || '');
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${txt.slice(0, 200)}`);
  }
  try { return await res.json(); } catch { return null; }
}

async function loginUser(email, password) {
  const result = await jsonFetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  // El servidor responde { data: { token, user: { id, email, user_metadata... } } }
  return result?.data || result;
}

async function getSession(token) {
  const result = await jsonFetch(`${BASE}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return result?.data || result;
}

async function getTable(token, tableName, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, v);
  const url = `${BASE}/proxy/rest/v1/${tableName}?${qs.toString()}`;
  try {
    const rows = await jsonFetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    // 404 tabla no existe en offline es válido
    if (String(e.message).includes('Tabla no existe')) return [];
    throw e;
  }
}

function assertEqual(actual, expected, label) {
  const a = String(actual);
  const e = String(expected);
  if (a !== e) {
    log('fail', `${label}: esperado "${e}", obtenido "${a}"`);
    return false;
  }
  log('ok', `${label}: "${a}"`);
  return true;
}

async function testUsuario(u) {
  console.log(`\n━━━ ${u.email} ━━━`);
  let ok = true;

  // 1. Login
  let loginRes;
  try {
    loginRes = await loginUser(u.email, PASSWORD);
    log('ok', `Login exitoso`);
  } catch (e) {
    log('fail', `Login falló: ${e.message}`);
    return false;
  }

  const token = loginRes?.token || loginRes?.session?.access_token;
  if (!token) {
    log('fail', 'No se recibió token tras login');
    return false;
  }

  // 2. Session / perfil
  let session;
  try {
    session = await getSession(token);
  } catch (e) {
    log('fail', `Session falló: ${e.message}`);
    return false;
  }

  const user = session?.user || loginRes?.user;
  const meta = user?.user_metadata || {};
  ok = assertEqual(meta.rol, u.rol, 'Rol') && ok;
  ok = assertEqual(meta.departamento || meta.depto, u.deptosEsperados?.[0] || meta.departamento, 'Departamento') && ok;

  // 3. Tablas básicas — contar registros
  const conteos = {};
  for (const t of TABLAS) {
    try {
      const rows = await getTable(token, t.name);
      conteos[t.name] = rows.length;
      // Mostrar conteo bajo para diagnóstico
      if (rows.length > 0) {
        log('ok', `${t.name}: ${rows.length} registros`);
      } else {
        log('warn', `${t.name}: 0 registros`);
      }
    } catch (e) {
      log('fail', `${t.name}: error consultando — ${e.message}`);
      ok = false;
    }
  }

  // 4. Visibilidad cross-módulo según rol
  // Superadmin ve TODO
  if (u.rol === 'superadmin') {
    const totalAct = conteos['actividades_diarias'] || 0;
    if (totalAct === 0) { log('fail', 'Superadmin debería ver actividades'); ok = false; }
    else log('ok', `Superadmin ve ${totalAct} actividades`);
  }

  // Ventas: ve sus propias cotizaciones/ventas + contactos + inventario
  if (u.rol === 'ventas' || u.rol === 'ventas_sin_compras') {
    // Debe ver contactos
    if ((conteos['contactos'] || 0) === 0) { log('fail', 'Ventas debería ver contactos'); ok = false; }
    else log('ok', `Ventas ve ${conteos['contactos']} contactos`);
    // Inventario
    if ((conteos['inventario'] || 0) === 0) { log('fail', 'Ventas debería ver inventario'); ok = false; }
    else log('ok', `Ventas ve ${conteos['inventario']} items inventario`);
  }

  // Automatización: ve proyectos_automatizacion y soporte_visitas
  if (u.rol === 'automatizacion') {
    const proy = (conteos['proyectos_automatizacion'] || 0);
    const sop = (conteos['soporte_visitas'] || 0);
    if (proy === 0) { log('fail', 'Automatización debería ver proyectos_automatizacion'); ok = false; }
    else log('ok', `Automatización ve ${proy} proyectos`);
    if (sop === 0) { log('warn', 'Automatización no ve soporte_visitas (puede ser normal si no hay datos)'); }
    else log('ok', `Automatización ve ${sop} visitas soporte`);
  }

  // Admin genérico (laboratorio/motores/electronica/administracion): ve todo (null en ROLE_MODULES)
  if (u.rol === 'admin') {
    const act = conteos['actividades_diarias'] || 0;
    const tall = conteos['ordenes_taller'] || 0;
    const mot = conteos['ordenes_motores'] || 0;
    if (act === 0) log('warn', `Admin ${u.nombre} no ve actividades (puede ser normal)`);
    else log('ok', `Admin ${u.nombre} ve ${act} actividades`);
    if (tall === 0) log('warn', `Admin ${u.nombre} no ve órdenes taller`);
    else log('ok', `Admin ${u.nombre} ve ${tall} órdenes taller`);
    if (mot === 0) log('warn', `Admin ${u.nombre} no ve órdenes motores`);
    else log('ok', `Admin ${u.nombre} ve ${mot} órdenes motores`);
  }

  return ok;
}

async function testFlujoCrossModulo() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  FLUJOS CROSS-MÓDULO`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Login como ventas1
  let tokenV;
  try {
    const r = await loginUser('ventas1@ssepi.org', PASSWORD);
    tokenV = r?.token || r?.session?.access_token;
    log('ok', 'Flujo: login ventas1 exitoso');
  } catch (e) {
    log('fail', 'Flujo ventas1 login: ' + e.message);
    return;
  }

  // Login como admin (Norberto)
  let tokenA;
  try {
    const r = await loginUser('norbertomoro4@gmail.com', PASSWORD);
    tokenA = r?.token || r?.session?.access_token;
    log('ok', 'Flujo: login superadmin exitoso');
  } catch (e) {
    log('fail', 'Flujo superadmin login: ' + e.message);
    return;
  }

  // A) Ventas ve órdenes de taller/motores existentes
  const vt = await getTable(tokenV, 'ordenes_taller');
  const vm = await getTable(tokenV, 'ordenes_motores');
  if (vt.length > 0) log('ok', `Ventas ve ${vt.length} órdenes taller (cross-módulo)`);
  else log('warn', 'Ventas no ve órdenes taller (puede ser normal según rol)');
  if (vm.length > 0) log('ok', `Ventas ve ${vm.length} órdenes motores (cross-módulo)`);
  else log('warn', 'Ventas no ve órdenes motores (puede ser normal según rol)');

  // B) Superadmin ve actividades de automatización
  const actAuto = await getTable(tokenA, 'actividades_diarias', { departamento: 'eq.automatizacion' });
  if (actAuto.length > 0) log('ok', `Superadmin ve ${actAuto.length} actividades de automatización (cross-módulo)`);
  else log('warn', 'Superadmin no ve actividades automatización (¿seed necesario?)');

  // C) Superadmin ve actividades de laboratorio (electronicos en BD)
  const actLab = await getTable(tokenA, 'actividades_diarias', { departamento: 'eq.electronicos' });
  if (actLab.length > 0) log('ok', `Superadmin ve ${actLab.length} actividades de laboratorio/electronicos (cross-módulo)`);
  else log('warn', 'Superadmin no ve actividades laboratorio');

  // D) Automatización ve proyectos + soporte
  let tokenAuto;
  try {
    const r = await loginUser('automatizacion1@ssepi.org', PASSWORD);
    tokenAuto = r?.token || r?.session?.access_token;
  } catch (e) {
    log('fail', 'Login automatizacion1: ' + e.message);
    return;
  }
  const proj = await getTable(tokenAuto, 'proyectos_automatizacion');
  const vis = await getTable(tokenAuto, 'soporte_visitas');
  if (proj.length > 0) log('ok', `Automatización1 ve ${proj.length} proyectos`);
  else log('fail', 'Automatización1 no ve proyectos');
  if (vis.length > 0) log('ok', `Automatización1 ve ${vis.length} soporte_visitas`);
  else log('warn', 'Automatización1 no ve soporte_visitas');

  // E) Iván (automatización) ve las mismas cosas que automatización1
  let tokenIvan;
  try {
    const r = await loginUser('ivang.ssepi@gmail.com', PASSWORD);
    tokenIvan = r?.token || r?.session?.access_token;
  } catch (e) {
    log('fail', 'Login ivan: ' + e.message);
    return;
  }
  const projIvan = await getTable(tokenIvan, 'proyectos_automatizacion');
  if (projIvan.length > 0) log('ok', `Iván ve ${projIvan.length} proyectos (rol automatización)`);
  else log('fail', 'Iván no ve proyectos (debería como automatización)');
}

async function main() {
  console.log(`SSEPI — Test de Perfiles y Conectividad Offline`);
  console.log(`Base URL: ${BASE}`);

  // Sanity check: servidor responde
  try {
    await jsonFetch(`${BASE}/api/health`);
    log('ok', 'Servidor offline responde en /api/health');
  } catch (e) {
    log('fail', `Servidor offline NO responde en ${BASE}: ${e.message}`);
    console.log(`\nAsegúrate de que el servidor esté corriendo:`);
    console.log(`  cd E:\\SSEPI\\ssepinext && node offline-server.mjs`);
    console.log(`O ejecuta: E:\\SSEPI\\reiniciar-ssepi.bat`);
    process.exit(1);
  }

  let allOk = true;
  for (const u of USUARIOS) {
    const ok = await testUsuario(u);
    if (!ok) allOk = false;
  }

  await testFlujoCrossModulo();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (allOk) {
    console.log(`✅ TODOS LOS TESTS PASARON`);
    process.exit(0);
  } else {
    console.log(`❌ ALGUNOS TESTS FALLARON — revisar arriba`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
