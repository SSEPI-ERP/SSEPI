# Flujo Ventas (Compras) → Ventas (Ventas) y Módulo Calculadoras

## 1. Cómo quedó el “cerebro” y acciones de Ventas

### Ventas (compras) — lado compras
- **Módulo Compras:** el vendedor (perfil Ventas) ve **Compras** para dar seguimiento a órdenes de compra y proveedores (qué se pidió, qué está pendiente por recibir).
- **Panel:** la primera tarjeta del Centro de Comando para Ventas muestra **“Compras Pendientes”** (por recibir), no “Ventas del Mes”. Así el resumen del proceso para el vendedor es el de compras.
- **Inventario:** el vendedor **no ve costos** ni valor: se ocultan la tarjeta “Valor Total”, las columnas Costo y Valor en la tabla, y los botones “Nuevo Producto” e “Importar Excel”. Solo ve stock, mínimo, precio de venta y datos necesarios para vender.
- **Correo de ventas:** en envíos de cotización y órdenes de compra, el **remitente** es el vendedor (email del usuario actual con perfil ventas).

### Ventas (ventas) — lado ventas
- **Módulo Ventas:** cotizaciones, envío de cotización por correo (elegir contacto con email o escribir correo a mano; el remitente es el vendedor), vista previa e impresión antes de descargar PDF (estilo folder).
- **Análisis Ventas:** gráficas y reportes del departamento para el perfil Ventas.
- **Folios:**  
  - **SP-A** [AÑO][MES]/[XXX] — Automatización (proyectos).  
  - **SP-E** [AÑO][MES][XXX] — Electrónica (laboratorio).  
  - **SP-S** [AÑO][MES][DÍA]-[X] — Suministro (salidas).  
  - **SP-OC** [AÑO][MES][XXX] — Orden de compra.

En resumen: el vendedor usa **Compras** para ver qué se compra y qué falta por recibir, e **Inventario sin costos** y **Ventas** para cotizar y vender; el “cerebro” del panel para él es Compras Pendientes.

---

## 2. Cerebro de acciones (secuencia)

1. **Compras pendientes** — El vendedor entra al panel y ve la tarjeta “Compras Pendientes” como primera referencia.
2. **Módulo Compras** — Revisa órdenes de compra y qué falta por recibir.
3. **Inventario (sin costos)** — Consulta stock, mínimo y precio de venta; no ve costos ni valor total ni puede crear/importar productos.
4. **Cotización** — Crea cotizaciones en el módulo Ventas.
5. **Correo** — Envía la cotización por correo; el remitente es el correo del vendedor.
6. **PDF** — Vista previa e impresión (estilo folder) antes de descargar.
7. **Venta** — Cierre del flujo comercial.
8. **Calculadoras (solo admin)** — El administrador gestiona funciones, costos e información de clientes de las calculadoras; importa desde la plantilla Excel y analiza el estado. Este módulo no forma parte del flujo del vendedor.

---

## 3. Módulo Calculadoras (especial, solo admin)

### Objetivo
- Un **módulo especial** (solo admin/superadmin) donde se puede **ver y modificar**:
  - Funciones/configuración de las calculadoras.
  - Costos asociados a calculadoras.
  - Información de clientes relacionada.
- **Importar** desde la **plantilla Excel** “Plantilla de cotización (sale.order.template).xlsx” (carpeta `excel/` del proyecto) para dar de alta o actualizar calculadoras.
- **Validar** que los datos importados y las calculadoras estén correctos.
- **Analizar** resumen y estado (cantidad de calculadoras, costos, clientes vinculados).

### Implementación
- **Página:** `pages/ssepi_calculadoras.html` — Solo visible para rol admin (y superadmin). Si Norberto usa el toggle empleado, no ve el módulo.
- **Permisos:** `role_permissions`: admin y superadmin con `calculadoras` read/create/update.
- **Tablas Supabase:** `calculadoras`, `calculadora_costos`, `calculadora_clientes` con RLS solo para admin (ver `scripts/migrations/calculadoras-modulo.sql`).
- **Excel:** El usuario selecciona el archivo (File API); la app lee con SheetJS (xlsx) y mapea columnas nombre/tipo/costo para agregar o actualizar en `calculadoras`.

---

## 4. Excel: inventarios vs calculadoras

| Archivo / carpeta | Uso | Módulo / tablas |
|-------------------|-----|------------------|
| **excel/Plantilla de cotización (sale.order.template).xlsx** | Plantilla principal para **calculadoras**. Importación desde la página Calculadoras (admin). | Módulo Calculadoras → tablas `calculadoras`, `calculadora_costos`, `calculadora_clientes`. |
| **excel/SP-A260121.xlsx**, **excel/FORMULAS DE COTIZACIÓN.xlsx** | Referencia de formato SP-A y fórmulas/costos para cotización. | Consulta y mapeo en el módulo Calculadoras; no alimentan inventario. |
| **excel/Inventario Automatizacion.xlsx**, **excel/inventario electronica ssepi.xlsx**, **excel/LISTADO DE HERRAMIENTAS (1).xlsx** | Archivos de **inventario** (automatización, electrónica, herramientas). | Módulo **Inventario** existente (`pages/ssepi_productos.html`). La importación Excel del inventario alimenta la tabla `inventario` (productos, stock, etc.). No se usan en el módulo Calculadoras. |

En resumen: los Excel en `excel/` cuya finalidad es **cotización/calculadoras** alimentan el módulo Calculadoras; los Excel de **inventario/herramientas** alimentan el módulo Inventario (tabla `inventario`).

---

## 5. Resumen rápido

| Área | Qué hace |
|------|----------|
| **Ventas (compras)** | Compras pendientes en panel, Inventario sin costos, módulo Compras, correo con remitente = vendedor. |
| **Ventas (ventas)** | Cotizaciones, correo (remitente vendedor), PDF estilo folder, Análisis Ventas, folios SP-*. |
| **Calculadoras** | Módulo especial (solo admin): funciones, costos, clientes; importar desde plantilla Excel en `excel/`; validar y analizar. Implementado en `ssepi_calculadoras.html` y migración `calculadoras-modulo.sql`. |
