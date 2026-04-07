-- =============================================================================
-- Cola híbrida ERP (Supabase) ↔ COI local: trabajos pendientes para el bridge
-- Ejecutar en Supabase → SQL Editor (una vez).
--
-- Objetivo:
--  - Web (authenticated) inserta trabajos "pending" a coi_sync_queue (sin service key).
--  - Bridge (service_role) consume, marca status y registra resultados en coi_sync_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coi_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL DEFAULT auth.uid(),

  erp_source TEXT NOT NULL CHECK (erp_source IN ('venta', 'compra', 'nomina', 'bancos', 'factura')),
  erp_id TEXT NOT NULL,
  folio TEXT,

  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  idempotency_key TEXT NOT NULL,
  last_error TEXT,
  processed_at TIMESTAMPTZ
);

-- Evita duplicados por evento lógico
CREATE UNIQUE INDEX IF NOT EXISTS ux_coi_sync_queue_idempotency_key ON public.coi_sync_queue (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_coi_sync_queue_status_created_at ON public.coi_sync_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coi_sync_queue_source_erp ON public.coi_sync_queue (erp_source, erp_id);

COMMENT ON TABLE public.coi_sync_queue IS 'Cola de trabajos para COI bridge: la web encola, el bridge (service_role) procesa';

ALTER TABLE public.coi_sync_queue ENABLE ROW LEVEL SECURITY;

-- Lectura: admin / superadmin / contabilidad
DROP POLICY IF EXISTS coi_sync_queue_admin_select ON public.coi_sync_queue;
CREATE POLICY coi_sync_queue_admin_select ON public.coi_sync_queue
  FOR SELECT USING (COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS coi_sync_queue_contabilidad_select ON public.coi_sync_queue;
CREATE POLICY coi_sync_queue_contabilidad_select ON public.coi_sync_queue
  FOR SELECT USING (auth.jwt() ->> 'rol' = 'contabilidad');

-- Inserción desde la web (authenticated) para roles permitidos
DROP POLICY IF EXISTS coi_sync_queue_insert_roles ON public.coi_sync_queue;
CREATE POLICY coi_sync_queue_insert_roles ON public.coi_sync_queue
  FOR INSERT
  WITH CHECK (
    COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin', 'contabilidad')
    AND created_by = auth.uid()
    AND status = 'pending'
  );

-- Actualización desde la web: solo para corregir payload mientras sigue pending (sin tocar status)
DROP POLICY IF EXISTS coi_sync_queue_update_payload_pending ON public.coi_sync_queue;
CREATE POLICY coi_sync_queue_update_payload_pending ON public.coi_sync_queue
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin', 'contabilidad')
    AND created_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin', 'contabilidad')
    AND created_by = auth.uid()
    AND status = 'pending'
  );

GRANT SELECT, INSERT, UPDATE ON public.coi_sync_queue TO authenticated;
GRANT ALL ON public.coi_sync_queue TO service_role;

-- Opcional: permiso explícito en role_permissions
INSERT INTO public.role_permissions (rol, module, action)
VALUES ('contabilidad', 'coi_sync_queue', 'read')
ON CONFLICT (rol, module, action) DO NOTHING;

INSERT INTO public.role_permissions (rol, module, action)
VALUES ('contabilidad', 'coi_sync_queue', 'create')
ON CONFLICT (rol, module, action) DO NOTHING;

-- =============================================================================
-- Heartbeat de conexión (bridge): escritura solo por service_role
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coi_connection_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL,
  user_id UUID,
  app_version TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_coi_connection_state_machine_user ON public.coi_connection_state (machine_id, user_id);
CREATE INDEX IF NOT EXISTS idx_coi_connection_state_last_seen ON public.coi_connection_state (last_seen DESC);

COMMENT ON TABLE public.coi_connection_state IS 'Heartbeat del COI bridge por equipo/usuario (escritura: service_role)';

ALTER TABLE public.coi_connection_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coi_connection_state_admin_select ON public.coi_connection_state;
CREATE POLICY coi_connection_state_admin_select ON public.coi_connection_state
  FOR SELECT USING (COALESCE(auth.jwt() ->> 'rol', '') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS coi_connection_state_contabilidad_select ON public.coi_connection_state;
CREATE POLICY coi_connection_state_contabilidad_select ON public.coi_connection_state
  FOR SELECT USING (auth.jwt() ->> 'rol' = 'contabilidad');

GRANT SELECT ON public.coi_connection_state TO authenticated;
GRANT ALL ON public.coi_connection_state TO service_role;

-- Realtime opcional (descomenta si quieres suscripción en vivo)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_queue;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_connection_state;

