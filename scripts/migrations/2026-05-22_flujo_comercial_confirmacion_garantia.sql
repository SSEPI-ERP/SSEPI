-- ============================================================
-- MIGRACIÓN: Flujo Comercial con Confirmación del Cliente + Garantía
-- FECHA: 2026-05-22
-- AUTOR: SSEPI-ERP
-- ============================================================

-- --------------------------------------------------------------
-- 1. COTIZACIONES: nuevos campos para confirmación del cliente
-- --------------------------------------------------------------
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS confirmacion_cliente TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_confirmacion_cliente TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;

-- --------------------------------------------------------------
-- 2. ÓRDENES TALLER: campos de garantía + estados nuevos
-- --------------------------------------------------------------
ALTER TABLE ordenes_taller
  ADD COLUMN IF NOT EXISTS es_garantia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_origen_id UUID;

-- Actualizar CHECK constraint de estado para incluir nuevos estados del flujo comercial
ALTER TABLE ordenes_taller DROP CONSTRAINT IF EXISTS ordenes_taller_estado_check;
ALTER TABLE ordenes_taller ADD CONSTRAINT ordenes_taller_estado_check
  CHECK (estado IN (
    'Nuevo', 'Registrado',
    'Diagnóstico',
    'En Espera', 'Esperando Cotización', 'Esperando Confirmación Cliente',
    'Confirmado', 'En reparación',
    'Reparado', 'Reparado / Listo',
    'Entregado', 'Facturado',
    'Cancelado',
    'Garantía'
  ));

-- --------------------------------------------------------------
-- 3. ÓRDENES MOTORES: campos de garantía + estados nuevos
-- --------------------------------------------------------------
ALTER TABLE ordenes_motores
  ADD COLUMN IF NOT EXISTS es_garantia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_origen_id UUID;

ALTER TABLE ordenes_motores DROP CONSTRAINT IF EXISTS ordenes_motores_estado_check;
ALTER TABLE ordenes_motores ADD CONSTRAINT ordenes_motores_estado_check
  CHECK (estado IN (
    'Nuevo', 'Registrado',
    'Diagnóstico',
    'En Espera', 'Esperando Cotización', 'Esperando Confirmación Cliente',
    'Confirmado', 'En reparación',
    'Reparado', 'Reparado / Listo',
    'Entregado', 'Facturado',
    'Cancelado',
    'Garantía'
  ));

-- --------------------------------------------------------------
-- 4. PROYECTOS AUTOMATIZACIÓN: campos de garantía + estados nuevos
-- --------------------------------------------------------------
ALTER TABLE proyectos_automatizacion
  ADD COLUMN IF NOT EXISTS es_garantia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_origen_id UUID;

ALTER TABLE proyectos_automatizacion DROP CONSTRAINT IF EXISTS proyectos_automatizacion_estado_check;
ALTER TABLE proyectos_automatizacion ADD CONSTRAINT proyectos_automatizacion_estado_check
  CHECK (estado IN (
    'pendiente', 'Registrado', 'Nuevo',
    'Diagnóstico', 'progreso', 'levantamiento',
    'Esperando Cotización', 'Esperando Confirmación Cliente',
    'Confirmado', 'En ejecución', 'ejecucion', 'desarrollo',
    'Reparado', 'Reparado / Listo', 'Completado', 'completado',
    'Entregado', 'Facturado',
    'cancelado', 'Cancelado',
    'garantia', 'Garantía'
  ));

-- --------------------------------------------------------------
-- 5. SOPORTE VISITAS: campos de garantía + número de visita + estados nuevos
-- --------------------------------------------------------------
ALTER TABLE soporte_visitas
  ADD COLUMN IF NOT EXISTS es_garantia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS garantia_origen_id UUID,
  ADD COLUMN IF NOT EXISTS numero_visita INTEGER DEFAULT 1;

ALTER TABLE soporte_visitas DROP CONSTRAINT IF EXISTS soporte_visitas_estado_check;
ALTER TABLE soporte_visitas ADD CONSTRAINT soporte_visitas_estado_check
  CHECK (estado IN (
    'confirmacion', 'Registrado', 'Nuevo',
    'Diagnóstico',
    'Esperando Cotización', 'Esperando Confirmación Cliente',
    'Confirmado', 'En reparación', 'progreso',
    'Reparado', 'Reparado / Listo', 'Completado', 'completado',
    'Entregado', 'Facturado',
    'cancelado', 'Cancelado',
    'garantia', 'Garantía'
  ));

-- --------------------------------------------------------------
-- 6. COMPRAS: estado_interno para rastrear flujo comercial
-- --------------------------------------------------------------
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS estado_interno TEXT;

-- --------------------------------------------------------------
-- 7. FACTURAS: campo estado para manejar borrador/prefactura
-- --------------------------------------------------------------
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activa';

-- --------------------------------------------------------------
-- 8. NOTIFICACIONES: índices opcionales para mejorar rendimiento
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notificaciones_para_tipo ON notificaciones(para, tipo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_orden_id ON notificaciones(orden_id);

-- --------------------------------------------------------------
-- 9. ORDEN_HISTORIAL: índice para consultas por proyecto
-- --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orden_historial_proyecto ON orden_historial(proyecto_id);

-- --------------------------------------------------------------
-- Comentarios de documentación
-- --------------------------------------------------------------
COMMENT ON COLUMN cotizaciones.confirmacion_cliente IS 'Estado de confirmación del cliente: pendiente | confirmado | cancelado';
COMMENT ON COLUMN cotizaciones.fecha_confirmacion_cliente IS 'Fecha/hora en que el cliente confirmó o canceló';
COMMENT ON COLUMN cotizaciones.motivo_cancelacion IS 'Motivo proporcionado por el cliente o ventas si cancela';
COMMENT ON COLUMN ordenes_taller.es_garantia IS 'True si esta orden fue generada desde una garantía';
COMMENT ON COLUMN ordenes_taller.garantia_origen_id IS 'ID de la orden original que generó esta orden de garantía';
COMMENT ON COLUMN ordenes_motores.es_garantia IS 'True si esta orden fue generada desde una garantía';
COMMENT ON COLUMN ordenes_motores.garantia_origen_id IS 'ID de la orden original que generó esta orden de garantía';
COMMENT ON COLUMN proyectos_automatizacion.es_garantia IS 'True si este proyecto fue generado desde una garantía';
COMMENT ON COLUMN proyectos_automatizacion.garantia_origen_id IS 'ID del proyecto original que generó este proyecto de garantía';
COMMENT ON COLUMN soporte_visitas.es_garantia IS 'True si esta visita fue generada desde una garantía';
COMMENT ON COLUMN soporte_visitas.garantia_origen_id IS 'ID de la visita original que generó esta visita de garantía';
COMMENT ON COLUMN soporte_visitas.numero_visita IS '1 para visita de diagnóstico, 2 para visita de reparación';
COMMENT ON COLUMN compras.estado_interno IS 'Estado interno del flujo comercial: esperando_diagnostico | esperando_cotizacion | cotizado_enviado_ventas | cancelado';
COMMENT ON COLUMN facturas.estado IS 'Estado de la factura: borrador | activa | cancelada';
