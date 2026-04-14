/**
 * SCRIPT: build-ssepi-adapted-import.mjs
 * PROPÓSITO: Generar SQL de import idempotente para SSEPI
 * EJECUCIÓN: node build-ssepi-adapted-import.mjs
 *
 * ORDEN DEL SCRIPT:
 * 1) BEGIN; CREATE SCHEMA; SET search_path;
 * 2) SCHEMA (CREATE TABLE/ALTER TABLE/INDEX no-unique)
 * 3) DEDUPE (solo si la tabla ya existe)
 * 4) UNIQUE INDEXES
 * 5) INSERTs (con ON CONFLICT específico)
 * 6) COMMIT;
 */

import fs from 'fs';

const src = './ssepi_supabase.sql';
const out = './ssepi_supabase_adapted.sql';

if (!fs.existsSync(src)) {
  console.error('❌ No se encontró:', src);
  process.exit(1);
}

let s = fs.readFileSync(src, 'utf8');

// ============================================================================
// FASE 1: HEADER
// ============================================================================

const head = `-- ADAPTADO SSEPI: Import idempotente en schema ssepi_import
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor o psql -f ssepi_supabase_adapted.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS ssepi_import;
SET LOCAL search_path TO ssepi_import, public;

`;

// ============================================================================
// FASE 2: EXTRAER BLOQUES SQL COMPLETOS
// ============================================================================

// Extraer CREATE TABLE ... ); completo
function extractCreateTables(sql) {
  const tables = [];
  const regex = /CREATE TABLE IF NOT EXISTS (\w+)\s*\([^;]+\);/gs;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.push({ name: match[1], sql: match[0] });
  }
  return tables;
}

// Extraer ALTER TABLE ... ;
function extractAlterTables(sql) {
  const alters = [];
  const regex = /ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY;/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    alters.push({ name: match[1], sql: match[0] });
  }
  return alters;
}

// Extraer CREATE INDEX (no unique) ... ;
function extractIndexes(sql) {
  const indexes = [];
  const regex = /CREATE INDEX IF NOT EXISTS (idx_\w+) ON (\w+)\([^)]+\);/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    indexes.push({ idxName: match[1], tableName: match[2], sql: match[0] });
  }
  return indexes;
}

// Extraer INSERT INTO ... ; completo (manejando valores multilínea)
function extractInserts(sql) {
  const inserts = [];
  // MATCH: INSERT INTO tabla (...) VALUES ... ;
  // Los VALUES pueden tener múltiples líneas con paréntesis anidados
  const lines = sql.split('\n');
  let currentInsert = null;
  let parenDepth = 0;
  let inInsert = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('INSERT INTO')) {
      currentInsert = line;
      inInsert = true;
      parenDepth = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      if (parenDepth === 0 && trimmed.endsWith(';')) {
        inserts.push(currentInsert);
        currentInsert = null;
        inInsert = false;
      }
      continue;
    }

    if (inInsert && currentInsert) {
      currentInsert += '\n' + line;
      parenDepth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      if (parenDepth === 0 && trimmed.endsWith(';')) {
        inserts.push(currentInsert);
        currentInsert = null;
        inInsert = false;
      }
    }
  }

  return inserts;
}

// Extraer CREATE EXTENSION
function extractExtensions(sql) {
  const extensions = [];
  const regex = /CREATE EXTENSION IF NOT EXISTS[^;]+;/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    extensions.push(match[0]);
  }
  return extensions;
}

const createTables = extractCreateTables(s);
const alterTables = extractAlterTables(s);
const indexes = extractIndexes(s);
const inserts = extractInserts(s);
const extensions = extractExtensions(s);

// ============================================================================
// FASE 3: AGREGAR SCHEMA ssepi_import A TABLAS
// ============================================================================

function addSchemaToCreateTable(createTableSql) {
  return createTableSql.replace(
    /CREATE TABLE IF NOT EXISTS (\w+)/,
    'CREATE TABLE IF NOT EXISTS ssepi_import.$1'
  );
}

function addSchemaToAlterTable(alterSql) {
  return alterSql.replace(
    /ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/,
    'ALTER TABLE ssepi_import.$1 ENABLE ROW LEVEL SECURITY'
  );
}

function addSchemaToIndex(indexSql) {
  // CREATE INDEX IF NOT EXISTS idx_x ON tabla(col) -> ON ssepi_import.tabla(col)
  return indexSql.replace(
    /CREATE (UNIQUE )?INDEX IF NOT EXISTS (idx_\w+) ON (\w+)/,
    'CREATE $1INDEX IF NOT EXISTS $2 ON ssepi_import.$3'
  );
}

function addSchemaToInsert(insertSql) {
  return insertSql.replace(
    /INSERT INTO (\w+)/g,
    'INSERT INTO ssepi_import.$1'
  );
}

// ============================================================================
// FASE 4: REEMPLAZAR ON CONFLICT GENÉRICO POR ESPECÍFICO
// ============================================================================

const conflictMap = {
  'bom_materiales': 'ON CONFLICT (numero_de_parte) DO NOTHING;',
  'inventario_automatizacion': 'ON CONFLICT (num_parte, fecha) DO NOTHING;',
  'inventario_electronica': 'ON CONFLICT (codigo_marking, ubicacion) DO NOTHING;',
  'ordenes_compra': 'ON CONFLICT (referencia_de_la_orden) DO NOTHING;',
  'ordenes_reparacion': 'ON CONFLICT (referencia_de_reparacion) DO NOTHING;',
  'ordenes_venta': 'ON CONFLICT (referencia_de_la_orden) DO NOTHING;'
};

