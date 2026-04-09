import { safeJsonParse, safeJsonStringify } from './json-safe.js';
import { pagePathForModule } from './module-routes.js';

var KEY = 'ssepi_pending_entries_v1';
var MAX = 40;

function readAll() {
  var list = safeJsonParse(localStorage.getItem(KEY), []);
  return Array.isArray(list) ? list : [];
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, safeJsonStringify(list.slice(0, MAX), '[]'));
  } catch (e) {
    console.warn('[SSEPI pending]', e && e.message ? e.message : e);
  }
}

export function upsertPendingEntry(p) {
  if (!p.module || !p.recordKey) return;
  var list = readAll().filter(function (x) {
    return !(x.module === p.module && x.recordKey === p.recordKey);
  });
  var path = p.href || (pagePathForModule(p.module) + '?resume=' + encodeURIComponent(p.recordKey));
  list.unshift({
    module: p.module,
    recordKey: p.recordKey,
    label: p.label || p.recordKey,
    href: path,
    updatedAt: new Date().toISOString(),
    status: 'pendiente',
  });
  writeAll(list);
}

export function removePendingEntry(module, recordKey) {
  var list = readAll().filter(function (x) {
    return !(x.module === module && x.recordKey === recordKey);
  });
  writeAll(list);
}

export function listPendingEntries() {
  return readAll();
}
