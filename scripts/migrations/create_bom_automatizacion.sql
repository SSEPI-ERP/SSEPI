-- =====================================================
-- Tabla bom_automatizacion para cloud
-- Mapea local_bom_automatizacion de SSEPI-NEXT.
-- Ejecutar en Supabase SQL Editor antes de migrar fase 5.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.bom_automatizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_item integer,
  part_number text,
  descripcion text,
  categoria text,
  categoria_original text,
  estado_actualizacion text,
  tiene_imagen boolean DEFAULT false,
  proveedores jsonb DEFAULT '[]'::jsonb,
  mejor_precio numeric,
  tipo text DEFAULT 'bom_automatizacion',
  imagen_url text,
  notas text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS básica: autenticados pueden leer; admin/superadmin/automatizacion pueden escribir.
ALTER TABLE public.bom_automatizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bom_automatizacion_admin_all ON public.bom_automatizacion;
DROP POLICY IF EXISTS bom_automatizacion_automatizacion_all ON public.bom_automatizacion;
DROP POLICY IF EXISTS bom_automatizacion_team_read ON public.bom_automatizacion;

CREATE POLICY bom_automatizacion_admin_all ON public.bom_automatizacion
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin','superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin','superadmin'));

CREATE POLICY bom_automatizacion_automatizacion_all ON public.bom_automatizacion
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() = 'automatizacion')
  WITH CHECK (public.ssepi_current_rol() = 'automatizacion');

CREATE POLICY bom_automatizacion_team_read ON public.bom_automatizacion
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('ventas','compras','contabilidad','facturacion','taller'));

NOTIFY pgrst, 'reload schema';
