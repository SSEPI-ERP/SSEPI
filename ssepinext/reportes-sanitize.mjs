/**
 * Limpieza de registros OCR / Odoo antes de importar a BD local.
 * Evita que texto de UI (Crear cotización, WhatsApp, etc.) llene cliente/falla.
 */
import {
  cleanText,
  cleanCliente,
  cleanEquipo,
  cleanFolio,
  mapEstadoOdoo,
  UI_PHRASES,
  EQUIPO_ES_DIAGNOSTICO_RE,
} from '../scripts/imports/ocr-ssepi-rules.mjs';

const ODOO_UI_RE =
  /crear\s*cotizaci[oó]n|cancelar\s*reparaci[oó]n|enviar\s*mensaje|registrar\s*una\s*nota|whatsapp|actividad\s*n|en\s*reparaci[oó]n|movimiento\s+de\s+inventario|stock\s*>|orden\s+de\s+reparaci[oó]n\s+creado|referencia\s+de\s+reparaci[oó]n|adjuntar\s+archivos|reportada\.?$/i;

const ESTADO_UI_RE =
  /^(nuevo|confirmado|reparado|cancelado|entregado|diagn[oó]stico|en\s+espera)(\s*[>|—\-]\s*)+/i;

export function normalizeFolioRef(raw) {
  let s = cleanText(raw || '', 40).toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  const mWh = s.match(/^WH\/?RO\/?0*(\d+)/i) || s.match(/^WHRO0*(\d+)/i);
  if (mWh) return `WH/RO/${mWh[1].padStart(5, '0')}`;
  const mSp = s.match(/^SP-?E?0*(\d{3,5})$/i);
  if (mSp) return `SP-E${mSp[1].padStart(4, '0')}`;
  const mSpPlain = s.match(/^SP-?(\d{3,5})$/i);
  if (mSpPlain) return `SP-E${mSpPlain[1].padStart(4, '0')}`;
  return s;
}

export function isOdooUiGarbage(text) {
  if (!text || text.length < 12) return false;
  const lo = text.toLowerCase();
  if (ODOO_UI_RE.test(lo)) return true;
  const hits = UI_PHRASES.filter((p) => lo.includes(p)).length;
  if (hits >= 2) return true;
  if (ESTADO_UI_RE.test(text) && text.length > 40) return true;
  if (/crear.*cancelar.*reparado/i.test(lo) && text.length > 50) return true;
  return false;
}

export function extractClienteFromBlob(...parts) {
  const blob = parts.filter(Boolean).join('\n');
  const patterns = [
    /cliente["'”]?\s*[:\.]?\s*([^.\n]{4,120})/i,
    /cliente\?\s*([^.\n]{4,80})/i,
    /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúñ0-9\s,\.&\-]{8,80}(?:S\.?\s*A\.?\s*de\s*C\.?\s*V\.?|S\.?\s*de\s*R\.?\s*L\.?))/,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m) {
      const c = cleanCliente(m[1]);
      if (c && !isOdooUiGarbage(c)) return c;
    }
  }
  return '';
}

export function extractRfcFromBlob(blob) {
  const m = (blob || '').match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
  return m ? m[1] : '';
}

/** Solo estos técnicos son encargado de laboratorio (incl. abreviados OCR) */
const ENCARGADOS = [
  { label: 'Javier Cruz', re: /\bjavier\s*(?:cruz|cuz|gr)\b/i },
  { label: 'Aron', re: /\bar[oó]n(?:\s+garc[ií]a)?\b/i },
];

/** Solo estos nombres son vendedores */
const VENDEDORES = [
  // OCR: zuniga, zuñiga, zufiga, zufiiga + número opcional
  { label: 'Daniel Zuñiga', re: /\bdaniel\s+zu(?:ñ|n|f)(?:i|í|l|n|ñ|g|f)*a\b(?:\s*\d+)?/i },
  // Carlos es ambiguo (puede ser parte de razón social). Mantener conservador.
  { label: 'Carlos', re: /\bcarlos\b(?:\s*\d+)?(?!\s+(plastic|sa|de|c\.v))/i },
];

/** Rastro Odoo actividad / chat (nombres abreviados + fechas + "pt") */
const ACTIVITY_NOISE_RE = [
  /\b(?:en\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,12}\s+[A-ZÁÉÍÓÚÑ][a-z]{1,4}\s+\d{1,2}\s+pt\s+\d{4}[^.]*?(?:\d+\s*m\.?)?/gi,
  /\bEn\s+E\.?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,12}\s+[A-ZÁÉÍÓÚÑ][a-z]{1,4}\s+\d{1,2}\s+[a-z]{2,4}\s+\d{4}\s+\d{1,3}\s*m\.?/gi,
  /\b\d{1,2}\s+pt\s+20\d{2,4}[^.]{0,80}/gi,
  /\blag\s+[A-Z][a-z]+\s+Gr\b/gi,
  /\b—\s*\(\s*\)\s*\.?\s*En\s+E\./gi,
  /\bactividad\s*\d*\s*n[°º]?\s*\d*/gi,
];

