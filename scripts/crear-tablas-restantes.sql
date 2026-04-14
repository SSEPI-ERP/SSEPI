-- =============================================================================
-- CREAR TABLAS RESTANTES PARA SSEPI
-- PROPÓSITO: Crear tablas necesarias para importar datos desde Supabase viejo
-- EJECUCIÓN: En SQL Editor del Supabase NUEVO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONTACTOS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- CLIENTES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  ruc TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_ruc ON public.clientes(ruc);

-- -----------------------------------------------------------------------------
-- INVENTARIO
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- MOVIMIENTOS INVENTARIO
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- VACACIONES DIAS FERIADOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vacaciones_dias_feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_feriados_fecha ON public.vacaciones_dias_feriados(fecha);

-- -----------------------------------------------------------------------------
-- VACACIONES EMPLEADOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vacaciones_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES public.usuarios(auth_user_id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacaciones_empleado_usuario ON public.vacaciones_empleados(usuario_id);

-- -----------------------------------------------------------------------------
-- CATALOGO SERVICIOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_base NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_nombre ON public.catalogo_servicios(nombre);

-- -----------------------------------------------------------------------------
-- GASTOS FIJOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  monto NUMERIC(12,2),
  categoria TEXT,
  frecuencia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_fijos_categoria ON public.gastos_fijos(categoria);

-- -----------------------------------------------------------------------------
-- LOGS SEGURIDAD (opcional, tiene 318 registros)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- COI CONNECTION STATE (opcional, tiene 824 registros)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coi_connection_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT UNIQUE,
  state JSONB,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coi_connection_id ON public.coi_connection_state(connection_id);

-- =============================================================================
-- FIN - TABLAS CREADAS
-- =============================================================================
