-- =====================================================
-- Tabla: user_module_permissions
-- Descripción: Permite activar/desactivar módulos específicos por usuario
-- Uso: Configuración > Módulos por Usuario (switches)
-- =====================================================

-- Crear tabla de permisos por usuario
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.usuarios(auth_user_id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module)
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id
  ON public.user_module_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module
  ON public.user_module_permissions(module);

-- RLS (Row Level Security)
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios autenticados pueden leer sus propios permisos
CREATE POLICY "Usuarios pueden leer sus propios permisos"
  ON public.user_module_permissions
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM public.usuarios WHERE id = user_module_permissions.user_id
    )
  );

-- Política: Solo admins pueden insertar/actualizar/borrar permisos
CREATE POLICY "Solo admins gestionan permisos de usuarios"
  ON public.user_module_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE auth_user_id = auth.uid()
        AND rol IN ('admin', 'superadmin')
    )
  );

-- Comentario descriptivo
COMMENT ON TABLE public.user_module_permissions IS
  'Permisos individuales por usuario para activar/desactivar módulos específicos. Se gestiona desde Configuración > Módulos por Usuario.';

COMMENT ON COLUMN public.user_module_permissions.enabled IS
  'true = el usuario puede ver/acceder al módulo; false = módulo oculto para este usuario';
