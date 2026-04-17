-- ================================================
-- MIGRACIÓN: Fix idempotente para Actividades Automatización
-- DESCRIPCIÓN: Crea tablas y políticas solo si no existen
-- ================================================

-- ================================================
-- 1. TABLA: actividades_diarias
-- ================================================
CREATE TABLE IF NOT EXISTS actividades_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    resumen TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completado', 'revisado')),
    archivo_url TEXT,
    archivo_tipo TEXT,
    creado_por UUID REFERENCES usuarios(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices (solo si no existen)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_actividades_fecha') THEN
        CREATE INDEX idx_actividades_fecha ON actividades_diarias(fecha);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_actividades_user_id') THEN
        CREATE INDEX idx_actividades_user_id ON actividades_diarias(user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_actividades_estado') THEN
        CREATE INDEX idx_actividades_estado ON actividades_diarias(estado);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_actividades_created_at') THEN
        CREATE INDEX idx_actividades_created_at ON actividades_diarias(created_at);
    END IF;
END $$;

-- Activar RLS
ALTER TABLE actividades_diarias ENABLE ROW LEVEL SECURITY;

-- ================================================
-- 2. TABLA: actividades_historial
-- ================================================
CREATE TABLE IF NOT EXISTS actividades_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actividad_id UUID REFERENCES actividades_diarias(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    descripcion TEXT,
    creado_por UUID REFERENCES usuarios(id),
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Índices historial
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_historial_actividad_id') THEN
        CREATE INDEX idx_historial_actividad_id ON actividades_historial(actividad_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_historial_creado_en') THEN
        CREATE INDEX idx_historial_creado_en ON actividades_historial(creado_en);
    END IF;
END $$;

-- Activar RLS
ALTER TABLE actividades_historial ENABLE ROW LEVEL SECURITY;

-- ================================================
-- 3. POLÍTICAS RLS - actividades_diarias
-- ================================================

-- Política Admin (reemplazar si existe)
DROP POLICY IF EXISTS "Admin ve todas las actividades" ON actividades_diarias;
CREATE POLICY "Admin ve todas las actividades"
ON actividades_diarias
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin', 'contabilidad')
    )
);

-- Política Técnicos SELECT
DROP POLICY IF EXISTS "Técnicos ven sus actividades" ON actividades_diarias;
CREATE POLICY "Técnicos ven sus actividades"
ON actividades_diarias
FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin', 'automatizacion')
    )
);

-- Política Técnicos INSERT
DROP POLICY IF EXISTS "Técnicos crean sus actividades" ON actividades_diarias;
CREATE POLICY "Técnicos crean sus actividades"
ON actividades_diarias
FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin', 'automatizacion')
    )
);

-- Política Técnicos UPDATE
DROP POLICY IF EXISTS "Técnicos actualizan sus actividades" ON actividades_diarias;
CREATE POLICY "Técnicos actualizan sus actividades"
ON actividades_diarias
FOR UPDATE
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin', 'automatizacion')
    )
);

-- ================================================
-- 4. POLÍTICAS RLS - actividades_historial
-- ================================================

-- Política SELECT historial
DROP POLICY IF EXISTS "Usuarios ven historial" ON actividades_historial;
CREATE POLICY "Usuarios ven historial"
ON actividades_historial
FOR SELECT
USING (
    auth.role() = 'authenticated'
);

-- Política INSERT historial
DROP POLICY IF EXISTS "Inserción en historial" ON actividades_historial;
CREATE POLICY "Inserción en historial"
ON actividades_historial
FOR INSERT
WITH CHECK (
    creado_por = auth.uid()
    OR EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin', 'automatizacion')
    )
);

-- ================================================
-- 5. BUCKET STORAGE: actividades
-- ================================================

-- Crear bucket si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('actividades', 'actividades', true)
ON CONFLICT (id) DO NOTHING;

-- Política SELECT storage
DROP POLICY IF EXISTS "Archivos de actividades son públicos" ON storage.objects;
CREATE POLICY "Archivos de actividades son públicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'actividades');

-- Política INSERT storage
DROP POLICY IF EXISTS "Usuarios autenticados suben archivos" ON storage.objects;
CREATE POLICY "Usuarios autenticados suben archivos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'actividades'
    AND auth.role() = 'authenticated'
);

-- Política ALL storage (dueños)
DROP POLICY IF EXISTS "Dueños gestionan sus archivos" ON storage.objects;
CREATE POLICY "Dueños gestionan sus archivos"
ON storage.objects FOR ALL
USING (
    bucket_id = 'actividades'
    AND auth.uid() = owner
);
