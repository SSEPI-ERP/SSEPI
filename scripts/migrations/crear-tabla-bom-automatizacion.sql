-- =====================================================
-- Tabla: bom_automatizacion
-- Descripción: Bill of Materials (Lista de Materiales) para proyectos de automatización
-- Uso: Integración con calculadoras de costos
-- =====================================================

-- Crear tabla BOM Automatización
CREATE TABLE IF NOT EXISTS public.bom_automatizacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item INTEGER,
  numero_parte TEXT,
  descripcion TEXT NOT NULL,
  categoria TEXT,
  estado TEXT DEFAULT 'Activo',
  proveedor TEXT,
  precio_unitario NUMERIC(12,2) DEFAULT 0.00,
  moneda TEXT DEFAULT 'MXN',
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_bom_numero_parte ON public.bom_automatizacion(numero_parte);
CREATE INDEX IF NOT EXISTS idx_bom_categoria ON public.bom_automatizacion(categoria);
CREATE INDEX IF NOT EXISTS idx_bom_proveedor ON public.bom_automatizacion(proveedor);

-- RLS (Row Level Security)
ALTER TABLE public.bom_automatizacion ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios autenticados pueden leer
CREATE POLICY "Usuarios autenticados pueden leer BOM"
  ON public.bom_automatizacion
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Política: Solo admins pueden insertar/actualizar/borrar
CREATE POLICY "Solo admins gestionan BOM"
  ON public.bom_automatizacion
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE auth_user_id = auth.uid()
        AND rol IN ('admin', 'superadmin')
    )
  );

-- Comentario descriptivo
COMMENT ON TABLE public.bom_automatizacion IS
  'Bill of Materials (Lista de Materiales) para proyectos de automatización. Incluye costos y proveedores.';

-- =====================================================
-- Tabla: servicios_automatizacion
-- Descripción: Servicios de automatización con desglose de costos (planta vs oficina)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.servicios_automatizacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT,
  area TEXT,
  costo_planta NUMERIC(12,2) DEFAULT 0.00,
  costo_oficina NUMERIC(12,2) DEFAULT 0.00,
  horas_estimadas NUMERIC(8,2) DEFAULT 0.00,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_servicios_area ON public.servicios_automatizacion(area);
CREATE INDEX IF NOT EXISTS idx_servicios_tipo ON public.servicios_automatizacion(tipo);

-- RLS
ALTER TABLE public.servicios_automatizacion ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios autenticados pueden leer
CREATE POLICY "Usuarios autenticados pueden leer servicios"
  ON public.servicios_automatizacion
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Política: Solo admins pueden gestionar
CREATE POLICY "Solo admins gestionan servicios"
  ON public.servicios_automatizacion
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE auth_user_id = auth.uid()
        AND rol IN ('admin', 'superadmin')
    )
  );

COMMENT ON TABLE public.servicios_automatizacion IS
  'Servicios de automatización con desglose de costos: planta (mano de obra directa, materiales) vs oficina (ingeniería, administración, viáticos).';

COMMENT ON COLUMN public.servicios_automatizacion.costo_planta IS
  'Costos directos de planta: mano de obra, materiales, herramientas, equipo especializado.';

COMMENT ON COLUMN public.servicios_automatizacion.costo_oficina IS
  'Costos indirectos de oficina: ingeniería, diseño, administración, viáticos, transporte.';
