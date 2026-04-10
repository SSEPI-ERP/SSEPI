-- Ventas: alta de orden/proyecto desde el wizard (paso 1 cerebro).
-- Ejecutar en Supabase después de rls-use-current-rol.sql (o equivalente con ssepi_current_rol).
--
-- 1) Permisos de la app (authService.hasPermission en insert)
INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  ('ventas', 'ordenes_taller', 'create'),
  ('ventas', 'ordenes_motores', 'create'),
  ('ventas', 'proyectos_automatizacion', 'create')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 2) RLS: INSERT para rol ventas en órdenes de taller
DO $$
BEGIN
  IF to_regclass('public.ordenes_taller') IS NULL THEN
    RAISE NOTICE 'Skip: ordenes_taller no existe';
    RETURN;
  END IF;
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

-- 3) RLS: INSERT para rol ventas en proyectos / automatización
DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NULL THEN
    RAISE NOTICE 'Skip: proyectos_automatizacion no existe';
    RETURN;
  END IF;
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

-- 4) ordenes_motores: solo si ya tiene RLS (no habilitar RLS aquí para no cerrar el acceso)
DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NULL THEN
    RAISE NOTICE 'Skip: ordenes_motores no existe';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ordenes_motores' AND c.relrowsecurity
  ) THEN
    RAISE NOTICE 'ordenes_motores sin RLS: basta role_permissions create para ventas';
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
