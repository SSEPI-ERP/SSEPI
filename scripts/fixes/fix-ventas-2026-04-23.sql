-- =====================================================
-- FIX VENTAS: 2026-04-23
-- Problemas reportados:
-- 1. Error 409 Conflict al crear órdenes
-- 2. Error FK en orden_historial (creado_por no existe en usuarios)
-- 3. Orden de compra no importa departamento/componentes
-- =====================================================

-- 1. FIX: Tabla orden_historial - verificar estructura
-- Esta tabla debe tener: cotizacion_id, orden_taller_id, orden_motor_id, proyecto_id, evento, descripcion, metadata, creado_por, creado_en

-- Verificar si existe la tabla
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orden_historial') THEN
    RAISE NOTICE 'Tabla orden_historial no existe - ejecutar migracion crear-orden-historial.sql';
  END IF;
END $$;

-- 2. FIX: FK creado_por -> usuarios.id (ya existe en fix-orden-historial-fk.sql)
-- Limpiar creado_por huérfanos
UPDATE public.orden_historial
SET creado_por = NULL
WHERE creado_por IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE usuarios.id = orden_historial.creado_por
  );

-- Agregar FK si no existe
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

-- 3. FIX: Columnas faltantes en orden_historial
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'cotizacion_id'
  ) THEN
    ALTER TABLE public.orden_historial
      ADD COLUMN cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'creado_en'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orden_historial' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.orden_historial
      RENAME COLUMN created_at TO creado_en;
  END IF;
END $$;

-- 4. Índices necesarios
CREATE INDEX IF NOT EXISTS idx_orden_historial_cotizacion ON public.orden_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_creado_en ON public.orden_historial(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_orden_historial_evento ON public.orden_historial(evento);

-- 5. Verificar columnas en cotizaciones para orden de compra
DO $$
DECLARE
  missing_cols TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Verificar columna departamento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cotizaciones' AND column_name = 'departamento'
  ) THEN
    missing_cols := array_append(missing_cols, 'departamento');
  END IF;

  -- Verificar columna actividades
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cotizaciones' AND column_name = 'actividades'
  ) THEN
    missing_cols := array_append(missing_cols, 'actividades');
  END IF;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE NOTICE 'Columnas faltantes en cotizaciones: %', missing_cols;
    -- Agregar columna departamento
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cotizaciones' AND column_name = 'departamento'
    ) THEN
      ALTER TABLE public.cotizaciones ADD COLUMN departamento TEXT;
    END IF;

    -- Agregar columna actividades (JSONB)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cotizaciones' AND column_name = 'actividades'
    ) THEN
      ALTER TABLE public.cotizaciones ADD COLUMN actividades JSONB;
    END IF;
  END IF;
END $$;

-- 6. Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- NOTA: El código JS ya fue actualizado para:
-- 1. Usar authService.getCurrentProfile().usuarios_id en lugar de .id
-- 2. Manejar errores 409 con fallback de búsqueda
-- 3. Usar departamento real de la cotización al crear orden de compra
-- =====================================================
