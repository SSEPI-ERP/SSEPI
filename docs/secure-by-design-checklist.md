# Checklist de modelado de amenazas (Secure by Design)

Usar este checklist al diseñar o revisar una **nueva funcionalidad** del ERP para identificar riesgos y mitigaciones desde el diseño.

## 1. Datos y confidencialidad

- [ ] ¿La funcionalidad maneja datos personales (PII) o sensibles (salud, financieros)?
  - Si sí: ¿están cifrados en reposo (columna cifrada o BYOK)? ¿Se registra el acceso en auditoría?
- [ ] ¿Qué tablas/columnas nuevas se leen o escriben? ¿Tienen RLS y políticas actualizadas?
- [ ] ¿Se exponen datos agregados o reportes que puedan inferir información de otros usuarios? ¿Hay control por rol/departamento?

## 2. Autenticación y autorización

- [ ] ¿Quién puede acceder a la nueva pantalla o API? ¿Rol(es) y/o permisos en `role_permissions`?
- [ ] ¿Hay restricciones SoD (Segregación de Funciones)? ¿La nueva acción entra en conflicto con alguna en `sod_constraints`?
- [ ] ¿Se usa `hasPermission(module, action)` o equivalente en el frontend y RLS en el backend (Supabase)?

## 3. Superficie de ataque

- [ ] ¿Hay nuevos puntos de entrada (formularios, APIs, webhooks)? ¿Se validan y sanitizan todas las entradas?
- [ ] ¿Se evita uso de `eval`, `innerHTML` con datos de usuario, concatenación de SQL?
- [ ] ¿Los mensajes de error no revelan información interna (stack traces, esquema de BD)?

## 4. Auditoría y respuesta

- [ ] ¿Las acciones críticas (crear, modificar, eliminar) se registran en `audit_logs` con `action`, `user_id`, `ip`, `severity`?
- [ ] ¿Hay eventos que deban disparar alertas (ej. acceso a datos sensibles fuera de horario)?

## 5. Dependencias y despliegue

- [ ] ¿Se añaden nuevas dependencias JS/npm? ¿Se actualiza el SBOM y se ejecuta `npm audit`?
- [ ] ¿La funcionalidad requiere nuevas variables de entorno o secretos? ¿Están documentados y no hardcodeados?

---

**Uso:** Marcar los ítems al diseñar la funcionalidad y antes del code review. Incluir el checklist cumplido (o las excepciones justificadas) en la descripción del PR o en la documentación del módulo.
