-- ================================================
-- INSERT COMPLETO - CLIENTES CON VIÁTICOS
-- Datos extraídos del Excel SSEPI
-- KM y Horas de viaje para cálculo de viáticos
-- ================================================

-- Actualizar clientes existentes (coinciden por nombre)
UPDATE public.contactos SET km = 226, horas_viaje = 5 WHERE nombre ILIKE '%BOLSAS DE LOS ALTOS%';
UPDATE public.contactos SET km = 234, horas_viaje = 6 WHERE nombre ILIKE '%ANGUI%';
UPDATE public.contactos SET km = 216, horas_viaje = 5 WHERE nombre ILIKE '%ECOBOLSAS%';
UPDATE public.contactos SET km = 17.2, horas_viaje = 2 WHERE nombre ILIKE '%BADER%';
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%BODYCOTE%';
UPDATE public.contactos SET km = 80, horas_viaje = 3 WHERE nombre ILIKE '%COFICAB%';
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%CONDUMEX%';
UPDATE public.contactos SET km = 32, horas_viaje = 2 WHERE nombre ILIKE '%ECSA%';
UPDATE public.contactos SET km = 21.6, horas_viaje = 2 WHERE nombre ILIKE '%EMMSA%';
UPDATE public.contactos SET km = 400, horas_viaje = 7 WHERE nombre ILIKE '%EPC 1%';
UPDATE public.contactos SET km = 402, horas_viaje = 8 WHERE nombre ILIKE '%EPC 2%';
UPDATE public.contactos SET km = 79.4, horas_viaje = 3 WHERE nombre ILIKE '%FRAENKISCHE%';
UPDATE public.contactos SET km = 23.6, horas_viaje = 3 WHERE nombre ILIKE '%GEDNEY%';
UPDATE public.contactos SET km = 386, horas_viaje = 7 WHERE nombre ILIKE '%GRUPO ACERERO%';
UPDATE public.contactos SET km = 73.8, horas_viaje = 3 WHERE nombre ILIKE '%HALL%';
UPDATE public.contactos SET km = 58.4, horas_viaje = 3 WHERE nombre ILIKE '%HIRUTA%';
UPDATE public.contactos SET km = 61.4, horas_viaje = 3 WHERE nombre ILIKE '%IK PLASTIC%';
UPDATE public.contactos SET km = 16.2, horas_viaje = 2 WHERE nombre ILIKE '%IMPRENTA%';
UPDATE public.contactos SET km = 12, horas_viaje = 2 WHERE nombre ILIKE '%JARDÍN%';
UPDATE public.contactos SET km = 59.8, horas_viaje = 3 WHERE nombre ILIKE '%MAFLOW%';
UPDATE public.contactos SET km = 125.4, horas_viaje = 4 WHERE nombre ILIKE '%MARQUARDT%';
UPDATE public.contactos SET km = 41.6, horas_viaje = 3 WHERE nombre ILIKE '%MICROONDA%';
UPDATE public.contactos SET km = 157, horas_viaje = 4 WHERE nombre ILIKE '%MR LUCKY%';
UPDATE public.contactos SET km = 138.6, horas_viaje = 4 WHERE nombre ILIKE '%NHK%';
UPDATE public.contactos SET km = 61, horas_viaje = 3 WHERE nombre ILIKE '%NISHIKAWA%';
UPDATE public.contactos SET km = 5, horas_viaje = 1 WHERE nombre ILIKE '%PIELES%';
UPDATE public.contactos SET km = 28.2, horas_viaje = 3 WHERE nombre ILIKE '%RONGTAI%';
UPDATE public.contactos SET km = 61.6, horas_viaje = 3 WHERE nombre ILIKE '%SAFE%';
UPDATE public.contactos SET km = 14.6, horas_viaje = 2 WHERE nombre ILIKE '%ELECTROFORJADOS%';
UPDATE public.contactos SET km = 392, horas_viaje = 8 WHERE nombre ILIKE '%SUACERO%';
UPDATE public.contactos SET km = 26, horas_viaje = 2 WHERE nombre ILIKE '%TQ-1%';
UPDATE public.contactos SET km = 29.2, horas_viaje = 2 WHERE nombre ILIKE '%MINO%';

