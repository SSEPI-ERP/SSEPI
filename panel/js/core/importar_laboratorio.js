/**
 * Formato laboratorio-1 — normalización para importación en taller.js / panel SSEPI.
 * Fuente: simulaciones/nuevo paq/.../05_Formato_Laboratorio_Import/importar_laboratorio.js
 * Uso: orden = LaboratorioImport.normalize(orden);
 */
(function (global) {
  'use strict';

  var VERSION = 'laboratorio-1';
  var MAX_IMG = 5;
  var ETAPAS = [
    { n: 1, nombre: 'Registrado' },
    { n: 2, nombre: 'Diagnóstico' },
    { n: 3, nombre: 'Esperando Cotización / Confirmación' },
    { n: 4, nombre: 'Reparación / Reparado' },
    { n: 5, nombre: 'Entregado / Facturado' }
  ];

  function s(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function emptyEtapas() {
    return ETAPAS.map(function (e) {
      return { n: e.n, nombre: e.nombre, fecha: '', estado: 'pendiente' };
    });
  }

  function etapaDesdeEstado(estado) {
    var lo = s(estado).toLowerCase();
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
    (orden.etapas || []).forEach(function (e) {
      if (e.n < etapa) e.estado = 'completado';
      else if (e.n === etapa) {
        e.estado = 'en_curso';
        if (fecha) e.fecha = fecha;
      } else e.estado = 'pendiente';
    });
    if (!s(orden.estado_actual)) orden.estado_actual = ETAPAS[etapa - 1].nombre;
  }

  function imagenesReporte(orden) {
    var list = orden.imagenes_reporte;
    if (list && list.length) return list.filter(Boolean).slice(0, MAX_IMG);
    list = orden.imagenes_servicio;
    if (list && list.length) {
      return list
        .filter(function (u) {
          return u && !/screenshot|captura|erp|odoo/i.test(u);
        })
        .slice(0, MAX_IMG);
    }
    return [];
  }

  function imagenesCaptura(orden) {
    var list = orden.imagenes_erp;
    if (list && list.length) {
      var cap = list.filter(function (u) { return u && /screenshot|captura|erp|odoo/i.test(u); });
      if (cap.length) return cap.slice(0, 1);
    }
    list = orden.imagenes_servicio;
    if (list && list.length) {
      var cap2 = list.filter(function (u) { return u && /screenshot|captura|erp|odoo/i.test(u); });
      if (cap2.length) return cap2.slice(0, 1);
    }
    return [];
  }

  function urlImagen(path) {
    var u = s(path);
    if (!u || u === 'null' || u === 'undefined') return '';
    if (/^https?:\/\//i.test(u) || u.indexOf('data:') === 0) return u;
    if (u.charAt(0) === '/') return u;
    return '/' + u.replace(/^\.?\//, '');
  }

  function yaMigrado(row) {
    if (row.formato !== VERSION) return false;
    if (!row.datos_recepcion) return false;
    if (!row.etapas || row.etapas.length !== 5) return false;
    if ((row.etapa_actual || 1) > 1) return true;
    return row.etapas.some(function (e) {
      return e.estado && e.estado !== 'pendiente';
    });
  }

  function normalize(row) {
    if (!row) return emptyOrden('');
    if (yaMigrado(row)) {
      row.imagenes_reporte = imagenesReporte(row).map(urlImagen).filter(Boolean);
      return row;
    }

    var falla = s(row.falla || row.diagnostico);
    var comp = s(row.componente);
    if (!falla && /^falla[\s_—\-:]/i.test(comp)) {
      falla = comp.replace(/^falla[\s_—\-:]*/i, '').trim();
      comp = '';
    }

    var out = {
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
        falla: falla
      },
      resumen_diagnostico: s(row.resumen_diagnostico || row.descripcion || row.diagnostico),
      notas_reparacion: s(row.notas_reparacion || row.notas),
      reporte_tecnico: s(row.reporte_tecnico),
      imagenes_reporte: [],
      componentes_extras: row.componentes_extras || [],
      componentes_inventario: row.componentes_inventario || [],
      componentes_compra: row.componentes_compra || [],
      consumibles_usados: row.consumibles_usados || [],
      bitacora: row.bitacora || { notas: [], registro: [] }
    };

    [
      'estado_actual', 'numero_orden', 'tipo_orden', 'cliente', 'cliente_rfc', 'equipo',
      'componente', 'bajo_garantia', 'fecha_ingreso', 'fecha', 'encargado', 'vendedor',
      'materiales', 'descripcion', 'notas', 'diagnostico', 'solucion', 'historial_actividad',
      'imagenes_erp', 'imagenes_servicio', 'archivos_pdf'
    ].forEach(function (k) {
      if (row[k] !== undefined) out[k] = row[k];
    });

    aplicarEtapa(out, out.etapa_actual, s(row.fecha_ingreso));
    if (!out.resumen_diagnostico) {
      out.resumen_diagnostico = [out.notas, out.diagnostico, out.solucion].filter(Boolean).join('\n\n');
    }
    out.reporte_tecnico = out.reporte_tecnico || out.resumen_diagnostico;
    out.imagenes_reporte = imagenesReporte(out).map(urlImagen).filter(Boolean);

    var hist = s(row.historial_actividad);
    if (hist && (!out.bitacora.registro || !out.bitacora.registro.length)) {
      out.bitacora.registro = hist.split('\n').map(s).filter(Boolean);
    }

    return out;
  }

  function emptyOrden(ref) {
    var o = normalize({ referencia_reparacion: ref || '' });
    o.formato = VERSION;
    return o;
  }

  function normalizeList(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize);
  }

  global.LaboratorioImport = {
    VERSION: VERSION,
    MAX_IMAGENES_REPORTE: MAX_IMG,
    ETAPAS: ETAPAS,
    normalize: normalize,
    normalizeList: normalizeList,
    emptyOrden: emptyOrden,
    urlImagen: urlImagen,
    imagenesReporte: imagenesReporte,
    imagenesCaptura: imagenesCaptura
  };
})(typeof window !== 'undefined' ? window : globalThis);
