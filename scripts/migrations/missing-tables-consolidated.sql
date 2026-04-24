-- ================================================
-- SSEPI — Tablas faltantes (archivo legacy - usar crear-tablas-costos.sql)
-- ================================================

-- 1) notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  para TEXT NOT NULL,
  tipo TEXT NOT NULL,
  orden_id UUID,
  compra_id UUID,
  cotizacion_id UUID,
  factura_id UUID,
  folio TEXT,
  cliente TEXT,
  mensaje TEXT NOT NULL,
  leido BOOLEAN DEFAULT false,
  fecha TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificaciones_select ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_insert ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_update ON public.notificaciones;
CREATE POLICY notificaciones_select ON public.notificaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY notificaciones_insert ON public.notificaciones FOR INSERT WITH CHECK (true);
CREATE POLICY notificaciones_update ON public.notificaciones FOR UPDATE USING (true);
GRANT SELECT, INSERT, UPDATE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;

-- 2) users_ver_costos
CREATE TABLE IF NOT EXISTS public.users_ver_costos (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ver_costos BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users_ver_costos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_ver_costos_select_own ON public.users_ver_costos;
DROP POLICY IF EXISTS users_ver_costos_all_admin ON public.users_ver_costos;
CREATE POLICY users_ver_costos_select_own ON public.users_ver_costos
  FOR SELECT TO authenticated USING (
    auth.uid() = auth_user_id
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );
CREATE POLICY users_ver_costos_all_admin ON public.users_ver_costos
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );
GRANT SELECT ON public.users_ver_costos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.users_ver_costos TO authenticated;

INSERT INTO public.users_ver_costos (auth_user_id, ver_costos)
SELECT u.auth_user_id, CASE WHEN u.rol IN ('admin', 'superadmin', 'administracion', 'contabilidad') THEN true ELSE false END
FROM public.usuarios u
WHERE NOT EXISTS (SELECT 1 FROM public.users_ver_costos uv WHERE uv.auth_user_id = u.auth_user_id);

-- 3) ssepi_folio_operativo + ssepi_folio_evento
CREATE TABLE IF NOT EXISTS public.ssepi_folio_operativo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID,
  cotizacion_id UUID,
  ramo TEXT CHECK (ramo IS NULL OR ramo IN ('taller_motores', 'proyectos')),
  etapa TEXT NOT NULL DEFAULT 'cotizacion' CHECK (etapa IN (
    'cotizacion', 'pedido_pendiente', 'abastecimiento', 'ejecucion',
    'listo_entrega', 'facturado_timbrado', 'finalizado'
  )),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultima_evaluacion_cotizacion JSONB NOT NULL DEFAULT '{}'::jsonb,
  cliente_confirmado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ssepi_folio_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL,
  etapa_anterior TEXT,
  etapa_nueva TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_ssepi_folio_operativo_etapa ON public.ssepi_folio_operativo(etapa);
CREATE INDEX IF NOT EXISTS idx_ssepi_folio_evento_venta ON public.ssepi_folio_evento(venta_id, created_at DESC);

ALTER TABLE public.ssepi_folio_operativo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssepi_folio_evento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ssepi_folio_operativo_all ON public.ssepi_folio_operativo;
DROP POLICY IF EXISTS ssepi_folio_evento_select ON public.ssepi_folio_evento;
DROP POLICY IF EXISTS ssepi_folio_evento_insert ON public.ssepi_folio_evento;
CREATE POLICY ssepi_folio_operativo_all ON public.ssepi_folio_operativo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ssepi_folio_evento_select ON public.ssepi_folio_evento FOR SELECT TO authenticated USING (true);
CREATE POLICY ssepi_folio_evento_insert ON public.ssepi_folio_evento FOR INSERT WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssepi_folio_operativo TO authenticated;
GRANT SELECT, INSERT ON public.ssepi_folio_evento TO authenticated;
GRANT ALL ON public.ssepi_folio_operativo TO service_role;
GRANT ALL ON public.ssepi_folio_evento TO service_role;

-- 4) facturas
CREATE TABLE IF NOT EXISTS public.facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_factura TEXT UNIQUE,
  orden_taller_id UUID,
  orden_motor_id UUID,
  venta_id UUID,
  cliente TEXT NOT NULL,
  rfc TEXT,
  fecha_emision TIMESTAMPTZ DEFAULT NOW(),
  subtotal NUMERIC(12,2),
  iva NUMERIC(12,2),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  uuid_cfdi TEXT UNIQUE,
  estatus TEXT DEFAULT 'activa',
  pdf_url TEXT,
  xml_url TEXT,
  departamento TEXT,
  hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturas_select ON public.facturas;
