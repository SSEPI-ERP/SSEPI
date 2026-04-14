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

-- 4. Verificar políticas RLS en ordenes_taller
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'ordenes_taller' AND policyname LIKE '%ventas%' OR policyname LIKE '%insert%';

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

-- 10. Verificar si hay errores recientes en audit_logs (si existe la tabla)
SELECT table_name, action, user_email, user_role, timestamp, metadata
FROM public.audit_logs
WHERE table_name IN ('ordenes_taller', 'orden_historial')
ORDER BY timestamp DESC
LIMIT 10;
