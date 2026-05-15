import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedAutomatizacion() {
  const stmt = await prepareStatement(db, 'local_proyectos_automatizacion');
  const stmtCot = await prepareStatement(db, 'local_cotizaciones');
  const stmtComp = await prepareStatement(db, 'local_compras');
  const stmtFact = await prepareStatement(db, 'local_facturas');

  const proyectos = [
    {
      folio: 'SP-A25001',
      cliente_nombre: 'BOLSAS DE LOS ALTOS',
      proyecto_nombre: 'Actualización de Panel HMI y PLC Allen-Bradley',
      descripcion: 'Modernización del sistema de control de la línea de producción de bolsas. Se requiere migrar de PanelView Plus 600 a PanelView Plus 7 Performance, actualizar el firmware del PLC CompactLogix 1769-L33ER y reconfigurar la comunicación EtherNet/IP.',
      alcance: '1. Desmontaje del HMI existente\n2. Instalación del nuevo PanelView Plus 7\n3. Actualización de firmware PLC\n4. Reconfiguración de tags y comunicaciones\n5. Pruebas de funcionamiento\n6. Capacitación al operador',
      equipo: 'PanelView Plus 7 Performance 10"',
      marca: 'Allen-Bradley',
      modelo: '2711P-T10C22D9P-B',
      serie: 'AB2026004581',
      estado: 'Nuevo',
      prioridad: 'Alta',
      fecha_inicio: new Date().toISOString(),
      fecha_entrega_estimada: new Date(Date.now() + 14*24*60*60*1000).toISOString(),
      tecnico_responsable: 'Dani',
      ingeniero_responsable: 'Ing. Roberto Moro',
      costo_mano_obra: 25000,
      costo_materiales: 18000,
      costo_viaje: 4500,
      costo_total: 47500,
      km_distancia: 113,
      horas_viaje: 5,
      notas_internas: 'Proyecto de automatización con costos calculados. Cliente frecuente.',
      notas_generales: 'Incluye garantía de 90 días en programación.',
      bajo_garantia: false,
      ubicacion: 'Planta Los Limones, León Gto.',
      contacto_cliente: 'Ing. Juan Pérez',
      telefono_contacto: '477 123 4567',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      folio: 'SP-A25002',
      cliente_nombre: 'COFICAB',
      proyecto_nombre: 'Instalación de Servomotores y Variadores de Frecuencia',
      descripcion: 'Instalación de 4 servomotores Panasonic MINAS A6 en la línea de extrusión de cables. Integración con variadores de frecuencia Delta VFD-C2000 para control de velocidad sincronizada. Programación de motion profiles para corte preciso.',
      alcance: '1. Instalación mecánica de servomotores\n2. Cableado de control y potencia\n3. Configuración de variadores VFD-C2000\n4. Programación de perfiles de movimiento\n5. Integración con encoder de línea\n6. Ajuste de ganancias y tuning',
      equipo: 'Servomotor MINAS A6 + Variador VFD-C2000',
      marca: 'Panasonic / Delta',
      modelo: 'MSMF042L1U2M / VFD022C23A',
      serie: 'SV2026041201',
      estado: 'En progreso',
      prioridad: 'Normal',
      fecha_inicio: new Date().toISOString(),
      fecha_entrega_estimada: new Date(Date.now() + 21*24*60*60*1000).toISOString(),
      tecnico_responsable: 'Carlos',
      ingeniero_responsable: 'Ing. Roberto Moro',
      costo_mano_obra: 35000,
      costo_materiales: 42000,
      costo_viaje: 3200,
      costo_total: 80200,
      km_distancia: 40,
      horas_viaje: 3,
      notas_internas: 'Proyecto complejo. Requiere coordinación con producción.',
      notas_generales: 'El cliente opera 24/7; trabajo por turnos.',
      bajo_garantia: false,
      ubicacion: 'Planta Coficab Silao, Gto.',
      contacto_cliente: 'Lic. María González',
      telefono_contacto: '472 987 6543',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      folio: 'SP-A25003',
      cliente_nombre: 'ECOBOLSAS',
      proyecto_nombre: 'Retrofit de Controlador Lógico Programable (PLC)',
      descripcion: 'Reemplazo del PLC Siemens S7-300 obsoleto por un nuevo S7-1500. Migración completa del programa STEP 7 v5.6 a TIA Portal v17. Actualización de los módulos de I/O y red PROFINET.',
      alcance: '1. Backup del programa existente\n2. Desmontaje del rack S7-300\n3. Instalación del rack S7-1500\n4. Migración de programa a TIA Portal\n5. Reconfiguración de red PROFINET\n6. Pruebas FAT y SAT',
      equipo: 'PLC SIMATIC S7-1500',
      marca: 'Siemens',
      modelo: '6ES7511-1AK02-0AB0',
      serie: 'SI2026038912',
      estado: 'Pendiente',
      prioridad: 'Urgente',
      fecha_inicio: new Date().toISOString(),
      fecha_entrega_estimada: new Date(Date.now() + 10*24*60*60*1000).toISOString(),
      tecnico_responsable: 'Dani',
      ingeniero_responsable: 'Ing. Roberto Moro',
      costo_mano_obra: 18000,
      costo_materiales: 25000,
      costo_viaje: 4300,
      costo_total: 47300,
      km_distancia: 108,
      horas_viaje: 5,
      notas_internas: 'Urgente por paro de producción. Material en camino.',
      notas_generales: 'Coordinar ingreso a planta con seguridad.',
      bajo_garantia: false,
      ubicacion: 'Planta Ecobolsas León, Gto.',
      contacto_cliente: 'C.P. Ana López',
      telefono_contacto: '477 456 7890',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  for (const p of proyectos) {
    const orden = await stmt.insert(null, p);
    console.log(`[Seed-Auto] Proyecto ${p.folio} creado: ${p.cliente_nombre} — ${p.proyecto_nombre}`);

    // Crear cotización vinculada
    const folioCot = `COT-A${p.folio.slice(-3)}`;
    const totalConIva = (p.costo_total || 0) * 1.16;
    const cotData = {
      folio: folioCot,
      tipo_folio: 'COT',
      cliente_nombre: p.cliente_nombre,
      cliente: p.cliente_nombre,
      vendedor: 'Ventas SSEPI',
      subtotal: p.costo_total || 0,
      iva: (p.costo_total || 0) * 0.16,
      total: totalConIva,
      km_distancia: p.km_distancia || 0,
      horas_viaje: p.horas_viaje || 0,
      costo_gasolina: ((p.km_distancia || 0) * 2 / 10) * 30,
      costo_traslado: p.costo_viaje || 0,
      estado: 'Pendiente',
      origen: 'automatizacion',
      departamento: 'Automatización',
      orden_origen_id: orden?.local_id || null,
      cerebro_registro: {
        folio_operativo: p.folio,
        departamento: 'Automatización',
        descripcion: p.descripcion,
        origen_cotizacion: 'automatizacion',
        orden_id: orden?.local_id || null
      },
      items: [
        { descripcion: p.proyecto_nombre, cantidad: 1, precio_unitario: p.costo_total || 0, importe: p.costo_total || 0 }
      ],
      fecha_cotizacion: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const cotInsertado = await stmtCot.insert(null, cotData);

    // Compra vinculada
    const folioComp = `CMP-A${p.folio.slice(-3)}`;
    const compData = {
      folio: folioComp,
      proveedor: 'Por asignar',
      proveedor_nombre: 'Por asignar',
      departamento: 'Automatización',
      subtotal: p.costo_materiales || 0,
      iva: (p.costo_materiales || 0) * 0.16,
      total: (p.costo_materiales || 0) * 1.16,
      estatus_pago: 'Solicitud',
      estado: 1,
      vinculacion: { tipo: 'automatizacion', id: orden?.local_id, nombre: p.cliente_nombre, folio_taller: p.folio },
      notas: `Solicitud generada desde Ventas para proyecto ${p.folio} (automatizacion)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await stmtComp.insert(null, compData);

    // Factura vinculada
    const folioFac = `FAC-A${p.folio.slice(-3)}`;
    const facData = {
      folio: folioFac,
      folio_factura: folioFac,
      cliente: p.cliente_nombre,
      cliente_nombre: p.cliente_nombre,
      total: totalConIva,
      estatus: 'pendiente',
      estado: 'pendiente',
      venta_id: cotInsertado?.local_id || null,
      fecha_emision: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await stmtFact.insert(null, facData);

    console.log(`[Seed-Auto]   → cot:${folioCot}, comp:${folioComp}, fac:${folioFac}`);
  }

  persistDb();
  console.log('[Seed-Auto] Proyectos de automatización creados con cotizaciones, compras y facturas vinculadas.');
}

seedAutomatizacion().catch(err => {
  console.error('[Seed-Auto] Error:', err);
  process.exit(1);
});