DROP POLICY IF EXISTS facturas_insert ON public.facturas;
DROP POLICY IF EXISTS facturas_update ON public.facturas;
CREATE POLICY facturas_select ON public.facturas FOR SELECT TO authenticated USING (true);
CREATE POLICY facturas_insert ON public.facturas FOR INSERT WITH CHECK (true);
CREATE POLICY facturas_update ON public.facturas FOR UPDATE USING (true);
GRANT SELECT, INSERT, UPDATE ON public.facturas TO authenticated;
GRANT ALL ON public.facturas TO service_role;

-- 5) ingresos_contabilidad
CREATE TABLE IF NOT EXISTS public.ingresos_contabilidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL,
  monto_total NUMERIC(12,2) NOT NULL,
  iva NUMERIC(12,2),
  subtotal NUMERIC(12,2),
  cliente TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  tipo_servicio TEXT,
  orden_taller_id UUID,
  orden_motor_id UUID,
  uuid_cfdi TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  hash TEXT
);

ALTER TABLE public.ingresos_contabilidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingresos_contabilidad_select ON public.ingresos_contabilidad;
DROP POLICY IF EXISTS ingresos_contabilidad_insert ON public.ingresos_contabilidad;
DROP POLICY IF EXISTS ingresos_contabilidad_update ON public.ingresos_contabilidad;
CREATE POLICY ingresos_contabilidad_select ON public.ingresos_contabilidad FOR SELECT TO authenticated USING (true);
CREATE POLICY ingresos_contabilidad_insert ON public.ingresos_contabilidad FOR INSERT WITH CHECK (true);
CREATE POLICY ingresos_contabilidad_update ON public.ingresos_contabilidad FOR UPDATE USING (true);
GRANT SELECT, INSERT, UPDATE ON public.ingresos_contabilidad TO authenticated;
GRANT ALL ON public.ingresos_contabilidad TO service_role;

-- 6) pagos_nomina
CREATE TABLE IF NOT EXISTS public.pagos_nomina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID,
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
  created_by UUID,
  hash TEXT
);

ALTER TABLE public.pagos_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_nomina_select ON public.pagos_nomina;
DROP POLICY IF EXISTS pagos_nomina_insert ON public.pagos_nomina;
DROP POLICY IF EXISTS pagos_nomina_update ON public.pagos_nomina;
CREATE POLICY pagos_nomina_select ON public.pagos_nomina FOR SELECT TO authenticated USING (true);
CREATE POLICY pagos_nomina_insert ON public.pagos_nomina FOR INSERT WITH CHECK (true);
CREATE POLICY pagos_nomina_update ON public.pagos_nomina FOR UPDATE USING (true);
GRANT SELECT, INSERT, UPDATE ON public.pagos_nomina TO authenticated;
GRANT ALL ON public.pagos_nomina TO service_role;

-- 7) calculadoras + calculadora_costos + calculadora_clientes
CREATE TABLE IF NOT EXISTS public.calculadoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT,
  funciones TEXT,
  config_json JSONB DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.calculadora_costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculadora_id UUID REFERENCES public.calculadoras(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  costo NUMERIC(18,2) NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'MXN',
  vigencia_desde DATE,
  vigencia_hasta DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.calculadora_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculadora_id UUID REFERENCES public.calculadoras(id) ON DELETE CASCADE,
  cliente_id UUID,
  cliente_nombre TEXT,
  cliente_email TEXT,
  datos_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.calculadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculadora_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculadora_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calculadoras_all ON public.calculadoras;
DROP POLICY IF EXISTS calculadora_costos_all ON public.calculadora_costos;
DROP POLICY IF EXISTS calculadora_clientes_all ON public.calculadora_clientes;
CREATE POLICY calculadoras_all ON public.calculadoras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY calculadora_costos_all ON public.calculadora_costos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY calculadora_clientes_all ON public.calculadora_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadoras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadora_costos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadora_clientes TO authenticated;

-- 8) vacaciones tables
CREATE TABLE IF NOT EXISTS public.vacaciones_dias_feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('legal', 'religioso', 'suspension_labores')),
  anio INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM fecha)::INT) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vacaciones_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  dias_asignados INT NOT NULL DEFAULT 15,
  dias_solicitados INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anio)
);

CREATE TABLE IF NOT EXISTS public.vacaciones_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  dias_solicitados INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  observaciones TEXT,
  aprobado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vacaciones_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL,
  email TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  orden INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vacaciones_dias_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_empleados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vacaciones_feriados_select ON public.vacaciones_dias_feriados;
