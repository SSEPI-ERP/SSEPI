-- =====================================================
-- FIX RLS: ordenes_motores - Permitir todo a usuarios autenticados
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1) Habilitar RLS (si no está habilitada)
ALTER TABLE public.ordenes_motores ENABLE ROW LEVEL SECURITY;

-- 2) Eliminar políticas antiguas si existen (para evitar conflictos)
DROP POLICY IF EXISTS "Admin ve todo motores" ON public.ordenes_motores;
DROP POLICY IF EXISTS "Motores lee motores" ON public.ordenes_motores;
DROP POLICY IF EXISTS "Motores crea motores" ON public.ordenes_motores;
DROP POLICY IF EXISTS "Authenticated full access motores" ON public.ordenes_motores;

-- 3) Crear política única para usuarios autenticados (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Authenticated full access motores"
ON public.ordenes_motores
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4) Asegurar que el rol anon NO tenga acceso (seguridad por defecto)
-- Nota: si usas Service Role Key desde backend, esto no afecta.

-- 5) Recargar schema
NOTIFY pgrst, 'reload schema';
