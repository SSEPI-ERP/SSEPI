-- ============================================
-- TABLA DE POLÍTICAS POR MÓDULO - NUEVO SUPABASE
-- Proyecto: knzmdwjmrhcoytmebdwa
-- ============================================

-- 1. TABLA POLITICAS_MODULOS
CREATE TABLE IF NOT EXISTS public.politicas_modulos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modulo VARCHAR(50) NOT NULL UNIQUE,
    titulo VARCHAR(200) NOT NULL,
    tiempo_entrega TEXT NOT NULL,
    moneda VARCHAR(20) DEFAULT 'MONEDA NACIONAL',
    requiere_oc BOOLEAN DEFAULT true,
    acepta_cancelaciones BOOLEAN DEFAULT false,
    garantia_dias INTEGER DEFAULT 30,
    notas_importantes JSONB NOT NULL,
    url_terminos TEXT DEFAULT 'https://www.ssepi.org/terms',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INSERTAR POLÍTICAS POR MÓDULO

-- TALLER ELECTRÓNICA
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, moneda, requiere_oc, acepta_cancelaciones, garantia_dias, notas_importantes)
VALUES (
    'taller_electronica',
    'Políticas para reparación de equipos electrónicos',
    'INMEDIATA a partir de la OC. (Modificable)',
    'MONEDA NACIONAL',
    true,
    false,
    30,
    '[
        "SSEPI ofrece garantia de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.",
        "La reparación se limita exclusivamente a los componentes y/o fallas detectadas durante la inspección técnica inicial o reportadas por el cliente. En caso de no especificarse una falla concreta, el servicio se entenderá como reparación puntual de los daños visibles o componentes defectuosos identificados.",
        "La garantía NO cubre: Fallas distintas o adicionales a la reportada y reparada. Daños ocasionados por: Sobretensiones, picos de voltaje, mala calidad de energía eléctrica. Conexiones incorrectas, inversión de fases o cableado defectuoso. Manipulación, modificación o reparación por personal ajeno al taller. Uso del equipo fuera de las especificaciones del fabricante. Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.",
        "La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye: Reembolsos en efectivo. Daños indirectos, paros de producción o pérdidas operativas.",
        "El servicio no incluye instalación ni montaje del equipo en su posición original."
    ]'::jsonb
)
ON CONFLICT (modulo) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    tiempo_entrega = EXCLUDED.tiempo_entrega,
    garantia_dias = EXCLUDED.garantia_dias,
    notas_importantes = EXCLUDED.notas_importantes,
    updated_at = NOW();

-- TALLER MOTORES
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, moneda, requiere_oc, acepta_cancelaciones, garantia_dias, notas_importantes)
VALUES (
    'taller_motores',
    'Políticas para reparación de Motores',
    '1 SEMANA A partir de la OC. (Modificable)',
    'MONEDA NACIONAL',
    true,
    false,
    30,
    '[
        "SSEPI ofrece garantia de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.",
        "La garantía NO cubre: Fallas distintas o adicionales a la reportada y reparada. Daños ocasionados por: Sobretensiones, picos de voltaje, mala calidad de energía eléctrica. Conexiones incorrectas, inversión de fases o cableado defectuoso. Manipulación, modificación o reparación por personal ajeno al taller. Uso del equipo fuera de las especificaciones del fabricante. Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.",
        "La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye: Reembolsos en efectivo. Daños indirectos, paros de producción o pérdidas operativas.",
        "El servicio no incluye instalación ni montaje del equipo en su posición original."
    ]'::jsonb
)
ON CONFLICT (modulo) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    tiempo_entrega = EXCLUDED.tiempo_entrega,
    garantia_dias = EXCLUDED.garantia_dias,
    notas_importantes = EXCLUDED.notas_importantes,
    updated_at = NOW();

-- VENTAS / SUMINISTROS
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, moneda, requiere_oc, acepta_cancelaciones, garantia_dias, notas_importantes)
VALUES (
    'ventas_suministros',
    'Políticas para ventas de suministro',
    'Estimados desde confirmación de pago/OC',
    'USD (Modificable)',
    true,
    false,
    0,
    '[
        "La cotización incluye únicamente los suministros y/o refacciones descritas (número de parte, marca y cantidad).",
        "La disponibilidad de los productos está sujeta a confirmación al momento de la recepción del pago u orden de compra.",
        "La existencia mostrada en la cotización o sistema es referencial y puede variar sin previo aviso.",
        "Precios sujetos a cambio por: Tipo de cambio, Ajustes del fabricante, Disponibilidad de inventario.",
        "Precios expresados en USD, salvo indicación contraria. El pago podrá ser en dólares Americanos o pesos Mexicanos según el tipo de cambio del diario oficial de la fecha del pago.",
        "Los costos de envío no están incluidos, salvo que se indique explícitamente.",
        "Los tiempos de entrega son estimados y comienzan a partir de: Confirmación de pago, Autorización de la orden de compra.",
        "Los productos cuentan con garantía directa del fabricante, conforme a sus políticas.",
        "No se aceptan devoluciones en: Refacciones bajo pedido, Productos importados, Material eléctrico/electrónico abierto o usado.",
        "Una vez confirmado el pedido o realizado el pago: No se aceptan cancelaciones en productos bajo pedido. En productos en stock, se aplicarán cargos administrativos.",
        "El proveedor no se responsabiliza por errores en selección o aplicación del producto.",
        "La factura se emite una vez confirmado el pago. No se realizarán refacturaciones por errores imputables al cliente."
    ]'::jsonb
)
ON CONFLICT (modulo) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    tiempo_entrega = EXCLUDED.tiempo_entrega,
    moneda = EXCLUDED.moneda,
    notas_importantes = EXCLUDED.notas_importantes,
    updated_at = NOW();

