import { listPendingEntries, removePendingEntry } from './pending-drafts-registry.js';
import { purgeDraftRecordKeys } from './draft-purge-keys.js';
import { formatPendingTitle } from './pending-activity-view.js';
import { pagePathForModule } from './module-routes.js';
import { ssepiOn, ssepiEmit, SSEPI_EVENTS } from './ssepi-event-bus.js';

/** data-module del menú → clave de borrador en localStorage */
export const NAV_DRAFT_MODULE = {
  ordenes_taller: 'ordenes_taller',
  ordenes_motores: 'ordenes_motores',
  proyectos_automatizacion: 'proyectos_automatizacion',
  ventas: 'ventas',
  suministros: 'suministros',
  compras: 'compras',
};

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function shortTime(iso) {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function entriesForModule(module) {
  return listPendingEntries().filter((e) => e.module === module);
}

function renderList(module, listEl, countEl) {
  if (!listEl) return;
  const items = entriesForModule(module);
  if (countEl) countEl.textContent = String(items.length);
  const block = listEl.closest('.ssepi-module-prew');
  if (block) block.style.display = items.length ? '' : 'none';

  if (!items.length) {
    listEl.innerHTML = '<p class="ssepi-module-prew-empty">Sin borradores en este módulo.</p>';
    return;
  }

  listEl.innerHTML = items.map((e) => `
    <div class="ssepi-module-prew-card" data-module="${escapeHtml(e.module)}" data-key="${escapeHtml(e.recordKey)}">
      <div class="ssepi-module-prew-card-top">
        <span class="ssepi-pending-badge">Preview</span>
        <span class="ssepi-module-prew-time">${escapeHtml(shortTime(e.updatedAt))}</span>
      </div>
      <div class="ssepi-module-prew-title">${escapeHtml(e.label || formatPendingTitle(e))}</div>
      <div class="ssepi-module-prew-actions">
        <button type="button" class="btn-ssepi btn-sm ssepi-prew-btn-continue" title="Continuar edición">
          <i class="fas fa-pen"></i> Continuar
        </button>
        <button type="button" class="btn-secondary btn-sm ssepi-prew-btn-delete" title="Eliminar borrador">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.ssepi-prew-btn-continue').forEach((btn, i) => {
    btn.addEventListener('click', () => _resumeEntry(items[i]));
  });
  listEl.querySelectorAll('.ssepi-prew-btn-delete').forEach((btn, i) => {
    btn.addEventListener('click', () => _deleteEntry(items[i], module, listEl, countEl));
  });
}

function _resumeEntry(entry) {
  if (!entry) return;
  const path = pagePathForModule(entry.module);
  const here = window.location.pathname;
  if (here === path || here.endsWith(path.replace(/^\//, ''))) {
    ssepiEmit(SSEPI_EVENTS.RESUME_DRAFT, { module: entry.module, recordKey: entry.recordKey });
    return;
  }
  window.location.href = path + '?resume=' + encodeURIComponent(entry.recordKey);
}

function _deleteEntry(entry, module, listEl, countEl) {
  if (!entry) return;
  if (!confirm('¿Eliminar este borrador? No se podrá recuperar en este navegador.')) return;
  purgeDraftRecordKeys(entry.module, [entry.recordKey]);
  removePendingEntry(entry.module, entry.recordKey);
  renderList(module, listEl, countEl);
  ssepiEmit(SSEPI_EVENTS.PENDING_UPDATED, { module: entry.module });
}

/**
 * Panel de borradores (preview) en la barra lateral derecha del módulo activo.
 * @returns {HTMLElement|null}
 */
export function mountModulePendingSidebar() {
  const aside = document.querySelector('.sidebar-right');
  if (!aside || aside.querySelector('.ssepi-module-prew')) {
    return aside ? aside.querySelector('.ssepi-module-prew') : null;
  }

  const navMod = document.querySelector('#sidebar a.nav-item.active')?.getAttribute('data-module') || '';
  const draftMod = NAV_DRAFT_MODULE[navMod];
  if (!draftMod) return null;

  const block = document.createElement('div');
  block.className = 'ssepi-module-prew';
  block.style.display = 'none';
  block.innerHTML =
    '<div class="ssepi-module-prew-head">' +
    '<span><i class="fas fa-floppy-disk"></i> Borradores</span>' +
    '<span class="ssepi-module-prew-count" id="ssepiModulePrewCount">0</span>' +
    '</div>' +
    '<p class="ssepi-module-prew-hint">Si cierras una orden sin terminar, queda aquí para continuar o eliminar.</p>' +
    '<div class="ssepi-module-prew-list" id="ssepiModulePrewList"></div>';

  aside.insertBefore(block, aside.firstChild);

  const listEl = block.querySelector('#ssepiModulePrewList');
  const countEl = block.querySelector('#ssepiModulePrewCount');

  function paint() {
    renderList(draftMod, listEl, countEl);
  }
  paint();
  ssepiOn(SSEPI_EVENTS.PENDING_UPDATED, paint);
  ssepiOn(SSEPI_EVENTS.DRAFT_SAVED, paint);

  return block;
}
