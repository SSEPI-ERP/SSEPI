-- ================================================
-- SEGURIDAD SUPABASE - ERP SSEPI
-- DESCRIPCIÓN: RLS, Auditoría, Cifrado, Rate Limiting
-- ================================================

-- ================================================
-- 1. EXTENSIÓN DE CIFRADO
-- ================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================
-- 2. TABLA DE AUDITORÍA (todas las operaciones)
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
    -- Obtener datos del usuario
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
-- 3. HABILITAR RLS EN TABLAS PRINCIPALES
-- ================================================

-- Tabla: usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_ven_propio_perfil" ON usuarios;
CREATE POLICY "usuarios_ven_propio_perfil" ON usuarios
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_gestiona_usuarios" ON usuarios;
CREATE POLICY "admin_gestiona_usuarios" ON usuarios
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin'))
    );

-- Tabla: cotizaciones
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

-- Verificar si existe columna creado_por, si no usar usuario_id
DROP POLICY IF EXISTS "ventas_ven_sus_cotizaciones" ON cotizaciones;
CREATE POLICY "ventas_ven_sus_cotizaciones" ON cotizaciones
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin', 'ventas'))
    );

DROP POLICY IF EXISTS "ventas_crean_cotizaciones" ON cotizaciones;
CREATE POLICY "ventas_crean_cotizaciones" ON cotizaciones
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ventas_editan_cotizaciones" ON cotizaciones;
CREATE POLICY "ventas_editan_cotizaciones" ON cotizaciones
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin'))
    );

-- Tabla: ordenes_taller
ALTER TABLE ordenes_taller ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taller_ven_sus_ordenes" ON ordenes_taller;
CREATE POLICY "taller_ven_sus_ordenes" ON ordenes_taller
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('taller', 'admin', 'superadmin'))
        OR asignado_a = auth.uid()
    );

DROP POLICY IF EXISTS "taller_gestionan_ordenes" ON ordenes_taller;
CREATE POLICY "taller_gestionan_ordenes" ON ordenes_taller
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('taller', 'admin', 'superadmin'))
    );

-- Tabla: ordenes_motores
ALTER TABLE ordenes_motores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motores_ven_sus_ordenes" ON ordenes_motores;
CREATE POLICY "motores_ven_sus_ordenes" ON ordenes_motores
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('motores', 'admin', 'superadmin'))
    );

DROP POLICY IF EXISTS "motores_gestionan_ordenes" ON ordenes_motores;
CREATE POLICY "motores_gestionan_ordenes" ON ordenes_motores
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('motores', 'admin', 'superadmin'))
    );

-- Tabla: proyectos_automatizacion
ALTER TABLE proyectos_automatizacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automatizacion_ven_sus_proyectos" ON proyectos_automatizacion;
CREATE POLICY "automatizacion_ven_sus_proyectos" ON proyectos_automatizacion
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('automatizacion', 'admin', 'superadmin'))
    );

DROP POLICY IF EXISTS "automatizacion_gestionan_proyectos" ON proyectos_automatizacion;
CREATE POLICY "automatizacion_gestionan_proyectos" ON proyectos_automatizacion
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('automatizacion', 'admin', 'superadmin'))
    );

-- Tabla: actividades_diarias
ALTER TABLE actividades_diarias ENABLE ROW LEVEL SECURITY;

-- Tabla: actividades_historial
ALTER TABLE actividades_historial ENABLE ROW LEVEL SECURITY;

-- Tabla: contactos (datos sensibles)
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contactos_lectura_autenticados" ON contactos;
CREATE POLICY "contactos_lectura_autenticados" ON contactos
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "contactos_escritura_admin" ON contactos;
CREATE POLICY "contactos_escritura_admin" ON contactos
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin', 'ventas'))
    );

-- Tabla: inventario
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventario_lectura_autenticados" ON inventario;
CREATE POLICY "inventario_lectura_autenticados" ON inventario
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inventario_escritura_admin" ON inventario;
CREATE POLICY "inventario_escritura_admin" ON inventario
    FOR ALL USING (
        EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('admin', 'superadmin', 'ventas', 'taller'))
    );

-- ================================================
-- 4. CIFRADO DE COLUMNAS SENSIBLES
-- ================================================

-- Función para obtener clave de cifrado desde configuración
CREATE OR REPLACE FUNCTION get_encryption_key()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.encryption_key', true);
END;
$$ LANGUAGE sql SECURITY DEFINER;

-- Función para cifrar datos
CREATE OR REPLACE FUNCTION cifrar_dato(texto TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(texto, get_encryption_key());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para descifrar datos
CREATE OR REPLACE FUNCTION descifrar_dato(cifrado BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(cifrado, get_encryption_key());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 5. TRIGGERS DE AUDITORÍA POR TABLA
-- ================================================

DROP TRIGGER IF EXISTS audit_usuarios ON usuarios;
CREATE TRIGGER audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_cotizaciones ON cotizaciones;
CREATE TRIGGER audit_cotizaciones
    AFTER INSERT OR UPDATE OR DELETE ON cotizaciones
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_ordenes_taller ON ordenes_taller;
CREATE TRIGGER audit_ordenes_taller
    AFTER INSERT OR UPDATE OR DELETE ON ordenes_taller
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_ordenes_motores ON ordenes_motores;
CREATE TRIGGER audit_ordenes_motores
    AFTER INSERT OR UPDATE OR DELETE ON ordenes_motores
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_proyectos_automatizacion ON proyectos_automatizacion;
CREATE TRIGGER audit_proyectos_automatizacion
    AFTER INSERT OR UPDATE OR DELETE ON proyectos_automatizacion
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_actividades_diarias ON actividades_diarias;
CREATE TRIGGER audit_actividades_diarias
    AFTER INSERT OR UPDATE OR DELETE ON actividades_diarias
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS audit_contactos ON contactos;
CREATE TRIGGER audit_contactos
    AFTER INSERT OR UPDATE OR DELETE ON contactos
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- ================================================
-- 6. VISTA DE LOGS PARA ADMIN
-- ================================================
DROP VIEW IF EXISTS v_audit_admin;
CREATE OR REPLACE VIEW v_audit_admin AS
SELECT
    a.id,
    a.tabla,
    a.operacion,
    a.usuario_email,
    a.usuario_rol,
    a.datos_anteriores,
    a.datos_nuevos,
    a.ip_origen,
    a.timestamp
FROM audit_log a
WHERE EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid()
    AND u.rol IN ('admin', 'superadmin')
);

-- ================================================
-- 7. RATE LIMITING A NIVEL DE DB
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

-- Función para verificar rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(accion TEXT, max_intentos INTEGER DEFAULT 10, ventana_segundos INTEGER DEFAULT 60)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
    v_since TIMESTAMPTZ;
BEGIN
    v_since = NOW() - (ventana_segundos || ' seconds')::INTERVAL;

    SELECT COUNT(*) INTO v_count
    FROM rate_limit_log
    WHERE accion = check_rate_limit.accion
    AND timestamp >= v_since;

    IF v_count >= max_intentos THEN
        RETURN FALSE; -- Rate limit excedido
    END IF;

    -- Registrar intento
    INSERT INTO rate_limit_log(accion) VALUES (accion);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 8. LIMPIEZA AUTOMÁTICA DE LOGS (90 días)
-- ================================================
CREATE OR REPLACE FUNCTION fn_cleanup_old_logs()
RETURNS void AS $$
BEGIN
    -- Eliminar logs de auditoría mayores a 90 días
    DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days';

    -- Eliminar logs de rate limit mayores a 7 días
    DELETE FROM rate_limit_log WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
