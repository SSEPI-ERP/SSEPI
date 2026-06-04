/**
 * Repara órdenes de Laboratorio con cliente/falla vacíos.
 * Fuente: datos_recepcion.cliente / datos_recepcion.falla.
 *
 * Uso:  node ssepinext/repair-laboratorio-cliente-falla.mjs
 *
 * - Solo actúa sobre órdenes importadas del paquete ERP (formato laboratorio-1)
 *   que tengan cliente/falla vacíos en el top-level.
 * - Conserva el valor top-level si ya era válido.
 * - No reescribe si datos_recepcion está vacío o tiene basura.
 */
import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();
const stmt = await prepareStatement(db, 'local_ordenes_taller');

const MIN_LEN = 4;
const FORBIDDEN = /^(equipo por identificar|cliente por identificar|s\/n|s\/d|n\/a|undefined|null|none)$/i;

function isValidText(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < MIN_LEN) return false;
  if (FORBIDDEN.test(t)) return false;
  return true;
}

function looksLikeFalla(s) {
  if (!s) return false;
  const t = s.toLowerCase();
  return /(no funciona|no enciende|no arranca|reparaci[oó]n|falla|descompost|quemad|roto|golpe|sin se[ñn]al|sin video|sin imagen|chocado|muestra|marca|parpadea|ruido|huele|olor|corto|abierto|cerrado|sale|emite|enciende|apaga|enciende|enciende|enciende)/.test(t);
}

const r = db.exec('SELECT id, data FROM local_ordenes_taller');
let fixed = 0, skipped = 0, badData = 0;
const examples = [];

for (const [id, dataStr] of r[0].values) {
  let o;
  try { o = JSON.parse(dataStr); } catch { continue; }

  // Solo importar_erp / laboratorio-1
  if (o.formato !== 'laboratorio-1' && o.origen !== 'import_erp') continue;

  const recp = o.datos_recepcion || {};
  const recpCliente = recp.cliente;
  const recpFalla = recp.falla;

  const hasCli = isValidText(o.cliente);
  const hasFal = isValidText(o.falla);

  if (hasCli && hasFal) { skipped++; continue; }

  const patch = { ...o, updated_at: new Date().toISOString() };
  let changed = false;

  if (!hasCli && isValidText(recpCliente) && !looksLikeFalla(recpCliente)) {
    patch.cliente = recpCliente.trim();
    changed = true;
  } else if (!hasCli && isValidText(recpCliente) && looksLikeFalla(recpCliente)) {
    // Si recp.cliente ES la falla (caso RE-0170), buscarla en otro lado
    if (!hasFal && isValidText(recpFalla)) {
      patch.falla = recpFalla.trim();
      changed = true;
    }
    badData++;
  }

  if (!hasFal && isValidText(recpFalla)) {
    patch.falla = recpFalla.trim();
    changed = true;
  } else if (!hasFal && isValidText(recpCliente) && !looksLikeFalla(recpCliente)) {
    // Si cliente top se rellenó, intenta llenar falla desde recp.notas o descripcion
    if (isValidText(recp.condiciones)) {
      patch.falla = recp.condiciones.trim();
      changed = true;
    }
  }

  if (changed) {
    await stmt.update(id, patch);
    fixed++;
    if (examples.length < 3) {
      examples.push({ id, folio: o.folio, cliente: patch.cliente, falla: patch.falla });
    }
  } else {
    skipped++;
  }
}

persistDb();
console.log(`[repair-lab] Registros actualizados: ${fixed}`);
console.log(`[repair-lab] Sin cambios:            ${skipped}`);
console.log(`[repair-lab] Con datos ambiguos:     ${badData}`);
if (examples.length) {
  console.log('\nEjemplos reparados:');
  examples.forEach(e => console.log(`  ${e.folio}: cliente="${e.cliente}" | falla="${(e.falla || '').substring(0, 60)}"`));
}
