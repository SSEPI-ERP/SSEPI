-- Corregir rol del usuario ventas1: debe ser vendedor (ventas), no admin.
-- Si en public.users tiene rol = 'admin', verá costos y todo el sistema; este script lo deja como 'ventas'.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.users
SET rol = 'ventas'
WHERE email = 'ventas1@ssepi.org'
   OR email ILIKE '%ventas1%';
