# PROMPT: Integración del BOM SSEPI al ERP SSEPI

## Contexto

Existe un archivo CSV llamado `BOM_SSEPI(BOM) (1).csv` que contiene la Lista de Materiales (BOM) de un proyecto de automatización industrial. El CSV tiene 293 artículos con los siguientes campos separados por punto y coma (`;`):

- **ITEM** (número de artículo)
- **NÚMERO DE PARTE** (código del fabricante, ej: 6ES7215-1AG40-0XB0)
- **DESCRIPCIÓN** (especificaciones técnicas del producto)
- **IMAGEN** (indicador de si tiene imagen, dice "Imagen")
- **CATEGORÍA** (PLC's, HMI's, SERVODRIVES, SERVO MOTOR, SENSORES, ENCODER, COMUNICACIÓN, ALIMENTACIÓN, PROTECCION ELECTRICA, MOTORES, VARIADOR, MATERIAL ELECTRICO, ACCESORIOS, MATERIALES MECÁNICOS, SEGURIDAD IND, FLEJADORAS, CÁMARA)
- **ESTADO** (ACTUALIZADO / NO ACTUALIZADO)
- **Hasta 4 proveedores** por artículo, cada uno con: NOMBRE DEL PROVEEDOR, PRECIO, TIEMPO DE ENTREGA, LINK

**Codificación del CSV:** Windows-1252 (cp1252). Las comillas dobles delimitan campos multilínea. El carácter `´` (acento agudo, byte 0xB4 en cp1252) se usa como apóstrofe (ej: "HMI'S" aparece como "HMI´S").

**Ubicación actual:** `C:\Users\norbe\Documents\robot_mecanum_esp32_v3\Boom para inventario\`

---

## Lo que ya se construyó

### 1. Visor HTML interactivo (`inventario.html`)
- Archivo auto-contenido (no requiere servidor web)
- Carga datos automáticamente desde `bom_data.js` (datos del CSV parseados como JS)
- Carga imágenes automáticamente desde `bom_images.js` (imágenes embebidas como base64)
- Funcionalidades: tabla interactiva, filtros por categoría/estado/proveedor, búsqueda, ordenamiento, paginación, modal de detalle por producto, lightbox para imágenes, exportar filtrados a CSV
- **Problema resuelto:** `fetch()` no funciona con `file://` por CORS, por eso los datos e imágenes se embebieron como archivos JS

### 2. Datos parseados (`bom_data.js`)
- Generado por `parse_csv.py` usando pandas con `encoding='cp1252'` y `sep=';'`
- Contiene `const BOM_DATA = [...]` con 292 artículos como objetos JS
- Cada artículo tiene: item, partNumber, description, hasImage, category, status, suppliers (array de hasta 4)
- **Reemplazos de caracteres:** `´` → `'`, `"` → `"`, `"` → `"`, `'` → `'`, `'` → `'`, `–` → `-`, `—` → `-`

### 3. Imágenes de productos (`bom_images.js`)
- Generado por `download_images.py` que scrapeó las URLs de proveedores en el CSV
- Se descargaron ~100 imágenes de productos desde sitios como IFM, Dimeint, Euroelectrica, etc.
- Las imágenes se redimensionaron a 150px y se convirtieron a base64 JPEG (calidad 70%) para embeber
- Contiene `const BOM_IMAGES = {...}` mapeando número de artículo → dataUri + productUrl
- **Tamaño total:** ~768KB

### 4. Scripts Python
- **`parse_csv.py`** - Lee el CSV con pandas (cp1252, sep=;), limpia caracteres, genera `bom_data.js`
- **`download_images.py`** - Lee el CSV, extrae URLs de proveedores, scrapea imágenes de cada página, las guarda en `images/`, y genera `image_map.json` con el mapeo

---

## Lo que se necesita: Integración con ERP SSEPI

Se requiere integrar este inventario/BOM dentro de un sistema ERP llamado **SSEPI**. El objetivo es que los datos del BOM (artículos, precios, proveedores, imágenes) sean parte del ERP y no archivos sueltos.

### Requisitos de integración:

1. **Estructura de datos del BOM para el ERP:**
   - Cada artículo del BOM debe convertirse en un registro de inventario en el ERP
   - Campos necesarios: número de parte, descripción, categoría, estado, proveedores (con precios, tiempos de entrega, URLs), imagen del producto
   - Las categorías del BOM deben mapearse a las categorías del ERP
   - Los estados (ACTUALIZADO/NO ACTUALIZADO) deben reflejarse en el sistema

2. **Proveedores y cotizaciones:**
   - Cada artículo puede tener hasta 4 proveedores con precios diferentes
   - El ERP debe permitir registrar múltiples cotizaciones por artículo
   - Debe identificarse el "mejor precio" (precio más bajo) automáticamente
   - Los enlaces a productos deben ser campos clicables en el ERP

3. **Imágenes de productos:**
   - Las ~100 imágenes ya descargadas están en la carpeta `images/`
   - El script `download_images.py` puede re-ejecutarse para actualizar imágenes
   - El ERP debe poder almacenar y mostrar estas imágenes por artículo

