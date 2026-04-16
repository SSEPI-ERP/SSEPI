-- =====================================================
-- DESHABILITAR RLS EN TABLAS OPERATIVAS
-- Esto evita errores 403 (permission denied) en el frontend
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Tablas operativas principales
ALTER TABLE public.compras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_taller DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_motores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos_automatizacion DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_automatizacion DISABLE ROW LEVEL SECURITY;

-- Tablas auxiliares
ALTER TABLE public.contactos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_servicios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario DISABLE ROW LEVEL SECURITY;

-- Tablas de configuración y usuarios
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_permissions DISABLE ROW LEVEL SECURITY;

-- Tablas de análisis y otros módulos
ALTER TABLE public.gastos_fijos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_seguridad DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_dias_feriados DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacaciones_empleados DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- NOTIFICAR A POSTGREST QUE RECARGUE EL SCHEMA
-- =====================================================
NOTIFY pgrst, 'reload schema';
