-- =====================================================
-- FIX: Agregar columnas faltantes en orden_historial
-- Problema: La tabla no tiene cotizacion_id ni creado_en
-- El JS espera: cotizacion_id, creado_en (con orden DESC)
-- La BD tiene: created_at en vez de creado_en
-- =====================================================

-- 1. Agregar cotizacion_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'cotizacion_id'
  ) THEN
    ALTER TABLE public.orden_historial
      ADD COLUMN cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Renombrar created_at → creado_en si aplica
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'creado_en'
  ) THEN
    ALTER TABLE public.orden_historial
      RENAME COLUMN created_at TO creado_en;
  END IF;
END $$;

-- 3. Agregar FK creado_por → usuarios.id (limpia huérfanos primero)
UPDATE public.orden_historial
SET creado_por = NULL
WHERE creado_por IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE usuarios.id = orden_historial.creado_por
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orden_historial_creado_por_fkey'
      AND conrelid = 'public.orden_historial'::regclass
  ) THEN
    ALTER TABLE public.orden_historial
      ADD CONSTRAINT orden_historial_creado_por_fkey
      FOREIGN KEY (creado_por)
      REFERENCES public.usuarios(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_orden_historial_cotizacion ON public.orden_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_creado_en ON public.orden_historial(creado_en DESC);

-- 5. Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';