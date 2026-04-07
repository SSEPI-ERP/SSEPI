# Notas RLS y tablas en Supabase (SSEPI-ERP)

## Tabla `clientes`

En tu proyecto ya tienes políticas RLS sobre `public.clientes`:

| Política | Comando | Uso |
|----------|---------|-----|
| `clientes_select_all` | SELECT | `USING (true)` — permite leer a todos (anon/autenticados). |
| `clientes_select_admin_ventas` | SELECT | Solo usuarios con `auth.uid()` en `usuarios.auth_user_id` y `usuarios.rol IN ('admin','ventas')`. |
| `clientes_insert_admin_ventas` | INSERT | Solo admin/ventas (vía `usuarios`). |
| `clientes_update_admin_ventas` | UPDATE | Solo admin/ventas. |
| `clientes_delete_admin` | DELETE | Solo admin. |

### Cómo se ajusta el ERP

- El módulo **Contactos** del ERP lee de la tabla `contactos` y también de la tabla **`clientes`** y mezcla ambos en la misma vista.
- Para que esos 33 clientes se vean en el ERP basta con que **SELECT** esté permitido. Con `clientes_select_all` activa (USING true) ya se cumple.
- Si quieres que **solo** admin y ventas vean clientes:
  1. Elimina la política permisiva:  
     `DROP POLICY IF EXISTS clientes_select_all ON public.clientes;`
  2. Deja solo `clientes_select_admin_ventas`.
  3. Asegúrate de que el usuario con el que entras al ERP esté en la tabla **`usuarios`** con `auth_user_id = auth.uid()` y `rol` igual a `'admin'` o `'ventas'`.

### Rol en la política

En la definición de `clientes_select_admin_ventas` comprueba que los roles coincidan con los de tu tabla `usuarios`:

- Si en `usuarios` usas `rol = 'admin'`, en la política debe ir `'admin'` (no `'administrador'`).
- Si usas `'administrador'` en la BD, entonces en la política debe ir `'administrador'`.

## Tabla `usuarios` vs `profiles`

Tu RLS usa la tabla **`usuarios`** con `auth_user_id` y `rol`. El script de seed de inventario/contactos no crea ni referencia `profiles` para evitar el error “la relación perfiles no existe”. Si más adelante unes Auth con `usuarios`, asegura que cada usuario de Supabase Auth tenga una fila en `usuarios` con `auth_user_id = auth.uid()` y el `rol` correcto para que las políticas que dependen de `usuarios` (admin/ventas) funcionen.

## Resumen

- **Solo lectura de clientes en el ERP:** con `clientes_select_all` (USING true) no hace falta cambiar nada en el ERP.
- **Lectura solo para admin/ventas:** quita `clientes_select_all` y usa solo `clientes_select_admin_ventas`; mantén `usuarios` y `rol` alineados con la política.
