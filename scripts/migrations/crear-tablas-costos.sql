-- ============================================
-- CREAR TABLAS FALTANTES - NUEVO SUPABASE
-- Ejecutar en: https://knzmdwjmrhcoytmebdwa.supabase.co
-- ============================================

-- 1. VERIFICAR ESTRUCTURA EXISTENTE
SELECT 'TABLAS EXISTENTES:' as info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. CLIENTES TABULADOR (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'clientes_tabulador') THEN
        CREATE TABLE public.clientes_tabulador (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            cliente_nombre TEXT UNIQUE NOT NULL,
            km_ida NUMERIC(8,1) DEFAULT 0,
            horas_invertidas NUMERIC(5,1) DEFAULT 0,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX idx_clientes_tabulador_nombre ON public.clientes_tabulador(cliente_nombre);
        ALTER TABLE public.clientes_tabulador ENABLE ROW LEVEL SECURITY;
        CREATE POLICY clientes_tabulador_all ON public.clientes_tabulador FOR ALL TO authenticated USING (true) WITH CHECK (true);
        RAISE NOTICE 'Tabla clientes_tabulador creada';
    ELSE
        RAISE NOTICE 'Tabla clientes_tabulador ya existe';
    END IF;
END $$;

-- 3. COMPRAS ITEMS (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'compras_items') THEN
        CREATE TABLE public.compras_items (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            compra_id UUID NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
            descripcion TEXT NOT NULL,
            cantidad NUMERIC(10,2) DEFAULT 1,
            costo_unitario NUMERIC(12,2) DEFAULT 0,
            importe NUMERIC(12,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX idx_compras_items_compra_id ON public.compras_items(compra_id);
        ALTER TABLE public.compras_items ENABLE ROW LEVEL SECURITY;
        CREATE POLICY compras_items_all ON public.compras_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
        RAISE NOTICE 'Tabla compras_items creada';
    ELSE
        RAISE NOTICE 'Tabla compras_items ya existe';
    END IF;
END $$;

-- 4. RESERVAS MATERIAL (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'reservas_material') THEN
        CREATE TABLE public.reservas_material (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            orden_id UUID NOT NULL,
            orden_tipo VARCHAR(50) NOT NULL,
            item_id UUID,
            producto_id UUID,
            cantidad NUMERIC(10,2) DEFAULT 1,
            estado VARCHAR(20) DEFAULT 'pendiente',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX idx_reservas_orden ON public.reservas_material(orden_id, orden_tipo);
        ALTER TABLE public.reservas_material ENABLE ROW LEVEL SECURITY;
        CREATE POLICY reservas_material_all ON public.reservas_material FOR ALL TO authenticated USING (true) WITH CHECK (true);
        RAISE NOTICE 'Tabla reservas_material creada';
    ELSE
        RAISE NOTICE 'Tabla reservas_material ya existe';
    END IF;
END $$;

-- 5. ORDENES COSTOS (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ordenes_costos') THEN
        CREATE TABLE public.ordenes_costos (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            orden_id UUID NOT NULL,
            orden_tipo VARCHAR(50) NOT NULL,
            concepto VARCHAR(100) NOT NULL,
            categoria VARCHAR(50) NOT NULL,
            monto NUMERIC(12,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX idx_ordenes_costos_orden ON public.ordenes_costos(orden_id, orden_tipo);
        CREATE INDEX idx_ordenes_costos_categoria ON public.ordenes_costos(categoria);
        ALTER TABLE public.ordenes_costos ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ordenes_costos_all ON public.ordenes_costos FOR ALL TO authenticated USING (true) WITH CHECK (true);
        RAISE NOTICE 'Tabla ordenes_costos creada';
    ELSE
        RAISE NOTICE 'Tabla ordenes_costos ya existe';
    END IF;
END $$;

-- 6. VISTA COSTOS POR ORDEN (si no existe)
CREATE OR REPLACE VIEW public.costos_por_orden AS
SELECT
    orden_id,
    orden_tipo,
    COALESCE(SUM(CASE WHEN categoria = 'compra' THEN monto ELSE 0 END), 0) as compras_total,
    COALESCE(SUM(CASE WHEN categoria = 'refaccion' THEN monto ELSE 0 END), 0) as refacciones_total,
    COALESCE(SUM(CASE WHEN categoria = 'mano_obra' THEN monto ELSE 0 END), 0) as mano_obra_total,
    COALESCE(SUM(CASE WHEN categoria = 'viatico' THEN monto ELSE 0 END), 0) as viaticos_total,
    COALESCE(SUM(CASE WHEN categoria = 'gasto_fijo' THEN monto ELSE 0 END), 0) as gastos_fijos_total,
    COALESCE(SUM(monto), 0) as costo_total
FROM public.ordenes_costos
GROUP BY orden_id, orden_tipo;

-- 7. INSERTAR CLIENTES TABULADOR (si está vacía)
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.clientes_tabulador) = 0 THEN
        INSERT INTO public.clientes_tabulador (cliente_nombre, km_ida, horas_invertidas) VALUES
            ('ANGUIPLAST', 100, 0),
            ('BADER TABACHINES', 10, 0),
            ('BODYCOTE', 45, 0),
            ('COFICAB', 40, 0),
            ('CONDUMEX', 45, 0),
            ('ECSA', 16, 0),
            ('EPC 1', 200, 0),
            ('EPC 2', 200, 0),
            ('FRAENKISCHE', 45, 0),
            ('GEDNEY', 11, 0),
            ('GRUPO ACERERO', 200, 0),
            ('HALL PLANTA 1', 35, 0),
            ('HIRUTA PLANTA 1', 35, 0),
            ('IMPRENTA JM', 50, 0),
            ('JARDÍN LA ALEMANA', 30, 0),
            ('MAFLOW', 45, 0),
            ('MICROONDA', 40, 0),
            ('MINO INDUSTRY', 35, 0),
            ('MR LUCKY', 120, 0),
            ('NHK', 150, 0),
            ('NISHIKAWA', 45, 0),
            ('PIELES AZTECA', 80, 0),
            ('RONGTAI', 90, 0),
            ('SAFE DEMO', 25, 0),
            ('SERVIACERO ELECTROFORJADOS', 180, 0),
            ('SUACERO', 200, 0),
            ('TQ-1', 100, 0)
        ON CONFLICT (cliente_nombre) DO NOTHING;
        RAISE NOTICE 'Clientes tabulador insertados';
    END IF;
END $$;

-- VERIFICACIÓN FINAL
SELECT 'TABLAS CREADAS/VERIFICADAS' as estado;
SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clientes_tabulador', 'compras_items', 'reservas_material', 'ordenes_costos')
ORDER BY tablename;
