-- ================================================
-- SEGURIDAD SUPABASE - Versión Simple
-- Solo habilita RLS y auditoría sin políticas complejas
-- ================================================

-- ================================================
-- 1. EXTENSIÓN DE CIFRADO
-- ================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================
-- 2. TABLA DE AUDITORÍA
-- ================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabla TEXT NOT NULL,
    operacion TEXT NOT NULL,
    usuario_id UUID,
    usuario_email TEXT,
    usuario_rol TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    ip_origen INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tabla ON audit_log(tabla);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- Función de auditoría
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_rol TEXT;
BEGIN
    SELECT id, email, rol INTO v_user_id, v_user_email, v_user_rol
    FROM usuarios WHERE id = auth.uid();

    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log(tabla, operacion, usuario_id, usuario_email, usuario_rol, datos_anteriores)
        VALUES (TG_TABLE_NAME, TG_OP, v_user_id, v_user_email, v_user_rol, row_to_json(OLD));
        RETURN OLD;
    ELSE
        INSERT INTO audit_log(tabla, operacion, usuario_id, usuario_email, usuario_rol, datos_nuevos)
        VALUES (TG_TABLE_NAME, TG_OP, v_user_id, v_user_email, v_user_rol, row_to_json(NEW));
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 3. HABILITAR RLS - POLÍTICAS BÁSICAS
-- ================================================

-- Admin ve todo, usuarios ven sus datos
DROP POLICY IF EXISTS "admin_ve_todo" ON usuarios;
CREATE POLICY "admin_ve_todo" ON usuarios FOR ALL
    USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin')));

DROP POLICY IF EXISTS "usuario_ve_perfil" ON usuarios;
CREATE POLICY "usuario_ve_perfil" ON usuarios FOR SELECT
    USING (auth.uid() = id);

-- ================================================
-- 4. RATE LIMITING
-- ================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID,
    accion TEXT NOT NULL,
    ip_origen INET,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_usuario ON rate_limit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_log(ip_origen);
CREATE INDEX IF NOT EXISTS idx_rate_limit_timestamp ON rate_limit_log(timestamp);

-- Función rate limit simple
CREATE OR REPLACE FUNCTION check_rate_limit(accion TEXT, max_intentos INTEGER DEFAULT 10, ventana_segundos INTEGER DEFAULT 60)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
    v_since TIMESTAMPTZ;
BEGIN
    v_since = NOW() - (ventana_segundos || ' seconds')::INTERVAL;
    SELECT COUNT(*) INTO v_count FROM rate_limit_log WHERE accion = check_rate_limit.accion AND timestamp >= v_since;

    IF v_count >= max_intentos THEN RETURN FALSE; END IF;
    INSERT INTO rate_limit_log(accion) VALUES (accion);
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 5. LIMPIEZA AUTOMÁTICA
-- ================================================
CREATE OR REPLACE FUNCTION fn_cleanup_old_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days';
    DELETE FROM rate_limit_log WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
