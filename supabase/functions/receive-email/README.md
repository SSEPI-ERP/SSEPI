# Edge Function: receive-email (Resend Inbound)

Cuando un cliente envía un correo a tu dominio de recepción de Resend, Resend hace POST a esta función y guardamos el correo en `inbound_emails` para que puedas verlo en el ERP y recibir notificación.

## 1. Tabla en Supabase

Ejecuta en el SQL Editor de Supabase el contenido de `scripts/migrations/add_inbound_emails.sql` (crear tabla `inbound_emails` y política RLS).

## 2. Secrets

En Project Settings → Edge Functions → Secrets asegúrate de tener:

- `RESEND_API_KEY` (ya la tienes)
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` suelen estar disponibles al desplegar; si no, añade el Service Role Key desde Project Settings → API.

## 3. Resend: dominio y webhook

1. En Resend Dashboard → **Receiving** (o **Inbound**) → añade un dominio y configura el webhook.
2. **Webhook URL** debe ser: `https://knzmdwjmrhcoytmebdwa.supabase.co/functions/v1/receive-email`
3. Evento: `email.received`.

Así, cuando alguien envíe un correo a una dirección de ese dominio (ej. `contacto@tudominio.com`), Resend enviará el evento a esta función y se guardará en `inbound_emails`.

## 4. Desplegar

```bash
npx supabase functions deploy receive-email
```

## 5. En el ERP

Puedes leer la tabla `inbound_emails` desde el frontend (usuarios autenticados con RLS) para mostrar una sección "Correos recibidos" o un contador de correos no leídos y abrir el detalle.
