/**
 * Import maestro ERP → Supabase (contactos, tabulador, alias, módulos, adeudos).
 */
import fs from 'fs';
import path from 'path';
import { PATHS, ensureImportsOut } from './erp-paquete-paths.mjs';
import { EXCEL_ALIASES, norm, canonicalExcelName } from './erp-maestro-lib.mjs';
import { normKey } from './ocr-ssepi-rules.mjs';

function normalizeStr(s) {
  return normKey(s);
}

export async function runErpMaestro(supabase, { apply = false, linkAdeudos = false } = {}) {
  if (!fs.existsSync(PATHS.datosComparador)) {
    throw new Error(`Genera primero: node build-erp-maestro.mjs → ${PATHS.datosComparador}`);
  }
  const data = JSON.parse(fs.readFileSync(PATHS.datosComparador, 'utf8'));
  const relacion = data.relacionErp || data.tabuladorErp?.relacionErp || [];
  const odoo = data.odoo || [];
  const stats = { empresas: 0, vendedores: 0, alias: 0, tabulador: 0, modulos: 0, errores: [] };

  const empresaIdByTab = new Map();
  const aliasRows = [];

  for (const rel of relacion) {
    const tabName = rel.empresaTabulador;
    if (!tabName) continue;
    const bestContact = (rel.contactosOdoo || []).find((c) => c.tipoFicha === 'empresa') || rel.contactosOdoo?.[0];
    const payload = {
      nombre: tabName.toUpperCase(),
      empresa: tabName.toUpperCase(),
      empresa_tabulador: tabName,
      tipo_ficha: 'empresa',
      tipo: 'client',
      puesto: null,
      telefono: bestContact?.tel || '',
      email: bestContact?.email || '',
      rfc: rel.rfc || '',
      sitio_web: null,
      color: '#00a09d',
      etiquetas: ['erp_maestro_2026'],
      legacy_import: false,
      match_score: bestContact?.matchScore || null,
      odoo_captura_id: bestContact?.id ? String(bestContact.id) : null,
    };

    if (apply && supabase) {
      const cid = await upsertEmpresaContacto(supabase, payload, tabName);
      if (cid) empresaIdByTab.set(norm(tabName), cid);
      else stats.errores.push({ tabName, error: 'no insert/update' });
    }
    stats.empresas++;

    const km = rel.km ?? rel.viajeDani?.km ?? 0;
    const horas = rel.viajeDani?.horas ?? 0;
    const tabRow = {
      nombre_cliente: tabName,
      empresa_tabulador: tabName,
      km: Number(km) || 0,
      horas_viaje: Number(horas) || 0,
      rfc: rel.rfc || null,
      modulos_costo: rel.modulos || {},
    };
    if (apply && supabase) {
      const { error: te } = await supabase.from('clientes_tabulador').upsert(tabRow, {
        onConflict: 'nombre_cliente',
      });
      if (te) {
        await supabase.from('clientes_tabulador').upsert(
          { ...tabRow, cliente_nombre: tabName },
          { onConflict: 'cliente_nombre' }
        ).catch(() => {});
      }
      await supabase.from('empresa_modulos_costo').upsert({
        empresa_tabulador: tabName,
        modulos: rel.modulos || {},
        viaje_dani: rel.viajeDani || {},
        km: tabRow.km,
        total_referencia: rel.total || 0,
        rfc: rel.rfc || null,
        updated_at: new Date().toISOString(),
      });
    }
    stats.tabulador++;
    stats.modulos++;

    aliasRows.push({ nombre_norm: norm(tabName), alias: tabName, empresa_tabulador: tabName, fuente: 'tabulador' });
  }

  for (const o of odoo) {
    if (o.tipoFicha !== 'contacto_empresa') continue;
    const tab = o.excelMatch || canonicalExcelName(o.empresaAsociada);
    if (!tab) continue;
    const padreId = apply ? empresaIdByTab.get(norm(tab)) : null;
    const payload = {
      nombre: (o.nombreContacto || o.contactoPersona || 'CONTACTO').toUpperCase(),
      empresa: tab.toUpperCase(),
      empresa_tabulador: tab,
      empresa_padre_id: padreId,
      tipo_ficha: 'contacto_empresa',
      tipo: 'client',
      puesto: o.puesto || 'Vendedor',
      telefono: o.tel || '',
      email: o.email || '',
      rfc: '',
      etiquetas: ['erp_maestro_2026', 'vendedor'],
      odoo_captura_id: o.id ? String(o.id) : null,
      match_score: o.matchScore,
    };
    if (apply && supabase) {
      const { error } = await supabase.from('contactos').insert(payload);
      if (error) stats.errores.push({ vendedor: payload.nombre, error: error.message });
    }
    stats.vendedores++;
    if (o.empresaAsociada) {
      aliasRows.push({
        nombre_norm: norm(tab),
        alias: o.empresaAsociada,
        empresa_tabulador: tab,
        fuente: 'odoo_captura',
      });
    }
  }

  for (const [alias, canon] of Object.entries(EXCEL_ALIASES)) {
    aliasRows.push({ nombre_norm: norm(canon), alias, empresa_tabulador: canon, fuente: 'EXCEL_ALIASES' });
  }

  const aliasUnique = dedupeAlias(aliasRows);
  if (apply && supabase) {
    for (const a of aliasUnique) {
      await supabase.from('contacto_alias').upsert(a, { onConflict: 'nombre_norm,alias' });
    }
  }
  stats.alias = aliasUnique.length;

  if (linkAdeudos && apply && supabase) {
    stats.adeudos = await linkAdeudosToContactos(supabase, aliasUnique);
  }

  if (!apply) {
    ensureImportsOut();
    const preview = pathJoinOut('erp_maestro_preview.json');
    fs.writeFileSync(preview, JSON.stringify({ stats, empresas: relacion.length }, null, 2));
    console.log('Dry-run:', preview);
  }

  return stats;
}

