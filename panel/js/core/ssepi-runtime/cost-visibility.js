/**
 * Importes monetarios (costos, precios, totales, IVA): solo admin y superadmin.
 * El resto puede operar módulos sin ver valores en pantalla (los datos en BD no se borran).
 */
export function canSeeFinancials(profile) {
    if (!profile) return false;
    const rol = String(profile.rol || '').toLowerCase();
    if (rol === 'admin' || rol === 'superadmin') {
        try {
            if (typeof window !== 'undefined' && window.__SSEPI_DUAL_MODE__ && sessionStorage.getItem('ssepi_mode') === 'normal') {
                return false;
            }
        } catch (e) { /* ignore */ }
        return true;
    }
    return false;
}

/** Alias por módulo — misma regla global. */
export function canSeeCostsInModule(profile, _moduleName) {
    return canSeeFinancials(profile);
}

export function isSuministrosAdmin(profile) {
    return canSeeFinancials(profile);
}

export function applyBodyFinancialClass(profile) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('ssepi-sin-financieros', !canSeeFinancials(profile));
}

export function formatMoney(profile, amount, opts) {
    if (!canSeeFinancials(profile)) return '—';
    const n = Number(amount) || 0;
    const min = (opts && opts.minimumFractionDigits) ?? 2;
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: min, maximumFractionDigits: min });
}

if (typeof window !== 'undefined') {
    window.SSEPICostVisibility = {
        canSeeFinancials,
        canSeeCostsInModule,
        isSuministrosAdmin,
        applyBodyFinancialClass,
        formatMoney,
    };
}
