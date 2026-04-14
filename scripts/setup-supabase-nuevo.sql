-- =============================================================================
-- SSEPI - SETUP SUPABASE NUEVO
-- PROPÓSITO: Script único para inicializar proyecto Supabase desde cero
-- EJECUCIÓN: Copiar y pegar completo en SQL Editor de Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASO 1: TABLA USUARIOS (requerida por ssepi_current_rol)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  nombre TEXT,
  rol TEXT DEFAULT 'ventas',
  departamento TEXT,
  telefono TEXT,
  sede TEXT,
  nivel_riesgo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON public.usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol);

-- -----------------------------------------------------------------------------
-- PASO 2: TABLA ROLE_PERMISSIONS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rol, module, action)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_rol ON public.role_permissions(rol);
CREATE INDEX IF NOT EXISTS idx_role_permissions_module ON public.role_permissions(module);

INSERT INTO public.role_permissions (rol, module, action) VALUES
  ('admin', 'ordenes_taller', 'create'),
  ('admin', 'ordenes_taller', 'update'),
  ('admin', 'ordenes_taller', 'delete'),
  ('admin', 'ordenes_taller', 'read'),
  ('admin', 'ordenes_motores', 'create'),
  ('admin', 'ordenes_motores', 'update'),
  ('admin', 'ordenes_motores', 'delete'),
  ('admin', 'ordenes_motores', 'read'),
  ('admin', 'proyectos_automatizacion', 'create'),
  ('admin', 'proyectos_automatizacion', 'update'),
  ('admin', 'proyectos_automatizacion', 'delete'),
  ('admin', 'proyectos_automatizacion', 'read'),
  ('admin', 'ventas', 'create'),
  ('admin', 'ventas', 'update'),
  ('admin', 'ventas', 'delete'),
  ('admin', 'ventas', 'read'),
  ('admin', 'compras', 'create'),
  ('admin', 'compras', 'update'),
  ('admin', 'compras', 'delete'),
  ('admin', 'compras', 'read'),
  ('admin', 'inventario', 'create'),
  ('admin', 'inventario', 'update'),
  ('admin', 'inventario', 'delete'),
  ('admin', 'inventario', 'read'),
  ('admin', 'cotizaciones', 'create'),
  ('admin', 'cotizaciones', 'update'),
  ('admin', 'cotizaciones', 'delete'),
  ('admin', 'cotizaciones', 'read'),
  ('superadmin', 'ordenes_taller', 'create'),
  ('superadmin', 'ordenes_taller', 'update'),
  ('superadmin', 'ordenes_taller', 'delete'),
  ('superadmin', 'ordenes_taller', 'read'),
  ('ventas', 'ordenes_taller', 'create'),
  ('ventas', 'ordenes_motores', 'create'),
  ('ventas', 'proyectos_automatizacion', 'create'),
  ('ventas', 'ventas', 'create'),
  ('ventas', 'ventas', 'read'),
  ('ventas', 'cotizaciones', 'create'),
  ('ventas', 'cotizaciones', 'read'),
  ('ventas_sin_compras', 'ordenes_taller', 'create'),
  ('ventas_sin_compras', 'ordenes_motores', 'create'),
  ('ventas_sin_compras', 'proyectos_automatizacion', 'create'),
  ('ventas_sin_compras', 'ventas', 'create'),
  ('ventas_sin_compras', 'ventas', 'read'),
  ('taller', 'ordenes_taller', 'read'),
  ('taller', 'ordenes_taller', 'update'),
  ('taller', 'inventario', 'read'),
  ('automatizacion', 'ordenes_taller', 'create'),
  ('automatizacion', 'ordenes_motores', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'read'),
  ('automatizacion', 'inventario', 'read')
ON CONFLICT (rol, module, action) DO NOTHING;

