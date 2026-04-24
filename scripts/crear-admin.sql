-- ============================================
-- CREAR USUARIO ADMIN - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. CREAR USUARIO EN AUTH.USERS
-- Ejecuta esto en el Dashboard de Supabase -> SQL Editor
-- O usa la API directamente

-- Opción A: Desde SQL Editor (requiere extensión auth)
SELECT auth.uid(); -- Verifica si tienes acceso

-- Para crear usuario, usa la función de Supabase:
-- Esto se hace mejor desde la UI de Supabase o vía API

-- Opción B: Insertar directamente (si tienes permisos de servicio)
-- DO $$
-- BEGIN
--     INSERT INTO auth.users (email, encrypted_password, raw_app_meta_data, raw_user_meta_data, aud, confirmed_at)
--     VALUES (
--         'admin@ssepi.org',
--         crypt('TuContraseñaSegura123', gen_salt('bf')),
--         '{"provider":"email","providers":["email"]}',
--         '{"role":"admin","departamento":"administracion"}',
--         'authenticated',
--         NOW()
--     );
-- END $$;

-- ============================================
-- MEJOR OPCIÓN: Crear usuario desde UI de Supabase
-- ============================================
-- 1. Ve a https://knzmdwjmrhcoytmebdwa.supabase.co
-- 2. Authentication -> Users
-- 3. Click en "Add user"
-- 4. Ingresa email: admin@ssepi.org
-- 5. Ingresa contraseña: (la que quieras)
-- 6. Desmarca "Confirm email" para que pueda entrar inmediatamente
-- 7. Click en "Create user"

-- ============================================
-- USUARIO DE PRUEBA PARA POLITICAS
-- ============================================
-- Email: admin@ssepi.org
-- Contraseña: SSEPI2024admin!

-- Una vez creado el usuario, ya puedes entrar a:
-- https://ssepi-erp.vercel.app/panel/pdfs-politicas.html
