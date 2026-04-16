-- =====================================================
-- SCRIPT COMPLETO - TABLAS BASE SSEPI
-- Orden correcto para evitar errores de claves foráneas
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- ================================================
-- 1. TABLAS BASE (sin dependencias)
-- ================================================

-- Contactos (primero - es referencia para todas las demás)
CREATE TABLE IF NOT EXISTS public.contactos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    empresa TEXT,
    tipo TEXT DEFAULT 'cliente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contactos_email ON public.contactos(email);

-- Inventario
CREATE TABLE IF NOT EXISTS public.inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    cantidad INTEGER DEFAULT 0,
    precio_costo NUMERIC(12,2),
    precio_venta NUMERIC(12,2),
    categoria TEXT,
    ubicacion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventario_sku ON public.inventario(sku);
CREATE INDEX IF NOT EXISTS idx_inventario_categoria ON public.inventario(categoria);

-- Catálogo de servicios
CREATE TABLE IF NOT EXISTS public.catalogo_servicios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio_base NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_nombre ON public.catalogo_servicios(nombre);

-- ================================================
-- 2. COMPRAS (necesaria antes de ventas)
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

-- RLS para compras
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
-- 3. VENTAS (depende de contactos)
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
-- 4. COTIZACIONES (depende de contactos)
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
-- 5. ORDENES TALLER (depende de contactos)
-- ================================================
CREATE TABLE IF NOT EXISTS public.ordenes_taller (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(20) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.contactos(id),
    equipo VARCHAR(100),
    marca VARCHAR(50),
    modelo VARCHAR(50),
    serie VARCHAR(100),
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
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_cliente ON public.ordenes_taller(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_fecha ON public.ordenes_taller(fecha_ingreso);

-- RLS para ordenes_taller
ALTER TABLE public.ordenes_taller ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ve todo taller" ON public.ordenes_taller
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Taller lee taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Taller crea taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Taller actualiza taller" ON public.ordenes_taller
    FOR UPDATE TO authenticated USING (true);

-- ================================================
-- 6. ORDENES MOTORES (depende de contactos)
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
-- 7. PROYECTOS AUTOMATIZACION (depende de contactos)
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
-- 8. PERMISOS CRUZADOS (ventas puede ver/crear en compras y taller)
-- ================================================
DROP POLICY IF EXISTS "Ventas crea compras" ON public.compras;
DROP POLICY IF EXISTS "Ventas lee compras" ON public.compras;

CREATE POLICY "Ventas crea compras" ON public.compras
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Ventas lee compras" ON public.compras
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Ventas crea ordenes_taller" ON public.ordenes_taller;
DROP POLICY IF EXISTS "Ventas lee ordenes_taller" ON public.ordenes_taller;

CREATE POLICY "Ventas crea ordenes_taller" ON public.ordenes_taller
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Ventas lee ordenes_taller" ON public.ordenes_taller
    FOR SELECT TO authenticated USING (true);

-- ================================================
-- 9. TABLAS AUXILIARES
-- ================================================

-- Movimientos de inventario
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID REFERENCES public.inventario(id) ON DELETE CASCADE,
    tipo_movimiento TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    motivo TEXT,
    creado_por UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON public.movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON public.movimientos_inventario(tipo_movimiento);

-- Vacaciones días feriados
CREATE TABLE IF NOT EXISTS public.vacaciones_dias_feriados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    fecha DATE NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_feriados_fecha ON public.vacaciones_dias_feriados(fecha);

-- Vacaciones empleados
CREATE TABLE IF NOT EXISTS public.vacaciones_empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_empleado_usuario ON public.vacaciones_empleados(usuario_id);

-- Gastos fijos
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    monto NUMERIC(12,2),
    categoria TEXT,
    frecuencia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_fijos_categoria ON public.gastos_fijos(categoria);

-- Logs seguridad
CREATE TABLE IF NOT EXISTS public.logs_seguridad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID,
    accion TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    detalles JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logs_seguridad_usuario ON public.logs_seguridad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_seguridad_accion ON public.logs_seguridad(accion);

-- ================================================
-- 10. BOM Y SERVICIOS (AUTOMATIZACION)
-- ================================================
CREATE TABLE IF NOT EXISTS public.bom_automatizacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID REFERENCES public.proyectos_automatizacion(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('material', 'servicio')),
    item_id UUID, -- Puede ser inventario.id o catalogo_servicios.id
    cantidad NUMERIC(12,2) DEFAULT 1,
    costo_unitario NUMERIC(12,2),
    costo_total NUMERIC(12,2),
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bom_proyecto ON public.bom_automatizacion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_bom_tipo ON public.bom_automatizacion(tipo);

-- RLS para BOM
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
