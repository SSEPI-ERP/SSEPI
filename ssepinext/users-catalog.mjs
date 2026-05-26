/**
 * Catálogo único de usuarios SSEPI (offline + perfiles).
 * `nombre` = persona; `departamento` = área operativa (no mostrar en header).
 */
export const SSEPI_USERS_CORE = [
  { id: 'user-001', email: 'norbertomoro4@gmail.com', password: 'Ssepi2025!', nombre: 'Norberto Moro', rol: 'superadmin', departamento: 'Administracion' },
  { id: 'user-002', email: 'ventas1@ssepi.org', password: 'Ssepi2025!', nombre: 'Carlos Calderon', rol: 'ventas', departamento: 'Ventas' },
  { id: 'user-003', email: 'ventas@ssepi.org', password: 'Ssepi2025!', nombre: 'Daniel Zuniga', rol: 'admin', departamento: 'Ventas' },
  { id: 'user-004', email: 'compras@ssepi.org', password: 'Ssepi2025!', nombre: 'Itzel', rol: 'compras', departamento: 'Compras' },
  { id: 'user-005', email: 'motores1@ssepi.org', password: 'Ssepi2025!', nombre: 'Becerra', rol: 'motores', departamento: 'Motores' },
  { id: 'user-006', email: 'automatizacion1@ssepi.org', password: 'Ssepi2025!', nombre: 'Tecnico', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-007', email: 'ivang.ssepi@gmail.com', password: 'Ssepi2025!', nombre: 'Ivan', rol: 'automatizacion', departamento: 'Automatizacion' },
  { id: 'user-008', email: 'administracion@ssepi.org', password: 'Ssepi2025!', nombre: 'Administracion', rol: 'administracion', departamento: 'Administracion' },
  { id: 'user-009', email: 'automatizacion@ssepi.org', password: 'Ssepi2025!', nombre: 'Arturo', rol: 'admin', departamento: 'Automatizacion' },
  { id: 'user-010', email: 'electronica@ssepi.org', password: 'Ssepi2025!', nombre: 'Javier', rol: 'admin', departamento: 'Laboratorio de Electronica' },
  { id: 'user-011', email: 'electronica.ssepi@gmail.com', password: 'Ssepi2025!', nombre: 'Aron', rol: 'taller', departamento: 'Laboratorio de Electronica' },
];

/** Cuentas extra de prueba / túnel (login en .bat). */
export const SSEPI_USERS_EXTRAS = [
  { id: 'user-012', email: 'laboratorio1@ssepi.org', password: 'Ssepi2025!', nombre: 'Javier', rol: 'admin', departamento: 'Laboratorio de Electronica' },
];

export const SSEPI_USERS = [...SSEPI_USERS_CORE, ...SSEPI_USERS_EXTRAS];

export const SSEPI_USERS_BY_EMAIL = Object.fromEntries(
  SSEPI_USERS.map((u) => [u.email.toLowerCase(), u])
);
