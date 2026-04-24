# DIAGNÓSTICO COMPLETO - FLUJO ERP SSEPI

**Fecha:** 2026-04-23  
**Análisis:** Flujo operativo, conexiones entre módulos, y puntos de falla

---

## 1. FLUJO IDEAL (Según especificación)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUJO OPERATIVO COMPLETO                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. VENTAS (Recepción)                                                  │
│     └─→ Cliente + Falla + Departamento → Folio SP-E/SP-M/SP-A          │
│         └─→ Crea orden en Taller/Motores/Automatización                │
│                                                                         │
│  2. DIAGNÓSTICO (Departamentos Técnicos)                                │
│     └─→ Recibe folio → Diagnóstico → Lista Materiales                  │
│         └─→ Cruza con Inventario → ¿Hay stock?                         │
│             ├─ SÍ: Reserva material                                    │
│             └─ NO: Genera requisición a Compras                        │
│                                                                         │
│  3. COMPRAS (Costeo)                                                    │
│     └─→ Recibe requisición → Selecciona Proveedor                      │
│         └─→ Suma: Costo Proveedor + Insumos + Mano de Obra             │
│             └─→ Envía cotización a Ventas                              │
│                                                                         │
│  4. AUTORIZACIÓN (El "Gatillo")                                         │
│     └─→ Ventas presenta al Cliente → Botón "Autorizar"                 │
│         ├─→ Compras: Orden de compra física → Cuenta por Pagar         │
│         ├─→ Almacén: Descuenta material reservado                      │
│         └─→ Contabilidad: Registra gasto                               │
│                                                                         │
│  5. EJECUCIÓN (Reparación)                                              │
│     └─→ Material llega → Va directo a Taller/Motores/Auto              │
│         └─→ Técnicos reparan → Marcan "Terminado"                      │
│                                                                         │
│  6. FACTURACIÓN (Cierre)                                                │
│     └─→ Recibe orden terminada → Genera factura → Timbra CFDI          │
│         └─→ Ventas notificado → Entrega al cliente                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FLUJO ACTUAL (Lo que encontré en el código)

### 2.1 VENTAS → TALLERES ✅ CONECTADO
- **Archivo:** `ventas.js` líneas 380-580
- **Funciona:** Crea órdenes en `ordenes_taller`, `ordenes_motores`, `proyectos_automatizacion`
- **Problema:** Verifica duplicados por fecha+cliente+falla pero puede crear órdenes huérfanas si el realtime falla

### 2.2 TALLERES → COMPRAS ⚠️ PARCIAL
- **Archivo:** `taller.js` líneas 1740-1775
- **Funciona:** Crea registro en `compras` con `vinculacion: {tipo: 'taller', id: ordenId}`
- **Problemas identificados:**
  1. Los items de compra se guardan como JSON en `compras.items` pero no hay tabla `compras_items`
  2. No hay reserva de inventario antes de enviar a compras
  3. El estado cambia a "En Espera" pero no hay notificación push a Compras (solo tabla `notificaciones`)

### 2.3 COMPRAS → TALLERES ⚠️ FRÁGIL
- **Archivo:** `compras.js` líneas 486-576
- **Funciona:** Muestra estatus de orden vinculada consultando `ordenes_taller`/`ordenes_motores`/`proyectos_automatizacion`
- **Problemas:**
  1. Query anidado puede fallar si RLS bloquea (`compras.js:537-539`)
  2. No hay botón "Marcar como recibido" que actualice la orden original
  3. El material "llega" pero no se actualiza el inventario automáticamente

### 2.4 TALLER → FACTURACIÓN ❌ ROTO
- **Archivo:** `taller.js` línea 1788 (`_terminarReparacion`)
- **Funciona:** Marca orden como "Reparado"
- **Problema:** No notifica a Facturación directamente. Facturación escucha `estado=eq.Reparado` pero:
  1. Si el estado se setea antes de tiempo, la orden aparece sin costos reales
  2. No hay cálculo automático de costos finales (refacciones + mano de obra + compras)
  3. La tabla `facturas` no tiene vínculo directo con `ordenes_taller` excepto por referencia manual

### 2.5 COMPRAS → CONTABILIDAD ⚠️ SINCRONIZACIÓN
- **Archivo:** `coi-sync-engine.js`
- **Funciona:** Encola jobs en `coi_sync_queue`
- **Problema:** Bridge COI en `127.0.0.1:8765` debe estar corriendo. Si está caído:
  - Pólizas no se sincronizan
  - No hay reintento automático
  - `coi_sync_log` registra error pero no alerta

---

## 3. TABLAS DE BASE DE DATOS - ESTADO ACTUAL

| Tabla | Columnas Clave | ¿Usada correctamente? |
|-------|---------------|----------------------|
| `ventas` | folio, cliente_id, total, estado | ✅ Sí |
| `cotizaciones` | folio, cliente_id, orden_origen_id, estado | ✅ Sí |
| `ordenes_taller` | folio, cliente_nombre, equipo, falla_reportada, estado, compra_vinculada | ✅ Sí |
| `ordenes_motores` | folio, cliente_nombre, motor, falla_reportada, estado | ✅ Sí |
| `proyectos_automatizacion` | folio, cliente, nombre, estado, epic | ✅ Sí |
| `compras` | folio, proveedor, departamento, items (JSON), vinculacion (JSON), estado | ⚠️ JSON sin schema |
| `inventario` | sku, nombre, cantidad, precio_costo, precio_venta, categoria | ⚠️ No hay movimientos transaccionales |
| `contactos` | nombre, email, telefono, empresa, tipo | ✅ Sí |
| `facturas` | folio, cliente_id, orden_id, total, uuid_cfdi | ⚠️ Falta índice en orden_id |
| `notificaciones` | para, tipo, mensaje, leido, fecha | ✅ Sí |
| `parametros_costos` | clave, valor, descripcion, departamento | ✅ Recién actualizado |
| `clientes_tabulador` | cliente_nombre, km_ida, utilidad_factor | ✅ Recién actualizado |

