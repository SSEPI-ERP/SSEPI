#!/usr/bin/env node
// =====================================================
// migrar-a-cloud.mjs — Sincroniza SQLite local → Supabase cloud
// Fases:
//   1 = catálogos seguros
//   2 = identidad (usuarios/clientes/contactos)
//   3 = documentos operativos
//   4 = inventario + movimientos
//   5 = calculadoras + BOM + servicios
//   6 = historial + actividades + auditoría
// Uso:
//   node migrar-a-cloud.mjs --dry-run
//   node migrar-a-cloud.mjs --dry-run --phase=3
//   node migrar-a-cloud.mjs --phase=3
//   node migrar-a-cloud.mjs
// =====================================================

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    return [k, v === undefined ? true : v];
  }
  return [a, true];
}));

const DRY_RUN = args['dry-run'] === true || args.dryRun === true;
const PHASE = args.phase ? Number(args.phase) : null;
const PHASES = PHASE !== null ? [PHASE] : [1, 2, 3, 4, 5, 6];

const DB_PATH = path.resolve(__dirname, 'data/ssepi-local.db');
const ID_MAP_PATH = path.resolve(__dirname, 'data/migrar-a-cloud-id-map.json');

const TABLE_PLANS = [
  // fase 1: catálogos seguros
  { phase: 1, local: 'local_vacaciones_dias_feriados', cloud: 'vacaciones_dias_feriados', pk: 'id', genId: false, upsertBy: 'fecha', excludeFields: ['anio'] },
  { phase: 1, local: 'local_parametros_costos', cloud: 'parametros_costos', pk: 'id', genId: false, upsertBy: 'clave', excludeFields: ['id'] },
  { phase: 1, local: 'local_role_permissions', cloud: 'role_permissions', pk: 'id', genId: true, skip: true },
  { phase: 1, local: 'local_politicas_modulos', cloud: 'politicas_modulos', pk: 'id', genId: true, skip: true },
  { phase: 1, local: 'local_user_module_permissions', cloud: 'user_module_permissions', pk: 'id', genId: true },

  // fase 2: identidad
  { phase: 2, local: 'local_usuarios', cloud: 'usuarios', pk: 'id', genId: true, mergeBy: 'email', updateExisting: true, preserveCloudFields: ['id','auth_user_id','email','rol'] },
  { phase: 2, local: 'local_contactos', cloud: 'contactos', pk: 'id', genId: true, mergeBy: 'rfc', fallbackMergeBy: 'nombre', updateExisting: true, transform: 'contactos_to_cloud' },

  // fase 3: documentos operativos
  { phase: 3, local: 'local_ordenes_taller', cloud: 'ordenes_taller', pk: 'id', genId: true, upsertBy: 'folio' },
  { phase: 3, local: 'local_ventas', cloud: 'ventas', pk: 'id', genId: true, upsertBy: 'folio' },
  { phase: 3, local: 'local_compras', cloud: 'compras', pk: 'id', genId: true, upsertBy: 'folio' },
  { phase: 3, local: 'local_cotizaciones', cloud: 'cotizaciones', pk: 'id', genId: true, upsertBy: 'folio' },
  { phase: 3, local: 'local_facturas', cloud: 'facturas', pk: 'id', genId: true, skipExistingBy: 'folio_factura' },
  { phase: 3, local: 'local_ordenes_motores', cloud: 'ordenes_motores', pk: 'id', genId: true, upsertBy: 'folio' },
  { phase: 3, local: 'local_proyectos_automatizacion', cloud: 'proyectos_automatizacion', pk: 'id', genId: true, upsertBy: 'folio' },

  // fase 4: inventario + movimientos
  { phase: 4, local: 'local_inventario', cloud: 'inventario', pk: 'id', genId: true, upsertBy: 'sku' },
  { phase: 4, local: 'local_movimientos_inventario', cloud: 'movimientos_inventario', pk: 'id', genId: true },

  // fase 5: calculadoras + BOM + servicios
  { phase: 5, local: 'local_calculadoras', cloud: 'calculadoras', pk: 'id', genId: true },
  { phase: 5, local: 'local_calculadora_costos', cloud: 'calculadora_costos', pk: 'id', genId: true },
  { phase: 5, local: 'local_calculadora_clientes', cloud: 'calculadora_clientes', pk: 'id', genId: true },
  { phase: 5, local: 'local_calculadora_hoja_filas', cloud: 'calculadora_hoja_filas', pk: 'id', genId: true },
  { phase: 5, local: 'local_bom_automatizacion', cloud: 'bom_automatizacion', pk: 'id', genId: true, createCloudTable: true },
  { phase: 5, local: 'local_servicios_automatizacion', cloud: 'catalogo_servicios', pk: 'id', genId: true, transform: 'servicios_automatizacion_to_catalogo', skipExistingBy: 'servicio' },

  // fase 6: historial + actividades + auditoría
  { phase: 6, local: 'local_orden_historial', cloud: 'orden_historial', pk: 'id', genId: true },
  { phase: 6, local: 'local_audit_logs', cloud: 'audit_logs', pk: 'id', genId: true },
  { phase: 6, local: 'local_estado_pipeline_unificado', cloud: 'estado_pipeline_unificado', pk: 'id', genId: true },
  { phase: 6, local: 'local_actividades_contactos', cloud: 'actividades_contactos', pk: 'id', genId: true },
  { phase: 6, local: 'local_notificaciones', cloud: 'notificaciones', pk: 'id', genId: true },
  { phase: 6, local: 'local_vacaciones_balance', cloud: 'vacaciones_balance', pk: 'id', genId: true },
  { phase: 6, local: 'local_vacaciones_empleados', cloud: 'vacaciones_empleados', pk: 'id', genId: true },
  { phase: 6, local: 'local_vacaciones_solicitudes', cloud: 'vacaciones_solicitudes', pk: 'id', genId: true },
  { phase: 6, local: 'local_coi_sync_queue', cloud: 'coi_sync_queue', pk: 'id', genId: true, skip: true }, // vacía y cloud-only
];

