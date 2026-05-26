/**
 * Formato laboratorio-1 (ESM) — mismo esquema que panel/js/core/importar_laboratorio.js
 */
export const VERSION = 'laboratorio-1';
export const MAX_IMAGENES_REPORTE = 5;

export const ETAPAS = [
  { n: 1, nombre: 'Registrado' },
  { n: 2, nombre: 'Diagnóstico' },
  { n: 3, nombre: 'Esperando Cotización / Confirmación' },
  { n: 4, nombre: 'Reparación / Reparado' },
  { n: 5, nombre: 'Entregado / Facturado' },
];

function s(v) {
  if (v == null) return '';
  return String(v).trim();
}

function emptyEtapas() {
  return ETAPAS.map((e) => ({ n: e.n, nombre: e.nombre, fecha: '', estado: 'pendiente' }));
}

function etapaDesdeEstado(estado) {
  const lo = s(estado).toLowerCase();
  if (/entregad|facturad/.test(lo)) return 5;
  if (/reparad|listo/.test(lo)) return 4;
  if (/en\s+reparaci|reparaci[oó]n/.test(lo)) return 4;
  if (/confirmad|cotizaci|esperando\s+confirm/.test(lo)) return 3;
  if (/diagn[oó]stic/.test(lo)) return 2;
  if (/nuevo|registrad/.test(lo)) return 1;
  return 1;
}

function aplicarEtapa(orden, etapa, fecha) {
  etapa = Math.max(1, Math.min(5, parseInt(etapa, 10) || 1));
  orden.etapa_actual = etapa;
  (orden.etapas || []).forEach((e) => {
    if (e.n < etapa) e.estado = 'completado';
    else if (e.n === etapa) {
      e.estado = 'en_curso';
      if (fecha) e.fecha = fecha;
    } else e.estado = 'pendiente';
  });
  if (!s(orden.estado_actual)) orden.estado_actual = ETAPAS[etapa - 1].nombre;
}

export function imagenesReporte(orden) {
  let list = orden.imagenes_reporte;
  if (list?.length) return list.filter(Boolean).slice(0, MAX_IMAGENES_REPORTE);
  list = orden.imagenes_servicio;
  if (list?.length) {
    return list
      .filter((u) => u && !/screenshot|captura|erp|odoo/i.test(u))
      .slice(0, MAX_IMAGENES_REPORTE);
  }
  return [];
}

export function urlImagen(path) {
  const u = s(path);
  if (!u || u === 'null' || u === 'undefined') return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  if (u.startsWith('/')) return u;
  return `/${u.replace(/^\.?\//, '')}`;
}

function yaMigrado(row) {
  if (row.formato !== VERSION) return false;
  if (!row.datos_recepcion) return false;
  if (!row.etapas || row.etapas.length !== 5) return false;
  if ((row.etapa_actual || 1) > 1) return true;
  return row.etapas.some((e) => e.estado && e.estado !== 'pendiente');
}

export function normalizeLabOrder(row) {
  if (!row) return normalizeLabOrder({ referencia_reparacion: '' });
  if (yaMigrado(row)) {
    row.imagenes_reporte = imagenesReporte(row).map(urlImagen).filter(Boolean);
    return row;
  }

  let falla = s(row.falla || row.diagnostico);
  let comp = s(row.componente);
  if (!falla && /^falla[\s_—\-:]/i.test(comp)) {
    falla = comp.replace(/^falla[\s_—\-:]*/i, '').trim();
    comp = '';
  }

  const out = {
    formato: VERSION,
    referencia_reparacion: s(row.referencia_reparacion),
    numero_orden_wh: s(row.numero_orden_wh || row.numero_orden),
    etapa_actual: row.etapa_actual || etapaDesdeEstado(row.estado_actual),
    etapas: emptyEtapas(),
    datos_recepcion: {
      cliente: s(row.cliente),
      marca: s(row.marca),
      serie: s(row.serie || comp),
      condiciones: s(row.condiciones),
      equipo: s(row.equipo),
      modelo: s(row.modelo),
      falla,
    },
    resumen_diagnostico: s(row.resumen_diagnostico || row.descripcion || row.diagnostico),
    notas_reparacion: s(row.notas_reparacion || row.notas),
    reporte_tecnico: s(row.reporte_tecnico),
    imagenes_reporte: [],
    componentes_extras: row.componentes_extras || [],
    componentes_inventario: row.componentes_inventario || [],
    componentes_compra: row.componentes_compra || [],
    consumibles_usados: row.consumibles_usados || [],
    bitacora: row.bitacora || { notas: [], registro: [] },
  };

  [
    'estado_actual', 'numero_orden', 'tipo_orden', 'cliente', 'cliente_rfc', 'equipo',
    'componente', 'bajo_garantia', 'fecha_ingreso', 'fecha', 'encargado', 'vendedor',
    'materiales', 'descripcion', 'notas', 'diagnostico', 'solucion', 'historial_actividad',
    'imagenes_erp', 'imagenes_servicio', 'archivos_pdf',
  ].forEach((k) => {
    if (row[k] !== undefined) out[k] = row[k];
  });

  aplicarEtapa(out, out.etapa_actual, s(row.fecha_ingreso));
  if (!out.resumen_diagnostico) {
    out.resumen_diagnostico = [out.notas, out.diagnostico, out.solucion].filter(Boolean).join('\n\n');
  }
  out.reporte_tecnico = out.reporte_tecnico || out.resumen_diagnostico;
  out.imagenes_reporte = imagenesReporte(out).map(urlImagen).filter(Boolean);

  const hist = s(row.historial_actividad);
  if (hist && (!out.bitacora.registro || !out.bitacora.registro.length)) {
    out.bitacora.registro = hist.split('\n').map(s).filter(Boolean);
  }

  return out;
}

export function normalizeLabList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeLabOrder);
}
