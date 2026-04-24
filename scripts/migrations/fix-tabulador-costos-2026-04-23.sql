-- =====================================================
-- FIX: Tabulador de Costos - TODOS LOS DEPARTAMENTOS
-- Basado en TABULADOR_DE_COTIZACIÓN.xlsx (5 hojas)
-- =====================================================

-- 1. LIMPIAR duplicados en contactos
DELETE FROM public.contactos a USING public.contactos b
WHERE a.id < b.id AND a.email = b.email;

-- 2. ESTRUCTURA parametros_costos (columnas dinámicas)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'clave') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN clave TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'valor') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN valor NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'descripcion') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN descripcion TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'departamento') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN departamento TEXT DEFAULT 'general';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parametros_costos' AND column_name = 'activo') THEN
        ALTER TABLE public.parametros_costos ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 3. PARAMETROS POR DEPARTAMENTO (valores del Excel)
DELETE FROM public.parametros_costos WHERE clave LIKE '%_%';

INSERT INTO public.parametros_costos (clave, valor, descripcion, departamento, activo) VALUES
    -- LABORATORIO (hoja 2)
    ('lab_gasolina_precio_litro', 30.00, 'Precio por litro de gasolina', 'laboratorio', true),
    ('lab_rendimiento_km_litro', 10.00, 'Rendimiento km por litro', 'laboratorio', true),
    ('lab_ventas_por_dia', 87.00, 'Costo por día de ventas', 'laboratorio', true),
    ('lab_tiempo_invertido_hr', 80.00, 'Costo por hora de tiempo invertido', 'laboratorio', true),
    ('lab_gastos_fijos_hr', 161.85, 'Gastos fijos por hora', 'laboratorio', true),
    ('lab_camioneta_hr', 52.67, 'Costo por hora de camioneta', 'laboratorio', true),
    ('lab_utilidad_base', 40.00, 'Utilidad base 40%', 'laboratorio', true),
    ('lab_utilidad_premium', 45.00, 'Utilidad premium 45%', 'laboratorio', true),
    ('lab_credito_pct', 3.00, 'Costo de crédito 3%', 'laboratorio', true),

    -- MOTORES (hoja 3)
    ('mot_gasolina_precio_litro', 30.00, 'Precio por litro de gasolina', 'motores', true),
    ('mot_rendimiento_km_litro', 10.00, 'Rendimiento km por litro', 'motores', true),
    ('mot_ventas_por_dia', 87.00, 'Costo por día de ventas', 'motores', true),
    ('mot_camioneta_hr', 52.67, 'Costo por hora de camioneta', 'motores', true),
    ('mot_utilidad_base', 40.00, 'Utilidad base 40%', 'motores', true),
    ('mot_utilidad_premium', 45.00, 'Utilidad premium 45%', 'motores', true),
    ('mot_credito_pct', 3.00, 'Costo de crédito 3%', 'motores', true),

    -- AUTOMATIZACIÓN (hoja 4) - tarifas por servicio
    ('aut_plc_hmi_hr', 650.00, 'Programación PLC/HMI por hora', 'automatizacion', true),
    ('aut_servomotor_hr', 700.00, 'Servomotor por hora', 'automatizacion', true),
    ('aut_diseno_tablero_hr', 450.00, 'Diseño de tablero por hora', 'automatizacion', true),
    ('aut_diseno_mecanico_hr', 900.00, 'Diseño mecánico por hora', 'automatizacion', true),
    ('aut_instalacion_hr', 350.00, 'Instalación por hora', 'automatizacion', true),
    ('aut_fabricacion_hr', 600.00, 'Fabricación por hora', 'automatizacion', true),
    ('aut_soporte_hr', 1100.00, 'Soporte por hora', 'automatizacion', true),
    ('aut_arquitectura_hr', 150.00, 'Arquitectura por hora', 'automatizacion', true),
    ('aut_camioneta_hr', 52.67, 'Costo por hora de camioneta', 'automatizacion', true),
    ('aut_gasolina_precio_litro', 30.00, 'Precio por litro de gasolina', 'automatizacion', true),
    ('aut_rendimiento_km_litro', 10.00, 'Rendimiento km por litro', 'automatizacion', true),
    ('aut_gastos_fijos_hr', 161.85, 'Gastos fijos por hora', 'automatizacion', true),
    ('aut_credito_pct', 3.00, 'Costo de crédito 3%', 'automatizacion', true),

    -- SUMINISTROS (hoja 5) - igual que motores
    ('sum_gasolina_precio_litro', 30.00, 'Precio por litro de gasolina', 'suministros', true),
    ('sum_rendimiento_km_litro', 10.00, 'Rendimiento km por litro', 'suministros', true),
    ('sum_ventas_por_dia', 87.00, 'Costo por día de ventas', 'suministros', true),
    ('sum_camioneta_hr', 52.67, 'Costo por hora de camioneta', 'suministros', true),
    ('sum_utilidad_base', 40.00, 'Utilidad base 40%', 'suministros', true),
    ('sum_utilidad_premium', 45.00, 'Utilidad premium 45%', 'suministros', true),
    ('sum_credito_pct', 3.00, 'Costo de crédito 3%', 'suministros', true),

    -- VIAJES (hoja 1)
    ('viaje_gasolina_precio_litro', 24.50, 'Precio por litro de gasolina (viajes)', 'viajes', true),
    ('viaje_rendimiento_km_litro', 9.50, 'Rendimiento km por litro (viajes)', 'viajes', true),
    ('viaje_hr_dani', 104.16, 'Costo por hora de Dani (viajes)', 'viajes', true)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, descripcion = EXCLUDED.descripcion;

