# Arquitectura de Seguridad SSEPI ERP

## 1. Autenticación y Autorización

- **Supabase Auth**: único proveedor de identidad.
- **MFA TOTP**: soporte para segundo factor (código de app autenticadora).
- **Passkeys / WebAuthn (planificado)**: cuando Supabase Auth lo soporte, se implementará flujo resistente a phishing:
  - Registro: tras login, opción "Añadir passkey" que llama a `mfa.enroll` con factor tipo WebAuthn.
  - Login: si el usuario tiene passkey, mostrar desafío WebAuthn en lugar de (o además de) TOTP; `mfa.challengeAndVerify` con el factor passkey.
  - Ventaja: las credenciales no se pueden robar por phishing. Ver TODO en `js/core/auth-service.js`.
- **Sesión**: 8 h con refresh; bloqueo tras 5 intentos fallidos (configurable).
- **Perfiles**: tabla `profiles` y/o `public.users` (vista `usuarios`) con `rol` y atributos ABAC (`departamento`, `sede`, `nivel_riesgo`).
- **Permisos**: tabla `role_permissions` (rol, module, action). Rol `admin` con `('*','*')` tiene acceso total.

Roles: `admin`, `ventas`, `taller`, `motores`, `compras`, `facturacion`, `contabilidad`, `automatizacion`.

## 2. Row Level Security (RLS)

Todas las tablas críticas tienen RLS habilitado. Políticas por rol según `scripts/init.sql` y `scripts/ajuste-rls-para-usuarios.sql`. ABAC (atributos departamento, sede, monto) en `scripts/rls-abac.sql`. SoD (segregación de funciones) en `scripts/sod-constraints.sql`.

| Tabla | Políticas |
|-------|-----------|
| profiles | Usuario ve su perfil; admin gestiona. |
| role_permissions | Solo admin. |
| audit_logs | Inserción por trigger; lectura según política. |
| contactos | Según rol (ventas, compras, etc.). |
| inventario | Taller, compras, motores, automatización: lectura; admin/taller/compras modifican según permisos. |
| ordenes_taller | Taller: CRUD; ventas, compras, facturacion: SELECT. |
| ordenes_motores | Motores: CRUD; otros roles: SELECT según permisos. |
| compras | Compras: CRUD; taller/motores/automatizacion: crear/leer vinculadas. |
| cotizaciones | Ventas: CRUD; otros: según role_permissions. |
| ventas, facturas | Facturación y ventas según permisos. |
| notificaciones | Usuario ve las dirigidas a su rol. |

## 3. Encriptación de Datos Sensibles (PII)

- **Algoritmo:** AES-256 vía `pgcrypto`.
- **Campos:** RFC, email, teléfono, dirección en tablas como `contactos` (o columnas dedicadas).
- **Clave:** por defecto en `system_config`; en producción usar **BYOK**: inyectar clave vía variable de sesión `app.encryption_key` (obtenida desde Vault o Key Vault del cloud en cada sesión). La función `encrypt_sensitive_fields()` en `init.sql` usa `current_setting('app.encryption_key', true)` si está definida. Ver docs de Fase 2 (infra BYOK).
- **Desencriptación:** solo en vistas/RPC autorizados.

## 4. Integridad

- **Hash:** SHA-256 por registro donde corresponda en `init.sql` (columna `hash`).
- **Auditoría:** tabla `audit_logs` (IP, usuario, acción, old_data, new_data, timestamp).
- **Triggers:** en tablas críticas (`ordenes_taller`, `ordenes_motores`, `compras`, `soporte_visitas`, etc.) invocan función de auditoría.

## 5. Protecciones de Red y Cliente

- **CSP, CSRF, rate limiting:** implementados en `js/core/security-middleware.js` (60 req/min por IP).
- **Sanitización y escape:** en `data-service.js` y `security-middleware.js` para evitar inyección y XSS.

## 6. Producción

- **HTTPS/TLS 1.3** obligatorio.
- **Backups y DRP:** RTO < 4 h documentado por el equipo de infraestructura.

## 7. Referencia de Implementación

- **Auth:** `js/core/auth-service.js` (login, logout, getCurrentProfile, hasPermission, getSodViolations, requireAuth).
- **Middleware:** `js/core/security-middleware.js` (initSecurity, CSP, CSRF, rate limit).
- **Datos:** `js/core/data-service.js` (insert, update, delete, select con auditoría y permisos).
- **Encriptación:** `js/core/encryption-utils.js` (uso coordinado con BD).

## 8. Infraestructura y proceso (Fase 2 y 3)

- **WAF, SIEM, endurecimiento:** [docs/infra-waf-siem.md](infra-waf-siem.md) (cabeceras, exportación de logs, storage).
- **BYOK y PAM:** [docs/infra-byok-pam.md](infra-byok-pam.md) (clave desde Vault, acceso privilegiado JIT).
- **Políticas como código:** [scripts/README.md](../scripts/README.md) (orden de ejecución de scripts RLS y seguridad).
- **SAST/SBOM y CI:** [docs/ci-security-sast-sbom.md](ci-security-sast-sbom.md) (npm audit, SBOM, ESLint, ejemplo GitHub Actions).
- **Secure by Design:** [docs/secure-by-design-checklist.md](secure-by-design-checklist.md) (checklist de modelado de amenazas para nuevas funcionalidades).
- **UEBA y SOAR (Fase 3):** [docs/ueba-soar.md](ueba-soar.md) (eventos para análisis de comportamiento, ejemplos de playbooks).
