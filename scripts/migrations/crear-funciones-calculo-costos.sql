-- ============================================================================
-- FUNCIONES SQL DE CÁLCULO DE COSTOS (VIÁTICOS / GASOLINA / TRASLADO)
-- CORREGIDO: usa nombres de columna reales de clientes_tabulador en producción
--
-- Columnas reales en clientes_tabulador:
--   cliente_nombre, km_ida, horas_invertidas, activo
--
-- Fórmulas Excel:
--   Litros  = (KM × 2) / rendimiento
--   $Gas    = Litros × precio_gasolina
--   $Tec    = Horas × costo_tecnico
--   Total   = $Gas + $Tec
-- ============================================================================

-- 1) Actualizar precio de gasolina a $30.00
INSERT INTO public.parametros_costos (clave, valor, descripcion)
VALUES ('gasolina', 30.00, 'Precio por litro (actualizado Mayo 2026)')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, descripcion = EXCLUDED.descripcion;

INSERT INTO public.parametros_costos (clave, valor, descripcion) VALUES
  ('rendimiento', 9.5, 'Kilómetros por litro'),
  ('costo_tecnico', 104.16, 'Costo por hora de técnico'),
  ('camioneta_hora', 39.35, 'Costo camioneta por hora')
ON CONFLICT (clave) DO NOTHING;

-- 2) FUNCIÓN: calcular_costo_gasolina(km)
CREATE OR REPLACE FUNCTION public.calcular_costo_gasolina(p_km NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    v_rendimiento NUMERIC;
    v_precio      NUMERIC;
    v_litros      NUMERIC;
BEGIN
    SELECT valor INTO v_rendimiento FROM public.parametros_costos WHERE clave = 'rendimiento';
    SELECT valor INTO v_precio      FROM public.parametros_costos WHERE clave = 'gasolina';
    v_rendimiento := COALESCE(v_rendimiento, 9.5);
    v_precio      := COALESCE(v_precio, 30.00);

    IF p_km IS NULL OR p_km <= 0 THEN RETURN 0; END IF;
    v_litros := (p_km * 2) / v_rendimiento;
    RETURN ROUND(v_litros * v_precio, 2);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3) FUNCIÓN: calcular_costo_traslado(horas)
CREATE OR REPLACE FUNCTION public.calcular_costo_traslado(p_horas NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    v_costo_tecnico NUMERIC;
BEGIN
    SELECT valor INTO v_costo_tecnico FROM public.parametros_costos WHERE clave = 'costo_tecnico';
    v_costo_tecnico := COALESCE(v_costo_tecnico, 104.16);
    IF p_horas IS NULL OR p_horas <= 0 THEN RETURN 0; END IF;
    RETURN ROUND(p_horas * v_costo_tecnico, 2);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4) FUNCIÓN: calcular_viaticos(km, horas)
CREATE OR REPLACE FUNCTION public.calcular_viaticos(p_km NUMERIC, p_horas NUMERIC)
RETURNS JSONB AS $$
DECLARE
    v_rendimiento   NUMERIC; v_precio NUMERIC; v_costo_tecnico NUMERIC;
    v_litros NUMERIC; v_gasolina NUMERIC; v_traslado NUMERIC; v_total NUMERIC;
BEGIN
    SELECT valor INTO v_rendimiento   FROM public.parametros_costos WHERE clave = 'rendimiento';
    SELECT valor INTO v_precio        FROM public.parametros_costos WHERE clave = 'gasolina';
    SELECT valor INTO v_costo_tecnico FROM public.parametros_costos WHERE clave = 'costo_tecnico';
    v_rendimiento   := COALESCE(v_rendimiento, 9.5);
    v_precio        := COALESCE(v_precio, 30.00);
    v_costo_tecnico := COALESCE(v_costo_tecnico, 104.16);

    v_litros   := CASE WHEN COALESCE(p_km,0) > 0 THEN (p_km * 2) / v_rendimiento ELSE 0 END;
    v_gasolina := ROUND(v_litros * v_precio, 2);
    v_traslado := CASE WHEN COALESCE(p_horas,0) > 0 THEN ROUND(p_horas * v_costo_tecnico, 2) ELSE 0 END;
    v_total    := v_gasolina + v_traslado;

    RETURN jsonb_build_object(
        'km', p_km, 'horas', p_horas, 'rendimiento', v_rendimiento,
        'precio_gasolina', v_precio, 'litros', ROUND(v_litros, 2),
        'costo_gasolina', v_gasolina, 'costo_traslado', v_traslado,
        'total_viatico', v_total,
        'formula_gas', '(' || p_km || ' * 2) / ' || v_rendimiento || ' * $' || v_precio,
        'formula_tec', p_horas || ' hrs * $' || v_costo_tecnico || '/hr'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5) FUNCIÓN: calcular_viaticos_cliente(nombre_cliente)
--    Lee km/horas desde clientes_tabulador (columnas: cliente_nombre, km_ida, horas_invertidas)
CREATE OR REPLACE FUNCTION public.calcular_viaticos_cliente(p_nombre_cliente TEXT)
RETURNS JSONB AS $$
DECLARE
    v_km    NUMERIC;
    v_horas NUMERIC;
BEGIN
    SELECT km_ida, horas_invertidas
    INTO v_km, v_horas
    FROM public.clientes_tabulador
    WHERE LOWER(cliente_nombre) = LOWER(p_nombre_cliente)
      AND (activo IS NULL OR activo = true)
    LIMIT 1;

    IF v_km IS NULL THEN
        RETURN jsonb_build_object('error', 'Cliente no encontrado en tabulador', 'cliente', p_nombre_cliente);
    END IF;

    RETURN public.calcular_viaticos(v_km, v_horas);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6) VISTA: v_clientes_tabulador_costos
CREATE OR REPLACE VIEW public.v_clientes_tabulador_costos AS
SELECT
    ct.id,
    ct.cliente_nombre AS nombre_cliente,
    ct.km_ida         AS km,
    ct.horas_invertidas AS horas_viaje,
    ROUND((ct.km_ida * 2) / NULLIF((SELECT valor FROM public.parametros_costos WHERE clave = 'rendimiento'), 0), 2) AS litros,
    public.calcular_costo_gasolina(ct.km_ida) AS costo_gasolina,
    public.calcular_costo_traslado(ct.horas_invertidas) AS costo_traslado,
    public.calcular_costo_gasolina(ct.km_ida) + public.calcular_costo_traslado(ct.horas_invertidas) AS total_viatico
FROM public.clientes_tabulador ct
WHERE ct.km_ida IS NOT NULL AND ct.km_ida > 0
  AND (ct.activo IS NULL OR ct.activo = true);

-- 7) Permisos
GRANT EXECUTE ON FUNCTION public.calcular_costo_gasolina(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_costo_traslado(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_viaticos(NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_viaticos_cliente(TEXT) TO authenticated;
GRANT SELECT ON public.v_clientes_tabulador_costos TO authenticated;

-- ============================================================================
-- EJEMPLOS DE USO (probar en Supabase SQL Editor):
--
-- SELECT public.calcular_costo_gasolina(226);
-- SELECT public.calcular_costo_traslado(5);
-- SELECT public.calcular_viaticos(226, 5);
-- SELECT public.calcular_viaticos_cliente('ECOBOLSAS');
-- SELECT * FROM public.v_clientes_tabulador_costos ORDER BY total_viatico DESC;
-- ============================================================================
