/**
 * Reglas compartidas comparador Odoo ↔ tabulador (port Node de build_comparador.py).
 */
export const EXCEL_ALIASES = {
  ANGUIPALST: 'ANGUIPLAST',
  ECSA: 'ARCOSA',
  ELECTROFORJADOS: 'SERVIACERO ELECTROFORJADOS',
  'EMMSA LEÓN.': 'EMMSA',
  'EMMSA LEON.': 'EMMSA',
  'HALL PLANTA 1': 'HALLIBURTON',
  'HIRUTA PLANTA 1': 'HIRUTA',
  'DI CENTRAL': 'DI-CENTRAL',
  'CARTO MICRO': 'CARTOTEC',
};

export const GASTOS_HEREDAR = { EPC1: 'EPC 1' };

export const RFC_BY_COMPANY = {
  ANGUIPLAST: 'ANG101215PG0',
  ARCOSA: 'ECS440707GG7',
  'BADER TABACHINES': 'BAD880303CC3',
  BODYCOTE: 'BOD770404DD4',
  'BOLSAS DE LOS ALTOS': 'BAL050101AA1',
  COFICAB: 'COF660505EE5',
  CONDUMEX: 'CON550606FF6',
  'CURTIDOS BENGALA': 'CUR880808F66',
  ECOBOLSAS: 'ECO990202BB2',
  ELECTROFORJADOS: 'SEE330404B22',
  EMMSA: 'EMM330808HH8',
  'EPC 1': 'EPC220909II9',
  'EPC 2': 'EPC111010JJ0',
  FRAENKISCHE: 'FRA001111KK1',
  GEDNEY: 'GED991212LL2',
  'GRUPO ACERERO': 'GRU880101MM3',
  HALLIBURTON: 'HAL770202NN4',
  HIRUTA: 'HIR660303OO5',
  'IK PLASTIC': 'IKP550404PP6',
  'IMPRENTA JM': 'IMP440505QQ7',
  'JARDÍN LA ALEMANA': 'JAR330606RR8',
  MAFLOW: 'MAF220707SS9',
  MARQUARDT: 'MAR110808TT0',
  MICROONDA: 'MIC000909UU1',
  'MINO INDUSTRY': 'MIN000707E55',
  'MR LUCKY': 'MRL991010VV2',
  NHK: 'NHK881111WW3',
  NISHIKAWA: 'NIS771212XX4',
  'PIELES AZTECA': 'PIE660101YY5',
  RONGTAI: 'RON550202ZZ6',
  'SAFE DEMO': 'SAF440303A11',
  'SERVIACERO ELECTROFORJADOS': 'SEE330404B22',
  SUACERO: 'SUA220505C33',
  'TQ-1': 'TQ1110606D44',
};

export function norm(s) {
  if (s == null || s === '') return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalExcelName(raw) {
  if (!raw) return '';
  const u = String(raw).trim().toUpperCase();
  return EXCEL_ALIASES[u] || String(raw).trim();
}

export function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[a.length][b.length];
}

export function similarity(a, b) {
  const s = norm(a);
  const t = norm(b);
  if (!s || !t) return 0;
  const d = levenshtein(s, t);
  const m = Math.max(s.length, t.length);
  return m ? Math.round((1 - d / m) * 100) : 100;
}

export function tokenScore(odooName, exName) {
  const o = norm(odooName);
  const e = norm(exName);
  if (!o || !e) return 0;
  if (e.includes(o) || o.includes(e)) return 92;
  const wordsE = e.split(' ').filter((w) => w.length >= 4);
  const wordsO = o.split(' ');
  const pool = wordsE.length ? wordsE : e.split(' ');
  let hits = 0;
  for (const w of pool) {
    if (wordsO.some((wo) => wo.length >= 3 && (wo.includes(w) || w.startsWith(wo.slice(0, 4))))) hits++;
  }
  return pool.length ? Math.round((85 * hits) / pool.length) : 0;
}

export function rfcMatch(r1, r2) {
  if (!r1 || !r2) return false;
  const a = norm(r1);
  const b = norm(r2);
  if (a.length < 10 || b.length < 10) return false;
  return a === b || a.slice(0, 10) === b.slice(0, 10);
}

