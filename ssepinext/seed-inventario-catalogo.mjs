import { getDb, persistDb, prepareStatement, setDeferPersist } from './db.mjs';

const db = await getDb();

// Tarifas alineadas con seed-calculadoras.mjs (Laboratorio SP-E, Motores SP-M, Automatización SP-A)
const SERVICIOS = [
  { sku: 'SERV-LAB-TEC', nombre: 'Mano de obra técnico laboratorio', descripcion: 'Técnico electrónica — tarifa interna $/hr', categoria: 'servicio', departamento: 'taller', costo: 80, precio_venta: 112, unidad: 'hr' },
  { sku: 'SERV-LAB-GF', nombre: 'Gastos fijos laboratorio', descripcion: 'Overhead taller — tarifa interna $/hr', categoria: 'servicio', departamento: 'taller', costo: 161.85, precio_venta: 226.59, unidad: 'hr' },
  { sku: 'SERV-LAB-CAM', nombre: 'Camioneta / traslado laboratorio', descripcion: 'Costo camioneta — tarifa interna $/hr', categoria: 'servicio', departamento: 'taller', costo: 52.67, precio_venta: 73.74, unidad: 'hr' },
  { sku: 'SERV-MOT-TEC', nombre: 'Mano de obra técnico motores', descripcion: 'Técnico motores — tarifa interna $/hr', categoria: 'servicio', departamento: 'motores', costo: 90, precio_venta: 126, unidad: 'hr' },
  { sku: 'SERV-MOT-GF', nombre: 'Gastos fijos motores', descripcion: 'Overhead motores — tarifa interna $/hr', categoria: 'servicio', departamento: 'motores', costo: 161.85, precio_venta: 226.59, unidad: 'hr' },
  { sku: 'SERV-MOT-CAM', nombre: 'Camioneta / traslado motores', descripcion: 'Costo camioneta motores — tarifa interna $/hr', categoria: 'servicio', departamento: 'motores', costo: 52.67, precio_venta: 73.74, unidad: 'hr' },
  { sku: 'SERV-MOT-BANCO', nombre: 'Pruebas en banco de motores', descripcion: 'Banco de pruebas — tarifa interna $/hr', categoria: 'servicio', departamento: 'motores', costo: 250, precio_venta: 350, unidad: 'hr' },
  { sku: 'SERV-AUTO-ING', nombre: 'Ingeniería automatización', descripcion: 'Ingeniería SP-A — tarifa interna $/hr', categoria: 'servicio', departamento: 'automatizacion', costo: 120, precio_venta: 168, unidad: 'hr' },
  { sku: 'SERV-AUTO-PLC', nombre: 'Programación PLC', descripcion: 'Programación y puesta en marcha de PLC', categoria: 'servicio', departamento: 'automatizacion', costo: 120, precio_venta: 168, unidad: 'hr' },
  { sku: 'SERV-AUTO-TAB', nombre: 'Diseño de tablero', descripcion: 'Diseño eléctrico y mecánico de tableros', categoria: 'servicio', departamento: 'automatizacion', costo: 150, precio_venta: 210, unidad: 'hr' },
  { sku: 'SERV-AUTO-INST', nombre: 'Instalación en campo', descripcion: 'Instalación y commissioning en planta', categoria: 'servicio', departamento: 'automatizacion', costo: 180, precio_venta: 252, unidad: 'hr' },
  { sku: 'SERV-AUTO-CAP', nombre: 'Capacitación operadores', descripcion: 'Capacitación grupal de operadores', categoria: 'servicio', departamento: 'automatizacion', costo: 2500, precio_venta: 3500, unidad: 'sesión' },
  { sku: 'SERV-LAB-DIAG', nombre: 'Diagnóstico electrónico', descripcion: 'Diagnóstico inicial tarjeta / equipo', categoria: 'servicio', departamento: 'taller', costo: 350, precio_venta: 490, unidad: 'servicio' },
  { sku: 'SERV-LAB-REP', nombre: 'Reparación tarjeta electrónica', descripcion: 'Reparación estándar (sin refacciones)', categoria: 'servicio', departamento: 'taller', costo: 650, precio_venta: 910, unidad: 'servicio' },
  { sku: 'SERV-MOT-REP', nombre: 'Reparación motor industrial', descripcion: 'Reparación motor (sin refacciones)', categoria: 'servicio', departamento: 'motores', costo: 1200, precio_venta: 1680, unidad: 'servicio' },
  { sku: 'SERV-PLANTA', nombre: 'Soporte en planta', descripcion: 'Soporte técnico en sitio del cliente', categoria: 'servicio', departamento: 'taller', costo: 294.52, precio_venta: 412.33, unidad: 'hr' },
];

