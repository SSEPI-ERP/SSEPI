-- =============================================================================
-- FOLIO OPERATIVO + LOG DE TRANSICIONES (v1 — base para el "cerebro" comercial)
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Objetivo:
--   - Un registro por venta/cotización (venta_id) con rama del diagrama y etapa.
--   - JSON para snapshot de disponibilidad/costeo en cotización (UI lo rellenará).
--   - Historial append-only de cambios de etapa (auditoría / realtime).
--
-- NO define nuevos roles: usa public.ssepi_current_rol() (ver contabilidad-supabase-fix
-- o rls-use-current-rol.sql). Ajusta políticas si tu matriz de permisos cambia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabla principal: estado operativo del folio (lado servidor)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ssepi_folio_operativo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL,
  -- Rama del embudo (diagrama: Motores/Taller vs Proyectos)
  ramo TEXT CHECK (ramo IS NULL OR ramo IN ('taller_motores', 'proyectos')),
  -- Etapa macro alineada al proceso que describió el negocio (extensible)
  etapa TEXT NOT NULL DEFAULT 'cotizacion' CHECK (etapa IN (
    'cotizacion',
    'pedido_pendiente',
    'abastecimiento',
    'ejecucion',
    'listo_entrega',
    'facturado_timbrado',
    'finalizado'
  )),
  -- Sub-etiquetas libres: p.ej. { "almacen": "apartado_temporal", "compras_oc_id": "..." }
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot al guardar/recalcular cotización: existencias, faltantes, costo, margen (lo llena el ERP)
  ultima_evaluacion_cotizacion JSONB NOT NULL DEFAULT '{}'::jsonb,
  cliente_confirmado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID DEFAULT auth.uid(),
  UNIQUE (venta_id)
);

CREATE INDEX IF NOT EXISTS idx_ssepi_folio_operativo_etapa ON public.ssepi_folio_operativo (etapa);
CREATE INDEX IF NOT EXISTS idx_ssepi_folio_operativo_ramo ON public.ssepi_folio_operativo (ramo);

COMMENT ON TABLE public.ssepi_folio_operativo IS 'Estado operativo del folio (diagrama Ventas→Almacén→…→Factura); una fila por venta_id';
COMMENT ON COLUMN public.ssepi_folio_operativo.ultima_evaluacion_cotizacion IS 'Snapshot cerebro cotización: stock/costo por línea; la web actualiza vía RLS';

-- FK solo si existe ventas(id) UUID
DO $$
BEGIN
  IF to_regclass('public.ventas') IS NULL THEN
    RAISE NOTICE 'ssepi_folio_operativo: public.ventas no existe, FK omitida';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ventas' AND column_name = 'id'
      AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE 'ssepi_folio_operativo: ventas.id no es uuid, FK omitida — revisar manualmente';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ssepi_folio_operativo_venta_id_fkey'
  ) THEN
    ALTER TABLE public.ssepi_folio_operativo
      ADD CONSTRAINT ssepi_folio_operativo_venta_id_fkey
      FOREIGN KEY (venta_id) REFERENCES public.ventas (id) ON DELETE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Log de transiciones (propagación / auditoría)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ssepi_folio_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL,
  etapa_anterior TEXT,
  etapa_nueva TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_ssepi_folio_evento_venta ON public.ssepi_folio_evento (venta_id, created_at DESC);

COMMENT ON TABLE public.ssepi_folio_evento IS 'Historial de cambios de etapa del folio; suscribirse por Realtime para multi-perfil';

-- -----------------------------------------------------------------------------
-- 3) Matriz mínima de transiciones válidas (extender después)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ssepi_folio_transicion_permitida(p_de TEXT, p_a TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_de IS NOT DISTINCT FROM p_a
    OR (p_de, p_a) IN (
      ('cotizacion', 'pedido_pendiente'),
      ('pedido_pendiente', 'abastecimiento'),
      ('abastecimiento', 'ejecucion'),
      ('ejecucion', 'listo_entrega'),
      ('listo_entrega', 'facturado_timbrado'),
      ('facturado_timbrado', 'finalizado'),
      -- Reaperturas controladas (admin vía app; validar en políticas si hace falta)
      ('pedido_pendiente', 'cotizacion'),
      ('abastecimiento', 'pedido_pendiente'),
      ('ejecucion', 'abastecimiento'),
      ('listo_entrega', 'ejecucion')
    );
$$;

-- -----------------------------------------------------------------------------
-- 4) Trigger: updated_at + evento en cambio de etapa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ssepi_folio_operativo_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' AND (OLD.etapa IS DISTINCT FROM NEW.etapa) THEN
    INSERT INTO public.ssepi_folio_evento (venta_id, etapa_anterior, etapa_nueva, meta)
    VALUES (NEW.venta_id, OLD.etapa, NEW.etapa, jsonb_build_object('source', 'ssepi_folio_operativo'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ssepi_folio_operativo_touch ON public.ssepi_folio_operativo;
CREATE TRIGGER tr_ssepi_folio_operativo_touch
  BEFORE UPDATE ON public.ssepi_folio_operativo
  FOR EACH ROW
  EXECUTE FUNCTION public._ssepi_folio_operativo_touch();

-- -----------------------------------------------------------------------------
-- 5) RLS (roles existentes del ERP; sin definir perfiles nuevos)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ssepi_folio_operativo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssepi_folio_evento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ssepi_folio_operativo_admin_all ON public.ssepi_folio_operativo;
CREATE POLICY ssepi_folio_operativo_admin_all ON public.ssepi_folio_operativo
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin', 'superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS ssepi_folio_operativo_team_rw ON public.ssepi_folio_operativo;
CREATE POLICY ssepi_folio_operativo_team_rw ON public.ssepi_folio_operativo
  FOR ALL TO authenticated
  USING (
    public.ssepi_current_rol() IN (
      'ventas', 'ventas_sin_compras', 'compras', 'taller', 'motores',
      'automatizacion', 'contabilidad', 'facturacion', 'inventario'
    )
  )
  WITH CHECK (
    public.ssepi_current_rol() IN (
      'ventas', 'ventas_sin_compras', 'compras', 'taller', 'motores',
      'automatizacion', 'contabilidad', 'facturacion', 'inventario'
    )
  );

DROP POLICY IF EXISTS ssepi_folio_evento_select_team ON public.ssepi_folio_evento;
CREATE POLICY ssepi_folio_evento_select_team ON public.ssepi_folio_evento
  FOR SELECT TO authenticated
  USING (
    public.ssepi_current_rol() IN (
      'admin', 'superadmin', 'ventas', 'ventas_sin_compras', 'compras', 'taller', 'motores',
      'automatizacion', 'contabilidad', 'facturacion', 'inventario'
    )
  );

DROP POLICY IF EXISTS ssepi_folio_evento_insert_team ON public.ssepi_folio_evento;
CREATE POLICY ssepi_folio_evento_insert_team ON public.ssepi_folio_evento
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.ssepi_current_rol() IN (
      'admin', 'superadmin', 'ventas', 'ventas_sin_compras', 'compras', 'taller', 'motores',
      'automatizacion', 'contabilidad', 'facturacion', 'inventario'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssepi_folio_operativo TO authenticated;
GRANT SELECT, INSERT ON public.ssepi_folio_evento TO authenticated;
