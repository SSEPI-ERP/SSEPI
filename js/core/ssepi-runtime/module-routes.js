/** Rutas de páginas por clave de borrador / módulo. */
export const MODULE_PAGE_PATH = {
  ordenes_taller: '/pages/ssepi_taller.html',
  ordenes_motores: '/pages/ssepi_motores.html',
  proyectos_automatizacion: '/pages/ssepi_servicios.html',
  compras: '/pages/ssepi_compras.html',
};

export function pagePathForModule(module) {
  return MODULE_PAGE_PATH[module] || '/panel.html';
}
