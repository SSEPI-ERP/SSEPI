-- =====================================================
-- EMERGENCIA: Fix schema faltante en producción
-- Fecha: 2026-04-27
-- Proyecto: knzmdwjmrhcoytmebdwa
-- =====================================================
-- Ejecutar TODO este script en el SQL Editor de Supabase
-- =====================================================

-- -----------------------------------------------------
-- 1. FOLIADOR_CONTROL (folios consecutivos)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foliador_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL UNIQUE,
    ultimo_folio INTEGER NOT NULL DEFAULT 0,
    ultimo_folio_entero INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foliador_control_tipo ON public.foliador_control(tipo);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_foliador_control_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_foliador_control_updated_at ON public.foliador_control;
CREATE TRIGGER update_foliador_control_updated_at
    BEFORE UPDATE ON public.foliador_control
    FOR EACH ROW
    EXECUTE FUNCTION public.update_foliador_control_updated_at();

-- Datos iniciales
INSERT INTO public.foliador_control (tipo, ultimo_folio, ultimo_folio_entero) VALUES
    ('SP-T', 0, 0),
    ('SP-M', 0, 0),
    ('SP-A', 0, 0),
    ('SP-S', 0, 0),
    ('SP-E', 0, 0),
    ('COT', 0, 0)
ON CONFLICT (tipo) DO NOTHING;

-- RLS
ALTER TABLE public.foliador_control ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "foliador_select" ON public.foliador_control;
CREATE POLICY "foliador_select" ON public.foliador_control FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "foliador_write" ON public.foliador_control;
CREATE POLICY "foliador_write" ON public.foliador_control FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- 2. PARAMETROS_COSTOS (columnas faltantes)
-- -----------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'departamento') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN departamento TEXT DEFAULT 'general';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'activo') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'descripcion') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN descripcion TEXT;
    END IF;
END $$;

-- Datos por defecto (evitar duplicados)
INSERT INTO public.parametros_costos (clave, valor, descripcion, departamento, activo) VALUES
    ('gasolina', 24.50, 'Precio por litro de gasolina', 'general', true),
    ('rendimiento', 9.50, 'Rendimiento km por litro', 'general', true),
    ('costo_tecnico', 104.16, 'Costo por hora de técnico', 'general', true),
    ('gastos_fijos_hora', 161.85, 'Gastos fijos por hora', 'general', true),
    ('camioneta_hora', 52.67, 'Costo por hora de camioneta', 'general', true),
    ('utilidad', 1.40, 'Factor de utilidad (40%)', 'general', true),
    ('credito', 0.03, 'Costo de crédito (3%)', 'general', true),
    ('iva', 0.16, 'IVA (16%)', 'general', true)
ON CONFLICT (clave) DO UPDATE SET
    valor = EXCLUDED.valor,
    descripcion = EXCLUDED.descripcion,
    departamento = EXCLUDED.departamento,
    activo = EXCLUDED.activo;

-- -----------------------------------------------------
-- 3. ORDENES_TALLER (columnas faltantes)
-- -----------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'cliente_nombre') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN cliente_nombre TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'falla_reportada') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN falla_reportada TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'notas_generales') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN notas_generales TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'fecha_reparacion') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN fecha_reparacion TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'tecnico_responsable') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN tecnico_responsable TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'recibe_nombre') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN recibe_nombre TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'recibe_identificacion') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN recibe_identificacion TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'factura_numero') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN factura_numero TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'entrega_obs') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN entrega_obs TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'bajo_garantia') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN bajo_garantia BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'foto_ingreso') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN foto_ingreso TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'condiciones_fisicas') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN condiciones_fisicas TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'encargado_recepcion') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN encargado_recepcion TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'refacciones_enlaces') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN refacciones_enlaces JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'refacciones_inventario') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN refacciones_inventario JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'consumibles_usados') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN consumibles_usados JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'componentes_inventario') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN componentes_inventario JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'componentes_compra') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN componentes_compra JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'horas_estimadas') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN horas_estimadas NUMERIC(5,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ordenes_taller' AND column_name = 'referencia') THEN
        ALTER TABLE public.ordenes_taller ADD COLUMN referencia TEXT;
    END IF;
END $$;

-- Cambiar fecha_ingreso de DATE a TIMESTAMPTZ si es necesario
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ordenes_taller' AND column_name = 'fecha_ingreso'
        AND data_type = 'date'
    ) THEN
        ALTER TABLE public.ordenes_taller ALTER COLUMN fecha_ingreso TYPE TIMESTAMPTZ USING fecha_ingreso::TIMESTAMPTZ;
    END IF;
END $$;

-- Cambiar fecha_entrega de DATE a TIMESTAMPTZ si es necesario
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ordenes_taller' AND column_name = 'fecha_entrega'
        AND data_type = 'date'
    ) THEN
        ALTER TABLE public.ordenes_taller ALTER COLUMN fecha_entrega TYPE TIMESTAMPTZ;
    END IF;
END $$;

-- Asegurar constraint de estado
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name LIKE '%estado%'
    ) THEN
        ALTER TABLE public.ordenes_taller ADD CONSTRAINT chk_ordenes_taller_estado
            CHECK (estado IN ('Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado', 'Facturado'));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Recargar schema para PostgREST
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
