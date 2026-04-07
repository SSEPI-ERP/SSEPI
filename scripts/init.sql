-- ================================================
-- ARCHIVO: init.sql
-- DESCRIPCIÓN: Esquema completo de base de datos con encriptación y auditoría
-- SEGURIDAD: pgcrypto, RLS, triggers de auditoría, hash de integridad
-- ================================================

-- HABILITAR EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== TABLA DE PERFILES DE USUARIO ====================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'ventas', 'automatizacion', 'taller', 'motores', 'compras', 'facturacion', 'contabilidad')),
  telefono TEXT,
  avatar_url TEXT,
  mfa_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==================== TABLA DE PERMISOS POR ROL ====================
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rol TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create', 'read', 'update', 'delete', 'generate_pdf', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rol, module, action)
);

-- Insertar permisos iniciales (ejemplo)
INSERT INTO role_permissions (rol, module, action) VALUES
  ('admin', '*', '*'),
  ('ventas', 'ventas', 'create'),
  ('ventas', 'ventas', 'read'),
  ('ventas', 'ventas', 'update'),
  ('ventas', 'ventas', 'generate_pdf'),
  ('ventas', 'clientes', 'read'),
  ('ventas', 'compras', 'read'),
  ('ventas', 'ordenes_taller', 'read'),
  ('ventas', 'ordenes_motores', 'read'),
  ('ventas', 'cotizaciones', 'create'),
  ('ventas', 'cotizaciones', 'read'),
  ('ventas', 'cotizaciones', 'update'),
  ('ventas', 'contactos', 'read'),
  ('ventas', 'inventario', 'read'),
  ('ventas', 'proyectos_automatizacion', 'read'),
  ('taller', 'ordenes_taller', 'create'),
  ('taller', 'ordenes_taller', 'read'),
  ('taller', 'ordenes_taller', 'update'),
  ('taller', 'inventario', 'read'),
  ('taller', 'compras', 'create'),
  ('taller', 'compras', 'read'),
  ('taller', 'ordenes_motores', 'read'),
  ('taller', 'cotizaciones', 'read'),
  ('motores', 'ordenes_motores', 'create'),
  ('motores', 'ordenes_motores', 'read'),
  ('motores', 'ordenes_motores', 'update'),
  ('motores', 'inventario', 'read'),
  ('motores', 'compras', 'create'),
  ('motores', 'compras', 'read'),
  ('motores', 'ordenes_taller', 'read'),
  ('motores', 'cotizaciones', 'read'),
  ('compras', 'compras', 'create'),
  ('compras', 'compras', 'read'),
  ('compras', 'compras', 'update'),
  ('compras', 'proveedores', 'read'),
  ('compras', 'inventario', 'read'),
  ('compras', 'cotizaciones', 'read'),
  ('compras', 'cotizaciones', 'update'),
  ('automatizacion', 'proyectos_automatizacion', 'create'),
  ('automatizacion', 'proyectos_automatizacion', 'read'),
  ('automatizacion', 'proyectos_automatizacion', 'update'),
  ('automatizacion', 'inventario', 'read'),
  ('automatizacion', 'compras', 'create'),
  ('automatizacion', 'compras', 'read'),
  ('automatizacion', 'soporte_visitas', 'create'),
  ('automatizacion', 'soporte_visitas', 'read'),
  ('automatizacion', 'soporte_visitas', 'update'),
  ('facturacion', 'facturas', 'create'),
  ('facturacion', 'facturas', 'read'),
  ('facturacion', 'ventas', 'read'),
  ('facturacion', 'compras', 'read'),
  ('contabilidad', '*', 'read') -- Solo lectura
ON CONFLICT (rol, module, action) DO NOTHING;

-- ==================== TABLA DE AUDITORÍA ====================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'PDF_GENERATE'
  user_id UUID REFERENCES profiles(id),
  user_email TEXT,
  user_role TEXT,
  ip INET,
  user_agent TEXT,
  old_data JSONB,
  new_data JSONB,
  severity TEXT DEFAULT 'info', -- 'info', 'warning', 'critical' (para SIEM)
  metadata JSONB DEFAULT '{}', -- contexto adicional para correlación
  hash TEXT, -- Hash de los datos para verificar integridad
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- ==================== TABLA DE LOGS DE AUTENTICACIÓN ====================
CREATE TABLE auth_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_hash TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip INET,
  user_agent TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_logs_timestamp ON auth_logs(timestamp);
