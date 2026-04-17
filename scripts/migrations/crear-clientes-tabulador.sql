-- =============================================================================
-- MIGRACIÓN: Crear tabla clientes_tabulador
-- DESCRIPCIÓN: Crea la tabla para almacenar KM y horas de viaje de clientes
-- EJECUCIÓN: Supabase SQL Editor
-- =============================================================================

-- Crear tabla si no existe
CREATE TABLE IF NOT EXISTS public.clientes_tabulador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_cliente TEXT UNIQUE NOT NULL,
    km NUMERIC(10,2) DEFAULT 0,
    horas_viaje NUMERIC(5,2) DEFAULT 0,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_clientes_tabulador_nombre ON public.clientes_tabulador(nombre_cliente);

-- Comentario
COMMENT ON TABLE public.clientes_tabulador IS 'Tabulador de viáticos: KM y horas de viaje por cliente';
COMMENT ON COLUMN public.clientes_tabulador.km IS 'Distancia en KM desde el taller hasta el cliente';
COMMENT ON COLUMN public.clientes_tabulador.horas_viaje IS 'Horas estimadas de traslado (ida)';