-- AUTOMATIZACIÓN / PROYECTOS
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, moneda, requiere_oc, acepta_cancelaciones, garantia_dias, notas_importantes)
VALUES (
    'automatizacion',
    'Políticas para proyectos de Automatizacion',
    'Desde confirmación de anticipo y aprobación técnica',
    'MONEDA NACIONAL',
    true,
    false,
    45,
    '[
        "Se requiere Orden de Compra con el Folio de la cotización. La cotización incluye únicamente los conceptos, equipos, servicios y actividades descritos en el documento.",
        "Cualquier trabajo, material o modificación no especificada será considerada como trabajo adicional y deberá cotizarse por separado.",
        "El alcance está basado en la información técnica proporcionada por el cliente al momento de la cotización.",
        "Los precios están sujetos a cambio por variaciones en tipo de cambio, disponibilidad de materiales o ajustes de proveedor.",
        "El equipo y/o software entregado seguirá siendo propiedad del proveedor hasta la liquidación total.",
        "Los tiempos de entrega comienzan a contar a partir de la confirmación del anticipo y aprobación técnica del cliente.",
        "Retrasos por causas ajenas al proveedor (falta de información, cambios de alcance, paros del cliente) extienden automáticamente los plazos.",
        "Cualquier cambio solicitado después de aprobada la cotización será evaluado y cotizado como orden de cambio.",
        "Se otorga una garantía de 45 días naturales sobre: Programación PLC y HMI, Integración y funcionamiento del sistema, Mano de obra realizada.",
        "La garantía no cubre: Fallas por mal uso, sobrecargas eléctricas o mecánicas, manipulación por personal no autorizado, daños por condiciones ambientales fuera de especificación o fallas de equipos suministrados por el cliente.",
        "La lógica de control, diagramas y documentación desarrollada son propiedad del proveedor hasta la liquidación total."
    ]'::jsonb
)
ON CONFLICT (modulo) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    tiempo_entrega = EXCLUDED.tiempo_entrega,
    garantia_dias = EXCLUDED.garantia_dias,
    notas_importantes = EXCLUDED.notas_importantes,
    updated_at = NOW();

-- SOPORTE A PLANTA
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, moneda, requiere_oc, acepta_cancelaciones, garantia_dias, notas_importantes)
VALUES (
    'soporte_planta',
    'Políticas para Soporte a planta',
    'Atención correctiva puntual urgente',
    'MONEDA NACIONAL',
    true,
    false,
    0,
    '[
        "El servicio realizado corresponde a una atención correctiva puntual solicitada de manera urgente, enfocada en restablecer la operación del equipo en el menor tiempo posible.",
        "Las actividades ejecutadas se limitaron a la falla identificada al momento de la intervención.",
        "Las acciones realizadas incluyeron diagnóstico técnico y corrección específica de la condición detectada durante la visita.",
        "No se realizó: Revisión integral del sistema, Ingeniería de mejora, Actualización de programas, Sustitución preventiva de componentes adicionales.",
        "El servicio ejecutado no constituye una garantía integral del equipo, sino una intervención correctiva específica.",
        "En caso de presentarse una falla distinta o relacionada con otros componentes no intervenidos, se considerará como un nuevo servicio.",
        "Durante la intervención se pudieron detectar condiciones adicionales que podrían afectar el desempeño o confiabilidad del sistema.",
        "El proveedor no es responsable por: Daños derivados de condiciones externas, Fallas originadas por desgaste natural, Intervenciones posteriores realizadas por terceros.",
        "La firma del reporte de servicio confirma la conformidad con las actividades realizadas."
    ]'::jsonb
)
ON CONFLICT (modulo) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    tiempo_entrega = EXCLUDED.tiempo_entrega,
    notas_importantes = EXCLUDED.notas_importantes,
    updated_at = NOW();

-- 3. RLS
ALTER TABLE public.politicas_modulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY politicas_modulos_all ON public.politicas_modulos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. VERIFICAR
SELECT modulo, titulo, garantia_dias, tiempo_entrega FROM public.politicas_modulos ORDER BY modulo;
