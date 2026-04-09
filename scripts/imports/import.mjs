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
    const nombre = String(pick(r, ['name', 'nombre', 'display_name', 'contacto']) || 'SIN NOMBRE').trim();
    const empresa = String(pick(r, ['empresa', 'company', 'parent_id', 'razon_social', 'razón social']) || '').trim();
    const email = String(pick(r, ['email', 'correo', 'e-mail']) || '').trim();
    const telefono = String(pick(r, ['phone', 'telefono', 'teléfono', 'mobile', 'movil']) || '').trim();
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
    const folio = String(pick(r, ['name', 'folio', 'referencia', 'order']) || '').trim();
    if (!folio) continue;
    const cliente = String(
      pick(r, ['partner_id', 'cliente', 'customer', 'cliente_nombre', 'partner']) || 'CLIENTE'
    ).trim();
    const equipo = String(pick(r, ['product_id', 'equipo', 'producto', 'product', 'equipment']) || 'Equipo').trim();
    const modelo = String(pick(r, ['modelo', 'lot_id', 'lot']) || '').trim();
    const estado = mapEstado(pick(r, ['state', 'estado', 'status']));
    const fecha = toIsoDate(pick(r, ['fecha_ingreso', 'create_date', 'scheduled_date', 'fecha']));
    const tecnico = String(pick(r, ['user_id', 'tecnico', 'encargado', 'technician']) || '').trim();
    out.push({
      folio,
      cliente_nombre: cliente,
      referencia: String(pick(r, ['client_order_ref', 'referencia_cliente']) || '').trim() || null,
      fecha_ingreso: fecha,
      equipo,
      marca: null,
      modelo: modelo || null,
      serie: null,
      falla_reportada: String(pick(r, ['problem', 'falla']) || '').trim() || null,
      encargado_recepcion: null,
      bajo_garantia: false,
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

  const ingestFile = (fp, hint) => {
    const rows = readSheetRows(fp);
    for (const r of rows) {
      const sku = String(pick(r, ['sku', 'codigo', 'código', 'default_code', 'referencia', 'clave']) || '').trim();
      if (!sku) continue;
      const nombre = String(pick(r, ['nombre', 'name', 'descripcion', 'product', 'producto']) || sku).trim();
      const stock = toNum(pick(r, ['stock', 'cantidad', 'qty', 'existencia', 'on_hand']), 0);
      const costo = toNum(pick(r, ['costo', 'standard_price', 'cost', 'precio_costo']), 0);
      const precio = toNum(pick(r, ['precio_venta', 'list_price', 'precio', 'price']), 0);
      const ubicacion = String(pick(r, ['ubicacion', 'ubicación', 'location']) || '').trim();
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

async function cmdBom(argv) {
  const apply = argv.includes('--apply');
  const files = findFuente(['bom']);
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
};

if (!cmd || !cmds[cmd]) {
  console.log(`Uso: node import.mjs <inspect|contacts|orders|inventario|bom> [--dry-run|--apply]
  inspect     — muestra columnas de archivos en fuente/
  contacts    — res.partner / contactos (logo desde /clintes)
  orders      — repair.order → ordenes_taller (requiere migración estados Odoo)
  inventario  — fusiona todos los xlsx/csv de fuente/ excepto contactos/reparaciones
  bom         — BOM_*.csv → bom_lineas`);
  process.exit(cmd ? 1 : 0);
}

await cmds[cmd](argv);
