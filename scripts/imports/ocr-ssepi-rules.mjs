/**
 * Reglas OCR unificadas (limpiar_datos.py + escaner + comparador).
 */
export const UI_WORDS = new Set([
  'contactos', 'ventas', 'facturado', 'reuniones', 'compras', 'documentos',
  'nuevo', 'enviar mensaje', 'registrar', 'whatsapp', 'actividad',
  'persona o empresa', 'correo electronico', 'puesto de trabajo', 'sitio web',
  'idioma', 'ninguno', 'odoo.com', 'kanban', 'lista', 'persona', 'empresa',
  'adjuntar archivos', 'movimiento de inventario', 'stock', 'referencia de reparacion',
  'reportada', 'material', 'materia',
]);

export const UI_PHRASES = [
  'adjuntar archivos', 'movimiento de inventario', 'movimiento de inentario',
  'stock>stock', 'referencia de reparacion', 'referencia de reparación',
  'cliente?', 'reportada.', 'reportada', 'datos generales', 'orden en reparacion',
  'orden en reparación', 'whatsapp', 'actividad', 'archivos', 'material', 'materia',
  'confirmado -', 'nuevo de', 'en cancelado',
];

export const INVALID_NUMERO = new Set([
  'material', 'materia', 'equipo', 'encontro', 'ninguno', 'reportada',
  'confirmado', 'reparado', 'nuevo', 'cancelado', 'adjuntar', 'archivos',
]);

export const EQUIPO_TIPO_RE =
  /\b(VARIADOR(?:\s+DE\s+FRECUENCIA)?|SERVODRIVE|SERVO[\s\-]?DRIVE|INVERSOR|FUENTE|PLC|HMI|CNC|BASCULA|ENCODER|CONTROLADOR|MOTOR|ROBOT|PANEL|DISPLAY|DRIVE|CONVERSOR|TRANSFORMADOR|RELEVADOR|SERVOMOTOR)\b/i;

export const EQUIPO_ES_DIAGNOSTICO_RE =
  /se\s+(encontr|revis|comport|qued)|porque|llega\s+(por|sin)|funcion|enciende|relevador|fusible|mosfet|dañad|danad|reparaci[oó]n\s+de\s+servicio|orden\s+(en\s+repar|de\s+reparaci)|adjuntar|stock>|garantia|folio\s+sp/i;

/** Folios válidos de laboratorio (electrónica): siempre prefijo SP-E. */
export const FOLIO_VALID_RE = /^(SP-E|RE-|WHRO-)\d+/i;

const NOT_LAB_SP_RE = /^(SP-M|SP-A|SP-S|SP-OC|SP-SOP)/i;

/**
 * Convierte folios legacy de laboratorio (SP-0513, SP.0418, SP0687) → SP-E0513.
 * No altera SP-M, SP-A, soporte, etc.
 */
export function normalizeLabFolio(raw) {
  if (!raw) return '';
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (NOT_LAB_SP_RE.test(s)) return s;
  if (/^SP-E/i.test(s)) return s.replace(/^SP-E/i, 'SP-E');
  const hyphen = s.match(/^SP-(\d{2,})/i);
  if (hyphen) return `SP-E${hyphen[1]}`;
  const dot = s.match(/^SP\.(\d{2,})/i);
  if (dot) return `SP-E${dot[1]}`;
  const plain = s.match(/^SP(\d{3,})$/i);
  if (plain) return `SP-E${plain[1]}`;
  return s;
}

export function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function cleanText(s, maxLen = 2000) {
  if (!s || typeof s !== 'string') return '';
  let t = s.replace(/\r/g, '\n');
  t = t.replace(/[\u2018\u2019\u201c\u201d]/g, "'");
  const lo = t.toLowerCase();
  for (const phrase of UI_PHRASES) {
    if (lo.includes(phrase)) {
      t = t.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    }
  }
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\?\*\.\,\;\:\-\s'"]+/, '').replace(/[\?\*'"]+$/, '').trim();
  if (t.length > maxLen) t = `${t.slice(0, maxLen).replace(/\s+\S*$/, '')}...`;
  return t;
}

export function cleanCliente(s) {
  let t = cleanText(s, 120);
  if (!t) return '';
  t = t.replace(/^(cliente|customer)\s*[\?:]?\s*/i, '').trim(' -–—');
  if (/^[\?\*\#\@\;\:\%\=\+\<\>\[\]\{\}\\\|\^\~\`\"\'\,\.\_\-\s\d]{2,}$/.test(t)) return '';
  const letters = [...t].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
  if (t.length > 2 && letters / t.length < 0.35) return '';
  if (t.length <= 2) return '';
  return t;
}

export function cleanEquipo(s) {
  const t = cleanText(s, 200);
  if (!t || EQUIPO_ES_DIAGNOSTICO_RE.test(t)) return '';
  if (EQUIPO_TIPO_RE.test(t) && t.length < 120) return t;
  if (t.length >= 8 && t.length <= 80 && !EQUIPO_ES_DIAGNOSTICO_RE.test(t)) return t;
  return '';
}

export function cleanFolio(ref) {
  const s = cleanText(ref, 40).toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  const m = s.match(/(SP-E\d+|SP-M\d+|SP-A\d+|RE-\d+|WHRO-\d+|SP-\d+|SP\.\d+)/i);
  const hit = m ? m[1].toUpperCase() : s.startsWith('SP') ? s : '';
  return normalizeLabFolio(hit);
}

export function mapEstadoOdoo(raw) {
  const s = cleanText(raw, 50).toLowerCase();
  const map = {
    reparado: 'Reparado',
    'en reparacion': 'En reparación',
    'en reparación': 'En reparación',
    confirmado: 'Confirmado',
    nuevo: 'Nuevo',
    cancelado: 'Cancelado',
    entregado: 'Entregado',
    diagnostico: 'Diagnóstico',
    'diagnóstico': 'Diagnóstico',
    'en espera': 'En Espera',
  };
  return map[s] || 'Nuevo';
}

export function isValidLabFolio(folio) {
  if (!folio) return false;
  return FOLIO_VALID_RE.test(String(folio).trim());
}

export function parseReporteFromOcrRow(row) {
  const folio = cleanFolio(row.referencia_reparacion || row.numero_orden || '');
  return {
    folio,
    cliente: cleanCliente(row.cliente || ''),
    cliente_rfc: cleanText(row.cliente_rfc || '', 20),
    equipo: cleanEquipo(row.equipo || row.componente || ''),
    vendedor: cleanText(row.vendedor || '', 80),
    diagnostico: cleanText(row.diagnostico || '', 1500),
    solucion: cleanText(row.solucion || '', 1500),
    historial_actividad: cleanText(row.historial_actividad || '', 3000),
    estado: mapEstadoOdoo(row.estado_actual || ''),
    encargado: cleanText(row.encargado || '', 80),
    fecha_ingreso: cleanText(row.fecha_ingreso || row.fecha || '', 40),
    notas: cleanText(row.notas || '', 500),
    raw: row,
  };
}

export function groupTesseractLines(rawLines, minLen = 3) {
  if (!Array.isArray(rawLines)) return [];
  return rawLines
    .map((l) => cleanText(String(l), 500))
    .filter((l) => l.length >= minLen && ![...UI_WORDS].some((w) => l.toLowerCase() === w));
}
