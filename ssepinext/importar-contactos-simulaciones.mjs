import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, persistDb, prepareStatement } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, 'data', 'master', 'clientes_tabulador.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Import] No encontrado: ${filePath}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[Import] Error parseando ${filePath}:`, e.message);
    return null;
  }
}

/* ================================================================
   BLOQUE A: Importar / actualizar local_clientes_tabulador
   ================================================================ */
async function importarClientesTabulador(db) {
  const payload = readJson(JSON_PATH);
  if (!payload || !Array.isArray(payload.records)) {
    console.error('[Import] clientes_tabulador.json inválido o sin records');
    return { inserted: 0, updated: 0 };
  }

  const stmt = await prepareStatement(db, 'local_clientes_tabulador');
  let inserted = 0;
  let updated = 0;

  for (const rec of payload.records) {
    if (!rec.nombre_cliente) continue;

    const existing = await stmt.query(
      `json_extract(data, '$.nombre_cliente') = ?`,
      [rec.nombre_cliente],
      'id ASC',
      1
    );

    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      await stmt.update(localId, rec);
      updated++;
      console.log(`[Tabulador] Actualizado: ${rec.nombre_cliente} (ID ${localId})`);
    } else {
      const result = await stmt.insert(null, rec);
      inserted++;
      console.log(`[Tabulador] Insertado: ${rec.nombre_cliente} (ID ${result.id})`);
    }
  }

  persistDb();
  console.log(`[Tabulador] Resumen: ${inserted} insertados, ${updated} actualizados`);
  return { inserted, updated };
}

/* ================================================================
   BLOQUE B: Importar / actualizar local_contactos
   Deduplicacion por RFC (primera opcion) -> nombre normalizado
   ================================================================ */
function normalizeName(n) {
  return (n || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').trim();
}

async function importarContactos(db) {
  const payload = readJson(JSON_PATH);
  if (!payload || !Array.isArray(payload.records)) {
    console.error('[Import] clientes_tabulador.json inválido o sin records');
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const stmt = await prepareStatement(db, 'local_contactos');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const rec of payload.records) {
    if (!rec.nombre_cliente) { skipped++; continue; }

    // Construir objeto de contacto
    const contactData = {
      nombre: rec.nombre_cliente,
      empresa: rec.nombre_cliente,
      rfc: rec.rfc || '',
      direccion: rec.direccion || '',
      contacto_persona: rec.contacto || '',
      email: '',
      telefono: '',
      sitio_web: '',
      tipo: 'client',
      activo: true,
      color: '#1D9E75',
      notas: `Tabulador SSEPI v11. Costo gasolina: ${rec.costo_gasolina}, Costo tecnico: ${rec.costo_tecnico}, Total: ${rec.total}`,
      created_at: new Date().toISOString()
    };

    // Buscar por RFC primero
    let existing = [];
    if (contactData.rfc) {
      existing = await stmt.query(
        `json_extract(data, '$.rfc') = ?`,
        [contactData.rfc],
        'id ASC',
        1
      );
    }

    // Fallback: buscar por nombre normalizado
    if (existing.length === 0) {
      const norm = normalizeName(contactData.nombre);
      if (norm) {
        existing = await stmt.query(
          `upper(replace(replace(replace(replace(json_extract(data, '$.nombre'),' ',''),'.',''),',',''),'-','')) = ?`,
          [norm],
          'id ASC',
          1
        );
      }
    }

    if (existing.length > 0) {
      const localId = existing[0].local_id || existing[0].id;
      // Merge: conservar campos que ya existan en BD (email, telefono, sitio_web, etc.)
      const existingData = existing[0];
      const merged = {
        ...existingData,
        ...contactData,
        email: existingData.email || contactData.email,
        telefono: existingData.telefono || contactData.telefono,
        sitio_web: existingData.sitio_web || contactData.sitio_web,
        notas: contactData.notas // siempre actualizar notas
      };
      await stmt.update(localId, merged);
      updated++;
      console.log(`[Contacto] Actualizado: ${rec.nombre_cliente} (ID ${localId})`);
    } else {
      const result = await stmt.insert(null, contactData);
      inserted++;
      console.log(`[Contacto] Insertado: ${rec.nombre_cliente} (ID ${result.id})`);
    }
  }

  persistDb();
  console.log(`[Contacto] Resumen: ${inserted} insertados, ${updated} actualizados, ${skipped} omitidos`);
  return { inserted, updated, skipped };
}

/* ================================================================
   MAIN
   ================================================================ */
async function main() {
  console.log('\n========================================');
  console.log('  IMPORTAR CONTACTOS SIMULACIONES v11');
  console.log('========================================\n');

  const db = await getDb();

  // Paso 1: Tabulador
  const tabResult = await importarClientesTabulador(db);

  // Paso 2: Contactos
  const conResult = await importarContactos(db);

  console.log('\n========================================');
  console.log('  RESUMEN FINAL');
  console.log('========================================');
  console.log(`Tabulador : ${tabResult.inserted} insertados, ${tabResult.updated} actualizados`);
  console.log(`Contactos : ${conResult.inserted} insertados, ${conResult.updated} actualizados, ${conResult.skipped} omitidos`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('[Import] Error fatal:', err);
  process.exit(1);
});
