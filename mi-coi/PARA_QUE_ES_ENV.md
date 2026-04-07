# ¿Para qué es el archivo `.env` en `mi-coi`?

**No es para abrir el COI.** El COI se abre con `python main.py` o con el acceso directo / `.exe`.

El `.env` es **solo para el motor bridge** (`python -m bridge.bridge_server`):

- Con **SUPABASE_URL** y **SUPABASE_SERVICE_ROLE_KEY**, el bridge puede **escribir en la tabla `coi_sync_log`** de tu proyecto Supabase.
- Así, en la **página Contabilidad del ERP (Vercel)** ves el **historial** de qué ventas/compras ya se pasaron a pólizas en el COI.

**Si no creas `.env`:** el COI y el bridge **siguen creando pólizas en tu PC**; solo **no** verás ese historial en la web.

La **service_role** nunca va en Vercel ni en el navegador: solo en esa PC, en `.env`.
