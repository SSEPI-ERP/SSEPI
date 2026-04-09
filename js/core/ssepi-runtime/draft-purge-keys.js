import { removeLocalDraft } from './draft-local-store.js';
import { removePendingEntry } from './pending-drafts-registry.js';
import { ssepiEmit, SSEPI_EVENTS } from './ssepi-event-bus.js';

/** Elimina borrador local y entrada en pendientes por cada clave (sin duplicar). */
export function purgeDraftRecordKeys(module, keys) {
  const uniq = [];
  const seen = new Set();
  (keys || []).forEach(function (k) {
    if (k == null || k === '') return;
    const s = String(k);
    if (seen.has(s)) return;
    seen.add(s);
    uniq.push(s);
  });
  for (var i = 0; i < uniq.length; i++) {
    removeLocalDraft(module, uniq[i]);
    removePendingEntry(module, uniq[i]);
  }
  if (uniq.length) {
    ssepiEmit(SSEPI_EVENTS.PENDING_UPDATED, { module: module, purged: uniq });
  }
}