// =====================================================
// SCHEMA DEFAULTS (rellena campos NOT NULL del cloud)
// =====================================================
const SCHEMA_DEFAULTS = {
  ordenes_taller: {
    _required: ['cliente_nombre', 'equipo', 'fecha_ingreso', 'folio'],
    cliente_nombre: r => r.cliente || r.cliente_nombre || 'Sin cliente',
    equipo: r => r.equipo || 'Equipo no especificado',
    fecha_ingreso: r => r.fecha_ingreso || r.fecha_creacion || new Date().toISOString(),
    folio: r => r.folio || `OT-${uuidv4().slice(0, 8).toUpperCase()}`,
  },
  ventas: {
    _required: ['fecha', 'fecha_creacion', 'folio'],
    fecha: r => r.fecha || new Date().toISOString().slice(0, 10),
    fecha_creacion: r => r.fecha_creacion || r.created_at || r.fecha || new Date().toISOString(),
    folio: r => r.folio || `V-${uuidv4().slice(0, 8).toUpperCase()}`,
  },
  compras: {
    _required: ['folio', 'proveedor_nombre', 'fecha_solicitud'],
    proveedor_nombre: r => r.proveedor_nombre || r.proveedor || 'Por asignar',
    fecha_solicitud: r => r.fecha_solicitud || r.fecha_creacion || r.created_at || r.fecha || new Date().toISOString(),
    folio: r => r.folio || `CMP-${uuidv4().slice(0, 8).toUpperCase()}`,
  },
  cotizaciones: {
    _required: ['cerebro_registro', 'cliente_nombre', 'costo_gasolina', 'fecha_cotizacion', 'folio', 'horas_viaje', 'iva', 'km_distancia', 'subtotal', 'tipo_folio', 'total'],
    cerebro_registro: r => r.cerebro_registro || {},
    cliente_nombre: r => r.cliente_nombre || r.cliente || 'Cliente general',
    costo_gasolina: r => typeof r.costo_gasolina === 'number' ? r.costo_gasolina : 0,
    fecha_cotizacion: r => r.fecha_cotizacion || r.fecha || r.created_at || new Date().toISOString(),
    horas_viaje: r => typeof r.horas_viaje === 'number' ? r.horas_viaje : 0,
    iva: r => typeof r.iva === 'number' ? r.iva : (typeof r.subtotal === 'number' ? Math.round(r.subtotal * 0.16 * 100) / 100 : 0),
    km_distancia: r => typeof r.km_distancia === 'number' ? r.km_distancia : 0,
    subtotal: r => typeof r.subtotal === 'number' ? r.subtotal : 0,
    tipo_folio: r => r.tipo_folio || 'COT',
    total: r => typeof r.total === 'number' ? r.total : 0,
  },
  facturas: {
    _required: ['fecha_emision', 'total'],
    fecha_emision: r => r.fecha_emision || r.fecha || r.fecha_creacion || new Date().toISOString(),
    total: r => typeof r.total === 'number' ? r.total : 0,
  },
  ordenes_motores: {
    _required: ['folio', 'fecha_creacion', 'fecha_ingreso'],
    fecha_creacion: r => r.fecha_creacion || r.created_at || new Date().toISOString(),
    fecha_ingreso: r => r.fecha_ingreso || r.fecha_creacion || new Date().toISOString(),
    folio: r => r.folio || `OM-${uuidv4().slice(0, 8).toUpperCase()}`,
  },
  proyectos_automatizacion: {
    _required: ['folio', 'fecha_creacion'],
    fecha_creacion: r => r.fecha_creacion || r.fecha || r.created_at || new Date().toISOString(),
    folio: r => r.folio || `SP-A-${uuidv4().slice(0, 8).toUpperCase()}`,
  },
  inventario: {
    _required: ['sku', 'nombre', 'categoria'],
    sku: r => r.sku || r.id || `SKU-${uuidv4().slice(0, 8).toUpperCase()}`,
    nombre: r => r.nombre || r.descripcion || 'Producto sin nombre',
    categoria: r => normalizeInventarioCategoria(r.categoria || r.subcategoria),
  },
  movimientos_inventario: {
    _required: ['cantidad', 'tipo_movimiento'],
    tipo_movimiento: r => normalizeMovimientoTipo(r.tipo_movimiento || r.tipo),
  },
};

// =====================================================
// HELPERS
// =====================================================
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function toIsoDate(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v.replace(' ', 'T') + 'Z';
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
    return new Date(v).toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return null;
}

function cleanRow(row, extraExclude = []) {
  const out = {};
  const exclude = new Set(['id', 'local_id', 'cloud_id', 'sync_status', 'synced_at', 'data', ...extraExclude]);
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (k.startsWith('_')) continue; // metadatos locales primero
    if (exclude.has(k)) continue;
    if (v === null) { out[k] = null; continue; }
    if (typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number') { out[k] = v; continue; }
    if (typeof v === 'object') { out[k] = JSON.stringify(v); continue; }
    out[k] = v;
  }
  return out;
}

