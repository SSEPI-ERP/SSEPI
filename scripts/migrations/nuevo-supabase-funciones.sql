-- ============================================
-- FUNCIONES RPC - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. LIMPIAR DUPLICADOS DE EMAIL
DELETE FROM contactos a
USING contactos b
WHERE a.email IS NOT NULL
  AND a.email = b.email
  AND a.id > b.id;

-- 2. ÍNDICE ÚNICO PARCIAL (solo emails no nulos)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_email_not_null
ON public.contactos (email)
WHERE email IS NOT NULL;

-- 3. REGISTRAR_MOVIMIENTO_INVENTARIO
CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
    p_producto_id UUID,
    p_tipo_movimiento VARCHAR(50),
    p_cantidad NUMERIC(10,2),
    p_stock_anterior NUMERIC(10,2),
    p_stock_nuevo NUMERIC(10,2),
    p_referencia_id UUID,
    p_motivo TEXT
) RETURNS UUID AS $$
DECLARE
    v_movimiento_id UUID;
BEGIN
    INSERT INTO public.movimientos_inventario (
        producto_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo,
        referencia_id, motivo, created_at
    ) VALUES (
        p_producto_id, p_tipo_movimiento, p_cantidad, p_stock_anterior, p_stock_nuevo,
        p_referencia_id, p_motivo, NOW()
    ) RETURNING id INTO v_movimiento_id;
    RETURN v_movimiento_id;
END;
$$ LANGUAGE plpgsql;

-- 4. RESERVAR_MATERIAL
CREATE OR REPLACE FUNCTION public.reservar_material(
    p_orden_id UUID,
    p_orden_tipo VARCHAR(50),
    p_items JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.reservas_material (
        orden_id, orden_tipo, producto_id, cantidad, estado, created_at
    )
    SELECT
        p_orden_id,
        p_orden_tipo,
        (item->>'producto_id')::UUID,
        (item->>'cantidad')::NUMERIC,
        'reservado',
        NOW()
    FROM jsonb_array_elements(p_items) AS item;
END;
$$ LANGUAGE plpgsql;

-- 5. RECIBIR_COMPRA
CREATE OR REPLACE FUNCTION public.recibir_compra(
    p_compra_id UUID,
    p_estado VARCHAR(50) DEFAULT 'recibido'
) RETURNS VOID AS $$
BEGIN
    UPDATE public.compras
    SET
        estado = CASE WHEN p_estado = 'recibido' THEN 2 ELSE estado END,
        fecha_recepcion = CASE WHEN p_estado = 'recibido' THEN NOW() ELSE fecha_recepcion END
    WHERE id = p_compra_id;
END;
$$ LANGUAGE plpgsql;
