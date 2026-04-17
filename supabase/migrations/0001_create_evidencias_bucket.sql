-- ================================================
-- MIGRACIÓN: Bucket de Evidencias para SSEPI-NEXT
-- DESCRIPCIÓN: Storage para capturas de reparaciones/migraciones
-- ================================================

-- 1. Crear bucket 'evidencias' (público para lectura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidencias',
    'evidencias',
    true,
    52428800, -- 50MB límite por archivo
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Política: Lectura pública (cualquiera puede ver evidencias)
CREATE POLICY "Evidencias son públicas para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'evidencias');

-- 3. Política: Usuarios autenticados pueden subir
CREATE POLICY "Usuarios autenticados suben evidencias"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'evidencias'
    AND auth.role() = 'authenticated'
);

-- 4. Política: Dueños pueden actualizar/eliminar sus archivos
CREATE POLICY "Dueños gestionan sus evidencias"
ON storage.objects FOR ALL
USING (
    bucket_id = 'evidencias'
    AND auth.uid() = owner
);

-- ================================================
-- TABLA: migraciones_pendientes (para flujo SSEPI-NEXT)
-- ================================================

CREATE TABLE IF NOT EXISTS migraciones_pendientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio TEXT,
    datos_extraidos JSONB DEFAULT '{}',
    captura1_url TEXT,
    captura2_url TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'revisado', 'aprobado', 'rechazado')),
    revisado_por UUID REFERENCES usuarios(id),
    revisado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migraciones_folio ON migraciones_pendientes(folio);
CREATE INDEX IF NOT EXISTS idx_migraciones_estado ON migraciones_pendientes(estado);
CREATE INDEX IF NOT EXISTS idx_migraciones_creado_en ON migraciones_pendientes(creado_en);

-- RLS para migraciones_pendientes
ALTER TABLE migraciones_pendientes ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
CREATE POLICY "Admin ve migraciones"
ON migraciones_pendientes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin')
    )
);

-- Usuarios autenticados pueden crear
CREATE POLICY "Crear migraciones"
ON migraciones_pendientes FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Solo admin puede actualizar estado
CREATE POLICY "Admin actualiza migraciones"
ON migraciones_pendientes FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM usuarios
        WHERE usuarios.id = auth.uid()
        AND usuarios.rol IN ('admin', 'superadmin')
    )
);
