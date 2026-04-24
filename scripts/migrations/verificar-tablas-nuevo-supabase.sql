-- ============================================
-- VERIFICAR TABLAS EN NUEVO SUPABASE
-- Ejecutar en: https://knzmdwjmrhcoytmebdwa.supabase.co
-- ============================================

-- 1. LISTAR TODAS LAS TABLAS
SELECT 'TABLAS EXISTENTES:' as seccion;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. CONTAR REGISTROS POR TABLA
SELECT 'CONTACTOS' as tabla, COUNT(*) as registros FROM contactos
UNION ALL SELECT 'CLIENTES_TABULADOR', COUNT(*) FROM clientes_tabulador
UNION ALL SELECT 'PARAMETROS_COSTOS', COUNT(*) FROM parametros_costos
UNION ALL SELECT 'GASTOS_FIJOS', COUNT(*) FROM gastos_fijos
UNION ALL SELECT 'COMPRAS', COUNT(*) FROM compras
UNION ALL SELECT 'COMPRAS_ITEMS', COUNT(*) FROM compras_items
UNION ALL SELECT 'ORDENES_TALLER', COUNT(*) FROM ordenes_taller
UNION ALL SELECT 'ORDENES_MOTORES', COUNT(*) FROM ordenes_motores
UNION ALL SELECT 'PROYECTOS_AUTOMATIZACION', COUNT(*) FROM proyectos_automatizacion
UNION ALL SELECT 'COTIZACIONES', COUNT(*) FROM cotizaciones
UNION ALL SELECT 'INVENTARIO', COUNT(*) FROM inventario
UNION ALL SELECT 'USUARIOS', COUNT(*) FROM usuarios;

-- 3. VER COLUMNAS DE CONTACTOS
SELECT 'COLUMNAS CONTACTOS:' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'contactos' ORDER BY ordinal_position;

-- 4. VER COLUMNAS DE CLIENTES_TABULADOR
SELECT 'COLUMNAS CLIENTES_TABULADOR:' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'clientes_tabulador' ORDER BY ordinal_position;

-- 5. VER COLUMNAS DE COMPRAS_ITEMS
SELECT 'COLUMNAS COMPRAS_ITEMS:' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'compras_items' ORDER BY ordinal_position;

-- 6. FUNCIONES RPC DISPONIBLES
SELECT 'FUNCIONES RPC:' as seccion;
SELECT routine_name as funcion FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 7. VISTAS DISPONIBLES
SELECT 'VISTAS:' as seccion;
SELECT table_name as vista FROM information_schema.views
WHERE table_schema = 'public' ORDER BY table_name;

-- 8. CONTACTOS POR TIPO (VERIFICAR DUPLICADOS)
SELECT 'CONTACTOS POR TIPO:' as seccion;
SELECT tipo, COUNT(*) as cantidad FROM contactos GROUP BY tipo ORDER BY tipo;
