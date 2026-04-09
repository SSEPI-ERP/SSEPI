/**
 * Importación masiva SSEPI — contactos, órdenes_taller, inventario, BOM.
 *
 * Requisitos: copiar los Excel/CSV del usuario a scripts/imports/fuente/
 * Variables de entorno (solo con --apply):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   npm install
 *   node import.mjs inspect
 *   node import.mjs contacts --dry-run
 *   node import.mjs contacts --apply
 *   node import.mjs orders --dry-run | --apply
 *   node import.mjs inventario --dry-run | --apply
 *   node import.mjs bom --dry-run | --apply
 *   node import.mjs formulas --dry-run | --apply
 *       — FORMULAS DE COTIZACIÓN.xlsx en fuente/ → calculadoras + calculadora_costos
 *
 * No commitear claves. --dry-run escribe CSV en scripts/imports/out/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FUENTE = path.join(__dirname, 'fuente');
const OUT = path.join(__dirname, 'out');
const CLINTES = path.join(ROOT, 'clintes');

function ensureOut() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
}

function normalizeStr(s) {
  if (s == null || s === '') return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Fila objeto con claves normalizadas */
function normalizeRowKeys(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    o[normHeader(k)] = v;
  }
  return o;
}

function pick(row, candidates) {
  for (const c of candidates) {
    const key = normHeader(c);
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function toNum(v, d = 0) {
  if (v == null || v === '') return d;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : d;
}

function toIsoDate(v) {
  if (v == null || v === '') return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!Number.isNaN(dd.getTime())) return dd.toISOString();
  }
  return new Date().toISOString();
}

const ODOO_STATE_MAP = {
  draft: 'Nuevo',
  confirmed: 'Confirmado',
  under_repair: 'En reparación',
  done: 'Reparado',
  cancel: 'Cancelado',
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  'en reparación': 'En reparación',
  'en reparacion': 'En reparación',
  reparado: 'Reparado',
  cancelado: 'Cancelado',
  facturado: 'Facturado',
  entregado: 'Entregado',
  diagnostico: 'Diagnóstico',
  'diagnóstico': 'Diagnóstico',
  'en espera': 'En Espera',
};

const ALLOWED_ESTADOS = new Set([
  'Nuevo',
  'Diagnóstico',
  'En Espera',
  'Reparado',
  'Entregado',
  'Facturado',
  'Confirmado',
  'En reparación',
  'Cancelado',
]);

function mapEstado(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Nuevo';
  if (ALLOWED_ESTADOS.has(s)) return s;
  const k = normalizeStr(s).replace(/\s+/g, ' ');
  const k2 = k.replace(/ /g, '_');
  return ODOO_STATE_MAP[k2] || ODOO_STATE_MAP[k] || 'Nuevo';
}

function buildLogoMap() {
  const map = new Map();
  if (!fs.existsSync(CLINTES)) return map;
  for (const f of fs.readdirSync(CLINTES)) {
    if (f.startsWith('.')) continue;
    const base = path.parse(f).name;
    map.set(normalizeStr(base), `/clintes/${f}`);
  }
  return map;
}

function matchLogo(empresa, nombre, logoMap) {
  for (const candidate of [empresa, nombre]) {
    if (!candidate) continue;
    const n = normalizeStr(candidate);
    if (logoMap.has(n)) return logoMap.get(n);
    let best = null;
    let bestLen = 0;
    for (const [key, url] of logoMap) {
      if (key.length >= 4 && (n.includes(key) || key.includes(n)) && key.length > bestLen) {
        best = url;
        bestLen = key.length;
      }
    }
    if (best) return best;
  }
  return null;
}

function readSheetRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const txt = fs.readFileSync(filePath, 'utf8');
    const rows = parse(txt, { columns: true, skip_empty_lines: true, relax_column_count: true });
    return rows.map(normalizeRowKeys);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return json.map(normalizeRowKeys);
}

function writeCsv(name, rows, headers) {
  ensureOut();
  const p = path.join(OUT, name);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(','));
  }
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log('Escrito:', p);
}