function flattenLocalRow(localRow, localTable) {
  if (localTable === 'offline_usuarios') return { ...localRow };
  const data = typeof localRow.data === 'string' ? JSON.parse(localRow.data || '{}') : (localRow.data || {});
  return { ...data, _local_id: localRow.id, _sync_status: localRow.sync_status, _synced_at: localRow.synced_at };
}

// Sanitiza strings vacíos en fechas, valores no-UUID en FKs uuid, y strings no-JSON en campos jsonb
function sanitizeForCloud(rec, table) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;

    // Fechas vacías → null
    if (typeof v === 'string' && v.trim() === '' && /fecha|_at|_en|_creacion|_emision|_ingreso|_cotizacion/.test(k)) {
      out[k] = null;
      continue;
    }

    // Cadenas vacías en general → null
    if (typeof v === 'string' && v.trim() === '') {
      out[k] = null;
      continue;
    }

    // FKs UUID con valores locales numéricos/string no-uuid → omitir, salvo campos que mapeamos después
    const isFkCandidate = /(_id|_por|_by|cliente_id|proveedor_id|venta_id|compra_id|cotizacion_id|orden_id|taller_id|motores_id|automatizacion_id|visita_id|tecnico_id|vendedor_id|created_by|creado_por)$/.test(k);
    const mapeableFk = new Set(['user_id', 'contacto_id', 'producto_id']);
    if (isFkCandidate && !mapeableFk.has(k) && k !== 'id' && v !== null && v !== undefined && !isUuid(String(v))) {
      continue; // no enviar
    }

    // Timestamps locales de SQLite sin Z → ISO
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
      out[k] = v.replace(' ', 'T') + 'Z';
      continue;
    }

    out[k] = v;
  }
  return sanitizeJsonFields(out, table);
}

function isJsonArrayField(name) {
  if (/^(notas|observaciones|comentarios)$/i.test(name)) return false;
  return /(componentes|consumibles|refacciones|items|actividades|materiales|epicas|apartados|servicios|tareas|historial|pasos|subactividades|lineas|filas)$/i.test(name);
}
function isJsonObjectField(name) {
  return /(cerebro_registro|vinculacion|config|datos|metadata|extra|campos|parametros|valores|desglose|costos|presupuesto|resumen)$/i.test(name);
}

function sanitizeJsonFields(rec, table) {
  const out = { ...rec };
  for (const [k, v] of Object.entries(out)) {
    if (v === null || v === undefined) continue;
    const looksArray = isJsonArrayField(k);
    const looksObject = isJsonObjectField(k);
    if (!looksArray && !looksObject) continue;
    if (typeof v === 'object') continue; // ya es objeto/array, cleanRow lo serializó a string JSON; ok
    if (typeof v !== 'string') { out[k] = null; continue; }
    try {
      JSON.parse(v);
      // string JSON válido, PostgREST lo convertirá a jsonb
      continue;
    } catch {
      // no es JSON válido
      out[k] = looksArray ? '[]' : '{}';
    }
  }
  return out;
}

function applySchemaDefaults(table, rec) {
  const defs = SCHEMA_DEFAULTS[table];
  if (!defs) return rec;
  const out = { ...rec };
  for (const field of defs._required) {
    const fn = defs[field];
    if (fn) {
      out[field] = fn(out);
    } else if (out[field] === null || out[field] === undefined || out[field] === '') {
      out[field] = null;
    }
  }
  return out;
}

// Mapeos de nombres de campo y columnas generated
function buildUserMaps(cloudUsers) {
  return {
    byEmail: new Map(cloudUsers.map(u => [String(u.email || '').toLowerCase(), u.auth_user_id || u.id])),
    byNombre: new Map(cloudUsers.map(u => [String(u.nombre || '').trim().toLowerCase(), u.auth_user_id || u.id])),
    byId: new Map(cloudUsers.map(u => [u.id, u.auth_user_id || u.id])),
  };
}

function resolveUserId(val, userMaps = {}, fallback = {}) {
  if (!val && !fallback.email && !fallback.nombre) return null;
  if (val && isUuid(String(val))) return val;
  if (val && userMaps.offline?.has(val)) return userMaps.offline.get(val);
  if (fallback.email && userMaps.byEmail?.has(String(fallback.email).toLowerCase())) return userMaps.byEmail.get(String(fallback.email).toLowerCase());
  if (fallback.nombre && userMaps.byNombre?.has(String(fallback.nombre).trim().toLowerCase())) return userMaps.byNombre.get(String(fallback.nombre).trim().toLowerCase());
  return null;
}