-- Insertar clientes nuevos que no existen en la tabla contactos
INSERT INTO public.contactos (nombre, tipo, km, horas_viaje, email, telefono, empresa)
SELECT * FROM (
    VALUES
    ('BOLSAS DE LOS ALTOS', 'cliente', 226, 5, '', '', 'BOLSAS DE LOS ALTOS'),
    ('ANGUIPALST', 'cliente', 234, 6, '', '', 'ANGUIPALST'),
    ('ECOBOLSAS', 'cliente', 216, 5, '', '', 'ECOBOLSAS'),
    ('BADER TABACHINES', 'cliente', 17.2, 2, '', '', 'BADER TABACHINES'),
    ('BODYCOTE', 'cliente', 90.6, 3, '', '', 'BODYCOTE'),
    ('COFICAB', 'cliente', 80, 3, '', '', 'COFICAB'),
    ('CONDUMEX', 'cliente', 90.6, 3, '', '', 'CONDUMEX'),
    ('ECSA', 'cliente', 32, 2, '', '', 'ECSA'),
    ('EMMSA', 'cliente', 21.6, 2, '', '', 'EMMSA'),
    ('EPC 1', 'cliente', 400, 7, '', '', 'EPC 1'),
    ('EPC 2', 'cliente', 402, 8, '', '', 'EPC 2'),
    ('FRAENKISCHE', 'cliente', 79.4, 3, '', '', 'FRAENKISCHE'),
    ('GEDNEY', 'cliente', 23.6, 3, '', '', 'GEDNEY'),
    ('GRUPO ACERERO', 'cliente', 386, 7, '', '', 'GRUPO ACERERO'),
    ('HALL PLANTA 1', 'cliente', 73.8, 3, '', '', 'HALL PLANTA 1'),
    ('HIRUTA PLANTA 1', 'cliente', 58.4, 3, '', '', 'HIRUTA PLANTA 1'),
    ('IK PLASTIC', 'cliente', 61.4, 3, '', '', 'IK PLASTIC'),
    ('IMPRENTA JM', 'cliente', 16.2, 2, '', '', 'IMPRENTA JM'),
    ('JARDÍN LA ALEMANA', 'cliente', 12, 2, '', '', 'JARDÍN LA ALEMANA'),
    ('MAFLOW', 'cliente', 59.8, 3, '', '', 'MAFLOW'),
    ('MARQUARDT', 'cliente', 125.4, 4, '', '', 'MARQUARDT'),
    ('MICROONDA', 'cliente', 41.6, 3, '', '', 'MICROONDA'),
    ('MR LUCKY', 'cliente', 157, 4, '', '', 'MR LUCKY'),
    ('NHK', 'cliente', 138.6, 4, '', '', 'NHK'),
    ('NISHIKAWA', 'cliente', 61, 3, '', '', 'NISHIKAWA'),
    ('PIELES AZTECA', 'cliente', 5, 1, '', '', 'PIELES AZTECA'),
    ('RONGTAI', 'cliente', 28.2, 3, '', '', 'RONGTAI'),
    ('SAFE DEMO', 'cliente', 61.6, 3, '', '', 'SAFE DEMO'),
    ('ELECTROFORJADOS', 'cliente', 14.6, 2, '', '', 'ELECTROFORJADOS'),
    ('SUACERO', 'cliente', 392, 8, '', '', 'SUACERO'),
    ('TQ-1', 'cliente', 26, 2, '', '', 'TQ-1'),
    ('MINO INDUSTRY', 'cliente', 29.2, 2, '', '', 'MINO INDUSTRY'),
    -- Clientes adicionales de la lista
    ('FAS', 'cliente', 0, 4, '', '', 'FAS'),
    ('GRANOS Y SEMILLAS', 'cliente', 0, 4, '', '', 'GRANOS Y SEMILLAS'),
    ('DI CENTRAL', 'cliente', 0, 3, '', '', 'DI CENTRAL'),
    ('FAMO ALIMENTOS', 'cliente', 0, 3, '', '', 'FAMO ALIMENTOS'),
    ('GRUPO ZAHONERO', 'cliente', 0, 2, '', '', 'GRUPO ZAHONERO'),
    ('CARTO MICRO', 'cliente', 0, 2, '', '', 'CARTO MICRO'),
    ('EMMSA LEÓN', 'cliente', 0, 2, '', '', 'EMMSA LEÓN'),
    ('EMMSA SILAO', 'cliente', 0, 2, '', '', 'EMMSA SILAO'),
    ('TORNIMASTER', 'cliente', 0, 3, '', '', 'TORNIMASTER'),
    ('HORMAS PALACIOS', 'cliente', 0, 2, '', '', 'HORMAS PALACIOS'),
    ('SADDLEBACK', 'cliente', 0, 2, '', '', 'SADDLEBACK'),
    ('PILSAC', 'cliente', 0, 2, '', '', 'PILSAC'),
    ('BRUSAROSCO', 'cliente', 0, 2, '', '', 'BRUSAROSCO'),
    ('HIELO REGIA', 'cliente', 0, 2, '', '', 'HIELO REGIA'),
    ('AEROPUERTO', 'cliente', 0, 2, '', '', 'AEROPUERTO'),
    ('PRELOSA', 'cliente', 0, 3, '', '', 'PRELOSA'),
    ('TENERÍA VARGAS', 'cliente', 0, 2, '', '', 'TENERÍA VARGAS'),
    ('SOSER', 'cliente', 0, 2, '', '', 'SOSER'),
    ('ARCOSA', 'cliente', 0, 4, '', '', 'ARCOSA')
) AS nuevos(nombre, tipo, km, horas_viaje, email, telefono, empresa)
WHERE NOT EXISTS (
    SELECT 1 FROM public.contactos c
    WHERE c.nombre ILIKE '%' || nuevos.nombre || '%'
);

-- Notificar a PostgREST que recargue el schema
NOTIFY pgrst, 'reload schema';
