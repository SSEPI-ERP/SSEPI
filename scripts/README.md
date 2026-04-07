# Scripts SQL – Políticas como código (RLS y seguridad)

Las políticas de seguridad (RLS, funciones SECURITY DEFINER, triggers de auditoría) son **fuente de verdad** en este directorio. Cualquier cambio debe versionarse en Git y revisarse antes de aplicar en Supabase.

## Orden de ejecución recomendado

1. **init.sql** – Esquema base, tablas, RLS inicial, `role_permissions`, `audit_logs`, `auth_logs`, cifrado, triggers de auditoría.
2. **ajuste-rls-para-usuarios.sql** – Vista `usuarios`, columnas en `public.users`, políticas por rol (admin) para inventario, contactos, clientes, compras, ventas.
3. **rls-abac.sql** – Políticas ABAC (atributos departamento, sede, contexto). Ejecutar después de tener `public.users` con columnas de atributos.
4. **sod-constraints.sql** – Tabla de restricciones SoD y función `check_sod`. Opcional para refuerzo de segregación de funciones.

## Archivos de referencia

| Archivo | Contenido |
|---------|-----------|
| init.sql | Esquema completo, RLS por tabla, audit_trigger, encrypt_sensitive_fields, system_config |
| ajuste-rls-para-usuarios.sql | RLS con public.users, vista usuarios, políticas FOR ALL para admin |
| rls-abac.sql | Políticas que usan atributos (departamento, sede, monto, horario) |
| sod-constraints.sql | Matriz SoD y función check_sod(rol, accion_1, accion_2) |
| mask-data-nonprod.sql | Enmascaramiento de PII para copias de BD no productivas |

Para desarrollo local con cabeceras de seguridad (HSTS, X-Frame-Options): `node scripts/serve-with-headers.js` (puerto 8081).

## Auditoría de cambios

- Antes de modificar políticas en producción, ejecutar los scripts en un entorno de pruebas.
- Revisar diff en Git en cada cambio a `*.sql` en `scripts/`.
- No eliminar políticas sin documentar la razón y la alternativa (p. ej. reemplazo por ABAC).
