-- ============================================
-- CREAR TABLAS ERP FALTANTES - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. FACTURAS (si no existe)
CREATE TABLE IF NOT EXISTS public.facturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio TEXT UNIQUE NOT NULL,
    serie TEXT DEFAULT 'A',
    orden_taller_id UUID REFERENCES public.ordenes_taller(id),
    orden_motor_id UUID REFERENCES public.ordenes_motores(id),
    venta_id UUID REFERENCES public.cotizaciones(id),
    cliente_nombre TEXT NOT NULL,
    rfc TEXT,
    email TEXT,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    estado VARCHAR(20) DEFAULT 'activo',
    uuid_cfdi TEXT,
    sello_cfdi TEXT,
    cadena_original TEXT,
    fecha_emision TIMESTAMPTZ DEFAULT NOW(),
    fecha_timbrado TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facturas_orden_taller ON facturas(orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_facturas_orden_motor ON facturas(orden_motor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_venta ON facturas(venta_id);
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY facturas_all ON facturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. ORDENES_MOTORES - AGREGAR COLUMNAS FALTANTES
DO $$
BEGIN
    -- Agregar columnas si no existen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'cotizacion_id') THEN
        ALTER TABLE ordenes_motores ADD COLUMN cotizacion_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'cliente_id') THEN
        ALTER TABLE ordenes_motores ADD COLUMN cliente_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'tiene_compra') THEN
        ALTER TABLE ordenes_motores ADD COLUMN tiene_compra BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'compra_id') THEN
        ALTER TABLE ordenes_motores ADD COLUMN compra_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'por_facturar') THEN
        ALTER TABLE ordenes_motores ADD COLUMN por_facturar BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 3. PROYECTOS_AUTOMATIZACION - AGREGAR COLUMNAS FALTANTES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'cotizacion_id') THEN
        ALTER TABLE proyectos_automatizacion ADD COLUMN cotizacion_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'cliente_id') THEN
        ALTER TABLE proyectos_automatizacion ADD COLUMN cliente_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'tiene_compra') THEN
        ALTER TABLE proyectos_automatizacion ADD COLUMN tiene_compra BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'compra_id') THEN
        ALTER TABLE proyectos_automatizacion ADD COLUMN compra_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'por_facturar') THEN
        ALTER TABLE proyectos_automatizacion ADD COLUMN por_facturar BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 4. COTIZACIONES - AGREGAR COLUMNAS PARA VINCULACIÓN
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'orden_origen_id') THEN
        ALTER TABLE cotizaciones ADD COLUMN orden_origen_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'origen') THEN
        ALTER TABLE cotizaciones ADD COLUMN origen VARCHAR(50) DEFAULT 'directo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'departamento') THEN
        ALTER TABLE cotizaciones ADD COLUMN departamento VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'vendedor') THEN
        ALTER TABLE cotizaciones ADD COLUMN vendedor TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cotizaciones' AND column_name = 'cerebro_registro') THEN
        ALTER TABLE cotizaciones ADD COLUMN cerebro_registro JSONB;
    END IF;
END $$;

-- 5. COMPRAS - COLUMNAS PARA VINCULACIÓN
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'orden_id') THEN
        ALTER TABLE compras ADD COLUMN orden_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'orden_tipo') THEN
        ALTER TABLE compras ADD COLUMN orden_tipo VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'vinculacion') THEN
        ALTER TABLE compras ADD COLUMN vinculacion JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'costo_real') THEN
        ALTER TABLE compras ADD COLUMN costo_real NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'fecha_recepcion') THEN
        ALTER TABLE compras ADD COLUMN fecha_recepcion TIMESTAMPTZ;
    END IF;
END $$;

-- 6. HISTORIAL_ORDENES (tracking de eventos por orden)
CREATE TABLE IF NOT EXISTS public.historial_ordenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo VARCHAR(50) NOT NULL,
    evento VARCHAR(100) NOT NULL,
    descripcion TEXT,
    usuario UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historial_orden ON historial_ordenes(orden_id, orden_tipo);
ALTER TABLE historial_ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY historial_ordenes_all ON historial_ordenes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. ACTIVIDADES_CONTACTOS (ya existe pero verificamos)
CREATE TABLE IF NOT EXISTS public.actividades_contactos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contacto_id UUID NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
    actividad TEXT NOT NULL,
    completado BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE actividades_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY actividades_contactos_all ON actividades_contactos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. ACTUALIZAR VISTA COSTOS POR ORDEN (con todas las columnas)
DROP VIEW IF EXISTS public.costos_por_orden CASCADE;
CREATE VIEW public.costos_por_orden AS
SELECT orden_id, orden_tipo,
    COALESCE(SUM(CASE WHEN categoria = 'compra' THEN monto ELSE 0 END), 0) as compras_total,
    COALESCE(SUM(CASE WHEN categoria = 'refaccion' THEN monto ELSE 0 END), 0) as refacciones_total,
    COALESCE(SUM(CASE WHEN categoria = 'mano_obra' THEN monto ELSE 0 END), 0) as mano_obra_total,
    COALESCE(SUM(CASE WHEN categoria = 'viatico' THEN monto ELSE 0 END), 0) as viaticos_total,
    COALESCE(SUM(CASE WHEN categoria = 'gasto_fijo' THEN monto ELSE 0 END), 0) as gastos_fijos_total,
    COALESCE(SUM(monto), 0) as costo_total
FROM ordenes_costos
GROUP BY orden_id, orden_tipo;

-- 9. VERIFICACIÓN FINAL
SELECT 'TABLAS CREADAS/VERIFICADAS' as estado;
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'facturas', 'ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion',
    'cotizaciones', 'compras', 'compras_items', 'inventario', 'contactos',
    'movimientos_inventario', 'reservas_material', 'ordenes_costos',
    'historial_ordenes', 'actividades_contactos', 'clientes_tabulador'
  )
ORDER BY tablename;
