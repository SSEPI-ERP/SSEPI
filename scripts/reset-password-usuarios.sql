-- ============================================
-- RESET DE CONTRASEÑAS - USUARIOS DE PRUEBA
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor
-- Esto actualiza las contraseñas en auth.users
-- ============================================

-- CONTRASEÑA TEMPORAL PARA TODOS: SSEPI2024!
-- Los usuarios deben cambiarla después del primer login

-- ============================================
-- MÉTODO DIRECTO - Actualiza encrypted_password
-- ============================================
UPDATE auth.users
SET encrypted_password = crypt('SSEPI2024!', gen_salt('bf')),
    updated_at = NOW()
WHERE id IN (
    SELECT auth_user_id FROM public.users
    WHERE email IN (
        'norbertomoro4@gmail.com',
        'electronica@ssepi.org',
        'ventas@ssepi.org',
        'automatizacion@ssepi.org',
        'administracion@ssepi.org',
        'ventas1@ssepi.org',
        'ivang.ssepi@gmail.com',
        'electronica.ssepi@gmail.com'
    )
);

-- ============================================
-- VERIFICAR USUARIOS ACTUALIZADOS
-- ============================================
SELECT
    u.email,
    u.nombre,
    u.rol,
    au.created_at as auth_created,
    au.last_sign_in_at,
    au.updated_at as password_updated
FROM public.users u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
ORDER BY u.rol, u.email;

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================
-- 1. Ejecuta este SQL en Supabase Dashboard -> SQL Editor
-- 2. Ve a https://ssepi-erp.vercel.app/panel/pdfs-politicas.html
-- 3. Ingresa con tu email y contraseña: SSEPI2024!
-- 4. Una vez dentro, las políticas se cargan desde politicas_modulos
-- 5. Puedes editarlas y guardar cambios
