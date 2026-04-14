-- =============================================================================
-- FIX: Permisos Ventas - Paso 1 (SP-E, SP-M, SP-A)
-- PROPÓSITO: Permitir que norbertomoro4@gmail.com y usuarios ventas/ventas_sin_compras
--            puedan crear órdenes desde el cerebro (Paso 1)
--
-- PROBLEMAS IDENTIFICADOS:
-- 1. ssepi_current_rol() puede no existir o no leer correctamente el rol
-- 2. Políticas RLS usan auth.jwt() ->> 'rol' pero el claim 'rol' no está en el JWT
-- 3. Trigger en orden_historial puede fallar si no hay permisos INSERT
-- 4. Dual mode (Normal/Admin) no se refleja en la BD
--
-- EJECUCIÓN: En orden, en Supabase SQL Editor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASO 1: ssepi_current_rol() — SOLO auth.uid() + tablas usuarios/users
-- No depender de auth.jwt()->>'email' (muchas sesiones Supabase no lo incluyen);
-- si el rol queda mal, RLS devuelve 403 en ordenes_taller aunque usuarios.rol sea admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ssepi_current_rol()
RETURNS text
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

GRANT EXECUTE ON FUNCTION public.ssepi_current_rol() TO authenticated;

-- -----------------------------------------------------------------------------
-- PASO 2: Asegurar role_permissions para admin, ventas, ventas_sin_compras
-- -----------------------------------------------------------------------------

INSERT INTO public.role_permissions (rol, module, action)
SELECT * FROM (VALUES
  -- Admin: todos los módulos, todas las acciones
  ('admin', 'ordenes_taller', 'create'),
  ('admin', 'ordenes_taller', 'update'),
  ('admin', 'ordenes_taller', 'delete'),
  ('admin', 'ordenes_motores', 'create'),
  ('admin', 'ordenes_motores', 'update'),
  ('admin', 'ordenes_motores', 'delete'),
  ('admin', 'proyectos_automatizacion', 'create'),
  ('admin', 'proyectos_automatizacion', 'update'),
  ('admin', 'proyectos_automatizacion', 'delete'),
  -- Ventas: create en órdenes operativas (paso 1)
  ('ventas', 'ordenes_taller', 'create'),
  ('ventas', 'ordenes_motores', 'create'),
  ('ventas', 'proyectos_automatizacion', 'create'),
  -- Ventas sin compras: mismo que ventas (sin acceso a módulo Compras)
  ('ventas_sin_compras', 'ordenes_taller', 'create'),
  ('ventas_sin_compras', 'ordenes_motores', 'create'),
  ('ventas_sin_compras', 'proyectos_automatizacion', 'create'),
  -- Modo dual Normal (rol base automatizacion) + cerebro Ventas paso 1
  ('automatizacion', 'ordenes_taller', 'create'),
  ('automatizacion', 'ordenes_motores', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'create')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- -----------------------------------------------------------------------------
-- PASO 3: RLS INSERT en ordenes_taller (usando ssepi_current_rol)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.ordenes_taller') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS taller_ventas_insert ON public.ordenes_taller;
  DROP POLICY IF EXISTS taller_admin_insert ON public.ordenes_taller;
  DROP POLICY IF EXISTS taller_automatizacion_insert ON public.ordenes_taller;

  -- Admin puede insertar
  CREATE POLICY taller_admin_insert ON public.ordenes_taller
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

  -- Ventas y ventas_sin_compras pueden insertar
  CREATE POLICY taller_ventas_insert ON public.ordenes_taller
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'));

  -- Rol automatizacion: mismo criterio que ventas en RLS (hasPermission ya puede usar rol base en modo dual)
  CREATE POLICY taller_automatizacion_insert ON public.ordenes_taller
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() = 'automatizacion');

  -- SELECT: el módulo Ventas hace GET a ordenes_taller; sin política SELECT, 403 aunque INSERT exista.
  DROP POLICY IF EXISTS taller_fix_select_equipo ON public.ordenes_taller;
  CREATE POLICY taller_fix_select_equipo ON public.ordenes_taller
    FOR SELECT TO authenticated
    USING (public.ssepi_current_rol() IN (
      'admin', 'superadmin', 'ventas', 'ventas_sin_compras',
      'taller', 'compras', 'facturacion', 'contabilidad', 'automatizacion'
    ));
