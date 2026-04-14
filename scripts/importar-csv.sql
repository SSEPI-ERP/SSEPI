-- =============================================================================
-- IMPORTAR DATOS DESDE CSV AL NUEVO SUPABASE
-- PROPÓSITO: Insertar datos exportados del Supabase viejo
-- EJECUCIÓN: En SQL Editor del Supabase NUEVO
-- NOTA: Supabase no permite COPY FROM CSV directamente desde el editor.
--       Usar Table Editor → Import data para cada CSV.
--       Este script genera INSERTs para pegar manualmente si es necesario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USUARIOS (8 registros)
-- -----------------------------------------------------------------------------
-- Mapeo: id, auth_user_id, email, nombre, rol, departamento, telefono, sede, nivel_riesgo
-- Nota: El CSV tiene columnas extra (mfa_enabled, activo, ultimo_acceso, creado_en, actualizado_en)

INSERT INTO public.usuarios (auth_user_id, email, nombre, rol, departamento, telefono, sede, nivel_riesgo) VALUES
('625c0294-ad8c-4c44-a3c0-bd3ad868064f', 'administracion@ssepi.org', 'Administración', 'admin', NULL, NULL, NULL, NULL),
('85701246-f3a8-4760-96a5-155dd83abb1e', 'ventas1@ssepi.org', 'Ventas 1', 'ventas', NULL, NULL, NULL, NULL),
('65a2920c-bb4a-4b64-9e31-ccd47545120d', 'norbertomoro4@gmail.com', 'Admin', 'admin', NULL, NULL, NULL, NULL),
('b35ba451-f96a-4057-94b8-786feb17b8a9', 'ivang.ssepi@gmail.com', 'Ivan (Automatización)', 'automatizacion', NULL, NULL, NULL, NULL),
('deb817da-591f-498d-97fb-ab5b44eec630', 'electronica.ssepi@gmail.com', 'Electrónica SSEPI', 'ventas_sin_compras', NULL, NULL, NULL, NULL),
('3cac7945-bcde-46a0-90d5-7b94ace2b14a', 'electronica@ssepi.org', 'Electrónica Admin', 'admin', NULL, NULL, NULL, NULL),
('f16da79f-8043-4c86-8659-7933eae55b0a', 'ventas@ssepi.org', 'Ventas Admin', 'admin', NULL, NULL, NULL, NULL),
('884ad1b6-5831-4619-9d5d-d3703f9e8691', 'automatizacion@ssepi.org', 'Automatización', 'admin', NULL, NULL, NULL, NULL)
ON CONFLICT (auth_user_id) DO UPDATE SET
  email = EXCLUDED.email,
  nombre = EXCLUDED.nombre,
  rol = EXCLUDED.rol,
  departamento = EXCLUDED.departamento,
  telefono = EXCLUDED.telefono,
  sede = EXCLUDED.sede,
  nivel_riesgo = EXCLUDED.nivel_riesgo;

-- -----------------------------------------------------------------------------
-- 2. ROLE_PERMISSIONS (111 registros - solo primeros 20 mostrados)
-- -----------------------------------------------------------------------------
-- El script setup-supabase-nuevo.sql ya insertó permisos básicos.
-- Este INSERT agrega los permisos específicos del CSV.

INSERT INTO public.role_permissions (rol, module, action) VALUES
('ventas_sin_compras', 'contactos', 'read'),
('administracion', 'contactos', 'update'),
('ventas_sin_compras', 'ssepi_folio_operativo', 'update'),
('automatizacion', 'ordenes_taller', 'create'),
('compras', 'ssepi_folio_operativo', 'read'),
('inventario', 'ssepi_folio_operativo', 'read'),
('ventas', 'ventas', 'update'),
('ventas_sin_compras', 'ventas', 'generate_pdf'),
('taller', 'inventario', 'read'),
('contabilidad', 'coi_sync_queue', 'create'),
('inventario', 'ssepi_folio_evento', 'read'),
('ventas_sin_compras', 'cotizaciones', 'update'),
('taller', 'ordenes_taller', 'create'),
('admin', 'ordenes_taller', 'delete'),
('ventas_sin_compras', 'ventas', 'update'),
('ventas', 'contactos', 'create'),
('contabilidad', 'coi_sync_queue', 'read'),
('administracion', 'facturas', 'read'),
('automatizacion', 'ordenes_taller', 'create'),
('ventas_sin_compras', 'proyectos_automatizacion', 'create')
ON CONFLICT (rol, module, action) DO NOTHING;

