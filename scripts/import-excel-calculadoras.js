/**
 * Importa calculadoras, costos y clientes desde archivos Excel en la carpeta excel/.
 * Uso: node scripts/import-excel-calculadoras.js [ruta_carpeta_excel]
 * Ejemplo: node scripts/import-excel-calculadoras.js D:\SSEPI\excel
 *
 * Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (igual que create-users-seed.js)
 * Lee todos los .xlsx de la carpeta, detecta columnas por nombre (nombre, tipo, costo, concepto, cliente, email)
 * e inserta/actualiza en calculadoras, calculadora_costos y calculadora_clientes.
 */

const path = require('path');
const fs = require('fs');

const EXCEL_DIR = process.argv[2] || process.env.EXCEL_PATH || path.join(process.cwd(), 'excel');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://knzmdwjmrhcoytmebdwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY. Ponla en el entorno o en .env.');
  process.exit(1);
}

function findColumnIndex(headers, patterns) {
  const row = Array.isArray(headers[0]) ? headers[0] : headers;
  for (let i = 0; i < row.length; i++) {
    const cell = String((row[i] || '')).toLowerCase().trim();
    for (const p of patterns) {
      if (p.test(cell)) return i;
    }
  }
  return -1;
}

async function main() {
  if (!fs.existsSync(EXCEL_DIR)) {
    console.error('Carpeta no encontrada:', EXCEL_DIR);
    console.log('Crea la carpeta y coloca ahí los .xlsx, o pasa la ruta: node scripts/import-excel-calculadoras.js D:\\SSEPI\\excel');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const XLSX = await import('xlsx');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const files = fs.readdirSync(EXCEL_DIR).filter(f => /\.xlsx?$/i.test(f));
  if (files.length === 0) {
    console.log('No hay archivos .xlsx en', EXCEL_DIR);
    process.exit(0);
  }

  console.log('Leyendo calculadoras existentes...');
  const { data: existingCalcs } = await supabase.from('calculadoras').select('id, nombre');
  const calcByName = new Map((existingCalcs || []).map(c => [c.nombre.toLowerCase().trim(), c]));

  let totalCalc = 0, totalCostos = 0, totalClientes = 0;

  for (const file of files) {
    const filePath = path.join(EXCEL_DIR, file);
    console.log('\nProcesando:', file);
    try {
      const workbook = XLSX.readFile(filePath, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) continue;
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length < 2) continue;

      const rawHeaders = rows[0];
      const headerRow = Array.isArray(rawHeaders) ? rawHeaders : [rawHeaders];
      const idxNombre = findColumnIndex([headerRow], [/nombre|producto|descripcion|articulo|item/]);
      const idxTipo = findColumnIndex([headerRow], [/tipo|modelo|categoria/]);
      const idxCosto = findColumnIndex([headerRow], [/costo|precio|importe|unitario/]);
      const idxConcepto = findColumnIndex([headerRow], [/concepto|descripcion|concepto\s*costo/]);
      const idxCliente = findColumnIndex([headerRow], [/cliente|nombre\s*cliente|razon/]);
      const idxEmail = findColumnIndex([headerRow], [/email|correo|e-mail/]);

      const dataRows = rows.slice(1).filter(r => r.some(c => c != null && String(c).trim() !== ''));

      for (const row of dataRows) {
        const get = (idx, def = '') => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : def);
        const nombre = get(idxNombre >= 0 ? idxNombre : 0);
        if (!nombre) continue;

        const tipo = get(idxTipo) || 'importado';
        const key = nombre.toLowerCase();
        let calcId = calcByName.get(key)?.id;

        if (!calcId) {
          const { data: inserted, error } = await supabase.from('calculadoras').insert({
            nombre,
            tipo,
            funciones: null,
            config_json: {},
            activo: true
          }).select('id').single();
          if (error) {
            if (error.code === '23505') {
              const { data: again } = await supabase.from('calculadoras').select('id').ilike('nombre', nombre).limit(1).single();
              calcId = again?.id;
            } else throw error;
          } else {
            calcId = inserted?.id;
            if (calcId) calcByName.set(key, { id: calcId, nombre });
            totalCalc++;
          }
        }

        if (calcId && (idxCosto >= 0 || idxConcepto >= 0)) {
          const concepto = get(idxConcepto >= 0 ? idxConcepto : idxNombre, nombre);
          const costoVal = idxCosto >= 0 && row[idxCosto] != null ? parseFloat(row[idxCosto]) : 0;
          if (!isNaN(costoVal) || concepto) {
            await supabase.from('calculadora_costos').insert({
              calculadora_id: calcId,
              concepto: concepto || 'Importado',
              costo: isNaN(costoVal) ? 0 : costoVal,
              moneda: 'MXN'
            });
            totalCostos++;
          }
        }

        if (calcId && (idxCliente >= 0 || idxEmail >= 0)) {
          const clienteNombre = get(idxCliente >= 0 ? idxCliente : idxNombre);
          const clienteEmail = get(idxEmail);
          if (clienteNombre || clienteEmail) {
            await supabase.from('calculadora_clientes').insert({
              calculadora_id: calcId,
              cliente_nombre: clienteNombre || '—',
              cliente_email: clienteEmail || null,
              datos_json: {}
            });
            totalClientes++;
          }
        }
      }
    } catch (err) {
      console.error('  Error en', file, err.message);
    }
  }

  console.log('\nResumen: calculadoras nuevas/actualizadas:', totalCalc, '| costos:', totalCostos, '| clientes:', totalClientes);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
