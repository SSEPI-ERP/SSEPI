-- Permisos por rol para que cada usuario vea solo sus módulos en el panel.
-- Ejecutar en Supabase SQL Editor después de ajuste-permisos-taller-automatizacion-ventas.sql
--
-- Taller: solo Inventario + Laboratorio (ordenes_taller).
-- Automatización: solo Inventario + Automatización + Soporte en planta (proyectos_automatizacion).
-- Ventas: solo Ventas + Inventario + Contactos.

-- 1) Permitir que la app lea role_permissions (RLS no aplica; sin esto authenticated puede no tener SELECT)
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO service_role;

-- 2) Automatización: asegurar permisos (por si no existen)
INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  ('automatizacion', 'proyectos_automatizacion', 'read'),
  ('automatizacion', 'proyectos_automatizacion', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'update'),
  ('automatizacion', 'inventario', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 3) Ventas: quitar módulos que no debe ver (solo Ventas, Inventario, Contactos)
DELETE FROM public.role_permissions
WHERE rol = 'ventas' AND module IN ('compras', 'ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion');

-- 4) Taller: ya sin compras y ordenes_motores por migración anterior; asegurar solo ordenes_taller e inventario
DELETE FROM public.role_permissions
WHERE rol = 'taller' AND module NOT IN ('ordenes_taller', 'inventario');

INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  ('taller', 'ordenes_taller', 'read'),
  ('taller', 'ordenes_taller', 'create'),
  ('taller', 'ordenes_taller', 'update'),
  ('taller', 'inventario', 'read')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);