DROP POLICY IF EXISTS vacaciones_balance_select ON public.vacaciones_balance;
DROP POLICY IF EXISTS vacaciones_balance_insert ON public.vacaciones_balance;
DROP POLICY IF EXISTS vacaciones_balance_update ON public.vacaciones_balance;
DROP POLICY IF EXISTS vacaciones_solicitudes_select ON public.vacaciones_solicitudes;
DROP POLICY IF EXISTS vacaciones_solicitudes_insert ON public.vacaciones_solicitudes;
DROP POLICY IF EXISTS vacaciones_solicitudes_update ON public.vacaciones_solicitudes;
DROP POLICY IF EXISTS vacaciones_empleados_select ON public.vacaciones_empleados;
CREATE POLICY vacaciones_feriados_select ON public.vacaciones_dias_feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY vacaciones_balance_select ON public.vacaciones_balance FOR SELECT TO authenticated USING (true);
CREATE POLICY vacaciones_balance_insert ON public.vacaciones_balance FOR INSERT WITH CHECK (true);
CREATE POLICY vacaciones_balance_update ON public.vacaciones_balance FOR UPDATE USING (true);
CREATE POLICY vacaciones_solicitudes_select ON public.vacaciones_solicitudes FOR SELECT TO authenticated USING (true);
CREATE POLICY vacaciones_solicitudes_insert ON public.vacaciones_solicitudes FOR INSERT WITH CHECK (true);
CREATE POLICY vacaciones_solicitudes_update ON public.vacaciones_solicitudes FOR UPDATE USING (true);
CREATE POLICY vacaciones_empleados_select ON public.vacaciones_empleados FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.vacaciones_dias_feriados TO authenticated;
GRANT SELECT, UPDATE ON public.vacaciones_balance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vacaciones_solicitudes TO authenticated;
GRANT SELECT ON public.vacaciones_empleados TO authenticated;

DO $$ BEGIN
  INSERT INTO public.vacaciones_dias_feriados (fecha, nombre, tipo) VALUES
    ('2025-01-01', 'Año Nuevo', 'legal'),
    ('2025-02-03', 'Día de la Constitución', 'legal'),
    ('2025-03-17', 'Natalicio de Benito Juárez', 'legal'),
    ('2025-05-01', 'Día del Trabajo', 'legal'),
    ('2025-09-16', 'Día de la Independencia', 'legal'),
    ('2025-11-17', 'Revolución Mexicana', 'legal'),
    ('2025-12-25', 'Navidad', 'legal'),
    ('2025-04-18', 'Viernes Santo', 'religioso'),
    ('2025-11-02', 'Día de Muertos', 'suspension_labores'),
    ('2025-12-12', 'Día de la Virgen de Guadalupe', 'religioso'),
    ('2026-01-01', 'Año Nuevo', 'legal'),
    ('2026-02-02', 'Día de la Constitución', 'legal'),
    ('2026-03-16', 'Natalicio de Benito Juárez', 'legal'),
    ('2026-05-01', 'Día del Trabajo', 'legal'),
    ('2026-09-16', 'Día de la Independencia', 'legal'),
    ('2026-11-16', 'Revolución Mexicana', 'legal'),
    ('2026-12-25', 'Navidad', 'legal');
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'vacaciones_dias_feriados ya tiene datos';
END $$;

DO $$ BEGIN
  INSERT INTO public.vacaciones_empleados (nombre, rol, email, color, orden) VALUES
    ('Eduardo Amezcua', 'ventas', NULL, '#3b82f6', 1),
    ('Ivan Gutierrez', 'automatizacion', NULL, '#8b5cf6', 2),
    ('Aaron Garcia', 'taller', NULL, '#22c55e', 3),
    ('Javier Cruz', 'taller', NULL, '#f59e0b', 4),
    ('Ana Moreno', 'administracion', 'anamoreno.ssepi@gmail.com', '#ec4899', 5),
    ('Arturo Moreno', 'automatizacion', NULL, '#06b6d4', 6),
    ('Misael Moreno', 'contabilidad', NULL, '#6366f1', 7),
    ('Daniel Zuniga', 'ventas', NULL, '#14b8a6', 8),
    ('Norberto Moreno', 'admin', NULL, '#ef4444', 9),
    ('Alejandro Becerra', 'motores', NULL, '#84cc16', 10);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'vacaciones_empleados ya tiene datos';
END $$;

-- 9) token_blacklist
CREATE TABLE IF NOT EXISTS public.token_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_hash ON public.token_blacklist(token_hash);

ALTER TABLE public.token_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_blacklist_select ON public.token_blacklist;
DROP POLICY IF EXISTS token_blacklist_insert ON public.token_blacklist;
CREATE POLICY token_blacklist_select ON public.token_blacklist FOR SELECT TO authenticated USING (true);
CREATE POLICY token_blacklist_insert ON public.token_blacklist FOR INSERT WITH CHECK (true);
GRANT SELECT, INSERT ON public.token_blacklist TO authenticated;
GRANT ALL ON public.token_blacklist TO service_role;

