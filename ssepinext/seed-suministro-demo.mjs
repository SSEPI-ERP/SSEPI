import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedSuministro() {
  const cotStmt = await prepareStatement(db, 'local_cotizaciones');

  const componentes = [
    { source: 'BOM', codigo: '6ES7215-1AG40-0XB0', descripcion: 'SIMATIC S7-1200 CPU 1215C DC/DC/DC', categoria: "PLC's", cantidad: 2, precio_unitario: 16440.24, subtotal: 32880.48 },
    { source: 'BOM', codigo: '6GK5008-0BA10-1AB2', descripcion: 'SCALANCE XB008 Industrial Ethernet', categoria: 'Comunicación', cantidad: 1, precio_unitario: 2835.00, subtotal: 2835.00 },
    { source: 'BOM', codigo: '3RK1105-1BG00-0AA0', descripcion: 'Módulo de seguridad Sirius 3RK1', categoria: 'Seguridad Industrial', cantidad: 1, precio_unitario: 6930.00, subtotal: 6930.00 },
    { source: 'STOCK', codigo: 'LM393', descripcion: 'COMPARADOR DUAL', categoria: 'IC Análogos', cantidad: 5, precio_unitario: 14.20, subtotal: 71.00 },
    { source: 'CONSUMIBLE', codigo: 'SOLD-6040-250', descripcion: 'Soldadura de Estaño 60/40 - Carrete 250g', categoria: 'Soldadura', cantidad: 2, precio_unitario: 350, subtotal: 700 }
  ];

  // calcularSuministros(dias=2, km=50, proveedor=43416.48, utilidadFactor=1.4)
  const proveedor = 43416.48;
  const gasolina = ((50 * 2) / 10) * 30;   // 300
  const ventas = 2 * 87;                     // 174
  const totalGasVentas = 300 + 174;          // 474
  const camioneta = 2 * 52.67;               // 105.34
  const gastosSU = 474 + proveedor + 105.34; // 43995.82
  const utilidad = gastosSU * 1.4;            // 61594.15
  const credito = utilidad * 1.03;            // 63441.97
  const iva = credito * 0.16;                 // 10150.72
  const total = credito + iva;                // 73592.69

  const now = new Date().toISOString();

  const cotizacionData = {
    folio: 'SP-S2605001',
    cliente_nombre: 'BODYCOTE MÉXICO',
    cliente_id: 'bodycote',
    estado: 'cotizacion',
    origen: 'suministro',
    departamento: 'Suministro',
    subtotal: proveedor,
    iva: iva,
    total: total,
    cerebro_registro: { dias: 2, km: 50, proveedor, utilidadPct: 40, resultado: { gasolina, ventas, totalGasVentas, camioneta, gastosSU, utilidad, credito } },
    componentes,
    observaciones: 'Cotización demo de suministro - 5 artículos',
    created_at: now
  };

  try {
    await cotStmt.insert(null, cotizacionData);
    console.log('[Suministros Demo] Cotización SP-S2605001 creada');
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      console.log('[Suministros Demo] Cotización SP-S2605001 ya existe, omitiendo');
    } else {
      console.warn('[Suministros Demo] Error:', e.message);
    }
  }

  persistDb();

  console.log('\n=========================================');
  console.log('  SUMINISTROS DEMO');
  console.log('=========================================');
  console.log(`  Cotización: SP-S2605001`);
  console.log(`  Cliente: BODYCOTE MÉXICO`);
  console.log(`  Artículos: ${componentes.length}`);
  console.log(`  Total componentes: $${proveedor.toLocaleString('es-MX', {minimumFractionDigits: 2})}`);
  console.log(`  Total con IVA: $${total.toLocaleString('es-MX', {minimumFractionDigits: 2})}`);
  console.log('=========================================');
}

seedSuministro().catch(err => {
  console.error('[Suministros Demo] Error:', err);
  process.exit(1);
});