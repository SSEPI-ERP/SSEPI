-- ================================================
-- SSEPI n8n — Cola de eventos (reemplaza Database Webhooks)
-- GRATIS en plan Supabase Free usando PG triggers
-- ================================================

-- Tabla cola: los triggers INSERT aquí, n8n poll desde aquí
CREATE TABLE IF NOT EXISTS public.n8n_event_queue (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_table TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'INSERT',
  record_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_n8n_event_queue_pending ON public.n8n_event_queue(status, created_at) WHERE status = 'pending';

ALTER TABLE public.n8n_event_queue ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede escribir (triggers corren como superuser, n8n usa service_role)
CREATE POLICY n8n_event_queue_service_all ON public.n8n_event_queue
  FOR ALL USING (true) WITH CHECK (true);

-- Usuarios autenticados pueden leer (para debug)
CREATE POLICY n8n_event_queue_read ON public.n8n_event_queue
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON public.n8n_event_queue TO authenticated;
GRANT ALL ON public.n8n_event_queue TO service_role;

-- ================================================
-- Función genérica que inserta en la cola
-- ================================================
CREATE OR REPLACE FUNCTION public.n8n_enqueue_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.n8n_event_queue (source_table, event_type, record_id, payload)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('new', to_jsonb(NEW), 'old', to_jsonb(OLD))
      ELSE to_jsonb(NEW)
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Adjuntar triggers a las tablas que n8n escucha
-- Cada trigger se envuelve en DO $BEGIN...EXCEPTION WHEN undefined_table$
-- para que si la tabla aún no existe, el script no falle.
-- ================================================

-- ventas: INSERT y UPDATE (para cerebro de ventas)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_ventas_queue ON public.ventas;
  CREATE TRIGGER n8n_ventas_queue
    AFTER INSERT OR UPDATE ON public.ventas
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.ventas no existe — trigger n8n_ventas_queue omitido';
END $$;

-- orden_historial: INSERT (para cross-module notifier)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_orden_historial_queue ON public.orden_historial;
  CREATE TRIGGER n8n_orden_historial_queue
    AFTER INSERT ON public.orden_historial
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.orden_historial no existe — trigger n8n_orden_historial_queue omitido';
END $$;

-- ssepi_folio_evento: INSERT (para pipeline tracker)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_folio_evento_queue ON public.ssepi_folio_evento;
  CREATE TRIGGER n8n_folio_evento_queue
    AFTER INSERT ON public.ssepi_folio_evento
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.ssepi_folio_evento no existe — trigger n8n_folio_evento_queue omitido';
END $$;

-- inbound_emails: INSERT (para email intelligence)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_inbound_emails_queue ON public.inbound_emails;
  CREATE TRIGGER n8n_inbound_emails_queue
    AFTER INSERT ON public.inbound_emails
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.inbound_emails no existe — trigger n8n_inbound_emails_queue omitido';
END $$;

-- audit_logs: INSERT (para smart audit)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_audit_logs_queue ON public.audit_logs;
  CREATE TRIGGER n8n_audit_logs_queue
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.audit_logs no existe — trigger n8n_audit_logs_queue omitido';
END $$;

-- ================================================
-- Limpieza: eliminar eventos procesados >7 días
-- El workflow poller también puede hacer esto
-- ================================================
-- Opcional con pg_cron si está disponible:
-- SELECT cron.schedule('cleanup-n8n-queue', '0 3 * * *', $$DELETE FROM public.n8n_event_queue WHERE status IN ('done','error') AND created_at < NOW() - INTERVAL '7 days'$$);