CREATE INDEX idx_auth_logs_email_hash ON auth_logs(email_hash);

-- ==================== FUNCIÓN PARA CALCULAR HASH DE INTEGRIDAD ====================
CREATE OR REPLACE FUNCTION calculate_row_hash(record JSONB, exclude_fields TEXT[] DEFAULT '{}')
RETURNS TEXT AS $$
DECLARE
  record_copy JSONB;
  json_string TEXT;
BEGIN
  record_copy = record;
  -- Eliminar campos excluidos
  FOR i IN 1..array_length(exclude_fields, 1) LOOP
    record_copy = record_copy - exclude_fields[i];
  END LOOP;
  -- Ordenar claves
  json_string = (SELECT jsonb_pretty(record_copy));
  -- Calcular hash (usando digest de pgcrypto)
  RETURN encode(digest(json_string, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- ==================== FUNCIÓN PARA ENCRIPTAR CAMPOS SENSIBLES ====================
-- La clave puede venir de: 1) variable de sesión app.encryption_key (BYOK desde Vault/Key Vault),
-- 2) tabla system_config. En producción no almacenar la clave en la BD; inyectarla vía SET LOCAL en cada sesión.
CREATE OR REPLACE FUNCTION encrypt_sensitive_fields()
RETURNS TRIGGER AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- BYOK: preferir clave inyectada por la aplicación (desde Vault/Key Vault)
  encryption_key := current_setting('app.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    SELECT value INTO encryption_key FROM system_config WHERE key = 'encryption_key';
  END IF;

  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'encryption_key no configurada: usar app.encryption_key o system_config';
  END IF;

  -- Encriptar campos específicos según la tabla
  IF TG_TABLE_NAME = 'contactos' THEN
    NEW.rfc = pgp_sym_encrypt(NEW.rfc, encryption_key, 'compress-algo=1, cipher-algo=aes256');
    NEW.email = pgp_sym_encrypt(NEW.email, encryption_key, 'compress-algo=1, cipher-algo=aes256');
    NEW.telefono = pgp_sym_encrypt(NEW.telefono, encryption_key, 'compress-algo=1, cipher-algo=aes256');
    NEW.direccion = pgp_sym_encrypt(NEW.direccion, encryption_key, 'compress-algo=1, cipher-algo=aes256');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== TABLA DE CONFIGURACIÓN DEL SISTEMA ====================
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar clave de encriptación (en producción, generar una aleatoria y guardarla en variable de entorno)
INSERT INTO system_config (key, value, description) VALUES
  ('encryption_key', 'ssepi-super-secret-key-2026', 'Clave para encriptación AES-256 de datos sensibles')
ON CONFLICT (key) DO NOTHING;

-- ==================== TABLA CONTACTOS (con encriptación) ====================
CREATE TABLE contactos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  empresa TEXT,
  puesto TEXT,
  telefono BYTEA, -- encriptado
  email BYTEA,    -- encriptado
  direccion BYTEA, -- encriptado
  rfc BYTEA,       -- encriptado
  sitio_web TEXT,
  etiquetas TEXT[],
  tipo TEXT NOT NULL CHECK (tipo IN ('client', 'provider')),
  logo_url TEXT,
  color TEXT DEFAULT '#00a09d',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT -- hash de integridad
);

-- Trigger para encriptar antes de insertar/actualizar
CREATE TRIGGER encrypt_contactos_before_insert_update
  BEFORE INSERT OR UPDATE ON contactos
  FOR EACH ROW
  EXECUTE FUNCTION encrypt_sensitive_fields();

-- Trigger para calcular hash después de insertar/actualizar
CREATE OR REPLACE FUNCTION update_contactos_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hash = calculate_row_hash(to_jsonb(NEW), ARRAY['id', 'created_at', 'updated_at', 'hash']);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contactos_hash
  BEFORE INSERT OR UPDATE ON contactos
  FOR EACH ROW
  EXECUTE FUNCTION update_contactos_hash();

-- Políticas RLS para contactos
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY contactos_admin_all ON contactos
  USING (auth.jwt() ->> 'rol' = 'admin');

CREATE POLICY contactos_ventas_read ON contactos
  FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'facturacion', 'contabilidad'));

CREATE POLICY contactos_compras_read ON contactos
  FOR SELECT USING (auth.jwt() ->> 'rol' = 'compras' AND tipo = 'provider');

