-- =============================================================================
-- Fix: Ventas wizard (paso 1) no puede insertar orden / proyecto.
--
-- Causa típica: tras agregar-rol-administracion.sql el bloque (7) aseguraba
-- permisos de ventas pero NO incluía create en ordenes_taller / ordenes_motores
-- / proyectos_automatizacion → hasPermission() rechaza antes de Supabase RLS.
--
-- Ejecutar UNA VEZ en Supabase SQL Editor (idempotente).
-- =============================================================================

INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  ('ventas', 'ordenes_taller',           'create'),
  ('ventas', 'ordenes_motores',          'create'),
  ('ventas', 'proyectos_automatizacion', 'create')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- RLS INSERT ventas (mismo criterio que ventas-cerebro-insert-ordenes.sql)
DO $$
BEGIN
  IF to_regclass('public.ordenes_taller') IS NULL THEN RETURN; END IF;
  EXECUTE 'DROP POLICY IF EXISTS taller_ventas_insert ON public.ordenes_taller';
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ssepi_current_rol'
  ) THEN
    EXECUTE $p$
      CREATE POLICY taller_ventas_insert ON public.ordenes_taller
        FOR INSERT TO authenticated
        WITH CHECK (public.ssepi_current_rol() = 'ventas')
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY taller_ventas_insert ON public.ordenes_taller
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') = 'ventas')
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NULL THEN RETURN; END IF;
  EXECUTE 'DROP POLICY IF EXISTS proyectos_ventas_insert ON public.proyectos_automatizacion';
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ssepi_current_rol'
  ) THEN
    EXECUTE $p$
      CREATE POLICY proyectos_ventas_insert ON public.proyectos_automatizacion
        FOR INSERT TO authenticated
        WITH CHECK (public.ssepi_current_rol() = 'ventas')
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY proyectos_ventas_insert ON public.proyectos_automatizacion
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') = 'ventas')
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ordenes_motores' AND c.relrowsecurity
  ) THEN
    RAISE NOTICE 'ordenes_motores sin RLS: permisos role_permissions bastan';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS motores_ventas_insert ON public.ordenes_motores';
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ssepi_current_rol'
  ) THEN
    EXECUTE $p$
      CREATE POLICY motores_ventas_insert ON public.ordenes_motores
        FOR INSERT TO authenticated
        WITH CHECK (public.ssepi_current_rol() = 'ventas')
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY motores_ventas_insert ON public.ordenes_motores
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') = 'ventas')
    $p$;
  END IF;
END $$;
