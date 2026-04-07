-- =============================================================================
-- Perfiles con módulos ya activados (solo lo que pueden usar).
-- Ejecutar UNA VEZ en Supabase SQL Editor.
-- Usuarios: electronica.ssepi@gmail.com, ivang.ssepi@gmail.com, ventas1@ssepi.org
-- =============================================================================

-- 1) La app debe poder leer permisos
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO service_role;

-- 2) Rol permitido en users (si no existe la constraint)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_rol_check;
ALTER TABLE public.users ADD CONSTRAINT users_rol_check CHECK (
  rol = ANY (ARRAY[
    'admin'::text, 'ventas'::text, 'ventas_sin_compras'::text,
    'taller'::text, 'motores'::text, 'compras'::text,
    'facturacion'::text, 'contabilidad'::text, 'automatizacion'::text
  ])
);

-- 3) VENTAS (ventas1@ssepi.org): solo Ventas, Inventario, Contactos (+ clientes/cotizaciones para flujo)
--    Quitar lo que no debe ver
DELETE FROM public.role_permissions
WHERE rol = 'ventas' AND module IN ('compras', 'ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion');
--    Asegurar que tenga lo que sí debe ver
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('ventas', 'ventas', 'create'),
  ('ventas', 'ventas', 'read'),
  ('ventas', 'ventas', 'update'),
  ('ventas', 'ventas', 'generate_pdf'),
  ('ventas', 'clientes', 'read'),
  ('ventas', 'cotizaciones', 'create'),
  ('ventas', 'cotizaciones', 'read'),
  ('ventas', 'cotizaciones', 'update'),
  ('ventas', 'contactos', 'read'),
  ('ventas', 'inventario', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 4) VENTAS_SIN_COMPRAS (electronica.ssepi@gmail.com): Ventas, Inventario, Contactos; sin Compras
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('ventas_sin_compras', 'ventas', 'create'),
  ('ventas_sin_compras', 'ventas', 'read'),
  ('ventas_sin_compras', 'ventas', 'update'),
  ('ventas_sin_compras', 'ventas', 'generate_pdf'),
  ('ventas_sin_compras', 'clientes', 'read'),
  ('ventas_sin_compras', 'ordenes_taller', 'read'),
  ('ventas_sin_compras', 'ordenes_motores', 'read'),
  ('ventas_sin_compras', 'cotizaciones', 'create'),
  ('ventas_sin_compras', 'cotizaciones', 'read'),
  ('ventas_sin_compras', 'cotizaciones', 'update'),
  ('ventas_sin_compras', 'contactos', 'read'),
  ('ventas_sin_compras', 'inventario', 'read'),
  ('ventas_sin_compras', 'proyectos_automatizacion', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 5) AUTOMATIZACIÓN (ivang.ssepi@gmail.com): Automatización, Soporte en planta, Inventario
DELETE FROM public.role_permissions WHERE rol = 'automatizacion' AND module NOT IN ('proyectos_automatizacion', 'inventario');
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('automatizacion', 'proyectos_automatizacion', 'read'),
  ('automatizacion', 'proyectos_automatizacion', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'update'),
  ('automatizacion', 'inventario', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 6) TALLER: solo Laboratorio (ordenes_taller) e Inventario
DELETE FROM public.role_permissions WHERE rol = 'taller' AND module NOT IN ('ordenes_taller', 'inventario');
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('taller', 'ordenes_taller', 'read'),
  ('taller', 'ordenes_taller', 'create'),
  ('taller', 'ordenes_taller', 'update'),
  ('taller', 'inventario', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 7) Asignar rol a los tres perfiles (por email)
UPDATE public.users SET rol = 'ventas_sin_compras' WHERE email = 'electronica.ssepi@gmail.com';
UPDATE public.users SET rol = 'automatizacion'     WHERE email = 'ivang.ssepi@gmail.com';
UPDATE public.users SET rol = 'ventas'             WHERE email = 'ventas1@ssepi.org';

-- Listo. Tras ejecutar:
-- • electronica.ssepi@gmail.com  → ventas_sin_compras (Ventas, Inventario, Contactos; sin Compras)
-- • ivang.ssepi@gmail.com        → automatizacion     (Automatización, Soporte en planta, Inventario)
-- • ventas1@ssepi.org            → ventas            (Ventas, Inventario, Contactos)
