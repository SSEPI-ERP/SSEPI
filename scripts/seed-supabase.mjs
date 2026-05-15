import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtuem1kd2ptcmhjb3l0bWViZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDk5NzAsImV4cCI6MjA4NzYyNTk3MH0.y9AEScz9PWu3Tqnd-7R7fxf0smvVCosZF0edLg2j31A';

const sb = createClient(SUPABASE_URL, ANON_KEY);

async function seed() {
    console.log('Verificando tablas...');

    // 1. Insertar clientes_tabulador
    const clientes = [
        { cliente_nombre: 'ANGUIPLAST', km_ida: 100, horas_invertidas: 0 },
        { cliente_nombre: 'BADER TABACHINES', km_ida: 10, horas_invertidas: 0 },
        { cliente_nombre: 'BODYCOTE', km_ida: 45, horas_invertidas: 0 },
        { cliente_nombre: 'COFICAB', km_ida: 40, horas_invertidas: 0 },
        { cliente_nombre: 'CONDUMEX', km_ida: 45, horas_invertidas: 0 },
        { cliente_nombre: 'ECSA', km_ida: 16, horas_invertidas: 0 },
        { cliente_nombre: 'EPC 1', km_ida: 200, horas_invertidas: 0 },
        { cliente_nombre: 'EPC 2', km_ida: 200, horas_invertidas: 0 },
        { cliente_nombre: 'FRAENKISCHE', km_ida: 45, horas_invertidas: 0 },
        { cliente_nombre: 'GEDNEY', km_ida: 11, horas_invertidas: 0 },
        { cliente_nombre: 'GRUPO ACERERO', km_ida: 200, horas_invertidas: 0 },
        { cliente_nombre: 'HALL PLANTA 1', km_ida: 35, horas_invertidas: 0 },
        { cliente_nombre: 'HIRUTA PLANTA 1', km_ida: 35, horas_invertidas: 0 },
        { cliente_nombre: 'IMPRENTA JM', km_ida: 50, horas_invertidas: 0 },
        { cliente_nombre: 'JARDÍN LA ALEMANA', km_ida: 30, horas_invertidas: 0 },
        { cliente_nombre: 'MAFLOW', km_ida: 45, horas_invertidas: 0 },
        { cliente_nombre: 'MICROONDA', km_ida: 40, horas_invertidas: 0 },
        { cliente_nombre: 'MINO INDUSTRY', km_ida: 35, horas_invertidas: 0 },
        { cliente_nombre: 'MR LUCKY', km_ida: 120, horas_invertidas: 0 },
        { cliente_nombre: 'NHK', km_ida: 150, horas_invertidas: 0 },
        { cliente_nombre: 'NISHIKAWA', km_ida: 45, horas_invertidas: 0 },
        { cliente_nombre: 'PIELES AZTECA', km_ida: 80, horas_invertidas: 0 },
        { cliente_nombre: 'RONGTAI', km_ida: 90, horas_invertidas: 0 },
        { cliente_nombre: 'SAFE DEMO', km_ida: 25, horas_invertidas: 0 },
        { cliente_nombre: 'SERVIACERO ELECTROFORJADOS', km_ida: 180, horas_invertidas: 0 },
        { cliente_nombre: 'SUACERO', km_ida: 200, horas_invertidas: 0 },
        { cliente_nombre: 'TQ-1', km_ida: 100, horas_invertidas: 0 }
    ];

    console.log('Insertando', clientes.length, 'clientes...');
    for (const c of clientes) {
        const { error } = await sb.from('clientes_tabulador').upsert(c, { onConflict: 'cliente_nombre' });
        if (error) console.error('Error cliente', c.cliente_nombre, error.message);
    }
    const { data: cc, error: ce } = await sb.from('clientes_tabulador').select('count');
    console.log('clientes_tabulador total:', cc?.length ?? '?' , ce ? 'ERR:'+ce.message : '');

    // 2. Insertar políticas
    const politicas = [
        {
            modulo: 'taller_electronica',
            titulo: 'Políticas para reparación de equipos electrónicos',
            tiempo_entrega: 'INMEDIATA a partir de la OC. (Modificable)',
            garantia_dias: 30,
            moneda: 'MONEDA NACIONAL',
            url_terminos: 'https://www.ssepi.org/terms',
            notas_importantes: [
                'Precio en MONEDA NACIONAL.',
                'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
                'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
                'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
                'La reparación se limita exclusivamente a los componentes y/o fallas detectadas durante la inspección técnica inicial o reportadas por el cliente. En caso de no especificarse una falla concreta, el servicio se entenderá como reparación puntual de los daños visibles o componentes defectuosos identificados.',
                'La garantía NO cubre:\n• Fallas distintas o adicionales a la reportada y reparada.\n• Daños ocasionados por:\n  o Sobretensiones, picos de voltaje, mala calidad de energía eléctrica.\n  o Conexiones incorrectas, inversión de fases o cableado defectuoso.\n• Manipulación, modificación o reparación por personal ajeno al taller.\n• Uso del equipo fuera de las especificaciones del fabricante.\n• Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
                'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye:\n• Reembolsos en efectivo.\n• Daños indirectos, paros de producción o pérdidas operativas.',
                'El servicio no incluye instalación ni montaje del equipo en su posición original.'
            ],
            activo: true
        },
        {
            modulo: 'taller_motores',
            titulo: 'Políticas para reparación de Motores',
            tiempo_entrega: '1 SEMANA a partir de la OC. (Modificable)',
            garantia_dias: 30,
            moneda: 'MONEDA NACIONAL',
            url_terminos: 'https://www.ssepi.org/terms',
            notas_importantes: [
                'Precio en MONEDA NACIONAL.',
                'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
                'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
                'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
                'La garantía NO cubre:\n• Fallas distintas o adicionales a la reportada y reparada.\n• Daños ocasionados por:\n  o Sobretensiones, picos de voltaje, mala calidad de energía eléctrica.\n  o Conexiones incorrectas, inversión de fases o cableado defectuoso.\n• Manipulación, modificación o reparación por personal ajeno al taller.\n• Uso del equipo fuera de las especificaciones del fabricante.\n• Daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
                'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye:\n• Reembolsos en efectivo.\n• Daños indirectos, paros de producción o pérdidas operativas.',
                'El servicio no incluye instalación ni montaje del equipo en su posición original.'
            ],
            activo: true
        },
        {
            modulo: 'ventas_suministros',
            titulo: 'Políticas para ventas de suministro',
            tiempo_entrega: 'Según disponibilidad',
            garantia_dias: 0,
            moneda: 'USD / MXN',
            url_terminos: 'https://www.ssepi.org/terms',
            notas_importantes: [
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
            ],
            activo: true
        },
        {
            modulo: 'automatizacion',
            titulo: 'Políticas para proyectos de Automatizacion.',
            tiempo_entrega: 'Según alcance del proyecto',
            garantia_dias: 45,
            moneda: 'MONEDA NACIONAL',
            url_terminos: 'https://www.ssepi.org/terms',
            notas_importantes: [
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
            ],
            activo: true
        },
        {
            modulo: 'soporte_planta',
            titulo: 'Políticas para Soporte a planta.',
            tiempo_entrega: 'INMEDIATA bajo solicitud',
            garantia_dias: 0,
            moneda: 'MONEDA NACIONAL',
            url_terminos: 'https://www.ssepi.org/terms',
            notas_importantes: [
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
            ],
            activo: true
        }
    ];

    console.log('Insertando', politicas.length, 'políticas...');
    for (const p of politicas) {
        const { error } = await sb.from('politicas_modulos').upsert(p, { onConflict: 'modulo' });
        if (error) console.error('Error política', p.modulo, error.message);
    }
    const { data: pp, error: pe } = await sb.from('politicas_modulos').select('count');
    console.log('politicas_modulos total:', pp?.length ?? '?', pe ? 'ERR:'+pe.message : '');

    console.log('Done.');
}

seed().catch(e => console.error(e));
