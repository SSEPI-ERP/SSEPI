-- =====================================================
-- cloud-fix-rls.sql
-- Crea tablas de actividades faltantes, agrega auth_user_id
-- a tablas operacionales, y configura RLS en Supabase cloud.
-- Ejecutar con: node run-cloud-sql.mjs cloud-fix-rls.sql
-- =====================================================

-- -----------------------------------------------------
-- 1. TABLAS DE ACTIVIDADES (faltaban en cloud)
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.actividades_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    resumen TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completado', 'revisado')),
    archivo_url TEXT,
    archivo_tipo TEXT,
    creado_por UUID REFERENCES public.users(auth_user_id),
    departamento TEXT DEFAULT 'automatizacion',
    orden_origen_id UUID,
    orden_origen_tipo TEXT,
    notas TEXT,
    completado_en TIMESTAMPTZ,
    duracion_minutos INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.actividades_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actividad_id UUID REFERENCES public.actividades_diarias(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    descripcion TEXT,
    creado_por UUID REFERENCES public.users(auth_user_id),
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.actividades_subtareas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actividad_id UUID REFERENCES public.actividades_diarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    done BOOLEAN DEFAULT false,
    images JSONB DEFAULT '[]'::jsonb,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (orden_id, orden_tipo)
);

-- Agregar auth_user_id a tablas de actividades (idempotente)
ALTER TABLE public.actividades_diarias ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.actividades_historial ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.actividades_subtareas ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.actividades_seguimiento ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();

