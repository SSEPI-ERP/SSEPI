-- =============================================================================
-- Alineación de roles en public.usuarios (y public.users si existe la fila)
-- según modelo operativo SSEPI (abril 2026).
--
-- Revisa en SQL Editor antes de ejecutar: SELECT email, rol FROM public.usuarios;
-- Idempotente en el sentido de que fuerza el rol deseado por email.
-- =============================================================================

-- Admin pleno (todos los módulos en nav; RLS sigue limitando donde aplique)
UPDATE public.usuarios SET rol = 'admin', actualizado_en = now()
WHERE lower(trim(email)) IN (
  'norbertomoro4@gmail.com',
  'automatizacion@ssepi.org',
  'ventas@ssepi.org',
  'electronica@ssepi.org'
);

-- Administrativo: nav tipo administracion (sin taller/motores/automatización/proyectos en ROLE_MODULES)
UPDATE public.usuarios SET rol = 'administracion', actualizado_en = now()
WHERE lower(trim(email)) = 'administracion@ssepi.org';

-- Técnicos / operativos
UPDATE public.usuarios SET rol = 'ventas_sin_compras', actualizado_en = now()
WHERE lower(trim(email)) = 'electronica.ssepi@gmail.com';

UPDATE public.usuarios SET rol = 'automatizacion', actualizado_en = now()
WHERE lower(trim(email)) = 'ivang.ssepi@gmail.com';

UPDATE public.usuarios SET rol = 'ventas', actualizado_en = now()
WHERE lower(trim(email)) = 'ventas1@ssepi.org';

-- Si también mantienen public.users, sincroniza el mismo rol por auth_user_id:
-- UPDATE public.users u SET rol = nu.rol FROM public.usuarios nu WHERE u.auth_user_id = nu.auth_user_id;
