-- Migración: añadir severity y metadata a audit_logs (para BD ya existentes)
-- Ejecutar en Supabase SQL Editor si la tabla audit_logs ya existe sin estas columnas.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- Actualizar función de trigger para rellenar severity y metadata
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  user_id_val UUID;
  user_email_val TEXT;
  user_role_val TEXT;
  ip_val TEXT;
  user_agent_val TEXT;
BEGIN
  user_id_val = auth.uid();
  SELECT email, rol INTO user_email_val, user_role_val FROM profiles WHERE id = user_id_val;
  ip_val = NULL;
  user_agent_val = NULL;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, new_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(NEW), 'info', '{}', NEW.hash);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, old_data, new_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(OLD), to_jsonb(NEW), 'info', '{}', NEW.hash);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, user_id, user_email, user_role, ip, user_agent, old_data, severity, metadata, hash)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', user_id_val, user_email_val, user_role_val, ip_val, user_agent_val, to_jsonb(OLD), 'info', '{}', OLD.hash);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
