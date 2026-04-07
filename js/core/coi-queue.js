/**
 * Encola trabajos para el bridge COI en Supabase (coi_sync_queue).
 * Se usa desde el navegador (authenticated) sin exponer service_role.
 */
import { createDataService } from './data-service.js';

const queueService = createDataService('coi_sync_queue');

function _csrf() {
    try {
        return sessionStorage.getItem('csrfToken') || '';
    } catch (_) {
        return '';
    }
}

function _isDuplicateError(e) {
    const msg = (e && (e.message || e.details || e.hint)) ? String(e.message || e.details || e.hint) : '';
    return /duplicate|unique|idempotency_key|ux_coi_sync_queue/i.test(msg);
}

/**
 * @param {object} job
 * @param {'venta'|'compra'|'nomina'|'bancos'|'factura'} job.erp_source
 * @param {string} job.erp_id
 * @param {string|null|undefined} job.folio
 * @param {string} job.idempotency_key
 * @param {any} job.payload_json
 */
export async function enqueueCoiJob(job) {
    if (!job || !job.erp_source || !job.erp_id || !job.idempotency_key) return { ok: false, skipped: true };
    const payload = {
        erp_source: job.erp_source,
        erp_id: String(job.erp_id),
        folio: job.folio || null,
        idempotency_key: String(job.idempotency_key),
        status: 'pending',
        payload_json: (job.payload_json && typeof job.payload_json === 'object') ? job.payload_json : {},
    };
    try {
        await queueService.insert(payload, _csrf());
        return { ok: true };
    } catch (e) {
        if (_isDuplicateError(e)) return { ok: true, skipped: true };
        return { ok: false, error: e };
    }
}

