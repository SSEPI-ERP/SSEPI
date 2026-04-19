-- ============================================================
-- SSEPI COI: Tablas de pólizas, movimientos y mapeo de cuentas
-- Fuente de verdad en Postgres, sync bidireccional con SQLite local
-- ============================================================

-- ==================== TABLA coi_polizas ====================
CREATE TABLE IF NOT EXISTS public.coi_polizas (
  id BIGSERIAL PRIMARY KEY,
  numero_poliza INTEGER,
  tipo_poliza TEXT NOT NULL CHECK (tipo_poliza IN ('INGRESO', 'EGRESO', 'DIARIO', 'CHEQUE')),
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  moneda TEXT DEFAULT 'MXN',
  tipo_cambio NUMERIC DEFAULT 1.0,
  estatus TEXT DEFAULT 'C' CHECK (estatus IN ('C', 'V', 'A')),
  erp_source TEXT NOT NULL CHECK (erp_source IN ('venta', 'compra', 'factura', 'nomina', 'bancos', 'manual')),
  erp_id TEXT NOT NULL,
  usuario_afectacion TEXT,
  ts_afectacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_local BOOLEAN DEFAULT FALSE,
  UNIQUE(erp_source, erp_id)
);

-- ==================== TABLA coi_movimientos ====================
CREATE TABLE IF NOT EXISTS public.coi_movimientos (
  id BIGSERIAL PRIMARY KEY,
  poliza_id INTEGER NOT NULL REFERENCES public.coi_polizas(id) ON DELETE CASCADE,
  num_cuenta TEXT NOT NULL,
  concepto_mov TEXT,
  cargo NUMERIC DEFAULT 0,
  abono NUMERIC DEFAULT 0,
  cliente_rfc TEXT,
  cliente_nombre TEXT,
  centro_costo_id INTEGER,
  numero_linea INTEGER
);

-- ==================== TABLA coi_account_mapping ====================
-- Reemplaza ssepi_erp_mapping.json, configurable por instituto
CREATE TABLE IF NOT EXISTS public.coi_account_mapping (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  label TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: valores por defecto desde ssepi_erp_mapping.json
INSERT INTO public.coi_account_mapping (key, value, label) VALUES
  ('tipo_poliza_venta', 'INGRESO', 'Tipo de póliza para ventas'),
  ('tipo_poliza_compra', 'EGRESO', 'Tipo de póliza para compras'),
  ('tipo_poliza_factura', 'INGRESO', 'Tipo de póliza para facturas'),
  ('tipo_poliza_nomina', 'EGRESO', 'Tipo de póliza para nóminas'),
  ('tipo_poliza_bancos', 'DIARIO', 'Tipo de póliza para movimientos bancarios'),
  ('cuenta_caja_mn', '101.01', 'Caja MN'),
  ('cuenta_banco_mn', '102.01', 'Banco MN'),
  ('cuenta_ingresos_ventas', '401.01', 'Ingresos por ventas'),
  ('cuenta_ingresos_servicios', '401.01', 'Ingresos por servicios'),
  ('cuenta_iva_trasladado_por_pagar', '208.01', 'IVA trasladado por pagar'),
  ('cuenta_compras_gasto', '501.01', 'Compras/Gasto'),
  ('cuenta_iva_acreditable', '118.01', 'IVA acreditable'),
  ('cuenta_proveedores_por_pagar', '201.01', 'Proveedores por pagar'),
  ('cuenta_nomina_gasto', '601.01', 'Nómina - Gasto'),
  ('cuenta_isr_por_pagar', '213.01', 'ISR por pagar'),
  ('cuenta_otras_deducciones', '209.99', 'Otras deducciones'),
  ('cuenta_contrapartida_ingreso_bancos', '401.01', 'Contrapartida ingreso bancario'),
  ('cuenta_contrapartida_egreso_bancos', '601.01', 'Contrapartida egreso bancario'),
  ('iva_default_rate', '0.16', 'Tasa de IVA por defecto')
ON CONFLICT (key) DO NOTHING;

-- ==================== ÍNDICES ====================
CREATE INDEX IF NOT EXISTS idx_coi_polizas_source ON public.coi_polizas(erp_source);
CREATE INDEX IF NOT EXISTS idx_coi_polizas_fecha ON public.coi_polizas(fecha);
CREATE INDEX IF NOT EXISTS idx_coi_polizas_synced ON public.coi_polizas(synced_local) WHERE synced_local = FALSE;
CREATE INDEX IF NOT EXISTS idx_coi_movimientos_poliza ON public.coi_movimientos(poliza_id);

-- ==================== ROW LEVEL SECURITY ====================
ALTER TABLE public.coi_polizas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_account_mapping ENABLE ROW LEVEL SECURITY;

-- Solo admin, superadmin y contabilidad pueden ver pólizas
CREATE POLICY coi_polizas_read ON public.coi_polizas FOR SELECT
  USING (COALESCE(current_user, '') LIKE 'postgres' OR auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'contabilidad'));

CREATE POLICY coi_polizas_write ON public.coi_polizas FOR ALL
  USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

CREATE POLICY coi_movimientos_read ON public.coi_movimientos FOR SELECT
  USING (COALESCE(current_user, '') LIKE 'postgres' OR auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'contabilidad'));

CREATE POLICY coi_movimientos_write ON public.coi_movimientos FOR ALL
  USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- Mapeo de cuentas: lectura para todos los autenticados, escritura solo admin
CREATE POLICY coi_mapping_read ON public.coi_account_mapping FOR SELECT
  USING (auth.role() = 'authenticated' OR COALESCE(current_user, '') LIKE 'postgres' OR auth.jwt() ->> 'rol' IN ('admin', 'superadmin', 'contabilidad'));

CREATE POLICY coi_mapping_write ON public.coi_account_mapping FOR ALL
  USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- Service role tiene acceso total
-- (Las policies con COALESCE(current_user, '') LIKE 'postgres' permiten acceso desde service_role)

-- ==================== REALTIME ====================
-- Habilitar publicaciones Realtime para las tablas de COI
ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_polizas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_movimientos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_queue;

-- ==================== TRIGGER: updated_at ====================
CREATE OR REPLACE FUNCTION public.update_coi_polizas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coi_polizas_updated_at
  BEFORE UPDATE ON public.coi_polizas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_coi_polizas_updated_at();