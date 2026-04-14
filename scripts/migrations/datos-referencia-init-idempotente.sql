-- =============================================================================
-- Datos de REFERENCIA del init.sql — idempotentes (sin duplicar filas).
--
-- Qué SÍ hace:
--   - role_permissions (semilla base del repo)
--   - system_config (clave encryption_key si no existe)
--   - clientes_tabulador (km / horas viaje para calculadora)
--   - gastos_fijos y parametros_costos (costos SSEPI)
--
-- Qué NO hace (no está en este archivo):
--   - CREATE TABLE / esquema → usa scripts/init.sql o migraciones en orden
--   - Contactos, inventario, órdenes, compras reales → Table Editor, CSV,
--     o pg_dump / scripts propios desde Excel
--
-- Ejecutar en Supabase SQL Editor cuando las tablas ya existen.
-- =============================================================================

-- ─── 1) Permisos por rol (único por rol+module+action) ─────────────────────
INSERT INTO public.role_permissions (rol, module, action) VALUES
  ('admin', '*', '*'),
  ('ventas', 'ventas', 'create'),
  ('ventas', 'ventas', 'read'),
  ('ventas', 'ventas', 'update'),
  ('ventas', 'ventas', 'generate_pdf'),
  ('ventas', 'clientes', 'read'),
  ('ventas', 'compras', 'read'),
  ('ventas', 'ordenes_taller', 'read'),
  ('ventas', 'ordenes_motores', 'read'),
  ('ventas', 'cotizaciones', 'create'),
  ('ventas', 'cotizaciones', 'read'),
  ('ventas', 'cotizaciones', 'update'),
  ('ventas', 'contactos', 'read'),
  ('ventas', 'inventario', 'read'),
  ('ventas', 'proyectos_automatizacion', 'read'),
  ('taller', 'ordenes_taller', 'create'),
  ('taller', 'ordenes_taller', 'read'),
  ('taller', 'ordenes_taller', 'update'),
  ('taller', 'inventario', 'read'),
  ('taller', 'compras', 'create'),
  ('taller', 'compras', 'read'),
  ('taller', 'ordenes_motores', 'read'),
  ('taller', 'cotizaciones', 'read'),
  ('motores', 'ordenes_motores', 'create'),
  ('motores', 'ordenes_motores', 'read'),
  ('motores', 'ordenes_motores', 'update'),
  ('motores', 'inventario', 'read'),
  ('motores', 'compras', 'create'),
  ('motores', 'compras', 'read'),
  ('motores', 'ordenes_taller', 'read'),
  ('motores', 'cotizaciones', 'read'),
  ('compras', 'compras', 'create'),
  ('compras', 'compras', 'read'),
  ('compras', 'compras', 'update'),
  ('compras', 'proveedores', 'read'),
  ('compras', 'inventario', 'read'),
  ('compras', 'cotizaciones', 'read'),
  ('compras', 'cotizaciones', 'update'),
  ('automatizacion', 'proyectos_automatizacion', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'read'),
  ('automatizacion', 'proyectos_automatizacion', 'update'),
  ('automatizacion', 'inventario', 'read'),
  ('automatizacion', 'compras', 'create'),
  ('automatizacion', 'compras', 'read'),
  ('automatizacion', 'soporte_visitas', 'create'),
  ('automatizacion', 'soporte_visitas', 'read'),
  ('automatizacion', 'soporte_visitas', 'update'),
  ('facturacion', 'facturas', 'create'),
  ('facturacion', 'facturas', 'read'),
  ('facturacion', 'ventas', 'read'),
  ('facturacion', 'compras', 'read'),
  ('contabilidad', '*', 'read')
ON CONFLICT (rol, module, action) DO NOTHING;

-- ─── 2) Clave de encriptación (solo si no existe la fila) ───────────────────
INSERT INTO public.system_config (key, value, description) VALUES
  ('encryption_key', 'ssepi-super-secret-key-2026', 'Clave para encriptación AES-256 de datos sensibles')
ON CONFLICT (key) DO NOTHING;

-- ─── 3) Tabulador clientes (logística ventas) ──────────────────────────────
INSERT INTO public.clientes_tabulador (nombre_cliente, km, horas_viaje) VALUES
  ('ANGUIPLAST', 234, 6),
  ('BOLSAS DE LOS ALTOS', 226, 5),
  ('ECOBOLSAS', 216, 5),
  ('BADER', 17.2, 2),
  ('BODYCOTE', 90.6, 3),
  ('COFICAB', 80, 3),
  ('CONDUMEX', 90.6, 3),
  ('ECSA', 32, 2),
  ('EMMSA', 21.6, 2),
  ('EPC 1', 400, 7),
  ('EPC 2', 402, 8),
  ('FRAENKISCHE', 79.4, 3),
  ('GEDNEY', 23.6, 3),
  ('GRUPO ACERERO', 386, 7),
  ('HALL ALUMINIUM', 73.8, 3),
  ('HIRUTA', 58.4, 3),
  ('IK PLASTIC', 61.4, 3),
  ('IMPRENTA JM', 16.2, 2),
  ('JARDIN LA ALEMANA', 12, 2),
  ('MAFLOW', 59.8, 3),
  ('MARQUARDT', 125.4, 4),
  ('MICROONDA', 41.6, 3),
  ('MR LUCKY', 157, 4),
  ('NHK SPRING MEXICO', 138.6, 4),
  ('NISHIKAWA', 61, 3),
  ('PIELES AZTECA', 5, 1),
  ('RONGTAI', 28.2, 3),
  ('SAFE DEMO', 61.6, 3),
  ('SERVIACERO ELECTROFORJADOS', 14.6, 2),
  ('SUACERO', 392, 8),
  ('TQ-1', 26, 2),
  ('MINO INDUSTRY', 29.2, 2),
  ('CURTIDOS BENGALA', 17.2, 2)
ON CONFLICT (nombre_cliente) DO NOTHING;

-- ─── 4) Gastos fijos (sin UNIQUE en nombre: no duplicar por nombre) ─────────
INSERT INTO public.gastos_fijos (nombre, monto)
SELECT v.nombre, v.monto
FROM (
  VALUES
    ('Renta', 24360::numeric),
    ('Sueldos Base', 20000::numeric),
    ('Luz', 1500::numeric),
    ('Agua', 500::numeric),
    ('Internet', 600::numeric),
    ('Camioneta', 8500::numeric)
) AS v(nombre, monto)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gastos_fijos g WHERE g.nombre = v.nombre
);

-- ─── 5) Parámetros de costos (clave única) ──────────────────────────────────
INSERT INTO public.parametros_costos (clave, valor, descripcion) VALUES
  ('gasolina', 24.50, 'Precio por litro'),
  ('rendimiento', 9.5, 'Kilómetros por litro'),
  ('costo_tecnico', 104.16, 'Costo por hora de técnico'),
  ('gastos_fijos_hora', 124.18, 'Gastos fijos por hora'),
  ('camioneta_hora', 39.35, 'Costo de operación de camioneta por hora'),
  ('utilidad', 40, 'Porcentaje de utilidad'),
  ('credito', 3, 'Porcentaje por costo de crédito'),
  ('iva', 16, 'Porcentaje de IVA')
ON CONFLICT (clave) DO NOTHING;
