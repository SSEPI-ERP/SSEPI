-- ============================================
-- VERIFICAR TODAS LAS TABLAS DEL ERP
-- ============================================

-- 1. TODAS LAS TABLAS
SELECT '=== TABLAS EXISTENTES ===' as seccion;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. TABLAS CRÍTICAS - VERIFICAR UNA POR UNA
SELECT '=== VERIFICACIÓN TABLAS CRÍTICAS ===' as seccion;
SELECT 'facturas' as tabla, CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'facturas') THEN 'EXISTS' ELSE 'MISSING' END as estado
UNION ALL SELECT 'ordenes_taller', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ordenes_taller') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'ordenes_motores', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ordenes_motores') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'proyectos_automatizacion', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'proyectos_automatizacion') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'cotizaciones', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cotizaciones') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'compras', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'compras') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'inventario', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inventario') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'contactos', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'contactos') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'movimientos_inventario', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'movimientos_inventario') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'reservas_material', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'reservas_material') THEN 'EXISTS' ELSE 'MISSING' END
UNION ALL SELECT 'ordenes_costos', CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ordenes_costos') THEN 'EXISTS' ELSE 'MISSING' END;

-- 3. COLUMNAS DE FACTURAS (si existe)
SELECT '=== COLUMNAS DE FACTURAS ===' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'facturas' ORDER BY ordinal_position;

-- 4. COLUMNAS DE ORDENES_TALLER
SELECT '=== COLUMNAS DE ORDENES_TALLER ===' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ordenes_taller' ORDER BY ordinal_position;

-- 5. COLUMNAS DE ORDENES_MOTORES
SELECT '=== COLUMNAS DE ORDENES_MOTORES ===' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ordenes_motores' ORDER BY ordinal_position;

-- 6. COLUMNAS DE PROYECTOS_AUTOMATIZACION
SELECT '=== COLUMNAS DE PROYECTOS_AUTOMATIZACION ===' as seccion;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'proyectos_automatizacion' ORDER BY ordinal_position;

-- 7. ESTADOS DE ÓRDENES (valores existentes)
SELECT '=== ESTADOS EN ORDENES_TALLER ===' as seccion;
SELECT estado, COUNT(*) as cantidad FROM ordenes_taller GROUP BY estado ORDER BY estado;

SELECT '=== ESTADOS EN ORDENES_MOTORES ===' as seccion;
SELECT estado, COUNT(*) as cantidad FROM ordenes_motores GROUP BY estado ORDER BY estado;

SELECT '=== ESTADOS EN PROYECTOS_AUTOMATIZACION ===' as seccion;
SELECT estado, COUNT(*) as cantidad FROM proyectos_automatizacion GROUP BY estado ORDER BY estado;

-- 8. CONTAR REGISTROS POR TABLA
SELECT '=== REGISTROS POR TABLA ===' as seccion;
SELECT 'contactos' as tabla, COUNT(*) as registros FROM contactos
UNION ALL SELECT 'clientes_tabulador', COUNT(*) FROM clientes_tabulador
UNION ALL SELECT 'compras', COUNT(*) FROM compras
UNION ALL SELECT 'compras_items', COUNT(*) FROM compras_items
UNION ALL SELECT 'ordenes_taller', COUNT(*) FROM ordenes_taller
UNION ALL SELECT 'ordenes_motores', COUNT(*) FROM ordenes_motores
UNION ALL SELECT 'proyectos_automatizacion', COUNT(*) FROM proyectos_automatizacion
UNION ALL SELECT 'cotizaciones', COUNT(*) FROM cotizaciones
UNION ALL SELECT 'facturas', COUNT(*) FROM facturas
UNION ALL SELECT 'inventario', COUNT(*) FROM inventario
UNION ALL SELECT 'movimientos_inventario', COUNT(*) FROM movimientos_inventario;
