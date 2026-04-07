-- ============================================================
-- Enmascaramiento de PII para copias de BD no productivas
-- Ejecutar SOLO en réplicas de desarrollo/pruebas. NO ejecutar en producción.
-- Reduce riesgo de fuga de datos personales en entornos no prod.
-- ============================================================

-- 1) profiles: anonimizar nombre, email, teléfono
UPDATE profiles
SET
  nombre = 'Usuario-' || LEFT(id::TEXT, 8),
  email = 'user-' || LEFT(id::TEXT, 8) || '@example.local',
  telefono = NULL
WHERE true;

-- 2) public.users (si existe): anonimizar email, nombre
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    EXECUTE 'UPDATE public.users SET nombre = ''Usuario-'' || LEFT(auth_user_id::TEXT, 8), email = ''user-'' || LEFT(auth_user_id::TEXT, 8) || ''@example.local'' WHERE true';
  END IF;
END $$;

-- 3) contactos: enmascarar texto legible (nombre, empresa, puesto, sitio_web)
-- Las columnas BYTEA (email, telefono, direccion, rfc) están cifradas; en un dump descifrado habría que enmascarar aparte.
UPDATE contactos
SET
  nombre = 'Contacto-' || LEFT(id::TEXT, 8),
  empresa = 'Empresa anon',
  puesto = NULL,
  sitio_web = NULL;

-- 4) empleados: enmascarar nombre; email/telefono/direccion son BYTEA (dejar o NULL si la columna lo permite)
UPDATE empleados
SET nombre = 'Empleado-' || LEFT(id::TEXT, 8);

-- 5) audit_logs: ofuscar old_data/new_data que puedan contener PII (opcional: truncar o reemplazar por { "masked": true })
-- Descomentar si se desea enmascarar payloads de auditoría:
/*
UPDATE audit_logs
SET old_data = '{"masked": true}'::JSONB, new_data = '{"masked": true}'::JSONB
WHERE table_name IN ('contactos', 'empleados', 'profiles', 'users');
*/

-- 6) auth_logs: los registros ya usan email_hash; no hay PII directo. Opcional: borrar detalles
-- UPDATE auth_logs SET details = 'masked' WHERE true;
