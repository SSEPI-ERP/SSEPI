-- ================================================
-- MIGRACIÓN: Actividades vinculadas a Departamento y Orden
-- FECHA: 2026-05-11
-- ================================================

-- 1. Agregar columna departamento a actividades_diarias
ALTER TABLE public.actividades_diarias
    ADD COLUMN IF NOT EXISTS departamento TEXT DEFAULT 'automatizacion',
    ADD COLUMN IF NOT EXISTS orden_origen_id UUID,
    ADD COLUMN IF NOT EXISTS orden_origen_tipo TEXT;

-- Tipos de orden_origen_tipo: 'proyectos_automatizacion', 'ordenes_taller', 'ordenes_motores', 'soporte_planta', 'ventas'

-- 2. Índices para filtrado rápido
CREATE INDEX IF NOT EXISTS idx_actividades_departamento ON public.actividades_diarias(departamento);
CREATE INDEX IF NOT EXISTS idx_actividades_orden_origen ON public.actividades_diarias(orden_origen_id);

-- 3. Tabla de seguimiento de actividades por proyecto/orden (resumen para dashboards rápidos)
CREATE TABLE IF NOT EXISTS public.actividades_seguimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID NOT NULL,
    orden_tipo TEXT NOT NULL,
    departamento TEXT NOT NULL,
    total_actividades INTEGER DEFAULT 0,
    pendientes INTEGER DEFAULT 0,
    en_progreso INTEGER DEFAULT 0,
    completadas INTEGER DEFAULT 0,
    progreso_porcentaje INTEGER DEFAULT 0,
    ultima_actividad_fecha DATE,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_orden ON public.actividades_seguimiento(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_seguimiento_departamento ON public.actividades_seguimiento(departamento);

-- 4. Función para recalcular seguimiento por orden
CREATE OR REPLACE FUNCTION public.recalcular_seguimiento_actividades(p_orden_id UUID, p_orden_tipo TEXT)
RETURNS void AS $$
BEGIN
    INSERT INTO public.actividades_seguimiento (orden_id, orden_tipo, departamento, total_actividades, pendientes, en_progreso, completadas, progreso_porcentaje, ultima_actividad_fecha)
    SELECT
        p_orden_id,
        p_orden_tipo,
        COALESCE(MAX(departamento), 'automatizacion'),
        COUNT(*),
        COUNT(*) FILTER (WHERE estado = 'pendiente'),
        COUNT(*) FILTER (WHERE estado = 'en_progreso'),
        COUNT(*) FILTER (WHERE estado = 'completado'),
        CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE estado = 'completado') * 100.0 / COUNT(*)) ELSE 0 END,
        MAX(fecha)
    FROM public.actividades_diarias
    WHERE orden_origen_id = p_orden_id AND orden_origen_tipo = p_orden_tipo
    ON CONFLICT (orden_id, orden_tipo) DO UPDATE SET
        departamento = EXCLUDED.departamento,
        total_actividades = EXCLUDED.total_actividades,
        pendientes = EXCLUDED.pendientes,
        en_progreso = EXCLUDED.en_progreso,
        completadas = EXCLUDED.completadas,
        progreso_porcentaje = EXCLUDED.progreso_porcentaje,
        ultima_actividad_fecha = EXCLUDED.ultima_actividad_fecha,
        updated_at = now();
END;
$$ language 'plpgsql';

-- 5. Trigger para auto-recalcular seguimiento en cambios de actividades
CREATE OR REPLACE FUNCTION public.trigger_recalcular_seguimiento()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.orden_origen_id IS NOT NULL THEN
            PERFORM public.recalcular_seguimiento_actividades(OLD.orden_origen_id, OLD.orden_origen_tipo);
        END IF;
        RETURN OLD;
    ELSE
        IF NEW.orden_origen_id IS NOT NULL THEN
            PERFORM public.recalcular_seguimiento_actividades(NEW.orden_origen_id, NEW.orden_origen_tipo);
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.orden_origen_id IS NOT NULL AND OLD.orden_origen_id IS DISTINCT FROM NEW.orden_origen_id THEN
            PERFORM public.recalcular_seguimiento_actividades(OLD.orden_origen_id, OLD.orden_origen_tipo);
        END IF;
        RETURN NEW;
    END IF;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_actividades_seguimiento ON public.actividades_diarias;
CREATE TRIGGER trigger_actividades_seguimiento
    AFTER INSERT OR UPDATE OR DELETE ON public.actividades_diarias
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_recalcular_seguimiento();

-- 6. RLS para actividades_seguimiento (mismo patrón que actividades_diarias)
ALTER TABLE public.actividades_seguimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_all_seguimiento"
    ON public.actividades_seguimiento
    FOR SELECT
    USING (true);

CREATE POLICY "allow_insert_seguimiento_authenticated"
    ON public.actividades_seguimiento
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_update_seguimiento_authenticated"
    ON public.actividades_seguimiento
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- 7. Comentarios para documentar
COMMENT ON COLUMN public.actividades_diarias.departamento IS 'Departamento al que pertenece la actividad: automatizacion, electronicos, motores, soporte_planta, administracion';
COMMENT ON COLUMN public.actividades_diarias.orden_origen_id IS 'ID de la orden o proyecto al que está vinculada la actividad';
COMMENT ON COLUMN public.actividades_diarias.orden_origen_tipo IS 'Tipo de orden: proyectos_automatizacion, ordenes_taller, ordenes_motores, soporte_planta, ventas';
