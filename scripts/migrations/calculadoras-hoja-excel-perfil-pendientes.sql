-- =============================================================================
-- Calculadoras: hoja tipo Excel (fórmula + valor) · Cambios de perfil pendientes
-- · Notas para contactos / taller (ejecutar en Supabase SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Hoja editable por calculadora (filas: concepto, fórmula texto, valor numérico)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calculadora_hoja_filas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculadora_id UUID NOT NULL REFERENCES public.calculadoras(id) ON DELETE CASCADE,
  fila_orden INT NOT NULL DEFAULT 0,
  concepto TEXT,
  formula_text TEXT,
  valor NUMERIC(18, 4),
  solo_valor BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (calculadora_id, fila_orden)
);

COMMENT ON TABLE public.calculadora_hoja_filas IS 'Filas estilo Excel por calculadora: texto de fórmula (referencia) y/o valor numérico editable.';

CREATE INDEX IF NOT EXISTS idx_calculadora_hoja_calc ON public.calculadora_hoja_filas(calculadora_id);

-- -----------------------------------------------------------------------------
-- Helper RLS (idempotente). Si ya existe por calculadoras-rls-acceso-equipo.sql,
-- CREATE OR REPLACE no rompe nada. Así esta migración corre sola sin error 42883.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ssepi_calculadoras_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.rol IN ('admin', 'superadmin', 'automatizacion', 'taller', 'contabilidad')
  )
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.rol IN ('admin', 'superadmin', 'automatizacion', 'taller', 'contabilidad')
  );
$$;

ALTER TABLE public.calculadora_hoja_filas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calculadora_hoja_select_auth ON public.calculadora_hoja_filas;
CREATE POLICY calculadora_hoja_select_auth ON public.calculadora_hoja_filas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS calculadora_hoja_mutate_editors ON public.calculadora_hoja_filas;
CREATE POLICY calculadora_hoja_mutate_editors ON public.calculadora_hoja_filas FOR ALL TO authenticated
  USING (public.ssepi_calculadoras_editor())
  WITH CHECK (public.ssepi_calculadoras_editor());

DROP POLICY IF EXISTS calculadora_hoja_admin_all ON public.calculadora_hoja_filas;
DROP POLICY IF EXISTS calculadora_hoja_equipo_read ON public.calculadora_hoja_filas;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculadora_hoja_filas TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) Solicitudes de cambio de datos de perfil (aprobación por admin)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfil_cambios_pendientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT,
  telefono TEXT,
  email TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revisado_por UUID REFERENCES auth.users(id),
  revisado_at TIMESTAMPTZ,
  motivo_rechazo TEXT
);

COMMENT ON TABLE public.perfil_cambios_pendientes IS 'Cambios de nombre/teléfono/correo solicitados por usuarios; admin aprueba y se aplican en usuarios/users.';

CREATE INDEX IF NOT EXISTS idx_perfil_pend_estado ON public.perfil_cambios_pendientes(estado);
CREATE INDEX IF NOT EXISTS idx_perfil_pend_user ON public.perfil_cambios_pendientes(auth_user_id);

ALTER TABLE public.perfil_cambios_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfil_pend_insert_own ON public.perfil_cambios_pendientes;
CREATE POLICY perfil_pend_insert_own ON public.perfil_cambios_pendientes FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS perfil_pend_select_own ON public.perfil_cambios_pendientes;
CREATE POLICY perfil_pend_select_own ON public.perfil_cambios_pendientes FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS perfil_pend_update_admin ON public.perfil_cambios_pendientes;
CREATE POLICY perfil_pend_update_admin ON public.perfil_cambios_pendientes FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid() AND u.rol IN ('admin', 'superadmin'))
  );

GRANT SELECT, INSERT, UPDATE ON public.perfil_cambios_pendientes TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) OPCIONAL: limpiar contactos duplicados por nombre+empresa (texto plano)
--    Ajusta según tu esquema; si email/teléfono van cifrados en BYTEA, no uses esto.
-- -----------------------------------------------------------------------------
/*
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(trim(nombre)), lower(trim(coalesce(empresa, '')))
           ORDER BY updated_at DESC NULLS LAST
         ) AS rn
  FROM public.contactos
)
DELETE FROM public.contactos c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;
*/

-- -----------------------------------------------------------------------------
-- 4) Taller / componentes / órdenes
--    Las tablas public.ordenes_taller, inventario, BOM, etc. ya están en
--    scripts/init.sql y scripts/migrations/ordenes-taller-estados-odoo.sql,
--    bom-lineas.sql. Importa datos con CSV en el Table Editor o con COPY.
--    Ejemplo de plantilla (sin datos reales):
--
-- INSERT INTO public.ordenes_taller (folio, cliente, descripcion, estado, fecha_ingreso)
-- VALUES ('LAB-00001', 'Cliente demo', 'Revisión', 'pendiente', NOW());
-- =============================================================================
