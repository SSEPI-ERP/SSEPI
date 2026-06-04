/**
 * Agrupación de contactos por empresa — misma lógica que contactos.js (Pac_Contactos).
 * Evita encabezados OCR tipo "— NOMBRE CE I." en selects de Taller/Motores.
 */

/** Basura OCR al inicio del nombre (em-dash, símbolos, iniciales sueltas). */
export const OCR_NOISE_START = /^[A-Z]\s|^[)\]}\-_,.;:!?¡¿'"`~\\\/—–]|^[A-Z]{1,2}\s[A-Z]/;

/** Fragmentos típicos de capturas Odoo mal leídas. */
export const OCR_NOISE_PHRASE = /NOMBRE\s*CE|NOMORE\s*CE|NOVO\s*CE|OMORE\s*CE|^IC\s+I\b/i;

export function normEmpresaKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGarbageContactName(s) {
  const t = String(s || '').trim();
  if (!t || t.length < 3) return true;
  if (OCR_NOISE_START.test(t)) return true;
  if (OCR_NOISE_PHRASE.test(t)) return true;
  return false;
}

/**
 * Clave de grupo empresa para un contacto (alineado con contactos.js).
 * @returns {string} clave normalizada o '' si no debe agruparse bajo empresa OCR
 */
export function empresaGrupoKey(c) {
  if (!c) return '';
  const tipo = c.tipo_ficha || '';
  if (tipo === 'empresa' || c.categoria === 'empresa') {
    if (c.empresa_tabulador && String(c.empresa_tabulador).trim()) {
      return normEmpresaKey(c.empresa_tabulador);
    }
    const nom = (c.nombre || '').trim();
    if (nom && !isGarbageContactName(nom)) return normEmpresaKey(nom);
    return '';
  }
  if (tipo === 'contacto_empresa') {
    if (c.empresa_tabulador && String(c.empresa_tabulador).trim()) {
      return normEmpresaKey(c.empresa_tabulador);
    }
    const base = (c.empresa || '').trim();
    if (!base || isGarbageContactName(base)) return '';
    const nomEmp = normEmpresaKey(c.nombre);
    const keyEmp = normEmpresaKey(base);
    if (nomEmp && nomEmp === keyEmp) return '';
    return keyEmp;
  }
  // Legacy: contacto con empresa válida (sin tipo_ficha)
  const tab = (c.empresa_tabulador || '').trim();
  if (tab) return normEmpresaKey(tab);
  const emp = (c.empresa || '').trim();
  const nom = (c.nombre || '').trim();
  if (emp && emp !== nom && !isGarbageContactName(emp)) return normEmpresaKey(emp);
  return '';
}

/** Etiqueta visible del grupo (prioriza tabulador oficial). */
export function empresaGrupoLabel(key, miembros, tabuladorClientes) {
  if (!key) return '';
  const tab = (tabuladorClientes || []).find(
    (tc) => tc.nombre && normEmpresaKey(tc.nombre) === key
  );
  if (tab) return tab.nombre;
  for (const c of miembros || []) {
    if (c.empresa_tabulador && normEmpresaKey(c.empresa_tabulador) === key) {
      return String(c.empresa_tabulador).trim();
    }
    const nom = (c.nombre || '').trim();
    if ((c.tipo_ficha === 'empresa' || c.categoria === 'empresa') && nom && !isGarbageContactName(nom)) {
      return nom;
    }
  }
  const fallback = (miembros && miembros[0] && (miembros[0].empresa_tabulador || miembros[0].empresa)) || key;
  return isGarbageContactName(fallback) ? key.toUpperCase() : String(fallback).trim();
}

/** Nombre apto para <option> (excluye basura OCR). */
export function contactoDisplayNombre(c) {
  if (!c) return '';
  const nom = (c.nombre || '').trim();
  if (nom && !isGarbageContactName(nom)) return nom;
  const emp = (c.empresa_tabulador || c.empresa || '').trim();
  if (emp && !isGarbageContactName(emp)) return emp;
  return '';
}