function findFuente(globs) {
  if (!fs.existsSync(FUENTE)) return [];
  const files = fs.readdirSync(FUENTE);
  return files
    .filter((f) => globs.some((g) => f.toLowerCase().includes(g.toLowerCase())))
    .map((f) => path.join(FUENTE, f));
}

function getSupabase(apply) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apply) return null;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para --apply');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------- Commands ----------

async function cmdInspect() {
  ensureOut();
  if (!fs.existsSync(FUENTE)) {
    console.log('Carpeta vacía:', FUENTE, '— copia aquí los Excel/CSV.');
    return;
  }
  const files = fs.readdirSync(FUENTE).filter((f) => {
    if (f.startsWith('.')) return false;
    if (f === '.gitkeep' || f.endsWith('.gitkeep')) return false;
    return /\.(xlsx|xls|csv)$/i.test(f);
  });
  if (!files.length) {
    console.log('No hay Excel/CSV en fuente/. Copia aquí los archivos de exportación.');
    return;
  }
  for (const f of files) {
    const fp = path.join(FUENTE, f);
    console.log('\n===', f, '===');
    try {
      if (f.toLowerCase().endsWith('.csv')) {
        const rows = readSheetRows(fp);
        console.log('Filas:', rows.length, '| Columnas:', rows[0] ? Object.keys(rows[0]).join(', ') : '(vacío)');
      } else {
        const wb = XLSX.readFile(fp);
        console.log('Hojas:', wb.SheetNames.join(', '));
        const rows = readSheetRows(fp);
        console.log('Primera hoja, filas:', rows.length);
        if (rows[0]) console.log('Columnas:', Object.keys(rows[0]).join(', '));
      }
    } catch (e) {
      console.error('Error leyendo', f, e.message);
    }
  }
}

async function cmdContacts(argv) {
  const apply = argv.includes('--apply');
  const files = findFuente(['contacto', 'res.partner', 'partner']);
  if (!files.length) {
    console.error('No se encontró archivo en fuente/ con nombre que contenga contacto o res.partner');
    process.exit(1);
  }
  const logoMap = buildLogoMap();
  const rows = readSheetRows(files[0]);
  const out = [];
  for (const r of rows) {
    const nombre = String(pick(r, ['name', 'nombre', 'display_name', 'contacto', 'nombre_completo']) || 'SIN NOMBRE').trim();
    const empresa = String(pick(r, ['empresa', 'company', 'parent_id', 'razon_social', 'razón social']) || '').trim();
    const email = String(pick(r, ['email', 'correo', 'e-mail', 'correo_electronico', 'correo_electrnico']) || '').trim();
    const telefono = String(pick(r, ['phone', 'telefono', 'teléfono', 'mobile', 'movil', 'telefono', 'telfono']) || '').trim();
    const rfc = String(pick(r, ['vat', 'rfc', 'tax_id']) || '').trim();
    const street = String(pick(r, ['street', 'calle', 'direccion', 'dirección']) || '').trim();
    const isSupplier = toNum(pick(r, ['supplier_rank', 'proveedor']), 0) > 0;
    const isCustomer = toNum(pick(r, ['customer_rank', 'cliente']), 0) > 0;
    let tipo = 'client';
    if (isSupplier && !isCustomer) tipo = 'provider';
    const logo_url = matchLogo(empresa || nombre, nombre, logoMap) || '';
    out.push({
      nombre: nombre.toUpperCase(),
      empresa: empresa || null,
      puesto: String(pick(r, ['function', 'puesto', 'title']) || '').trim() || null,
      telefono: telefono || '',
      email: email || '',
      direccion: street || '',
      rfc: rfc || '',
      sitio_web: String(pick(r, ['website', 'sitio']) || '').trim() || null,
      tipo,
      logo_url: logo_url || null,
      color: '#00a09d',
    });
  }
  writeCsv(
    'contactos_normalizados.csv',
    out.map((o) => ({
      nombre: o.nombre,
      empresa: o.empresa || '',
      tipo: o.tipo,
      email: o.email,
      telefono: o.telefono,
      rfc: o.rfc,
      direccion: o.direccion,
      logo_url: o.logo_url || '',
    })),
    ['nombre', 'empresa', 'tipo', 'email', 'telefono', 'rfc', 'direccion', 'logo_url']
  );
  const supabase = getSupabase(apply);
  if (!apply) {
    console.log('--dry-run: revisa out/contactos_normalizados.csv');
    return;
  }
  let ok = 0;
  let err = 0;
  const payload = (o) => ({
    nombre: o.nombre,
    empresa: o.empresa,
    puesto: o.puesto,
    telefono: o.telefono,
    email: o.email,
    direccion: o.direccion,
    rfc: o.rfc,
    sitio_web: o.sitio_web,
    tipo: o.tipo,
    logo_url: o.logo_url,
    color: o.color,
  });
  for (const o of out) {
    const { data: ex } = await supabase.from('contactos').select('id').eq('nombre', o.nombre).maybeSingle();
    const row = payload(o);
    if (ex?.id) {
      const { error } = await supabase.from('contactos').update(row).eq('id', ex.id);
      if (error) {
        console.warn('Update', o.nombre, error.message);
        err++;
      } else ok++;
    } else {
      const { error } = await supabase.from('contactos').insert(row);
      if (error) {
        console.warn('Insert', o.nombre, error.message);
        err++;
      } else ok++;
    }
  }
  console.log('Contactos:', ok, 'ok,', err, 'errores');
}

