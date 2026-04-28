-- ============================================================================
-- Fix RLS para proyectos_automatizacion
-- Habilita SELECT, INSERT, UPDATE, DELETE para usuarios autenticados
-- ============================================================================

-- Asegurar que RLS esté habilitado
ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes para evitar duplicados
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.proyectos_automatizacion;

-- Política SELECT: cualquier usuario autenticado puede leer
CREATE POLICY "Allow select for authenticated"
  ON public.proyectos_automatizacion
  FOR SELECT
  TO authenticated
  USING (true);

-- Política INSERT: cualquier usuario autenticado puede insertar
CREATE POLICY "Allow insert for authenticated"
  ON public.proyectos_automatizacion
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política UPDATE: cualquier usuario autenticado puede actualizar
CREATE POLICY "Allow update for authenticated"
  ON public.proyectos_automatizacion
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Política DELETE: cualquier usuario autenticado puede eliminar
CREATE POLICY "Allow delete for authenticated"
  ON public.proyectos_automatizacion
  FOR DELETE
  TO authenticated
  USING (true);
