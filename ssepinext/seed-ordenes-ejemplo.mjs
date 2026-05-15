import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedOrdenesEjemplo() {
  // Clientes reales del tabulador
  const clientes = [
    { nombre: 'BOLSAS DE LOS ALTOS', km: 113, horas: 5 },
    { nombre: 'COFICAB', km: 40, horas: 3 },
    { nombre: 'ECOBOLSAS', km: 108, horas: 5 },
  ];

  // Parámetros
  const GAS_PRECIO = 30;
  const RENDIMIENTO = 10;
  const VENTAS_DIA = 87;
  const TIEMPO_INV_HR = 80;
  const GASTOS_FIJOS_HR = 161.85;
  const CAMIONETA_HR = 52.67;
  const FACTOR = 1.4;

  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');

  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    const dias = 2 + i;
    const horasInv = c.horas + 4;
    const refacciones = 1500 + (i * 500);
    const becerra = 2000 + (i * 300);

    // Calcular Laboratorio
    const gasolinaLab = ((c.km * 2) / RENDIMIENTO) * GAS_PRECIO;
    const ventasLab = dias * VENTAS_DIA;
    const totalGasVentasLab = gasolinaLab + ventasLab;
    const totalTiempoInvLab = horasInv * TIEMPO_INV_HR;
    const gastosFijosLab = horasInv * GASTOS_FIJOS_HR;
    const camionetaLab = dias * CAMIONETA_HR;
    const gastosGenLab = totalGasVentasLab + totalTiempoInvLab + gastosFijosLab + refacciones + camionetaLab;
    const utilidadLab = gastosGenLab * FACTOR;
    const creditoLab = utilidadLab * 1.03;

    const ordenTaller = {
      folio: `SP-E25${String(i+1).padStart(3,'0')}`,
      cliente_nombre: c.nombre,
      referencia: 'Demo',
      fecha_ingreso: new Date().toISOString(),
      equipo: 'Equipo de prueba',
      marca: 'SSEPI',
      modelo: 'DEMO-001',
      serie: 'SN12345',
      falla_reportada: 'Falla de prueba para demo',
      condiciones_fisicas: 'Buenas',
      encargado_recepcion: 'Admin',
      bajo_garantia: false,
      tecnico_responsable: 'Dani',
      notas_internas: 'Orden de ejemplo con costos calculados',
      notas_generales: 'Demo',
      horas_estimadas: horasInv,
      estado: 'Nuevo',
      km_distancia: c.km,
      horas_viaje: c.horas,
      tiempo_entrega_dias: dias,
      horas_invertido: horasInv,
      refacciones: refacciones,
      utilidad_factor: FACTOR,
      costo_gasolina: parseFloat(gasolinaLab.toFixed(2)),
      costo_ventas: parseFloat(ventasLab.toFixed(2)),
      costo_tiempo_invertido: parseFloat(totalTiempoInvLab.toFixed(2)),
      costo_gastos_fijos: parseFloat(gastosFijosLab.toFixed(2)),
      costo_camioneta: parseFloat(camionetaLab.toFixed(2)),
      costo_total: parseFloat(creditoLab.toFixed(2)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Calcular Motores
    const gasolinaMot = ((c.km * 2) / RENDIMIENTO) * GAS_PRECIO;
    const ventasMot = dias * VENTAS_DIA;
    const totalGasVentasMot = gasolinaMot + ventasMot;
    const camionetaMot = dias * CAMIONETA_HR;
    const gastosSUMot = totalGasVentasMot + becerra + camionetaMot;
    const utilidadMot = gastosSUMot * FACTOR;
    const creditoMot = utilidadMot * 1.03;

    const ordenMotores = {
      folio: `SP-M25${String(i+1).padStart(3,'0')}`,
      cliente_nombre: c.nombre,
      referencia: 'Demo',
      fecha_ingreso: new Date().toISOString(),
      motor: 'Motor Demo',
      marca: 'WEG',
      modelo: 'DEMO-MOT',
      serie: 'SNMOT001',
      hp: 10,
      rpm: 1800,
      voltaje: '440V',
      falla_reportada: 'Falla de prueba motores',
      condiciones_fisicas: 'Buenas',
      encargado_recepcion: 'Admin',
      bajo_garantia: false,
      tecnico_responsable: 'Carlos',
      notas_internas: 'Orden de ejemplo motores con costos',
      notas_generales: 'Demo',
      horas_estimadas: 8,
      estado: 'Nuevo',
      km_distancia: c.km,
      horas_viaje: c.horas,
      tiempo_entrega_dias: dias,
      becerra: becerra,
      utilidad_factor: FACTOR,
      costo_gasolina: parseFloat(gasolinaMot.toFixed(2)),
      costo_ventas: parseFloat(ventasMot.toFixed(2)),
      costo_camioneta: parseFloat(camionetaMot.toFixed(2)),
      costo_total: parseFloat(creditoMot.toFixed(2)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await stmtTaller.insert(null, ordenTaller);
    await stmtMotores.insert(null, ordenMotores);

    console.log(`[Seed] Orden Taller ${ordenTaller.folio}: cliente=${c.nombre}, gasolina=$${ordenTaller.costo_gasolina}, total=$${ordenTaller.costo_total}`);
    console.log(`[Seed] Orden Motores ${ordenMotores.folio}: cliente=${c.nombre}, gasolina=$${ordenMotores.costo_gasolina}, total=$${ordenMotores.costo_total}`);
  }

  persistDb();
  console.log('[Seed] Ordenes de ejemplo creadas con costos calculados.');
}

seedOrdenesEjemplo().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
