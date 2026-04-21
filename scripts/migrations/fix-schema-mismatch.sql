-- ================================================
-- SSEPI — Fix schema mismatches entre tablas existentes y código JS
-- Problema: CREATE TABLE IF NOT EXISTS no recreó tablas con schema distinto
-- ================================================

-- ========================================
-- 1) proyectos_automatizacion: agregar columnas que servicios.js espera
-- ========================================

-- nombre (el código usa 'nombre', la tabla tiene 'nombre_proyecto')
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS nombre TEXT;

-- cliente (el código envía texto, la tabla tiene cliente_id como UUID)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS cliente TEXT;

-- fecha (el código envía timestamp, la tabla tiene fecha_inicio como date)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS fecha TIMESTAMPTZ;

-- vendedor
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS vendedor TEXT;

-- notas_generales (la tabla tiene 'notas', pero el código usa 'notas_generales')
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS notas_generales TEXT;

-- notas_internas
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS notas_internas TEXT;

-- actividades (JSONB)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS actividades JSONB DEFAULT '[]';

-- materiales (JSONB)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS materiales JSONB DEFAULT '[]';

-- epicas (JSONB)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS epicas JSONB DEFAULT '[]';

-- apartados (JSONB)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS apartados JSONB DEFAULT '[]';

-- etapa_actual (integer)
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS etapa_actual INTEGER DEFAULT 1;

-- avance (el código usa 'avance', la tabla tiene 'avance_porcentaje')
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS avance NUMERIC DEFAULT 0;

-- producto_servicio
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS producto_servicio TEXT;

-- prioridad
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'normal';

-- horas_estimadas
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS horas_estimadas NUMERIC DEFAULT 0;

-- Migrar datos de columnas viejas a nuevas si están vacías
UPDATE public.proyectos_automatizacion SET nombre = nombre_proyecto WHERE nombre IS NULL AND nombre_proyecto IS NOT NULL;
UPDATE public.proyectos_automatizacion SET fecha = fecha_inicio WHERE fecha IS NULL AND fecha_inicio IS NOT NULL;

-- Hacer folio nullable (si el código genera folio automático, no debería fallar si está vacío temporalmente)
ALTER TABLE public.proyectos_automatizacion ALTER COLUMN folio DROP NOT NULL;

-- ========================================
-- 2) ordenes_motores: relajar NOT NULL en fecha_ingreso
-- ========================================
ALTER TABLE public.ordenes_motores ALTER COLUMN fecha_ingreso DROP NOT NULL;
ALTER TABLE public.ordenes_motores ALTER COLUMN folio DROP NOT NULL;

-- ========================================
-- 3) cotizaciones: relajar NOT NULL en fecha (el código puede enviar timestamp)
-- ========================================
ALTER TABLE public.cotizaciones ALTER COLUMN fecha DROP NOT NULL;

-- ========================================
-- 4) ordenes_taller: relajar NOT NULL en cliente_nombre
-- ========================================
ALTER TABLE public.ordenes_taller ALTER COLUMN cliente_nombre DROP NOT NULL;