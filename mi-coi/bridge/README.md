# Bridge SSEPI ERP ↔ COI (local)

## Qué hace

1. Escucha en **127.0.0.1:8765** y recibe JSON de ventas/compras desde el navegador del ERP.
2. Crea **pólizas** en la base del COI (`ContabilidadService`).
3. Opcionalmente escribe en **Supabase** la tabla `coi_sync_log` para que la página Contabilidad (Vercel) muestre el historial.

## Arranque

```bash
cd mi-coi
python -m bridge.bridge_server
```

## Conectar con la nube (historial en el ERP)

1. En Supabase, ejecuta el SQL: `scripts/migrations/coi-sync-log.sql` (desde la raíz del repo SSEPI, no dentro de mi-coi).
2. En la carpeta **mi-coi**, crea un archivo **`.env`** (no lo subas a Git):

```env
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

La **service role** solo debe existir en la PC donde corre el bridge; nunca en el frontend.

3. Reinicia el bridge. Cada ingest correcto, omitido o con error generará una fila en `coi_sync_log`.

## COI escritorio

```bash
python main.py
```

## Cuentas contables

Edita `ssepi_erp_mapping.json` para que coincidan con tu catálogo en COI.
