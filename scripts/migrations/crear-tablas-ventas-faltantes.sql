-- =====================================================
-- TABLAS FALTANTES PARA MÓDULO VENTAS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- ================================================
-- 1. TABLA VENTAS (órdenes de venta)
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
    created_by UUID REFERENCES auth.users(id)
);

-- RLS para ventas
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo ventas" ON public.ventas
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Ventas lee ventas" ON public.ventas
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ventas crea ventas" ON public.ventas
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Ventas actualiza ventas" ON public.ventas
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 2. TABLA COTIZACIONES
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
    estado VARCHAR(50) DEFAULT 'Pendiente', -- Pendiente, Aprobada, Rechazada, Convertida
    orden_origen_id UUID, -- Si se convierte a orden
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- RLS para cotizaciones
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo cotizaciones" ON public.cotizaciones
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Ventas lee cotizaciones" ON public.cotizaciones
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ventas crea cotizaciones" ON public.cotizaciones
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Ventas actualiza cotizaciones" ON public.cotizaciones
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 3. TABLA ORDENES MOTORES
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
    created_by UUID REFERENCES auth.users(id)
);

-- RLS para ordenes_motores
ALTER TABLE public.ordenes_motores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo motores" ON public.ordenes_motores
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Motores lee motores" ON public.ordenes_motores
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Motores crea motores" ON public.ordenes_motores
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Motores actualiza motores" ON public.ordenes_motores
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 4. TABLA PROYECTOS AUTOMATIZACION
-- ================================================
CREATE TABLE IF NOT EXISTS public.proyectos_automatizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    nombre_proyecto VARCHAR(150),
    descripcion TEXT,
    estado VARCHAR(50) DEFAULT 'Pendiente', -- Pendiente, En Progreso, Completado, Cancelado
    fecha_inicio DATE,
    fecha_entrega DATE,
    subtotal NUMERIC(12,2) DEFAULT 0,
    iva NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    avance_porcentaje NUMERIC(5,2) DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id)
);

-- RLS para proyectos_automatizacion
ALTER TABLE public.proyectos_automatizacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo proyectos" ON public.proyectos_automatizacion
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Automatizacion lee proyectos" ON public.proyectos_automatizacion
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Automatizacion crea proyectos" ON public.proyectos_automatizacion
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Automatizacion actualiza proyectos" ON public.proyectos_automatizacion
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 5. PERMISOS PARA TABLAS EXISTENTES (ordenes_taller, compras)
-- ================================================

-- Permitir INSERT a usuarios con rol ventas/admin en ordenes_taller
DROP POLICY IF EXISTS "Ventas crea ordenes_taller" ON public.ordenes_taller;
CREATE POLICY "Ventas crea ordenes_taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas lee ordenes_taller" ON public.ordenes_taller;
CREATE POLICY "Ventas lee ordenes_taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

-- Permitir INSERT a usuarios con rol ventas/admin en compras
DROP POLICY IF EXISTS "Ventas crea compras" ON public.compras;
CREATE POLICY "Ventas crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Ventas lee compras" ON public.compras;
CREATE POLICY "Ventas lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);

-- ================================================
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ================================================
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON public.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_folio ON public.ventas(folio);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha ON public.cotizaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_folio ON public.cotizaciones(folio);

CREATE INDEX IF NOT EXISTS idx_ordenes_motores_cliente ON public.ordenes_motores(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_motores_fecha ON public.ordenes_motores(fecha_ingreso);

CREATE INDEX IF NOT EXISTS idx_proyectos_cliente ON public.proyectos_automatizacion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_fecha ON public.proyectos_automatizacion(fecha_inicio);
