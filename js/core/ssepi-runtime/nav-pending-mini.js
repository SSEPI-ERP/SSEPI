import { renderPendingHtmlList } from './pending-activity-view.js';
import { ssepiOn, SSEPI_EVENTS } from './ssepi-event-bus.js';

export function mountNavPendingMini() {
  const el = document.getElementById('ssepiNavPendingMini');
  if (!el) return;
  function paint() {
    el.innerHTML = renderPendingHtmlList();
  }
  paint();
  ssepiOn(SSEPI_EVENTS.PENDING_UPDATED, paint);
  ssepiOn(SSEPI_EVENTS.DRAFT_SAVED, paint);
}
