-- ================================================
-- CLIENTES FALTANTES - VIÁTICOS COMPLETOS
-- Basado en datos del Excel SSEPI
-- ================================================

-- Insertar clientes que NO existen en la tabla contactos
INSERT INTO public.contactos (nombre, tipo, km, horas_viaje, email, telefono, empresa)
SELECT * FROM (
    VALUES
    -- Clientes con KM definido (primera tabla del Excel)
    ('BOLSAS DE LOS ALTOS', 'cliente', 226, 5, '', '', 'BOLSAS DE LOS ALTOS'),
    ('ECOBOLSAS', 'cliente', 216, 5, '', '', 'ECOBOLSAS'),
    ('BADER TABACHINES', 'cliente', 17.2, 2, '', '', 'BADER TABACHINES'),
    ('BODYCOTE', 'cliente', 90.6, 3, '', '', 'BODYCOTE'),
    ('COFICAB', 'cliente', 80, 3, '', '', 'COFICAB'),
    ('CONDUMEX', 'cliente', 90.6, 3, '', '', 'CONDUMEX'),
    ('ECSA', 'cliente', 32, 2, '', '', 'ECSA'),
    ('EMMSA', 'cliente', 21.6, 2, '', '', 'EMMSA'),
    ('EPC 2', 'cliente', 402, 8, '', '', 'EPC 2'),
    ('FRAENKISCHE', 'cliente', 79.4, 3, '', '', 'FRAENKISCHE'),
    ('HIRUTA PLANTA 1', 'cliente', 58.4, 3, '', '', 'HIRUTA PLANTA 1'),
    ('IK PLASTIC', 'cliente', 61.4, 3, '', '', 'IK PLASTIC'),
    ('MARQUARDT', 'cliente', 125.4, 4, '', '', 'MARQUARDT'),
    ('MR LUCKY', 'cliente', 157, 4, '', '', 'MR LUCKY'),
    ('NHK', 'cliente', 138.6, 4, '', '', 'NHK'),
    ('NISHIKAWA', 'cliente', 61, 3, '', '', 'NISHIKAWA'),
    ('PIELES AZTECA', 'cliente', 5, 1, '', '', 'PIELES AZTECA'),
    ('RONGTAI', 'cliente', 28.2, 3, '', '', 'RONGTAI'),
    ('ELECTROFORJADOS', 'cliente', 14.6, 2, '', '', 'ELECTROFORJADOS'),
    ('SUACERO', 'cliente', 392, 8, '', '', 'SUACERO'),
    ('TQ-1', 'cliente', 26, 2, '', '', 'TQ-1'),
    ('MINO INDUSTRY', 'cliente', 29.2, 2, '', '', 'MINO INDUSTRY'),

    -- Clientes adicionales sin KM definido (segunda parte del Excel)
    ('FAS', 'cliente', 0, 4, '', '', 'FAS'),
    ('EMMSA LEÓN', 'cliente', 0, 2, '', '', 'EMMSA LEÓN'),
    ('EMMSA SILAO', 'cliente', 0, 2, '', '', 'EMMSA SILAO'),
    ('PRELOSA', 'cliente', 0, 3, '', '', 'PRELOSA'),
    ('TENERÍA VARGAS', 'cliente', 0, 2, '', '', 'TENERÍA VARGAS'),
    ('SOSER', 'cliente', 0, 2, '', '', 'SOSER'),
    ('ARCOSA', 'cliente', 0, 4, '', '', 'ARCOSA'),
    ('AEROPUERTO', 'cliente', 0, 2, '', '', 'AEROPUERTO')
) AS nuevos(nombre, tipo, km, horas_viaje, email, telefono, empresa)
WHERE NOT EXISTS (
    SELECT 1 FROM public.contactos c
    WHERE c.nombre ILIKE '%' || nuevos.nombre || '%'
);

-- Actualizar clientes existentes que tienen KM=0 pero deberían tener valor
UPDATE public.contactos SET km = 226, horas_viaje = 5 WHERE nombre ILIKE '%BOLSAS DE LOS ALTOS%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 216, horas_viaje = 5 WHERE nombre ILIKE '%ECOBOLSAS%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 17.2, horas_viaje = 2 WHERE nombre ILIKE '%BADER%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%BODYCOTE%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 80, horas_viaje = 3 WHERE nombre ILIKE '%COFICAB%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%CONDUMEX%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 32, horas_viaje = 2 WHERE nombre ILIKE '%ECSA%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 21.6, horas_viaje = 2 WHERE nombre ILIKE '%EMMSA%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 402, horas_viaje = 8 WHERE nombre ILIKE '%EPC 2%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 79.4, horas_viaje = 3 WHERE nombre ILIKE '%FRAENKISCHE%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 58.4, horas_viaje = 3 WHERE nombre ILIKE '%HIRUTA%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 61.4, horas_viaje = 3 WHERE nombre ILIKE '%IK PLASTIC%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 125.4, horas_viaje = 4 WHERE nombre ILIKE '%MARQUARDT%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 157, horas_viaje = 4 WHERE nombre ILIKE '%MR LUCKY%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 138.6, horas_viaje = 4 WHERE nombre ILIKE '%NHK%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 61, horas_viaje = 3 WHERE nombre ILIKE '%NISHIKAWA%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 5, horas_viaje = 1 WHERE nombre ILIKE '%PIELES%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 28.2, horas_viaje = 3 WHERE nombre ILIKE '%RONGTAI%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 14.6, horas_viaje = 2 WHERE nombre ILIKE '%ELECTROFORJADOS%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 392, horas_viaje = 8 WHERE nombre ILIKE '%SUACERO%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 26, horas_viaje = 2 WHERE nombre ILIKE '%TQ-1%' AND (km = 0 OR km IS NULL);
UPDATE public.contactos SET km = 29.2, horas_viaje = 2 WHERE nombre ILIKE '%MINO%' AND (km = 0 OR km IS NULL);

-- Notificar a PostgREST que recargue el schema
NOTIFY pgrst, 'reload schema';
