export const PRIORITY_SUPPLIER_MODULES = ['taller', 'motores', 'automatizacion'];

export const PRIORITY_SUPPLIERS_BASE = [
  { orden: 1, clave: 'welectronics', nombre: 'W Electronics', url: 'https://welectronics.com.mx/', ubicacion: 'LEON', etiqueta: 'Filtro 1' },
  { orden: 2, clave: 'agelectronica', nombre: 'AG Electronica', url: 'https://agelectronica.com/', ubicacion: 'CDMX', etiqueta: 'Filtro 2' },
  { orden: 3, clave: 'mouser', nombre: 'Mouser', url: 'https://www.mouser.mx/', ubicacion: 'USA', etiqueta: 'Filtro 3' },
  { orden: 4, clave: 'digikey', nombre: 'DigiKey', url: 'https://www.digikey.com.mx/', ubicacion: 'USA', etiqueta: 'Filtro 4' },
  { orden: 5, clave: 'tme', nombre: 'TME', url: 'https://www.tme.com/mx/es/', ubicacion: 'POLONIA', etiqueta: 'Filtro 5' },
  { orden: 6, clave: 'utsource', nombre: 'UTSource', url: 'https://www.utsource.net/', ubicacion: 'CHINA', etiqueta: 'Filtro 6' },
];

export function getPrioritySuppliersForModule(moduleKey) {
  if (PRIORITY_SUPPLIER_MODULES.indexOf(moduleKey) === -1) return [];
  return PRIORITY_SUPPLIERS_BASE.slice().sort(function (a, b) { return a.orden - b.orden; });
}

export function normalizeUrl(href) {
  if (!href || typeof href !== 'string') return '';
  try {
    var x = new URL(href.trim());
    return (x.protocol + '//' + x.host.replace(/^www\./, '')).toLowerCase();
  } catch (e) {
    return String(href).trim().toLowerCase().replace(/^www\./, '');
  }
}

export function findPrioritySupplierByUrl(url) {
  var u = normalizeUrl(url);
  if (!u) return null;
  for (var i = 0; i < PRIORITY_SUPPLIERS_BASE.length; i++) {
    if (normalizeUrl(PRIORITY_SUPPLIERS_BASE[i].url) === u) return PRIORITY_SUPPLIERS_BASE[i];
  }
  return null;
}
