-- Registro "cerebro" en cotizaciones (paso 1 ventas: falla, prioridad, departamento, orden)
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS cerebro_registro JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cotizaciones.cerebro_registro IS 'Paso 1 ventas: fecha_ingreso, falla_reportada, prioridad, departamento, orden_id, tipo_vinculo';
