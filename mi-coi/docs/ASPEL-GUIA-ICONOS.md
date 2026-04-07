# Guía de iconos Aspel (BANCO y COI)

Mapa rápido para ubicar en tu instalación de **Aspel** los mismos iconos y pantallas que aparecen en las capturas de referencia. **No sustituye al manual oficial de Aspel.** Complementa el flujo contable/timbrado descrito en [FLUJO-BALANZA-TIMBRAR-CATALOGO.md](./FLUJO-BALANZA-TIMBRAR-CATALOGO.md).

---

## Aspel-BANCO – Consulta de movimientos bancarios

Pantalla típica: **Consulta de movimientos bancarios** (lista de movimientos del día o periodo).

### Barra superior (izquierda a derecha)

| Icono / acción | Uso habitual |
|----------------|--------------|
| Documento con **+** verde | Alta de movimiento nuevo |
| Documento con **lápiz** | Editar el movimiento seleccionado |
| Documento con **X** o **−** rojo | Eliminar movimiento |
| **Embudo** | Filtros de la lista |
| **Flechas circulares** | Actualizar / refrescar datos |
| **SAE** con engrane y $ | Integración con Aspel SAE |
| **Impresora** | Imprimir listado o reporte |
| **Código QR** | Funciones de facturación electrónica / CFDI (según versión y configuración) |
| **Impresora con hoja** | Vista previa o impresión de detalle |
| **Excel (X verde)** | Exportar la tabla a Excel |
| **Dos hojas** | Copiar o duplicar |
| **Sobre con @** | Enviar por correo |
| **Carpeta con flecha** | Exportar a archivo / carpeta |
| **Sigma (Σ)** | Totales o sumarización |
| **Clip** | Adjuntos del movimiento |
| **Flechas arriba/abajo** | Ordenar o navegar filas |
| **Documento con $ y check** | Relacionado con **facturación / timbrado** o CFDI en muchos despliegues (consultar ayuda Aspel para tu versión) |
| **Tarjeta / chequera con flechas** | Transferencias entre cuentas o métodos de pago |

### Barra lateral izquierda (filtros por tipo)

| Botón | Significado habitual |
|-------|----------------------|
| **T#** (carpeta amarilla) | **Todos** los movimientos |
| **E#** | **Egresos** |
| **CH#** | **Cheques** |
| **TR#** | **Transferencias** |
| **O#** | **Otros** tipos |

### Pestañas inferiores (periodo)

- **Hoy**, mes/año (ej. Abril/2023), **2023**, **Todos**, **Sin conciliar**.

### Encabezado de la rejilla

Suele mostrar: fecha de movimientos, saldo inicial, saldo con/sin tránsito. Columnas típicas: clave concepto, fecha, descripción, estado (ej. Aplicado), forma de pago, referencia, a nombre de, RFC, abono, cargo, saldo.

---

## Aspel-BANCO – Agregar / Captura de movimientos

Ventana: **Agregar – Captura de movimientos bancarios**.

### Barra de la ventana

| Acción | Atajo / nota |
|--------|----------------|
| **Guardar** | F3 |
| **Observaciones** | F5 |
| **Multiconcepto** | F6 (varios conceptos en un movimiento) |
| **Inserta partidas** | F7 (puede deshabilitarse según estado) |
| **Borra partidas** | F8 |
| **Ayuda** | Manual contextual |
| **Salir** | Cerrar ventana |

### Campos principales del formulario

- **Concepto** (con botón de catálogo **?**).
- **Forma de pago** (ej. 1 EFECTIVO).
- **Fecha de registro** y **Fecha de aplicación** (calendario).
- **Beneficiario** (catálogo / contactos).
- **Referencia 1** y **Referencia 2**.
- **Monto total** e **IVA total** (calculadora junto al campo).
- **Departamento**, **Centro de costos**, **Proyecto** (cada uno con catálogo).

### Rejilla inferior

Columnas típicas: concepto, descripción, monto, IVA. Mensaje **“No hay datos para desplegar”** hasta que agregues partidas.

### Pestañas al pie