function matchStaff(text, list) {
  if (!text) return '';
  for (const p of list) {
    if (p.re.test(text)) return p.label;
  }
  return '';
}

function extractStaffFromBlob(blob) {
  let encargado = '';
  let vendedor = '';
  for (const p of ENCARGADOS) {
    if (p.re.test(blob)) {
      encargado = p.label;
      break;
    }
  }
  for (const p of VENDEDORES) {
    if (p.re.test(blob)) {
      vendedor = p.label;
      break;
    }
  }
  return { encargado, vendedor };
}

function stripStaffNamesFromText(text, encargado, vendedor) {
  let t = text || '';
  for (const p of ENCARGADOS) {
    t = t.replace(p.re, ' ');
  }
  for (const p of VENDEDORES) {
    t = t.replace(p.re, ' ');
  }
  if (encargado) t = t.replace(new RegExp(encargado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  if (vendedor) t = t.replace(new RegExp(vendedor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  return t;
}

function stripUiFromDiagnostico(d) {
  let t = cleanText(d, 2000);
  if (!t || isOdooUiGarbage(t)) return '';
  t = t.replace(
    /crear\s*cotizaci[oó]n\s*[—\-]?\s*cancelar\s*reparaci[oó]n[^.]*?(?=\.|$)/gi,
    ' '
  );
  t = t.replace(/enviar\s*mensaje[^.]*?actividad/gi, ' ');
  t = t.replace(/wh\/?ro\/\d+/gi, ' ');
  for (const re of ACTIVITY_NOISE_RE) {
    t = t.replace(re, ' ');
  }
  t = t.replace(/\b(bajo\s+garant[ií]a)\b/gi, ' '); // va en checkbox, no en diagnóstico
  t = t.replace(/^\d+\s*\.\s*reporte\s*[—\-:.]*\s*/i, ' ');
  t = t.replace(/\blag\s+[^.]{0,60}/gi, ' ');
  t = t.replace(/\ben\s+e\.?\s*/gi, ' ');
  t = t.replace(/[—\-]\s*\(\s*\)\s*\.?/g, ' ');
  t = t.replace(/\(\s*[^)]{0,20}\)\s*/g, ' ');
  t = t.replace(/[,.]\s*$/g, '').replace(/^\s*[,.]\s*/, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (isOdooUiGarbage(t)) return '';
  return t;
}

function detectBajoGarantia(rec) {
  const blob = `${rec.vendedor || ''} ${rec.equipo || ''} ${rec.componente || ''} ${rec.bajo_garantia || ''}`.toLowerCase();
  return /bajo\s*garant[ií]a|es\s+de\s+garant[ií]a|ya\s+que\s+es\s+de\s+garant/i.test(blob);
}

function cleanVendedor(v, blobForFallback = '') {
  const blob = [v, blobForFallback].filter(Boolean).join(' ');
  if (/bajo\s*garant[ií]a/i.test(blob) && !matchStaff(blob, VENDEDORES)) return '';
  return matchStaff(v, VENDEDORES) || matchStaff(blobForFallback, VENDEDORES);
}

function cleanEncargado(v, blobForFallback = '') {
  return matchStaff(v, ENCARGADOS) || matchStaff(blobForFallback, ENCARGADOS);
}

function cleanSerie(componente, equipo) {
  const c = cleanText(componente, 80);
  if (!c) return '';
  if (/bajo\s*garant/i.test(c)) return '';
  if (EQUIPO_ES_DIAGNOSTICO_RE.test(c) && c.length > 30) return '';
  if (c.length > 60) return '';
  return c;
}

function parseComponenteFalla(componente) {
  const c = cleanText(componente, 120);
  if (!c) return { serie: '', fallaExtra: '' };
  if (/^falla\b/i.test(c)) {
    return { serie: '', fallaExtra: c.replace(/^falla\s*/i, '').trim() };
  }
  return { serie: cleanSerie(c), fallaExtra: '' };
}

function shortFalla(equipo, diagnostico, notas, fallaExtra) {
  if (fallaExtra && fallaExtra.trim().length >= 5) return fallaExtra.trim().slice(0, 200);
  const eq0 = cleanEquipo(equipo) || cleanText(equipo, 120);
  const eq = stripStaffNamesFromText(eq0, '', '');
  if (
    eq
    && eq !== 'Equipo por identificar'
    && !EQUIPO_ES_DIAGNOSTICO_RE.test(eq)
    && !matchStaff(eq, VENDEDORES)
    && !matchStaff(eq, ENCARGADOS)
  ) {
    return eq.slice(0, 200);
  }
  const d = stripUiFromDiagnostico(stripStaffNamesFromText(diagnostico, '', ''));
  if (d) {
    const first = d.split(/[.!?]\s+/)[0];
    if (first && first.length >= 10 && !isOdooUiGarbage(first)) return first.slice(0, 200);
  }
  const n = stripUiFromDiagnostico(stripStaffNamesFromText(notas, '', ''));
  if (n) return n.slice(0, 200);
  return 'Falla por documentar';
}

/**
 * @returns registro normalizado listo para buildBaseOrder
 */
export function sanitizeReporteRecord(rec) {
  const folio = normalizeFolioRef(rec.referencia_reparacion || rec._folder || '');
  const folder = rec._folder || folio.replace(/\//g, '-').replace(/^SP-E/, 'SP-') || folio;

  const staffBlob = [
    rec.diagnostico,
    rec.descripcion,
    rec.notas,
    rec.historial_actividad,
    rec.encargado,
    rec.vendedor,
    rec.equipo,
  ]
    .filter(Boolean)
    .join('\n');

  const staff = extractStaffFromBlob(staffBlob);
  let encargado = cleanEncargado(rec.encargado, staffBlob) || staff.encargado;
  let vendedor = cleanVendedor(rec.vendedor, staffBlob) || staff.vendedor;

  let cliente = cleanCliente(rec.cliente);
  if (!cliente || isOdooUiGarbage(cliente)) {
    cliente = extractClienteFromBlob(rec.notas, rec.diagnostico, rec.historial_actividad, rec.descripcion);
  }

  let equipo = cleanEquipo(rec.equipo);
  if (!equipo && rec.equipo) {
    const raw = cleanText(rec.equipo, 120);
    if (raw && !EQUIPO_ES_DIAGNOSTICO_RE.test(raw) && raw.length < 80) equipo = raw;
  }
  if (equipo && /vendedor\s+daniel/i.test(equipo)) {
    equipo = equipo.replace(/vendedor\s+daniel\s+zu[nñ]iga.*/i, '').trim() || 'Equipo por identificar';
  }
  if (equipo && matchStaff(equipo, ENCARGADOS)) {
    equipo = 'Equipo por identificar';
  }
  if (equipo && matchStaff(equipo, VENDEDORES)) {
    equipo = 'Equipo por identificar';
  }

  let diagnosticoRaw = [rec.diagnostico, rec.descripcion].filter(Boolean).join(' ');
  diagnosticoRaw = stripStaffNamesFromText(diagnosticoRaw, encargado, vendedor);
  const diagnostico = stripUiFromDiagnostico(diagnosticoRaw);

  const compParts = parseComponenteFalla(rec.componente);
  const componente = compParts.serie;

  const solucion = cleanText(rec.solucion, 1500);
  let historial = cleanText(rec.historial_actividad, 3000);
  historial = stripStaffNamesFromText(historial, encargado, vendedor);
  let notas = cleanText(rec.notas, 800);
  notas = stripStaffNamesFromText(notas, encargado, vendedor);
  const bajoGarantia = detectBajoGarantia(rec);
  const rfc = (rec.cliente_rfc || '').trim() || extractRfcFromBlob(`${rec.cliente} ${rec.notas} ${rec.diagnostico}`);

  let estado = mapEstadoOdoo(rec.estado_actual);
  if (!estado || estado === 'Nuevo') {
    const lo = cleanText(rec.estado_actual, 40).toLowerCase();
    if (lo.includes('reparado')) estado = 'Reparado';
    else if (lo.includes('confirmado')) estado = 'Confirmado';
    else if (lo.includes('cancelado')) estado = 'Cancelado';
  }

  const referenciaOdoo = (rec.numero_orden || '').match(/WH\/?RO\/\d+/i)
    ? rec.numero_orden.match(/WH\/?RO\/\d+/i)[0]
    : (notas + diagnostico).match(/WH\/?RO\/\d+/i)?.[0] || '';

  return {
    referencia_reparacion: folio,
    _folder: folder,
    estado_actual: estado,
    cliente: cliente || 'Cliente por identificar',
    cliente_rfc: rfc,
    equipo: equipo || 'Equipo por identificar',
    componente,
    bajo_garantia: bajoGarantia,
    fecha_ingreso: rec.fecha_ingreso || rec.fecha || '',
    fecha: rec.fecha || '',
    encargado,
    vendedor,
    materiales: cleanText(rec.materiales, 500),
    notas,
    diagnostico,
    solucion,
    historial_actividad: historial,
    descripcion: cleanText(rec.descripcion, 1500),
    referencia_odoo: referenciaOdoo,
    falla_corta: shortFalla(rec.equipo, diagnostico, notas, compParts.fallaExtra),
    _sanitized: true,
  };
}

export function folderCandidates(rec) {
  const folio = rec.referencia_reparacion || rec._folder || '';
  const base = normalizeFolioRef(folio);
  const short = base.replace(/^SP-E/, 'SP-');
  const names = new Set([rec._folder, base, short, folio].filter(Boolean));
  return [...names];
}
