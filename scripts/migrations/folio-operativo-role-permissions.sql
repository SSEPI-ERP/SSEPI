-- =============================================================================
-- Permisos app (role_permissions) para ssepi_folio_operativo / ssepi_folio_evento
-- El cliente usa authService.hasPermission(module, action) en escritura.
-- Ejecutar en Supabase. Idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO public.role_permissions (rol, module, action) VALUES
  ('ventas', 'ssepi_folio_operativo', 'create'),
  ('ventas', 'ssepi_folio_operativo', 'read'),
  ('ventas', 'ssepi_folio_operativo', 'update'),
  ('ventas', 'ssepi_folio_evento', 'read'),
  ('ventas_sin_compras', 'ssepi_folio_operativo', 'create'),
  ('ventas_sin_compras', 'ssepi_folio_operativo', 'read'),
  ('ventas_sin_compras', 'ssepi_folio_operativo', 'update'),
  ('ventas_sin_compras', 'ssepi_folio_evento', 'read'),
  ('compras', 'ssepi_folio_operativo', 'read'),
  ('compras', 'ssepi_folio_operativo', 'update'),
  ('compras', 'ssepi_folio_evento', 'read'),
  ('taller', 'ssepi_folio_operativo', 'read'),
  ('taller', 'ssepi_folio_evento', 'read'),
  ('motores', 'ssepi_folio_operativo', 'read'),
  ('motores', 'ssepi_folio_evento', 'read'),
  ('automatizacion', 'ssepi_folio_operativo', 'read'),
  ('automatizacion', 'ssepi_folio_evento', 'read'),
  ('facturacion', 'ssepi_folio_operativo', 'read'),
  ('facturacion', 'ssepi_folio_evento', 'read'),
  ('contabilidad', 'ssepi_folio_operativo', 'read'),
  ('contabilidad', 'ssepi_folio_evento', 'read'),
  ('inventario', 'ssepi_folio_operativo', 'read'),
  ('inventario', 'ssepi_folio_operativo', 'update'),
  ('inventario', 'ssepi_folio_evento', 'read')
ON CONFLICT (rol, module, action) DO NOTHING;
