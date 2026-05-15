import { getDb, persistDb, prepareStatement } from './db.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = await getDb();

// ── Normalización de proveedores ──
const PROVEEDOR_MAP = {
  'EBAY': 'EBAY', 'Ebay': 'EBAY', 'ebay': 'EBAY',
  'ALI EXPRESS': 'ALIEXPRESS', 'ALIEXPRESS': 'ALIEXPRESS', 'Aliexprex': 'ALIEXPRESS', 'Alixpress': 'ALIEXPRESS',
  'AMAZON': 'AMAZON', 'Amazon': 'AMAZON',
  'DIMEINT': 'DIMEINT', 'Dimeint': 'DIMEINT',
  'EURO ELECTRICA': 'EUROELECTRICA', 'EUROELECTRICA': 'EUROELECTRICA', 'Euroelectrica': 'EUROELECTRICA',
  'AK CORPORACION': 'AK CORPORACION', 'AK CORPORATION': 'AK CORPORACION',
  'EGA Industrial': 'EGA INDUSTRIAL', 'Ega Industrial': 'EGA INDUSTRIAL',
  'EL TORNILLO': 'EL TORNILLO', 'El tornillo': 'EL TORNILLO',
  'DOMUM': 'DOMUM', 'DOMUM AUTOMATION': 'DOMUM',
  'ENERGÍA CONTROLADA DE MÉXICO S.A. DE C.V.': 'ENERGIA CONTROLADA',
  'EQUIPOS INDUSTRIALES HAB': 'EQUIPOS INDUSTRIALES HAB', 'HAB': 'EQUIPOS INDUSTRIALES HAB',
  'IkA TECHNOLOGY': 'IKA TECHNOLOGY', 'IKA TECHNOLOGY': 'IKA TECHNOLOGY',
  'Moises Gazca': 'MOISES GAZCA',
  'VOGAR LEÓN GTO': 'VOGAR',
  'WIAUTOMATION': 'WIAUTOMATION',
};

function normalizarProveedor(nombre) {
  if (!nombre) return '';
  const trimmed = nombre.trim();
  return PROVEEDOR_MAP[trimmed] || trimmed.toUpperCase();
}

// ── Parseo de precio MXN: "$16.440,24" → 16440.24 ──
function parsearPrecioMXN(precioStr) {
  if (!precioStr || precioStr === '{' || precioStr === '}') return 0;
  const s = precioStr.replace(/^\$/, '').trim();
  if (!s) return 0;
  // Formato: 16.440,24 → quitar puntos de miles, coma decimal → punto
  const sinMiles = s.replace(/\./g, '');
  const num = sinMiles.replace(',', '.');
  const val = parseFloat(num);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
}

// ── Mapeo de categorías BOM → categorías ERP ──
const CATEGORIA_MAP = {
  "PLC'S": 'plc',
  "HMI'S": 'hmi',
  "SERVODRIVES": 'servodrive',
  "SERVO MOTOR": 'servomotor',
  "SENSORES": 'sensor',
  "ENCODER": 'encoder',
  "COMUNICACIÓN": 'comunicacion',
  "ALIMENTACIÓN": 'alimentacion',
  "PROTECCION ELECTRICA": 'proteccion_electrica',
  "MOTORES": 'motor',
  "VARIADOR": 'variador',
  "MATERIAL ELECTRICO": 'material_electrico',
  "ACCESORIOS": 'accesorio',
  "MATERIALES MECÁNICOS": 'material_mecanico',
  "SEGURIDAD IND": 'seguridad_industrial',
  "FLEJADORAS": 'flejadota',
  "CÁMARA": 'camara',
};

// ── Cargar datos BOM ──
const bomPath = path.resolve(__dirname, '..', 'Boom para inventario', 'bom_data.js');
let BOM_DATA;
try {
  const src = fs.readFileSync(bomPath, 'utf8');
  const fn = new Function(src + '; return BOM_DATA;');
  BOM_DATA = fn();
} catch (e) {
  console.error('[BOM] No se pudo cargar bom_data.js:', e.message);
  console.error('[BOM] Asegúrate de que la carpeta "Boom para inventario" existe con bom_data.js');
  process.exit(1);
}

console.log(`[BOM] Cargados ${BOM_DATA.length} artículos del archivo BOM`);

async function importarBOM() {
  const stmtBom = await prepareStatement(db, 'local_bom_automatizacion');

  // Limpiar tabla BOM
  db.exec('DELETE FROM local_bom_automatizacion');
  console.log('[BOM] Tabla limpiada.');

  let insertados = 0;
  let conProveedores = 0;
  let totalProveedores = 0;
  let valorTotal = 0;
  const proveedoresSet = new Set();

  for (const item of BOM_DATA) {
    // Proveedores normalizados
    const suppliers = (item.suppliers || [])
      .filter(s => s.name && s.name.trim())
      .map(s => {
        const nombre = normalizarProveedor(s.name);
        const precio = parsearPrecioMXN(s.price);
        const link = (s.link || '').trim();
        const entrega = (s.delivery || '').trim();
        proveedoresSet.add(nombre);
        totalProveedores++;
        return { nombre, precio, entrega, link };
      });

    // Mejor precio (más bajo > 0)
    const mejorPrecio = suppliers
      .map(s => s.precio)
      .filter(p => p > 0)
      .sort((a, b) => a - b)[0] || 0;

    if (suppliers.length > 0) conProveedores++;
    if (mejorPrecio > 0) valorTotal += mejorPrecio;

    const categoria = CATEGORIA_MAP[item.category] || 'refaccion';
    const status = (item.status || '').toUpperCase().includes('ACTUALIZADO') ? 'ACTUALIZADO' : 'NO ACTUALIZADO';

    try {
      await stmtBom.insert(null, {
        numero_item: parseInt(item.item) || 0,
        part_number: item.partNumber || '',
        descripcion: item.description || '',
        categoria,
        categoria_original: item.category || '',
        estado_actualizacion: status,
        tiene_imagen: item.hasImage || false,
        proveedores: JSON.stringify(suppliers),
        mejor_precio: mejorPrecio,
        tipo: 'bom_automatizacion'
      });
      insertados++;
    } catch (e) {
      console.warn(`[BOM] Error item ${item.item}: ${e.message}`);
    }
  }

  persistDb();

  // Resumen
  console.log('\n==========================================');
  console.log('  BOM AUTOMATIZACION SSEPI MAYO 2026');
  console.log('==========================================');
  console.log(`  Artículos insertados: ${insertados} / ${BOM_DATA.length}`);
  console.log(`  Con proveedores: ${conProveedores}`);
  console.log(`  Total cotizaciones: ${totalProveedores}`);
  console.log(`  Proveedores únicos: ${proveedoresSet.size}`);
  console.log(`  Valor mejor precio: $${valorTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`);

  // Por categoría
  const cats = {};
  BOM_DATA.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
  console.log('\n  Por categoría:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`    ${k.padEnd(25)} ${v}`);
  });

  // Top 10 proveedores
  const provCount = {};
  BOM_DATA.forEach(i => (i.suppliers || []).forEach(s => {
    if (s.name) {
      const n = normalizarProveedor(s.name);
      provCount[n] = (provCount[n] || 0) + 1;
    }
  }));
  console.log('\n  Top 10 proveedores:');
  Object.entries(provCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => {
    console.log(`    ${k.padEnd(30)} ${v} cotizaciones`);
  });

  console.log('==========================================');
}

importarBOM().catch(err => {
  console.error('[BOM] Error:', err);
  process.exit(1);
});