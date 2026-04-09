-- =============================================================================
-- audit_logs: columna table_name (error PostgREST: column does not exist)
-- Ejecutar en Supabase SQL Editor si la tabla existe sin table_name.
-- =============================================================================

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT;

UPDATE public.audit_logs
SET table_name = 'sistema'
WHERE table_name IS NULL OR trim(COALESCE(table_name, '')) = '';

COMMENT ON COLUMN public.audit_logs.table_name IS 'Tabla origen del evento (p. ej. facturas, pagos_nomina).';
