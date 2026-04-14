-- =============================================================================
-- orden_historial: crear tabla (si falta) + RLS con rol desde BD (ssepi_current_rol)
--
-- 1) Crea public.orden_historial si no existe (requiere public.cotizaciones y
--    public.ordenes_taller por las FKs; mismas reglas que crear-orden-historial.sql).
-- 2) Políticas: ya no dependen de auth.jwt() ->> 'rol' (claim ausente en muchos JWT).
-- 3) Triggers: creado_por = auth.uid().
--
-- Requisito: public.ssepi_current_rol() ya definida (rls-use-current-rol.sql
-- o contabilidad-supabase-fix.sql). No la redefinimos aquí.
-- Idempotente: IF NOT EXISTS + DROP POLICY + CREATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Tabla e índices (si aún no corriste crear-orden-historial.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orden_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  orden_taller_id UUID REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  orden_motor_id UUID,
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

COMMENT ON TABLE public.orden_historial IS 'Bitácora de eventos de órdenes y cotizaciones (creación, cambios, folios, etc.).';

DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
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

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
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

-- ---------------------------------------------------------------------------
-- 1) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.orden_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orden_historial_admin_all ON public.orden_historial;
CREATE POLICY orden_historial_admin_all ON public.orden_historial
  FOR ALL TO authenticated
  USING (public.ssepi_current_rol() IN ('admin', 'superadmin'))
  WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS orden_historial_ventas_read ON public.orden_historial;
CREATE POLICY orden_historial_ventas_read ON public.orden_historial
  FOR SELECT TO authenticated
  USING (public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras'));

DROP POLICY IF EXISTS orden_historial_ventas_insert ON public.orden_historial;
CREATE POLICY orden_historial_ventas_insert ON public.orden_historial
  FOR INSERT TO authenticated
  WITH CHECK (
    public.ssepi_current_rol() IN ('ventas', 'ventas_sin_compras')
    AND (creado_por IS NULL OR creado_por = auth.uid())
  );

DROP POLICY IF EXISTS orden_historial_taller_read ON public.orden_historial;
CREATE POLICY orden_historial_taller_read ON public.orden_historial
  FOR SELECT TO authenticated
  USING (
    public.ssepi_current_rol() = 'taller'
    AND (
      orden_taller_id IN (SELECT id FROM public.ordenes_taller)
      OR cotizacion_id IS NOT NULL
    )
  );

-- Políticas que referencian tablas opcionales: el parser valida subconsultas al preparar el SQL.
-- Usamos EXECUTE para que el CREATE POLICY solo se parsee cuando la tabla ya existe (runtime).
DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS orden_historial_motores_read ON public.orden_historial';
    EXECUTE $pol$
      CREATE POLICY orden_historial_motores_read ON public.orden_historial
        FOR SELECT TO authenticated
        USING (
          public.ssepi_current_rol() IN ('taller', 'motores')
          AND (
            orden_motor_id IN (SELECT id FROM public.ordenes_motores)
            OR cotizacion_id IS NOT NULL
          )
        )
    $pol$;
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS orden_historial_motores_read ON public.orden_historial';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS orden_historial_automatizacion_read ON public.orden_historial';
    EXECUTE $pol$
      CREATE POLICY orden_historial_automatizacion_read ON public.orden_historial
        FOR SELECT TO authenticated
        USING (
          public.ssepi_current_rol() IN ('automatizacion')
          AND (
            proyecto_id IN (SELECT id FROM public.proyectos_automatizacion)
            OR cotizacion_id IS NOT NULL
          )
        )
    $pol$;
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS orden_historial_automatizacion_read ON public.orden_historial';
  END IF;
END $$;

-- Triggers: creado_por = auth.uid() (evita depender de claim email en JWT)
CREATE OR REPLACE FUNCTION public.trg_cotizacion_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    cotizacion_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'cotizacion_guardada',
    'Cotización creada desde Ventas (cerebro)',
    NEW.cerebro_registro || jsonb_build_object('folio', NEW.folio, 'total', NEW.total),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_taller_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_taller_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de taller creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'falla', NEW.falla_reportada, 'estado', NEW.estado),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_motores_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    orden_motor_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Orden de motores creada: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente_nombre, 'equipo', NEW.equipo, 'estado', NEW.estado),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_proyectos_al_crear() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.orden_historial (
    proyecto_id, evento, descripcion, metadata, creado_por
  ) VALUES (
    NEW.id,
    'creacion',
    'Proyecto creado: ' || COALESCE(NEW.folio, 'S/N'),
    jsonb_build_object('cliente', NEW.cliente, 'servicio', NEW.servicio, 'estado', NEW.estado),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar triggers (por si la migración inicial no los tenía)
DO $$
BEGIN
  IF to_regclass('public.cotizaciones') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_cotizacion_al_crear ON public.cotizaciones;
    CREATE TRIGGER trg_cotizacion_al_crear
      AFTER INSERT ON public.cotizaciones
      FOR EACH ROW EXECUTE FUNCTION public.trg_cotizacion_al_crear();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_taller_al_crear ON public.ordenes_taller;
CREATE TRIGGER trg_taller_al_crear
  AFTER INSERT ON public.ordenes_taller
  FOR EACH ROW EXECUTE FUNCTION public.trg_taller_al_crear();

DO $$
BEGIN
  IF to_regclass('public.ordenes_motores') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_motores_al_crear ON public.ordenes_motores;
    CREATE TRIGGER trg_motores_al_crear
      AFTER INSERT ON public.ordenes_motores
      FOR EACH ROW EXECUTE FUNCTION public.trg_motores_al_crear();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.proyectos_automatizacion') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_proyectos_al_crear ON public.proyectos_automatizacion;
    CREATE TRIGGER trg_proyectos_al_crear
      AFTER INSERT ON public.proyectos_automatizacion
      FOR EACH ROW EXECUTE FUNCTION public.trg_proyectos_al_crear();
  END IF;
END $$;
