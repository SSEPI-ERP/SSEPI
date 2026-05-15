-- ================================================
-- MIGRACIÓN: Kanban Dashboard en Actividades
-- FECHA: 2026-05-08
-- ================================================

-- 1. Alter actividades_diarias: columnas nuevas para kanban
ALTER TABLE public.actividades_diarias
    ADD COLUMN IF NOT EXISTS notas TEXT,
    ADD COLUMN IF NOT EXISTS completado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER;

-- 2. Nueva tabla: actividades_subtareas
CREATE TABLE IF NOT EXISTS public.actividades_subtareas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actividad_id UUID REFERENCES public.actividades_diarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    done BOOLEAN DEFAULT false,
    images JSONB DEFAULT '[]'::jsonb,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtareas_actividad ON public.actividades_subtareas(actividad_id);
CREATE INDEX IF NOT EXISTS idx_subtareas_orden ON public.actividades_subtareas(orden);

-- 3. Trigger updated_at para subtareas
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_actividades_subtareas_updated_at ON public.actividades_subtareas;
CREATE TRIGGER update_actividades_subtareas_updated_at
    BEFORE UPDATE ON public.actividades_subtareas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS para actividades_subtareas
ALTER TABLE public.actividades_subtareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_all_subtareas"
    ON public.actividades_subtareas
    FOR SELECT
    USING (true);

CREATE POLICY "allow_insert_subtareas_authenticated"
    ON public.actividades_subtareas
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "allow_update_subtareas_authenticated"
    ON public.actividades_subtareas
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "allow_delete_subtareas_authenticated"
    ON public.actividades_subtareas
    FOR DELETE
    USING (auth.uid() IS NOT NULL);
