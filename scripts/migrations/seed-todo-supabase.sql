-- ============================================================================
-- MIGRACIÓN ÚNICA: INSERTAR DATOS FALTANTES EN SUPABASE
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > RUN
-- ============================================================================

-- 1. CLIENTES TABULADOR (27 registros)
INSERT INTO public.clientes_tabulador (cliente_nombre, km_ida, horas_invertidas, activo)
VALUES
    ('ANGUIPLAST', 100, 0, true),
    ('BADER TABACHINES', 10, 0, true),
    ('BODYCOTE', 45, 0, true),
    ('COFICAB', 40, 0, true),
    ('CONDUMEX', 45, 0, true),
    ('ECSA', 16, 0, true),
    ('EPC 1', 200, 0, true),
    ('EPC 2', 200, 0, true),
    ('FRAENKISCHE', 45, 0, true),
    ('GEDNEY', 11, 0, true),
    ('GRUPO ACERERO', 200, 0, true),
    ('HALL PLANTA 1', 35, 0, true),
    ('HIRUTA PLANTA 1', 35, 0, true),
    ('IMPRENTA JM', 50, 0, true),
    ('JARDÍN LA ALEMANA', 30, 0, true),
    ('MAFLOW', 45, 0, true),
    ('MICROONDA', 40, 0, true),
    ('MINO INDUSTRY', 35, 0, true),
    ('MR LUCKY', 120, 0, true),
    ('NHK', 150, 0, true),
    ('NISHIKAWA', 45, 0, true),
    ('PIELES AZTECA', 80, 0, true),
    ('RONGTAI', 90, 0, true),
    ('SAFE DEMO', 25, 0, true),
    ('SERVIACERO ELECTROFORJADOS', 180, 0, true),
    ('SUACERO', 200, 0, true),
    ('TQ-1', 100, 0, true)
ON CONFLICT (cliente_nombre) DO UPDATE SET
    km_ida = EXCLUDED.km_ida,
    horas_invertidas = EXCLUDED.horas_invertidas,
    activo = true;

