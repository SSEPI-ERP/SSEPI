-- =====================================================
-- FIX: Tabulador de Costos y Gastos - Estructura correcta
-- Basado en TABULADOR_DE_COTIZACIÓN.xlsx
-- =====================================================

-- 1. LIMPIAR datos duplicados en contactos/clientes
DELETE FROM public.contactos a USING public.contactos b
WHERE a.id < b.id
  AND a.email = b.email;

-- 2. VERIFICAR/CREAR tabla parametros_costos con valores correctos
CREATE TABLE IF NOT EXISTS public.parametros_costos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parametro TEXT UNIQUE NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar parámetros base (valores del tabulador)
INSERT INTO public.parametros_costos (parametro, valor, descripcion) VALUES
    ('gasolina_precio_litro', 30.00, 'Precio por litro de gasolina'),
    ('ventas_dia', 87.00, 'Costo por día de ventas'),
    ('tiempo_invertido_hr', 80.00, 'Costo por hora de tiempo invertido'),
    ('gastos_fijos_hr', 161.85, 'Gastos fijos por hora'),
    ('camioneta_hr', 52.67, 'Costo por hora de camioneta'),
    ('utilidad_base', 0.40, 'Utilidad base 40%'),
    ('utilidad_premium', 0.45, 'Utilidad premium 45%'),
    ('credito_pct', 0.03, 'Costo de crédito 3%')
ON CONFLICT (parametro) DO UPDATE SET valor = EXCLUDED.valor;

