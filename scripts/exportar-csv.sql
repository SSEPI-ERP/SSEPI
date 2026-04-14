-- =============================================================================
-- EXPORTAR DATOS COMO CSV
-- PROPÓSITO: Generar archivos CSV para migrar al nuevo Supabase
-- EJECUCIÓN: En el SQL Editor del Supabase VIEJO
-- NOTA: Supabase no permite COPY TO directamente, usar Table Editor para exportar
-- =============================================================================

-- Este script genera queries que podés copiar y usar para verificar los datos
-- antes de exportar desde Table Editor

-- =============================================================================
-- INSTRUCCIONES PARA EXPORTAR:
-- =============================================================================
-- 1. Ir a Table Editor en Supabase VIEJO
-- 2. Para cada tabla abajo:
--    - Click en la tabla
--    - Click en ⋮ (tres puntos, arriba derecha)
--    - "Export data" → seleccionar CSV
--    - Guardar con el nombre indicado
-- =============================================================================

-- TABLAS A EXPORTAR (en orden):
-- 1. usuarios → usuarios.csv
-- 2. role_permissions → role_permissions.csv
-- 3. contactos → contactos.csv
-- 4. clientes → clientes.csv
-- 5. inventario → inventario.csv
-- 6. movimientos_inventario → movimientos_inventario.csv
-- 7. vacaciones_dias_feriados → vacaciones_dias_feriados.csv
-- 8. vacaciones_empleados → vacaciones_empleados.csv
-- 9. catalogo_servicios → catalogo_servicios.csv
-- 10. gastos_fijos → gastos_fijos.csv

-- =============================================================================
-- VERIFICAR DATOS ANTES DE EXPORTAR:
-- =============================================================================

-- Usuarios (8 registros)
SELECT auth_user_id, email, nombre, rol, departamento
FROM public.usuarios
WHERE auth_user_id IS NOT NULL;

-- Role permissions (111 registros)
SELECT rol, module, action FROM public.role_permissions LIMIT 20;

-- Contactos (57 registros)
SELECT nombre, email, telefono, empresa, tipo FROM public.contactos LIMIT 10;

-- Clientes (33 registros)
SELECT nombre, email, telefono, ruc FROM public.clientes LIMIT 10;

-- Inventario (104 registros)
SELECT sku, nombre, cantidad, precio_costo, precio_venta FROM public.inventario LIMIT 10;

-- =============================================================================
-- FIN
-- =============================================================================
