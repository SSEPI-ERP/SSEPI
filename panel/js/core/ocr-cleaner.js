/**
 * ocr-cleaner.js — Puerto browser de los sanitizadores OCR (scripts/imports/ocr-ssepi-rules.mjs).
 * Re-exporta las funciones puras como globales en `window.OCRCleaner` para uso desde
 * el panel (taller.js) sin duplicar lógica.
 *
 * Mantener sincronizado con scripts/imports/ocr-ssepi-rules.mjs.
 */
(function () {
  'use strict';

  const UI_WORDS = new Set([
    'contactos', 'ventas', 'facturado', 'reuniones', 'compras', 'documentos',
    'nuevo', 'enviar mensaje', 'registrar', 'whatsapp', 'actividad',
    'persona o empresa', 'correo electronico', 'puesto de trabajo', 'sitio web',
    'idioma', 'ninguno', 'odoo.com', 'kanban', 'lista', 'persona', 'empresa',
    'adjuntar archivos', 'movimiento de inventario', 'stock', 'referencia de reparacion',
    'reportada', 'material', 'materia',
  ]);

  const UI_PHRASES = [
    'adjuntar archivos', 'movimiento de inventario', 'movimiento de inentario',
    'stock>stock', 'referencia de reparacion', 'referencia de reparación',
    'cliente?', 'reportada.', 'reportada', 'datos generales', 'orden en reparacion',
    'orden en reparación', 'whatsapp', 'actividad', 'archivos', 'material', 'materia',
    'confirmado -', 'nuevo de', 'en cancelado',
    'crear cotizacion', 'crear cotización',
    'cancelar reparacion', 'cancelar reparación',
    'enviar mensaje', 'registrar una nota',
    'movimiento de inventario', 'stock>',
  ];

  const ODOO_UI_RE = /crear\s*cotizaci[oó]n|cancelar\s*reparaci[oó]n|enviar\s*mensaje|registrar\s*una\s*nota|whatsapp|actividad\s*n|en\s*reparaci[oó]n|movimiento\s+de\s+inventario|stock\s*>|orden\s+de\s+reparaci[oó]n\s+creado|referencia\s+de\s+reparaci[oó]n|adjuntar\s*archivos|reportada\.?$/i;

  const ACTIVITY_NOISE_RE = [
    /\b(?:en\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,12}\s+[A-ZÁÉÍÓÚÑ][a-z]{1,4}\s+\d{1,2}\s+pt\s+\d{4}[^.]*?(?:\d+\s*m\.?)?/gi,
    /\bEn\s+E\.?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,12}\s+[A-ZÁÉÍÓÚÑ][a-z]{1,4}\s+\d{1,2}\s+[a-z]{2,4}\s+\d{4}\s+\d{1,3}\s*m\.?/gi,
    /\b\d{1,2}\s+pt\s+20\d{2,4}[^.]{0,80}/gi,
    /\blag\s+[A-Z][a-z]+\s+Gr\b/gi,
    /\b—\s*\(\s*\)\s*\.?\s*En\s+E\./gi,
    /\bactividad\s*\d*\s*n[°º]?\s*\d*/gi,
  ];

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function cleanText(s, maxLen) {
    if (!s || typeof s !== 'string') return '';
    maxLen = maxLen || 2000;
    let t = s.replace(/\r/g, '\n');
    t = t.replace(/[‘’“”]/g, "'");
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

  function cleanCliente(s) {
    let t = cleanText(s, 120);
    if (!t) return '';
    t = t.replace(/^(cliente|customer)\s*[\?:]?\s*/i, '').trim(' -–—');
    if (/^[\?\*\#\@\;\:\%\=\+\<\>\[\]\{\}\\\|\^\~\`\"\'\,\.\_\-\s\d]{2,}$/.test(t)) return '';
    const letters = [...t].filter((c) => /[a-záéíóúñ]/i.test(c)).length;
    if (t.length > 2 && letters / t.length < 0.35) return '';
    if (t.length <= 2) return '';
    return t;
  }

  function cleanEquipo(s) {
    const t = cleanText(s, 200);
    if (!t) return '';
    if (t.length >= 3 && t.length <= 120) return t;
    return '';
  }

  function isOdooUiGarbage(text) {
    if (!text || text.length < 12) return false;
    const lo = text.toLowerCase();
    if (ODOO_UI_RE.test(lo)) return true;
    const hits = UI_PHRASES.filter((p) => lo.includes(p)).length;
    if (hits >= 2) return true;
    return false;
  }

  function stripUiFromDiagnostico(d) {
    let t = cleanText(d, 2000);
    if (!t || isOdooUiGarbage(t)) return '';
    t = t.replace(/crear\s*cotizaci[oó]n\s*[—\-]?\s*cancelar\s*reparaci[oó]n[^.]*?(?=\.|$)/gi, ' ');
    t = t.replace(/enviar\s*mensaje[^.]*?actividad/gi, ' ');
    t = t.replace(/wh\/?ro\/\d+/gi, ' ');
    for (const re of ACTIVITY_NOISE_RE) {
      t = t.replace(re, ' ');
    }
    t = t.replace(/\b(bajo\s+garant[ií]a)\b/gi, ' ');
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

  /**
   * Sanitiza un campo según su tipo.
   *   fieldType: 'cliente' | 'equipo' | 'falla' | 'notas' | 'diagnostico'
   * Si el resultado es vacío, devuelve el `value` original (no pisa con blanco).
   */
  function sanitizeField(fieldType, value) {
    if (value == null) return '';
    const original = String(value);
    let cleaned = '';
    switch (fieldType) {
      case 'cliente': cleaned = cleanCliente(original); break;
      case 'equipo':  cleaned = cleanEquipo(original); break;
      case 'falla':   cleaned = cleanText(original, 500); break;
      case 'notas':   cleaned = cleanText(original, 3000); break;
      case 'diagnostico': cleaned = stripUiFromDiagnostico(original); break;
      default:        cleaned = cleanText(original, 2000);
    }
    return cleaned || original;
  }

  window.OCRCleaner = {
    cleanText,
    cleanCliente,
    cleanEquipo,
    isOdooUiGarbage,
    stripUiFromDiagnostico,
    normKey,
    sanitizeField,
    UI_PHRASES,
    UI_WORDS,
  };
})();
