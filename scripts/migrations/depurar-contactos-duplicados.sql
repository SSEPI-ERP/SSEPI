-- =====================================================
-- DEPURACIÓN: Eliminar contactos duplicados
-- Regla: conservar el registro con el ID más antiguo (MIN id)
-- Reasignar FK en tablas dependientes antes de borrar
-- =====================================================

-- 1) Crear tabla temporal de mapeo: duplicado -> id original a conservar
CREATE TEMP TABLE tmp_contactos_duplicados AS
SELECT
    c1.id AS id_duplicado,
    c2.id AS id_original
FROM public.contactos c1
JOIN public.contactos c2
    ON c1.id > c2.id
    AND (
        (c1.email IS NOT NULL AND c1.email <> '' AND LOWER(TRIM(c1.email)) = LOWER(TRIM(c2.email)))
        OR (LOWER(TRIM(c1.nombre)) = LOWER(TRIM(c2.nombre)) AND (c1.email IS NULL OR c1.email = ''))
    );

-- 2) Reasignar FK en tablas dependientes
UPDATE public.ordenes_taller o
SET cliente_id = d.id_original
FROM tmp_contactos_duplicados d
WHERE o.cliente_id = d.id_duplicado;

UPDATE public.ordenes_motores o
SET cliente_id = d.id_original
FROM tmp_contactos_duplicados d
WHERE o.cliente_id = d.id_duplicado;

UPDATE public.cotizaciones c
SET cliente_id = d.id_original
FROM tmp_contactos_duplicados d
WHERE c.cliente_id = d.id_duplicado;

UPDATE public.compras c
SET proveedor_id = d.id_original
FROM tmp_contactos_duplicados d
WHERE c.proveedor_id = d.id_duplicado;

UPDATE public.proyectos_automatizacion p
SET cliente_id = d.id_original
FROM tmp_contactos_duplicados d
WHERE p.cliente_id = d.id_duplicado;

-- 3) Si hay tabla clientes_tabulador con columna contacto_id, también reasignar
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clientes_tabulador' AND column_name = 'contacto_id'
    ) THEN
        UPDATE public.clientes_tabulador ct
        SET contacto_id = d.id_original
        FROM tmp_contactos_duplicados d
        WHERE ct.contacto_id = d.id_duplicado;
    END IF;
END $$;

-- 4) Eliminar duplicados
DELETE FROM public.contactos
WHERE id IN (SELECT id_duplicado FROM tmp_contactos_duplicados);

-- 5) Limpiar temp
DROP TABLE tmp_contactos_duplicados;

-- 6) Recargar schema
NOTIFY pgrst, 'reload schema';
