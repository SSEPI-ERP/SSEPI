-- =====================================================
-- FIX: Integridad de facturas + corrección FK
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- 1) FACTURAS: agregar bloqueo_contable (faltaba en reglas-integridad-coi.sql)
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_facturas_bloqueo ON public.facturas(bloqueo_contable) WHERE bloqueo_contable = TRUE;

-- 2) FACTURAS: trigger anti-delete (Punto de No Retorno)
DROP TRIGGER IF EXISTS trg_prevenir_delete_facturas ON public.facturas;
CREATE TRIGGER trg_prevenir_delete_facturas
    BEFORE DELETE ON public.facturas
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

-- 3) FACTURAS: trigger cuarentena (congelar modificaciones)
DROP TRIGGER IF EXISTS trg_cuarentena_facturas ON public.facturas;
CREATE TRIGGER trg_cuarentena_facturas
    BEFORE UPDATE ON public.facturas
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

-- 4) CORREGIR FK: facturas.venta_id debe apuntar a VENTAS (no a cotizaciones)
-- El JS de facturacion.js busca primero en ventas y asigna venta_id con ID de ventas.
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

    IF FOUND AND ref_table = 'cotizaciones' THEN
        EXECUTE format('ALTER TABLE public.facturas DROP CONSTRAINT %I', fk_name);
        RAISE NOTICE 'FK venta_id a cotizaciones eliminada. Recreando apuntando a ventas...';

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ventas') THEN
            ALTER TABLE public.facturas
                ADD CONSTRAINT facturas_venta_id_fkey
                FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;
        END IF;
    ELSIF fk_name IS NULL THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ventas') THEN
            ALTER TABLE public.facturas
                ADD CONSTRAINT facturas_venta_id_fkey
                FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- 5) PROYECTOS_AUTOMATIZACION: agregar trigger anti-delete (faltaba)
DROP TRIGGER IF EXISTS trg_prevenir_delete_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_prevenir_delete_proyectos
    BEFORE DELETE ON public.proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

-- 6) PROYECTOS_AUTOMATIZACION: trigger cuarentena (ya existe en reglas-integridad-coi.sql, verificar)
-- Nota: el trigger trg_cuarentena_proyectos ya fue creado en reglas-integridad-coi.sql línea 138.
-- Si no existe, se crea aquí como respaldo.
DROP TRIGGER IF EXISTS trg_cuarentena_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_cuarentena_proyectos
    BEFORE UPDATE ON public.proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

-- 7) Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
