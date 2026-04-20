-- ================================================
-- SSEPI — Tablas y datos de costos (idempotente)
-- Ejecutar en Supabase SQL Editor
-- ================================================

-- 1) parametros_costos
CREATE TABLE IF NOT EXISTS public.parametros_costos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave TEXT UNIQUE NOT NULL,
    valor NUMERIC DEFAULT 0,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.parametros_costos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parametros_costos_all ON public.parametros_costos;
CREATE POLICY parametros_costos_all ON public.parametros_costos FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.parametros_costos TO authenticated;
GRANT ALL ON public.parametros_costos TO service_role;

-- 2) gastos_fijos
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    monto NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Agregar columnas que pueden faltar si la tabla ya existía
ALTER TABLE public.gastos_fijos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE public.gastos_fijos ADD COLUMN IF NOT EXISTS frecuencia TEXT;
ALTER TABLE public.gastos_fijos ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;
UPDATE public.gastos_fijos SET activo = true WHERE activo IS NULL;
ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gastos_fijos_all ON public.gastos_fijos;
CREATE POLICY gastos_fijos_all ON public.gastos_fijos FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.gastos_fijos TO authenticated;
GRANT ALL ON public.gastos_fijos TO service_role;

-- 3) clientes_tabulador (las columnas calculadas son GENERATED — no se crean aquí)
CREATE TABLE IF NOT EXISTS public.clientes_tabulador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_cliente TEXT UNIQUE NOT NULL,
    km NUMERIC(10,2) DEFAULT 0,
    horas_viaje NUMERIC(5,2) DEFAULT 0,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_tabulador_nombre ON public.clientes_tabulador(nombre_cliente);
ALTER TABLE public.clientes_tabulador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_tabulador_all ON public.clientes_tabulador;
CREATE POLICY clientes_tabulador_all ON public.clientes_tabulador FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.clientes_tabulador TO authenticated;
GRANT ALL ON public.clientes_tabulador TO service_role;

-- ================================================
-- DATOS DE REFERENCIA (idempotentes)
-- ================================================

-- 4) Parámetros de costos
INSERT INTO public.parametros_costos (clave, valor, descripcion) VALUES
  ('gasolina', 24.50, 'Precio por litro'),
  ('rendimiento', 9.5, 'Kilómetros por litro'),
  ('costo_tecnico', 104.16, 'Costo por hora de técnico'),
  ('gastos_fijos_hora', 124.18, 'Gastos fijos por hora'),
  ('camioneta_hora', 39.35, 'Costo de operación de camioneta por hora'),
  ('utilidad', 40, 'Porcentaje de utilidad'),
  ('credito', 3, 'Porcentaje por costo de crédito'),
  ('iva', 16, 'Porcentaje de IVA')
ON CONFLICT (clave) DO NOTHING;

-- 5) Gastos fijos
INSERT INTO public.gastos_fijos (nombre, monto)
SELECT v.nombre, v.monto
FROM (
  VALUES
    ('Renta', 24360::numeric),
    ('Sueldos Base', 20000::numeric),
    ('Luz', 1500::numeric),
    ('Agua', 500::numeric),
    ('Internet', 600::numeric),
    ('Camioneta', 8500::numeric)
) AS v(nombre, monto)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gastos_fijos g WHERE g.nombre = v.nombre
);

-- 6) Clientes tabulador (KM y horas viaje)
INSERT INTO public.clientes_tabulador (nombre_cliente, km, horas_viaje) VALUES
  ('ANGUIPLAST', 234, 6),
  ('BOLSAS DE LOS ALTOS', 226, 5),
  ('ECOBOLSAS', 216, 5),
  ('BADER', 17.2, 2),
  ('BODYCOTE', 90.6, 3),
  ('COFICAB', 80, 3),
  ('CONDUMEX', 90.6, 3),
  ('ECSA', 32, 2),
  ('EMMSA', 21.6, 2),
  ('EPC 1', 400, 7),
  ('EPC 2', 402, 8),
  ('FRAENKISCHE', 79.4, 3),
  ('GEDNEY', 23.6, 3),
  ('GRUPO ACERERO', 386, 7),
  ('HALL ALUMINIUM', 73.8, 3),
  ('HIRUTA', 58.4, 3),
  ('IK PLASTIC', 61.4, 3),
  ('IMPRENTA JM', 16.2, 2),
  ('JARDIN LA ALEMANA', 12, 2),
  ('MAFLOW', 59.8, 3),
  ('MARQUARDT', 125.4, 4),
  ('MICROONDA', 41.6, 3),
  ('MR LUCKY', 157, 4),
  ('NHK SPRING MEXICO', 138.6, 4),
  ('NISHIKAWA', 61, 3),
  ('PIELES AZTECA', 5, 1),
  ('RONGTAI', 28.2, 3),
  ('SAFE DEMO', 61.6, 3),
  ('SERVIACERO ELECTROFORJADOS', 14.6, 2),
  ('SUACERO', 392, 8),
  ('TQ-1', 26, 2),
  ('MINO INDUSTRY', 29.2, 2),
  ('CURTIDOS BENGALA', 17.2, 2)
ON CONFLICT (nombre_cliente) DO NOTHING;

-- 7) Las columnas calculadas (litros, costo_gasolina, costo_tecnico, total_viatico)
--    son GENERATED ALWAYS AS — se actualizan automáticamente al insertar km/horas_viaje

-- 8) Publicar tablas en Realtime
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parametros_costos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_fijos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_tabulador;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;