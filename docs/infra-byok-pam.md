# BYOK y PAM (Fase 2 – Infraestructura)

## BYOK – Bring Your Own Key (cifrado de columnas)

- **Objetivo:** No almacenar la clave de cifrado de columnas (PII) en la base de datos. La aplicación o una función Edge/Serverless obtiene la clave desde un Key Vault en tiempo de ejecución.
- **Implementación en el ERP:**
  - La función `encrypt_sensitive_fields()` en `scripts/init.sql` usa primero `current_setting('app.encryption_key', true)`. Si está definida, se usa esa clave; si no, se usa el valor en `system_config`.
  - En producción: antes de ejecutar operaciones que disparen el trigger de cifrado, la capa que abre la sesión (Edge Function, backend con Supabase server client) debe obtener la clave desde HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, etc., y ejecutar `SET LOCAL app.encryption_key = '...'` en la misma transacción/sesión. Así la clave nunca se persiste en la BD.
- **Pasos sugeridos:**
  1. Configurar un secret en el Key Vault con el valor de la clave AES-256.
  2. En la Edge Function o backend que ejecute inserts/updates en tablas con cifrado, al inicio de la petición: leer el secret, abrir conexión a Supabase (o usar pool), ejecutar `SET LOCAL app.encryption_key = '<clave>'` y luego realizar la operación.
  3. Eliminar o rotar el valor en `system_config` para `encryption_key` en producción (o dejar un valor dummy para que no falle si alguien no usa SET LOCAL).

## PAM – Gestión de acceso privilegiado

- **Objetivo:** Que los administradores y cuentas de servicio no tengan privilegios permanentes; acceso Just-In-Time (JIT) y sesiones aisladas/auditadas.
- **Alcance:** No se implementa PAM dentro del código del ERP; es responsabilidad de IdP e infraestructura.
- **Requisitos recomendados:**
  - **Acceso JIT:** Los privilegios de admin (acceso al Dashboard de Supabase, cuentas de servicio con rol elevado) se conceden bajo demanda para una tarea y un tiempo limitado, y se revocan automáticamente.
  - **Sesiones privilegiadas aisladas:** Acceso al Dashboard o a la BD desde una estación de trabajo dedicada o un bastión, con sesiones grabadas para auditoría.
  - **Cuentas de servicio:** Usar claves con menor alcance posible; rotar claves periódicamente; no usar la misma clave en dev y prod.