-- ==================== TABLA INVENTARIO ====================
CREATE TABLE inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN ('refaccion', 'almacenable', 'consumible', 'servicio')),
  ubicacion TEXT,
  stock INTEGER DEFAULT 0,
  minimo INTEGER DEFAULT 0,
  costo NUMERIC(10,2) DEFAULT 0,
  precio_venta NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

CREATE TRIGGER update_inventario_hash
  BEFORE INSERT OR UPDATE ON inventario
  FOR EACH ROW
  EXECUTE FUNCTION update_contactos_hash(); -- Reutilizamos la misma función (genérica)

ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventario_admin_all ON inventario;
CREATE POLICY inventario_admin_all ON inventario
  FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');

CREATE POLICY inventario_taller_read ON inventario FOR SELECT USING (auth.jwt() ->> 'rol' IN ('taller', 'compras', 'ventas'));
CREATE POLICY inventario_compras_update ON inventario FOR UPDATE USING (auth.jwt() ->> 'rol' = 'compras');

-- ==================== TABLA MOVIMIENTOS INVENTARIO ====================
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES inventario(id) ON DELETE CASCADE,
  sku TEXT,
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER,
  stock_nuevo INTEGER,
  motivo TEXT,
  referencia_id UUID, -- Puede referenciar a orden de compra, taller, etc.
  usuario_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hash TEXT
);

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimientos_admin_all ON movimientos_inventario;
CREATE POLICY movimientos_admin_all ON movimientos_inventario
  FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY movimientos_taller_insert ON movimientos_inventario FOR INSERT WITH CHECK (auth.jwt() ->> 'rol' IN ('taller', 'compras'));

-- ==================== TABLA CLIENTES_TABULADOR (datos logísticos) ====================
CREATE TABLE clientes_tabulador (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_cliente TEXT UNIQUE NOT NULL,
  km NUMERIC(10,2) DEFAULT 0,
  horas_viaje NUMERIC(5,2) DEFAULT 0,
  direccion TEXT,
  contacto TEXT
);

-- Insertar datos iniciales del tabulador (según archivo original)
INSERT INTO clientes_tabulador (nombre_cliente, km, horas_viaje) VALUES
  ('ANGUIPLAST', 234, 6),
  ('BOLSAS DE LOS ALTOS', 226, 5),
  ('ECOBOLSAS', 216, 5),
  ('BADER', 17.2, 2),
  ('BODYCOTE', 90.6, 3),
  ('COFICAB', 80, 3),
  ('CONDUMEX', 90.6, 3),
  ('ECSA', 32, 2),
  ('EMMSA', 21.6, 2),
  ('EPC 1', 400, 7),
  ('EPC 2', 402, 8),
  ('FRAENKISCHE', 79.4, 3),
  ('GEDNEY', 23.6, 3),
  ('GRUPO ACERERO', 386, 7),
  ('HALL ALUMINIUM', 73.8, 3),
  ('HIRUTA', 58.4, 3),
  ('IK PLASTIC', 61.4, 3),
  ('IMPRENTA JM', 16.2, 2),
  ('JARDIN LA ALEMANA', 12, 2),
  ('MAFLOW', 59.8, 3),
  ('MARQUARDT', 125.4, 4),
  ('MICROONDA', 41.6, 3),
  ('MR LUCKY', 157, 4),
  ('NHK SPRING MEXICO', 138.6, 4),
  ('NISHIKAWA', 61, 3),
  ('PIELES AZTECA', 5, 1),
  ('RONGTAI', 28.2, 3),
  ('SAFE DEMO', 61.6, 3),
  ('SERVIACERO ELECTROFORJADOS', 14.6, 2),
  ('SUACERO', 392, 8),
  ('TQ-1', 26, 2),
  ('MINO INDUSTRY', 29.2, 2),
  ('CURTIDOS BENGALA', 17.2, 2)
ON CONFLICT (nombre_cliente) DO NOTHING;

