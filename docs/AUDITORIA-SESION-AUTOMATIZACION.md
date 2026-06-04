# Auditoría — Sesión Automatización / Ventas / Compras / Facturación

**Para:** Claude (u otro revisor)  
**Repo:** `E:\SSEPI`  
**Modo local:** SSEPI-NEXT en `localhost:3333`, BD `ssepinext/data/ssepi-local.db`  
**Transcript Cursor:** `agent-transcripts/69bdab0f-f364-4251-bebd-405f15f440ca.jsonl`

---

## Instrucciones al auditor

1. Marca cada ítem: **PASS** / **FAIL** / **PARCIAL** / **NO VERIFICADO**
2. Usa los comandos y búsquedas indicadas; no asumas sin leer código o ejecutar scripts
3. Si FAIL: indica archivo, línea aproximada y qué falta

---

## A. Problemas reportados por el usuario → solución esperada

| ID | Problema original | Solución implementada | Cómo verificar | Criterio PASS |
|----|-------------------|----------------------|----------------|---------------|
| A1 | Facturación: KPI “4 pendientes” pero listas vacías | Pendientes sin filtro de mes; KPI usa `_listarPendientesBase()` | Abrir `ssepi_facturacion.html`, Ctrl+F5 | KPI pendientes ≈ cantidad en columna “Pendientes de Facturar” |
| A2 | Facturas no aparecen (FAC demo) | `facturasService` + seed demo; emitidas filtradas solo por fecha | Tras `node verify-orden-demo.mjs`; Facturación con fechas may–jun 2026 | `verify` imprime OK FAC-A-DEMO-01; emitidas visibles si rango incluye mayo |
| A3 | Compras: proveedor solo dropdown, no por material | `input`+`datalist` arriba; columna Proveedor por fila si personalizada/Auto | `compras.js?v=10`, modal editar PO-A-DEMO-01, tipo Personalizada | Columna Proveedor visible; se puede escribir proveedor |
| A4 | Tipo “Personalizada” no hacía nada | `_guardarComprasSegmentadasPorProveedor` crea N OC si N proveedores | Código + guardar 2 filas con proveedores distintos (orden nueva) | 2 folios distintos insertados en `local_compras` |
| A5 | Ventas: consola `value "undefined"` paso 2 / tablas costos | Defaults en inputs; `_parametrosCostosConDefaults`; `Number()` en HTML | Editar COT-A-DEMO-01 paso 2; botón tablas costos; consola F12 | Sin errores `cannot be parsed` |
| A6 | `GET gastos_fijos` 404 | Stub `[]` en `offline-proxy.mjs` y `proxy.mjs` | Network tab al abrir tablas costos | 200 o `[]`, no 404 |
| A7 | Ventas creaba órdenes sin cliente/datos | Validación `clienteId` + contacto; no compra preregistro en Auto | Paso 1 wizard sin cliente → toast; dept Automatización sin CMP- | No inserta orden con “Cliente” vacío |
| A8 | Materiales en Ventas no sumaban varias OC | `_fetchTotalMaterialesCompraProyecto` suma todas las compras vinculadas | Grep + 2 compras mismo `vinculacion.id` | Suma de totales/items |

---

## B. Fases del plan (0–6) — checklist técnico

| Fase | Entregable | Archivos clave | Verificación código |
|------|------------|----------------|---------------------|
| 0 | Orden demo única vinculada | `ssepinext/seed-orden-automatizacion-unica.mjs`, `verify-orden-demo.mjs` | `node verify-orden-demo.mjs` → 5 líneas OK |
| 1 | Import servicios Ventas → Auto/Soporte | `panel/js/modules/servicios.js`, `ventas.js` | Buscar sync/import desde cotización o cerebro |
| 2 | Horas jerarquía | `panel/js/core/horas-jerarquia.js` | `node test-fases-automatizacion.mjs` → OK horas |
| 4 | Tabla costos Excel Ventas admin | `panel/js/core/ventas-costo-desglose.js`, `ventas.js` | `renderDesgloseTableHTML`, `buildDesgloseDesdeFuentes` |
| 5 | BOM por categoría Auto | `servicios.js` | Secciones BOM/categoría en módulo |
| 6 | PDFs + permisos costos | `pdf-generator.js`, `cost-visibility.js` | PDF sin viáticos públicos; `buildConceptosPDFPublicos` |

---

## C. Archivos nuevos (deben existir)

```
panel/js/core/horas-jerarquia.js
panel/js/core/ventas-costo-desglose.js
panel/js/core/hidden-profiles.js
panel/js/core/ssepi-runtime/cost-visibility.js
panel/js/core/ocr-cleaner.js
ssepinext/seed-orden-automatizacion-unica.mjs
ssepinext/verify-orden-demo.mjs
ssepinext/test-fases-automatizacion.mjs
reiniciar-ssepi-fuerte.bat
docs/AUDITORIA-SESION-AUTOMATIZACION.md
```

---

## D. Archivos modificados críticos (cache bust)

| Página | Script | Versión esperada |
|--------|--------|------------------|
| `panel/pages/ssepi_ventas.html` | `ventas.js` | `?v=10` |
| `panel/pages/ssepi_compras.html` | `compras.js` | `?v=10` |
| `panel/pages/ssepi_facturacion.html` | `facturacion.js` | `?v=4` |
| ambos | `pdf-generator.js` | `?v=6` |

---

## E. Funciones que DEBEN existir (grep en repo)

