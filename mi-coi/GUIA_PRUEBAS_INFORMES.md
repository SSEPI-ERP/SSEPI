# Guía de pruebas manuales — Informes, presupuestos, cierre y configuración general

Ejecute la aplicación con su flujo habitual. Menú base: **Reportes** para informes; **Configuración** (o equivalente) para parámetros de empresa, ejercicio, BD y catálogos SAT.

Antes de empezar, puede correr verificación automática (sin ventanas):

```text
python verificar_informes_contables.py
```

---

## 1. Estados financieros (motor completo)

**Ruta:** Reportes → **Estados financieros (motor completo)**.

| Qué probar | Cómo |
|------------|------|
| ER mensual | Tipo: resultado mensual; mes/año; Generar. Debe mostrar ingresos, costo de ventas, utilidad bruta, gastos operativos, ISR si aplica, utilidad neta. |
| ER acumulado (YTD) | Mismo diálogo, opción acumulada hasta el mes (si está en la lista de tipos). |
| Balance | Fecha de corte; ver mensaje o indicador de **Activo = Pasivo + Capital** cuando el motor lo exponga. |
| Flujo de efectivo (indirecto) | Rango de fechas del flujo; revisar que parta de utilidad neta y muestre ajustes (depreciación, capital de trabajo, etc.). |
| Cambios en el capital | Movimientos de capital en el ejercicio. |
| Comparativo año vs año | Informes comparativos (ER/Balance/Flujo/Capital) con dos columnas y variación si está implementado. |
| Por departamento/centro | Elegir centro de costo y generar el paquete filtrado. |
| Formatos guardados | Guardar formato ER / cargar desde combo y regenerar. |
| Exportar | PDF, Excel y Word; en PDF verificar encabezado con empresa (y RFC si está en configuración). |

---

## 2. Estado de resultados (pantalla principal)

Si usa **Estado de resultados** desde el menú principal o módulo de resultados:

- Marque **Acumulado YTD (ene → mes)** y confirme que los importes corresponden al acumulado y no solo al mes.

---

## 3. Libro diario (formal)

**Ruta:** Reportes → **Libro diario (formal)**.

1. **Generar** con un rango que tenga pólizas.
2. Lista izquierda: pólizas en orden por fecha/tipo/folio.
3. Al seleccionar una póliza: partidas con cuenta, cargo, abono; columnas **UUID (inicio)** y **Total CFDI** si hay `cfdi_poliza`.
4. Seleccione una línea con UUID: el panel inferior debe mostrar emisor, receptor, subtotal, IVA, total, UUID completo.
5. **Doble clic** en esa línea: ventana emergente con el mismo detalle.
6. **Vista previa / PDF**: debe listar líneas (no vacío tras la corrección `lineas`/`partidas`).

---

## 4. Libro mayor

**Ruta:** Reportes → **Libro mayor**.

- Cuenta y rango de fechas; saldo acumulado por movimiento.
- Fila con UUID: panel inferior y doble clic igual que arriba.

---

## 5. Libro mayor por rango

Misma ventana de mayor: el rango **Desde / Hasta** acota los movimientos (comportamiento esperado del informe).

---

## 6. Diario / Mayor integrado

**Ruta:** Reportes → **Diario / Mayor integrado** (o etiqueta similar).

- Fila superior: pólizas del periodo.
- Al seleccionar: partidas a la izquierda del panel inferior, resumen **Δ C−A** por cuenta a la derecha.
- Barra **Generar** no debe quedar encimada con el texto de ayuda; pie de totales del periodo visible abajo.

---

## 7. Presupuestos

**Ruta:** Módulo o menú **Presupuestos** (o equivalente en su instalación).

| Qué probar | Cómo |
|------------|------|
| Captura de presupuesto anual | Por cuenta, ingrese el monto presupuestado para el año. Compruebe que puede distribuirse **uniformemente** en los 12 meses o **ajustar mes a mes** sin perder el total anual (o con validación coherente si el sistema exige cuadre). |
| Distribución automática mensual | Acción que divide el anual en **12 partes iguales** y rellena los 12 campos mensuales. Luego modifique uno o varios meses y verifique que el resto o el total se comporten según las reglas del sistema (sobrescritura permitida para estacionalidad manual). |
| Distribución estacional | Defina **porcentajes por mes** (ej.: diciembre 20 %, resto repartido; p. ej. ~7,27 % c/u en los otros 11). El sistema debe aplicar esos porcentajes al **monto anual** y poblar los importes mensuales; valide que la suma de porcentajes sea 100 % o que el error se muestre claramente. |
| Reporte real vs presupuesto | Genere el informe comparativo y confirme columnas **del mes**: cuenta, presupuesto del mes, real del mes, variación del mes. Columnas **acumuladas (YTD)**: presupuesto YTD, real YTD, variación YTD, **% de cumplimiento**. |
| Importar desde Excel | Prepare una hoja con **12 columnas** (una por mes) por cuenta (o el formato que documente el sistema). Importe en bloque y verifique cuentas e importes contra la captura en pantalla. |
| Exportar a Excel | Exporte el presupuesto; ábralo en Excel, modifique meses y, si aplica, reimporte para validar ida y vuelta. |

