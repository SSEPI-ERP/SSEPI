import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

// Parámetros del CostosEngine (valores por defecto del sistema)
const PARAMS = {
  gasolina: 30,
  rendimiento: 10,
  costoTecnico: 80,       // tiempo_invertido_hr
  gastosFijosHora: 161.85,
  camionetaHora: 52.67,
  ventasPorDia: 87,
  utilidad: 40,            // %
  credito: 3,              // %
  iva: 16                  // %
};

// Fórmulas del CostosEngine - calcularLaboratorio
function calcularLaboratorio(dias, km, horasInvertido, refacciones, utilidadFactor) {
  const gasolina = ((km * 2) / PARAMS.rendimiento) * PARAMS.gasolina;
  const ventas = dias * PARAMS.ventasPorDia;
  const totalGasVentas = gasolina + ventas;
  const totalTiempoInvertido = horasInvertido * PARAMS.costoTecnico;
  const gastosFijos = horasInvertido * PARAMS.gastosFijosHora;
  const camioneta = dias * PARAMS.camionetaHora;
  const gastosGenerales = totalGasVentas + totalTiempoInvertido + gastosFijos + (refacciones || 0) + camioneta;
  const factor = utilidadFactor || 1.4;
  const utilidad = gastosGenerales * factor;
  const credito = utilidad * 1.03;
  const iva = credito * (PARAMS.iva / 100);
  const total = credito + iva;
  return { dias, km, gasolina, ventas, totalGasVentas, horasInvertido, totalTiempoInvertido, gastosFijos, refacciones: refacciones || 0, camioneta, gastosGenerales, utilidad, credito, iva, total };
}

// Fórmulas - calcularSuministros (para ventas)
function calcularSuministros(dias, km, proveedor, utilidadFactor) {
  const gasolina = ((km * 2) / PARAMS.rendimiento) * PARAMS.gasolina;
  const ventas = dias * PARAMS.ventasPorDia;
  const totalGasVentas = gasolina + ventas;
  const camioneta = dias * PARAMS.camionetaHora;
  const gastosSU = totalGasVentas + (proveedor || 0) + camioneta;
  const factor = utilidadFactor || 1.4;
  const utilidad = gastosSU * factor;
  const credito = utilidad * 1.03;
  const iva = credito * (PARAMS.iva / 100);
  const total = credito + iva;
  return { dias, km, gasolina, ventas, totalGasVentas, proveedor: proveedor || 0, camioneta, gastosSU, utilidad, credito, iva, total };
}