function preCloudMap(table, rec, skuToCloudId = {}, cloudInventarioIds = new Set(), idMap = {}, userMaps = {}) {
  const out = { ...rec };
  if (table === 'cotizaciones') {
    if (!out.fecha_cotizacion && out.fecha) out.fecha_cotizacion = out.fecha;
    delete out.fecha; // generated column en cloud
    out.estado = normalizeCotizacionEstado(out.estado);
  }
  if (table === 'catalogo_servicios') {
    const tipoLocal = String(out.tipo || '').trim().toLowerCase();
    const oficina = ['ingenieria','oficina','administrativo','admin','diseno','diseño','programacion','programación','supervision','supervisión','ingeniería','planificacion','planificación','consultoria','consultoría'];
    const planta = ['planta','operativo','mano_obra','mano de obra','campo','obra','servicio','tecnico','técnico','operacion','operación','instalacion','instalación','mantenimiento'];
    if (planta.includes(tipoLocal)) out.tipo = 'P';
    else if (oficina.includes(tipoLocal)) out.tipo = 'O';
    else out.tipo = 'O';
  }
  if (table === 'compras') {
    out.estado = normalizeComprasEstado(out.estado);
  }
  if (table === 'facturas') {
    if (!out.folio_factura && out.folio) out.folio_factura = out.folio;
    // la cloud usa 'folio_factura', no 'folio'
    delete out.folio;
  }
  if (table === 'proyectos_automatizacion') {
    if (!out.fecha_creacion && out.fecha) out.fecha_creacion = out.fecha;
  }
  if (table === 'movimientos_inventario') {
    // producto_id local es SKU o UUID antiguo; cloud es UUID FK
    const pid = String(out.producto_id || '').trim();
    if (pid) {
      if (isUuid(pid) && cloudInventarioIds.has(pid)) {
        // ok
      } else if (!isUuid(pid)) {
        const cloudId = skuToCloudId[pid.toLowerCase()];
        if (cloudId) out.producto_id = cloudId;
        else out.producto_id = null;
      } else {
        out.producto_id = null;
      }
    }
    if (!out.sku && pid && !isUuid(pid)) out.sku = pid;
  }
  if (table === 'calculadora_hoja_filas') {
    // Relacionar con la primera calculadora migrada y evitar duplicados (calculadora_id, fila_orden)
    if (!out.calculadora_id) {
      const firstCalcEntry = Object.entries(idMap).find(([k]) => k.startsWith('calculadoras:'));
      if (firstCalcEntry) out.calculadora_id = firstCalcEntry[1];
    }
    out.fila_orden = out._rowIndex || out.fila_orden || 0;
    delete out._rowIndex;
  }
  if (table === 'bom_automatizacion') {
    // Mapear nombres de campo local → cloud
    out.item = Number(out.numero_item) || null;
    out.numero_parte = out.part_number || out.numero_parte || null;
    out.descripcion = out.descripcion || 'Sin descripción';
    out.categoria = out.categoria_original || out.categoria || 'general';
    out.estado = out.estado_actualizacion || out.estado || 'Activo';
    out.precio_unitario = Number(out.mejor_precio || out.costo_unitario || 0);
    out.moneda = out.moneda || 'MXN';
    // proveedores local es JSON array → text primer proveedor
    if (out.proveedores) {
      try {
        const prov = JSON.parse(out.proveedores);
        if (Array.isArray(prov) && prov.length) out.proveedor = String(prov[0].nombre || prov[0]);
        else if (typeof prov === 'string') out.proveedor = prov;
      } catch {}
    }
    // Limpiar campos locales que no existen en cloud
    const localOnly = ['numero_item','part_number','categoria_original','estado_actualizacion','tiene_imagen','proveedores','mejor_precio','tipo','cantidad','unidad','costo_unitario'];
    for (const k of localOnly) delete out[k];
  }

  // Fase 6: actividades / vacaciones / auditoría
  if (table === 'actividades_contactos') {
    const cid = out.contacto_id;
    if (isUuid(String(cid))) {
      // ya es uuid
    } else if (cid) {
      const mapped = idMap[`contactos:${cid}`];
      out.contacto_id = mapped || null;
    }
  }
  if (table === 'vacaciones_balance' || table === 'vacaciones_empleados' || table === 'vacaciones_solicitudes' || table === 'audit_logs') {
    const fallback = { email: out.email || out.user_email, nombre: out.nombre || out.usuario };
    out.user_id = resolveUserId(out.user_id, userMaps, fallback) || (table === 'vacaciones_empleados' ? resolveUserId(null, userMaps, fallback) : null);
  }
  if (table === 'vacaciones_empleados') {
    if (!out.orden && out.orden !== 0) out.orden = out._rowIndex || 0;
  }
  if (table === 'orden_historial') {
    out.metadata = JSON.stringify({
      orden_id_local: out.orden_id,
      tabla_origen: out.tabla_origen,
      orden_cloud_id: idMap[`${String(out.tabla_origen).replace(/^local_/, '').replace(/s$/, '')}:${out.orden_id}`] || null
    });
    delete out.orden_id;
    delete out.tabla_origen;
  }
  if (table === 'notificaciones') {
    const compraId = String(out.compra_id || '').trim();
    if (compraId && !isUuid(compraId)) {
      out.compra_id = idMap[`compras:${compraId}`] || null;
    }
  }
  if (table === 'audit_logs') {
    if (out.accion === undefined && out.action !== undefined) out.accion = out.action;
    if (out.usuario === undefined && out.user_email !== undefined) out.usuario = out.user_email;
  }
  return out;
}

function normalizeInventarioCategoria(cat) {
  const c = String(cat || '').trim().toLowerCase();
  const allowed = ['refaccion', 'servicio', 'consumible'];
  if (allowed.includes(c)) return c;
  if (/serv/.test(c)) return 'servicio';
  if (/consum/.test(c)) return 'consumible';
  return 'refaccion';
}

function normalizeMovimientoTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  const map = {
    entrada_inicial: 'entrada',
    inicial: 'entrada',
    stock_inicial: 'entrada',
    compra: 'entrada',
    recepcion: 'entrada',
    recepción: 'entrada',
    alta: 'entrada',
    salida: 'salida',
    venta: 'salida',
    baja: 'salida',
    envio: 'salida',
    envío: 'salida',
    ajuste: 'ajuste',
    devolucion: 'ajuste',
    devolución: 'ajuste',
    correccion: 'ajuste',
    corrección: 'ajuste',
    transferencia: 'ajuste',
    reservado: 'ajuste',
    reserva: 'ajuste',
  };
  return map[t] || 'ajuste';
}

