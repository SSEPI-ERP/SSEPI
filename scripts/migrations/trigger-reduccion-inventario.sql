-- =====================================================
-- TRIGGER: Reducción automática de inventario al usar materiales
-- Tablas: ordenes_taller, ordenes_motores
-- Columnas JSONB monitoreadas: componentes_inventario, refacciones_inventario
-- =====================================================

CREATE OR REPLACE FUNCTION reducir_inventario_en_orden()
RETURNS TRIGGER AS $$
DECLARE
    item JSONB;
    sku_text TEXT;
    cantidad_num NUMERIC;
    inventario_id UUID;
    stock_actual INTEGER;
BEGIN
    -- Solo actuar si el estado indica que se está consumiendo material
    -- (Nuevo -> Confirmado/Diagnóstico/En reparación)
    IF (TG_OP = 'UPDATE' AND NEW.estado IN ('En reparación', 'Reparado', 'En Espera')) THEN

        -- Recorrer componentes_inventario (ordenes_taller / ordenes_motores)
        FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.componentes_inventario, '[]'::jsonb))
        LOOP
            sku_text := item->>'sku';
            cantidad_num := COALESCE((item->>'cantidad')::numeric, (item->>'usado')::numeric, 0);

            IF sku_text IS NOT NULL AND cantidad_num > 0 THEN
                SELECT id, cantidad INTO inventario_id, stock_actual
                FROM public.inventario WHERE sku = sku_text LIMIT 1;

                IF inventario_id IS NOT NULL THEN
                    UPDATE public.inventario
                    SET cantidad = GREATEST(cantidad - cantidad_num::integer, 0),
                        updated_at = NOW()
                    WHERE id = inventario_id;

                    INSERT INTO public.movimientos_inventario (producto_id, tipo_movimiento, cantidad, referencia, created_at)
                    VALUES (inventario_id, 'salida', cantidad_num::integer, TG_TABLE_NAME || ' ' || NEW.folio, NOW());
                END IF;
            END IF;
        END LOOP;

        -- Recorrer refacciones_inventario
        FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.refacciones_inventario, '[]'::jsonb))
        LOOP
            sku_text := item->>'sku';
            cantidad_num := COALESCE((item->>'cantidad')::numeric, (item->>'usado')::numeric, 0);

            IF sku_text IS NOT NULL AND cantidad_num > 0 THEN
                SELECT id, cantidad INTO inventario_id, stock_actual
                FROM public.inventario WHERE sku = sku_text LIMIT 1;

                IF inventario_id IS NOT NULL THEN
                    UPDATE public.inventario
                    SET cantidad = GREATEST(cantidad - cantidad_num::integer, 0),
                        updated_at = NOW()
                    WHERE id = inventario_id;

                    INSERT INTO public.movimientos_inventario (producto_id, tipo_movimiento, cantidad, referencia, created_at)
                    VALUES (inventario_id, 'salida', cantidad_num::integer, TG_TABLE_NAME || ' ' || NEW.folio, NOW());
                END IF;
            END IF;
        END LOOP;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Asociar trigger a ordenes_taller
-- =====================================================
DROP TRIGGER IF EXISTS trg_reducir_inventario_taller ON public.ordenes_taller;
CREATE TRIGGER trg_reducir_inventario_taller
    AFTER UPDATE ON public.ordenes_taller
    FOR EACH ROW
    EXECUTE FUNCTION reducir_inventario_en_orden();

-- =====================================================
-- Asociar trigger a ordenes_motores
-- =====================================================
DROP TRIGGER IF EXISTS trg_reducir_inventario_motores ON public.ordenes_motores;
CREATE TRIGGER trg_reducir_inventario_motores
    AFTER UPDATE ON public.ordenes_motores
    FOR EACH ROW
    EXECUTE FUNCTION reducir_inventario_en_orden();

-- Recargar schema
NOTIFY pgrst, 'reload schema';