---

## 8. Cierre contable

**Ruta:** Administración / **Cierre contable** (o menú equivalente; puede requerir perfil administrador o supervisor).

| Qué probar | Cómo |
|------------|------|
| Respaldo obligatorio pre-cierre | Antes de **cierre mensual** o **cierre anual**, el sistema debe **generar respaldo completo** de la BD y **no continuar** hasta confirmar éxito. Simule o ejecute en entorno de prueba y compruebe mensaje de confirmación o aborto si falla el respaldo. |
| Cierre mensual | Seleccione un periodo (mes/ejercicio). Tras **confirmación del administrador**, el periodo queda **bloqueado**: ningún usuario puede crear, modificar ni afectar pólizas en ese mes. Verifique intentando registrar póliza en ese periodo. Confirme que se disparó el respaldo automático previo. |
| Reapertura de periodo | Con usuario autorizado, **desbloquee** un periodo cerrado usando **contraseña de supervisor** (o flujo equivalente). Revise la **bitácora**: quién reabrió, cuándo y motivo/justificación. |
| Cierre anual | Ejecute el cierre de ejercicio: debe generarse la **póliza de cierre** (cuentas de resultado contra utilidad acumulada u orden definido en COI), **trasladar saldos de balance** al nuevo ejercicio como saldo inicial y **bloquear todos los periodos** del ejercicio cerrado. |
| Traspaso de saldos al nuevo ejercicio | En el nuevo ejercicio, compruebe registros **SALDOS_CUENTA** (o tabla equivalente): **saldo_anterior** = **saldo_final** del ejercicio anterior para cuentas de **balance** (`tipo_balance = 'B'`). Las cuentas de **resultado** deben quedar en **cero**. |
| Apertura del ejercicio siguiente | Tras cerrar el ejercicio actual, verifique creación automática del **nuevo ejercicio**: número de ejercicio, **periodos 1–12**, **secuencias de folios** reiniciadas (p. ej. desde 1) según reglas del sistema. |

---

## 9. Configuración general

**Ruta:** **Configuración** → **Parámetros** / **Empresa** / submenús equivalentes (nombres pueden variar según build). Parte de estas pruebas requieren perfil administrador o **Superadmin**.

| Qué probar | Cómo |
|------------|------|
| Parámetros de empresa | Capture **RFC**, **razón social**, **régimen fiscal**, **domicilio fiscal**, **teléfono**, **email** y **logotipo**. Genere un PDF de reporte y, si aplica, un XML/CFDI de prueba: deben reflejarse en encabezados y datos del **SAT** según reglas del módulo fiscal. |
| Ejercicio fiscal | Defina **inicio y fin** del ejercicio. Si la empresa tiene **ejercicio especial** (no enero–diciembre), configure el **mes de inicio** y verifique que periodos y reportes por mes alineen con ese calendario. |
| Decimales | Elija **2 o 4 decimales** para **presentación** en pantalla e informes. Confirme en documentación o BD que **internamente** los importes se conservan con **4 decimales** (redondeo solo visual). |
| Folios por tipo de póliza | Por periodo, defina el **número inicial** de folio para **Ingreso**, **Egreso** y **Diario**. Capture pólizas y compruebe la secuencia. Si migró de otro sistema, use la opción de **reiniciar numeración** solo tras validar impacto en auditoría. |
| Periodo especial (13.º periodo) | Habilite el **13vo periodo** para ajustes de auditoría. Verifique que exista en calendario/captura y que los **cierres normales** (mensual/anual) lo **excluyan** o lo traten según la regla documentada. |
| Descarga de catálogos SAT | Ejecute la actualización desde el **servidor del SAT**. Compruebe que se actualicen (según versión): códigos agrupadores, **c_ClaveProdServ**, unidades de medida, formas y métodos de pago, regímenes fiscales, usos de CFDI. Repita tras un cambio oficial del SAT y valide fecha/versión si el sistema la muestra. |
| Configuración de impresión | Ajuste **márgenes**, **fuentes** y **logotipo** para impresión. Si hay **perfiles por tipo de reporte**, guarde uno distinto (ej. diario vs balance), imprima o exporte a PDF y confirme que aplica el perfil correcto. |
| Conexión a base de datos | Revise o configure **servidor**, **puerto**, **nombre de BD**, **usuario** y **contraseña**. En entorno **multi-servidor**, apunte a una BD **remota**, reinicie la app y valide login y lectura de datos. No deje credenciales en capturas de pantalla compartidas. |
| Respaldo manual de BD | Genere un **dump completo** en cualquier momento. Verifique que el archivo se guarde en la **ruta local** o **carpeta de red** configurada y que el tamaño/fecha sean plausibles. |
| Restauración de BD | Con usuario **Superadmin**, seleccione un respaldo válido y ejecute **restauración**. Debe exigir **confirmación doble**; tras restaurar, compruebe integridad básica (login, ejercicio, muestra de pólizas). Usuario sin privilegio no debe ver la opción. |
| Compactar base de datos | En **Firebird**: ejecute compactación/rebuild según el menú y compruebe mensaje de éxito. En **PostgreSQL**: operación equivalente documentada (p. ej. **VACUUM FULL** + **ANALYZE**); valide que solo la ejecuten roles autorizados y en ventana de mantenimiento. |