-- 3. VERIFICAR/CREAR tabla clientes_tabulador
CREATE TABLE IF NOT EXISTS public.clientes_tabulador (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_nombre TEXT UNIQUE NOT NULL,
    km_ida NUMERIC(8,1) DEFAULT 0,
    tiempo_entrega_dias INTEGER DEFAULT 1,
    horas_invertidas NUMERIC(5,1) DEFAULT 0,
    utilidad_factor NUMERIC(3,2) DEFAULT 1.40,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Limpiar datos viejos y insertar tabla correcta
TRUNCATE public.clientes_tabulador CASCADE;

INSERT INTO public.clientes_tabulador
    (cliente_nombre, km_ida, tiempo_entrega_dias, horas_invertidas, utilidad_factor) VALUES
    ('BOLSAS DE LOS ALTOS', 100, 5, 16, 1.40),
    ('ANGUIPLAST', 100, 5, 0, 1.40),
    ('ECOBOLSAS', 100, 5, 0, 1.40),
    ('BADER TABACHINES', 10, 2, 0, 1.40),
    ('BODYCOTE', 45, 3, 0, 1.40),
    ('COFICAB', 40, 3, 0, 1.40),
    ('CONDUMEX', 45, 3, 0, 1.40),
    ('ECSA', 16, 2, 0, 1.40),
    ('EPC 1', 200, 5, 0, 1.40),
    ('EPC 2', 200, 5, 0, 1.40),
    ('FRAENKISCHE', 45, 3, 0, 1.40),
    ('GEDNEY', 11, 3, 0, 1.40),
    ('GRUPO ACERERO', 200, 5, 0, 1.40),
    ('HALL PLANTA 1', 35, 3, 0, 1.40),
    ('HIRUTA PLANTA 1', 35, 3, 0, 1.40),
    ('IK PLASTIC', 37, 3, 0, 1.40),
    ('IMPRENTA JM', 9, 2, 0, 1.40),
    ('JARDÍN LA ALEMANA', 6, 2, 0, 1.40),
    ('MAFLOW', 36, 2, 0, 1.40),
    ('MARQUARDT', 70, 3, 0, 1.40),
    ('MICROONDA', 27, 1, 0, 1.40),
    ('MR LUCKY', 76, 3, 0, 1.40),
    ('NHK', 70, 3, 0, 1.40),
    ('NISHIKAWA', 36, 3, 0, 1.40),
    ('PIELES AZTECA', 3, 2, 0, 1.40),
    ('RONGTAI', 16, 3, 0, 1.40),
    ('SAFE DEMO', 32, 2, 0, 1.40),
    ('ELECTROFORJADOS', 8, 2, 0, 1.40),
    ('SUACERO', 200, 5, 0, 1.40),
    ('TQ-1', 13, 2, 0, 1.40),
    ('MINO INDUSTRY', 15, 2, 0, 1.40),
    ('FAS', 80, 4, 0, 1.40),
    ('GRANOS Y SEMILLAS', 80, 4, 0, 1.40),
    ('DI CENTRAL', 9, 3, 0, 1.40),
    ('FAMO ALIMENTOS', 20, 3, 0, 1.45),
    ('GRUPO ZAHONERO', 6, 2, 0, 1.45),
    ('CARTO MICRO', 8, 2, 0, 1.45),
    ('EMMSA LEÓN', 8, 2, 0, 1.45),
    ('EMMSA SILAO', 40, 2, 0, 1.45),
    ('TORNIMASTER', 7, 3, 0, 1.45),
    ('HORMAS PALACIOS', 8, 2, 0, 1.45),
    ('SADDLEBACK', 10, 2, 0, 1.45),
    ('PILSAC', 6, 2, 0, 1.45),
    ('BRUSAROSCO', 8, 2, 0, 1.45),
    ('HIELO REGIA', 20, 2, 0, 1.45),
    ('AEROPUERTO', 36, 2, 0, 1.45),
    ('PRELOSA', 25, 3, 0, 1.45),
    ('TENERÍA VARGAS', 10, 2, 0, 1.45),
    ('SOSER', 8, 2, 0, 1.45),
    ('ARCOSA', 80, 4, 8, 1.45)
ON CONFLICT (cliente_nombre) DO UPDATE SET
    km_ida = EXCLUDED.km_ida,
    tiempo_entrega_dias = EXCLUDED.tiempo_entrega_dias,
    horas_invertidas = EXCLUDED.horas_invertidas,
    utilidad_factor = EXCLUDED.utilidad_factor;

-- 4. VERIFICAR/CREAR tabla gastos_fijos
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    concepto TEXT NOT NULL,
    monto NUMERIC(12,2) NOT NULL,
    tipo TEXT DEFAULT 'fijo',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Corregir RLS para que todos los roles puedan leer tabuladores
DROP POLICY IF EXISTS clientes_tabulador_select ON public.clientes_tabulador;
CREATE POLICY clientes_tabulador_select ON public.clientes_tabulador
    FOR SELECT USING (true);

DROP POLICY IF EXISTS parametros_costos_select ON public.parametros_costos;
CREATE POLICY parametros_costos_select ON public.parametros_costos
    FOR SELECT USING (true);

-- Admin puede editar
DROP POLICY IF EXISTS clientes_tabulador_admin ON public.clientes_tabulador;
CREATE POLICY clientes_tabulador_admin ON public.clientes_tabulador
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

DROP POLICY IF EXISTS parametros_costos_admin ON public.parametros_costos;
CREATE POLICY parametros_costos_admin ON public.parametros_costos
    FOR ALL USING (auth.jwt() ->> 'rol' IN ('admin', 'superadmin'));

-- 6. Recargar schema cache
NOTIFY pgrst, 'reload schema';

-- 7. Tabla para Automatización - tipos de actividad y tarifas
CREATE TABLE IF NOT EXISTS public.automatizacion_tarifas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo_servicio TEXT UNIQUE NOT NULL,
    tarifa_hora NUMERIC(12,2) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.automatizacion_tarifas (tipo_servicio, tarifa_hora) VALUES
    ('PLC/HMI', 650.00),
    ('Servomotor', 700.00),
    ('Diseño Tablero', 450.00),
    ('Diseño Mecánico', 900.00),
    ('Instalación', 350.00),
    ('Fabricación', 600.00),
    ('Soporte', 1100.00),
    ('Arquitectura', 150.00)
ON CONFLICT (tipo_servicio) DO UPDATE SET tarifa_hora = EXCLUDED.tarifa_hora;

-- 8. Tabla empresas para Automatización
CREATE TABLE IF NOT EXISTS public.automatizacion_empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT UNIQUE NOT NULL,
    km_ida NUMERIC(8,1) DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Limpiar inventario duplicado y corregir categorías
DELETE FROM public.inventario a USING public.inventario b
WHERE a.id < b.id
  AND a.sku = b.sku;

-- Actualizar categorías incorrectas
UPDATE public.inventario
SET categoria = 'refaccion'
WHERE categoria IN ('refacciones', 'refacción', 'refacciones_y_componentes');

UPDATE public.inventario
SET categoria = 'consumible'
WHERE categoria IN ('consumibles', 'consumible_y_limpieza');

UPDATE public.inventario
SET categoria = 'servicio'
WHERE categoria IN ('servicios', 'servicio_tecnico');

-- 10. Agregar columna costo_unitario si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventario' AND column_name = 'costo_unitario'
    ) THEN
        ALTER TABLE public.inventario ADD COLUMN costo_unitario NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

-- 11. Recargar schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
