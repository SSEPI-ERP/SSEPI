-- ============================================================================
-- FIX: Agregar columna 'notas' a compras si no existe
-- Error: PGRST204 - Could not find the 'notas' column of 'compras'
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'compras'
        AND column_name = 'notas'
    ) THEN
        ALTER TABLE public.compras ADD COLUMN notas TEXT;
        RAISE NOTICE 'Columna notas agregada a compras';
    ELSE
        RAISE NOTICE 'Columna notas ya existe en compras';
    END IF;
END $$;

-- Forzar refresco del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'notas';
