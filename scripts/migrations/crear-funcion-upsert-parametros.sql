-- =============================================================================
-- FUNCIÓN: upsert_parametro_costo
-- DESCRIPCIÓN: Inserta o actualiza un parámetro en parametros_costos
-- USO: SELECT upsert_parametro_costo('gasolina', 25.50);
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_parametro_costo(p_clave TEXT, p_valor NUMERIC)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.parametros_costos (clave, valor, descripcion)
    VALUES (p_clave, p_valor, 'Actualizado desde calculadora')
    ON CONFLICT (clave)
    DO UPDATE SET valor = EXCLUDED.valor, descripcion = 'Actualizado: ' || NOW();
END;
$$ LANGUAGE plpgsql;
