# Prompt de verificación — Cambios SSEPI (SSEPI-NEXT-LOCAL)

Copia el bloque **“Prompt actualizado (mayo 2026)”** al final de este archivo y pégalo en Claude para auditar el repo completo.

---

## Prompt actualizado (mayo 2026) — incluye equipos y servicios en Ventas

```
# Verificación SSEPI-NEXT-LOCAL — cambios realizados vs pendientes

Modo: SSEPI-NEXT-LOCAL (localhost:3333), BD ssepinext/data/ssepi-local.db.
Lee archivos reales; no asumas. Reporta ✅/❌ por ítem.

## 1. BUGS ARREGLADOS

### 1.1 Ventas SyntaxError (ventas.js ~268)
Fix: const nombre = ((document.getElementById('wizardBomManualNombre') || {}).value || '').trim();
Verificar: ventasModule carga; wizard paso 1 sin error consola.

### 1.2 Header usuario "Laboratorio" → nombre real
Archivos: ssepinext/users-catalog.mjs (laboratorio1@ssepi.org → Javier)
panel/js/core/auth-service.js (resolveDisplayName, _looksLikeDepartmentLabel)
panel/js/core/user-menu.js, ssepinext/seed-usuarios.mjs
Prueba: logout+login → header "Javier".

## 2. TABULADOR 50 CLIENTES

### 2.1 Seed
ssepinext/seed-tabulador-50.mjs — 50 empresas Excel → local_clientes_tabulador + local_contactos (--replace-contactos)
ssepinext/data/master/clientes_tabulador.json — 50 records
reiniciar-ssepi.bat [3j]: node seed-tabulador-50.mjs --replace-contactos
(NO seed-erp-maestro --replace-contactos ni seed-contactos-manual en [3j])

### 2.2 Ventas dropdown
panel/js/modules/ventas.js _loadContactos() — solo clientes_tabulador (log: Clientes tabulador (oficial): 50)
_renderWizardPaso paso 1 debe llamar await _loadContactos() (no query directa a contactos)

Comando: cd ssepinext && node seed-tabulador-50.mjs --replace-contactos

## 3. NUEVO — Multi-select equipos y servicios (Ventas paso 1)

Archivo principal: panel/js/modules/ventas.js

### 3.1 Constante y helpers (después de tabuladorAutomatizacion)
- CATALOGO_EQUIPOS_LAB = Tablero, HMI, PLC, Servos, Tarjeta Electrónica, Sensores, Chillers, Teach Pencil, Otro
- _deptUsaEquiposMulti(dept) → Laboratorio de Electrónica | Taller Motores
- _deptUsaServiciosMulti(dept) → Automatización | Proyectos | Soporte en planta
- _getWizardEquiposSeleccionados(), _getWizardServiciosSeleccionados()
- _wizardResolverNombreProducto(dept), _wizardResolverServiciosAuto()
- _bindWizardEquiposServiciosEvents(), _restoreWizardMultiSelects(f)

### 3.2 UI paso 1 (_renderWizardPaso1)
- #wizardEquiposWrap — checkboxes multi-select (visible Lab/Motores)
- #wizardEquipoOtroWrap + #wizardEquipoOtro cuando "Otro"
- #wizardServiciosAutoWrap — checkboxes 17 servicios de tabuladorAutomatizacion.servicios
- #wizardServicioAutoWrap contenedor (visible Auto/Proyectos/Soporte)
- #wizardNombreProductoWrap con #wizardNombreProductoVisible (otros deptos)
- #wizardNombreProducto hidden dentro equipos wrap (sync equipos → texto)

### 3.3 Validación (_wizardSiguiente, _guardarCotizacionDesdeWizard)
- Lab/Motores: ≥1 equipo obligatorio
- Auto/Proyectos/Soporte: ≥1 servicio obligatorio
- Otros deptos: texto producto obligatorio (excepto Suministro)

### 3.4 Persistencia (ventasWizardCerebro / paso1Fields)
- equipos: string[]
- servicios_automatizacion: string[]
- servicio_automatizacion: string unido con " | " (compat legacy)
- nombre_producto: equipos unidos ", " o texto libre

### 3.5 Órdenes (_ventasCrearOrdenOperativa)
- Taller SP-E: equipo = equipos seleccionados
- Motores SP-M: motor = equipos seleccionados
- Auto/Proyectos: notas_generales incluye "Servicios: ..."
- Soporte: visita equipo/objetivo con servicios

### 3.6 Pruebas manuales
1. Dept Lab → aparecen 9 checkboxes equipos; elegir PLC+HMI → Siguiente OK
2. Dept Automatización → lista 17 servicios checkbox; elegir ≥1 → OK
3. Dept Soporte en planta → misma lista servicios
4. Dept Suministro → BOM (sin equipos ni servicios)
5. Borrador autosave restaura checkboxes (_restoreWizardMultiSelects)

## 4. PENDIENTE (no implementado)

- Contactos: click detalle sidePanel, dedupe fino
- Taller import: solo Reparado/Cancelado, imágenes, fechas_etapas
- Enlazar personas Odoo bajo empresas tabulador

## 5. Checklist grep

grep CATALOGO_EQUIPOS_LAB panel/js/modules/ventas.js
grep wizardEquiposWrap panel/js/modules/ventas.js
grep wizardServiciosAutoWrap panel/js/modules/ventas.js
grep seed-tabulador-50 reiniciar-ssepi.bat
grep "_loadContactos()" panel/js/modules/ventas.js

Entrega: tabla ✅/❌ y diffs si falta algo.
```

---

## Historial de secciones anteriores

Ver commits / conversación para: SyntaxError, header Javier, tabulador 50, supuestos EPC1/EPC2, regresiones seed manual.

*Última actualización: implementación multi-select equipos/servicios en Ventas.*
