-- ADAPTADO SSEPI: Import idempotente en schema ssepi_import
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor o psql -f ssepi_supabase_adapted.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS ssepi_import;
SET LOCAL search_path TO ssepi_import, public;


-- ÍNDICES ÚNICOS (llaves naturales para ON CONFLICT)
DROP INDEX IF EXISTS ssepi_import.ux_bom_materiales_numero_parte;
CREATE UNIQUE INDEX IF NOT EXISTS ux_bom_materiales_numero_parte
  ON ssepi_import.bom_materiales (numero_de_parte) WHERE numero_de_parte IS NOT NULL AND numero_de_parte != '';

DROP INDEX IF EXISTS ssepi_import.ux_contactos_email;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contactos_email
  ON ssepi_import.contactos (correo_electronico) WHERE correo_electronico IS NOT NULL AND correo_electronico != '';

DROP INDEX IF EXISTS ssepi_import.ux_contactos_nombre_tel;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contactos_nombre_tel
  ON ssepi_import.contactos (nombre_completo, telefono) WHERE nombre_completo IS NOT NULL AND telefono IS NOT NULL;

DROP INDEX IF EXISTS ssepi_import.ux_inventario_auto_num_parte_fecha;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_auto_num_parte_fecha
  ON ssepi_import.inventario_automatizacion (num_parte, fecha) WHERE num_parte IS NOT NULL AND num_parte != '';

DROP INDEX IF EXISTS ssepi_import.ux_inventario_elec_codigo_ubicacion;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_elec_codigo_ubicacion
  ON ssepi_import.inventario_electronica (codigo_marking, ubicacion) WHERE codigo_marking IS NOT NULL AND codigo_marking != '';

DROP INDEX IF EXISTS ssepi_import.ux_ordenes_compra_referencia;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_compra_referencia
  ON ssepi_import.ordenes_compra (referencia_de_la_orden) WHERE referencia_de_la_orden IS NOT NULL AND referencia_de_la_orden != '';

DROP INDEX IF EXISTS ssepi_import.ux_ordenes_reparacion_referencia;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_reparacion_referencia
  ON ssepi_import.ordenes_reparacion (referencia_de_reparacion) WHERE referencia_de_reparacion IS NOT NULL AND referencia_de_reparacion != '';

DROP INDEX IF EXISTS ssepi_import.ux_ordenes_venta_referencia;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_venta_referencia
  ON ssepi_import.ordenes_venta (referencia_de_la_orden) WHERE referencia_de_la_orden IS NOT NULL AND referencia_de_la_orden != '';


-- DEDUPE: eliminar duplicados antes de imponer UNIQUE
DELETE FROM ssepi_import.bom_materiales WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY numero_de_parte ORDER BY id) AS rn FROM ssepi_import.bom_materiales WHERE numero_de_parte IS NOT NULL AND numero_de_parte != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.contactos WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY correo_electronico ORDER BY id) AS rn FROM ssepi_import.contactos WHERE correo_electronico IS NOT NULL AND correo_electronico != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.contactos WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY nombre_completo, telefono ORDER BY id) AS rn FROM ssepi_import.contactos WHERE nombre_completo IS NOT NULL AND telefono IS NOT NULL AND (correo_electronico IS NULL OR correo_electronico = '')) t WHERE t.rn > 1
);
DELETE FROM ssepi_import.inventario_automatizacion WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY num_parte, fecha ORDER BY id) AS rn FROM ssepi_import.inventario_automatizacion WHERE num_parte IS NOT NULL AND num_parte != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.inventario_electronica WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY codigo_marking, ubicacion ORDER BY id) AS rn FROM ssepi_import.inventario_electronica WHERE codigo_marking IS NOT NULL AND codigo_marking != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.ordenes_compra WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY referencia_de_la_orden ORDER BY id) AS rn FROM ssepi_import.ordenes_compra WHERE referencia_de_la_orden IS NOT NULL AND referencia_de_la_orden != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.ordenes_reparacion WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY referencia_de_reparacion ORDER BY id) AS rn FROM ssepi_import.ordenes_reparacion WHERE referencia_de_reparacion IS NOT NULL AND referencia_de_reparacion != '') t WHERE t.rn > 1
);
DELETE FROM ssepi_import.ordenes_venta WHERE id IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY referencia_de_la_orden ORDER BY id) AS rn FROM ssepi_import.ordenes_venta WHERE referencia_de_la_orden IS NOT NULL AND referencia_de_la_orden != '') t WHERE t.rn > 1
);

-- ================================================================
-- SSEPI — Esquema y datos para Supabase (PostgreSQL)
-- Empresa: SSEPI · ventas@ssepi.org · León, Guanajuato, México
-- Generado automáticamente desde archivos Excel
--
-- INSTRUCCIONES DE IMPORTACIÓN:
--   1. En Supabase: SQL Editor → New query
--   2. Pega primero la sección SCHEMA (CREATE TABLE)
--   3. Ejecuta, luego pega la sección DATOS (INSERT)
--   4. O usa: psql -U postgres -d postgres -f ssepi_supabase.sql
-- ================================================================

-- Extensiones recomendadas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================================================
-- SCHEMA — Definición de tablas
-- ================================================================