async function cmdOrders(argv) {
  const apply = argv.includes('--apply');
  const files = findFuente(['reparación', 'reparacion', 'repair.order', 'repair']);
  if (!files.length) {
    console.error('No se encontró Excel en fuente/ con reparación / repair en el nombre');
    process.exit(1);
  }
  const rows = readSheetRows(files[0]);
  const out = [];
  for (const r of rows) {
    const folio = String(pick(r, ['name', 'folio', 'referencia', 'order', 'referencia_de_reparacion', 'referencia_de_reparacin']) || '').trim();
    if (!folio) continue;
    const cliente = String(
      pick(r, ['partner_id', 'cliente', 'customer', 'cliente_nombre', 'partner']) || 'CLIENTE'
    ).trim();
    const equipo = String(pick(r, ['product_id', 'equipo', 'producto', 'product', 'equipment', 'producto_a_reparar']) || 'Equipo').trim();
    const modelo = String(pick(r, ['modelo', 'lot_id', 'lot']) || '').trim();
    const estado = mapEstado(pick(r, ['state', 'estado', 'status']));
    const fecha = toIsoDate(pick(r, ['fecha_ingreso', 'create_date', 'scheduled_date', 'fecha', 'fecha_programada']));
    const tecnico = String(pick(r, ['user_id', 'tecnico', 'encargado', 'technician']) || '').trim();
    // Compat-mode: mandar solo columnas comunes para evitar errores de schema cache
    out.push({
      folio,
      cliente_nombre: cliente,
      fecha_ingreso: fecha,
      equipo,
      modelo: modelo || null,
      tecnico_responsable: tecnico || null,
      estado,
    });
  }
  writeCsv(
    'ordenes_taller_normalizadas.csv',
    out,
    ['folio', 'cliente_nombre', 'fecha_ingreso', 'equipo', 'modelo', 'estado', 'tecnico_responsable']
  );
  const supabase = getSupabase(apply);
  if (!apply) {
    console.log('--dry-run: revisa out/ordenes_taller_normalizadas.csv. Ejecuta ordenes-taller-estados-odoo.sql antes.');
    return;
  }
  let ok = 0;
  for (const o of out) {
    const { error } = await supabase.from('ordenes_taller').upsert(o, { onConflict: 'folio' });
    if (error) console.warn('Orden', o.folio, error.message);
    else ok++;
  }
  console.log('Órdenes upsert:', ok, '/', out.length);
}

/** Filas del formato "inventario electronica ssepi*.xlsx" (hoja con encabezado CÓDIGO MARKING). */
function readInventarioElectronicaRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const c0 = String(matrix[i][0] || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (c0.includes('marking') || c0.includes('codigo') && c0.includes('mark')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const hdr = matrix[headerIdx];
  const out = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const o = {};
    hdr.forEach((h, j) => {
      const k = normHeader(h);
      if (k) o[k] = row[j];
    });
    out.push(normalizeRowKeys(o));
  }
  return out;
}

