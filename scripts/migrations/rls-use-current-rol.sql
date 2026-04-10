-- =============================================================================
-- RLS hardening: usar rol real desde DB (ssepi_current_rol) en vez de auth.jwt()->>'rol'
-- Ejecutar en Supabase SQL Editor.
-- Requiere: scripts/migrations/contabilidad-supabase-fix.sql (define ssepi_current_rol).
-- =============================================================================

-- Helper (idempotente): rol real desde DB. En Supabase, auth.jwt()->>'rol' no siempre existe.
-- NOTA: usamos CREATE OR REPLACE para evitar problemas de quoting con DO/EXECUTE en algunos editores.
CREATE OR REPLACE FUNCTION public.ssepi_current_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.rol FROM public.usuarios u WHERE u.auth_user_id = auth.uid() LIMIT 1),
    (SELECT u.rol FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1),
    ''
  );
$$;

-- ==================== CONTACTOS ====================
DO $$
BEGIN
  IF to_regclass('public.contactos') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.contactos no existe';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS contactos_admin_all ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_clientes ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_providers ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_all ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_taller_read ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_ventas_read ON public.contactos';
  EXECUTE 'DROP POLICY IF EXISTS contactos_compras_read ON public.contactos';
  EXECUTE $p$
    CREATE POLICY contactos_admin_all ON public.contactos
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('admin', 'superadmin'))
      WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY contactos_team_rw ON public.contactos
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('taller', 'compras', 'ventas', 'facturacion', 'contabilidad', 'automatizacion'))
      WITH CHECK (public.ssepi_current_rol() IN ('taller', 'compras', 'ventas', 'facturacion', 'contabilidad', 'automatizacion'))
  $p$;
END $$;

-- ==================== INVENTARIO ====================
DO $$
BEGIN
  IF to_regclass('public.inventario') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.inventario no existe';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS inventario_admin_all ON public.inventario';
  EXECUTE 'DROP POLICY IF EXISTS inventario_stock_all ON public.inventario';
  EXECUTE 'DROP POLICY IF EXISTS inventario_read_all ON public.inventario';
  EXECUTE 'DROP POLICY IF EXISTS inventario_mutate_stock ON public.inventario';
  EXECUTE $p$
    CREATE POLICY inventario_read_all ON public.inventario
      FOR SELECT TO authenticated
      USING (public.ssepi_current_rol() IN ('admin','superadmin','inventario','taller','compras','ventas','facturacion','contabilidad','automatizacion'))
  $p$;
  EXECUTE $p$
    CREATE POLICY inventario_mutate_stock ON public.inventario
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('admin','superadmin','inventario','compras'))
      WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin','inventario','compras'))
  $p$;
END $$;

-- ==================== ORDENES TALLER ====================
DO $$
BEGIN
  IF to_regclass('public.ordenes_taller') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.ordenes_taller no existe';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.ordenes_taller ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS taller_admin_all ON public.ordenes_taller';
  EXECUTE 'DROP POLICY IF EXISTS taller_taller_all ON public.ordenes_taller';
  EXECUTE 'DROP POLICY IF EXISTS taller_ventas_read ON public.ordenes_taller';
  EXECUTE 'DROP POLICY IF EXISTS taller_compras_read ON public.ordenes_taller';
  EXECUTE 'DROP POLICY IF EXISTS taller_facturacion_read ON public.ordenes_taller';
  EXECUTE 'DROP POLICY IF EXISTS taller_lectores ON public.ordenes_taller';
  EXECUTE $p$
    CREATE POLICY taller_admin_all ON public.ordenes_taller
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('admin','superadmin'))
      WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY taller_taller_all ON public.ordenes_taller
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() = 'taller')
      WITH CHECK (public.ssepi_current_rol() = 'taller')
  $p$;
  EXECUTE $p$
    CREATE POLICY taller_lectores ON public.ordenes_taller
      FOR SELECT TO authenticated
      USING (public.ssepi_current_rol() IN ('ventas','compras','facturacion','contabilidad'))
  $p$;
END $$;

-- ==================== COMPRAS ====================
DO $$
BEGIN
  IF to_regclass('public.compras') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.compras no existe';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS compras_admin_all ON public.compras';
  EXECUTE 'DROP POLICY IF EXISTS compras_compras_all ON public.compras';
  EXECUTE 'DROP POLICY IF EXISTS compras_taller_read ON public.compras';
  EXECUTE 'DROP POLICY IF EXISTS compras_motores_read ON public.compras';
  EXECUTE 'DROP POLICY IF EXISTS compras_team_read ON public.compras';
  EXECUTE $p$
    CREATE POLICY compras_admin_all ON public.compras
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('admin','superadmin'))
      WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY compras_compras_all ON public.compras
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() = 'compras')
      WITH CHECK (public.ssepi_current_rol() = 'compras')
  $p$;
  EXECUTE $p$
    CREATE POLICY compras_team_read ON public.compras
      FOR SELECT TO authenticated
      USING (public.ssepi_current_rol() IN ('taller','ventas','facturacion','contabilidad','automatizacion'))
  $p$;
