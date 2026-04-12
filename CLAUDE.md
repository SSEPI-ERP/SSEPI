# SSEPI — Guía del proyecto

## Modelo de roles y visibilidad

### Roles básicos (solo ven sus módulos, sin análisis ni módulos ajenos)

| Rol | Módulos visibles en nav/panel |
|-----|------------------------------|
| **ventas** | `ventas`, `inventario`, `contactos`, `vacaciones` |
| **administracion** | `compras`, `facturas`, `contabilidad`, `pagos_nomina`, `inventario`, `contactos`, `vacaciones` |
| **taller** | `ordenes_taller`, `inventario`, `vacaciones`, `calculadoras` |
| **motores** | `ordenes_motores`, `inventario`, `vacaciones`, `calculadoras` |
| **automatizacion** | `proyectos_automatizacion`, `inventario`, `vacaciones`, `calculadoras` |

Ningún rol básico ve módulos `analisis_*` ni módulos asignados a otros roles.

### Rol administrador del sistema

- **admin** / **superadmin**: ven TODOS los módulos (operativos + análisis + administración).
- `ROLE_MODULES[rol] === null` equivale a "ve todo".
- RLS en Postgres limita escritura según `role_permissions`.

### Variante ventas_sin_compras

- Nav idéntico a `ventas` (mismo módulos en `ROLE_MODULES`).
- Diferenciación real: en `role_permissions` de BD tiene permisos distintos (sin write en Compras).
- No es "admin lite": en modo Normal se comporta como un rol básico acotado.

### Roles de soporte (compatibilidad)

- **compras**: `compras`, `inventario`, `vacaciones`
- **facturacion**: `ventas`, `compras`, `facturas`, `vacaciones`
- **contabilidad**: ve todo (`null`) — RLS limita escritura

## Modo dual Normal ↔ Admin

Usuarios con modo dual pueden alternar entre:

- **Modo Admin**: ven todo (como admin).
- **Modo Normal**: se comportan como su rol base acotado (sin análisis, sin módulos ajenos).

### Mecanismo

| Componente | Campo / clave | Descripción |
|------------|---------------|-------------|
| **Frontend (nav-by-role.js)** | `DUAL_MODE_USERS[email]` → rol base | Lista hardcodeada de emails con modo dual y su rol base en modo Normal. |
| **Sesión (sessionStorage)** | `ssepi_mode` = `'normal'` \| `'admin'` | Estado actual del toggle. Default: `'admin'`. |
| **Sesión (sessionStorage)** | `ssepi_rol` | Rol efectivo (se actualiza al cambiar modo). |
| **Migración legacy** | `ssepi_norberto_empleado` → `ssepi_mode` | La clave antigua se migra automáticamente a la nueva. |
| **Futuro (BD)** | `users.modo_dual` (boolean) | Pendiente: reemplazará la lista hardcodeada. |
| **Futuro (BD)** | `users.rol_normal` (text) | Pendiente: reemplazará el valor en `DUAL_MODE_USERS`. |

### Flujo del toggle

1. Al cargar la página, `runWhenReady()` obtiene el perfil del usuario.
2. Si `isDualModeUser(profile)` devuelve `true`, se inyecta el botón toggle.
3. El botón cambia `sessionStorage.ssepi_mode` y recalcula el rol efectivo vía `getEffectiveRol()`.
4. En modo Normal, `getEffectiveRol()` devuelve el rol base (ej. `automatizacion`); en modo Admin, devuelve `admin`.
5. `applyNavByRoleFromCache()` oculta/muestra elementos según el rol efectivo.

### Agregar un nuevo usuario con modo dual

1. Agregar el email y rol base al mapa `DUAL_MODE_USERS` en `js/core/nav-by-role.js`.
2. (Futuro) Insertar en `public.users` con `modo_dual = true` y `rol_normal = '<rol>'`.

## Flujo comercial

- En Ventas, el paso 1 del cerebro crea la orden/proyecto con folio según departamento (SP-E / SP-M / SP-A).
- La cotización queda vinculada (origen + orden_origen_id).
- Taller/Motores/Automatización operan en sus módulos; la entrada comercial prioritaria es desde Ventas.
- Administración no tiene orden de área propia.

## COI / SSEPI-NEXT

- Flujo COI es salida: SSEPI → COI vía cola/bridge. No asumir importación masiva COI → SSEPI.
- SSEPI-NEXT / Electron es complemento (escritorio/bridge/COI local). El ERP web es el sistema principal.

## Seguridad

- Anon key en front es patrón SPA, pero el repositorio no debe ser público sin control.
- Preferir variables de entorno en build y rotación si hubo exposición.
- Migraciones en producción solo con backup y orden acordado.