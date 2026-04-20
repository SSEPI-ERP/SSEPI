-- ================================================
-- SSEPI — Fix tablas restantes (idempotente)
-- orden_historial, audit_logs created_at,
-- cotizaciones fecha_cotizacion, usuarios,
-- proyectos_automatizacion
-- ================================================

-- 1) usuarios (necesaria para FK de orden_historial)
-- IMPORTANTE: DISABLE RLS para evitar recursión infinita (la policy USUALLY causa self-reference)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT,
    email TEXT UNIQUE,
    rol TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Deshabilitar RLS: tabla de soporte, no necesita RLS (causa recursión si la policy hace SELECT sobre usuarios)
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;
-- Eliminar policies existentes que causan recursión
DROP POLICY IF EXISTS usuarios_all ON public.usuarios;
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
GRANT ALL ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;

-- 2) orden_historial
CREATE TABLE IF NOT EXISTS public.orden_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID,
    orden_taller_id UUID,
    orden_motor_id UUID,
    proyecto_id UUID,
    evento TEXT NOT NULL,
    descripcion TEXT,
    creado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.orden_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orden_historial_all ON public.orden_historial;
CREATE POLICY orden_historial_all ON public.orden_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.orden_historial TO authenticated;
GRANT ALL ON public.orden_historial TO service_role;

-- 3) proyectos_automatizacion
CREATE TABLE IF NOT EXISTS public.proyectos_automatizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio TEXT,
    nombre TEXT,
    cliente TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    vendedor TEXT,
    notas_generales TEXT,
    estado TEXT DEFAULT 'pendiente',
    producto_servicio TEXT,
    prioridad TEXT DEFAULT 'normal',
    horas_estimadas NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proyectos_automatizacion_all ON public.proyectos_automatizacion;
CREATE POLICY proyectos_automatizacion_all ON public.proyectos_automatizacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.proyectos_automatizacion TO authenticated;
GRANT ALL ON public.proyectos_automatizacion TO service_role;

-- 4) audit_logs: agregar created_at (algunas consultas usan order=created_at)
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- Copiar timestamp existente a created_at si está vacío
UPDATE public.audit_logs SET created_at = timestamp WHERE created_at IS NULL AND timestamp IS NOT NULL;

-- 5) cotizaciones: agregar fecha_cotizacion (alias para ordenamiento)
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_cotizacion TIMESTAMPTZ;
UPDATE public.cotizaciones SET fecha_cotizacion = COALESCE(fecha, fecha_creacion, created_at, NOW()) WHERE fecha_cotizacion IS NULL;

-- 6) Publicar tablas en Realtime
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_historial;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proyectos_automatizacion;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;