-- ── bom_materiales (Fuente: BOM_SSEPI / BOM) ──
CREATE TABLE IF NOT EXISTS ssepi_import.bom_materiales (
  id BIGSERIAL PRIMARY KEY,
  item INTEGER,
  numero_de_parte TEXT,
  descripcion TEXT,
  imagen TEXT,
  categoria TEXT,
  estado TEXT,
  nombre_del_proveedor TEXT,
  precio NUMERIC(15,4),
  tiempo_de_entrega TEXT,
  link TEXT,
  nombre_del_proveedor_2 TEXT,
  precio_2 NUMERIC(15,4),
  tiempo_de_entrega_2 TEXT,
  link2 TEXT,
  nombre_del_proveedor_3 TEXT,
  precio_3 TEXT,
  tiempo_de_entrega_3 TEXT,
  link_3 TEXT,
  nombre_del_proveedor_4 TEXT,
  precio_4 NUMERIC(15,4),
  tiempo_de_entrega_4 TEXT,
  link_4 TEXT,
  costo_menor TEXT,
  costo_total_de_las_piezas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.bom_materiales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bom_materiales_categoria ON ssepi_import.bom_materiales(categoria);
CREATE INDEX IF NOT EXISTS idx_bom_materiales_estado ON ssepi_import.bom_materiales(estado);
CREATE INDEX IF NOT EXISTS idx_bom_materiales_nombre_del_proveedor ON ssepi_import.bom_materiales(nombre_del_proveedor);
CREATE INDEX IF NOT EXISTS idx_bom_materiales_nombre_del_proveedor_2 ON ssepi_import.bom_materiales(nombre_del_proveedor_2);
CREATE INDEX IF NOT EXISTS idx_bom_materiales_nombre_del_proveedor_3 ON ssepi_import.bom_materiales(nombre_del_proveedor_3);
CREATE INDEX IF NOT EXISTS idx_bom_materiales_nombre_del_proveedor_4 ON ssepi_import.bom_materiales(nombre_del_proveedor_4);

-- ── bom_datos_referencia (Fuente: BOM_SSEPI / Datos) ──
CREATE TABLE IF NOT EXISTS ssepi_import.bom_datos_referencia (
  id BIGSERIAL PRIMARY KEY,
  actualizado TEXT,
  sensores TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.bom_datos_referencia ENABLE ROW LEVEL SECURITY;

-- ── contactos (Fuente: Contacto__res_partner_ / Sheet1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.contactos (
  id BIGSERIAL PRIMARY KEY,
  avatar_128 TEXT,
  nombre_completo TEXT,
  correo_electronico TEXT,
  telefono TEXT,
  actividades TEXT,
  pais TEXT,
  estadisticas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.contactos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_contactos_nombre_completo ON ssepi_import.contactos(nombre_completo);

-- ── cotizacion_viajes (Fuente: FORMULAS_DE_COTIZACIÓN / Hoja1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.cotizacion_viajes (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT,
  km_x2 NUMERIC(15,4),
  litros NUMERIC(15,4),
  gasolina NUMERIC(15,4),
  gasolina2 NUMERIC(15,4),
  hrs INTEGER,
  hr_dani NUMERIC(15,4),
  dani NUMERIC(15,4),
  total NUMERIC(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.cotizacion_viajes ENABLE ROW LEVEL SECURITY;

-- ── cotizacion_laboratorio (Fuente: FORMULAS_DE_COTIZACIÓN / LABORATORIO) ──
CREATE TABLE IF NOT EXISTS ssepi_import.cotizacion_laboratorio (
  id BIGSERIAL PRIMARY KEY,
  col_30 TEXT,
  col_87 TEXT,
  col_80 TEXT,
  col_161_85 TEXT,
  col_52_67 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.cotizacion_laboratorio ENABLE ROW LEVEL SECURITY;

-- ── cotizacion_motores (Fuente: FORMULAS_DE_COTIZACIÓN / MOTORES) ──
CREATE TABLE IF NOT EXISTS ssepi_import.cotizacion_motores (
  id BIGSERIAL PRIMARY KEY,
  col_30 TEXT,
  col_87 TEXT,
  col_52_67 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.cotizacion_motores ENABLE ROW LEVEL SECURITY;

-- ── cotizacion_automatizacion (Fuente: FORMULAS_DE_COTIZACIÓN / AUTOMATIZACIÓN) ──
CREATE TABLE IF NOT EXISTS ssepi_import.cotizacion_automatizacion (
  id BIGSERIAL PRIMARY KEY,
  col_650 TEXT,
  col_700 TEXT,
  col_450 TEXT,
  col_900 TEXT,
  col_350 TEXT,
  col_600 TEXT,
  col_1100 TEXT,
  col_150 TEXT,
  col_52_67 TEXT,
  col_30 TEXT,
  col_161_85 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.cotizacion_automatizacion ENABLE ROW LEVEL SECURITY;

-- ── cotizacion_suministros (Fuente: FORMULAS_DE_COTIZACIÓN / SUMINISTROS) ──
CREATE TABLE IF NOT EXISTS ssepi_import.cotizacion_suministros (
  id BIGSERIAL PRIMARY KEY,
  col_30 TEXT,
  col_87 TEXT,
  col_52_67 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.cotizacion_suministros ENABLE ROW LEVEL SECURITY;

-- ── inventario_automatizacion (Fuente: Inventario_Automatizacion / Stock) ──
CREATE TABLE IF NOT EXISTS ssepi_import.inventario_automatizacion (
  id BIGSERIAL PRIMARY KEY,
  fecha TIMESTAMPTZ,
  cantidad INTEGER,
  categoria TEXT,
  num_parte TEXT,
  descripcion TEXT,
  costo_unitario NUMERIC(15,4),
  importe NUMERIC(15,4),
  entradas INTEGER,
  salidas INTEGER,
  fecha_de_salida TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.inventario_automatizacion ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inventario_automatizacion_fecha ON ssepi_import.inventario_automatizacion(fecha);
CREATE INDEX IF NOT EXISTS idx_inventario_automatizacion_categoria ON ssepi_import.inventario_automatizacion(categoria);
CREATE INDEX IF NOT EXISTS idx_inventario_automatizacion_num_parte ON ssepi_import.inventario_automatizacion(num_parte);
CREATE INDEX IF NOT EXISTS idx_inventario_automatizacion_fecha_de_salida ON ssepi_import.inventario_automatizacion(fecha_de_salida);

-- ── inventario_electronica (Fuente: inventario_electronica_ssepi / Sheet1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.inventario_electronica (
  id BIGSERIAL PRIMARY KEY,
  codigo_marking TEXT,
  descripcion TEXT,
  existencia INTEGER,
  ubicacion TEXT,
  encapsulado TEXT,
  link_octopart TEXT,
  link_digikey TEXT,
  link_mouser TEXT,
  costo_unitario_mxn INTEGER,
  total_linea_mxn INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.inventario_electronica ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inventario_electronica_codigo_marking ON ssepi_import.inventario_electronica(codigo_marking);

-- ── ordenes_compra (Fuente: Orden_de_compra__purchase_order_ / Sheet1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.ordenes_compra (
  id BIGSERIAL PRIMARY KEY,
  prioridad TEXT,
  referencia_de_la_orden TEXT,
  proveedor TEXT,
  comprador TEXT,
  fecha_limite_de_la_orden TIMESTAMPTZ,
  actividades TEXT,
  total NUMERIC(15,4),
  estado TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_referencia_de_la_orden ON ssepi_import.ordenes_compra(referencia_de_la_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor ON ssepi_import.ordenes_compra(proveedor);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha_limite_de_la_orden ON ssepi_import.ordenes_compra(fecha_limite_de_la_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON ssepi_import.ordenes_compra(estado);

-- ── ordenes_reparacion (Fuente: Orden_de_reparación__repair_order_ / Sheet1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.ordenes_reparacion (
  id BIGSERIAL PRIMARY KEY,
  prioridad TEXT,
  referencia_de_reparacion TEXT,
  fecha_programada TIMESTAMPTZ,
  producto_a_reparar TEXT,
  estado_del_componente TEXT,
  cliente TEXT,
  orden_de_venta TEXT,
  estado TEXT,
  decoracion_de_la_actividad_de_excepcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.ordenes_reparacion ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ordenes_reparacion_referencia_de_reparacion ON ssepi_import.ordenes_reparacion(referencia_de_reparacion);
CREATE INDEX IF NOT EXISTS idx_ordenes_reparacion_fecha_programada ON ssepi_import.ordenes_reparacion(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_ordenes_reparacion_estado_del_componente ON ssepi_import.ordenes_reparacion(estado_del_componente);
CREATE INDEX IF NOT EXISTS idx_ordenes_reparacion_cliente ON ssepi_import.ordenes_reparacion(cliente);
CREATE INDEX IF NOT EXISTS idx_ordenes_reparacion_estado ON ssepi_import.ordenes_reparacion(estado);

-- ── ordenes_venta (Fuente: Orden_de_venta__sale_order_ / Sheet1) ──
CREATE TABLE IF NOT EXISTS ssepi_import.ordenes_venta (
  id BIGSERIAL PRIMARY KEY,
  referencia_de_la_orden TEXT,
  fecha_de_creacion TIMESTAMPTZ,
  cliente TEXT,
  vendedor TEXT,
  actividades TEXT,
  total NUMERIC(15,4),
  estado TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ssepi_import.ordenes_venta ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_referencia_de_la_orden ON ssepi_import.ordenes_venta(referencia_de_la_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_fecha_de_creacion ON ssepi_import.ordenes_venta(fecha_de_creacion);
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_cliente ON ssepi_import.ordenes_venta(cliente);
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_estado ON ssepi_import.ordenes_venta(estado);


-- ================================================================
-- DATOS — Registros de todos los módulos
-- ================================================================

-- ── Datos: bom_materiales ──
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (1, 'DOP-107EV', '7” (800 * 480) 65536 Colores TFT, 256 MB RAM, Ethernet incorporada, 2 juegos de puertos COM / 1 puerto COM de extensión, USB Host, USB Client', NULL, 'HMI´S', 'ACTUALIZADO', 'MERCADO LIBRE', 4925.75, NULL, 'https://www.mercadolibre.com.mx/hmi-dop-107ev-delta-de-7-pulgadas-ethernet-color-touch/p/MLM59644571?pdp_filters=item_id%3AMLM2534674213&from=gshop&matt_tool=28796641&matt_word=&matt_source=google&matt_campaign_id=22118385007&matt_ad_group_id=177188373510&matt_match_type=&matt_network=g&matt_device=c&matt_creative=729726335021&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=735120154&matt_product_id=MLM59644571-product&matt_product_partition_id=2392713578861&matt_target_id=aud-2010778457741:pla-2392713578861&cq_src=google_ads&cq_cmp=22118385007&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=22118385007&gbraid=0AAAAAoTLPrKllrPbEnhRPhTAbgbW_pjBO', NULL, NULL, NULL, NULL, NULL, '}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (NULL, 'DOP-103WQ', '4,3” (480*272) 65536 Colores TFT, Cortex-A8 800MHz CPU, 512 MB RAM. 256 MB ROM, Ethernet incorporada. 1 puerto COM / 1 puerto COM de extensión, USB Host, USB Client', NULL, 'HMI´S', 'ACTUALIZADO', 'MERCADO LIBRE', 5846.0, NULL, 'https://www.mercadolibre.com.mx/pantalla-delta-dop-103wq-hmi-43-in-24vcd/p/MLM59681621#polycard_client=search-nordic&search_layout=stack&position=1&type=product&tracking_id=8cfd8b17-2cb8-485a-8feb-f4dc830ee646&wid=MLM4186980734&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (2, '6ES7215-1AG40-0XB0', 'SIMATIC S7-1200, CPU 1215C, compact CPU, DC/DC/DC, 2 PROFINET ports, onboard I/O: 14 DI 24 V DC; 10 DO 24 V DC; 0.5 A; 2 AI 0-10 V DC, 2 AO 0-20 mA DC, power supply: DC 20.4-28.8 V DC, program/data memory 200 KB', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 16440.24, NULL, 'https://dimeint.com/products/6es7215-1ag40-0xb0', 'Ebay', 9000.0, NULL, 'https://www.ebay.com/itm/388448945492?chn=ps&_trkparms=ispr%3D1&amdata=enc%3A1--4lCSRMSnSPr3mEKNEIdQ32&norover=1&mkevt=1&mkrid=21562-222008-2056-1&mkcid=2&itemid=388448945492&targetid=325425753764&device=c&mktype=pla&googleloc=1010058&poi=&campaignid=21384589900&mkgroupid=164552185618&rlsatarget=pla-325425753764&abcId=&merchantid=5396102022&gad_source=1&gad_campaignid=21384589900&gbraid=0AAAAAD_QDh_iAcJGlJlpfYLD-I3qsrXC-&gclid=Cj0KCQjwgr_NBhDFARIsAHiUWr6CObLGrBkWHYXJ53MsYX8fTCbq8AvWy06lTudQpuuEalIcc3IfhYoaAjDhEALw_wcB', 'AMAZON', '18426', NULL, 'https://www.amazon.com.mx/eiuie-6ES7215-1AG40-0XB0-S7-1200-Compact-215-1AG40-0XB0/dp/B0BNXRZBDV', 'AK CORPORACION', 13644.85, '11 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL),
  (3, '6SL3210-5FE13-5UF0', 'SINAMICS V90, with PROFINET Input voltage: 380-480 V 3 A -15%/+10% 13.8 A 45-66 Hz Output voltage: 0 – Input 11.0 A 0-330 Hz Motor: 3.5 kW Degree of protection: IP20 Size C, 140x260x240 (WxHxD)', NULL, 'SERVODRIVES', 'ACTUALIZADO', 'AMAZON', 20084.32, NULL, 'https://www.amazon.com.mx/FEGIANCHE-Servoaccionamiento-6SL3210-5FE13-5UF0-6SL3210-5FE15-0UF0-6SL3210-5FE17-0UF0/dp/B0DK4YW2DB?th=1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (4, '1FL6092-1AC61-2AB1', 'SIMOTICS S-1FL6-1FL6 Tensión de empleo 400 V 3 AC PN=3,5 kW; NN=2000 1/min M0=22 Nm; MN=16,7 Nm Altura de eje 90 mm, con conector acodado; encóder incremental 2500 incr./vuelta con chaveta, tolerancia con freno de mantenimiento Grado de protección IP65 con junta anular compatible con los convertidores SINAMICS V70 y V90', NULL, 'SERVO MOTOR', 'ACTUALIZADO', 'PLC CITY', 24426.72, NULL, 'https://www.plc-city.com/shop/es/industry-motors-and-drives-electric-motor/1fl6092-1ac61-2ab1-nfs.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (5, '6GK5008-0BA10-1AB2', 'SCALANCE XB008 unmanaged Industrial Ethernet Switch para 10/100 Mbits/s; para configurar pequeñas topologías en estrella y en línea; diagnóstico LED, IP20, 24 V AC/DC fuente de alimentación, con 8 10/100 Mbit/s Twisted Pair Ports con conectores hembra RJ45; manual disponible para su descarga .', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 6295.0, NULL, 'https://www.mercadolibre.com.mx/switch-scalance-xb008-8x10100mb-rj45-ip20/p/MLM22212146#polycard_client=search-nordic&search_layout=grid&position=1&type=product&tracking_id=c6088f6d-d834-4b8d-918c-efbad9c771b2&wid=MLM3856264174&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (6, 'ALP120S24', 'Fuente Conmutada, Marca: Alpha Electric, Potencia de salida : 120W Voltaje de entrada : 100-240VCA~50/60Hz , Voltaje permitido : 85-264VAC~ 50/60Hz, 120-370VCC Voltaje de salida : 24VCD, Corriente de salida : 5A, Dimension: 40*125*113mm', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 799.0, NULL, 'https://www.mercadolibre.com.mx/fuente-voltaje-industrial-120w-5a-24vdc-riel-din/up/MLMU3479352842#polycard_client=search-nordic&search_layout=stack&position=9&type=product&tracking_id=55eff40e-002a-4ed0-9a39-0a473d70eaa7&wid=MLM2489597209&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (7, 'TCN4S-24R', 'Método de visualización : 4 dígitos 7 segmentos LED, Método de control : ON/OFF, P, PI, PD, PID Tipo de entrada : Termopar: K (CA), J (IC), T (CC), R (PR), RTD: DPt100Ω, Cu50Ω Ciclo de muestreo : 100ms, Salida de control : "Relé (250 V CA ~ 3 A) o Unidad SSR (12VDC specialstring) [ON / OFF] ", Fuente de alimentación : 100-240VCA~50/60Hz', NULL, 'SENSORES', 'ACTUALIZADO', 'MERCADO LIBRE', 1135.96, NULL, 'https://articulo.mercadolibre.com.mx/MLM-2099067673-control-de-temperatura-pid-100-240vca-autonics-tcn4s-24r-_JM#is_advertising=true&backend_model=search-backend&position=2&search_layout=grid&type=pad&tracking_id=6113e4d9-ec8e-4e54-adcf-ec373fcac7bf&ad_domain=VQCATCORE_LST&ad_position=2&ad_click_id=ODRiODFhY2UtNjk5ZC00ZmQzLThjODUtMzVjYTk2YzdlNWUz', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (8, '6ES7517-3AP00-0AB0', 'SIMATIC S7-1500, CPU 1517-3 PN/DP, módulo central con memoria de trabajo de 2 MB para programa y 8 MB para datos, 1.ª interfaz: PROFINET IRT con switch de 2 puertos, 2.ª interfaz: PROFINET RT, 3.ª interfaz: PROFIBUS, rendimiento bits 2 ns, se necesita SIMATIC Memory Card', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 137861.36, NULL, 'https://dimeint.com/products/6es7517-3ap00-0ab0?variant=37365362229402&country=MX&currency=MXN&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&utm_campaign=sag_organic&srsltid=AfmBOop0I9gEq8djyk1pw5f_pvItJ9rz6maw1V-Dm1cUcKJXRyoJbaDpG6k', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (9, '6ES7954-8LP04-0AA0', 'SIMATIC S7, memory card for  S7-1x 00 CPU  3.3 V Flash, 2 GB', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 5395.52, NULL, 'https://dimeint.com/pages/productos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (10, '6ES7521-1BL00-0AB0', 'Módulo de entradas digitales DI 32x24 V DC HF, 32 canales en grupos de 16; Retardo de entrada 0,05...20 ms Tipo de entrada 3 (IEC 61131); Diagnóstico, alarmas de proceso: el conector frontal (bornes de tornillo o push-in) debe pedirse por separado', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 8566.6, NULL, 'https://dimeint.com/products/6es7521-1bl00-0ab0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (11, '6ES7522-1BL00-0AB0', 'MODULO DE SALIDA DIGITAL DQ 32 X DC24V / 0,5A; 32 CANALES EN GRUPOS DE 8; 4A POR GRUPO; DIAGNOSTICO; VALOR SUSTITUCION', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 12189.28, NULL, 'https://dimeint.com/products/6es7522-1bl01-0ab0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (12, '6ES7531-7KF00-0AB0', 'Módulo de entradas analógicas AI 8 x U/I/RTD/TC ST, Resolución de 16 bits, precisión 0,3 %, 8 canales en grupos de 8, 4 canales para medición de RTD, tensión en modo común 10 V; diagnóstico; alarmas de proceso incl. elemento de alimentación, abrazadera de pantalla', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 16511.44, NULL, 'https://dimeint.com/products/6es7531-7kf00-0ab0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (13, '6ES7 532-5HF00-0AB0', 'Módulo de salidas analógicas AQ 8xU/I HS, resolución de 16 bits, precisión del 0,3%, 8 canales en grupos de 8, diagnóstico, valor sustitutivo 8 canales en sobremuestreo de 0,125 ms incl. elemento de alimentación.', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 22090.75, NULL, 'https://dimeint.com/products/6es7532-5hf00-0ab0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (14, '6ES7590-1AE80-0AA0', 'Siemens Simatic S7-1500 Riel De Montaje 482Mm SKU: 6ES7590-1AE80-0AA0 -Ancho 482 mm -Altura 155 mm -Profundidad 16 mm', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 792.86, NULL, 'https://dimeint.com/products/6es7590-1ae80-0aa0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (15, 'ACS580-01-046A-4', 'Voltaje: 380 - 480 VAC Fases de alimentación / entrada: Trifásica Potencia del motor en kW: 18.5 / 22 KW Potencia del motor en HP: 25 / 30 Hp', NULL, 'VARIADOR', 'ACTUALIZADO', 'BADESA', 48177.77, NULL, 'https://grupobadesa.com/', 'EUAUTOMATION', 49500.0, NULL, 'https://www.euautomation.com/mx/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (16, 'ACS380-040S-032A-4', 'Variador de velocidad + panel de control asistente. Tensión nominal de entrada 380 V CA-480 V CA (trifásica/3P) - Corriente nominal 32 A - Potencia nominal 15 kW - IP20 - Tamaño de bastidor R4 - con capacidad de comunicación Modbus RTU/Modbus - Montaje en superficie/pared - con Safe Torque Off (STO) integrado.', NULL, 'VARIADOR', 'ACTUALIZADO', 'BADESA', 22732.47, NULL, 'https://grupobadesa.com/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (17, '01836ET3E160L', 'MOTOR IE3 18.5KW, 2 POLOS, ARMAZÓN 160L WEG -Carcasa: 160L -Norma: NEMA MG-1 -Frecuencia: 60 Hz -Tensión: 460//380-415 V -Corriente nominal: 34.6 A -Corriente de arranque: 284 A -Corriente en vacío: 11.5 A -Numero de polos: 2 -Grado de protección: IP55 -Rotación sincrona: 3600 rpm -Potencia: 25 HP -Fijación: Con pies -Brida: FF -Forma constructiva: B35L(E) -Refrigeración: IC411 - TEFC', NULL, 'MOTORES', 'ACTUALIZADO', 'BADESA', 43600.0, NULL, 'https://grupobadesa.com/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (18, 'CVVM2-6145DBYA-EP-121', 'MOTORREDUCTOR CYCLOIDAL MONTAJE VERTICAL CON BRIDA LADO BAJA VELOCIDAD PARA SU MONTAJE, DE 2 HP., 1750 RPM. DE ENTRADA, RELACION DE REDUCCION 121:1, 14.5 RPM. A LA SALIDA, ACOPLADO CON MOTOR ELECTRICO EFICIENCIA PREMIUM 3/60 Hz. 230/460 VOLTS, PAR MAXIMO 7,890 Lb-in, CLASE AGMA I, FACTOR DE SERVICIO 1.01, EJES PARALELOS, MARCA SUMITOMO, MODELO CVVM2-6145DBYA-EP-121._x000D_', NULL, 'MOTORES', 'ACTUALIZADO', 'ENERGÍA CONTROLADA DE MÉXICO S.A. DE C.V.', 63108.78, NULL, 'https://energiacontrolada.com/', 'DOMUM', 44313.45, '1.5 SEMANAS', '17/03/2026 NÚMERO DE COTIZACIÓN: S02958', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (19, 'EL1A0045MCAB', 'Transformador Seco de Baja Tensión de 45kVA Trifásico EXPRESS L EL1A0045MCAB Hammond  -Capacidades kVA: 45 kVA -Número de fases: 3 -Conductores de los devanados: Aluminio -Aprobado por UL: File: E112313 -Frecuencia: 60 Hz -Sistema de Aislamiento: 220ºC (Elevación 150ºC) -Tipo de Gabinete: Tipo 2 estándar -Terminación del Gabinete: ANSI 61 Gris UL50 -Terminal de neutro: Terminal provista para conexión en campo cuando sea aplicable -Tensiones en derivaciones estándar en A.T: 440, 460, 480, 504 -Tensión en B.T.: 220Y/127 -Montaje: Se puede montar en el suelo o en la pared/techo. -Nivel de Sonido: Cumple con las normas de NEMA ST-20', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'TEISA', 38538.15, NULL, 'https://teisaintegral.com.mx/ver-todo/transformador-seco-de-baja-tension-de-45kva-trifasico-express-l-el1a0045mcab-hammond/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (20, 'H100-2S/2T-90G', 'Variador de frecuencia 120HP entrada trifásica salida trifasica 220VAC 352 Amperes Tensión de entrada CA 3F 220V (± 15%) Frecuencia de entrada 50Hz/60Hz ±5% Tensión de salida CA 3F 0-220V - tensión de entrada, desviación < ± 3% Frecuencia de salida 0~600Hz', NULL, 'VARIADOR', 'ACTUALIZADO', 'EQUIPOS INDUSTRIALES HAB', 89759.0, NULL, 'https://equiposindustrialeshab.com/products/variador-de-frecuencia-125-hp-entrada-bifasica-trifasica-salida-trifasica-220v?_pos=1&_sid=d5c70fab2&_ss=r', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (21, 'H100-2S/2T-75G', 'Variador de frecuencia100HP entrada trifásica salida trifasica 220VAC 250 Amperes Tensión de entrada CA 3F 220V (± 15%) Frecuencia de entrada 50Hz/60Hz ±5% Tensión de salida CA 3F 0-220V - tensión de entrada, desviación < ± 3% Frecuencia de salida 0~600Hz', NULL, 'VARIADOR', 'ACTUALIZADO', 'EQUIPOS INDUSTRIALES HAB', 84819.0, NULL, 'https://equiposindustrialeshab.com/products/variador-de-frecuencia-100-hp-entrada-bifasica-trifasica-salida-trifasica-220v?_pos=1&_sid=f313dbca1&_ss=r', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (22, 'THWLS500', 'CABLE THWLS VINANEL XXI CAL. 500 MCM. 600V. 90° COLOR NEGRO - CONDUMEX', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'EURO ELÉCTRICA', 969.76, NULL, 'https://euroelectrica.com.mx/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (23, 'OGD250', 'Sensor de distancia óptico,Alimentación	PNP/NPN; Función de salida 2 x normalmente abierto / normalmente cerrado; de 20 cmm a 2 Mts', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 6804.0, NULL, 'https://www.ifm.com/mx/es/product/OGD250', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (24, 'O1D120', 'Sensor de distancia óptico,alcance desde 15mm hasta 10 m, dos salidas de conmutación.  -Una salida analógica de 4-20mA. -Voltaje de alimentación 18-30VDC, 150mA, función de salida programable NO o NC. -Comunicación IO Link, velocidad de transmisión 38.4kBaud', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 8218.0, NULL, 'https://www.ifm.com/mx/es/product/O1D120', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (25, 'E21079', 'Set de montaje para sensor Óptico O1D120', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 1416.0, NULL, 'https://www.ifm.com/mx/es/product/E21079', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (26, 'EVC563', 'Cable de conexión con conector  hembra M12, 4 pines. Para sensor óptico O1D120', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 1043.0, NULL, 'https://www.ifm.com/mx/es/product/EVC563', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (27, 'E21133', 'Tapa de protección Para sensor óptico O1D120', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 938.0, NULL, 'https://www.ifm.com/mx/es/product/E21133', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (28, 'TPD19', 'TUBO PARED DELGADA DE 19MM (3/4) ETIQUETA VERDE', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 96.35, NULL, 'https://euroelectrica.com.mx/producto/tubo-pared-delgada-de-19mm-3-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (29, 'CPD19', 'CODO PARED DELGADA DE19MM (3/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 24.84, NULL, 'https://euroelectrica.com.mx/producto/codo-pared-delgada-de19mm-3-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (30, 'COPLE19TADO', 'COPLE PARA TUBO PARED DELGADA DE 19MM (3/4) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 8.89, NULL, 'https://euroelectrica.com.mx/producto/cople-para-tubo-pared-delgada-de-19mm-3-4-tipo-americano-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (31, 'CONECTOR19TADO', 'CONECTOR PARA TUBO PARED DELGADA DE 19MM (3/4) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 8.89, NULL, 'https://euroelectrica.com.mx/producto/conector-para-tubo-pared-delgada-de-19mm-3-4-tipo-americano-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (32, '6AG1124-2DC01-4AX0', 'Siemens HMI KTP400 Comfort 4.3", resolución de 480x272, voltaje de alimentación 24VDC. Interfaces de comunicación 1xRS485, 1xUSB 2.0, 1xUSB mini B. Protocolos de comunicación:   -PROFINET -PROFINET IO -PROFIBUS -MPI', NULL, 'HMI´S', 'ACTUALIZADO', 'MERCADO LIBRE', 5890.0, NULL, 'https://www.mercadolibre.com.mx/siemens-6ag11242dc014ax0-ktp400-comfort/up/MLMU3630966821?pdp_filters=item_id:MLM2590949691&matt_tool=87160837&matt_word=&matt_source=google&matt_campaign_id=22118381512&matt_ad_group_id=170611885102&matt_match_type=&matt_network=g&matt_device=c&matt_creative=729602341872&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=5560518296&matt_product_id=MLM2590949691&matt_product_partition_id=2392173502264&matt_target_id=aud-2010778457741:pla-2392173502264&cq_src=google_ads&cq_cmp=22118381512&cq_net=g&cq_plt=gp&cq_med=pla&gad_campaignid=22118381512', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (33, 'S/N', 'Tope Rampa Protector De Cables 2 Canales Para Piso Uso Rudo', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 799.0, NULL, 'https://www.mercadolibre.com.mx/tope-rampa-protector-de-cables-2-canales-para-piso-uso-rudo/up/MLMU569033720', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (34, 'OMEGA19DO', 'ABRAZADERA OMEGA PARA TUBO CONDUIT DE 19MM (3/4) MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 3.37, NULL, 'https://euroelectrica.com.mx/producto/abrazadera-omega-para-tubo-conduit-de-19mm-3-4-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (35, 'S/N', 'Bolsa 4 Taquetes Expansivos 1/4 Con Tornillo, Fiero 44360', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 47.0, NULL, 'https://www.mercadolibre.com.mx/bolsa-4-taquetes-expansivos-14-con-tornillo-fiero-44360/p/MLM27403961?pdp_filters=item_id%3AMLM1958523451&from=gshop&matt_tool=46948161&matt_word=&matt_source=google&matt_campaign_id=22114634876&matt_ad_group_id=170611843342&matt_match_type=&matt_network=g&matt_device=c&matt_creative=729602339400&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=735088283&matt_product_id=MLM27403961-product&matt_product_partition_id=2387500413747&matt_target_id=aud-2010778457741:pla-2387500413747&cq_src=google_ads&cq_cmp=22114634876&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=22114634876&gbraid=0AAAAAoTLPrIMDUW-17ZoPsFinwrJqDiOL', 'El tornillo', 4.38, '1 dia', 'Folio 0029676 30/01/2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (36, 'S/N', 'TAQUETE EXPANSIVO TX GALVANIZADO 3/8X3', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 13.4, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/taquetes/taquete-expansivo-tx-galvanizado-3%2F8x3?gad_source=1&gad_campaignid=21686270870&gbraid=0AAAAADsHgclHW7nyZhAtB6Q1Vbbf8vSM0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (37, 'RV3100', 'Encóder incremental con eje macizo de Acero Inoxidable IFM INCREMENTAL ENCODER BASIC LINE  -Diámetro del eje 10mm. -Tensión de alimentación de 4.75-30VDC, 150mA, HTL/TTL. -Resolución parametrizable de 1-10000 (configuración de fábrica 1024). -Interfaz de comunicación por IO Link COM2 (38,4 kBaud).', NULL, 'ENCODER', 'ACTUALIZADO', 'IFM', 4150.0, NULL, 'https://www.ifm.com/mx/es/product/RV3100', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (38, 'M815', 'M815 3d Couple Cople Flexible Adaptador 10mmx10mmx25', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 77.5, NULL, 'https://www.mercadolibre.com.mx/m815-3d-couple-cople-flexible-adaptador-10mmx10mmx25/up/MLMU989015159#polycard_client=search-desktop&search_layout=grid&position=3&type=product&tracking_id=f9185add-8dfe-4fb1-a6bc-c625fc7b2f37&wid=MLM760595796&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (39, 'EVC546', 'Cable para encoderde 10m Libre de halógenos, negro, Ø 4,9 mm, apantallado; 5 x 0,25 mm² (32 x Ø 0,1 mm ) conector M12', NULL, 'ENCODER', 'ACTUALIZADO', 'IFM', 820.0, NULL, 'https://www.ifm.com/mx/es/product/EVC546#details', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (40, 'E60035', 'Escuadra de fijación para encóders', NULL, 'ENCODER', 'ACTUALIZADO', 'IFM', 2239.0, NULL, 'https://www.ifm.com/mx/es/product/E60035', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (41, 'S/N', 'Gabinete metálico 50x50x20', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 2449.0, NULL, 'https://articulo.mercadolibre.com.mx/MLM-2549445159-gabinete-electrico-alcodm-50x50x20-cm-metalico-de-superficie-_JM?searchVariation=192735733493#polycard_client=search-nordic&searchVariation=192735733493&search_layout=grid&position=2&type=item&tracking_id=7bfe60af-598c-480b-b051-4f50443ff15f', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (42, 'S/N', 'PHOENIX CONTACT CANALETA GRIS 40X60X2000mm', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'DIMEINT', 187.94, NULL, 'https://dimeint.com/products/phoenix-contact-canaleta-gris-40x60x2000mm-an-x-al-x-long?variant=50139673166071&country=MX&currency=MXN&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&utm_campaign=sag_organic', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (43, 'A9F74103', 'Interruptor termomagnético Acti9 1 Polo 3 A 220/440 Vca. IC60N Riel DIN', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'EURO ELÉCTRICA', 239.59, NULL, 'https://euroelectrica.com.mx/producto/interruptor-termomagnetico-acti9-1-polo-3-a-220-440-vca-ic60n-riel-din/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (44, 'PLS6-C5-MW', 'Interruptor Termomag. 1p 5a 242674 Moeller Pls6-c5-mw', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'MERCADO LIBRE', 408.41, NULL, 'https://www.mercadolibre.com.mx/interruptor-termomag-1p-5a-242674-moeller-pls6c5mw/up/MLMU720620635?matt_tool=28238160&utm_source=google_shopping&utm_medium=organic&pdp_filters=item_id:MLM639615512', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (45, NULL, 'Pija Cabeza De Cruz Punta Broca 1/2'' Fiero 44645', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 56.0, NULL, 'https://www.mercadolibre.com.mx/pija-cabeza-de-cruz-punta-broca-12-fiero-44645/up/MLMU903394649#polycard_client=search-nordic&search_layout=grid&position=5&type=product&tracking_id=9639266a-e107-4565-b3bf-9d26ecd081e1&wid=MLM1651643206&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (46, 'CV18A', 'METRO DE CABLE TFLS VINANEL-XXI CAL. 18 AWG. 600V. 90°C COLOR AZUL. MCA. CONDUMEX', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 4.25, NULL, 'https://euroelectrica.com.mx/producto/cable-tfls-vinanel-xxi-cal-18-awg-600v-90c-color-azul-mca-condumex/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (47, 'CTHW12N', 'METROS DE CABLE CON AISLAMIENTO TIPO THW 12 AWG, 90° 600V. COLOR NEGRO MCA. CONDULAC', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EURO ELÉCTRICA', 12.1, NULL, 'https://euroelectrica.com.mx/producto/cable-con-aislamiento-tipo-thw-12-awg-90-600v-color-negro-mca-condulac/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (48, '4160326', 'METROS DE OLFLEX Cable 18Awg 1X1 Azul/Bco Multi-Standard', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'DIMEINT', 15.0, NULL, 'https://dimeint.com/products/4160326', 'TME', 25.0, NULL, 'https://www.tme.com/mx/es/details/h07v2-k150blwh/cables-de-un-hilo-trenzado/helukabel/63417/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (49, 'TS35X7.5 1M', 'Riel Din Perforado 1 metro', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 112.0, NULL, 'https://www.mercadolibre.com.mx/riel-din-perforado-plateado-1-metro/up/MLMU3118674891?pdp_filters=item_id%3AMLM2281070227&from=gshop&matt_tool=53826643&matt_word=&matt_source=google&matt_campaign_id=23406600413&matt_ad_group_id=193915105674&matt_match_type=&matt_network=g&matt_device=c&matt_creative=790322146796&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=5589206556&matt_product_id=MLMU3118674891&matt_product_partition_id=2388138774430&matt_target_id=aud-1927594328786:pla-2388138774430&cq_src=google_ads&cq_cmp=23406600413&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=23406600413&gbraid=0AAAAAoTLPrKDOaxZgTEvU7lO63Zcr0Pkh&gclid=Cj0KCQjwgr_NBhDFARIsAHiUWr47zlUxA98cWFg2PuXfKCuQsJENpKMFhw1cF4NTsJkQAuqW_bKTXdgaAt2QEALw_wcB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (50, 'WDU 2.5', 'Paquete De 30 Clemas De Paso Wdu 2.5 24a Cal 26 A 12 Awg', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 1147.65, NULL, 'https://www.mercadolibre.com.mx/paquete-de-30-clemas-de-paso-wdu-25--24a--cal-26-a-12-awg/up/MLMU561648330?pdp_filters=item_id:MLM1766779705#polycard_client=search-nordic&position=7&search_layout=stack&type=item&tracking_id=90562171-34a5-4085-b96b-d721f15d64f0', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (51, 'M21-750-499', 'Etiquetas para etiquetadora Brady', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'BRADY', 654.75, NULL, 'https://www.bradyid.com.mx/alambre-cable-etiquetas/etiquetas-de-nailon-multiusos-serie-bmp21-plus-cps-brus-11832?part-number=m21-750-499', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (52, '60.12.9.024.0040', 'Relevadores 24VDC de 8 pines', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 26.0, NULL, 'https://www.mercadolibre.com.mx/relevador-finder-24v-dc-10a-8-pines-octal/up/MLMU571000043#polycard_client=search-nordic&search_layout=grid&position=2&type=product&tracking_id=cea0086a-f4f6-4125-8670-3ffb75e20691&wid=MLM2763974516&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (53, '90.20 SMA', 'Base Para Relevador 8 Pines 90.20sma Marca Finder', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 300.0, NULL, 'https://www.mercadolibre.com.mx/base-para-relevador-8-pines-9020sma-marca-finder/up/MLMU720425073#polycard_client=search-nordic&search_layout=stack&position=47&type=product&tracking_id=a3fb8e53-be78-4587-9175-a44a6b85b004&wid=MLM617642281&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (54, 'XB005', 'Scalance 5 puertos XB005', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 3300.0, NULL, 'https://www.mercadolibre.com.mx/6gk5005-0ba00-1ab2-siemens-switch/p/MLM2052493882#polycard_client=search-nordic&search_layout=grid&position=3&type=product&tracking_id=e8a4c505-99d3-4cef-b30d-a1750abffa68&wid=MLM2583994489&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (55, 'S/N', 'Metros de multiconductor 4x18AWG', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'STEREN', 29.0, NULL, 'https://www.steren.com.mx/cable-multiconductor-de-4-vias-22-awg-vta.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (56, 'O5D150', 'Sensor de distancia óptico', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 4361.0, NULL, 'https://www.ifm.com/mx/es/product/O5D150', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (57, 'E21084', 'Set de montaje para sensor Óptico', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 431.0, NULL, 'https://www.ifm.com/mx/es/product/E21084', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (58, 'EVC008', 'Cable de conexión con conector  hembra M12, 4 pines.', NULL, 'SENSORES', 'ACTUALIZADO', 'IFM', 31.0, NULL, 'https://www.ifm.com/mx/es/product/EVC008', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (59, 'UCF205-16', 'Chumacera de pared de 1"', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'MERCADO LIBRE', 80.0, NULL, 'https://www.mercadolibre.com.mx/chumacera-de-pared-1-pulgada-ucf20516/up/MLMU721480569?pdp_filters=item_id:MLM724668919&matt_tool=87160837&matt_word=&matt_source=google&matt_campaign_id=22118381512&matt_ad_group_id=170611885102&matt_match_type=&matt_network=g&matt_device=c&matt_creative=729602341872&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=140001630&matt_product_id=MLM724668919&matt_product_partition_id=2391454164636&matt_target_id=aud-2010778457741:pla-2391454164636&cq_src=google_ads&cq_cmp=22118381512&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=22118381512&gbraid=0AAAAAoTLPrKqJg8pRZh9NSbjVTCKhMKRq', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (60, '147-064', 'Tornillo cabeza plana 1/4"x1 1/2"', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 5.24, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/linea-allen/tornillo-allen-cabeza-plana-nc-20h-pavonado-1%2f4x1_1%2f2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (61, '100-184', 'Tornillos cabeza hexagonal 3/8"x1 1/2"', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 3.78, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tornillos/tornillo-hexagonal-g2-nc-cuerda-corrida-16h-natural-3%2f8x1_1%2f2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (62, '122-740', 'Tuerca 3/8', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 1.37, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tuercas/tuerca-hexagonal-liviana-g2-nc-16h-galvanizada-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (63, '137-320', 'Rondana plana 3/8', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 1.09, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/rondanas/rondana-plana-nc-g2-gic-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (64, '139-208', 'Rondana de presión 3/8', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EL TORNILLO', 1.17, NULL, 'https://eltornillo.com.mx/tienda-en-linea/catalogo/rondanas/rondana-de-presion-nc-gic-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (65, 'CVVM1H-6140DBYB-EP-121', 'Motorreductor cicloidal, montaje vertical V-Flange, ejes paralelos, 1750 rpm de entrada 1.5 HP, acoplado directamente entre el motor y reductor, F.S. 1.07 I 3/60 Hz. 230/460 volts, marca SUMITOMO con base montaje vertical', NULL, 'MOTORES', 'ACTUALIZADO', 'DOMUM', 51346.592, '1.5 SEMANAS', '17/03/2026 NÚMERO DE COTIZACIÓN: S02958', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (66, 'E6B2-CWZ1X 600 P/R.', 'Enconder Incremental Rotatorio Cat. E6b2-cwz1x 600p/r Omron. (hay 2 en existencia) Voltaje de alimentación 5VDC, 70mA, Canales de salida A, B, Z (Reversibles) RS-422', NULL, 'ENCODER', 'ACTUALIZADO', 'MERCADO LIBRE', 1900.0, NULL, 'https://www.mercadolibre.com.mx/enconder-incremental-rotatorio-cat-e6b2cwz1x-600pr-omron/up/MLMU3228729513?pdp_filters=item_id:MLM2338289361', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (67, 'V3', 'Flejadora De Mano Automática Batería Recargable Para FlejeBatería de litio de 4000 mAh, carga completa en 90 minutos para más de 350 flejados. Fuerza de tensión de 3200 N para un flejado eficiente.', NULL, 'FLEJADORAS', 'ACTUALIZADO', 'MERCADO LIBRE', 7896.96, NULL, 'https://www.mercadolibre.com.mx/flejadora-de-mano-automatica-bateria-recargable-para-fleje/p/MLM46244189#polycard_client=search-nordic&search_layout=grid&position=1&type=product&tracking_id=44d039e5-1eba-419d-87f8-a829daba7514&wid=MLM3573201890&sid=search', 'MERCADO LIBRE', 7788.96, NULL, 'https://www.mercadolibre.com.mx/flejadora-de-mano-automatica-bateria-recargable-para-fleje/p/MLM46244189?pdp_filters=shipping:fulfillment#intervention_type=full&position=1&search_layout=grid&type=cart_intervention&tracking_id=b9abc603-f664-4754-94e9-8c7cf624cbdf', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (68, NULL, 'Flejadora eléctrica automática con batería de larga duración de 2 x 4000 mAh, herramienta de flejado PP/PET de 0.4-0.6 pulgadas de ancho, visualización digital, fácil de usar', NULL, 'FLEJADORAS', 'ACTUALIZADO', 'AMAZON', 8259.04, NULL, 'https://www.amazon.com.mx/Flyrivergo-Flejadora-el%C3%A9ctrica-autom%C3%A1tico-visualizaci%C3%B3n/dp/B0DLG2FJ85/ref=asc_df_B0DLG2FJ85?mcid=dcccfbfb44ce38ea9f3055b06861b975&tag=gledskshopmx-20&linkCode=df0&hvadid=746085284773&hvpos=&hvnetw=g&hvrand=17091493621930907846&hvpone=&hvptwo=&hvqmt=&hvdev=c&hvdvcmdl=&hvlocint=&hvlocphy=1010058&hvtargid=pla-2397686851358&psc=1&language=es_MX&gad_source=1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (69, 'JBK3-630VA', 'Transformador De Control Andeli 630va Plateado Voltaje de entrada: 110-440VAC Voltaje de salida: 12, 24, 110 y 220VAC', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 2880.0, NULL, 'https://www.mercadolibre.com.mx/transformador-de-control-andeli-630va/up/MLMU3482584306?pdp_filters=item_id:MLM2491903927#is_advertising=true&searchVariation=MLMU3482584306&backend_model=search-backend&position=8&search_layout=grid&type=pad&tracking_id=025d30c8-1346-4c2e-a462-a3bfddc1528d&ad_domain=VQCATCORE_LST&ad_position=8&ad_click_id=YTY4Zjc1MTktYWIwYS00YWU5LWE3ZjItOGE4Y2RjYmQ1MDMz', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (70, '40.52.8.230.0000', 'FINDER RELEVADOR MINI 2CC 8AMP 230VAC 2P2T 8PIN DOBLE POLO, DOBLE TIRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EGA Industrial', 140.0, NULL, 'Cotizacion del 27 enero 2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (71, '5SL6120-7CC', 'Interruptor automático 230/400V 6kA, 1 polo, Curva de disparo C, 20 A', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'Ega Industrial', 105.0, NULL, 'Cotizacion del 27 enero 2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (72, '704200', 'Fusible 200Amp curva K (De acción rápida) Fusible de potencia tipo SMU20 34.5 kv 200 Amp, cat 704200 S&C', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'Moises Gazca', 5500.0, NULL, 'Cotizacion del 27 enero 2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (73, '95.05SPA', 'Base Relevador 8 pines 10A; 250VAC; Para montaje en riel DIN; -40÷70°C; IP20', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EGA Industrial', 80.0, NULL, 'Cotizacion del 27 enero 2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (74, 'ELT-50', 'CONECTOR RECTO PARA TUBO LICUATITE DE 13 MM (1/2) CON ALMA DE ACERO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 25.7, NULL, 'https://euroelectrica.com.mx/producto/elt-50-conector-recto-para-tubo-licuatite-de-13-mm-1-2-marca-crouse-hinds-domex/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (75, 'ELT-75', 'CONECTOR RECTO PARA TUBO LICUATITE DE 19MM (3/4) CON ALMA DE ACERO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 35.25, NULL, 'https://euroelectrica.com.mx/producto/elt-75-conector-recto-para-tubo-licuatite-de-19mm-3-4-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (76, 'THW-2-LS', 'CABLE DE COBRE TIPO THW LS DE CAL. 14 AWG Color Negro', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 12.6, NULL, 'https://euroelectrica.com.mx/producto/cable-de-cobre-tipo-thw-ls-de-cal-14-awg-600v-viakon/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (77, 'THHW-LS', 'CABLE THWLS VINANEL-XXI CAL. 14 AWG. 600V. 90°C COLOR VERDE', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 12.11, NULL, 'https://euroelectrica.com.mx/producto/cable-thwls-vinanel-xxi-cal-14-awg-600v-90c-color-verde-mca-condumex/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (78, 'YSLCY-JZ', 'Cable multiconductor, 5 hilos, bindado Calve: 0302050050', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'IKA TECHNOLOGY', 30.5, NULL, 'Cotización IKA technology', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (80, 'V6K2525', 'Canaleta ranurada de plástico gris 25x25', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 103.5, NULL, 'https://www.mercadolibre.com.mx/canaleta-ranurada-25x25-de-1-metro/up/MLMU2986577640?pdp_filters=item_id%3AMLM2227652121#origin%3Dshare%26sid%3Dshare%26wid%3DMLM2227652121', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (81, 'FD-HCB2', 'Cable para sensor de flujo tipo abrazadera M12 cable de alimentación, 8 pines, 2 m KEYENCE', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'KEYENCE', 1120.0, NULL, 'Cotizacion del 26 enero 2026 - 11278159', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (82, 'G2R-2-SN 230V', 'Relé electromagnético; DPDT; Uinductor: 230VAC; Icantactosmáx: 5A  sin base OMRON', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'TME', 278.82, NULL, 'https://www.tme.com/mx/es/details/g2r-2-sn-230ac/reles-electromagn-industriales/omron/g2r-2-sn-230vac-s/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (83, '303020', 'Gabinete Metálico  IP66 300 X 300 X 200 Profundidad: 20 cm Ancho: 30 cm Largo: 30 cm', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 1031.0, NULL, 'https://www.mercadolibre.com.mx/gabinete-metalico-30x30x20-con-platina/up/MLMU564347200#polycard_client=search-desktop&search_layout=grid&position=1&type=product&tracking_id=6b16ca34-16a0-45dd-99b6-c137fc864e1b&wid=MLM1983965809&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (84, '46384', 'Gabinete Metálico de acero Voltek IP66 400 X 400 x 200 Profundidad: 20 cm. Ancho: 40 cm. Largo: 40 cm. Calibre de lámina 1.2mm', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 1425.0, NULL, 'https://www.mercadolibre.com.mx/gabinete-metalico-400-x-400-mm-volteck-46384/p/MLM26320456?pdp_filters=item_id%3AMLM2058098453#origin%3Dshare%26sid%3Dshare%26wid%3DMLM2058098453', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (85, 'TLIC13', 'TUBO FLEXIBLE DE ACERO FORRADO DE PVC (LICUATITE) DE 13 MM (1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 51.25, NULL, 'https://euroelectrica.com.mx/producto/tubo-flexible-de-acero-forrado-de-pvc-licuatite-de-13-mm-1-2-marca-tubos-mexicanos-flexibles/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (86, 'TLIFLEX19', 'TUBO LICUAFLEX CON ALMA DE ACERO FORRADO DE PVCDE 19MM (3/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 31.37, NULL, 'https://euroelectrica.com.mx/producto/tubo-licuaflex-de-19mm-3-4-marca-tubos-mexicanos-flexibles/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (87, 'LSLV0015G100-2EONN', 'VARIADOR DE FRECUENCIA LS ELECTRIC DE LA FAMILIA G100, 2HP DE POTENCIA,  ALIMENTACIÓN Y SALIDA 240V, 3 FASES CORRIENTE NOMINAL DE SALIDA 8.4-10.8A', NULL, 'VARIADOR', 'ACTUALIZADO', 'Galco', 6948.5, NULL, 'https://www.galco.com/lslv0015g100-2eonn-lsea.html?srsltid=AfmBOopaAQuORuTPFS-xBGBdS1vUDwlyIz3G_P2nxsf_eDo2qi2yorxs', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (88, 'PNOZ S5', '24VDC 2 N/O 2 N/O T Pilz Configurable 24 V dc Safety Relay Dual Channel with 2 Safety Contacts TIEMPO CONFIGURABLE', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'MERCADO LIBRE', 9000.0, NULL, 'https://www.mercadolibre.com.mx/relevador-pnoz-s5-c-24vdc-2-no-2-no-t-resorte-pilz-751105/p/MLM28209326?pdp_filters=item_id%3AMLM4454511478#origin%3Dshare%26sid%3Dshare%26wid%3DMLM4454511478', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (89, '3590S', 'Potenciometro De Precisión Con Perilla 10k, 2W.', NULL, 'ACCESORIOS', 'NO ACTUALIZADO', 'MERCADO LIBRE', 104.9, NULL, 'https://www.mercadolibre.com.mx/potenciometro-5k-ohm-2w-multivuelta-precision-ajustable/p/MLM2060521617?pdp_filters=item_id:MLM1841176928#is_advertising=true&searchVariation=MLM2060521617&backend_model=search-backend&position=1&search_layout=grid&type=pad&tracking_id=c750fb5a-caf7-4f39-95d8-af5ae425ce5a&ad_domain=VQCATCORE_LST&ad_position=1&ad_click_id=Y2M2MzEzNzYtZDA3Zi00NzNlLThiYjktZTBlZGQ3ZTgzZThk', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (90, 'QRA4.U', 'Detectores de llamapara controles de quemador Siemens, para la monitorización de llamas de gas y llamas de aceite.', NULL, 'SENSORES', 'ACTUALIZADO', 'ALIEXPRESS', 2243.0, NULL, 'https://es.aliexpress.com/item/1005008524600237.html?spm=a2g0o.productlist.main.4.299acAoncAonxj&algo_pvid=3d6839c5-1837-49d2-b041-abbc91e0114b&algo_exp_id=3d6839c5-1837-49d2-b041-abbc91e0114b-3&pdp_ext_f=%7B%22order%22%3A%22-1%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&pdp_npi=6%40dis%21MXN%211228.90%211228.90%21%21%21486.37%21486.37%21%402101e62517697277988601662e6953%2112000045555336128%21sea%21MX%210%21ABX%211%210%21n_tag%3A-29910%3Bd%3A8d82e2f1%3Bm03_new_user%3A-29895&curPageLogUid=W3OGoySWA3Vp&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005008524600237%7C_p_origin_prod%3A', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (91, '514500000', 'Guía de montaje, Accesorios, Acero, chapado en zinc galvanizado y pasivado, 1 mtro , Altura: 35 mm, Profundidad: 7.5 mm', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'MERCADO LIBRE', 150.0, NULL, 'https://www.mercadolibre.com.mx/riel-din-1-metro-weidmuller/up/MLMU585828664?pdp_filters=item_id%3AMLM2784780012#origin%3Dshare%26sid%3Dshare%26wid%3DMLM2784780012', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (92, 'S202C1', 'INTERRUPTOR TERMOMAGNETICO RIEL DIN S202-C1 480VCA 6KA, 1A, 2 Polos', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'BADESA', 305.9, NULL, 'Cotizacion Badesa LE 78119', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (93, 'S203-K16', 'INTERRUPTOR TERMOMAGNETICO RIEL DIN Número de polos 3, Corriente nominal In 16 A, Tensión nominal de aislamiento máxima Ue 440V, Curva de disparo D', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'MERCADO LIBRE', 999.0, NULL, 'https://www.mercadolibre.com.mx/interruptor-automatico-s203-k16-3p-k-16a-2cds253001r0467/p/MLM2055010463?pdp_filters=item_id%3AMLM1556080102#origin%3Dshare%26sid%3Dshare%26wid%3DMLM1556080102', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (94, 'SDE-100A2', 'Controlador de servomotor Shihlin SDE-100A2 de 1 kW - Potencia: 1kW - Tensión de alimentación: 1P/3P 200-140VAC, 50/60Hz - Voltaje de salida: 0-240 V CA, 0-250 Hz', NULL, 'SERVODRIVES', 'ACTUALIZADO', 'ALIEXPRESS', 9500.0, NULL, 'https://es.aliexpress.com/item/1005010367672947.html?spm=a2g0o.productlist.main.2.208aRlMFRlMFMj&algo_pvid=ae0f116b-26d9-4839-a00b-f5aeeeeab783&algo_exp_id=ae0f116b-26d9-4839-a00b-f5aeeeeab783-1&pdp_ext_f=%7B%22order%22%3A%22-1%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&pdp_npi=6%40dis%21MXN%219407.26%218936.90%21%21%213720.05%213534.05%21%4021032f3717696234677471683ed18f%2112000052156159667%21sea%21MX%210%21ABX%211%210%21n_tag%3A-29910%3Bd%3A486af066%3Bm03_new_user%3A-29895&curPageLogUid=CU9yzchQVJ5x&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005010367672947%7C_p_origin_prod%3A', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (95, 'S/N', 'Suministro de transformador monofasico tipo poste 25 KVA, 13200 V, 240/120 V norma K', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'BARRANGEL INSTALACIONES Y EQUIPO ELECTRICO', 52500.0, NULL, 'PRESUPUESTO N° TEM0326', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (96, 'US4X2', 'PERFIL UNICANAL SOLIDO 4X2 3MTS CAL 16.', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 219.81, NULL, 'COMPRA FOLIO XLA84846 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (97, 'TPD13', 'TUBO PARED DELGADA 13MM (1/2), 3 MTS', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 63.96, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (98, 'CPD13', 'CODO PARED DELGADA 13MM (1/2 )', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 16.17, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (99, 'COPLE13TADO', 'COPLE PARA TUBO PARED DELGADA DE 13MM (1/2) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 5.94, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (100, 'CONECTOR13TADO', 'CONECTOR PARA TUBO PARED DELGADA DE 13MM (1/2) TIPO AMERICANO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 6.72, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (101, 'WDL0808P', 'CAJA ESTANCAS IP 55 80X80X45 CON LADOS DOBLADOS Y TAPA A PRESION', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 25.37, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (102, 'UNIST13', 'Abrazadera Unicanal p/Conduit EMT 13 mm (1/2″', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 6.24, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (103, 'COPLE13PG', 'COPLE PARED GRUESA DE 13MM(1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 5.88, NULL, 'COMPRA FOLIO XLA84845 28012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (104, '10-008-1/4X2-1/4', 'TAQUETE ARPON GALVANIZADO  1/4 X2 -1/4', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'EL TORNILLO', 4.38, NULL, 'COMPRA FOLIO 0029675 30012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (105, '10-008-3/8X3', 'TAQUETE ARPON GALVANIZADO 3/8X3', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'EL TORNILLO', 9.12, NULL, 'COMPRA FOLIO 0029675 30012026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (106, NULL, 'PLACA BASE 45X45', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', 1029.1, NULL, 'SEVICIO 23153100', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (107, 'DMI-R6-2020L', 'Perfil 20X20  R6', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (108, 'DMI-R8-3030L', 'PERFIL 30X30 R8', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (109, 'DMI-R10-4040L', 'PERFIL 40X40 R10', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (110, 'DMI-R10-4545L', 'PERFIL 45X45 R10', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (111, 'DMI-3024-45', 'ESCUADRA PERFIL 4545', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'DMI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (112, 'H07Z1-K', 'CABLE AMARILLO/VERDE CALIBRE 14AWG (2,5MM2) H07Z-K (a partir de 1,5 mm: 450/750 V.', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'IKA TECHNOLOGY', 17.15, NULL, 'COTIZACIÓN IKA TECHNOLOGY COTIZACIÓN No. : M0000000322', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (113, '7000-50021-9615000', 'Cable de alimentación 7/8" para módulos ET200 Pro - 50 metros Marca Murr', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'KOPAR', 34680.49, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (114, '7000-44711-6593500', 'Cable de comunicación profinet M12/RJ45 - 35 metros', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'KOPAR', 12405.31, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (115, '7000-40021-6343000', 'Cable para sensor M12-M12 Macho/Hemba 30 metros', NULL, 'SENSORES', 'ACTUALIZADO', 'KOPAR', 3668.16, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (116, '7000-40021-6343500', 'Cable para sensor M12-M12 Macho/Hemba 35 metros', NULL, 'SENSORES', 'ACTUALIZADO', 'KOPAR', 4182.7, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (117, '7000-40021-6345000', 'Cable para sensor M12-M12 Macho/Hemba 50 metros', NULL, 'SENSORES', 'ACTUALIZADO', 'KOPAR', 5984.6, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (118, '7000-40021-6342000', 'Cable para sensor M12-M12 Macho/Hemba 20 metros', NULL, 'SENSORES', 'ACTUALIZADO', 'KOPAR', 2401.39, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (119, '7000-40021-6344000', 'Cable para sensor M12-M12 Macho/Hemba 40 metros', NULL, 'SENSORES', 'ACTUALIZADO', 'KOPAR', 4696.2, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (120, '7000-44711-6594000', 'Cable de comunicación profinet M12/RJ45 - 40 metros', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'KOPAR', 14007.26, NULL, 'COTIZACIÓN KOPAR COTIZACIÓN: PV091814', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (121, 'CTHW3/0C', 'CABLE CON AISLAMIENTO TIPO THW CAL.3/0 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 282.07, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (122, 'CTHW2N', 'CABLE CON AISLAMIENTO TIPO THW CAL.2 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 113.11, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (123, 'CTHW8N', 'CABLE CON AISLAMIENTO TIPO THW CAL.8 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 29.14, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (124, 'CTHW10N', 'CABLE CON AISLAMIENTO TIPO THW CAL.10 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 18.16, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (125, 'CTHW12N', 'CABLE CON AISLAMIENTO TIPO THW CAL.12 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 11.48, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (126, 'CTHW14N', 'CABLE CON AISLAMIENTO TIPO THW CAL.14 AWG 90° 600V COLOR NEGRO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'Euroelectrica', 8.17, NULL, 'Cotizacion Euroelectrica 13/02/2026 L315116', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (127, '777024507', 'CABLE M-H 7/8", 5 PIN, AMARILLO, 50m MOD. RSM RKM 56-50M/S3059. MARCA: TURCK', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'ABETEC', 13740.0, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (128, '777006937', 'CABLE ETH M12 (D-CODE) A RJ45, 30m, BLINDADO, AZUL/VERDE, 30m  MOD. RSSD RJ45S 441-30M MARCA: TURCK', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'ABETEC', 3792.24, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (129, '777002622', 'CABLE H-M, M12, 4 PIN, AMARILLO, 30m MOD. RKC 4.4T-30-RSC 4.4T/S1587  MARCA: TURCK', NULL, 'SENSORES', 'ACTUALIZADO', 'ABETEC', 4069.62, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (130, '777008487', 'CABLE H-M, M12, 4 PIN, AMARILLO, 35m MOD. RK 4.4T-35-RS 4.4T/S1587  MARCA: TURCK', NULL, 'SENSORES', 'ACTUALIZADO', 'ABETEC', 4204.26, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (131, '777008487', 'CABLE H-M, M12, 4 PIN, AMARILLO, 50m  MOD. RK 4.4T-50-RS 4.4T/S1587  MARCA: TURCK', NULL, 'SENSORES', 'ACTUALIZADO', 'ABETEC', 5725.62, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (132, '777008487', 'CABLE H-M, M12, 4 PIN, AMARILLO, 20m  MOD. RK 4.4T-20-RS 4.4T/S1587 MARCA: TURCK', NULL, 'SENSORES', 'ACTUALIZADO', 'ABETEC', 2682.72, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (133, '777008487', 'CABLE H-M, M12, 4 PIN, AMARILLO, 40m  MOD. RK 4.4T-40-RS 4.4T/S1587  MARCA: TURCK', NULL, 'SENSORES', 'ACTUALIZADO', 'ABETEC', 4711.32, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (134, '777035863', 'CABLE ETH M12 (D-CODE) A RJ45, 30m, NO BLINDADO, GRIS, 45m  RSCD RJ45 440G-45M  MARCA: TURCK', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'ABETEC', 4431.44, NULL, 'Cotizacion ABETEC 01-SSEPI-2026', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (135, 'EPL5K2FVR', 'Regulador Epcom Epl5k2fvr 5 Kva / 5000 W, Entrada 120 V, Negro, Ancho: 243 mm, Profundidad:180 mm, Altura: 342 mm', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'ZEGUCOM', 6783.66, NULL, 'https://www.zegucom.com.mx/producto/reguladores-nobreaks-y-energia/reguladores/regulador-epcom-epl5k2fvr-5-kva-5000-w-entrada-120-v-negro/RVBMNUsyRlZS', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (136, '00-1588-3', 'Regulador Koblenz Er-2250 2.25 Kva / 1000w, Energia 134 J, Entrada 145 V, Salida 132v, 60hz, 8 Salidas Ac, Compacto, Indicadores Led, Color Negro', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'ZEGUCOM', 614.97, NULL, 'https://www.zegucom.com.mx/producto/reguladores-nobreaks-y-energia/reguladores/regulador-koblenz-er-2250-2-25-kva-1000w-energia-134-j-entrada-145-v/MDAtMTU4OC0z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (137, '12860555', 'Motor Weg Trifásico 15 Hp 1750 Rpm, Carcasa 254/6T, Tensión nominal 208-230/460 V, Corriente nominal 39.8-36.0/18.0 A', NULL, 'MOTORES', 'ACTUALIZADO', 'HAB', 17897.64, NULL, 'Cotización:16082 COMERCIALIZADORAYDISTRIBUIDORAELECTRICAHAB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (138, 'LSLV0110S100-2EONNS', 'VARIADOR DE FRECUENCIA S100 15HP DE POTENCIA, ALIMENTACIÓN Y SALIDA 230V, 3 FASES', NULL, 'VARIADOR', 'ACTUALIZADO', 'DOMUM', 26280.0, NULL, '25/02/2026 Número de cotización S02894', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (139, 'LSLV0110G100-2EONN', 'VARIADOR FAMILIA G100, 15HP DE POTENCIA, ALIMENTACIÓN Y SALIDA 230V, 3 FASES', NULL, 'VARIADOR', 'ACTUALIZADO', 'DOMUM', 24888.0, NULL, '25/02/2026 Número de cotización S02894', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (140, 'VFD500-011GT2B', 'Variador de Frecuencia Trifásico 15 hp VFD500-011GT2B, 200  240 VAC, 45 AMP', NULL, 'VARIADOR', 'ACTUALIZADO', 'VEIKONG', 21738.68, NULL, '25/02/2026 Número de cotización #D11704', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (141, 'NH00-80A', 'Juego de 3 Fusibles tipo cuchilla, Tamaño NH00 , Acción Rapida (AR), 690VAC, 80 Amp, 100kA, para variador modelo:VFD500 011GT2B; 022G/030PT4B', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'VEIKONG', 735.09, NULL, '25/02/2026 Número de cotización #D11704', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (142, '65fcc48c8fdc4', 'Seccionador Portafusible 3 Polos , tipo: NH00, Modelo:DNH7 160/300, 400/690 Vac, 60Hz.', NULL, 'PROTECCION ELECTRICA', 'ACTUALIZADO', 'VEIKONG', 756.49, NULL, '25/02/2026 Número de cotización #D11704', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (143, 'E820-0470EPA-60', 'Variador de Frecuencia Mitsubishi Electric (serie FREQROL FR-E800) - entrada 200Vac-240Vac (trifásico/3P) - 11kW/15HP - 47A (ND Normal Duty) - frecuencia (salida) 0,2-590Hz - con Ethernet + Ethernet/IP + CC-Link + Modbus TCP + BACnet/Capacidad de comunicación IP - IP20 - valores nominales de tensión de entrada 220Vac / 230Vac - Resistencia química (recubrimiento de placa de circuito - IEC60721-3-3 3S2 3C2) - equivalente a FR-E820-0470EPA-60 / FRE8200470EPA60', NULL, 'VARIADOR', 'ACTUALIZADO', 'IkA TECHNOLOGY', 25785.28, NULL, '25/02/2026 Número de cotización M0000000323', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (144, 'E820-0470-5-60', 'Variador de frecuencia Mitsubishi Electric (serie FREQROL FR-E800) - entrada 200Vac-240Vac (trifásico/3P) - 11kW / 15HP - 47A (ND Normal Duty) - frecuencia (salida) 0,2-590Hz - con capacidad de comunicación RS-485 - IP20 - valores nominales de voltaje de entrada 220Vac / 230Vac - Resistencia química (recubrimiento de placa de circuito - IEC60721-3-3 3S2 3C2) - equivalente a FR-E820-0470-5-60 / FRE8200470560', NULL, 'VARIADOR', 'ACTUALIZADO', 'IKA TECHNOLOGY', 22133.51, NULL, '25/02/2026 Número de cotización M0000000323', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (145, 'ACS355-03E46A2-2', 'Variador de frecuencia compacto y versátil de 11 kW (15 HP), diseñado para motores de inducción y de imanes permanentes en aplicaciones industriales exigentes. Opera con entrada trifásica 200-240V, ofrece una corriente de salida de 46.2A, incluye frenado integrado y destaca por su fácil configuración y control vectorial preciso', NULL, 'VARIADOR', 'ACTUALIZADO', 'BADESA', 20885.94, NULL, '25/02/2026 Número de cotización   79134', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (146, 'PNOZ s5 24VDC 2 n/o 2 n/o t, 750105', 'Dispositivo de seguridad PNOZsigma (standalone), entradas: conexionado monocanal/bicanal con/sin detección de derivación, rearme manual/automático, salidas: 2 NA, 2 Sz (t = 0,04 - 300 s), 1 SEMIC., UB= 24 V DC, ancho: 22,5 mm, bornes de tornillo enchufables, supervisión de parada deemergencia, puertas protectoras, barreras fotoeléctricas de seguridad.', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'ACOME', 12300.0, NULL, 'https://www.acomee.com.mx/articulo.php?search=PNOZ-S5-24VDC&id=PILZ', 'GRUPOMI', 10423.8, '1-3 DIAS', '23/03/2026 Número de cotización GMI-1052983', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (147, 'PNOZ e3.1p 24VDC 2so', 'Dispositivo de seguridad (standalone), entradas: conexionado bicanal con/sin detección de derivación (PSEN 2.1p/2.2p), salidas: 2 salidas de seguridad, 1 salida auxiliar por semiconductor, rearme automático/supervisado, UB = 24 V DC, ancho: 22,5 mm, bornes de tornillo enchufables, vinculación de varios dispositivos, puertas protectoras, circuito de realimentación.', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'ACOME', 6315.46, NULL, 'https://www.acomee.com.mx/articulo.php?search=PNOZ-E3.1P&id=PILZ&pro=', 'GRUPOMI', 6342.3, '1-3 DIAS', '23/03/2026 Número de cotización GMI-1052983', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (148, 'EWZ0046', 'Connectors Type EWZ0046 Number of poles 9 Connection type Insul. displacemnt connection Rated current 5 A OEM number QEV111AC6MVR', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'SUCOMO', 3238.9, NULL, '06/03/2026 Número de cotización B 263', 'ebay', 2524.31, '2-3 SEMAAS', 'https://www.ebay.com/itm/176974572550', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (149, 'LS14250', 'Batería Saft 14250 Ls14250 3.6v 1200mah 1/2 Aa Uso Especial', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 165.0, NULL, 'https://www.mercadolibre.com.mx/bateria-saft-14250-ls14250-36v-1200mah-12-aa-uso-especial/up/MLMU3518773335?matt_tool=28238160&utm_source=google_shopping&utm_medium=organic&pdp_filters=item_id%3AMLM4287942156&from=gshop', 'MERCADO LIBRE', 249.0, NULL, 'https://www.mercadolibre.com.mx/bateria-saft-12aa-litio-cilindrica-36v-1200mah-ls14250/p/MLM22858831#polycard_client=search-desktop&search_layout=grid&position=4&type=product&tracking_id=d0b5fb56-0013-41f9-bddd-ca86df6dc450&wid=MLM2682524409&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (150, '6GK15622AA00', 'PROCESADOR DE COMUNIC. CP 5622 TARJ. PCI', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'AK CORPORATION', 20401.82, NULL, '06/03/2026 Número de cotización V19104', 'AMAZON', 10694.04, NULL, 'https://www.amazon.com.mx/BXNXLX-Nuevo-6GK1562-2AA00-6GK15622AA00-Expedited/dp/B0D1N8TH19', 'ALI EXPRESS', '11104.9', NULL, 'https://es.aliexpress.com/item/1005009132832615.html?spm=a2g0o.productlist.main.7.17b6JJ1OJJ1Oa9&algo_pvid=d98d0208-56fc-43e5-beed-0ce632eb1a97&algo_exp_id=d98d0208-56fc-43e5-beed-0ce632eb1a97-6&pdp_ext_f=%7B%22order%22%3A%22-1%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&pdp_npi=6%40dis%21MXN%2110694.90%2110694.90%21%21%21594.03%21594.03%21%402103128917731788052087436ed061%2112000048031040451%21sea%21MX%217056288988%21X%211%210%21n_tag%3A-29911%3Bd%3A8d82e2f1%3Bm03_new_user%3A-29895&curPageLogUid=8r7SQpwEPIZb&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005009132832615%7C_p_origin_prod%3A', NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (151, 'Q35B', 'Q SERIES, BASE UNIT, 5 SLOT MITSUBISHI', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 4326.3, NULL, '03/03/2026 Número de cotización #COTL11992', 'IkA TECHNOLOGY', 4740.12, NULL, '04/03/2026 Número de cotización M0000000331', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (152, 'Q61P', 'POWER SUPPLY, 100V-240VAC, 5VDC, 6A', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 5288.94, NULL, '03/03/2026 Número de cotización #COTL11992', 'IkA TECHNOLOGY', 5796.0, NULL, '04/03/2026 Número de cotización M0000000330', 'ULTATEK', '5355.72', NULL, '11/03/2026 Número de cotización AGS017-LMC110326', 'MELCSA', 5771.7, NULL, '12/03/2026 Número de cotización QR.1660.NR.47.0326N', NULL, NULL),
  (153, 'Q04UDVCPU', 'VUP CPU+ENET,IQ,40K STEP,4096 I/O', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 47858.4, NULL, '03/03/2026 Número de cotización #COTL11992', 'IkA TECHNOLOGY', 52436.16, NULL, '04/03/2026 Número de cotización M0000000331', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (154, 'QX10', 'INPUT MODULE, 16 POINT, AC IN', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 4181.4, NULL, '03/03/2026 Número de cotización #COTL11992', 'IkA TECHNOLOGY', 4581.36, NULL, '04/03/2026 Número de cotización M0000000331', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (155, 'QY10', 'OUTPUT MODULE, 16 POINT, RELAY OUT', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 5195.7, NULL, '03/03/2026 Número de cotización #COTL11992', 'IkA TECHNOLOGY', 5692.68, NULL, '04/03/2026 Número de cotización M0000000331', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (156, 'Q33B', 'Q SERIES, BASE UNIT, 3 SLOT', NULL, 'PLC''S', 'ACTUALIZADO', 'IkA TECHNOLOGY', 4435.2, NULL, '04/03/2026 Número de cotización M0000000330', 'ULTATEK', 4098.06, NULL, '04/03/2026 Número de cotización M0000000331', 'MELCSA', '4417.02', NULL, '12/03/2026 Número de cotización QR.1660.NR.47.0326N', NULL, NULL, NULL, NULL, NULL, NULL),
  (157, 'QY40P', 'OUTPUT MODULE 16 POINT SINK', NULL, 'PLC''S', 'ACTUALIZADO', 'IkA TECHNOLOGY', 4356.0, NULL, '04/03/2026 Número de cotización M0000000330', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (158, 'Q04UDEHCPU', 'CPU, IQ, 40ksteps, 4096 I/O', NULL, 'PLC''S', 'ACTUALIZADO', 'IkA TECHNOLOGY', 46098.0, NULL, '04/03/2026 Número de cotización M0000000330', 'ULTATEK', 42605.28, NULL, '11/03/2026 Número de cotización AGS017-LMC110326', 'MELCSA', '45849.24', NULL, '12/03/2026 Número de cotización QR.1660.NR.47.0326N', NULL, NULL, NULL, NULL, NULL, NULL),
  (159, 'QX40', 'INPUT MODULE, 16 POINT, SINK DC IN', NULL, 'PLC''S', 'ACTUALIZADO', 'IkA TECHNOLOGY', 4241.16, NULL, '04/03/2026 Número de cotización M0000000330', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (160, 'QX80', 'INPUT MODULE, 16 POINT SOURCE DC IN QX80', NULL, 'PLC''S', 'ACTUALIZADO', 'ACOME', 7622.24, NULL, 'https://www.acomee.com.mx/articulo.php?search=QX80&id=MITSUBISHI-ELECTRIC&pro=QX80', 'ULTATEK', 4863.24, NULL, '11/03/2026 Número de cotización AGS017-LMC110326', 'MELCSA', '5237.46', NULL, '12/03/2026 Número de cotización QR.1660.NR.47.0326N', NULL, NULL, NULL, NULL, NULL, NULL),
  (161, 'QY80', 'OUTPUT MODULE, 16 POINT TRANSISTOR 12-24VDC QY80', NULL, 'PLC''S', 'ACTUALIZADO', 'ACOME', 10131.58, NULL, 'https://www.acomee.com.mx/articulo.php?search=QY80&id=MITSUBISHI-ELECTRIC', 'ULTATEK', 5261.4, NULL, '11/03/2026 Número de cotización AGS017-LMC110326', 'MELCSA', '5666.76', NULL, '12/03/2026 Número de cotización QR.1660.NR.47.0326N', NULL, NULL, NULL, NULL, NULL, NULL),
  (162, 'FX5U-32MR/ES', 'AC BASE UNIT, 16 DC IN / 16 RELAY OUTPUT', NULL, 'PLC''S', 'ACTUALIZADO', 'IkA TECHNOLOGY', 11351.34, NULL, '04/03/2026 Número de cotización M0000000330', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (163, 'TPG13', 'TUBO PARED GRUESA DE 13MM (1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 119.73, NULL, 'https://euroelectrica.com.mx/producto/tubo-pared-gruesa-de-13mm-1-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (164, 'COPLE13PG', 'COPLE PARED GRUESA DE 13MM(1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 6.52, NULL, 'https://euroelectrica.com.mx/producto/cople-pared-gruesa-de-13mm1-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (165, 'CPG13', 'CODO PARED GRUESA 13MM (1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 26.88, NULL, 'https://euroelectrica.com.mx/producto/codo-pared-gruesa-13mm-1-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (166, 'MT13', 'Monitor Metalico de 13 mm ( 1 / 2 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 2.32, NULL, 'https://euroelectrica.com.mx/producto/monitor-metalico-de-13-mm-1-2-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (167, 'CT13', 'Contratuerca Metalica Zamac de 13 mm ( 1 / 2 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 1.21, NULL, 'https://euroelectrica.com.mx/producto/contratuerca-metalica-zamac-de-13-mm-1-2-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (168, 'TPG19', 'TUBO PARED GRUESA DE 19MM (3/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 151.5, NULL, 'https://euroelectrica.com.mx/producto/tubo-pared-gruesa-de-19mm-3-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (169, 'COPLE19PG', 'COPLE PARED GRUESA DE 19MM(3/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 8.96, NULL, 'https://euroelectrica.com.mx/producto/cople-pared-gruesa-de-19mm3-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (170, 'CPG19', 'CODO PARED GRUESA DE 19MM (3/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 35.84, NULL, 'https://euroelectrica.com.mx/producto/codo-pared-gruesa-de-19mm-3-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (171, 'MT19', 'Monitor Metalico de 19 mm ( 3 / 4 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 3.79, NULL, 'https://euroelectrica.com.mx/producto/monitor-metalico-de-19-mm-3-4-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (172, 'CT19', 'Contratuerca Metalica Zamac de 19 mm ( 3 / 4 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 1.8, NULL, 'https://euroelectrica.com.mx/producto/contratuerca-metalica-zamac-de-19-mm-3-4-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (173, '6ES7 223-1BH32-0XB0', 'Digital input/output module DI8 x 24VDC SINK/SOURCE and DQ8 x 24VDC; configurable input delay; plug-in terminal blocks', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 5009.66, NULL, 'https://dimeint.com/products/6es7223-1bh32-0xb0?srsltid=AfmBOoou-MpkWdw4C_Tagfrpecnjfeg6YlfGAsNpkIyPz-sIpsDUy473', 'AK CORPORACION', 4157.85, '7 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (174, '6ES7 223-1BL32-0XB0', 'Digital input/output module DI16 x 24VDC SINK/SOURCE and DQ16 x 24VDC; configurable input delay; plug-in terminal blocks', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 7912.0, NULL, 'https://dimeint.com/products/6es7223-1bl32-0xb0?srsltid=AfmBOorhFBUfQ53Fg7SQooDgok7uOLaphfX2oDg2poM14RlEJ857VG1M', 'AK CORPORACION', 6566.7, 'INMEDIATA SPV', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (175, '6ES7 222-1BH32-0XB0', 'Digital output module DQ16 x 24VDC; SINK Output; plug-in terminal blocks', NULL, 'PLC''S', 'Actualizado', 'DIMEINT', 5009.66, NULL, 'https://dimeint.com/pages/productos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (176, '6EP1961-2BA41', 'Sitop Módulo de protección selectiva', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'DIMEINT', 4288.7, NULL, 'https://dimeint.com/products/6ep1961-2ba41?srsltid=AfmBOopJ_SKYW0kZixkPkx0ln4RnquKvUXI2W4bENL9gaitQuDDKCvA7', 'AK CORPORACION', 3559.48, '8 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (177, '6AV2 123-2GB03-0AX0', '7'''' TFT display, 800 x 480 pixel, 64K colors; Key and Touch operation, 8 function keys; 1 x PROFINET, 1 x USB', NULL, 'HMI´S', 'ACTUALIZADO', 'Aliexprex', 4984.9, NULL, 'https://www.aliexpress.com/p/tesla-landing/index.html?scenario=c_ppc_item_bridge&productId=1005007426779920&_immersiveMode=true&withMainCard=true&src=google&aff_platform=true&isdl=yhttps://www.aliexpress.com/p/tesla-landing/index.html?scenario=c_ppc_item_bridge&productId=1005007426779920&_immersiveMode=true&withMainCard=true&src=google&aff_platform=true&isdl=y&src=google&albch=shopping&acnt=742-864-1166&isdl=y&slnk=&plac=&mtctp=&albbt=Google_7_shopping&aff_platform=google&aff_short_key=UneMJZVf&gclsrc=aw.ds&&albagn=888888&&ds_e_adid=&ds_e_matchtype=&ds_e_device=c&ds_e_network=x&ds_e_product_group_id=&ds_e_product_id=es1005007426779920&ds_e_product_merchant_id=5537006099&ds_e_product_country=MX&ds_e_product_language=es&ds_e_product_channel=online&ds_e_product_store_id=&ds_url_v=2&albcp=21989024792&albag=&isSmbAutoCall=false&needSmbHouyi=false&gad_source=1&gad_campaignid=21992960584&gbraid=0AAAAA99aYpcayR_Vj5XkR4A6ZAgT4VZk2&gclid=Cj0KCQjwgr_NBhDFARIsAHiUWr6Y89_LNzq8yN9lJya_jZz5BzneSlRFx22Xu17d6j8HBixdFyko_0MaAr9tEALw_wcB', 'Dimeint', 8222.11, NULL, 'https://mx.wiautomation.com/siemens/hmi-pc-industriales/simatic-hmi/6AV21232GB030AX0?utm_source=google&utm_medium=cpc&utm_campaign=MX_pmax_full&gad_source=4&gad_campaignid=17347445687&gbraid=0AAAAAC2XDKD5-_F9VzM2DHpHuoECgBSYk&gclid=Cj0KCQjwgr_NBhDFARIsAHiUWr5WabH1vBNh23v083BShq2BBMeobnHJhFytiKBGTrIkHlN5td9eOO4aAhBCEALw_wcB', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (178, '6AV2 123-2JB03-0AX0', 'SIMATIC HMI, KTP900 Basic, Basic Panel, Manejo con teclado/táctil, pantalla TFT de 9", 65536 colores, Interfaz PROFINET', NULL, 'HMI´S', 'ACTUALIZADO', 'Ebay', 11432.37, NULL, 'https://www.ebay.com/itm/317496384384?chn=ps&_trkparms=ispr%3D1&amdata=enc%3A1rPw0a3cKTNm0emgLDUgHwA1&norover=1&mkevt=1&mkrid=21562-222008-2056-1&mkcid=2&itemid=317496384384&targetid=325425753764&device=c&mktype=pla&googleloc=1010058&poi=&campaignid=21384589900&mkgroupid=164552185618&rlsatarget=pla-325425753764&abcId=&merchantid=5378086785&gad_source=1&gad_campaignid=21384589900&gbraid=0AAAAAD_QDh_iAcJGlJlpfYLD-I3qsrXC-&gclid=Cj0KCQjwgr_NBhDFARIsAHiUWr6Q6jUNlRyX12KeHUXt5PedzIDWrqKIbJruc9B3bDVSWluBURKEyxsaAnwAEALw_wcB', 'ALI EXPRESS', 14811.81, NULL, 'https://es.aliexpress.com/item/1005003243999743.html?spm=a2g0o.productlist.main.3.2349pI4JpI4JRU&algo_pvid=fb05d7d2-7a32-4e68-9064-7dc24097072e&algo_exp_id=fb05d7d2-7a32-4e68-9064-7dc24097072e-2&pdp_ext_f=%7B%22order%22%3A%22-1%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&pdp_npi=6%40dis%21MXN%2118491.50%2111094.90%21%21%211027.08%21616.25%21%402101c44f17731701940794345e3771%2112000024827204731%21sea%21MX%212570504509%21ACX%211%210%21n_tag%3A-29919%3Bd%3A486af066%3Bm03_new_user%3A-29894&curPageLogUid=15b5AiRDd0YH&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005003243999743%7C_p_origin_prod%3A', 'WIAUTOMATION', '17,072.29', NULL, 'https://mx.wiautomation.com/siemens/hmi-pc-industriales/simatic-hmi/6AV21232JB030AX0?utm_source=google&utm_medium=cpc&utm_campaign=MX_pmax_full&gad_source=1&gad_campaignid=17347445687&gbraid=0AAAAAC2XDKC6yZJ9rVZ_uskNYZ6iICVMT', NULL, NULL, NULL, NULL, NULL, NULL),
  (179, '6ES7 231-4HF32-0XB0', 'Analog input module AI8 x 13 bits; plug-in terminal blocks; input: 2.5V, 5V, 10V and 0/4 to 20mA; configurable frequency suppression; configurable smoothing; configurable diagnostics', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 10506.56, NULL, 'https://dimeint.com/products/6es7231-4hf32-0xb0?srsltid=AfmBOoorgFcC34hMokukwMAUaPbAToq_C4lSloL5Wt2zFPHWwGPYONoZ', 'AK CORPORACION', 8720.09, 'INMEDIATA SPV', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (180, '6ES7 232-4HD32-0XB0', 'Analog output module AQ4 x 14 bits; plug-in terminal blocks; output: +/-10V and 0 to 20 mA; configurable diagnostics; configurable substitute value for output', NULL, 'PLC''S', 'ACTUALIZADO', 'DIMEINT', 10917.16, NULL, 'https://dimeint.com/products/6es7232-4hd32-0xb0?srsltid=AfmBOoqkbqeh3A3VR_VK3JYDJVhZfEnO353ruLBYb6NjefMPd0qiAV3w', 'AK CORPORACION', 9060.88, 'INMEDIATA SPV', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (181, 'CV18A', 'CABLE TFLS VINANEL-XXI CAL. 16 AWG. 600V. 90°C COLOR AZUL. MCA. CONDUMEX', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 6.61, NULL, 'https://euroelectrica.com.mx/producto/cable-tfls-vinanel-xxi-cal-16-awg-600v-90c-color-azul-mca-condumex/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (182, '6GK1561-1AA01', 'PROCESADOR DE COMUNICACIONES CP 5611 TARJETA PCI EXPRESS X1 PARA CONECTAR UNA PG O PC CON PCI EXPRESS-BUS A PROFIBUS O SE PUEDE UTILIZAR MPI', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'Amazon', 5930.0, NULL, 'https://www.amazon.com.mx/eiuie-6GK1561-1AA00-Communications-Processor-561-1AA00/dp/B0BQMXQH1B', 'ALI EXPRESS', 1849.26, NULL, 'https://es.aliexpress.com/item/4001265441063.html?spm=a2g0o.tesla.0.0.60ebAUvhAUvhCz&pdp_npi=6%40dis%21MXN%21MX%241%2C849.26%21MX%241%2C497.90%21%21%21%21%21%40210328df17731795585733105ee47b%2112000021050547848%21btfpre%21%21%21%211%210%21&afTraceInfo=4001265441063__pc__c_ppc_item_bridge_pc_main__O5KSqHd__1773179558638&gatewayAdapt=glo2esp', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (183, 'PRO BAS 120W 24V 5A', 'Fuente de alimentación conmutada de riel DIN: 5 A, 120 W, 24 V CC', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 3016.6, NULL, 'https://www.mercadolibre.com.mx/fuente-de-alimentacion-conmutada-de-riel-din-5-a-120-w-24-v-cc/p/MLM32055504#polycard_client=search-desktop&search_layout=grid&position=8&type=product&tracking_id=17147bbf-2c64-4f05-b29a-f3705076b9cd&wid=MLM2515905707&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (184, 'PRO INSTA 60W 24V 2.5A', 'Fuente De Alimentación Pro Insta 60w 24v 2.5a Mca Weidmuller', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'MERCADO LIBRE', 1550.0, NULL, 'https://www.mercadolibre.com.mx/fuente-de-alimentacion-pro-insta-60w-24v-25a-mca-weidmuller/up/MLMU721675287', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (185, '6ES57108MA11', 'SIMATIC, perfil DIN 35mm, Longitud 483 mm para armarios de 19"', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORATION', 782.28, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (186, '6ES7 222-1BH32-1XB0', 'SIMATIC S7-1200, módulo de salidas digitales SM 1222, 16 DO, 24 V DC, de tipo M (salida en sumidero), transistor NPN 0,5 A', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 4157.85, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (187, '6ES7 214-1AH50-0XB0', 'SIMATIC S7-1200 G2: CPU compacta 1214C DC/DC/DC; fuente de alimentación: DC 20,4-28,8V DC; E/S integradas: 14 DI 24 V DC; 10 DO 24 V DC; memoria: programas  250 kB datos: 750 kB, remanencia: 20 kB', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 8500.67, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (188, '6ES7 214-1AH50-0XB0', 'SIMATIC S7-1200 G2, E/S digitales SM 1223, 16 DI / 16 DO, entradas: 16 DI 24 V DC, fuente/sumidero, salidas 16 DO, sumidero (sinking output), transistor NPN 0,5 A', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 6285.27, '5 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (189, '6ES7 222-5BH50-0XB0', 'SIMATIC S7-1200 G2: módulo de salidas digitales SM 1222, 16 DO, salidas: 16 DO, 24 V DC 0,5 A, transistor en fuente', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 3855.22, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (190, '6ES7 231-4HF50-0XB0', 'SIMATIC S7-1200 G2: módulo de entradas analógicas SM 1231, 8 AI, entradas: 8 AI 14 bits ADC (+/-10 V, +/-5 V, +/-2,5 V o 0-20 mA/4-20 mA)', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 8085.68, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (191, '6ES7 232-4HF50-0XB0', 'SIMATIC S7-1200 G2: módulo de salidas analógicas SM 1232, 8 AO, salidas: 8 AQ 14 bits DAC (+/-10 V, 0-20 mA o 4-20 mA)', NULL, 'PLC''S', 'ACTUALIZADO', 'AK CORPORACION', 8896.05, '3 SEMANAS', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (192, '6AV2123-3GB32-0AW0', 'SIMATIC HMI MTP700, Unified Basic Panel, mando táctil, pantalla TFT panorámica de 7", 16 millones de colores, interfaz PROFINET, configurable a partir de WinCC  Unified Basic V18 Upd. 3, incluye software Open Source que se cede gratuitamente, ver Blu-Ray adjunto', NULL, 'HMI´S', 'ACTUALIZADO', 'AK CORPORACION', 14738.77, 'INMEDIATO SPV', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (193, '6AV2123-3KB32-0AW0', 'SIMATIC HMI MTP1000, Unified Basic Panel, mando táctil, pantalla TFT panorámica de 10", 16 millones de colores, interfaz PROFINET, configurable a partir de WinCC  Unified Basic V18 Upd. 3, incluye software Open Source que se cede gratuitamente, ver Blu-Ray adjunto', NULL, 'HMI´S', 'ACTUALIZADO', 'AK CORPORACION', 25868.24, 'INMEDIATO SPV', '12/03/2026 Número de cotización', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (194, 'CAT5E-AZ-100 VTA', 'Cable UTP CAT5e azul Conductores de cobre Ripcord: Retira fácil el forro Transmite 100 Mbps Ancho de banda: 100 MHz 4 pares trenzados Ø exterior: 5,3 mm AWG: 8/24', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'STEREN', 15.0, 'INMEDIATO', 'https://www.steren.com.mx/cable-utp-categoria-5e-para-redes-en-presentacion-de-color-azul-vta.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (195, '301-178', 'Plug RJ45 de 8 contactos CAT 5e, para cable redondo', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'STEREN', 2.0, 'INMEDIATO', 'https://www.steren.com.mx/plug-rj45-de-8-contactos-cat-5e-para-cable-redondo.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (196, 'OMEGA13DO', 'ABRAZADERA OMEGA PARA TUBO CONDUIT DE 13MM (1/2) MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 2.04, 'INMEDIATO', 'https://euroelectrica.com.mx/producto/abrazadera-omega-para-tubo-conduit-de-13mm-1-2-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (197, 'CAT6-AZ-305 VTA', 'Cable UTP CAT 6 Conductores de cobre Ripcord: Retira fácil el forro Transmite 1 Gbps Ancho de banda: 250 MHz 4 pares trenzados Ø exterior: 6,4 mm AWG: 8/24', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'STEREN', 18.0, 'INMEDIATO', 'https://www.steren.com.mx/cable-utp-cat6-azul-vta.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (198, '301-180', 'Plug RJ45 de 8 contactos CAT 6, para cable redondo.', NULL, 'COMUNICACIÓN', 'ACTUALIZADO', 'STEREN', 5.0, 'INMEDIATO', 'https://www.steren.com.mx/plug-rj45-de-8-contactos-cat-6-para-cable-redondo.html', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (199, '202-728', 'TAQUETE MARIPOSA CON TORNILLO 1/4X2', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 5.3918, 'INMEDIATO', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/taquetes/taquete-mariposa-con-tornillo-1%2f4x2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (200, '201-004', 'TAQUETE DE PLASTICO ANKER GRIS 1/4', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 1.3973, 'INMEDIATO', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/taquetes/taquete-de-plastico-anker-gris-1%2f4', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (201, '188-144', 'PIJA CABEZA FIJADORA COMBINADA PUNTA AB GALVANIZADA 10X1-1/2', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 0.9633, 'INMEIDATO', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/pijas/pija-cabeza-fijadora-combinada-punta-ab-galvanizada-10x1_1%2f2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (202, '1300621012', '2 PIEZAS DE CABLE BradPower 113030K20M030E Juego de cables de doble extremo, 14 AWG, 3 polos - NUEVO MARCA MOLEX', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'EBAY', 4618.41, '5-12 DIAS', 'https://www.ebay.com/itm/177708178347', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (203, '1300180476', '1 PIEZA DE CONECOTR DE Brad Connectivity Sensor Splitter MARCA MOLEX', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'EBAY', 3570.16, '4-10 DIAS', 'https://www.ebay.com/itm/376909340722?_trkparms=itmf%3D1%26aid%3D1110006%26rkt%3D10%26algo%3DHOMESPLICE.SIM%26asc%3D20220405142716%26mech%3D1%26algv%3DDefaultOrganicWebWithV11WebTrimmedV3VisualRankerWithKnnV3AndUltBRecallAndCassiniEmbRecall%26pmt%3D0%26amclksrc%3DITM%26sd%3D376909340798%26sid%3DAQALAAAAED%2BDWpUtJNp%2BRMM5axGN8Es%3D%26itm%3D376909340722%26noa%3D1%26ao%3D1%26rk%3D2%26pid%3D101506%26b%3D1%26mehot%3Dnone%26lsid%3D0%26meid%3D8e8855f7172047969b0a7fcb3c5aec3f%26pg%3D4481478&_trksid=p4481478.c101506.m1851', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (204, 'E4.80.06.150.0', 'CADENA PORTACABLE E4.80', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'IKA TECHNOLOGY', 68593.28, '6 SEMANAS', '20/03/2026 COTIZACIÓN NÚMERO: M0000000336', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (205, 'E4.800.06.2.12.C', 'JGO COMPLETO TERMINALES KMA OSCILANTES', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'IKA TECHNOLOGY', 2104.21, '6 SEMANAS', '20/03/2026 COTIZACIÓN NÚMERO: M0000000336', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (206, 'G9SE221T30', 'Relé de seguridad compacto de 4 salidas normal abiertas, 2 instantaneas y 2 temporizadas OFF delay. Temporización hasta 30 segundos. Una salida auxiliar PNP. Alimentación 24VDC. Ancho 22,5mm. Montaje a riel din. Categoría 4 PLe. SIL 3.', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'CALVEK', 6669.03, '5-6 SEMANAS', '18/03/2026 COTIZACIÓN NÚMERO: COT-CBJ-322522', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (207, 'G9SE201', 'Relés de seguridad SAFETY UNIT, 2+1 O/P, DPST-NO, Voltaje 24VDC, Consumo de energía 3W máx.', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'CALVEK', 2990.0, '2-3 DÍAS HÁBILES SPV', '18/03/2026 COTIZACIÓN NÚMERO: COT-CBJ-322522', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (208, 'SC10-2roe', 'SC10-2roe SC10-2roe Safety Controller; ISD  Compatible (2 ISD Chains) 10 Inputs 2  Relay Outputs (3 NO, 6 A each); Terminal  LEDs; 4 Convertible Inputs; Push-In Spring  Clamp Terminals; 24 V dc; 240-580 mA', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'CALVEK', 9900.36, '2-3 DÍAS HÁBILES SPV', '18/03/2026 COTIZACIÓN NÚMERO: COT-CBJ-322607', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (209, 'UM-FA-11A', 'UM-FA-11A Safety Relay Module for Safety Light  Curtain/Scanner/E-Stop/Interlock; Supply  Voltage: 24 V ac/dc; Safety Input: 1 Dual/ Single Channel; Safety Output: 2 NO, 7 A;  Aux Output: 1 NC, 7 A; Terminal Block:  Removable; Width: 22.5 mm; Self-Checking  Circuitry, Auto/Manual Reset', NULL, 'SEGURIDAD IND', 'ACTUALIZADO', 'CALVEK', 4854.06, '2-3 DÍAS HÁBILES SPV', '18/03/2026 COTIZACIÓN NÚMERO: COT-CBJ-322607', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (210, 'G520846G051', 'Clima de Tablero nVent HOFFMAN', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'ABSA', 117435.6, '2-3 SEMANAS', '19/03/2026 NÚMERO DE COTIZACIÓN SO1825862', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (211, 'G520846G050', 'HOFFMAN Aire acondicionado SpectraCool, Interiores, Metal, 8000 BTU, Gris Claro - Clima de Tablero Modelo G520846G050 Modelo de interior Serie SPECTRACOOL Voltaje 400 – 460 VAC Capacidad 8000BTU/Hr – 2300Watts Corriente de arranque (A) 3.2 Rango Min. y Max. de operacion -40 a 55 C', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'ABSA', 117303.48, '6-7 SEMANAS', '19/03/2026 NÚMERO DE COTIZACIÓN SO1825862', 'CDT CLIMAS DE TABLERO', 108388.44, 'INMEDIATA UNA VEZ GENERADA LA ORDEN DE COMPRA', '20/03/2026 NÚMERO DE COTIZACIÓN', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (212, 'DSW01', 'Interruptor de puerta', NULL, 'SENSORES', 'ACTUALIZADO', 'CDT CLIMAS DE TABLERO', 678.96, 'INMEDIATA UNA VEZ GENERADA LA ORDEN DE COMPRA', '20/03/2026 NÚMERO DE COTIZACIÓN', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (213, 'TPG63', 'TUBO PARED GRUESA DE 63MM (2 1/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 1263.73, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/tubo-pared-gruesa-de-63mm-21-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (214, 'COPLE63PG', 'COPLE PARED GRUESA DE 63MM(21/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 99.25, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/cople-pared-gruesa-de-63mm21-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (215, 'CPG63', 'CODO PARED GRUESA DE 63MM (21/2)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 525.17, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/codo-pared-gruesa-de-63mm-21-2/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (216, 'MT63', 'Monitor Metalico de 63 mm ( 2 1 / 2 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 40.34, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/monitor-metalico-de-63-mm-2-1-2-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (217, 'CT63', 'Contratuerca Metalica Zamac de 63 mm ( 2 1 / 2 ) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 17.18, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/contratuerca-metalica-zamac-de-63-mm-2-1-2-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (218, '300340010', 'CABLE YSLY-JZ 34c x 18awg (1mm2) (PRECIO X METRO)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'IKA TECHNOLOGY', 196.56, '3-4 DIAS', '27/06/2026 NÚMERO DE COTIZACIÓN M0000000343', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (219, '300250010', 'CABLE YSLY-JZ 25c x 18 awg (1mm2) (PRECIO X METRO)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'IKA TECHNOLOGY', 170.28, '3-4 DIAS', '27/06/2026 NÚMERO DE COTIZACIÓN M0000000343', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (220, '302050010', 'CABLE YSLCY-JZ 05c x 18awg (1mm2) (PRECIO X METRO)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'IKA TECHNOLOGY', 45.72, '3-4 DIAS', '27/06/2026 NÚMERO DE COTIZACIÓN M0000000343', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (221, '302070010', 'CABLE YSLCY-JZ 7c x 18awg ( 1.0mm2) BLIN', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'IKA TECHNOLOGY', 60.66, '3-4 DIAS', '27/06/2026 NÚMERO DE COTIZACIÓN M0000000343', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (222, 'ITV3050-04N2BL4', 'TRANSDUCTOR ELECTRONEUMATICO 1/4"NPT, 24VDC, [DC4-20 mA] Tipo de corriente DC4 a 20 mA (Tipo de sumidero)', NULL, 'SENSORES', 'ACTUALIZADO', 'ATC', 7751.0, '3-5 DIAS SPV', '30/03/2026 NÚMERO DE COTIZACIÓN C-419', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (223, 'TPD32', 'TUBO PARED DELGADA DE 32MM (11/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 219.17, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/tubo-pared-delgada-de-32mm-11-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (224, 'CONECTOR32TADO', 'CONECTOR PARA TUBO PARED DELGADA DE 32MM (1 1/4) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 25.07, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/conector-para-tubo-pared-delgada-de-32mm-1-1-4-tipo-americano-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (225, 'TLIC32', 'TUBO FLEXIBLE DE ACERO FORRADO DE PVC (LICUATITE) DE 32 MM (1 1/4) MARCA TUBOS MEXICANOS FLEXIBLES', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 162.56, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/tubo-flexible-de-acero-forrado-de-pvc-licuatite-de-32-mm-1-1-4-marca-tubos-mexicanos-flexibles/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (226, 'CRL32DO', 'CONECTOR RECTO PARA TUBO LICUATITE DE 32 MM (1 1/4”) MARCA CROUSE HINDS DOMEX', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 73.86, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/elt-125-conector-recto-para-tubo-licuatite-de-32-mm-1-1-4-marca-crouse-hinds-domex/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (227, 'COPLE32PG', 'COPLE PARED GRUESA DE 32MM(11/4)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 31.43, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/cople-pared-gruesa-de-32mm11-4/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (228, 'TPD25', 'TUBO PARED DELGADA DE 25MM (1)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 162.1, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/tubo-pared-delgada-de-25mm-1/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (229, 'CONECTOR25TADO', 'CONECTOR PARA TUBO PARED DELGADA DE 25MM (1) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 16.72, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/conector-para-tubo-pared-delgada-de-25mm-1-tipo-americano-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (230, 'COPLE25TADO', 'COPLE PARA TUBO PARED DELGADA DE 25MM (1) TIPO AMERICANO MCA. CCH', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 13.18, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/cople-para-tubo-pared-delgada-de-25mm-1-tipo-americano-mca-cch/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (231, 'CPD25', 'CODO PARED DELGADA DE 25MM (1)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 49.62, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/codo-pared-delgada-de-25mm-1/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (232, 'FX3U-4DA', '4-Channel Analog Output Module for FX3U', NULL, 'PLC''S', 'ACTUALIZADO', 'LUGUER', 9887.94, '1-3 DIAS', '31/03/2026 NÚMERO DE COTIZACIÓN #COTL12189', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (233, 'GENÉRICO', 'Conector Sensores M12 4 Polos Hembra Atornillable Recto', NULL, 'SENSORES', 'ACTUALIZADO', 'MERCADO LIBRE', 189.0, '4-5 DIAS', 'https://www.mercadolibre.com.mx/conector-sensores-m12-4-polos-hembra-atornillable-recto/up/MLMU470269185?pdp_filters=item_id%3AMLM1991266853&from=gshop&matt_tool=74336087&matt_internal_campaign_id=349473031&matt_word=&matt_source=google&matt_campaign_id=21199777332&matt_ad_group_id=196757917104&matt_match_type=&matt_network=g&matt_device=c&matt_creative=787741215010&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=5535397926&matt_product_id=MLMU470269185&matt_product_partition_id=2434568065321&matt_target_id=pla-2434568065321&cq_src=google_ads&cq_cmp=21199777332&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=21199777332&gbraid=0AAAAAoTLPrIK1JHobzDljXFPfWg7Byd7l', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (234, 'WDL1010P', 'CAJA ESTANCAS IP 55 100X100X45 CON LADOS DOBLADOS Y TAPA A PRESION | ROYER', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'EUROELECTRICA', 40.91, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/caja-estancas-ip-55-100x100x45-con-lados-doblados-y-tapa-a-presion-royer/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (235, '733074', 'CONECTOR DE GLANDULA EN POLIAMIDA CUERDA NPT 1/2″ (IP68) MCA TEMPER', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 9.28, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/conector-de-glandula-en-poliamida-cuerda-npt-1-2-ip68-mca-temper/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (236, 'UNIST32', 'Abrazadera Unicanal p/Conduit EMT 32 mm (1 1/4″) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 12.9, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/abrazadera-unicanal-p-conduit-emt-32-mm-1-1-4-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (237, 'UNIST25', 'Abrazadera Unicanal p/Conduit EMT 25 mm (1″) | ANCLO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 11.37, '1-3 DIAS', 'https://euroelectrica.com.mx/producto/abrazadera-unicanal-p-conduit-emt-25-mm-1-anclo/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (238, NULL, '10 Pz Conexión Rapida Neumatica 6mm X 1/4 Npt ( Racor )', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 295.0, '7 DIAS', 'https://www.mercadolibre.com.mx/10-pz-conexion-rapida-neumatica-6mm-x-14-npt--racor-/up/MLMU515708291?pdp_filters=item_id%3AMLM792787319&from=gshop&matt_tool=53826643&matt_word=&matt_source=google&matt_campaign_id=23406600413&matt_ad_group_id=193915105674&matt_match_type=&matt_network=g&matt_device=c&matt_creative=790322146796&matt_keyword=&matt_ad_position=&matt_ad_type=pla&matt_merchant_id=131390657&matt_product_id=MLMU515708291&matt_product_partition_id=2388138774430&matt_target_id=pla-2388138774430&cq_src=google_ads&cq_cmp=23406600413&cq_net=g&cq_plt=gp&cq_med=pla&gad_source=1&gad_campaignid=23406600413&gbraid=0AAAAAoTLPrI_TIyqbm6bhJGZYYXfIIK91', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (239, NULL, '10 Pz Conexión Rapida Neumatica 8mm X 1/4 Npt ( Racor )', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 313.0, '7 DIAS', 'https://www.mercadolibre.com.mx/10-pz-conexion-rapida-neumatica-8mm-x-14-npt--racor-/up/MLMU526567605#polycard_client=search-desktop&search_layout=grid&position=2&type=product&tracking_id=d08cfae1-f6bf-4ec1-b16e-464d24e8a63a&wid=MLM792779404&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (240, NULL, '10 Pz Conexión Rapida Neumatica 12mm X 1/4 Npt ( Racor )', NULL, 'ACCESORIOS', 'ACTUALIZADO', 'MERCADO LIBRE', 549.0, '7 DIAS', 'https://www.mercadolibre.com.mx/10-pz-conexion-rapida-neumatica-12mm-x-14-npt--racor-/up/MLMU539798326#polycard_client=search-desktop&search_layout=grid&position=1&type=product&tracking_id=ac90920a-b61f-4ee3-9c22-6d70d04b53ea&wid=MLM800129782&sid=search', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (241, 'GENÉRICO', 'Conector Armable M12 Recto O Codo 4 Pines Atornillable Pg7', NULL, 'SENSORES', 'ACTUALIZADO', 'MERCADO LIBRE', 296.5, '8 DIAS', 'https://articulo.mercadolibre.com.mx/MLM-1998712189-conector-armable-m12-recto-o-codo-4-pines-atornillable-pg7-_JM?attributes=COLOR_SECONDARY_COLOR%3AQ29kbyBoZW1icmE%3D&picker=true&quantity=1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (242, 'CM2/0', 'CABLE DE COBRE TIPO THW LS DE CAL. 2/0 AWG 600V. | VIAKON', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 302.89, '3 DIAS', 'https://euroelectrica.com.mx/producto/cable-de-cobre-tipo-thw-ls-de-cal-2-0-awg-600v-viakon/', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (243, 'HN01', 'BASE PARA UNICANAL', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 218.44, '3 DIAS', '06/04/2026 NÚMERO DE COTIZACIÓN: L320014', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (244, 'TR-12', 'TRAMO RECTO PERFIL Z DE ALUMINIO CLASE 8A PERALTE 3 1/4 ANCHO DE CHAROLA 6 (15.24 CM) (VIENE CON ACCESORIOS)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 761.8, '2 SEMANAS', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (245, 'SKU 172-808', 'VARILLA ROSCADA G2 NC GALVANIZADA 3.00M 3/8', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 168.8603, '2 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/varillas/varilla-roscada-g2-nc-galvanizada-3%2e00m-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (246, 'SKU 213-208', 'MORDAZA TROQUELADA CON TORNILLO GALVANIZADA 3/8X1-1/4', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 67.057, '2 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/soporteria-y-sujecion/mordaza-troquelada-con-tornillo-galvanizada-3%2f8x1_1%2f4', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (247, 'SKU 213-208', 'TUERCA HEXAGONAL G5 NC 16H GALVANIZADA 3/8', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 1.4981, '2 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tuercas/tuerca-hexagonal-g5-nc-16h-galvanizada-3%2F8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (248, 'SKU 207-304', 'UNICANAL SOLIDO CALIBRE 14 4X4', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 258.3652, '2 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/soporteria-y-sujecion/unicanal-solido-calibre-14-4x4?gad_source=1&gad_campaignid=21686270870&gbraid=0AAAAADsHgcmnVJmJqQa-rbPuX1JbcFdVE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (249, 'CH-111', 'CURVA HORIZONTAL RADIAL 90° PERFIL Z PERALTE 3 1/4 CLASE 8A ANCHO DE CHAROLA 6 (15.24 CM)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 292.79, '8 SEMANAS', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (250, 'CVE-111', 'CURVA VERTICAL EXTERIOR RADIAL 90° PERFIL Z PERALTE 3 1/4 CLASE 8A ANCHO DE CHAROLA 6 (15.24 CM)', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 279.35, '8 SEMANAS', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;
INSERT INTO ssepi_import.bom_materiales (item, numero_de_parte, descripcion, imagen, categoria, estado, nombre_del_proveedor, precio, tiempo_de_entrega, link, nombre_del_proveedor_2, precio_2, tiempo_de_entrega_2, link2, nombre_del_proveedor_3, precio_3, tiempo_de_entrega_3, link_3, nombre_del_proveedor_4, precio_4, tiempo_de_entrega_4, link_4, costo_menor, costo_total_de_las_piezas)
VALUES
  (251, 'SKU 131-104', 'TUERCA RESORTE NC 16H GALVANIZADA 3/8', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EL TORNILLO', 16.6347, '3 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tuercas/tuerca-resorte-nc-16h-galvanizada-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (252, 'SKU 101-900', 'TORNILLO HEXAGONAL G2 NC CUERDA CORRIDA 16H GALVANIZADO 3/8X2', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'EL TORNILLO', 5.4109, '2 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tornillos/tornillo-hexagonal-g2-nc-cuerda-corrida-16h-galvanizado-3%2f8x2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (253, 'SKU 138-516', 'RONDANA PLANA SAE GALVANIZADA 3/8', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'EL TORNILLO', 2.4669, '3 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/rondanas/rondana-plana-sae-galvanizada-3%2f8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (254, 'NQ430L2C', 'Interior tablero NQ Square D de zapatas principales, 225A, 3 fases, 4 hilos, 30 polos, barra de cobre', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 7072.88, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (255, 'MH44', 'Caja envolvente Square D de 50.8 cm ancho, 111.76 cm alto, 14.61 cm de profundidad, para tableros NQ/NF', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 1260.01, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (256, 'NC44S', 'Frente para tablero NQ o NF Square D de 44 pulgadas de altura, para sobreponer', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 3930.26, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (257, 'NQMB2HJ', 'Kit para tablero NQ Square D compatible con interruptores marco H o J de hasta 225A NQMB2HJ', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 2581.03, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (258, 'HDL36150', 'Interruptor termomagnético PowerPacT H, de 150A, 3 polos, 14kA a 600V, zapatas', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 11313.3, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (259, 'PK27GTA', 'Barra de tierra con 27 terminales Square D para centro de carga QO', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 325.39, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (260, 'QO350', 'Interruptor termomagnético mini Square D de 3 polos, 50A, 10kA, 120/240V, enchufable', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 1584.99, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (261, 'QO210', 'Interruptor termomagnético mini Square D de 2 polos, 10A, 10kA, 120/240V, enchufable', NULL, 'MATERIAL ELECTRICO', 'ACTUALIZADO', 'EUROELECTRICA', 545.05, '1-3 DIAS SPV', '07/04/2026 NÚMERO DE COTIZACIÓN: L320067', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (262, NULL, 'Taquete Metalico Fischer Materiales Huecos Hm 5x52 S 10 Pzas', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'MERCADO LIBRE', 149.0, '3 DIAS', 'https://www.mercadolibre.com.mx/taquete-metalico-fischer-materiales-huecos-hm-5x52-s-10-pzas/p/MLM27511046#reviews', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (263, 'FRUK 19-3000', 'UPS 3KVA  ENTRADA: Rango de voltaje: 220 VAC (176 a 264 VAC), Frecuencia: 50/60Hz ±5Hz, Monofásico 220VCA (1F + TF, 3 hilos)  Bifásico (2F + TF, 3 hilos) SALIDA: Voltaje: 120 / 220 / 230 / 240, Frecuencia: 60Hz ±0.1% configurable', NULL, 'ALIMENTACIÓN', 'ACTUALIZADO', 'VOGAR LEÓN GTO', 25190.56, '4-5 SEMANAS', '07/04/2026 NÚMERO DE COTIZACIÓN: abr-26', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (264, 'SKU 101-896', 'TORNILLO HEXAGONAL G2 NC CUERDA CORRIDA 16H GALVANIZADO 3/8X1-3/4', NULL, 'MATERIALES MECÁNICOS', 'ACTUALIZADO', 'EL TORNILLO', 4.9856, '2-3 DIAS', 'https://eltornillo.com.mx/tienda-en-linea/catalogo/tornillos/tornillo-hexagonal-g2-nc-cuerda-corrida-16h-galvanizado-3%2f8x1_3%2f4', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (265, '33A5BEPM-WX2', 'BODINE ELÉCTRICO 33A5BEPM-WX2 90/130VDC 1.3/1.7A NSNP', NULL, 'MOTORES', 'ACTUALIZADO', 'Ebay', 14891.1, '8 DIAS', 'https://www.ebay.com/itm/157791293804?_skw=33A5BEPM-WX2&itmmeta=01KNVVXZC32N4VDFQS3V46Q5YJ&hash=item24bd18116c:g:ZQAAAeSwdJ9pxtly&itmprp=enc%3AAQALAAAA8GfYFPkwiKCW4ZNSs2u11xAZlXQPMrO4Z000fIlToDsybReGy5FpN1uWJlBP6iy2lon0UWgPtvh%2B6vziL1WH%2FzoSKWBKUM5eP0rXabjV8EiDY8UyDrmMLKoBofJcnOCtPxRwCyoZ28Va%2BJIHAvxJp3fEwVlqBu3yq4q%2BhuM8EnbfyUFpumkG76cHrdozORUymWagexxH9e5BNKlylUAQlfng8VLmeUBEz6ZDL8CXrfc9jN65OpdoHRuCJHaodki1LeQofljzqJziiU%2B4M6pPuyXMjvmdrQ%2Bcm%2BdNw4upWi65reI1dbwRyWP3aM5J66Iwwg%3D%3D%7Ctkp%3ABk9SR6D29_uuZw', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (266, 'SigmaTek 12-013-11 (CIO011)', 'Módulo de E/S múltiple SigmaTek 12-013-11, C-DIAS 072.960.131 CIO011 para Vemag', NULL, 'PLC''S', 'ACTUALIZADO', 'EBAY', 14387.66, '48 DIAS', 'https://www.ebay.com/itm/285769525589', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (267, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (268, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (269, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (270, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (271, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (272, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (273, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (274, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (275, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (276, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (277, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (278, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (279, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (280, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (281, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (282, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (283, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (284, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (285, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (286, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (287, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (288, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (289, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (290, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (291, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (292, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (293, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (294, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (295, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (296, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (297, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (298, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (numero_de_parte) DO NOTHING;

-- ── Datos: bom_datos_referencia ──
INSERT INTO ssepi_import.bom_datos_referencia (actualizado, sensores)
VALUES
  ('NO ACTUALIZADO', 'MOTORES'),
  (NULL, 'SERVO MOTOR'),
  (NULL, 'ENCODER'),
  (NULL, 'PLC''S'),
  (NULL, 'COMUNICACIÓN'),
  (NULL, 'ALIMENTACIÓN'),
  (NULL, 'HMI´S'),
  (NULL, 'VARIADOR'),
  (NULL, 'SERVODRIVES'),
  (NULL, 'ROBOT'),
  (NULL, 'CÁMARA'),
  (NULL, 'SENSOR DE VISIÓN'),
  (NULL, 'MATERIALES MECÁNICOS'),
  (NULL, 'LECTOR DE CÓDIGOS'),
  (NULL, 'FLEJADORAS'),
  (NULL, 'UPS'),
  (NULL, 'MATERIAL ELECTRICO'),
  (NULL, 'PROTECCION ELECTRICA'),
  (NULL, 'ACCESORIOS'),
  (NULL, 'SEGURIDAD IND')
ON CONFLICT DO NOTHING;

-- ── Datos: contactos ──
INSERT INTO ssepi_import.contactos (avatar_128, nombre_completo, correo_electronico, telefono, actividades, pais, estadisticas)
VALUES
  (NULL, 'A Y B EUROSERVICIOS', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'AG ELECTRONICA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 4, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'ARCOSA', NULL, '+52 456 649 5178', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'AUTOMATISCHE TECHNIK MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Aaron Garcia', 'electronica.ssepi@gmail.com', '4771342813', NULL, NULL, NULL),
  (NULL, 'Alma salcido', 'almalsalcido@yahoo.com', NULL, NULL, NULL, NULL),
  (NULL, 'Ana Moreno', 'anamoreno.ssepi@gmail.com', '4774120115', NULL, NULL, NULL),
  (NULL, 'Anguiplast, S.A. de C.V.', 'aluquin@anguiplast.com', '+52 348 784 6573', NULL, 'México', '[{"iconClass": "fa-usd", "value": 6, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Anguiplast, S.A. de C.V., Jaziel Lopez', 'ventas@anguiplast.com', '+52 348 784 6573', NULL, 'México', NULL),
  (NULL, 'BADER', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'BECERRA', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'BIG BEN UNIFORMES', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'BODYCOTE', NULL, '+52 472 103 5500', NULL, 'México', NULL),
  (NULL, 'BODYCOTE, Christian Ramírez', 'christian.ramirez@bodycote.com', '+52 462 188 0922', NULL, 'México', NULL),
  (NULL, 'BOLSAS DE LOS ALTOS', NULL, '+52 348 784 4666', NULL, 'México', '[{"iconClass": "fa-usd", "value": 6, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'BOLSAS DE LOS ALTOS, Jennifer Gerrero', NULL, NULL, NULL, 'México', NULL),
  (NULL, 'BRENDA ISELA MARTINEZ MORALES', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 4, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'COFICAB', NULL, '+52 477 162 2500', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'COMPONENTES DE LEON', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'CONDUMEX', NULL, NULL, NULL, 'México', NULL),
  (NULL, 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'ag@oxmachines.com', '+52 477 329 4410', NULL, 'México', '[{"iconClass": "fa-usd", "value": 8, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'DI-CENTRAL', 'hola@dicentral.mx', '+52 477 292 2000', NULL, 'México', '[{"iconClass": "fa-usd", "value": 9, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'DISTRIBUIDORA LIVERPOOL', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'DMT CORTES UNIVERSALES', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'DOMUM', NULL, '+52 477 312 0214', NULL, 'México', '[{"iconClass": "fa-credit-card", "value": 1, "label": "Compras", "tagClass": "o_tag_color_5"}]'),
  (NULL, 'DOMUM, Ariel Diaz', 'ventas1@d-automation.com', '+52 477 564 2981', NULL, 'México', '[{"iconClass": "fa-credit-card", "value": 1, "label": "Compras", "tagClass": "o_tag_color_5"}]'),
  (NULL, 'DON PULCRO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Demo Technic Leon', 'contact.demotechnic@safe-demo.com', '+52 477 344 1060', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Demo Technic Leon, Lic. Blanca Vanesa', NULL, NULL, NULL, 'México', NULL),
  (NULL, 'Demo Technic, S. de R.L. de C.V. Planta León', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'EBAY', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-credit-card", "value": 1, "label": "Compras", "tagClass": "o_tag_color_5"}]'),
  (NULL, 'ECOBOLSAS', 'compras@eco-bolsas.com.mx', '+52 348 784 4440', NULL, 'México', '[{"iconClass": "fa-usd", "value": 9, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'ECOBOLSAS, Elio Cesar', 'produccion@eco-bolsas.com.mx', NULL, NULL, 'México', NULL),
  (NULL, 'ECSA', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'EIKI', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'EMMSA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'EPC 2', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'ESTACION DE SERVICIO LAS HUERTAS', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'EUROELECTRICA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Eduardo Amezcua', 'ventas1@ssepi.org', '+52 477 238 3181', NULL, NULL, '[{"iconClass": "fa-calendar", "value": 4, "label": "Reuniones", "tagClass": "o_tag_color_3"}]'),
  (NULL, 'Envases Plásticos del Centro, S.A. de C.V.', 'compras@eplasticos.com.mx', '+52 444 824 2454', NULL, 'México', '[{"iconClass": "fa-usd", "value": 4, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Envases Plásticos del Centro, S.A. de C.V., Maurico Santiago', 'ventas@eplasticos.com.mx', '+52 444 824 2454', NULL, 'México', NULL),
  (NULL, 'FANTASIAS MIGUEL', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'FAS', NULL, NULL, NULL, NULL, NULL),
  ('El contenido de esta celda es demasiado largo para un archivo XLSX (más de 32767 caracteres), utilice el formato CSV para esta exportación.', 'Famo Alimentos, S.A. de C.V.', 'antoniorm@famoalimentos.com.mx', '+52 477 343 4300', NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'sandra.rangel@fraenkische-mx.com', '+52 472 690 3040', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'GRUPO AMIGOS DE SAN ANGEL', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'GRUPO COMERCIAL CZO CARNAVALLIA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'GUSTAVO NASSER GONZALEZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Granos y Servicios Integrales, S.A. de C.V.', 'pedro.pastor@proan.com', '+52 395 725 8033', NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]')
ON CONFLICT (correo_electronico) DO NOTHING;
INSERT INTO ssepi_import.contactos (avatar_128, nombre_completo, correo_electronico, telefono, actividades, pais, estadisticas)
VALUES
  (NULL, 'Granos y Servicios Integrales, S.A. de C.V., Ing. Uriel Padilla', 'mantenimiento.gsi@consorciogsi.com', '+52 395 112 6913', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Grupo Zahonero', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'HALL ALUMINIUM', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'HIRUTA', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'HOME DEPOT MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 3, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'HOSPEDAJE POTOSINO INMOBILIARIA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'HT6 INGENIERIA S DE RL DE CV', 'administracion@ika.technology', '+52 477 711 2851', NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}, {"iconClass": "fa-credit-card", "value": 1, "label": "Compras", "tagClass": "o_tag_color_5"}]'),
  (NULL, 'HT6 INGENIERIA S DE RL DE CV, Maria Delucia', 'international@ika.technology', '+52 477 449 1651', NULL, 'México', NULL),
  (NULL, 'Hebillas y Herrajes Robor S.A. de C.V.', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'Hielo Regia', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Hiruta México, S.A. de C.V.', 'keiji-kayakiri@hiruta.com.mx', '+52 472 103 2600', NULL, 'México', NULL),
  (NULL, 'Hormas Palacios, S.A. de C.V.', NULL, '+52 477 763 4574', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Hormas Palacios, S.A. de C.V., Lulu Palacios', 'hormaspalacios@gmail.com', '+52 477 143 2413', NULL, 'México', NULL),
  (NULL, 'ICEMAN', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'IK PLASTIC', 'misaelmoreno1001@gmail.com', NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'IK Plastic Compound México, S.A. de C.V.', 'torres.eduardo@ikpc-mx.com', '+52 472 103 9700', NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'IK Plastic Compound México, S.A. de C.V., Ing. Eduardo Torres', NULL, '+52 477 525 6876', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'INSTITUTO MEXICANO DEL SEGURO SOCIAL', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'ITX RETAIL MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Industrias Fivax', 'sac@fivax.mx', '+52 477 710 8700', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Iván Gutiérrez', 'betagtzm@gmail.com', NULL, NULL, NULL, NULL),
  (NULL, 'Javier Cruz', 'electronica@ssepi.org', '4775747109', NULL, NULL, NULL),
  (NULL, 'Javier Cruz Castro', 'electronica@ssepi.org', NULL, NULL, NULL, NULL),
  (NULL, 'Jorge Villanueva', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'LA MANERA DE ESTAR SEGURO SEG-MA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'LAURA ELENA RAMIREZ PEREZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'MARQ', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'MARQUARDT', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'MARQUARDT MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'MIGUEL ANGEL GARCIA SANTACRUZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'MOUSER ELECTRONICS', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'MR LUCKY', NULL, '+52 462 626 2663', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'MR LUCKY, Reina Medina', NULL, NULL, NULL, 'México', NULL),
  (NULL, 'Mantenimiento Alquin', NULL, '+52 479 255 9633', NULL, NULL, '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Misael Moreno', 'administracion@ssepi.org', '4791370088', NULL, NULL, NULL),
  (NULL, 'NHK', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'NHK Spring México, S.A. de C.V.', 'omar.vargaz@nhkusa.com', '+52 462 623 8000', NULL, 'México', '[{"iconClass": "fa-usd", "value": 15, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'NHK Spring México, S.A. de C.V., Felipe Garcia', 'felipe.garcia@nhkspgmx.com', NULL, NULL, 'México', NULL),
  (NULL, 'NIKE DE MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'NUEVA WAL MART DE MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 7, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Nishikawa Sealing Systems Mexico', NULL, '+52 472 722 6938', NULL, 'México', '[{"iconClass": "fa-usd", "value": 25, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Nishikawa Sealing Systems Mexico, Diego García', NULL, '+52 477 141 6257', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Nishikawa Sealing Systems Mexico, Victor Garnica', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 15, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'ODOO TECHNOLOGIES', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'OFFICE DEPOT DE MEXICO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 5, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'OSCAR RAMIREZ MORENO', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Pieles Azteca, S.A. de C.V.', 'ahernandez@teneriaazteca.mx', '+52 477 778 3607', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Pieles Azteca, S.A. de C.V., Jesus Bolaños', NULL, '+52 479 208 6446', NULL, 'México', NULL),
  (NULL, 'Polímeros y Derivados, S.A. de C.V.', 'jlcastro@polimeros.com', '+52 477 710 9795', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Prefabricadora de Losas, S.A. de C.V.', 'francisco.aguirre@prelosa.com', '+52 477 740 6000', NULL, 'México', '[{"iconClass": "fa-usd", "value": 5, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]')
ON CONFLICT (correo_electronico) DO NOTHING;
INSERT INTO ssepi_import.contactos (avatar_128, nombre_completo, correo_electronico, telefono, actividades, pais, estadisticas)
VALUES
  (NULL, 'Productos Industriales de León, S.A. de C.V.', 'hola@pilsac.com.mx.', '+52 477 778 4155', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Productos Industriales de León, S.A. de C.V., Jonathan Falcón', NULL, '+52 477 253 0959', NULL, 'México', NULL),
  (NULL, 'RED DE CARRETERAS DE OCCIDENTE', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'RENATO GUZMAN MUÑOZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'RICARDO SILVESTRE MENDEZ CALDERA', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'RONGTAI', 'compras3@rtco.com.cn', '+52 479 262 7503', NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'RONGTAI, Joatam álvarez', 'compras3@rtco.com.cn', '+52 479 262 7503', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Ramiro', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 4, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'SADDLEBACK', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'SADDLEBACK, Genaro Morales', NULL, '+52 33 4016 5336', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'SCOTIABANK INVERLAT', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'SEIVIER NOLBERTO MORAN FERNANDEZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'SSEPI', 'administracion@ssepi.org', NULL, NULL, 'México', NULL),
  ('El contenido de esta celda es demasiado largo para un archivo XLSX (más de 32767 caracteres), utilice el formato CSV para esta exportación.', 'SSEPI, Aarón Garcia', 'electronica.ssepi@gmail.com', '+52 477 134 2813', NULL, 'México', NULL),
  (NULL, 'SSEPI, Arturo Moreno', 'automatizacion@ssepi.org', '+52 477 630 5230', NULL, 'México', NULL),
  (NULL, 'SSEPI, Daniel Zuñiga', 'ventas@ssepi.org', '+52 477 737 3118', NULL, 'México', NULL),
  (NULL, 'SSEPI, Iván Gutierrez', 'ivang.ssepi@gmail.com', '+52 477 522 8007', NULL, 'México', NULL),
  (NULL, 'SUCOMO | Suministros y Control en Movimiento', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-usd", "value": 3, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'SUCOMO | Suministros y Control en Movimiento, Juan Bujanda', 'juan.bujanda@sucomocom.com', '+52 477 786 4262', NULL, 'México', NULL),
  (NULL, 'Seroc Corrugados, S.A. de C.V.', 'jalb@gseroc.com', '+52 477 763 6227', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Soser Soluciones Industriales, S.A. de C.V.', 'contacto@soser.com.mx', '+52 477 348 2191', NULL, 'México', '[{"iconClass": "fa-usd", "value": 1, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Soser Soluciones Industriales, S.A. de C.V.', 'contacto@soser.com.mx', '+52 477 348 2191', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Soser Soluciones Industriales, S.A. de C.V., Ing. Victor Flores', NULL, '+52 477 253 6030', NULL, 'México', NULL),
  (NULL, 'TACSA', NULL, '+52 55 1148 9204', NULL, NULL, NULL),
  (NULL, 'TACSA, Delfino Ortega', NULL, '+52 55 1148 9204', NULL, NULL, NULL),
  (NULL, 'TORNO', NULL, NULL, NULL, NULL, '[{"iconClass": "fa-usd", "value": 4, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'TRIPLE M', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 5, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'TRIPLE M, MISAEL ALEJANDRO MORENO MENDEZ', 'misaelmoreno1001@gmail.com', NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 2, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'Tenería Vargas, S.A. de C.V.', 'alejandrovarela@teneriavargas.com', '+52 477 714 3950', NULL, 'México', '[{"iconClass": "fa-usd", "value": 2, "label": "\u00d3rdenes de venta", "tagClass": "o_tag_color_2"}]'),
  (NULL, 'Tenería Vargas, S.A. de C.V., Hector', NULL, '+52 477 124 1524', NULL, 'México', NULL),
  (NULL, 'VOLKER BRUNK SANCHEZ', NULL, NULL, NULL, 'México', '[{"iconClass": "fa-pencil-square-o", "value": 1, "label": "Facturas de clientes/Facturas de proveedores/Mandatos", "tagClass": "o_tag_color_9"}]'),
  (NULL, 'prueba', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (correo_electronico) DO NOTHING;

-- ── Datos: cotizacion_viajes ──
INSERT INTO ssepi_import.cotizacion_viajes (empresa, km_x2, litros, gasolina, gasolina2, hrs, hr_dani, dani, total)
VALUES
  ('BOLSAS DE LOS ALTOS', 226.0, 23.7895, 24.5, 582.8421, 5, 104.16, 520.8, 1103.6421),
  ('ANGUIPALST', 234.0, 24.6316, 24.5, 603.4737, 6, 104.16, 624.96, 1228.4337),
  ('ECOBOLSAS', 216.0, 22.7368, 24.5, 557.0526, 5, 104.16, 520.8, 1077.8526),
  ('BADER TABACHINES', 17.2, 1.8105, 24.5, 44.3579, 2, 104.16, 208.32, 252.6779),
  ('BODYCOTE', 90.6, 9.5368, 24.5, 233.6526, 3, 104.16, 312.48, 546.1326),
  ('COFICAB', 80.0, 8.4211, 24.5, 206.3158, 3, 104.16, 312.48, 518.7958),
  ('CONDUMEX', 90.6, 9.5368, 24.5, 233.6526, 3, 104.16, 312.48, 546.1326),
  ('ECSA', 32.0, 3.3684, 24.5, 82.5263, 2, 104.16, 208.32, 290.8463),
  ('EMMSA', 21.6, 2.2737, 24.5, 55.7053, 2, 104.16, 208.32, 264.0253),
  ('EPC 1', 400.0, 42.1053, 24.5, 1031.5789, 7, 104.16, 729.12, 1760.6989),
  ('EPC 2', 402.0, 42.3158, 24.5, 1036.7368, 8, 104.16, 833.28, 1870.0168),
  ('FRAENKISCHE', 79.4, 8.3579, 24.5, 204.7684, 3, 104.16, 312.48, 517.2484),
  ('GEDNEY', 23.6, 2.4842, 24.5, 60.8632, 3, 104.16, 312.48, 373.3432),
  ('GRUPO ACERERO', 386.0, 40.6316, 24.5, 995.4737, 7, 104.16, 729.12, 1724.5937),
  ('HALL PLANTA 1', 73.8, 7.7684, 24.5, 190.3263, 3, 104.16, 312.48, 502.8063),
  ('HIRUTA PLANTA 1', 58.4, 6.1474, 24.5, 150.6105, 3, 104.16, 312.48, 463.0905),
  ('IK PLASTIC', 61.4, 6.4632, 24.5, 158.3474, 3, 104.16, 312.48, 470.8274),
  ('IMPRENTA JM', 16.2, 1.7053, 24.5, 41.7789, 2, 104.16, 208.32, 250.0989),
  ('JARDÍN LA ALEMANA', 12.0, 1.2632, 24.5, 30.9474, 2, 104.16, 208.32, 239.2674),
  ('MAFLOW', 59.8, 6.2947, 24.5, 154.2211, 3, 104.16, 312.48, 466.7011),
  ('MARQUARDT', 125.4, 13.2, 24.5, 323.4, 4, 104.16, 416.64, 740.04),
  ('MICROONDA', 41.6, 4.3789, 24.5, 107.2842, 3, 104.16, 312.48, 419.7642),
  ('MR LUCKY', 157.0, 16.5263, 24.5, 404.8947, 4, 104.16, 416.64, 821.5347),
  ('NHK', 138.6, 14.5895, 24.5, 357.4421, 4, 104.16, 416.64, 774.0821),
  ('NISHIKAWA', 61.0, 6.4211, 24.5, 157.3158, 3, 104.16, 312.48, 469.7958),
  ('PIELES AZTECA', 5.0, 0.5263, 24.5, 12.8947, 1, 104.16, 104.16, 117.0547),
  ('RONGTAI', 28.2, 2.9684, 24.5, 72.7263, 3, 104.16, 312.48, 385.2063),
  ('SAFE DEMO', 61.6, 6.4842, 24.5, 158.8632, 3, 104.16, 312.48, 471.3432),
  ('ELECTROFORJADOS', 14.6, 1.5368, 24.5, 37.6526, 2, 104.16, 208.32, 245.9726),
  ('SUACERO', 392.0, 41.2632, 24.5, 1010.9474, 8, 104.16, 833.28, 1844.2274),
  ('TQ-1', 26.0, 2.7368, 24.5, 67.0526, 2, 104.16, 208.32, 275.3726),
  ('MINO INDUSTRY', 29.2, 3.0737, 24.5, 75.3053, 2, 104.16, 208.32, 283.6253)
ON CONFLICT DO NOTHING;

-- ── Datos: cotizacion_laboratorio ──
INSERT INTO ssepi_import.cotizacion_laboratorio (col_30, col_87, col_80, col_161_85, col_52_67)
VALUES
  ('GASOLINA', 'VENTAS', 'TIEMP. INVERTIDO', 'GASTOS FIJOS X HORA TOTAL', 'CAMIONETA X HORA'),
  ('600', '435', '16', '2589.6', '263.35'),
  ('600', '435', NULL, '0', '263.35'),
  ('600', '435', NULL, '0', '263.35'),
  ('60', '174', NULL, '0', '105.34'),
  ('270', '261', NULL, '0', '158.01'),
  ('240', '261', NULL, '0', '158.01'),
  ('270', '261', NULL, '0', '158.01'),
  ('96', '174', NULL, '0', '105.34'),
  ('1200', '435', NULL, '0', '263.35'),
  ('1200', '435', NULL, '0', '263.35'),
  ('270', '261', NULL, '0', '158.01'),
  ('66', '261', NULL, '0', '158.01'),
  ('1200', '435', NULL, '0', '263.35'),
  ('210', '261', NULL, '0', '158.01'),
  ('210', '261', NULL, '0', '158.01'),
  ('222', '261', NULL, '0', '158.01'),
  ('54', '174', NULL, '0', '105.34'),
  ('36', '174', NULL, '0', '105.34'),
  ('216', '174', NULL, '0', '105.34'),
  ('420', '261', NULL, '0', '158.01'),
  ('162', '87', NULL, '0', '52.67'),
  ('456', '261', NULL, '0', '158.01'),
  ('420', '261', NULL, '0', '158.01'),
  ('216', '261', NULL, '0', '158.01'),
  ('18', '174', NULL, '0', '105.34'),
  ('96', '261', NULL, '0', '158.01'),
  ('192', '174', NULL, '0', '105.34'),
  ('48', '174', NULL, '0', '105.34'),
  ('1200', '435', NULL, '0', '263.35'),
  ('78', '174', NULL, '0', '105.34'),
  ('90', '174', NULL, '0', '105.34'),
  ('480', '348', NULL, '0', '210.68'),
  ('480', '348', NULL, '0', '210.68'),
  ('54', '261', NULL, '0', '158.01'),
  ('120', '261', NULL, '0', '158.01'),
  ('36', '174', NULL, '0', '105.34'),
  ('48', '174', NULL, '0', '105.34'),
  ('48', '174', NULL, '0', '105.34'),
  ('240', '174', NULL, '0', '105.34'),
  ('42', '261', NULL, '0', '158.01'),
  ('48', '174', NULL, '0', '105.34'),
  ('60', '174', NULL, '0', '105.34'),
  ('36', '174', NULL, '0', '105.34'),
  ('48', '174', NULL, '0', '105.34'),
  ('120', '174', NULL, '0', '105.34'),
  ('216', '174', NULL, '0', '105.34'),
  ('150', '261', NULL, '0', '158.01'),
  ('60', '174', NULL, '0', '105.34'),
  ('48', '174', NULL, '0', '105.34')
ON CONFLICT DO NOTHING;
INSERT INTO ssepi_import.cotizacion_laboratorio (col_30, col_87, col_80, col_161_85, col_52_67)
VALUES
  ('480', '348', NULL, '0', '210.68')
ON CONFLICT DO NOTHING;

-- ── Datos: cotizacion_motores ──
INSERT INTO ssepi_import.cotizacion_motores (col_30, col_87, col_52_67)
VALUES
  ('GASOLINA', 'VENTAS', 'CAMIONETA X HORA'),
  ('600', '435', '263.35'),
  ('600', '435', '263.35'),
  ('600', '435', '263.35'),
  ('60', '174', '105.34'),
  ('270', '261', '158.01'),
  ('240', '261', '158.01'),
  ('270', '261', '158.01'),
  ('768', '174', '105.34'),
  ('1200', '435', '263.35'),
  ('1200', '435', '263.35'),
  ('270', '261', '158.01'),
  ('66', '261', '158.01'),
  ('1200', '435', '263.35'),
  ('210', '261', '158.01'),
  ('210', '261', '158.01'),
  ('222', '261', '158.01'),
  ('54', '174', '105.34'),
  ('36', '174', '105.34'),
  ('216', '174', '105.34'),
  ('420', '261', '158.01'),
  ('162', '87', '52.67'),
  ('456', '261', '158.01'),
  ('420', '261', '158.01'),
  ('420', '261', '158.01'),
  ('216', '174', '105.34'),
  ('96', '261', '158.01'),
  ('192', '174', '105.34'),
  ('48', '174', '105.34'),
  ('1200', '435', '263.35'),
  ('78', '174', '105.34'),
  ('90', '174', '105.34'),
  ('660', '348', '210.68'),
  ('480', '348', '210.68'),
  ('54', '261', '158.01'),
  ('120', '261', '158.01'),
  ('36', '174', '105.34'),
  ('48', '174', '105.34'),
  ('48', '174', '105.34'),
  ('240', '174', '105.34'),
  ('42', '261', '158.01'),
  ('48', '174', '105.34'),
  ('60', '174', '105.34'),
  ('36', '174', '105.34'),
  ('48', '174', '105.34'),
  ('120', '174', '105.34'),
  ('216', '174', '105.34'),
  ('150', '261', '158.01'),
  ('60', '174', '105.34'),
  ('60', '174', '105.34')
ON CONFLICT DO NOTHING;
INSERT INTO ssepi_import.cotizacion_motores (col_30, col_87, col_52_67)
VALUES
  ('48', '348', '210.68')
ON CONFLICT DO NOTHING;

-- ── Datos: cotizacion_automatizacion ──
INSERT INTO ssepi_import.cotizacion_automatizacion (col_650, col_700, col_450, col_900, col_350, col_600, col_1100, col_150, col_52_67, col_30, col_161_85)
VALUES
  ('PROGRAMACIÓN PLC HMI', 'SERVOMOTOR', 'DISEÑO TABLERO', 'DISEÑO MECANICO', 'INSTALACIÓN', 'FABRICACIÓN', 'SOPORTE', 'ARQUITECTURA', 'HR CAMIONETA', 'GASOLINA', 'GASTOS GENERALES'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '600', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '600', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '600', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '60', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '270', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '240', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '270', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '768', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '1200', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '1200', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '270', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '66', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '1200', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '210', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '210', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '222', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '54', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '36', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '216', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '420', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '162', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '456', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '420', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '216', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '18', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '96', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '192', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '1200', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '78', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '90', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '660', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '480', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '54', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '120', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '36', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '240', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '42', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '60', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '36', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '120', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '216', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '150', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '60', '0'),
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '48', '0')
ON CONFLICT DO NOTHING;
INSERT INTO ssepi_import.cotizacion_automatizacion (col_650, col_700, col_450, col_900, col_350, col_600, col_1100, col_150, col_52_67, col_30, col_161_85)
VALUES
  (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0', '642', '0')
ON CONFLICT DO NOTHING;

-- ── Datos: cotizacion_suministros ──
INSERT INTO ssepi_import.cotizacion_suministros (col_30, col_87, col_52_67)
VALUES
  ('GASOLINA', 'VENTAS', 'CAMIONETA X HORA'),
  ('600', '435', '263.35'),
  ('600', '435', '263.35'),
  ('600', '435', '263.35'),
  ('60', '174', '105.34'),
  ('270', '261', '158.01'),
  ('240', '261', '158.01'),
  ('270', '261', '158.01'),
  ('768', '174', '105.34'),
  ('1200', '435', '263.35'),
  ('1200', '435', '263.35'),
  ('270', '261', '158.01'),
  ('66', '261', '158.01'),
  ('1200', '435', '263.35'),
  ('210', '261', '158.01'),
  ('210', '261', '158.01'),
  ('222', '261', '158.01'),
  ('54', '174', '105.34'),
  ('36', '174', '105.34'),
  ('216', '174', '105.34'),
  ('420', '261', '158.01'),
  ('162', '87', '52.67'),
  ('456', '261', '158.01'),
  ('420', '261', '158.01'),
  ('420', '261', '158.01'),
  ('216', '174', '105.34'),
  ('96', '261', '158.01'),
  ('192', '174', '105.34'),
  ('48', '174', '105.34'),
  ('1200', '435', '263.35'),
  ('78', '174', '105.34'),
  ('90', '174', '105.34'),
  ('660', '348', '210.68'),
  ('480', '348', '210.68'),
  ('54', '261', '158.01'),
  ('120', '261', '158.01'),
  ('36', '174', '105.34'),
  ('48', '174', '105.34'),
  ('48', '174', '105.34'),
  ('240', '174', '105.34'),
  ('42', '261', '158.01'),
  ('48', '174', '105.34'),
  ('60', '174', '105.34'),
  ('36', '174', '105.34'),
  ('48', '174', '105.34'),
  ('120', '174', '105.34'),
  ('216', '174', '105.34'),
  ('150', '261', '158.01'),
  ('60', '174', '105.34'),
  ('60', '174', '105.34')
ON CONFLICT DO NOTHING;
INSERT INTO ssepi_import.cotizacion_suministros (col_30, col_87, col_52_67)
VALUES
  ('48', '348', '210.68')
ON CONFLICT DO NOTHING;

-- ── Datos: inventario_automatizacion ──
INSERT INTO ssepi_import.inventario_automatizacion (fecha, cantidad, categoria, num_parte, descripcion, costo_unitario, importe, entradas, salidas, fecha_de_salida)
VALUES
  ('2026-09-02T00:00:00', 12, 'Canalización', 'US4X2', 'PERFIL UNICANAL SOLIDO 4X2 0.15 MTS CAL 16.', 11.0, 132.0, 12, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Canalización', 'CPD13', 'CODO PARED DELGADA 13MM (1/2 )', 16.17, 32.34, 2, 0, NULL),
  ('2026-09-02T00:00:00', 7, 'Canalización', 'UNIST13', 'ABRAZADERA UNICANAL EMT 13 mm (1/2″)', 6.24, 43.68, 7, 0, NULL),
  ('2026-09-02T00:00:00', 14, 'Fijación', '10-008-1/4X2-1/4', 'TAQUETE ARPON GALVANIZADO  1/4 X2 -1/4', 4.38, 61.32, 14, 0, NULL),
  ('2026-09-02T00:00:00', 11, 'Canalización', 'COPLE13PG', 'COPLE PARED GRUESA DE 13MM(1/2)', 5.88, 64.68, 11, 0, NULL),
  ('2026-09-02T00:00:00', 4, 'Canalización', 'CONECTOR13TADO', 'CONECTOR PARA TUBO PARED DELGADA DE 13MM (1/2) TIPO AMERICANO', 6.72, 26.88, 4, 0, NULL),
  ('2026-09-02T00:00:00', 6, 'Accesorio Perfil', 'DMI-3024-45', 'ESCUADRA PERFIL 4545', 67.6, 405.6, 6, 0, NULL),
  ('2026-09-02T00:00:00', 40, 'Accesorio Perfil', 'DMI-NUT- URR10-M8', 'TUERCA MARTILLO M8XR10', 22.5, 900.0, 40, 0, NULL),
  ('2026-09-02T00:00:00', 40, 'Accesorio Perfil', 'ALM-08025', 'TORNILLO  M8 X 25 MM', 4.3, 172.0, 40, 0, NULL),
  ('2026-09-02T00:00:00', 4, 'Canalización', '212-104', 'ABRAZADERA TIPO OMEGA GALVANIZADA 1/2', 4.02, 16.08, 4, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'LC1N0601', 'CONTACTOR: 3-POLOS; CONTACTO AUXILIAR: NO; 230VAC; 6A; 690V', 488.0, 488.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'LRN05N', 'RELÉ DE PROTECCIÓN CONTRA SOBRECARGA TÉRMICA 1A', 465.0, 465.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Alimentación', '5SL63207C', 'INTERRUPTOR PARA RIEL 3 POLOS, 20A,  6KA, 250/440v', 639.0, 1278.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'RUMC31BD', 'RELÉ ELECTROMAGNÉTICO; 3PDT; 24VDC; I CONTACTOS: 10A', 181.29, 181.29, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'RUZC3M', 'BASE PARA RELEVADOR UNIV ""RUM"" 3 REV P/1', 189.0, 189.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Neumatica', 'V5221-08E1', 'VALVULA DIRECCIONAL 1/4 5VIAS 2 POSICIONES CONTROL SIMPLE 110VAC', 495.9, 495.9, 1, 0, NULL),
  ('2026-09-02T00:00:00', 13, 'Terminales', 'PCT-222', 'CONECTORES DE CABLE 2 HILOS CALIBRE 28 A 12 AWG', 5.5, 71.5, 13, 0, NULL),
  ('2026-09-02T00:00:00', 22, 'Canalización', 'TXG-PG16-BK', 'CONECTORES GLANDULA PARA CABLE 10-14 MM, PG16 - 16 MM', 17.0, 374.0, 22, 0, NULL),
  ('2026-09-02T00:00:00', 4, 'Canalización', '733076', 'CONECTOR DE GLANDULA EN POLIAMIDA CUERDA NPT 3/4″', 25.05, 100.2, 4, 0, NULL),
  ('2026-09-02T00:00:00', 15, 'Cable', 'YSLY-JZ 25C', 'MULTICONDUCTOR 25 HILOS X CAL 18 AWG METRO', 240.0, 3600.0, 15, 0, NULL),
  ('2026-09-02T00:00:00', 20, 'Cable', 'YSLCY-JZ', 'MULTICONDUCTOR 5 HILOS X CAL 20 AWG APANTALLADO METRO', 31.9, 638.0, 20, 0, NULL),
  ('2026-09-02T00:00:00', 50, 'Cable', 'FULL-BOB-CAT6', 'CABLE UTP CAT 6 COLOR AZUL', 3.5, 175.0, 50, 0, NULL),
  ('2026-09-02T00:00:00', 80, 'Cable', 'CTHW16B', 'CABLE CON AISLAMIENTO TIPO THW 16 AWG, 90° 600V. COLOR BLANCO', 5.1, 408.0, 80, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', 'FX3SA-10MR-CM', 'PLC , ALIMENTACION 110-240 VAC, 6DI/4DO 24VDC 2A', 1500.0, 1500.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 4, 'Control', '34.51.7.024.0010', 'RELEVADOR CUADRADO 6AMP 24VDC 1P2T 5PIN  SIN BASE', 70.0, 280.0, 4, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'S2SRN-LCKG', 'SELECTOR PLASTICO 22MM 2 POSICIONES , VERD,E 12-30VDC, SIN BASE', 250.0, 250.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Control', 'SA-CBM', 'CONTACTO NC AUTONICS PACK5PZ', 70.0, 140.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Control', 'SA-CA', 'CONTACTO NA AUTONICS PACK5PZ', 70.0, 140.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 9, 'Control', 'SA-LAG', 'PILOTO PARA BOTON 110-220 VAC AUTONICS PACK5PZ', 150.0, 1350.0, 9, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'LA38-11/203', 'BOTON PULSADOR MOMENTANEO VERDE CONTACTO NA', 150.0, 150.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'LA39-B3-01D-W21', 'BOTON PULSADOR MOMENTANEO BLANCO CONTACTO NA', 150.0, 150.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'AD16-22DS-GREEN-220V', 'PILOTO ALIMENTACION 110-220 VAC,  22 MM  VERDE', 40.0, 40.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Control', 'S2SR-S7W', 'BOTON SELECTOR 3 POSICIONES CON RETORNO AL CENTRO 22MM 2 CNA', 400.0, 800.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 215-1BG40-0XB0', 'CPU 1215C AC-DC-RLY, 2 PTOS  PROFINET, 14ID/10SR- 2IA-2SA, MEM 200KB', 8500.0, 8500.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 234-4HE32-0XB0', 'MODULO SIMATIC S7-1200, E/S ANALÓGICAS, SM 1234, 4 AI/2 AO, +/-10V, 0-20 MA', 5200.0, 5200.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 155-6AU00-0BN0', 'SIMATIC ET200SP IM155-6PN STANDARD MAX 32 MODULOS', 3500.0, 3500.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 193-6AR00-0AA0', 'SIMATIC ET 200SP, ADAPTADOR DE BUS BA 2xRJ45', 1800.0, 1800.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'PLC', '6ES7 193-6BP00-0BA0', 'SIMATIC ET 200SP,BASE UNIT BU15-P16+A0+2B, BU TIPO A0', 600.0, 1200.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 193-6BP00-0DA0', 'SIMATIC ET 200SP,BASE UNIT BU15-P16+A0+2D, BU TIPO A0', 600.0, 600.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7 131-6BF01-0BA0', 'SIMATIC ET200SP 8 ENT DIG 24VDC STANDARD BU A0', 2200.0, 2200.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7131-6BH01-0BA0', 'SIMATIC ET200SP 16 ENT DIG 24VDC STANDARD BU A0', 2780.0, 2780.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'PLC', '6ES7132-6BF00-0BA0', 'SIMATIC ET200SP 8X24VDC 0.5A SALIDAS', 1900.0, 1900.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Alimentación', 'NXB-63 C3', 'INTERRUPTOR PARA RIEL 2 POLOS, 3A, 6KA, 400V', 573.0, 573.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Alimentación', 'DZ47S C20', 'INTERRUPTOR PARA RIEL 2 POLOS, 20A, 6KA, 400V', 569.0, 569.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Alimentación', 'DZ47S C10', 'INTERRUPTOR PARA RIEL 2 POLOS, 10A, 6KA, 400V', 569.0, 1138.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Sensor', 'PN3092', 'SENSOR DE PRESIÓN CON PANTALLA 1-100 BAR, G  1/4 M6', 10916.0, 10916.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 10, 'Neumatica', 'KQ2H04-06A', 'CONECTOR NEUMÁTICO RÁPIDO REDUCCIÓN 6MM A 4 MM', 94.0, 940.0, 10, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Neumatica', 'NSE38N6MM', 'CONECTOR/REGULADOR DE CAUDAL NEUMÁTICO CODO 3/8 NTP X 6 MM', 155.0, 155.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Neumatica', 'PL38N8MMQTY5', 'CONECTOR NEUMÁTICO CODO 3/8 NTP X 8 MM', 160.0, 320.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Sensor', 'AD1/AN-1A', 'SENSOR INDUCTIVO M5, NO, NPN, CABLE 2 MTS, DISTANCIA 0.8 MM', 920.0, 920.0, 1, 0, NULL)
ON CONFLICT (num_parte, fecha) DO NOTHING;
INSERT INTO ssepi_import.inventario_automatizacion (fecha, cantidad, categoria, num_parte, descripcion, costo_unitario, importe, entradas, salidas, fecha_de_salida)
VALUES
  ('2026-09-02T00:00:00', 2, 'Sensor', 'D-M9B', 'SENSOR MAGNÉTICO DE ESTADO SOLIDO, 2 HILOS, CABLE  3 MTS', 460.0, 920.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', '46.61.9.012.0040', 'RELEVADOR  1CC (12VDC) 16 A CON PULSADOR DE PRUEBA SIN BASE', 103.0, 103.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Control', 'RXM2AB2BD', 'RELEVADOR  2CC (24VDC) 5A CON PULSADOR DE PRUEBA SIN BASE', 180.0, 360.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'YJ139-LA38', 'BOTON PULSADOR MOMENTANEOROJO CONTACTO NA Y NO 22MM', 150.0, 150.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 2, 'Neumatica', '4V210-08', 'VALVULA DIRECCIONAL 1/4 5VIAS 2 POSICIONES CONTROL DOBLE 24 VDC', 480.0, 960.0, 2, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Neumatica', 'VFS2120-4DZ-02T', 'VÁLVULA SOLENOIDE VFS DE 4/5 PUERTOS 2 POSICIONES SALIDAS 1/8, 1/4, 220AC', 1430.0, 1430.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Alimentación', 'HDL36050', 'INTERRUPTOR TERMOMAGNÉTICO 3 POLOS, 50A, SQARD D, 600V, 18KA', 5105.0, 5105.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 3, 'Control', 'LC1D09M7', 'CONTACTOR MAGNETICO 3P, 9 A, 1NA-1NC, 220V', 570.0, 1710.0, 3, 0, NULL),
  ('2026-09-02T00:00:00', 1, 'Control', 'NC1-1210Z', 'CONTACTOR MAGNETICO 4P, 5KW, 1NA-1NC, 24VDC', 355.0, 355.0, 1, 0, NULL),
  ('2026-09-02T00:00:00', 6, 'Canalización', 'TPD13', 'TUBO PARED DELGADA 13MM (1/2), 3 MTS', 63.96, 383.76, 6, 0, NULL),
  ('2026-02-11T00:00:00', 1, 'Sensor', 'QFS-61', 'SENSOR DE FLUJO QUALITY', 1201.85, 1201.85, 1, NULL, NULL),
  ('2026-02-11T00:00:00', 1, 'Sensor', 'A421ABC-02', 'SENSOR DE TEMPERATURA DE JOHNSON CONTROLS', 1696.7, 1696.7, 1, NULL, NULL),
  ('2026-02-11T00:00:00', 2, 'Sensor', 'KP5 060-117166', 'PRESOSTATO DANFOSS', 2150.51, 4301.02, 2, NULL, NULL),
  ('2026-02-11T00:00:00', 1, 'Alimentación', '5SL6332-7CC', 'INTERRUPTOR PARA RIEL 3 POLOS, 32A,  6KA, 250/440v', 895.0, 895.0, 1, NULL, NULL),
  ('2026-02-11T00:00:00', 1, 'Ventilación', 'FW68B', 'MOTOR DE VENTILADOR CON ASPAS 220VAC68W 0.85A', 909.78, 909.78, 1, NULL, NULL),
  ('2026-02-11T00:00:00', 1, 'Control', 'ERC213', 'CONTROLADOR DE TEMPERATURA DANFOSS', 1270.0, 1270.0, 1, NULL, NULL),
  ('2026-02-11T00:00:00', 2, 'Control', 'S/NP', 'BOTONES AMARILLOS CON RETENCIÓN CON BLOQUE NO Y LÁMPARA PILOTO', 600.0, 1200.0, 2, NULL, NULL),
  ('2026-02-11T00:00:00', 1, 'Control', 'S/NP', 'BOTÓN PARO DE EMERGENCIA CON 2 BLOQUES NC', 500.0, 500.0, 1, NULL, NULL),
  ('2026-02-16T00:00:00', 3, 'Canalización', 'S/NP', 'GLANDULA DE 1/2" METÁLICA', 86.03, 258.09, 3, NULL, NULL),
  ('2026-02-16T00:00:00', 4, 'Canalización', 'S/NP', 'CLEMA 20-10AWG', 50.0, 200.0, 4, NULL, NULL),
  ('2026-02-16T00:00:00', 1, 'Canalización', 'S/NP', 'CLEMA PORTAFUSIBLE LEGRAND 15A 22-12AWG', 195.0, 195.0, 1, NULL, NULL),
  ('2026-02-16T00:00:00', 1, 'Control', 'NC1-1201', 'CONTACTOR TRIFÁSICO CHINT 220VAC 20A', 1175.0, 1175.0, 1, NULL, NULL),
  ('2026-02-16T00:00:00', 1, 'Control', 'GC6-45S', 'CONTACTOR BIFASICO', 294.0, 294.0, 1, NULL, NULL),
  ('2026-02-16T00:00:00', 1, 'Canalización', 'GENERICO', 'CONECTOR RECTO PARA USO RUDO', 5.3, 5.3, 1, NULL, NULL),
  ('2026-02-16T00:00:00', 2, 'Control', 'EKS 221', 'SENSOR DE TEMPERATURA DANFOSS', 793.74, 1587.48, 2, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL),
  (NULL, 0, NULL, NULL, NULL, NULL, 0.0, NULL, NULL, NULL)
ON CONFLICT (num_parte, fecha) DO NOTHING;

-- ── Datos: inventario_electronica ──
INSERT INTO ssepi_import.inventario_electronica (codigo_marking, descripcion, existencia, ubicacion, encapsulado, link_octopart, link_digikey, link_mouser, costo_unitario_mxn, total_linea_mxn)
VALUES
  ('LM339', 'AMPLIFICADOR COMPARADOR', 7, 'A1', 'DIP 14', 'https://octopart.com/search?q=LM339', 'https://www.digikey.com.mx/es/products/result?keywords=LM339', 'https://www.mouser.mx/c/?q=LM339', 15, 105),
  ('LM339', 'AMPLIFICADOR COMPARADOR', 9, 'A1', 'SOIC 14', 'https://octopart.com/search?q=LM339', 'https://www.digikey.com.mx/es/products/result?keywords=LM339', 'https://www.mouser.mx/c/?q=LM339', 15, 135),
  ('CD4046BE', 'CIRCUITO SINCRONIZADOR DE FASE', 4, 'A2', 'DIP14', 'https://octopart.com/search?q=CD4046BE', 'https://www.digikey.com.mx/es/products/result?keywords=CD4046BE', 'https://www.mouser.mx/c/?q=CD4046BE', 25, 100),
  ('LM393', 'COMPARADOR DUAL', 18, 'B1', 'SOIC 8', 'https://octopart.com/search?q=LM393', 'https://www.digikey.com.mx/es/products/result?keywords=LM393', 'https://www.mouser.mx/c/?q=LM393', 12, 216),
  ('74HC85', 'High-Speed CMOS Logic 4-Bit Magnitude Comparator', 7, 'C1', 'SOIC 14', 'https://octopart.com/search?q=74HC85', 'https://www.digikey.com.mx/es/products/result?keywords=74HC85', 'https://www.mouser.mx/c/?q=74HC85', 20, 140),
  ('74HC85', 'High-Speed CMOS Logic 4-Bit Magnitude Comparator', 5, 'C1', 'DIP 14', 'https://octopart.com/search?q=74HC85', 'https://www.digikey.com.mx/es/products/result?keywords=74HC85', 'https://www.mouser.mx/c/?q=74HC85', 20, 100),
  ('HEF40106', 'Hex inverting Schmitt trigger', 4, 'A2', 'DIP14', 'https://octopart.com/search?q=HEF40106', 'https://www.digikey.com.mx/es/products/result?keywords=HEF40106', 'https://www.mouser.mx/c/?q=HEF40106', 18, 72),
  ('74HC00', 'COMPUERTAS NAND', 5, 'D1', 'DIP14', 'https://octopart.com/search?q=74HC00', 'https://www.digikey.com.mx/es/products/result?keywords=74HC00', 'https://www.mouser.mx/c/?q=74HC00', 10, 50),
  ('IRFBC40', 'MOSFET CHANEL N', 5, 'E1', 'TO-220', 'https://octopart.com/search?q=IRFBC40', 'https://www.digikey.com.mx/es/products/result?keywords=IRFBC40', 'https://www.mouser.mx/c/?q=IRFBC40', 45, 225),
  ('RHRP15100', 'DIODO HIPERFAST', 4, 'E1', 'TO-220', 'https://octopart.com/search?q=RHRP15100', 'https://www.digikey.com.mx/es/products/result?keywords=RHRP15100', 'https://www.mouser.mx/c/?q=RHRP15100', 50, 200),
  ('2N6344', 'TRIACS 8AMPER', 1, 'F1', 'TO220', 'https://octopart.com/search?q=2N6344', 'https://www.digikey.com.mx/es/products/result?keywords=2N6344', 'https://www.mouser.mx/c/?q=2N6344', 40, 40),
  ('FB3307Z', 'MOSFET CHANEL N', 2, 'F1', 'TO-220', 'https://octopart.com/search?q=FB3307Z', 'https://www.digikey.com.mx/es/products/result?keywords=FB3307Z', 'https://www.mouser.mx/c/?q=FB3307Z', 35, 70),
  ('74LS21', 'DUAL 4-INPUT POSITIVE-AND GATES', 2, 'G1', 'DIP 14', 'https://octopart.com/search?q=74LS21', 'https://www.digikey.com.mx/es/products/result?keywords=74LS21', 'https://www.mouser.mx/c/?q=74LS21', 15, 30),
  ('74LS14', 'SCHMITT TRIGGERSDUAL GATE/HEX INVERTER', 2, 'G1', 'DIP14', 'https://octopart.com/search?q=74LS14', 'https://www.digikey.com.mx/es/products/result?keywords=74LS14', 'https://www.mouser.mx/c/?q=74LS14', 15, 30),
  ('AM26LS31', 'Quadruple Differential Line Driver', 4, 'H1', 'SOIC 14', 'https://octopart.com/search?q=AM26LS31', 'https://www.digikey.com.mx/es/products/result?keywords=AM26LS31', 'https://www.mouser.mx/c/?q=AM26LS31', 30, 120),
  ('HCPL-0453', 'Optoacopladores de alta velocidad 1MBd 1Ch 16mA', 13, 'B2', 'SOIC 8', 'https://octopart.com/search?q=HCPL-0453', 'https://www.digikey.com.mx/es/products/result?keywords=HCPL-0453', 'https://www.mouser.mx/c/?q=HCPL-0453', 60, 780),
  ('NCP5106BDR2G', 'Controladores de puertas HIGH VOLT MOSFET DR LO MOSFET IGBT', 3, 'C2', 'SOIC 8', 'https://octopart.com/search?q=NCP5106BDR2G', 'https://www.digikey.com.mx/es/products/result?keywords=NCP5106BDR2G', 'https://www.mouser.mx/c/?q=NCP5106BDR2G', 25, 75),
  ('IRFR3411', 'MOSFET N-CH 100V 32A DPAK', 1, 'C2', 'TO-252AA', 'https://octopart.com/search?q=IRFR3411', 'https://www.digikey.com.mx/es/products/result?keywords=IRFR3411', 'https://www.mouser.mx/c/?q=IRFR3411', 25, 25),
  ('DSEI30-06A', 'Diodo epitaxial de recuperación rápida', 1, 'D2', NULL, 'https://octopart.com/search?q=DSEI30-06A', 'https://www.digikey.com.mx/es/products/result?keywords=DSEI30-06A', 'https://www.mouser.mx/c/?q=DSEI30-06A', 80, 80),
  ('TLH-4951', 'BATERIA 3.6', 1, 'E2', '1/2AA', 'https://octopart.com/search?q=TLH-4951', 'https://www.digikey.com.mx/es/products/result?keywords=TLH-4951', 'https://www.mouser.mx/c/?q=TLH-4951', 150, 150),
  ('XL-050F', 'BATERIA 3.6V', 1, 'E2', '1/2AA', 'https://octopart.com/search?q=XL-050F', 'https://www.digikey.com.mx/es/products/result?keywords=XL-050F', 'https://www.mouser.mx/c/?q=XL-050F', 120, 120),
  ('F2/250E', 'Fusible cerámico de acción retardada 2A/250V', 3, 'F2', NULL, 'https://octopart.com/search?q=F2/250E+', 'https://www.digikey.com.mx/es/products/result?keywords=F2/250E+', 'https://www.mouser.mx/c/?q=F2/250E+', 15, 45),
  ('083AG324A2', 'Controlador de sumidero Darlington de 8 canales', 6, 'F2', NULL, 'https://octopart.com/search?q=083AG324A2', 'https://www.digikey.com.mx/es/products/result?keywords=083AG324A2', 'https://www.mouser.mx/c/?q=083AG324A2', 15, 90),
  (NULL, 'TRANSCEIVER RS485/422', 2, 'A3', 'SOIC 14', 'https://octopart.com/search?q=TRANSCEIVER+RS485/422', 'https://www.digikey.com.mx/es/products/result?keywords=TRANSCEIVER+RS485/422', 'https://www.mouser.mx/c/?q=TRANSCEIVER+RS485/422', 15, 30),
  ('M81738FP', 'Controlador de medio puente de alto voltaje de 1200 V', 2, 'G2', NULL, 'https://octopart.com/search?q=M81738FP', 'https://www.digikey.com.mx/es/products/result?keywords=M81738FP', 'https://www.mouser.mx/c/?q=M81738FP', 250, 500),
  ('HEF4094BT', 'Registro de desplazamiento serial de 8 etapas.', 2, 'E3', 'SO16', 'https://octopart.com/search?q=HEF4094BT', 'https://www.digikey.com.mx/es/products/result?keywords=HEF4094BT', 'https://www.mouser.mx/c/?q=HEF4094BT', 15, 30),
  ('74HCT02', 'COMPUERTAS LOGICAS NOR', 7, 'B3', 'SOIC 14', 'https://octopart.com/search?q=74HCT02', 'https://www.digikey.com.mx/es/products/result?keywords=74HCT02', 'https://www.mouser.mx/c/?q=74HCT02', 15, 105),
  ('HCF4094', 'Registro de bus de desplazamiento y almacenamiento de 8 etapas con salidas de 3 etapas', 3, 'C3', 'SO16', 'https://octopart.com/search?q=HCF4094', 'https://www.digikey.com.mx/es/products/result?keywords=HCF4094', 'https://www.mouser.mx/c/?q=HCF4094', 15, 45),
  ('SN75176BP', 'INTERFAS RS485/422', 4, 'D3', 'SOIC-8', 'https://octopart.com/search?q=SN75176BP', 'https://www.digikey.com.mx/es/products/result?keywords=SN75176BP', 'https://www.mouser.mx/c/?q=SN75176BP', 15, 60),
  ('TL598CN', 'CONTROLADOR PWM', 2, 'F3', 'DIP-16', 'https://octopart.com/search?q=TL598CN', 'https://www.digikey.com.mx/es/products/result?keywords=TL598CN', 'https://www.mouser.mx/c/?q=TL598CN', 15, 30),
  ('CD4011BE', 'Puertas NAND CMOS', 11, 'G3', 'DIP-14', 'https://octopart.com/search?q=CD4011BE', 'https://www.digikey.com.mx/es/products/result?keywords=CD4011BE', 'https://www.mouser.mx/c/?q=CD4011BE', 15, 165),
  ('TEXTOOL/3M', 'BASE PARA MICROCONTROLADOR DE EDC', 1, 'A4', NULL, 'https://octopart.com/search?q=TEXTOOL/3M', 'https://www.digikey.com.mx/es/products/result?keywords=TEXTOOL/3M', 'https://www.mouser.mx/c/?q=TEXTOOL/3M', 15, 15),
  (NULL, 'CAPACITOR ELECTROLITICO 50V 2200UF', 2, 'B4', NULL, 'https://octopart.com/search?q=CAPACITOR+ELECTROLITICO+50V+2200UF', 'https://www.digikey.com.mx/es/products/result?keywords=CAPACITOR+ELECTROLITICO+50V+2200UF', 'https://www.mouser.mx/c/?q=CAPACITOR+ELECTROLITICO+50V+2200UF', 20, 40),
  ('HCPL-786J', 'OPTOACOPLADOR Data Acquisition ADCs/DACs - Specialized Isolated Modular', 6, 'C4', 'SOIC-16', 'https://octopart.com/search?q=HCPL-786J', 'https://www.digikey.com.mx/es/products/result?keywords=HCPL-786J', 'https://www.mouser.mx/c/?q=HCPL-786J', 180, 1080),
  ('LT1791IS', 'INTERFAS RS485/422', 2, 'D4', 'SOIC-14', 'https://octopart.com/search?q=LT1791IS', 'https://www.digikey.com.mx/es/products/result?keywords=LT1791IS', 'https://www.mouser.mx/c/?q=LT1791IS', 150, 300),
  ('CD4013', 'FLIP-FLOP', 2, 'E4', 'DIP-14', 'https://octopart.com/search?q=CD4013', 'https://www.digikey.com.mx/es/products/result?keywords=CD4013', 'https://www.mouser.mx/c/?q=CD4013', 15, 30),
  ('MC14503BDR2G', 'Hex Non-Inverting 3-State Buffer', 5, 'F4', 'SOIC-16', 'https://octopart.com/search?q=MC14503BDR2G', 'https://www.digikey.com.mx/es/products/result?keywords=MC14503BDR2G', 'https://www.mouser.mx/c/?q=MC14503BDR2G', 15, 75),
  ('BZX55C18-TR', 'DIODO ZENER 18V 0.5W', 4, 'G4', NULL, 'https://octopart.com/search?q=BZX55C18-TR', 'https://www.digikey.com.mx/es/products/result?keywords=BZX55C18-TR', 'https://www.mouser.mx/c/?q=BZX55C18-TR', 15, 60),
  ('SK310BQ-LTP', 'DIODO SCHOTTKY', 4, 'H4', 'DO214AA', 'https://octopart.com/search?q=SK310BQ-LTP', 'https://www.digikey.com.mx/es/products/result?keywords=SK310BQ-LTP', 'https://www.mouser.mx/c/?q=SK310BQ-LTP', 15, 60),
  ('CD4001', 'COMPUERTAS LOGICAS NOR', 9, 'A5', NULL, 'https://octopart.com/search?q=CD4001', 'https://www.digikey.com.mx/es/products/result?keywords=CD4001', 'https://www.mouser.mx/c/?q=CD4001', 15, 135),
  ('MC33167TVG', 'SWITCHING REGULADOR 40V 5A', 2, 'H3', 'TO-220', 'https://octopart.com/search?q=MC33167TVG', 'https://www.digikey.com.mx/es/products/result?keywords=MC33167TVG', 'https://www.mouser.mx/c/?q=MC33167TVG', 80, 160),
  ('TOP250YN', 'AC/DC Converters 210 W 85-265 VAC 290 W 230 VAC', 2, 'B5', 'TO-220', 'https://octopart.com/search?q=TOP250YN', 'https://www.digikey.com.mx/es/products/result?keywords=TOP250YN', 'https://www.mouser.mx/c/?q=TOP250YN', 85, 170),
  ('RMS-100E', 'RESISTENCIA 10 OHMS', 10, 'C5', 'SMD', 'https://octopart.com/search?q=RMS-100E', 'https://www.digikey.com.mx/es/products/result?keywords=RMS-100E', 'https://www.mouser.mx/c/?q=RMS-100E', 15, 150),
  ('0325020.MXF80P', 'FUSIBLE AMERICANO250V 20A SLO-BLO', 3, 'D5', 'AMERICANO', 'https://octopart.com/search?q=0325020.MXF80P', 'https://www.digikey.com.mx/es/products/result?keywords=0325020.MXF80P', 'https://www.mouser.mx/c/?q=0325020.MXF80P', 15, 45),
  ('D2F-01FL-T', 'MICRO SWITCH', 3, 'E5', NULL, 'https://octopart.com/search?q=D2F-01FL-T', 'https://www.digikey.com.mx/es/products/result?keywords=D2F-01FL-T', 'https://www.mouser.mx/c/?q=D2F-01FL-T', 15, 45),
  ('CC1R5-2412DF-E', 'CONVERTIDOR DC/DC AISLADO 1.5W 12V', 1, 'F5', NULL, 'https://octopart.com/search?q=CC1R5-2412DF-E', 'https://www.digikey.com.mx/es/products/result?keywords=CC1R5-2412DF-E', 'https://www.mouser.mx/c/?q=CC1R5-2412DF-E', 210, 210),
  ('3700630410', 'FUSIBLE 0.063A', 2, 'G5', NULL, 'https://octopart.com/search?q=3700630410', 'https://www.digikey.com.mx/es/products/result?keywords=3700630410', 'https://www.mouser.mx/c/?q=3700630410', 15, 30),
  ('GBU2510-G', 'PUENTE RECTIFICADOR 25A', 1, 'H5', NULL, 'https://octopart.com/search?q=GBU2510-G', 'https://www.digikey.com.mx/es/products/result?keywords=GBU2510-G', 'https://www.mouser.mx/c/?q=GBU2510-G', 35, 35),
  ('FM1', 'FUSIBLE MINI 1 A 250 V', 4, 'A6', NULL, 'https://octopart.com/search?q=FM1', 'https://www.digikey.com.mx/es/products/result?keywords=FM1', 'https://www.mouser.mx/c/?q=FM1', 15, 60),
  ('MMBF4393LT1G', 'MOSFET 30V  30ma', 5, 'B6', 'SOT-23', 'https://octopart.com/search?q=MMBF4393LT1G', 'https://www.digikey.com.mx/es/products/result?keywords=MMBF4393LT1G', 'https://www.mouser.mx/c/?q=MMBF4393LT1G', 15, 75)
ON CONFLICT (codigo_marking, ubicacion) DO NOTHING;
INSERT INTO ssepi_import.inventario_electronica (codigo_marking, descripcion, existencia, ubicacion, encapsulado, link_octopart, link_digikey, link_mouser, costo_unitario_mxn, total_linea_mxn)
VALUES
  ('LM358', 'AMPLIFICADOR OPERACIONAL DUAL', 3, 'C6', 'SOIC 8', 'https://octopart.com/search?q=LM358', 'https://www.digikey.com.mx/es/products/result?keywords=LM358', 'https://www.mouser.mx/c/?q=LM358', 10, 30),
  ('LM324', 'AMPLIFICADOR OPERACIONAL 4', 4, 'D6', 'SOIC 16', 'https://octopart.com/search?q=LM324', 'https://www.digikey.com.mx/es/products/result?keywords=LM324', 'https://www.mouser.mx/c/?q=LM324', 12, 48),
  ('CC3-2405SF-E', 'CONVERTIDOR DC/DC AISLADO 3W 5V 0.6A', 1, 'E6', NULL, 'https://octopart.com/search?q=CC3-2405SF-E', 'https://www.digikey.com.mx/es/products/result?keywords=CC3-2405SF-E', 'https://www.mouser.mx/c/?q=CC3-2405SF-E', 300, 300),
  ('FGA60N65SMD', 'IGBT 650V 60A', 2, 'F6', 'TO3PN', 'https://octopart.com/search?q=FGA60N65SMD', 'https://www.digikey.com.mx/es/products/result?keywords=FGA60N65SMD', 'https://www.mouser.mx/c/?q=FGA60N65SMD', 110, 220),
  ('LM25575MHX/NOPB', 'REGULADORES DE VOLTAJE 42V 1.5A', 4, 'G6', 'TSSOP 16', 'https://octopart.com/search?q=LM25575MHX/NOPB', 'https://www.digikey.com.mx/es/products/result?keywords=LM25575MHX/NOPB', 'https://www.mouser.mx/c/?q=LM25575MHX/NOPB', 15, 60),
  (NULL, 'TRANSFORMADOR  220V / 110V', 1, 'H6', NULL, 'https://octopart.com/search?q=TRANSFORMADOR++220V+/+110V+', 'https://www.digikey.com.mx/es/products/result?keywords=TRANSFORMADOR++220V+/+110V+', 'https://www.mouser.mx/c/?q=TRANSFORMADOR++220V+/+110V+', 15, 15),
  (NULL, 'TRANSFORMADOR 110/110', 3, 'A7', NULL, 'https://octopart.com/search?q=TRANSFORMADOR+110/110', 'https://www.digikey.com.mx/es/products/result?keywords=TRANSFORMADOR+110/110', 'https://www.mouser.mx/c/?q=TRANSFORMADOR+110/110', 15, 45),
  ('SKA20420', 'RELEVADOR DE ESTADO SOLIDO', 3, 'B7', NULL, 'https://octopart.com/search?q=SKA20420', 'https://www.digikey.com.mx/es/products/result?keywords=SKA20420', 'https://www.mouser.mx/c/?q=SKA20420', 15, 45),
  (NULL, 'CAPACITOR DE PELICULA 220nF 100v', 5, 'C7', NULL, 'https://octopart.com/search?q=CAPACITOR+DE+PELICULA+220nF+100v', 'https://www.digikey.com.mx/es/products/result?keywords=CAPACITOR+DE+PELICULA+220nF+100v', 'https://www.mouser.mx/c/?q=CAPACITOR+DE+PELICULA+220nF+100v', 20, 100),
  (NULL, 'RELEVADOR DE 12V', 2, 'D7', NULL, 'https://octopart.com/search?q=RELEVADOR+DE+12V+', 'https://www.digikey.com.mx/es/products/result?keywords=RELEVADOR+DE+12V+', 'https://www.mouser.mx/c/?q=RELEVADOR+DE+12V+', 15, 30),
  (NULL, 'RESISTENCIA DE POTENCIA 47 OHMS 10 W', 1, 'E7', NULL, 'https://octopart.com/search?q=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W', 'https://www.digikey.com.mx/es/products/result?keywords=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W', 'https://www.mouser.mx/c/?q=RESISTENCIA+DE+POTENCIA+47+OHMS+10+W', 1, 1),
  ('74HC00', 'COMPUERTAS NAND', 2, 'F7', 'SOIC 14', 'https://octopart.com/search?q=74HC00', 'https://www.digikey.com.mx/es/products/result?keywords=74HC00', 'https://www.mouser.mx/c/?q=74HC00', 10, 20),
  ('MC74HC165', 'REGISTRO DE 8 BITS', 2, 'G7', 'SOIC 16', 'https://octopart.com/search?q=MC74HC165', 'https://www.digikey.com.mx/es/products/result?keywords=MC74HC165', 'https://www.mouser.mx/c/?q=MC74HC165', 15, 30),
  ('BC847', 'Bipolar Transistors - BJT SOT23 45V .1A NPN GP TRANS', 26, 'H7', 'SOT-23', 'https://octopart.com/search?q=BC847', 'https://www.digikey.com.mx/es/products/result?keywords=BC847', 'https://www.mouser.mx/c/?q=BC847', 2, 52),
  ('2SC2873', 'TRANSISTOR NPN', 2, 'A8', 'SOT-89', 'https://octopart.com/search?q=2SC2873', 'https://www.digikey.com.mx/es/products/result?keywords=2SC2873', 'https://www.mouser.mx/c/?q=2SC2873', 15, 30),
  (NULL, 'RELEVADOR DE 5V', 2, 'B8', NULL, 'https://octopart.com/search?q=RELEVADOR+DE+5V', 'https://www.digikey.com.mx/es/products/result?keywords=RELEVADOR+DE+5V', 'https://www.mouser.mx/c/?q=RELEVADOR+DE+5V', 25, 50),
  ('M27C512-10F1', 'MEMORIA EPROM', 2, 'C8', 'DIP 28', 'https://octopart.com/search?q=M27C512-10F1', 'https://www.digikey.com.mx/es/products/result?keywords=M27C512-10F1', 'https://www.mouser.mx/c/?q=M27C512-10F1', 15, 30),
  ('10XSIH-SP-5X20', 'PORTA FUSIBLES PARA TARJETAS ECOBOLSAS', 8, 'D8', NULL, 'https://octopart.com/search?q=10XSIH-SP-5X20', 'https://www.digikey.com.mx/es/products/result?keywords=10XSIH-SP-5X20', 'https://www.mouser.mx/c/?q=10XSIH-SP-5X20', 15, 120),
  ('PM150RSE060', 'MODULO IGBT MITSUBISHI', 1, 'T13', NULL, 'https://octopart.com/search?q=PM150RSE060', 'https://www.digikey.com.mx/es/products/result?keywords=PM150RSE060', 'https://www.mouser.mx/c/?q=PM150RSE060', 2600, 2600),
  ('SKKD 100/16', 'DIODO DUAL SEMIKRON', 3, 'U13', NULL, 'https://octopart.com/search?q=SKKD+100/16', 'https://www.digikey.com.mx/es/products/result?keywords=SKKD+100/16', 'https://www.mouser.mx/c/?q=SKKD+100/16', 1100, 3300),
  ('B43544-E2228-M2', 'CAPACITOR 2200UF 250V', 0, 'T14', NULL, 'https://octopart.com/search?q=B43544-E2228-M2', 'https://www.digikey.com.mx/es/products/result?keywords=B43544-E2228-M2', 'https://www.mouser.mx/c/?q=B43544-E2228-M2', 250, 0),
  ('0D22A2', 'CAPACITOR 560UF 450V', 2, 'V13', NULL, 'https://octopart.com/search?q=0D22A2', 'https://www.digikey.com.mx/es/products/result?keywords=0D22A2', 'https://www.mouser.mx/c/?q=0D22A2', 15, 30),
  ('P011351481', 'TERMINAL ROJO 3/16', 10, 'W13', NULL, 'https://octopart.com/search?q=P011351481', 'https://www.digikey.com.mx/es/products/result?keywords=P011351481', 'https://www.mouser.mx/c/?q=P011351481', 15, 150),
  ('PFB14421293', 'TERMINAL NEGRO 3/16', 5, 'W14', NULL, 'https://octopart.com/search?q=PFB14421293', 'https://www.digikey.com.mx/es/products/result?keywords=PFB14421293', 'https://www.mouser.mx/c/?q=PFB14421293', 15, 75),
  ('KTR10EZPJ4R7', 'RESISTENCIA 4.7 OHMS', 9, 'I1', NULL, 'https://octopart.com/search?q=KTR10EZPJ4R7', 'https://www.digikey.com.mx/es/products/result?keywords=KTR10EZPJ4R7', 'https://www.mouser.mx/c/?q=KTR10EZPJ4R7', 15, 135),
  ('SR1210JR-074R7L', 'RESISTENCIA 4.7 OHMS', 10, 'I1', NULL, 'https://octopart.com/search?q=SR1210JR-074R7L', 'https://www.digikey.com.mx/es/products/result?keywords=SR1210JR-074R7L', 'https://www.mouser.mx/c/?q=SR1210JR-074R7L', 15, 150),
  ('CRCW25124R7OJNEGIF', 'RESISTENCIA 4.7 OHMS', 10, 'I2', NULL, 'https://octopart.com/search?q=CRCW25124R7OJNEGIF', 'https://www.digikey.com.mx/es/products/result?keywords=CRCW25124R7OJNEGIF', 'https://www.mouser.mx/c/?q=CRCW25124R7OJNEGIF', 15, 150),
  ('A4985SLPTR-T', '1A DUAL FULL BRIDGE', 4, NULL, NULL, 'https://octopart.com/search?q=A4985SLPTR-T', 'https://www.digikey.com.mx/es/products/result?keywords=A4985SLPTR-T', 'https://www.mouser.mx/c/?q=A4985SLPTR-T', 15, 60),
  (NULL, 'PASTA TERMICA', 1, 'P13', NULL, 'https://octopart.com/search?q=PASTA+TERMICA+', 'https://www.digikey.com.mx/es/products/result?keywords=PASTA+TERMICA+', 'https://www.mouser.mx/c/?q=PASTA+TERMICA+', 15, 15),
  (NULL, 'FLUX', 1, 'P14', NULL, 'https://octopart.com/search?q=FLUX', 'https://www.digikey.com.mx/es/products/result?keywords=FLUX', 'https://www.mouser.mx/c/?q=FLUX', 15, 15),
  (NULL, 'PASTA DE BAJA TEMPERATURA', 1, 'P15', NULL, 'https://octopart.com/search?q=PASTA+DE+BAJA+TEMPERATURA+', 'https://www.digikey.com.mx/es/products/result?keywords=PASTA+DE+BAJA+TEMPERATURA+', 'https://www.mouser.mx/c/?q=PASTA+DE+BAJA+TEMPERATURA+', 15, 15),
  (NULL, 'ESPONJA PARA CAUTIN', 2, 'Q13', NULL, 'https://octopart.com/search?q=ESPONJA+PARA+CAUTIN', 'https://www.digikey.com.mx/es/products/result?keywords=ESPONJA+PARA+CAUTIN', 'https://www.mouser.mx/c/?q=ESPONJA+PARA+CAUTIN', 15, 30),
  ('CM200DY-12NF', 'MODULO IGBT MITSUBISHI', 1, 'Q14', NULL, 'https://octopart.com/search?q=CM200DY-12NF', 'https://www.digikey.com.mx/es/products/result?keywords=CM200DY-12NF', 'https://www.mouser.mx/c/?q=CM200DY-12NF', 1300, 1300),
  ('DC-24-1', 'FUENTE IN 120-220VAC / OUT 24VDC', 3, 'Q15', NULL, 'https://octopart.com/search?q=DC-24-1', 'https://www.digikey.com.mx/es/products/result?keywords=DC-24-1', 'https://www.mouser.mx/c/?q=DC-24-1', 15, 45),
  ('LM2596', 'DC-DC FUENTE REGULABLE IN 24VDC / OUT 0 - 24 VDC', 6, 'R13', NULL, 'https://octopart.com/search?q=LM2596', 'https://www.digikey.com.mx/es/products/result?keywords=LM2596', 'https://www.mouser.mx/c/?q=LM2596', 15, 90),
  (NULL, 'FUSIBLES TIPO EUROPEOS 6A', 7, 'F8', NULL, 'https://octopart.com/search?q=FUSIBLES+TIPO+EUROPEOS+6A+', 'https://www.digikey.com.mx/es/products/result?keywords=FUSIBLES+TIPO+EUROPEOS+6A+', 'https://www.mouser.mx/c/?q=FUSIBLES+TIPO+EUROPEOS+6A+', 15, 105),
  ('TC33X-2-503G', 'potenciometro 3mm 50k ohms', 1, 'F9', NULL, 'https://octopart.com/search?q=TC33X-2-503G', 'https://www.digikey.com.mx/es/products/result?keywords=TC33X-2-503G', 'https://www.mouser.mx/c/?q=TC33X-2-503G', 15, 15),
  ('AD8512BRZ', 'amplificador operacional low noise', 1, 'G9', 'soic 8', 'https://octopart.com/search?q=AD8512BRZ', 'https://www.digikey.com.mx/es/products/result?keywords=AD8512BRZ', 'https://www.mouser.mx/c/?q=AD8512BRZ', 450, 450),
  ('TL074IYDT', 'amplificador operacional', 1, NULL, 'soic 14', 'https://octopart.com/search?q=TL074IYDT', 'https://www.digikey.com.mx/es/products/result?keywords=TL074IYDT', 'https://www.mouser.mx/c/?q=TL074IYDT', 15, 15),
  ('TLP352', 'OPTOACOPLADOR', 4, 'B9', NULL, 'https://octopart.com/search?q=TLP352', 'https://www.digikey.com.mx/es/products/result?keywords=TLP352', 'https://www.mouser.mx/c/?q=TLP352', 15, 60),
  ('A4980KLPTR', 'CONTROLADOR DE DISPAROS', 1, 'G8', NULL, 'https://octopart.com/search?q=A4980KLPTR', 'https://www.digikey.com.mx/es/products/result?keywords=A4980KLPTR', 'https://www.mouser.mx/c/?q=A4980KLPTR', 15, 15),
  ('BZT52HC13', 'DIODO ZENER 13V', 9, 'H8', NULL, 'https://octopart.com/search?q=BZT52HC13', 'https://www.digikey.com.mx/es/products/result?keywords=BZT52HC13', 'https://www.mouser.mx/c/?q=BZT52HC13', 15, 135),
  ('MAX232ECWET', 'INTERFAZ RS-232', 1, 'C9', NULL, 'https://octopart.com/search?q=MAX232ECWET', 'https://www.digikey.com.mx/es/products/result?keywords=MAX232ECWET', 'https://www.mouser.mx/c/?q=MAX232ECWET', 65, 65),
  ('ST485EBDR', 'TRANSCEIVER RS485/422', 1, 'D9', NULL, 'https://octopart.com/search?q=ST485EBDR', 'https://www.digikey.com.mx/es/products/result?keywords=ST485EBDR', 'https://www.mouser.mx/c/?q=ST485EBDR', 15, 15),
  ('74HC08D', 'COMPUERTA LOGICA', 1, 'E9', NULL, 'https://octopart.com/search?q=74HC08D', 'https://www.digikey.com.mx/es/products/result?keywords=74HC08D', 'https://www.mouser.mx/c/?q=74HC08D', 15, 15),
  ('PS2802-4-A', 'HI-ISO DARLING 4 CH', 1, 'D10', NULL, 'https://octopart.com/search?q=PS2802-4-A', 'https://www.digikey.com.mx/es/products/result?keywords=PS2802-4-A', 'https://www.mouser.mx/c/?q=PS2802-4-A', 15, 15),
  ('TPD2007F', 'COMPUERTA', 4, 'E10', NULL, 'https://octopart.com/search?q=TPD2007F', 'https://www.digikey.com.mx/es/products/result?keywords=TPD2007F', 'https://www.mouser.mx/c/?q=TPD2007F', 90, 360)
ON CONFLICT (codigo_marking, ubicacion) DO NOTHING;

-- ── Datos: ordenes_compra ──
INSERT INTO ssepi_import.ordenes_compra (prioridad, referencia_de_la_orden, proveedor, comprador, fecha_limite_de_la_orden, actividades, total, estado)
VALUES
  ('Normal', 'SP-OCS260324', 'DOMUM, Ariel Diaz', 'Arturo Moreno', '2026-04-02T09:51:17', NULL, 29189.27, 'Orden de compra'),
  ('Normal', 'SP-OC0654', 'EBAY', 'Daniel Zuñiga', '2026-02-09T13:03:24', NULL, 0.0, 'Solicitud de cotización'),
  ('Normal', 'SP-OC26121', 'HT6 INGENIERIA S DE RL DE CV', 'Arturo Moreno', '2026-01-29T12:12:21', NULL, 1414.74, 'Orden de compra')
ON CONFLICT (referencia_de_la_orden) DO NOTHING;

-- ── Datos: ordenes_reparacion ──
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'SP-E0738', '2026-04-02T12:24:43', 'HMI', 'Disponible', 'NHK Spring México, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0737', '2026-04-02T13:55:30', 'TARJETA ELECTRONICA', 'Disponible', 'Industrias Fivax', 'SP-E0737', 'En reparación', NULL),
  ('Normal', 'SP-E0736', '2026-04-02T08:43:59', 'IMPRESORA', 'Disponible', 'Industrias Fivax', 'SP-E0736', 'En reparación', NULL),
  ('Normal', 'SP-E0735', '2026-03-31T16:34:33', 'IMPRESORA', 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0734', '2026-03-31T16:23:12', 'Prueba de viscosidad', 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0733', '2026-03-31T16:20:51', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0732', '2026-03-27T16:16:21', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0731', '2026-03-27T16:10:35', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0730', '2026-03-27T15:59:43', 'HMI', 'Disponible', 'Famo Alimentos, S.A. de C.V.', 'SP-E0730', 'En reparación', NULL),
  ('Normal', 'SP-E0729', '2026-03-27T12:05:27', 'HMI', NULL, 'Famo Alimentos, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'WH/RO/00134', '2026-03-30T10:33:13', NULL, 'Disponible', 'BOLSAS DE LOS ALTOS', 'SP-E0705', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00133', '2026-03-30T10:32:54', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0671', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00132', '2026-03-30T10:32:40', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0686', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00131', '2026-03-30T10:32:27', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0690', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00130', '2026-03-30T10:32:07', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0706', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00129', '2026-03-30T10:31:48', NULL, 'Disponible', 'MARQUARDT', 'SP-E0697', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00128', '2026-03-30T10:30:44', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0714', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00127', '2026-03-30T10:30:10', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0712', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00126', '2026-03-30T10:29:07', NULL, 'Disponible', 'IK Plastic Compound México, S.A. de C.V.', 'SP-E0713', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00125', '2026-03-30T10:28:42', NULL, 'Disponible', 'IK Plastic Compound México, S.A. de C.V.', 'SP-E0719', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00124', '2026-03-30T10:28:12', NULL, 'Disponible', 'BOLSAS DE LOS ALTOS', 'SP-E0720', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00123', '2026-03-30T10:25:11', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0641', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00122', '2026-03-30T10:25:02', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0675', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00121', '2026-03-30T10:24:20', NULL, 'Disponible', 'TORNO', 'SP-E0678', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00120', '2026-03-30T10:23:51', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0672', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00119', '2026-03-30T10:23:30', NULL, 'Disponible', 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'SP-E0683', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00118', '2026-03-30T10:23:11', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0695', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00117', '2026-03-30T10:22:25', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0693', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00116', '2026-03-30T10:21:24', NULL, 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-E0698', 'Confirmado', NULL),
  ('Normal', 'SP-E0728', '2026-03-27T15:32:33', 'IONIZADOR', 'Disponible', 'ARCOSA', 'SP-E0728', 'En reparación', NULL),
  ('Normal', 'SP-E0727', '2026-03-27T10:41:35', 'PLC', NULL, 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'SP-E0727', 'Nuevo', NULL),
  ('Normal', 'SP-E0726', '2026-03-27T08:53:11', 'VARIADOR DE FRECUENCIA', NULL, 'Grupo Zahonero', 'SP-E0726', 'Reparado', NULL),
  ('Normal', 'SP-E0725', '2026-03-26T11:21:57', 'ALINEADOR', 'Disponible', 'ECOBOLSAS', 'SP-E0725', 'En reparación', NULL),
  ('Normal', 'SP-E0724', '2026-03-26T11:14:53', 'CONTROLADOR DE CHILLER', 'Disponible', 'ICEMAN', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0723', '2026-03-26T11:11:55', 'CONTROLADOR DE CHILLER', 'Disponible', 'ICEMAN', 'SP-E0723', 'En reparación', NULL),
  ('Normal', 'SP-E0722', '2026-03-26T07:59:32', 'SENSOR', 'Disponible', 'MARQUARDT', 'SP-E0722', 'En reparación', NULL),
  ('Normal', 'SP-E0721', '2026-03-24T11:41:10', 'VARIADOR DE FRECUENCIA', 'Disponible', 'BOLSAS DE LOS ALTOS', 'SP-E0721', 'En reparación', NULL),
  ('Normal', 'SP-E0720', '2026-03-23T08:37:52', 'SERVODRIVE', NULL, 'BOLSAS DE LOS ALTOS', 'SP-E0720', 'Reparado', NULL),
  ('Normal', 'SP-E0719', '2026-03-19T11:24:54', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', 'SP-E0719', 'Reparado', NULL),
  ('Normal', 'SP-E0718', '2026-03-18T11:31:24', 'CPU INDUSTRIAL', NULL, NULL, NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0717', '2026-03-17T17:01:34', 'TARJETA ELECTRONICA', NULL, 'Famo Alimentos, S.A. de C.V.', 'SP-E0717', 'Reparado', NULL),
  ('Normal', 'SP-E0716', '2026-03-13T13:14:49', 'CARGADOR DE BATERIAS', NULL, 'Soser Soluciones Industriales, S.A. de C.V.', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0715', '2026-03-13T13:13:32', 'TEACH PENDANT', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0714', '2026-03-12T11:16:03', 'ALINEADOR', NULL, 'ECOBOLSAS', 'SP-E0714', 'Reparado', NULL),
  ('Normal', 'SP-E0713', '2026-03-12T10:25:59', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', 'SP-E0713', 'Reparado', NULL),
  ('Normal', 'SP-E0712', '2026-03-11T15:20:06', 'ALINEADOR', NULL, 'ECOBOLSAS', 'SP-E0712', 'Reparado', NULL),
  ('Normal', 'SP-E0711', '2026-03-06T19:14:49', 'SERVODRIVE', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0710', '2026-03-06T19:07:47', 'FUENTE AC/DC', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0709', '2026-03-04T13:40:14', 'SENSOR', NULL, NULL, NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0708', '2026-03-04T13:24:04', 'SENSOR', NULL, NULL, NULL, 'Reparado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'SP-E0707', '2026-03-04T13:22:03', 'FUENTE AC/DC', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0706', '2026-03-04T08:23:04', 'FUENTE AC/DC', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0706', 'Cancelado', NULL),
  ('Normal', 'SP-E0705', '2026-02-28T11:28:20', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', 'SP-E0705', 'Reparado', NULL),
  ('Normal', 'SP-E0704', '2026-02-23T16:10:50', 'Planta de soldar', 'Disponible', 'Soser Soluciones Industriales, S.A. de C.V.', 'SP-E0704', 'En reparación', NULL),
  ('Normal', 'WH/RO/00114', '2026-02-24T15:21:04', NULL, 'Disponible', 'SUCOMO | Suministros y Control en Movimiento', 'SP-E0692', 'Confirmado', NULL),
  ('Normal', 'SP-E0703', '2026-02-24T08:24:39', 'TARJETA ELECTRONICA', 'Disponible', 'Ramiro', 'SP-E0703', 'En reparación', NULL),
  ('Normal', 'SP-E0702', '2026-02-24T08:04:03', 'TARJETA ELECTRONICA', NULL, 'Ramiro', 'SP-E0702', 'Reparado', NULL),
  ('Normal', 'SP-E0701', '2026-02-20T13:46:53', 'PANEL', NULL, 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'SP-E0701', 'Reparado', NULL),
  ('Normal', 'WH/RO/00113', '2026-02-19T11:26:14', NULL, 'Disponible', 'BOLSAS DE LOS ALTOS', 'SP-E0631', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00112', '2026-02-19T11:25:18', NULL, 'Disponible', 'Soser Soluciones Industriales, S.A. de C.V.', 'SP-E0688', 'Confirmado', NULL),
  ('Normal', 'SP-E0700', '2026-02-19T08:51:12', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', 'SP-E0700', 'Reparado', NULL),
  ('Normal', 'SP-E0699', '2026-02-19T08:41:10', 'ARRANCADOR SUAVE', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0698', '2026-02-19T08:34:56', 'ARRANCADOR SUAVE', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-E0698', 'Reparado', NULL),
  ('Normal', 'SP-E0697', '2026-02-19T08:28:44', 'PLC', NULL, 'MARQUARDT', 'SP-E0697', 'Reparado', NULL),
  ('Normal', 'SP-E0696', '2026-02-19T08:26:33', 'SERVODRIVE', 'Disponible', 'ECOBOLSAS', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0695', '2026-02-19T08:23:29', 'ALINEADOR', NULL, 'ECOBOLSAS', 'SP-E0695', 'Reparado', NULL),
  ('Normal', 'WH/RO/00111', '2026-02-18T12:37:07', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0685', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00110', '2026-02-18T12:36:16', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0684', 'Confirmado', NULL),
  ('Normal', 'SP-E0694', '2026-02-17T16:27:03', 'ARRANCADOR SUAVE', NULL, 'BECERRA', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0693', '2026-02-17T16:19:56', 'TARJETA ELECTRONICA', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0693', 'Reparado', NULL),
  ('Normal', 'SP-E0692', '2026-02-17T13:07:28', 'VARIADOR DE FRECUENCIA', NULL, 'SUCOMO | Suministros y Control en Movimiento', 'SP-E0692', 'Reparado', NULL),
  ('Normal', 'SP-E0691', '2026-02-17T12:32:56', 'SERVOMOTOR', 'Disponible', 'SUCOMO | Suministros y Control en Movimiento', 'SP-E0691', 'En reparación', NULL),
  ('Normal', 'SP-E0690', '2026-02-17T12:13:25', 'CHILLER', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0690', 'Reparado', NULL),
  ('Normal', 'SP-E0689', '2026-02-17T12:07:59', 'SERVODRIVE', 'Disponible', 'NHK Spring México, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-E0688', '2026-02-17T08:22:59', 'maquina de plasma', NULL, 'Soser Soluciones Industriales, S.A. de C.V.', 'SP-E0688', 'Reparado', NULL),
  ('Normal', 'SP-E0687', '2026-02-12T13:50:48', 'VARIADOR DE FRECUENCIA', NULL, 'DI-CENTRAL', 'SP-S260214', 'Cancelado', NULL),
  ('Normal', 'SP-E0686', '2026-02-10T14:52:23', 'CHILLER', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0686', 'Reparado', NULL),
  ('Normal', 'SP-E0685', '2026-02-10T13:48:47', 'TEACH PENDANT', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0685', 'Reparado', NULL),
  ('Normal', 'SP-E0684', '2026-02-10T12:25:05', 'TEACH PENDANT', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0684', 'Reparado', NULL),
  ('Normal', 'SP-E0683', '2026-02-09T17:07:57', 'TARJETA ELECTRONICA', NULL, 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'SP-E0683', 'Reparado', NULL),
  ('Normal', 'SP-E0682', '2026-02-09T17:06:48', 'HMI', NULL, 'Fraenkische Industrial Pipes México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0681', '2026-02-09T17:04:52', 'VARIADOR DE FRECUENCIA', NULL, 'Hiruta México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'WH/RO/00108', '2026-02-09T16:45:18', NULL, 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-0638', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00107', '2026-02-09T16:27:24', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-0684', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00106', '2026-02-09T16:21:22', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0610', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00105', '2026-02-09T16:13:35', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0646', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00103', '2026-02-09T15:11:52', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0662', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00102', '2026-02-09T15:11:33', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0661', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00101', '2026-02-09T15:11:05', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0660', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00100', '2026-02-09T15:10:52', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0659', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00099', '2026-02-09T15:05:23', NULL, 'Disponible', 'Nishikawa Sealing Systems Mexico', 'SP-E0651', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00098', '2026-02-09T14:03:05', NULL, 'Disponible', 'BOLSAS DE LOS ALTOS', 'SP-E0669', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00097', '2026-02-09T13:43:23', NULL, 'Disponible', 'TORNO', 'SP-E0665', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00096', '2026-02-09T13:39:34', NULL, 'Disponible', 'Anguiplast, S.A. de C.V.', 'SP-E0653', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00095', '2026-02-09T13:39:22', NULL, 'Disponible', 'Ramiro', 'SP-E0677', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00094', '2026-02-09T13:39:14', NULL, 'Disponible', 'IK PLASTIC', 'SP-E0664', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00093', '2026-02-09T13:39:06', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0670', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00092', '2026-02-09T13:38:53', NULL, 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0676', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00091', '2026-02-09T13:38:44', NULL, 'Disponible', 'IK PLASTIC', 'SP-E0667', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00090', '2026-02-09T13:38:36', NULL, 'Disponible', 'ECOBOLSAS', 'SP-E0654', 'Confirmado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'WH/RO/00089', '2026-02-09T13:38:20', NULL, 'Disponible', 'IK PLASTIC', 'SP-E0680', 'Confirmado', NULL),
  ('Normal', 'WH/RO/00088', '2026-02-09T13:00:00', NULL, 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-E0658', 'Confirmado', NULL),
  ('Normal', 'SP-E0680', '2026-02-05T10:41:42', 'MODULO DE PLC', 'Disponible', 'IK PLASTIC', 'SP-E0680', 'En reparación', NULL),
  ('Normal', 'SP-E0679', '2026-02-03T16:23:53', 'CONTROLADOR DE MOTOR', 'Disponible', 'SADDLEBACK', 'SP-E0679', 'En reparación', NULL),
  ('Normal', 'SP-E0678', '2026-01-29T14:02:15', 'TARJETA ELECTRONICA', NULL, 'TORNO', 'SP-E0678', 'Reparado', NULL),
  ('Normal', 'SP-E0677', '2026-01-27T11:44:46', 'SERVODRIVE', NULL, 'Ramiro', 'SP-E0677', 'Reparado', NULL),
  ('Normal', 'SP-E0676', '2026-01-26T11:33:37', 'CHILLER', NULL, 'NHK', 'SP-E0676', 'Reparado', NULL),
  ('Normal', 'SP-E0675', '2026-01-22T15:57:09', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', 'SP-E0675', 'Reparado', NULL),
  ('Normal', 'SP-E0674', '2026-01-22T14:54:21', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0673', '2026-01-22T13:41:26', 'CHILLER', 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0673', 'En reparación', NULL),
  ('Normal', 'SP-E0672', '2026-01-22T13:39:27', 'CHILLER', 'Disponible', 'NHK Spring México, S.A. de C.V.', 'SP-E0672', 'En reparación', NULL),
  ('Normal', 'SP-E0671', '2026-01-22T12:56:35', 'CHILLER', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0671', 'Reparado', NULL),
  ('Normal', 'SP-E0670', '2026-01-22T12:43:47', 'CHILLER', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0670', 'Reparado', NULL),
  ('Normal', 'SP-E0669', '2026-01-22T12:15:22', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', 'SP-E0669', 'Reparado', NULL),
  ('Normal', 'SP-E0668', '2026-01-22T12:04:17', 'FUENTE AC/DC', NULL, 'CONDUMEX', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0667', '2026-01-22T11:58:58', 'HMI', NULL, 'IK PLASTIC', 'SP-E0667', 'Reparado', NULL),
  ('Normal', 'SP-E0666', '2026-01-22T11:52:55', 'SENSOR', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0665', '2026-01-15T13:31:26', 'VARIADOR DE FRECUENCIA', NULL, 'TORNO', 'SP-E0665', 'Reparado', NULL),
  ('Normal', 'SP-E0664', '2026-01-15T13:28:04', 'VARIADOR DE FRECUENCIA', NULL, 'IK PLASTIC', 'SP-E0664', 'Reparado', NULL),
  ('Normal', 'SP-E0663', '2026-01-15T13:25:43', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Nuevo', NULL),
  ('Normal', 'SP-E0662', '2026-01-14T11:03:39', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0662', 'Reparado', NULL),
  ('Normal', 'SP-E0661', '2026-01-14T11:02:27', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0661', 'Reparado', NULL),
  ('Normal', 'SP-E0660', '2026-01-13T14:00:17', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0660', 'Reparado', NULL),
  ('Normal', 'SP-E0659', '2026-01-13T10:59:17', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0659', 'Reparado', NULL),
  ('Normal', 'SP-E0658', '2026-01-08T11:31:24', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-E0658', 'Reparado', NULL),
  ('Normal', 'SP-E0657', '2026-01-06T16:42:57', 'HMI', NULL, 'DOMUM', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0656', '2026-01-05T12:15:09', 'PANTALLA', NULL, 'ECOBOLSAS', 'SP-E0656', 'Cancelado', NULL),
  ('Normal', 'SP-E0654', '2026-01-05T08:29:19', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', 'SP-E0654', 'Reparado', NULL),
  ('Normal', 'SP-E0655', '2026-01-05T08:31:53', 'TARJETA ELECTRONICA', 'Disponible', 'ECOBOLSAS', 'SP-E0655', 'En reparación', NULL),
  ('Normal', 'SP-E0653', '2026-01-02T08:33:49', 'SENSOR', NULL, 'Anguiplast, S.A. de C.V.', 'SP-E0653', 'Reparado', NULL),
  ('Normal', 'SP-E0652', '2025-12-30T09:47:13', 'VARIADOR DE FRECUENCIA', NULL, 'DOMUM', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0651', '2025-12-26T08:34:29', 'Bascula', NULL, 'Nishikawa Sealing Systems Mexico', 'SP-E0651', 'Reparado', NULL),
  ('Normal', 'SP-E0650', '2025-12-19T14:01:47', 'HMI', NULL, 'DOMUM', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0649', '2025-12-15T15:15:00', 'LIMPIADORA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0648', '2025-12-15T15:12:59', 'ASPIRADORA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0647', '2025-12-15T13:37:28', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0646', '2025-12-15T13:27:00', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0646', 'Reparado', NULL),
  ('Normal', 'SP-E0645', '2025-12-12T08:57:54', 'VARIADOR DE FRECUENCIA', NULL, 'DOMUM', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0644', '2025-12-10T15:14:06', 'TESTER DE RESISTIBIDAD', NULL, 'FAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-E0643', '2025-12-10T09:09:28', 'CHILLER', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0642', '2025-12-08T16:47:32', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0641', '2025-12-05T13:40:52', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', 'SP-E0641', 'Reparado', NULL),
  ('Normal', 'SP-E0640', '2025-11-28T15:58:13', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0639', '2025-11-28T15:44:21', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0638', '2025-11-28T13:40:29', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', 'SP-0638', 'Reparado', NULL),
  ('Normal', 'SP-E0637', '2025-11-28T12:03:20', 'VARIADOR DE FRECUENCIA', 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0636', '2025-11-25T10:48:35', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0635', '2025-11-25T10:41:34', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0634', '2025-11-21T08:19:19', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0633', '2025-11-18T11:20:50', 'BARRA ANTI ESTATICA', NULL, 'Anguiplast, S.A. de C.V.', NULL, 'Cancelado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'SP-0632', '2025-11-14T16:59:55', 'BARRA ANTI ESTATICA', NULL, 'Anguiplast, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0631', '2025-11-14T16:20:15', 'CARGADOR DE BATERIAS', NULL, 'BOLSAS DE LOS ALTOS', 'SP-E0631', 'Reparado', NULL),
  ('Normal', 'SP-0630', '2025-11-14T16:09:12', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0629', '2025-11-14T16:03:52', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0628', '2025-11-14T16:00:54', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0627', '2025-11-13T13:18:36', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0626', '2025-11-13T09:39:11', 'HMI', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0625', '2025-11-12T11:29:08', 'VARIADOR DE FRECUENCIA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0624', '2025-11-10T12:38:28', 'PLC', NULL, 'Envases Plásticos del Centro, S.A. de C.V., Maurico Santiago', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0623', '2025-11-03T09:40:47', 'Servicio de reparación de SERVODRIVE', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0622', '2025-10-28T17:05:37', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0621', '2025-10-28T15:59:38', 'PLC', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0620', '2025-10-28T15:29:38', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0619', '2025-10-28T14:09:00', 'Servicio de reparación de SERVODRIVE', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0618', '2025-10-28T09:12:17', 'Flejadoras', NULL, 'COFICAB', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0617', '2025-10-27T17:11:48', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-E0616', '2025-10-27T16:55:34', 'VARIADOR DE FRECUENCIA', 'Disponible', 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0615', '2025-10-27T15:39:11', 'VARIADOR DE FRECUENCIA', NULL, 'BODYCOTE', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0613', '2025-10-23T11:26:11', 'ETIQUETADORA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0612', '2025-10-23T11:26:45', 'TARJETA ELECTRONICA', NULL, 'HALL ALUMINIUM', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0611', '2025-10-21T14:08:06', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0610', '2025-10-21T14:03:31', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-E0610', 'Reparado', NULL),
  ('Normal', 'SP-0609', '2025-10-21T13:26:44', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0608', '2025-10-21T13:25:18', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0607', '2025-10-21T13:19:42', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0606', '2025-10-21T13:05:51', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0605', '2025-10-20T16:34:14', 'ALINEADOR', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0604', '2025-10-20T09:52:59', 'Flejadoras', NULL, 'COFICAB', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0603', '2025-10-20T09:04:05', 'TARJETA ELECTRONICA', NULL, 'RONGTAI', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0602', '2025-10-20T08:56:12', 'TARJETA ELECTRONICA', NULL, 'RONGTAI', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0601', '2025-10-17T11:27:15', 'CONTROLADOR DE ROBOT', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0600', '2025-10-17T11:22:57', 'CONTROLADOR DE ROBOT', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0599', '2025-10-17T11:10:14', 'CONTROLADOR DE ROBOT', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0598', '2025-10-15T17:01:50', 'Flejadoras', NULL, 'COFICAB', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0597', '2025-10-15T16:59:12', 'Flejadoras', NULL, 'COFICAB', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0596', '2025-10-13T13:40:18', 'Servicio de reparación de SERVODRIVE', NULL, 'TACSA', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0595', '2025-10-10T09:03:19', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0594', '2025-10-09T14:34:41', 'HMI', NULL, 'BADER', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0593', '2025-10-08T15:59:45', 'TABLERO DE CONTROL ELECTRICO', NULL, 'Hebillas y Herrajes Robor S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0592', '2025-10-01T16:52:24', 'TIMER', NULL, 'Hebillas y Herrajes Robor S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0591', '2025-10-01T16:47:56', 'PLC', NULL, 'Hebillas y Herrajes Robor S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0590', '2025-10-01T16:24:02', 'VARIADOR DE FRECUENCIA', NULL, 'DOMUM', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0589', '2025-09-25T16:10:29', 'TINA ULTRASONICA', NULL, 'BODYCOTE', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0588', '2025-09-25T16:07:16', 'PLC', NULL, 'MR LUCKY', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0586', '2025-09-22T16:49:10', 'FUENTE AC/DC', NULL, 'MR LUCKY', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0585', '2025-09-20T10:07:36', 'HMI', NULL, 'Pieles Azteca, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0583', '2025-09-19T09:13:00', 'CHILLER', 'Disponible', 'NHK Spring México, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0584', '2025-09-15T08:03:56', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', 'SP-0684', 'Reparado', NULL),
  ('Normal', 'SP-0582', '2025-09-11T12:39:55', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0581', '2025-09-09T15:33:08', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Reparado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'SP-0580', '2025-09-09T15:16:30', 'HMI', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0579', '2025-09-08T09:20:04', 'TRATAMIENTO CORONA', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0578', '2025-09-06T10:45:22', 'CHILLER', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0577', '2025-09-04T16:50:32', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0576', '2025-09-04T16:48:52', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0575', '2025-08-30T13:42:27', 'UPS', NULL, 'MARQUARDT', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0574', '2025-08-30T13:36:22', 'ARRANCADOR SUAVE', NULL, 'DOMUM', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0573', '2025-08-26T14:03:03', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0572', '2025-08-26T14:00:29', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0571', '2025-08-26T13:51:31', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0570', '2025-08-26T13:44:09', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0569', '2025-08-22T14:46:04', 'CONTROLADOR DE MOTOR', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0568', '2025-08-22T14:45:04', 'CONTROLADOR DE MOTOR', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0567', '2025-08-22T14:03:37', 'CONTROLADOR DE MOTOR', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0565', '2025-08-21T09:40:09', 'Servicio de reparación de SERVODRIVE', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0564', '2025-08-21T09:38:58', 'CONTROL REMOTO', 'Disponible', 'NHK Spring México, S.A. de C.V.', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0563', '2025-08-21T09:32:40', 'VARIADOR DE FRECUENCIA', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0562', '2025-08-21T09:29:04', NULL, NULL, 'ICEMAN', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0561', '2025-08-20T14:02:15', 'ENCODER', NULL, 'MARQUARDT', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0560', '2025-08-19T11:52:40', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0558', '2025-08-19T11:27:10', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0557', '2025-08-19T11:25:23', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0559', '2025-08-19T11:18:23', 'FUENTE AC/DC', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0556', '2025-08-19T11:13:29', 'ALINEADOR', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0555', '2025-08-19T11:12:13', 'ALINEADOR', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0554', '2025-08-19T11:01:12', 'ALINEADOR', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0553', '2025-08-14T13:11:02', 'FUENTE AC/DC', 'Disponible', 'Nishikawa Sealing Systems Mexico', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0552', '2025-08-12T17:31:40', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0551', '2025-08-12T17:29:12', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0550', '2025-08-12T17:27:47', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0549', '2025-08-12T17:23:26', 'TARJETA ELECTRONICA', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0548', '2025-08-12T17:21:27', 'HMI', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0547', '2025-08-12T16:48:05', 'HMI', NULL, 'IK Plastic Compound México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0546', '2025-08-12T15:38:43', 'HMI', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0545', '2025-08-12T13:27:31', 'VARIADOR DE FRECUENCIA', NULL, 'MARQUARDT', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0544', '2025-08-01T17:02:53', 'SERVODRIVE', NULL, 'BOLSAS DE LOS ALTOS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0543', '2025-08-01T16:45:44', 'VARIADOR DE FRECUENCIA', 'Disponible', 'EPC 2', NULL, 'En reparación', NULL),
  ('Normal', 'SP-0539', '2025-08-01T16:20:51', 'Servicio de reparación de SERVODRIVE', NULL, 'TACSA', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0538', '2025-07-31T15:43:58', 'HMI', NULL, 'ECSA', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0537', '2025-07-30T11:38:20', 'FUENTE AC/DC', NULL, 'HIRUTA', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0513', '2025-07-30T10:48:59', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0536', '2025-07-29T15:54:22', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0535', '2025-07-29T15:25:59', 'TARJETA ELECTRONICA', NULL, 'NHK Spring México, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0534', '2025-07-29T14:21:18', 'Bascula', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0533', '2025-07-28T21:38:32', 'CONTROL DE CORTINA', NULL, 'MARQUARDT', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0532', '2025-07-28T21:33:52', 'CONTROLADOR DE FLAMA', NULL, 'Nishikawa Sealing Systems Mexico', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0531', '2025-07-28T21:30:22', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Cancelado', NULL),
  ('Normal', 'SP-0530', '2025-07-28T21:27:00', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0529', '2025-07-28T21:20:07', 'TARJETA ELECTRONICA', NULL, 'ECOBOLSAS', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0528', '2025-07-28T21:18:14', 'HMI', NULL, 'RONGTAI', NULL, 'Cancelado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;
INSERT INTO ssepi_import.ordenes_reparacion (prioridad, referencia_de_reparacion, fecha_programada, producto_a_reparar, estado_del_componente, cliente, orden_de_venta, estado, decoracion_de_la_actividad_de_excepcion)
VALUES
  ('Normal', 'SP-0526', '2025-07-28T21:07:29', 'FUENTE AC/DC', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0525', '2025-07-28T21:03:33', 'VARIADOR DE FRECUENCIA', NULL, 'Envases Plásticos del Centro, S.A. de C.V.', NULL, 'Reparado', NULL),
  ('Normal', 'SP-0524', '2025-07-25T11:58:52', 'Servicio de reparación de SERVODRIVE', NULL, 'RONGTAI', NULL, 'Reparado', NULL)
ON CONFLICT (referencia_de_reparacion) DO NOTHING;

-- ── Datos: ordenes_venta ──
INSERT INTO ssepi_import.ordenes_venta (referencia_de_la_orden, fecha_de_creacion, cliente, vendedor, actividades, total, estado)
VALUES
  ('Reparacion electrónica (72)', NULL, NULL, NULL, NULL, 1103467.68, NULL),
  ('SP-E0584', '2026-04-06T16:07:22', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 11484.0, 'Cotización'),
  ('SP-E0730', '2026-04-02T15:40:13', 'Famo Alimentos, S.A. de C.V.', 'Daniel Zuñiga', NULL, 4043.76, 'Cotización'),
  ('SP-E0737', '2026-04-02T14:50:05', 'Industrias Fivax', 'Arturo Moreno', NULL, 7388.84, 'Cotización'),
  ('SP-E0736', '2026-04-02T14:33:13', 'Industrias Fivax', 'Arturo Moreno', NULL, 8866.24, 'Cotización'),
  ('SP-E0726', '2026-04-02T11:50:23', 'Grupo Zahonero', 'Daniel Zuñiga', NULL, 8734.96, 'Cotización'),
  ('SP-E0725', '2026-03-31T13:19:24', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 6380.0, 'Cotización'),
  ('SP-E0723', '2026-03-31T12:55:51', 'ICEMAN', 'Javier Cruz', NULL, 5189.84, 'Cotización'),
  ('SP-E0722', '2026-03-31T12:34:36', 'MARQUARDT', 'Daniel Zuñiga', NULL, 7053.96, 'Cotización'),
  ('SP-E0728', '2026-03-30T11:50:27', 'ARCOSA', 'Daniel Zuñiga', NULL, 7739.52, 'Cotización'),
  ('SP-E0721', '2026-03-30T10:37:17', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 11374.21, 'Cotización'),
  ('SP-E0705', '2026-03-03T11:58:16', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 5612.08, 'Orden de venta'),
  ('SP-E0671', '2026-02-06T11:49:56', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 27691.52, 'Orden de venta'),
  ('SP-E0686', '2026-03-04T12:04:56', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 29667.0, 'Orden de venta'),
  ('SP-E0690', '2026-02-23T12:17:10', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 27691.52, 'Orden de venta'),
  ('SP-E0706', '2026-03-06T13:12:15', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 9256.8, 'Orden de venta'),
  ('SP-E0697', '2026-03-09T16:19:23', 'MARQUARDT', 'Daniel Zuñiga', NULL, 5672.4, 'Orden de venta'),
  ('SP-E0714', '2026-03-13T09:29:15', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 6380.0, 'Orden de venta'),
  ('SP-E0712', '2026-03-13T11:16:47', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 6380.0, 'Orden de venta'),
  ('SP-E0713', '2026-03-13T12:28:50', 'IK Plastic Compound México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 11676.56, 'Orden de venta'),
  ('SP-E0719', '2026-03-23T09:37:26', 'IK Plastic Compound México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 8868.2, 'Orden de venta'),
  ('SP-E0720', '2026-03-24T11:20:50', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 9222.0, 'Orden de venta'),
  ('SP-E0641', '2026-03-27T07:39:37', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 9556.79, 'Orden de venta'),
  ('SP-E0675', '2026-03-27T07:55:54', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 9556.79, 'Orden de venta'),
  ('SP-E0678', '2026-02-05T12:25:24', 'TORNO', 'Daniel Zuñiga', NULL, 6674.84, 'Orden de venta'),
  ('SP-E0672', '2026-01-28T12:49:03', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 33522.84, 'Orden de venta'),
  ('SP-E0683', '2026-02-11T14:32:27', 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 5610.91, 'Orden de venta'),
  ('SP-E0695', '2026-02-20T15:51:52', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 6381.16, 'Orden de venta'),
  ('SP-E0693', '2026-02-20T16:59:10', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 4420.76, 'Orden de venta'),
  ('SP-E0698', '2026-02-27T22:09:47', 'Envases Plásticos del Centro, S.A. de C.V.', 'Daniel Zuñiga', NULL, 10391.28, 'Orden de venta'),
  ('SP-E0727', '2026-03-27T10:46:30', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Arturo Moreno', NULL, 3480.0, 'Cotización'),
  ('SP-E0708, 709', '2026-03-25T08:48:55', 'Granos y Servicios Integrales, S.A. de C.V., Ing. Uriel Padilla', 'Eduardo Amezcua', NULL, 7424.0, 'Cotización'),
  ('SP-E0717', '2026-03-23T17:05:35', 'Famo Alimentos, S.A. de C.V.', 'Eduardo Amezcua', NULL, 5023.96, 'Cotización'),
  ('SP-E0704', '2026-03-13T09:55:48', 'Soser Soluciones Industriales, S.A. de C.V.', 'Daniel Zuñiga', NULL, 7455.32, 'Cotización'),
  ('SP-260312', '2026-03-12T08:58:11', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 9860.0, 'Cancelado'),
  ('SP-E0691', '2026-03-10T12:26:29', 'SUCOMO | Suministros y Control en Movimiento', 'Daniel Zuñiga', NULL, 3531.0, 'Cotización'),
  ('SP-E0703', '2026-03-10T09:18:35', 'Ramiro', 'Daniel Zuñiga', NULL, 8835.72, 'Cotización'),
  ('SP-E0702', '2026-03-09T16:55:08', 'Ramiro', 'Daniel Zuñiga', NULL, 5191.0, 'Cotización'),
  ('SP-E0700', '2026-02-27T16:15:22', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 10739.28, 'Cancelado'),
  ('SP-E0698', '2026-02-26T09:58:14', 'Envases Plásticos del Centro, S.A. de C.V.', 'Javier Cruz', NULL, 0.0, 'Cancelado'),
  ('SP-E0692', '2026-02-20T16:14:08', 'SUCOMO | Suministros y Control en Movimiento', 'Daniel Zuñiga', NULL, 5220.0, 'Orden de venta'),
  ('SP-E0701', '2026-02-20T16:40:22', 'Fraenkische Industrial Pipes México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 4499.64, 'Cancelado'),
  ('SP-SDZ003-85', '2026-02-10T09:18:16', 'RONGTAI, Joatam álvarez', 'Daniel Zuñiga', NULL, 31088.0, 'Orden de venta'),
  ('SP-E0631', '2026-02-11T15:31:39', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 17790.92, 'Orden de venta'),
  ('SP-E0688', '2026-02-18T10:54:16', 'Soser Soluciones Industriales, S.A. de C.V.', 'Daniel Zuñiga', NULL, 3940.52, 'Orden de venta'),
  ('SP-E0685', '2026-02-10T14:21:18', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 13606.07, 'Orden de venta'),
  ('SP-E0684', '2026-02-10T13:36:11', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 21229.77, 'Orden de venta'),
  ('SP-S260216-1', '2026-02-16T16:22:14', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 135316.32, 'Cancelado'),
  ('SP-S260216', '2026-02-16T09:28:12', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 184426.08, 'Cancelado'),
  ('SP-0638', '2026-02-09T16:43:49', 'Envases Plásticos del Centro, S.A. de C.V.', 'Daniel Zuñiga', NULL, 1.16, 'Orden de venta')
ON CONFLICT (referencia_de_la_orden) DO NOTHING;
INSERT INTO ssepi_import.ordenes_venta (referencia_de_la_orden, fecha_de_creacion, cliente, vendedor, actividades, total, estado)
VALUES
  ('SP-0684', '2026-02-09T16:22:31', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 12101.12, 'Orden de venta'),
  ('SP-E0610', '2026-02-09T16:17:06', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 4060.0, 'Orden de venta'),
  ('SP-E0646', '2026-02-09T16:03:50', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 13450.2, 'Orden de venta'),
  ('SP-E0662', '2026-01-29T12:07:34', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 7888.0, 'Orden de venta'),
  ('SP-E0661', '2026-01-29T12:05:07', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 7888.0, 'Orden de venta'),
  ('SP-E0660', '2026-01-29T12:02:25', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 7888.0, 'Orden de venta'),
  ('SP-E0659', '2026-01-29T11:56:58', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 31552.0, 'Orden de venta'),
  ('SP-E0651', '2026-01-29T11:29:50', 'Nishikawa Sealing Systems Mexico', 'Daniel Zuñiga', NULL, 8016.76, 'Orden de venta'),
  ('SP-E0669', '2026-01-30T11:12:13', 'BOLSAS DE LOS ALTOS', 'Daniel Zuñiga', NULL, 13375.96, 'Orden de venta'),
  ('SP-E0665', '2026-01-29T12:24:09', 'TORNO', 'Daniel Zuñiga', NULL, 13920.0, 'Orden de venta'),
  ('SP-E0658', '2026-01-29T11:06:17', 'Envases Plásticos del Centro, S.A. de C.V.', 'Daniel Zuñiga', NULL, 29221.56, 'Orden de venta'),
  ('SP-E0653', '2026-01-29T08:57:41', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 6957.83, 'Orden de venta'),
  ('SP-E0677', '2026-01-28T13:41:52', 'Ramiro', 'Daniel Zuñiga', NULL, 4311.72, 'Orden de venta'),
  ('SP-E0664', '2026-01-28T14:03:55', 'IK PLASTIC', 'Daniel Zuñiga', NULL, 6331.28, 'Orden de venta'),
  ('SP-E0670', '2026-01-28T13:00:35', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 28505.84, 'Orden de venta'),
  ('SP-E0676', '2026-01-28T12:35:33', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 28505.84, 'Orden de venta'),
  ('SP-E0667', '2026-01-28T10:56:37', 'IK PLASTIC', 'Daniel Zuñiga', NULL, 11736.42, 'Orden de venta'),
  ('SP-E0654', '2026-01-29T09:46:15', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 15061.44, 'Orden de venta'),
  ('SP-E0680', '2026-02-05T11:45:14', 'IK PLASTIC', 'Daniel Zuñiga', NULL, 5021.64, 'Orden de venta'),
  ('SP-E0679', '2026-02-05T09:50:40', 'SADDLEBACK', 'Daniel Zuñiga', NULL, 9393.41, 'Cotización'),
  ('SP-E0656', '2026-01-29T10:39:04', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 8203.52, 'Cancelado'),
  ('SP-E0655', '2026-01-29T09:38:26', 'ECOBOLSAS', 'Daniel Zuñiga', NULL, 3877.88, 'Cancelado'),
  ('SP-E0673', '2026-01-28T13:14:11', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 35051.72, 'Cotización'),
  ('Proyectos de Automatización (20)', NULL, NULL, NULL, NULL, 1115818.96, NULL),
  ('SP-A26137', '2026-04-07T16:20:53', 'Grupo Zahonero', 'Arturo Moreno', NULL, 19245.21, 'Cotización'),
  ('SP-A26135', '2026-04-07T10:55:07', 'Polímeros y Derivados, S.A. de C.V.', 'Daniel Zuñiga', NULL, 243600.0, 'Cotización'),
  ('SP-A26134', '2026-04-01T15:06:26', 'Nishikawa Sealing Systems Mexico', 'Arturo Moreno', NULL, 172052.82, 'Cotización'),
  ('SP-A26133', '2026-03-27T12:25:47', 'Pieles Azteca, S.A. de C.V.', 'Arturo Moreno', NULL, 1276.0, 'Cotización'),
  ('SP-A26123-1', '2026-02-25T13:40:38', 'Tenería Vargas, S.A. de C.V.', 'Daniel Zuñiga', NULL, 38827.11, 'Cotización'),
  ('SP-A26123', '2026-02-25T13:00:06', 'Tenería Vargas, S.A. de C.V.', 'Arturo Moreno', NULL, 41052.72, 'Cotización'),
  ('SP-A26132', '2026-03-24T16:08:08', 'Seroc Corrugados, S.A. de C.V.', 'Arturo Moreno', NULL, 8352.0, 'Cotización'),
  ('SP-A26126-1', '2026-03-23T12:49:50', 'TORNO', 'Daniel Zuñiga', NULL, 7018.0, 'Cotización'),
  ('SP-A26126', '2026-03-23T12:31:53', 'TORNO', 'Daniel Zuñiga', NULL, 8874.0, 'Cotización'),
  ('SP-A26131', '2026-03-20T08:05:54', 'Mantenimiento Alquin', 'Daniel Zuñiga', NULL, 44486.0, 'Cotización'),
  ('SP-A26125', '2026-03-03T20:59:29', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 6380.0, 'Orden de venta'),
  ('SP-A26136', '2026-03-06T09:14:54', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 12186.5, 'Orden de venta'),
  ('SP-A26130', '2026-03-19T18:51:27', 'DI-CENTRAL', 'Arturo Moreno', NULL, 5266.4, 'Orden de venta'),
  ('SP-A26129', '2026-03-18T13:20:22', 'Prefabricadora de Losas, S.A. de C.V.', 'Eduardo Amezcua', NULL, 21247.72, 'Cotización'),
  ('SP-A26120', '2026-03-12T12:31:59', 'NHK', 'Daniel Zuñiga', NULL, 142990.9, 'Cotización'),
  ('SP-A26128', '2026-03-10T15:49:40', 'Prefabricadora de Losas, S.A. de C.V.', 'Eduardo Amezcua', NULL, 25076.95, 'Cotización'),
  ('SP-A26127', '2026-03-09T10:36:53', 'Prefabricadora de Losas, S.A. de C.V.', 'Eduardo Amezcua', NULL, 248211.86, 'Cotización'),
  ('SP-A260309', '2026-03-09T16:16:36', 'Soser Soluciones Industriales, S.A. de C.V.', 'Daniel Zuñiga', NULL, 10880.8, 'Cotización'),
  ('SP-A26124', '2026-02-26T15:12:37', 'SUCOMO | Suministros y Control en Movimiento', 'Daniel Zuñiga', NULL, 39579.2, 'Cotización'),
  ('SP-A26122', '2026-01-27T16:44:11', 'SADDLEBACK, Genaro Morales', 'Arturo Moreno', NULL, 19214.77, 'Cotización'),
  ('Suminstro de matrial (30)', NULL, NULL, NULL, NULL, 2252488.39, NULL),
  ('SP-S260324', '2026-03-24T15:24:59', 'Famo Alimentos, S.A. de C.V.', 'Eduardo Amezcua', NULL, 42438.02, 'Orden de venta'),
  ('SP-S260330', '2026-03-30T15:33:35', 'Productos Industriales de León, S.A. de C.V.', 'Eduardo Amezcua', NULL, 2437.16, 'Cotización'),
  ('SP-S260323', '2026-03-23T09:13:24', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 45017.51, 'Cotización'),
  ('SP-S260326', '2026-03-26T14:16:44', 'Grupo Zahonero', 'Eduardo Amezcua', NULL, 190647.51, 'Cotización'),
  ('SP-S260306-1', '2026-03-23T11:28:02', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 57417.08, 'Cotización')
ON CONFLICT (referencia_de_la_orden) DO NOTHING;
INSERT INTO ssepi_import.ordenes_venta (referencia_de_la_orden, fecha_de_creacion, cliente, vendedor, actividades, total, estado)
VALUES
  ('SP-S260320', '2026-03-20T14:07:23', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 109649.0, 'Cotización'),
  ('SP-S260319-1', '2026-03-19T18:42:12', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 12411.28, 'Cotización'),
  ('SP-S260319', '2026-03-19T16:00:26', 'Prefabricadora de Losas, S.A. de C.V.', 'Eduardo Amezcua', NULL, 182894.07, 'Cancelado'),
  ('SP-S260311', '2026-03-11T08:30:45', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 3596.0, 'Cotización'),
  ('SP-S260310', '2026-03-10T15:32:24', 'Prefabricadora de Losas, S.A. de C.V.', 'Eduardo Amezcua', NULL, 9630.32, 'Cancelado'),
  ('SP-S260306-1', '2026-03-06T15:59:16', 'Productos Industriales de León, S.A. de C.V.', 'Eduardo Amezcua', NULL, 378.16, 'Cotización'),
  ('SP-S260306', '2026-03-06T11:01:31', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 71982.3, 'Cotización'),
  ('SP-S260303', '2026-03-03T08:03:45', 'Hielo Regia', 'Eduardo Amezcua', NULL, 19511.2, 'Cotización'),
  ('SP-S260227', '2026-02-27T15:54:55', 'Demo Technic, S. de R.L. de C.V. Planta León', 'Daniel Zuñiga', NULL, 12433.82, 'Cancelado'),
  ('SP-S260224-2', '2026-02-24T14:51:53', 'NHK', 'Daniel Zuñiga', NULL, 33049.98, 'Cancelado'),
  ('SP-S262402-1', '2026-02-24T14:49:51', 'NHK', 'Daniel Zuñiga', NULL, 2996.11, 'Cancelado'),
  ('SP-S260220-2', '2026-02-24T13:03:35', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 246814.23, 'Cotización'),
  ('SP-S262402', '2026-02-24T11:08:04', 'COFICAB', 'Daniel Zuñiga', NULL, 59865.05, 'Cancelado'),
  ('SP-S260220-1', '2026-02-24T08:32:45', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 187100.72, 'Cotización'),
  ('SP-S260220', '2026-02-20T11:09:11', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 364800.36, 'Cotización'),
  ('SP-S260214', '2026-02-14T11:41:34', 'DI-CENTRAL', 'Eduardo Amezcua', NULL, 82121.04, 'Cancelado'),
  ('SP-S260213', '2026-02-13T09:31:17', 'Centro de Investigación en Cómputo Aplicado, S.A. de C.V.', 'Daniel Zuñiga', NULL, 173136.96, 'Cotización'),
  ('SP-S20260210', '2026-02-10T09:21:46', 'Hormas Palacios, S.A. de C.V.', 'Eduardo Amezcua', NULL, 51040.0, 'Cotización'),
  ('SP-S260204', '2026-02-04T12:52:01', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 21123.83, 'Cancelado'),
  ('SP-S260129-1', '2026-01-29T15:56:13', 'Demo Technic Leon', 'Daniel Zuñiga', NULL, 13618.4, 'Cancelado'),
  ('SP-S260129', '2026-01-29T08:52:07', 'Ramiro', 'Daniel Zuñiga', NULL, 14464.39, 'Cotización'),
  ('SP-S260128-1', '2026-01-28T10:47:55', 'Jorge Villanueva', 'Daniel Zuñiga', NULL, 80997.0, 'Cancelado'),
  ('SP-S260128', '2026-01-28T09:34:42', 'MR LUCKY', 'Daniel Zuñiga', NULL, 11452.99, 'Cancelado'),
  ('SP-S260126-1', '2026-01-27T11:19:20', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 74227.3, 'Cotización'),
  ('SP-S260126', '2026-01-26T13:36:16', 'NHK Spring México, S.A. de C.V.', 'Daniel Zuñiga', NULL, 75236.6, 'Cotización'),
  ('REPARACION DE MOTORES (29)', NULL, NULL, NULL, NULL, 423123.92, NULL),
  ('SP-MDZ003-92', '2026-04-07T16:29:26', 'RONGTAI, Joatam álvarez', 'Daniel Zuñiga', NULL, 10266.0, 'Cotización'),
  ('SP-MDZ004-44', '2026-04-07T09:24:53', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 9233.6, 'Cotización'),
  ('SP-MDZ003-87,88,89,90,91', '2026-03-04T08:39:44', 'RONGTAI, Joatam álvarez', 'Daniel Zuñiga', NULL, 35960.0, 'Orden de venta'),
  ('SP-MDZ011-01', '2026-03-11T08:48:59', 'IK Plastic Compound México, S.A. de C.V., Ing. Eduardo Torres', 'Daniel Zuñiga', NULL, 9268.4, 'Orden de venta'),
  ('SP-MDZ004-37', '2026-03-11T09:15:58', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 7812.6, 'Orden de venta'),
  ('SP-MDZ004-36', '2026-03-11T08:58:19', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 10045.6, 'Orden de venta'),
  ('SP-MDZ027-3', '2026-03-19T11:24:36', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 6818.48, 'Orden de venta'),
  ('SP-MDZ027-4', '2026-03-19T11:36:19', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 7385.72, 'Orden de venta'),
  ('SP-MDZ027-5', '2026-03-19T11:45:18', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 10450.44, 'Orden de venta'),
  ('SP-MDZ027-6', '2026-03-19T11:59:32', 'Anguiplast, S.A. de C.V.', 'Daniel Zuñiga', NULL, 5599.32, 'Orden de venta'),
  ('SP-MDZ004-41', '2026-03-23T11:32:11', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 6380.0, 'Orden de venta'),
  ('SP-MDZ004-42', '2026-03-23T12:01:59', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 7992.4, 'Orden de venta'),
  ('SP-MDZ003-86', '2026-02-12T08:55:20', 'RONGTAI', 'Daniel Zuñiga', NULL, 63800.0, 'Orden de venta'),
  ('SP-MDZ004-30', '2026-02-19T16:07:29', 'Nishikawa Sealing Systems Mexico, Diego García', 'Daniel Zuñiga', NULL, 12528.0, 'Orden de venta'),
  ('SP-SDZ004-32', '2026-02-27T09:36:04', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 8874.0, 'Orden de venta'),
  ('SP-MDZ04-33', '2026-02-27T10:38:53', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 5332.52, 'Orden de venta'),
  ('SP-MDZ004-35', '2026-02-27T11:00:53', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 6168.88, 'Orden de venta'),
  ('SP-MEQ32-01', '2026-03-27T11:18:11', 'EMMSA', 'Eduardo Amezcua', NULL, 15892.0, 'Cotización'),
  ('SP-MEQ031-01', '2026-03-25T16:40:37', 'Grupo Zahonero', 'Eduardo Amezcua', NULL, 25752.0, 'Cotización'),
  ('SP-MDZ004-43,44,45', '2026-03-23T13:05:51', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 24012.0, 'Cotización'),
  ('SP-SDZ004-40', '2026-03-12T09:19:00', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 62542.56, 'Cotización'),
  ('SP-MDZ004-39', '2026-03-11T09:43:55', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 6768.6, 'Cotización'),
  ('SP-MDZ004-38', '2026-03-11T09:32:35', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 10266.0, 'Cotización'),
  ('SP-MDZ004-34', '2026-02-27T10:50:50', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 5332.52, 'Cancelado')
ON CONFLICT (referencia_de_la_orden) DO NOTHING;
INSERT INTO ssepi_import.ordenes_venta (referencia_de_la_orden, fecha_de_creacion, cliente, vendedor, actividades, total, estado)
VALUES
  ('SP-MDZ04-31', '2026-02-27T09:15:40', 'Nishikawa Sealing Systems Mexico, Diego García', 'Daniel Zuñiga', NULL, 9261.44, 'Orden de venta'),
  ('SP-MDZ004-23', '2026-02-18T12:09:50', 'Nishikawa Sealing Systems Mexico, Victor Garnica', 'Daniel Zuñiga', NULL, 19539.04, 'Orden de venta'),
  ('SP-MEQ028-01', '2026-02-09T09:43:06', 'Granos y Servicios Integrales, S.A. de C.V.', 'Eduardo Amezcua', NULL, 6293.0, 'Orden de venta'),
  ('SP-MEQ028-02', '2026-02-09T10:43:58', 'Granos y Servicios Integrales, S.A. de C.V.', NULL, NULL, 0.0, 'Orden de venta'),
  ('SP-MDZ008-10', '2026-02-12T09:25:01', 'COFICAB', 'Daniel Zuñiga', NULL, 13548.8, 'Orden de venta')
ON CONFLICT (referencia_de_la_orden) DO NOTHING;


-- FIN: verificación de conteo
SELECT 'bom_materiales', COUNT(*) FROM ssepi_import.bom_materiales
UNION ALL SELECT 'contactos', COUNT(*) FROM ssepi_import.contactos
UNION ALL SELECT 'inventario_automatizacion', COUNT(*) FROM ssepi_import.inventario_automatizacion
UNION ALL SELECT 'inventario_electronica', COUNT(*) FROM ssepi_import.inventario_electronica
UNION ALL SELECT 'ordenes_compra', COUNT(*) FROM ssepi_import.ordenes_compra
UNION ALL SELECT 'ordenes_reparacion', COUNT(*) FROM ssepi_import.ordenes_reparacion
UNION ALL SELECT 'ordenes_venta', COUNT(*) FROM ssepi_import.ordenes_venta;
COMMIT;
