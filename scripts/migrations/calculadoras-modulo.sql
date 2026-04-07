-- =============================================================================
-- Módulo Calculadoras (solo admin): permisos y tablas
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

-- 1) Permisos: solo admin puede ver y usar el módulo calculadoras
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('admin', 'calculadoras', 'read'),
  ('admin', 'calculadoras', 'create'),
  ('admin', 'calculadoras', 'update'),
  ('superadmin', 'calculadoras', 'read'),
  ('superadmin', 'calculadoras', 'create'),
  ('superadmin', 'calculadoras', 'update')
) AS v(rol, module, action)
ON CONFLICT (rol, module, action) DO NOTHING;

-- 2) Tabla: calculadoras (configuración/funciones por calculadora)
CREATE TABLE IF NOT EXISTS public.calculadoras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo TEXT,
  funciones TEXT,
  config_json JSONB DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.calculadoras IS 'Módulo Calculadoras: funciones y configuración por calculadora (solo admin)';

-- 3) Tabla: costos asociados a calculadoras
CREATE TABLE IF NOT EXISTS public.calculadora_costos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculadora_id UUID REFERENCES public.calculadoras(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  costo NUMERIC(18,2) NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'MXN',
  vigencia_desde DATE,
  vigencia_hasta DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.calculadora_costos IS 'Costos por calculadora (solo admin)';

-- 4) Tabla: información de clientes vinculada a calculadoras
CREATE TABLE IF NOT EXISTS public.calculadora_clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculadora_id UUID REFERENCES public.calculadoras(id) ON DELETE CASCADE,
  cliente_id UUID,
  cliente_nombre TEXT,
  cliente_email TEXT,
  datos_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.calculadora_clientes IS 'Información de clientes por calculadora (solo admin)';

-- 5) RLS: solo admin/superadmin (users o usuarios) puede leer/escribir
ALTER TABLE public.calculadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculadora_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculadora_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calculadoras_admin_all ON public.calculadoras;
CREATE POLICY calculadoras_admin_all ON public.calculadoras FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS calculadora_costos_admin_all ON public.calculadora_costos;
CREATE POLICY calculadora_costos_admin_all ON public.calculadora_costos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS calculadora_clientes_admin_all ON public.calculadora_clientes;
CREATE POLICY calculadora_clientes_admin_all ON public.calculadora_clientes FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadoras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadora_costos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadora_clientes TO authenticated;
