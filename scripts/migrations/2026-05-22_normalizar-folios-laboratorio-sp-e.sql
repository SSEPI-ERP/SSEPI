-- Normaliza folios de laboratorio (ordenes_taller): SP-#### / SP.#### / SP#### → SP-E####
-- Ejecutar con backup. No toca SP-M, SP-A, SP-S, SP-OC, SP-SOP, RE-, WHRO-.

CREATE OR REPLACE FUNCTION public.normalize_folio_laboratorio(p_folio TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
  digits TEXT;
BEGIN
  IF p_folio IS NULL OR btrim(p_folio) = '' THEN
    RETURN p_folio;
  END IF;
  s := upper(regexp_replace(btrim(p_folio), '\s+', '', 'g'));
  IF s ~ '^(SP-M|SP-A|SP-S|SP-OC|SP-SOP)' THEN
    RETURN s;
  END IF;
  IF s ~ '^SP-E' THEN
    RETURN s;
  END IF;
  IF s ~ '^SP-(\d{2,})' THEN
    digits := substring(s from '^SP-(\d{2,})');
    RETURN 'SP-E' || digits;
  END IF;
  IF s ~ '^SP\.(\d{2,})' THEN
    digits := substring(s from '^SP\.(\d{2,})');
    RETURN 'SP-E' || digits;
  END IF;
  IF s ~ '^SP(\d{3,})$' THEN
    digits := substring(s from '^SP(\d{3,})$');
    RETURN 'SP-E' || digits;
  END IF;
  RETURN s;
END;
$$;

COMMENT ON FUNCTION public.normalize_folio_laboratorio(TEXT) IS
  'Convierte folios legacy de laboratorio a prefijo SP-E (electrónica).';

-- 1) Referencias en compras (JSON vinculacion)
UPDATE public.compras c
SET vinculacion = jsonb_set(
  c.vinculacion,
  '{folio_taller}',
  to_jsonb(public.normalize_folio_laboratorio(c.vinculacion->>'folio_taller'))
)
WHERE c.vinculacion->>'folio_taller' IS NOT NULL
  AND c.vinculacion->>'folio_taller' <> public.normalize_folio_laboratorio(c.vinculacion->>'folio_taller');

UPDATE public.compras c
SET vinculacion = jsonb_set(
  c.vinculacion,
  '{folio}',
  to_jsonb(public.normalize_folio_laboratorio(c.vinculacion->>'folio'))
)
WHERE c.vinculacion->>'tipo' = 'taller'
  AND c.vinculacion->>'folio' IS NOT NULL
  AND c.vinculacion->>'folio' <> public.normalize_folio_laboratorio(c.vinculacion->>'folio');

-- 2) compra_folio en la orden (texto)
UPDATE public.ordenes_taller o
SET compra_folio = public.normalize_folio_laboratorio(o.compra_folio)
WHERE o.compra_folio IS NOT NULL
  AND o.compra_folio <> public.normalize_folio_laboratorio(o.compra_folio);

-- 3) Eliminar duplicados legacy cuando ya existe SP-E (conservar fila SP-E)
DELETE FROM public.ordenes_taller legacy
USING public.ordenes_taller canon
WHERE legacy.id <> canon.id
  AND public.normalize_folio_laboratorio(legacy.folio) = canon.folio
  AND legacy.folio <> canon.folio
  AND canon.folio ~ '^SP-E';

-- 4) Renombrar folios en ordenes_taller (sin colisión)
UPDATE public.ordenes_taller o
SET folio = public.normalize_folio_laboratorio(o.folio)
WHERE o.folio IS NOT NULL
  AND o.folio <> public.normalize_folio_laboratorio(o.folio)
  AND NOT EXISTS (
    SELECT 1
    FROM public.ordenes_taller x
    WHERE x.folio = public.normalize_folio_laboratorio(o.folio)
      AND x.id <> o.id
  );

-- 5) Cotizaciones vinculadas a taller (folio visible)
UPDATE public.cotizaciones cot
SET folio = public.normalize_folio_laboratorio(cot.folio)
WHERE cot.origen IN ('taller', 'electronicos', 'laboratorio')
  AND cot.folio IS NOT NULL
  AND cot.folio <> public.normalize_folio_laboratorio(cot.folio)
  AND NOT EXISTS (
    SELECT 1 FROM public.cotizaciones x
    WHERE x.folio = public.normalize_folio_laboratorio(cot.folio)
      AND x.id <> cot.id
  );

-- 6) Sincronizar foliador SP-E
DO $$
DECLARE
  max_sp_e INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(folio, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
  INTO max_sp_e
  FROM public.ordenes_taller
  WHERE folio LIKE 'SP-E%';

  INSERT INTO public.foliador_control (tipo, ultimo_folio, ultimo_folio_entero)
  VALUES ('SP-E', GREATEST(max_sp_e, 0), GREATEST(max_sp_e, 0))
  ON CONFLICT (tipo) DO UPDATE SET
    ultimo_folio = GREATEST(EXCLUDED.ultimo_folio, public.foliador_control.ultimo_folio),
    ultimo_folio_entero = GREATEST(EXCLUDED.ultimo_folio_entero, public.foliador_control.ultimo_folio_entero),
    updated_at = NOW();
END $$;

-- Diagnóstico: folios legacy que siguen sin SP-E (revisar manualmente)
-- SELECT folio, COUNT(*) FROM public.ordenes_taller
-- WHERE folio ~ '^SP[^E]' OR folio ~ '^SP-'
-- GROUP BY folio;
