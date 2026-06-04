/**
 * folio-formats.js — Formatos de folio estándar SSEPI (libreta).
 * SP-A: Automatización (proyectos). SP-E: Electrónica (laboratorio). SP-S: Suministro. SP-OC: Orden de compra.
 */
(function () {
    'use strict';

    function supabase() {
        return window.supabase || null;
    }

    /**
     * Automatización: SP-A[AÑO][MES]/[XXX]. Ej: SP-A2601/22 (consecutivo del mes).
     */
    function getNextFolioAutomatizacion() {
        var now = new Date();
        var yy = now.getFullYear().toString().slice(-2);
        var mm = (now.getMonth() + 1).toString().padStart(2, '0');
        var prefix = 'SP-A' + yy + mm + '/';
        var sb = supabase();
        if (!sb) return prefix + '1';
        return sb.from('proyectos_automatizacion').select('folio').ilike('folio', prefix + '%').order('folio', { ascending: false }).limit(1).single()
            .then(function (r) {
                if (r.error || !r.data || !r.data.folio) return prefix + '1';
                var match = (r.data.folio || '').match(/\/(\d+)$/);
                var n = match ? parseInt(match[1], 10) + 1 : 1;
                return prefix + n;
            })
            .catch(function () { return prefix + '1'; });
    }

    /**
     * Motores: SP-M[AÑO][MES][XXX]. Misma lógica secuencial que electrónica, tabla ordenes_motores.
     */
    function getNextFolioMotores() {
        var now = new Date();
        var yy = now.getFullYear().toString().slice(-2);
        var mm = (now.getMonth() + 1).toString().padStart(2, '0');
        var prefix = 'SP-M' + yy + mm;
        var sb = supabase();
        if (!sb) return prefix + '001';
        return sb.from('ordenes_motores').select('folio').ilike('folio', prefix + '%').order('folio', { ascending: false }).limit(1)
            .then(function (r) {
                if (r.error || !r.data || !r.data.length) return prefix + '001';
                var s = (r.data[0].folio || '').replace(prefix, '');
                var n = (parseInt(s, 10) || 0) + 1;
                return prefix + n.toString().padStart(3, '0');
            })
            .catch(function () { return prefix + '001'; });
    }

    /**
     * Electrónica (laboratorio): SP-E[AÑO][MES][XXX]. Ej: SP-E2601653 (secuencial histórico).
     */
    function getNextFolioLaboratorio() {
        var now = new Date();
        var yy = now.getFullYear().toString().slice(-2);
        var mm = (now.getMonth() + 1).toString().padStart(2, '0');
        var prefix = 'SP-E' + yy + mm;
        var sb = supabase();
        if (!sb) return prefix + '001';
        return sb.from('ordenes_taller').select('folio').ilike('folio', prefix + '%').order('folio', { ascending: false }).limit(1)
            .then(function (r) {
                if (r.error || !r.data || !r.data.length) return prefix + '001';
                var s = (r.data[0].folio || '').replace(prefix, '');
                var n = (parseInt(s, 10) || 0) + 1;
                return prefix + n.toString().padStart(3, '0');
            })
            .catch(function () { return prefix + '001'; });
    }

    /**
     * Suministro (salida/entrega): SP-S[AÑO][MES][DÍA]-[X]. Ej: SP-S260129-1 (partida del día).
     * N = número de salidas de ese día + 1 (no requiere columna folio_suministro).
     */
    function getNextFolioSuministro(fecha) {
        var d = fecha ? new Date(fecha) : new Date();
        var yy = d.getFullYear().toString().slice(-2);
        var mm = (d.getMonth() + 1).toString().padStart(2, '0');
        var dd = d.getDate().toString().padStart(2, '0');
        var dateStr = d.getFullYear() + '-' + mm + '-' + dd;
        var prefix = 'SP-S' + yy + mm + dd + '-';
        var sb = supabase();
        if (!sb) return prefix + '1';
        return sb.from('movimientos_inventario').select('*', { count: 'exact', head: true }).eq('tipo_movimiento', 'salida').gte('created_at', dateStr + 'T00:00:00').lte('created_at', dateStr + 'T23:59:59.999')
            .then(function (r) {
                var n = (r.count != null ? r.count : 0) + 1;
                return prefix + n;
            })
            .catch(function () { return prefix + '1'; });
    }

    /**
     * Cotización / orden de suministro: SP-S[AÑO][MES][DÍA]-[N] según folios del día en cotizaciones.
     */
    function getNextFolioCotizacionSuministro(fecha) {
        var d = fecha ? new Date(fecha) : new Date();
        var yy = d.getFullYear().toString().slice(-2);
        var mm = (d.getMonth() + 1).toString().padStart(2, '0');
        var dd = d.getDate().toString().padStart(2, '0');
        var prefix = 'SP-S' + yy + mm + dd + '-';
        var sb = supabase();
        if (!sb) return Promise.resolve(prefix + '1');
        return sb.from('cotizaciones').select('folio').eq('origen', 'suministro').ilike('folio', prefix + '%')
            .order('folio', { ascending: false }).limit(80)
            .then(function (r) {
                var max = 0;
                (r.data || []).forEach(function (row) {
                    var m = String(row.folio || '').match(/-(\d+)$/);
                    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
                });
                return prefix + (max + 1);
            })
            .catch(function () { return prefix + '1'; });
    }

    /**
     * Orden de compra: SP-OC[AÑO][MES][XXX]. Ej: SP-OC26121.
     */
    function getNextFolioOrdenCompra() {
        var now = new Date();
        var yy = now.getFullYear().toString().slice(-2);
        var mm = (now.getMonth() + 1).toString().padStart(2, '0');
        var prefix = 'SP-OC' + yy + mm;
        var sb = supabase();
        if (!sb) return prefix + '1';
        return sb.from('compras').select('folio').ilike('folio', prefix + '%').order('folio', { ascending: false }).limit(1)
            .then(function (r) {
                if (r.error || !r.data || !r.data.length) return prefix + '1';
                var s = (r.data[0].folio || '').replace(prefix, '');
                var n = (parseInt(s, 10) || 0) + 1;
                return prefix + n;
            })
            .catch(function () { return prefix + '1'; });
    }

    /**
     * Laboratorio: SP-0513 / SP.0418 / SP0687 → SP-E0513 (no toca SP-M, SP-A, etc.).
     */
    function normalizeFolioLaboratorio(folio) {
        var s = String(folio || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!s) return '';
        if (/^SP-M|^SP-A|^SP-S|^SP-OC|^SP-SOP/i.test(s)) return s;
        if (/^SP-E/i.test(s)) return s.replace(/^SP-E/i, 'SP-E');
        var m = s.match(/^SP-(\d{2,})/);
        if (m) return 'SP-E' + m[1];
        m = s.match(/^SP\.(\d{2,})/);
        if (m) return 'SP-E' + m[1];
        m = s.match(/^SP(\d{3,})$/);
        if (m) return 'SP-E' + m[1];
        return s;
    }

    window.folioFormats = {
        getNextFolioAutomatizacion: getNextFolioAutomatizacion,
        getNextFolioMotores: getNextFolioMotores,
        getNextFolioLaboratorio: getNextFolioLaboratorio,
        getNextFolioSuministro: getNextFolioSuministro,
        getNextFolioCotizacionSuministro: getNextFolioCotizacionSuministro,
        getNextFolioOrdenCompra: getNextFolioOrdenCompra,
        normalizeFolioLaboratorio: normalizeFolioLaboratorio
    };
})();