function normalizeCotizacionEstado(estado) {
  const e = String(estado || '').trim().toLowerCase();
  const map = {
    aprobada: 'aprobada',
    autorizada: 'aprobada',
    aprobado: 'aprobada',
    rechazada: 'rechazada',
    rechazado: 'rechazada',
    convertida: 'convertida',
    convertido: 'convertida',
    pendiente: 'aprobada',
    enviada: 'aprobada',
    vencida: 'rechazada',
    vencido: 'rechazada',
  };
  return map[e] || 'aprobada';
}

function normalizeComprasEstado(estado) {
  const map = {
    0: 1,
    solicitud: 1,
    Solicitud: 1,
    pendiente: 1,
    Pendiente: 1,
    recepcion: 2,
    recepción: 2,
    Recepcion: 2,
    autorizada: 3,
    aprobada: 3,
    pagado: 4,
    Pagado: 4,
    completada: 5,
    completado: 5,
    cancelada: 5,
    cancelado: 5,
  };
  if (estado === null || estado === undefined || estado === '') return 1;
  if (typeof estado === 'number') return estado === 0 ? 1 : estado;
  return map[estado] || 1;
}

function scoreRowCompleteness(row) {
  let score = 0;
  for (const v of Object.values(row)) {
    if (v !== null && v !== undefined && v !== '') score++;
  }
  return score;
}

function dedupeByKey(rows, key) {
  const seen = new Map();
  for (const r of rows) {
    const k = String(r[key] || '').trim().toLowerCase();
    if (!k) continue;
    const existing = seen.get(k);
    if (!existing || scoreRowCompleteness(r) >= scoreRowCompleteness(existing)) {
      seen.set(k, r);
    }
  }
  const winnerSet = new Set(seen.values());
  return rows.map(r => {
    const k = String(r[key] || '').trim().toLowerCase();
    if (!k) return r;
    return winnerSet.has(r) ? r : null;
  }).filter(Boolean);
}

async function cloudRequest(method, table, body = null, query = '') {
  const url = `${SB_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'apikey': SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`,
    'Accept': 'application/json',
  };
  if (method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
    if (method === 'POST' && query && query.includes('on_conflict')) {
      headers['Prefer'] += ',resolution=merge-duplicates';
    }
  }
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json, text: txt };
}

async function cloudCount(table) {
  const r = await cloudRequest('GET', table, null, 'limit=0&select=*');
  const hdr = r.headers.get('content-range');
  if (hdr && hdr.includes('/')) {
    const m = hdr.match(/\/(\d+|\*)/);
    if (m && m[1] !== '*') return Number(m[1]);
  }
  return 0;
}