-- Nota: Hay 111 registros en total. Si necesitas todos, ejecuta el INSERT completo
-- desde el archivo role_permissions_rows.csv usando Table Editor → Import data.

-- -----------------------------------------------------------------------------
-- 3. CONTACTOS (57 registros - muestra de 10)
-- -----------------------------------------------------------------------------
-- Mapeo: nombre, email, telefono, empresa, tipo

INSERT INTO public.contactos (nombre, email, telefono, empresa, tipo) VALUES
('Felipe Garcia', 'felipe.garcia@nhkspgmx.com', NULL, 'NHK Spring México, S.A. de C.V.', 'provider'),
('IK PLASTIC', NULL, NULL, 'IK PLASTIC', 'client'),
('HIRUTA', NULL, NULL, 'HIRUTA', 'client'),
('BODYCOTE', NULL, '+52 472 103 5500', 'BODYCOTE', 'client'),
('Daniel Zuñiga', 'ventas@ssepi.org', '+52 477 737 3118', 'SSEPI', 'provider'),
('Javier Cruz Castro', 'electronica@ssepi.org', NULL, 'SSEPI', 'provider'),
('HALL ALUMINIUM', NULL, NULL, 'HALL ALUMINIUM', 'client'),
('Envases Plásticos del Centro, S.A. de C.V.', 'compras@eplasticos.com.mx', '+52 444 824 2454', 'Envases Plásticos del Centro, S.A. de C.V.', 'client'),
('HT6 INGENIERIA S DE RL DE CV', 'administracion@ika.technology', '+52 477 711 2851', 'HT6 INGENIERIA S DE RL DE CV', 'client'),
('TACSA', NULL, '+52 33 1148 9204', 'TACSA', 'provider')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. CLIENTES (33 registros)
-- -----------------------------------------------------------------------------
-- NOTA: Los datos en el CSV tienen campos encriptados (direccion_encriptada, rfc_encriptado, etc.)
-- El nuevo schema es más simple. Los campos encriptados no se pueden importar directamente.
-- Se recomienda importar desde Table Editor → Import data para preservar la estructura original.

-- Si el schema de clientes en el nuevo Supabase tiene los mismos campos encriptados,
-- usar Table Editor → Import data con el archivo clientes_rows.csv.

-- -----------------------------------------------------------------------------
-- 5. INVENTARIO (104 registros - muestra de 20)
-- -----------------------------------------------------------------------------
-- Mapeo: sku, nombre, descripcion, categoria, ubicacion, cantidad (stock), precio_costo (costo), precio_venta

