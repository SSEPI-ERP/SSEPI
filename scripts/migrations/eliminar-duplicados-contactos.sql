-- ============================================
-- LIMPIEZA DE CONTACTOS DUPLICADOS
-- Ejecutar en Supabase > SQL Editor
-- ============================================

-- Paso 1: Ver duplicados actuales (opcional)
SELECT
    email,
    nombre,
    empresa,
    COUNT(*) as veces_repetido
FROM contactos
GROUP BY LOWER(TRIM(COALESCE(email, ''))), LOWER(TRIM(COALESCE(nombre, ''))), LOWER(TRIM(COALESCE(empresa, '')))
HAVING COUNT(*) > 1
ORDER BY veces_repetido DESC;

-- Paso 2: Eliminar duplicados por email (mantener el de menor ID)
DELETE FROM contactos a
USING contactos b
WHERE a.email IS NOT NULL
  AND a.email = b.email
  AND a.id > b.id;

-- Paso 3: Eliminar duplicados por nombre+empresa (sin email)
DELETE FROM contactos a
USING contactos b
WHERE a.email IS NULL
  AND a.nombre IS NOT NULL
  AND b.nombre IS NOT NULL
  AND LOWER(TRIM(a.nombre)) = LOWER(TRIM(b.nombre))
  AND LOWER(TRIM(COALESCE(a.empresa, ''))) = LOWER(TRIM(COALESCE(b.empresa, '')))
  AND a.id > b.id;

-- Paso 4: Verificar resultado
SELECT
    tipo,
    COUNT(*) as cantidad
FROM contactos
GROUP BY tipo
ORDER BY tipo;

-- Total
SELECT COUNT(*) as total_contactos FROM contactos;
