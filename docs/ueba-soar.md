# UEBA y SOAR (Fase 3 – Proceso e integraciones)

Recomendaciones de proceso. La orquestación y las herramientas de IA/ML no se implementan dentro del repositorio del ERP; corresponden al equipo de seguridad e infraestructura.

## UEBA – Análisis de comportamiento de usuarios y entidades

- **Objetivo:** Establecer una línea base de comportamiento “normal” y detectar anomalías (accesos a horas inusuales, desde ubicaciones no habituales, descarga masiva de datos, etc.).
- **Eventos a enviar al SIEM desde el ERP:**
  - Autenticación: éxito/fallo, IP, user_agent, timestamp (desde `auth_logs`).
  - Acciones sobre datos: `audit_logs` (tabla, acción, user_id, ip, severity, timestamp).
  - Cambios de permisos o de rol (si se implementan en el futuro): registro explícito con severidad alta.
- **Uso:** Alimentar el SIEM con estos eventos para que las herramientas de UEBA (Splunk UBA, Microsoft Sentinel, etc.) construyan la línea base por usuario/rol y disparen alertas ante desviaciones (p. ej. usuario de taller que accede por primera vez a tablas de nómina, o múltiples exportaciones en poco tiempo).

## SOAR – Orquestación de seguridad y respuesta automatizada

- **Objetivo:** Detectar incidentes y ejecutar respuestas automatizadas (playbooks) sin intervención manual inmediata.
- **Ejemplos de detección (reglas en el SIEM):**
  - Múltiples intentos de autenticación fallidos desde una IP no confiable.
  - Acceso a tabla de nómina por un usuario con rol distinto a contabilidad/admin.
  - Patrón de inyección SQL bloqueado por el WAF.
- **Ejemplos de playbooks (respuesta automatizada):**
  - **Fuerza bruta:** Bloquear la IP en el firewall o WAF, rotar o invalidar la contraseña de la cuenta objetivo, enviar notificación al equipo de seguridad.
  - **Acceso no autorizado a datos sensibles:** Revocar sesión del usuario, crear ticket de incidente, notificar a seguridad y al responsable del área.
  - **WAF – ataque bloqueado:** Registrar evento, opcionalmente bloquear IP de origen y notificar.
- **Responsabilidad:** Definir y mantener los playbooks es responsabilidad del equipo de seguridad; el ERP solo genera los eventos (audit_logs, auth_logs) y, si aplica, endpoints para que el SIEM o el SOAR consuman.

## Integración en el flujo de diseño

- Incorporar la [plantilla Secure by Design](secure-by-design-checklist.md) en el diseño de nuevas funcionalidades.
- Al añadir nuevas acciones o tablas, documentar qué eventos se generan y si deben considerarse de alta severidad para alertas o playbooks.
