-- =====================================================
-- RECONEXIÓN DE FLUJO ERP - VERSIÓN FINAL
-- Ejecutado exitosamente en Supabase
-- Fecha: 2026-04-23
-- =====================================================

-- 1. TABLA compras_items (normalizar JSON)
CREATE TABLE IF NOT EXISTS public.compras_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    compra_id UUID REFERENCES public.compras(id) ON DELETE CASCADE,
    sku TEXT,
    descripcion TEXT NOT NULL,
    cantidad NUMERIC(10,2) DEFAULT 1,
    costo_unitario NUMERIC(12,2) DEFAULT 0,
    costo_total NUMERIC(12,2) DEFAULT 0,
    link_proveedor TEXT,
    recibido BOOLEAN DEFAULT false,
    cantidad_recibida NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compras_items_compra ON public.compras_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compras_items_sku ON public.compras_items(sku);
ALTER TABLE public.compras_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_items_select ON public.compras_items;
CREATE POLICY compras_items_select ON public.compras_items FOR SELECT USING (true);
DROP POLICY IF EXISTS compras_items_admin ON public.compras_items;
CREATE POLICY compras_items_admin ON public.compras_items FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'compras'));

-- 2. TABLA reservas_material
CREATE TABLE IF NOT EXISTS public.reservas_material (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo TEXT NOT NULL,
    sku TEXT NOT NULL,
    cantidad NUMERIC(10,2) NOT NULL,
    fecha_reserva TIMESTAMPTZ DEFAULT NOW(),
    fecha_expiracion TIMESTAMPTZ,
    estado TEXT DEFAULT 'activa',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservas_orden ON public.reservas_material(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_reservas_sku ON public.reservas_material(sku);
ALTER TABLE public.reservas_material ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reservas_material_select ON public.reservas_material;
CREATE POLICY reservas_material_select ON public.reservas_material FOR SELECT USING (true);
DROP POLICY IF EXISTS reservas_material_admin ON public.reservas_material;
CREATE POLICY reservas_material_admin ON public.reservas_material FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'taller', 'motores', 'automatizacion'));

-- 3. TABLA ordenes_costos
CREATE TABLE IF NOT EXISTS public.ordenes_costos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo TEXT NOT NULL,
    concepto TEXT NOT NULL,
    categoria TEXT NOT NULL,
    monto NUMERIC(12,2) NOT NULL DEFAULT 0,
    documento_origen TEXT,
    documento_id UUID,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_orden ON public.ordenes_costos(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_categoria ON public.ordenes_costos(categoria);
ALTER TABLE public.ordenes_costos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordenes_costos_select ON public.ordenes_costos;
CREATE POLICY ordenes_costos_select ON public.ordenes_costos FOR SELECT USING (true);
DROP POLICY IF EXISTS ordenes_costos_admin ON public.ordenes_costos;
CREATE POLICY ordenes_costos_admin ON public.ordenes_costos FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- 4. VISTA costos_por_orden
CREATE OR REPLACE VIEW public.costos_por_orden AS
SELECT
    oc.orden_id,
    oc.orden_tipo,
    SUM(CASE WHEN oc.categoria = 'compras' THEN oc.monto ELSE 0 END) AS compras_total,
    SUM(CASE WHEN oc.categoria = 'refacciones' THEN oc.monto ELSE 0 END) AS refacciones_total,
    SUM(CASE WHEN oc.categoria = 'mano_obra' THEN oc.monto ELSE 0 END) AS mano_obra_total,
    SUM(CASE WHEN oc.categoria = 'viaticos' THEN oc.monto ELSE 0 END) AS viaticos_total,
    SUM(oc.monto) AS costo_total
FROM public.ordenes_costos oc
GROUP BY oc.orden_id, oc.orden_tipo;

-- 5. COLUMNAS en compras
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'costo_real') THEN
        ALTER TABLE public.compras ADD COLUMN costo_real NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'fecha_recepcion') THEN
        ALTER TABLE public.compras ADD COLUMN fecha_recepcion TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'recibido_por') THEN
        ALTER TABLE public.compras ADD COLUMN recibido_por UUID;
    END IF;
END $$;

-- 6. COLUMNAS por_facturar en ordenes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'por_facturar') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN por_facturar BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_motores' AND column_name = 'por_facturar') THEN
        ALTER TABLE public.ordenes_motores ADD COLUMN por_facturar BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proyectos_automatizacion' AND column_name = 'por_facturar') THEN
        ALTER TABLE public.proyectos_automatizacion ADD COLUMN por_facturar BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 7. ÍNDICES en facturas