-- 4. CLIENTES TABULADOR (todos los departamentos)
DROP TABLE IF EXISTS public.clientes_tabulador CASCADE;

CREATE TABLE public.clientes_tabulador (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_nombre TEXT UNIQUE NOT NULL,
    km_ida NUMERIC(8,1) DEFAULT 0,
    tiempo_entrega_dias INTEGER DEFAULT 1,
    horas_invertidas NUMERIC(5,1) DEFAULT 0,
    refacciones_costo NUMERIC(12,2) DEFAULT 0,
    utilidad_factor NUMERIC(3,2) DEFAULT 1.40,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.clientes_tabulador (cliente_nombre, km_ida, tiempo_entrega_dias, horas_invertidas, refacciones_costo, utilidad_factor) VALUES
    ('BOLSAS DE LOS ALTOS', 100, 5, 16, 5000, 1.40),
    ('ANGUIPLAST', 100, 5, 0, 0, 1.40),
    ('ECOBOLSAS', 100, 5, 0, 0, 1.40),
    ('BADER TABACHINES', 10, 2, 0, 0, 1.40),
    ('BODYCOTE', 45, 3, 0, 0, 1.40),
    ('COFICAB', 40, 3, 0, 0, 1.40),
    ('CONDUMEX', 45, 3, 0, 0, 1.40),
    ('ECSA', 16, 2, 0, 0, 1.40),
    ('EPC 1', 200, 5, 0, 0, 1.40),
    ('EPC 2', 200, 5, 0, 0, 1.40),
    ('FRAENKISCHE', 45, 3, 0, 0, 1.40),
    ('GEDNEY', 11, 3, 0, 0, 1.40),
    ('GRUPO ACERERO', 200, 5, 0, 0, 1.40),
    ('HALL PLANTA 1', 35, 3, 0, 0, 1.40),
    ('HIRUTA PLANTA 1', 35, 3, 0, 0, 1.40),
    ('IK PLASTIC', 37, 3, 0, 0, 1.40),
    ('IMPRENTA JM', 9, 2, 0, 0, 1.40),
    ('JARDÍN LA ALEMANA', 6, 2, 0, 0, 1.40),
    ('MAFLOW', 36, 2, 0, 0, 1.40),
    ('MARQUARDT', 70, 3, 0, 0, 1.40),
    ('MICROONDA', 27, 1, 0, 0, 1.40),
    ('MR LUCKY', 76, 3, 0, 0, 1.40),
    ('NHK', 70, 3, 0, 0, 1.40),
    ('NISHIKAWA', 36, 3, 0, 0, 1.40),
    ('PIELES AZTECA', 3, 2, 0, 0, 1.40),
    ('RONGTAI', 16, 3, 0, 0, 1.40),
    ('SAFE DEMO', 32, 2, 0, 0, 1.40),
    ('ELECTROFORJADOS', 8, 2, 0, 0, 1.40),
    ('SUACERO', 200, 5, 0, 0, 1.40),
    ('TQ-1', 13, 2, 0, 0, 1.40),
    ('MINO INDUSTRY', 15, 2, 0, 0, 1.40),
    ('FAS', 80, 4, 0, 0, 1.40),
    ('GRANOS Y SEMILLAS', 80, 4, 0, 0, 1.40),
    ('DI CENTRAL', 9, 3, 0, 0, 1.40),
    ('FAMO ALIMENTOS', 20, 3, 0, 0, 1.45),
    ('GRUPO ZAHONERO', 6, 2, 0, 0, 1.45),
    ('CARTO MICRO', 8, 2, 0, 0, 1.45),
    ('EMMSA LEÓN', 8, 2, 0, 0, 1.45),
    ('EMMSA SILAO', 40, 2, 0, 0, 1.45),
    ('TORNIMASTER', 7, 3, 0, 0, 1.45),
    ('HORMAS PALACIOS', 8, 2, 0, 0, 1.45),
    ('SADDLEBACK', 10, 2, 0, 0, 1.45),
    ('PILSAC', 6, 2, 0, 0, 1.45),
    ('BRUSAROSCO', 8, 2, 0, 0, 1.45),
    ('HIELO REGIA', 20, 2, 0, 0, 1.45),
    ('AEROPUERTO', 36, 2, 0, 0, 1.45),
    ('PRELOSA', 25, 3, 0, 0, 1.45),
    ('TENERÍA VARGAS', 10, 2, 0, 0, 1.45),
    ('SOSER', 8, 2, 0, 0, 1.45),
    ('ARCOSA', 80, 4, 8, 1500, 1.45)
ON CONFLICT (cliente_nombre) DO UPDATE SET
    km_ida = EXCLUDED.km_ida,
    tiempo_entrega_dias = EXCLUDED.tiempo_entrega_dias,
    horas_invertidas = EXCLUDED.horas_invertidas,
    refacciones_costo = EXCLUDED.refacciones_costo,
    utilidad_factor = EXCLUDED.utilidad_factor;

-- 5. RLS - todos pueden leer, solo admin escribe
DROP POLICY IF EXISTS clientes_tabulador_select ON public.clientes_tabulador;
CREATE POLICY clientes_tabulador_select ON public.clientes_tabulador FOR SELECT USING (true);

DROP POLICY IF EXISTS parametros_costos_select ON public.parametros_costos;
CREATE POLICY parametros_costos_select ON public.parametros_costos FOR SELECT USING (true);

DROP POLICY IF EXISTS clientes_tabulador_admin ON public.clientes_tabulador;
CREATE POLICY clientes_tabulador_admin ON public.clientes_tabulador
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS parametros_costos_admin ON public.parametros_costos;
CREATE POLICY parametros_costos_admin ON public.parametros_costos
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- 6. Recargar schema
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