INSERT INTO public.inventario (sku, nombre, descripcion, categoria, ubicacion, cantidad, precio_costo, precio_venta) VALUES
('TLH-4951', 'BATERIA 3.6', NULL, 'refaccion', 'E2', 1, 0.00, 0.00),
('CC3-2405SF-E', 'CONVERTIDOR DC/DC AISLADO 3W 5V 0.6A', NULL, 'refaccion', 'E6', 1, 0.00, 0.00),
('GBU2510-G', 'PUENTE RECTIFICADOR 25A', NULL, 'refaccion', 'H5', 1, 0.00, 0.00),
('74HCT02', 'COMPUERTAS LOGICAS NOR', NULL, 'refaccion', 'B3', 7, 0.00, 0.00),
('CRCW25124R7OJNEGIF', 'RESISTENCIA 100 OHMS', NULL, 'refaccion', 'I2', 10, 0.00, 0.00),
('RMS-10K', 'RESISTENCIA SMD 10K OHMS 1/8W 1206', NULL, 'refaccion', 'A11', 10, 0.00, 0.00),
('RMS2K2', 'RESISTENCIA SMD 2.2K OHMS 1/8W 1206', NULL, 'refaccion', 'C11', 9, 0.00, 0.00),
('TL074IYDT', 'amplificador operacional', NULL, 'refaccion', 'Sin ubicación', 1, 0.00, 0.00),
('B43544-E2228-M2', 'CAPACITOR 2200UF 250V', NULL, 'refaccion', 'T14', 0, 0.00, 0.00),
('LT1791IS', 'INTERFAS RS485/422', NULL, 'refaccion', 'D4', 4, 0.00, 0.00),
('IRFR3411', 'MOSFET N-CH 100V 32A DPAK', NULL, 'refaccion', 'C2', 1, 0.00, 0.00),
('SR1210JR-074R7L', 'RESISTENCIA 4.7 OHMS', NULL, 'refaccion', 'I1', 10, 0.00, 0.00),
('3700630410', 'FUSIBLE 0.063A', NULL, 'refaccion', 'G5', 2, 0.00, 0.00),
('MC14503BDR2G', 'Hex Non-Inverting 3-State Buffer', NULL, 'refaccion', 'F4', 5, 0.00, 0.00),
('L7805', 'REGULADOR DE VOLTAJE DE 5V', NULL, 'refaccion', 'A12', 9, 0.00, 0.00),
('2SD2012', 'TRANSISTOR NPN 60V 3A', NULL, 'refaccion', 'I12', 4, 0.00, 0.00),
('CE-470/50V', 'CAPACITOR ELECTROLITICO 470uf/50V', NULL, 'refaccion', 'F12', 10, 0.00, 0.00),
('PS2802-4-A', 'HI-ISO DARLING 4 CH', NULL, 'refaccion', 'D10', 1, 0.00, 0.00),
('TEXTOOL/3M', 'BASE PARA MICROCONTROLADOR DE EDC', NULL, 'refaccion', 'A4', 1, 0.00, 0.00),
('TLP352', 'OPTOACOPLADOR', NULL, 'refaccion', 'B9', 4, 0.00, 0.00)
ON CONFLICT (sku) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. MOVIMIENTOS_INVENTARIO (107 registros)
-- -----------------------------------------------------------------------------
-- Requiere producto_id válido (FK a inventario).
-- IMPORTAR DESDE TABLE EDITOR → Import data para mantener integridad referencial.

-- -----------------------------------------------------------------------------
-- 7. VACACIONES_DIAS_FERIADOS (30 registros)
-- -----------------------------------------------------------------------------
-- IMPORTAR DESDE TABLE EDITOR → Import data con vacaciones_dias_feriados_rows.csv

-- -----------------------------------------------------------------------------
-- 8. VACACIONES_EMPLEADOS (10 registros)
-- -----------------------------------------------------------------------------
-- Requiere usuario_id válido (FK a usuarios.auth_user_id).
-- IMPORTAR DESDE TABLE EDITOR → Import data para mantener integridad referencial.

-- -----------------------------------------------------------------------------
-- 9. CATALOGO_SERVICIOS (17 registros)
-- -----------------------------------------------------------------------------
-- IMPORTAR DESDE TABLE EDITOR → Import data con catalogo_servicios_rows.csv

-- -----------------------------------------------------------------------------
-- 10. GASTOS_FIJOS (12 registros)
-- -----------------------------------------------------------------------------
-- IMPORTAR DESDE TABLE EDITOR → Import data con gastos_fijos_rows.csv

-- =============================================================================
-- RECOMENDACIÓN: Para tablas con FK o muchos registros, usar Table Editor:
-- 1. Ir a Table Editor en Supabase
-- 2. Seleccionar tabla
-- 3. Click ⋮ → Import data
-- 4. Seleccionar archivo CSV correspondiente
-- =============================================================================
