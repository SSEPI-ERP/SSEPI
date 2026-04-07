-- =============================================================================
-- Tabla users_ver_costos: define qué usuarios pueden ver costos en Inventario (y demás pantallas).
-- Si ver_costos = false, la app no muestra columnas Costo/Valor ni tarjeta Valor Total.
-- Ejecutar en Supabase SQL Editor después de ensure-public-users.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users_ver_costos (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ver_costos BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.users_ver_costos IS 'Control de visibilidad de costos por usuario: false = no ver costos/valor en Inventario';

ALTER TABLE public.users_ver_costos ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario puede leer su fila; admin puede leer/actualizar todas
DROP POLICY IF EXISTS users_ver_costos_select_own ON public.users_ver_costos;
CREATE POLICY users_ver_costos_select_own ON public.users_ver_costos FOR SELECT TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS users_ver_costos_all_admin ON public.users_ver_costos;
CREATE POLICY users_ver_costos_all_admin ON public.users_ver_costos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

GRANT SELECT ON public.users_ver_costos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.users_ver_costos TO authenticated;

-- Poblar: usuarios que NO deben ver costos (ventas1, ivan, y cualquier rol ventas/ventas_sin_compras/taller)
INSERT INTO public.users_ver_costos (auth_user_id, ver_costos)
SELECT u.auth_user_id, false
FROM public.users u
WHERE u.email IN ('ventas1@ssepi.org', 'ivang.ssepi@gmail.com')
   OR u.rol IN ('ventas', 'ventas_sin_compras', 'taller')
ON CONFLICT (auth_user_id) DO UPDATE SET ver_costos = false, updated_at = NOW();

-- Opcional: asegurar que el resto tenga ver_costos = true (no insertar si ya existe para no sobrescribir)
-- INSERT INTO public.users_ver_costos (auth_user_id, ver_costos)
-- SELECT u.auth_user_id, true FROM public.users u
-- WHERE NOT EXISTS (SELECT 1 FROM public.users_ver_costos uv WHERE uv.auth_user_id = u.auth_user_id)
-- ON CONFLICT (auth_user_id) DO NOTHING;
