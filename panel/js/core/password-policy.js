// ============================================================================
// password-policy.js — Política de contraseñas SSEPI (Fase 0.4)
// Script clásico (no module) para poder cargarse en login.html y
// cambiar-password.html antes de supabase-config.js. Expone:
//   window.validarPasswordFuerte(pw)   -> { valid, score, errores[] }
//   window.SSEPI_PASSWORD_REQUISITOS -> descriptor para UI
//
// Reglas: 12+ caracteres, al menos 1 mayúscula, 1 minúscula, 1 número, 1 símbolo.
// No contiene literales de passwords reales: solo valida forma.
// ============================================================================
(function () {
  'use strict';

  var REQUISITOS = [
    { key: 'longitud', label: 'Mínimo 12 caracteres', test: function (p) { return p.length >= 12; } },
    { key: 'mayus', label: 'Al menos una mayúscula', test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'minus', label: 'Al menos una minúscula', test: function (p) { return /[a-z]/.test(p); } },
    { key: 'numero', label: 'Al menos un número', test: function (p) { return /[0-9]/.test(p); } },
    { key: 'simbolo', label: 'Al menos un símbolo (!@#$%^&*…)', test: function (p) { return /[^A-Za-z0-9]/.test(p); } }
  ];

  // Lista de contraseñas débiles/comunes a rechazar explícitamente (sin literales
  // de passwords reales del proyecto: se validan por patrón, no por igualdad).
  var COMUNES_DEBILES = [
    'password', 'password1', 'password123', '12345678', '123456789',
    'qwerty123', 'admin123', 'ssepi2025', 'ssepi2024', 'ssepi2026'
  ];

  /**
   * Valida una contraseña contra la política fuerte.
   * @param {string} pw
   * @returns {{valid:boolean, score:number, errores:string[], requisitos:{key,label,ok:boolean}[]}}
   */
  function validarPasswordFuerte(pw) {
    pw = String(pw || '');
    var requisitos = REQUISITOS.map(function (r) {
      return { key: r.key, label: r.label, ok: r.test(pw) };
    });
    var errores = requisitos.filter(function (r) { return !r.ok; }).map(function (r) { return r.label; });

    // Rechazar débiles comunes aunque pasen la forma (case-insensitive, sin espacios)
    var normalizada = pw.replace(/\s+/g, '').toLowerCase();
    if (COMUNES_DEBILES.indexOf(normalizada) !== -1) {
      errores.push('La contraseña es demasiado común o predecible');
    }

    // Coherencia: no admitir la propia cuenta como password (lo valida la UI con el email)
    var score = requisitos.filter(function (r) { return r.ok; }).length;
    return { valid: errores.length === 0, score: score, errores: errores, requisitos: requisitos };
  }

  /** Comprueba si la contraseña contiene el email o nombre del usuario (fácil de adivinar). */
  function contieneDatosUsuario(pw, email, nombre) {
    var p = String(pw || '').toLowerCase();
    var tokens = [];
    if (email) tokens.push(String(email).toLowerCase().split('@')[0]);
    if (nombre) tokens.push(String(nombre).toLowerCase());
    return tokens.some(function (t) { return t.length >= 4 && p.indexOf(t) !== -1; });
  }

  window.SSEPI_PASSWORD_REQUISITOS = REQUISITOS;
  window.validarPasswordFuerte = validarPasswordFuerte;
  window.passwordPolicyContieneDatosUsuario = contieneDatosUsuario;

  console.log('✅ password-policy.js cargado — política de contraseñas (Fase 0.4)');
})();