export function findExcelMatch(odooName, rfc, excelList, hintName = null) {
  let best = null;
  let bestScore = -1;
  const names = [odooName, hintName].filter(Boolean);
  for (const ex of excelList) {
    let score = 0;
    for (const n of names) {
      score = Math.max(score, similarity(n, ex.name), tokenScore(n, ex.name));
      if (ex.nameExcel) {
        score = Math.max(score, similarity(n, ex.nameExcel), tokenScore(n, ex.nameExcel));
      }
    }
    if (rfc && ex.rfc && rfcMatch(rfc, ex.rfc)) score = Math.max(score, 96);
    if (score > bestScore) {
      bestScore = score;
      best = ex;
    }
  }
  return { match: best, score: bestScore };
}

export function isGarbageName(name) {
  if (!name || String(name).trim().length < 2) return true;
  const lo = String(name).toLowerCase();
  // Placeholders UI Odoo y campos de formulario
  if (/^agregar\s+contacto$|^contacto\s+cread|^contacto\s+cre$|^nombre\s+ce|^nombre\s+de\s+la\s+empresa|^puesto\s+de\s+trabajo|^correo\s*electr|^enviar\s+mensaje|^registrar\s+una\s+nota|^whatsapp\s+actividad|^persona.*empresa|empresa.*persona/i.test(lo)) return true;
  // Concatenacion de placeholders UI: 2+ frases UI Odoo juntas
  const uiHits = lo.match(/enviar\s+mensaje|registrar\s+una\s+nota|whatsapp\s+actividad|agregar\s+contacto|contacto\s+crear|empresa\s*o\s*persona|persona\s*o\s*empresa|registrar\s*actividad|nueva\s+nota/g);
  if (uiHits && uiHits.length >= 2) return true;
  // Fragmentos OCR sueltos (1 letra + espacio + 1 palabra, o simbolos al inicio)
  if (/^[a-z]\s+[a-z]{1,3}$/i.test(String(name).trim())) return true; // "J J", "E L"
  if (/^[)\]}\-_,.;:!?¡¿]/.test(String(name).trim())) return true; // ") BOLSAS", leading junk
  if (/^[a-z]{1,2}\)\s/i.test(String(name).trim())) return true; // "Ta) Anguiplast"
  const raw = String(name).trim();
  // Ensalada OCR: muchas palabras cortas sin forma de razón social
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 8) {
    const hasCo = /\b(S\.?\s*A\.?|DE\s+C\.?\s*V\.?|S\.?\s*DE\s+R\.?\s*L\.?|INDUSTRIAL|GRUPO|M[ÉE]XICO|COMERCIAL)\b/i.test(raw);
    const shortRatio = words.filter((w) => w.length <= 4).length / words.length;
    if (!hasCo && shortRatio > 0.55) return true;
  }
  const alnum = [...raw].filter((c) => /[a-z0-9]/i.test(c)).length;
  return raw.length > 6 && alnum / raw.length < 0.45;
}

/** Nombre apto para ficha empresa tabulador (calculadora). */
export function isValidEmpresaTabuladorName(name) {
  const tab = canonicalExcelName(name || '');
  if (!tab || tab.length < 3) return false;
  if (isGarbageName(tab)) return false;
  return true;
}

export function clasificarTipoFicha(ocrItem) {
  const text = (ocrItem.text || '').toLowerCase();
  const name = (ocrItem.name || '').trim();
  const hasEmpresaField = /empresa\s*[—\-:]/i.test(ocrItem.text || '');
  const hasDireccion = /direcci[oó]n/i.test(ocrItem.text || '') && !/direcci[oó]n de la empresa/i.test(text);
  if (hasDireccion && !hasEmpresaField && name && !isGarbageName(name)) {
    return { tipo: 'empresa', empresaAsoc: '', persona: name };
  }
  if (hasEmpresaField) {
    const m = (ocrItem.text || '').match(/empresa\s*[—\-:]?\s*([^\n]+)/i);
    const emp = m ? m[1].trim().split(/\n/)[0] : '';
    if (emp && !isGarbageName(emp)) {
      return { tipo: 'contacto_empresa', empresaAsoc: emp, persona: name };
    }
  }
  return { tipo: 'contacto_solo', empresaAsoc: '', persona: name };
}

export function nombreParaMatchExcel(tipoFicha, empresaAsoc, nombreContacto, nombreBase) {
  if (tipoFicha === 'contacto_empresa' && empresaAsoc) return empresaAsoc;
  if (tipoFicha === 'empresa') return nombreBase || nombreContacto;
  return nombreContacto || nombreBase;
}

