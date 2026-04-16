-- =====================================================
-- AGREGAR COLUMNAS FALTANTES - SSEPI
-- Agrega columnas que el frontend espera
-- =====================================================

-- ================================================
-- 1. COMPRAS - columna fecha_creacion
-- ================================================
ALTER TABLE public.compras
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 2. COTIZACIONES - columna fecha_creacion
-- ================================================
ALTER TABLE public.cotizaciones
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 3. VENTAS - columna fecha_creacion
-- ================================================
ALTER TABLE public.ventas
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 4. ORDENES_TALLER - columna fecha_creacion
-- ================================================
ALTER TABLE public.ordenes_taller
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 5. ORDENES_MOTORES - columna fecha_creacion
-- ================================================
ALTER TABLE public.ordenes_motores
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 6. PROYECTOS_AUTOMATIZACION - columna fecha_creacion
-- ================================================
ALTER TABLE public.proyectos_automatizacion
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- 7. BOM_AUTOMATIZACION - columna fecha_creacion
-- ================================================
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

-- ================================================
-- FIN
-- ================================================
