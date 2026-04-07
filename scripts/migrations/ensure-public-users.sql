-- Asegura que exista la tabla public.users (auth_user_id, rol, email, nombre).
-- Ejecutar en Supabase SQL Editor si create-users-seed.js falla por tabla inexistente.
CREATE TABLE IF NOT EXISTS public.users (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL DEFAULT 'ventas',
  email TEXT,
  nombre TEXT
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nombre TEXT;

CREATE OR REPLACE VIEW public.usuarios AS SELECT * FROM public.users;

COMMENT ON TABLE public.users IS 'Perfiles de usuario vinculados a auth.users; vista usuarios para compatibilidad';
