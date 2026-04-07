-- =============================================================================
-- Registro híbrido ERP (Supabase) ↔ COI local: historial de sincronización
-- Ejecutar en Supabase → SQL Editor (una vez).
-- El bridge Python inserta filas con SERVICE ROLE (no desde el navegador).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coi_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  erp_id TEXT NOT NULL,
  folio TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  poliza_id INTEGER,
  numero_poliza INTEGER,
  monto NUMERIC(14,2),
  error_message TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar que el source acepte todas las fuentes (tabla puede existir)
ALTER TABLE public.coi_sync_log DROP CONSTRAINT IF EXISTS coi_sync_log_source_check;
ALTER TABLE public.coi_sync_log
  ADD CONSTRAINT coi_sync_log_source_check
  CHECK (source IN ('venta', 'compra', 'nomina', 'bancos', 'factura'));

CREATE INDEX IF NOT EXISTS idx_coi_sync_log_created_at ON public.coi_sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coi_sync_log_source_erp ON public.coi_sync_log (source, erp_id);

COMMENT ON TABLE public.coi_sync_log IS 'Eventos del motor COI bridge: pólizas generadas o errores (ERP online + COI local)';

ALTER TABLE public.coi_sync_log ENABLE ROW LEVEL SECURITY;

-- Lectura: admin y contabilidad (JWT custom claim rol)
DROP POLICY IF EXISTS coi_sync_log_admin_select ON public.coi_sync_log;
CREATE POLICY coi_sync_log_admin_select ON public.coi_sync_log
  FOR SELECT USING (COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin'));
DROP POLICY IF EXISTS coi_sync_log_contabilidad_select ON public.coi_sync_log;
CREATE POLICY coi_sync_log_contabilidad_select ON public.coi_sync_log
  FOR SELECT USING (auth.jwt() ->> 'rol' = 'contabilidad');

-- Sin política INSERT/UPDATE/DELETE para authenticated: solo service_role vía API

-- Permisos explícitos para lectura autenticada (RLS aplica)
GRANT SELECT ON public.coi_sync_log TO authenticated;
GRANT ALL ON public.coi_sync_log TO service_role;

-- Opcional: permiso explícito en role_permissions (contabilidad ya tiene * read; admin bypass en JS)
INSERT INTO public.role_permissions (rol, module, action)
VALUES ('contabilidad', 'coi_sync_log', 'read')
ON CONFLICT (rol, module, action) DO NOTHING;

-- Realtime opcional (descomenta si quieres suscripción en vivo)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_log;
