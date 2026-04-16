-- =====================================================
-- AJUSTE DE TABLAS EXISTENTES - SSEPI
-- Agrega columnas y políticas RLS faltantes
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- ================================================
-- 1. COMPRAS (si no existe, la crea)
-- ================================================
CREATE TABLE IF NOT EXISTS public.compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(50) UNIQUE NOT NULL,
    proveedor_id UUID REFERENCES public.contactos(id),
    fecha DATE NOT NULL,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    estatus_pago VARCHAR(50) DEFAULT 'Pendiente',
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON public.compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON public.compras(fecha);

DO $$ BEGIN
    ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo compras" ON public.compras;
CREATE POLICY "Admin ve todo compras" ON public.compras
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Compras lee compras" ON public.compras;
CREATE POLICY "Compras lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Compras crea compras" ON public.compras;
CREATE POLICY "Compras crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Compras actualiza compras" ON public.compras;
CREATE POLICY "Compras actualiza compras" ON public.compras
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 2. VENTAS (si no existe, la crea)
-- ================================================
CREATE TABLE IF NOT EXISTS public.ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    fecha DATE NOT NULL,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    estatus_pago VARCHAR(50) DEFAULT 'Pendiente',
    metodo_pago VARCHAR(50),
    fecha_pago DATE,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON public.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_folio ON public.ventas(folio);

DO $$ BEGIN
    ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo ventas" ON public.ventas;
CREATE POLICY "Admin ve todo ventas" ON public.ventas
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas lee ventas" ON public.ventas;
CREATE POLICY "Ventas lee ventas" ON public.ventas
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas crea ventas" ON public.ventas;
CREATE POLICY "Ventas crea ventas" ON public.ventas
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas actualiza ventas" ON public.ventas;
CREATE POLICY "Ventas actualiza ventas" ON public.ventas
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 3. COTIZACIONES (si no existe, la crea)
-- ================================================
CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    fecha DATE NOT NULL,
    fecha_validez DATE,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    orden_origen_id UUID,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha ON public.cotizaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_folio ON public.cotizaciones(folio);

DO $$ BEGIN
    ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo cotizaciones" ON public.cotizaciones;
CREATE POLICY "Admin ve todo cotizaciones" ON public.cotizaciones
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas lee cotizaciones" ON public.cotizaciones;
CREATE POLICY "Ventas lee cotizaciones" ON public.cotizaciones
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas crea cotizaciones" ON public.cotizaciones;
CREATE POLICY "Ventas crea cotizaciones" ON public.cotizaciones
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas actualiza cotizaciones" ON public.cotizaciones;
CREATE POLICY "Ventas actualiza cotizaciones" ON public.cotizaciones
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 4. ORDENES_TALLER - Agregar columna cliente_id si no existe
-- ================================================
ALTER TABLE public.ordenes_taller
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.contactos(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_cliente ON public.ordenes_taller(cliente_id);

DO $$ BEGIN
    ALTER TABLE public.ordenes_taller ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo taller" ON public.ordenes_taller;
CREATE POLICY "Admin ve todo taller" ON public.ordenes_taller
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Taller lee taller" ON public.ordenes_taller;
CREATE POLICY "Taller lee taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Taller crea taller" ON public.ordenes_taller;
CREATE POLICY "Taller crea taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Taller actualiza taller" ON public.ordenes_taller;
CREATE POLICY "Taller actualiza taller" ON public.ordenes_taller
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 5. ORDENES_MOTORES - Agregar columna cliente_id si no existe
-- ================================================
ALTER TABLE public.ordenes_motores
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.contactos(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_motores_cliente ON public.ordenes_motores(cliente_id);

DO $$ BEGIN
    ALTER TABLE public.ordenes_motores ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo motores" ON public.ordenes_motores;
CREATE POLICY "Admin ve todo motores" ON public.ordenes_motores
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Motores lee motores" ON public.ordenes_motores;
CREATE POLICY "Motores lee motores" ON public.ordenes_motores
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Motores crea motores" ON public.ordenes_motores;
CREATE POLICY "Motores crea motores" ON public.ordenes_motores
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Motores actualiza motores" ON public.ordenes_motores;
CREATE POLICY "Motores actualiza motores" ON public.ordenes_motores
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 6. PROYECTOS_AUTOMATIZACION - Agregar columna cliente_id si no existe
-- ================================================
ALTER TABLE public.proyectos_automatizacion
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.contactos(id);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente ON public.proyectos_automatizacion(cliente_id);

DO $$ BEGIN
    ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo proyectos" ON public.proyectos_automatizacion;
CREATE POLICY "Admin ve todo proyectos" ON public.proyectos_automatizacion
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Automatizacion lee proyectos" ON public.proyectos_automatizacion;
CREATE POLICY "Automatizacion lee proyectos" ON public.proyectos_automatizacion
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Automatizacion crea proyectos" ON public.proyectos_automatizacion;
CREATE POLICY "Automatizacion crea proyectos" ON public.proyectos_automatizacion
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Automatizacion actualiza proyectos" ON public.proyectos_automatizacion;
CREATE POLICY "Automatizacion actualiza proyectos" ON public.proyectos_automatizacion
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 7. PERMISOS CRUZADOS (ventas puede ver/crear en compras y taller)
-- ================================================
DROP POLICY IF EXISTS "Ventas crea compras" ON public.compras;
CREATE POLICY "Ventas crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas lee compras" ON public.compras;
CREATE POLICY "Ventas lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas crea ordenes_taller" ON public.ordenes_taller;
CREATE POLICY "Ventas crea ordenes_taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas lee ordenes_taller" ON public.ordenes_taller;
CREATE POLICY "Ventas lee ordenes_taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

-- ================================================
-- 8. BOM AUTOMATIZACION (si no existe, la crea)
-- ================================================
CREATE TABLE IF NOT EXISTS public.bom_automatizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID REFERENCES public.proyectos_automatizacion(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('material', 'servicio')),
    item_id UUID,
    cantidad NUMERIC(12,2) DEFAULT 1,
    costo_unitario NUMERIC(12,2),
    costo_total NUMERIC(12,2),
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bom_proyecto ON public.bom_automatizacion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bom_tipo ON public.bom_automatizacion(tipo);

DO $$ BEGIN
    ALTER TABLE public.bom_automatizacion ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "Admin ve todo BOM" ON public.bom_automatizacion;
CREATE POLICY "Admin ve todo BOM" ON public.bom_automatizacion
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Automatizacion ve BOM" ON public.bom_automatizacion;
CREATE POLICY "Automatizacion ve BOM" ON public.bom_automatizacion
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Automatizacion gestiona BOM" ON public.bom_automatizacion;
CREATE POLICY "Automatizacion gestiona BOM" ON public.bom_automatizacion
    FOR ALL TO authenticated USING (true);

-- ================================================
-- FIN
-- ================================================
