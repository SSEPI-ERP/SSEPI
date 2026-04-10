/**
 * Nómina — listado y alta de pagos_nomina (Supabase + COI opcional).
 */
import { createDataService } from '../core/data-service.js';
import { enqueueCoiJob } from '../core/coi-queue.js';

const nominaService = createDataService('pagos_nomina');

let _feed = [];

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

function _updateKpis(list) {
    const n = list.length;
    const sum = list.reduce((a, x) => a + (Number(x.total) || 0), 0);
    const avg = n ? sum / n : 0;
    const elC = document.getElementById('nomKpiCount');
    const elT = document.getElementById('nomKpiTotal');
    const elA = document.getElementById('nomKpiAvg');
    if (elC) elC.textContent = String(n);
    if (elT) elT.textContent = _fmtMoney(sum);
    if (elA) elA.textContent = _fmtMoney(avg);
}

function _recalcModalTotal() {
    const sb = parseFloat(document.getElementById('nomInpSueldo')?.value) || 0;
    const hx = parseFloat(document.getElementById('nomInpExtras')?.value) || 0;
    const bn = parseFloat(document.getElementById('nomInpBonos')?.value) || 0;
    const dd = parseFloat(document.getElementById('nomInpDed')?.value) || 0;
    const t = Math.max(0, sb + hx + bn - dd);
    const inp = document.getElementById('nomInpTotal');
    if (inp) inp.value = t.toFixed(2);
}

function _openNomModal() {
    const back = document.getElementById('nomModalBackdrop');
    if (!back) return;
    const today = new Date().toISOString().split('T')[0];
    const de = document.getElementById('nomDesde')?.value;
    const ha = document.getElementById('nomHasta')?.value;
    document.getElementById('nomInpEmpleado').value = '';
    document.getElementById('nomInpDesde').value = de || today;
    document.getElementById('nomInpHasta').value = ha || today;
    document.getElementById('nomInpDias').value = '';
    document.getElementById('nomInpFechaPago').value = today;
    document.getElementById('nomInpSueldo').value = '0';
    document.getElementById('nomInpExtras').value = '0';
    document.getElementById('nomInpBonos').value = '0';
    document.getElementById('nomInpDed').value = '0';
    document.getElementById('nomInpEstado').value = 'pagado';
    document.getElementById('nomInpMetodo').value = 'transferencia';
    _recalcModalTotal();
    back.classList.add('nom-modal-visible');
    back.setAttribute('aria-hidden', 'false');
}

function _closeNomModal() {
    const back = document.getElementById('nomModalBackdrop');
    if (!back) return;
    back.classList.remove('nom-modal-visible');
    back.setAttribute('aria-hidden', 'true');
}

function _addToFeed(icon, msg, level) {
    const host = document.getElementById('feedList');
    const badge = document.getElementById('feedCount');
    const now = new Date();
    _feed.unshift({
        t: now.toLocaleTimeString('es-MX'),
        icon: icon || '🧾',
        msg: msg || '',
        level: level || 'info'
    });
    _feed = _feed.slice(0, 20);
    if (badge) badge.textContent = String(_feed.length);
    if (!host) return;
    host.innerHTML = _feed.map(function (e) {
        return `
          <div class="feed-item">
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-contabilidad);">NÓMINA</span><span>${_escape(e.t)}</span></div>
            <div class="feed-body">${_escape(e.icon)} ${_escape(e.msg)}</div>
          </div>
        `;
    }).join('');
}

