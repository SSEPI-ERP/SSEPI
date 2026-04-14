-- ================================================
-- REFRESH POSTGREST SCHEMA CACHE
-- ================================================
-- PROPÓSITO: Forzar a PostgREST a recargar el schema cache
-- USO: Ejecutar en Supabase SQL Editor cuando haya errores de
--      "column does not exist" pero la columna sí existe en la DB
-- ================================================

-- Método 1: Notificación directa (funciona en Supabase)
SELECT pg_notify('pgrst', 'reload schema');

-- Método 2: Si el método 1 no funciona, reiniciar el servidor externo
-- Esto requiere acceso admin y puede causar breves interrupciones
-- SELECT pgrst.restart();

-- Verificación: comprobar que las columnas existen
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion')
  AND column_name = 'notas_generales'
ORDER BY table_name;
