-- =============================================================================
-- RLS hardening: usar rol real desde DB (ssepi_current_rol) en vez de auth.jwt()->>'rol'
-- Ejecutar en Supabase SQL Editor.
-- Requiere: scripts/migrations/contabilidad-supabase-fix.sql (define ssepi_current_rol).
-- =============================================================================

-- Helper: si no existe, crea ssepi_current_rol (fallback mínimo).
-- Si ya existe, no se toca.
DO $$
BEGIN
  IF to_regprocedure('public.ssepi_current_rol()') IS NULL THEN
    EXECUTE $fn$
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
    $fn$;
  END IF;
END $$;

-- ==================== CONTACTOS ====================
ALTER TABLE IF EXISTS public.contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contactos_admin_all ON public.contactos;
DROP POLICY IF EXISTS contactos_clientes ON public.contactos;
DROP POLICY IF EXISTS contactos_providers ON public.contactos;
DROP POLICY IF EXISTS contactos_all ON public.contactos;
DROP POLICY IF EXISTS contactos_taller_read ON public.contactos;
DROP POLICY IF EXISTS contactos_ventas_read ON public.contactos;
DROP POLICY IF EXISTS contactos_compras_read ON public.contactos;

CREATE POLICY contactos_admin_all ON public.contactos
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin', 'superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

CREATE POLICY contactos_team_rw ON public.contactos
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('taller', 'compras', 'ventas', 'facturacion', 'contabilidad', 'automatizacion'))
  WITH CHECK (public.ssepi_current_rol() IN ('taller', 'compras', 'ventas', 'facturacion', 'contabilidad', 'automatizacion'));

-- ==================== INVENTARIO ====================
ALTER TABLE IF EXISTS public.inventario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventario_admin_all ON public.inventario;
DROP POLICY IF EXISTS inventario_stock_all ON public.inventario;
DROP POLICY IF EXISTS inventario_read_all ON public.inventario;

CREATE POLICY inventario_read_all ON public.inventario
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin','inventario','taller','compras','ventas','facturacion','contabilidad','automatizacion'));

CREATE POLICY inventario_mutate_stock ON public.inventario
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin','inventario','compras'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin','inventario','compras'));

-- ==================== ORDENES TALLER ====================
ALTER TABLE IF EXISTS public.ordenes_taller ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS taller_admin_all ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_taller_all ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_ventas_read ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_compras_read ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_facturacion_read ON public.ordenes_taller;

CREATE POLICY taller_admin_all ON public.ordenes_taller
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY taller_taller_all ON public.ordenes_taller
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'taller')
  WITH CHECK (public.ssepi_current_rol() = 'taller');

CREATE POLICY taller_lectores ON public.ordenes_taller
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('ventas','compras','facturacion','contabilidad'));

-- ==================== COMPRAS ====================
ALTER TABLE IF EXISTS public.compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_admin_all ON public.compras;
DROP POLICY IF EXISTS compras_compras_all ON public.compras;
DROP POLICY IF EXISTS compras_taller_read ON public.compras;
DROP POLICY IF EXISTS compras_motores_read ON public.compras;

CREATE POLICY compras_admin_all ON public.compras
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY compras_compras_all ON public.compras
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'compras')
  WITH CHECK (public.ssepi_current_rol() = 'compras');

CREATE POLICY compras_team_read ON public.compras
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('taller','ventas','facturacion','contabilidad','automatizacion'));

-- ==================== VENTAS / FACTURAS (lectura team; escritura rol dueño) ====================
ALTER TABLE IF EXISTS public.ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ventas_admin_all ON public.ventas;
DROP POLICY IF EXISTS ventas_ventas_all ON public.ventas;
DROP POLICY IF EXISTS ventas_facturacion_read ON public.ventas;
DROP POLICY IF EXISTS ventas_contabilidad_read ON public.ventas;

CREATE POLICY ventas_admin_all ON public.ventas
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY ventas_ventas_all ON public.ventas
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'ventas')
  WITH CHECK (public.ssepi_current_rol() = 'ventas');

CREATE POLICY ventas_team_read ON public.ventas
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('compras','facturacion','contabilidad'));

ALTER TABLE IF EXISTS public.facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturas_admin_all ON public.facturas;
DROP POLICY IF EXISTS facturas_facturacion_all ON public.facturas;
DROP POLICY IF EXISTS facturas_contabilidad_read ON public.facturas;

CREATE POLICY facturas_admin_all ON public.facturas
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY facturas_facturacion_all ON public.facturas
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'facturacion')
  WITH CHECK (public.ssepi_current_rol() = 'facturacion');

CREATE POLICY facturas_contab_read ON public.facturas
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() = 'contabilidad');

-- ==================== PROYECTOS AUTOMATIZACION ====================
ALTER TABLE IF EXISTS public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proyectos_admin_all ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS proyectos_automatizacion_all ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS proyectos_ventas_read ON public.proyectos_automatizacion;

CREATE POLICY proyectos_admin_all ON public.proyectos_automatizacion
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY proyectos_automatizacion_all ON public.proyectos_automatizacion
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'automatizacion')
  WITH CHECK (public.ssepi_current_rol() = 'automatizacion');

CREATE POLICY proyectos_team_read ON public.proyectos_automatizacion
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('ventas','compras','contabilidad','facturacion','taller'));

