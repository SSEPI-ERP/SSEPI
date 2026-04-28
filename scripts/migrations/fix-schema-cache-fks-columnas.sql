-- =====================================================
-- FIX URGENTE: Schema cache, FKs y columnas faltantes
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- 1) COMPRAS: agregar columnas que el JS inserta/ordena si no existen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'estatus_pago'
    ) THEN
        ALTER TABLE public.compras ADD COLUMN estatus_pago TEXT DEFAULT 'Pendiente';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.compras ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.compras ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2) ORDENES_TALLER: agregar created_at si no existe (el JS ordena por esta)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ordenes_taller' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3) ORDENES_MOTORES: agregar created_at si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ordenes_motores' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.ordenes_motores ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 4) COTIZACIONES: asegurar que cliente_id existe (JS lo usa para FK a contactos)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cotizaciones' AND column_name = 'cliente_id'
    ) THEN
        ALTER TABLE public.cotizaciones ADD COLUMN cliente_id UUID;
    END IF;
END $$;

-- 5) COTIZACIONES: corregir FK cliente_id para que apunte a contactos (no a clientes)
DO $$
DECLARE
    fk_name TEXT;
    ref_table TEXT;
BEGIN
    SELECT tc.constraint_name, ccu.table_name
    INTO fk_name, ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'cotizaciones'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'id'
      AND EXISTS (
          SELECT 1 FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_name = tc.constraint_name
            AND kcu.column_name = 'cliente_id'
      );

    IF FOUND AND ref_table = 'clientes' THEN
        EXECUTE format('ALTER TABLE public.cotizaciones DROP CONSTRAINT %I', fk_name);
        RAISE NOTICE 'FK % eliminada. Re-creando apuntando a contactos...', fk_name;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contactos') THEN
            ALTER TABLE public.cotizaciones
                ADD CONSTRAINT cotizaciones_cliente_id_fkey
                FOREIGN KEY (cliente_id) REFERENCES public.contactos(id) ON DELETE SET NULL;
        END IF;
    ELSIF fk_name IS NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contactos') THEN
            ALTER TABLE public.cotizaciones
                ADD CONSTRAINT cotizaciones_cliente_id_fkey
                FOREIGN KEY (cliente_id) REFERENCES public.contactos(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- 6) FACTURAS: agregar venta_id si no existe (antes de crear la FK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'facturas' AND column_name = 'venta_id'
    ) THEN
        ALTER TABLE public.facturas ADD COLUMN venta_id UUID;
    END IF;
END $$;

-- 7) FACTURAS: corregir FK venta_id para que apunte a cotizaciones (no a ventas)
DO $$
DECLARE
    fk_name TEXT;
    ref_table TEXT;
BEGIN
    SELECT tc.constraint_name, ccu.table_name
    INTO fk_name, ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'facturas'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'id'
      AND EXISTS (
          SELECT 1 FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_name = tc.constraint_name
            AND kcu.column_name = 'venta_id'
      );

    IF FOUND AND ref_table = 'ventas' THEN
        EXECUTE format('ALTER TABLE public.facturas DROP CONSTRAINT %I', fk_name);
        RAISE NOTICE 'FK venta_id a ventas eliminada. Recreando apuntando a cotizaciones...';

        ALTER TABLE public.facturas
            ADD CONSTRAINT facturas_venta_id_fkey
            FOREIGN KEY (venta_id) REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
    ELSIF fk_name IS NULL THEN
        ALTER TABLE public.facturas
            ADD CONSTRAINT facturas_venta_id_fkey
            FOREIGN KEY (venta_id) REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 8) Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