async function cloudRows(table, select = '*', limit = 10000) {
  const r = await cloudRequest('GET', table, null, `select=${encodeURIComponent(select)}&limit=${limit}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function cloudExists(table, column, value) {
  const r = await cloudRequest('GET', table, null, `${column}=eq.${encodeURIComponent(value)}&select=id&limit=1`);
  return Array.isArray(r.body) && r.body.length > 0 ? r.body[0] : null;
}

async function probeCloudColumns(table, candidateCols) {
  const exists = new Set();
  for (const c of candidateCols) {
    const r = await cloudRequest('GET', table, null, `select=${encodeURIComponent(c)}&limit=0`);
    if (r.status === 200) {
      exists.add(c);
      continue;
    }
    const txt = r.text || '';
    if (!txt.includes(`column ${table}.${c} does not exist`) && !txt.includes(`Could not find the '${c}' column`)) {
      // Otro error, no relacionado con columna; ignorar
    }
  }
  return exists;
}

function filterRowToExistingColumns(row, existingCols) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (existingCols.has(k)) out[k] = v;
  }
  return out;
}

async function cloudInsert(table, rows) {
  if (!rows.length) return { ok: [], errors: [] };
  if (DRY_RUN) return { ok: rows, errors: [] };
  const r = await cloudRequest('POST', table, rows);
  if (r.status >= 200 && r.status < 300) return { ok: Array.isArray(r.body) ? r.body : rows, errors: [] };
  return { ok: [], errors: [{ status: r.status, body: r.body || r.text }] };
}

async function cloudUpsert(table, rows, conflictColumn) {
  if (!rows.length) return { ok: [], errors: [] };
  if (DRY_RUN) return { ok: rows, errors: [] };
  const r = await cloudRequest('POST', table, rows, `on_conflict=${conflictColumn}`);
  // POST bulk upsert requiere Prefer: resolution=merge-duplicates. cloudRequest ya lo añade para POST.
  if (r.status >= 200 && r.status < 300) return { ok: Array.isArray(r.body) ? r.body : rows, errors: [] };
  return { ok: [], errors: [{ status: r.status, body: r.body || r.text }] };
}

async function cloudPatch(table, id, patch) {
  if (DRY_RUN) return { ok: true, error: null };
  const r = await cloudRequest('PATCH', table, patch, `id=eq.${encodeURIComponent(id)}`);
  if (r.status >= 200 && r.status < 300) return { ok: true, error: null };
  return { ok: false, error: { status: r.status, body: r.body || r.text } };
}

// =====================================================
// TRANSFORMACIONES
// =====================================================
function transformServiciosToCatalogo(row) {
  return {
    area: 'automatizacion',
    servicio: row.nombre,
    descripcion: row.descripcion,
    tipo: row.categoria,
    unidad: row.unidad,
    valor_agregado: row.precio,
    horas_estimadas: null,
    activo: true,
  };
}

function transformContactosToCloud(row) {
  return {
    nombre: row.nombre ?? null,
    empresa: row.empresa ?? row.nombre ?? null,
    puesto: row.puesto ?? null,
    tipo: row.tipo ?? 'client',
    color: row.color ?? null,
    direccion: row.direccion ?? null,
    email: row.email || null,
    telefono: row.telefono || null,
    cargo: row.cargo ?? null,
    notas: row.notas ?? null,
    rfc: row.rfc || null,
    sitio_web: row.sitio_web || null,
    logo_url: row.logo_url ?? null,
    created_by: row.created_by ?? null,
    fecha_creacion: row.fecha_creacion ?? row.created_at ?? new Date().toISOString(),
  };
}

function normalizeRows(rows) {
  if (!rows.length) return [];
  const allKeys = new Set();
  for (const r of rows) Object.keys(r).forEach(k => allKeys.add(k));
  return rows.map(r => {
    const out = {};
    for (const k of allKeys) out[k] = r.hasOwnProperty(k) ? r[k] : null;
    return out;
  });
}

function pickBetterContact(a, b) {
  const scoreA = (a.match_score || 0);
  const scoreB = (b.match_score || 0);
  if (scoreB > scoreA) return b;
  if (scoreB < scoreA) return a;
  const dateA = new Date(a.fecha_creacion || a.created_at || 0).getTime();
  const dateB = new Date(b.fecha_creacion || b.created_at || 0).getTime();
  return dateB > dateA ? b : a;
}

function contactoDedupeKey(r) {
  const nombre = String(r.nombre || '').trim().toLowerCase();
  const empresa = String(r.empresa || '').trim().toLowerCase();
  const telefono = String(r.telefono || '').replace(/\D/g, '');
  const triple = `${nombre}|${empresa}|${telefono}`;
  if (nombre || telefono) return triple;
  const email = String(r.email || '').trim().toLowerCase();
  return email || null;
}

function dedupeContactos(rows) {
  const groups = new Map();
  const winners = new Set();

  for (const r of rows) {
    const key = contactoDedupeKey(r);
    if (!key) continue; // sin datos mínimos, no insertar duplicados sueltos
    const existing = groups.get(key);
    if (!existing || pickBetterContact(existing, r) === r) {
      if (existing) winners.delete(existing);
      groups.set(key, r);
      winners.add(r);
    }
  }

  return rows.filter(r => winners.has(r));
}

// =====================================================
// MAIN
// =====================================================
async function main() {
  console.log(`[migrar-a-cloud] Modo: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | Fases: ${PHASES.join(', ')}`);

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  let idMap = {};
  if (fs.existsSync(ID_MAP_PATH)) idMap = JSON.parse(fs.readFileSync(ID_MAP_PATH, 'utf8'));

  // Limpiar idMap de las tablas que se van a migrar en esta corrida para evitar ids obsoletos
  const tablesInRun = new Set(TABLE_PLANS.filter(p => PHASES.includes(p.phase)).map(p => p.cloud));
  for (const key of Object.keys(idMap)) {
    const table = key.split(':')[0];
    if (tablesInRun.has(table)) delete idMap[key];
  }

  // Precargar datos cloud para merges (fase 2) y lookups
  const cloudCache = {};
  const skuToCloudId = {};
  for (const plan of TABLE_PLANS) {
    if (!PHASES.includes(plan.phase)) continue;
    if (plan.mergeBy || plan.updateExisting || plan.onlyUpdateExisting || plan.upsertBy || plan.skipExistingBy) {
      const extra = [];
      if (plan.cloud === 'usuarios' || plan.cloud === 'users') extra.push('auth_user_id');
      if (plan.cloud === 'contactos') extra.push('email', 'empresa', 'telefono', 'nombre');
      const select = [plan.mergeBy, plan.fallbackMergeBy, plan.upsertBy, plan.skipExistingBy, 'id', ...extra].filter(Boolean).join(',');
      cloudCache[plan.cloud] = await cloudRows(plan.cloud, select);
      console.log(`[cache] ${plan.cloud}: ${cloudCache[plan.cloud].length} filas cargadas para merge.`);
    }
  }

  // Lookup de usuarios para fase 6 (offline user-00x → cloud uuid)
  let userMaps = { offline: new Map(), byEmail: new Map(), byNombre: new Map() };
  if (PHASES.includes(6)) {
    const cloudUsers = await cloudRows('usuarios', 'id,email,nombre,auth_user_id');
    const maps = buildUserMaps(cloudUsers);
    userMaps.byEmail = maps.byEmail;
    userMaps.byNombre = maps.byNombre;
    const stmt = db.prepare('SELECT id, email, nombre FROM offline_usuarios');
    while (stmt.step()) {
      const obj = stmt.getAsObject();
      const uid = resolveUserId(null, userMaps, { email: obj.email, nombre: obj.nombre });
      if (uid) userMaps.offline.set(obj.id, uid);
    }
    stmt.free();
    console.log(`[lookup] offline_usuarios → cloud: ${userMaps.offline.size} mapeos.`);
  }

  // Lookup SKU → cloud id e ids de inventario cloud para movimientos
  const cloudInventarioIds = new Set();
  if (PHASES.includes(4)) {
    const invRows = await cloudRows('inventario', 'id,sku');
    for (const r of invRows) {
      if (r.sku) skuToCloudId[String(r.sku).trim().toLowerCase()] = r.id;
      if (r.id) cloudInventarioIds.add(r.id);
    }
    console.log(`[lookup] inventario sku→id: ${Object.keys(skuToCloudId).length} entries, ids: ${cloudInventarioIds.size}.`);
  }

  for (const plan of TABLE_PLANS) {
    if (!PHASES.includes(plan.phase)) continue;

    const localCount = db.exec(`SELECT COUNT(*) FROM ${plan.local}`)[0].values[0][0];
    console.log(`\n[fase ${plan.phase}] ${plan.local} (${localCount} rows) → ${plan.cloud}`);
    if (!localCount) {
      console.log('  0 filas locales, nada que migrar.');
      continue;
    }
    if (plan.skip) {
      console.log('  skip por configuración.');
      continue;
    }

    // Verificar cloud table
    if (plan.createCloudTable) {
      const exists = (await cloudCount(plan.cloud)) !== null;
      console.log(`  createCloudTable=${plan.createCloudTable}. existencia detectada por count=${exists}.`);
      if (!exists) {
        console.error(`  ERROR: La tabla cloud ${plan.cloud} no existe. Ejecuta scripts/migrations/create_bom_automatizacion.sql en Supabase SQL Editor.`);
        continue;
      }
    }

    // Recargar lookup SKU→id antes de migrar movimientos de inventario
    if (plan.cloud === 'movimientos_inventario') {
      const invRows = await cloudRows('inventario', 'id,sku');
      for (const r of invRows) {
        if (r.sku) skuToCloudId[String(r.sku).trim().toLowerCase()] = r.id;
        if (r.id) cloudInventarioIds.add(r.id);
      }
      console.log(`  [lookup refresh] inventario sku→id: ${Object.keys(skuToCloudId).length} entries, ids: ${cloudInventarioIds.size}.`);
    }

    // 1) Leer y transformar todas las filas locales
    const stmt = db.prepare(`SELECT * FROM ${plan.local}`);
    const localRecs = [];
    let rowIndex = 0;
    while (stmt.step()) {
      rowIndex++;
      const obj = stmt.getAsObject();
      let flat = flattenLocalRow(obj, plan.local);
      let rec = cleanRow(flat, plan.excludeFields || []);
      rec._rowIndex = rowIndex;
      const localId = rec.id ?? obj.id;

      if (plan.transform === 'servicios_automatizacion_to_catalogo') {
        rec = transformServiciosToCatalogo(rec);
      }
      if (plan.transform === 'contactos_to_cloud') {
        rec = transformContactosToCloud(rec);
      }

      // Offline users → schema cloud
      if (plan.isOfflineUsers) {
        rec = {
          email: rec.email,
          nombre: rec.nombre,
          rol: rec.rol,
          departamento: rec.departamento || null,
          telefono: null,
          mfa_enabled: false,
          activo: rec.activo !== 0,
          sede: null,
          nivel_riesgo: null,
        };
      }

      // Usuarios locales → schema cloud (conservando email/rol/departamento de cloud por seguridad)
      if (plan.local === 'local_usuarios') {
        rec = {
          email: rec.email,
          nombre: rec.nombre,
          rol: rec.rol,
          telefono: rec.telefono ?? null,
          mfa_enabled: false,
          activo: rec.activo !== false && rec.activo !== 0,
          sede: rec.sede ?? null,
          nivel_riesgo: rec.nivel_riesgo ?? null,
        };
      }

      // Sanitizar FKs UUID, fechas vacías, strings no-JSON, y rellenar NOT NULL del cloud
      rec = sanitizeForCloud(rec, plan.cloud);
      rec = applySchemaDefaults(plan.cloud, rec);
      rec = preCloudMap(plan.cloud, rec, skuToCloudId, cloudInventarioIds, idMap, userMaps);
      delete rec._rowIndex;

      // Fase 6: descartar filas huérfanas que violarían NOT NULL de FK
      if (plan.cloud === 'actividades_contactos' && !rec.contacto_id) {
        console.log(`    skip actividad huérfana (contacto_id ${localId})`);
        continue;
      }
      if ((plan.cloud === 'vacaciones_balance' || plan.cloud === 'vacaciones_empleados' || plan.cloud === 'vacaciones_solicitudes') && !rec.user_id) {
        console.log(`    skip vacaciones sin user_id (${localId})`);
        continue;
      }

      localRecs.push({ localId, rec });
    }
    stmt.free();

    if (!localRecs.length) {
      console.log('  0 filas locales tras transformación.');
      continue;
    }

    // 2) Sondear columnas existentes en la tabla cloud (incluyendo siempre id)
    const candidateKeys = new Set();
    for (const { rec } of localRecs) Object.keys(rec).forEach(k => candidateKeys.add(k));
    const existingCols = await probeCloudColumns(plan.cloud, ['id', ...Array.from(candidateKeys)]);
    const missingCols = Array.from(candidateKeys).filter(k => !existingCols.has(k));
    console.log(`  columnas cloud detectadas: ${existingCols.size}/${candidateKeys.size}`);
    if (missingCols.length && missingCols.length <= 15) {
      console.log(`  columnas omitidas (no existen en cloud): ${missingCols.join(', ')}`);
    } else if (missingCols.length) {
      console.log(`  columnas omitidas (no existen en cloud): ${missingCols.length} en total`);
    }

    // 3) Merge + filtrado + generación de inserts/updates
    const inserts = [];
    const updates = [];
    const skipped = [];

    for (const item of localRecs) {
      let rec = { ...item.rec };
      const localId = item.localId;

      // Merge por campo único (principal + fallback + email para contactos)
      let cloudMatch = null;
      if (plan.mergeBy || plan.upsertBy) {
        const key = plan.mergeBy || plan.upsertBy;
        const val = rec[key];
        if (val) {
          cloudMatch = (cloudCache[plan.cloud] || []).find(r => String(r[key] || '').toLowerCase() === String(val).toLowerCase());
          if (!cloudMatch && plan.fallbackMergeBy && rec[plan.fallbackMergeBy]) {
            cloudMatch = (cloudCache[plan.cloud] || []).find(r => String(r[plan.fallbackMergeBy] || '').toLowerCase() === String(rec[plan.fallbackMergeBy]).toLowerCase());
          }
          if (!cloudMatch && plan.cloud === 'contactos' && rec.email) {
            cloudMatch = (cloudCache[plan.cloud] || []).find(r => String(r.email || '').toLowerCase() === String(rec.email).toLowerCase());
          }
        }
        // Contactos: match adicional por email y por clave única triple (nombre+empresa+telefono)
        if (!cloudMatch && plan.cloud === 'contactos' && rec.email) {
          cloudMatch = (cloudCache[plan.cloud] || []).find(r => String(r.email || '').toLowerCase() === String(rec.email).toLowerCase());
        }
        if (!cloudMatch && plan.cloud === 'contactos') {
          const k = contactoDedupeKey(rec);
          if (k) {
            cloudMatch = (cloudCache[plan.cloud] || []).find(r => contactoDedupeKey(r) === k);
          }
        }
      }

      if (cloudMatch) {
        if (plan.upsertBy) {
          delete rec.id;
          rec = filterRowToExistingColumns(rec, existingCols);
          inserts.push(rec);
          idMap[`${plan.cloud}:${localId}`] = cloudMatch.id;
        } else if (plan.onlyUpdateExisting || plan.updateExisting) {
          const patch = { ...rec };
          for (const f of (plan.preserveCloudFields || [])) delete patch[f];
          const filteredPatch = filterRowToExistingColumns(patch, existingCols);
          updates.push({ cloudId: cloudMatch.id, patch: filteredPatch });
          idMap[`${plan.cloud}:${localId}`] = cloudMatch.id;
        } else {
          rec.id = cloudMatch.id;
          for (const f of (plan.preserveCloudFields || [])) {
            if (cloudMatch[f] !== undefined) rec[f] = cloudMatch[f];
          }
          rec = filterRowToExistingColumns(rec, existingCols);
          inserts.push(rec);
          idMap[`${plan.cloud}:${localId}`] = cloudMatch.id;
        }
      } else {
        // Skip si ya existe en cloud por campo natural (sin upsert posible)
      if (plan.skipExistingBy) {
        const skipVal = String(rec[plan.skipExistingBy] || '').trim().toLowerCase();
        const existsInCloud = skipVal && (cloudCache[plan.cloud] || []).some(r => String(r[plan.skipExistingBy] || '').trim().toLowerCase() === skipVal);
        if (existsInCloud) {
          skipped.push({ localId, [plan.skipExistingBy]: rec[plan.skipExistingBy] });
          continue;
        }
      }

      if (plan.onlyUpdateExisting) {
        skipped.push({ localId, email: rec.email });
        continue;
      }
      if (plan.genId && !isUuid(String(rec.id))) {
        rec.id = uuidv4();
      }
      idMap[`${plan.cloud}:${localId}`] = rec.id;
      rec = filterRowToExistingColumns(rec, existingCols);
      inserts.push(rec);
    }
  }

    if (DRY_RUN) {
      console.log(`  planeado: ${inserts.length} inserts, ${updates.length} updates, ${skipped.length} skipped.`);
      if (inserts.length) console.log(`  muestra insert:`, JSON.stringify(inserts[0], null, 2).slice(0, 700));
      if (updates.length) console.log(`  muestra update:`, JSON.stringify(updates[0], null, 2).slice(0, 700));
      if (skipped.length) console.log(`  skipped (requieren crear auth user):`, JSON.stringify(skipped.slice(0,5), null, 2));
      continue;
    }

    // Normalizar keys para bulk insert y dedupear upserts por campo de conflicto
    let dedupedInserts = inserts;
    if (plan.cloud === 'contactos') dedupedInserts = dedupeContactos(inserts);
    if (plan.upsertBy) dedupedInserts = dedupeByKey(dedupedInserts, plan.upsertBy);
    const normalizedInserts = normalizeRows(dedupedInserts);

    // Ejecutar inserts
    let inserted = 0, errors = [];
    const chunkSize = plan.cloud === 'contactos' ? 1 : (PHASE === 3 ? 10 : 100);
    for (let i = 0; i < normalizedInserts.length; i += chunkSize) {
      const chunk = normalizedInserts.slice(i, i + chunkSize);
      const res = plan.upsertBy ? await cloudUpsert(plan.cloud, chunk, plan.upsertBy) : await cloudInsert(plan.cloud, chunk);
      inserted += res.ok.length;
      errors.push(...res.errors);
    }

    // Ejecutar updates
    let updated = 0;
    for (const u of updates) {
      const res = await cloudPatch(plan.cloud, u.cloudId, u.patch);
      if (res.ok) updated++;
      else errors.push(res.error);
    }

    console.log(`  resultado: ${inserted} inserts, ${updated} updates, ${skipped.length} skipped, ${errors.length} errores.`);
    if (errors.length) console.log(`  primer error:`, JSON.stringify(errors[0], null, 2).slice(0, 500));

    fs.writeFileSync(ID_MAP_PATH, JSON.stringify(idMap, null, 2));
  }

  db.close();
  console.log('\n[migrar-a-cloud] Finalizado.');
  if (DRY_RUN) console.log('Este fue dry-run; no se escribió nada en cloud.');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
