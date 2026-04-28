-- =====================================================
-- REGLAS DE INTEGRIDAD: Inmutabilidad, Cuarentena, COI
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- =====================================================
-- REGLA 2: BLOQUEO CONTABLE (CUARENTENA)
-- =====================================================
ALTER TABLE public.ordenes_taller        ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ordenes_motores       ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.cotizaciones          ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compras               ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ventas                ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;

-- Índice para filtros rápidos de cuarentena
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_bloqueo ON public.ordenes_taller(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_bloqueo ON public.ordenes_motores(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_bloqueo ON public.cotizaciones(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_compras_bloqueo ON public.compras(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_ventas_bloqueo ON public.ventas(bloqueo_contable) WHERE bloqueo_contable = TRUE;

-- =====================================================
-- REGLA 1: PUNTO DE NO RETORNO (Trigger anti-DELETE)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_prevenir_delete_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    estatus TEXT;
    folio_val TEXT;
BEGIN
    -- Intentar obtener folio para el mensaje de error
    folio_val := COALESCE(OLD.folio, OLD.id::TEXT, 'SIN_FOLIO');

    -- Usar estatus_actual directamente (ya sincronizado por el trigger de historial)
    estatus := OLD.estatus_actual;

    -- Fallback: mapear desde estado nativo si aún no hay estatus_actual
    IF estatus IS NULL THEN
        SELECT e.etiqueta INTO estatus
        FROM public.estado_pipeline_unificado e
        WHERE e.tabla = TG_TABLE_NAME AND e.estado_nativo = COALESCE(OLD.estado::TEXT, OLD.estatus::TEXT, '');
    END IF;

    -- Fallback final: usar el estado nativo tal cual
    IF estatus IS NULL THEN
        estatus := COALESCE(OLD.estado::TEXT, OLD.estatus::TEXT, 'desconocido');
    END IF;

    -- REGLA: solo permitir DELETE en recepcion o diagnostico
    IF estatus NOT IN ('recepcion', 'diagnostico', 'Nuevo', 'Diagnostico', 'pendiente', 'borrador') THEN
        RAISE EXCEPTION 'REGLA_1_PUNTO_NO_RETORNO: No se puede eliminar la orden % (estatus: %). Solo eliminable en Recepción o Diagnóstico.', folio_val, estatus
            USING HINT = 'Use el estado "Cancelado" para cerrar la orden sin eliminarla. Esto preserva el rastro de auditoría.';
    END IF;

    RETURN OLD;
END;
$$;

-- Aplicar trigger anti-delete a tablas de órdenes
DROP TRIGGER IF EXISTS trg_prevenir_delete_taller ON public.ordenes_taller;
CREATE TRIGGER trg_prevenir_delete_taller
    BEFORE DELETE ON public.ordenes_taller
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_motores ON public.ordenes_motores;
CREATE TRIGGER trg_prevenir_delete_motores
    BEFORE DELETE ON public.ordenes_motores
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_prevenir_delete_proyectos
    BEFORE DELETE ON public.proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_prevenir_delete_cotizaciones
    BEFORE DELETE ON public.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_compras ON public.compras;
CREATE TRIGGER trg_prevenir_delete_compras
    BEFORE DELETE ON public.compras
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_ventas ON public.ventas;
CREATE TRIGGER trg_prevenir_delete_ventas
    BEFORE DELETE ON public.ventas
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

-- =====================================================
-- REGLA 2: CUARENTENA (Congelar operaciones)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_bloquear_cuarentena()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    folio_val TEXT;
BEGIN
    folio_val := COALESCE(OLD.folio, OLD.id::TEXT, 'SIN_FOLIO');

    -- Si la orden YA estaba en cuarentena
    IF OLD.bloqueo_contable = TRUE THEN
        -- Permitir desbloquear (cambiar bloqueo_contable a FALSE)
        IF NEW.bloqueo_contable = FALSE THEN
            RETURN NEW;
        END IF;
        -- Permitir cambiar estado a Cancelado/cancelado
        IF NEW.estado::TEXT IN ('Cancelado', 'cancelado', 'cancelada') THEN
            RETURN NEW;
        END IF;
        -- Bloquear cualquier otra modificación
        RAISE EXCEPTION 'REGLA_2_CUARENTENA: La orden % está en cuarentena contable. Modificación bloqueada.', folio_val
            USING HINT = 'Desactive la cuarentena (bloqueo_contable = FALSE) o emita una nota de crédito/reversión oficial.';
    END IF;

    -- Si NO estaba en cuarentena, permitir todo (incluyendo activarla)
    RETURN NEW;
END;
$$;

-- Triggers BEFORE UPDATE para congelar operaciones en cuarentena
DROP TRIGGER IF EXISTS trg_cuarentena_taller ON public.ordenes_taller;
CREATE TRIGGER trg_cuarentena_taller
    BEFORE UPDATE ON public.ordenes_taller
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_motores ON public.ordenes_motores;
CREATE TRIGGER trg_cuarentena_motores
    BEFORE UPDATE ON public.ordenes_motores
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_cuarentena_proyectos
    BEFORE UPDATE ON public.proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_cuarentena_cotizaciones
    BEFORE UPDATE ON public.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_compras ON public.compras;
CREATE TRIGGER trg_cuarentena_compras
    BEFORE UPDATE ON public.compras
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_ventas ON public.ventas;
CREATE TRIGGER trg_cuarentena_ventas
    BEFORE UPDATE ON public.ventas
    FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

-- =====================================================
-- REGLA 3: PUENTE SSEPI-COI (Tabla de eventos contables)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eventos_contables_coi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('venta', 'compra', 'gasto', 'nota_credito')),
    tabla_origen TEXT NOT NULL,
    registro_id UUID NOT NULL,
    entidad_id UUID,
    entidad_nombre TEXT,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    concepto TEXT,
    estatus_coi TEXT DEFAULT 'pendiente' CHECK (estatus_coi IN ('pendiente', 'procesado', 'error')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_coi_estatus ON public.eventos_contables_coi(estatus_coi);
CREATE INDEX IF NOT EXISTS idx_eventos_coi_registro ON public.eventos_contables_coi(tabla_origen, registro_id);
CREATE INDEX IF NOT EXISTS idx_eventos_coi_pendiente ON public.eventos_contables_coi(created_at) WHERE estatus_coi = 'pendiente';

ALTER TABLE public.eventos_contables_coi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_coi_select ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_select ON public.eventos_contables_coi FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS eventos_coi_insert ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_insert ON public.eventos_contables_coi FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS eventos_coi_update ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_update ON public.eventos_contables_coi FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.eventos_contables_coi TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eventos_contables_coi TO service_role;

-- Función trigger para generar eventos COI
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
    -- COMPRAS: cuando pasa a estado 5 (Entregada / Ejecutada)
    -- =====================================================
    IF TG_TABLE_NAME = 'compras' THEN
        IF NEW.estado = 5 AND (OLD.estado IS NULL OR OLD.estado != 5) THEN
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
                'Orden de compra ejecutada: ' || folio_val,
                jsonb_build_object(
                    'folio', NEW.folio,
                    'departamento', NEW.departamento,
                    'estado', NEW.estado,
                    'vinculacion', NEW.vinculacion,
                    'trigger', 'compras_estado_5'
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

    RETURN NEW;
END;
$$;

-- Triggers AFTER UPDATE/INSERT para COI
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

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
