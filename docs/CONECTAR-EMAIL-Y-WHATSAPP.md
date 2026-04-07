# Cómo conectar Email y WhatsApp al ERP SSEPI

Recomendaciones **gratuitas** y que mejor convienen para un ERP: envío de correos (notificaciones, restablecer contraseña, reportes) y mensajes por WhatsApp (alertas, recordatorios).

---

## 1. EMAIL (Correo)

### Opciones gratuitas recomendadas (de mejor a buena)

| Servicio    | Plan gratis        | Ventaja para el ERP                    | Registro |
|------------|--------------------|----------------------------------------|----------|
| **Resend** | 100 emails/día     | Muy fácil de usar, API simple, buen deliverability | [resend.com](https://resend.com) |
| **SendGrid** (Twilio) | 100 emails/día | Muy usado, documentación buena, estadísticas | [sendgrid.com](https://sendgrid.com) |
| **Brevo** (ex Sendinblue) | 300 emails/día | Incluye SMTP y API, plantillas | [brevo.com](https://brevo.com) |
| **Gmail API** | Cuota gratuita alta | Usas tu propia cuenta Gmail | Google Cloud Console |

### Recomendación para el ERP: **Resend** o **SendGrid**

- **Resend**: ideal para empezar, API moderna, fácil desde Supabase Edge Functions.
- **SendGrid**: si ya usas Twilio o quieres más opciones de analytics.

### Pasos para Resend (recomendado)

1. **Registrarte**
   - Entra en [resend.com](https://resend.com) y crea cuenta (gratis).
   - Verifica tu dominio (o usa el dominio de prueba para pruebas).

2. **Obtener API Key**
   - En el dashboard: **API Keys** → **Create API Key**.
   - Copia la clave (empieza por `re_`). Guárdala en Supabase como secreto (ver más abajo).

3. **Uso en el ERP**
   - Desde una **Supabase Edge Function** (o backend) llamas a la API de Resend para enviar correos (notificaciones, restablecer contraseña, reportes).
   - No hace falta "descargar" ninguna app: todo por HTTP con la API Key.

### Pasos para SendGrid

1. [sendgrid.com](https://sendgrid.com) → Sign up (plan free).
2. **Settings** → **API Keys** → **Create API Key** (permiso "Mail Send").
3. Usar desde Edge Function o backend con la API Key.

### Gmail (opcional)

- Requiere crear proyecto en [Google Cloud Console](https://console.cloud.google.com), activar **Gmail API**, crear credenciales OAuth 2.0 y configurar pantalla de consentimiento.
- Más pasos que Resend/SendGrid; mejor para cuando quieras enviar desde tu cuenta Gmail con tu propio dominio.

---

## 2. WHATSAPP

### ¿La API te da un número?

Sí. Con **Twilio** (o WhatsApp Business API) obtienes **un número de negocio** desde el que la app envía mensajes. Ese número es único para tu proyecto/app.

### ¿Cada perfil (ventas, compras, etc.) puede tener su propio número y recibir/enviar desde ahí?

No de forma directa con la API estándar:

- **Twilio / WhatsApp Business API**: tienes **un número** para la aplicación. Tú envías mensajes **a** clientes (o a quien tú pongas). Los mensajes no “llegan al WhatsApp personal” de cada usuario del ERP (ventas, compras); esos usuarios entran al ERP y ven sus notificaciones en la app (o por correo).
- Para que **cada perfil tenga su propio número** y envíe/reciba desde su WhatsApp personal haría falta otra cosa: por ejemplo conectar cuentas personales (complicado y no soportado oficialmente para múltiples números desde una misma app), o usar herramientas como **n8n** para flujos donde una persona recibe un aviso por WhatsApp vinculado a su número (n8n puede orquestar envíos y condiciones por perfil).

### ¿Mejor Twilio o n8n para WhatsApp?

- **Twilio (o Meta WhatsApp Business API)**: mejor cuando quieres que **el ERP envíe mensajes automáticos** desde un número de la empresa (recordatorios, alertas, notificaciones a clientes). Un solo número, lógica en tu código o Edge Functions.
- **n8n**: mejor cuando quieres **flujos visuales**, condiciones por perfil, integración con muchas apps (Gmail, WhatsApp, bases de datos, etc.) y no quieres escribir todo en código. Puedes hacer “si es perfil ventas, enviar a este número” o “si es compras, enviar por correo”. Para WhatsApp en n8n sueles usar un conector (p. ej. WhatsApp Business API o servicios compatibles).

Como el WhatsApp es **menos prioritario** para ti, lo práctico es: **primero tener el correo con Resend** y más adelante, si quieres WhatsApp, decidir si lo haces con Twilio (un número del ERP) o con n8n (flujos por perfil/condiciones).

| Opción | Coste | Uso típico en ERP |
|--------|------|-------------------|
| **Twilio API for WhatsApp** | Trial gratis; luego pago por mensaje | Alertas, recordatorios, notificaciones desde tu app |
| **WhatsApp Business API** (Meta) | Gratis el acceso; Meta puede cobrar por conversación según país | Cuenta oficial de negocio, alto volumen |
| **WhatsApp Business App** (móvil) | Gratis | Uso manual; no hay API para automatizar desde el ERP |

### Recomendación para el ERP: **Twilio** para empezar

- Tienes **créditos de prueba** para probar WhatsApp sin tarjeta.
- Después se paga por mensaje (precio bajo por mensaje).
- Fácil de llamar desde una Edge Function o backend.

### Pasos para Twilio + WhatsApp

1. **Registrarte**
   - [twilio.com](https://www.twilio.com) → Sign up.
   - En el trial te dan un número de prueba y créditos.

2. **Activar WhatsApp**
   - En Twilio Console: **Messaging** → **Try it out** → **Send a WhatsApp message**.
   - Sigue los pasos para usar el sandbox de WhatsApp (en pruebas solo envías a números que hayas autorizado en el sandbox).

3. **Para producción**
   - Solicitar **WhatsApp Business API** desde Twilio (o desde Meta).
   - Twilio te guía; suele ser más rápido que ir solo por Meta.

4. **Qué necesitas en la app**
   - **Account SID**, **Auth Token** y el **número de WhatsApp** (o número Twilio asociado a WhatsApp).
   - No "descargas" una app: usas la API de Twilio desde tu backend/Edge Function.

### Alternativa: WhatsApp Business API directo (Meta)

- [business.whatsapp.com](https://business.whatsapp.com) / Meta for Developers.
- Proceso de verificación de negocio más largo; mejor cuando ya tengas volumen y quieras la cuenta oficial de negocio.

---

## 3. Dónde guardar las claves (API Keys)

- **Nunca** en el frontend (HTML/JS público).
- En **Supabase**: **Project Settings** → **Edge Functions** → **Secrets** (o **Settings** → **API** / **Secrets** según versión).
  - Para Resend: nombre **`RESEND_API_KEY`**, valor = tu clave (ej. `re_xxxx...`).
  - Ejemplo WhatsApp (más adelante): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`.

Desde una **Edge Function** de Supabase lees esos secretos y llamas a Resend o Twilio por HTTPS.

### Configurar la clave de Resend ya

1. Dashboard Supabase → tu proyecto → **Project Settings** → **Edge Functions**.
2. En **Secrets** → **Add secret** → Name: `RESEND_API_KEY`, Value: tu clave de Resend.
3. Despliega la función `send-email` (ver `supabase/functions/send-email/README.md`).

---

## 4. Resumen rápido

| Qué quieres | Servicio a registrar | Qué obtienes |
|-------------|----------------------|--------------|
| **Email (notificaciones, restablecer contraseña)** | **Resend** o **SendGrid** | API Key; 100 emails/día gratis |
| **WhatsApp (alertas, recordatorios)** | **Twilio** | Account SID, Auth Token, número WhatsApp (trial y luego pago por mensaje) |

No hace falta "descargar" apps en el ordenador: te registras en la web, obtienes las claves y las usas desde el backend (por ejemplo Supabase Edge Functions). Si quieres, el siguiente paso puede ser un ejemplo de Edge Function que envíe un correo con Resend y otro que envíe un WhatsApp con Twilio.
