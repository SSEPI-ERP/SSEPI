-- ============================================================
-- SSEPI - RESET E INSERTAR TODO (Inventario + Contactos)
-- Ejecutar en Supabase: SQL Editor → New query → Pegar → Run
--
-- 1. Borra inventario y movimientos_inventario
-- 2. Crea la tabla inventario con la estructura correcta (stock, minimo, etc.)
-- 3. Inserta todos los productos y contactos de ejemplo
-- ============================================================

-- Extensión para UUID (por si no existe)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Función para el trigger de hash (simplificada, sin dependencias)
CREATE OR REPLACE FUNCTION update_inventario_hash()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hash = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========== RESET INVENTARIO ==========
-- Eliminar tabla de movimientos (depende de inventario)
DROP TABLE IF EXISTS movimientos_inventario CASCADE;

-- Eliminar tabla inventario
DROP TABLE IF EXISTS inventario CASCADE;

-- Crear tabla inventario con estructura correcta
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
  created_by UUID,
  hash TEXT
);

CREATE TRIGGER update_inventario_hash_trigger
  BEFORE INSERT OR UPDATE ON inventario
  FOR EACH ROW
  EXECUTE FUNCTION update_inventario_hash();

ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventario_admin_all ON inventario;
CREATE POLICY inventario_admin_all ON inventario
  FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');

CREATE POLICY inventario_taller_read ON inventario FOR SELECT USING (auth.jwt() ->> 'rol' IN ('taller', 'compras', 'ventas'));
CREATE POLICY inventario_compras_update ON inventario FOR UPDATE USING (auth.jwt() ->> 'rol' = 'compras');

-- Recrear tabla movimientos_inventario
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID REFERENCES inventario(id) ON DELETE CASCADE,
  sku TEXT,
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER,
  stock_nuevo INTEGER,
  motivo TEXT,
  referencia_id UUID,
  usuario_id UUID,
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

-- ========== INSERTAR INVENTARIO ==========
INSERT INTO inventario (sku, nombre, categoria, ubicacion, stock, minimo, costo, precio_venta) VALUES
('LM339', 'Amplificador comparador', 'refaccion', 'Estante A1', 15, 5, 45.50, 85.00),
('LM358', 'Amplificador operacional dual', 'refaccion', 'Estante A1', 22, 5, 12.00, 28.00),
('CD4046BE', 'Circuito sincronizador PLL', 'refaccion', 'Estante A2', 8, 2, 120.75, 210.00),
('NE555', 'Temporizador 555', 'refaccion', 'Estante A1', 50, 10, 8.50, 22.00),
('78L05', 'Regulador lineal 5V', 'refaccion', 'Estante B1', 30, 5, 5.20, 15.00),
('TL084', 'Amplificador operacional JFET', 'refaccion', 'Estante A2', 12, 3, 35.00, 65.00),
('ULN2003', 'Driver Darlington 7 canales', 'refaccion', 'Estante B2', 18, 5, 18.00, 38.00),
('PC817', 'Optoacoplador', 'refaccion', 'Estante A1', 40, 10, 3.50, 12.00),
('2N2222', 'Transistor NPN', 'refaccion', 'Estante B1', 100, 20, 2.00, 8.00),
('1N4148', 'Diodo de señal', 'refaccion', 'Estante A1', 200, 50, 0.80, 3.50),
('REF-001', 'Resistencia kit 1/4W', 'refaccion', 'Cajón R1', 500, 100, 0.50, 2.00),
('REF-002', 'Capacitor cerámico kit', 'refaccion', 'Cajón C1', 300, 50, 0.30, 1.50),
('ALM-001', 'Motor Siemens reparado', 'almacenable', 'Rack 3', 1, 0, 12500.00, 18500.00),
('ALM-002', 'Variador de frecuencia 2.2 kW', 'almacenable', 'Rack 2', 2, 0, 8500.00, 12000.00),
('ALM-003', 'Encoder incremental 1000 PPR', 'almacenable', 'Estante E1', 5, 1, 1200.00, 1950.00),
('CONS-001', 'Soldadura 60/40 1mm', 'consumible', 'Cajón Q1', 12, 3, 85.00, 150.00),
('CONS-002', 'Flux para soldadura', 'consumible', 'Cajón Q1', 8, 2, 45.00, 85.00),
('CONS-003', 'Cinta aislante 19mm', 'consumible', 'Cajón Q2', 25, 5, 25.00, 55.00),
('CONS-004', 'Terminales hembra 2.54mm', 'consumible', 'Cajón T1', 500, 100, 0.80, 2.50),
('CONS-005', 'Cable UTP Cat5e m', 'consumible', 'Rack cables', 200, 50, 8.00, 18.00),
('SERV-001', 'Servicio de reparación electrónica', 'servicio', 'Taller', 999, 0, 350.00, 650.00),
('SERV-002', 'Diagnóstico de equipo', 'servicio', 'Taller', 999, 0, 150.00, 280.00),
('SERV-003', 'Calibración de instrumentos', 'servicio', 'Laboratorio', 999, 0, 450.00, 850.00);

-- ========== RESET CONTACTOS (opcional: borra y vuelve a insertar) ==========
-- Si no quieres tocar contactos, comenta las 3 líneas siguientes
TRUNCATE contactos CASCADE;

INSERT INTO contactos (nombre, empresa, puesto, tipo, color) VALUES
('Acme Industrial S.A.', 'Acme Industrial', 'Compras', 'client', '#0277bd'),
('Planta Norte', 'Grupo Norte', 'Gerente de Mantenimiento', 'client', '#2e7d32'),
('Automotriz del Centro', 'Automotriz del Centro', 'Ing. de Proyectos', 'client', '#6a1b9a'),
('Taller García', 'Taller García', 'Propietario', 'client', '#c62828'),
('Maquinados y Servicios', 'Maquinados y Servicios', 'Supervisor', 'client', '#ef6c00'),
('Electrónica López', 'Electrónica López', 'Técnico', 'client', '#00838f'),
('Cliente Demo', 'Empresa Demo', 'Contacto', 'client', '#00a09d'),
('Digi-Key México', 'Digi-Key', 'Ventas', 'provider', '#e65100'),
('Mouser México', 'Mouser', 'Distribución', 'provider', '#1565c0'),
('RS Components', 'RS Components', 'Ventas', 'provider', '#c62828'),
('Proveedor Local', 'Electrónica Local', 'Ventas', 'provider', '#2e7d32');

-- Resumen
SELECT 'Inventario: ' || COUNT(*) || ' productos' AS resumen FROM inventario
UNION ALL
SELECT 'Contactos: ' || COUNT(*) || ' contactos' FROM contactos;
