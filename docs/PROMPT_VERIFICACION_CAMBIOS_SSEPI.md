# Prompt de verificación — Cambios SSEPI (SSEPI-NEXT-LOCAL)

Copia el bloque **“Prompt actualizado (mayo 2026)”** al final de este archivo y pégalo en Claude para auditar el repo completo.

---

## Prompt actualizado (mayo 2026) — contactos tabulador, suministros historial, servicios Ventas

```
# Verificación SSEPI-NEXT-LOCAL — cambios realizados vs pendientes

Modo: SSEPI-NEXT-LOCAL (localhost:3333), BD ssepinext/data/ssepi-local.db.
Lee archivos reales; no asumas. Reporta ✅/❌ por ítem.

## 0. COMANDOS DE DATOS (ejecutar antes de probar UI)

cd ssepinext
node sync-tabulador-direcciones-contactos.mjs
node seed-tabulador-50.mjs
node repair-contactos-empresa-grupos.mjs

Ctrl+F5 en Contactos (?v=4), Suministros (?v=4), Ventas (wizard servicios).

## 1. CONTACTOS — RFC y dirección fiscal del Excel tabulador

### 1.1 Datos enriquecidos (33 empresas con dirección)
Archivos:
- ssepinext/data/tabulador-direcciones-contacto.mjs — TABULADOR_DIRECCIONES (RFC, direccion, contacto, km)
- ssepinext/sync-tabulador-direcciones-contactos.mjs — escribe local_clientes_tabulador + local_contactos (ficha empresa)

Verificar en BD o UI Contactos (empresa BADER TABACHINES, ANGUIPLAST, etc.):
- RFC visible en panel (ej. BAD880303CC3)
- Dirección fiscal en campo Dirección
- Puesto/referencia de contacto (ej. Mantenimiento, Ing. Compras)

### 1.2 UI enriquecimiento en vivo
panel/js/modules/contactos.js:
- _getTabuladorEnriquecimiento() + _aplicarEnriquecimientoTabulador() al cargar lista
- Merge desde clientes_tabulador si contacto no tiene rfc/direccion

### 1.3 Import Excel tabulador (columnas EMPRESA, DIRECCIÓN FISCAL, RFC, CONTACTO)
- _isTabuladorCotizacionSheet / _rowFromTabuladorSheet
- Duplicados: actualiza RFC/dirección en lugar de solo omitir (mensaje "X actualizados")

Prueba: Importar hoja tabulador → BADER debe tener dirección "Blvd. J. Clouthier, León, GTO".

### 1.4 Agrupación Pac (empresas vs personas)
- contacto_solo sin empresa=nombre
- Filtro empresa solo tipo_ficha empresa / contacto_empresa
- repair-contactos-empresa-grupos.mjs

## 2. VENTAS — Selector de servicios (sistemas)

panel/css/modules/ventas.css:
- .wizard-servicios-list → grid 2 columnas en viewport ≥900px
- Checkboxes 18px, hover en filas, max-height ~55vh

panel/js/modules/ventas.js:
- #wizardServiciosAutoWrap con .wizard-servicio-row / .wizard-servicio-text

Prueba: Dept Automatización → lista legible en 2 columnas en pantalla ancha; scroll si >17 servicios.

## 3. SUMINISTROS — Historial de órdenes

panel/pages/ssepi_suministros.html + panel/js/modules/suministros.js?v=4:
- Barra filtros: fecha desde/hasta, estado
- Solo admin: vendedor, comprador, automatización (authService.getUsersByRol)
- Tabla: columna Creado por, PDF vista previa + descargar por fila
- Guardar cotización incluye creado_por_id, creado_por_nombre, creado_por_rol

Prueba admin: filtros visibles; filtrar por fechas reduce filas.
Prueba rol ventas: filtros de usuario ocultos; PDF en historial funciona.

## 4. TABULADOR 50 + VENTAS DROPDOWN

ssepinext/seed-tabulador-50.mjs — 50 clientes
ventas.js _loadContactos() — clientes_tabulador oficial
Comando: node seed-tabulador-50.mjs --replace-contactos

## 5. LAB ORDENES — Ocultar en otros módulos

panel/js/core/ssepi-runtime/lab-order-filter.js
Aplicado: ventas.js, compras.js, facturacion.js (NO taller.js)

## 6. INVENTARIO TALLER ~98 componentes

taller.js _loadInventory: departamento taller + tipo_inventario electronica
node ssepinext/seed-inventario.mjs

## 7. MULTI-SELECT EQUIPOS Y SERVICIOS (Ventas paso 1)

ventas.js: CATALOGO_EQUIPOS_LAB, wizardEquiposWrap, wizardServiciosAutoWrap, validación y persistencia equipos[] / servicios_automatizacion[]

## 8. CHECKLIST GREP

grep TABULADOR_DIRECCIONES ssepinext/data/tabulador-direcciones-contacto.mjs
grep sync-tabulador-direcciones-contactos ssepinext/
grep _isTabuladorCotizacionSheet panel/js/modules/contactos.js
grep historial-filtros-bar panel/pages/ssepi_suministros.html
grep wizard-servicios-list grid panel/css/modules/ventas.css
grep lab-order-filter panel/js/modules/ventas.js

Entrega: tabla ✅/❌ por sección, comandos ejecutados, capturas sugeridas (contacto con RFC+dirección, historial suministros con PDF, servicios 2 cols).
```

---

## Historial de secciones anteriores

Ver commits / conversación para: SyntaxError ventas, header Javier, tabulador 50, multi-select equipos/servicios, agrupación Pac contactos.

*Última actualización: direcciones tabulador → contactos, historial suministros con filtros/PDF, grid servicios Ventas.*
