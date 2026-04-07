-- Tabla de nómina (si no existe en Supabase). Idempotente.
-- Ejecutar en: Supabase → SQL Editor.

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
CREATE POLICY pagos_nomina_admin_all
  ON public.pagos_nomina FOR ALL
  USING (auth.jwt() ->> 'rol' = 'admin')
  WITH CHECK (auth.jwt() ->> 'rol' = 'admin');

DROP POLICY IF EXISTS pagos_nomina_contabilidad_all ON public.pagos_nomina;
CREATE POLICY pagos_nomina_contabilidad_all
  ON public.pagos_nomina FOR ALL
  USING (auth.jwt() ->> 'rol' = 'contabilidad')
  WITH CHECK (auth.jwt() ->> 'rol' = 'contabilidad');
