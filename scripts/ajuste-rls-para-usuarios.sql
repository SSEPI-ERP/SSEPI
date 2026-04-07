-- ============================================================
-- ERP Supabase: RLS con public.users + usuario admin
-- Ejecutar en Supabase SQL Editor (todo de una vez).
-- Asegura: vista usuarios, fila admin en users (rol = 'admin', nombre),
-- políticas FOR ALL para inventario, contactos, clientes (si existe),
-- compras; ventas solo si la tabla existe.
-- ============================================================

-- 1) Vista de compatibilidad (código que use "usuarios" sigue funcionando)
CREATE OR REPLACE VIEW public.usuarios AS SELECT * FROM public.users;

-- 2) Columnas en public.users si no existen
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nombre TEXT;

-- 2b) RLS en public.users: cada usuario debe poder leer su propia fila (para getCurrentProfile y para las políticas que usan SELECT ... FROM public.users)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read_own ON public.users;
CREATE POLICY users_read_own ON public.users
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 3) Usuario admin: UID 65a2920c-bb4a-4b64-9e31-ccd47545120d con rol 'admin' y nombre
-- Incluye nombre para cumplir NOT NULL si la tabla lo exige.
INSERT INTO public.users (auth_user_id, rol, email, nombre)
VALUES ('65a2920c-bb4a-4b64-9e31-ccd47545120d', 'admin', 'norbertomoro4@gmail.com', 'Admin')
ON CONFLICT (auth_user_id) DO UPDATE SET
  rol = 'admin',
  email = EXCLUDED.email,
  nombre = COALESCE(EXCLUDED.nombre, public.users.nombre);

-- Si falla ON CONFLICT (p. ej. no hay UNIQUE en auth_user_id), ejecuta solo:
-- UPDATE public.users SET rol = 'admin', email = 'norbertomoro4@gmail.com', nombre = 'Admin' WHERE auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d';
-- (o INSERT sin ON CONFLICT si la fila no existe).

-- 4) INVENTARIO: FOR ALL para admin vía public.users
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventario_admin_all ON public.inventario;
CREATE POLICY inventario_admin_all ON public.inventario
  FOR ALL
  USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'));

-- 5) CONTACTOS: FOR ALL para admin vía public.users
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contactos_admin_all ON public.contactos;
CREATE POLICY contactos_admin_all ON public.contactos
  FOR ALL
  USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'));

-- 6) CLIENTES: FOR ALL para admin (solo si la tabla existe; el módulo Contactos también lee de clientes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
    CREATE POLICY clientes_admin_all ON public.clientes
      FOR ALL
      USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'));
  END IF;
END $$;

-- 7) COMPRAS: FOR ALL para admin vía public.users
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_admin_all ON public.compras;
CREATE POLICY compras_admin_all ON public.compras
  FOR ALL
  USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'));

-- 8) VENTAS: FOR ALL para admin solo si la tabla existe (evitar error 42P01)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ventas') THEN
    ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ventas_admin_all ON public.ventas;
    CREATE POLICY ventas_admin_all ON public.ventas
      FOR ALL
      USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE rol = 'admin'));
  END IF;
END $$;

-- Listo. Recarga la app e inicia sesión con el usuario cuyo UID es 65a2920c-bb4a-4b64-9e31-ccd47545120d.
-- Si en public.users sigue rol = 'administrador', ejecuta:
--   UPDATE public.users SET rol = 'admin' WHERE auth_user_id = '65a2920c-bb4a-4b64-9e31-ccd47545120d';
