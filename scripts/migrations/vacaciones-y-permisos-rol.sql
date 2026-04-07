-- =============================================================================
-- Módulo Vacaciones + permisos por rol (ventas: compras, inventario, analisis_ventas; vacaciones para todos)
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

-- 1) Tabla: días feriados (legales y por religión católica / suspensión de labores)
CREATE TABLE IF NOT EXISTS public.vacaciones_dias_feriados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha DATE NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('legal', 'religioso', 'suspension_labores')),
  anio INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::INT) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vacaciones_dias_feriados IS 'Días feriados legales y religiosos (católicos/suspensión labores)';

-- 2) Tabla: balance de días de vacaciones por usuario y año (admin modifica dias_asignados; base 15)
CREATE TABLE IF NOT EXISTS public.vacaciones_balance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  dias_asignados INT NOT NULL DEFAULT 15,
  dias_solicitados INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anio)
);

COMMENT ON TABLE public.vacaciones_balance IS 'Días de vacaciones por usuario y año; admin puede modificar dias_asignados';

-- 3) Tabla: solicitudes de vacaciones
CREATE TABLE IF NOT EXISTS public.vacaciones_solicitudes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  dias_solicitados INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  observaciones TEXT,
  aprobado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vacaciones_solicitudes IS 'Solicitudes de vacaciones por empleado';

-- 4) Tabla: registro de nombres/colores para calendario (quién es quién en vacaciones)
CREATE TABLE IF NOT EXISTS public.vacaciones_empleados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  email TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  orden INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nombre)
);

ALTER TABLE public.vacaciones_empleados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vacaciones_empleados_select ON public.vacaciones_empleados;
CREATE POLICY vacaciones_empleados_select ON public.vacaciones_empleados FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.vacaciones_empleados TO authenticated;

-- Seed: nombres y colores (emails donde se conozcan; user_id se puede vincular después)
INSERT INTO public.vacaciones_empleados (nombre, rol, email, color, orden) VALUES
  ('Eduardo Amezcua', 'ventas', NULL, '#3b82f6', 1),
  ('Ivan Gutierrez', 'automatizacion', NULL, '#8b5cf6', 2),
  ('Aaron Garcia', 'taller', NULL, '#22c55e', 3),
  ('Javier Cruz', 'taller', NULL, '#f59e0b', 4),
  ('Ana Moreno', 'administracion', 'anamoreno.ssepi@gmail.com', '#ec4899', 5),
  ('Arturo Moreno', 'automatizacion', NULL, '#06b6d4', 6),
  ('Misael Moreno', 'contabilidad', NULL, '#6366f1', 7),
  ('Daniel Zuniga', 'ventas', NULL, '#14b8a6', 8),
  ('Norberto Moreno', 'admin', NULL, '#ef4444', 9),
  ('Alejandro Becerra', 'motores', NULL, '#84cc16', 10)
ON CONFLICT (nombre) DO UPDATE SET rol = EXCLUDED.rol, email = COALESCE(EXCLUDED.email, vacaciones_empleados.email), color = EXCLUDED.color, orden = EXCLUDED.orden;

-- RLS
ALTER TABLE public.vacaciones_dias_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vacaciones_feriados_select ON public.vacaciones_dias_feriados;
CREATE POLICY vacaciones_feriados_select ON public.vacaciones_dias_feriados FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS vacaciones_balance_select ON public.vacaciones_balance;
CREATE POLICY vacaciones_balance_select ON public.vacaciones_balance FOR SELECT TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin')));
DROP POLICY IF EXISTS vacaciones_balance_insert_own ON public.vacaciones_balance;
CREATE POLICY vacaciones_balance_insert_own ON public.vacaciones_balance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS vacaciones_balance_update ON public.vacaciones_balance;
CREATE POLICY vacaciones_balance_update ON public.vacaciones_balance FOR UPDATE TO authenticated USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
);
DROP POLICY IF EXISTS vacaciones_solicitudes_select ON public.vacaciones_solicitudes;
CREATE POLICY vacaciones_solicitudes_select ON public.vacaciones_solicitudes FOR SELECT TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin')));
DROP POLICY IF EXISTS vacaciones_solicitudes_insert ON public.vacaciones_solicitudes;
CREATE POLICY vacaciones_solicitudes_insert ON public.vacaciones_solicitudes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS vacaciones_solicitudes_update ON public.vacaciones_solicitudes;
CREATE POLICY vacaciones_solicitudes_update ON public.vacaciones_solicitudes FOR UPDATE TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin')));

GRANT SELECT ON public.vacaciones_dias_feriados TO authenticated;
GRANT SELECT, UPDATE ON public.vacaciones_balance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vacaciones_solicitudes TO authenticated;

-- 4) Insertar feriados legales México + religiosos (ejemplo 2025)
INSERT INTO public.vacaciones_dias_feriados (fecha, nombre, tipo) VALUES
  ('2025-01-01', 'Año Nuevo', 'legal'),
  ('2025-02-03', 'Día de la Constitución', 'legal'),
  ('2025-03-17', 'Natalicio de Benito Juárez', 'legal'),
  ('2025-05-01', 'Día del Trabajo', 'legal'),
  ('2025-09-16', 'Día de la Independencia', 'legal'),
  ('2025-11-17', 'Revolución Mexicana', 'legal'),
  ('2025-12-25', 'Navidad', 'legal'),
  ('2025-04-18', 'Viernes Santo', 'religioso'),
  ('2025-11-02', 'Día de Muertos', 'suspension_labores'),
  ('2025-12-12', 'Día de la Virgen de Guadalupe', 'religioso')
ON CONFLICT (fecha) DO NOTHING;

-- 5) Permisos role_permissions: analisis_ventas y vacaciones
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('ventas', 'analisis_ventas', 'read'),
  ('ventas', 'compras', 'read'),
  ('ventas', 'inventario', 'read'),
  ('ventas', 'vacaciones', 'read'),
  ('ventas', 'vacaciones', 'create'),
  ('ventas_sin_compras', 'analisis_ventas', 'read'),
  ('ventas_sin_compras', 'compras', 'read'),
  ('ventas_sin_compras', 'inventario', 'read'),
  ('ventas_sin_compras', 'vacaciones', 'read'),
  ('ventas_sin_compras', 'vacaciones', 'create'),
  ('taller', 'vacaciones', 'read'),
  ('taller', 'vacaciones', 'create'),
  ('automatizacion', 'vacaciones', 'read'),
  ('automatizacion', 'vacaciones', 'create'),
  ('motores', 'vacaciones', 'read'),
  ('motores', 'vacaciones', 'create'),
  ('compras', 'vacaciones', 'read'),
  ('compras', 'vacaciones', 'create'),
  ('facturacion', 'vacaciones', 'read'),
  ('facturacion', 'vacaciones', 'create')
) AS v(rol, module, action)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.rol = v.rol AND rp.module = v.module AND rp.action = v.action
);

-- 6) Ajuste rol ventas: solo Compras, Inventario, Análisis Ventas (quitar ventas/cotizaciones si se desea estricto)
-- Opcional: DELETE FROM public.role_permissions WHERE rol = 'ventas' AND module IN ('ventas','clientes','cotizaciones','contactos');
-- y luego INSERT compras, inventario, analisis_ventas (ya incluido arriba).
