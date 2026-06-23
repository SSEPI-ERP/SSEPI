// ============================================================================
// file-validator.js — Validación de archivos subidos por el usuario (Fase 1.2)
// Mitiga la superficie de ataque de SheetJS (xlsx 0.18.5 cargado en navegador):
//   - tamaño máximo (default 5MB)
//   - extensión en lista blanca
//   - magic bytes reales (PK\x03\x04 zip/OOXML para xlsx; D0CF11E0 OLE2 para xls)
// Script clásico (no module) para cargarse antes que los módulos de página.
// Expone: window.validarArchivoSeguro(file, opts) -> {ok:boolean, error?:string}
// ============================================================================
(function () {
  'use strict';

  var DEFAULT_MAX = 5 * 1024 * 1024; // 5 MB
  var DEFAULT_PERMITIDOS = ['xlsx', 'xls', 'csv', 'txt', 'pdf'];

  function extOf(name) {
    var n = String(name || '').toLowerCase();
    var i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i + 1) : '';
  }

  async function _magicXlsxOk(file) {
    try {
      var buf = await file.slice(0, 4).arrayBuffer();
      var h = new Uint8Array(buf);
      // ZIP/OOXML (xlsx): 50 4B 03 04  |  OLE2 (xls legacy): D0 CF 11 E0
      var isZip = h[0] === 0x50 && h[1] === 0x4B && h[2] === 0x03 && h[3] === 0x04;
      var isOle = h[0] === 0xD0 && h[1] === 0xCF && h[2] === 0x11 && h[3] === 0xE0;
      return isZip || isOle;
    } catch (e) {
      // Si no podemos leer la cabecera, no bloqueamos (mejor esfuerzo).
      return true;
    }
  }

  /**
   * Valida un archivo subido por el usuario.
   * @param {File} file
   * @param {{maxBytes?:number, permitidos?:string[]}} [opts]
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function validarArchivoSeguro(file, opts) {
    opts = opts || {};
    var maxBytes = opts.maxBytes || DEFAULT_MAX;
    var permitidos = opts.permitidos || DEFAULT_PERMITIDOS;

    if (!file) return { ok: false, error: 'No se recibió ningún archivo.' };
    if (!file.size) return { ok: false, error: 'El archivo está vacío.' };
    if (file.size > maxBytes) {
      return { ok: false, error: 'El archivo supera el tamaño máximo permitido (' + Math.round(maxBytes / 1048576) + ' MB).' };
    }

    var ext = extOf(file.name);
    if (permitidos.indexOf(ext) === -1) {
      return { ok: false, error: 'Extensión no permitida: .' + ext + '. Permitidas: ' + permitidos.join(', ') };
    }

    // Validar cabecera real para Excel (evita pasar binarios arbitrarios a XLSX.read)
    if (ext === 'xlsx' || ext === 'xls') {
      var okMagic = await _magicXlsxOk(file);
      if (!okMagic) return { ok: false, error: 'El archivo no es un Excel válido (cabecera incorrecta).' };
    }

    return { ok: true };
  }

  window.validarArchivoSeguro = validarArchivoSeguro;
  window.SSEPI_FILE_VALIDATOR_MAX = DEFAULT_MAX;

  console.log('✅ file-validator.js cargado — validación de uploads (Fase 1.2)');
})();