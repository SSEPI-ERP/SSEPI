-- Limpieza de contactos duplicados
-- Ejecutar con cuidado: elimina duplicados manteniendo el registro más antiguo

-- 1. Identificar duplicados por email
WITH duplicados_email AS (
    SELECT
        id,
        email,
        ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email)) ORDER BY created_at ASC) as rn
    FROM contactos
    WHERE email IS NOT NULL AND TRIM(email) != ''
)
SELECT 'Duplicados por email:' as info, COUNT(*) as total
FROM duplicados_email WHERE rn > 1;

-- 2. Identificar duplicados por nombre + empresa (sin email)
WITH duplicados_nombre AS (
    SELECT
        id,
        nombre,
        empresa,
        ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(COALESCE(nombre, ''))) || '|' || LOWER(TRIM(COALESCE(empresa, ''))) ORDER BY created_at ASC) as rn
    FROM contactos
    WHERE (email IS NULL OR TRIM(email) = '')
      AND (nombre IS NOT NULL OR empresa IS NOT NULL)
)
SELECT 'Duplicados por nombre+empresa:' as info, COUNT(*) as total
FROM duplicados_nombre WHERE rn > 1;

-- 3. Eliminar duplicados por email (mantener el más antiguo)
WITH duplicados_email AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email)) ORDER BY created_at ASC) as rn
    FROM contactos
    WHERE email IS NOT NULL AND TRIM(email) != ''
)
DELETE FROM contactos
WHERE id IN (SELECT id FROM duplicados_email WHERE rn > 1);

-- 4. Eliminar duplicados por nombre+empresa (mantener el más antiguo)
WITH duplicados_nombre AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(COALESCE(nombre, ''))) || '|' || LOWER(TRIM(COALESCE(empresa, '')))
            ORDER BY created_at ASC
        ) as rn
    FROM contactos
    WHERE (email IS NULL OR TRIM(email) = '')
      AND (nombre IS NOT NULL OR empresa IS NOT NULL)
)
DELETE FROM contactos
WHERE id IN (SELECT id FROM duplicados_nombre WHERE rn > 1);

-- 5. Verificar resultado
SELECT
    'Contactos restantes' as info,
    COUNT(*) as total
FROM contactos;

SELECT
    tipo,
    COUNT(*) as cantidad
FROM contactos
GROUP BY tipo
ORDER BY tipo;