-- ==================== TABLA SOPORTE_VISITAS (Soporte de Planta) ====================
CREATE TABLE soporte_visitas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE,
  fecha DATE,
  cliente TEXT NOT NULL,
  area TEXT,
  ubicacion TEXT,
  equipo TEXT,
  responsable_cliente TEXT,
  tecnico TEXT,
  departamento TEXT,
  hora_inicio TEXT,
  hora_final TEXT,
  objetivo TEXT,
  actividades JSONB, -- lista de actividades (checkboxes)
  descripcion_actividades TEXT,
  pruebas_realizadas TEXT,
  recomendaciones TEXT,
  observaciones_cliente TEXT,
  estado TEXT DEFAULT 'confirmacion' CHECK (estado IN ('confirmacion', 'proyecto', 'cancelado')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

CREATE TRIGGER update_soporte_visitas_hash
  BEFORE INSERT OR UPDATE ON soporte_visitas
  FOR EACH ROW
  EXECUTE FUNCTION update_contactos_hash();

CREATE TRIGGER update_soporte_visitas_updated_at
  BEFORE UPDATE ON soporte_visitas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE soporte_visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY soporte_visitas_admin_all ON soporte_visitas USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY soporte_visitas_automatizacion_all ON soporte_visitas FOR ALL USING (auth.jwt() ->> 'rol' = 'automatizacion');
CREATE POLICY soporte_visitas_ventas_read ON soporte_visitas FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'contabilidad'));

-- ==================== TABLA PROYECTOS_AUTOMATIZACION ====================
CREATE TABLE proyectos_automatizacion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visita_id UUID, -- vínculo opcional a soporte_visitas
  folio TEXT UNIQUE NOT NULL,
  nombre TEXT,
  cliente TEXT,
  fecha DATE,
  vendedor TEXT,
  notas_generales TEXT,
  notas_internas TEXT,
  actividades JSONB,
  materiales JSONB,
  epicas JSONB,
  apartados JSONB,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'progreso', 'completado', 'cancelado')),
  etapa_actual INTEGER DEFAULT 1,
  avance INTEGER DEFAULT 0,
  fechas_etapas JSONB,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

CREATE TRIGGER update_proyectos_automatizacion_hash
  BEFORE INSERT OR UPDATE ON proyectos_automatizacion
  FOR EACH ROW
  EXECUTE FUNCTION update_contactos_hash();

CREATE TRIGGER update_proyectos_automatizacion_updated_at
  BEFORE UPDATE ON proyectos_automatizacion
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE proyectos_automatizacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyectos_admin_all ON proyectos_automatizacion USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY proyectos_automatizacion_all ON proyectos_automatizacion FOR ALL USING (auth.jwt() ->> 'rol' = 'automatizacion');
CREATE POLICY proyectos_ventas_read ON proyectos_automatizacion FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'compras', 'contabilidad'));

