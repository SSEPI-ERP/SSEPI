/**
 * Órdenes importadas del paquete laboratorio (SP-E / import_erp_legacy).
 * Solo deben listarse en el módulo Laboratorio (ordenes_taller en taller.js).
 */

export function isOrdenLaboratorioImportada(o) {
    if (!o) return false;
    if (o.import_erp_legacy === true) return true;
    if (o.formato === 'laboratorio-1') return true;
    const origen = String(o.origen || '').toLowerCase();
    if (origen === 'import_erp' || origen === 'legacy') return true;
    const f = String(o.folio || '').trim();
    if (/^SP-E\d{6}-\d{3,}$/i.test(f)) return true;
    return false;
}

export function filterOrdenesOperativas(list) {
    return (list || []).filter(o => !isOrdenLaboratorioImportada(o));
}
