// ================================================
// ARCHIVO: security-middleware.js
// DESCRIPCIÓN: Funciones de seguridad para todas las páginas (CSP, rate limiting, etc.)
// SEGURIDAD: Implementa Content Security Policy, protección CSRF, validación de sesión.
// ================================================

// ==================== CONTENT SECURITY POLICY ====================
// CSP se aplica vía <meta>; en producción conviene enviarla también por cabecera HTTP desde el servidor.
// Cabeceras HSTS, X-Frame-Options, X-Content-Type-Options: deben configurarse en el servidor (ver scripts/serve-with-headers.js o proxy).
export function applyCSP() {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = `
    default-src 'self';
    script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com 'unsafe-inline' 'unsafe-eval';
    style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline';
    font-src 'self' https://fonts.gstatic.com data:;
    img-src 'self' data: https://images.unsplash.com;
    connect-src 'self' https://knzmdwjmrhcoytmebdwa.supabase.co wss://knzmdwjmrhcoytmebdwa.supabase.co https://cdn.jsdelivr.net https://api.ipify.org;
    base-uri 'self';
    form-action 'self';
  `.replace(/\s+/g, ' ').trim();
  document.head.appendChild(meta);
}

// ==================== TOKEN CSRF ====================
let csrfToken = null;

export function generateCSRFToken() {
  if (!csrfToken) {
    csrfToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem('csrfToken', csrfToken);
  }
  return csrfToken;
}

export function validateCSRFToken(token) {
  const stored = sessionStorage.getItem('csrfToken');
  return stored && stored === token;
}

// ==================== RATE LIMITING CLIENTE (preventivo) ====================
const requestCounts = new Map();

export function checkRateLimit(ip = 'client') {
  const now = Date.now();
  const minute = 60 * 1000;
  const maxRequests = 60; // 60 por minuto

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const timestamps = requestCounts.get(ip).filter(t => now - t < minute);
  timestamps.push(now);
  requestCounts.set(ip, timestamps);

  return timestamps.length <= maxRequests;
}

// ==================== SANITIZACIÓN DE ENTRADAS ====================
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = typeof value === 'string' ? sanitizeInput(value) : value;
  }
  return sanitized;
}

// ==================== PROTECCIÓN XSS (escapado de salidas) ====================
export function escapeHTML(str) {
  return String(str).replace(/[&<>"]/g, function(match) {
    if (match === '&') return '&amp;';
    if (match === '<') return '&lt;';
    if (match === '>') return '&gt;';
    if (match === '"') return '&quot;';
    return match;
  });
}

// ==================== MIDDLEWARE DE AUTENTICACIÓN (para páginas) ====================
export async function requireAuth(redirectTo = '/') {
  const { data: { user }, error } = await window.supabase.auth.getUser();
  if (error || !user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

export async function requireRole(allowedRoles, redirectTo = '/') {
  const user = await requireAuth(redirectTo);
  if (!user) return null;

  const { data: profile, error } = await window.supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single();

  if (error || !profile || !allowedRoles.includes(profile.rol)) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

// ==================== INICIALIZACIÓN DE SEGURIDAD EN PÁGINA ====================
export function initSecurity() {
  applyCSP();
  generateCSRFToken();

  // Adjuntar token CSRF a todos los formularios automáticamente
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.method?.toLowerCase() === 'post') {
      let csrfInput = form.querySelector('input[name="_csrf"]');
      if (!csrfInput) {
        csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = '_csrf';
        csrfInput.value = csrfToken;
        form.appendChild(csrfInput);
      }
    }
  });
}

// Exponer en window para bootstrap en index.html y pages/*.html (evita TypeError initSecurity)
window.securityMiddleware = {
  initSecurity,
  requireAuth,
  requireRole,
  generateCSRFToken,
  validateCSRFToken
};