1. **Movimientos** (activa por defecto).
2. **Pago a proveedores – SAE**.
3. **Abono de clientes – SAE**.

---

## Aspel-BANCO – Pestaña Reportes (cinta)

Con la pestaña **Reportes** activa en el menú principal.

### Grupos y botones (resumen en una línea)

| Botón | Función resumida |
|-------|------------------|
| **Reporte Estado de cuenta** | Estado de cuenta del banco (detallado o resumido según filtro). |
| **Reporte Diario de bancos** | Movimientos del día por banco. |
| **Resumen de cuentas** | Resumen por cuenta bancaria. |
| **Transferencias** | Reporte de transferencias entre cuentas. |
| **Por conceptos** | Movimientos agrupados o filtrados por concepto. |
| **Emisión de cheques** | Cheques emitidos. |
| **Cheques autorizados** | Cheques en estado autorizado. |
| **Reporte Agenda de movimientos** | Movimientos programados / agenda. |
| **Reporte de pronóstico de ingresos** | Proyección de entradas. |
| **Reporte de pronóstico de egresos** | Proyección de salidas. |
| **Flujo de efectivo financiero** | Flujo de efectivo a nivel financiero. |
| **Flujo de efectivo diario** | Flujo por día. |
| **Flujo de efectivo con base y desglose de IVA** | Flujo con IVA detallado. |
| **Flujo de efectivo con desglose de IVA** | Variante con desglose fiscal. |
| **Reporte de conciliación** | Conciliación bancaria (etiqueta puede truncarse como “conci…”). |

El visor de reportes suele incluir: zoom, primera/anterior/siguiente/última página, configurar página, imprimir, guardar/exportar, correo, ayuda, salir.

---

## Aspel-BANCO – Ventanas de filtro (ejemplos)

### Filtro para reporte de estado de cuenta

- **Cuenta**: número + descripción (ej. Banamex y número de cuenta).
- Botón **?** junto a cuenta: catálogo de cuentas bancarias.
- **Fecha de aplicación**: lista (ej. Ninguna, Mes actual) y rango Desde/Hasta con **calendario**.
- **Estados**: Todos, **Aplicado**, En tránsito, etc.
- **Incluir movimientos con** saldo (dropdown + monto + **calculadora**).
- **Título** del reporte y opción de pie con usuario/fecha/hora.
- Botones: **Aceptar**, **Cancelar**, **Ayuda**.

### Filtro del reporte de flujo de efectivo financiero

- Misma lógica: **Cuenta**, rango de **Concepto**, **Fecha de aplicación** (ej. Mes actual con fechas automáticas), **Estados** (Aplicado, En tránsito, etc.), título y pie.

### Filtro del reporte de la agenda

- Pestañas: **Información general**, Información adicional, Ordenamiento.
- Cuenta, concepto, fechas, estados (Todos, Programado, Autorizado), monto, forma de pago, tipo.

---

## Aspel-COI 8.0 – Cuentas y pólizas (cinta)

Pestaña **Cuentas y pólizas** activa.

| Grupo / botón | Función resumida |
|---------------|------------------|
| **Cuentas** | Catálogo de cuentas contables. |
| **Pólizas** | Captura y consulta de pólizas; enlaces a póliza dinámica, conceptos, tipos. |
| **Balanza de comprobación** | Balanza / comprobación de saldos. |
| **Segmentos** | Departamentos, centro de costos, proyectos. |
| **Presupuestos** | Crear, importar, modificar; menú presupuestos. |
| **Monedas** | Catálogo de monedas y tipo de cambio. |
| **Depósito Doctos** | Consulta y configuración de depósito de documentos. |
| **Buzón contable** | Buzón para envíos contables electrónicos. |

---

## Aspel-COI – Monedas

Pestaña **Monedas** (desde Cuentas y pólizas).

### Toolbar

