/** Rutas de páginas por clave de borrador / módulo. */
export const MODULE_PAGE_PATH = {
  ordenes_taller: '/pages/ssepi_taller.html',
  ordenes_motores: '/pages/ssepi_motores.html',
  proyectos_automatizacion: '/pages/ssepi_servicios.html',
  compras: '/pages/ssepi_compras.html',
  ventas: '/pages/ssepi_ventas.html',
  contactos: '/pages/ssepi_contactos.html',
  inventario: '/pages/ssepi_inventario.html',
};

export function pagePathForModule(module) {
  return MODULE_PAGE_PATH[module] || '/panel.html';
}