function guessCategoria(row, sourceHint) {
  const h = (sourceHint || '').toLowerCase();
  if (h.includes('automat')) return 'almacenable';
  if (h.includes('electron')) return 'refaccion';
  if (h.includes('herramient')) return 'almacenable';
  const cat = String(pick(row, ['categoria', 'category', 'tipo']) || '').toLowerCase();
  if (cat.includes('consum')) return 'consumible';
  if (cat.includes('serv')) return 'servicio';
  if (cat.includes('almac')) return 'almacenable';
  return 'refaccion';
}

async function cmdInventario(argv) {
  const apply = argv.includes('--apply');
  const merged = new Map();

  const isTablaCostos = (fp) => fp.toLowerCase().includes('tabla_costos_inventario') || fp.toLowerCase().includes('costos');

  const ingestFile = (fp, hint) => {
    const base = path.basename(fp).toLowerCase();
    let rows =
      base.includes('inventario electronica') || base.includes('inventario electr')
        ? readInventarioElectronicaRows(fp)
        : readSheetRows(fp);
    // Si el archivo es plantilla y no trae headers útiles, intentar detectar fila de encabezados.
    // Criterio: buscar una fila que contenga algo que parezca "SKU" / "CÓDIGO" / "MARKING".
    if (rows.length && Object.keys(rows[0]).every(k => k.startsWith('__empty') || k.length < 3)) {
      // nada, se queda igual
    }
    for (const r of rows) {
      const sku = String(pick(r, [
        'sku', 'codigo', 'código', 'default_code', 'referencia', 'clave',
        'codigo_marking', 'cdigo_marking', 'numero_de_parte', 'nmero_de_parte',
      ]) || '').trim();
      if (!sku) continue;
      const nombre = String(
        pick(r, [
          'nombre',
          'name',
          'descripcion',
          'descripcion_del_producto',
          'product',
          'producto',
        ]) || sku
      ).trim();
      const stock = toNum(pick(r, ['stock', 'cantidad', 'qty', 'existencia', 'on_hand', 'existencia'],), 0);
      const costo = toNum(pick(r, ['costo', 'standard_price', 'cost', 'precio_costo', 'costo_unitario_mxn', 'cost_unit']), 0);
      const precio = toNum(pick(r, ['precio_venta', 'list_price', 'precio', 'price']), 0);
      const ubicacion = String(pick(r, ['ubicacion', 'ubicación', 'location', 'ubicacion'],) || '').trim();
      const categoria = guessCategoria(r, hint + path.basename(fp));
      const prev = merged.get(sku) || { sku, nombre, categoria, stock: 0, costo: 0, precio_venta: 0, ubicacion: '' };
      prev.nombre = nombre || prev.nombre;
      prev.stock = Math.max(prev.stock, stock);
      if (costo > 0) prev.costo = costo;
      if (precio > 0) prev.precio_venta = precio;
      if (ubicacion) prev.ubicacion = ubicacion;
      merged.set(sku, prev);
    }
  };

  if (!fs.existsSync(FUENTE)) {
    console.error('No existe', FUENTE);
    process.exit(1);
  }
  for (const f of fs.readdirSync(FUENTE)) {
    if (f.startsWith('.')) continue;
    const low = f.toLowerCase();
    if (!low.match(/\.(xlsx|xls|csv)$/)) continue;
    if (low.includes('contacto') || low.includes('repar') || low.includes('bom')) continue;
    if (low.includes('formula')) continue;
    ingestFile(path.join(FUENTE, f), f);
  }

  const out = [...merged.values()];
  writeCsv(
    'inventario_normalizado.csv',
    out.map((o) => ({
      sku: o.sku,
      nombre: o.nombre,
      categoria: o.categoria,
      stock: o.stock,
      costo: o.costo,
      precio_venta: o.precio_venta,
      ubicacion: o.ubicacion,
    })),
    ['sku', 'nombre', 'categoria', 'stock', 'costo', 'precio_venta', 'ubicacion']
  );
  const supabase = getSupabase(apply);
  if (!apply) {
    console.log('--dry-run: inventario fusionado en out/inventario_normalizado.csv');
    return;
  }
  let ok = 0;
  for (const o of out) {
    const { error } = await supabase.from('inventario').upsert(
      {
        sku: o.sku,
        nombre: o.nombre,
        categoria: o.categoria,
        stock: Math.round(o.stock),
        minimo: 0,
        costo: o.costo,
        precio_venta: o.precio_venta || o.costo,
        ubicacion: o.ubicacion || null,
        descripcion: null,
      },
      { onConflict: 'sku' }
    );
    if (error) console.warn('SKU', o.sku, error.message);
    else ok++;
  }
  console.log('Inventario upsert:', ok, '/', out.length);
}

