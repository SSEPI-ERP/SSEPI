# Edge Function: send-email (Resend)

Envía correos desde el ERP usando Resend. La API Key no va en el código; se configura en Supabase.

## 1. Configurar la clave de Resend en Supabase

1. Entra en Supabase Dashboard, tu proyecto.
2. Project Settings -> Edge Functions.
3. En Secrets, añade: Name = RESEND_API_KEY, Value = tu clave de Resend (re_...).

No pongas la clave en el repositorio ni en el frontend.

## 2. Desplegar la función

Desde la raíz del proyecto:

  npx supabase login
  npx supabase link --project-ref knzmdwjmrhcoytmebdwa
  npx supabase functions deploy send-email

## 3. Uso desde el ERP

En cualquier página que cargue email-service.js:

  window.emailService.send('destino@ejemplo.com', 'Asunto', '<p>Contenido HTML</p>')
    .then(function (result) { if (result.error) console.error(result.error); });

El remitente por defecto es SSEPI <onboarding@resend.dev>. Para tu dominio, verifica el dominio en Resend y pasa "from" en la llamada.
