-- =============================================================================
-- SSEPI — Fix desarrollo: tablas faltantes + permisos PostgREST + RLS abierto
-- Ejecutar en Supabase SQL Editor (o apply_migration). Idempotente en lo posible.
-- ADVERTENCIA: desactiva RLS en tablas base public y otorga privilegios amplios
-- a `authenticated` (y SELECT a `anon`). Solo para entornos de desarrollo/staging.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Perfiles: asegurar public.users + vista public.usuarios (compatibilidad)
-- (algunos proyectos solo tienen `usuarios` o no tienen tabla de perfiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL DEFAULT 'ventas',
  email TEXT,
  nombre TEXT
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rol TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nombre TEXT;

-- `usuarios` puede existir como TABLA en algunos despliegues.
-- Solo creamos/reemplazamos la VISTA si:
-- - no existe `public.usuarios`, o
-- - existe y realmente es una vista.
DO $$
DECLARE k text;
BEGIN
  SELECT c.relkind INTO k
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'usuarios'
  LIMIT 1;

  IF k IS NULL THEN
    EXECUTE 'CREATE VIEW public.usuarios AS SELECT * FROM public.users';
  ELSIF k = 'v' THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.usuarios AS SELECT * FROM public.users';
  ELSE
    -- k = 'r' (table) u otros: no tocar
    RAISE NOTICE 'public.usuarios ya existe como %; se conserva.', k;
  END IF;
END $$;

COMMENT ON TABLE public.users IS 'Perfiles de usuario vinculados a auth.users; vista usuarios para compatibilidad';

-- Rol efectivo desde DB (JWT no trae `rol` en Supabase por defecto)
CREATE OR REPLACE FUNCTION public.ssepi_current_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.rol FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- Tablas que el front espera y en algunos proyectos no se llegaron a crear
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  cliente_id UUID REFERENCES public.contactos(id),
  fecha DATE NOT NULL DEFAULT (CURRENT_DATE),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal NUMERIC(14,2) DEFAULT 0,
  iva NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  estatus_pago TEXT DEFAULT 'Pendiente',
  metodo_pago TEXT,
  fecha_pago DATE,
  notas TEXT,
  vendedor TEXT,
  tipo TEXT DEFAULT 'venta',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS public.ordenes_motores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  cliente_id UUID REFERENCES public.contactos(id),
  cliente_nombre TEXT,
  referencia TEXT,
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_entrega TIMESTAMPTZ,
  motor TEXT,
  marca TEXT,
  modelo TEXT,
  serie TEXT,
  hp NUMERIC(12,2),
  rpm NUMERIC(12,2),
  voltaje TEXT,
  falla_reportada TEXT,
  condiciones_fisicas TEXT,
  encargado_recepcion TEXT,
  bajo_garantia BOOLEAN DEFAULT false,
  tecnico_responsable TEXT,
  megger NUMERIC(14,4),
  ip NUMERIC(14,4),
  "rU" NUMERIC(14,4),
  "rV" NUMERIC(14,4),
  "rW" NUMERIC(14,4),
  notas_internas TEXT,
  notas_generales TEXT,
  horas_estimadas NUMERIC(12,2) DEFAULT 0,
  recibe_nombre TEXT,
  recibe_identificacion TEXT,
  factura_numero TEXT,
  entrega_obs TEXT,
  recibido_por TEXT,
  foto_entrega TEXT,
  estado TEXT DEFAULT 'Ingresado',
  subtotal NUMERIC(14,2) DEFAULT 0,
  iva NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS public.proyectos_automatizacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  nombre TEXT,
  nombre_proyecto TEXT,
  cliente TEXT,
  cliente_id UUID REFERENCES public.contactos(id),
  fecha DATE DEFAULT (CURRENT_DATE),
  fecha_inicio DATE,
  fecha_entrega DATE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  vendedor TEXT,
  notas_generales TEXT,
  notas_internas TEXT,
  actividades JSONB DEFAULT '[]'::jsonb,
  materiales JSONB DEFAULT '[]'::jsonb,
  epicas JSONB DEFAULT '[]'::jsonb,
  apartados JSONB DEFAULT '[]'::jsonb,
  estado TEXT DEFAULT 'pendiente',
  etapa_actual INTEGER,
  avance NUMERIC(7,2),
  avance_porcentaje NUMERIC(7,2) DEFAULT 0,
  origen TEXT,
  visita_id UUID,
  descripcion TEXT,
  subtotal NUMERIC(14,2) DEFAULT 0,
  iva NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.soporte_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL,
  fecha DATE,
  cliente TEXT,
  area TEXT,
  ubicacion TEXT,
  equipo TEXT,
  responsable_cliente TEXT,
  tecnico TEXT,
  departamento TEXT,
  hora_inicio TEXT,
  hora_final TEXT,
  objetivo TEXT,
  descripcion_actividades TEXT,
  pruebas_realizadas TEXT,
  recomendaciones TEXT,
  observaciones_cliente TEXT,
  actividades JSONB DEFAULT '[]'::jsonb,
  estado TEXT DEFAULT 'confirmacion',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Permisos por usuario (selector usa auth_user_id de Supabase Auth)
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id
  ON public.user_module_permissions(user_id);

-- ---------------------------------------------------------------------------
-- Cotizaciones: alias fecha + vendedor (el front ordena/filtra por `fecha`)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS vendedor TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cotizaciones' AND column_name = 'fecha'
  ) THEN
    ALTER TABLE public.cotizaciones
      ADD COLUMN fecha DATE GENERATED ALWAYS AS (fecha_cotizacion) STORED;
  END IF;
END $$;

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now();

-- ---------------------------------------------------------------------------
-- fecha_creacion en tablas operativas frecuentes (si no existe)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ordenes_taller') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ordenes_taller ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now()';
  END IF;

  IF to_regclass('public.contactos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now()';
  END IF;

  IF to_regclass('public.inventario') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.inventario ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now()';
  END IF;

  IF to_regclass('public.facturas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ DEFAULT now()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- audit_logs: columnas usadas por data-service.js y ssepi_configuracion.html
-- (tablas antiguas solo tenían usuario/accion/created_at)
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS records_processed INTEGER DEFAULT 0;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS errors_count INTEGER DEFAULT 0;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;

DO $$
BEGIN
  -- Migración desde esquemas legacy (usuario/accion/created_at) -> (user_email/action/timestamp)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'accion'
  ) THEN
    EXECUTE 'UPDATE public.audit_logs SET action = accion WHERE action IS NULL AND accion IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'UPDATE public.audit_logs SET \"timestamp\" = created_at WHERE \"timestamp\" IS NULL AND created_at IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'usuario'
  ) THEN
    EXECUTE 'UPDATE public.audit_logs SET user_email = usuario::text WHERE user_email IS NULL AND usuario IS NOT NULL';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Desactivar RLS en tablas base (desarrollo)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo alterar RLS en %: %', r.tname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Privilegios PostgREST (evita 404 por falta de GRANT a roles API)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;

-- Recarga caché de esquema PostgREST
NOTIFY pgrst, 'reload schema';