function findFormulasWorkbook() {
  if (!fs.existsSync(FUENTE)) return null;
  const files = fs.readdirSync(FUENTE);
  const hit = files.find((f) => {
    if (f.startsWith('.')) return false;
    const low = f.toLowerCase();
    return low.endsWith('.xlsx') && low.includes('formula');
  });
  return hit ? path.join(FUENTE, hit) : null;
}

function sheetToMatrix(wb, sheetName) {
  const sh = wb.Sheets[sheetName];
  if (!sh) return [];
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
}

function pctFromLabel(label) {
  const m = String(label || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

async function upsertCalculadoraByNombre(supabase, { nombre, tipo, funciones }) {
  const q = await supabase.from('calculadoras').select('id').eq('nombre', nombre).maybeSingle();
  if (q.error) throw q.error;
  if (q.data?.id) {
    const u = await supabase
      .from('calculadoras')
      .update({
        tipo: tipo || null,
        funciones: funciones || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', q.data.id);
    if (u.error) throw u.error;
    return q.data.id;
  }
  const ins = await supabase
    .from('calculadoras')
    .insert({
      nombre,
      tipo: tipo || null,
      funciones: funciones || null,
      config_json: {},
      activo: true,
    })
    .select('id')
    .single();
  if (ins.error) throw ins.error;
  return ins.data.id;
}

async function replaceCostosForCalculadora(supabase, calculadoraId, rows) {
  const del = await supabase.from('calculadora_costos').delete().eq('calculadora_id', calculadoraId);
  if (del.error) throw del.error;
  if (!rows.length) return;
  const batch = rows.map((r) => ({
    calculadora_id: calculadoraId,
    concepto: r.concepto,
    costo: r.costo,
    moneda: r.moneda || 'MXN',
  }));
  const ins = await supabase.from('calculadora_costos').insert(batch);
  if (ins.error) throw ins.error;
}

async function cmdFormulas(argv) {
  const apply = argv.includes('--apply');
  const fp = findFormulasWorkbook();
  if (!fp) {
    console.error('No se encontró xlsx en fuente/ con "formula" en el nombre (ej. FORMULAS DE COTIZACIÓN.xlsx)');
    process.exit(1);
  }
  const wb = XLSX.readFile(fp, { cellDates: true });
  const hoja1 = sheetToMatrix(wb, 'Hoja1');
  const lab = sheetToMatrix(wb, 'LABORATORIO');
  const autoName = wb.SheetNames.find((n) => n.toUpperCase().includes('AUTOMATIZ'));
  const auto = autoName ? sheetToMatrix(wb, autoName) : [];

  const labCostos = [];
  const autoCostos = [];

  // --- Hoja1 → Laboratorio (motor CostosEngine) ---
  if (hoja1.length >= 2) {
    const hdr = hoja1[0].map((c) => String(c || '').trim());
    const row = hoja1[1];
    const idx = (pred) => hdr.findIndex((h, i) => pred(String(h).toLowerCase(), i));
    const iKm = idx((h) => h.includes('km'));
    const iLit = idx((h) => h.includes('litros'));
    const iGasL = idx((h) => h.includes('gasolina') && !h.includes('gasolina2'));
    const iHrDani = idx((h) => h.includes('hr dani') || h.includes('dani'));
    const km = iKm >= 0 ? toNum(row[iKm], 0) : 0;
    const litros = iLit >= 0 ? toNum(row[iLit], 0) : 0;
    const gasolina = iGasL >= 0 ? toNum(row[iGasL], 24.5) : 24.5;
    const costoTecnico = iHrDani >= 0 ? toNum(row[iHrDani], 104.16) : 104.16;
    const rendimiento = km > 0 && litros > 0 ? km / litros : 9.5;

    labCostos.push(
      { concepto: 'gasolina', costo: gasolina },
      { concepto: 'rendimiento', costo: rendimiento },
      { concepto: 'costoTecnico', costo: costoTecnico }
    );
  }

  // --- LABORATORIO hoja: gastos fijos / camioneta / % ---
  if (lab.length >= 2) {
    const meta = lab[0];
    const headers = lab[1].map((c) => String(c || '').trim());
    const iGf = headers.findIndex((h) => h.toUpperCase().includes('GASTOS FIJOS'));
    const iCam = headers.findIndex((h) => h.toUpperCase().includes('CAMIONETA'));
    if (iGf >= 0 && meta[iGf] !== '' && meta[iGf] != null)
      labCostos.push({ concepto: 'gastosFijosHora', costo: toNum(meta[iGf], 0) });
    if (iCam >= 0 && meta[iCam] !== '' && meta[iCam] != null)
      labCostos.push({ concepto: 'camionetaHora', costo: toNum(meta[iCam], 0) });
    const utilH = headers.find((h) => String(h).toUpperCase().includes('UTLIDAD'));
    const credH = headers.find((h) => String(h).toUpperCase().includes('CREDITO'));
    const u = utilH != null ? pctFromLabel(utilH) : null;
    const c = credH != null ? pctFromLabel(credH) : null;
    if (u != null) labCostos.push({ concepto: 'utilidad', costo: u });
    if (c != null) labCostos.push({ concepto: 'credito', costo: c });
  }
  labCostos.push({ concepto: 'iva', costo: 16 });

  // --- AUTOMATIZACIÓN: fila 0 = valores / tarifas; fila 1 = encabezados (plantilla Excel) ---
  if (auto.length >= 2) {
    const r0 = auto[0];
    const r1 = auto[1];
    const maxCol = Math.max(r0.length, r1.length);
    for (let j = 1; j < maxCol; j++) {
      const head = String(r1[j] || '').trim();
      if (!head || /^empresa$/i.test(head)) continue;
      const val = r0[j];
      const n = typeof val === 'number' ? val : toNum(val, NaN);
      const pct = pctFromLabel(head);

      if (/^total$/i.test(head) || /^total\s*$/i.test(head)) continue;
      if (/^materiales$/i.test(head) || /^vi[aá]ticos$/i.test(head)) continue;
      if (/total\s*venta/i.test(head)) continue;

      if (j >= 1 && j <= 8 && Number.isFinite(n) && n > 0) {
        autoCostos.push({ concepto: `Tarifa: ${head}`, costo: n });
        continue;
      }
      if (/tiempo planta/i.test(head) && Number.isFinite(n) && n > 0) {
        autoCostos.push({ concepto: 'auto:tarifaTiempoPlanta', costo: n });
        continue;
      }
      if (/hr camioneta/i.test(head) && Number.isFinite(n)) {
        autoCostos.push({ concepto: 'auto:camionetaHora', costo: n });
        continue;
      }
      if (/^gasolina/i.test(head) && Number.isFinite(n)) {
        autoCostos.push({ concepto: 'auto:paramGasolina', costo: n });
        continue;
      }
      if (/gastos generales/i.test(head) && Number.isFinite(n) && n > 0) {
        autoCostos.push({ concepto: 'auto:horaGastoGeneral', costo: n });
        continue;
      }
      if (/total\s*30\s*%/i.test(head) && pct != null) {
        autoCostos.push({ concepto: 'auto:markupMaterialesPct', costo: pct });
        continue;
      }
      if (/cr[eé]dito/i.test(head) && pct != null) {
        autoCostos.push({ concepto: 'auto:creditoPct', costo: pct });
        continue;
      }
      if (/descuento/i.test(head) && pct != null) {
        autoCostos.push({ concepto: 'auto:descuentoPct', costo: pct });
        continue;
      }
    }
  }

  const plan = {
    archivo: path.basename(fp),
    laboratorio: {
      nombre: 'Laboratorio (electrónica)',
      tipo: 'electronica',
      funciones: 'Cotización tipo taller: km, traslado, mano de obra, gastos fijos, refacciones, camioneta (CostosEngine). Constantes en calculadora_costos.',
      costos: labCostos,
    },
    automatizacion: {
      nombre: 'Automatización',
      tipo: 'automatizacion',
      funciones:
        'Cotización por líneas de servicio (tarifas $/h del Excel) + materiales, viáticos, camioneta, investigación, crédito y descuento. Valores en calculadora_costos.',
      costos: autoCostos,
    },
  };

  writeCsv(
    'formulas_laboratorio_costos.csv',
    labCostos.map((c) => ({ concepto: c.concepto, costo: c.costo })),
    ['concepto', 'costo']
  );
  writeCsv(
    'formulas_automatizacion_costos.csv',
    autoCostos.map((c) => ({ concepto: c.concepto, costo: c.costo })),
    ['concepto', 'costo']
  );
  console.log('Archivo:', plan.archivo);
  console.log('Laboratorio costos:', labCostos.length, '| Automatización costos:', autoCostos.length);

  if (!apply) {
    console.log('--dry-run: revisa scripts/imports/out/formulas_*.csv ; ejecuta con --apply para subir a Supabase.');
    return;
  }

  const supabase = getSupabase(true);
  const idLab = await upsertCalculadoraByNombre(supabase, plan.laboratorio);
  const idAuto = await upsertCalculadoraByNombre(supabase, plan.automatizacion);
  await replaceCostosForCalculadora(supabase, idLab, plan.laboratorio.costos);
  await replaceCostosForCalculadora(supabase, idAuto, plan.automatizacion.costos);
  console.log('OK: calculadoras actualizadas (ids laboratorio / auto) y costos reemplazados por calculadora.');
}

async function cmdBom(argv) {
  const apply = argv.includes('--apply');
  const files = findFuente(['bom', 'bom_ssepi', 'lista', 'materiales']);
  if (!files.length) {
    console.error('No se encontró CSV/xlsx en fuente/ con "bom" en el nombre');
    process.exit(1);
  }
  const rows = readSheetRows(files[0]);
  const out = [];
  for (const r of rows) {
    const parent = String(pick(r, ['parent_sku', 'producto_padre', 'padre', 'product_id', 'sku_padre']) || '').trim();
    const child = String(pick(r, ['child_sku', 'componente', 'hijo', 'sku_hijo', 'product']) || '').trim();
    if (!parent || !child) continue;
    const cantidad = toNum(pick(r, ['cantidad', 'qty', 'quantity']), 1);
    out.push({ parent_sku: parent, child_sku: child, cantidad });
  }
  writeCsv('bom_lineas.csv', out, ['parent_sku', 'child_sku', 'cantidad']);
  const supabase = getSupabase(apply);
  if (!apply) {
    console.log('--dry-run: ejecuta bom-lineas.sql en Supabase antes de --apply');
    return;
  }
  for (const line of out) {
    const { error } = await supabase.from('bom_lineas').upsert(line, {
      onConflict: 'parent_sku,child_sku',
    });
    if (error) console.warn('BOM', line.parent_sku, line.child_sku, error.message);
  }
  console.log('BOM líneas procesadas:', out.length);
}

// ---------- main ----------
const [, , cmd, ...argv] = process.argv;
const cmds = {
  inspect: cmdInspect,
  contacts: cmdContacts,
  orders: cmdOrders,
  inventario: cmdInventario,
  bom: cmdBom,
  formulas: cmdFormulas,
};

if (!cmd || !cmds[cmd]) {
  console.log(`Uso: node import.mjs <inspect|contacts|orders|inventario|bom|formulas> [--dry-run|--apply]
  inspect     — muestra columnas de archivos en fuente/
  contacts    — res.partner / contactos (logo desde /clintes)
  orders      — repair.order → ordenes_taller (requiere migración estados Odoo)
  inventario  — fusiona todos los xlsx/csv de fuente/ excepto contactos/reparaciones
  bom         — BOM_*.csv → bom_lineas
  formulas    — FORMULAS*COTIZACION*.xlsx → calculadoras + calculadora_costos`);
  process.exit(cmd ? 1 : 0);
}

await cmds[cmd](argv);