---

## 10. Interfaces Aspel SAE → COI (COI 11)

**Ruta:** Explorador → **Interfaces** → **Aspel SAE → COI**.

| Qué probar | Cómo |
|------------|------|
| Código de invitación desde COI | Genere la invitación desde **Empresas integradas**. Copie el token y verifique que aparezca como **pendiente** hasta conectarse. |
| Conectar SAE con token | Ingrese el token en la pantalla **Conectar con token (simulación/UI base)** y confirme que el estatus cambia a **conectado**. |
| Frecuencia de sincronización configurable | Compruebe que el valor de frecuencia se guarda y se muestra asociado a la conexión/empresa integrada. |
| Diario de operaciones — estatus | Abra **Diario de operaciones**. Verifique que existan registros con estatus coherente (p. ej. pendiente/descargada/capturada según implementación). |
| Descargar operaciones manuales | Desde **Descargar operaciones**, ejecute una descarga dummy/real (según disponibilidad) y confirme que el diario se actualiza. |

---

## 11. Nuevo proceso de descarga de CFDIs (Servicio Interno)

**Ruta:** Tablero de CFDIs / Proceso de descarga equivalente.

| Qué probar | Cómo |
|------------|------|
| Cobertura por petición | Confirme que una descarga cubre hasta **4 meses** por solicitud. Si solicita más, debe dividirse automáticamente o requerir varias descargas. |
| Ventana de años | Validar que se pueden bajar CFDIs hasta **5 años atrás** (si está implementado). |
| FIEL independiente al CSD | Verificar que la pantalla/configuración de FIEL no depende de la configuración de CSD. |

---

## 12. Catálogo contable precargado con SAT

| Qué probar | Cómo |
|------------|------|
| Códigos agrupadores SAT al inicio | Verificar que el catálogo base ya incluya códigos agrupadores SAT (o que al menos estén disponibles) sin requerir mapeo manual cuenta por cuenta. |
| Descarga/importación incremental | Si hay descarga de catálogos SAT, valide que los códigos se actualicen y no rompan mapeos previos. |

---

## 13. Generación automática de pólizas desde CFDIs

| Qué probar | Cómo |
|------------|------|
| Automatización completa (con mapeo) | Con mapeo configurado, ejecutar importación/generación y confirmar que se generen pólizas automáticamente (sin sugerencia manual). |
| Validaciones de cuadre | Revisar que las pólizas generadas **cuadren** (cargos=abonos) y que no fallen por cuentas inexistentes. |

---

## 14. Asignación granular de cuentas (criterios COI 11)

| Qué probar | Cómo |
|------------|------|
| Criterios por dimensión | Configurar reglas basadas en: tipo de operación (venta a crédito/contado), producto/servicio, tipo de cliente/proveedor y línea de negocio (si existe UI). |
| Regla aplicada correcta | Importar CFDIs/operaciones con variaciones y confirmar que se afecten las cuentas esperadas por la regla. |
| Conflictos / prioridad | Si existen reglas que se empatan, verificar el orden de prioridad y que el resultado sea determinista. |

---

## 15. Conciliación CFDIs vs movimientos bancarios

| Qué probar | Cómo |
|------------|------|
| Comparación por monto y fecha | Confirmar que el sistema identifique coincidencias y discrepancias entre CFDIs del periodo y movimientos bancarios importados (si el módulo de importación bancaria existe). |
| Discrepancias marcadas | Validar que los CFDIs que no coincidan se marquen con motivo claro (monto, fecha, falta en uno de los lados). |

