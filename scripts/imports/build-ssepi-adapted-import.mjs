/**
 * SCRIPT: build-ssepi-adapted-import.mjs
 * PROPÓSITO: Generar SQL de import idempotente para SSEPI
 * EJECUCIÓN: node build-ssepi-adapted-import.mjs
 */

import fs from 'fs';

const src = './ssepi_supabase.sql';
const out = './ssepi_supabase_adapted.sql';

if (!fs.existsSync(src)) {
  console.error('❌ No se encontró:', src);
  process.exit(1);
}

let s = fs.readFileSync(src, 'utf8');

const head = `-- ADAPTADO SSEPI: Import idempotente en schema ssepi_import
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor o psql -f ssepi_supabase_adapted.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS ssepi_import;
SET LOCAL search_path TO ssepi_import, public;

`;

// Índices únicos (nombre SIN schema, tabla CON schema)
const uniqueIndexes = `
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

`;

// Dedupe (conservar ID más bajo)
const dedupeProcess = `
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

`;

// ============================================================================
// REEMPLAZAR ON CONFLICT GENÉRICO POR ESPECÍFICO (tabla por tabla)
// ============================================================================
// El archivo fuente tiene "ON CONFLICT DO NOTHING;" sin columna específica.
// Lo reemplazamos línea por línea según la tabla del INSERT anterior.
// ============================================================================

const lines = s.split('\n');
const result = [];
let currentTable = null;

const conflictMap = {
  'bom_materiales': 'ON CONFLICT (numero_de_parte) DO NOTHING;',
  'contactos': 'ON CONFLICT (correo_electronico) DO NOTHING;',
  'inventario_automatizacion': 'ON CONFLICT (num_parte, fecha) DO NOTHING;',
  'inventario_electronica': 'ON CONFLICT (codigo_marking, ubicacion) DO NOTHING;',
  'ordenes_compra': 'ON CONFLICT (referencia_de_la_orden) DO NOTHING;',
  'ordenes_reparacion': 'ON CONFLICT (referencia_de_reparacion) DO NOTHING;',
  'ordenes_venta': 'ON CONFLICT (referencia_de_la_orden) DO NOTHING;'
};

for (const line of lines) {
  // Detectar INSERT INTO tabla
  const insertMatch = line.match(/^INSERT INTO (\w+)/);
  if (insertMatch) {
    currentTable = insertMatch[1];
  }

  // Reemplazar ON CONFLICT DO NOTHING; por el específico de la tabla
  if (line.trim() === 'ON CONFLICT DO NOTHING;' && currentTable && conflictMap[currentTable]) {
    result.push(conflictMap[currentTable]);
  } else {
    result.push(line);
  }
}

s = result.join('\n');

// ============================================================================
// AGREGAR SCHEMA ssepi_import A TABLAS (NO A ÍNDICES)
// ============================================================================

// CREATE TABLE
s = s.replace(/CREATE TABLE IF NOT EXISTS (\w+)/g, 'CREATE TABLE IF NOT EXISTS ssepi_import.$1');

// ALTER TABLE
s = s.replace(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g, 'ALTER TABLE ssepi_import.$1 ENABLE ROW LEVEL SECURITY');

// CREATE INDEX: nombre SIN schema, tabla CON schema
s = s.replace(/CREATE (UNIQUE )?INDEX IF NOT EXISTS (idx_\w+) ON (\w+)/g, (m, u, idx, tbl) =>
  `CREATE ${u||''}INDEX IF NOT EXISTS ${idx} ON ssepi_import.${tbl}`
);

// DROP INDEX para idx_*
s = s.replace(/DROP INDEX IF EXISTS (idx_\w+)/g, 'DROP INDEX IF EXISTS ssepi_import.$1');

// INSERT INTO
s = s.replace(/INSERT INTO (\w+)/g, 'INSERT INTO ssepi_import.$1');

const foot = `
-- FIN: verificación de conteo
SELECT 'bom_materiales', COUNT(*) FROM ssepi_import.bom_materiales
UNION ALL SELECT 'contactos', COUNT(*) FROM ssepi_import.contactos
UNION ALL SELECT 'inventario_automatizacion', COUNT(*) FROM ssepi_import.inventario_automatizacion
UNION ALL SELECT 'inventario_electronica', COUNT(*) FROM ssepi_import.inventario_electronica
UNION ALL SELECT 'ordenes_compra', COUNT(*) FROM ssepi_import.ordenes_compra
UNION ALL SELECT 'ordenes_reparacion', COUNT(*) FROM ssepi_import.ordenes_reparacion
UNION ALL SELECT 'ordenes_venta', COUNT(*) FROM ssepi_import.ordenes_venta;
COMMIT;
`;

const finalSql = head + uniqueIndexes + dedupeProcess + s + foot;
fs.writeFileSync(out, finalSql, 'utf8');
console.log('✅ Generado:', out);
console.log('   Tamaño:', fs.statSync(out).size, 'bytes');
