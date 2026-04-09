import { listPendingEntries } from './pending-drafts-registry.js';

export function formatPendingTitle(entry) {
  const mod = entry.module === 'ordenes_taller' ? 'Laboratorio'
    : entry.module === 'ordenes_motores' ? 'Motores'
      : entry.module === 'proyectos_automatizacion' ? 'Automatización'
        : entry.module;
  return `${mod}: ${entry.label}`;
}

export function renderPendingHtmlList() {
  const items = listPendingEntries().slice(0, 12);
  if (!items.length) {
    return '<p class="ssepi-pending-empty">No hay borradores pendientes en este navegador.</p>';
  }
  return items.map((e) => `
    <a class="ssepi-pending-item" href="${e.href}">
      <span class="ssepi-pending-badge">Pendiente</span>
      <span class="ssepi-pending-title">${escapeHtml(formatPendingTitle(e))}</span>
      <span class="ssepi-pending-time">${escapeHtml(shortTime(e.updatedAt))}</span>
    </a>
  `).join('');
}

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
