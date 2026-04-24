-- =====================================================
-- RECONEXIÓN DE FLUJO ERP - Normalización y Conexiones
-- Basado en DIAGNOSTICO-FLUJO-ERP.md
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- ================================================
-- 1. TABLA compras_items (normalizar JSON)
-- ================================================
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

-- RLS para compras_items
ALTER TABLE public.compras_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_items_select ON public.compras_items;
CREATE POLICY compras_items_select ON public.compras_items
    FOR SELECT USING (true);

DROP POLICY IF EXISTS compras_items_admin ON public.compras_items;
CREATE POLICY compras_items_admin ON public.compras_items
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'compras'));

-- ================================================
-- 2. TABLA reservas_material (evitar vender reservado)
-- ================================================
CREATE TABLE IF NOT EXISTS public.reservas_material (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo TEXT NOT NULL CHECK (orden_tipo IN ('taller', 'motores', 'automatizacion')),
    sku TEXT NOT NULL,
    cantidad NUMERIC(10,2) NOT NULL,
    fecha_reserva TIMESTAMPTZ DEFAULT NOW(),
    fecha_expiracion TIMESTAMPTZ,
    estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa', 'usada', 'cancelada')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservas_orden ON public.reservas_material(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_reservas_sku ON public.reservas_material(sku);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON public.reservas_material(estado);

-- RLS para reservas_material
ALTER TABLE public.reservas_material ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservas_material_select ON public.reservas_material;
CREATE POLICY reservas_material_select ON public.reservas_material
    FOR SELECT USING (true);

DROP POLICY IF EXISTS reservas_material_admin ON public.reservas_material;
CREATE POLICY reservas_material_admin ON public.reservas_material
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'taller', 'motores', 'automatizacion'));

-- ================================================
-- 3. TABLA movimientos_inventario (auditoría)
-- ================================================
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'reserva', 'cancelacion_reserva')),
    cantidad NUMERIC(10,2) NOT NULL,
    saldo_anterior NUMERIC(10,2) DEFAULT 0,
    saldo_nuevo NUMERIC(10,2) DEFAULT 0,
    tabla_origen TEXT NOT NULL,
    id_origen UUID,
    usuario_id UUID,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_sku ON public.movimientos_inventario(sku);
CREATE INDEX IF NOT EXISTS idx_movimientos_origen ON public.movimientos_inventario(tabla_origen, id_origen);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON public.movimientos_inventario(created_at);

-- RLS para movimientos_inventario
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movimientos_inventario_select ON public.movimientos_inventario;
CREATE POLICY movimientos_inventario_select ON public.movimientos_inventario
    FOR SELECT USING (true);

DROP POLICY IF EXISTS movimientos_inventario_admin ON public.movimientos_inventario;
CREATE POLICY movimientos_inventario_admin ON public.movimientos_inventario
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'almacen'));

-- ================================================
-- 4. TABLA ordenes_costos (consolidar costos por orden)
-- ================================================
CREATE TABLE IF NOT EXISTS public.ordenes_costos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_id UUID NOT NULL,
    orden_tipo TEXT NOT NULL CHECK (orden_tipo IN ('taller', 'motores', 'automatizacion')),
    concepto TEXT NOT NULL,
    categoria TEXT NOT NULL CHECK (categoria IN ('compras', 'refacciones', 'mano_obra', 'viaticos', 'gastos_fijos', 'servicios_externos')),
    monto NUMERIC(12,2) NOT NULL DEFAULT 0,
    documento_origen TEXT,
    documento_id UUID,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_orden ON public.ordenes_costos(orden_id, orden_tipo);
CREATE INDEX IF NOT EXISTS idx_ordenes_costos_categoria ON public.ordenes_costos(categoria);

