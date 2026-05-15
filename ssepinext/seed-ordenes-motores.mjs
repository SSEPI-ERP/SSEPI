import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedOrdenesMotores() {
  const stmtMotores = await prepareStatement(db, 'local_ordenes_motores');

  async function existeFolio(tabla, folio) {
    const rows = await tabla.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
    return rows.length > 0 ? rows[0].local_id : null;
  }

  // ==================== ORDEN MOTOR 1 ====================
  const ordenMotor1 = {
    folio: 'SP-M2605001',
    estado: 'Entregado',
    cliente_nombre: 'Cementos del Pacífico S.A.',
    cliente_id: null,
    equipo: 'Motor Eléctrico Trifásico WEG 50 HP',
    marca: 'WEG',
    modelo: 'W50 315S/M 50HP 4P B3D',
    serie: 'WEG50HP2024MX8912',
    falla_reportada: 'El motor presenta sobrecalentamiento en devanado del estator después de 3 horas de operación continua. Temperatura ambiente 38°C. Ventilador auxiliar operativo pero no logra disipar calor suficiente. El cliente reporta vibración anómala en eje de salida.',
    condiciones_fisicas: 'Carcasa con óxido superficial en tapas. Ventilador intacto. Caja de conexiones con humedad residual. Rodamiento delantero con juego perceptible.',
    notas_internas: 'Diagnóstico: Aislamiento del estator degradado (Índice de polaridad 1.8). Devinado U1-U2 con cortocircuito intervuelta en ranuras 12-15. Se rebobinó estator con alambre magneto AWG 12. Se reemplazó rodamiento 6314-2RS ambos lados. Se aplicó barniz de impregnación epóxica clase H. Prueba de vacío: 2.5kV durante 60s sin fuga.',
    notas_generales: 'Garantía de 12 meses en rebobinado. Se recomienda instalar protector térmico bimetálico en devanado. Verificar alineación con bomba centrífuga.',
    tecnico_responsable: 'Ing. Mario Hernández',
    encargado_recepcion: 'Norberto Moro',
    prioridad: 'alta',
    fecha_ingreso: '2026-05-10T08:00',
    fecha_entrega: '2026-05-24T14:00',
    recibe_nombre: 'Ing. Felipe Castellanos',
    entrega_obs: 'Motor probado en banco 4 horas a plena carga sin sobrecalentamiento. Temperatura estabilizada a 68°C. Vibración ISO 10816 Grupo I dentro de tolerancia.',
    horas_estimadas: 24,
    horas_invertido: 22,
    tiempo_entrega_dias: 14,
    refacciones_enlaces: [],
    refacciones_inventario: [
      { descripcion: 'Alambre magneto AWG 12 clase H (rollo 5kg)', cantidad: 1, costo: 3200 },
      { descripcion: 'Rodamiento WEG 6314-2RS (par)', cantidad: 1, costo: 1850 }
    ],
    consumibles_usados: [
      { descripcion: 'Barniz de impregnación epóxica 1L', cantidad: 1, costo: 420 },
      { descripcion: 'Papel Nomex 410 0.25mm (rollo)', cantidad: 1, costo: 650 }
    ],
    diagnosticoEnlaces: [],
    diagnosticoInventario: [
      { descripcion: 'Alambre magneto AWG 12 clase H (rollo 5kg)', cantidad: 1, costo: 3200 },
      { descripcion: 'Rodamiento WEG 6314-2RS (par)', cantidad: 1, costo: 1850 }
    ],
    consumiblesUsados: [
      { descripcion: 'Barniz de impregnación epóxica 1L', cantidad: 1, costo: 420 },
      { descripcion: 'Papel Nomex 410 0.25mm (rollo)', cantidad: 1, costo: 650 }
    ],
    componentes_inventario: [],
    componentes_compra: [],
    componentesInventario: [],
    componentesCompra: [],
    componentes_extras: [
      { descripcion: 'Protector térmico bimetálico 155°C', cantidad: 3, costo_unitario: 180, subtotal: 540 },
      { descripcion: 'Kit de sellos laberinto eje 60mm', cantidad: 1, costo_unitario: 320, subtotal: 320 }
    ],
    reparacion_notas: 'Rebobinado completo de estator trifásico 50HP. Se detectó cortocircuito intervuelta en fase U. Se limpió ranuras, se insertó nuevo devanado con alambre magneto AWG 12 clase H. Impregnación con barniz epóxico y curado 4 horas a 120°C. Balanceo dinámico de rotor. Prueba de aislamiento: 500MΩ. Prueba de vacío: 2.5kV/60s OK. Se instalaron protectores térmicos bimetálicos en cada fase.',
    costo_mano_obra: 8500,
    costo_refacciones: 5050,
    costo_consumibles: 1070,
    costo_total: 14620,
    km_distancia: 0,
    horas_viaje: 0,
    utilidad_factor: 1.4
  };

  const existingId1 = await existeFolio(stmtMotores, ordenMotor1.folio);
  if (!existingId1) {
    const result = await stmtMotores.insert(null, ordenMotor1);
    console.log(`[Seed] Motor ENTREGADO: ${ordenMotor1.folio} — ${ordenMotor1.equipo} (ID: ${result.id})`);
  } else {
    await stmtMotores.update(existingId1, ordenMotor1);
    console.log(`[Seed] Motor ${ordenMotor1.folio} reemplazado (ID: ${existingId1})`);
  }

  // ==================== ORDEN MOTOR 2 ====================
  const ordenMotor2 = {
    folio: 'SP-M2605002',
    estado: 'Entregado',
    cliente_nombre: 'Agroindustrias del Sur S.A. de C.V.',
    cliente_id: null,
    equipo: 'Motor DC Shunt Baldor 7.5 HP',
    marca: 'Baldor',
    modelo: 'CDP3310 7.5HP 1750RPM',
    serie: 'BLDCDP2025US4421',
    falla_reportada: 'El motor DC no arranca desde paro. Al aplicar voltaje de armadura (240VDC) no gira. Las escobillas generan chispas excesivas. El cliente reportó que el problema inició después de una sobrecarga en el molino de grano.',
    condiciones_fisicas: 'Carcasa pintura original. Conmutador con huellas de arco eléctrico. Escobillas desgastadas al 20%. Ventilador trasero con acumulación de polvo de grano. Cajas de escobillas con restos de carbón.',
    notas_internas: 'Diagnóstico: Bobinado de armadura con corto a masa en segmento 8 del conmutador. Campo shunt con resistencia fuera de tolerancia (+18%). Se rebobinó armadura con alambre redondo AWG 15. Se reparó conmutador (fresado y ranurado). Se ajustó campo shunt a valores nominales. Se reemplazaron escobillas EG319 por E46F3.',
    notas_generales: 'Garantía de 6 meses. Se recomienda limpiar ventilador mensualmente debido a polvo de grano. Verificar que el drive DC tenga protección de sobre-corrente ajustada a 125%.',
    tecnico_responsable: 'Ing. Mario Hernández',
    encargado_recepcion: 'Norberto Moro',
    prioridad: 'media',
    fecha_ingreso: '2026-05-05T10:30',
    fecha_entrega: '2026-05-19T11:00',
    recibe_nombre: 'Lic. Ricardo Mendoza',
    entrega_obs: 'Motor operando en banco 2 horas sin chispas excesivas. Conmutador en buenas condiciones. Velocidad nominal alcanzada con 240VDC.',
    horas_estimadas: 18,
    horas_invertido: 16,
    tiempo_entrega_dias: 12,
    refacciones_enlaces: [],
    refacciones_inventario: [
      { descripcion: 'Alambre magneto redondo AWG 15 (rollo 3kg)', cantidad: 1, costo: 2100 },
      { descripcion: 'Escobillas E46F3 (par)', cantidad: 2, costo: 480 }
    ],
    consumibles_usados: [
      { descripcion: 'Barniz impregnación poliéster 500ml', cantidad: 1, costo: 280 },
      { descripcion: 'Lija conmutador 400grit (paquete)', cantidad: 1, costo: 95 }
    ],
    diagnosticoEnlaces: [],
    diagnosticoInventario: [
      { descripcion: 'Alambre magneto redondo AWG 15 (rollo 3kg)', cantidad: 1, costo: 2100 },
      { descripcion: 'Escobillas E46F3 (par)', cantidad: 2, costo: 480 }
    ],
    consumiblesUsados: [
      { descripcion: 'Barniz impregnación poliéster 500ml', cantidad: 1, costo: 280 },
      { descripcion: 'Lija conmutador 400grit (paquete)', cantidad: 1, costo: 95 }
    ],
    componentes_inventario: [],
    componentes_compra: [],
    componentesInventario: [],
    componentesCompra: [],
    componentes_extras: [],
    reparacion_notas: 'Rebobinado de armadura DC 7.5HP. Corto a masa en segmento 8 reparado. Fresado de conmutador y ranurado. Ajuste de bobinado de campo shunt. Sin componentes extras.',
    costo_mano_obra: 6200,
    costo_refacciones: 2580,
    costo_consumibles: 375,
    costo_total: 9155,
    km_distancia: 0,
    horas_viaje: 0,
    utilidad_factor: 1.4
  };

  const existingId2 = await existeFolio(stmtMotores, ordenMotor2.folio);
  if (!existingId2) {
    const result = await stmtMotores.insert(null, ordenMotor2);
    console.log(`[Seed] Motor ENTREGADO: ${ordenMotor2.folio} — ${ordenMotor2.equipo} (ID: ${result.id})`);
  } else {
    await stmtMotores.update(existingId2, ordenMotor2);
    console.log(`[Seed] Motor ${ordenMotor2.folio} reemplazado (ID: ${existingId2})`);
  }

  persistDb();
  console.log('\n[Seed] Órdenes de motores insertadas correctamente.');
  console.log('  Motor: 2 órdenes entregadas (SP-M2605001, SP-M2605002)');
}

seedOrdenesMotores().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