-- ==================== TABLA ORDENES_TALLER (electrónica) ====================
CREATE TABLE ordenes_taller (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE NOT NULL,
  cliente_nombre TEXT NOT NULL,
  referencia TEXT,
  fecha_ingreso TIMESTAMPTZ NOT NULL,
  equipo TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  serie TEXT,
  falla_reportada TEXT,
  condiciones_fisicas TEXT,
  encargado_recepcion TEXT,
  bajo_garantia BOOLEAN DEFAULT false,
  foto_ingreso TEXT,
  tecnico_responsable TEXT,
  notas_internas TEXT,
  notas_generales TEXT,
  horas_estimadas NUMERIC(5,2) DEFAULT 0,
  refacciones_enlaces JSONB,
  refacciones_inventario JSONB,
  consumibles_usados JSONB,
  componentes_inventario JSONB,
  componentes_compra JSONB,
  estado TEXT DEFAULT 'Nuevo' CHECK (estado IN ('Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado', 'Facturado')),
  fecha_reparacion TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,
  recibe_nombre TEXT,
  recibe_identificacion TEXT,
  factura_numero TEXT,
  entrega_obs TEXT,
  recibido_por TEXT,
  fecha_inicio TIMESTAMPTZ,
  fechas_etapas JSONB,
  historial JSONB,
  compra_vinculada UUID,
  compra_folio TEXT,
  fecha_envio_compra TIMESTAMPTZ,
  sin_reparacion BOOLEAN DEFAULT false,
  fecha_sin_reparacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

ALTER TABLE ordenes_taller ENABLE ROW LEVEL SECURITY;
CREATE POLICY taller_admin_all ON ordenes_taller USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY taller_taller_all ON ordenes_taller FOR ALL USING (auth.jwt() ->> 'rol' = 'taller');
CREATE POLICY taller_ventas_read ON ordenes_taller FOR SELECT USING (auth.jwt() ->> 'rol' = 'ventas');
CREATE POLICY taller_compras_read ON ordenes_taller FOR SELECT USING (auth.jwt() ->> 'rol' = 'compras');
CREATE POLICY taller_facturacion_read ON ordenes_taller FOR SELECT USING (auth.jwt() ->> 'rol' = 'facturacion');

-- ==================== TABLA ORDENES_MOTORES ====================
CREATE TABLE ordenes_motores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE NOT NULL,
  cliente_nombre TEXT NOT NULL,
  referencia TEXT,
  fecha_ingreso TIMESTAMPTZ NOT NULL,
  motor TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  serie TEXT,
  hp NUMERIC(6,2),
  rpm INTEGER,
  voltaje TEXT,
  falla_reportada TEXT,
  condiciones_fisicas TEXT,
  encargado_recepcion TEXT,
  bajo_garantia BOOLEAN DEFAULT false,
  foto_ingreso TEXT,
  tecnico_responsable TEXT,
  megger NUMERIC(10,2),
  ip NUMERIC(5,2),
  rU NUMERIC(10,3),
  rV NUMERIC(10,3),
  rW NUMERIC(10,3),
  notas_internas TEXT,
  notas_generales TEXT,
  horas_estimadas NUMERIC(5,2) DEFAULT 0,
  refacciones_enlaces JSONB,
  refacciones_inventario JSONB,
  consumibles_usados JSONB,
  componentes_inventario JSONB,
  componentes_compra JSONB,
  estado TEXT DEFAULT 'Nuevo' CHECK (estado IN ('Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado', 'Facturado')),
  fecha_reparacion TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,
  recibe_nombre TEXT,
  recibe_identificacion TEXT,
  factura_numero TEXT,
  entrega_obs TEXT,
  fecha_inicio TIMESTAMPTZ,
  fechas_etapas JSONB,
  historial JSONB,
  compra_vinculada UUID,
  compra_folio TEXT,
  fecha_envio_compra TIMESTAMPTZ,
  sin_reparacion BOOLEAN DEFAULT false,
  fecha_sin_reparacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

-- Políticas similares a taller

-- ==================== TABLA COMPRAS ====================
CREATE TABLE compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE NOT NULL,
  proveedor TEXT NOT NULL,
  departamento TEXT,
  fecha_requerida DATE,
  prioridad TEXT DEFAULT 'Normal',
  vinculacion JSONB, -- { tipo: 'taller'|'motor'|'proyecto', id: UUID, nombre: cliente }
  items JSONB,
  total NUMERIC(12,2) DEFAULT 0,
  estado INTEGER DEFAULT 1, -- 1: Solicitud, 2: Cotización, 3: Confirmada, 4: Recibida, 5: Entregada
  pasos JSONB,
  confirmado_ventas BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  hash TEXT
);

