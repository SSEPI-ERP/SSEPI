-- =====================================================
-- EMERGENCIA: Setup completo de Integridad + COI
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- Idempotente: puede re-ejecutarse sin error
-- =====================================================

-- =====================================================
-- PARTE 0: ORDEN HISTORIAL (prerrequisito)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orden_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID,
    orden_taller_id UUID,
    orden_motor_id UUID,
    proyecto_id UUID,
    evento TEXT NOT NULL,
    descripcion TEXT,
    usuario_id UUID,
    metadata JSONB DEFAULT '{}',
    creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orden_historial_cotizacion ON public.orden_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_taller ON public.orden_historial(orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_motor ON public.orden_historial(orden_motor_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_proyecto ON public.orden_historial(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_creado ON public.orden_historial(creado_en);

-- =====================================================
-- PARTE 1: MAPEO DE ESTADOS UNIFICADOS
-- =====================================================
DROP TABLE IF EXISTS public.estado_pipeline_unificado CASCADE;
CREATE TABLE public.estado_pipeline_unificado (
    tabla TEXT NOT NULL,
    estado_nativo TEXT NOT NULL,
    paso INTEGER NOT NULL,
    etiqueta TEXT NOT NULL,
    PRIMARY KEY (tabla, estado_nativo)
);

INSERT INTO public.estado_pipeline_unificado (tabla, estado_nativo, paso, etiqueta) VALUES
    ('ordenes_taller', 'Nuevo', 1, 'recepcion'),
    ('ordenes_taller', 'Confirmado', 1, 'recepcion'),
    ('ordenes_taller', 'Diagnóstico', 2, 'diagnostico'),
    ('ordenes_taller', 'En Espera', 3, 'cotizacion'),
    ('ordenes_taller', 'En reparación', 6, 'ejecucion'),
    ('ordenes_taller', 'Reparado', 7, 'facturacion'),
    ('ordenes_taller', 'Entregado', 8, 'entrega'),
    ('ordenes_taller', 'Facturado', 8, 'entrega'),
    ('ordenes_taller', 'Cancelado', 0, 'cancelado'),
    ('ordenes_motores', 'Nuevo', 1, 'recepcion'),
    ('ordenes_motores', 'Diagnóstico', 2, 'diagnostico'),
    ('ordenes_motores', 'En Espera', 3, 'cotizacion'),
    ('ordenes_motores', 'Reparado', 7, 'facturacion'),
    ('ordenes_motores', 'Entregado', 8, 'entrega'),
    ('proyectos_automatizacion', 'pendiente', 1, 'recepcion'),
    ('proyectos_automatizacion', 'progreso', 6, 'ejecucion'),
    ('proyectos_automatizacion', 'completado', 8, 'entrega'),
    ('proyectos_automatizacion', 'cancelado', 0, 'cancelado'),
    ('cotizaciones', 'borrador', 1, 'recepcion'),
    ('cotizaciones', 'pendiente_autorizacion_ventas', 3, 'cotizacion'),
    ('cotizaciones', 'Pendiente', 3, 'cotizacion'),
    ('cotizaciones', 'aprobada', 4, 'autorizacion'),
    ('cotizaciones', 'cancelada', 0, 'cancelado'),
    ('compras', '0', 3, 'cotizacion'),
    ('compras', '1', 5, 'adquisicion'),
    ('compras', '2', 5, 'adquisicion'),
    ('compras', '3', 5, 'adquisicion'),
    ('compras', '4', 6, 'ejecucion'),
    ('compras', '5', 6, 'ejecucion'),
    ('ventas', 'Pendiente', 7, 'facturacion'),
    ('ventas', 'Pagado', 8, 'entrega');

-- =====================================================
-- PARTE 2: COLUMNAS estatus_actual
-- =====================================================
ALTER TABLE public.ordenes_taller        ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.ordenes_motores       ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.cotizaciones          ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.compras               ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.ventas                ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_estatus_actual        ON public.ordenes_taller(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_estatus_actual       ON public.ordenes_motores(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_proyectos_automatizacion_estatus_actual ON public.proyectos_automatizacion(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estatus_actual            ON public.cotizaciones(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_compras_estatus_actual               ON public.compras(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_ventas_estatus_actual                ON public.ventas(estatus_actual);

-- =====================================================
-- PARTE 3: TRIGGER estatus_actual
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_actualizar_estatus_actual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tabla_src   TEXT;
    orden_id    UUID;
    estado_val  TEXT;
    etiqueta_val TEXT;
BEGIN
    IF NEW.cotizacion_id IS NOT NULL THEN
        tabla_src := 'cotizaciones'; orden_id := NEW.cotizacion_id;
    ELSIF NEW.orden_taller_id IS NOT NULL THEN
        tabla_src := 'ordenes_taller'; orden_id := NEW.orden_taller_id;
    ELSIF NEW.orden_motor_id IS NOT NULL THEN
        tabla_src := 'ordenes_motores'; orden_id := NEW.orden_motor_id;
    ELSIF NEW.proyecto_id IS NOT NULL THEN
        tabla_src := 'proyectos_automatizacion'; orden_id := NEW.proyecto_id;
    ELSE
        RETURN NEW;
    END IF;

    EXECUTE format('SELECT estado::TEXT FROM %I WHERE id = %L', tabla_src, orden_id) INTO estado_val;

    SELECT e.etiqueta INTO etiqueta_val
    FROM public.estado_pipeline_unificado e
    WHERE e.tabla = tabla_src AND e.estado_nativo = estado_val;

    IF FOUND THEN
        EXECUTE format('UPDATE %I SET estatus_actual = %L WHERE id = %L', tabla_src, etiqueta_val, orden_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_historial_estatus ON public.orden_historial;
CREATE TRIGGER trg_orden_historial_estatus
    AFTER INSERT ON public.orden_historial
    FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_estatus_actual();

-- =====================================================
-- PARTE 4: BLOQUEO CONTABLE (Cuarentena)
-- =====================================================
ALTER TABLE public.ordenes_taller        ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ordenes_motores       ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.cotizaciones          ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compras               ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ventas                ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;
ALTER TABLE public.facturas              ADD COLUMN IF NOT EXISTS bloqueo_contable BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_bloqueo ON public.ordenes_taller(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_bloqueo ON public.ordenes_motores(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_bloqueo ON public.cotizaciones(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_compras_bloqueo ON public.compras(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_ventas_bloqueo ON public.ventas(bloqueo_contable) WHERE bloqueo_contable = TRUE;
CREATE INDEX IF NOT EXISTS idx_facturas_bloqueo ON public.facturas(bloqueo_contable) WHERE bloqueo_contable = TRUE;

-- =====================================================
-- PARTE 5: REGLA 1 — PUNTO DE NO RETORNO (anti-DELETE)
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
    folio_val := COALESCE(OLD.folio, OLD.id::TEXT, 'SIN_FOLIO');
    estatus := OLD.estatus_actual;

    IF estatus IS NULL THEN
        SELECT e.etiqueta INTO estatus
        FROM public.estado_pipeline_unificado e
        WHERE e.tabla = TG_TABLE_NAME AND e.estado_nativo = COALESCE(OLD.estado::TEXT, OLD.estatus::TEXT, '');
    END IF;

    IF estatus IS NULL THEN
        estatus := COALESCE(OLD.estado::TEXT, OLD.estatus::TEXT, 'desconocido');
    END IF;

    IF estatus NOT IN ('recepcion', 'diagnostico', 'Nuevo', 'Diagnostico', 'pendiente', 'borrador') THEN
        RAISE EXCEPTION 'REGLA_1_PUNTO_NO_RETORNO: No se puede eliminar la orden % (estatus: %). Solo eliminable en Recepción o Diagnóstico.', folio_val, estatus
            USING HINT = 'Use el estado "Cancelado" para cerrar la orden sin eliminarla.';
    END IF;

    RETURN OLD;
END;
$$;

-- Aplicar triggers anti-delete
DROP TRIGGER IF EXISTS trg_prevenir_delete_taller ON public.ordenes_taller;
CREATE TRIGGER trg_prevenir_delete_taller BEFORE DELETE ON public.ordenes_taller FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_motores ON public.ordenes_motores;
CREATE TRIGGER trg_prevenir_delete_motores BEFORE DELETE ON public.ordenes_motores FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_prevenir_delete_proyectos BEFORE DELETE ON public.proyectos_automatizacion FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_prevenir_delete_cotizaciones BEFORE DELETE ON public.cotizaciones FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_compras ON public.compras;
CREATE TRIGGER trg_prevenir_delete_compras BEFORE DELETE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_ventas ON public.ventas;
CREATE TRIGGER trg_prevenir_delete_ventas BEFORE DELETE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

DROP TRIGGER IF EXISTS trg_prevenir_delete_facturas ON public.facturas;
CREATE TRIGGER trg_prevenir_delete_facturas BEFORE DELETE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.fn_prevenir_delete_orden();

-- =====================================================
-- PARTE 6: REGLA 2 — CUARENTENA (congelar operaciones)
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

    IF OLD.bloqueo_contable = TRUE THEN
        IF NEW.bloqueo_contable = FALSE THEN
            RETURN NEW;
        END IF;
        IF NEW.estado::TEXT IN ('Cancelado', 'cancelado', 'cancelada') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'REGLA_2_CUARENTENA: La orden % está en cuarentena contable. Modificación bloqueada.', folio_val
            USING HINT = 'Desactive la cuarentena (bloqueo_contable = FALSE) o emita una nota de crédito/reversión oficial.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cuarentena_taller ON public.ordenes_taller;
CREATE TRIGGER trg_cuarentena_taller BEFORE UPDATE ON public.ordenes_taller FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_motores ON public.ordenes_motores;
CREATE TRIGGER trg_cuarentena_motores BEFORE UPDATE ON public.ordenes_motores FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_proyectos ON public.proyectos_automatizacion;
CREATE TRIGGER trg_cuarentena_proyectos BEFORE UPDATE ON public.proyectos_automatizacion FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_cotizaciones ON public.cotizaciones;
CREATE TRIGGER trg_cuarentena_cotizaciones BEFORE UPDATE ON public.cotizaciones FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_compras ON public.compras;
CREATE TRIGGER trg_cuarentena_compras BEFORE UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_ventas ON public.ventas;
CREATE TRIGGER trg_cuarentena_ventas BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

DROP TRIGGER IF EXISTS trg_cuarentena_facturas ON public.facturas;
CREATE TRIGGER trg_cuarentena_facturas BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_cuarentena();

-- =====================================================
-- PARTE 7: PUENTE SSEPI-COI (Tabla + Trigger)
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

-- RLS restringido a roles contables
DROP POLICY IF EXISTS eventos_coi_select ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_select ON public.eventos_contables_coi FOR SELECT TO authenticated
    USING (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

DROP POLICY IF EXISTS eventos_coi_insert ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_insert ON public.eventos_contables_coi FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

DROP POLICY IF EXISTS eventos_coi_update ON public.eventos_contables_coi;
CREATE POLICY eventos_coi_update ON public.eventos_contables_coi FOR UPDATE TO authenticated
    USING (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'))
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

GRANT SELECT, INSERT, UPDATE ON public.eventos_contables_coi TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eventos_contables_coi TO service_role;

-- =====================================================
-- PARTE 8: FUNCION TRIGGER COI
-- =====================================================
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
    -- COMPRAS: estado >= 4 (Recibida/Entregada)
    IF TG_TABLE_NAME = 'compras' THEN
        IF NEW.estado >= 4 AND (OLD.estado IS NULL OR OLD.estado < 4) THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (tipo_evento, tabla_origen, registro_id, entidad_nombre, subtotal, iva, total, concepto, metadata)
            VALUES ('compra', 'compras', NEW.id, COALESCE(NEW.proveedor, 'Proveedor no especificado'), subtotal_val, iva_val, total_val,
                'Orden de compra recibida/entregada: ' || folio_val,
                jsonb_build_object('folio', NEW.folio, 'departamento', NEW.departamento, 'estado', NEW.estado, 'trigger', 'compras_estado_ge_4'));
        END IF;
    END IF;

    -- VENTAS: estatus_pago = Pagado
    IF TG_TABLE_NAME = 'ventas' THEN
        IF NEW.estatus_pago = 'Pagado' AND (OLD.estatus_pago IS NULL OR OLD.estatus_pago != 'Pagado') THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (tipo_evento, tabla_origen, registro_id, entidad_id, entidad_nombre, subtotal, iva, total, concepto, metadata)
            VALUES ('venta', 'ventas', NEW.id, NEW.cliente_id, COALESCE(NEW.cliente, 'Cliente no especificado'), subtotal_val, iva_val, total_val,
                'Venta pagada: ' || folio_val,
                jsonb_build_object('folio', NEW.folio, 'cliente', NEW.cliente, 'estatus_pago', NEW.estatus_pago, 'trigger', 'ventas_pagado'));
        END IF;
    END IF;

    -- FACTURAS: estatus emitida/activa
    IF TG_TABLE_NAME = 'facturas' THEN
        IF NEW.estatus IN ('emitida', 'activa') AND (OLD.estatus IS NULL OR OLD.estatus != NEW.estatus) THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(total_val / 1.16, 0);
            iva_val      := COALESCE(total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio_factura, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (tipo_evento, tabla_origen, registro_id, entidad_nombre, subtotal, iva, total, concepto, metadata)
            VALUES ('venta', 'facturas', NEW.id, COALESCE(NEW.cliente, 'Cliente no especificado'), subtotal_val, iva_val, total_val,
                'Factura emitida: ' || folio_val,
                jsonb_build_object('folio_factura', NEW.folio_factura, 'cliente', NEW.cliente, 'estatus', NEW.estatus, 'trigger', 'facturas_emitida'));
        END IF;
    END IF;

    -- PROYECTOS_AUTOMATIZACION: completado
    IF TG_TABLE_NAME = 'proyectos_automatizacion' THEN
        IF NEW.estado = 'completado' AND (OLD.estado IS NULL OR OLD.estado != 'completado') THEN
            total_val   := COALESCE(NEW.total, 0);
            subtotal_val := COALESCE(NEW.subtotal, total_val / 1.16, 0);
            iva_val      := COALESCE(NEW.iva, total_val - subtotal_val, 0);
            folio_val    := COALESCE(NEW.folio, NEW.id::TEXT);

            INSERT INTO public.eventos_contables_coi (tipo_evento, tabla_origen, registro_id, entidad_nombre, subtotal, iva, total, concepto, metadata)
            VALUES ('venta', 'proyectos_automatizacion', NEW.id, COALESCE(NEW.cliente, 'Cliente no especificado'), subtotal_val, iva_val, total_val,
                'Proyecto completado: ' || folio_val,
                jsonb_build_object('folio', NEW.folio, 'cliente', NEW.cliente, 'estado', NEW.estado, 'trigger', 'proyectos_completado'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compras_coi ON public.compras;
CREATE TRIGGER trg_compras_coi AFTER UPDATE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

DROP TRIGGER IF EXISTS trg_ventas_coi ON public.ventas;
CREATE TRIGGER trg_ventas_coi AFTER UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

DROP TRIGGER IF EXISTS trg_facturas_coi ON public.facturas;
CREATE TRIGGER trg_facturas_coi AFTER INSERT OR UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

DROP TRIGGER IF EXISTS trg_proyectos_coi ON public.proyectos_automatizacion;
CREATE TRIGGER trg_proyectos_coi AFTER UPDATE ON public.proyectos_automatizacion FOR EACH ROW EXECUTE FUNCTION public.fn_generar_evento_coi();

-- =====================================================
-- PARTE 9: CORREGIR FK facturas.venta_id → ventas
-- =====================================================
DO $$
DECLARE
    fk_name TEXT;
    ref_table TEXT;
BEGIN
    SELECT tc.constraint_name, ccu.table_name INTO fk_name, ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'facturas' AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'id'
      AND EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu WHERE kcu.constraint_name = tc.constraint_name AND kcu.column_name = 'venta_id');

    IF FOUND AND ref_table != 'ventas' THEN
        EXECUTE format('ALTER TABLE public.facturas DROP CONSTRAINT %I', fk_name);
        RAISE NOTICE 'FK venta_id a % eliminada. Recreando apuntando a ventas...', ref_table;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = 'facturas' AND kcu.column_name = 'venta_id'
    ) THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ventas') THEN
            ALTER TABLE public.facturas ADD CONSTRAINT facturas_venta_id_fkey
                FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- =====================================================
-- PARTE 10: RECARGA SCHEMA CACHE
-- =====================================================
NOTIFY pgrst, 'reload schema';