function fixOnConflict(insertSql) {
  // Detectar tabla del INSERT
  const tableMatch = insertSql.match(/INSERT INTO ssepi_import\.(\w+)/);
  if (!tableMatch) return insertSql;
  const tableName = tableMatch[1];

  // CASO ESPECIAL: contactos - requiere manejo separado por email vs nombre+tel
  if (tableName === 'contactos') {
    // Verificar columna correo_electronico en el INSERT
    const columnsMatch = insertSql.match(/INSERT INTO ssepi_import\.contactos\s*\(([^)]+)\)/);
    if (columnsMatch) {
      const columns = columnsMatch[1].split(',').map(c => c.trim());
      const emailIndex = columns.indexOf('correo_electronico');

      if (emailIndex !== -1) {
        // Extraer VALUES y verificar primer registro
        const valuesMatch = insertSql.match(/VALUES\s*((?:\([^)]+\)\s*,?\s*)+)/s);
        if (valuesMatch) {
          const firstValue = valuesMatch[1];
          // Contar emails válidos vs NULLs
          const emailValues = firstValue.match(/\([^)]+\)/g) || [];
          let validEmails = 0;
          let nullEmails = 0;

          for (const val of emailValues.slice(0, 10)) {
            const parts = val.split(',');
            if (parts.length > emailIndex) {
              const emailPart = parts[emailIndex].trim();
              if (emailPart === 'NULL' || emailPart === "''") {
                nullEmails++;
              } else if (emailPart.includes('@')) {
                validEmails++;
              }
            }
          }

          // Si mayoría tiene email válido → usar email, si no → usar nombre+tel
          if (validEmails >= nullEmails && validEmails > 0) {
            return insertSql.replace(
              /ON CONFLICT DO NOTHING;/g,
              'ON CONFLICT (correo_electronico) WHERE correo_electronico IS NOT NULL AND correo_electronico != \'\' DO NOTHING;'
            );
          } else {
            return insertSql.replace(
              /ON CONFLICT DO NOTHING;/g,
              'ON CONFLICT (nombre_completo, telefono) WHERE nombre_completo IS NOT NULL AND telefono IS NOT NULL DO NOTHING;'
            );
          }
        }
      }
    }
    return insertSql;
  }

  const conflictClause = conflictMap[tableName];
  if (!conflictClause) return insertSql;

  return insertSql.replace(
    /ON CONFLICT DO NOTHING;/g,
    conflictClause
  );
}

// ============================================================================
// FASE 5: ENSAMBLAR SCRIPT FINAL EN ORDEN CORRECTO
// ============================================================================

const schemaSection = [
  '-- ================================================================',
  '-- FASE 1: SCHEMA (CREATE TABLE, ALTER TABLE, índices no-únicos)',
  '-- ================================================================',
  '',
  ...createTables.map(t => addSchemaToCreateTable(t.sql)),
  '',
  ...alterTables.map(a => addSchemaToAlterTable(a.sql)),
  '',
  ...indexes.map(i => addSchemaToIndex(i.sql)),
  '',
  ...extensions,
  ''
].join('\n');

const dedupeProcess = `
-- ================================================================
-- FASE 2: DEDUPE (eliminar duplicados antes de crear UNIQUE)
-- ================================================================

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

const uniqueIndexes = `-- ================================================================
-- FASE 3: ÍNDICES ÚNICOS (llaves naturales para ON CONFLICT)
-- ================================================================

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

// Primero agregar schema, luego fix ON CONFLICT (porque fixOnConflict busca ssepi_import.tabla)
const insertsWithSchema = inserts.map(addSchemaToInsert);
const fixedInserts = insertsWithSchema.map(fixOnConflict);

const insertsSection = `-- ================================================================
-- FASE 4: INSERTS (con ON CONFLICT específico)
-- ================================================================

${fixedInserts.join('\n\n')}

`;

const foot = `-- FIN: verificación de conteo
SELECT 'bom_materiales', COUNT(*) FROM ssepi_import.bom_materiales
UNION ALL SELECT 'contactos', COUNT(*) FROM ssepi_import.contactos
UNION ALL SELECT 'inventario_automatizacion', COUNT(*) FROM ssepi_import.inventario_automatizacion
UNION ALL SELECT 'inventario_electronica', COUNT(*) FROM ssepi_import.inventario_electronica
UNION ALL SELECT 'ordenes_compra', COUNT(*) FROM ssepi_import.ordenes_compra
UNION ALL SELECT 'ordenes_reparacion', COUNT(*) FROM ssepi_import.ordenes_reparacion
UNION ALL SELECT 'ordenes_venta', COUNT(*) FROM ssepi_import.ordenes_venta;
COMMIT;
`;

const finalSql = head + schemaSection + dedupeProcess + uniqueIndexes + insertsSection + foot;

fs.writeFileSync(out, finalSql, 'utf8');
console.log('✅ Generado:', out);
console.log('   Tamaño:', fs.statSync(out).size, 'bytes');
