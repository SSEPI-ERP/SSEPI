import { getPrioritySuppliersForModule, normalizeUrl } from './priority-suppliers-catalog.js';

function presetAsContactRow(p) {
  return {
    id: '__prio_' + p.clave,
    nombre: p.nombre,
    empresa: p.nombre,
    puesto: p.etiqueta + ' · ' + p.ubicacion,
    sitio_web: p.url,
    direccion: p.ubicacion,
    tipo: 'provider',
    _priorityOrder: p.orden,
    _isCatalogPreset: true,
  };
}

/**
 * Orden: catálogo (1–6) sin duplicar — si ya hay contacto con la misma URL, se usa el de BD.
 * Luego el resto de proveedores por nombre.
 */
export function mergePriorityProvidersFirst(contacts, moduleKey) {
  var catalog = getPrioritySuppliersForModule(moduleKey);
  if (!catalog.length) {
    var only = (contacts || []).filter(function (c) { return c.tipo === 'provider'; });
    only.sort(function (a, b) {
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    return only;
  }
  var providers = (contacts || []).filter(function (c) { return c.tipo === 'provider'; });
  var byUrl = {};
  var i;
  for (i = 0; i < providers.length; i++) {
    var c = providers[i];
    var sw = c.sitio_web ? normalizeUrl(c.sitio_web) : '';
    if (sw) byUrl[sw] = c;
  }
  var out = [];
  for (i = 0; i < catalog.length; i++) {
    var p = catalog[i];
    var nu = normalizeUrl(p.url);
    var row = byUrl[nu];
    if (row) {
      out.push(Object.assign({}, row, {
        _priorityOrder: p.orden,
        _matchedCatalog: true,
        puesto: row.puesto || (p.etiqueta + ' · ' + p.ubicacion),
      }));
      delete byUrl[nu];
    } else {
      out.push(presetAsContactRow(p));
    }
  }
  var unmatched = [];
  var keys = Object.keys(byUrl);
  for (i = 0; i < keys.length; i++) {
    unmatched.push(byUrl[keys[i]]);
  }
  unmatched.sort(function (a, b) {
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });
  return out.concat(unmatched);
}