-- FKs (definidas después para evitar referencias hacia adelante)
DO $$
BEGIN
  ALTER TABLE ordenes_taller
    ADD CONSTRAINT ordenes_taller_compra_vinculada_fkey
    FOREIGN KEY (compra_vinculada) REFERENCES compras(id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ordenes_motores
    ADD CONSTRAINT ordenes_motores_compra_vinculada_fkey
    FOREIGN KEY (compra_vinculada) REFERENCES compras(id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_admin_all ON compras USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY compras_compras_all ON compras FOR ALL USING (auth.jwt() ->> 'rol' = 'compras');
CREATE POLICY compras_taller_read ON compras FOR SELECT USING (auth.jwt() ->> 'rol' = 'taller' AND vinculacion->>'tipo' = 'taller');
CREATE POLICY compras_motores_read ON compras FOR SELECT USING (auth.jwt() ->> 'rol' = 'taller' AND vinculacion->>'tipo' = 'motor'); -- Asumiendo que taller también ve motores

-- ==================== TABLA COTIZACIONES ====================
CREATE TABLE cotizaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'cotizacion' CHECK (tipo IN ('cotizacion')),
  cliente TEXT NOT NULL,
  rfc TEXT,
  email TEXT,
  telefono TEXT,
  fecha DATE NOT NULL,
  items JSONB,
  subtotal NUMERIC(12,2),
  iva NUMERIC(12,2),
  total NUMERIC(12,2),
  estado TEXT DEFAULT 'pendiente_autorizacion_ventas',
  origen TEXT, -- 'taller'|'motor'|'proyecto'|'directo'
  orden_origen_id UUID,
  vendedor TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

CREATE TRIGGER update_cotizaciones_hash
  BEFORE INSERT OR UPDATE ON cotizaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_contactos_hash();

CREATE TRIGGER update_cotizaciones_updated_at
  BEFORE UPDATE ON cotizaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizaciones_admin_all ON cotizaciones USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY cotizaciones_ventas_all ON cotizaciones FOR ALL USING (auth.jwt() ->> 'rol' = 'ventas');
CREATE POLICY cotizaciones_compras_read ON cotizaciones FOR SELECT USING (auth.jwt() ->> 'rol' IN ('compras', 'facturacion', 'contabilidad'));
CREATE POLICY cotizaciones_compras_update ON cotizaciones FOR UPDATE USING (auth.jwt() ->> 'rol' = 'compras');

-- ==================== TABLA VENTAS ====================
CREATE TABLE ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'venta' CHECK (tipo IN ('venta', 'cotizacion')),
  cliente TEXT NOT NULL,
  rfc TEXT,
  email TEXT,
  telefono TEXT,
  fecha DATE NOT NULL,
  fecha_pago DATE,
  estatus_pago TEXT DEFAULT 'Pendiente' CHECK (estatus_pago IN ('Pendiente', 'Pagado')),
  items JSONB,
  subtotal NUMERIC(12,2),
  iva NUMERIC(12,2),
  total NUMERIC(12,2),
  origen TEXT, -- 'taller', 'motor', 'proyecto', 'directo'
  orden_origen_id UUID,
  facturado BOOLEAN DEFAULT false,
  fecha_factura TIMESTAMPTZ,
  uuid_factura TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  hash TEXT
);

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ventas_admin_all ON ventas USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY ventas_ventas_all ON ventas FOR ALL USING (auth.jwt() ->> 'rol' = 'ventas');
CREATE POLICY ventas_facturacion_read ON ventas FOR SELECT USING (auth.jwt() ->> 'rol' = 'facturacion');
CREATE POLICY ventas_contabilidad_read ON ventas FOR SELECT USING (auth.jwt() ->> 'rol' = 'contabilidad');

-- ==================== TABLA FACTURAS ====================
CREATE TABLE facturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio_factura TEXT UNIQUE NOT NULL,
  orden_taller_id UUID REFERENCES ordenes_taller(id),
  orden_motor_id UUID REFERENCES ordenes_motores(id),
  venta_id UUID REFERENCES ventas(id),
  cliente TEXT NOT NULL,
  rfc TEXT,
  fecha_emision TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(12,2),
  iva NUMERIC(12,2),
  total NUMERIC(12,2),
  uuid_cfdi TEXT UNIQUE,
  estatus TEXT DEFAULT 'activa',
  pdf_url TEXT,
  xml_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY facturas_admin_all ON facturas USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY facturas_facturacion_all ON facturas FOR ALL USING (auth.jwt() ->> 'rol' = 'facturacion');
CREATE POLICY facturas_contabilidad_read ON facturas FOR SELECT USING (auth.jwt() ->> 'rol' = 'contabilidad');

-- ==================== TABLA INGRESOS_CONTABILIDAD ====================
CREATE TABLE ingresos_contabilidad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio TEXT NOT NULL,
  monto_total NUMERIC(12,2) NOT NULL,
  iva NUMERIC(12,2),
  subtotal NUMERIC(12,2),
  cliente TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  tipo_servicio TEXT,
  orden_taller_id UUID REFERENCES ordenes_taller(id),
  orden_motor_id UUID REFERENCES ordenes_motores(id),
  uuid_cfdi TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

-- ==================== TABLA NOMINA (empleados) ====================
CREATE TABLE empleados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  puesto TEXT NOT NULL,
  sueldo_diario NUMERIC(10,2) NOT NULL,
  email BYTEA,
  telefono BYTEA,
  direccion BYTEA,
  fecha_ingreso DATE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

-- Trigger de encriptación para empleados (similar a contactos)

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
CREATE POLICY empleados_admin_all ON empleados USING (auth.jwt() ->> 'rol' = 'admin');
CREATE POLICY empleados_contabilidad_all ON empleados FOR ALL USING (auth.jwt() ->> 'rol' = 'contabilidad');

-- ==================== TABLA PAGOS_NOMINA ====================
CREATE TABLE pagos_nomina (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empleado_id UUID REFERENCES empleados(id),
  empleado_nombre TEXT,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  dias_trabajados INTEGER,
  dias_detalle JSONB,
  sueldo_base NUMERIC(10,2),
  horas_extras NUMERIC(10,2),
  bonos NUMERIC(10,2),
  deducciones NUMERIC(10,2),
  total NUMERIC(10,2) NOT NULL,
  fecha_pago DATE NOT NULL,
  estado TEXT DEFAULT 'pagado',
  metodo_pago TEXT,
  referencia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  hash TEXT
);

-- ==================== TABLA MOVIMIENTOS_BANCO ====================
CREATE TABLE movimientos_banco (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  concepto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto NUMERIC(12,2) NOT NULL,
  fecha DATE NOT NULL,
  metodo TEXT,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  creado_por UUID REFERENCES profiles(id),
  hash TEXT
);

-- ==================== TABLA NOTIFICACIONES ====================
CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  para TEXT NOT NULL, -- 'taller', 'compras', 'ventas', 'facturacion', etc.
  tipo TEXT NOT NULL,
  orden_id UUID,
  compra_id UUID,
  folio TEXT,
  cliente TEXT,
  mensaje TEXT NOT NULL,
  leido BOOLEAN DEFAULT false,
  fecha TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== VISTA PARA DATOS DESENCRIPTADOS (solo para usuarios autorizados) ====================
-- Nota: Las vistas pueden usar las funciones de desencriptación, pero deben estar protegidas con RLS.
-- Ejemplo para contactos:
CREATE OR REPLACE VIEW contactos_desencriptados AS
SELECT
  id,
  nombre,
  empresa,
  puesto,
  pgp_sym_decrypt(telefono, (SELECT value FROM system_config WHERE key = 'encryption_key')) as telefono,
  pgp_sym_decrypt(email, (SELECT value FROM system_config WHERE key = 'encryption_key')) as email,
  pgp_sym_decrypt(direccion, (SELECT value FROM system_config WHERE key = 'encryption_key')) as direccion,
  pgp_sym_decrypt(rfc, (SELECT value FROM system_config WHERE key = 'encryption_key')) as rfc,
  sitio_web,
  etiquetas,
  tipo,
  logo_url,
  color,
  created_at,
  updated_at,
  created_by
FROM contactos;

ALTER VIEW contactos_desencriptados SET (security_invoker = true);
GRANT SELECT ON contactos_desencriptados TO authenticated;

-- ==================== ÍNDICES ADICIONALES ====================
CREATE INDEX idx_ordenes_taller_estado ON ordenes_taller(estado);
CREATE INDEX idx_ordenes_taller_fecha_ingreso ON ordenes_taller(fecha_ingreso);
CREATE INDEX idx_ordenes_motores_estado ON ordenes_motores(estado);
CREATE INDEX idx_ordenes_motores_fecha_ingreso ON ordenes_motores(fecha_ingreso);
CREATE INDEX idx_compras_estado ON compras(estado);
CREATE INDEX idx_compras_vinculacion ON compras USING gin (vinculacion);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_estatus_pago ON ventas(estatus_pago);
CREATE INDEX idx_inventario_sku ON inventario(sku);
CREATE INDEX idx_inventario_categoria ON inventario(categoria);
CREATE INDEX idx_contactos_tipo ON contactos(tipo);

-- ==================== FUNCIÓN PARA REGISTRAR AUDITORÍA (disparada por triggers) ====================
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  user_id_val UUID;
  user_email_val TEXT;
  user_role_val TEXT;
  ip_val INET;
  user_agent_val TEXT;
BEGIN
  -- Obtener información del usuario desde la sesión (disponible en auth.uid())
  user_id_val = auth.uid();
  SELECT email, rol INTO user_email_val, user_role_val FROM profiles WHERE id = user_id_val;
  -- ip y user_agent se pueden pasar desde el frontend en un contexto de cabecera, aquí se asume null
  ip_val = NULL;
  user_agent_val = NULL;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, new_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(NEW), 'info', '{}', NEW.hash);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, old_data, new_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(OLD), to_jsonb(NEW), 'info', '{}', NEW.hash);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, old_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(OLD), 'info', '{}', OLD.hash);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asignar el trigger de auditoría a las tablas principales