-- 2. POLÍTICAS DE LOS 5 DEPARTAMENTOS
INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, moneda, url_terminos, notas_importantes, activo, updated_at)
VALUES (
  'taller_electronica',
  'Políticas para reparación de equipos electrónicos',
  'INMEDIATA a partir de la OC. (Modificable)',
  30,
  'MONEDA NACIONAL',
  'https://www.ssepi.org/terms',
  to_jsonb(ARRAY[
    'Precio en MONEDA NACIONAL.',
    'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
    'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
    'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
    'La reparación se limita exclusivamente a los componentes y/o fallas detectadas durante la inspección técnica inicial o reportadas por el cliente. En caso de no especificarse una falla concreta, el servicio se entenderá como reparación puntual de los daños visibles o componentes defectuosos identificados.',
    'La garantía NO cubre:\n• Fallas distintas o adicionales a la reportada y reparada.\n• Daños ocasionados por:\n  o Sobretensiones, picos de voltaje, mala calidad de energía eléctrica.\n  o Conexiones incorrectas, inversión de fases o cableado defectuoso.\n• Manipulación, modificación o reparación por personal ajeno al taller.\n• Uso del equipo fuera de las especificaciones del fabricante.\n• Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
    'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye:\n• Reembolsos en efectivo.\n• Daños indirectos, paros de producción o pérdidas operativas.',
    'El servicio no incluye instalación ni montaje del equipo en su posición original.'
  ]),
  true,
  now()
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  moneda = EXCLUDED.moneda,
  url_terminos = EXCLUDED.url_terminos,
  notas_importantes = EXCLUDED.notas_importantes,
  activo = true,
  updated_at = now();

INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, moneda, url_terminos, notas_importantes, activo, updated_at)
VALUES (
  'taller_motores',
  'Políticas para reparación de Motores',
  '1 SEMANA a partir de la OC. (Modificable)',
  30,
  'MONEDA NACIONAL',
  'https://www.ssepi.org/terms',
  to_jsonb(ARRAY[
    'Precio en MONEDA NACIONAL.',
    'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
    'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
    'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
    'La garantía NO cubre:\n• Fallas distintas o adicionales a la reportada y reparada.\n• Daños ocasionados por:\n  o Sobretensiones, picos de voltaje, mala calidad de energía eléctrica.\n  o Conexiones incorrectas, inversión de fases o cableado defectuoso.\n• Manipulación, modificación o reparación por personal ajeno al taller.\n• Uso del equipo fuera de las especificaciones del fabricante.\n• Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
    'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye:\n• Reembolsos en efectivo.\n• Daños indirectos, paros de producción o pérdidas operativas.',
    'El servicio no incluye instalación ni montaje del equipo en su posición original.'
  ]),
  true,
  now()
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  moneda = EXCLUDED.moneda,
  url_terminos = EXCLUDED.url_terminos,
  notas_importantes = EXCLUDED.notas_importantes,
  activo = true,
  updated_at = now();

INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, moneda, url_terminos, notas_importantes, activo, updated_at)
VALUES (
  'ventas_suministros',
  'Políticas para ventas de suministro',
  'Según disponibilidad',
  0,
  'USD / MXN',
  'https://www.ssepi.org/terms',
  to_jsonb(ARRAY[
    'La cotización incluye únicamente los suministros y/o refacciones descritas (número de parte, marca y cantidad).',
    'La disponibilidad de los productos está sujeta a confirmación al momento de la recepción del pago u orden de compra.',
    'La existencia mostrada en la cotización o sistema es referencial y puede variar sin previo aviso.',
    'Precios sujetos a cambio por: Tipo de cambio, Ajustes del fabricante, Disponibilidad de inventario.',
    'Precios expresados en USD, salvo indicación contraria. (Modificable)',
    'El pago podrá ser en dólares Americanos o pesos Mexicanos según el tipo de cambio del diario oficial de la fecha del pago.',
    'Los costos de envío no están incluidos, salvo que se indique explícitamente.',
    'Los tiempos de entrega son estimados y comienzan a partir de: Confirmación de pago, Autorización de la orden de compra.',
    'Los productos cuentan con garantía directa del fabricante, conforme a sus políticas.',
    'No se aceptan devoluciones en: Refacciones bajo pedido, Productos importados, Material eléctrico/electrónico abierto o usado.',
    'Una vez confirmado el pedido o realizado el pago: No se aceptan cancelaciones en productos bajo pedido. En productos en stock, se aplicarán cargos administrativos.',
    'El proveedor no se responsabiliza por errores en selección o aplicación del producto.',
    'La factura se emite una vez confirmado el pago.',
    'No se realizarán refacturaciones por errores imputables al cliente.'
  ]),
  true,
  now()
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  moneda = EXCLUDED.moneda,
  url_terminos = EXCLUDED.url_terminos,
  notas_importantes = EXCLUDED.notas_importantes,
  activo = true,
  updated_at = now();

INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, moneda, url_terminos, notas_importantes, activo, updated_at)
VALUES (
  'automatizacion',
  'Políticas para proyectos de Automatizacion.',
  'Según alcance del proyecto',
  45,
  'MONEDA NACIONAL',
  'https://www.ssepi.org/terms',
  to_jsonb(ARRAY[
    'Condiciones de pago: 50% de anticipo, 50% al terminar las actividades y a las pruebas de funcionamiento.',
    'Se requiere Orden de Compra con el Folio de la cotización.',
    'La cotización incluye únicamente los conceptos, equipos, servicios y actividades descritos en el documento.',
    'Cualquier trabajo, material o modificación no especificada será considerada como trabajo adicional y deberá cotizarse por separado.',
    'El alcance está basado en la información técnica proporcionada por el cliente al momento de la cotización.',
    'Los precios están sujetos a cambio por variaciones en tipo de cambio, disponibilidad de materiales o ajustes de proveedor.',
    'El equipo y/o software entregado seguirá siendo propiedad del proveedor hasta la liquidación total.',
    'Los tiempos de entrega comienzan a contar a partir de la confirmación del anticipo y aprobación técnica del cliente.',
    'Retrasos por causas ajenas al proveedor (falta de información, cambios de alcance, paros del cliente) extienden automáticamente los plazos.',
    'Cualquier cambio solicitado después de aprobada la cotización (lógica de control, marcas de equipo, señales adicionales, secuencias, pantallas HMI, etc.) será evaluado y cotizado como orden de cambio.',
    'Se otorga una garantía de 45 días naturales sobre:\n• Programación PLC y HMI\n• Integración y funcionamiento del sistema\n• Mano de obra realizada',
    'La garantía no cubre: Fallas por mal uso, sobrecargas eléctricas o mecánicas, manipulación por personal no autorizado, daños por condiciones ambientales fuera de especificación o fallas de equipos suministrados por el cliente.',
    'La lógica de control, diagramas y documentación desarrollada son propiedad del proveedor hasta la liquidación total. El cliente podrá usar el sistema únicamente para su operación interna.'
  ]),
  true,
  now()
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  moneda = EXCLUDED.moneda,
  url_terminos = EXCLUDED.url_terminos,
  notas_importantes = EXCLUDED.notas_importantes,
  activo = true,
  updated_at = now();

INSERT INTO public.politicas_modulos (modulo, titulo, tiempo_entrega, garantia_dias, moneda, url_terminos, notas_importantes, activo, updated_at)
VALUES (
  'soporte_planta',
  'Políticas para Soporte a planta.',
  'INMEDIATA bajo solicitud',
  0,
  'MONEDA NACIONAL',
  'https://www.ssepi.org/terms',
  to_jsonb(ARRAY[
    'El servicio realizado corresponde a una atención correctiva puntual solicitada de manera urgente, enfocada en restablecer la operación del equipo en el menor tiempo posible.',
    'Las actividades efectuadas se limitaron a la falla identificada al momento de la intervención.',
    'Las acciones realizadas incluyeron diagnóstico técnico y corrección específica de la condición detectada durante la visita.',
    'No se realizó:\n• Revisión integral del sistema\n• Ingeniería de mejora\n• Actualización de programas\n• Sustitución preventiva de componentes adicionales, salvo que se indique expresamente en el reporte.',
    'El servicio ejecutado no constituye una garantía integral del equipo, sino una intervención correctiva específica.',
    'En caso de presentarse una falla distinta o relacionada con otros componentes no intervenidos, se considerará como un nuevo servicio.',
    'Durante la intervención se pudieron detectar condiciones adicionales que podrían afectar el desempeño o confiabilidad del sistema.',
    'Estas observaciones y recomendaciones quedan documentadas en el Reporte de Servicio entregado al cliente.',
    'La no ejecución de dichas recomendaciones puede derivar en fallas posteriores ajenas a la intervención realizada.',
    'El proveedor no es responsable por:\n• Daños derivados de condiciones externas (variaciones eléctricas, humedad, manipulación posterior).\n• Fallas originadas por desgaste natural de componentes.\n• Intervenciones posteriores realizadas por terceros.',
    'La firma del reporte de servicio confirma la conformidad con las actividades realizadas y el restablecimiento operativo al momento de la entrega.'
  ]),
  true,
  now()
)
ON CONFLICT (modulo) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tiempo_entrega = EXCLUDED.tiempo_entrega,
  garantia_dias = EXCLUDED.garantia_dias,
  moneda = EXCLUDED.moneda,
  url_terminos = EXCLUDED.url_terminos,
  notas_importantes = EXCLUDED.notas_importantes,
  activo = true,
  updated_at = now();

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT 'CLIENTES' as tabla, COUNT(*) as total FROM public.clientes_tabulador;
SELECT 'POLÍTICAS' as tabla, COUNT(*) as total FROM public.politicas_modulos;
SELECT 'PARÁMETROS' as tabla, COUNT(*) as total FROM public.parametros_costos;
