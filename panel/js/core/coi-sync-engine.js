/**
 * Cliente del motor local SSEPI COI (bridge HTTP en 127.0.0.1).
 * No guardar secretos en el repositorio; opcional: localStorage.ssepi_coi_bridge_key
 */
import { enqueueCoiJob } from './coi-queue.js';

const COI_SYNC_DEFAULT_BASE = 'http://127.0.0.1:8765';

function getCoiBridgeBaseUrl() {
    try {
        const u = (localStorage.getItem('ssepi_coi_bridge_url') || '').trim();
        if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, '');
    } catch (_) { /* ignore */ }
    return COI_SYNC_DEFAULT_BASE;
}

function getCoiBridgeKey() {
    try {
        return localStorage.getItem('ssepi_coi_bridge_key') || '';
    } catch (_) {
        return '';
    }
}

function _headers() {
    const h = { 'Content-Type': 'application/json' };
    const k = getCoiBridgeKey();
    if (k) h['X-SSEPI-COI-KEY'] = k;
    return h;
}

/**
 * @param {Record<string, unknown>} row - fila ventas (Supabase)
 * @param {Record<string, unknown>|null|undefined} previousRow - fila anterior en UPDATE
 */
export function notifyVentaIfEligible(row, previousRow) {
    if (!row || row.tipo === 'cotizacion') return;
    if (row.estatus_pago !== 'Pagado') return;
    if (previousRow && previousRow.estatus_pago === 'Pagado') return;
    const id = row.id;
    if (!id) return;

    // Encolar para que el bridge lo procese aunque no esté encendido ahora.
    enqueueCoiJob({
        erp_source: 'venta',
        erp_id: String(id),
        folio: row.folio || null,
        idempotency_key: `venta:${id}:pagado`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI queue] Venta no encolada:', r.error?.message || r.error || r);
    });

    const url = `${getCoiBridgeBaseUrl()}/ingest/venta`;
    fetch(url, {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify(row)
    }).then(async r => {
        if (!r.ok) {
            let msg = r.statusText;
            try {
                const j = await r.json();
                msg = j.detail || j.error || j.mensaje || msg;
            } catch (_) { /* ignore */ }
            throw new Error(msg);
        }
        return r.json();
    }).then(() => {
        console.log('[COI sync] Venta enviada al motor:', id);
    }).catch(err => {
        console.warn('[COI sync] Venta no sincronizada (¿motor encendido?):', err.message || err);
    });
}

/**
 * @param {Record<string, unknown>} row - fila compras
 * @param {Record<string, unknown>|null|undefined} previousRow
 */
export function notifyCompraIfEligible(row, previousRow) {
    if (!row) return;
    const estado = Number(row.estado);
    if (Number.isNaN(estado) || estado < 4) return;
    if (previousRow != null && Number(previousRow.estado) >= 4) return;
    const id = row.id;
    if (!id) return;

    enqueueCoiJob({
        erp_source: 'compra',
        erp_id: String(id),
        folio: row.folio || null,
        idempotency_key: `compra:${id}:estado>=4`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI queue] Compra no encolada:', r.error?.message || r.error || r);
    });

    const url = `${getCoiBridgeBaseUrl()}/ingest/compra`;
    fetch(url, {
        method: 'POST',
        headers: _headers(),
        body: JSON.stringify(row)
    }).then(async r => {
        if (!r.ok) {
            let msg = r.statusText;
            try {
                const j = await r.json();
                msg = j.detail || j.error || j.mensaje || msg;
            } catch (_) { /* ignore */ }
            throw new Error(msg);
        }
        return r.json();
    }).then(() => {
        console.log('[COI sync] Compra enviada al motor:', id);
    }).catch(err => {
        console.warn('[COI sync] Compra no sincronizada (¿motor encendido?):', err.message || err);
    });
}

export async function checkCoiBridgeHealth() {
    const url = `${getCoiBridgeBaseUrl()}/health`;
    const res = await fetch(url, { method: 'GET', headers: _headers() }).catch(() => null);
    if (!res || !res.ok) return { ok: false };
    try {
        const j = await res.json();
        return { ok: !!j.ok, raw: j };
    } catch (_) {
        return { ok: res.ok };
    }
}

export { getCoiBridgeBaseUrl, COI_SYNC_DEFAULT_BASE };
