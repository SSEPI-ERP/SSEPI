-- ================================================
-- VERIFICAR ESTADO DE orden_historial
-- ================================================
-- PROPÓSITO: Diagnosticar si la tabla orden_historial existe y tiene datos
-- USO: Ejecutar en Supabase SQL Editor

-- 1. Verificar si la tabla existe
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_name = 'orden_historial' OR table_name LIKE '%historial%';

-- 2. Verificar estructura de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orden_historial'
ORDER BY ordinal_position;

-- 3. Verificar triggers en cotizaciones
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname LIKE '%cotizacion%' OR tgname LIKE '%historial%';

-- 4. Contar registros en orden_historial (si existe)
-- SELECT 'orden_historial' as tabla, COUNT(*) FROM public.orden_historial
-- UNION ALL
-- SELECT 'cotizaciones', COUNT(*) FROM public.cotizaciones;

-- 5. Verificar si existen eventos recientes
-- SELECT evento, COUNT(*)
-- FROM public.orden_historial
-- GROUP BY evento
-- ORDER BY COUNT(*) DESC;
