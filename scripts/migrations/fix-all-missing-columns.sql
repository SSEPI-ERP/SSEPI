-- ================================================
-- SSEPI — Agregar TODAS las columnas faltantes
-- Ejecutar en Supabase SQL Editor (idempotente)
-- ================================================

-- cotizaciones
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS cerebro_registro JSONB DEFAULT '{}';
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS orden_origen_id UUID;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS vendedor TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS rfc TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ;

-- ordenes_taller
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS equipo TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS modelo TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS serie TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS falla_reportada TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS condiciones_fisicas TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS encargado_recepcion TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS bajo_garantia BOOLEAN DEFAULT false;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS tecnico_responsable TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS notas_internas TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS notas_generales TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS horas_estimadas NUMERIC DEFAULT 0;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_entrega DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS recibe_nombre TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS recibe_identificacion TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS factura_numero TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS entrega_obs TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS recibido_por TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS foto_ingreso TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS refacciones_enlaces JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS refacciones_inventario JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS consumibles_usados JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS componentes_inventario JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS componentes_compra JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_inicio DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fechas_etapas JSONB DEFAULT '{}';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS historial JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS foto_entrega TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS sin_reparacion BOOLEAN DEFAULT false;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_sin_reparacion DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_envio_compra DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS compra_vinculada UUID;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS compra_folio TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_reparacion DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS factura_id UUID;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS folio_factura TEXT;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_factura DATE;
ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS referencia TEXT;

-- ordenes_motores (mismo esquema que taller + columnas de motor)
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS motor TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS modelo TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS serie TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS hp TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS rpm TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS voltaje TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS falla_reportada TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS condiciones_fisicas TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS encargado_recepcion TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS bajo_garantia BOOLEAN DEFAULT false;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS tecnico_responsable TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS megger TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS rU TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS rV TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS rW TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS notas_internas TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS notas_generales TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS horas_estimadas NUMERIC DEFAULT 0;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fecha_entrega DATE;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS recibe_nombre TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS recibe_identificacion TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS factura_numero TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS entrega_obs TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS recibido_por TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS foto_ingreso TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS refacciones_enlaces JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS refacciones_inventario JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS consumibles_usados JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS componentes_inventario JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS componentes_compra JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fecha_inicio DATE;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fechas_etapas JSONB DEFAULT '{}';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS historial JSONB DEFAULT '[]';
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS foto_entrega TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS sin_reparacion BOOLEAN DEFAULT false;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fecha_sin_reparacion DATE;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fecha_envio_compra DATE;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS compra_vinculada UUID;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS compra_folio TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS factura_id UUID;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS folio_factura TEXT;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS fecha_factura DATE;
ALTER TABLE public.ordenes_motores ADD COLUMN IF NOT EXISTS referencia TEXT;

-- ventas
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS uuid_factura TEXT;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS folio_factura TEXT;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS fecha_factura DATE;
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS estatus_pago TEXT DEFAULT 'pendiente';

-- compras
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS folio TEXT;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS proveedor TEXT;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_requerida DATE;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'normal';
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS vinculacion JSONB DEFAULT '{}';
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS estado INTEGER DEFAULT 0;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS pasos JSONB DEFAULT '[]';
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS confirmado_ventas BOOLEAN DEFAULT false;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ;

-- contactos
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS empresa TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS puesto TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS sitio_web TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cliente';
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS etiquetas JSONB DEFAULT '[]';
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- inventario
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS ubicacion TEXT;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS minimo NUMERIC DEFAULT 0;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS costo NUMERIC DEFAULT 0;
ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS precio_venta NUMERIC DEFAULT 0;

-- audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB DEFAULT '{}';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB DEFAULT '{}';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();