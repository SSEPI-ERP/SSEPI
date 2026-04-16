-- =====================================================
-- Tabla: user_module_permissions
-- Descripción: Activar/desactivar módulos por usuario (auth.users)
-- Uso: Configuración > Módulos por Usuario (user_id = auth.uid() del perfil)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id
  ON public.user_module_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module
  ON public.user_module_permissions(module);

COMMENT ON TABLE public.user_module_permissions IS
  'Permisos por usuario: enabled=false oculta el módulo además del rol. user_id es el UUID de auth.users.';

COMMENT ON COLUMN public.user_module_permissions.enabled IS
  'true = módulo visible/activo para el usuario; false = desactivado para este usuario';
