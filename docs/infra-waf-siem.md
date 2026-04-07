# WAF, SIEM y endurecimiento (Fase 2 – Infraestructura)

## WAF y protección de APIs

- **Objetivo:** Filtrar tráfico malicioso (inyección SQL, XSS, fuerza bruta) antes de que llegue a la aplicación y a Supabase.
- **Opciones:** Cloudflare WAF, AWS WAF, o el WAF del proxy que use el despliegue.
- **Configuración sugerida:**
  - Reglas de bloqueo: patrones típicos de SQL injection (`UNION SELECT`, `'; DROP`, etc.), XSS (`<script>`, `javascript:`).
  - Límite de tasa por IP (rate limiting) en rutas de login y APIs.
  - Lista blanca de métodos HTTP (GET, POST; restringir PUT/DELETE si no se usan desde cliente).
- **Supabase:** La API de Supabase (REST y Realtime) puede ir detrás del mismo dominio con proxy o exponer solo el proyecto; en cualquier caso, poner el WAF delante del tráfico que llega al navegador y, si aplica, a un backend que llame a Supabase.

## SIEM – integración de logs

- **Esquema de eventos:** Los logs de aplicación están en `audit_logs` (y opcionalmente `auth_logs`) con campos:
  - `timestamp`, `user_id`, `ip`, `action`, `table_name`, `record_id`, `old_data`, `new_data`, `severity`, `metadata`.
- **Exportación a SIEM:**
  - **Log drain:** Si el despliegue usa un servicio que permita log drain (p. ej. Supabase no expone drain directo; un backend que lea de `audit_logs` y reenvíe sí).
  - **Webhook:** Backend o Edge Function que al escribir en `audit_logs` (o por trigger) envíe el evento a un endpoint del SIEM (Splunk, Datadog, etc.).
  - **Exportación periódica:** Job (cron) que lea las filas nuevas de `audit_logs` y `auth_logs` y las envíe por API al SIEM.
- **Campos recomendados para correlación:** `user_id`, `ip`, `action`, `table_name`, `severity`, `timestamp`. Incluir `metadata` para datos de contexto (navegador, etc.).

## Endurecimiento

- **Cabeceras HTTP (en el servidor o proxy):**
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy` (recomendado enviarla por cabecera además de `<meta>`).
- **Supabase:** Revisar en el Dashboard que no queden APIs o claves expuestas; usar variables de entorno para `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el cliente.
- **Storage:** En Supabase Storage, los buckets no deben ser públicos salvo los archivos que deban ser accesibles sin autenticación; revisar políticas de bucket y de archivo.
- **Checklist rápido:** HTTPS obligatorio, cabeceras anteriores configuradas, CSP restrictiva, buckets privados por defecto, rate limiting en login.
