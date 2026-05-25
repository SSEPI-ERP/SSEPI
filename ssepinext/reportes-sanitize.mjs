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

function stripUiFromDiagnostico(d) {
  let t = cleanText(d, 2000);
  if (!t || isOdooUiGarbage(t)) return '';
  t = t.replace(
    /crear\s*cotizaci[oó]n\s*[—\-]?\s*cancelar\s*reparaci[oó]n[^.]*?(?=\.|$)/gi,
    ' '
  );
  t = t.replace(/enviar\s*mensaje[^.]*?actividad/gi, ' ');
  t = t.replace(/wh\/?ro\/\d+/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (isOdooUiGarbage(t)) return '';
  return t;
}

function detectBajoGarantia(rec) {
  const blob = `${rec.vendedor || ''} ${rec.equipo || ''} ${rec.componente || ''} ${rec.bajo_garantia || ''}`.toLowerCase();
  return /bajo\s*garant[ií]a|es\s+de\s+garant[ií]a|ya\s+que\s+es\s+de\s+garant/i.test(blob);
}

function cleanVendedor(v) {
  const t = cleanText(v, 80);
  if (!t) return '';
  if (/bajo\s*garant[ií]a/i.test(t)) return t;
  if (isOdooUiGarbage(t)) return '';
  if (/^daniel\s+zu[nñ]iga/i.test(t)) return t;
  if (t.split(' ').length <= 5 && t.length >= 4 && /[a-záéíóú]/i.test(t)) return t;
  return '';
}

function cleanSerie(componente, equipo) {
  const c = cleanText(componente, 80);
  if (!c) return '';
  if (/bajo\s*garant/i.test(c)) return '';
  if (EQUIPO_ES_DIAGNOSTICO_RE.test(c) && c.length > 30) return '';
  if (c.length > 60) return '';
  return c;
}

function shortFalla(equipo, diagnostico, notas) {
  const eq = cleanEquipo(equipo) || cleanText(equipo, 120);
  if (eq && !EQUIPO_ES_DIAGNOSTICO_RE.test(eq)) return eq.slice(0, 200);
  const d = stripUiFromDiagnostico(diagnostico);
  if (d) {
    const first = d.split(/[.!?]\s+/)[0];
    if (first && first.length >= 10 && !isOdooUiGarbage(first)) return first.slice(0, 200);
  }
  const n = stripUiFromDiagnostico(notas);
  if (n) return n.slice(0, 200);
  return 'Falla por documentar';
}

/**
 * @returns registro normalizado listo para buildBaseOrder
 */
export function sanitizeReporteRecord(rec) {
  const folio = normalizeFolioRef(rec.referencia_reparacion || rec._folder || '');
  const folder = rec._folder || folio.replace(/\//g, '-').replace(/^SP-E/, 'SP-') || folio;

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

  const diagnostico = stripUiFromDiagnostico(rec.diagnostico || rec.descripcion);
  const solucion = cleanText(rec.solucion, 1500);
  const historial = cleanText(rec.historial_actividad, 3000);
  const notas = cleanText(rec.notas, 800);
  const bajoGarantia = detectBajoGarantia(rec);
  const vendedor = cleanVendedor(rec.vendedor);
  const encargado = cleanText(rec.encargado, 80);
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
    componente: cleanSerie(rec.componente, rec.equipo),
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
    falla_corta: shortFalla(rec.equipo, diagnostico, notas),
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
