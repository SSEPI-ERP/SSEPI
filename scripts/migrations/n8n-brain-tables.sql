-- ================================================
-- SSEPI n8n Brain — Tablas de insights y heartbeat
-- ================================================

-- Tabla de insights generados por los workflows de n8n
CREATE TABLE IF NOT EXISTS public.n8n_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  module_target TEXT,
  summary TEXT NOT NULL,
  detail TEXT,
  action_suggested TEXT,
  related_record_id UUID,
  related_table TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_n8n_insights_severity ON public.n8n_insights(severity) WHERE dismissed = false;
CREATE INDEX idx_n8n_insights_module ON public.n8n_insights(module_target) WHERE dismissed = false;
CREATE INDEX idx_n8n_insights_created_at ON public.n8n_insights(created_at DESC);

ALTER TABLE public.n8n_insights ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados leen insights
CREATE POLICY n8n_insights_read ON public.n8n_insights
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo service_role puede insertar (n8n escribe via service_role)
CREATE POLICY n8n_insights_service_insert ON public.n8n_insights
  FOR INSERT WITH CHECK (true);

-- Admin/superadmin pueden descartar insights
CREATE POLICY n8n_insights_admin_update ON public.n8n_insights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_user_id = auth.uid()
      AND users.rol IN ('admin', 'superadmin')
    )
  );

GRANT SELECT, UPDATE ON public.n8n_insights TO authenticated;
GRANT ALL ON public.n8n_insights TO service_role;

-- Tabla de heartbeat para que el frontend sepa si n8n está activo
CREATE TABLE IF NOT EXISTS public.n8n_heartbeat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'n8n',
  status TEXT NOT NULL DEFAULT 'alive',
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_n8n_heartbeat_created_at ON public.n8n_heartbeat(created_at DESC);

ALTER TABLE public.n8n_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY n8n_heartbeat_read ON public.n8n_heartbeat
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY n8n_heartbeat_service_insert ON public.n8n_heartbeat
  FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.n8n_heartbeat TO authenticated;
GRANT ALL ON public.n8n_heartbeat TO service_role;

-- Publicar ambas tablas en Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.n8n_insights;
ALTER PUBLICATION supabase_realtime ADD TABLE public.n8n_heartbeat;