const ALMACENABLES = [
  { sku: 'ALM-MOT-SIE-5HP', nombre: 'Motor Siemens 5HP reacondicionado', descripcion: 'Motor trifásico 5HP reparado y probado', categoria: 'almacenable', subcategoria: 'motor', ubicacion: 'Rack 3', stock: 1, minimo: 0, costo: 12500, precio_venta: 18500 },
  { sku: 'ALM-VAR-ABB-3HP', nombre: 'Variador ABB ACS550 3HP', descripcion: 'Variador reacondicionado con garantía', categoria: 'almacenable', subcategoria: 'variador', ubicacion: 'Rack 3', stock: 1, minimo: 0, costo: 8200, precio_venta: 11800 },
  { sku: 'ALM-TAB-NEMA12', nombre: 'Tablero control NEMA 12', descripcion: 'Tablero armado listo para instalación', categoria: 'almacenable', subcategoria: 'material_electrico', ubicacion: 'Bodega A', stock: 2, minimo: 1, costo: 4500, precio_venta: 6300 },
  { sku: 'ALM-CBL-4X14', nombre: 'Cable multiconductor 4x14 AWG', descripcion: 'Rollo 100m cable control', categoria: 'almacenable', subcategoria: 'material_electrico', ubicacion: 'Estante C2', stock: 3, minimo: 1, costo: 2800, precio_venta: 3920 },
  { sku: 'ALM-TERM-KIT', nombre: 'Kit terminales y borneras', descripcion: 'Terminales, borneras y accesorios ferretería', categoria: 'almacenable', subcategoria: 'material_electrico', ubicacion: 'Estante C3', stock: 5, minimo: 2, costo: 450, precio_venta: 630 },
  { sku: 'ALM-PLC-S71200', nombre: 'PLC Siemens S7-1200 usado', descripcion: 'CPU 1214C probada en banco', categoria: 'almacenable', subcategoria: 'plc', ubicacion: 'Rack 2', stock: 1, minimo: 0, costo: 6800, precio_venta: 9520 },
  { sku: 'ALM-HMI-KTP700', nombre: 'HMI KTP700 Basic', descripcion: 'Pantalla táctil 7" reacondicionada', categoria: 'almacenable', subcategoria: 'hmi', ubicacion: 'Rack 2', stock: 1, minimo: 0, costo: 6200, precio_venta: 8680 },
  { sku: 'ALM-CANAL-40X40', nombre: 'Canaleta 40x40mm', descripcion: 'Canaleta PVC 2m para cableado', categoria: 'almacenable', subcategoria: 'material_electrico', ubicacion: 'Bodega B', stock: 8, minimo: 3, costo: 185, precio_venta: 259 },
  { sku: 'ALM-RIEL-DIN', nombre: 'Riel DIN 35mm', descripcion: 'Riel perforado 1m', categoria: 'almacenable', subcategoria: 'material_electrico', ubicacion: 'Bodega B', stock: 12, minimo: 4, costo: 95, precio_venta: 133 },
  { sku: 'ALM-ESCA-6P', nombre: 'Escalera cable tray 6"', descripcion: 'Charola tipo escalera 3m', categoria: 'almacenable', subcategoria: 'material_mecanico', ubicacion: 'Patio', stock: 2, minimo: 1, costo: 1200, precio_venta: 1680 },
];

async function upsertCatalogo(items, tipoInventario) {
  const stmtInv = await prepareStatement(db, 'local_inventario');
  let insertados = 0;
  let actualizados = 0;

  for (const item of items) {
    const exists = await stmtInv.query("json_extract(data, '$.sku') = ?", [item.sku], 'id ASC', 1);
    const stock = item.stock != null ? item.stock : 999;
    const minimo = item.minimo != null ? item.minimo : 0;
    const costo = item.costo || 0;
    const pv = item.precio_venta || (costo > 0 ? Math.round(costo * 1.4 * 100) / 100 : 0);
    const payload = {
      sku: item.sku,
      nombre: item.nombre,
      descripcion: item.descripcion || item.nombre,
      categoria: item.categoria,
      ubicacion: item.ubicacion || (tipoInventario === 'servicio' ? 'Servicios' : 'Bodega'),
      stock,
      minimo,
      costo,
      precio_venta: pv,
      activo: true,
      departamento: item.departamento || 'taller',
      tipo_inventario: tipoInventario,
      unidad: item.unidad || (tipoInventario === 'servicio' ? 'hr' : 'pza'),
      subcategoria: item.subcategoria || '',
      total_linea: costo * (tipoInventario === 'servicio' ? 1 : stock),
      fecha_entrada: '2026-06-01',
      lote: `CAT-${tipoInventario.toUpperCase()}-2026`,
    };

    try {
      if (exists.length > 0) {
        await stmtInv.update(exists[0].id, { ...exists[0], ...payload });
        actualizados++;
      } else {
        await stmtInv.insert(null, payload);
        insertados++;
      }
    } catch (e) {
      console.warn(`[Catalogo] Error ${item.sku}: ${e.message}`);
    }
  }
  return { insertados, actualizados };
}

async function seedCatalogo() {
  setDeferPersist(true);
  const serv = await upsertCatalogo(SERVICIOS, 'servicio');
  const alm = await upsertCatalogo(ALMACENABLES, 'almacenable');
  setDeferPersist(false);
  persistDb();

  console.log('\n=========================================');
  console.log('  INVENTARIO CATÁLOGO — SERVICIOS + ALMACENABLES');
  console.log('=========================================');
  console.log(`  Servicios:    ${serv.insertados} nuevos, ${serv.actualizados} actualizados (${SERVICIOS.length} total)`);
  console.log(`  Almacenables: ${alm.insertados} nuevos, ${alm.actualizados} actualizados (${ALMACENABLES.length} total)`);
  console.log('=========================================');
}

seedCatalogo().catch(err => {
  console.error('[Catalogo] Error:', err);
  process.exit(1);
});
