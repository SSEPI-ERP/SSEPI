# Funciones de correo en el ERP SSEPI

Listado de envíos y recepción de correo integrados con Resend (y Supabase Auth donde aplica).

---

## 1. Cambio de contraseña (Supabase Auth)

- **Qué hace:** El usuario recibe un correo con enlace para restablecer contraseña.
- **Quién lo dispara:** Configurador de usuarios → "Solicitar cambio de contraseña por correo", o flujo de "Olvidé mi contraseña".
- **Quién envía:** Supabase (configuración en Authentication → Email Templates). No usa Resend salvo que configures Supabase para enviar con SMTP/Resend.

---

## 2. Cotización enviada al cliente (Ventas)

- **Qué hace:** Al guardar y enviar una cotización, se manda un correo al cliente con folio, total y mensaje breve.
- **Dónde:** Módulo Ventas → al enviar cotización (si el cliente tiene email y está cargado `email-service.js`).
- **Resend:** Sí, vía Edge Function `send-email`.

---

## 3. Nueva orden de compra (Compras)

- **Qué hace:** Al crear una orden de compra, se envía un correo de confirmación al usuario que la creó (perfil del usuario logueado).
- **Dónde:** Módulo Compras → al crear orden (si existe `emailService` y el perfil tiene email).
- **Resend:** Sí, vía Edge Function `send-email`.

---

## 4. Entrega final / compra completada (Compras)

- **Qué hace:** Aviso por correo cuando una compra pasa a estado "Completada" o "Entregado".
- **Estado:** Pendiente de enlazar al cambio de estado en Compras (cuando se implemente el flujo de actualizar estado a completado, se puede llamar a `emailService.send` con el mismo patrón que arriba).

---

## 5. Correos recibidos (cliente te escribe) – Inbound

- **Qué hace:** Cuando un cliente envía un correo a tu dirección de recepción (Resend Inbound), el webhook guarda el correo en la tabla `inbound_emails` y puedes mostrarlo en el ERP y/o mostrar una notificación.
- **Dónde:** Edge Function `receive-email` (webhook de Resend). En el frontend: leer `inbound_emails` (por ejemplo en Panel o en un panel "Correos recibidos") y opcionalmente marcar como leído.
- **Requisitos:** Dominio configurado en Resend para Receiving e Inbound, y webhook apuntando a `receive-email`.

---

## 6. Otras funciones que se pueden agregar

- **Recordatorio de pago pendiente:** Job o trigger que revise ventas/cotizaciones con estatus "Pendiente" y envíe un correo al cliente (por ejemplo X días después).
- **Aviso de cotización pendiente de autorización:** Cuando se crea una cotización en estado "pendiente_autorizacion_ventas", enviar correo a Compras o a un correo configurado.
- **Confirmación de entrega a cliente:** Cuando una orden/entrega se marca como entregada, enviar correo al cliente con detalle.
- **Resumen diario o semanal por correo:** Envío de un resumen (ventas, compras, tareas) a un correo de administración.

---

## Resumen

| Función                         | Módulo / Origen      | Estado        | Usa Resend |
|--------------------------------|----------------------|---------------|------------|
| Cambio de contraseña           | Auth / Configurador  | Implementado  | Según config Supabase |
| Cotización enviada al cliente  | Ventas               | Implementado  | Sí         |
| Nueva orden de compra          | Compras              | Implementado  | Sí         |
| Entrega final / compra completada | Compras          | Por enlazar   | Sí (cuando se enlace) |
| Correos recibidos (inbound)    | Webhook Resend       | Backend listo | Sí (receive-email) |
| Recordatorio pago / avisos    | Varios               | Opcional      | Sí         |

Para que los envíos funcionen, la Edge Function `send-email` debe estar desplegada y `RESEND_API_KEY` configurada en Supabase Secrets. Para recibir correos, además hay que ejecutar la migración `add_inbound_emails.sql`, desplegar `receive-email` y configurar el webhook y el dominio en Resend.
