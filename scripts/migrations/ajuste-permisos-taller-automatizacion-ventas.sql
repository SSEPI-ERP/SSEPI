-- Ajuste de permisos por rol:
-- - Taller: solo Laboratorio (ordenes_taller) e Inventario.
-- - Automatización: sin Compras (Ivan y cualquier usuario automatizacion).
-- - Nuevo rol ventas_sin_compras para electronica.ssepi@gmail.com (ventas pero sin Compras).
-- Ejecutar en Supabase SQL Editor.

-- 1) Taller: quitar permisos de Compras y Motores (solo ver Laboratorio e Inventario)
DELETE FROM public.role_permissions
WHERE rol = 'taller' AND module IN ('compras', 'ordenes_motores');

-- 2) Automatización: quitar permiso de Compras
DELETE FROM public.role_permissions
WHERE rol = 'automatizacion' AND module = 'compras';

-- 3) Rol ventas_sin_compras: mismo que ventas pero sin compras (insertar solo si no existe cada fila)
WITH new_rows (rol, module, action) AS (
  VALUES
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
)
INSERT INTO public.role_permissions (rol, module, action)
SELECT nr.rol, nr.module, nr.action
FROM new_rows nr
LEFT JOIN public.role_permissions rp
  ON rp.rol = nr.rol AND rp.module = nr.module AND rp.action = nr.action
WHERE rp.rol IS NULL;

-- 4) Permitir rol ventas_sin_compras en public.users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_rol_check;
ALTER TABLE public.users ADD CONSTRAINT users_rol_check CHECK (
  rol = ANY (ARRAY[
    'admin'::text, 'ventas'::text, 'ventas_sin_compras'::text,
    'taller'::text, 'motores'::text, 'compras'::text,
    'facturacion'::text, 'contabilidad'::text, 'automatizacion'::text
  ])
);

-- 5) Asignar electronica.ssepi@gmail.com al rol ventas_sin_compras
UPDATE public.users SET rol = 'ventas_sin_compras' WHERE email = 'electronica.ssepi@gmail.com';
