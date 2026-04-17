import { safeJsonParse, safeJsonStringify } from './json-safe.js';

var PREFIX = 'ssepi_draft_v1:';

export function draftStorageKey(module, recordKey) {
  return PREFIX + module + ':' + recordKey;
}

export function saveLocalDraft(module, recordKey, payload) {
  if (!recordKey) return false;
  try {
    var wrapped = {
      v: 1,
      module: module,
      recordKey: recordKey,
      savedAt: new Date().toISOString(),
      payload: payload,
    };
    localStorage.setItem(draftStorageKey(module, recordKey), safeJsonStringify(wrapped, '{}'));
    return true;
  } catch (e) {
    console.warn('[SSEPI draft]', e && e.message ? e.message : e);
    return false;
  }
}

export function loadLocalDraft(module, recordKey) {
  if (!recordKey) return null;
  try {
    var raw = localStorage.getItem(draftStorageKey(module, recordKey));
    if (!raw) return null;
    return safeJsonParse(raw, null);
  } catch (e) {
    return null;
  }
}

export function removeLocalDraft(module, recordKey) {
  try {
    localStorage.removeItem(draftStorageKey(module, recordKey));
  } catch (e) {
    /* noop */
  }
}