-- RLS para ordenes_costos
ALTER TABLE public.ordenes_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordenes_costos_select ON public.ordenes_costos;
CREATE POLICY ordenes_costos_select ON public.ordenes_costos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS ordenes_costos_admin ON public.ordenes_costos;
CREATE POLICY ordenes_costos_admin ON public.ordenes_costos
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- ================================================
-- 5. VISTA costos_por_orden (para facturación)
-- ================================================
CREATE OR REPLACE VIEW public.costos_por_orden AS
SELECT
    oc.orden_id,
    oc.orden_tipo,
    SUM(CASE WHEN oc.categoria = 'compras' THEN oc.monto ELSE 0 END) AS compras_total,
    SUM(CASE WHEN oc.categoria = 'refacciones' THEN oc.monto ELSE 0 END) AS refacciones_total,
    SUM(CASE WHEN oc.categoria = 'mano_obra' THEN oc.monto ELSE 0 END) AS mano_obra_total,
    SUM(CASE WHEN oc.categoria = 'viaticos' THEN oc.monto ELSE 0 END) AS viaticos_total,
    SUM(CASE WHEN oc.categoria = 'gastos_fijos' THEN oc.monto ELSE 0 END) AS gastos_fijos_total,
    SUM(CASE WHEN oc.categoria = 'servicios_externos' THEN oc.monto ELSE 0 END) AS servicios_total,
    SUM(oc.monto) AS costo_total
FROM public.ordenes_costos oc
GROUP BY oc.orden_id, oc.orden_tipo;

-- ================================================
-- 6. AGREGAR columnas faltantes a tablas existentes
-- ================================================

-- Compras: agregar columna para costo real (después de recepción)
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

-- Ordenes: agregar columna "por_facturar"
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

-- ================================================
-- 7. AGREGAR índice en facturas.orden_id
-- ================================================
CREATE INDEX IF NOT EXISTS idx_facturas_orden_id ON public.facturas USING btree (orden_id);

-- ================================================
-- 8. FUNCIÓN para crear movimiento de inventario
-- ================================================
CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
    p_sku TEXT,
    p_tipo TEXT,
    p_cantidad NUMERIC,
    p_tabla_origen TEXT,
    p_id_origen UUID,
    p_usuario_id UUID DEFAULT auth.uid(),
    p_notas TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_saldo_anterior NUMERIC;
    v_saldo_nuevo NUMERIC;
    v_delta NUMERIC;
