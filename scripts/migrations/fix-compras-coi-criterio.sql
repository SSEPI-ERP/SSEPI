-- =====================================================
-- FIX: Sincronizar criterio de compras en trigger COI
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- PROBLEMA: frontend (coi-sync-engine.js) encola compras cuando estado >= 4 (Recibida).
-- Trigger SQL (fn_generar_evento_coi) solo genera evento cuando estado = 5 (Entregada).
-- Se unifica el criterio a estado >= 4 para que ambos canales (JS y SQL) disparen juntos.

CREATE OR REPLACE FUNCTION public.fn_generar_evento_coi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subtotal_val NUMERIC(12,2);
    iva_val NUMERIC(12,2);
    total_val NUMERIC(12,2);
    folio_val TEXT;
BEGIN
    -- =====================================================
    -- COMPRAS: cuando pasa a estado >= 4 (Recibida / Entregada / Ejecutada)
    -- =====================================================
    IF TG_TABLE_NAME = 'compras' THEN
        IF NEW.estado >= 4 AND (OLD.estado IS NULL OR OLD.estado < 4) THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (
                tipo_evento, tabla_origen, registro_id, entidad_nombre,
                subtotal, iva, total, concepto, metadata
            ) VALUES (
                'compra',
                'compras',
                NEW.id,
                COALESCE(NEW.proveedor, 'Proveedor no especificado'),
                subtotal_val,
                iva_val,
                total_val,
                'Orden de compra recibida/entregada: ' || folio_val,
                jsonb_build_object(
                    'folio', NEW.folio,
                    'departamento', NEW.departamento,
                    'estado', NEW.estado,
                    'vinculacion', NEW.vinculacion,
                    'trigger', 'compras_estado_ge_4'
                )
            );
        END IF;
    END IF;

    -- =====================================================
    -- VENTAS: cuando estatus_pago cambia a 'Pagado'
    -- =====================================================
    IF TG_TABLE_NAME = 'ventas' THEN
        IF NEW.estatus_pago = 'Pagado' AND (OLD.estatus_pago IS NULL OR OLD.estatus_pago != 'Pagado') THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (
                tipo_evento, tabla_origen, registro_id, entidad_id, entidad_nombre,
                subtotal, iva, total, concepto, metadata
            ) VALUES (
                'venta',
                'ventas',
                NEW.id,
                NEW.cliente_id,
                COALESCE(NEW.cliente, 'Cliente no especificado'),
                subtotal_val,
                iva_val,
                total_val,
                'Venta pagada: ' || folio_val,
                jsonb_build_object(
                    'folio', NEW.folio,
                    'cliente', NEW.cliente,
                    'estatus_pago', NEW.estatus_pago,
                    'trigger', 'ventas_pagado'
                )
            );
        END IF;
    END IF;

    -- =====================================================
    -- FACTURAS: cuando se emite (INSERT o UPDATE a estatus emitida)
    -- =====================================================
    IF TG_TABLE_NAME = 'facturas' THEN
        IF NEW.estatus IN ('emitida', 'activa') AND (OLD.estatus IS NULL OR OLD.estatus != NEW.estatus) THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(total_val / 1.16, 0);
            iva_val      := COALESCE(total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio_factura, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (
                tipo_evento, tabla_origen, registro_id, entidad_nombre,
                subtotal, iva, total, concepto, metadata
            ) VALUES (
                'venta',
                'facturas',
                NEW.id,
                COALESCE(NEW.cliente, 'Cliente no especificado'),
                subtotal_val,
                iva_val,
                total_val,
                'Factura emitida: ' || folio_val,
                jsonb_build_object(
                    'folio_factura', NEW.folio_factura,
                    'cliente', NEW.cliente,
                    'estatus', NEW.estatus,
                    'trigger', 'facturas_emitida'
                )
            );
        END IF;
    END IF;

    -- =====================================================
    -- PROYECTOS_AUTOMATIZACION: cuando pasa a completado
    -- =====================================================
    IF TG_TABLE_NAME = 'proyectos_automatizacion' THEN
        IF NEW.estado = 'completado' AND (OLD.estado IS NULL OR OLD.estado != 'completado') THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (
                tipo_evento, tabla_origen, registro_id, entidad_nombre,
                subtotal, iva, total, concepto, metadata
            ) VALUES (
                'venta',
                'proyectos_automatizacion',
                NEW.id,
                COALESCE(NEW.cliente, 'Cliente no especificado'),
                subtotal_val,
                iva_val,
                total_val,
                'Proyecto completado: ' || folio_val,
                jsonb_build_object(
                    'folio', NEW.folio,
                    'cliente', NEW.cliente,
                    'estado', NEW.estado,
                    'trigger', 'proyectos_completado'
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Recrear triggers que usan esta función
DROP TRIGGER IF EXISTS trg_compras_coi ON public.compras;
CREATE TRIGGER trg_compras_coi
    AFTER UPDATE ON public.compras
    FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

DROP TRIGGER IF EXISTS trg_ventas_coi ON public.ventas;
CREATE TRIGGER trg_ventas_coi
    AFTER UPDATE ON public.ventas
    FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

DROP TRIGGER IF EXISTS trg_facturas_coi ON public.facturas;
CREATE TRIGGER trg_facturas_coi
    AFTER INSERT OR UPDATE ON public.facturas
    FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

-- NUEVO: trigger para proyectos_automatizacion
DROP TRIGGER IF EXISTS trg_proyectos_coi ON public.proyectos_automatizacion;
CREATE TRIGGER trg_proyectos_coi
    AFTER UPDATE ON public.proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
