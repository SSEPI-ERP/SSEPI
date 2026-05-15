// ================================================
// ARCHIVO: csv-export.js
// DESCRIPCION: Utilidad de exportacion CSV para modulos SSEPI
// USO: Solo visible para admin/superadmin
// ================================================

export function isAdminExportAllowed(profile) {
  return profile && ['admin', 'superadmin'].includes(profile.rol);
}

export function downloadCSV(filename, rows, headers) {
  if (!rows || rows.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }
  const escapeCSV = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s}"`;
    return s;
  };

  const headerLine = headers.map(h => h.label).join(',');
  const lines = rows.map(row => {
    return headers.map(h => {
      let val = row[h.key];
      if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
      return escapeCSV(val);
    }).join(',');
  });

  const csv = [headerLine, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function createExportButton(containerId, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const btn = document.createElement('button');
  btn.className = 'btn-ssepi btn-secondary';
  btn.innerHTML = '<i class="fas fa-file-csv"></i> Exportar CSV';
  btn.style.marginLeft = '8px';
  btn.addEventListener('click', onClick);
  container.appendChild(btn);
}
