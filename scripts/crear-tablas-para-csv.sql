-- =============================================================================
-- CREAR TABLAS CON ESTRUCTURA COMPATIBLE CON LOS CSV
-- PROPÓSITO: Las tablas deben coincidir EXACTAMENTE con las columnas de los CSV
-- EJECUCIÓN: En SQL Editor del Supabase NUEVO (antes de importar CSV)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONTACTOS - CSV tiene: id, nombre, empresa, puesto, tipo, color, created_at, avatar, direccion, email, telefono, cargo, notas, rfc, sitio_web, logo_url, updated_at, created_by
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.contactos CASCADE;
CREATE TABLE public.contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT,
  empresa TEXT,
  puesto TEXT,
  tipo TEXT DEFAULT 'client',
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  avatar TEXT,
  direccion TEXT,
  email TEXT,
  telefono TEXT,
  cargo TEXT,
  notas TEXT,
  rfc TEXT,
  sitio_web TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS idx_contactos_email ON public.contactos(email);

-- -----------------------------------------------------------------------------
-- 2. CLIENTES - CSV tiene: id, nombre, nombre_comercial, direccion_encriptada, rfc_encriptado, contacto_nombre, contacto_email_encriptado, contacto_telefono_encriptado, km_distancia, horas_viaje, tipo_cliente, creado_por, creado_en, actualizado_en
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.clientes CASCADE;
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  nombre_comercial TEXT,
  direccion_encriptada TEXT,
  rfc_encriptado TEXT,
  contacto_nombre TEXT,
  contacto_email_encriptado TEXT,
  contacto_telefono_encriptado TEXT,
  km_distancia NUMERIC(10,2),
  horas_viaje NUMERIC(5,2),
  tipo_cliente TEXT DEFAULT 'industrial',
  creado_por UUID,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes(nombre);

-- -----------------------------------------------------------------------------
-- 3. INVENTARIO - CSV tiene: id, sku, nombre, descripcion, categoria, ubicacion, stock, minimo, costo, precio_venta, created_at, updated_at, created_by, hash
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.inventario CASCADE;
CREATE TABLE public.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  ubicacion TEXT,
  stock INTEGER DEFAULT 0,
  minimo INTEGER DEFAULT 0,
  costo NUMERIC(12,2) DEFAULT 0.00,
  precio_venta NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventario_sku ON public.inventario(sku);
CREATE INDEX IF NOT EXISTS idx_inventario_categoria ON public.inventario(categoria);

-- -----------------------------------------------------------------------------
-- 4. MOVIMIENTOS_INVENTARIO - CSV tiene: id, producto_id, sku, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo, referencia_id, usuario_id, created_at, hash, fecha
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.movimientos_inventario CASCADE;
CREATE TABLE public.movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID REFERENCES public.inventario(id) ON DELETE CASCADE,
  sku TEXT,
  tipo_movimiento TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER,
  stock_nuevo INTEGER,
  motivo TEXT,
  referencia_id UUID,
  usuario_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hash TEXT,
  fecha DATE
);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON public.movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON public.movimientos_inventario(tipo_movimiento);

-- -----------------------------------------------------------------------------
-- 5. VACACIONES_DIAS_FERIADOS - CSV tiene: id, fecha, nombre, tipo, anio, created_at
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.vacaciones_dias_feriados CASCADE;
CREATE TABLE public.vacaciones_dias_feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT,
  anio INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_feriados_fecha ON public.vacaciones_dias_feriados(fecha);

-- -----------------------------------------------------------------------------
-- 6. VACACIONES_EMPLEADOS - CSV tiene: id, user_id, nombre, rol, email, color, orden, created_at
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.vacaciones_empleados CASCADE;
CREATE TABLE public.vacaciones_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  nombre TEXT,
  rol TEXT,
  email TEXT,
  color TEXT,
  orden INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_empleado_user ON public.vacaciones_empleados(user_id);

-- -----------------------------------------------------------------------------
-- 7. CATALOGO_SERVICIOS - CSV tiene: id, area, servicio, descripcion, tipo, unidad, valor_agregado, horas_estimadas, activo, creado_en, actualizado_en
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.catalogo_servicios CASCADE;
CREATE TABLE public.catalogo_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT,
  servicio TEXT,
  descripcion TEXT,
  tipo TEXT,
  unidad TEXT,
  valor_agregado NUMERIC(12,2),
  horas_estimadas NUMERIC(8,2),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_area ON public.catalogo_servicios(area);

-- -----------------------------------------------------------------------------
-- 8. GASTOS_FIJOS - CSV tiene: id, concepto, monto_mensual, activo, creado_en, actualizado_en, nombre, monto
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.gastos_fijos CASCADE;
CREATE TABLE public.gastos_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT,
  monto_mensual NUMERIC(12,2),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  nombre TEXT,
  monto NUMERIC(12,2)
);
CREATE INDEX IF NOT EXISTS idx_gastos_fijos_concepto ON public.gastos_fijos(concepto);

-- =============================================================================
-- FIN - Tablas creadas con estructura compatible con CSV
-- =============================================================================
