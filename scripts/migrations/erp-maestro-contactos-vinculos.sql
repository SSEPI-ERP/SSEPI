-- SSEPI — Maestro contactos ERP (Odoo + tabulador)
-- Ejecutar en Supabase SQL Editor (idempotente)

-- ── Vínculos en contactos ──
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS empresa_tabulador TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS tipo_ficha TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS empresa_padre_id UUID REFERENCES public.contactos(id) ON DELETE SET NULL;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS odoo_captura_id TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS match_score NUMERIC(5,2);
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS legacy_import BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contactos_empresa_tabulador ON public.contactos(empresa_tabulador);
CREATE INDEX IF NOT EXISTS idx_contactos_empresa_padre ON public.contactos(empresa_padre_id);
CREATE INDEX IF NOT EXISTS idx_contactos_tipo_ficha ON public.contactos(tipo_ficha);

COMMENT ON COLUMN public.contactos.empresa_tabulador IS 'Nombre canónico fila tabulador Excel';
COMMENT ON COLUMN public.contactos.tipo_ficha IS 'empresa | contacto_empresa | contacto_solo';
COMMENT ON COLUMN public.contactos.empresa_padre_id IS 'Vendedor/persona bajo empresa maestro';

-- ── Alias para cruce orden/OCR ↔ tabulador ──
CREATE TABLE IF NOT EXISTS public.contacto_alias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_norm TEXT NOT NULL,
  alias TEXT NOT NULL,
  empresa_tabulador TEXT,
  fuente TEXT DEFAULT 'import',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nombre_norm, alias)
);

CREATE INDEX IF NOT EXISTS idx_contacto_alias_nombre_norm ON public.contacto_alias(nombre_norm);
CREATE INDEX IF NOT EXISTS idx_contacto_alias_empresa ON public.contacto_alias(empresa_tabulador);

-- ── Módulos de costo por empresa tabulador ──
CREATE TABLE IF NOT EXISTS public.empresa_modulos_costo (
  empresa_tabulador TEXT PRIMARY KEY,
  modulos JSONB NOT NULL DEFAULT '{}'::jsonb,
  viaje_dani JSONB NOT NULL DEFAULT '{}'::jsonb,
  km NUMERIC(10,2) DEFAULT 0,
  total_referencia NUMERIC(12,2) DEFAULT 0,
  rfc TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Ampliar clientes_tabulador ──
ALTER TABLE public.clientes_tabulador ADD COLUMN IF NOT EXISTS rfc TEXT;
ALTER TABLE public.clientes_tabulador ADD COLUMN IF NOT EXISTS empresa_tabulador TEXT;
ALTER TABLE public.clientes_tabulador ADD COLUMN IF NOT EXISTS modulos_costo JSONB;

-- Compat: producción puede usar cliente_nombre vs nombre_cliente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clientes_tabulador' AND column_name = 'cliente_nombre'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clientes_tabulador' AND column_name = 'nombre_cliente'
  ) THEN
    ALTER TABLE public.clientes_tabulador RENAME COLUMN cliente_nombre TO nombre_cliente;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_tabulador_empresa
  ON public.clientes_tabulador (COALESCE(empresa_tabulador, nombre_cliente));

-- ── Laboratorio: campos import OCR ──
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS vendedor_externo TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS diagnostico TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS solucion TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS historial_actividad TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fotos_ingreso JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS reporte_imagenes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS import_erp_legacy BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.ordenes_taller.vendedor_externo IS 'Vendedor leído de reporte Odoo/OCR';
COMMENT ON COLUMN public.ordenes_taller.import_erp_legacy IS 'Orden importada del paquete simulaciones';

-- RLS básico (service role bypass; authenticated según políticas existentes)
ALTER TABLE public.contacto_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos_costo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacto_alias_admin ON public.contacto_alias;
CREATE POLICY contacto_alias_admin ON public.contacto_alias
  FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'))
  WITH CHECK (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS contacto_alias_read ON public.contacto_alias;
CREATE POLICY contacto_alias_read ON public.contacto_alias
  FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'administracion', 'contabilidad', 'taller', 'admin', 'superadmin'));

DROP POLICY IF EXISTS empresa_modulos_admin ON public.empresa_modulos_costo;
CREATE POLICY empresa_modulos_admin ON public.empresa_modulos_costo
  FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'))
  WITH CHECK (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS empresa_modulos_read ON public.empresa_modulos_costo;
CREATE POLICY empresa_modulos_read ON public.empresa_modulos_costo
  FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'administracion', 'taller', 'admin', 'superadmin'));
