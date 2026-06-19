-- =====================================================
-- cloud-cleanup-policies.sql
-- Elimina politicas legacy demasiado permisivas que
-- permiten acceso anonimo o null-owner en tablas operacionales.
-- =====================================================

-- contactos: politicas con created_by IS NULL permiten anon
DROP POLICY IF EXISTS "contactos_select_own" ON public.contactos;
DROP POLICY IF EXISTS "contactos_insert_authenticated" ON public.contactos;
DROP POLICY IF EXISTS "contactos_delete_own" ON public.contactos;
DROP POLICY IF EXISTS "contactos_update_own" ON public.contactos;

-- catalogo_servicios: SELECT true para cualquier rol
DROP POLICY IF EXISTS "servicios_select_all" ON public.catalogo_servicios;

-- inventario: SELECT true / created_by IS NULL
DROP POLICY IF EXISTS "inventario_read_authenticated" ON public.inventario;
DROP POLICY IF EXISTS "inventario_select_all" ON public.inventario;
DROP POLICY IF EXISTS "inventario_modify_admin_or_owner" ON public.inventario;

-- movimientos_inventario: SELECT true
DROP POLICY IF EXISTS "movimientos_read_authenticated" ON public.movimientos_inventario;

-- facturas: ALL/SELECT/UPDATE/DELETE true
DROP POLICY IF EXISTS "facturas_all" ON public.facturas;
DROP POLICY IF EXISTS "facturas_select_auth" ON public.facturas;
DROP POLICY IF EXISTS "facturas_update_auth" ON public.facturas;
DROP POLICY IF EXISTS "facturas_delete_auth" ON public.facturas;

-- ordenes_taller: SELECT true
DROP POLICY IF EXISTS "taller_select_on_orders" ON public.ordenes_taller;

-- ordenes_motores: ALL true
DROP POLICY IF EXISTS "Authenticated full access motores" ON public.ordenes_motores;

-- proyectos_automatizacion: SELECT/UPDATE/DELETE true
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.proyectos_automatizacion;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.proyectos_automatizacion;

NOTIFY pgrst, 'reload schema';
