-- =====================================================
-- SCRIPT COMPLETO - CREAR Y AJUSTAR TABLAS SSEPI
-- Crea tablas faltantes y ajusta existentes con RLS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- ================================================
-- 1. COMPRAS (crear si no existe)
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

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

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
-- 2. VENTAS (crear si no existe)
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

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

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
-- 3. COTIZACIONES (crear si no existe)
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

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

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
-- 4. ORDENES_TALLER (ajustar existente - agregar columna)
-- ================================================
ALTER TABLE public.ordenes_taller
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.contactos(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_cliente ON public.ordenes_taller(cliente_id);

ALTER TABLE public.ordenes_taller ENABLE ROW LEVEL SECURITY;

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
-- 5. ORDENES_MOTORES (crear si no existe)
-- ================================================
CREATE TABLE IF NOT EXISTS public.ordenes_motores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    equipo VARCHAR(100),
    marca VARCHAR(50),
    modelo VARCHAR(50),
    serie VARCHAR(100),
    potencia_hp NUMERIC(10,2),
    voltaje VARCHAR(50),
    amperaje VARCHAR(50),
    estado VARCHAR(50) DEFAULT 'Ingresado',
    fecha_ingreso DATE NOT NULL,
    fecha_entrega DATE,
    diagnostico TEXT,
    recomendaciones TEXT,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_ordenes_motores_cliente ON public.ordenes_motores(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_fecha ON public.ordenes_motores(fecha_ingreso);

ALTER TABLE public.ordenes_motores ENABLE ROW LEVEL SECURITY;

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
-- 6. PROYECTOS_AUTOMATIZACION (crear si no existe)
-- ================================================
CREATE TABLE IF NOT EXISTS public.proyectos_automatizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    nombre_proyecto VARCHAR(150),
    descripcion TEXT,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    fecha_inicio DATE,
    fecha_entrega DATE,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    avance_porcentaje NUMERIC(5,2) DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente ON public.proyectos_automatizacion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_fecha ON public.proyectos_automatizacion(fecha_inicio);

ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;

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
-- 7. PERMISOS CRUZADOS (ventas en compras y taller)
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
-- 8. BOM AUTOMATIZACION (ajustar existente - agregar columnas)
-- ================================================

-- Agregar columna proyecto_id si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES public.proyectos_automatizacion(id) ON DELETE CASCADE;

-- Agregar columna tipo si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);

-- Agregar columna item_id si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS item_id UUID;

-- Agregar columna cantidad si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS cantidad NUMERIC(12,2) DEFAULT 1;

-- Agregar columna costo_unitario si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2);

-- Agregar columna costo_total si no existe
ALTER TABLE public.bom_automatizacion
ADD COLUMN IF NOT EXISTS costo_total NUMERIC(12,2);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_bom_proyecto ON public.bom_automatizacion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bom_tipo ON public.bom_automatizacion(tipo);

ALTER TABLE public.bom_automatizacion ENABLE ROW LEVEL SECURITY;

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
