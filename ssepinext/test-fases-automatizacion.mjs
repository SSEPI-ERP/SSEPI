/**
 * Pruebas rápidas de lógica (fases Automatización / Ventas / Compras).
 * node test-fases-automatizacion.mjs
 */
import { buildConceptosPDFPublicos, recalcularDesglose } from '../panel/js/core/ventas-costo-desglose.js';
import { horasParaCotizacionActividad, calcularHorasExtraSub } from '../panel/js/core/horas-jerarquia.js';
import { getDb, prepareStatement } from './db.mjs';

let ok = true;
function pass(m) { console.log('OK:', m); }
function fail(m) { console.error('FAIL:', m); ok = false; }

const d = recalcularDesglose({
    programacion_plc_hmi: 10000,
    materiales: 5000,
    gasolina: 999,
    viaticos: 888,
    credito_pct: 2,
    descuento_pct: 5
}, { aplicarIva: true });
const pub = buildConceptosPDFPublicos(d);
if (pub.items.some((i) => /gasolina|viático/i.test(i.descripcion))) fail('PDF público incluye viáticos');
else pass('PDF público sin gasolina/viáticos');
if (!pub.items.some((i) => i.descripcion.includes('PROGRAMACIÓN'))) fail('PDF público sin servicios');
else pass('PDF público con líneas de servicio');
if (pub.total <= 0) fail('PDF público sin total');
else pass('PDF público con total');

const act = { horas: 8, subactividades: [{ horas_plan: 3 }, { horas_plan: 4 }] };
if (horasParaCotizacionActividad(act) !== 8) fail('horasParaCotizacion debe usar horas del servicio');
else pass('horasParaCotizacion respeta cupo servicio');

const extra = calcularHorasExtraSub({ horas_plan: 2, duracion_minutos: 200 });
if (extra < 0.5) fail('calcularHorasExtraSub');
else pass('calcularHorasExtraSub detecta extra');

const db = await getDb();
const proy = await prepareStatement(db, 'local_proyectos_automatizacion');
const comp = await prepareStatement(db, 'local_compras');
const cot = await prepareStatement(db, 'local_cotizaciones');
const demo = (await proy.query('', [], 'id ASC', 5)).find((p) => p.folio === 'SP-A-DEMO-01');
const po = (await comp.query('', [], 'id ASC', 500)).find((c) => c.folio === 'PO-A-DEMO-01');
const cotD = (await cot.query('', [], 'id ASC', 500)).find((c) => c.folio === 'COT-A-DEMO-01');

if (!demo || !po || !cotD) fail('Datos demo incompletos en BD');
else {
    pass('Datos demo presentes');
    if (String(po.vinculacion?.id) !== String(demo.id)) fail('PO no vinculada');
    else pass('PO vinculada a proyecto');
    if (!cotD.costo_desglose) fail('Cotización sin costo_desglose');
    else pass('Cotización con costo_desglose');
    const itemsMat = (po.items || []).filter((i) => !i.tipo || i.tipo === 'material');
    if (itemsMat.length < 1) fail('Compra sin materiales');
    else pass(`Compra con ${itemsMat.length} materiales`);
}

process.exit(ok ? 0 : 1);
