-- ============================================
-- CREAR TABLAS FALTANTES - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. ORDENES COSTOS
CREATE TABLE IF NOT EXISTS public.ordenes_costos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo VARCHAR(50) NOT NULL,
    concepto VARCHAR(100) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    monto NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_orden ON ordenes_costos(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_categoria ON ordenes_costos(categoria);
ALTER TABLE ordenes_costos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ordenes_costos_all') THEN
        CREATE POLICY ordenes_costos_all ON ordenes_costos
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. RESERVAS MATERIAL
CREATE TABLE IF NOT EXISTS public.reservas_material (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo VARCHAR(50) NOT NULL,
    producto_id UUID,
    cantidad NUMERIC(10,2) DEFAULT 1,
    estado VARCHAR(20) DEFAULT 'pendiente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservas_orden ON reservas_material(orden_id, orden_tipo);
ALTER TABLE reservas_material ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reservas_material_all') THEN
        CREATE POLICY reservas_material_all ON reservas_material
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. VISTA COSTOS POR ORDEN
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
