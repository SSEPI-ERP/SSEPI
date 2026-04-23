-- Tabla foliador_control para gestión de folios operativos
-- Usada por módulos de Ventas, Taller, Motores, Automatización

CREATE TABLE IF NOT EXISTS foliador_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL UNIQUE,
    ultimo_folio INTEGER NOT NULL DEFAULT 0,
    ultimo_folio_entero INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas por tipo
CREATE INDEX IF NOT EXISTS idx_foliador_control_tipo ON foliador_control(tipo);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_foliador_control_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_foliador_control_updated_at ON foliador_control;
CREATE TRIGGER update_foliador_control_updated_at
    BEFORE UPDATE ON foliador_control
    FOR EACH ROW
    EXECUTE FUNCTION update_foliador_control_updated_at();

-- Datos iniciales para tipos de folio
INSERT INTO foliador_control (tipo, ultimo_folio, ultimo_folio_entero) VALUES
    ('SP-T', 0, 0),
    ('SP-M', 0, 0),
    ('SP-A', 0, 0),
    ('SP-S', 0, 0),
    ('SP-E', 0, 0)
ON CONFLICT (tipo) DO NOTHING;

-- RLS Policies
ALTER TABLE foliador_control ENABLE ROW LEVEL SECURITY;

-- Policy: permitir lectura a todos los autenticados
CREATE POLICY "Usuarios autenticados pueden leer foliador_control"
    ON foliador_control
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: permitir escritura a todos los autenticados (el control de permisos se hace en aplicación)
CREATE POLICY "Usuarios autenticados pueden escribir en foliador_control"
    ON foliador_control
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
