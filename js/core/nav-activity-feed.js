/**
 * Actividad reciente (audit_logs) en el menú lateral izquierdo.
 * No se monta en Contabilidad (bitácora a la derecha).
 * Filtra por tablas según el enlace activo del menú (data-module).
 */
import { initAuditFeed } from './audit-feed.js';

/** Tablas de auditoría típicas por módulo del menú (data-module). */
const MODULE_AUDIT_TABLES = {
  ordenes_taller: ['ordenes_taller', 'compras', 'notificaciones'],
  ordenes_motores: ['ordenes_motores', 'compras', 'notificaciones'],
  proyectos_automatizacion: ['proyectos_automatizacion', 'compras'],
  ventas: ['ventas', 'cotizaciones'],
  analisis_ventas: ['ventas'],
  compras: ['compras'],
  inventario: ['inventario', 'bom_lineas'],
  contactos: ['contactos'],
  facturas: ['facturas', 'ingresos_contabilidad'],
  contabilidad: ['facturas', 'compras', 'movimientos_banco', 'pagos_nomina'],
  pagos_nomina: ['pagos_nomina', 'usuarios'],
  calculadoras: ['calculadoras', 'calculadora_costos', 'calculadora_clientes'],
  vacaciones: ['vacaciones', 'permisos'],
  paginas: [],
};

export function mountNavActivityFeed() {
  if (document.body.classList.contains('page-contabilidad')) return;
  const nav = document.getElementById('sidebar');
  if (!nav || nav.querySelector('.ssepi-nav-activity')) return;

  const active = nav.querySelector('a.nav-item.active');
  const mod = active?.getAttribute('data-module') || '';
  const tables = Object.prototype.hasOwnProperty.call(MODULE_AUDIT_TABLES, mod)
    ? MODULE_AUDIT_TABLES[mod]
    : [];

  const wrap = document.createElement('div');
  wrap.className = 'ssepi-nav-activity';
  wrap.innerHTML =
    '<div class="ssepi-nav-activity-head">' +
    '<span><i class="fas fa-stream"></i> Actividad</span>' +
    '<span class="ssepi-nav-activity-count" id="ssepiNavFeedCount">0</span>' +
    '</div>' +
    '<div class="ssepi-nav-activity-list" id="ssepiNavFeedList"></div>';
  nav.appendChild(wrap);

  initAuditFeed({
    tables,
    listId: 'ssepiNavFeedList',
    countId: 'ssepiNavFeedCount',
    limit: 14,
    label: 'ERP',
    accentCssVar: '--module-accent',
  });
}
