/** Rutas de páginas por clave de borrador / módulo. */
export const MODULE_PAGE_PATH = {
  ordenes_taller: '/panel/pages/ssepi_taller.html',
  ordenes_motores: '/panel/pages/ssepi_motores.html',
  proyectos_automatizacion: '/panel/pages/ssepi_servicios.html',
  compras: '/panel/pages/ssepi_compras.html',
};

export function pagePathForModule(module) {
  return MODULE_PAGE_PATH[module] || '/panel/panel.html';
}