CREATE TRIGGER audit_contactos AFTER INSERT OR UPDATE OR DELETE ON contactos FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_inventario AFTER INSERT OR UPDATE OR DELETE ON inventario FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_ordenes_taller AFTER INSERT OR UPDATE OR DELETE ON ordenes_taller FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_ordenes_motores AFTER INSERT OR UPDATE OR DELETE ON ordenes_motores FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_soporte_visitas AFTER INSERT OR UPDATE OR DELETE ON soporte_visitas FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_proyectos_automatizacion AFTER INSERT OR UPDATE OR DELETE ON proyectos_automatizacion FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_compras AFTER INSERT OR UPDATE OR DELETE ON compras FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_cotizaciones AFTER INSERT OR UPDATE OR DELETE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_ventas AFTER INSERT OR UPDATE OR DELETE ON ventas FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_facturas AFTER INSERT OR UPDATE OR DELETE ON facturas FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_ingresos_contabilidad AFTER INSERT OR UPDATE OR DELETE ON ingresos_contabilidad FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_empleados AFTER INSERT OR UPDATE OR DELETE ON empleados FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_pagos_nomina AFTER INSERT OR UPDATE OR DELETE ON pagos_nomina FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_movimientos_banco AFTER INSERT OR UPDATE OR DELETE ON movimientos_banco FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ==================== DATOS INICIALES ====================
-- Insertar gastos fijos (para cálculo de costos)
CREATE TABLE gastos_fijos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gastos_fijos (nombre, monto) VALUES
  ('Renta', 24360),
  ('Sueldos Base', 20000),
  ('Luz', 1500),
  ('Agua', 500),
  ('Internet', 600),
  ('Camioneta', 8500);

