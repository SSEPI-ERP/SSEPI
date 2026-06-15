-- =====================================================
-- SSEPI — Sistema de Alarmas
-- Tabla + RLS + Realtime + grants
-- Fecha: 2026-06-15
-- =====================================================

-- 1) alarmas
CREATE TABLE IF NOT EXISTS public.alarmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'manual',
    'cotizacion_vencida',
    'factura_vencida',
    'vacacion_proxima',
    'sla_actividad',
    'custom'
  )),
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','critica')),
  para_modulo TEXT,         -- 'ventas','compras','taller',etc. NULL = broadcast a todos
  para_usuario UUID,        -- opcional: si está presente, solo ese user (auth.users)
  disparar_at TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','disparada','cancelada')),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  disparada_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alarmas_estado_disparar ON public.alarmas(estado, disparar_at);
CREATE INDEX IF NOT EXISTS idx_alarmas_para_modulo ON public.alarmas(para_modulo, estado);
CREATE INDEX IF NOT EXISTS idx_alarmas_metadata_key ON public.alarmas((metadata->>'key'));

ALTER TABLE public.alarmas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alarmas_select ON public.alarmas;
DROP POLICY IF EXISTS alarmas_insert ON public.alarmas;
DROP POLICY IF EXISTS alarmas_update ON public.alarmas;
DROP POLICY IF EXISTS alarmas_delete ON public.alarmas;
CREATE POLICY alarmas_select ON public.alarmas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY alarmas_insert ON public.alarmas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY alarmas_update ON public.alarmas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY alarmas_delete ON public.alarmas
  FOR DELETE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alarmas TO authenticated;
GRANT ALL ON public.alarmas TO service_role;

-- Realtime: añade la tabla a la publicación para que el panel reciba
-- inserciones/actualizaciones en vivo.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alarmas;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'alarmas ya en supabase_realtime';
END $$;

-- =====================================================
-- Función RPC upsert_alarma_template
-- Idempotente: si ya existe una alarma del mismo tipo con estado='pendiente'
-- y metadata.key = p_tipo, la actualiza. Si no, la inserta.
-- Usada por el workflow n8n 10-alarmas-templates-checker.
-- =====================================================
CREATE OR REPLACE FUNCTION public.upsert_alarma_template(
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensaje TEXT,
  p_para_modulo TEXT,
  p_count INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_metadata JSONB;
BEGIN
  v_metadata := jsonb_build_object('key', p_tipo, 'count', p_count, 'source', 'template-checker');

  -- Si p_count = 0, no crear alarma
  IF p_count IS NULL OR p_count <= 0 THEN
    -- Si existía pendiente de este tipo, la cancelamos
    UPDATE public.alarmas
       SET estado = 'cancelada'
     WHERE metadata->>'key' = p_tipo
       AND estado = 'pendiente';
    RETURN NULL;
  END IF;

  -- Buscar alarma pendiente existente de este template
  SELECT id INTO v_id
    FROM public.alarmas
   WHERE metadata->>'key' = p_tipo
     AND estado = 'pendiente'
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Actualizar contador y mensaje
    UPDATE public.alarmas
       SET titulo = p_titulo,
           mensaje = p_mensaje,
           metadata = metadata || v_metadata
     WHERE id = v_id;
    RETURN v_id;
  ELSE
    -- Crear nueva
    INSERT INTO public.alarmas (titulo, mensaje, tipo, prioridad, para_modulo, disparar_at, metadata)
    VALUES (p_titulo, p_mensaje, p_tipo, 'media', p_para_modulo, NOW(), v_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_alarma_template(TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