-- Indices actividades
CREATE INDEX IF NOT EXISTS idx_actividades_fecha ON public.actividades_diarias(fecha);
CREATE INDEX IF NOT EXISTS idx_actividades_user_id ON public.actividades_diarias(user_id);
CREATE INDEX IF NOT EXISTS idx_actividades_estado ON public.actividades_diarias(estado);
CREATE INDEX IF NOT EXISTS idx_actividades_created_at ON public.actividades_diarias(created_at);
CREATE INDEX IF NOT EXISTS idx_actividades_departamento ON public.actividades_diarias(departamento);
CREATE INDEX IF NOT EXISTS idx_actividades_orden_origen ON public.actividades_diarias(orden_origen_id);
CREATE INDEX IF NOT EXISTS idx_historial_actividad_id ON public.actividades_historial(actividad_id);
CREATE INDEX IF NOT EXISTS idx_historial_creado_en ON public.actividades_historial(creado_en);
CREATE INDEX IF NOT EXISTS idx_subtareas_actividad ON public.actividades_subtareas(actividad_id);
CREATE INDEX IF NOT EXISTS idx_subtareas_orden ON public.actividades_subtareas(orden);
CREATE INDEX IF NOT EXISTS idx_seguimiento_orden ON public.actividades_seguimiento(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_seguimiento_departamento ON public.actividades_seguimiento(departamento);

-- Funciones y triggers para seguimiento
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_actividades_subtareas_updated_at ON public.actividades_subtareas;
CREATE TRIGGER update_actividades_subtareas_updated_at
    BEFORE UPDATE ON public.actividades_subtareas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

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
        updated_at = NOW();
END;
$$ language 'plpgsql';

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

-- -----------------------------------------------------
-- 2. AGREGAR auth_user_id A TABLAS OPERACIONALES
-- -----------------------------------------------------

ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.catalogo_servicios ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.movimientos_inventario ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.bom_automatizacion ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(auth_user_id) DEFAULT auth.uid();

-- -----------------------------------------------------
-- 3. POBLAR auth_user_id EN DATOS MIGRADOS (SIN OWNER CONOCIDO)
--     Se asigna al superadmin para protegerlos de modificaciones accidentales.
--     Deshabilitamos todos los triggers en tablas operacionales durante el update
--     para evitar errores de triggers legacy que asumen columnas/estados.
-- -----------------------------------------------------

ALTER TABLE public.contactos DISABLE TRIGGER USER;
ALTER TABLE public.inventario DISABLE TRIGGER USER;
ALTER TABLE public.catalogo_servicios DISABLE TRIGGER USER;
ALTER TABLE public.movimientos_inventario DISABLE TRIGGER USER;
ALTER TABLE public.compras DISABLE TRIGGER USER;
ALTER TABLE public.ventas DISABLE TRIGGER USER;
ALTER TABLE public.cotizaciones DISABLE TRIGGER USER;
ALTER TABLE public.ordenes_taller DISABLE TRIGGER USER;
ALTER TABLE public.ordenes_motores DISABLE TRIGGER USER;
ALTER TABLE public.proyectos_automatizacion DISABLE TRIGGER USER;
ALTER TABLE public.bom_automatizacion DISABLE TRIGGER USER;
ALTER TABLE public.facturas DISABLE TRIGGER USER;

UPDATE public.contactos SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.inventario SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.catalogo_servicios SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.movimientos_inventario SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.compras SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.ventas SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.cotizaciones SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.ordenes_taller SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.ordenes_motores SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.proyectos_automatizacion SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.bom_automatizacion SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.facturas SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;

-- Poblar auth_user_id en actividades (tablas nuevas, sin filas de momento)
UPDATE public.actividades_diarias SET auth_user_id = COALESCE(user_id, '65a2920c-bb4a-4b64-9e31-ccd47545120d') WHERE auth_user_id IS NULL;
UPDATE public.actividades_historial SET auth_user_id = COALESCE(creado_por, '65a2920c-bb4a-4b64-9e31-ccd47545120d') WHERE auth_user_id IS NULL;
UPDATE public.actividades_subtareas SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;
UPDATE public.actividades_seguimiento SET auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d' WHERE auth_user_id IS NULL;

-- Rehabilitar todos los triggers
ALTER TABLE public.contactos ENABLE TRIGGER USER;
ALTER TABLE public.inventario ENABLE TRIGGER USER;
ALTER TABLE public.catalogo_servicios ENABLE TRIGGER USER;
ALTER TABLE public.movimientos_inventario ENABLE TRIGGER USER;
ALTER TABLE public.compras ENABLE TRIGGER USER;
ALTER TABLE public.ventas ENABLE TRIGGER USER;
ALTER TABLE public.cotizaciones ENABLE TRIGGER USER;
ALTER TABLE public.ordenes_taller ENABLE TRIGGER USER;
ALTER TABLE public.ordenes_motores ENABLE TRIGGER USER;
ALTER TABLE public.proyectos_automatizacion ENABLE TRIGGER USER;
ALTER TABLE public.bom_automatizacion ENABLE TRIGGER USER;
ALTER TABLE public.facturas ENABLE TRIGGER USER;

-- -----------------------------------------------------
-- 4. HABILITAR RLS Y CREAR POLITICAS
--    Patron: anon bloqueado, auth puede leer todo,
--    solo admin o el dueno pueden modificar/borrar.
-- -----------------------------------------------------

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'contactos', 'inventario', 'catalogo_servicios', 'movimientos_inventario',
        'compras', 'ventas', 'cotizaciones', 'ordenes_taller', 'ordenes_motores',
        'proyectos_automatizacion', 'bom_automatizacion', 'facturas',
        'actividades_diarias', 'actividades_historial', 'actividades_subtareas', 'actividades_seguimiento'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

        EXECUTE format(
            'DROP POLICY IF EXISTS "anon_no_access_%s" ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "anon_no_access_%s" ON public.%I FOR ALL USING (false);',
            t, t
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS "auth_select_all_%s" ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_select_all_%s" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'');',
            t, t
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS "auth_insert_%s" ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_insert_%s" ON public.%I FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);',
            t, t
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS "auth_update_%s" ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_update_%s" ON public.%I FOR UPDATE USING (
                auth_user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.usuarios
                    WHERE id = auth.uid()
                    AND rol IN (''superadmin'', ''admin'', ''contabilidad'')
                )
            );',
            t, t
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS "auth_delete_%s" ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE POLICY "auth_delete_%s" ON public.%I FOR DELETE USING (
                auth_user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.usuarios
                    WHERE id = auth.uid()
                    AND rol IN (''superadmin'', ''admin'')
                )
            );',
            t, t
        );
    END LOOP;
END $$;

-- -----------------------------------------------------
-- 5. NOTIFICAR RECARGA DE SCHEMA A POSTGREST
-- -----------------------------------------------------
NOTIFY pgrst, 'reload schema';
