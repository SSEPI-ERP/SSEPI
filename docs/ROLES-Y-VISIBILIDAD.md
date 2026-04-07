# SSEPI — Quién es admin, quién es usuario y qué puede ver cada uno

## 1. Administradores (rol `admin`)

Estos correos tienen **rol admin** en `public.users`. Ven **todo** el menú y todas las tarjetas del panel; pueden gestionar usuarios y configuración.

| Correo | Nombre |
|--------|--------|
| automatizacion@ssepi.org | Automatización |
| administracion@ssepi.org | Administración |
| ventas@ssepi.org | Ventas Admin |
| electronica@ssepi.org | Electrónica Admin |

**Qué ven:** Laboratorio, Motores, Automatización, Proyectos, Ventas, Compras, Inventario, Contactos, Facturación, Contabilidad, Análisis, Sitio Web.

---

## 2. Usuarios (roles no admin)

Son cuentas con rol distinto de `admin`. Solo ven los módulos para los que su rol tiene permiso de **lectura** en `role_permissions`.

| Correo | Nombre | Rol | Qué ve |
|--------|--------|-----|--------|
| electronica.ssepi@gmail.com | Electrónica SSEPI | **ventas_sin_compras** | Ventas, Inventario, Contactos, Laboratorio (lectura), Motores (lectura), Automatización/Proyectos (lectura), Análisis. **No ve Compras.** |
| ivang.ssepi@gmail.com | Ivan (Automatización) | **automatizacion** | Automatización, Proyectos, Inventario. **No ve Compras.** |
| ventas1@ssepi.org | Ventas 1 | ventas | **Solo Ventas, Inventario, Contactos.** |

---

## 3. Qué puede ver cada ROL en el menú y en el panel

La visibilidad se decide por **rol** (no por correo). Si creas más usuarios con el mismo rol, verán lo mismo.

| Rol | Módulos que VE en el menú / panel |
|-----|-----------------------------------|
| **admin** | Todo: Laboratorio, Motores, Automatización, Proyectos, Ventas, Compras, Inventario, Contactos, Facturación, Contabilidad, Análisis, Sitio Web. |
| **ventas** | **Solo Ventas, Inventario, Contactos** (y cotizaciones/clientes para su flujo). No ve: Compras, Laboratorio, Motores, Automatización/Proyectos, Facturación, Contabilidad, Sitio Web. |
| **ventas_sin_compras** | Igual que ventas pero **sin Compras**: Ventas, Inventario, Contactos, Laboratorio (lectura), Motores (lectura), Automatización/Proyectos (lectura), Análisis. No ve: Compras, Facturación, Contabilidad, Sitio Web. |
| **taller** | **Solo Laboratorio e Inventario.** No ve: Motores, Compras, Ventas, Contactos, Facturación, Contabilidad, Análisis, Automatización/Proyectos, Sitio Web. |
| **motores** | Laboratorio, Motores, Compras, Inventario. No ve: Ventas, Contactos, Facturación, Contabilidad, Análisis, Automatización/Proyectos, Sitio Web. |
| **compras** | Compras, Inventario. No ve el resto. |
| **automatizacion** | **Automatización, Proyectos (Soporte en planta), Inventario.** No ve Compras ni el resto. |
| **facturacion** | Ventas (lectura), Compras (lectura), Facturación, Análisis. No ve: Laboratorio, Motores, Automatización/Proyectos, Inventario, Contactos, Contabilidad, Sitio Web. |
| **contabilidad** | Todo en solo lectura (permiso `*` read). |

**Sitio Web (módulo `paginas`):** por defecto solo lo ve **admin**.

---

## 4. Cómo aplicar los cambios de permisos

Ejecuta en **Supabase → SQL Editor** (en este orden):

1. `scripts/migrations/ajuste-permisos-taller-automatizacion-ventas.sql`
2. `scripts/migrations/permisos-modulos-por-rol.sql`

El segundo script:
- Da **SELECT** en `role_permissions` a `authenticated` para que la app pueda leer permisos.
- Asegura que **automatizacion** tenga proyectos_automatizacion e inventario.
- Deja a **ventas** solo con Ventas, Inventario, Contactos (quita Compras, ordenes_taller, ordenes_motores, proyectos_automatizacion).
- Deja a **taller** solo con ordenes_taller e inventario.

Luego puedes volver a ejecutar `npm run create-users` para que el perfil de electronica.ssepi quede con `ventas_sin_compras`; si ya ejecutaste el SQL, el UPDATE del script ya habrá cambiado su rol.

---

## 5. Resumen rápido

- **Admin** = los 4 correos @ssepi.org. Ven todo.
- **Taller** (usuario taller) = solo **Laboratorio** e **Inventario**.
- **Ivan** (automatizacion) = **Automatización, Proyectos, Inventario**. No ve Compras.
- **electronica.ssepi@gmail.com** (ventas_sin_compras) = como ventas pero **sin Compras**.
- **ventas1@ssepi.org** (ventas) = **solo Ventas, Inventario, Contactos.**
- Contraseña provisional: `Ssepi2025!`; cambiarla en **Configuración → Cambiar contraseña**.

**Análisis Laboratorio:** todos los usuarios con permiso `ordenes_taller` pueden ver la página y usar **Vista previa gráfica** y **Vista previa tabla**. Solo **admin** puede usar **Descargar reporte** (PDF).