-- -----------------------------------------------------------------------------
-- PASO 3: TABLA ORDENES_TALLER (DEBE IR ANTES DE orden_historial por FK)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ordenes_taller (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT UNIQUE,
  cliente_nombre TEXT NOT NULL,
  falla_reportada TEXT,
  estado TEXT DEFAULT 'pendiente',
  servicio TEXT,
  equipo_tipo TEXT,
  equipo_modelo TEXT,
  equipo_serie TEXT,
  notas_generales TEXT,
  creado_por UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_folio ON public.ordenes_taller(folio);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_estado ON public.ordenes_taller(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_cliente ON public.ordenes_taller(cliente_nombre);

-- Activar RLS
ALTER TABLE public.ordenes_taller ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- PASO 4: TABLA ORDEN_HISTORIAL (ahora puede tener FK a ordenes_taller)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orden_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_taller_id UUID REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  orden_motor_id UUID,
  proyecto_id UUID,
  evento TEXT NOT NULL,
  descripcion TEXT,
  metadata JSONB DEFAULT '{}',
  creado_por UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_historial_orden_taller ON public.orden_historial(orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_evento ON public.orden_historial(evento);

-- -----------------------------------------------------------------------------
-- PASO 5: FUNCIÓN SSEPI_CURRENT_ROL()
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
    ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.ssepi_current_rol() TO authenticated;

-- -----------------------------------------------------------------------------
-- PASO 6: POLÍTICAS RLS PARA ORDENES_TALLER
-- -----------------------------------------------------------------------------

-- Limpiar políticas existentes
DROP POLICY IF EXISTS taller_admin_all ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_taller_all ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_admin_insert ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_ventas_insert ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_automatizacion_insert ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_select_auth ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_fix_select_equipo ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_insert_on_orders ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_select_on_orders ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_update_on_orders ON public.ordenes_taller;
DROP POLICY IF EXISTS taller_delete_on_orders ON public.ordenes_taller;

-- Crear políticas nuevas
CREATE POLICY taller_insert_on_orders ON public.ordenes_taller
  FOR INSERT TO authenticated
  WITH CHECK (
    public.ssepi_current_rol() IN ('admin', 'superadmin', 'ventas', 'ventas_sin_compras', 'automatizacion', 'taller')
  );

CREATE POLICY taller_select_on_orders ON public.ordenes_taller
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY taller_update_on_orders ON public.ordenes_taller
  FOR UPDATE TO authenticated
  WITH CHECK (
    public.ssepi_current_rol() IN ('admin', 'superadmin', 'taller')
  );

CREATE POLICY taller_delete_on_orders ON public.ordenes_taller
  FOR DELETE TO authenticated
  USING (
    public.ssepi_current_rol() IN ('admin', 'superadmin')
  );

-- -----------------------------------------------------------------------------
-- PASO 7: TRIGGER PARA ORDEN_HISTORIAL
-- -----------------------------------------------------------------------------

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
    RAISE WARNING 'Error al registrar evento en orden_historial: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_taller_al_crear ON public.ordenes_taller;
CREATE TRIGGER trg_taller_al_crear
  AFTER INSERT ON public.ordenes_taller
  FOR EACH ROW EXECUTE FUNCTION public.trg_taller_al_crear();

-- -----------------------------------------------------------------------------
-- PASO 8: INSERTAR USUARIO ADMIN (actualizar UUID con el de tu cuenta)
-- -----------------------------------------------------------------------------

-- NOTA: Reemplazar el UUID con el auth_user_id de tu cuenta de Supabase Auth
-- Podés obtenerlo ejecutando: SELECT id FROM auth.users WHERE email = 'tu@email.com';
DO $$
BEGIN
  -- Solo inserta si no existe ya
  INSERT INTO public.usuarios (auth_user_id, email, nombre, rol)
  SELECT id, email, 'Admin', 'admin'
  FROM auth.users
  WHERE email = 'norbertomoro4@gmail.com'
  ON CONFLICT (auth_user_id) DO UPDATE SET rol = 'admin';
END $$;

-- -----------------------------------------------------------------------------
-- PASO 9: RECARGAR SCHEMA CACHE DE POSTGREST
-- -----------------------------------------------------------------------------

SELECT pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
