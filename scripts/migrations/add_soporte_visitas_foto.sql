-- Soporte en planta: columna para guardar URL de la foto de la hoja de orden (opcional).
ALTER TABLE soporte_visitas ADD COLUMN IF NOT EXISTS foto_url TEXT;
COMMENT ON COLUMN soporte_visitas.foto_url IS 'URL de la foto de la hoja de orden (ej. Supabase Storage)';
