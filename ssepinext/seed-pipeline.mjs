import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedPipeline() {
  const stmtVentas = await prepareStatement(db, 'local_ventas');
  const stmtCotizaciones = await prepareStatement(db, 'local_cotizaciones');
  const stmtCompras = await prepareStatement(db, 'local_compras');
  const stmtFacturas = await prepareStatement(db, 'local_facturas');
  const stmtHistorial = await prepareStatement(db, 'local_orden_historial');

  const now = new Date().toISOString();
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ==================== PIPELINE TALLER - SP-E2605001 ====================
  // 1. Cotización de Ventas que originó la orden
  const cotTaller1 = {
    folio: 'COT-2605-001',
    cliente_nombre: 'Industrias Monterrey S.A. de C.V.',
    origen: 'taller',
    orden_origen_id: null,  // Se vincularía con el cloud_id en producción
    orden_origen_folio: 'SP-E2605001',
    estado: 'autorizada',
    subtotal: 7500,
    iva: 1200,
    total: 8700,
    notas: 'Cotización por reparación de variador de frecuencia ABB ACS580. Diagnóstico: falla OVERCURRENT en arranque.',
    fecha: '2026-04-18',
    vendedor: 'Norberto Moro',
    departamento: 'Taller Electrónica'
  };
  const cot1 = await stmtCotizaciones.insert(null, cotTaller1);
  console.log(`[Pipeline] Cotización: ${cotTaller1.folio} → SP-E2605001`);

  // 2. Venta registrada
  const ventaTaller1 = {
    folio: 'V-2605-001',
    cliente_nombre: 'Industrias Monterrey S.A. de C.V.',
    estado: 'entregado',
    subtotal: 7500,
    iva: 1200,
    total: 8700,
    origen: 'taller',
    orden_origen_folio: 'SP-E2605001',
    fecha: '2026-04-19',
    vendedor: 'Norberto Moro',
    notas: 'Venta vinculada a orden de taller SP-E2605001. Variador ABB ACS580 reparado y entregado.'
  };
  const v1 = await stmtVentas.insert(null, ventaTaller1);
  console.log(`[Pipeline] Venta: ${ventaTaller1.folio}`);

  // 3. Compra vinculada (refacciones)
  const compraTaller1 = {
    folio: 'CMP-SP-E2605001',
    proveedor_nombre: 'ABB México Distribución',
    estado: 5,  // 5 = recibida completa
    subtotal: 4500,
    iva: 720,
    total: 5220,
    orden_origen_folio: 'SP-E2605001',
    orden_origen_tipo: 'taller',
    notas: 'Refacciones para variador ABB ACS580: Módulo IGBT fase V + Condensadores fuente interna.',
    fecha: '2026-04-21',
    estatus_pago: 'Pagado'
  };
  const c1 = await stmtCompras.insert(null, compraTaller1);
  console.log(`[Pipeline] Compra: ${compraTaller1.folio}`);

  // 4. Factura
  const facturaTaller1 = {
    folio: 'FAC-2605-001',
    cliente: 'Industrias Monterrey S.A. de C.V.',
    total: 8700,
    estatus: 'pagada',
    orden_origen_folio: 'SP-E2605001',
    fecha_emision: '2026-05-02',
    notas: 'Factura por reparación de variador ABB ACS580.'
  };
  const f1 = await stmtFacturas.insert(null, facturaTaller1);
  console.log(`[Pipeline] Factura: ${facturaTaller1.folio}`);

  // ==================== PIPELINE TALLER - SP-E2605002 ====================
  const cotTaller2 = {
    folio: 'COT-2605-002',
    cliente_nombre: 'Cervecería del Norte S.A.',
    origen: 'taller',
    orden_origen_folio: 'SP-E2605002',
    estado: 'autorizada',
    subtotal: 12500,
    iva: 2000,
    total: 14500,
    notas: 'Reparación PLC Allen-Bradley L33ER. Pérdida de comunicación PROFINET intermitente.',
    fecha: '2026-04-23',
    vendedor: 'Norberto Moro',
    departamento: 'Taller Electrónica'
  };
  await stmtCotizaciones.insert(null, cotTaller2);
  console.log(`[Pipeline] Cotización: ${cotTaller2.folio} → SP-E2605002`);

  const ventaTaller2 = {
    folio: 'V-2605-002',
    cliente_nombre: 'Cervecería del Norte S.A.',
    estado: 'entregado',
    subtotal: 12500,
    iva: 2000,
    total: 14500,
    origen: 'taller',
    orden_origen_folio: 'SP-E2605002',
    fecha: '2026-04-24',
    vendedor: 'Norberto Moro',
    notas: 'Venta vinculada a SP-E2605002. PLC reparado y entregado.'
  };
  await stmtVentas.insert(null, ventaTaller2);
  console.log(`[Pipeline] Venta: ${ventaTaller2.folio}`);

  const compraTaller2 = {
    folio: 'CMP-SP-E2605002',
    proveedor_nombre: 'Rockwell Automation México',
    estado: 5,
    subtotal: 8200,
    iva: 1312,
    total: 9512,
    orden_origen_folio: 'SP-E2605002',
    orden_origen_tipo: 'taller',
    notas: 'Módulo comunicación EN2T + cables Cat6 industrial.',
    fecha: '2026-04-26',
    estatus_pago: 'Pagado'
  };
  await stmtCompras.insert(null, compraTaller2);
  console.log(`[Pipeline] Compra: ${compraTaller2.folio}`);

  const facturaTaller2 = {
    folio: 'FAC-2605-002',
    cliente: 'Cervecería del Norte S.A.',
    total: 14500,
    estatus: 'pagada',
    orden_origen_folio: 'SP-E2605002',
    fecha_emision: '2026-05-04',
    notas: 'Factura por reparación PLC Allen-Bradley L33ER.'
  };
  await stmtFacturas.insert(null, facturaTaller2);
  console.log(`[Pipeline] Factura: ${facturaTaller2.folio}`);

  // ==================== PIPELINE AUTOMATIZACIÓN - SP-A2605/1 ====================
  const cotAuto1 = {
    folio: 'COT-2605-A01',
    cliente_nombre: 'Alimentos del Bajío S.A. de C.V.',
    origen: 'automatizacion',
    orden_origen_folio: 'SP-A2605/1',
    estado: 'autorizada',
    subtotal: 202600,
    iva: 32416,
    total: 235016,
    notas: 'Proyecto de automatización línea de ensamble C3. PLC Siemens S7-1500, HMI KTP1200, 12 estaciones PROFINET.',
    fecha: '2026-04-08',
    vendedor: 'Ing. Iván García',
    departamento: 'Automatización'
  };
  await stmtCotizaciones.insert(null, cotAuto1);
  console.log(`[Pipeline] Cotización: ${cotAuto1.folio} → SP-A2605/1`);

  const ventaAuto1 = {
    folio: 'V-2605-A01',
    cliente_nombre: 'Alimentos del Bajío S.A. de C.V.',
    estado: 'entregado',
    subtotal: 202600,
    iva: 32416,
    total: 235016,
    origen: 'automatizacion',
    orden_origen_folio: 'SP-A2605/1',
    fecha: '2026-04-09',
    vendedor: 'Ing. Iván García',
    notas: 'Venta vinculada a proyecto SP-A2605/1. Línea de ensamble C3 completada.'
  };
  await stmtVentas.insert(null, ventaAuto1);
  console.log(`[Pipeline] Venta: ${ventaAuto1.folio}`);

  const compraAuto1 = {
    folio: 'CMP-SP-A2605-1',
    proveedor_nombre: 'Siemens México',
    estado: 5,
    subtotal: 84600,
    iva: 13536,
    total: 98136,
    orden_origen_folio: 'SP-A2605/1',
    orden_origen_tipo: 'automatizacion',
    notas: 'Materiales para proyecto SP-A2605/1: PLC S7-1500, HMI KTP1200, módulos E/S, sensores, cilindros.',
    fecha: '2026-04-12',
    estatus_pago: 'Pagado'
  };
  await stmtCompras.insert(null, compraAuto1);
  console.log(`[Pipeline] Compra: ${compraAuto1.folio}`);

  const facturaAuto1 = {
    folio: 'FAC-2605-A01',
    cliente: 'Alimentos del Bajío S.A. de C.V.',
    total: 235016,
    estatus: 'pagada',
    orden_origen_folio: 'SP-A2605/1',
    fecha_emision: '2026-05-03',
    notas: 'Factura por proyecto de automatización línea C3.'
  };
  await stmtFacturas.insert(null, facturaAuto1);
  console.log(`[Pipeline] Factura: ${facturaAuto1.folio}`);

  // ==================== PIPELINE AUTOMATIZACIÓN - SP-A2605/2 ====================
  const cotAuto2 = {
    folio: 'COT-2605-A02',
    cliente_nombre: 'Plásticos del Centro S. de R.L.',
    origen: 'automatizacion',
    orden_origen_folio: 'SP-A2605/2',
    estado: 'autorizada',
    subtotal: 91900,
    iva: 14704,
    total: 106604,
    notas: 'Control de temperatura 6 zonas extrusora. PLC Delta DVP, módulos temperatura, HMI Delta DOP.',
    fecha: '2026-04-03',
    vendedor: 'Ing. Iván García',
    departamento: 'Automatización'
  };
  await stmtCotizaciones.insert(null, cotAuto2);
  console.log(`[Pipeline] Cotización: ${cotAuto2.folio} → SP-A2605/2`);

  const ventaAuto2 = {
    folio: 'V-2605-A02',
    cliente_nombre: 'Plásticos del Centro S. de R.L.',
    estado: 'entregado',
    subtotal: 91900,
    iva: 14704,
    total: 106604,
    origen: 'automatizacion',
    orden_origen_folio: 'SP-A2605/2',
    fecha: '2026-04-04',
    vendedor: 'Ing. Iván García',
    notas: 'Venta vinculada a proyecto SP-A2605/2. Sistema de temperatura extrusora completado.'
  };
  await stmtVentas.insert(null, ventaAuto2);
  console.log(`[Pipeline] Venta: ${ventaAuto2.folio}`);

  const compraAuto2 = {
    folio: 'CMP-SP-A2605-2',
    proveedor_nombre: 'Delta Electronics México',
    estado: 5,
    subtotal: 27900,
    iva: 4464,
    total: 32364,
    orden_origen_folio: 'SP-A2605/2',
    orden_origen_tipo: 'automatizacion',
    notas: 'Materiales proyecto SP-A2605/2: PLC Delta DVP, módulos temperatura, HMI, termopares, SSR.',
    fecha: '2026-04-06',
    estatus_pago: 'Pagado'
  };
  await stmtCompras.insert(null, compraAuto2);
  console.log(`[Pipeline] Compra: ${compraAuto2.folio}`);

  const facturaAuto2 = {
    folio: 'FAC-2605-A02',
    cliente: 'Plásticos del Centro S. de R.L.',
    total: 106604,
    estatus: 'pagada',
    orden_origen_folio: 'SP-A2605/2',
    fecha_emision: '2026-04-25',
    notas: 'Factura por sistema de control de temperatura extrusora.'
  };
  await stmtFacturas.insert(null, facturaAuto2);
  console.log(`[Pipeline] Factura: ${facturaAuto2.folio}`);

  // ==================== HISTORIAL DE EVENTOS ====================
  const historialEntries = [
    // Taller SP-E2605001
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'creacion', descripcion: 'Orden SP-E2605001 creada — Recepción de Variador ABB ACS580', creado_en: '2026-04-20T09:30:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Diagnóstico — Falla OVERCURRENT identificada', creado_en: '2026-04-21T10:00:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a En reparación — IGBT fase V reemplazado', creado_en: '2026-04-28T14:00:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Reparado — Prueba en banco satisfactoria', creado_en: '2026-04-30T16:00:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Entregado — Entregado a Ing. Carlos Domínguez', creado_en: '2026-05-02T16:00:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'compra_vinculada', descripcion: 'Compra CMP-SP-E2605001 vinculada — Refacciones ABB', creado_en: '2026-04-21T11:00:00' },
    { orden_id: '8', tabla_origen: 'ordenes_taller', evento: 'facturacion', descripcion: 'Factura FAC-2605-001 generada', creado_en: '2026-05-02T17:00:00' },

    // Taller SP-E2605002
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'creacion', descripcion: 'Orden SP-E2605002 creada — Recepción PLC Allen-Bradley L33ER', creado_en: '2026-04-25T10:00:00' },
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Diagnóstico — Firmware corrupto EN2T', creado_en: '2026-04-26T11:00:00' },
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a En reparación — Módulo EN2T reemplazado', creado_en: '2026-04-29T09:00:00' },
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Reparado — Comunicación estable 4hrs', creado_en: '2026-05-02T15:00:00' },
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'cambio_estado', descripcion: 'Estado cambiado a Entregado — Entregado a Lic. Patricia Mendoza', creado_en: '2026-05-04T14:30:00' },
    { orden_id: '9', tabla_origen: 'ordenes_taller', evento: 'compra_vinculada', descripcion: 'Compra CMP-SP-E2605002 vinculada — Módulo EN2T', creado_en: '2026-04-26T12:00:00' },

    // Automatización SP-A2605/1
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'creacion', descripcion: 'Proyecto SP-A2605/1 creado — Línea de Ensamble C3', creado_en: '2026-04-10T09:00:00' },
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 2 — Ingeniería y diseño', creado_en: '2026-04-12T09:00:00' },
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 3 — Adquisición de materiales', creado_en: '2026-04-18T17:00:00' },
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 4 — Desarrollo e instalación', creado_en: '2026-04-22T08:00:00' },
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 5 — Entrega y capacitación completada', creado_en: '2026-05-03T18:00:00' },
    { orden_id: '4', tabla_origen: 'proyectos_automatizacion', evento: 'compra_vinculada', descripcion: 'Compra CMP-SP-A2605-1 vinculada — Siemens', creado_en: '2026-04-12T10:00:00' },

    // Automatización SP-A2605/2
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'creacion', descripcion: 'Proyecto SP-A2605/2 creado — Control Temperatura Extrusora', creado_en: '2026-04-05T09:00:00' },
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 2 — Ingeniería y selección de equipos', creado_en: '2026-04-07T09:00:00' },
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 3 — Materiales adquiridos', creado_en: '2026-04-11T17:00:00' },
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 4 — Instalación y comisionado', creado_en: '2026-04-15T08:00:00' },
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'cambio_estado', descripcion: 'Etapa 5 — Entrega completada, variación ±0.5°C', creado_en: '2026-04-25T17:00:00' },
    { orden_id: '5', tabla_origen: 'proyectos_automatizacion', evento: 'compra_vinculada', descripcion: 'Compra CMP-SP-A2605-2 vinculada — Delta Electronics', creado_en: '2026-04-06T10:00:00' }
  ];

  for (const entry of historialEntries) {
    await stmtHistorial.insert(null, entry);
  }
  console.log(`[Pipeline] ${historialEntries.length} eventos de historial insertados`);

  persistDb();
  console.log('\n[Pipeline] Pipeline completo insertado:');
  console.log('  Taller SP-E2605001:  COT-2605-001 → V-2605-001 → CMP-SP-E2605001 → FAC-2605-001');
  console.log('  Taller SP-E2605002:  COT-2605-002 → V-2605-002 → CMP-SP-E2605002 → FAC-2605-002');
  console.log('  Auto  SP-A2605/1:    COT-2605-A01 → V-2605-A01 → CMP-SP-A2605-1  → FAC-2605-A01');
  console.log('  Auto  SP-A2605/2:    COT-2605-A02 → V-2605-A02 → CMP-SP-A2605-2  → FAC-2605-A02');
  console.log('  Historial: 16 eventos vinculados');
}

seedPipeline().catch(err => {
  console.error('[Pipeline] Error:', err);
  process.exit(1);
});