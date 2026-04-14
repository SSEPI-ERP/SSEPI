-- =====================================================
-- MIGRACIÿÿN: Tabla orden_historial para Ventas
-- DESCRIPCIÿÿN: Crea tabla de bit?cora de eventos de ?rdenes/cotizaciones
--              si no existe ya en la base de datos
-- =====================================================

-- 1. Tabla orden_historial para bit?cora de eventos
-- Nota: esta migraci?n debe correr aun si algunos m?dulos/tablas no existen.
--       Por eso evitamos FKs directos a tablas opcionales (ej. ordenes_motores).

CREATE TABLE IF NOT EXISTS public.orden_historial (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  orden_taller_id UUID REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  -- orden_motor_id es opcional; si el proyecto no tiene m?dulo motores en public a?n,
  -- la FK romper?a la migraci?n. Se agrega FK condicional m?s abajo si existe la tabla.
  orden_motor_id UUID,
  -- proyecto_id es opcional; puede no existir el m?dulo proyectos_automatizacion en public.
  -- Se agrega FK condicional m?s abajo si existe la tabla.
  proyecto_id UUID,
  evento TEXT NOT NULL,
  descripcion TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  creado_por UUID,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_historial_cotizacion ON public.orden_historial(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_taller ON public.orden_historial(orden_taller_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_motor ON public.orden_historial(orden_motor_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_proyecto ON public.orden_historial(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_orden_historial_evento ON public.orden_historial(evento);
CREATE INDEX IF NOT EXISTS idx_orden_historial_creado_en ON public.orden_historial(creado_en DESC);

COMMENT ON TABLE public.orden_historial IS 'Bit?cora de eventos de ?rdenes y cotizaciones: creaci?n, cambios de estado, costos, compras vinculadas, etc.';

-- FK condicional a ordenes_motores (si existe en public)
DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NOT NULL THEN
    -- Crear FK solo si no existe ya
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'orden_historial_orden_motor_id_fkey'
        AND conrelid = 'public.orden_historial'::regclass
    ) THEN
      ALTER TABLE public.orden_historial
        ADD CONSTRAINT orden_historial_orden_motor_id_fkey
        FOREIGN KEY (orden_motor_id)
        REFERENCES public.ordenes_motores(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- FK condicional a proyectos_automatizacion (si existe en public)
DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'orden_historial_proyecto_id_fkey'
        AND conrelid = 'public.orden_historial'::regclass
    ) THEN
      ALTER TABLE public.orden_historial
        ADD CONSTRAINT orden_historial_proyecto_id_fkey
        FOREIGN KEY (proyecto_id)
        REFERENCES public.proyectos_automatizacion(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2. Permisos RLS
ALTER TABLE public.orden_historial ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
DROP POLICY IF EXISTS orden_historial_admin_all ON public.orden_historial;
CREATE POLICY orden_historial_admin_all ON public.orden_historial
  USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- Ventas ve todo (lectura) y puede insertar eventos de cotizaciones
DROP POLICY IF EXISTS orden_historial_ventas_read ON public.orden_historial;
CREATE POLICY orden_historial_ventas_read ON public.orden_historial
  FOR SELECT USING (auth.jwt() ->> 'rol' IN ('ventas', 'ventas_sin_compras'));

DROP POLICY IF EXISTS orden_historial_ventas_insert ON public.orden_historial;
CREATE POLICY orden_historial_ventas_insert ON public.orden_historial
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'rol' IN ('ventas', 'ventas_sin_compras')
  );

-- Roles operativos (taller, motores, automatizacion) ven historial de sus ?rdenes
DROP POLICY IF EXISTS orden_historial_taller_read ON public.orden_historial;
CREATE POLICY orden_historial_taller_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' = 'taller'
    AND (
      orden_taller_id IN (SELECT id FROM public.ordenes_taller)
      -- Compat: no asumir columna public.cotizaciones.origen (puede no existir en prod)
      OR cotizacion_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS orden_historial_motores_read ON public.orden_historial;
CREATE POLICY orden_historial_motores_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' IN ('taller', 'motores')
    AND (
      (to_regclass('public.ordenes_motores') IS NOT NULL AND orden_motor_id IN (SELECT id FROM public.ordenes_motores))
      OR cotizacion_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS orden_historial_automatizacion_read ON public.orden_historial;
CREATE POLICY orden_historial_automatizacion_read ON public.orden_historial
  FOR SELECT USING (
    auth.jwt() ->> 'rol' IN ('automatizacion')
    AND (
      (to_regclass('public.proyectos_automatizacion') IS NOT NULL AND proyecto_id IN (SELECT id FROM public.proyectos_automatizacion))
      OR cotizacion_id IS NOT NULL
    )
  );

-- 3. Funci?n helper para registrar eventos
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

-- 4. Trigger: registrar evento al crear cotizaci?n
CREATE OR REPLACE FUNCTION public.trg_cotizacion_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    cotizacion_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'cotizacion_guardada',
    'Cotizaci?n creada desde Ventas (cerebro)',
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

-- 5. Trigger: registrar evento al crear orden de taller
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

-- 6. Trigger: registrar evento al crear orden de motores
CREATE OR REPLACE FUNCTION public.trg_motores_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_motor_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de motores creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'equipo', NEW.equipo, 'estado', NEW.estado),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_motores_al_crear ON public.ordenes_motores;
    CREATE TRIGGER trg_motores_al_crear
      AFTER INSERT ON public.ordenes_motores
      FOR EACH ROW EXECUTE FUNCTION public.trg_motores_al_crear();
  END IF;
END $$;

-- 7. Trigger: registrar evento al crear proyecto de automatizaci?n
CREATE OR REPLACE FUNCTION public.trg_proyectos_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    proyecto_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Proyecto creado: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente, 'servicio', NEW.servicio, 'estado', NEW.estado),
    (SELECT auth_user_id FROM public.usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_proyectos_al_crear ON public.proyectos_automatizacion;
    CREATE TRIGGER trg_proyectos_al_crear
      AFTER INSERT ON public.proyectos_automatizacion
      FOR EACH ROW EXECUTE FUNCTION public.trg_proyectos_al_crear();
  END IF;
END $$;
