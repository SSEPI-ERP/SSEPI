-- Ampliar estados de ordenes_taller para importación desde Odoo / repair.order
-- Idempotente: elimina el CHECK anterior y crea uno extendido.
-- Ejecutar en Supabase → SQL Editor.

ALTER TABLE public.ordenes_taller
  DROP CONSTRAINT IF EXISTS ordenes_taller_estado_check;

ALTER TABLE public.ordenes_taller
  ADD CONSTRAINT ordenes_taller_estado_check CHECK (
    estado IN (
      'Nuevo',
      'Diagnóstico',
      'En Espera',
      'Reparado',
      'Entregado',
      'Facturado',
      'Confirmado',
      'En reparación',
      'Cancelado'
    )
  );

COMMENT ON CONSTRAINT ordenes_taller_estado_check ON public.ordenes_taller IS
  'Incluye pipeline Odoo: Confirmado, En reparación, Cancelado; más estados SSEPI originales.';