CREATE INDEX IF NOT EXISTS idx_facturas_orden_taller ON public.facturas USING btree (orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_facturas_orden_motor ON public.facturas USING btree (orden_motor_id);
CREATE INDEX IF NOT EXISTS idx_facturas_venta ON public.facturas USING btree (venta_id);

-- 8. FUNCIÓN registrar_movimiento_inventario
DROP FUNCTION IF EXISTS public.registrar_movimiento_inventario(TEXT, TEXT, NUMERIC, TEXT, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
    p_sku TEXT,
    p_tipo TEXT,
    p_cantidad NUMERIC,
    p_motivo TEXT,
    p_referencia_id UUID,
    p_usuario_id UUID DEFAULT auth.uid(),
    p_producto_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_delta NUMERIC;
    v_fecha DATE := CURRENT_DATE;
    v_hash TEXT;
BEGIN
    SELECT cantidad INTO v_stock_anterior FROM public.inventario WHERE sku = p_sku;
    v_stock_anterior := COALESCE(v_stock_anterior, 0);

    IF p_tipo = 'entrada' THEN
        v_delta := p_cantidad;
    ELSIF p_tipo = 'salida' THEN
        v_delta := -p_cantidad;
    ELSIF p_tipo = 'ajuste' THEN
        v_stock_nuevo := p_cantidad::INTEGER;
        v_delta := NULL;
    ELSE
        v_delta := CASE WHEN p_tipo LIKE '%salida%' THEN -p_cantidad ELSE p_cantidad END;
    END IF;

    IF p_tipo != 'ajuste' THEN
        v_stock_nuevo := v_stock_anterior + v_delta::INTEGER;
    END IF;

    UPDATE public.inventario SET cantidad = v_stock_nuevo WHERE sku = p_sku;

    v_hash := encode(sha256((p_sku || p_tipo || p_cantidad || NOW()::TEXT)::bytea), 'hex');

    INSERT INTO public.movimientos_inventario (
        producto_id, sku, tipo_movimiento, cantidad, stock_anterior, stock_nuevo,
        motivo, referencia_id, usuario_id, created_at, hash, fecha
    ) VALUES (
        p_producto_id, p_sku, p_tipo, p_cantidad::INTEGER, v_stock_anterior, v_stock_nuevo,
        p_motivo, p_referencia_id, p_usuario_id, NOW(), v_hash, v_fecha
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. FUNCIÓN reservar_material
DROP FUNCTION IF EXISTS public.reservar_material(UUID, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.reservar_material(
    p_orden_id UUID,
    p_orden_tipo TEXT,
    p_items JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
    item JSONB;
    v_sku TEXT;
    v_cantidad NUMERIC;
    v_stock_actual INTEGER;
    v_reservado NUMERIC;
    v_disponible NUMERIC;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := item->>'sku';
        v_cantidad := (item->>'cantidad')::NUMERIC;

        SELECT cantidad INTO v_stock_actual FROM public.inventario WHERE sku = v_sku;
        v_stock_actual := COALESCE(v_stock_actual, 0);

        SELECT COALESCE(SUM(cantidad), 0) INTO v_reservado
        FROM public.reservas_material
        WHERE sku = v_sku AND estado = 'activa' AND (fecha_expiracion IS NULL OR fecha_expiracion > NOW());

        v_disponible := v_stock_actual - v_reservado;

        IF v_disponible < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para SKU %: disponible=%, solicitado=%', v_sku, v_disponible, v_cantidad;
        END IF;

        INSERT INTO public.reservas_material (orden_id, orden_tipo, sku, cantidad, fecha_expiracion)
        VALUES (p_orden_id, p_orden_tipo, v_sku, v_cantidad, NOW() + INTERVAL '7 days');
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. FUNCIÓN recibir_compra
DROP FUNCTION IF EXISTS public.recibir_compra(UUID, UUID);
CREATE OR REPLACE FUNCTION public.recibir_compra(
    p_compra_id UUID,
    p_usuario_id UUID DEFAULT auth.uid()
)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
    v_costo_real NUMERIC := 0;
BEGIN
    FOR v_item IN SELECT * FROM public.compras_items WHERE compra_id = p_compra_id
    LOOP
        PERFORM public.registrar_movimiento_inventario(
            p_sku := v_item.sku,
            p_tipo := 'entrada',
            p_cantidad := v_item.cantidad_recibida,
            p_motivo := 'compra',
            p_referencia_id := p_compra_id,
            p_usuario_id := p_usuario_id
        );

        v_costo_real := v_costo_real + v_item.costo_total;

        UPDATE public.compras_items
        SET recibido = true, cantidad_recibida = v_item.cantidad_recibida
        WHERE id = v_item.id;
    END LOOP;

    UPDATE public.compras
        SET fecha_recepcion = NOW(),
        recibido_por = p_usuario_id,
        costo_real = v_costo_real,
        estado = 4
    WHERE id = p_compra_id;

    UPDATE public.reservas_material
        SET estado = 'usada', fecha_expiracion = NOW()
    WHERE orden_id IN (
        SELECT CASE WHEN vinculacion->>'tipo' IN ('taller', 'motor', 'proyecto', 'automatizacion')
               THEN (vinculacion->>'id')::UUID END
        FROM public.compras WHERE id = p_compra_id
    ) AND estado = 'activa';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Recargar schema
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