| Icono | Uso |
|-------|-----|
| Hoja con **+** verde | Agregar moneda |
| Hoja con **lápiz** | Modificar |
| Hoja con **$ / €** | Detalle o configuración de moneda |
| **Impresora** | Imprimir listado |
| Hoja con flecha (exportar/envío) | Exportar o envío electrónico |
| **Engranes** | Configuración |
| **?** | Ayuda |
| **Puerta** | Salir |

**Buscar (F3)** a la derecha de la barra.

### Tabla de monedas

Columnas habituales: **Nombre**, **Símbolo**, **Fecha de último cambio**, **Tipo de cambio**, **Clave fiscal**.

La **clave fiscal** (ej. **MXN**, **USD**) debe coincidir con el catálogo del SAT usado en CFDI; al timbrar con Facturama u otro PAC, la moneda del comprobante debe ser coherente con lo configurado aquí.

### Ventana Agregar monedas

- Moneda, símbolo, tipo de cambio (con lupa para consultar tipo de cambio en algunas versiones), fecha, **Clave fiscal** (dropdown, ej. MXN = Peso mexicano).
- Botones: Aceptar, Cancelar, Guardar (F3), Ayuda.

---

## Aspel-COI – Parámetros del sistema

Ventana **Parámetros del sistema**; pestañas **Generales** / **Fiscales** según necesidad.

### Barra lateral (iconos verticales)

| Icono / sección | Contenido típico |
|-----------------|------------------|
| **Pólizas** | Parámetros de pólizas. |
| **Activos** | Activos fijos. |
| **Fiscal** | Parámetros fiscales (IVA, retenciones, etc.). |
| **Contabilidad Electrónica** | Envíos y parámetros de contabilidad electrónica ante el SAT. |
| **Buzón contable** | Configuración del buzón. |
| **Multimoneda** | Trabajar con monedas extranjeras; tipo de cambio al iniciar o en pólizas. |
| **Aplicaciones asociadas** | Enlaces con otros Aspel. |

Para integración con **timbrado** y obligaciones ante el SAT, suelen ser clave las secciones **Fiscal** y **Contabilidad Electrónica** (además de datos de empresa en Generales: RFC, razón social, dirección).

---

## Relación con el flujo del proyecto (mi-coi)

En [FLUJO-BALANZA-TIMBRAR-CATALOGO.md](./FLUJO-BALANZA-TIMBRAR-CATALOGO.md) se describe: balanza → timbrar → catálogo por cliente.

- **Aspel BANCO**: los movimientos y reportes (estado de cuenta, flujo de efectivo) ayudan a conciliar y documentar entradas/salidas que luego pueden alimentar decisiones de facturación o comprobación con movimientos reales del banco.
- **Aspel COI**: la **balanza de comprobación** y las **pólizas** enlazan con la contabilidad que debe cuadrar antes o después de timbrar; **Monedas** y **clave fiscal** deben alinearse con lo que envías por API (Facturama, Finkok, etc.) para evitar rechazos por moneda incorrecta.
- El icono de **facturación/CFDI** en BANCO (documento con $ y check) depende de tu versión y módulos Aspel; para timbrado vía este repositorio se usa el código Python, no Aspel directamente, salvo que Aspel esté configurado con el mismo PAC.

---

## Capturas en el repo (opcional)

Si quieres versionar las mismas capturas que usaste como referencia, puedes copiarlas a:

`docs/assets/aspel/`

Por ejemplo:

- `docs/assets/aspel/banco-consulta-movimientos.png`
- `docs/assets/aspel/banco-reportes-cinta.png`
- `docs/assets/aspel/coi-monedas.png`
- `docs/assets/aspel/coi-parametros-sidebar.png`

Luego enlázalas desde este archivo con rutas relativas, por ejemplo: `![Consulta movimientos](./assets/aspel/banco-consulta-movimientos.png)`.

No es obligatorio: la guía anterior es útil solo con texto.

---

## Notas

- Las etiquetas exactas pueden variar ligeramente entre **Aspel-BANCO 6.0** y otras revisiones; usa **Ayuda (F1)** dentro de cada ventana para confirmar.
- **EMPRESA INVÁLIDA** u otros nombres de demostración en capturas de tutorial no son datos reales de tu empresa.
