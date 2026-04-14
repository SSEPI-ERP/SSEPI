-- =============================================================================
-- MIGRAR DATOS DESDE SUPABASE VIEJO AL NUEVO
-- PROPÓSITO: Copiar datos de tablas existentes al nuevo proyecto
-- IMPORTANTE: Primero configurar FDW (ver instrucciones abajo)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASO 0: CONFIGURAR FOREIGN DATA WRAPPER (solo una vez)
-- -----------------------------------------------------------------------------
-- NOTA: Esto requiere los datos de conexión del Supabase VIEJO
-- 1. Ir al Dashboard del Supabase VIEJO → Project Settings → Database
-- 2. Copiar: Host, Port, Database, User, Password
-- 3. Reemplazar los valores abajo en CONNECTION_INFO

/*
-- EJECUTAR ESTO PRIMERO (con datos reales del viejo):

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER supabase_viejo
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
  host 'db.xxxxxxxxxxxxxx.supabase.co',
  port '5432',
  dbname 'postgres',
  sslmode 'require'
);

CREATE USER MAPPING FOR CURRENT_USER
SERVER supabase_viejo
OPTIONS (
  user 'postgres',
  password 'TU_PASSWORD_DEL_VIEJO'
);

-- Luego crear foreign tables para importar
CREATE FOREIGN TABLE IF NOT EXISTS old_usuarios (
  id UUID,
  auth_user_id UUID,
  email TEXT,
  nombre TEXT,
  rol TEXT,
  departamento TEXT,
  telefono TEXT,
  sede TEXT,
  nivel_riesgo TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'usuarios');

CREATE FOREIGN TABLE IF NOT EXISTS old_users (
  id UUID,
  auth_user_id UUID,
  email TEXT,
  nombre TEXT,
  rol TEXT,
  departamento TEXT,
  telefono TEXT,
  sede TEXT,
  nivel_riesgo TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'users');

CREATE FOREIGN TABLE IF NOT EXISTS old_contactos (
  id UUID,
  nombre TEXT,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  tipo TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'contactos');

CREATE FOREIGN TABLE IF NOT EXISTS old_clientes (
  id UUID,
  nombre TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  ruc TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'clientes');

CREATE FOREIGN TABLE IF NOT EXISTS old_inventario (
  id UUID,
  sku TEXT,
  nombre TEXT,
  descripcion TEXT,
  cantidad INTEGER,
  precio_costo NUMERIC,
  precio_venta NUMERIC,
  categoria TEXT,
  ubicacion TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'inventario');

CREATE FOREIGN TABLE IF NOT EXISTS old_movimientos_inventario (
  id UUID,
  producto_id UUID,
  tipo_movimiento TEXT,
  cantidad INTEGER,
  motivo TEXT,
  creado_por UUID,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'movimientos_inventario');

CREATE FOREIGN TABLE IF NOT EXISTS old_role_permissions (
  id UUID,
  rol TEXT,
  module TEXT,
  action TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'role_permissions');

CREATE FOREIGN TABLE IF NOT EXISTS old_vacaciones_dias_feriados (
  id UUID,
  nombre TEXT,
  fecha DATE,
  descripcion TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'vacaciones_dias_feriados');

CREATE FOREIGN TABLE IF NOT EXISTS old_vacaciones_empleados (
  id UUID,
  usuario_id UUID,
  fecha_inicio DATE,
  fecha_fin DATE,
  estado TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'vacaciones_empleados');

CREATE FOREIGN TABLE IF NOT EXISTS old_catalogo_servicios (
  id UUID,
  nombre TEXT,
  descripcion TEXT,
  precio_base NUMERIC,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'catalogo_servicios');

CREATE FOREIGN TABLE IF NOT EXISTS old_gastos_fijos (
  id UUID,
  nombre TEXT,
  monto NUMERIC,
  categoria TEXT,
  frecuencia TEXT,
  created_at TIMESTAMPTZ
) SERVER supabase_viejo OPTIONS (schema_name 'public', table_name 'gastos_fijos');
*/

-- -----------------------------------------------------------------------------
-- PASO 1: INSERTAR DATOS DESDE FOREIGN TABLES
-- -----------------------------------------------------------------------------
-- (Ejecutar después de crear las foreign tables arriba)

