/**
 * Import órdenes laboratorio → ordenes_taller + Storage.
 * Uso: node import-lab-ordenes.mjs [--dry-run|--apply] [--only-imported]
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { PATHS, ensureImportsOut } from './erp-paquete-paths.mjs';
import { parseReporteFromOcrRow, isValidLabFolio, normalizeLabFolio } from './ocr-ssepi-rules.mjs';
import { normKey } from './ocr-ssepi-rules.mjs';

const apply = process.argv.includes('--apply');
const onlyImported = process.argv.includes('--only-imported');
const FOLIO_RE = /^(SP-E|RE-|WHRO-)\d/i;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveClienteId(supabase, row) {
  const tab = row.empresa_tabulador;
  const nombre = row.cliente;
  if (tab) {
    const { data } = await supabase
      .from('contactos')
      .select('id, nombre, empresa_tabulador')
      .eq('empresa_tabulador', tab)
      .is('empresa_padre_id', null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return { id: data.id, nombre: data.nombre || tab };
  }
  if (nombre) {
    const { data: alias } = await supabase
      .from('contacto_alias')
      .select('empresa_tabulador')
      .eq('nombre_norm', normKey(nombre))
      .limit(1)
      .maybeSingle();
    if (alias?.empresa_tabulador) {
      const { data } = await supabase
        .from('contactos')
        .select('id, nombre')
        .eq('empresa_tabulador', alias.empresa_tabulador)
        .limit(1)
        .maybeSingle();
      if (data?.id) return { id: data.id, nombre: data.nombre };
    }
    const { data: c2 } = await supabase
      .from('contactos')
      .select('id, nombre')
      .ilike('nombre', `%${nombre.slice(0, 12)}%`)
      .limit(1)
      .maybeSingle();
    if (c2?.id) return { id: c2.id, nombre: c2.nombre };
  }
  return { id: null, nombre: nombre || tab || 'CLIENTE' };
}

async function uploadFiles(supabase, ordenId, archivos, subcarpeta) {
  const urls = [];
  for (const fp of archivos || []) {
    if (!fs.existsSync(fp)) continue;
    const base = path.basename(fp);
    const storagePath = `uploads/taller/${ordenId}/${subcarpeta}/${base}`;
    const buf = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase();
    const contentType =
      ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
    const { error } = await supabase.storage.from('uploads').upload(storagePath, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.warn('Storage', storagePath, error.message);
      continue;
    }
    const { data: pub } = supabase.storage.from('uploads').getPublicUrl(storagePath);
    urls.push({ path: storagePath, dataUrl: pub?.publicUrl || null, name: base });
  }
  return urls;
}

function loadRows() {
  if (!fs.existsSync(PATHS.datosReportesOcr)) {
    console.error('Falta', PATHS.datosReportesOcr, '— ejecuta scan-lab-reportes.mjs --write');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(PATHS.datosReportesOcr, 'utf8'));
  return raw
    .map((r) => {
      const p = parseReporteFromOcrRow(r);
      return {
        ...p,
        carpeta: r.carpeta,
        archivos: r.archivos || [],
        empresa_tabulador: r.empresa_tabulador,
      };
    })
    .filter((r) => r.folio && (!onlyImported || FOLIO_RE.test(r.folio)));
}

async function main() {
  const rows = loadRows().filter((r) => isValidLabFolio(r.folio));
  ensureImportsOut();
  const preview = [];
  const supabase = apply ? getSupabase() : null;
  let ok = 0;
  let skip = 0;

  for (const row of rows) {
    if (!row.cliente && !row.empresa_tabulador) {
      skip++;
      continue;
    }
    const folio = normalizeLabFolio(row.folio);
    const cliente = apply ? await resolveClienteId(supabase, row) : { nombre: row.cliente };
    const payload = {
      folio,
      cliente_nombre: cliente.nombre || row.cliente,
      fecha_ingreso: new Date().toISOString(),
      equipo: row.equipo || 'Equipo',
      falla_reportada: row.diagnostico || row.notas || 'Import ERP',
      estado: row.estado || 'Nuevo',
      encargado_recepcion: row.encargado || null,
      vendedor_externo: row.vendedor || null,
      diagnostico: row.diagnostico || null,
      solucion: row.solucion || null,
      historial_actividad: row.historial_actividad || null,
      import_erp_legacy: true,
      fotos_ingreso: [],
      reporte_imagenes: [],
    };

    preview.push({ folio, cliente: payload.cliente_nombre, archivos: (row.archivos || []).length });

    if (!apply) continue;

    const { data: existing } = await supabase.from('ordenes_taller').select('id').eq('folio', folio).maybeSingle();
    let ordenId = existing?.id;
    if (ordenId) {
      await supabase.from('ordenes_taller').update(payload).eq('id', ordenId);
    } else {
      const { data: ins, error } = await supabase.from('ordenes_taller').insert(payload).select('id').single();
      if (error) {
        console.warn('Orden', folio, error.message);
        skip++;
        continue;
      }
      ordenId = ins.id;
    }

    const imgs = (row.archivos || []).filter((f) => /\.(png|jpe?g)$/i.test(f));
    const pdfs = (row.archivos || []).filter((f) => /\.pdf$/i.test(f));
    const fotos = await uploadFiles(supabase, ordenId, imgs, 'imagenes');
    const docs = await uploadFiles(supabase, ordenId, pdfs, 'documentos');
    if (fotos.length || docs.length) {
      await supabase
        .from('ordenes_taller')
        .update({
          fotos_ingreso: fotos,
          reporte_imagenes: [...fotos, ...docs],
        })
        .eq('id', ordenId);
    }
    ok++;
  }

  const csvPath = path.join(PATHS.importsOut, 'lab_ordenes_preview.csv');
  fs.writeFileSync(
    csvPath,
    ['folio,cliente,archivos', ...preview.map((p) => `"${p.folio}","${p.cliente}",${p.archivos}`)].join('\n'),
    'utf8'
  );
  console.log('Filas válidas:', rows.length, '| Preview:', csvPath);
  if (!apply) {
    console.log('Dry-run. Usa --apply para subir a Supabase.');
    return;
  }
  console.log('Órdenes importadas/actualizadas:', ok, '| Omitidas:', skip);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
