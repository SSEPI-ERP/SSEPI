-- =====================================================
-- FIX: Agregar FK creado_por → usuarios.id en orden_historial
-- 1. Limpiar creado_por huérfanos (set NULL donde no existe en usuarios)
-- 2. Agregar la FK
-- 3. Recargar schema cache de PostgREST
-- =====================================================

-- 1. Limpiar creado_por huérfanos
UPDATE public.orden_historial
SET creado_por = NULL
WHERE creado_por IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE usuarios.id = orden_historial.creado_por
  );

-- 2. Agregar FK si no existe
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

-- 3. Notificar a PostgREST que recargue el schema cache
NOTIFY pgrst, 'reload schema';