async function _saveNomModal() {
    const nombre = (document.getElementById('nomInpEmpleado')?.value || '').trim();
    const pi = document.getElementById('nomInpDesde')?.value;
    const pf = document.getElementById('nomInpHasta')?.value;
    const fp = document.getElementById('nomInpFechaPago')?.value;
    if (!nombre) { alert('Indica el nombre del empleado.'); return; }
    if (!pi || !pf) { alert('Indica el periodo (desde / hasta).'); return; }
    if (!fp) { alert('Indica la fecha de pago.'); return; }
    const dias = parseInt(document.getElementById('nomInpDias')?.value, 10);
    const sueldo = parseFloat(document.getElementById('nomInpSueldo')?.value) || 0;
    const hex = parseFloat(document.getElementById('nomInpExtras')?.value) || 0;
    const bon = parseFloat(document.getElementById('nomInpBonos')?.value) || 0;
    const ded = parseFloat(document.getElementById('nomInpDed')?.value) || 0;
    let total = parseFloat(document.getElementById('nomInpTotal')?.value);
    if (!Number.isFinite(total) || total < 0) total = Math.max(0, sueldo + hex + bon - ded);
    const estado = document.getElementById('nomInpEstado')?.value || 'pagado';
    const metodo = (document.getElementById('nomInpMetodo')?.value || 'transferencia').trim();
    const ref = 'NOM-' + Date.now().toString().slice(-10);
    const pagoData = {
        empleado_nombre: nombre,
        periodo_inicio: pi,
        periodo_fin: pf,
        dias_trabajados: Number.isFinite(dias) ? dias : null,
        dias_detalle: [],
        sueldo_base: sueldo,
        horas_extras: hex,
        bonos: bon,
        deducciones: ded,
        total,
        fecha_pago: fp,
        estado,
        metodo_pago: metodo,
        referencia: ref
    };
    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
        const inserted = await nominaService.insert(pagoData, csrfToken);
        _addToFeed('💾', 'Pago guardado: ' + nombre + ' · ' + _fmtMoney(total), 'ok');
        enqueueCoiJob({
            erp_source: 'nomina',
            erp_id: String(inserted?.id || ref),
            folio: ref,
            idempotency_key: `nomina:${inserted?.id || ref}`,
            payload_json: { ...pagoData, id: inserted?.id }
        }).then((r) => {
            if (!r.ok) console.warn('[COI queue] Nómina no encolada:', r.error);
        });
        _closeNomModal();
        await refreshList();
        alert('Pago de nómina guardado.');
    } catch (e) {
        _addToFeed('❌', 'Error guardando: ' + (e?.message || e), 'error');
        alert('Error: ' + (e?.message || e));
    }
}

async function refreshList() {
    const tbody = document.getElementById('nominaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="coi-log-loading">Cargando…</td></tr>';
    const desde = (document.getElementById('nomDesde')?.value || '').trim();
    const hasta = (document.getElementById('nomHasta')?.value || '').trim();
    try {
        const rows = await nominaService.select({}, { orderBy: 'fecha_pago', ascending: false, limit: 400 });
        let list = (rows || []).filter(n => _inDateRange(n.fecha_pago, desde, hasta));
        _updateKpis(list);
        _addToFeed('📥', 'Cargados ' + list.length + ' pagos en rango', 'ok');
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Sin registros en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 300);
        tbody.innerHTML = list.map(n => `
            <tr>
                <td>${_escape(_fmtDate(n.fecha_pago))}</td>
                <td>${_escape(n.empleado_nombre || '—')}</td>
                <td>${_escape((n.periodo_inicio || '—') + ' → ' + (n.periodo_fin || '—'))}</td>
                <td>${_escape(_fmtMoney(n.total || 0))}</td>
                <td><span class="nom-estado nom-estado--${String(n.estado || 'pagado').toLowerCase()}">${_escape(n.estado || '—')}</span></td>
                <td>${_escape(n.metodo_pago || '—')}</td>
            </tr>
        `).join('');
    } catch (e) {
        const msg = String(e?.message || e);
        tbody.innerHTML = `<tr><td colspan="6" class="coi-log-empty">No se pudo cargar el historial.</td></tr>`;
        _updateKpis([]);
        _addToFeed('⚠️', 'No se pudo cargar: ' + msg, 'warn');
        console.error('[Nómina]', msg);
    }
}

async function init() {
    _applyUrlToInputs();
    _setDefaultDates();
    document.getElementById('nomDesde')?.addEventListener('change', refreshList);
    document.getElementById('nomHasta')?.addEventListener('change', refreshList);
    document.getElementById('nomAplicarBtn')?.addEventListener('click', refreshList);
    document.getElementById('nomRefreshBtn')?.addEventListener('click', refreshList);
    document.getElementById('nomCrearBtn')?.addEventListener('click', _openNomModal);
    document.getElementById('nomModalClose')?.addEventListener('click', _closeNomModal);
    document.getElementById('nomModalCancel')?.addEventListener('click', _closeNomModal);
    document.getElementById('nomModalGuardar')?.addEventListener('click', () => { _saveNomModal(); });
    ['nomInpSueldo', 'nomInpExtras', 'nomInpBonos', 'nomInpDed'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', _recalcModalTotal);
    });
    const back = document.getElementById('nomModalBackdrop');
    if (back) {
        back.addEventListener('click', (ev) => { if (ev.target === back) _closeNomModal(); });
    }
    _addToFeed('✅', 'Módulo iniciado', 'info');
    await refreshList();
}

window.nominaModule = { init, refreshList };
export { init, refreshList };