async function recalcularCostos() {
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtAuto = await prepareStatement(db, 'local_proyectos_automatizacion');
  const stmtVentas = await prepareStatement(db, 'local_ventas');
  const stmtCotizaciones = await prepareStatement(db, 'local_cotizaciones');
  const stmtCompras = await prepareStatement(db, 'local_compras');
  const stmtFacturas = await prepareStatement(db, 'local_facturas');

  // ==================== TALLER SP-E2605001 → Cliente: BODYCOTE (km=45.3) ====================
  // Recalcular con datos reales del tabulador
  const costoT1 = calcularLaboratorio(
    10,    // 10 días de entrega
    45.3,  // km BODYCOTE
    14,    // horas invertido
    4680,  // refacciones (IGBT + condensadores)
    1.4    // utilidad factor
  );
  console.log('[Costos] Taller SP-E2605001 (BODYCOTE):');
  console.log('  Gasolina: $' + costoT1.gasolina.toFixed(2));
  console.log('  Ventas: $' + costoT1.ventas.toFixed(2));
  console.log('  Tiempo técnico: $' + costoT1.totalTiempoInvertido.toFixed(2));
  console.log('  Gastos fijos: $' + costoT1.gastosFijos.toFixed(2));
  console.log('  Refacciones: $' + costoT1.refacciones.toFixed(2));
  console.log('  Camioneta: $' + costoT1.camioneta.toFixed(2));
  console.log('  Gastos generales: $' + costoT1.gastosGenerales.toFixed(2));
  console.log('  Con utilidad (1.4): $' + costoT1.utilidad.toFixed(2));
  console.log('  Con crédito (1.03): $' + costoT1.credito.toFixed(2));
  console.log('  IVA (16%): $' + costoT1.iva.toFixed(2));
  console.log('  TOTAL: $' + costoT1.total.toFixed(2));

  // Actualizar orden Taller 1 con cliente real y costos calculados
  const taller1 = await stmtTaller.getById(8);
  await stmtTaller.update(8, {
    ...taller1,
    cliente_nombre: 'BODYCOTE',
    km_distancia: 45.3,
    horas_viaje: 3,
    tiempo_entrega_dias: 10,
    horas_invertido: 14,
    utilidad_factor: 1.4,
    costo_mano_obra: costoT1.totalTiempoInvertido + costoT1.gastosFijos,
    costo_refacciones: costoT1.refacciones,
    costo_consumibles: 130,
    costo_gasolina: costoT1.gasolina,
    costo_ventas: costoT1.ventas,
    costo_camioneta: costoT1.camioneta,
    gastos_generales: costoT1.gastosGenerales,
    utilidad: costoT1.utilidad,
    credito: costoT1.credito,
    subtotal: costoT1.credito,
    iva: costoT1.iva,
    costo_total: costoT1.total,
    // Campos de desglose completo
    costo_desglose: costoT1
  });
  console.log('[DB] Taller 8 actualizado con costos reales');

  // ==================== TALLER SP-E2605002 → Cliente: NISHIKAWA (km=30.5) ====================
  const costoT2 = calcularLaboratorio(8, 30.5, 18, 8200, 1.4);
  console.log('\n[Costos] Taller SP-E2605002 (NISHIKAWA):');
  console.log('  TOTAL: $' + costoT2.total.toFixed(2));

  const taller2 = await stmtTaller.getById(9);
  await stmtTaller.update(9, {
    ...taller2,
    cliente_nombre: 'NISHIKAWA',
    km_distancia: 30.5,
    horas_viaje: 3,
    tiempo_entrega_dias: 8,
    horas_invertido: 18,
    utilidad_factor: 1.4,
    costo_mano_obra: costoT2.totalTiempoInvertido + costoT2.gastosFijos,
    costo_refacciones: costoT2.refacciones,
    costo_consumibles: 120,
    costo_gasolina: costoT2.gasolina,
    costo_ventas: costoT2.ventas,
    costo_camioneta: costoT2.camioneta,
    gastos_generales: costoT2.gastosGenerales,
    utilidad: costoT2.utilidad,
    credito: costoT2.credito,
    subtotal: costoT2.credito,
    iva: costoT2.iva,
    costo_total: costoT2.total,
    costo_desglose: costoT2
  });
  console.log('[DB] Taller 9 actualizado con costos reales');

  // ==================== VENTAS - Actualizar con clientes y costos reales ====================
  const ventas1 = await stmtVentas.getById(1);
  await stmtVentas.update(1, {
    ...ventas1,
    cliente_nombre: 'BODYCOTE',
    orden_origen_folio: 'SP-E2605001',
    subtotal: costoT1.credito,
    iva: costoT1.iva,
    total: costoT1.total,
    costos_desglose: costoT1
  });
  console.log('[DB] Venta V-2605-001 actualizada → BODYCOTE $' + costoT1.total.toFixed(2));

  const ventas2 = await stmtVentas.getById(2);
  await stmtVentas.update(2, {
    ...ventas2,
    cliente_nombre: 'NISHIKAWA',
    orden_origen_folio: 'SP-E2605002',
    subtotal: costoT2.credito,
    iva: costoT2.iva,
    total: costoT2.total,
    costos_desglose: costoT2
  });
  console.log('[DB] Venta V-2605-002 actualizada → NISHIKAWA $' + costoT2.total.toFixed(2));

  // ==================== COTIZACIONES - Actualizar con clientes y costos ====================
  const cot1 = await stmtCotizaciones.getById(16);
  await stmtCotizaciones.update(16, {
    ...cot1,
    cliente_nombre: 'BODYCOTE',
    subtotal: costoT1.credito,
    iva: costoT1.iva,
    total: costoT1.total
  });
  console.log('[DB] Cotización COT-2605-001 actualizada → BODYCOTE');

  const cot2 = await stmtCotizaciones.getById(17);
  await stmtCotizaciones.update(17, {
    ...cot2,
    cliente_nombre: 'NISHIKAWA',
    subtotal: costoT2.credito,
    iva: costoT2.iva,
    total: costoT2.total
  });
  console.log('[DB] Cotización COT-2605-002 actualizada → NISHIKAWA');

  // ==================== COMPRAS - Actualizar con costos reales ====================
  const comp1 = await stmtCompras.getById(16);
  await stmtCompras.update(16, {
    ...comp1,
    subtotal: costoT1.refacciones,
    iva: costoT1.refacciones * 0.16,
    total: costoT1.refacciones * 1.16
  });

  const comp2 = await stmtCompras.getById(17);
  await stmtCompras.update(17, {
    ...comp2,
    subtotal: costoT2.refacciones,
    iva: costoT2.refacciones * 0.16,
    total: costoT2.refacciones * 1.16
  });

  // ==================== FACTURAS - Actualizar con totales reales ====================
  const fac1 = await stmtFacturas.getById(16);
  await stmtFacturas.update(16, {
    ...fac1,
    cliente: 'BODYCOTE',
    total: costoT1.total
  });

  const fac2 = await stmtFacturas.getById(17);
  await stmtFacturas.update(17, {
    ...fac2,
    cliente: 'NISHIKAWA',
    total: costoT2.total
  });

  // ==================== AUTOMATIZACIÓN - Costos calculados ====================
  // SP-A2605/1 → Cliente: BOLSAS DE LOS ALTOS (km=113)
  const matAuto1 = 84600;  // materiales
  const svcsAuto1 = { plc_hmi: 80, instalacion: 60, soporte: 16 }; // horas por servicio
  const tarAuto1 = { plc_hmi: 650, instalacion: 350, soporte: 1100 };
  const totalServicios1 = (svcsAuto1.plc_hmi * tarAuto1.plc_hmi) + (svcsAuto1.instalacion * tarAuto1.instalacion) + (svcsAuto1.soporte * tarAuto1.soporte);
  const matCon30_1 = matAuto1 * 1.3;
  const gasAuto1 = ((113 * 2) / PARAMS.rendimiento) * PARAMS.gasolina;
  const camAuto1 = 60 * PARAMS.camionetaHora; // 60 hrs planta
  const subAuto1 = totalServicios1 + matCon30_1 + matAuto1 + camAuto1 + gasAuto1;
  const credAuto1 = subAuto1 * 1.03;
  const ivaAuto1 = credAuto1 * 0.16;
  const totalAuto1 = credAuto1 + ivaAuto1;

  console.log('\n[Costos] Auto SP-A2605/1 (BOLSAS DE LOS ALTOS):');
  console.log('  Servicios: $' + totalServicios1.toFixed(2));
  console.log('  Materiales: $' + matAuto1.toFixed(2));
  console.log('  Materiales +30%: $' + matCon30_1.toFixed(2));
  console.log('  Gasolina: $' + gasAuto1.toFixed(2));
  console.log('  Camioneta: $' + camAuto1.toFixed(2));
  console.log('  Subtotal: $' + subAuto1.toFixed(2));
  console.log('  Con crédito: $' + credAuto1.toFixed(2));
  console.log('  IVA: $' + ivaAuto1.toFixed(2));
  console.log('  TOTAL: $' + totalAuto1.toFixed(2));

  const auto1 = await stmtAuto.getById(4);
  await stmtAuto.update(4, {
    ...auto1,
    cliente_nombre: 'BOLSAS DE LOS ALTOS',
    cliente: 'BOLSAS DE LOS ALTOS',
    rfc: 'BDA260512345',
    direccion: 'Parque Industrial Los Altos, León, Gto.',
    km_distancia: 113,
    horas_viaje: 5,
    costo_materiales: matAuto1,
    costo_servicios: totalServicios1,
    costo_gasolina: gasAuto1,
    costo_camioneta: camAuto1,
    subtotal: credAuto1,
    iva: ivaAuto1,
    costo_total: totalAuto1,
    costos_desglose: {
      servicios: totalServicios1,
      materiales: matAuto1,
      materialesCon30: matCon30_1,
      gasolina: gasAuto1,
      camioneta: camAuto1,
      subtotal: subAuto1,
      credito: credAuto1,
      iva: ivaAuto1,
      total: totalAuto1
    }
  });
  console.log('[DB] Auto SP-A2605/1 actualizado → BOLSAS DE LOS ALTOS');

  // SP-A2605/2 → Cliente: CONDUMEX (km=45.3)
  const matAuto2 = 27900;
  const svcsAuto2 = { plc_hmi: 48, instalacion: 32, soporte: 24 };
  const totalServicios2 = (svcsAuto2.plc_hmi * 650) + (svcsAuto2.instalacion * 350) + (svcsAuto2.soporte * 1100);
  const matCon30_2 = matAuto2 * 1.3;
  const gasAuto2 = ((45.3 * 2) / PARAMS.rendimiento) * PARAMS.gasolina;
  const camAuto2 = 32 * PARAMS.camionetaHora;
  const subAuto2 = totalServicios2 + matCon30_2 + matAuto2 + camAuto2 + gasAuto2;
  const credAuto2 = subAuto2 * 1.03;
  const ivaAuto2 = credAuto2 * 0.16;
  const totalAuto2 = credAuto2 + ivaAuto2;

  console.log('\n[Costos] Auto SP-A2605/2 (CONDUMEX): TOTAL: $' + totalAuto2.toFixed(2));

  const auto2 = await stmtAuto.getById(5);
  await stmtAuto.update(5, {
    ...auto2,
    cliente_nombre: 'CONDUMEX',
    cliente: 'CONDUMEX',
    rfc: 'CDX260578901',
    direccion: 'Carretera a Silao Km 5, León, Gto.',
    km_distancia: 45.3,
    horas_viaje: 3,
    costo_materiales: matAuto2,
    costo_servicios: totalServicios2,
    costo_gasolina: gasAuto2,
    costo_camioneta: camAuto2,
    subtotal: credAuto2,
    iva: ivaAuto2,
    costo_total: totalAuto2,
    costos_desglose: {
      servicios: totalServicios2,
      materiales: matAuto2,
      materialesCon30: matCon30_2,
      gasolina: gasAuto2,
      camioneta: camAuto2,
      subtotal: subAuto2,
      credito: credAuto2,
      iva: ivaAuto2,
      total: totalAuto2
    }
  });
  console.log('[DB] Auto SP-A2605/2 actualizado → CONDUMEX');

  // Actualizar ventas de automatización
  const ventas3 = await stmtVentas.getById(3);
  await stmtVentas.update(3, {
    ...ventas3,
    cliente_nombre: 'BOLSAS DE LOS ALTOS',
    subtotal: credAuto1,
    iva: ivaAuto1,
    total: totalAuto1,
    costos_desglose: {
      servicios: totalServicios1, materiales: matAuto1, materialesCon30: matCon30_1,
      gasolina: gasAuto1, camioneta: camAuto1, subtotal: subAuto1,
      credito: credAuto1, iva: ivaAuto1, total: totalAuto1
    }
  });

  const ventas4 = await stmtVentas.getById(4);
  await stmtVentas.update(4, {
    ...ventas4,
    cliente_nombre: 'CONDUMEX',
    subtotal: credAuto2,
    iva: ivaAuto2,
    total: totalAuto2,
    costos_desglose: {
      servicios: totalServicios2, materiales: matAuto2, materialesCon30: matCon30_2,
      gasolina: gasAuto2, camioneta: camAuto2, subtotal: subAuto2,
      credito: credAuto2, iva: ivaAuto2, total: totalAuto2
    }
  });

  // Cotizaciones auto
  const cot3 = await stmtCotizaciones.getById(18);
  await stmtCotizaciones.update(18, { ...cot3, cliente_nombre: 'BOLSAS DE LOS ALTOS', subtotal: credAuto1, iva: ivaAuto1, total: totalAuto1 });

  const cot4 = await stmtCotizaciones.getById(19);
  await stmtCotizaciones.update(19, { ...cot4, cliente_nombre: 'CONDUMEX', subtotal: credAuto2, iva: ivaAuto2, total: totalAuto2 });

  // Compras auto
  const comp3 = await stmtCompras.getById(18);
  await stmtCompras.update(18, { ...comp3, subtotal: matAuto1, iva: matAuto1 * 0.16, total: matAuto1 * 1.16 });

  const comp4 = await stmtCompras.getById(19);
  await stmtCompras.update(19, { ...comp4, subtotal: matAuto2, iva: matAuto2 * 0.16, total: matAuto2 * 1.16 });

  // Facturas auto
  const fac3 = await stmtFacturas.getById(18);
  await stmtFacturas.update(18, { ...fac3, cliente: 'BOLSAS DE LOS ALTOS', total: totalAuto1 });

  const fac4 = await stmtFacturas.getById(19);
  await stmtFacturas.update(19, { ...fac4, cliente: 'CONDUMEX', total: totalAuto2 });

  persistDb();

  console.log('\n=========================================');
  console.log('  COSTOS CALCULADOS CON COSTOS ENGINE');
  console.log('=========================================');
  console.log('  Taller SP-E2605001 (BODYCOTE):     $' + costoT1.total.toFixed(2));
  console.log('  Taller SP-E2605002 (NISHIKAWA):    $' + costoT2.total.toFixed(2));
  console.log('  Auto   SP-A2605/1 (BOLSAS ALTOS):  $' + totalAuto1.toFixed(2));
  console.log('  Auto   SP-A2605/2 (CONDUMEX):      $' + totalAuto2.toFixed(2));
  console.log('=========================================');
  console.log('  Desglose incluido en cada registro');
  console.log('  Ventas/Cotizaciones/Compras/Facturas');
  console.log('  sincronizadas con los mismos totales');
  console.log('=========================================');
}

recalcularCostos().catch(err => {
  console.error('[Costos] Error:', err);
  process.exit(1);
});