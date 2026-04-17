-- =============================================================================
-- MIGRACIÓN: Actualizar tabla clientes_tabulador con campos calculados
-- DESCRIPCIÓN: Agrega columnas calculadas para viáticos automáticos
-- EJECUCIÓN: Supabase SQL Editor
-- =============================================================================

-- Agregar columnas si no existen
ALTER TABLE public.clientes_tabulador
ADD COLUMN IF NOT EXISTS litros NUMERIC(8,2) GENERATED ALWAYS AS (
    CASE WHEN km > 0 THEN km / 9.5 ELSE 0 END
) STORED;

ALTER TABLE public.clientes_tabulador
ADD COLUMN IF NOT EXISTS costo_gasolina NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN km > 0 THEN (km / 9.5) * 24.50 ELSE 0 END
) STORED;

ALTER TABLE public.clientes_tabulador
ADD COLUMN IF NOT EXISTS costo_tecnico NUMERIC(10,2) GENERATED ALWAYS AS (
    COALESCE(horas_viaje, 0) * 104.16
) STORED;

ALTER TABLE public.clientes_tabulador
ADD COLUMN IF NOT EXISTS total_viatico NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN km > 0 THEN (km / 9.5) * 24.50 ELSE 0 END + COALESCE(horas_viaje, 0) * 104.16
) STORED;

-- Comentario
COMMENT ON COLUMN public.clientes_tabulador.litros IS 'Litros estimados (km / 9.5 rendimiento)';
COMMENT ON COLUMN public.clientes_tabulador.costo_gasolina IS 'Costo gasolina ($24.50/L)';
COMMENT ON COLUMN public.clientes_tabulador.costo_tecnico IS 'Costo técnico ($104.16/hr × horas_viaje)';
COMMENT ON COLUMN public.clientes_tabulador.total_viatico IS 'Total viático (gasolina + técnico)';
