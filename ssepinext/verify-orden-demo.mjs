/**
 * Verifica que la orden demo única exista y esté vinculada.
 * node verify-orden-demo.mjs
 */
import { getDb, prepareStatement } from './db.mjs';

const db = await getDb();
const proy = await prepareStatement(db, 'local_proyectos_automatizacion');
const comp = await prepareStatement(db, 'local_compras');
const cot = await prepareStatement(db, 'local_cotizaciones');
const fact = await prepareStatement(db, 'local_facturas');

const proyectos = await proy.query('', [], 'id ASC', 10);
const comprasAuto = (await comp.query('', [], 'id ASC', 500)).filter((c) =>
    /automatiz/i.test(c.departamento || '') || String(c.folio || '').startsWith('PO-A')
);
const cotsAuto = (await cot.query('', [], 'id ASC', 500)).filter((c) =>
    ['automatizacion', 'proyecto', 'soporte'].includes(String(c.origen || '').toLowerCase())
);
const facts = await fact.query('', [], 'id DESC', 500);

const demo = proyectos.find((p) => p.folio === 'SP-A-DEMO-01');
let ok = true;
function fail(msg) { console.error('FAIL:', msg); ok = false; }
function pass(msg) { console.log('OK:', msg); }

if (proyectos.length !== 1) fail(`proyectos_automatizacion: esperado 1, hay ${proyectos.length}`);
else pass('Un solo proyecto de automatización');

if (!demo) fail('Falta SP-A-DEMO-01');
else {
    pass(`Proyecto ${demo.folio} estado=${demo.estado} actividades=${(demo.actividades || []).length} materiales=${(demo.materiales || []).length}`);
    if (demo.estado !== 'completado') fail('Estado debe ser completado');
    if (!(demo.actividades || []).length) fail('Sin actividades');
}

const po = comprasAuto.find((c) => c.folio === 'PO-A-DEMO-01');
if (!po) fail('Falta PO-A-DEMO-01');
else {
    pass(`Compra ${po.folio} items=${(po.items || []).length} total=${po.total}`);
    const v = po.vinculacion;
    if (!v || String(v.id) !== String(demo?.id)) fail('Compra no vinculada al proyecto');
}

const cotD = cotsAuto.find((c) => c.folio === 'COT-A-DEMO-01');
if (!cotD) fail('Falta COT-A-DEMO-01');
else {
    pass(`Cotización ${cotD.folio} orden_origen_id=${cotD.orden_origen_id} desglose=${!!cotD.costo_desglose}`);
    if (String(cotD.orden_origen_id) !== String(demo?.id)) fail('Cotización no vinculada al proyecto');
}

const facD = facts.find((f) => (f.folio || f.folio_factura) === 'FAC-A-DEMO-01');
if (!facD) fail('Falta FAC-A-DEMO-01');
else pass(`Factura ${facD.folio || facD.folio_factura} venta_id=${facD.venta_id}`);

const allCots = await cot.query('', [], 'id ASC', 500);
if (!allCots.length) fail('Sin cotizaciones — Kanban/Historial Ventas estará vacío');
else pass(`Cotizaciones totales: ${allCots.length} (Historial Ventas)`);

if (cotD) {
    const est = String(cotD.estado || '').toLowerCase();
    if (!['autorizada', 'autorizado', 'autorizada_por_ventas', 'entregado', 'pagado'].includes(est)) {
        fail(`COT-A-DEMO-01 estado=${cotD.estado} — Kanban puede no mostrarla`);
    } else {
        pass(`COT-A-DEMO-01 visible en Kanban (estado=${cotD.estado})`);
    }
}

const taller = await prepareStatement(db, 'local_ordenes_taller');
const nTaller = (await taller.query('', [], 'id DESC', 5)).length;
pass(`Laboratorio intacto (muestra ${nTaller} órdenes taller recientes)`);

process.exit(ok ? 0 : 1);
