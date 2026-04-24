-- ================================================
-- VERIFICAR TABLAS EXISTENTES EN LA BD
-- Ejecutar en Supabase SQL Editor
-- ================================================

-- 1. LISTAR TODAS LAS TABLAS DEL SCHEMA PUBLIC
SELECT
    table_name,
    '✅ Existe' as estado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. VERIFICAR TABLAS CRÍTICAS DEL ERP
SELECT
    t.tabla,
    t.descripcion,
    CASE WHEN e.estado = '✅ Existe' THEN '✅' ELSE '❌ FALTA' END as estado
FROM (
    VALUES
        ('contactos', 'Clientes y proveedores'),
        ('inventario', 'Stock de productos'),
        ('ventas', 'Órdenes de venta'),
        ('cotizaciones', 'Cotizaciones'),
        ('ordenes_taller', 'Órdenes de taller'),
        ('ordenes_motores', 'Órdenes de motores'),
        ('proyectos_automatizacion', 'Proyectos de automatización'),
        ('compras', 'Órdenes de compra'),
        ('facturas', 'Facturas emitidas'),
        ('compras_items', 'Items de compra'),
        ('reservas_material', 'Reservas de inventario'),
        ('movimientos_inventario', 'Auditoría de inventario'),
        ('ordenes_costos', 'Costos por orden'),
        ('parametros_costos', 'Parámetros de costos'),
        ('clientes_tabulador', 'Tabulador de clientes'),
        ('gastos_fijos', 'Gastos fijos'),
        ('usuarios', 'Usuarios del sistema'),
        ('role_permissions', 'Permisos por rol'),
        ('notificaciones', 'Notificaciones'),
        ('coi_sync_queue', 'Cola de sincronización COI')
) AS t(tabla, descripcion)
LEFT JOIN (
    SELECT table_name as tabla, '✅ Existe' as estado
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) e ON t.tabla = e.tabla
ORDER BY estado, tabla;

-- 3. VERIFICAR COLUMNAS EN TABLAS CRÍTICAS
SELECT
    table_name,
    string_agg(column_name, ', ' ORDER BY ordinal_position) as columnas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('compras', 'ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion', 'inventario')
GROUP BY table_name
ORDER BY table_name;

-- 4. VERIFICAR FUNCIONES EXISTENTES
SELECT
    routine_name as funcion,
    string_agg(parameter_name, ', ' ORDER BY ordinal_position) as parametros
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND routine_name IN ('registrar_movimiento_inventario', 'reservar_material', 'recibir_compra')
GROUP BY routine_name
ORDER BY routine_name;

-- 5. VERIFICAR VISTAS EXISTENTES
SELECT
    table_name as vista,
    '✅ Existe' as estado
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'costos_por_orden';

-- 6. CONTAR REGISTROS EN TABLAS PRINCIPALES
SELECT
    'contactos' as tabla, COUNT(*) as registros FROM public.contactos
UNION ALL SELECT 'inventario', COUNT(*) FROM public.inventario
UNION ALL SELECT 'ventas', COUNT(*) FROM public.ventas
UNION ALL SELECT 'compras', COUNT(*) FROM public.compras
UNION ALL SELECT 'ordenes_taller', COUNT(*) FROM public.ordenes_taller
UNION ALL SELECT 'ordenes_motores', COUNT(*) FROM public.ordenes_motores
UNION ALL SELECT 'proyectos_automatizacion', COUNT(*) FROM public.proyectos_automatizacion
UNION ALL SELECT 'cotizaciones', COUNT(*) FROM public.cotizaciones
UNION ALL SELECT 'facturas', COUNT(*) FROM public.facturas
UNION ALL SELECT 'parametros_costos', COUNT(*) FROM public.parametros_costos
UNION ALL SELECT 'clientes_tabulador', COUNT(*) FROM public.clientes_tabulador;
