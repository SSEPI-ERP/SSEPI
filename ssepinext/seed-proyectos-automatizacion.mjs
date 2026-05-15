import { getDb, persistDb, prepareStatement } from './db.mjs';

const db = await getDb();

async function seedProyectosAutomatizacion() {
  const stmt = await prepareStatement(db, 'local_proyectos_automatizacion');

  // Helper: evitar duplicados por folio
  async function existeFolio(folio) {
    const rows = await stmt.query("json_extract(data, '$.folio') = ?", [folio], 'id ASC', 1);
    return rows.length > 0 ? rows[0].local_id : null;
  }

  const proyectos = [
    {
      folio: 'SP-A2605/1',
      nombre: 'Línea de Ensamble C3',
      cliente: 'Alimentos del Bajío S.A. de C.V.',
      cliente_nombre: 'Alimentos del Bajío S.A. de C.V.',
      fecha: '2026-04-10',
      fecha_inicio: '2026-04-10T09:00:00.000Z',
      vendedor: 'Ing. Iván García',
      ingeniero: 'Ing. Iván García',
      notas_generales: 'Proyecto de automatización línea de ensamble C3. PLC Siemens S7-1500, HMI KTP1200, 12 estaciones PROFINET.',
      notas_internas: 'Entrega completada el 3 de mayo. Cliente capacitado.',
      estado: 'completado',
      etapa_actual: 5,
      avance: 100,
      costo_total: 235016,
      costo_presupuestado: 200000,
      costo_real: 235016,
      adeudo_generado: 35016,
      rentabilidad_estado: 'rojo',
      actividades: [
        { area: 'Diseño', servicio: 'Diseño arquitectura de control', tipo: 'O', horas: 6 },
        { area: 'Eléctrica', servicio: 'Diseño tablero BT', tipo: 'O', horas: 8 },
        { area: 'Control', servicio: 'Programación PLC', tipo: 'O', horas: 10 }
      ],
      materiales: [
        { nombre: 'PLC S7-1500', sku: '6ES7511-1AK02-0AB0', cantidad: 1, costo_unitario: 45000 },
        { nombre: 'HMI KTP1200', sku: '6AV2123-2MB03-0AX0', cantidad: 1, costo_unitario: 28000 },
        { nombre: 'Módulo E/S DI16', sku: '6ES7521-1BH50-0AA0', cantidad: 3, costo_unitario: 3200 }
      ],
      epicas: [],
      apartados: [
        { id: 'ap1', titulo: 'Formato de entrega', nota: 'Entregado 2026-05-03', archivos: [] },
        { id: 'ap2', titulo: 'Manual de operación', nota: 'Incluido', archivos: [] },
        { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
        { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
        { id: 'ap5', titulo: 'Respaldos de programa', nota: 'Backup en NAS', archivos: [] }
      ],
      fechas_etapas: {
        etapa1_inicio: '2026-04-10T09:00:00.000Z',
        etapa1_fin: '2026-04-11T18:00:00.000Z',
        etapa2_inicio: '2026-04-12T09:00:00.000Z',
        etapa2_fin: '2026-04-14T18:00:00.000Z',
        etapa3_inicio: '2026-04-15T09:00:00.000Z',
        etapa3_fin: '2026-04-17T18:00:00.000Z',
        etapa4_inicio: '2026-04-18T09:00:00.000Z',
        etapa4_fin: '2026-04-30T18:00:00.000Z',
        etapa5_inicio: '2026-05-01T09:00:00.000Z',
        etapa5_fin: '2026-05-03T18:00:00.000Z'
      },
      created_at: '2026-04-10T09:00:00.000Z',
      updated_at: '2026-05-03T18:00:00.000Z'
    },
    {
      folio: 'SP-A2605/2',
      nombre: 'Control de Temperatura Extrusora',
      cliente: 'Plásticos del Centro S. de R.L.',
      cliente_nombre: 'Plásticos del Centro S. de R.L.',
      fecha: '2026-04-05',
      fecha_inicio: '2026-04-05T09:00:00.000Z',
      vendedor: 'Ing. Iván García',
      ingeniero: 'Ing. Iván García',
      notas_generales: 'Control de temperatura 6 zonas extrusora. PLC Delta DVP, módulos temperatura, HMI Delta DOP.',
      notas_internas: 'Entrega completada 25 de abril. Variación ±0.5°C.',
      estado: 'completado',
      etapa_actual: 5,
      avance: 100,
      costo_total: 106604,
      costo_presupuestado: 106604,
      costo_real: 106604,
      adeudo_generado: 0,
      rentabilidad_estado: 'verde',
      actividades: [
        { area: 'Control', servicio: 'Configuración variadores', tipo: 'O', horas: 6 },
        { area: 'Visión', servicio: 'Integración cámaras', tipo: 'P', horas: 8 }
      ],
      materiales: [
        { nombre: 'PLC Delta DVP', sku: 'DVP28SV11R2', cantidad: 1, costo_unitario: 8500 },
        { nombre: 'Módulo Temp DVP04PT', sku: 'DVP04PT-S', cantidad: 2, costo_unitario: 3200 },
        { nombre: 'HMI Delta DOP', sku: 'DOP-107BV', cantidad: 1, costo_unitario: 6500 }
      ],
      epicas: [],
      apartados: [
        { id: 'ap1', titulo: 'Formato de entrega', nota: 'Entregado 2026-04-25', archivos: [] },
        { id: 'ap2', titulo: 'Manual de operación', nota: 'Incluido', archivos: [] },
        { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
        { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
        { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
      ],
      fechas_etapas: {
        etapa1_inicio: '2026-04-05T09:00:00.000Z',
        etapa1_fin: '2026-04-06T18:00:00.000Z',
        etapa2_inicio: '2026-04-07T09:00:00.000Z',
        etapa2_fin: '2026-04-08T18:00:00.000Z',
        etapa3_inicio: '2026-04-09T09:00:00.000Z',
        etapa3_fin: '2026-04-10T18:00:00.000Z',
        etapa4_inicio: '2026-04-11T09:00:00.000Z',
        etapa4_fin: '2026-04-20T18:00:00.000Z',
        etapa5_inicio: '2026-04-21T09:00:00.000Z',
        etapa5_fin: '2026-04-25T18:00:00.000Z'
      },
      created_at: '2026-04-05T09:00:00.000Z',
      updated_at: '2026-04-25T18:00:00.000Z'
    },
    {
      folio: 'SP-A2605/3',
      nombre: 'Sistema de Pesaje Automático',
      cliente: 'Harinas del Pacífico S.A. de C.V.',
      cliente_nombre: 'Harinas del Pacífico S.A. de C.V.',
      fecha: '2026-05-01',
      fecha_inicio: '2026-05-01T09:00:00.000Z',
      vendedor: 'Ing. Iván García',
      ingeniero: 'Ing. Iván García',
      notas_generales: 'Sistema de pesaje y dosificado automático para línea de harina. 4 celdas de carga, PLC Allen-Bradley CompactLogix.',
      notas_internas: 'Pendiente de aprobación de cotización por parte del cliente.',
      estado: 'pendiente',
      etapa_actual: 1,
      avance: 20,
      costo_total: 180000,
      costo_presupuestado: 180000,
      costo_real: 0,
      adeudo_generado: 0,
      rentabilidad_estado: 'verde',
      actividades: [],
      materiales: [],
      epicas: [],
      apartados: [
        { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
        { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
        { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
        { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
        { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
      ],
      fechas_etapas: {
        etapa1_inicio: '2026-05-01T09:00:00.000Z'
      },
      created_at: '2026-05-01T09:00:00.000Z',
      updated_at: '2026-05-01T09:00:00.000Z'
    }
  ];

  for (const p of proyectos) {
    const existingId = await existeFolio(p.folio);
    if (!existingId) {
      const result = await stmt.insert(null, p);
      console.log(`[Seed] Proyecto creado: ${p.folio} — ${p.nombre} (${p.estado}, etapa ${p.etapa_actual})`);
    } else {
      await stmt.update(existingId, p);
      console.log(`[Seed] Proyecto actualizado: ${p.folio} — ${p.nombre}`);
    }
  }

  persistDb();
  console.log('[Seed] Proyectos de automatización demo creados.');
  console.log('  - SP-A2605/1: Línea Ensamble C3 (completado, rojo $35,016 adeudo)');
  console.log('  - SP-A2605/2: Control Temperatura Extrusora (completado, verde)');
  console.log('  - SP-A2605/3: Sistema Pesaje Automático (pendiente, etapa 1)');
}

seedProyectosAutomatizacion().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
