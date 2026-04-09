/**
 * Nómina — listado de pagos_nomina (lectura; altas según RLS en Supabase).
 */
import { createDataService } from '../core/data-service.js';

const nominaService = createDataService('pagos_nomina');

function _fmtMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n));
}

function _fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-MX'); } catch (_) { return iso; }
}

function _escape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function _inDateRange(iso, desde, hasta) {
    if (!desde && !hasta) return true;
    const t = iso ? new Date(iso).getTime() : NaN;
    if (Number.isNaN(t)) return true;
    if (desde) {
        const d0 = new Date(desde + 'T00:00:00').getTime();
        if (t < d0) return false;
    }
    if (hasta) {
        const d1 = new Date(hasta + 'T23:59:59').getTime();
        if (t > d1) return false;
    }
    return true;
}

function _setDefaultDates() {
    const de = document.getElementById('nomDesde');
    const ha = document.getElementById('nomHasta');
    if (!de || !ha) return;
    if (de.value && ha.value) return;
    const now = new Date();
    de.valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    ha.valueAsDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

function _applyUrlToInputs() {
    const p = new URLSearchParams(window.location.search);
    const de = document.getElementById('nomDesde');
    const ha = document.getElementById('nomHasta');
    if (p.get('desde') && de) de.value = p.get('desde');
    if (p.get('hasta') && ha) ha.value = p.get('hasta');
}

async function refreshList() {
    const tbody = document.getElementById('nominaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="coi-log-loading">Cargando…</td></tr>';
    const desde = (document.getElementById('nomDesde')?.value || '').trim();
    const hasta = (document.getElementById('nomHasta')?.value || '').trim();
    try {
        const rows = await nominaService.select({}, { orderBy: 'fecha_pago', ascending: false, limit: 400 });
        let list = (rows || []).filter(n => _inDateRange(n.fecha_pago, desde, hasta));
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Sin registros en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 300);
        tbody.innerHTML = list.map(n => `
            <tr>
                <td>${_escape(_fmtDate(n.fecha_pago))}</td>
                <td>${_escape(n.empleado_nombre || '—')}</td>
                <td>${_escape((n.periodo_inicio || '—') + ' → ' + (n.periodo_fin || '—'))}</td>
                <td>${_escape(_fmtMoney(n.total || 0))}</td>
                <td>${_escape(n.estado || '—')}</td>
            </tr>
        `).join('');
    } catch (e) {
        const msg = String(e?.message || e);
        tbody.innerHTML = `<tr><td colspan="5" class="coi-log-empty">Error: ${_escape(msg)}</td></tr>`;
    }
}

async function init() {
    _applyUrlToInputs();
    _setDefaultDates();
    document.getElementById('nomDesde')?.addEventListener('change', refreshList);
    document.getElementById('nomHasta')?.addEventListener('change', refreshList);
    document.getElementById('nomAplicarBtn')?.addEventListener('click', refreshList);
    document.getElementById('nomRefreshBtn')?.addEventListener('click', refreshList);
    await refreshList();
}

window.nominaModule = { init, refreshList };
export { init, refreshList };
