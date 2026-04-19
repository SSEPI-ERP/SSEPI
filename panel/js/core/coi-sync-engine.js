/**
 * SSEPI COI Sync Engine — Cola unica via Supabase.
 * La Edge Function procesa la cola en la nube.
 * El Node.js local server sincroniza pólizas desde Postgres a SQLite.
 * Ya no se hace HTTP POST directo al bridge local.
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
 * Venta pagada — encola para procesamiento COI.
 * @param {Record<string, unknown>} row - fila ventas (Supabase)
 * @param {Record<string, unknown>|null|undefined} previousRow - fila anterior en UPDATE
 */
export function notifyVentaIfEligible(row, previousRow) {
    if (!row || row.tipo === 'cotizacion') return;
    if (row.estatus_pago !== 'Pagado') return;
    if (previousRow && previousRow.estatus_pago === 'Pagado') return;
    const id = row.id;
    if (!id) return;

    enqueueCoiJob({
        erp_source: 'venta',
        erp_id: String(id),
        folio: row.folio || null,
        idempotency_key: `venta:${id}:pagado`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI sync] Venta no encolada:', r.error?.message || r.error || r);
        else console.log('[COI sync] Venta encolada:', id);
    });
}

/**
 * Compra recibida — encola para procesamiento COI.
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
        if (!r.ok) console.warn('[COI sync] Compra no encolada:', r.error?.message || r.error || r);
        else console.log('[COI sync] Compra encolada:', id);
    });
}

/**
 * Factura timbrada — encola para procesamiento COI.
 * @param {Record<string, unknown>} row - fila facturas
 */
export function notifyFacturaIfEligible(row) {
    if (!row || !row.id) return;

    enqueueCoiJob({
        erp_source: 'factura',
        erp_id: String(row.id),
        folio: row.folio_factura || row.folio || null,
        idempotency_key: `factura:${row.id}:timbrada`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI sync] Factura no encolada:', r.error?.message || r.error || r);
        else console.log('[COI sync] Factura encolada:', row.id);
    });
}

/**
 * Pago de nómina — encola para procesamiento COI.
 * @param {Record<string, unknown>} row - fila pagos_nomina
 */
export function notifyNominaIfEligible(row) {
    if (!row || !row.id) return;

    enqueueCoiJob({
        erp_source: 'nomina',
        erp_id: String(row.id),
        folio: row.referencia || row.folio || null,
        idempotency_key: `nomina:${row.id}:pagada`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI sync] Nómina no encolada:', r.error?.message || r.error || r);
        else console.log('[COI sync] Nómina encolada:', row.id);
    });
}

/**
 * Movimiento bancario — encola para procesamiento COI.
 * @param {Record<string, unknown>} row - fila movimientos_banco
 */
export function notifyBancosIfEligible(row) {
    if (!row || !row.id) return;

    enqueueCoiJob({
        erp_source: 'bancos',
        erp_id: String(row.id),
        folio: row.concepto || null,
        idempotency_key: `bancos:${row.id}:movimiento`,
        payload_json: row,
    }).then(r => {
        if (!r.ok) console.warn('[COI sync] Banco no encolado:', r.error?.message || r.error || r);
        else console.log('[COI sync] Banco encolado:', row.id);
    });
}

/**
 * Verificar estado del motor COI local.
 */
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