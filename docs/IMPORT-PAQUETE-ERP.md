# Import Paquete ERP → SSEPI

Integración del comparador Odoo/Excel y órdenes de laboratorio bajo `simulaciones/`, sin desplegar las apps HTML del paquete.

## Rutas de datos

| Recurso | Ubicación |
|---------|-----------|
| Capturas Odoo + OCR | `simulaciones/escaner de imagenes/info/` |
| Tabulador Excel | `info/TABULADOR DE COTIZACIÓN actualizado.xlsx` (o `scripts/imports/fuente/`) |
| Salida comparador | `info/datos_comparador.json` |
| Reportes lab (carpetas SP-E) | `simulaciones/escaner de imagenes/reportes/` |
| OCR reportes | `simulaciones/escaner de imagenes/datos_reportes_ocr.json` |

Config central: `scripts/imports/erp-paquete-paths.mjs`

## Orden de ejecución

1. **Migración Supabase** (una vez):

   ```bash
   # En SQL Editor: scripts/migrations/erp-maestro-contactos-vinculos.sql
   ```

2. **Maestro contactos** (generar JSON + revisar CSV):

   ```bash
   cd scripts/imports
   npm install
   node generar-rastro.mjs          # opcional si existe generar_rastro.py
   node build-erp-maestro.mjs       # → info/datos_comparador.json
   ```

3. **Import contactos / tabulador / adeudos**:

   ```bash
   set SUPABASE_URL=...
   set SUPABASE_SERVICE_ROLE_KEY=...
   node import.mjs erp-maestro --dry-run
   node import.mjs erp-maestro --apply
   node import.mjs erp-maestro --link-adeudos --apply
   ```

4. **Laboratorio** (OCR + órdenes):

   ```bash
   node scan-lab-reportes.mjs --dry-run    # refresca datos_reportes_ocr.json
   node import-lab-ordenes.mjs --dry-run
   node import-lab-ordenes.mjs --apply
   ```

## Comandos

| Script | Uso |
|--------|-----|
| `build-erp-maestro.mjs` | Cruce 139 capturas ↔ tabulador → `datos_comparador.json` |
| `import.mjs erp-maestro` | Upsert `contactos`, `clientes_tabulador`, alias, módulos costo |
| `import.mjs erp-maestro --link-adeudos` | Reasigna `clientes_adeudos` sin `cliente_id` |
| `scan-lab-reportes.mjs` | Pipeline OCR reportes (reglas unificadas) |
| `import-lab-ordenes.mjs` | Órdenes taller + Storage desde `reportes/` |

## Variables de entorno

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — obligatorias con `--apply`
- `SSEPI_TABULADOR_XLSX` — override ruta Excel (opcional)

## UI

Tras el import, en **Contactos** verás empresa tabulador, vendedores vinculados y adeudo. En **Ventas** (wizard paso 1) el cliente se resuelve por `empresa_tabulador` y se muestra vendedor asociado si existe.

## Notas

- Hoja1 del tabulador = viaje Dani (km/horas), no precio por módulo.
- No se borran contactos legacy automáticamente; revisar `scripts/imports/out/erp_duplicados_revision.csv`.
- Re-escanear carpetas nuevas bajo `reportes/` y volver a ejecutar `scan-lab-reportes.mjs` + `import-lab-ordenes.mjs`.
