/** Bus ligero entre módulos (sin acoplar imports circulares). */
const TARGET = typeof window !== 'undefined' ? window : globalThis;

export const SSEPI_EVENTS = {
  DRAFT_SAVED: 'ssepi:draft-saved',
  DRAFT_RESTORED: 'ssepi:draft-restored',
  PENDING_UPDATED: 'ssepi:pending-updated',
};

export function ssepiEmit(name, detail) {
  try {
    TARGET.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* noop */
  }
}

export function ssepiOn(name, handler) {
  const fn = (e) => handler(e.detail, e);
  TARGET.addEventListener(name, fn);
  return () => TARGET.removeEventListener(name, fn);
}
