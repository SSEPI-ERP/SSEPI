-- Líneas de lista de materiales (BOM) para importación desde CSV Odoo / SSEPI
-- Ejecutar en Supabase → SQL Editor. Idempotente.

CREATE TABLE IF NOT EXISTS public.bom_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_sku TEXT NOT NULL,
  child_sku TEXT NOT NULL,
  cantidad NUMERIC(14, 4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (parent_sku, child_sku)
);

CREATE INDEX IF NOT EXISTS idx_bom_lineas_parent ON public.bom_lineas (parent_sku);

ALTER TABLE public.bom_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bom_lineas_admin_all ON public.bom_lineas;
CREATE POLICY bom_lineas_admin_all
  ON public.bom_lineas FOR ALL TO authenticated
  USING (COALESCE((SELECT auth.jwt() ->> 'rol'), '') IN ('admin', 'superadmin'))
  WITH CHECK (COALESCE((SELECT auth.jwt() ->> 'rol'), '') IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS bom_lineas_read_authenticated ON public.bom_lineas;
CREATE POLICY bom_lineas_read_authenticated
  ON public.bom_lineas FOR SELECT TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_lineas TO authenticated;

COMMENT ON TABLE public.bom_lineas IS 'Relación padre-hijo entre SKUs (BOM); importación vía scripts/imports/import.mjs';
