# Auditoría Integridad + COI — SSEPI

**Fecha:** 2026-04-28  
**Commits:** `5fc3cfa` (base) → `2817780` (completar reglas) → `71cc240` (conectar módulos) → `emergencia-setup-integridad-coi.sql` aplicado exitosamente en Supabase

---

## Estado por módulo (post-cambios)

| Módulo | SSEPIStateMachine | Cuarentena | Punto de no retorno | Badges | orden_historial | Timeline | COI |
|---|---|---|---|---|---|---|---|
| **ventas.js** | SÍ | SÍ | **SÍ** | SÍ | SÍ | SÍ | Encola |
| **taller.js** | SÍ | SÍ | SÍ | SÍ | SÍ | Pendiente UI | Encola vía ventas |
| **motores.js** | SÍ | SÍ | SÍ | SÍ | SÍ | Pendiente UI | Encola vía ventas |
| **compras.js** | SÍ | **SÍ** | N/A | **SÍ** | SÍ | N/A | Encola |
| **facturacion.js** | SÍ | **SÍ** | N/A | **SÍ** | **SÍ** | N/A | Encola |
| **servicios.js** (auto) | SÍ | **SÍ** | N/A | **SÍ** | **SÍ** | N/A | **Trigger SQL** |

---

## Cambios realizados en esta sesión

### SQL
1. **`scripts/migrations/fix-facturas-integridad.sql`**
   - Agrega `bloqueo_contable` a `facturas`.
   - Agrega triggers anti-delete y cuarentena a `facturas`.
   - Corrige FK `facturas.venta_id` → apunta a `ventas` (antes apuntaba a `cotizaciones`, violando integridad cuando JS asignaba ID de venta).
   - Agrega/verifica triggers en `proyectos_automatizacion`.

2. **`scripts/migrations/fix-eventos-coi-rls.sql`**
   - RLS de `eventos_contables_coi` restringido a `admin`/`superadmin`/`contabilidad` (antes cualquier `authenticated`).

3. **`scripts/migrations/fix-compras-coi-criterio.sql`**
   - Unifica criterio de compras: trigger SQL dispara en `estado >= 4` (igual que frontend).
   - Agrega `proyectos_automatizacion` a `fn_generar_evento_coi` cuando pasa a `completado`.

### Frontend
- **ventas.js:3378** — `_eliminarVenta` ahora valida `puedeEliminar` (punto de no retorno) además de cuarentena.
- **compras.js** — Badges cuarentena en kanban/lista. `_recibirCompra` bloquea si la compra está en cuarentena.
- **facturacion.js** — `_timbrarFactura` bloquea si la orden está en cuarentena. Escribe en `orden_historial` al timbrar. Badges cuarentena en cards/lista. Botón Facturar deshabilitado en cuarentena.
- **servicios.js** — Valida cuarentena antes de guardar. Escribe en `orden_historial` al crear/cambiar estado. Badges cuarentena en kanban/lista. Listener realtime de `orden_historial`.
- **motores.js** — `_showErrorModal` consistente con taller.js (reemplaza `alert()` crudo).

---

## Hallazgos críticos corregidos

| Hallazgo | Estado |
|---|---|
| `ventas.js` no validaba punto de no retorno en cancelación | **CORREGIDO** |
| `facturacion.js` timbraba sin validar cuarentena | **CORREGIDO** |
| `servicios.js` completamente desconectado del ecosistema | **CORREGIDO** |
| `compras.js` no validaba cuarentena ni mostraba badges | **CORREGIDO** |
| `facturas.venta_id` FK apuntaba a `cotizaciones` pero JS asignaba IDs de `ventas` | **CORREGIDO** |
| `eventos_contables_coi` RLS demasiado permisivo | **CORREGIDO** |
| Discrepancia compras: frontend `estado>=4` vs SQL `estado=5` | **CORREGIDO** |
| `motores.js` usaba `alert()` crudo en lugar de modal | **CORREGIDO** |

---

## Hallazgos pendientes / próxima sesión

| # | Tarea | Prioridad |
|---|---|---|
| 1 | **Timeline en modal de Taller/Motores** — Renderizar `SSEPIStateMachine.renderTimelineHTML` en el modal de detalle de orden (wsModal). | Media |
| 2 | **Eliminar proyecto en Automatización** — Agregar botón eliminar en kanban/lista de servicios.js con validaciones cuarentena + punto de no retorno. | Media |
| 3 | **Validar cuarentena de orden origen en Compras** — `_recibirCompra` debería validar también cuarentena de la orden vinculada (taller/motor/proyecto), no solo de la compra. | Media |
| 4 | **Habilitar realtime `coi_sync_queue`** — En Supabase, ejecutar `ALTER PUBLICATION supabase_realtime ADD TABLE public.coi_sync_queue;` para que el dashboard COI se actualice en vivo. | Baja |
| 5 | **Consumir `eventos_contables_coi`** — Decidir si se mantiene como log de auditoría o se conecta un worker. Actualmente nadie la consume. | Baja |
| 6 | **Triggers SQL para nomina/bancos** — Si se desea que `eventos_contables_coi` cubra todos los eventos, agregar triggers para `pagos_nomina` y `movimientos_banco`. | Baja |

---

## Migraciones SQL ejecutadas en Supabase

✅ **`scripts/migrations/emergencia-setup-integridad-coi.sql`** — Aplicado exitosamente. Contiene todo:
- `orden_historial`, `estado_pipeline_unificado`, `eventos_contables_coi`
- Columnas `estatus_actual` y `bloqueo_contable` en 7 tablas
- Triggers anti-delete (7 tablas), cuarentena (7 tablas), COI (4 tablas)
- RLS restringido en `eventos_contables_coi`
- FK `facturas.venta_id` corregida → `ventas`

Las migraciones `fix-*.sql` ya están incluidas en este script consolidado; **no es necesario ejecutarlas por separado**.

---

## Verificación rápida post-deploy

1. Crear orden en Taller → guardar paso 1 → debe auto-avanzar a Diagnóstico.
2. Activar cuarentena en SQL: `UPDATE ordenes_taller SET bloqueo_contable = TRUE WHERE id = '...';`
3. Intentar eliminar desde Taller/Motores → debe bloquear con modal.
4. Intentar timbrar desde Facturación → debe bloquear si orden en cuarentena.
5. Recibir compra desde Compras → debe bloquear si compra en cuarentena.
6. Cancelar venta/cotización desde Ventas → debe bloquear si cuarentena o punto de no retorno.
7. Guardar proyecto en Automatización → debe bloquear si cuarentena.

---

## Archivos modificados en esta sesión

- `panel/js/modules/ventas.js`
- `panel/js/modules/compras.js`
- `panel/js/modules/facturacion.js`
- `panel/js/modules/servicios.js`
- `panel/js/modules/motores.js`
- `panel/js/core/state-machine.js`
- `panel/css/modules/ventas.css`
- `scripts/migrations/fix-facturas-integridad.sql` (nuevo)
- `scripts/migrations/fix-eventos-coi-rls.sql` (nuevo)
- `scripts/migrations/fix-compras-coi-criterio.sql` (nuevo)
