import fs from 'fs';

const src = 'D:/SSEPI/scripts/imports/ssepi_supabase.sql';
const out = 'D:/SSEPI/scripts/imports/ssepi_supabase_adapted.sql';

let s = fs.readFileSync(src, 'utf8');

const head = `-- ADAPTADO SSEPI: tablas y datos en schema ssepi_import
-- (no choca con public.contactos, public.inventario, public.compras del ERP).
-- Ejecutar TODO este archivo de una vez en Supabase SQL Editor.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ssepi_import;
SET LOCAL search_path TO ssepi_import, public;

`;

// Índice NO parcial: PG no infiere índice parcial para ON CONFLICT (col) sin el mismo WHERE.
// En PostgreSQL, varias filas con numero_de_parte NULL siguen permitidas en UNIQUE.
const idx = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_bom_materiales_numero_parte
  ON bom_materiales (numero_de_parte);
`;

s = s.replace(
  'ALTER TABLE bom_materiales ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE bom_materiales ENABLE ROW LEVEL SECURITY;' + idx
);

// Solo INSERT de bom_materiales: conflicto por número de parte
s = s.replace(
  /(INSERT INTO bom_materiales[\s\S]*?)ON CONFLICT DO NOTHING;/g,
  '$1ON CONFLICT (numero_de_parte) DO NOTHING;'
);

const foot = `
COMMIT;
`;

fs.writeFileSync(out, head + s + foot);
console.log('Wrote', out, 'bytes', fs.statSync(out).size);
