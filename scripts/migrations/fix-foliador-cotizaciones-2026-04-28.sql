-- =====================================================
-- FIX: Sincronizar foliador_control con BD real + schema cotizaciones
-- Fecha: 2026-04-28
-- =====================================================

-- 1. Sincronizar foliador_control con folios existentes en ordenes_taller
DO $$
DECLARE
    max_sp_e INTEGER;
    max_sp_m INTEGER;
    max_sp_a INTEGER;
    max_sp_p INTEGER;
    max_sp_s INTEGER;
    max_cot INTEGER;
BEGIN
    -- Extraer máximo número de folios SP-E
    SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(folio, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
    INTO max_sp_e FROM public.ordenes_taller WHERE folio LIKE 'SP-E%';

    -- Extraer máximo número de folios SP-M
    SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(folio, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
    INTO max_sp_m FROM public.ordenes_motores WHERE folio LIKE 'SP-M%';

    -- Extraer máximo número de folios SP-A
    SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(folio, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
    INTO max_sp_a FROM public.proyectos_automatizacion WHERE folio LIKE 'SP-A%';

    -- Extraer máximo número de folios COT
    SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(folio, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
    INTO max_cot FROM public.cotizaciones WHERE folio LIKE 'COT-%';

    -- Actualizar foliador
    INSERT INTO public.foliador_control (tipo, ultimo_folio, ultimo_folio_entero) VALUES
        ('SP-E', GREATEST(max_sp_e, 0), GREATEST(max_sp_e, 0)),
        ('SP-M', GREATEST(max_sp_m, 0), GREATEST(max_sp_m, 0)),
        ('SP-A', GREATEST(max_sp_a, 0), GREATEST(max_sp_a, 0)),
        ('SP-P', 0, 0),
        ('SP-S', 0, 0),
        ('COT', GREATEST(max_cot, 0), GREATEST(max_cot, 0))
    ON CONFLICT (tipo) DO UPDATE SET
        ultimo_folio = GREATEST(EXCLUDED.ultimo_folio, public.foliador_control.ultimo_folio),
        ultimo_folio_entero = GREATEST(EXCLUDED.ultimo_folio_entero, public.foliador_control.ultimo_folio_entero),
        updated_at = NOW();
END $$;

-- 2. Verificar/agregar columna 'cliente' (texto) a cotizaciones si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'cliente') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN cliente TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'cerebro_registro') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN cerebro_registro JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'tipo') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN tipo TEXT DEFAULT 'cotizacion';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'origen') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN origen TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'orden_origen_id') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN orden_origen_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'vendedor') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN vendedor TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'departamento') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN departamento TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'items') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'fecha_creacion') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN fecha_creacion TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'actividades') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN actividades JSONB;
    END IF;
END $$;

-- 3. Verificar/agregar columna 'notas_generales' a ordenes_motores
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'notas_generales') THEN
        ALTER TABLE public.ordenes_motores ADD COLUMN notas_generales TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'cliente_nombre') THEN
        ALTER TABLE public.ordenes_motores ADD COLUMN cliente_nombre TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'falla_reportada') THEN
        ALTER TABLE public.ordenes_motores ADD COLUMN falla_reportada TEXT;
    END IF;
END $$;

-- 4. Actualizar cotizaciones existentes para que tengan departamento
UPDATE public.cotizaciones SET departamento = COALESCE(departamento, 'Ventas') WHERE departamento IS NULL;

-- 5. Recargar schema
NOTIFY pgrst, 'reload schema';
