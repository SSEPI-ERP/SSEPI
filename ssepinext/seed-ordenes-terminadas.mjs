import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedOrdenesTerminadas() {
  const stmtTaller = await prepareStatement(db, 'local_ordenes_taller');
  const stmtAuto = await prepareStatement(db, 'local_proyectos_automatizacion');

  // Helper: evitar duplicados por folio (devuelve id si existe para reemplazar)
  async function existeFolio(tabla, folio) {
    const rows = await tabla.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
    return rows.length > 0 ? rows[0].local_id : null;
  }

  // ==================== ORDEN TALLER ENTREGADA ====================
  const ordenTaller = {
    folio: 'SP-E2605001',
    estado: 'Entregado',
    cliente_nombre: 'Industrias Monterrey S.A. de C.V.',
    cliente_id: null,
    equipo: 'Variador de Frecuencia ABB ACS580',
    marca: 'ABB',
    modelo: 'ACS580-01-025A-4',
    serie: 'ABB2024X00874',
    falla_reportada: 'El variador presenta falla "OVERCURRENT" al arrancar la bomba centrífuga de 20 HP. Ocurre después de 3-5 segundos de arranque. El cliente reportó que el problema inició tras una fluctuación de voltaje en la planta.',
    condiciones_fisicas: 'Carcasa en buen estado. Display funcional. Ventilador operativo. Conectores de potencia sin señales de arco eléctrico. Terminal box con sello intacto.',
    notas_internas: 'Diagnóstico: IGBT módulo de salida dañado en fase V. Fuente de 24V interna con ripple elevado (120mV en vez de <50mV). Se reemplazó IGBT y condensadores C14, C15 de la fuente interna. Prueba en banco: OK 3 ciclos de arranque/paro sin falla.',
    notas_generales: 'Garantía de 6 meses en reparación. Se recomienda instalar supresor de transitorios en la alimentación del variador.',
    tecnico_responsable: 'Ing. Roberto Sánchez',
    encargado_recepcion: 'Ing. Roberto Sánchez',
    prioridad: 'alta',
    fecha_ingreso: '2026-04-20T09:30',
    fecha_entrega: '2026-05-02T16:00',
    recibe_nombre: 'Ing. Carlos Domínguez',
    entrega_obs: 'Equipo probado y funcionando correctamente. Se entregó con reporte de prueba en banco.',
    horas_estimadas: 16,
    horas_invertido: 14,
    tiempo_entrega_dias: 10,
    // Arrays para _cargarDatosEnModal (refacciones_inventario / consumibles_usados)
    // Y también para _applyTallerDraft (diagnosticoInventario / consumiblesUsados)
    refacciones_enlaces: [
      { descripcion: 'Módulo IGBT ABB ACS580 fase V', cantidad: 1, costo: 4500, link: 'https://new.abb.com/products/3AUA0000xxxxx' },
      { descripcion: 'Condensador electrolítico 470µF/450V', cantidad: 2, costo: 180, link: 'https://www.mouser.mx/ProductDetail/xxxx' }
    ],
    refacciones_inventario: [
      { descripcion: 'Módulo IGBT ABB ACS580 fase V', cantidad: 1, costo: 4500 },
      { descripcion: 'Condensador electrolítico 470µF/450V', cantidad: 2, costo: 180 }
    ],
    consumibles_usados: [
      { descripcion: 'Pasta térmica disipador', cantidad: 1, costo: 85 },
      { descripcion: 'Cable de potencia 10 AWG (0.5m)', cantidad: 1, costo: 45 }
    ],
    diagnosticoEnlaces: [
      { descripcion: 'Módulo IGBT ABB ACS580 fase V', cantidad: 1, costo: 4500, link: 'https://new.abb.com/products/3AUA0000xxxxx' },
      { descripcion: 'Condensador electrolítico 470µF/450V', cantidad: 2, costo: 180, link: 'https://www.mouser.mx/ProductDetail/xxxx' }
    ],
    diagnosticoInventario: [
      { descripcion: 'Módulo IGBT ABB ACS580 fase V', cantidad: 1, costo: 4500 },
      { descripcion: 'Condensador electrolítico 470µF/450V', cantidad: 2, costo: 180 }
    ],
    consumiblesUsados: [
      { descripcion: 'Pasta térmica disipador', cantidad: 1, costo: 85 },
      { descripcion: 'Cable de potencia 10 AWG (0.5m)', cantidad: 1, costo: 45 }
    ],
    componentes_inventario: [
      { descripcion: 'Pasta térmica disipador', cantidad: 1, costo: 85 },
      { descripcion: 'Cable de potencia 10 AWG (0.5m)', cantidad: 1, costo: 45 }
    ],
    componentes_compra: [
      { descripcion: 'Varistor de protección 275V', cantidad: 3, costo_unitario: 450, subtotal: 1350, link: 'https://www.digikey.mx/products/xxxxx' },
      { descripcion: 'Fusible cerámico 32A gG', cantidad: 2, costo_unitario: 120, subtotal: 240, link: 'https://www.mouser.mx/ProductDetail/xxxxx' },
      { descripcion: 'Disipador aluminio anodizado', cantidad: 1, costo_unitario: 890, subtotal: 890 }
    ],
    componentesInventario: [
      { descripcion: 'Pasta térmica disipador', cantidad: 1, costo: 85 },
      { descripcion: 'Cable de potencia 10 AWG (0.5m)', cantidad: 1, costo: 45 }
    ],
    componentesCompra: [
      { descripcion: 'Varistor de protección 275V', cantidad: 3, costo_unitario: 450, subtotal: 1350, link: 'https://www.digikey.mx/products/xxxxx' },
      { descripcion: 'Fusible cerámico 32A gG', cantidad: 2, costo_unitario: 120, subtotal: 240, link: 'https://www.mouser.mx/ProductDetail/xxxxx' },
      { descripcion: 'Disipador aluminio anodizado', cantidad: 1, costo_unitario: 890, subtotal: 890 }
    ],
    componentes_extras: [
      { descripcion: 'Varistor de protección 275V', cantidad: 3, costo_unitario: 450, subtotal: 1350 },
      { descripcion: 'Fusible cerámico 32A gG', cantidad: 2, costo_unitario: 120, subtotal: 240 },
      { descripcion: 'Disipador aluminio anodizado', cantidad: 1, costo_unitario: 890, subtotal: 890 }
    ],
    reparacion_notas: 'Se reemplazó módulo IGBT de fase V y condensadores de fuente interna. Se aplicó pasta térmica nueva en disipador. Prueba en banco satisfactoria: 3 ciclos completos de arranque/paro sin falla. Corriente de salida estable en las 3 fases. ADEMÁS: se agregaron varistores de protección, fusibles cerámicos y disipador anodizado por excedente de temperatura detectado en prueba prolongada.',
    costo_mano_obra: 3500,
    costo_refacciones: 4680,
    costo_consumibles: 130,
    costo_total: 8310,
    km_distancia: 0,
    horas_viaje: 0,
    utilidad_factor: 1.4
  };

  const existingId1 = await existeFolio(stmtTaller, ordenTaller.folio);
  if (!existingId1) {
    const tallerResult = await stmtTaller.insert(null, ordenTaller);
    console.log(`[Seed] Taller ENTREGADA: ${ordenTaller.folio} — ${ordenTaller.equipo} (ID: ${tallerResult.id})`);
  } else {
    await stmtTaller.update(existingId1, ordenTaller);
    console.log(`[Seed] Taller ${ordenTaller.folio} reemplazada (ID: ${existingId1})`);
  }

  const ordenTaller2 = {
    folio: 'SP-E2605002',
    estado: 'Entregado',
    cliente_nombre: 'Cervecería del Norte S.A.',
    cliente_id: null,
    equipo: 'PLC Allen-Bradley CompactLogix L33ER',
    marca: 'Allen-Bradley / Rockwell',
    modelo: '1769-L33ER',
    serie: 'AB2025N04219',
    falla_reportada: 'El PLC pierde comunicación con el módulo de entrada/salida remoto (1756-EN2T) de forma intermitente. La línea de embotellado se detiene 2-3 veces por turno. El indicador MS del parpadea entre verde y rojo.',
    condiciones_fisicas: 'Carcasa sin golpes. Conectores de campo bus intactos. LED de run parpadeando. Disipador limpio.',
    notas_internas: 'Diagnóstico: Firmware corrupto en módulo de comunicación EN2T. Se actualizó firmware a v11.012. También se reemplazó módulo EN2T dañado. Se verificó configuración de red EtherNet/IP y se ajustó RPI a 50ms en módulos remotos.',
    notas_generales: 'Se recomienda instalar UPS en la alimentación del PLC y gabinete de control. Garantía de 3 meses en la reparación.',
    tecnico_responsable: 'Ing. Roberto Sánchez',
    encargado_recepcion: 'Ing. Roberto Sánchez',
    prioridad: 'media',
    fecha_ingreso: '2026-04-25T10:00',
    fecha_entrega: '2026-05-04T14:30',
    recibe_nombre: 'Lic. Patricia Mendoza',
    entrega_obs: 'Sistema de control operativo. Se realizaron pruebas de comunicación continua por 4 horas sin interrupciones.',
    horas_estimadas: 20,
    horas_invertido: 18,
    tiempo_entrega_dias: 8,
    refacciones_enlaces: [
      { descripcion: 'Módulo comunicación EN2T 1756-EN2T', cantidad: 1, costo: 8200, link: 'https://www.rockwellautomation.com/products/xxxxx' },
      { descripcion: 'Cable Ethernet Cat6 industrial 5m', cantidad: 3, costo: 350, link: 'https://www.mouser.mx/ProductDetail/xxxxx' }
    ],
    refacciones_inventario: [
      { descripcion: 'Módulo comunicación EN2T 1756-EN2T', cantidad: 1, costo: 8200 },
      { descripcion: 'Cable Ethernet Cat6 industrial 5m', cantidad: 3, costo: 350 }
    ],
    consumibles_usados: [],
    diagnosticoEnlaces: [
      { descripcion: 'Módulo comunicación EN2T 1756-EN2T', cantidad: 1, costo: 8200, link: 'https://www.rockwellautomation.com/products/xxxxx' },
      { descripcion: 'Cable Ethernet Cat6 industrial 5m', cantidad: 3, costo: 350, link: 'https://www.mouser.mx/ProductDetail/xxxxx' }
    ],
    diagnosticoInventario: [
      { descripcion: 'Módulo comunicación EN2T 1756-EN2T', cantidad: 1, costo: 8200 },
      { descripcion: 'Cable Ethernet Cat6 industrial 5m', cantidad: 3, costo: 350 }
    ],
    consumiblesUsados: [],
    componentes_inventario: [
      { descripcion: 'Conector RJ45 industrial M12', cantidad: 4, costo: 120 }
    ],
    componentes_compra: [
      { descripcion: 'Switch Ethernet industrial 8 puertos', cantidad: 1, costo_unitario: 4500, subtotal: 4500, link: 'https://www.phoenixcontact.com/xxxxx' }
    ],
    componentesInventario: [
      { descripcion: 'Conector RJ45 industrial M12', cantidad: 4, costo: 120 }
    ],
    componentesCompra: [
      { descripcion: 'Switch Ethernet industrial 8 puertos', cantidad: 1, costo_unitario: 4500, subtotal: 4500, link: 'https://www.phoenixcontact.com/xxxxx' }
    ],
    reparacion_notas: 'Se actualizó firmware del módulo EN2T a v11.012. Se reemplazó módulo EN2T con dirección IP configurada. Se ajustó RPI a 50ms en módulos remotos para estabilizar comunicación EtherNet/IP. Sin extras ni adeudos: trabajo dentro del presupuesto aprobado.',
    costo_mano_obra: 5200,
    costo_refacciones: 8200,
    costo_consumibles: 120,
    costo_total: 13520,
    km_distancia: 0,
    horas_viaje: 0,
    utilidad_factor: 1.4
  };

  const existingId2 = await existeFolio(stmtTaller, ordenTaller2.folio);
  if (!existingId2) {
    const taller2Result = await stmtTaller.insert(null, ordenTaller2);
    console.log(`[Seed] Taller ENTREGADA: ${ordenTaller2.folio} — ${ordenTaller2.equipo} (ID: ${taller2Result.id})`);
  } else {
    await stmtTaller.update(existingId2, ordenTaller2);
    console.log(`[Seed] Taller ${ordenTaller2.folio} reemplazada (ID: ${existingId2})`);
  }

  // ==================== PROYECTO AUTOMATIZACIÓN COMPLETADO ====================
  const proyectoAuto = {
    folio: 'SP-A2605/1',
    estado: 'completado',
    etapa_actual: 5,
    avance: 100,
    cliente_nombre: 'Alimentos del Bajío S.A. de C.V.',
    cliente: 'Alimentos del Bajío S.A. de C.V.',
    rfc: 'ABJ260512345',
    direccion: 'Parque Industrial Silao, Guanajuato, C.P. 36100',
    nombre: 'Automatización Línea de Ensamble C3',
    vendedor: 'Ing. Iván García',
    ingeniero: 'Ing. Iván García',
    fecha_creacion: '2026-04-10',
    fecha: '2026-04-10',
    notas_generales: 'Proyecto de automatización de línea de ensamble C3. Incluye diseño de sistema de control, programación de PLC, instalación de sensores y actuadores, HMI para operador, y puesta en marcha. La línea ahora opera a 45 ppm (piezas por minuto) con 99.2% de eficiencia OEE.',
    notas_internas: 'Se utilizó PLC Siemens S7-1500 con TIA Portal V18. HMI Siemens KTP1200. Comunicación PROFINET con 12 estaciones remotas. Se programaron 8 bloques de función para control de secuencias. Prueba SAT completada el 2026-05-01.',
    materiales: [
      { nombre: 'PLC Siemens S7-1500 CPU 1515', sku: '6ES7515-1UP00-0AB0', cantidad: 1, costo: 45000 },
      { nombre: 'HMI Siemens KTP1200 Basic', sku: '6AV2123-2GB03-0AX0', cantidad: 1, costo: 18000 },
      { nombre: 'Módulo entrada digital 32pts', sku: '6ES7521-1BL00-0AB0', cantidad: 3, costo: 3600 },
      { nombre: 'Módulo salida digital 32pts', sku: '6ES7522-1BL00-0AB0', cantidad: 2, costo: 2800 },
      { nombre: 'Fuente alimentación 24V/20A', sku: '6EP1333-4BA00', cantidad: 2, costo: 3200 },
      { nombre: 'Sensor fotoeléctrico SICK WL12', sku: 'SICK-WL12-2P430', cantidad: 8, costo: 4800 },
      { nombre: 'Cilindro neumático Festo DSBC', sku: 'FESTO-DSBC-50-200', cantidad: 6, costo: 5400 },
      { nombre: 'Cable PROFINET Cat6 industrial', sku: 'CABLE-PN-C6-5M', cantidad: 12, costo: 1800 }
    ],
    actividades: [
      { area: 'Diseño', servicio: 'Ingeniería de detalle y diagramas', nombre: 'Ingeniería de detalle', horas: 40, tipo: 'Oficina', inicio: '2026-04-12', fin: '2026-04-18' },
      { area: 'Programación', servicio: 'Programación PLC y HMI', nombre: 'Programación PLC S7-1500', horas: 80, tipo: 'Oficina', inicio: '2026-04-14', fin: '2026-04-25' },
      { area: 'Instalación', servicio: 'Instalación eléctrica y neumática', nombre: 'Instalación en campo', horas: 60, tipo: 'Planta', inicio: '2026-04-22', fin: '2026-04-28' },
      { area: 'Pruebas', servicio: 'Pruebas SAT y puesta en marcha', nombre: 'Puesta en marcha', horas: 40, tipo: 'Planta', inicio: '2026-04-28', fin: '2026-05-01' },
      { area: 'Entrega', servicio: 'Capacitación y documentación', nombre: 'Capacitación operadores', horas: 16, tipo: 'Planta', inicio: '2026-05-02', fin: '2026-05-03' }
    ],
    epicas: [
      { titulo: 'Diseño e Ingeniería', tareas: [{ nombre: 'Diagramas unifilares' }, { nombre: 'Lista de materiales' }, { nombre: 'Layout de gabinete' }] },
      { titulo: 'Programación y Configuración', tareas: [{ nombre: 'Programa PLC principal' }, { nombre: 'Bloques de función' }, { nombre: 'Pantallas HMI' }, { nombre: 'Configuración PROFINET' }] },
      { titulo: 'Instalación y Montaje', tareas: [{ nombre: 'Armado de gabinete' }, { nombre: 'Tendido de cableado' }, { nombre: 'Conexión de sensores/actuadores' }] },
      { titulo: 'Pruebas y Puesta en Marcha', tareas: [{ nombre: 'Prueba FAT en taller' }, { nombre: 'Prueba SAT en planta' }, { nombre: 'Ajuste de parámetros' }] },
      { titulo: 'Entrega y Documentación', tareas: [{ nombre: 'Manual de operación' }, { nombre: 'Capacitación' }, { nombre: 'Acta de entrega firmada' }] }
    ],
    fecha_entrega: '2026-05-03',
    costo_mano_obra: 118000,
    costo_materiales: 84600,
    costo_total: 202600
  };

  const existingAuto1 = await existeFolio(stmtAuto, proyectoAuto.folio);
  if (!existingAuto1) {
    const autoResult = await stmtAuto.insert(null, proyectoAuto);
    console.log(`[Seed] Auto COMPLETADO: ${proyectoAuto.folio} — ${proyectoAuto.nombre} (ID: ${autoResult.id})`);
  } else {
    await stmtAuto.update(existingAuto1, proyectoAuto);
    console.log(`[Seed] Auto ${proyectoAuto.folio} reemplazado (ID: ${existingAuto1})`);
  }

  const proyectoAuto2 = {
    folio: 'SP-A2605/2',
    estado: 'completado',
    etapa_actual: 5,
    avance: 100,
    cliente_nombre: 'Plásticos del Centro S. de R.L.',
    cliente: 'Plásticos del Centro S. de R.L.',
    rfc: 'PCE260598765',
    direccion: 'Zona Industrial Celaya, Guanajuato, C.P. 38010',
    nombre: 'Sistema de Control de Temperatura Extrusora',
    vendedor: 'Ing. Iván García',
    ingeniero: 'Ing. Iván García',
    fecha_creacion: '2026-04-05',
    fecha: '2026-04-05',
    notas_generales: 'Proyecto de automatización para control de temperatura de 6 zonas de extrusora de plástico. Se implementó control PID con PLC Delta DVP y módulos de temperatura. El sistema mantiene variación de ±0.5°C en cada zona, mejorando la calidad del producto terminado.',
    notas_internas: 'PLC Delta DVP-14SS211R con módulos de temperatura DVP-04TC-H2. HMI Delta DOP-107IW. Comunicación Modbus RTU entre PLC y módulos. Se calibraron termopares tipo J en cada zona. Prueba de estabilidad térmica completada con 8 horas continuas sin desviación.',
    materiales: [
      { nombre: 'PLC Delta DVP-14SS211R', sku: 'DVP-14SS211R', cantidad: 1, costo: 8500 },
      { nombre: 'Módulo temperatura Delta DVP-04TC-H2', sku: 'DVP-04TC-H2', cantidad: 2, costo: 5400 },
      { nombre: 'HMI Delta DOP-107IW', sku: 'DOP-107IW', cantidad: 1, costo: 6200 },
      { nombre: 'Termopar tipo J con vaina SS304', sku: 'TC-J-SS304-1M', cantidad: 6, costo: 1800 },
      { nombre: 'Solid state relay 40A', sku: 'SSR-40DA', cantidad: 6, costo: 2400 },
      { nombre: 'Resistencia cartridge 220V/1kW', sku: 'RES-220-1K', cantidad: 6, costo: 3600 }
    ],
    actividades: [
      { area: 'Diseño', servicio: 'Ingeniería y selección de equipos', nombre: 'Ingeniería del proyecto', horas: 24, tipo: 'Oficina', inicio: '2026-04-07', fin: '2026-04-10' },
      { area: 'Programación', servicio: 'Programación PLC y HMI con lazos PID', nombre: 'Programación control PID', horas: 48, tipo: 'Oficina', inicio: '2026-04-11', fin: '2026-04-17' },
      { area: 'Instalación', servicio: 'Montaje e instalación en extrusora', nombre: 'Instalación en campo', horas: 32, tipo: 'Planta', inicio: '2026-04-15', fin: '2026-04-20' },
      { area: 'Pruebas', servicio: 'Calibración y prueba de estabilidad', nombre: 'Calibración y comisionado', horas: 24, tipo: 'Planta', inicio: '2026-04-21', fin: '2026-04-25' }
    ],
    epicas: [
      { titulo: 'Diseño', tareas: [{ nombre: 'Selección de sensores' }, { nombre: 'Diagrama de control' }] },
      { titulo: 'Programación PID', tareas: [{ nombre: 'Configuración lazos' }, { nombre: 'Pantallas HMI' }, { nombre: 'Alarmas' }] },
      { titulo: 'Instalación', tareas: [{ nombre: 'Montaje SSR y resistencias' }, { nombre: 'Cableado termopares' }] },
      { titulo: 'Comisionado', tareas: [{ nombre: 'Calibración' }, { nombre: 'Prueba de estabilidad 8hrs' }] }
    ],
    fecha_entrega: '2026-04-25',
    costo_mano_obra: 64000,
    costo_materiales: 27900,
    costo_total: 91900
  };

  const existingAuto2 = await existeFolio(stmtAuto, proyectoAuto2.folio);
  if (!existingAuto2) {
    const auto2Result = await stmtAuto.insert(null, proyectoAuto2);
    console.log(`[Seed] Auto COMPLETADO: ${proyectoAuto2.folio} — ${proyectoAuto2.nombre} (ID: ${auto2Result.id})`);
  } else {
    await stmtAuto.update(existingAuto2, proyectoAuto2);
    console.log(`[Seed] Auto ${proyectoAuto2.folio} reemplazado (ID: ${existingAuto2})`);
  }

  persistDb();
  console.log('\n[Seed] Órdenes terminadas insertadas correctamente.');
  console.log('  Taller:  2 órdenes entregadas (SP-E2605001, SP-E2605002)');
  console.log('  Auto:    2 proyectos completados (SP-A2605/1, SP-A2605/2)');
  console.log('\nAhora puedes abrir estas órdenes en el panel y generar los reportes PDF.');
}

seedOrdenesTerminadas().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});