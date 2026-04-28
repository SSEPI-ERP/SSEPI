-- =====================================================
-- DIAGNÓSTICO RÁPIDO: Verificar estado de tablas críticas
-- Ejecutar en SQL Editor de Supabase
-- =====================================================

-- 1. Verificar si foliador_control existe y tiene datos
SELECT 'foliador_control' as tabla, COUNT(*) as registros FROM public.foliador_control;

-- 2. Verificar columnas de parametros_costos
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'parametros_costos' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Verificar columnas de ordenes_taller
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ordenes_taller' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Verificar datos en parametros_costos
SELECT clave, valor, departamento, activo FROM public.parametros_costos LIMIT 10;

-- 5. Verificar si hay órdenes de taller con folio duplicado potencial
SELECT folio, COUNT(*) as veces FROM public.ordenes_taller GROUP BY folio HAVING COUNT(*) > 1;
