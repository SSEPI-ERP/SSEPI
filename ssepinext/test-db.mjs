import { getDb, prepareStatement } from './db.mjs';

const db = await getDb();
const stmt = await prepareStatement(db, 'local_clientes_tabulador');

// Test 1: query sin filtros
const r1 = await stmt.query('', [], 'nombre_cliente ASC', 10);
console.log('TEST 1 - query sin filtros:');
console.log('  Length:', r1.length);
if (r1.length > 0) {
  console.log('  First keys:', Object.keys(r1[0]));
  console.log('  First nombre_cliente:', r1[0].nombre_cliente);
}

// Test 2: query con eq activo=true
const r2 = await stmt.query("json_extract(data, '$.activo') = ?", [1], 'nombre_cliente ASC', 10);
console.log('\nTEST 2 - query activo=1:');
console.log('  Length:', r2.length);
if (r2.length > 0) {
  console.log('  First keys:', Object.keys(r2[0]));
  console.log('  First activo:', r2[0].activo);
}

// Test 3: query con eq activo=true usando coerced value
const coerced = _coerceValue('true');
console.log('\nTEST 3 - coerced true:', coerced, typeof coerced);

// Test 4: simular exactamente lo que hace el proxy
function parsePostgrestQuery(query) {
  const result = { select: '*', filters: [], orderCol: 'updated_at', orderDir: 'DESC', limit: 1000, offset: 0, single: false };
  for (const [key, val] of Object.entries(query)) {
    if (key === 'select') { result.select = val; continue; }
    if (key === 'order') {
      if (typeof val === 'string') {
        const m = val.match(/^(.+)\.(asc|desc)$/i);
        if (m) { result.orderCol = m[1]; result.orderDir = m[2].toUpperCase(); }
        else { result.orderCol = val; result.orderDir = 'ASC'; }
      }
      continue;
    }
    if (key === 'limit') { result.limit = parseInt(val, 10) || 1000; continue; }
    if (key === 'offset') { result.offset = parseInt(val, 10) || 0; continue; }
    if (key === 'single') { result.single = val === 'true'; continue; }
    if (key === 'or' || key === 'and') continue;
    const rawVal = Array.isArray(val) ? val[0] : val;
    if (typeof rawVal !== 'string') continue;
    const opMatchKey = key.match(/^(.+)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)$/);
    if (opMatchKey) {
      const col = opMatchKey[1], op = opMatchKey[2];
      let value = rawVal;
      if (op === 'in') value = rawVal.replace(/[()]/g, '').split(',').map(s => s.trim());
      result.filters.push({ col, op, value });
    } else {
      const opMatchVal = rawVal.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/);
      if (opMatchVal) {
        const op = opMatchVal[1];
        let value = opMatchVal[2];
        if (op === 'in') value = value.replace(/[()]/g, '').split(',').map(s => s.trim());
        if (op === 'is' && value === 'null') value = 'null';
        result.filters.push({ col: key, op, value });
      } else {
        result.filters.push({ col: key, op: 'eq', value: rawVal });
      }
    }
  }
  return result;
}

function _coerceValue(val) {
  if (val === 'true') return 1;
  if (val === 'false') return 0;
  return val;
}

function colRef(col) {
  return col === 'id' ? 'id' : `json_extract(data, '$.${col}')`;
}

function buildSqliteWhere(filters) {
  const clauses = [], params = [];
  for (const f of filters) {
    const v = _coerceValue(f.value);
    const ref = colRef(f.col);
    switch (f.op) {
      case 'eq': clauses.push(`${ref} = ?`); params.push(v); break;
      case 'neq': clauses.push(`${ref} != ?`); params.push(v); break;
      case 'gt': clauses.push(`${ref} > ?`); params.push(v); break;
      case 'gte': clauses.push(`${ref} >= ?`); params.push(v); break;
      case 'lt': clauses.push(`${ref} < ?`); params.push(v); break;
      case 'lte': clauses.push(`${ref} <= ?`); params.push(v); break;
      case 'like': clauses.push(`${ref} LIKE ?`); params.push(v); break;
      case 'ilike': clauses.push(`LOWER(${ref}) LIKE LOWER(?)`); params.push(v); break;
      case 'in': {
        const coerced = Array.isArray(f.value) ? f.value.map(_coerceValue) : [v];
        const ph = coerced.map(() => '?').join(',');
        clauses.push(`${ref} IN (${ph})`);
        params.push(...coerced);
        break;
      }
      case 'is':
        if (v === 'null') clauses.push(`${ref} IS NULL`);
        else { clauses.push(`${ref} = ?`); params.push(v); }
        break;
    }
  }
  return { where: clauses.join(' AND '), params };
}

const parsed = parsePostgrestQuery({ select: 'nombre_cliente,km,horas_viaje,activo', activo: 'eq.true', order: 'nombre_cliente.asc' });
const { where, params } = buildSqliteWhere(parsed.filters);
console.log('\nTEST 4 - proxy simulation:');
console.log('  parsed.filters:', JSON.stringify(parsed.filters));
console.log('  where:', where);
console.log('  params:', params);

const r4 = await stmt.query(where, params, 'nombre_cliente ASC', parsed.limit);
console.log('  result length:', r4.length);
if (r4.length > 0) {
  console.log('  first nombre_cliente:', r4[0].nombre_cliente);
  console.log('  first activo:', r4[0].activo);
}

// Test 5: verificar que activo=eq.true funciona con string 'true'
const parsed2 = parsePostgrestQuery({ activo: 'eq.true' });
const w2 = buildSqliteWhere(parsed2.filters);
console.log('\nTEST 5 - activo=eq.true:');
console.log('  where:', w2.where);
console.log('  params:', w2.params);
const r5 = await stmt.query(w2.where, w2.params, 'id ASC', 5);
console.log('  result length:', r5.length);

// Test 6: verificar que el .eq con boolean true en Supabase se traduce correctamente
// Supabase SDK envía: activo=eq.true
// _coerceValue('true') = 1
// json_extract(data, '$.activo') = 1
const r6 = await stmt.query("json_extract(data, '$.activo') = ?", [true], 'id ASC', 5);
console.log('\nTEST 6 - activo eq true (boolean):');
console.log('  result length:', r6.length);
