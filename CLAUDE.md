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