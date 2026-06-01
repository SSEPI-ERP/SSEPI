-- =====================================================
-- SSEPI — Tablas nuevas para sync bidireccional (2026-06-01)
--
-- Cierra la brecha entre el proxy local SQLite (43 tablas)
-- y Supabase cloud (28 tablas). El sync-engine.mjs ya
-- itera 42 tablas en TABLES_TO_SYNC, pero faltaban estas
-- en cloud.
--
-- APLICAR EN: Supabase SQL Editor (staging primero).
-- IDEMPOTENTE: usa CREATE TABLE IF NOT EXISTS, DROP POLICY
-- IF EXISTS y ALTER ... ADD COLUMN IF NOT EXISTS.
--
-- ============== ORDEN DE APLICACIÓN ==================
-- 1) auth_logs            (nueva, antes no existia)
-- 2) role_permissions     (nueva, antes no existia)
-- 3) security_alerts      (nueva, antes no existia)
-- 4) calculadora_clientes (ya existe en calculadoras-modulo.sql,
--    se valida estructura)
-- 5) calculadora_hoja_filas (ya existe en calculadoras-modulo.sql,
--    se valida estructura)
-- 6) Grants + RLS permisivo (offline proxy usa service_role)
-- =====================================================

-- =====================================================
-- 1) auth_logs
-- Auditoría de login: email, ip, exito, user_agent, etc.
-- Estructura flexible (JSONB data) para crecer sin migrar.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.auth_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON public.auth_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_data_email ON public.auth_logs((data->>'email'));
ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_logs_service_all ON public.auth_logs;
CREATE POLICY auth_logs_service_all ON public.auth_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_logs_admin_read ON public.auth_logs;
CREATE POLICY auth_logs_admin_read ON public.auth_logs
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.usuarios
            WHERE auth_user_id = auth.uid()
              AND rol IN ('admin', 'superadmin', 'contabilidad')
        )
    );
GRANT ALL ON public.auth_logs TO service_role;
GRANT SELECT ON public.auth_logs TO authenticated;

-- =====================================================
-- 2) role_permissions
-- Permisos granulares por rol (matriz rol × accion).
-- data JSONB: { rol: 'ventas', modulo: 'compras', accion: 'write', activo: true }
-- =====================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_updated_at ON public.role_permissions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_permissions_data_rol ON public.role_permissions((data->>'rol'));
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_service_all ON public.role_permissions;
CREATE POLICY role_permissions_service_all ON public.role_permissions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS role_permissions_authenticated_read ON public.role_permissions;
CREATE POLICY role_permissions_authenticated_read ON public.role_permissions
    FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.role_permissions TO service_role;
GRANT SELECT ON public.role_permissions TO authenticated;

-- =====================================================
-- 3) security_alerts
-- Alertas de seguridad generadas por el sistema
-- (login fallido múltiple, RLS denied, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON public.security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON public.security_alerts((data->>'severity'));
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_alerts_service_all ON public.security_alerts;
CREATE POLICY security_alerts_service_all ON public.security_alerts
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS security_alerts_admin_read ON public.security_alerts;
CREATE POLICY security_alerts_admin_read ON public.security_alerts
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.usuarios
            WHERE auth_user_id = auth.uid()
              AND rol IN ('admin', 'superadmin')
        )
    );
GRANT ALL ON public.security_alerts TO service_role;
GRANT SELECT ON public.security_alerts TO authenticated;

-- =====================================================
-- 4) calculadora_clientes (verificar/asegurar estructura)
-- Creada en calculadoras-modulo.sql — IF NOT EXISTS la respeta.
-- Si no existe aun, este CREATE la genera con la estructura
-- esperada por el sync local.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.calculadora_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calculadora_clientes_updated_at ON public.calculadora_clientes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calculadora_clientes_calc_id ON public.calculadora_clientes((data->>'calculadora_id'));
CREATE INDEX IF NOT EXISTS idx_calculadora_clientes_cliente ON public.calculadora_clientes((data->>'cliente_nombre'));
ALTER TABLE public.calculadora_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calculadora_clientes_service_all ON public.calculadora_clientes;
CREATE POLICY calculadora_clientes_service_all ON public.calculadora_clientes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS calculadora_clientes_authenticated_read ON public.calculadora_clientes;
CREATE POLICY calculadora_clientes_authenticated_read ON public.calculadora_clientes
    FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.calculadora_clientes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.calculadora_clientes TO authenticated;

-- =====================================================
-- 5) calculadora_hoja_filas (verificar/asegurar estructura)
-- Filas de la hoja Excel por calculadora (concepto, formula,
-- valor, etc.). Volumen alto (cientos por calculadora).
-- =====================================================
CREATE TABLE IF NOT EXISTS public.calculadora_hoja_filas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calculadora_hoja_filas_updated_at ON public.calculadora_hoja_filas(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calculadora_hoja_filas_calc_id ON public.calculadora_hoja_filas((data->>'calculadora_id'));
CREATE INDEX IF NOT EXISTS idx_calculadora_hoja_filas_orden ON public.calculadora_hoja_filas((data->>'fila_orden'));
ALTER TABLE public.calculadora_hoja_filas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calculadora_hoja_filas_service_all ON public.calculadora_hoja_filas;
CREATE POLICY calculadora_hoja_filas_service_all ON public.calculadora_hoja_filas
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS calculadora_hoja_filas_authenticated_read ON public.calculadora_hoja_filas;
CREATE POLICY calculadora_hoja_filas_authenticated_read ON public.calculadora_hoja_filas
    FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.calculadora_hoja_filas TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.calculadora_hoja_filas TO authenticated;

-- =====================================================
-- 6) Grants transversales
-- service_role ya tiene ALL. authenticated puede leer/insertar
-- las calculadoras; las tablas sensibles (auth_logs, security_alerts)
-- son solo lectura para authenticated si es admin.
-- =====================================================
-- Re-asegurar grants por si las tablas ya existian sin policies
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =====================================================
-- 7) Comentarios de documentación
-- =====================================================
COMMENT ON TABLE public.auth_logs IS
    'Auditoria de login offline/online. Sync desde local_auth_logs (2026-06-01).';
COMMENT ON TABLE public.role_permissions IS
    'Permisos granulares por rol. Sync desde local_role_permissions (2026-06-01).';
COMMENT ON TABLE public.security_alerts IS
    'Alertas de seguridad (login fallido, RLS denied). Sync desde local_security_alerts (2026-06-01).';
COMMENT ON TABLE public.calculadora_clientes IS
    'Vinculo calculadora ↔ cliente. 811 registros en local (2026-06-01).';
COMMENT ON TABLE public.calculadora_hoja_filas IS
    'Filas de la hoja Excel por calculadora. 194 registros en local (2026-06-01).';

-- =====================================================
-- 8) Verificación final (opcional, comentado)
-- =====================================================
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'auth_logs','role_permissions','security_alerts',
--     'calculadora_clientes','calculadora_hoja_filas',
--     'usuarios','audit_logs','users_ver_costos','user_module_permissions',
--     'n8n_heartbeat','n8n_insights','politicas_modulos','inbound_emails',
--     'eventos_contables_coi','movimientos_inventario'
--   )
-- ORDER BY tablename;