END $$;

-- -----------------------------------------------------------------------------
-- PASO 4: RLS INSERT en ordenes_motores (si existe la tabla)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS motores_ventas_insert ON public.ordenes_motores;
  DROP POLICY IF EXISTS motores_admin_insert ON public.ordenes_motores;

  CREATE POLICY motores_admin_insert ON public.ordenes_motores
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

  CREATE POLICY motores_ventas_insert ON public.ordenes_motores
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'));
END $$;

-- -----------------------------------------------------------------------------
-- PASO 5: RLS INSERT en proyectos_automatizacion (si existe la tabla)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS proyectos_ventas_insert ON public.proyectos_automatizacion;
  DROP POLICY IF EXISTS proyectos_admin_insert ON public.proyectos_automatizacion;

  CREATE POLICY proyectos_admin_insert ON public.proyectos_automatizacion
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

  CREATE POLICY proyectos_ventas_insert ON public.proyectos_automatizacion
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'));
END $$;

-- -----------------------------------------------------------------------------
-- PASO 6: RLS INSERT en orden_historial (para triggers)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.orden_historial') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS orden_historial_ventas_insert ON public.orden_historial;
  DROP POLICY IF EXISTS orden_historial_admin_insert ON public.orden_historial;
  DROP POLICY IF EXISTS orden_historial_taller_insert ON public.orden_historial;

  -- Admin puede insertar
  CREATE POLICY orden_historial_admin_insert ON public.orden_historial
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

  -- Ventas puede insertar eventos de cotizaciones
  CREATE POLICY orden_historial_ventas_insert ON public.orden_historial
    FOR INSERT TO authenticated
    WITH CHECK (
      public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras')
      AND (creado_por IS NULL OR creado_por = auth.uid())
    );

  -- Taller puede insertar eventos de órdenes
  CREATE POLICY orden_historial_taller_insert ON public.orden_historial
    FOR INSERT TO authenticated
    WITH CHECK (
      public.ssepi_current_rol() = 'taller'
      AND creado_por = auth.uid()
    );
END $$;

-- -----------------------------------------------------------------------------
-- PASO 7: Verificar triggers en ordenes_taller
-- -----------------------------------------------------------------------------

-- El trigger trg_taller_al_crear debe existir para registrar eventos
-- Si no existe, crearlo (esto ya debería estar en crear-orden-historial.sql)

CREATE OR REPLACE FUNCTION public.trg_taller_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_taller_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de taller creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'falla', NEW.falla_reportada, 'estado', NEW.estado),
    auth.uid()
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Si falla el insert en historial, no bloquear la creación de la orden
    RAISE WARNING 'Error al registrar evento en orden_historial: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_taller_al_crear ON public.ordenes_taller;
CREATE TRIGGER trg_taller_al_crear
  AFTER INSERT ON public.ordenes_taller
  FOR EACH ROW EXECUTE FUNCTION public.trg_taller_al_crear();

-- -----------------------------------------------------------------------------
-- PASO 8: Recargar schema cache de PostgREST
-- -----------------------------------------------------------------------------

SELECT pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICACIÓN POST-FIX
-- =============================================================================

-- Ejecutar después del fix para verificar:

-- 1. Verificar función ssepi_current_rol
-- SELECT public.ssepi_current_rol() AS rol_actual;

-- 2. Verificar políticas en ordenes_taller
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'ordenes_taller' AND cmd = 'INSERT';

-- 3. Verificar role_permissions
-- SELECT * FROM public.role_permissions
-- WHERE rol IN ('admin', 'ventas', 'ventas_sin_compras')
--   AND module = 'ordenes_taller';
