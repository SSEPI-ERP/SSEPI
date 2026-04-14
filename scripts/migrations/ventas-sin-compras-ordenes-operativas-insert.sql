-- =============================================================================
-- Ventas sin compras: permitir alta de órdenes/proyectos desde el cerebro (paso 1)
-- igual que rol ventas, sin abrir el módulo Compras.
--
-- Problema típico:
-- - role_permissions solo tenía ('ventas_sin_compras','ordenes_taller','read')
--   → hasPermission('ordenes_taller','create') falla en el front.
-- - RLS taller_ventas_insert / motores_ventas_insert / proyectos_ventas_insert
--   a veces solo acepta jwt/ssepi_current_rol() = 'ventas'
--   → tras arreglar role_permissions, Supabase rechaza el INSERT.
--
-- Ejecutar UNA VEZ en Supabase SQL Editor (idempotente).
-- =============================================================================

INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  ('ventas_sin_compras', 'ordenes_taller',           'create'),
  ('ventas_sin_compras', 'ordenes_motores',          'create'),
  ('ventas_sin_compras', 'proyectos_automatizacion', 'create')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- RLS INSERT: ordenes_taller
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
        WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'))
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY taller_ventas_insert ON public.ordenes_taller
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') IN ('ventas', 'ventas_sin_compras'))
    $p$;
  END IF;
END $$;

-- RLS INSERT: proyectos_automatizacion
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
        WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'))
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY proyectos_ventas_insert ON public.proyectos_automatizacion
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') IN ('ventas', 'ventas_sin_compras'))
    $p$;
  END IF;
END $$;

-- RLS INSERT: ordenes_motores (solo si la tabla existe y tiene RLS)
DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ordenes_motores' AND c.relrowsecurity
  ) THEN
    RAISE NOTICE 'ordenes_motores sin RLS: role_permissions basta';
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
        WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'))
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY motores_ventas_insert ON public.ordenes_motores
        FOR INSERT TO authenticated
        WITH CHECK ((auth.jwt() ->> 'rol') IN ('ventas', 'ventas_sin_compras'))
    $p$;
  END IF;
END $$;
