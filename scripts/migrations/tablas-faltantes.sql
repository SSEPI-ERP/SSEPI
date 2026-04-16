-- =====================================================
-- TABLAS FALTANTES - SSEPI
-- Solo crea lo que NO existe + ajusta existentes
-- =====================================================

-- ================================================
-- 1. COMPRAS (NO existe - crear)
-- ================================================
CREATE TABLE public.compras (
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

CREATE INDEX idx_compras_proveedor ON public.compras(proveedor_id);
CREATE INDEX idx_compras_fecha ON public.compras(fecha);

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo compras" ON public.compras
    FOR ALL TO authenticated USING (true);
CREATE POLICY "Compras lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Compras crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Compras actualiza compras" ON public.compras
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 2. VENTAS (NO existe - crear)
-- ================================================
CREATE TABLE public.ventas (
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

CREATE INDEX idx_ventas_cliente ON public.ventas(cliente_id);
CREATE INDEX idx_ventas_fecha ON public.ventas(fecha);
CREATE INDEX idx_ventas_folio ON public.ventas(folio);

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
-- 3. COTIZACIONES (NO existe - crear)
-- ================================================
CREATE TABLE public.cotizaciones (
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

CREATE INDEX idx_cotizaciones_cliente ON public.cotizaciones(cliente_id);
CREATE INDEX idx_cotizaciones_fecha ON public.cotizaciones(fecha);
CREATE INDEX idx_cotizaciones_folio ON public.cotizaciones(folio);

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
-- 4. ORDENES_MOTORES (NO existe - crear)
-- ================================================
CREATE TABLE public.ordenes_motores (
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

CREATE INDEX idx_ordenes_motores_cliente ON public.ordenes_motores(cliente_id);
CREATE INDEX idx_ordenes_motores_fecha ON public.ordenes_motores(fecha_ingreso);

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
-- 5. PROYECTOS_AUTOMATIZACION (NO existe - crear)
-- ================================================
CREATE TABLE public.proyectos_automatizacion (
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

CREATE INDEX idx_proyectos_cliente ON public.proyectos_automatizacion(cliente_id);
CREATE INDEX idx_proyectos_fecha ON public.proyectos_automatizacion(fecha_inicio);

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
-- 6. PERMISOS CRUZADOS (ventas en compras y taller)
-- ================================================
CREATE POLICY "Ventas crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Ventas lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ventas crea ordenes_taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Ventas lee ordenes_taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

-- ================================================
-- 7. AJUSTAR ordenes_taller (YA existe - agregar columna)
-- ================================================
ALTER TABLE public.ordenes_taller
ADD COLUMN cliente_id UUID REFERENCES public.contactos(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_cliente ON public.ordenes_taller(cliente_id);

-- ================================================
-- 8. AJUSTAR bom_automatizacion (YA existe - agregar columnas)
-- ================================================
ALTER TABLE public.bom_automatizacion
ADD COLUMN proyecto_id UUID REFERENCES public.proyectos_automatizacion(id) ON DELETE CASCADE;

ALTER TABLE public.bom_automatizacion
ADD COLUMN tipo VARCHAR(20) CHECK (tipo IN ('material', 'servicio'));

ALTER TABLE public.bom_automatizacion
ADD COLUMN item_id UUID;

ALTER TABLE public.bom_automatizacion
ADD COLUMN cantidad NUMERIC(12,2) DEFAULT 1;

ALTER TABLE public.bom_automatizacion
ADD COLUMN costo_unitario NUMERIC(12,2);

ALTER TABLE public.bom_automatizacion
ADD COLUMN costo_total NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_bom_proyecto ON public.bom_automatizacion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bom_tipo ON public.bom_automatizacion(tipo);

ALTER TABLE public.bom_automatizacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo BOM" ON public.bom_automatizacion
    FOR ALL TO authenticated USING (true);
CREATE POLICY "Automatizacion ve BOM" ON public.bom_automatizacion
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Automatizacion gestiona BOM" ON public.bom_automatizacion
    FOR ALL TO authenticated USING (true);

-- ================================================
-- FIN
-- ================================================
