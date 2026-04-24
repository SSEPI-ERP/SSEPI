-- ============================================
-- VERIFICAR ESTRUCTURA DEL NUEVO SUPABASE
-- Ejecutar en: https://knzmdwjmrhcoytmebdwa.supabase.co
-- ============================================

-- 1. LISTAR TODAS LAS TABLAS
SELECT
    schemaname as esquema,
    tablename as tabla,
    CASE
        WHEN schemaname = 'public' THEN '✓'
        ELSE ''
    END as activa
FROM pg_tables
WHERE schemaname IN ('public', 'auth', 'storage')
ORDER BY esquena, tablename;

-- 2. CONTACTOS - ESTRUCTURA Y DATOS
SELECT 'CONTACTOS' as seccion;
SELECT COUNT(*) as total_contactos FROM contactos;
SELECT tipo, COUNT(*) as cantidad FROM contactos GROUP BY tipo ORDER BY tipo;

-- Ver columnas de contactos
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contactos'
ORDER BY ordinal_position;

-- 3. CLIENTES TABULADOR
SELECT 'CLIENTES_TABULADOR' as seccion;
SELECT COUNT(*) as total FROM clientes_tabulador;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clientes_tabulador';

-- 4. ORDENES TALLER (LABORATORIO)
SELECT 'ORDENES_TALLER' as seccion;
SELECT COUNT(*) as total_ordenes FROM ordenes_taller;
SELECT estado, COUNT(*) as cantidad FROM ordenes_taller GROUP BY estado ORDER BY estado;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ordenes_taller';

-- 5. ORDENES MOTORES
SELECT 'ORDENES_MOTORES' as seccion;
SELECT COUNT(*) as total FROM ordenes_motores;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ordenes_motores';

-- 6. PROYECTOS AUTOMATIZACION
SELECT 'PROYECTOS_AUTOMATIZACION' as seccion;
SELECT COUNT(*) as total FROM proyectos_automatizacion;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion';

-- 7. COMPRAS
SELECT 'COMPRAS' as seccion;
SELECT COUNT(*) as total FROM compras;
SELECT estado, COUNT(*) as cantidad FROM compras GROUP BY estado ORDER BY estado;

-- 8. COMPRAS ITEMS (NORMALIZADO)
SELECT 'COMPRAS_ITEMS' as seccion;
SELECT COUNT(*) as total FROM compras_items;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'compras_items';

-- 9. VENTAS / COTIZACIONES
SELECT 'COTIZACIONES' as seccion;
SELECT COUNT(*) as total FROM cotizaciones;
SELECT tipo, estado, COUNT(*) as cantidad
FROM cotizaciones
GROUP BY tipo, estado
ORDER BY tipo, estado;

-- 10. INVENTARIO
SELECT 'INVENTARIO' as seccion;
SELECT COUNT(*) as total FROM inventario;
SELECT tipo, COUNT(*) as cantidad FROM inventario GROUP BY tipo ORDER BY tipo;

-- 11. FUNCIONES DISPONIBLES
SELECT 'FUNCIONES RPC' as seccion;
SELECT routine_name as funcion
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 12. VISTAS
SELECT 'VISTAS' as seccion;
SELECT table_name as vista
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 13. ROLES Y PERMISOS
SELECT 'ROLES' as seccion;
SELECT rol, COUNT(*) as usuarios FROM usuarios GROUP BY rol;

SELECT 'ROLE_PERMISSIONS' as seccion;
SELECT rol, modulo, permiso, COUNT(*) as registros
FROM role_permissions
GROUP BY rol, modulo, permiso
ORDER BY rol, modulo;