async function findContactoId(supabase, tabName) {
  const { data } = await supabase
    .from('contactos')
    .select('id')
    .eq('empresa_tabulador', tabName)
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;
  const { data: d2 } = await supabase.from('contactos').select('id').ilike('nombre', tabName).limit(1).maybeSingle();
  return d2?.id;
}

function dedupeAlias(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.nombre_norm}|${normKey(r.alias)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return r.alias && r.nombre_norm;
  });
}

export async function linkAdeudosToContactos(supabase, aliasRows = []) {
  const aliasMap = new Map();
  for (const a of aliasRows) {
    aliasMap.set(normKey(a.alias), a.empresa_tabulador);
  }
  const { data: adeudos } = await supabase
    .from('clientes_adeudos')
    .select('id, cliente_id, folio_orden, motivo')
    .is('cliente_id', null);
  let linked = 0;
  const clientesTocados = new Set();
  for (const ad of adeudos || []) {
    const hint = (ad.motivo || ad.folio_orden || '').trim();
    const tab = aliasMap.get(normKey(hint)) || null;
    if (!tab) continue;
    const cid = await findContactoId(supabase, tab);
    if (!cid) continue;
    await supabase.from('clientes_adeudos').update({ cliente_id: cid }).eq('id', ad.id);
    clientesTocados.add(cid);
    linked++;
  }
  for (const cid of clientesTocados) {
    await supabase.rpc('actualizar_adeudo_cliente', { p_cliente_id: cid });
  }
  return { linked, clientes: clientesTocados.size };
}

function pathJoinOut(name) {
  return path.join(PATHS.importsOut, name);
}

async function upsertEmpresaContacto(supabase, payload, tabName) {
  const existing = await findContactoId(supabase, tabName);
  if (existing) {
    const { error } = await supabase.from('contactos').update(payload).eq('id', existing);
    if (error) return null;
    return existing;
  }
  const { data, error } = await supabase.from('contactos').insert(payload).select('id').maybeSingle();
  if (error) return null;
  return data?.id;
}