---

## 16. Conciliación IVA (contabilidad vs CFDI)

| Qué probar | Cómo |
|------------|------|
| Cruce IVA | Revisar que el IVA en pólizas/contabilidad coincida contra IVA reportado en XMLs. |
| Diferencias | Confirmar que la pantalla/reporte muestre diferencias y totales correctamente. |

---

## 17. DIOT modernizada 2025

| Qué probar | Cómo |
|------------|------|
| Formato nuevo (ej. 2025) | Para 2025, generar DIOT con **54 campos** del nuevo layout. |
| Ejercicios anteriores | Para ejercicios previos, generar TXT con **23 campos** del layout requerido por plataforma web. |
| Reclasificación 02/08 → 85 | Validar que terceros nacionales con clave 02 u 08 se reclasifiquen automáticamente a 85 (Otros) según regla descrita. |

---

## 18. Generación de PDFs desde tablero de CFDIs

| Qué probar | Cómo |
|------------|------|
| PDF directo en COI | Desde el tablero donde se descargan CFDIs, generar PDF del comprobante y validar que el contenido corresponda al XML. |

---

## 19. Relación CFDIs del tablero con pólizas importadas

| Qué probar | Cómo |
|------------|------|
| Visualización de “ligado” | Verificar que el tablero muestre claramente si cada CFDI ya tiene póliza vinculada o no. |
| Integridad del vínculo | Confirmar que el vínculo abra el detalle de la póliza correcta (UUID/ID) cuando exista. |

## Lista de comprobación rápida (requisitos originales)

- [ ] ER mensual y acumulado (4xx–6xx, subtotales de utilidades).
- [ ] Balance a fecha con ecuación contable.
- [ ] Flujo indirecto y cambios en el capital.
- [ ] Comparativos y estados por centro/departamento.
- [ ] Formatos configurables y export PDF/XLSX/DOCX.
- [ ] Libro diario cronológico con partidas y totales; CFDI en líneas con UUID.
- [ ] Mayor por cuenta con saldo y CFDI.
- [ ] Integrado diario–mayor con Δ por cuenta.
- [ ] Presupuesto anual, reparto 12 meses, ajuste manual y distribución estacional por %.
- [ ] Reporte real vs presupuesto (mes, YTD, % cumplimiento).
- [ ] Importar/exportar presupuesto Excel (12 columnas mensuales).
- [ ] Respaldo obligatorio y exitoso antes de cierre mensual/anual.
- [ ] Cierre mensual (bloqueo de pólizas) y reapertura con supervisor y bitácora.
- [ ] Cierre anual, póliza de cierre, traspaso saldos B, resultado en cero, nuevos periodos y folios.
- [ ] Parámetros de empresa (RFC, razón social, régimen, contacto, logotipo) en reportes y XML fiscal.
- [ ] Ejercicio fiscal estándar o especial (mes de inicio); decimales 2/4 en UI vs 4 en almacenamiento.
- [ ] Folios iniciales por tipo de póliza y periodo; 13.º periodo habilitado y excluido de cierres normales.
- [ ] Descarga/actualización de catálogos SAT; perfiles de impresión por tipo de reporte.
- [ ] Conexión BD (local/remota); respaldo manual; restauración con doble confirmación (Superadmin); compactar/VACUUM según motor.

Si algún ítem falla, anote el mensaje de error y el menú exacto usado para reproducirlo.

---

## Lista de comprobación rápida (COI 11 nuevas)

- [ ] Menú **Interfaces** (Aspel SAE → COI) disponible y consistente.
- [ ] Generación de **código de invitación** desde COI (token guardado/expira).
- [ ] Conexión usando el token y estatus en **Empresas integradas**.
- [ ] Diario de operaciones actualizado y con estatus esperado.
- [ ] Descarga manual de operaciones actualiza el diario.
- [ ] Mapeo granular de cuentas por criterios (operación, producto, cliente/proveedor, línea de negocio).
- [ ] Descarga de CFDIs por Servicio Interno (hasta 4 meses/petición, FIEL independiente).
- [ ] Catálogo contable precargado con códigos agrupadores SAT.
- [ ] Generación automática de pólizas desde CFDIs (con mapeo).
- [ ] Conciliación CFDIs vs movimientos bancarios (si aplica en tu build).
- [ ] Conciliación IVA contabilidad vs CFDI (si aplica en tu build).
- [ ] DIOT 2025 con 54 campos / anteriores con 23 campos; reclasificación 02/08 → 85.
- [ ] PDFs desde tablero de CFDIs.
- [ ] Relación CFDIs ↔ pólizas (visual ligado/no ligado y detalle).
