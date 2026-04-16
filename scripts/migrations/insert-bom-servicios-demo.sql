-- =====================================================
-- DATOS DE DEMOSTRACIÓN - BOM AUTOMATIZACIÓN Y SERVICIOS
-- Basado en datos reales del proyecto SSEPI
-- =====================================================

-- ================================================
-- 1. BOM AUTOMATIZACIÓN - Materiales de ejemplo
-- ================================================
INSERT INTO public.bom_automatizacion (item, numero_parte, descripcion, categoria, estado, proveedor, precio_unitario, moneda, link) VALUES
(1, 'AB-E3201', 'Contacto auxiliar NC 1NO+1NC', 'Electrónica', 'Activo', 'ABB', 450.00, 'MXN', 'https://search.abb.com/'),
(2, 'AB-E3210', 'Contacto auxiliar 2NO', 'Electrónica', 'Activo', 'ABB', 480.00, 'MXN', 'https://search.abb.com/'),
(3, 'AB-MS116-10', 'Interruptor termomagnético 10A', 'Protección', 'Activo', 'ABB', 890.00, 'MXN', 'https://search.abb.com/'),
(4, 'AB-MS116-16', 'Interruptor termomagnético 16A', 'Protección', 'Activo', 'ABB', 890.00, 'MXN', 'https://search.abb.com/'),
(5, 'AB-MS116-25', 'Interruptor termomagnético 25A', 'Protección', 'Activo', 'ABB', 890.00, 'MXN', 'https://search.abb.com/'),
(6, 'AB-MS132-25', 'Interruptor termomagnético 25A IEC', 'Protección', 'Activo', 'ABB', 1250.00, 'MXN', 'https://search.abb.com/'),
(7, 'AB-MS132-40', 'Interruptor termomagnético 40A IEC', 'Protección', 'Activo', 'ABB', 1450.00, 'MXN', 'https://search.abb.com/'),
(8, 'AB-TA25DU-18', 'Relé térmico 14-18A', 'Protección', 'Activo', 'ABB', 720.00, 'MXN', 'https://search.abb.com/'),
(9, 'AB-TA25DU-25', 'Relé térmico 17-25A', 'Protección', 'Activo', 'ABB', 720.00, 'MXN', 'https://search.abb.com/'),
(10, 'AB-BC6-30-10', 'Contacto 3P 30A 220VAC', 'Potencia', 'Activo', 'ABB', 1850.00, 'MXN', 'https://search.abb.com/'),
(11, 'AB-BC7-30-10', 'Contacto 3P 30A 110VAC', 'Potencia', 'Activo', 'ABB', 1850.00, 'MXN', 'https://search.abb.com/'),
(12, 'AB-BC6-40-10', 'Contacto 3P 40A 220VAC', 'Potencia', 'Activo', 'ABB', 2450.00, 'MXN', 'https://search.abb.com/'),
(13, 'SCH-GB2CB03', 'Pastilla NC para TeSys', 'Electrónica', 'Activo', 'Schneider', 180.00, 'MXN', 'https://www.se.com/'),
(14, 'SCH-GB2CB10', 'Pastilla NA para TeSys', 'Electrónica', 'Activo', 'Schneider', 180.00, 'MXN', 'https://www.se.com/'),
(15, 'SCH-LC1D09', 'Contacto 9A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 1650.00, 'MXN', 'https://www.se.com/'),
(16, 'SCH-LC1D12', 'Contacto 12A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 1850.00, 'MXN', 'https://www.se.com/'),
(17, 'SCH-LC1D18', 'Contacto 18A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 2150.00, 'MXN', 'https://www.se.com/'),
(18, 'SCH-LC1D25', 'Contacto 25A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 2850.00, 'MXN', 'https://www.se.com/'),
(19, 'SCH-LC1D32', 'Contacto 32A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 3450.00, 'MXN', 'https://www.se.com/'),
(20, 'SCH-LC1D40', 'Contacto 40A 3P 220VAC', 'Potencia', 'Activo', 'Schneider', 4250.00, 'MXN', 'https://www.se.com/'),
(21, 'SCH-LRD07', 'Relé térmico 1.6-2.5A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(22, 'SCH-LRD08', 'Relé térmico 2.5-4A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(23, 'SCH-LRD10', 'Relé térmico 4-6A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(24, 'SCH-LRD12', 'Relé térmico 5.5-8A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(25, 'SCH-LRD14', 'Relé térmico 7-10A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(26, 'SCH-LRD16', 'Relé térmico 9-13A', 'Protección', 'Activo', 'Schneider', 580.00, 'MXN', 'https://www.se.com/'),
(27, 'SCH-LRD21', 'Relé térmico 12-18A', 'Protección', 'Activo', 'Schneider', 620.00, 'MXN', 'https://www.se.com/'),
(28, 'SCH-LRD22', 'Relé térmico 17-25A', 'Protección', 'Activo', 'Schneider', 620.00, 'MXN', 'https://www.se.com/'),
(29, 'SCH-LRD32', 'Relé térmico 23-32A', 'Protección', 'Activo', 'Schneider', 680.00, 'MXN', 'https://www.se.com/'),
(30, 'SCH-LRD35', 'Relé térmico 30-40A', 'Protección', 'Activo', 'Schneider', 720.00, 'MXN', 'https://www.se.com/'),
(31, 'OMR-SYSDR-10', 'Fuente 24VDC 10A', 'Fuente', 'Activo', 'Omron', 2850.00, 'MXN', 'https://www.omron.com.mx/'),
(32, 'OMR-SYSDR-20', 'Fuente 24VDC 20A', 'Fuente', 'Activo', 'Omron', 4250.00, 'MXN', 'https://www.omron.com.mx/'),
(33, 'OMR-CJ1W-ID211', 'Módulo entrada 24VDC 16pts', 'PLC', 'Activo', 'Omron', 4500.00, 'MXN', 'https://www.omron.com.mx/'),
(34, 'OMR-CJ1W-OD211', 'Módulo salida 24VDC 16pts', 'PLC', 'Activo', 'Omron', 4800.00, 'MXN', 'https://www.omron.com.mx/'),
(35, 'OMR-CJ1W-AD041', 'Módulo entrada analógica 4pts', 'PLC', 'Activo', 'Omron', 8500.00, 'MXN', 'https://www.omron.com.mx/'),
(36, 'OMR-CJ1W-DA041', 'Módulo salida analógica 4pts', 'PLC', 'Activo', 'Omron', 8900.00, 'MXN', 'https://www.omron.com.mx/'),
(37, 'SIE-S7-1200-CPU1214C', 'PLC S7-1200 CPU 1214C DC/DC/DC', 'PLC', 'Activo', 'Siemens', 12500.00, 'MXN', 'https://mall.industry.siemens.com/'),
(38, 'SIE-S7-1200-CPU1215C', 'PLC S7-1200 CPU 1215C DC/DC/DC', 'PLC', 'Activo', 'Siemens', 15800.00, 'MXN', 'https://mall.industry.siemens.com/'),
(39, 'SIE-S7-1200-SM1221', 'Módulo entrada digital 8pts 24VDC', 'PLC', 'Activo', 'Siemens', 3200.00, 'MXN', 'https://mall.industry.siemens.com/'),
(40, 'SIE-S7-1200-SM1222', 'Módulo salida digital 8pts 24VDC', 'PLC', 'Activo', 'Siemens', 3500.00, 'MXN', 'https://mall.industry.siemens.com/'),
(41, 'SIE-S7-1200-SM1223', 'Módulo DI/DO 8/8pts 24VDC', 'PLC', 'Activo', 'Siemens', 5200.00, 'MXN', 'https://mall.industry.siemens.com/'),
(42, 'SIE-S7-1200-SM1231', 'Módulo entrada analógica 4pts', 'PLC', 'Activo', 'Siemens', 7800.00, 'MXN', 'https://mall.industry.siemens.com/'),
(43, 'SIE-S7-1200-SM1232', 'Módulo salida analógica 2pts', 'PLC', 'Activo', 'Siemens', 6500.00, 'MXN', 'https://mall.industry.siemens.com/'),
(44, 'SIE-S7-1200-PS1207', 'Fuente 24VDC 2.5A para S7-1200', 'Fuente', 'Activo', 'Siemens', 2850.00, 'MXN', 'https://mall.industry.siemens.com/'),
(45, 'IFM-EF0001', 'Cable M12 5m para sensores', 'Conexión', 'Activo', 'IFM', 450.00, 'MXN', 'https://www.ifm.com/'),
(46, 'IFM-EF0002', 'Cable M12 10m para sensores', 'Conexión', 'Activo', 'IFM', 680.00, 'MXN', 'https://www.ifm.com/'),
(47, 'IFM-IGS204', 'Sensor inductivo M18 N.O.', 'Sensor', 'Activo', 'IFM', 1850.00, 'MXN', 'https://www.ifm.com/'),
(48, 'IFM-IGS205', 'Sensor inductivo M18 N.C.', 'Sensor', 'Activo', 'IFM', 1850.00, 'MXN', 'https://www.ifm.com/'),
(49, 'IFM-IGB3005', 'Sensor inductivo M30 N.O.', 'Sensor', 'Activo', 'IFM', 2250.00, 'MXN', 'https://www.ifm.com/'),
(50, 'IFM-O5H500', 'Sensor óptico réflex', 'Sensor', 'Activo', 'IFM', 3850.00, 'MXN', 'https://www.ifm.com/'),
(51, 'PHO-2866763', 'Fuente 24VDC 5A', 'Fuente', 'Activo', 'Phoenix Contact', 2450.00, 'MXN', 'https://www.phoenixcontact.com/'),
(52, 'PHO-2866776', 'Fuente 24VDC 10A', 'Fuente', 'Activo', 'Phoenix Contact', 3850.00, 'MXN', 'https://www.phoenixcontact.com/'),
(53, 'PHO-2961105', 'Relé de interfaz 24VDC', 'Relé', 'Activo', 'Phoenix Contact', 280.00, 'MXN', 'https://www.phoenixcontact.com/'),
(54, 'PHO-2961192', 'Base para relé de interfaz', 'Relé', 'Activo', 'Phoenix Contact', 120.00, 'MXN', 'https://www.phoenixcontact.com/'),
(55, 'PHO-2839282', 'Supresor de picos 24VDC', 'Protección', 'Activo', 'Phoenix Contact', 850.00, 'MXN', 'https://www.phoenixcontact.com/'),
(56, 'FESTO-SME-8M-ZS-24V-K-2.5-OE', 'Sensor magnético cilindro', 'Sensor', 'Activo', 'Festo', 1250.00, 'MXN', 'https://www.festo.com/'),
(57, 'FESTO-VAD-M5', 'Válvula antirretorno M5', 'Neumática', 'Activo', 'Festo', 180.00, 'MXN', 'https://www.festo.com/'),
(58, 'FESTO-VL-5-PK-3', 'Válvula 3/2 NC M5', 'Neumática', 'Activo', 'Festo', 850.00, 'MXN', 'https://www.festo.com/'),
(59, 'FESTO-MEH-3/2-1/8-P-B', 'Electroválvula 3/2 G1/8', 'Neumática', 'Activo', 'Festo', 2450.00, 'MXN', 'https://www.festo.com/'),
(60, 'FESTO-MFH-5/2-1/4-S', 'Electroválvula 5/2 G1/4', 'Neumática', 'Activo', 'Festo', 3850.00, 'MXN', 'https://www.festo.com/');

-- ================================================
-- 2. SERVICIOS AUTOMATIZACIÓN - Con desglose planta/oficina
-- ================================================
INSERT INTO public.servicios_automatizacion (nombre, descripcion, tipo, area, costo_planta, costo_oficina, horas_estimadas, activo) VALUES
('Diseño de tablero de control', 'Ingeniería y diseño eléctrico de tableros de automatización', 'Ingeniería', 'Diseño', 0.00, 3500.00, 8.0, true),
('Programación de PLC', 'Desarrollo de lógica de control para PLC Siemens/Allen-Bradley', 'Programación', 'Software', 0.00, 4500.00, 16.0, true),
('Programación de HMI', 'Diseño de interfaz operador para pantallas HMI', 'Programación', 'Software', 0.00, 3200.00, 8.0, true),
('Ensamble de tablero', 'Montaje y cableado de tablero de control', 'Manufactura', 'Planta', 2800.00, 0.00, 16.0, true),
('Pruebas en banco', 'Pruebas funcionales y de seguridad en banco de pruebas', 'Pruebas', 'Planta', 1200.00, 0.00, 4.0, true),
('Puesta en marcha', 'Comisionamiento en sitio del sistema automatizado', 'Servicio', 'Campo', 1500.00, 2500.00, 8.0, true),
('Capacitación operativa', 'Entrenamiento a operadores y personal de mantenimiento', 'Capacitación', 'Campo', 800.00, 1800.00, 4.0, true),
('Documentación técnica', 'Manuales, diagramas y lista de materiales', 'Ingeniería', 'Oficina', 0.00, 2200.00, 6.0, true),
('Mantenimiento preventivo', 'Servicio programado de revisión y ajustes', 'Mantenimiento', 'Campo', 1000.00, 2000.00, 4.0, true),
('Soporte técnico remoto', 'Asistencia técnica por llamada o videollamada', 'Soporte', 'Oficina', 0.00, 850.00, 1.0, true),
('Visita técnica', 'Visita a planta para diagnóstico o supervisión', 'Servicio', 'Campo', 500.00, 1500.00, 2.0, true),
('Modificación de sistema existente', 'Actualización o modificación de sistema instalado', 'Ingeniería', 'Planta', 1800.00, 1200.00, 8.0, true),
('Integración de sistemas', 'Conexión e integración de múltiples sistemas', 'Ingeniería', 'Planta', 2500.00, 3500.00, 24.0, true),
('Calibración de instrumentos', 'Ajuste y calibración de sensores y actuadores', 'Servicio', 'Campo', 800.00, 1200.00, 2.0, true),
('Diagnóstico de fallas', 'Identificación y resolución de problemas', 'Soporte', 'Campo', 600.00, 1400.00, 2.0, true);

-- ================================================
-- 3. ACTUALIZAR SECUENCIAS (si es necesario)
-- ================================================
-- Nota: En Supabase con UUID no se necesitan secuencias

-- ================================================
-- VERIFICACIÓN DE DATOS INSERTADOS
-- ================================================
-- Ejecutar después de insertar para verificar:
-- SELECT COUNT(*) FROM public.bom_automatizacion; -- Debe mostrar 60
-- SELECT COUNT(*) FROM public.servicios_automatizacion; -- Debe mostrar 15

-- ================================================
-- RESUMEN DE COSTOS (para ver desglose)
-- ================================================
-- SELECT
--     'BOM Total' as concepto,
--     SUM(precio_unitario) as total_materiales,
--     'MXN' as moneda
-- FROM public.bom_automatizacion
-- WHERE estado = 'Activo'
-- UNION ALL
-- SELECT
--     'Servicios Planta' as concepto,
--     SUM(costo_planta) as total_planta,
--     'MXN' as moneda
-- FROM public.servicios_automatizacion WHERE activo = true
-- UNION ALL
-- SELECT
--     'Servicios Oficina' as concepto,
--     SUM(costo_oficina) as total_oficina,
--     'MXN' as moneda
-- FROM public.servicios_automatizacion WHERE activo = true;
