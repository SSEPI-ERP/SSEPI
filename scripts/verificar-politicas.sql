-- ============================================
-- VERIFICAR TABLA POLITICAS_MODULOS
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. Verificar si la tabla existe
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_name = 'politicas_modulos';

-- 2. Verificar estructura de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'politicas_modulos'
ORDER BY ordinal_position;

-- 3. Verificar RLS
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'politicas_modulos';

-- 4. Verificar políticas RLS
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'politicas_modulos';

-- 5. Verificar datos existentes
SELECT id, modulo, titulo, tiempo_entrega, activo
FROM politicas_modulos
ORDER BY modulo;

-- 6. Verificar si auth.users tiene los usuarios
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE email IN (
    'norbertomoro4@gmail.com',
    'electronica@ssepi.org',
    'ventas@ssepi.org'
);
