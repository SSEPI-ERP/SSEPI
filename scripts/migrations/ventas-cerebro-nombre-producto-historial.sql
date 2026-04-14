-- =====================================================
-- MIGRACIÓN: Ventas - Nombre del producto + Historial
-- DESCRIPCIÓN:
--   1. Agrega campo nombre_producto al cerebro_registro (JSONB) en cotizaciones
--   2. Crea tabla orden_historial para bitácora de eventos de órdenes/cotizaciones
--   3. Permisos RLS para roles ventas, admin, y roles operativos
-- =====================================================

-- 1. El campo nombre_producto se guarda dentro de cerebro_registro (JSONB)
--    No requiere ALTER TABLE, pero se documenta el expected schema:
--    cerebro_registro = {
--      fecha_ingreso: text,
--      falla_reportada: text,
--      prioridad: 'Baja'|'Normal'|'Alta'|'Urgente',
--      departamento: text,
--      orden_id: uuid|null,
--      folio_operativo: text|null,
--      tipo_vinculo: 'taller'|'motor'|'proyecto'|null,
--      origen_cotizacion: 'taller'|'motores'|'automatizacion'|'proyecto'|'directo',
--      nombre_producto: text  <-- NUEVO CAMPO
--    }
COMMENT ON COLUMN public.cotizaciones.cerebro_registro IS
  'Paso 1 ventas: fecha_ingreso, falla_reportada, prioridad, departamento, orden_id, folio_operativo, tipo_vinculo, origen_cotizacion, nombre_producto';

-- 2. Tabla orden_historial para bitácora de eventos
CREATE TABLE IF NOT EXISTS public.orden_historial (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  orden_taller_id UUID REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  orden_motor_id UUID REFERENCES public.ordenes_motores(id) ON DELETE CASCADE,
  proyecto_id UUID REFERENCES public.proyectos_automatizacion(id) ON DELETE CASCADE,
  evento TEXT NOT NULL, -- 'creacion', 'cambio_estado', 'costo_agregado', 'compra_vinculada', 'folio_generado', 'cotizacion_guardada', 'cotizacion_enviada', 'cotizacion_autorizada', 'cotizacion_rechazada', 'venta_cerrada'
  descripcion TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- datos extra del evento (ej. { estado_anterior, estado_nuevo, costo, usuario })
  creado_por UUID REFERENCES public.usuarios(auth_user_id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_historial_cotizacion ON public.orden_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_taller ON public.orden_historial(orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_motor ON public.orden_historial(orden_motor_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_proyecto ON public.orden_historial(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_evento ON public.orden_historial(evento);
CREATE INDEX IF NOT EXISTS idx_orden_historial_creado_en ON public.orden_historial(creado_en DESC);

COMMENT ON TABLE public.orden_historial IS 'Bitácora de eventos de órdenes y cotizaciones: creación, cambios de estado, costos, compras vinculadas, etc.';

-- 3. Permisos RLS para orden_historial
ALTER TABLE public.orden_historial ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
CREATE POLICY orden_historial_admin_all ON public.orden_historial
  USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- Ventas ve todo (lectura) y puede insertar eventos de cotizaciones
CREATE POLICY orden_historial_ventas_read ON public.orden_historial
  FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'ventas_sin_compras'));

CREATE POLICY orden_historial_ventas_insert ON public.orden_historial
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'rol' IN ('ventas', 'ventas_sin_compras')
    AND NEW.creado_por = (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email')
  );

-- Roles operativos (taller, motores, automatizacion) ven historial de sus órdenes
CREATE POLICY orden_historial_taller_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' = 'taller'
    AND (
      NEW.orden_taller_id IN (SELECT id FROM public.ordenes_taller)
      OR NEW.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE origen = 'taller')
    )
  );

CREATE POLICY orden_historial_motores_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' = 'taller' -- el rol taller ve tanto electrónica como motores
    AND (
      NEW.orden_motor_id IN (SELECT id FROM public.ordenes_motores)
      OR NEW.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE origen = 'motores')
    )
  );

CREATE POLICY orden_historial_automatizacion_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' IN ('automatizacion')
    AND (
      NEW.proyecto_id IN (SELECT id FROM public.proyectos_automatizacion)
      OR NEW.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE origen IN ('automatizacion', 'proyecto'))
    )
  );

-- 4. Función helper para registrar eventos (opcional, para usar desde triggers o RPC)
CREATE OR REPLACE FUNCTION public.registrar_evento_orden(
  p_cotizacion_id UUID DEFAULT NULL,
  p_orden_taller_id UUID DEFAULT NULL,
  p_orden_motor_id UUID DEFAULT NULL,
  p_proyecto_id UUID DEFAULT NULL,
  p_evento TEXT,
  p_descripcion TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_usuario_id UUID;
  v_nuevo_id UUID;
BEGIN
  -- Obtener auth_user_id del usuario actual
  SELECT auth_user_id INTO v_usuario_id
  FROM public.usuarios
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1;

  INSERT INTO public.orden_historial (
    cotizacion_id, orden_taller_id, orden_motor_id, proyecto_id,
    evento, descripcion, metadata, creado_por
  ) VALUES (
    p_cotizacion_id, p_orden_taller_id, p_orden_motor_id, p_proyecto_id,
    p_evento, p_descripcion, p_metadata, v_usuario_id
  ) RETURNING id INTO v_nuevo_id;

  RETURN v_nuevo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger automático: registrar evento al crear cotización
CREATE OR REPLACE FUNCTION public.trg_cotizacion_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    cotizacion_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'cotizacion_guardada',
    'Cotización creada desde Ventas (cerebro)',
    NEW.cerebro_registro || jsonb_build_object('folio', NEW.folio, 'total', NEW.total),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cotizacion_al_crear ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_al_crear
  AFTER INSERT ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_cotizacion_al_crear();

-- 6. Trigger automático: registrar evento al crear orden de taller
CREATE OR REPLACE FUNCTION public.trg_taller_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_taller_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de taller creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'falla', NEW.falla_reportada, 'estado', NEW.estado),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_taller_al_crear ON public.ordenes_taller;
CREATE TRIGGER trg_taller_al_crear
  AFTER INSERT ON public.ordenes_taller
  FOR EACH ROW EXECUTE FUNCTION public.trg_taller_al_crear();

-- 7. Trigger automático: registrar evento al crear orden de motores
CREATE OR REPLACE FUNCTION public.trg_motores_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_motor_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de motores creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'falla', NEW.falla_reportada, 'estado', NEW.estado),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_motores_al_crear ON public.ordenes_motores;
CREATE TRIGGER trg_motores_al_crear
  AFTER INSERT ON public.ordenes_motores
  FOR EACH ROW EXECUTE FUNCTION public.trg_motores_al_crear();

-- 8. Trigger automático: registrar evento al crear proyecto/automatizacion
CREATE OR REPLACE FUNCTION public.trg_proyectos_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    proyecto_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Proyecto creado: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente, 'estado', NEW.estado, 'vendedor', NEW.vendedor),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proyectos_al_crear ON public.proyectos_automatizacion;
CREATE TRIGGER trg_proyectos_al_crear
  AFTER INSERT ON public.proyectos_automatizacion
  FOR EACH ROW EXECUTE FUNCTION public.trg_proyectos_al_crear();
