# Usuarios creados – contraseña provisional

**Contraseña provisional para todos:** `Ssepi2025!`  
Cada usuario debe cambiarla en el primer acceso: **Menú usuario → Configuración → Cambiar contraseña**.

| Correo | Nombre | Rol | Notas |
|--------|--------|-----|--------|
| automatizacion@ssepi.org | Automatización | **Admin** | |
| administracion@ssepi.org | Administración | **Admin** | |
| ventas@ssepi.org | Ventas Admin | **Admin** | |
| electronica@ssepi.org | Electrónica Admin | **Admin** | |
| electronica.ssepi@gmail.com | Electrónica SSEPI | Usuario (ventas) | |
| ivang.ssepi@gmail.com | Ivan (Automatización) | Usuario (automatizacion) | Usuario de área automatización |
| ventas1@ssepi.org | Ventas 1 | Usuario (ventas) | |

---

## Cómo crear los usuarios

1. **Obtener la Service Role Key** en Supabase: Project Settings → API → `service_role` (secret).
2. En la carpeta del proyecto, ejecutar:
   ```bash
   set SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
   npm install
   node scripts/create-users-seed.js
   ```
   (En PowerShell: `$env:SUPABASE_SERVICE_ROLE_KEY="tu_key"; node scripts/create-users-seed.js`)
3. Si algún correo ya existe en Auth, el script actualizará solo la fila en `public.users` (rol/nombre).

**Requisito:** La tabla `public.users` debe existir. Si no existe, ejecuta antes en Supabase SQL Editor: `scripts/migrations/ensure-public-users.sql`. Si ya usas RLS, ejecuta `scripts/ajuste-rls-para-usuarios.sql`.
