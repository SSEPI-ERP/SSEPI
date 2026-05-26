# SSEPI offline — fuente Paquete ERP

## Qué se corrigió (mayo 2026)

| Problema | Causa | Fix |
|----------|--------|-----|
| 164 contactos en vez de ~139 | Mezcla `clintes/` + tabulador duplicado en UI | Contactos solo `datos_comparador.json`; UI sin merge tabulador |
| SP-E en Automatización | `classifyModule` invertido | SP-E → taller, SP-A → auto |
| Imágenes rotas (`/null`) | Solo `dataUrl`; proxy quitaba base64 | Import guarda `/uploads/reportes/...`; UI usa `url \|\| dataUrl` |
| `RangeError` en proxy | JSON enorme con base64 | Proxy omite `dataUrl`, conserva `url` |
| `limpiar-contactos` fallaba | `better-sqlite3` | Usa `db.mjs` (sql.js) |
| Tabulador vacío tras limpiar | Borraba `clientes_tabulador` | Limpiar solo `local_contactos` |

## Fuente de datos (offline)

```
simulaciones/SSEPI_Paquete_ERP/
  04_Datos_muestra/datos_ordenes_editables.json   → órdenes + estados + rutas img
  reportes/{FOLIO}/                               → JPG/PNG/PDF por carpeta
  TABULADOR DE COTIZACIÓN actualizado.xlsx

simulaciones/escaner de imagenes/info/
  datos_comparador.json                           → contactos Odoo (build-erp-maestro)
```

## Comandos

```bat
reiniciar-ssepi.bat
```

Manual:

```bat
cd scripts\imports
node build-erp-maestro.mjs

cd ..\..\ssepinext
node seed-erp-maestro-local.mjs --replace-contactos
node importar-reportes-a-bd.mjs
node corregir-ordenes-modulo.mjs
node offline-server.mjs
```

Forzar todos Reparado / Cancelado en import:

```bat
node importar-reportes-a-bd.mjs --todo-reparado
node importar-reportes-a-bd.mjs --todo-cancelado
```

## Imágenes

- Copia física: `ssepinext/uploads/reportes/{FOLIO}/`
- En BD: `{ nombre, url: "/uploads/reportes/..." }` (sin base64)
- Servidas por `offline-server.mjs` en `/uploads`

## Vista previa rápida (sin abrir todo el ERP)

Desde la carpeta `ssepinext` (importante):

```bat
cd E:\SSEPI\ssepinext
abrir-preview-lab.bat
```

Abre solo: **http://localhost:3334/preview-lab-import.html** (mini servidor, ~5 s).

No uses doble clic en el HTML: las fotos van por `/uploads/` y requieren servidor.

Manual: `node generar-preview-lab.mjs` → `node preview-server.mjs`
