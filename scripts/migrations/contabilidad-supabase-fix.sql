-- Fix Contabilidad ERP: compras.fecha_creacion, movimientos_banco, RLS pagos_nomina
-- Ejecutar en Supabase → SQL Editor (una sola vez). Idempotente en lo posible.

-- ==================== 1) COMPRAS: columna fecha_creacion ====================
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'compras' AND column_name = 'created_at'
  ) THEN
    UPDATE public.compras c
    SET fecha_creacion = COALESCE(c.fecha_creacion, c.created_at)
    WHERE c.fecha_creacion IS NULL OR c.fecha_creacion < c.created_at - interval '1 second';
  END IF;
END $$;

UPDATE public.compras SET fecha_creacion = COALESCE(fecha_creacion, NOW()) WHERE fecha_creacion IS NULL;

-- ==================== 2) MOVIMIENTOS_BANCO (cobranza / tesorería) ====================
CREATE TABLE IF NOT EXISTS public.movimientos_banco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto NUMERIC(12,2) NOT NULL,
  fecha DATE NOT NULL,
  metodo TEXT,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  creado_por UUID,
  hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_movimientos_banco_fecha ON public.movimientos_banco (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_banco_tipo ON public.movimientos_banco (tipo);

ALTER TABLE public.movimientos_banco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movimientos_banco_select_auth ON public.movimientos_banco;
CREATE POLICY movimientos_banco_select_auth
  ON public.movimientos_banco FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS movimientos_banco_insert_auth ON public.movimientos_banco;
CREATE POLICY movimientos_banco_insert_auth
  ON public.movimientos_banco FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS movimientos_banco_update_auth ON public.movimientos_banco;
CREATE POLICY movimientos_banco_update_auth
  ON public.movimientos_banco FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS movimientos_banco_delete_auth ON public.movimientos_banco;
CREATE POLICY movimientos_banco_delete_auth
  ON public.movimientos_banco FOR DELETE TO authenticated
  USING (true);

-- ==================== 3) Rol real desde tablas (JWT no trae "rol" por defecto) ====================
-- plpgsql: evita error 42P01 si public.profiles no existe en el proyecto.
CREATE OR REPLACE FUNCTION public.ssepi_current_rol()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
BEGIN
  SELECT u.rol INTO r FROM public.usuarios u WHERE u.auth_user_id = auth.uid() LIMIT 1;
  IF r IS NOT NULL AND btrim(r) <> '' THEN RETURN r; END IF;

  SELECT u.rol INTO r FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1;
  IF r IS NOT NULL AND btrim(r) <> '' THEN RETURN r; END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'SELECT p.rol FROM public.profiles p WHERE p.id = $1 LIMIT 1' INTO r USING auth.uid();
    IF r IS NOT NULL AND btrim(r) <> '' THEN RETURN r; END IF;
  END IF;

  RETURN COALESCE(r, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.ssepi_puede_contabilidad_nomina()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad');
$$;

-- ==================== 4) PAGOS_NOMINA (crear si falta) + RLS ====================
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

CREATE INDEX IF NOT EXISTS idx_pagos_nomina_fecha_pago ON public.pagos_nomina (fecha_pago DESC);

ALTER TABLE public.pagos_nomina ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagos_nomina_admin_all ON public.pagos_nomina;
DROP POLICY IF EXISTS pagos_nomina_contabilidad_all ON public.pagos_nomina;
DROP POLICY IF EXISTS pagos_nomina_select_auth ON public.pagos_nomina;
DROP POLICY IF EXISTS pagos_nomina_mutate_contab ON public.pagos_nomina;

CREATE POLICY pagos_nomina_select_auth
  ON public.pagos_nomina FOR SELECT TO authenticated
  USING (true);

CREATE POLICY pagos_nomina_mutate_contab
  ON public.pagos_nomina FOR INSERT TO authenticated
  WITH CHECK (public.ssepi_puede_contabilidad_nomina());

CREATE POLICY pagos_nomina_update_contab
  ON public.pagos_nomina FOR UPDATE TO authenticated
  USING (public.ssepi_puede_contabilidad_nomina())
  WITH CHECK (public.ssepi_puede_contabilidad_nomina());

CREATE POLICY pagos_nomina_delete_contab
  ON public.pagos_nomina FOR DELETE TO authenticated
  USING (public.ssepi_puede_contabilidad_nomina());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_banco TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_nomina TO authenticated;

-- ==================== 5) FACTURAS (emitidas) ====================
-- Nota: El frontend (Facturación/Contabilidad) usa la tabla public.facturas.
CREATE TABLE IF NOT EXISTS public.facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_factura TEXT,
  cliente TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estatus TEXT DEFAULT 'emitida',
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  departamento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_facturas_fecha_emision ON public.facturas (fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_estatus ON public.facturas (estatus);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facturas_select_auth ON public.facturas;
CREATE POLICY facturas_select_auth
  ON public.facturas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS facturas_insert_auth ON public.facturas;
CREATE POLICY facturas_insert_auth
  ON public.facturas FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS facturas_update_auth ON public.facturas;
CREATE POLICY facturas_update_auth
  ON public.facturas FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS facturas_delete_auth ON public.facturas;
CREATE POLICY facturas_delete_auth
  ON public.facturas FOR DELETE TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas TO authenticated;