END $$;

-- ==================== VENTAS / FACTURAS (lectura team; escritura rol dueño) ====================
DO $$
BEGIN
  IF to_regclass('public.ventas') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.ventas no existe';
  ELSE
    EXECUTE 'ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS ventas_admin_all ON public.ventas';
    EXECUTE 'DROP POLICY IF EXISTS ventas_ventas_all ON public.ventas';
    EXECUTE 'DROP POLICY IF EXISTS ventas_facturacion_read ON public.ventas';
    EXECUTE 'DROP POLICY IF EXISTS ventas_contabilidad_read ON public.ventas';
    EXECUTE 'DROP POLICY IF EXISTS ventas_team_read ON public.ventas';
    EXECUTE $p$
      CREATE POLICY ventas_admin_all ON public.ventas
        FOR ALL TO authenticated
        USING (public.ssepi_current_rol() IN ('admin','superadmin'))
        WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'))
    $p$;
    EXECUTE $p$
      CREATE POLICY ventas_ventas_all ON public.ventas
        FOR ALL TO authenticated
        USING (public.ssepi_current_rol() = 'ventas')
        WITH CHECK (public.ssepi_current_rol() = 'ventas')
    $p$;
    EXECUTE $p$
      CREATE POLICY ventas_team_read ON public.ventas
        FOR SELECT TO authenticated
        USING (public.ssepi_current_rol() IN ('compras','facturacion','contabilidad'))
    $p$;
  END IF;

  IF to_regclass('public.facturas') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.facturas no existe';
  ELSE
    EXECUTE 'ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS facturas_admin_all ON public.facturas';
    EXECUTE 'DROP POLICY IF EXISTS facturas_facturacion_all ON public.facturas';
    EXECUTE 'DROP POLICY IF EXISTS facturas_contabilidad_read ON public.facturas';
    EXECUTE 'DROP POLICY IF EXISTS facturas_contab_read ON public.facturas';
    EXECUTE $p$
      CREATE POLICY facturas_admin_all ON public.facturas
        FOR ALL TO authenticated
        USING (public.ssepi_current_rol() IN ('admin','superadmin'))
        WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'))
    $p$;
    EXECUTE $p$
      CREATE POLICY facturas_facturacion_all ON public.facturas
        FOR ALL TO authenticated
        USING (public.ssepi_current_rol() = 'facturacion')
        WITH CHECK (public.ssepi_current_rol() = 'facturacion')
    $p$;
    EXECUTE $p$
      CREATE POLICY facturas_contab_read ON public.facturas
        FOR SELECT TO authenticated
        USING (public.ssepi_current_rol() = 'contabilidad')
    $p$;
  END IF;
END $$;

-- ==================== PROYECTOS AUTOMATIZACION ====================
DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NULL THEN
    RAISE NOTICE 'Skip RLS: public.proyectos_automatizacion no existe';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS proyectos_admin_all ON public.proyectos_automatizacion';
  EXECUTE 'DROP POLICY IF EXISTS proyectos_automatizacion_all ON public.proyectos_automatizacion';
  EXECUTE 'DROP POLICY IF EXISTS proyectos_ventas_read ON public.proyectos_automatizacion';
  EXECUTE 'DROP POLICY IF EXISTS proyectos_team_read ON public.proyectos_automatizacion';
  EXECUTE $p$
    CREATE POLICY proyectos_admin_all ON public.proyectos_automatizacion
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() IN ('admin','superadmin'))
      WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'))
  $p$;
  EXECUTE $p$
    CREATE POLICY proyectos_automatizacion_all ON public.proyectos_automatizacion
      FOR ALL TO authenticated
      USING (public.ssepi_current_rol() = 'automatizacion')
      WITH CHECK (public.ssepi_current_rol() = 'automatizacion')
  $p$;
  EXECUTE $p$
    CREATE POLICY proyectos_team_read ON public.proyectos_automatizacion
      FOR SELECT TO authenticated
      USING (public.ssepi_current_rol() IN ('ventas','compras','contabilidad','facturacion','taller'))
  $p$;
END $$;