-- Usuarios (priorizar auth_user_id válido)
INSERT INTO public.usuarios (auth_user_id, email, nombre, rol, departamento, telefono, sede, nivel_riesgo)
SELECT auth_user_id, email, nombre, rol, departamento, telefono, sede, nivel_riesgo
FROM old_usuarios
WHERE auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET
  email = EXCLUDED.email,
  nombre = EXCLUDED.nombre,
  rol = EXCLUDED.rol,
  departamento = EXCLUDED.departamento,
  telefono = EXCLUDED.telefono,
  sede = EXCLUDED.sede,
  nivel_riesgo = EXCLUDED.nivel_riesgo;

-- Role permissions (el setup-supabase-nuevo.sql ya insertó algunos)
INSERT INTO public.role_permissions (rol, module, action)
SELECT DISTINCT rol, module, action
FROM old_role_permissions
ON CONFLICT (rol, module, action) DO NOTHING;

-- Contactos
INSERT INTO public.contactos (nombre, email, telefono, empresa, tipo)
SELECT nombre, email, telefono, empresa, tipo
FROM old_contactos
ON CONFLICT DO NOTHING;

-- Clientes
INSERT INTO public.clientes (nombre, email, telefono, direccion, ruc)
SELECT nombre, email, telefono, direccion, ruc
FROM old_clientes
ON CONFLICT DO NOTHING;

-- Inventario
INSERT INTO public.inventario (sku, nombre, descripcion, cantidad, precio_costo, precio_venta, categoria, ubicacion)
SELECT sku, nombre, descripcion, cantidad, precio_costo, precio_venta, categoria, ubicacion
FROM old_inventario
ON CONFLICT DO NOTHING;

-- Movimientos inventario
INSERT INTO public.movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, creado_por)
SELECT producto_id, tipo_movimiento, cantidad, motivo, creado_por
FROM old_movimientos_inventario
ON CONFLICT DO NOTHING;

-- Vacaciones feriados
INSERT INTO public.vacaciones_dias_feriados (nombre, fecha, descripcion)
SELECT nombre, fecha, descripcion
FROM old_vacaciones_dias_feriados
ON CONFLICT DO NOTHING;

-- Vacaciones empleados
INSERT INTO public.vacaciones_empleados (usuario_id, fecha_inicio, fecha_fin, estado)
SELECT usuario_id, fecha_inicio, fecha_fin, estado
FROM old_vacaciones_empleados
ON CONFLICT DO NOTHING;

-- Catálogo servicios
INSERT INTO public.catalogo_servicios (nombre, descripcion, precio_base)
SELECT nombre, descripcion, precio_base
FROM old_catalogo_servicios
ON CONFLICT DO NOTHING;

-- Gastos fijos
INSERT INTO public.gastos_fijos (nombre, monto, categoria, frecuencia)
SELECT nombre, monto, categoria, frecuencia
FROM old_gastos_fijos
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- PASO 2: LIMPIAR (opcual, después de migrar)
-- -----------------------------------------------------------------------------
-- DROP FOREIGN TABLE IF EXISTS old_usuarios;
-- DROP FOREIGN TABLE IF EXISTS old_users;
-- DROP FOREIGN TABLE IF EXISTS old_contactos;
-- DROP FOREIGN TABLE IF EXISTS old_clientes;
-- DROP FOREIGN TABLE IF EXISTS old_inventario;
-- DROP FOREIGN TABLE IF EXISTS old_movimientos_inventario;
-- DROP FOREIGN TABLE IF EXISTS old_role_permissions;
-- DROP FOREIGN TABLE IF EXISTS old_vacaciones_dias_feriados;
-- DROP FOREIGN TABLE IF EXISTS old_vacaciones_empleados;
-- DROP FOREIGN TABLE IF EXISTS old_catalogo_servicios;
-- DROP FOREIGN TABLE IF EXISTS old_gastos_fijos;
-- DROP SERVER IF EXISTS supabase_viejo CASCADE;
-- DROP EXTENSION IF EXISTS postgres_fdw;

-- =============================================================================
-- FIN DEL SCRIPT DE MIGRACIÓN
-- =============================================================================
