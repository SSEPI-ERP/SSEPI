-- =====================================================
-- TABLA VIÁTICOS PARA CLIENTES
-- Almacena KM, horas de viaje y costos por cliente
-- =====================================================

-- La tabla contactos ya existe, agregamos columnas si no existen
ALTER TABLE public.contactos
ADD COLUMN IF NOT EXISTS km numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_viaje numeric(5,2) DEFAULT 0;

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_contactos_km ON public.contactos(km);

-- =====================================================
-- VISTA RÁPIDA DE COSTOS POR CLIENTE
-- =====================================================
CREATE OR REPLACE VIEW public.vista_costos_cliente AS
SELECT
    c.id,
    c.nombre,
    c.empresa,
    c.km,
    c.horas_viaje,
    -- Costo gasolina: $12.89 por litro, rendimiento 12 km/l
    (c.km / 12.0) * 12.89 AS costo_gasolina,
    -- Costo traslado: $350 por hora de viaje técnico
    c.horas_viaje * 350 AS costo_traslado,
    -- Total viáticos
    ((c.km / 12.0) * 12.89) + (c.horas_viaje * 350) AS total_viaticos
FROM public.contactos c
WHERE c.tipo = 'cliente';

-- =====================================================
-- NOTIFICAR A POSTGREST QUE RECARGUE EL SCHEMA
-- =====================================================
NOTIFY pgrst, 'reload schema';
