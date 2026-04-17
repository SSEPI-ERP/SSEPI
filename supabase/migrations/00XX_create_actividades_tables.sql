-- ================================================
-- MIGRACIÓN: Tablas de Actividades Automatización
-- DESCRIPCIÓN: Bitácora semanal de actividades con archivos e historial
-- ================================================

-- Tabla: actividades_diarias
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

-- Índices para actividades_diarias
CREATE INDEX IF NOT EXISTS idx_actividades_fecha ON actividades_diarias(fecha);
CREATE INDEX IF NOT EXISTS idx_actividades_user_id ON actividades_diarias(user_id);
CREATE INDEX IF NOT EXISTS idx_actividades_estado ON actividades_diarias(estado);
CREATE INDEX IF NOT EXISTS idx_actividades_created_at ON actividades_diarias(created_at);

-- Tabla: actividades_historial
CREATE TABLE IF NOT EXISTS actividades_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actividad_id UUID REFERENCES actividades_diarias(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    descripcion TEXT,
    creado_por UUID REFERENCES usuarios(id),
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para actividades_historial
CREATE INDEX IF NOT EXISTS idx_historial_actividad_id ON actividades_historial(actividad_id);
CREATE INDEX IF NOT EXISTS idx_historial_creado_en ON actividades_historial(creado_en);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

-- Activar RLS en actividades_diarias
ALTER TABLE actividades_diarias ENABLE ROW LEVEL SECURITY;

-- Política: Admin ve todo
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

-- Política: Técnicos ven solo sus actividades
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

-- Política: Técnicos pueden crear sus actividades
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

-- Política: Técnicos pueden actualizar sus actividades
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

-- Activar RLS en actividades_historial
ALTER TABLE actividades_historial ENABLE ROW LEVEL SECURITY;

-- Política: Todos los usuarios autenticados pueden ver historial
CREATE POLICY "Usuarios ven historial"
ON actividades_historial
FOR SELECT
USING (
    auth.role() = 'authenticated'
);

-- Política: Solo admin o el creador puede insertar en historial
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
-- BUCKET DE STORAGE PARA ARCHIVOS
-- ================================================

-- Crear bucket 'actividades' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('actividades', 'actividades', true)
ON CONFLICT (id) DO NOTHING;

-- Política de storage: Lectura pública
CREATE POLICY "Archivos de actividades son públicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'actividades');

-- Política de storage: Solo usuarios autenticados pueden subir
CREATE POLICY "Usuarios autenticados suben archivos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'actividades'
    AND auth.role() = 'authenticated'
);

-- Política de storage: Solo el dueño puede actualizar/eliminar
CREATE POLICY "Dueños gestionan sus archivos"
ON storage.objects FOR ALL
USING (
    bucket_id = 'actividades'
    AND auth.uid() = owner
);

-- ================================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- ================================================

-- INSERT INTO actividades_diarias (user_id, fecha, resumen, estado, creado_por)
-- VALUES
--     (SELECT id FROM usuarios WHERE rol = 'automatizacion' LIMIT 1, CURRENT_DATE, 'Revisión de PLC en línea 2', 'completado', auth.uid()),
--     (SELECT id FROM usuarios WHERE rol = 'automatizacion' LIMIT 1, CURRENT_DATE - INTERVAL '1 day', 'Programación de HMI para nuevo proyecto', 'en_progreso', auth.uid());
