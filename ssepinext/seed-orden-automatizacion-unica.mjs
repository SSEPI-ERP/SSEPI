/**
 * Deja UNA sola orden de Automatización completa (completada) vinculada en
 * proyectos_automatizacion, compras, cotizaciones y facturas.
 * No toca órdenes de laboratorio (local_ordenes_taller).
 *
 * Uso: node seed-orden-automatizacion-unica.mjs
 */
import { getDb, persistDb, prepareStatement } from './db.mjs';

const FOLIO_PROY = 'SP-A-DEMO-01';
const FOLIO_COT = 'COT-A-DEMO-01';
const FOLIO_PO = 'PO-A-DEMO-01';
const FOLIO_FAC = 'FAC-A-DEMO-01';

const db = await getDb();

function vincJson(obj) {
  if (!obj) return '';
  const t = typeof obj;
  if (t === 'string') return obj;
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

function esCompraAutomatizacion(c) {
  if (c.folio === FOLIO_PO) return true;
  const dep = String(c.departamento || '');
  const folio = String(c.folio || '');
  const v = vincJson(c.vinculacion);
  if (/automatiz/i.test(dep)) return true;
  if (/^(PO|CMP)-SP-A/i.test(folio)) return true;
  if (/^PO-A-|^CMP-A-|^PO-SP-A/i.test(folio)) return true;
  if (/proyecto|automatizacion/i.test(v)) return true;
  if (/^PO-A0/i.test(folio)) return true;
  return false;
}

function esCompraNoLaboratorio(c) {
  if (c.folio === FOLIO_PO) return true;
  const dep = String(c.departamento || '');
  if (/laboratorio|electr[oó]nica/i.test(dep)) return false;
  if (esCompraAutomatizacion(c)) return true;
  if (/^PO-/i.test(String(c.folio || '')) && !/^PO-LAB/i.test(String(c.folio || ''))) return true;
  if (/motores|suministro|proyecto/i.test(dep)) return true;
  return false;
}

function esCotizacionAutomatizacion(c) {
  if (c.folio === FOLIO_COT) return true;
  const origen = String(c.origen || '').toLowerCase();
  const dep = String(c.departamento || '');
  const folio = String(c.folio || '');
  if (['automatizacion', 'proyecto', 'proyectos', 'soporte'].includes(origen)) return true;
  if (/automatiz/i.test(dep)) return true;
  if (/^COT-A/i.test(folio)) return true;
  if (/^COT-2605-A/i.test(folio)) return true;
  if (/^COT-SP-A/i.test(folio)) return true;
  return false;
}

function esCotizacionNoLaboratorio(c) {
  if (c.folio === FOLIO_COT) return true;
  const origen = String(c.origen || '').toLowerCase();
  if (origen === 'taller' || origen === 'laboratorio') return false;
  if (esCotizacionAutomatizacion(c)) return true;
  if (/^COT-/i.test(String(c.folio || '')) && !/^COT-LAB/i.test(String(c.folio || ''))) return true;
  return false;
}

function esFacturaAutomatizacion(f, cotIds) {
  const folio = String(f.folio || f.folio_factura || '');
  if (folio === FOLIO_FAC) return true;
  if (/^FAC-A/i.test(folio)) return true;
  if (/^FAC-2605-A/i.test(folio)) return true;
  if (f.venta_id != null && cotIds.has(Number(f.venta_id))) return true;
  return false;
}

async function limpiarTabla(stmt, predicate) {
  const rows = await stmt.query('', [], 'id ASC', 20000);
  let n = 0;
  for (const r of rows) {
    if (predicate(r)) {
      await stmt.remove(r.local_id);
      n++;
    }
  }
  return n;
}

async function main() {
  const stmtProy = await prepareStatement(db, 'local_proyectos_automatizacion');
  const stmtCot = await prepareStatement(db, 'local_cotizaciones');
  const stmtComp = await prepareStatement(db, 'local_compras');
  const stmtFact = await prepareStatement(db, 'local_facturas');

  const nProy = await limpiarTabla(stmtProy, () => true);
  const nCot = await limpiarTabla(stmtCot, esCotizacionNoLaboratorio);
  const nComp = await limpiarTabla(stmtComp, esCompraNoLaboratorio);

  const cotRest = await stmtCot.query('', [], 'id ASC', 20000);
  const cotIds = new Set(cotRest.map((c) => Number(c.id)));
  const nFact = await limpiarTabla(stmtFact, (f) => esFacturaAutomatizacion(f, cotIds));

  console.log(`[Seed-unica] Eliminados: ${nProy} proyectos, ${nCot} cotizaciones auto, ${nComp} compras auto, ${nFact} facturas auto`);

  const materiales = [
    {
      sku: '6ES7522-1BL00-0AB0',
      nombre: 'Módulo salida digital DQ 32',
      descripcion: 'MODULO DE SALIDA DIGITAL DQ 32 X DC24V',
      cantidad: 1,
      costo_unitario: 12189.28,
      costo_total: 12189.28,
      categoria: "PLC'S",
      tiempo_entrega_dias: 21
    },
    {
      sku: '6ES7521-1BL00-0AB0',
      nombre: 'Módulo entrada digital DI 32',
      descripcion: 'DI 32x24 V DC HF',
      cantidad: 1,
      costo_unitario: 8566.6,
      costo_total: 8566.6,
      categoria: "PLC'S",
      tiempo_entrega_dias: 18
    },
    {
      sku: 'DOP-107EV',
      nombre: 'HMI Delta DOP 7"',
      descripcion: 'Pantalla táctil Ethernet',
      cantidad: 1,
      costo_unitario: 4926,
      costo_total: 4926,
      categoria: "HMI'S",
      tiempo_entrega_dias: 14
    }
  ];

  const matBase = materiales.reduce((s, m) => s + m.costo_total, 0);
  const markupPct = 17;
  const markupMonto = matBase * (markupPct / 100);

  const actividades = [
    {
      id: 'act-demo-1',
      area: 'Control',
      servicio: 'Programación PLC / HMI',
      tipo: 'O',
      horas: 10,
      tarifa: 650,
      subactividades: [
        {
          id: 'sub-demo-1a',
          titulo: 'Análisis I/O y arquitectura',
          horas_plan: 4,
          estado: 'completado',
          hijos: [
            { id: 'sub-demo-1a1', titulo: 'Revisión documentación cliente', horas_plan: 2, estado: 'completado', hijos: [] },
            { id: 'sub-demo-1a2', titulo: 'Lista señales', horas_plan: 2, estado: 'completado', hijos: [] }
          ]
        },
        {
          id: 'sub-demo-1b',
          titulo: 'Programación y pruebas FAT',
          horas_plan: 6,
          estado: 'completado',
          hijos: []
        }
      ]
    },
    {
      id: 'act-demo-2',
      area: 'Soporte',
      servicio: 'Soporte en planta — puesta en marcha',
      tipo: 'P',
      horas: 8,
      tarifa: 120,
      subactividades: [
        { id: 'sub-demo-2a', titulo: 'Comisionado en línea', horas_plan: 5, estado: 'completado', hijos: [] },
        { id: 'sub-demo-2b', titulo: 'Capacitación operadores', horas_plan: 3, estado: 'completado', hijos: [] }
      ]
    },
    {
      id: 'act-demo-3',
      area: 'Eléctrica',
      servicio: 'Diseño de tablero',
      tipo: 'O',
      horas: 6,
      tarifa: 500,
      subactividades: []
    }
  ];

  const horasServicios = actividades.reduce((s, a) => s + (Number(a.horas) || 0) * (Number(a.tarifa) || 0), 0);
  const subtotalServicios = horasServicios;
  const subtotalMaterialesVenta = matBase + markupMonto;
  const viaticos = 3200;
  const gasolina = 1800;
  const camioneta = 2400;
  const gastosGenerales = 8500;
  const subtotal = subtotalMaterialesVenta + subtotalServicios + viaticos + gasolina + camioneta + gastosGenerales;
  const credito2 = subtotal * 0.02;
  const totalVenta = subtotal + credito2;
  const descuento5 = totalVenta * 0.05;
  const totalFinal = totalVenta - descuento5;
  const iva = totalFinal * 0.16;
  const totalConIva = totalFinal + iva;

  const costoDesglose = {
    empresa: 'ANGUIPLAST',
    servicios: {
      'PROGRAMACIÓN PLC HMI': 10 * 650,
      SOPORTE: 8 * 120,
      'DISEÑO TABLERO': 6 * 500
    },
    tiempo_planta_h: 8,
    materiales_base: matBase,
    markup_materiales_pct: markupPct,
    markup_materiales_monto: markupMonto,
    materiales_total: subtotalMaterialesVenta,
    viaticos,
    hr_camioneta: 4,
    gasolina,
    tiempo_invest_h: 0,
    gastos_generales: gastosGenerales,
    subtotal,
    credito_2pct: credito2,
    total_venta: totalVenta,
    descuento_5pct: descuento5,
    total_final: totalFinal
  };

  const proyecto = {
    folio: FOLIO_PROY,
    nombre: 'Sistema de Pesaje Automático — Línea 3',
    cliente: 'ANGUIPLAST',
    cliente_nombre: 'ANGUIPLAST',
    fecha: '2026-04-01',
    fecha_inicio: '2026-04-01T09:00:00.000Z',
    vendedor: 'Daniel Zuñiga',
    ingeniero: 'Ing. Roberto Moro',
    notas_generales: 'Proyecto demo único: migración PLC, HMI y pesaje automático. Cliente confirmó alcance.',
    notas_internas: 'Orden de referencia para pruebas Ventas / Compras / Facturación / Automatización.',
    estado: 'completado',
    etapa_actual: 5,
    avance: 100,
    costo_total: totalConIva,
    costo_presupuestado: subtotal,
    costo_real: totalConIva,
    auto_costo_km: 95,
    auto_costo_hrs_cam: 4,
    servicios_automatizacion: [
      'Control | Programación PLC / HMI',
      'Soporte | Soporte en planta — puesta en marcha',
      'Eléctrica | Diseño de tablero'
    ],
    actividades,
    materiales,
    epicas: [],
    apartados: [
      { id: 'ap1', titulo: 'Formato de entrega', nota: 'Entregado', archivos: [] },
      { id: 'ap2', titulo: 'Manual de operación', nota: 'Incluido', archivos: [] }
    ],
    fechas_etapas: {
      etapa1_inicio: '2026-04-01T09:00:00.000Z',
      etapa5_fin: '2026-05-28T18:00:00.000Z'
    },
    fecha_confirmacion_cliente: '2026-05-15T12:00:00.000Z',
    espera_confirmacion_cliente: false,
    rentabilidad_estado: 'verde',
    created_at: '2026-04-01T09:00:00.000Z',
    updated_at: '2026-05-28T18:00:00.000Z'
  };

  const proyIns = await stmtProy.insert(null, proyecto);
  const proyId = proyIns.local_id || proyIns.id;
  console.log('[Seed-unica] Proyecto', FOLIO_PROY, 'id=', proyId);

  const itemsCompra = materiales.map((m) => ({
    sku: m.sku,
    nombre: m.nombre,
    descripcion: m.descripcion,
    cantidad: m.cantidad,
    costo_unitario: m.costo_unitario,
    costo_total: m.costo_total,
    tipo: 'material',
    tiempo_entrega_dias: m.tiempo_entrega_dias
  }));

  const subCompra = matBase;
  const ivaCompra = subCompra * 0.16;
  const totalCompra = subCompra + ivaCompra;

  const compra = {
    folio: FOLIO_PO,
    proveedor: 'DIMEINT / Siemens',
    departamento: 'Automatización',
    subtotal: subCompra,
    iva: ivaCompra,
    total: totalCompra,
    estado: 5,
    estado_interno: 'recibida',
    vinculacion: {
      tipo: 'proyecto',
      id: String(proyId),
      folio: FOLIO_PROY,
      cliente: 'ANGUIPLAST',
      nombre: proyecto.nombre
    },
    items: itemsCompra,
    pasos: [
        { paso: 1, fecha: '2026-04-05T09:05:00.000Z', usuario: 'Compras', accion: 'Orden creada desde automatización' },
        { paso: 2, fecha: '2026-04-10T11:00:00.000Z', usuario: 'Compras', accion: 'Materiales confirmados' },
        { paso: 3, fecha: '2026-04-12T14:00:00.000Z', usuario: 'Compras', accion: 'Orden confirmada' },
        { paso: 4, fecha: '2026-05-20T10:00:00.000Z', usuario: 'Compras', accion: 'Materiales recibidos' },
        { paso: 5, fecha: '2026-05-28T18:00:00.000Z', usuario: 'Compras', accion: 'Entregada a proyecto' }
    ],
    observaciones: 'Lista de materiales para compra — demo única.',
    data: {
      costo_resumen: { materiales_base: matBase, markup_materiales_pct: markupPct },
      cliente_info: { nombre: 'ANGUIPLAST' },
      vendedor: 'Daniel Zuñiga',
      ajuste_3pct: false
    },
    fecha_recepcion: '2026-05-20T10:00:00.000Z',
    created_at: '2026-04-05T09:00:00.000Z',
    updated_at: '2026-05-28T18:00:00.000Z'
  };

  const compIns = await stmtComp.insert(null, compra);
  const compId = compIns.local_id || compIns.id;
  console.log('[Seed-unica] Compra', FOLIO_PO, 'id=', compId);

  await stmtProy.update(proyId, {
    ...proyecto,
    id: proyId,
    compra_vinculada: compId,
    compra_folio: FOLIO_PO
  });

  const cotizacion = {
    folio: FOLIO_COT,
    tipo_folio: 'COT',
    cliente: 'ANGUIPLAST',
    cliente_nombre: 'ANGUIPLAST',
    vendedor: 'Daniel Zuñiga',
    departamento: 'Automatización',
    origen: 'automatizacion',
    orden_origen_id: proyId,
    estado: 'autorizada',
    subtotal: totalFinal,
    iva,
    total: totalConIva,
    km_distancia: 95,
    horas_viaje: 4,
    costo_gasolina: gasolina,
    costo_traslado: camioneta,
    costo_desglose: costoDesglose,
    cerebro_registro: {
      folio_operativo: FOLIO_PROY,
      departamento: 'Automatización',
      origen_cotizacion: 'automatizacion',
      orden_id: proyId,
      nombre_proyecto: proyecto.nombre
    },
    items: [
      ...materiales.map((m) => ({
        descripcion: m.nombre,
        especificaciones: m.sku,
        cantidad: m.cantidad,
        precio_unitario: m.costo_unitario * 1.3,
        importe: m.costo_total * 1.3
      })),
      { descripcion: 'Servicios de ingeniería (ver desglose)', cantidad: 1, precio_unitario: subtotalServicios, importe: subtotalServicios }
    ],
    fecha_cotizacion: '2026-05-10T12:00:00.000Z',
    created_at: '2026-04-05T09:00:00.000Z',
    updated_at: '2026-05-28T18:00:00.000Z'
  };

  const cotIns = await stmtCot.insert(null, cotizacion);
  const cotId = cotIns.local_id || cotIns.id;
  console.log('[Seed-unica] Cotización', FOLIO_COT, 'id=', cotId);

  const factura = {
    folio: FOLIO_FAC,
    folio_factura: FOLIO_FAC,
    cliente: 'ANGUIPLAST',
    cliente_nombre: 'ANGUIPLAST',
    venta_id: cotId,
    orden_origen_id: proyId,
    subtotal: totalFinal,
    iva,
    total: totalConIva,
    estatus: 'activa',
    estado: 'activa',
    fecha_emision: '2026-05-28T10:00:00.000Z',
    created_at: '2026-05-28T10:00:00.000Z',
    updated_at: '2026-05-28T10:00:00.000Z'
  };

  const facIns = await stmtFact.insert(null, factura);
  console.log('[Seed-unica] Factura', FOLIO_FAC, 'id=', facIns.local_id || facIns.id);

  persistDb();
  console.log('\n[Seed-unica] Listo. Abre:');
  console.log('  Automatización → proyecto id', proyId, 'o folio', FOLIO_PROY);
  console.log('  Compras →', FOLIO_PO);
  console.log('  Ventas → cotización', FOLIO_COT);
  console.log('  Facturación →', FOLIO_FAC);
}

main().catch((err) => {
  console.error('[Seed-unica] Error:', err);
  process.exit(1);
});
