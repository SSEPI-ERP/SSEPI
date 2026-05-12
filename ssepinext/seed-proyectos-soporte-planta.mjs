import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedProyectosSoportePlanta() {
  const stmtAuto = await prepareStatement(db, 'local_proyectos_automatizacion');

  async function existeFolio(tabla, folio) {
    const rows = await tabla.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
    return rows.length > 0 ? rows[0].local_id : null;
  }

  // ==================== PROYECTO SOPORTE EN PLANTA 1 ====================
  const proyectoSoporte1 = {
    folio: 'SP-A2605-SP1',
    estado: 'completado',
    etapa_actual: 5,
    avance: 100,
    cliente_nombre: 'Textiles del Bajío S.A. de C.V.',
    cliente: 'Textiles del Bajío S.A. de C.V.',
    rfc: 'TBJ260512345',
    direccion: 'Parque Industrial León, Guanajuato, C.P. 37200',
    nombre: 'Soporte Técnico Mensual Línea de Tejido',
    vendedor: 'Ing. Iván García',
    ingeniero: 'Ing. Iván García',
    fecha_creacion: '2026-03-01',
    fecha: '2026-03-01',
    notas_generales: 'Contrato de soporte técnico mensual para línea de tejido automático. Incluye mantenimiento preventivo de PLC, sensores, variadores y HMI. Se realizan visitas quincenales con reporte de estado. Respuesta de emergencia en 4 horas.',
    notas_internas: 'Se realizaron 6 visitas de mantenimiento preventivo. Se calibraron sensores de tensión de hilo. Se actualizó firmware de variadores ABB ACS355. Se limpió y ajustó encoder de posicionamiento. Se respaldó programa PLC y se entregó copia al cliente.',
    materiales: [
      { nombre: 'Sensor de tensión hilo 0-50N', sku: 'TENS-50N-4-20MA', cantidad: 2, costo: 3200 },
      { nombre: 'Variador ABB ACS355 5.5kW', sku: 'ACS355-03E-09A8-4', cantidad: 1, costo: 18500 },
      { nombre: 'Encoder incremental 1024ppr', sku: 'ENC-1024-HTL', cantidad: 1, costo: 4200 }
    ],
    actividades: [
      { area: 'Mantenimiento', servicio: 'Mantenimiento preventivo PLC y sensores', nombre: 'Mantenimiento preventivo quincenal', horas: 8, tipo: 'Planta', inicio: '2026-03-05', fin: '2026-03-05' },
      { area: 'Calibración', servicio: 'Calibración sensores de tensión', nombre: 'Calibración sensores', horas: 4, tipo: 'Planta', inicio: '2026-03-12', fin: '2026-03-12' },
      { area: 'Actualización', servicio: 'Actualización firmware variadores', nombre: 'Update firmware ABB', horas: 3, tipo: 'Planta', inicio: '2026-03-19', fin: '2026-03-19' }
    ],
    epicas: [
      { titulo: 'Mantenimiento Preventivo', tareas: [{ nombre: 'Inspección PLC y módulos' }, { nombre: 'Limpieza gabinetes' }, { nombre: 'Verificación conexiones' }] },
      { titulo: 'Calibración y Ajuste', tareas: [{ nombre: 'Calibrar sensores tensión' }, { nombre: 'Ajustar parámetros variadores' }] },
      { titulo: 'Documentación', tareas: [{ nombre: 'Reporte de estado' }, { nombre: 'Respaldo programa PLC' }] }
    ],
    fecha_entrega: '2026-03-31',
    costo_mano_obra: 45000,
    costo_materiales: 25900,
    costo_total: 70900
  };

  const existing1 = await existeFolio(stmtAuto, proyectoSoporte1.folio);
  if (!existing1) {
    const result = await stmtAuto.insert(null, proyectoSoporte1);
    console.log(`[Seed] Soporte Planta COMPLETADO: ${proyectoSoporte1.folio} — ${proyectoSoporte1.nombre} (ID: ${result.id})`);
  } else {
    await stmtAuto.update(existing1, proyectoSoporte1);
    console.log(`[Seed] Soporte Planta ${proyectoSoporte1.folio} reemplazado (ID: ${existing1})`);
  }

  // ==================== PROYECTO SOPORTE EN PLANTA 2 ====================
  const proyectoSoporte2 = {
    folio: 'SP-A2605-SP2',
    estado: 'completado',
    etapa_actual: 5,
    avance: 100,
    cliente_nombre: 'Embotelladora del Centro S.A. de C.V.',
    cliente: 'Embotelladora del Centro S.A. de C.V.',
    rfc: 'EMC260598765',
    direccion: 'Zona Industrial Querétaro, Qro., C.P. 76130',
    nombre: 'Diagnóstico y Reparación Línea de Llenado',
    vendedor: 'Ing. Iván García',
    ingeniero: 'Ing. Iván García',
    fecha_creacion: '2026-04-08',
    fecha: '2026-04-08',
    notas_generales: 'Servicio de emergencia por paro total de línea de llenado. Falla en sistema de visión artificial que causaba rechazo masivo de botellas. Se diagnosticó y reparó en 48 horas incluyendo viaje a planta.',
    notas_internas: 'Diagnóstico: Cámara Cognex IS7802 con lente contaminado por vapor de agua. Se reemplazó lente protegido con anillo de aire anti-vaho. Se recalibró sistema de visión con nuevo patrón de referencia. Se ajustó velocidad de disparo a 120fps para línea a 360 botellas/minuto.',
    materiales: [
      { nombre: 'Cámara Cognex IS7802C-363-50', sku: 'IS7802C-363-50', cantidad: 1, costo: 28500 },
      { nombre: 'Lente 25mm C-Mount con anillo aire', sku: 'LENTE-25MM-AIR', cantidad: 1, costo: 4200 },
      { nombre: 'Fuente LED coaxial 24V', sku: 'LED-COAX-24V-100', cantidad: 1, costo: 1800 }
    ],
    actividades: [
      { area: 'Diagnóstico', servicio: 'Diagnóstico en sitio de sistema de visión', nombre: 'Diagnóstico emergencia', horas: 6, tipo: 'Planta', inicio: '2026-04-09', fin: '2026-04-09' },
      { area: 'Reparación', servicio: 'Reemplazo de cámara y recalibración', nombre: 'Reparación y recalibración', horas: 12, tipo: 'Planta', inicio: '2026-04-09', fin: '2026-04-10' },
      { area: 'Pruebas', servicio: 'Prueba de línea a velocidad nominal', nombre: 'Prueba producción', horas: 4, tipo: 'Planta', inicio: '2026-04-10', fin: '2026-04-10' }
    ],
    epicas: [
      { titulo: 'Diagnóstico', tareas: [{ nombre: 'Inspección cámara y lente' }, { nombre: 'Prueba de disparo' }, { nombre: 'Verificar iluminación' }] },
      { titulo: 'Reparación', tareas: [{ nombre: 'Reemplazar cámara y lente' }, { nombre: 'Instalar anillo de aire' }, { nombre: 'Recalibrar sistema' }] },
      { titulo: 'Pruebas', tareas: [{ nombre: 'Prueba a 360 botellas/min' }, { nombre: 'Verificar rechazo falsos' }, { nombre: 'Entregar reporte' }] }
    ],
    fecha_entrega: '2026-04-11',
    costo_mano_obra: 28000,
    costo_materiales: 34500,
    costo_total: 62500
  };

  const existing2 = await existeFolio(stmtAuto, proyectoSoporte2.folio);
  if (!existing2) {
    const result = await stmtAuto.insert(null, proyectoSoporte2);
    console.log(`[Seed] Soporte Planta COMPLETADO: ${proyectoSoporte2.folio} — ${proyectoSoporte2.nombre} (ID: ${result.id})`);
  } else {
    await stmtAuto.update(existing2, proyectoSoporte2);
    console.log(`[Seed] Soporte Planta ${proyectoSoporte2.folio} reemplazado (ID: ${existing2})`);
  }

  persistDb();
  console.log('\n[Seed] Proyectos Soporte en Planta insertados correctamente.');
  console.log('  Soporte: 2 proyectos completados (SP-A2605-SP1, SP-A2605-SP2)');
}

seedProyectosSoportePlanta().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