export function contactoVinculadoATabulador(o, exName, exKey) {
  const tipo = o.tipoFicha || '';
  if (tipo === 'contacto_solo') return false;
  if (tipo === 'empresa') {
    const nom = (o.nombreContacto || o.nombreBase || '').trim();
    if (!nom) return false;
    const nk = norm(nom);
    if (nk === exKey || (exKey.length >= 5 && nk.includes(exKey)) || (nk.length >= 5 && exKey.includes(nk))) {
      return true;
    }
    return similarity(nom, exName) >= 85;
  }
  if (tipo === 'contacto_empresa') {
    const emp = (o.empresaAsociada || '').trim();
    if (!emp) return false;
    return norm(emp) === exKey || similarity(emp, exName) >= 82 || tokenScore(emp, exName) >= 85;
  }
  return false;
}

export function buildTabuladorErp(excel, odoo) {
  const empresas = [];
  const relacionErp = [];
  for (const ex of excel) {
    const key = norm(ex.name);
    const contacts = odoo.filter((o) => contactoVinculadoATabulador(o, ex.name, key));
    const vd = ex.viajeDani || {};
    const g = {
      km: Math.round(Number(vd.km ?? ex.c1 ?? 0) * 100) / 100,
      litros: Math.round(Number(vd.litros ?? ex.c2 ?? 0) * 10000) / 10000,
      gasolinaViajeDani: Math.round(Number(vd.gasolina ?? 0) * 100) / 100,
      horasDani: Math.round(Number(vd.horas ?? ex.c4 ?? 0) * 100) / 100,
      totalViajeDani: Math.round(Number(vd.totalViaje ?? 0) * 100) / 100,
      modulos: ex.modulos || {},
      gasolina: Math.round(Number(ex.c3 ?? 0) * 100) / 100,
      ventas: Math.round(Number(ex.c5 ?? 0) * 100) / 100,
      total: Math.round(Number(ex.c6 ?? 0) * 100) / 100,
    };
    empresas.push({
      key,
      nombreExcel: ex.name,
      nombreEnHoja: ex.nameExcel || ex.name,
      rfc: ex.rfc || '',
      gastos: g,
      sheets: ex.sheets || [],
      excel: ex,
      contacts,
      contactCount: contacts.length,
      tieneCapturasOdoo: contacts.length > 0,
      enHoja1: Boolean(ex.enHoja1 || g.km),
      gastosHeredadosDe: ex.gastosHeredadosDe || '',
      soloEnExcelSinOdoo: contacts.length === 0,
    });
    relacionErp.push({
      empresaTabulador: ex.name,
      rfc: ex.rfc || '',
      km: g.km,
      viajeDani: vd,
      modulos: g.modulos,
      total: g.total,
      contactosOdoo: contacts.map((c) => ({
        id: c.id,
        nombreEnImagen: c.nombreContacto,
        persona: c.contactoPersona || c.person,
        tipoFicha: c.tipoFicha,
        empresaAsociada: c.empresaAsociada,
        email: c.email,
        tel: c.tel,
        matchScore: c.matchScore,
      })),
    });
  }
  empresas.sort((a, b) => {
    if (a.tieneCapturasOdoo !== b.tieneCapturasOdoo) return a.tieneCapturasOdoo ? -1 : 1;
    if (b.contactCount !== a.contactCount) return b.contactCount - a.contactCount;
    return a.nombreExcel.localeCompare(b.nombreExcel);
  });
  const linkedIds = new Set(empresas.flatMap((e) => e.contacts.map((c) => c.id)));
  return {
    empresas,
    conCapturasOdoo: empresas.filter((e) => e.tieneCapturasOdoo),
    sinCapturasOdoo: empresas.filter((e) => !e.tieneCapturasOdoo),
    odooSinTabulador: odoo.filter((o) => !linkedIds.has(o.id)),
    relacionErp,
  };
}

export function blankExcelClient(name, nameExcel = null) {
  return {
    name,
    nameExcel: nameExcel || name,
    sheets: [],
    modulos: {},
    viajeDani: {},
    c1: 0,
    c2: 0,
    c3: 0,
    c4: 0,
    c5: 0,
    c6: 0,
    rfc: RFC_BY_COMPANY[norm(name)] || '',
    address: '',
    contact: '',
    enHoja1: false,
    gastosHeredadosDe: '',
    excelFuente: '',
  };
}
