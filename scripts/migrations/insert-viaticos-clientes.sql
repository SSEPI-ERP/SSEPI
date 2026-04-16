-- ================================================
-- INSERT VIÁTICOS PARA CLIENTES
-- Datos extraídos de SSEPI_DataViewer_Completo.html
-- ================================================

-- Primero actualizamos contactos existentes con KM y horas_viaje

-- Actualizar clientes existentes
-- ================================================
-- 1. ACTUALIZAR CLIENTES EXISTENTES
-- ================================================
UPDATE public.contactos SET km = 216, horas_viaje = 5 WHERE nombre ILIKE '%ECOBOLSAS%';
UPDATE public.contactos SET km = 17.2, horas_viaje = 2 WHERE nombre ILIKE '%BADER%';
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%BODYCOTE%';
UPDATE public.contactos SET km = 80, horas_viaje = 3 WHERE nombre ILIKE '%COFICAB%';
UPDATE public.contactos SET km = 90.6, horas_viaje = 3 WHERE nombre ILIKE '%CONDUMEX%';
UPDATE public.contactos SET km = 32, horas_viaje = 2 WHERE nombre ILIKE '%ECSA%';
UPDATE public.contactos SET km = 21.6, horas_viaje = 2 WHERE nombre ILIKE '%EMMSA%';
UPDATE public.contactos SET km = 402, horas_viaje = 8 WHERE nombre ILIKE '%EPC 2%';
UPDATE public.contactos SET km = 79.4, horas_viaje = 3 WHERE nombre ILIKE '%Fraenkische%';
UPDATE public.contactos SET km = 58.4, horas_viaje = 3 WHERE nombre ILIKE '%HIRUTA%';
UPDATE public.contactos SET km = 61.4, horas_viaje = 3 WHERE nombre ILIKE '%IK PLASTIC%';
UPDATE public.contactos SET km = 125.4, horas_viaje = 4 WHERE nombre ILIKE '%MARQ%';
UPDATE public.contactos SET km = 157, horas_viaje = 4 WHERE nombre ILIKE '%MR LUCKY%';
UPDATE public.contactos SET km = 138.6, horas_viaje = 4 WHERE nombre ILIKE '%NHK%';
UPDATE public.contactos SET km = 61, horas_viaje = 3 WHERE nombre ILIKE '%Nishikawa%';
UPDATE public.contactos SET km = 5, horas_viaje = 1 WHERE nombre ILIKE '%Pieles Azteca%';
UPDATE public.contactos SET km = 28.2, horas_viaje = 3 WHERE nombre ILIKE '%RONGTAI%';

-- ================================================
-- 2. INSERTAR CLIENTES NUEVOS CON SUS VIÁTICOS
-- ================================================
INSERT INTO public.contactos (nombre, tipo, km, horas_viaje, pais) VALUES
('ANGUIPALST', 'cliente', 234, 6, 'México'),
('EPC 1', 'cliente', 400, 7, 'México'),
('GEDNEY', 'cliente', 23.6, 3, 'México'),
('GRUPO ACERERO', 'cliente', 386, 7, 'México'),
('HALL PLANTA 1', 'cliente', 73.8, 3, 'México'),
('IMPRENTA JM', 'cliente', 16.2, 2, 'México'),
('JARDÍN LA ALEMANA', 'cliente', 12, 2, 'México'),
('MAFLOW', 'cliente', 59.8, 3, 'México'),
('MICROONDA', 'cliente', 41.6, 3, 'México'),
('SAFE DEMO', 'cliente', 61.6, 3, 'México'),
('ELECTROFORJADOS', 'cliente', 14.6, 2, 'México'),
('SUACERO', 'cliente', 392, 8, 'México'),
('TQ-1', 'cliente', 26, 2, 'México'),
('MINO INDUSTRY', 'cliente', 29.2, 2, 'México');

-- ================================================
-- 3. NOTIFICAR A POSTGREST QUE RECARGUE EL SCHEMA
-- ================================================
NOTIFY pgrst, 'reload schema';
