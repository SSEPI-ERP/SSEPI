-- =============================================================================
-- MIGRACIÓN: Agregar columna 'activo' a gastos_fijos
-- DESCRIPCIÓN: Añade columna booleano para soft delete de gastos fijos
-- =============================================================================

-- Agregar columna activo si no existe
ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- Agregar columna actualizado_en si no existe
ALTER TABLE public.gastos_fijos
ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

-- Actualizar todos los registros existentes como activos
UPDATE public.gastos_fijos SET activo = true WHERE activo IS NULL;

-- Comentario
COMMENT ON COLUMN public.gastos_fijos.activo IS 'Indica si el gasto fijo está activo (true) o eliminado (false)';