```text
panel/js/modules/facturacion.js     → function _listarPendientesBase
panel/js/modules/facturacion.js     → pendientes sin filter fecha en _aplicarFiltros (solo emitidas)
panel/js/modules/compras.js         → _leerItemsDesdeFormulario
panel/js/modules/compras.js         → _guardarComprasSegmentadasPorProveedor
panel/js/modules/compras.js         → _esOrdenPorProveedorEnTabla
panel/js/modules/compras.js         → _celdaProveedorTd
panel/js/modules/ventas.js          → _parametrosCostosConDefaults
panel/js/modules/ventas.js          → _fetchTotalMaterialesCompraProyecto (suma múltiples rows)
panel/js/modules/ventas.js          → !esAuto antes de _crearCompraVinculada en paso 1
ssepinext/offline-proxy.mjs         → gastos_fijos return []
```

---

## F. Datos demo esperados (después de seed)

| Entidad | Folio | Notas |
|---------|-------|-------|
| Proyecto Auto | `SP-A-DEMO-01` | estado completado, ~3 actividades, materiales |
| Compra | `PO-A-DEMO-01` | items en JSON `compra.items`, total ~29790 |
| Cotización | `COT-A-DEMO-01` | `orden_origen_id` → proyecto, `costo_desglose` presente |
| Factura | `FAC-A-DEMO-01` | `venta_id` → cotización |
| Cliente | ANGUIPLAST | En proyecto/cotización |

**Se conserva:** órdenes Laboratorio `SP-E*` en `local_ordenes_taller`  
**Se elimina (seed):** otras compras/cotizaciones/facturas/proyectos Auto no demo

Comandos:

```powershell
cd E:\SSEPI\ssepinext
node seed-orden-automatizacion-unica.mjs
node verify-orden-demo.mjs
node test-fases-automatizacion.mjs
```

Salida esperada `verify-orden-demo.mjs`: todas las líneas `OK:` sin `FAIL`.

---

## G. Compras — comportamiento sencilla vs personalizada

| Aspecto | Sencilla | Personalizada |
|---------|----------|---------------|
| Proveedor cabecera | Obligatorio/recomendado para toda la OC | Default si fila vacía |
| Columna Proveedor en tabla | Oculta (excepto dept. Automatización) | Visible |
| Al guardar (nueva) | 1 registro `local_compras` | Si ≥2 proveedores distintos → N inserts |
| Al editar existente | 1 update | NO segmenta (`compraId` bloquea segmentación) |
| Items en BD local | `items` array en JSON, no tabla `compras_items` | Igual |

**UI:** `panel/pages/ssepi_compras.html` líneas ~246–305 (`ordenTipoSelect`, hint, `col-proveedor-item`).

---

## H. reiniciar-ssepi.bat V15 — flujo

| Fase | Paso | Acción |
|------|------|--------|
| A | A1–A2 | Mata CMD SSEPI, node, cloudflared, puertos 3333/3443 |
| B | B1–B3 | BD íntegra, usuarios, contactos idempotente |
| C | C1–C7 | Maestros (Pac, inventario, BOM, tabulador 50…) |
| D | D1–D7 | Reportes ERP, contactos, pipeline, proyectos ejemplo |
| E | E1–E3 | **seed-orden-automatizacion-unica**, verify, test-fases |
| F | F1–F2 | seed-all-check, verificar-importacion |
| G | G1–G5 | Server + Chrome + túnel |

`reiniciar-ssepi-fuerte.bat` = solo matar + server + túnel (sin import ni limpieza).

---

## I. Pruebas manuales UI (post Ctrl+F5)

1. **Facturación** — Pendientes ≥1 si hay proyectos completados; búsqueda/filtro no vacía lista con KPI>0  
2. **Compras** — Abrir PO-A-DEMO-01; cambiar a Personalizada → columna Proveedor  
3. **Ventas** — Editar COT-A-DEMO-01 → paso 2 → sin errores consola; materiales > 0 si PO cargada  
4. **Ventas paso 1** — Sin cliente → no crea orden  
5. **PDF cotización** — Generar; tipografía legible; sin líneas duplicadas descripción/specs  

---

## J. Conocido PARCIAL / no hecho

| Ítem | Estado |
|------|--------|
| Tabla `gastos_fijos` con datos en SQLite local | PARCIAL — solo stub HTTP `[]` |
| Emitidas en Facturación sin filtro mes por defecto | PARCIAL — usuario debe ampliar fechas |
| Commit git de todos los cambios | NO HECHO — a solicitud del usuario |
| Segmentar OC al **editar** orden existente | NO — solo al crear nueva |

---

## K. Comandos rápidos para el auditor

```powershell
cd E:\SSEPI
rg "_listarPendientesBase|_guardarComprasSegmentadas|_fetchTotalMaterialesCompraProyecto" panel/js ssepinext
rg "gastos_fijos" ssepinext/offline-proxy.mjs ssepinext/proxy.mjs
cd E:\SSEPI\ssepinext
node verify-orden-demo.mjs
node test-fases-automatizacion.mjs
```

---

## L. Resumen ejecutivo para Claude

**Se hizo:** flujo Auto/Ventas/Compras/Facturación con orden demo, compras multi-proveedor, fixes facturación KPI/lista, fixes consola Ventas, validación cliente, bat reorganizado con limpieza demo.  
**No se hizo del todo:** gastos_fijos persistentes en local, UX facturación emitidas sin filtro mes, commit.  
**Riesgo:** `seed-orden-automatizacion-unica.mjs` es destructivo para datos Auto no demo — intencional.

---

*Generado para auditoría cruzada. Actualizar si cambian folios demo o versiones `?v=`.*
