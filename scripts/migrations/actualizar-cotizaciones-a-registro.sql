-- =============================================================================
-- MIGRACIÓN: Actualizar cotizaciones antiguas a estado 'registro'
-- DESCRIPCIÓN: Corrige cotizaciones con estado 'pendiente_autorizacion_ventas'
--              para que aparezcan en la columna 📝 Registro del kanban
-- EJECUCIÓN: Supabase SQL Editor
-- =============================================================================

-- Actualizar cotizaciones con estado 'pendiente_autorizacion_ventas' a 'registro'
UPDATE public.cotizaciones
SET
    estado = 'registro',
    updated_at = NOW()
WHERE
    estado = 'pendiente_autorizacion_ventas'
    AND tipo = 'cotizacion';

-- Reporte de cambios
SELECT
    'Cotizaciones actualizadas a estado registro' as accion,
    COUNT(*) as cantidad
FROM public.cotizaciones
WHERE estado = 'registro' AND tipo = 'cotizacion';

-- Verificar estados restantes
SELECT
    estado,
    COUNT(*) as cantidad
FROM public.cotizaciones
WHERE tipo = 'cotizacion'
GROUP BY estado
ORDER BY cantidad DESC;
