-- =====================================================
-- FIX: Alinear RLS de eventos_contables_coi con esquema COI
-- Ejecutar TODO de una vez en Supabase SQL Editor
-- =====================================================

-- La tabla eventos_contables_coi tenía RLS abierto a cualquier authenticated.
-- El resto del ecosistema COI restringe a admin/superadmin/contabilidad.
-- Se alinea para mantener integridad del módulo contable.

-- Eliminar políticas antiguas permisivas
DROP POLICY IF EXISTS eventos_coi_select ON public.eventos_contables_coi;
DROP POLICY IF EXISTS eventos_coi_insert ON public.eventos_contables_coi;
DROP POLICY IF EXISTS eventos_coi_update ON public.eventos_contables_coi;

-- Recrear políticas restringidas por rol
CREATE POLICY eventos_coi_select ON public.eventos_contables_coi
    FOR SELECT TO authenticated
    USING (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

CREATE POLICY eventos_coi_insert ON public.eventos_contables_coi
    FOR INSERT TO authenticated
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

CREATE POLICY eventos_coi_update ON public.eventos_contables_coi
    FOR UPDATE TO authenticated
    USING (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'))
    WITH CHECK (public.ssepi_current_rol() IN ('admin', 'superadmin', 'contabilidad'));

-- Nota: no se crea política DELETE (intencional; auditoría permanente)

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
