-- =============================================================================
-- MIGRACIÓN: Poblar tabla clientes_tabulador
-- DESCRIPCIÓN: Inserta todos los clientes con KM y horas de viaje
-- EJECUCIÓN: Supabase SQL Editor
-- =============================================================================

-- Limpiar datos existentes (opcional, comentar si no se quiere borrar)
-- DELETE FROM public.clientes_tabulador;

-- Insertar clientes (ON CONFLICT para evitar duplicados)
INSERT INTO public.clientes_tabulador (nombre_cliente, km, horas_viaje) VALUES
    ('ANGUIPLAST', 234, 6),
    ('BOLSAS DE LOS ALTOS', 226, 5),
    ('ECOBOLSAS', 216, 5),
    ('BADER TABACHINES', 17.2, 2),
    ('BODYCOTE', 90.6, 3),
    ('COFICAB', 80, 3),
    ('CONDUMEX', 90.6, 3),
    ('ECSA', 32, 2),
    ('EMMSA', 21.6, 2),
    ('EPC 1', 400, 7),
    ('EPC 2', 402, 8),
    ('FRAENKISCHE', 0, 3),
    ('GEDNEY', 23.6, 3),
    ('GRUPO ACERERO', 386, 7),
    ('HALL PLANTA 1', 73.8, 3),
    ('HIRUTA PLANTA 1', 58.4, 3),
    ('IK PLASTIC', 61.4, 3),
    ('IMPRENTA JM', 16.2, 2),
    ('JARDÍN LA ALEMANA', 12, 2),
    ('MAFLOW', 59.8, 3),
    ('MARQUARDT', 125.4, 4),
    ('MICROONDA', 41.6, 3),
    ('MR LUCKY', 157, 4),
    ('NHK', 138.6, 4),
    ('NISHIKAWA', 61, 3),
    ('PIELES AZTECA', 5, 1),
    ('RONGTAI', 28.2, 3),
    ('SAFE DEMO', 61.6, 3),
    ('ELECTROFORJADOS', 14.6, 2),
    ('SUACERO', 392, 8),
    ('TQ-1', 26, 2),
    ('MINO INDUSTRY', 29.2, 2),
    ('FAS', 0, 0),
    ('GRANOS Y SEMILLAS', 0, 0),
    ('DI CENTRAL', 0, 0),
    ('FAMO ALIMENTOS', 0, 0),
    ('GRUPO ZAHONERO', 0, 0),
    ('CARTO MICRO', 0, 0),
    ('EMMSA LEÓN', 0, 0),
    ('EMMSA SILAO', 0, 0),
    ('TORNIMASTER', 0, 0),
    ('HORMAS PALACIOS', 0, 0),
    ('SADDLEBACK', 0, 0),
    ('PILSAC', 0, 0),
    ('BRUSAROSCO', 0, 0),
    ('HIELO REGIA', 0, 0),
    ('AEROPUERTO', 0, 0),
    ('PRELOSA', 0, 0),
    ('TENERÍA VARGAS', 0, 0),
    ('SOSER', 0, 0),
    ('ARCOSA', 0, 0)
ON CONFLICT (nombre_cliente) DO UPDATE SET
    km = EXCLUDED.km,
    horas_viaje = EXCLUDED.horas_viaje;

-- Verificar datos insertados
SELECT COUNT(*) as total_clientes FROM public.clientes_tabulador;
