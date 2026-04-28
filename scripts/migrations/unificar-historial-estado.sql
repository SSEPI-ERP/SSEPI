-- =====================================================
-- UNIFICACIÓN: Historial + Máquina de Estados SSEPI
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- 1) TABLA DE MAPEO: estado nativo → paso unificado
DROP TABLE IF EXISTS public.estado_pipeline_unificado CASCADE;
CREATE TABLE public.estado_pipeline_unificado (
    tabla TEXT NOT NULL,
    estado_nativo TEXT NOT NULL,
    paso INTEGER NOT NULL,
    etiqueta TEXT NOT NULL,
    PRIMARY KEY (tabla, estado_nativo)
);

INSERT INTO public.estado_pipeline_unificado (tabla, estado_nativo, paso, etiqueta) VALUES
    -- ordenes_taller
    ('ordenes_taller', 'Nuevo', 1, 'recepcion'),
    ('ordenes_taller', 'Confirmado', 1, 'recepcion'),
    ('ordenes_taller', 'Diagnóstico', 2, 'diagnostico'),
    ('ordenes_taller', 'En Espera', 3, 'cotizacion'),
    ('ordenes_taller', 'En reparación', 6, 'ejecucion'),
    ('ordenes_taller', 'Reparado', 7, 'facturacion'),
    ('ordenes_taller', 'Entregado', 8, 'entrega'),
    ('ordenes_taller', 'Facturado', 8, 'entrega'),
    ('ordenes_taller', 'Cancelado', 0, 'cancelado'),
    -- ordenes_motores
    ('ordenes_motores', 'Nuevo', 1, 'recepcion'),
    ('ordenes_motores', 'Diagnóstico', 2, 'diagnostico'),
    ('ordenes_motores', 'En Espera', 3, 'cotizacion'),
    ('ordenes_motores', 'Reparado', 7, 'facturacion'),
    ('ordenes_motores', 'Entregado', 8, 'entrega'),
    -- proyectos_automatizacion
    ('proyectos_automatizacion', 'pendiente', 1, 'recepcion'),
    ('proyectos_automatizacion', 'progreso', 6, 'ejecucion'),
    ('proyectos_automatizacion', 'completado', 8, 'entrega'),
    ('proyectos_automatizacion', 'cancelado', 0, 'cancelado'),
    -- cotizaciones
    ('cotizaciones', 'borrador', 1, 'recepcion'),
    ('cotizaciones', 'pendiente_autorizacion_ventas', 3, 'cotizacion'),
    ('cotizaciones', 'Pendiente', 3, 'cotizacion'),
    ('cotizaciones', 'aprobada', 4, 'autorizacion'),
    ('cotizaciones', 'cancelada', 0, 'cancelado'),
    -- compras (estado es INTEGER)
    ('compras', '0', 3, 'cotizacion'),
    ('compras', '1', 5, 'adquisicion'),
    ('compras', '2', 5, 'adquisicion'),
    ('compras', '3', 5, 'adquisicion'),
    ('compras', '4', 6, 'ejecucion'),
    ('compras', '5', 6, 'ejecucion'),
    -- ventas
    ('ventas', 'Pendiente', 7, 'facturacion'),
    ('ventas', 'Pagado', 8, 'entrega');

-- 2) COLUMNAS estatus_actual EN TABLAS PRINCIPALES
ALTER TABLE public.ordenes_taller        ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.ordenes_motores       ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.cotizaciones          ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.compras               ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';
ALTER TABLE public.ventas                ADD COLUMN IF NOT EXISTS estatus_actual TEXT DEFAULT 'recepcion';

-- 3) ÍNDICES PARA FILTRADO RÁPIDO
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_estatus_actual        ON public.ordenes_taller(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_estatus_actual       ON public.ordenes_motores(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_proyectos_automatizacion_estatus_actual ON public.proyectos_automatizacion(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estatus_actual            ON public.cotizaciones(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_compras_estatus_actual               ON public.compras(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_ventas_estatus_actual                ON public.ventas(estatus_actual);

-- 4) TRIGGER: orden_historial INSERT → actualizar estatus_actual en tabla origen
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
    -- Determinar qué FK está poblada y qué tabla origen corresponde
    IF NEW.cotizacion_id IS NOT NULL THEN
        tabla_src := 'cotizaciones';
        orden_id  := NEW.cotizacion_id;
    ELSIF NEW.orden_taller_id IS NOT NULL THEN
        tabla_src := 'ordenes_taller';
        orden_id  := NEW.orden_taller_id;
    ELSIF NEW.orden_motor_id IS NOT NULL THEN
        tabla_src := 'ordenes_motores';
        orden_id  := NEW.orden_motor_id;
    ELSIF NEW.proyecto_id IS NOT NULL THEN
        tabla_src := 'proyectos_automatizacion';
        orden_id  := NEW.proyecto_id;
    ELSE
        RETURN NEW;
    END IF;

    -- Leer estado nativo actual de la tabla origen
    EXECUTE format('SELECT estado::TEXT FROM %I WHERE id = %L', tabla_src, orden_id)
        INTO estado_val;

    -- Buscar etiqueta unificada
    SELECT e.etiqueta INTO etiqueta_val
    FROM public.estado_pipeline_unificado e
    WHERE e.tabla = tabla_src AND e.estado_nativo = estado_val;

    IF FOUND THEN
        EXECUTE format('UPDATE %I SET estatus_actual = %L WHERE id = %L',
                       tabla_src, etiqueta_val, orden_id);
    END IF;

    RETURN NEW;
END;
$$;

-- Eliminar trigger previo si existe (idempotente)
DROP TRIGGER IF EXISTS trg_orden_historial_estatus ON public.orden_historial;
CREATE TRIGGER trg_orden_historial_estatus
    AFTER INSERT ON public.orden_historial
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_actualizar_estatus_actual();

-- 5) Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
