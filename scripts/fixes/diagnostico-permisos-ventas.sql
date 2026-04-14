-- =============================================================================
-- DIAGNÓSTICO: Permisos Ventas - Paso 1 (SP-E)
-- PROPÓSITO: Identificar por qué norbertomoro4@gmail.com recibe error de permisos
-- EJECUCIÓN: Copiar y pegar en Supabase SQL Editor
-- =============================================================================

-- 1. Verificar usuario y rol en la BD
SELECT u.auth_user_id, u.email, u.nombre, u.rol, u.departamento
FROM public.usuarios u
WHERE u.email = 'norbertomoro4@gmail.com';

-- 2. Verificar si existe la función ssepi_current_rol()
SELECT proname, prosrc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'ssepi_current_rol';

-- 3. Probar ssepi_current_rol() (debería devolver el rol del usuario autenticado)
-- NOTA: Esto solo funciona si hay una sesión autenticada
-- SELECT public.ssepi_current_rol() AS rol_actual;

-- 4. Verificar políticas RLS en ordenes_taller (INSERT y nombres relacionados ventas/admin)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'ordenes_taller'
  AND (policyname ILIKE '%ventas%' OR policyname ILIKE '%admin%' OR cmd = 'INSERT');

-- 5. Verificar políticas RLS en orden_historial
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'orden_historial';

-- 6. Verificar role_permissions para el rol del usuario
-- (Reemplazar 'admin' por el rol que devolvió la consulta 1)
SELECT rol, module, action
FROM public.role_permissions
WHERE rol IN ('admin', 'ventas', 'ventas_sin_compras')
  AND module IN ('ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion')
ORDER BY rol, module, action;

-- 7. Verificar triggers en ordenes_taller (el trigger AFTER INSERT puede fallar)
SELECT tgname, tgenabled, tgtype, tgargs
FROM pg_trigger
WHERE tgrelid = 'public.ordenes_taller'::regclass;

-- 8. Verificar si el trigger trg_taller_al_crear existe y su definición
SELECT proname, prosrc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'trg_taller_al_crear';

-- 9. Contar registros en orden_historial (si está vacío, el trigger no está funcionando)
SELECT COUNT(*) AS total_eventos FROM public.orden_historial;

-- 10. Últimos eventos en audit_logs (solo si existe public.audit_logs)
--    Esquemas distintos en distintos entornos. Lista columnas con:
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'audit_logs' ORDER BY ordinal_position;

-- Variante inglés típica (action, user_email, user_role, timestamp):
-- SELECT table_name, action, user_email, user_role, "timestamp", metadata
-- FROM public.audit_logs
-- WHERE table_name IN ('ordenes_taller', 'orden_historial')
-- ORDER BY "timestamp" DESC LIMIT 10;

-- Variante Supabase/prod actual: usuario, accion, created_at (sin user_email ni timestamp ni user_role a nivel columna)
SELECT
  table_name,
  accion AS action,
  usuario AS user_email,
  metadata ->> 'user_role' AS user_role,
  created_at AS "timestamp",
  metadata
FROM public.audit_logs
WHERE table_name IN ('ordenes_taller', 'orden_historial')
ORDER BY created_at DESC
LIMIT 10;

-- 10b. (Opcional) Ver forma de metadata para afinar metadata ->> '...'
-- SELECT metadata
-- FROM public.audit_logs
-- WHERE table_name IN ('ordenes_taller', 'orden_historial')
-- ORDER BY created_at DESC
-- LIMIT 1;
