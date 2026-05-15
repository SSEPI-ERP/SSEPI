-- ================================================n-- SSEPI — Migración: Rentabilidad y Adeudos por Clienten-- Fecha: 2026-05-08n-- Descripción: Tabla de adeudos, columnas de rentabilidad en órdenes, y recuperación en cotizaciones.n-- Ejecutar en Supabase SQL Editor (idempotente)n-- ================================================nn-- ── 1. Tabla de adeudos por cliente ──nCREATE TABLE IF NOT EXISTS public.clientes_adeudos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.contactos(id) ON DELETE CASCADE,
    orden_origen_id UUID,
    orden_tipo TEXT,
    folio_orden TEXT,
    monto_adeudo NUMERIC(12,2) DEFAULT 0,
    monto_recuperado NUMERIC(12,2) DEFAULT 0,
    recuperado BOOLEAN DEFAULT false,
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_adeudos_cliente ON public.clientes_adeudos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_adeudos_recuperado ON public.clientes_adeudos(recuperado);
CREATE INDEX IF NOT EXISTS idx_clientes_adeudos_orden ON public.clientes_adeudos(orden_origen_id);

-- ── 2. Campos de rentabilidad en órdenes de taller ──
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS rentabilidad_estado TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS costo_presupuestado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS costo_real NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS adeudo_generado NUMERIC(12,2) DEFAULT 0;

-- ── 3. Campos de rentabilidad en órdenes de motores ──
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS rentabilidad_estado TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS costo_presupuestado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS costo_real NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS adeudo_generado NUMERIC(12,2) DEFAULT 0;

-- ── 4. Campos de rentabilidad en proyectos de automatización ──
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS rentabilidad_estado TEXT;
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS costo_presupuestado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS costo_real NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.proyectos_automatizacion ADD COLUMN IF NOT EXISTS adeudo_generado NUMERIC(12,2) DEFAULT 0;

-- ── 5. Campos de recuperación en cotizaciones ──
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS adeudo_recuperado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS notas_adeudo TEXT;

-- ── 6. Adeudo acumulado en contactos (maestro de clientes) ──
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS adeudo_acumulado NUMERIC(12,2) DEFAULT 0;

-- ── 7. Función helper para actualizar adeudo acumulado de cliente ──
CREATE OR REPLACE FUNCTION public.actualizar_adeudo_cliente(p_cliente_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.contactos
    SET adeudo_acumulado = COALESCE((
        SELECT SUM(monto_adeudo - monto_recuperado)
        FROM public.clientes_adeudos
        WHERE cliente_id = p_cliente_id AND recuperado = false
    ), 0)
    WHERE id = p_cliente_id;
END;
$$;