BEGIN
    -- Obtener saldo actual
    SELECT cantidad INTO v_saldo_anterior FROM public.inventario WHERE sku = p_sku;
    v_saldo_anterior := COALESCE(v_saldo_anterior, 0);

    -- Calcular delta según tipo
    IF p_tipo = 'entrada' THEN
        v_delta := p_cantidad;
    ELSIF p_tipo = 'salida' THEN
        v_delta := -p_cantidad;
    ELSIF p_tipo = 'ajuste' THEN
        v_delta := p_cantidad;  -- p_cantidad es el nuevo saldo
    ELSIF p_tipo = 'reserva' THEN
        v_delta := -p_cantidad;
    ELSIF p_tipo = 'cancelacion_reserva' THEN
        v_delta := p_cantidad;
    ELSE
        RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo;
    END IF;

    -- Calcular nuevo saldo
    IF p_tipo = 'ajuste' THEN
        v_saldo_nuevo := p_cantidad;
    ELSE
        v_saldo_nuevo := v_saldo_anterior + v_delta;
    END IF;

    -- Actualizar inventario
    UPDATE public.inventario SET cantidad = v_saldo_nuevo WHERE sku = p_sku;

    -- Registrar movimiento
    INSERT INTO public.movimientos_inventario (sku, tipo, cantidad, saldo_anterior, saldo_nuevo, tabla_origen, id_origen, usuario_id, notas)
    VALUES (p_sku, p_tipo, p_cantidad, v_saldo_anterior, v_saldo_nuevo, p_tabla_origen, p_id_origen, p_usuario_id, p_notas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 9. FUNCIÓN para reservar material
-- ================================================
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
    v_stock_actual NUMERIC;
    v_reservado NUMERIC;
    v_disponible NUMERIC;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := item->>'sku';
        v_cantidad := (item->>'cantidad')::NUMERIC;

        -- Obtener stock actual
        SELECT cantidad INTO v_stock_actual FROM public.inventario WHERE sku = v_sku;
        v_stock_actual := COALESCE(v_stock_actual, 0);

        -- Obtener ya reservado
        SELECT COALESCE(SUM(cantidad), 0) INTO v_reservado
        FROM public.reservas_material
        WHERE sku = v_sku AND estado = 'activa' AND (fecha_expiracion IS NULL OR fecha_expiracion > NOW());

        v_disponible := v_stock_actual - v_reservado;

        IF v_disponible < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para SKU %: disponible=%, solicitado=%', v_sku, v_disponible, v_cantidad;
        END IF;

        -- Crear reserva
        INSERT INTO public.reservas_material (orden_id, orden_tipo, sku, cantidad, fecha_expiracion)
        VALUES (p_orden_id, p_orden_tipo, v_sku, v_cantidad, NOW() + INTERVAL '7 days');
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 10. FUNCIÓN para recibir compra (actualizar inventario)
-- ================================================
CREATE OR REPLACE FUNCTION public.recibir_compra(
    p_compra_id UUID,
    p_usuario_id UUID DEFAULT auth.uid()
)
RETURNS VOID AS $$
DECLARE
    v_item RECORD;
    v_item_compra RECORD;
    v_costo_real NUMERIC := 0;
BEGIN
    -- Procesar cada item
    FOR v_item IN SELECT * FROM public.compras_items WHERE compra_id = p_compra_id
    LOOP
        -- Registrar entrada de inventario
        PERFORM public.registrar_movimiento_inventario(
            p_sku := v_item.sku,
            p_tipo := 'entrada',
            p_cantidad := v_item.cantidad_recibida,
            p_tabla_origen := 'compras',
            p_id_origen := p_compra_id,
            p_usuario_id := p_usuario_id,
            p_notas := 'Recepción de compra ' || p_compra_id
        );

        v_costo_real := v_costo_real + v_item.costo_total;

        -- Marcar item como recibido
        UPDATE public.compras_items
        SET recibido = true,
            cantidad_recibida = v_item.cantidad_recibida
        WHERE id = v_item.id;
    END LOOP;

    -- Actualizar compra
    UPDATE public.compras
    SET fecha_recepcion = NOW(),
        recibido_por = p_usuario_id,
        costo_real = v_costo_real,
        estado = 4  -- "Recibido"
    WHERE id = p_compra_id;

    -- Liberar reservas relacionadas
    UPDATE public.reservas_material
    SET estado = 'usada',
        fecha_expiracion = NOW()
    WHERE orden_id IN (
        SELECT
            CASE WHEN vinculacion->>'tipo' = 'taller' THEN (vinculacion->>'id')::UUID
                 WHEN vinculacion->>'tipo' = 'motor' THEN (vinculacion->>'id')::UUID
                 WHEN vinculacion->>'tipo' IN ('proyecto', 'automatizacion') THEN (vinculacion->>'id')::UUID
            END
        FROM public.compras WHERE id = p_compra_id
    ) AND estado = 'activa';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 11. PERMISOS - actualizar role_permissions
-- ================================================
INSERT INTO public.role_permissions (rol, modulo, permiso, creado_en) VALUES
    ('almacen', 'inventario', 'write', NOW()),
    ('almacen', 'compras', 'read', NOW()),
    ('compras', 'compras_items', 'write', NOW()),
    ('taller', 'reservas_material', 'write', NOW()),
    ('motores', 'reservas_material', 'write', NOW()),
    ('automatizacion', 'reservas_material', 'write', NOW())
ON CONFLICT (rol, modulo, permiso) DO NOTHING;

-- ================================================
-- 12. Recargar schema
-- ================================================
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================

-- ================================================
-- INSTRUCCIONES DE USO:
-- ================================================
-- 1. Ejecutar este SQL en Supabase SQL Editor
-- 2. Actualizar compras.js para usar compras_items
-- 3. Actualizar taller.js/motores.js para usar reservar_material()
-- 4. Agregar botón "Recibir" en compras.js que llame a recibir_compra()
-- 5. Actualizar facturacion.js para usar vista costos_por_orden
-- =====================================================
