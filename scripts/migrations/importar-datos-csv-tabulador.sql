-- ============================================================================
-- IMPORTACIÓN: Datos del CSV TABULADOR DE COTIZACIÓN (1).csv
-- Agrega columnas faltantes a clientes_tabulador y puebla con datos reales
-- ============================================================================

-- 1. Asegurar que la tabla existe
CREATE TABLE IF NOT EXISTS public.clientes_tabulador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_cliente TEXT UNIQUE NOT NULL,
    km NUMERIC(10,2) DEFAULT 0,
    horas_viaje NUMERIC(5,2) DEFAULT 0,
    litros NUMERIC(10,2) DEFAULT 0,
    precio_gasolina NUMERIC(10,2) DEFAULT 24.50,
    costo_gasolina NUMERIC(12,2) DEFAULT 0,
    hr_dani NUMERIC(10,2) DEFAULT 104.16,
    costo_dani NUMERIC(12,2) DEFAULT 0,
    total_viaje NUMERIC(12,2) DEFAULT 0,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar columnas faltantes si no existen
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='litros') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN litros NUMERIC(10,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='precio_gasolina') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN precio_gasolina NUMERIC(10,2) DEFAULT 24.50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='costo_gasolina') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN costo_gasolina NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='hr_dani') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN hr_dani NUMERIC(10,2) DEFAULT 104.16;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='costo_dani') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN costo_dani NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes_tabulador' AND column_name='total_viaje') THEN
        ALTER TABLE public.clientes_tabulador ADD COLUMN total_viaje NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- 3. Insertar/actualizar datos del CSV (ON CONFLICT para evitar duplicados)
INSERT INTO public.clientes_tabulador (nombre_cliente, km, horas_viaje, litros, precio_gasolina, costo_gasolina, hr_dani, costo_dani, total_viaje) VALUES
    ('BOLSAS DE LOS ALTOS', 226, 5, 23.79, 24.50, 582.84, 104.16, 520.80, 1103.64),
    ('ANGUIPLAST', 234, 6, 24.63, 24.50, 603.47, 104.16, 624.96, 1228.43),
    ('ECOBOLSAS', 216, 5, 22.74, 24.50, 557.05, 104.16, 520.80, 1077.85),
    ('BADER TABACHINES', 17.2, 2, 1.81, 24.50, 44.36, 104.16, 208.32, 252.68),
    ('BODYCOTE', 90.6, 3, 9.54, 24.50, 233.65, 104.16, 312.48, 546.13),
    ('COFICAB', 80, 3, 8.42, 24.50, 206.32, 104.16, 312.48, 518.80),
    ('CONDUMEX', 90.6, 3, 9.54, 24.50, 233.65, 104.16, 312.48, 546.13),
    ('ECSA', 32, 2, 3.37, 24.50, 82.53, 104.16, 208.32, 290.85),
    ('EMMSA', 21.6, 2, 2.27, 24.50, 55.71, 104.16, 208.32, 264.03),
    ('EPC 1', 400, 7, 42.11, 24.50, 1031.58, 104.16, 729.12, 1760.70),
    ('EPC 2', 402, 8, 42.32, 24.50, 1036.74, 104.16, 833.28, 1870.02),
    ('FRAENKISCHE', 0, 3, 0, 24.50, 0, 104.16, 312.48, 312.48),
    ('GEDNEY', 23.6, 3, 2.48, 24.50, 60.86, 104.16, 312.48, 373.34),
    ('GRUPO ACERERO', 386, 7, 40.63, 24.50, 995.47, 104.16, 729.12, 1724.59),
    ('HALL PLANTA 1', 73.8, 3, 7.77, 24.50, 190.33, 104.16, 312.48, 502.81),
    ('HIRUTA PLANTA 1', 58.4, 3, 6.15, 24.50, 150.61, 104.16, 312.48, 463.09),
    ('IK PLASTIC', 61.4, 3, 6.46, 24.50, 158.35, 104.16, 312.48, 470.83),
    ('IMPRENTA JM', 16.2, 2, 1.71, 24.50, 41.78, 104.16, 208.32, 250.10),
    ('JARDÍN LA ALEMANA', 12, 2, 1.26, 24.50, 30.95, 104.16, 208.32, 239.27),
    ('MAFLOW', 59.8, 3, 6.29, 24.50, 154.22, 104.16, 312.48, 466.70),
    ('MARQUARDT', 125.4, 4, 13.20, 24.50, 323.40, 104.16, 416.64, 740.04),
    ('MICROONDA', 41.6, 3, 4.38, 24.50, 107.28, 104.16, 312.48, 419.76),
    ('MR LUCKY', 157, 4, 16.53, 24.50, 404.89, 104.16, 416.64, 821.53),
    ('NHK', 138.6, 4, 14.59, 24.50, 357.44, 104.16, 416.64, 774.08),
    ('NISHIKAWA', 61, 3, 6.42, 24.50, 157.32, 104.16, 312.48, 469.80),
    ('PIELES AZTECA', 5, 1, 0.53, 24.50, 12.89, 104.16, 104.16, 117.05),
    ('RONGTAI', 28.2, 3, 2.97, 24.50, 72.73, 104.16, 312.48, 385.21),
    ('SAFE DEMO', 61.6, 3, 6.48, 24.50, 158.86, 104.16, 312.48, 471.34),
    ('ELECTROFORJADOS', 14.6, 2, 1.54, 24.50, 37.65, 104.16, 208.32, 245.97),
    ('SUACERO', 392, 8, 41.26, 24.50, 1010.95, 104.16, 833.28, 1844.23),
    ('TQ-1', 26, 2, 2.74, 24.50, 67.05, 104.16, 208.32, 275.37),
    ('MINO INDUSTRY', 29.2, 2, 3.07, 24.50, 75.31, 104.16, 208.32, 283.63)
ON CONFLICT (nombre_cliente) DO UPDATE SET
    km = EXCLUDED.km,
    horas_viaje = EXCLUDED.horas_viaje,
    litros = EXCLUDED.litros,
    precio_gasolina = EXCLUDED.precio_gasolina,
    costo_gasolina = EXCLUDED.costo_gasolina,
    hr_dani = EXCLUDED.hr_dani,
    costo_dani = EXCLUDED.costo_dani,
    total_viaje = EXCLUDED.total_viaje,
    actualizado_en = NOW();

-- 4. Verificar
SELECT COUNT(*) as total_clientes FROM public.clientes_tabulador;
