import { debounce } from './autosave-debounce.js';
import { saveLocalDraft } from './draft-local-store.js';
import { upsertPendingEntry } from './pending-drafts-registry.js';
import { ssepiEmit, SSEPI_EVENTS } from './ssepi-event-bus.js';

const locks = new Set();

export function createAutosaveController(opts) {
  const module = opts.module;
  const getRecordKey = opts.getRecordKey;
  const collectPayload = opts.collectPayload;
  const getLabel = opts.getLabel || function () { return 'Borrador'; };
  const debounceMs = opts.debounceMs == null ? 1400 : opts.debounceMs;

  function run() {
    const recordKey = getRecordKey();
    if (!recordKey) return;
    const lockId = module + ':' + recordKey;
    if (locks.has(lockId)) return;
    locks.add(lockId);
    try {
      const payload = collectPayload();
      saveLocalDraft(module, recordKey, payload);
      upsertPendingEntry({
        module: module,
        recordKey: recordKey,
        label: getLabel(),
      });
      ssepiEmit(SSEPI_EVENTS.DRAFT_SAVED, { module: module, recordKey: recordKey });
      ssepiEmit(SSEPI_EVENTS.PENDING_UPDATED, { module: module, recordKey: recordKey });
    } finally {
      locks.delete(lockId);
    }
  }

  const debounced = debounce(run, debounceMs);

  return {
    schedule: function () { debounced(); },
    flush: run,
  };
}
