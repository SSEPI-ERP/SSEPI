-- ============================================
-- VERIFICAR USUARIOS EN auth.users VS public.users
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. Ver usuarios en auth.users (autenticación)
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;

-- 2. Ver usuarios en public.users (perfil)
SELECT u.id, u.auth_user_id, u.email, u.nombre, u.rol,
       CASE WHEN au.id IS NULL THEN '❌ SIN AUTH' ELSE '✅ CON AUTH' END as estado
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
ORDER BY u.rol, u.email;

-- 3. Ver emails que existen en auth.users
SELECT email FROM auth.users ORDER BY email;

-- 4. Ver emails que existen en public.users
SELECT email FROM public.users ORDER BY email;

-- 5. Emails en auth.users pero NO en public.users
SELECT 'Solo en auth' as origen, email FROM auth.users
WHERE email NOT IN (SELECT email FROM public.users)
UNION ALL
SELECT 'Solo en public' as origen, email FROM public.users
WHERE email NOT IN (SELECT email FROM auth.users);

-- ============================================
-- SI LOS USUARIOS NO EXISTEN EN auth.users:
-- ============================================
-- Necesitas crearlos desde Supabase Dashboard:
-- 1. Ve a Authentication -> Users
-- 2. Click "Add user"
-- 3. Crea cada usuario manualmente
-- O usa este script para crear el principal:

/*
-- Crear usuario admin principal en auth.users
-- (Esto solo funciona con service_role key, no anon key)
-- Mejor créalo desde la UI de Supabase
*/
