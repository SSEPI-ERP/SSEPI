# Migración BOM Automatización y Auditoría

## Archivos SQL a ejecutar en Supabase

Ejecuta en este orden en el **SQL Editor** de Supabase:

### 1. Tabla de auditoría para import/export
```bash
scripts/migrations/audit-logs-import-export.sql
```
- Agrega columnas a `audit_logs` para registrar import/export
- Crea vista `vw_notificaciones_audit` para notificaciones
- Trigger automático para notificar a admins y Norberto

### 2. Tablas BOM y Servicios de Automatización
```bash
scripts/migrations/crear-tabla-bom-automatizacion.sql
```
- Crea `bom_automatizacion` (Lista de Materiales)
- Crea `servicios_automatizacion` (con desglose planta/oficina)
- RLS configurado para admins

## Plantillas CSV

Las plantillas están en `scripts/templates/`:

| Módulo | Archivo | Columnas principales |
|--------|---------|---------------------|
| Contactos | `contactos_template.csv` | nombre, empresa, email, teléfono |
| Inventario Automatización | `inventario_automatizacion_template.csv` | sku, nombre, categoria, stock, costo |
| Inventario Electrónica | `inventario_electronica_template.csv` | sku, nombre, ubicacion, stock |
| Órdenes de Compra | `ordenes_compra_template.csv` | folio, proveedor, fecha, estado, total |
| Órdenes de Reparación | `ordenes_reparacion_template.csv` | folio, cliente, servicio, estado |
| Órdenes de Venta | `ordenes_venta_template.csv` | folio, cliente, estado, items |
| BOM Automatización | `bom_automatizacion_template.csv` | item, numero_parte, descripcion, categoria, proveedor, precio |
| Gastos de Viaje | `gastos_viaje_template.csv` | cliente, concepto, monto, fecha |
| Fórmulas de Costos | `formulas_costos_template.csv` | area, cliente, concepto, valor |

## Cambios en el Frontend

### Configuración (`pages/ssepi_configuracion.html`)
- Nueva sección "Importar/Exportar Datos"
- Selector de módulos (9 módulos disponibles)
- Botones Exportar CSV / Importar CSV
- Bitácora de auditoría (últimos 7 días)
- Notificaciones automáticas a admins

### Calculadoras (`pages/ssepi_calculadoras.html`)
- Nueva sección "BOM Automatización"
- Tabla de materiales con filtros (categoría, estado)
- KPIs de costos: Total Materiales, Costo Planta, Costo Oficina, Costo Total
- Tabla de Servicios con desglose planta/oficina
- Modales para editar BOM y Servicios

### JavaScript (`js/modules/calculadoras.js`)
- Funciones `loadBOM()`, `loadServicios()`, `renderBOM()`, `renderServicios()`
- Gestión de modales para BOM y Servicios
- Cálculo de desglose de costos (70% planta / 30% oficina)

## Restricciones de Visibilidad

### Módulo Calculadoras
Solo visible para:
- Admin / Superadmin
- Usuarios con modo dual en modo Admin (ej. norbertomoro4@gmail.com)

**Configurado en:** `js/core/nav-by-role.js`
```javascript
function canSeeSpecialModule(rol, moduleName, profile) {
    if (moduleName === 'calculadoras') {
        if (rol === 'admin' || rol === 'superadmin') return true;
        if (profile && isDualModeUser(profile)) {
            if (sessionStorage.getItem('ssepi_mode') === 'admin') return true;
        }
        return false;
    }
    // ...
}
```

### Módulo Configuración
Solo visible para Admin / Superadmin

## Uso: Importar/Exportar

1. Ir a **Configuración** → **Importar/Exportar Datos**
2. Seleccionar módulo desde el dropdown
3. Clic en **Exportar CSV** para descargar datos actuales
4. O hacer clic en **Importar CSV** y seleccionar archivo
5. La acción se registra automáticamente en la bitácora
6. Admins reciben notificación

## Uso: BOM Automatización

1. Ir a **Calculadoras** → Sección **BOM Automatización**
2. Filtrar por categoría o estado
3. Clic en **Nuevo Material** para agregar
4. Editar para modificar precio, proveedor, etc.
5. Ver KPIs de costos desglosados (planta vs oficina)

## Uso: Servicios con Desglose

1. En **Calculadoras** → **Servicios de Automatización**
2. Cada servicio muestra:
   - Costo Planta (mano de obra directa, materiales)
   - Costo Oficina (ingeniería, administración, viáticos)
   - Costo Total = Planta + Oficina

## Próximos Pasos (Futuro)

- [ ] Migrar `DUAL_MODE_USERS` de hardcodeado a BD (`users.modo_dual`, `users.rol_normal`)
- [ ] Agregar campo `tipo_costo` en BOM para desglose real planta/oficina
- [ ] Integrar BOM con calculadora de Automatización
- [ ] Exportar BOM a Excel con formato de cotización
