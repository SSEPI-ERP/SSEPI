-- ============================================================
-- Segregación de Funciones (SoD) – restricciones y función de comprobación
-- Evita que un mismo rol tenga permisos en conflicto (ej. crear orden de compra + aprobar pago).
-- ============================================================

-- 1) Tabla de restricciones SoD: par de (módulo, acción) que no pueden coexistir en el mismo rol
CREATE TABLE IF NOT EXISTS public.sod_constraints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_a TEXT NOT NULL,
  action_a TEXT NOT NULL,
  module_b TEXT NOT NULL,
  action_b TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_a, action_a, module_b, action_b)
);

-- RLS: solo admin puede leer/gestionar restricciones SoD
ALTER TABLE public.sod_constraints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sod_constraints_admin ON public.sod_constraints;
CREATE POLICY sod_constraints_admin ON public.sod_constraints
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND rol = 'admin')
  );

-- 2) Datos iniciales: ejemplos de conflictos SoD
INSERT INTO public.sod_constraints (module_a, action_a, module_b, action_b, description) VALUES
  ('compras', 'create', 'compras', 'approve_payment', 'Quien crea la orden no debe aprobar el pago'),
  ('ventas', 'create', 'facturacion', 'approve_credit', 'Quien genera la venta no debe aprobar crédito'),
  ('contabilidad', 'read', 'compras', 'create', 'Ejemplo: segregación lectura contabilidad vs crear compra')
ON CONFLICT (module_a, action_a, module_b, action_b) DO NOTHING;

-- 3) Función: comprobar si el rol del usuario actual tiene conflicto SoD para dos acciones
CREATE OR REPLACE FUNCTION public.check_sod(p_module_a TEXT, p_action_a TEXT, p_module_b TEXT, p_action_b TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_rol TEXT;
  has_a BOOLEAN;
  has_b BOOLEAN;
  conflict_exists BOOLEAN;
BEGIN
  -- Rol del usuario actual (admin no está sujeto a SoD)
  SELECT rol INTO user_rol FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF user_rol = 'admin' THEN
    RETURN TRUE; -- admin puede todo, no hay conflicto
  END IF;

  -- ¿Existe una restricción SoD que incluya este par?
  SELECT EXISTS (
    SELECT 1 FROM public.sod_constraints
    WHERE (module_a = p_module_a AND action_a = p_action_a AND module_b = p_module_b AND action_b = p_action_b)
       OR (module_a = p_module_b AND action_a = p_action_b AND module_b = p_module_a AND action_b = p_action_a)
  ) INTO conflict_exists;

  IF NOT conflict_exists THEN
    RETURN TRUE; -- no hay regla SoD para este par
  END IF;

  -- ¿El rol tiene permiso para acción A?
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE rol = user_rol AND (module = p_module_a OR module = '*') AND (action = p_action_a OR action = '*')
  ) INTO has_a;

  -- ¿El rol tiene permiso para acción B?
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE rol = user_rol AND (module = p_module_b OR module = '*') AND (action = p_action_b OR action = '*')
  ) INTO has_b;

  -- Conflicto solo si tiene ambos
  RETURN NOT (has_a AND has_b);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4) Función: listar conflictos SoD para el rol actual (para uso en frontend)
CREATE OR REPLACE FUNCTION public.get_sod_violations_for_current_user()
RETURNS TABLE(module_a TEXT, action_a TEXT, module_b TEXT, action_b TEXT, description TEXT) AS $$
  SELECT c.module_a, c.action_a, c.module_b, c.action_b, c.description
  FROM public.sod_constraints c
  WHERE EXISTS (
    SELECT 1 FROM public.role_permissions rp1, public.role_permissions rp2, public.users u
    WHERE u.auth_user_id = auth.uid()
      AND rp1.rol = u.rol AND (rp1.module = c.module_a OR rp1.module = '*') AND (rp1.action = c.action_a OR rp1.action = '*')
      AND rp2.rol = u.rol AND (rp2.module = c.module_b OR rp2.module = '*') AND (rp2.action = c.action_b OR rp2.action = '*')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON TABLE public.sod_constraints IS 'Matriz SoD: pares de (módulo, acción) que no pueden estar en el mismo rol';
COMMENT ON FUNCTION public.check_sod(TEXT, TEXT, TEXT, TEXT) IS 'Devuelve true si no hay conflicto SoD para el usuario actual; false si tiene ambos permisos';