-- 10) COI tables
CREATE TABLE IF NOT EXISTS public.coi_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL DEFAULT auth.uid(),
  erp_source TEXT NOT NULL CHECK (erp_source IN ('venta', 'compra', 'nomina', 'bancos', 'factura')),
  erp_id TEXT NOT NULL,
  folio TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  idempotency_key TEXT NOT NULL,
  last_error TEXT,
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_coi_sync_queue_idempotency_key ON public.coi_sync_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_coi_sync_queue_status ON public.coi_sync_queue(status, created_at DESC);

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

CREATE TABLE IF NOT EXISTS public.coi_account_mapping (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  label TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coi_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('venta', 'compra', 'nomina', 'bancos', 'factura')),
  erp_id TEXT NOT NULL,
  folio TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  poliza_id INTEGER,
  numero_poliza INTEGER,
  monto NUMERIC(14,2),
  error_message TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coi_connection_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL,
  user_id UUID,
  app_version TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.coi_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_polizas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_account_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_connection_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coi_sync_queue_all ON public.coi_sync_queue;
DROP POLICY IF EXISTS coi_polizas_all ON public.coi_polizas;
DROP POLICY IF EXISTS coi_movimientos_all ON public.coi_movimientos;
DROP POLICY IF EXISTS coi_mapping_all ON public.coi_account_mapping;
DROP POLICY IF EXISTS coi_sync_log_select ON public.coi_sync_log;
DROP POLICY IF EXISTS coi_sync_log_insert ON public.coi_sync_log;
DROP POLICY IF EXISTS coi_connection_state_all ON public.coi_connection_state;
CREATE POLICY coi_sync_queue_all ON public.coi_sync_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY coi_polizas_all ON public.coi_polizas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY coi_movimientos_all ON public.coi_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY coi_mapping_all ON public.coi_account_mapping FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY coi_sync_log_select ON public.coi_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY coi_sync_log_insert ON public.coi_sync_log FOR INSERT WITH CHECK (true);
CREATE POLICY coi_connection_state_all ON public.coi_connection_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.coi_sync_queue TO authenticated;
GRANT ALL ON public.coi_sync_queue TO service_role;
GRANT ALL ON public.coi_polizas TO authenticated;
GRANT ALL ON public.coi_polizas TO service_role;
GRANT ALL ON public.coi_movimientos TO authenticated;
GRANT ALL ON public.coi_movimientos TO service_role;
GRANT ALL ON public.coi_account_mapping TO authenticated;
GRANT ALL ON public.coi_account_mapping TO service_role;
GRANT SELECT, INSERT ON public.coi_sync_log TO authenticated;
GRANT ALL ON public.coi_sync_log TO service_role;
GRANT ALL ON public.coi_connection_state TO authenticated;
GRANT ALL ON public.coi_connection_state TO service_role;

DO $$ BEGIN
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
    ('iva_default_rate', '0.16', 'Tasa de IVA por defecto');
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'coi_account_mapping ya tiene datos';
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_polizas;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'coi_polizas ya en supabase_realtime';
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_movimientos;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'coi_movimientos ya en supabase_realtime';
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_log;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'coi_sync_log ya en supabase_realtime';
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_queue;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'coi_sync_queue ya en supabase_realtime';
END $$;

CREATE OR REPLACE FUNCTION public._ssepi_folio_operativo_touch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' AND (OLD.etapa IS DISTINCT FROM NEW.etapa) THEN
    INSERT INTO public.ssepi_folio_evento (venta_id, etapa_anterior, etapa_nueva, meta)
    VALUES (NEW.venta_id, OLD.etapa, NEW.etapa, jsonb_build_object('source', 'ssepi_folio_operativo'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ssepi_folio_operativo_touch ON public.ssepi_folio_operativo;
CREATE TRIGGER tr_ssepi_folio_operativo_touch
  BEFORE UPDATE ON public.ssepi_folio_operativo
  FOR EACH ROW EXECUTE FUNCTION public._ssepi_folio_operativo_touch();

DO $$ BEGIN
  DROP TRIGGER IF EXISTS n8n_folio_evento_queue ON public.ssepi_folio_evento;
  CREATE TRIGGER n8n_folio_evento_queue
    AFTER INSERT ON public.ssepi_folio_evento
    FOR EACH ROW EXECUTE FUNCTION public.n8n_enqueue_event();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Tabla public.ssepi_folio_evento no existe — trigger omitido';
END $$;