-- =============================================================================
-- Agregar rol 'administracion' como 5to rol básico del ERP.
-- Ejecutar UNA VEZ en Supabase SQL Editor.
-- =============================================================================

-- 1) Agregar 'administracion' al CHECK de roles permitidos en public.users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_rol_check;
ALTER TABLE public.users ADD CONSTRAINT users_rol_check CHECK (
  rol = ANY (ARRAY[
    'admin'::text, 'superadmin'::text,
    'ventas'::text, 'ventas_sin_compras'::text,
    'administracion'::text,
    'taller'::text, 'motores'::text, 'automatizacion'::text,
    'compras'::text, 'facturacion'::text, 'contabilidad'::text
  ])
);

-- 2) Permisos read para administracion (solo sus módulos operativos, sin análisis)
--    Módulos: compras, facturas, contabilidad, pagos_nomina, inventario, contactos, vacaciones
WITH new_rows (rol, module, action) AS (
  VALUES
    ('administracion', 'compras',       'read'),
    ('administracion', 'compras',       'create'),
    ('administracion', 'compras',       'update'),
    ('administracion', 'facturas',      'read'),
    ('administracion', 'facturas',      'create'),
    ('administracion', 'facturas',      'update'),
    ('administracion', 'contabilidad',  'read'),
    ('administracion', 'contabilidad',  'create'),
    ('administracion', 'contabilidad',  'update'),
    ('administracion', 'pagos_nomina',  'read'),
    ('administracion', 'pagos_nomina',  'create'),
    ('administracion', 'pagos_nomina',  'update'),
    ('administracion', 'inventario',    'read'),
    ('administracion', 'contactos',     'read'),
    ('administracion', 'contactos',     'create'),
    ('administracion', 'contactos',     'update'),
    ('administracion', 'vacaciones',    'read'),
    ('administracion', 'vacaciones',    'create')
)
INSERT INTO public.role_permissions (rol, module, action)
SELECT nr.rol, nr.module, nr.action
FROM new_rows nr
LEFT JOIN public.role_permissions rp
  ON rp.rol = nr.rol AND rp.module = nr.module AND rp.action = nr.action
WHERE rp.rol IS NULL;

-- 3) Quitar analisis_ventas de ventas y ventas_sin_compras (roles básicos no ven análisis)
DELETE FROM public.role_permissions
WHERE rol IN ('ventas', 'ventas_sin_compras') AND module = 'analisis_ventas';

-- 4) Quitar compras de ventas_sin_compras (variante SIN compras)
DELETE FROM public.role_permissions
WHERE rol = 'ventas_sin_compras' AND module = 'compras';

-- 5) Quitar compras de ventas (rol básico: no ve módulos ajenos)
DELETE FROM public.role_permissions
WHERE rol = 'ventas' AND module = 'compras';

-- 6) Quitar módulos ajenos a motores (compras pertenece a administracion; ordenes_taller pertenece a taller)
DELETE FROM public.role_permissions
WHERE rol = 'motores' AND module IN ('compras', 'ordenes_taller');

-- 7) Asegurar que ventas tenga permisos de sus módulos propios
WITH new_rows (rol, module, action) AS (
  VALUES
    ('ventas', 'ventas',       'read'),
    ('ventas', 'ventas',       'create'),
    ('ventas', 'ventas',       'update'),
    ('ventas', 'ventas',       'generate_pdf'),
    ('ventas', 'inventario',   'read'),
    ('ventas', 'contactos',    'read'),
    ('ventas', 'contactos',    'create'),
    ('ventas', 'contactos',    'update'),
    ('ventas', 'vacaciones',   'read'),
    ('ventas', 'vacaciones',   'create'),
    ('ventas', 'cotizaciones', 'read'),
    ('ventas', 'cotizaciones', 'create'),
    ('ventas', 'cotizaciones', 'update'),
    ('ventas', 'clientes',     'read'),
    ('ventas', 'ordenes_taller',          'create'),
    ('ventas', 'ordenes_motores',         'create'),
    ('ventas', 'proyectos_automatizacion','create')
)
INSERT INTO public.role_permissions (rol, module, action)
SELECT nr.rol, nr.module, nr.action
FROM new_rows nr
LEFT JOIN public.role_permissions rp
  ON rp.rol = nr.rol AND rp.module = nr.module AND rp.action = nr.action
WHERE rp.rol IS NULL;