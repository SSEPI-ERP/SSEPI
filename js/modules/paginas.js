import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { generateCSRFToken, validateCSRFToken, escapeHTML } from '../core/security-middleware.js';

const PaginasModule = (function() {
  let lista = [];
  let actualId = null;
  let csrfToken = null;
  const paginasService = createDataService('web_paginas');

  async function init() {
    await authService.requireAuth('/');
    csrfToken = generateCSRFToken();
    bindUI();
    await cargarLista();
    renderLista();
  }

  function bindUI() {
    const btnNueva = document.getElementById('btnNueva');
    const buscarInput = document.getElementById('buscarInput');
    const cerrarModal = document.getElementById('cerrarModal');
    const btnGuardar = document.getElementById('btnGuardar');
    const btnEliminar = document.getElementById('btnEliminar');
    const btnPreview = document.getElementById('btnPreview');
    const cerrarPreview = document.getElementById('cerrarPreview');

    if (btnNueva) btnNueva.addEventListener('click', nuevaPagina);
    if (buscarInput) buscarInput.addEventListener('input', renderLista);
    if (cerrarModal) cerrarModal.addEventListener('click', cerrarEditor);
    if (btnGuardar) btnGuardar.addEventListener('click', guardarPagina);
    if (btnEliminar) btnEliminar.addEventListener('click', eliminarPagina);
    if (btnPreview) btnPreview.addEventListener('click', vistaPrevia);
    if (cerrarPreview) cerrarPreview.addEventListener('click', () => toggleModal('previewModal', false));
  }

  async function cargarLista() {
    try {
      lista = await paginasService.select({}, { orderBy: 'updated_at', ascending: false });
    } catch (err) {
      console.error(err);
      lista = [];
    }
  }

  function renderLista() {
    const container = document.getElementById('listaContainer');
    const filtro = (document.getElementById('buscarInput')?.value || '').toLowerCase();
    if (!container) return;

    const filtradas = lista.filter(p =>
      (p.titulo || '').toLowerCase().includes(filtro) ||
      (p.slug || '').toLowerCase().includes(filtro)
    );

    let html = '<table class="lista-table"><thead><tr><th>Slug</th><th>Título</th><th>Estado</th><th>Actualización</th><th></th></tr></thead><tbody>';
    filtradas.forEach(p => {
      html += `<tr>
        <td>${escapeHTML(p.slug || '')}</td>
        <td>${escapeHTML(p.titulo || '')}</td>
        <td><span class="status-badge ${p.estado === 'publicado' ? 'ok' : 'warn'}">${escapeHTML(p.estado || 'borrador')}</span></td>
        <td>${p.updated_at ? new Date(p.updated_at).toLocaleString() : ''}</td>
        <td class="row-actions">
          <button class="icon-btn" data-id="${p.id}" data-action="edit"><i class="fas fa-pen"></i></button>
          <button class="icon-btn" data-id="${p.id}" data-action="del"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.icon-btn').forEach(btn => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      btn.addEventListener('click', () => {
        if (action === 'edit') abrirEditor(id);
        if (action === 'del') { actualId = id; eliminarPagina(); }
      });
    });
  }

  function nuevaPagina() {
    actualId = null;
    document.getElementById('editorTitulo').innerText = 'Nueva página';
    document.getElementById('inputSlug').value = '';
    document.getElementById('inputTitulo').value = '';
    document.getElementById('inputEstado').value = 'borrador';
    document.getElementById('inputContenido').value = '';
    toggleModal('editorModal', true);
  }

  async function abrirEditor(id) {
    try {
      const data = await paginasService.getById(id);
      actualId = id;
      document.getElementById('editorTitulo').innerText = 'Editar página';
      document.getElementById('inputSlug').value = data.slug || '';
      document.getElementById('inputTitulo').value = data.titulo || '';
      document.getElementById('inputEstado').value = data.estado || 'borrador';
      document.getElementById('inputContenido').value = data.contenido || '';
      toggleModal('editorModal', true);
    } catch (err) {
      console.error(err);
      alert('Error al abrir la página');
    }
  }

  function cerrarEditor() {
    toggleModal('editorModal', false);
  }

  async function guardarPagina() {
    try {
      const slug = document.getElementById('inputSlug').value.trim();
      const titulo = document.getElementById('inputTitulo').value.trim();
      const estado = document.getElementById('inputEstado').value;
      const contenido = document.getElementById('inputContenido').value;
      if (!slug || !titulo) {
        alert('Slug y título son obligatorios');
        return;
      }
      const payload = { slug, titulo, estado, contenido };

      if (actualId) {
        await paginasService.update(actualId, payload, csrfToken);
        alert('Página actualizada');
      } else {
        const inserted = await paginasService.insert(payload, csrfToken);
        actualId = inserted.id;
        alert('Página creada');
      }
      await cargarLista();
      renderLista();
      cerrarEditor();
    } catch (err) {
      console.error(err);
      alert('Error al guardar');
    }
  }

  async function eliminarPagina() {
    try {
      if (!actualId) {
        alert('Selecciona una página');
        return;
      }
      if (!confirm('¿Eliminar la página seleccionada?')) return;
      await paginasService.delete(actualId, csrfToken);
      actualId = null;
      await cargarLista();
      renderLista();
      cerrarEditor();
      alert('Página eliminada');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar');
    }
  }

  function vistaPrevia() {
    const contenido = document.getElementById('inputContenido').value || '';
    const frame = document.getElementById('previewFrame');
    if (!frame) return;
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/css/main.css"></head><body>${contenido}</body></html>`);
    doc.close();
    toggleModal('previewModal', true);
  }

  function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.style.display = show ? 'block' : 'none';
  }

  window.paginasModule = {
    init,
    nuevaPagina,
    abrirEditor,
    eliminarPagina
  };

  document.addEventListener('DOMContentLoaded', init);
  return {};
})();