4. **Actualización de datos:**
   - El CSV se actualiza periódicamente con nuevos precios y proveedores
   - Se necesita un proceso de importación que actualice registros existentes sin duplicar
   - Los artículos nuevos deben crearse, los existentes deben actualizarse

### Preguntas para definir la integración:

- **¿Qué tecnología usa el ERP SSEPI?** (Base de datos: MySQL, PostgreSQL, SQL Server? Lenguaje: PHP, Python, .NET? Framework: Django, Laravel, SAP?)
- **¿Cómo se estructuran los artículos de inventario en el ERP?** (Campos, tablas, relaciones)
- **¿Cómo se manejan los proveedores y cotizaciones?** (Tablas separadas, campos JSON?)
- **¿Cómo se almacenan las imágenes?** (En base de datos como BLOB, en filesystem con referencia, servicio de almacenamiento?)
- **¿Hay una API REST o interfaz de importación?** (CSV import, API endpoints, interfaz web?)
- **¿Se requiere autenticación/autorización para la importación?**
- **¿El ERP SSEPI ya existe o se está construyendo?**

### Archivos disponibles para la integración:

| Archivo | Descripción | Tamaño |
|---------|-------------|--------|
| `BOM_SSEPI(BOM) (1).csv` | CSV original con 293 artículos | ~120KB |
| `inventario.html` | Visor HTML interactivo autocontenido | 31KB |
| `bom_data.js` | Datos del BOM como array JS (292 artículos) | 151KB |
| `bom_images.js` | Imágenes embebidas como base64 (~100 imgs) | 768KB |
| `parse_csv.py` | Script Python para regenerar bom_data.js desde el CSV | - |
| `download_images.py` | Script Python para descargar imágenes de proveedores | - |
| `image_map.json` | Mapeo item → imagen local + URL de origen | 45KB |
| `images/` | Carpeta con ~96 imágenes originales de productos | ~7MB |

### Mapeo de categorías BOM → ERP:

| Categoría BOM | Descripción | Ejemplo de artículos |
|---|---|---|
| PLC's | Controladores lógicos programables | Siemens S7-1200, S7-1500, Mitsubishi Q-Series |
| HMI's | Interfaces humano-máquina | Delta DOP-107EV, Siemens KTP400/KTP900 |
| SERVODRIVES | Accionamientos de servomotor | Siemens SINAMICS V90, Shihlin SDE-100A2 |
| SERVO MOTOR | Motores servos | Siemens SIMOTICS S-1FL6, Bodine 33A5BEPM-WX2 |
| SENSORES | Sensores ópticos y de distancia | IFM OGD250, O1D120, O5D150, Keyence LR-W500C |
| ENCODER | Encoders rotativos | IFM RV3100, Omron E6B2, Autonics E50S8 |
| COMUNICACIÓN | Switches, cables y procesadores | Scalance XB008/XB005, cables Profinet |
| ALIMENTACIÓN | Fuentes, transformadores, UPS | Siemens SITOP, transformador 45kVA, UPS 3kVA |
| PROTECCION ELECTRICA | Interruptores, fusibles | Siemens S202C1, S203-K16, fusibles NH00 |
| MOTORES | Motores eléctricos | WEG 15HP 1750RPM, motorreductores Sumitomo |
| VARIADOR | Variadores de frecuencia | ABB ACS355/ACS580, LS S100/G100, Mitsubishi FR-E800 |
| MATERIAL ELECTRICO | Cables, tubos, conexiones | Cable THW, tubo conduit, clemas, riel DIN |
| ACCESORIOS | Tornillos, taquetes, flejadoras | Tornillos Allen, taquetes expansivos, flejadora |
| MATERIALES MECÁNICOS | Perfiles, platas, tornillería | Perfil aluminio R10, tornillería galvanizada |
| SEGURIDAD IND | Relés y módulos de seguridad | Pilz PNOZ S5, PNOZ e3.1p, Omron G9SE |
| FLEJADORAS | Herramientas de flejado | Flejadora automática batería litio |
| CÁMARA | Sistemas de visión | Keyence VS-L320CX, iluminación CA-DEW10X |

---

## Instrucciones para la integración

1. **Primero:** Definir la estructura del ERP SSEPI (base de datos, API, framework)
2. **Crear las tablas/seeds** para categorías, artículos, proveedores, cotizaciones e imágenes
3. **Escribir un script de migración** que lea `bom_data.js` o el CSV original e inserte los datos en el ERP
4. **Configurar el almacenamiento de imágenes** (filesystem o BLOB) y migrar las ~100 imágenes ya descargadas
5. **Crear vistas/interfaz** en el ERP para visualizar el inventario con filtros, búsqueda y detalle de producto (similar a lo que ya hace `inventario.html`)
6. **Establecer un proceso de actualización** para cuando el CSV cambie (nuevos precios, nuevos artículos, cambios de proveedor)

Los datos están listos y limpios. Las imágenes están disponibles. Solo falta conectar todo al ERP SSEPI.