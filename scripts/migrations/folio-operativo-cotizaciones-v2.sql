-- =============================================================================
-- FOLIO OPERATIVO v2: soporta cotizaciones (tabla cotizaciones) además de ventas
-- Ejecutar DESPUÉS de folio-operativo-cerebro-v1.sql. Idempotente.
-- =============================================================================

-- Columna opcional: una fila referencia venta_id XOR cotizacion_id
ALTER TABLE public.ssepi_folio_operativo
  ADD COLUMN IF NOT EXISTS cotizacion_id UUID;

-- Quitar NOT NULL y UNIQUE globales sobre venta_id si existían
ALTER TABLE public.ssepi_folio_operativo DROP CONSTRAINT IF EXISTS ssepi_folio_operativo_venta_id_fkey;
ALTER TABLE public.ssepi_folio_operativo DROP CONSTRAINT IF EXISTS ssepi_folio_operativo_venta_id_key;

ALTER TABLE public.ssepi_folio_operativo
  ALTER COLUMN venta_id DROP NOT NULL;

-- Un documento por fila: exactamente uno de los dos
ALTER TABLE public.ssepi_folio_operativo DROP CONSTRAINT IF EXISTS ssepi_folio_operativo_un_documento;
ALTER TABLE public.ssepi_folio_operativo
  ADD CONSTRAINT ssepi_folio_operativo_un_documento CHECK (
    (venta_id IS NOT NULL AND cotizacion_id IS NULL)
    OR (venta_id IS NULL AND cotizacion_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_ssepi_folio_venta_id_nn
  ON public.ssepi_folio_operativo (venta_id) WHERE venta_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ssepi_folio_cotizacion_id_nn
  ON public.ssepi_folio_operativo (cotizacion_id) WHERE cotizacion_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.ventas') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssepi_folio_operativo_venta_id_fkey') THEN
      ALTER TABLE public.ssepi_folio_operativo
        ADD CONSTRAINT ssepi_folio_operativo_venta_id_fkey
        FOREIGN KEY (venta_id) REFERENCES public.ventas (id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass('public.cotizaciones') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssepi_folio_operativo_cotizacion_id_fkey') THEN
      ALTER TABLE public.ssepi_folio_operativo
        ADD CONSTRAINT ssepi_folio_operativo_cotizacion_id_fkey
        FOREIGN KEY (cotizacion_id) REFERENCES public.cotizaciones (id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.ssepi_folio_operativo.venta_id IS 'ID en public.ventas (mutuamente excluyente con cotizacion_id)';
COMMENT ON COLUMN public.ssepi_folio_operativo.cotizacion_id IS 'ID en public.cotizaciones (mutuamente excluyente con venta_id)';

-- Evento: venta_id almacena también id de cotización como "documento correlación" (histórico nombre columna)
COMMENT ON COLUMN public.ssepi_folio_evento.venta_id IS 'UUID del documento: fila ventas.id o cotizaciones.id según origen del folio';

CREATE OR REPLACE FUNCTION public._ssepi_folio_operativo_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub UUID;
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  sub := COALESCE(NEW.venta_id, NEW.cotizacion_id);
  IF TG_OP = 'UPDATE' AND (OLD.etapa IS DISTINCT FROM NEW.etapa) THEN
    INSERT INTO public.ssepi_folio_evento (venta_id, etapa_anterior, etapa_nueva, meta)
    VALUES (
      sub,
      OLD.etapa,
      NEW.etapa,
      jsonb_build_object(
        'source', 'ssepi_folio_operativo',
        'cotizacion_id', NEW.cotizacion_id,
        'venta_id', NEW.venta_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
