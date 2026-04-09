# Importación masiva SSEPI

Herramienta **Node.js** para cargar contactos (Odoo `res.partner`), órdenes de reparación (`repair.order`), inventario y BOM, con modo **CSV de respaldo** (`--dry-run`).

## 1. Preparar archivos

Copia tus archivos a `scripts/imports/fuente/` con nombres que el script reconozca:

| Contenido | Nombre sugerido (fragmento en el archivo) |
|-----------|---------------------------------------------|
| Contactos | `contacto`, `res.partner` |
| Reparaciones | `reparación`, `repair.order`, `repair` |
| BOM | `bom` |
| Inventario / costos / herramientas | Cualquier otro `.xlsx` / `.csv` (se fusionan por SKU; se excluyen contactos, reparaciones y BOM). Los archivos con nombre **`inventario electronica`** usan la fila **CÓDIGO MARKING** como encabezado. |

Los logos de clientes deben estar en la carpeta del repo `clintes/`; el script asigna `logo_url` por coincidencia aproximada de nombre/empresa.

## 2. Instalación

```bash
cd scripts/imports
npm install
```

## 3. Inspeccionar columnas

Antes de importar, revisa que Excel/CSV tengan las columnas esperadas:

```bash
node import.mjs inspect
```

## 4. Modo CSV (sin claves)

Genera CSV normalizados en `scripts/imports/out/` para revisión o import manual en Supabase Table Editor:

```bash
node import.mjs contacts --dry-run
node import.mjs orders --dry-run
node import.mjs inventario --dry-run
node import.mjs bom --dry-run
node import.mjs formulas --dry-run
```

### Cotizaciones (FORMULAS DE COTIZACIÓN.xlsx)

Coloca el libro en `fuente/` con un nombre que contenga `formula`. Crea o actualiza **Laboratorio (electrónica)** y **Automatización** y reemplaza `calculadora_costos` desde las hojas Hoja1, LABORATORIO y AUTOMATIZACIÓN.

1. SQL: `calculadoras-modulo.sql` y `calculadoras-rls-acceso-equipo.sql`.
2. `node import.mjs formulas --apply` (mismas variables Supabase que contactos).

## 5. Carga directa a Supabase (`--apply`)

**No subas la service role key al repositorio.** En PowerShell:

```powershell
$env:SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
cd scripts/imports
node import.mjs contacts --apply
```

Orden recomendado de migraciones SQL en el proyecto:

1. [`ordenes-taller-estados-odoo.sql`](../migrations/ordenes-taller-estados-odoo.sql) — antes de importar órdenes con estados Odoo.
2. [`bom-lineas.sql`](../migrations/bom-lineas.sql) — antes de `import.mjs bom --apply`.

## 6. Mapeos

- **Estados** de reparación: se normalizan a los valores permitidos en `ordenes_taller` (incl. Confirmado, En reparación, Cancelado tras la migración Odoo).
- **Inventario:** `categoria` debe ser `refaccion`, `almacenable`, `consumible` o `servicio` (reglas por nombre de archivo y columnas).
- **Contactos:** `tipo` `client` o `provider` según columnas tipo Odoo / `customer_rank` / `supplier_rank` si existen.

Si tu export tiene otros nombres de columna, edita los arrays `pick(..., [...])` en [`import.mjs`](./import.mjs).