-- Parámetros de costos
CREATE TABLE parametros_costos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clave TEXT UNIQUE NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  descripcion TEXT
);

INSERT INTO parametros_costos (clave, valor, descripcion) VALUES
  ('gasolina', 24.50, 'Precio por litro'),
  ('rendimiento', 9.5, 'Kilómetros por litro'),
  ('costo_tecnico', 104.16, 'Costo por hora de técnico'),
  ('gastos_fijos_hora', 124.18, 'Gastos fijos por hora'),
  ('camioneta_hora', 39.35, 'Costo de operación de camioneta por hora'),
  ('utilidad', 40, 'Porcentaje de utilidad'),
  ('credito', 3, 'Porcentaje por costo de crédito'),
  ('iva', 16, 'Porcentaje de IVA');

-- Crear un usuario admin por defecto? No, mejor se hace desde la consola de auth.
-- Pero se puede insertar un perfil después de crear el usuario.

-- ==================== FUNCIÓN PARA GENERAR FOLIOS ====================
CREATE SEQUENCE folio_taller_seq START 1;
CREATE SEQUENCE folio_motor_seq START 1;
CREATE SEQUENCE folio_ventas_seq START 1;
CREATE SEQUENCE folio_compras_seq START 1;

CREATE OR REPLACE FUNCTION generar_folio_taller()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  mes TEXT;
  numero TEXT;
BEGIN
  anio = to_char(NOW(), 'YY');
  mes = to_char(NOW(), 'MM');
  numero = lpad(nextval('folio_taller_seq')::TEXT, 5, '0');
  RETURN 'T-' || anio || mes || '-' || numero;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generar_folio_motor()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  mes TEXT;
  numero TEXT;
BEGIN
  anio = to_char(NOW(), 'YY');
  mes = to_char(NOW(), 'MM');
  numero = lpad(nextval('folio_motor_seq')::TEXT, 5, '0');
  RETURN 'MTR-' || anio || mes || '-' || numero;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generar_folio_ventas()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  mes TEXT;
  numero TEXT;
BEGIN
  anio = to_char(NOW(), 'YY');
  mes = to_char(NOW(), 'MM');
  numero = lpad(nextval('folio_ventas_seq')::TEXT, 5, '0');
  RETURN 'V-' || anio || mes || '-' || numero;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generar_folio_compras()
RETURNS TEXT AS $$
DECLARE
  anio TEXT;
  mes TEXT;
  numero TEXT;
BEGIN
  anio = to_char(NOW(), 'YY');
  mes = to_char(NOW(), 'MM');
  numero = lpad(nextval('folio_compras_seq')::TEXT, 5, '0');
  RETURN 'PO-' || anio || mes || '-' || numero;
END;
$$ LANGUAGE plpgsql;