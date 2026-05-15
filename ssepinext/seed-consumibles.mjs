import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

// Consumibles de taller — 14 items
// Categorías: Soldadura, Limpieza, Químicos, Térmico, Protección
const CONSUMIBLES = [
  // Soldadura (4)
  { codigo:"SOLD-6040-250", descripcion:"Soldadura de Estaño 60/40", categoria:"soldadura", presentacion:"Carrete 250g", costo:350, stock:5, ubicacion:"P1", uso:"Soldadura componentes SMD y thru-hole" },
  { codigo:"FLUX-PASTA-50", descripcion:"Pasta para soldar / Flux", categoria:"soldadura", presentacion:"Bote 50g", costo:85, stock:8, ubicacion:"P1", uso:"Flux en pasta para soldadura manual y rework" },
  { codigo:"FLUX-LIQ-125", descripcion:"Flux Líquido No-Clean", categoria:"soldadura", presentacion:"Frasco 125ml", costo:120, stock:4, ubicacion:"P1", uso:"Flux líquido para SMD, no requiere limpieza" },
  { codigo:"MALLA-DESLD-1.5", descripcion:"Malla Desoldadora", categoria:"soldadura", presentacion:"Rollo 1.5m", costo:65, stock:6, ubicacion:"P1", uso:"Extracción de soldadura para rework" },
  // Limpieza (3)
  { codigo:"ALCOHOL-ISO-1L", descripcion:"Alcohol Isopropílico", categoria:"limpieza", presentacion:"1 Litro", costo:110, stock:3, ubicacion:"P2", uso:"Limpieza de tarjetas y residuos de flux" },
  { codigo:"AIRE-COMP-400", descripcion:"Aire Comprimido", categoria:"limpieza", presentacion:"Lata 400ml", costo:135, stock:4, ubicacion:"P2", uso:"Soplado de polvo en tarjetas y conectores" },
  { codigo:"HISOPOS-100", descripcion:"Hisopos / Cotonetes ESD", categoria:"limpieza", presentacion:"100 pzas", costo:25, stock:10, ubicacion:"P2", uso:"Limpieza precisa de contactos y zonas pequeñas" },
  // Químicos (1)
  { codigo:"LIMPIA-CONTACT-200", descripcion:"Limpiador de Contactos", categoria:"quimico", presentacion:"Lata 200ml", costo:160, stock:3, ubicacion:"P3", uso:"Limpieza y protección de contactos eléctricos" },
  // Térmico (2)
  { codigo:"PASTA-TERM-30G", descripcion:"Pasta Térmica Gris", categoria:"termico", presentacion:"Jeringa 30g", costo:180, stock:4, ubicacion:"P4", uso:"Disipación térmica en IGBTs, MOSFETs y CPUs" },
  { codigo:"TERMOCONTR-100", descripcion:"Tubo Termocontráctil", categoria:"termico", presentacion:"Kit 100 piezas", costo:150, stock:3, ubicacion:"P4", uso:"Aislamiento y protección de conexiones" },
  // Protección (1)
  { codigo:"KAPTON-10MM", descripcion:"Cinta Kapton Térmica", categoria:"proteccion", presentacion:"Rollo 10mm", costo:120, stock:5, ubicacion:"P5", uso:"Enmascaramiento en soldadura wave y reflow" },
  // Consumibles taller adicionales (3) — ya existían en inventario electrónica como PASTA/FLUX/ESPONJA
  { codigo:"CAUTIN-PUNTA", descripcion:"Punta para Cautín", categoria:"soldadura", presentacion:"1 pza", costo:45, stock:6, ubicacion:"P6", uso:"Repuesto de punta para estación de soldadura" },
  { codigo:"SOLD-0.5-100", descripcion:"Soldadura 0.5mm Estaño 63/37", categoria:"soldadura", presentacion:"Carrete 100g", costo:180, stock:4, ubicacion:"P1", uso:"Soldadura fina para trabajo SMD de precisión" },
  { codigo:"ANTIEST-WRAP", descripcion:"Pulsera Antiestática", categoria:"proteccion", presentacion:"1 pza", costo:65, stock:4, ubicacion:"P5", uso:"Protección ESD para manipulación de componentes" }
];

async function importarConsumibles() {
  const stmtInv = await prepareStatement(db, 'local_inventario');
  const stmtMov = await prepareStatement(db, 'local_movimientos_inventario');

  let insertados = 0;
  let valorTotal = 0;

  for (const item of CONSUMIBLES) {
    const totalLinea = item.costo * item.stock;
    const pv = item.costo > 0 ? Math.round(item.costo * 1.5 * 100) / 100 : 0;
    const minimo = Math.max(1, Math.floor(item.stock * 0.3));

    try {
      await stmtInv.insert(null, {
        sku: item.codigo,
        nombre: item.descripcion,
        descripcion: `${item.descripcion} - ${item.presentacion}`,
        categoria: `consumible_${item.categoria}`,
        ubicacion: item.ubicacion,
        stock: item.stock,
        minimo,
        costo: item.costo,
        precio_venta: pv,
        activo: true,
        departamento: 'taller',
        encapsulado: '',
        proveedor: '',
        fecha_entrada: '2026-05-01',
        lote: 'CONSUM-2026-001',
        total_linea: totalLinea,
        link_octopart: '',
        link_digikey: '',
        link_mouser: '',
        costo_online: item.costo,
        costo_local: item.costo,
        tipo_inventario: 'consumible',
        presentacion: item.presentacion,
        uso: item.uso
      });

      valorTotal += totalLinea;
      insertados++;

      if (item.stock > 0) {
        await stmtMov.insert(null, {
          producto_id: item.codigo,
          tipo_movimiento: 'entrada_inicial',
          cantidad: item.stock,
          costo_unitario: item.costo,
          referencia: 'Inventario consumibles Mayo 2026',
          departamento: 'taller',
          created_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`[Consum] Error: ${item.codigo}: ${e.message}`);
    }
  }

  persistDb();

  console.log('\n=========================================');
  console.log('  CONSUMIBLES TALLER SSEPI MAYO 2026');
  console.log('=========================================');
  console.log(`  Items insertados: ${insertados} / ${CONSUMIBLES.length}`);
  console.log(`  Total piezas: ${CONSUMIBLES.reduce((s,i)=>s+i.stock,0)}`);
  console.log(`  Valor total: $${valorTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`);
  console.log('=========================================');

  // Resumen combinado
  const res = db.exec("SELECT JSON_EXTRACT(data,'$.tipo_inventario') as tipo, COUNT(*) as items, SUM(CAST(JSON_EXTRACT(data,'$.stock') AS INT)) as piezas, SUM(CAST(JSON_EXTRACT(data,'$.total_linea') AS REAL)) as valor FROM local_inventario GROUP BY tipo");
  if (res.length && res[0].values.length) {
    console.log('\n  RESUMEN INVENTARIO COMBINADO:');
    console.log('  -----------------------------------------');
    for (const row of res[0].values) {
      console.log(`  ${String(row[0]).padEnd(15)} ${row[1]} items, ${row[2]} pzas, $${Number(row[3]).toLocaleString('es-MX',{minimumFractionDigits:2})}`);
    }
    console.log('  -----------------------------------------');
  }
}

importarConsumibles().catch(err => {
  console.error('[Consum] Error:', err);
  process.exit(1);
});