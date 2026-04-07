-- Migración: Permitir a admin INSERT/UPDATE/DELETE en inventario y movimientos_inventario
-- Ejecutar en Supabase SQL Editor si la importación falla con muchos errores

DROP POLICY IF EXISTS inventario_admin_all ON inventario;
CREATE POLICY inventario_admin_all ON inventario
  FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');

DROP POLICY IF EXISTS movimientos_admin_all ON movimientos_inventario;
CREATE POLICY movimientos_admin_all ON movimientos_inventario
  FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');
