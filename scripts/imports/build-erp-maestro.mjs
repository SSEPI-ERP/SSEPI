/**
 * Genera datos_comparador.json (Odoo capturas + tabulador).
 * 1) Intenta Python build_comparador vía run-build-comparador.py
 * 2) Fallback Node con ocr_results.json + tabulador xlsx/json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import XLSX from 'xlsx';
import {
  PATHS,
  resolveTabuladorXlsx,
  ensureImportsOut,
  printPathsStatus,
  REPO_ROOT,
} from './erp-paquete-paths.mjs';
import {
  EXCEL_ALIASES,
  GASTOS_HEREDAR,
  RFC_BY_COMPANY,
  norm,
  canonicalExcelName,
  clasificarTipoFicha,
  findExcelMatch,
  nombreParaMatchExcel,
  buildTabuladorErp,
  blankExcelClient,
  isGarbageName,
} from './erp-maestro-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgePy = path.join(__dirname, 'run-build-comparador.py');

function tryPythonBuild() {
  const xlsx = resolveTabuladorXlsx();
  const env = {
    ...process.env,
    SSEPI_TABULADOR_XLSX: xlsx || '',
    SSEPI_OCR_JSON: PATHS.ocrResults,
    SSEPI_RASTRO_JSON: PATHS.rastroCapturas,
    SSEPI_DATOS_COMPARADOR: PATHS.datosComparador,
  };
  const r = spawnSync('python', [bridgePy], { cwd: REPO_ROOT, env, encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status === 0 && fs.existsSync(PATHS.datosComparador);
}

function loadTabuladorJsonFallback() {
  if (!fs.existsSync(PATHS.tabuladorJsonFallback)) return [];
  const raw = JSON.parse(fs.readFileSync(PATHS.tabuladorJsonFallback, 'utf8'));
  const records = raw.records || raw;
  return records.map((r) => {
    const name = canonicalExcelName(r.nombre_cliente || r.nombre);
    const c = blankExcelClient(name);
    c.c1 = Number(r.km) || 0;
    c.c4 = Number(r.horas_viaje ?? r.horas_invertidas) || 0;
    c.c2 = Number(r.litros) || 0;
    c.c3 = Number(r.costo_gasolina) || 0;
    c.c6 = Number(r.total) || 0;
    c.rfc = r.rfc || RFC_BY_COMPANY[norm(name)] || '';
    c.address = r.direccion || '';
    c.contact = r.contacto || '';
    c.enHoja1 = c.c1 > 0;
    c.viajeDani = { km: c.c1, horas: c.c4, litros: c.c2, gasolina: c.c3, totalViaje: c.c6 };
    return c;
  });
}

function loadExcelFromOcrMatches(ocrList) {
  const byName = new Map();
  for (const item of ocrList) {
    const mc = item.match?.client;
    if (!mc?.name) continue;
    const name = canonicalExcelName(mc.name);
    if (!byName.has(norm(name))) {
      const c = blankExcelClient(name);
      c.c1 = Number(mc.c1) || 0;
      c.c2 = Number(mc.c2) || 0;
      c.c3 = Number(mc.c3) || 0;
      c.c4 = Number(mc.c4) || 0;
      c.c5 = Number(mc.c5) || 0;
      c.c6 = Number(mc.c6) || 0;
      c.rfc = mc.rfc || RFC_BY_COMPANY[norm(name)] || '';
      c.address = mc.address || '';
      c.contact = mc.contact || '';
      c.enHoja1 = c.c1 > 0;
      byName.set(norm(name), c);
    }
  }
  return [...byName.values()];
}

function mergeExcelLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const c of list) {
      const k = norm(c.name);
      if (!map.has(k)) map.set(k, c);
      else {
        const prev = map.get(k);
        for (const key of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'rfc']) {
          if (!prev[key] && c[key]) prev[key] = c[key];
        }
      }
    }
  }
  for (const [hijo, padre] of Object.entries(GASTOS_HEREDAR)) {
    const ck = norm(hijo);
    const pk = norm(padre);
    if (map.has(ck) && map.has(pk) && !map.get(ck).c6) {
      const src = map.get(pk);
      Object.assign(map.get(ck), { c1: src.c1, c6: src.c6, modulos: src.modulos, viajeDani: src.viajeDani });
      map.get(ck).gastosHeredadosDe = padre;
    }
  }
  return [...map.values()];
}

function buildFromNode() {
  if (!fs.existsSync(PATHS.ocrResults)) {
    console.error('Falta', PATHS.ocrResults);
    process.exit(1);
  }
  const ocrList = JSON.parse(fs.readFileSync(PATHS.ocrResults, 'utf8'));
  let excel = loadTabuladorJsonFallback();
  excel = mergeExcelLists(excel, loadExcelFromOcrMatches(ocrList));

  const xlsxPath = resolveTabuladorXlsx();
  if (xlsxPath) {
    try {
      const wb = XLSX.readFile(xlsxPath);
      const names = new Set();
      for (const sn of wb.SheetNames) {
        if (!/LABORATOR|MOTOR|SUMINISTR|AUTOMAT|HOJA1/i.test(sn)) continue;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
        for (const row of rows) {
          const emp = canonicalExcelName(row.EMPRESA || row.Empresa || row.empresa || '');
          if (!emp) continue;
          names.add(emp);
        }
      }
      for (const n of names) {
        if (!excel.some((e) => norm(e.name) === norm(n))) excel.push(blankExcelClient(n));
      }
      console.log('Excel hojas:', wb.SheetNames.length, '| empresas únicas:', names.size);
    } catch (e) {
      console.warn('No se pudo leer tabulador xlsx:', e.message);
    }
  }

  const odoo = [];
  let id = 0;
  for (const item of ocrList) {
    id += 1;
    const { tipo, empresaAsoc, persona } = clasificarTipoFicha(item);
    const nombreContacto = isGarbageName(item.name) ? '' : (item.name || '').trim();
    const hint = item.match?.client?.name ? canonicalExcelName(item.match.client.name) : null;
    const matchNombre = nombreParaMatchExcel(tipo, empresaAsoc, nombreContacto, nombreContacto);
    let { match: excelMatch, score } = findExcelMatch(matchNombre, item.match?.client?.rfc, excel, hint);
    if (tipo === 'contacto_solo' && score < 90) {
      excelMatch = null;
      score = 0;
    } else if (tipo === 'contacto_empresa' && score < 78) {
      excelMatch = null;
    }
    const rol =
      tipo === 'contacto_empresa'
        ? 'contacto_cliente'
        : tipo === 'empresa'
          ? 'ficha_cliente'
          : score >= 70
            ? 'contacto_cliente'
            : 'solo_odoo';
    odoo.push({
      id,
      file: item.file,
      nombreContacto,
      nombreBase: nombreContacto.split(',')[0].trim(),
      contactoPersona: persona,
      tipoFicha: tipo,
      empresaAsociada: empresaAsoc,
      email: '',
      tel: '',
      hasOcr: Boolean(item.text),
      rol,
      excelMatch: excelMatch?.name || null,
      matchScore: score,
      excel: excelMatch,
      odooMatchScore: item.match?.score || 0,
    });
  }

  const tabuladorErp = buildTabuladorErp(excel, odoo);
  const matched = odoo.filter((o) => o.excelMatch && o.matchScore >= 70).length;
  const empresasOdoo = [];
  const byEmp = new Map();
  for (const o of odoo) {
    if (o.tipoFicha !== 'contacto_empresa' && o.tipoFicha !== 'empresa') continue;
    const emp = o.empresaAsociada || o.nombreContacto || o.excelMatch;
    if (!emp) continue;
    const k = norm(emp);
    if (!byEmp.has(k)) byEmp.set(k, { empresa: emp, vendedores: [] });
    if (o.tipoFicha === 'contacto_empresa') {
      byEmp.get(k).vendedores.push({
        nombre: o.nombreContacto,
        email: o.email,
        tel: o.tel,
        capturaId: o.id,
      });
    }
  }
  for (const v of byEmp.values()) {
    empresasOdoo.push({
      empresa: v.empresa,
      totalVendedores: v.vendedores.length,
      vendedores: v.vendedores,
    });
  }

  return {
    generated: new Date().toISOString(),
    source: 'build-erp-maestro.mjs (node)',
    stats: {
      totalImages: odoo.length,
      totalExcel: excel.length,
      withOcr: odoo.filter((o) => o.hasOcr).length,
      matched70: matched,
      contactosVendedores: odoo.filter((o) => o.tipoFicha === 'contacto_empresa').length,
      fichasEmpresa: odoo.filter((o) => o.tipoFicha === 'empresa').length,
      sinMatchExcel: odoo.filter((o) => !o.excelMatch).length,
      empresasConVendedores: empresasOdoo.filter((e) => e.totalVendedores > 0).length,
      tabuladorConCapturas: tabuladorErp.conCapturasOdoo.length,
      tabuladorSinCapturas: tabuladorErp.sinCapturasOdoo.length,
      odooSinTabulador: tabuladorErp.odooSinTabulador.length,
    },
    excel,
    odoo,
    empresasOdoo,
    tabuladorErp,
    relacionErp: tabuladorErp.relacionErp,
    unmatched: odoo.filter((o) => !o.excelMatch),
  };
}

function writeReviewCsv(data) {
  ensureImportsOut();
  const sin = (data.unmatched || data.odoo.filter((o) => !o.excelMatch || o.matchScore < 78)).map((o) => ({
    id: o.id,
    file: o.file,
    tipoFicha: o.tipoFicha,
    nombre: o.nombreContacto,
    empresa: o.empresaAsociada,
    matchScore: o.matchScore,
    sugerencia: o.sugerenciaExcel || '',
  }));
  const p = path.join(PATHS.importsOut, 'erp_sin_match.csv');
  const hdr = ['id', 'file', 'tipoFicha', 'nombre', 'empresa', 'matchScore', 'sugerencia'];
  const lines = [hdr.join(',')];
  for (const r of sin) {
    lines.push(hdr.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log('Revisión sin match:', p, '(', sin.length, 'filas)');

  const aliases = [];
  for (const [alias, canon] of Object.entries(EXCEL_ALIASES)) {
    aliases.push({ alias, canon, fuente: 'EXCEL_ALIASES' });
  }
  const ap = path.join(PATHS.importsOut, 'erp_alias_sugeridos.csv');
  fs.writeFileSync(
    ap,
    ['alias,canon,fuente', ...aliases.map((a) => `"${a.alias}","${a.canon}","${a.fuente}"`)].join('\n'),
    'utf8'
  );
}

function main() {
  printPathsStatus();
  let data = null;
  if (tryPythonBuild()) {
    data = JSON.parse(fs.readFileSync(PATHS.datosComparador, 'utf8'));
    if ((data.stats?.totalImages || 0) < 1 && fs.existsSync(PATHS.ocrResults)) {
      console.log('Python sin capturas — regenerando con OCR Node…');
      data = buildFromNode();
      fs.writeFileSync(PATHS.datosComparador, JSON.stringify(data, null, 2), 'utf8');
    } else {
      console.log('Generado vía Python:', PATHS.datosComparador);
    }
  } else {
    console.log('Python no disponible o falló — usando builder Node…');
    data = buildFromNode();
    fs.mkdirSync(path.dirname(PATHS.datosComparador), { recursive: true });
    fs.writeFileSync(PATHS.datosComparador, JSON.stringify(data, null, 2), 'utf8');
    console.log('Generado:', PATHS.datosComparador);
  }
  writeReviewCsv(data);
  console.log('Stats:', JSON.stringify(data.stats, null, 2));
}

main();
