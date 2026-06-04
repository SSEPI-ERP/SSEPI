/**
 * Añade 3 componentes de inventario a TRACE-CAPTURA y crea compra vinculada.
 * Uso: node patch-trace-compra.mjs
 */
import { getDb, persistDb } from './db.mjs';

const ORDEN_ID = 2898;
const COMPONENTES = [
  { sku: 'LM339', descripcion: 'AMPLIFICADOR COMPARADOR', cantidad: 2, inventario_id: null },
  { sku: 'CD4046BE', descripcion: 'PLL CMOS', cantidad: 1, inventario_id: null },
  { sku: 'LM393', descripcion: 'COMPARADOR DUAL', cantidad: 3, inventario_id: null },
];

const db = await getDb();

function parseRow(table, idCol = 'id', dataCol = 'data') {
  const r = db.exec(`SELECT ${idCol}, ${dataCol} FROM ${table} WHERE ${idCol}=${ORDEN_ID}`);
  if (!r[0]?.values?.length) return null;
  const [id, raw] = r[0].values[0];
  return { id, data: typeof raw === 'string' ? JSON.parse(raw) : raw };
}

// Resolver inventario_id por SKU
for (const c of COMPONENTES) {
  const inv = db.exec(`SELECT id, data FROM local_inventario WHERE json_extract(data,'$.sku')='${c.sku}' OR json_extract(data,'$.codigo')='${c.sku}' LIMIT 1`);
  if (inv[0]?.values?.length) {
    c.inventario_id = inv[0].values[0][0];
    const invData = JSON.parse(inv[0].values[0][1]);
    c.descripcion = invData.descripcion || c.descripcion;
    c.precio_unitario = invData.precio_unitario ?? invData.costo ?? 0;
  } else {
    c.precio_unitario = 0;
  }
}

const orden = parseRow('local_ordenes_taller');
if (!orden) {
  console.error('Orden TRACE-CAPTURA (id 2898) no encontrada');
  process.exit(1);
}

orden.data.refacciones_inventario = COMPONENTES.map((c) => ({
  sku: c.sku,
  descripcion: c.descripcion,
  cantidad: c.cantidad,
  inventario_id: c.inventario_id,
  origen: 'inventario',
}));
orden.data.componentes_inventario = orden.data.refacciones_inventario;
orden.data.estado_interno = orden.data.estado_interno || 'esperando_cotizacion';

db.run(
  `UPDATE local_ordenes_taller SET data=? WHERE id=?`,
  [JSON.stringify(orden.data), ORDEN_ID]
);

// Compra vinculada si no existe
const existing = db.exec(
  `SELECT id, data FROM local_compras WHERE json_extract(data,'$.vinculacion.id')=${ORDEN_ID} AND json_extract(data,'$.vinculacion.tipo')='taller'`
);
let compraId;
if (existing[0]?.values?.length) {
  compraId = existing[0].values[0][0];
  const compraData = JSON.parse(existing[0].values[0][1]);
  compraData.items = COMPONENTES.map((c) => ({
    sku: c.sku,
    descripcion: c.descripcion,
    cantidad: c.cantidad,
    costo_unitario: c.precio_unitario,
    costo_total: c.cantidad * c.precio_unitario,
    origen: 'inventario',
    inventario_id: c.inventario_id,
  }));
  compraData.estado_interno = 'esperando_cotizacion';
  db.run(`UPDATE local_compras SET data=? WHERE id=?`, [JSON.stringify(compraData), compraId]);
  console.log('Compra actualizada id', compraId);
} else {
  const maxId = db.exec('SELECT MAX(id) FROM local_compras');
  compraId = (maxId[0]?.values?.[0]?.[0] || 0) + 1;
  const folio = orden.data.folio || orden.data.numero_orden || 'TRACE-CAPTURA';
  const compraData = {
    folio: `PO-${folio}`,
    proveedor_nombre: '',
    departamento: 'Laboratorio',
    estado: 0,
    estado_interno: 'esperando_cotizacion',
    vinculacion: { tipo: 'taller', id: ORDEN_ID, folio },
    items: COMPONENTES.map((c) => ({
      sku: c.sku,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      costo_unitario: c.precio_unitario,
      costo_total: c.cantidad * c.precio_unitario,
      origen: 'inventario',
      inventario_id: c.inventario_id,
    })),
    observaciones: `Compra vinculada a orden Lab ${folio} — materiales de inventario.`,
    created_at: new Date().toISOString(),
  };
  db.run(`INSERT INTO local_compras (id, data) VALUES (?, ?)`, [compraId, JSON.stringify(compraData)]);
  console.log('Compra creada id', compraId, compraData.folio);
}

persistDb();
console.log('TRACE-CAPTURA actualizada con', COMPONENTES.length, 'componentes de inventario');
