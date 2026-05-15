import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

const clientes = [
  { nombre: 'BOLSAS DE LOS ALTOS', km: 113, horas: 5 },
  { nombre: 'COFICAB', km: 40, horas: 3 },
  { nombre: 'ECOBOLSAS', km: 108, horas: 5 },
];

async function seedVida() {
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');
  const stmtCot = await prepareStatement(db, 'local_cotizaciones');
  const stmtComp = await prepareStatement(db, 'local_compras');
  const stmtFact = await prepareStatement(db, 'local_facturas');
  const stmtHist = await prepareStatement(db, 'local_orden_historial');

  // Traer órdenes existentes
  const tallerRows = await stmtTaller.query('', [], 'created_at DESC', 100);
  const motoresRows = await stmtMotores.query('', [], 'created_at DESC', 100);

  const estadosTaller = ['Nuevo', 'Diagnóstico', 'En reparación'];
  const estadosMotores = ['Nuevo', 'Diagnóstico', 'En reparación'];

  for (let i = 0; i < tallerRows.length; i++) {
    const orden = tallerRows[i];
    const c = clientes[i % clientes.length];
    const estado = estadosTaller[i % estadosTaller.length];

    // Actualizar orden con estado variado y campos de costos reales
    const totalCosto = orden.costo_total || 0;
    const updatedOrden = {
      ...orden,
      estado,
      condiciones_fisicas: 'Buenas — revisado en recepción',
      notas_internas: `Orden activa con costos calculados: gasolina=$${orden.costo_gasolina}, total=$${totalCosto}`,
      updated_at: new Date().toISOString()
    };
    await stmtTaller.update(orden.local_id, updatedOrden);

    // Crear cotización vinculada
    const folioCot = `COT-T${String(i+1).padStart(3,'0')}`;
    const cotData = {
      folio: folioCot,
      tipo_folio: 'COT',
      cliente_nombre: c.nombre,
      cliente: c.nombre,
      vendedor: 'Ventas SSEPI',
      subtotal: totalCosto,
      iva: totalCosto * 0.16,
      total: totalCosto * 1.16,
      km_distancia: c.km,
      horas_viaje: c.horas,
      costo_gasolina: orden.costo_gasolina || 0,
      costo_traslado: (orden.costo_ventas || 0) + (orden.costo_camioneta || 0),
      estado: 'Pendiente',
      origen: 'taller',
      departamento: 'Taller Electrónica',
      orden_origen_id: orden.local_id,
      cerebro_registro: {
        folio_operativo: orden.folio,
        departamento: 'Taller Electrónica',
        falla_reportada: orden.falla_reportada,
        origen_cotizacion: 'taller',
        orden_id: orden.local_id
      },
      items: [
        { descripcion: orden.falla_reportada || 'Servicio laboratorio', cantidad: 1, precio_unitario: totalCosto, importe: totalCosto }
      ],
      fecha_cotizacion: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const cotInsertado = await stmtCot.insert(null, cotData);

    // Crear compra vinculada
    const folioComp = `CMP-T${String(i+1).padStart(3,'0')}`;
    const compData = {
      folio: folioComp,
      proveedor: 'Por asignar',
      proveedor_nombre: 'Por asignar',
      departamento: 'Taller Electrónica',
      subtotal: orden.refacciones || 1500,
      iva: (orden.refacciones || 1500) * 0.16,
      total: (orden.refacciones || 1500) * 1.16,
      estatus_pago: 'Solicitud',
      estado: 1,
      vinculacion: { tipo: 'taller', id: orden.local_id, nombre: c.nombre, folio_taller: orden.folio },
      notas: `Solicitud generada automáticamente desde Ventas para orden ${orden.folio} (taller)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const compInsertado = await stmtComp.insert(null, compData);

    // Crear factura vinculada
    const folioFac = `FAC-T${String(i+1).padStart(3,'0')}`;
    const facData = {
      folio: folioFac,
      folio_factura: folioFac,
      cliente: c.nombre,
      cliente_nombre: c.nombre,
      total: totalCosto * 1.16,
      estatus: 'pendiente',
      estado: 'pendiente',
      venta_id: cotInsertado?.local_id || null,
      fecha_emision: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await stmtFact.insert(null, facData);

    // Historial
    await stmtHist.insert(null, {
      orden_id: orden.local_id,
      tabla_origen: 'ordenes_taller',
      evento: 'creacion',
      descripcion: `Orden ${orden.folio} creada y vinculada con cotización ${folioCot}, compra ${folioComp}, factura ${folioFac}`,
      usuario: 'Sistema',
      created_at: new Date().toISOString()
    });

    console.log(`[Vida] Taller ${orden.folio} → estado:${estado}, cot:${folioCot}, comp:${folioComp}, fac:${folioFac}`);
  }

  for (let i = 0; i < motoresRows.length; i++) {
    const orden = motoresRows[i];
    const c = clientes[i % clientes.length];
    const estado = estadosMotores[i % estadosMotores.length];

    const totalCosto = orden.costo_total || 0;
    const updatedOrden = {
      ...orden,
      estado,
      condiciones_fisicas: 'Buenas — revisado en recepción',
      notas_internas: `Orden activa con costos calculados: gasolina=$${orden.costo_gasolina}, total=$${totalCosto}`,
      updated_at: new Date().toISOString()
    };
    await stmtMotores.update(orden.local_id, updatedOrden);

    // Cotización
    const folioCot = `COT-M${String(i+1).padStart(3,'0')}`;
    const cotData = {
      folio: folioCot,
      tipo_folio: 'COT',
      cliente_nombre: c.nombre,
      cliente: c.nombre,
      vendedor: 'Ventas SSEPI',
      subtotal: totalCosto,
      iva: totalCosto * 0.16,
      total: totalCosto * 1.16,
      km_distancia: c.km,
      horas_viaje: c.horas,
      costo_gasolina: orden.costo_gasolina || 0,
      costo_traslado: (orden.costo_ventas || 0) + (orden.costo_camioneta || 0),
      estado: 'Pendiente',
      origen: 'motores',
      departamento: 'Taller Motores',
      orden_origen_id: orden.local_id,
      cerebro_registro: {
        folio_operativo: orden.folio,
        departamento: 'Taller Motores',
        falla_reportada: orden.falla_reportada,
        origen_cotizacion: 'motores',
        orden_id: orden.local_id
      },
      items: [
        { descripcion: orden.falla_reportada || 'Servicio motores', cantidad: 1, precio_unitario: totalCosto, importe: totalCosto }
      ],
      fecha_cotizacion: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const cotInsertado = await stmtCot.insert(null, cotData);

    // Compra
    const folioComp = `CMP-M${String(i+1).padStart(3,'0')}`;
    const compData = {
      folio: folioComp,
      proveedor: 'Por asignar',
      proveedor_nombre: 'Por asignar',
      departamento: 'Taller Motores',
      subtotal: orden.becerra || 2000,
      iva: (orden.becerra || 2000) * 0.16,
      total: (orden.becerra || 2000) * 1.16,
      estatus_pago: 'Solicitud',
      estado: 1,
      vinculacion: { tipo: 'motores', id: orden.local_id, nombre: c.nombre, folio_taller: orden.folio },
      notas: `Solicitud generada automáticamente desde Ventas para orden ${orden.folio} (motores)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const compInsertado = await stmtComp.insert(null, compData);

    // Factura
    const folioFac = `FAC-M${String(i+1).padStart(3,'0')}`;
    const facData = {
      folio: folioFac,
      folio_factura: folioFac,
      cliente: c.nombre,
      cliente_nombre: c.nombre,
      total: totalCosto * 1.16,
      estatus: 'pendiente',
      estado: 'pendiente',
      venta_id: cotInsertado?.local_id || null,
      fecha_emision: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await stmtFact.insert(null, facData);

    // Historial
    await stmtHist.insert(null, {
      orden_id: orden.local_id,
      tabla_origen: 'ordenes_motores',
      evento: 'creacion',
      descripcion: `Orden ${orden.folio} creada y vinculada con cotización ${folioCot}, compra ${folioComp}, factura ${folioFac}`,
      usuario: 'Sistema',
      created_at: new Date().toISOString()
    });

    console.log(`[Vida] Motores ${orden.folio} → estado:${estado}, cot:${folioCot}, comp:${folioComp}, fac:${folioFac}`);
  }

  persistDb();
  console.log('[Vida] Todas las órdenes tienen vida: cotizaciones, compras y facturas vinculadas.');
}

seedVida().catch(err => {
  console.error('[Vida] Error:', err);
  process.exit(1);
});
