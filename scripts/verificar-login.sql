-- ============================================
-- VERIFICAR USUARIO PARA LOGIN
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. Verificar si el usuario existe en auth.users
SELECT
    id,
    email,
    created_at,
    last_sign_in_at,
    updated_at
FROM auth.users
WHERE email = 'norbertomoro4@gmail.com';

-- 2. Verificar si existe en public.users
SELECT
    id,
    auth_user_id,
    email,
    nombre,
    rol,
    activo
FROM public.users
WHERE email = 'norbertomoro4@gmail.com';

-- 3. Verificar que auth_user_id coincide
SELECT
    au.id as auth_id,
    au.email as auth_email,
    u.id as public_id,
    u.auth_user_id,
    u.email as public_email,
    CASE
        WHEN au.id = u.auth_user_id THEN '✅ COINCIDE'
        ELSE '❌ NO COINCIDE'
    END as estado
FROM auth.users au
JOIN public.users u ON au.email = u.email
WHERE au.email = 'norbertomoro4@gmail.com';

-- 4. Contar usuarios en auth.users
SELECT COUNT(*) as total_users FROM auth.users;

-- 5. Verificar si hay múltiples usuarios con el mismo email
SELECT email, COUNT(*) as count
FROM auth.users
GROUP BY email
HAVING COUNT(*) > 1;
