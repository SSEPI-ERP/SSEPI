-- =============================================================================
-- Calculadoras: lectura para todo authenticated + escritura para equipo SSEPI
-- Ejecutar después de calculadoras-modulo.sql
-- =============================================================================

-- Permisos de menú / hasPermission (lectura)
INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('automatizacion', 'calculadoras', 'read'),
  ('taller', 'calculadoras', 'read'),
  ('contabilidad', 'calculadoras', 'read'),
  ('ventas', 'calculadoras', 'read')
) AS v(rol, module, action)
ON CONFLICT (rol, module, action) DO NOTHING;

INSERT INTO public.role_permissions (rol, module, action)
SELECT v.rol, v.module, v.action FROM (VALUES
  ('automatizacion', 'calculadoras', 'update'),
  ('taller', 'calculadoras', 'update'),
  ('contabilidad', 'calculadoras', 'update')
) AS v(rol, module, action)
ON CONFLICT (rol, module, action) DO NOTHING;

-- Helper: usuario con rol de equipo que edita calculadoras
CREATE OR REPLACE FUNCTION public.ssepi_calculadoras_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.rol IN ('admin', 'superadmin', 'automatizacion', 'taller', 'contabilidad')
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.rol IN ('admin', 'superadmin', 'automatizacion', 'taller', 'contabilidad')
  );
$$;

DROP POLICY IF EXISTS calculadoras_admin_all ON public.calculadoras;
DROP POLICY IF EXISTS calculadora_costos_admin_all ON public.calculadora_costos;
DROP POLICY IF EXISTS calculadora_clientes_admin_all ON public.calculadora_clientes;

-- Lectura: cualquier sesión válida
CREATE POLICY calculadoras_select_auth ON public.calculadoras
  FOR SELECT TO authenticated USING (true);

CREATE POLICY calculadora_costos_select_auth ON public.calculadora_costos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY calculadora_clientes_select_auth ON public.calculadora_clientes
  FOR SELECT TO authenticated USING (true);

-- Escritura: admin, superadmin, automatizacion, taller, contabilidad
CREATE POLICY calculadoras_mutate_editors ON public.calculadoras
  FOR ALL TO authenticated
  USING (public.ssepi_calculadoras_editor())
  WITH CHECK (public.ssepi_calculadoras_editor());

CREATE POLICY calculadora_costos_mutate_editors ON public.calculadora_costos
  FOR ALL TO authenticated
  USING (public.ssepi_calculadoras_editor())
  WITH CHECK (public.ssepi_calculadoras_editor());

CREATE POLICY calculadora_clientes_mutate_editors ON public.calculadora_clientes
  FOR ALL TO authenticated
  USING (public.ssepi_calculadoras_editor())
  WITH CHECK (public.ssepi_calculadoras_editor());