### Tablas Faltantes o Incompletas:
1. **`compras_items`** - Los items están como JSON en `compras.items` → No se pueden consultar individualmente
2. **`movimientos_inventario`** - No hay historial de entradas/salidas
3. **`reservas_material`** - No hay tabla para reservar stock antes de compras
4. **`ordenes_costos`** - No hay tabla que acumule costos reales por orden (compras + refacciones + mano de obra)

---

## 4. PROBLEMAS CRÍTICOS IDENTIFICADOS

### 4.1 Flujo Ventas → Taller
| Problema | Impacto | Solución |
|----------|---------|----------|
| Duplicación de órdenes por concurrencia | Folios duplicados | Usar transacción con lock en `foliador_control` |
| Realtime no refresca vista | Usuario no ve orden creada | Agregar `ORDER BY created_at DESC` en queries |

### 4.2 Flujo Taller → Compras
| Problema | Impacto | Solución |
|----------|---------|----------|
| Items como JSON | No se puede buscar "qué órdenes usan SKU X" | Crear tabla `compras_items` con FK a `compras.id` |
| Sin reserva de inventario | Stock se vende mientras está "reservado" | Crear tabla `reservas_material` con `orden_id, sku, cantidad, fecha_expiracion` |
| Notificaciones sin ACK | Compras no sabe que llegó solicitud | Usar Realtime channel en lugar de solo insert |

### 4.3 Flujo Compras → Almacén
| Problema | Impacto | Solución |
|----------|---------|----------|
| No hay recepción | Material "llega" pero no se registra | Agregar botón "Recibir" en Compras que actualice inventario |
| Sin actualización de costos | Precio real vs estimado difiere | Guardar `costo_real` en `compras_items` al recibir |

### 4.4 Flujo Taller → Facturación
| Problema | Impacto | Solución |
|----------|---------|----------|
| Costos no consolidados | Factura sin costos reales | Crear vista `ordenes_costos_view` que sume: compras + refacciones + mano de obra |
| Estado "Reparado" prematuro | Facturación ve orden sin terminar | Agregar estado intermedio "Por Facturar" |
| Sin timbrado automático | CFDI manual | Integrar API PAC (Facturama/Sat) |

### 4.5 Contabilidad → COI
| Problema | Impacto | Solución |
|----------|---------|----------|
| Bridge offline | Pólizas no se sincronizan | Agregar reintento con backoff exponencial |
| Sin alertas | No se sabe cuándo falla | Webhook a Slack/Email cuando `coi_sync_log.error = true` |

---

## 5. MATRIZ DE CONEXIONES ENTRE MÓDULOS

| De | A | Medio | ¿Funciona? |
|----|---|-------|------------|
| Ventas | Taller | INSERT en `ordenes_taller` | ✅ |
| Ventas | Motores | INSERT en `ordenes_motores` | ✅ |
| Ventas | Automatización | INSERT en `proyectos_automatizacion` | ✅ |
| Taller | Compras | INSERT en `compras` + `notificaciones` | ⚠️ (sin realtime) |
| Motores | Compras | INSERT en `compras` + `notificaciones` | ⚠️ (sin realtime) |
| Automatización | Compras | INSERT en `compras` + `notificaciones` | ⚠️ (sin realtime) |
| Compras | Taller | UPDATE `ordenes_taller.compra_vinculada` | ✅ |
| Taller | Facturación | Estado "Reparado" (polling) | ⚠️ (sin notificación push) |
| Motores | Facturación | Estado "Reparado" (polling) | ⚠️ (sin notificación push) |
| Ventas | COI | `coi_sync_queue` | ⚠️ (bridge puede caer) |
| Compras | COI | `coi_sync_queue` | ⚠️ (bridge puede caer) |
| Facturación | COI | `coi_sync_queue` + CFDI | ⚠️ (bridge puede caer) |

---

## 6. RECOMENDACIONES PRIORIZADAS

### Prioridad 1 (Crítico - Flujo se rompe)
1. **Crear tabla `compras_items`** - Normalizar items de compras
2. **Agregar botón "Recibir" en Compras** - Actualizar inventario al llegar material
3. **Notificaciones Realtime** - Usar channels en lugar de solo insert en `notificaciones`

### Prioridad 2 (Importante - Datos incorrectos)
4. **Tabla `reservas_material`** - Evitar vender stock reservado
5. **Vista `ordenes_costos_view`** - Consolidar costos para facturación
6. **Estado "Por Facturar"** - Separar "Reparado" de "Listo para facturar"

### Prioridad 3 (Deseable - Mejoras)
7. **Reintento COI** - Backoff exponencial cuando bridge cae
8. **Índice en `facturas.orden_id`** - Mejorar performance de consultas
9. **Bitácora de movimientos de inventario** - Auditoría completa

---

## 7. PRÓXIMOS PASOS

1. **Ejecutar SQL de normalización** - Crear `compras_items`, `reservas_material`, `movimientos_inventario`
2. **Actualizar `compras.js`** - Agregar botón "Recibir" con actualización de inventario
3. **Actualizar `taller.js`/`motores.js`** - Usar `reservas_material` antes de enviar a compras
4. **Actualizar `facturacion.js`** - Usar vista de costos consolidados
5. **Agregar Realtime channels** - Para notificaciones Taller→Compras y Taller→Facturación

---

**Fin del diagnóstico**
