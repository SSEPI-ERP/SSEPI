-- ============================================================
-- ABAC (Control de Acceso Basado en Atributos) para RLS
-- Ejecutar después de ajuste-rls-para-usuarios.sql
-- Usa atributos en public.users (departamento, sede, nivel_riesgo) y
-- condiciones sobre recurso/contexto (ej. monto, horario).
-- ============================================================

-- 1) Atributos en public.users para ABAC
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sede TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nivel_riesgo TEXT; -- 'bajo', 'medio', 'alto'

-- 2) Función helper: devuelve el valor de un atributo del usuario actual desde public.users
CREATE OR REPLACE FUNCTION public.get_user_attr(attr TEXT)
RETURNS TEXT AS $$
  SELECT CASE attr
    WHEN 'rol' THEN (SELECT rol FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    WHEN 'departamento' THEN (SELECT departamento FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    WHEN 'sede' THEN (SELECT sede FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    WHEN 'nivel_riesgo' THEN (SELECT nivel_riesgo FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3) Función: es admin (compatibilidad con políticas existentes)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND rol = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4) Política ABAC de ejemplo: compras por departamento y monto
-- Solo aplica si la tabla compras tiene columna total; si no, la política existente (admin) sigue vigente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'total') THEN
    DROP POLICY IF EXISTS compras_abac_departamento ON public.compras;
    CREATE POLICY compras_abac_departamento ON public.compras
      FOR ALL
      USING (
        is_admin()
        OR (get_user_attr('departamento') = 'compras' AND (total IS NULL OR total <= 50000))
      )
      WITH CHECK (
        is_admin()
        OR (get_user_attr('departamento') = 'compras' AND (total IS NULL OR total <= 50000))
      );
  END IF;
END $$;

-- 5) Vista usuarios ya incluye nuevas columnas (es SELECT * FROM public.users)
COMMENT ON FUNCTION public.get_user_attr(TEXT) IS 'ABAC: devuelve atributo del usuario actual (rol, departamento, sede, nivel_riesgo)';
COMMENT ON FUNCTION public.is_admin() IS 'Devuelve true si el usuario actual tiene rol admin en public.users';
