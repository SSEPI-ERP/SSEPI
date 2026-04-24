-- ============================================
-- VERIFICAR FUNCIONES Y TABLAS CRÍTICAS
-- Nuevo Supabase: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. FUNCIONES RPC DISPONIBLES
SELECT 'FUNCIONES EXISTENTES:' as seccion;
SELECT routine_name as funcion FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 2. FUNCIONES FALTANTES (las que necesitamos)
SELECT 'FUNCIONES REQUERIDAS:' as seccion;
SELECT 'registrar_movimiento_inventario' as funcion_necesaria
UNION ALL SELECT 'reservar_material'
UNION ALL SELECT 'recibir_compra';

-- 3. VERIFICAR ESTRUCTURA DE TABLAS CLAVE
SELECT 'CONTACTOS - UNIQUE CONSTRAINTS:' as seccion;
SELECT conname as constraint_name, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'contactos'::regclass AND contype = 'u';

-- 4. VERIFICAR SI HAY ÍNDICES ÚNICOS EN CONTACTOS
SELECT 'CONTACTOS - ÍNDICES:' as seccion;
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'contactos' AND schemaname = 'public'
ORDER BY indexname;

-- 5. TABLAS CON MÁS REGISTROS
SELECT 'TABLAS - CONTADOR:' as seccion;
SELECT 'contactos' as tabla, COUNT(*) as registros FROM contactos
UNION ALL SELECT 'clientes_tabulador', COUNT(*) FROM clientes_tabulador
UNION ALL SELECT 'compras', COUNT(*) FROM compras
UNION ALL SELECT 'compras_items', COUNT(*) FROM compras_items
UNION ALL SELECT 'ordenes_taller', COUNT(*) FROM ordenes_taller
UNION ALL SELECT 'ordenes_motores', COUNT(*) FROM ordenes_motores
UNION ALL SELECT 'cotizaciones', COUNT(*) FROM cotizaciones;
