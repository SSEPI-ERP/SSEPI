/**
 * SSEPI-NEXT Renderer — Full rewrite with auth, realtime, filters, COI dashboard.
 */

// ================================================
// STATE
// ================================================

let currentModule = 'dashboard';
let session = null;
let cachedData = {
  ventas: [], taller: [], motores: [], automatizacion: [], inventario: [], contactos: []
};
let coiPolizas = [];
const subscriptions = [];

const TABLE_CONFIG = {
  ventas: { table: 'ventas', orderBy: '-fecha_creacion', limit: 200 },
  taller: { table: 'ordenes_taller', orderBy: '-fecha_entrada', limit: 200 },
  motores: { table: 'ordenes_motores', orderBy: '-fecha_creacion', limit: 200 },
  automatizacion: { table: 'proyectos_automatizacion', orderBy: '-fecha_creacion', limit: 200 },
  inventario: { table: 'inventario', orderBy: 'nombre', limit: 500 },
  contactos: { table: 'contactos', orderBy: 'nombre', limit: 500 },
};

const STATUS_MAP = {
  ventas: [
    { value: '', label: 'Todos' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'en_proceso', label: 'En Proceso' },
    { value: 'completado', label: 'Completado' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'cancelado', label: 'Cancelado' },
  ],
  taller: [
    { value: '', label: 'Todos' },
    { value: 'Nuevo', label: 'Nuevo' },
    { value: 'Diagnóstico', label: 'Diagnóstico' },
    { value: 'En Espera', label: 'En Espera' },
    { value: 'En Proceso', label: 'En Proceso' },
    { value: 'Terminado', label: 'Terminado' },
    { value: 'Entregado', label: 'Entregado' },
  ],
  motores: [
    { value: '', label: 'Todos' },
    { value: 'Nuevo', label: 'Nuevo' },
    { value: 'Diagnóstico', label: 'Diagnóstico' },
    { value: 'En Espera', label: 'En Espera' },
    { value: 'En Proceso', label: 'En Proceso' },
    { value: 'Terminado', label: 'Terminado' },
    { value: 'Entregado', label: 'Entregado' },
  ],
  automatizacion: [
    { value: '', label: 'Todos' },
    { value: 'Nuevo', label: 'Nuevo' },
    { value: 'progreso', label: 'En Progreso' },
    { value: 'Terminado', label: 'Terminado' },
    { value: 'Entregado', label: 'Entregado' },
  ],
};

// ================================================
// FORMAT HELPERS
// ================================================

function fmtMoney(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '--';
  try { return new Date(d).toLocaleDateString('es-MX'); } catch { return String(d).substring(0, 10); }
}

function statusBadge(estado) {
  if (!estado) return '<span class="status-badge status-badge--default">--</span>';
  const cls = String(estado).replace(/\s+/g, '_');
  return `<span class="status-badge ${cls}">${estado}</span>`;
}

function escHtml(s) {
  if (s == null) return '--';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ================================================
// INIT
// ================================================

document.addEventListener('DOMContentLoaded', async () => {
  initAuth();
  initNavigation();
  initButtons();
  initCoiButtons();
  initFilters();
});

// ================================================
// AUTH
// ================================================

function initAuth() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', handleLogin);

  checkExistingSession();
}

async function checkExistingSession() {
  const dot = document.getElementById('loginStatusDot');
  const txt = document.getElementById('loginStatusText');
  try {
    const result = await window.electronAPI.getSession();
    if (result.ok && result.session) {
      session = result.session;
      showApp();
    } else {
      dot.classList.add('connected');
      txt.textContent = 'Listo para iniciar sesión';
    }
  } catch {
    dot.classList.add('error');
    txt.textContent = 'Sin conexión al servidor';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const result = await window.electronAPI.login(email, password);
    if (result.ok) {
      session = result.session;
      showApp();
    } else {
      errEl.textContent = result.error || 'Error al iniciar sesión';
    }
  } catch (err) {
    errEl.textContent = 'Error de conexión';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function showApp() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';

  const roleEl = document.getElementById('userRoleLabel');
  if (session?.user?.role) roleEl.textContent = session.user.role;

  updateConnectionStatus('connected', 'Conectado');
  loadAllData();
  startRealtime();
}

async function handleLogout() {
  await window.electronAPI.logout();
  session = null;
  for (const sub of subscriptions) {
    try { await window.electronAPI.unsubscribe(sub); } catch {}
  }
  subscriptions.length = 0;
  document.getElementById('loginView').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

// ================================================
// NAVIGATION
// ================================================

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchModule(item.dataset.module));
  });
}

function switchModule(module) {
  currentModule = module;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.module === module));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${module}`));

  const titles = {
    dashboard: 'Dashboard', ventas: 'Ventas', taller: 'Taller', motores: 'Motores',
    automatizacion: 'Automatización', inventario: 'Inventario', contactos: 'Contactos', coi: 'Contabilidad COI'
  };
  document.getElementById('pageTitle').textContent = titles[module] || module;

  if (module === 'coi') {
    loadCoiDashboard();
  } else if (module === 'dashboard') {
    loadDashboard();
  } else {
    fetchModuleData(module);
  }
}

// ================================================
// BUTTONS
// ================================================

function initButtons() {
  document.getElementById('refreshBtn')?.addEventListener('click', refreshData);
  document.getElementById('exportBtn')?.addEventListener('click', exportCurrentView);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
}

// ================================================
// DATA LOADING
// ================================================

async function loadAllData() {
  await Promise.all([
    fetchModuleData('ventas'),
    fetchModuleData('taller'),
    fetchModuleData('motores'),
    fetchModuleData('automatizacion'),
    fetchModuleData('inventario'),
    fetchModuleData('contactos'),
  ]);
  updateDashboardCards();
  renderRecentActivity();
}

async function loadDashboard() {
  await loadAllData();
}

async function fetchModuleData(module) {
  const config = TABLE_CONFIG[module];
  if (!config) return;

  const tbody = document.querySelector(`#${module}Table tbody`);
  if (tbody) tbody.innerHTML = '<tr><td colspan="99" class="loading-overlay">Cargando...</td></tr>';

  try {
    const result = await window.electronAPI.query(config.table, null, { orderBy: config.orderBy, limit: config.limit });
    if (result.ok) {
      cachedData[module] = result.data || [];
      if (currentModule === module) renderTable(module, cachedData[module]);
      if (module === 'inventario') populateCategories();
    } else {
      if (tbody) tbody.innerHTML = `<tr><td colspan="99" class="empty-state">Error: ${escHtml(result.error)}</td></tr>`;
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="99" class="empty-state">Error de conexión</td></tr>';
  }
}

function updateDashboardCards() {
  const vt = cachedData.ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  document.getElementById('dashVentasTotal').textContent = fmtMoney(vt);

  const active = [
    ...cachedData.taller.filter(o => o.estado !== 'Entregado' && o.estado !== 'entregado'),
    ...cachedData.motores.filter(o => o.estado !== 'Entregado' && o.estado !== 'entregado'),
    ...cachedData.automatizacion.filter(o => o.estado !== 'Entregado' && o.estado !== 'entregado'),
  ].length;
  document.getElementById('dashOrdenesActivas').textContent = active;

  const clients = cachedData.contactos.filter(c => c.tipo === 'cliente').length;
  document.getElementById('dashClientes').textContent = clients;
  document.getElementById('dashProductos').textContent = cachedData.inventario.length;
}

function renderRecentActivity() {
  const tbody = document.querySelector('#recentTable tbody');
  if (!tbody) return;

  const allItems = [
    ...cachedData.ventas.map(v => ({ ...v, tipo: 'venta' })),
    ...cachedData.taller.map(t => ({ ...t, tipo: 'taller' })),
    ...cachedData.motores.map(m => ({ ...m, tipo: 'motores' })),
    ...cachedData.automatizacion.map(a => ({ ...a, tipo: 'automatizacion' })),
  ].sort((a, b) => new Date(b.fecha_creacion || b.created_at || 0) - new Date(a.fecha_creacion || a.created_at || 0));

  tbody.innerHTML = allItems.slice(0, 15).map(item => {
    const cliente = item.cliente_nombre || item.nombre_cliente || item.cliente || '--';
    return `<tr>
      <td>${item.tipo.toUpperCase()}</td>
      <td>${escHtml(item.folio || item.id || '--')}</td>
      <td>${escHtml(cliente)}</td>
      <td>${statusBadge(item.estado)}</td>
      <td>${fmtDate(item.fecha_creacion || item.created_at)}</td>
    </tr>`;
  }).join('');
}

// ================================================
// TABLE RENDERING
// ================================================

function renderTable(module, data) {
  const tbody = document.querySelector(`#${module}Table tbody`);
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="99" class="empty-state">Sin datos</td></tr>';
    return;
  }

  const renderers = {
    ventas: (v) => `<tr><td>${escHtml(v.folio)}</td><td>${escHtml(v.cliente_nombre || v.cliente)}</td><td>${escHtml(v.producto_servicio || v.servicio)}</td><td>${statusBadge(v.estado)}</td><td>${fmtMoney(v.total)}</td><td>${fmtDate(v.fecha_creacion)}</td></tr>`,
    taller: (t) => `<tr><td>${escHtml(t.folio)}</td><td>${escHtml(t.equipo)}</td><td>${escHtml(t.cliente_nombre || t.cliente)}</td><td>${statusBadge(t.estado)}</td><td>${escHtml(t.tecnico)}</td><td>${fmtDate(t.fecha_entrada || t.fecha_creacion)}</td></tr>`,
    motores: (m) => `<tr><td>${escHtml(m.folio)}</td><td>${escHtml(m.motor || m.tipo_motor)}</td><td>${escHtml(m.cliente_nombre || m.cliente)}</td><td>${statusBadge(m.estado)}</td><td>${escHtml(m.tecnico)}</td><td>${fmtDate(m.fecha_creacion)}</td></tr>`,
    automatizacion: (a) => `<tr><td>${escHtml(a.folio)}</td><td>${escHtml(a.proyecto || a.nombre_proyecto)}</td><td>${escHtml(a.cliente_nombre || a.cliente)}</td><td>${statusBadge(a.estado)}</td><td>${escHtml(a.ingeniero || a.responsable)}</td><td>${fmtDate(a.fecha_creacion)}</td></tr>`,
    inventario: (p) => `<tr><td>${escHtml(p.codigo || p.id)}</td><td>${escHtml(p.nombre)}</td><td>${escHtml(p.categoria)}</td><td>${p.stock ?? '--'}</td><td>${fmtMoney(p.precio)}</td><td>${escHtml(p.ubicacion)}</td></tr>`,
    contactos: (c) => `<tr><td>${escHtml(c.nombre)}</td><td>${escHtml(c.tipo)}</td><td>${escHtml(c.email)}</td><td>${escHtml(c.telefono)}</td><td>${escHtml(c.empresa)}</td></tr>`,
  };

  const renderer = renderers[module];
  tbody.innerHTML = data.map(renderer).join('');
}

// ================================================
// FILTERS (Functional)
// ================================================

function initFilters() {
  const filterConfig = {
    ventasSearch: 'ventas', ventasStatus: 'ventas',
    tallerSearch: 'taller', tallerStatus: 'taller',
    motoresSearch: 'motores', motoresStatus: 'motores',
    autoSearch: 'automatizacion', autoStatus: 'automatizacion',
    inventarioSearch: 'inventario',
    contactosSearch: 'contactos', contactosTipo: 'contactos',
  };

  for (const [id, module] of Object.entries(filterConfig)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => applyFilters(module));
  }
}

function applyFilters(module) {
  const data = cachedData[module] || [];
  if (data.length === 0) return;

  let filtered = [...data];

  // Search
  const searchEl = document.getElementById(`${module}Search`) || document.getElementById(`${module === 'automatizacion' ? 'auto' : module}Search`);
  if (searchEl && searchEl.value) {
    const q = searchEl.value.toLowerCase();
    filtered = filtered.filter(row => {
      return Object.values(row).some(v => String(v || '').toLowerCase().includes(q));
    });
  }

  // Status filter
  const statusEl = document.getElementById(`${module}Status`) || document.getElementById(`${module === 'automatizacion' ? 'auto' : module}Status`);
  if (statusEl && statusEl.value) {
    filtered = filtered.filter(row => row.estado === statusEl.value || row.estado?.toLowerCase() === statusEl.value.toLowerCase());
  }

  // Tipo filter (for contactos)
  const tipoEl = document.getElementById('contactosTipo');
  if (module === 'contactos' && tipoEl && tipoEl.value) {
    filtered = filtered.filter(row => row.tipo === tipoEl.value);
  }

  // Inventario categoria filter
  const catEl = document.getElementById('inventarioCategoria');
  if (module === 'inventario' && catEl && catEl.value) {
    filtered = filtered.filter(row => row.categoria === catEl.value);
  }

  renderTable(module, filtered);
}

// Populate inventario categories after data loads
function populateCategories() {
  const cats = [...new Set(cachedData.inventario.map(p => p.categoria).filter(Boolean))];
  const sel = document.getElementById('inventarioCategoria');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  sel.value = current;
}


// ================================================
// REALTIME
// ================================================

function startRealtime() {
  window.electronAPI.onRealtimeEvent((event) => {
    const module = tableToModule(event.table);
    if (module) {
      fetchModuleData(module);
      if (currentModule === module) applyFilters(module);
      if (currentModule === 'dashboard') loadDashboard();
    }
  });

  // Subscribe to key tables
  const tables = ['ventas', 'ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion', 'inventario', 'contactos'];
  for (const table of tables) {
    window.electronAPI.subscribe(table).then(result => {
      if (result.ok) subscriptions.push(result.channel);
    });
  }
}

function tableToModule(table) {
  const map = {
    ventas: 'ventas', ordenes_taller: 'taller', ordenes_motores: 'motores',
    proyectos_automatizacion: 'automatizacion', inventario: 'inventario', contactos: 'contactos',
  };
  return map[table];
}

// ================================================
// REFRESH / EXPORT
// ================================================

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="icon">&#x23F3;</span> Cargando...';
  btn.disabled = true;

  if (currentModule === 'coi') {
    await loadCoiDashboard();
  } else if (currentModule === 'dashboard') {
    await loadDashboard();
  } else {
    await fetchModuleData(currentModule);
    applyFilters(currentModule);
  }

  btn.innerHTML = origHTML;
  btn.disabled = false;
}

async function exportCurrentView() {
  let data, filename;

  if (currentModule === 'dashboard') {
    data = Object.entries(cachedData).flatMap(([mod, items]) =>
      items.map(i => ({ modulo: mod, ...i }))
    );
    filename = `ssepi-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
  } else if (currentModule === 'coi') {
    data = coiPolizas;
    filename = `ssepi-coi-polizas-${new Date().toISOString().split('T')[0]}.csv`;
  } else {
    data = cachedData[currentModule];
    filename = `ssepi-${currentModule}-${new Date().toISOString().split('T')[0]}.csv`;
  }

  if (!data || data.length === 0) {
    alert('No hay datos para exportar');
    return;
  }

  const result = await window.electronAPI.exportCSV(filename, data);
  if (result.ok) {
    // File saved
  } else if (result.error !== 'Cancelado') {
    alert('Error al exportar: ' + result.error);
  }
}

// ================================================
// COI DASHBOARD
// ================================================

function initCoiButtons() {
  document.getElementById('coiSyncPullBtn')?.addEventListener('click', async () => {
    const result = await window.electronAPI.coiSyncPull();
    if (result.ok) {
      alert(`Pull completado: ${result.data?.pulled || 0} registros sincronizados`);
    } else {
      alert('Error: ' + (result.error || 'COI Bridge no disponible'));
    }
    loadCoiDashboard();
  });

  document.getElementById('coiSyncPushBtn')?.addEventListener('click', async () => {
    const result = await window.electronAPI.coiSyncPush();
    if (result.ok) {
      alert(`Push completado: ${result.data?.pushed || 0} registros sincronizados`);
    } else {
      alert('Error: ' + (result.error || 'COI Bridge no disponible'));
    }
    loadCoiDashboard();
  });

  document.getElementById('coiRefreshBtn')?.addEventListener('click', loadCoiDashboard);

  // COI filter listeners
  ['coiTipo', 'coiFechaDesde', 'coiFechaHasta', 'coiEstatus'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', loadCoiPolizas);
  });

  // Poliza row click for detail
  document.querySelector('#coiPolizasTable tbody')?.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row?.dataset?.id) return;
    await loadPolizaDetail(Number(row.dataset.id));
  });
}

async function loadCoiDashboard() {
  // Health check
  const healthResult = await window.electronAPI.coiStatus();
  const bridgeEl = document.getElementById('coiBridgeStatus');
  const bridgeDetailEl = document.getElementById('coiBridgeDetail');
  const sqliteEl = document.getElementById('coiSqliteStatus');
  const postgresEl = document.getElementById('coiPostgresStatus');

  if (healthResult.ok && healthResult.data?.ok) {
    bridgeEl.textContent = 'Conectado';
    bridgeEl.style.color = 'var(--c-success)';
    bridgeDetailEl.textContent = `v${healthResult.data.version || '?'}`;
    sqliteEl.textContent = healthResult.data.sqlite === 'connected' ? 'OK' : 'Error';
    sqliteEl.style.color = healthResult.data.sqlite === 'connected' ? 'var(--c-success)' : 'var(--c-error)';
    postgresEl.textContent = healthResult.data.postgres === 'connected' ? 'OK' : healthResult.data.postgres;
    postgresEl.style.color = healthResult.data.postgres === 'connected' ? 'var(--c-success)' : 'var(--c-warning)';
  } else {
    bridgeEl.textContent = 'Desconectado';
    bridgeEl.style.color = 'var(--c-error)';
    bridgeDetailEl.textContent = healthResult.error || 'COI Bridge no disponible';
    sqliteEl.textContent = '--';
    postgresEl.textContent = '--';
  }

  // Sync status
  const syncResult = await window.electronAPI.coiSyncStatus();
  const pendingEl = document.getElementById('coiSyncPending');
  const syncDetailEl = document.getElementById('coiSyncDetail');
  if (syncResult.ok && syncResult.data) {
    const s = syncResult.data;
    pendingEl.textContent = `${s.pendingLocal || 0} / ${s.pendingRemote || 0}`;
    syncDetailEl.textContent = `Local: ${s.pendingLocal || 0} | Remoto: ${s.pendingRemote || 0}`;
  } else {
    pendingEl.textContent = '--';
    syncDetailEl.textContent = 'No disponible';
  }

  await loadCoiPolizas();
}

async function loadCoiPolizas() {
  const filters = {};
  const tipo = document.getElementById('coiTipo')?.value;
  const fechaDesde = document.getElementById('coiFechaDesde')?.value;
  const fechaHasta = document.getElementById('coiFechaHasta')?.value;
  const estatus = document.getElementById('coiEstatus')?.value;

  if (tipo) filters.tipo = tipo;
  if (fechaDesde) filters.fechaDesde = fechaDesde;
  if (fechaHasta) filters.fechaHasta = fechaHasta;
  if (estatus) filters.estatus = estatus;

  const result = await window.electronAPI.coiPolizas(filters);
  const tbody = document.querySelector('#coiPolizasTable tbody');
  if (!tbody) return;

  if (result.ok && result.data) {
    coiPolizas = result.data;
    if (coiPolizas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Sin pólizas</td></tr>';
      return;
    }
    tbody.innerHTML = coiPolizas.map(p => `<tr data-id="${p.id}">
      <td>${p.id}</td>
      <td>${p.numero_poliza || '--'}</td>
      <td>${escHtml(p.tipo_poliza)}</td>
      <td>${fmtDate(p.fecha)}</td>
      <td>${escHtml(p.concepto)}</td>
      <td>${statusBadge(p.estatus)}</td>
      <td>${escHtml(p.erp_source || '')}${p.erp_id ? '/' + escHtml(p.erp_id) : ''}</td>
    </tr>`).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escHtml(result.error || 'Error al cargar pólizas')}</td></tr>`;
  }
}

async function loadPolizaDetail(id) {
  const result = await window.electronAPI.coiPolizaDetail(id);
  const detailEl = document.getElementById('coiPolizaDetail');
  const headerEl = document.getElementById('coiPolizaHeader');
  const movTbody = document.querySelector('#coiMovimientosTable tbody');

  if (!result.ok || !result.data) {
    detailEl.style.display = 'none';
    return;
  }

  const p = result.data;
  detailEl.style.display = 'block';
  headerEl.innerHTML = `
    <div><strong>Tipo:</strong> ${escHtml(p.tipo_poliza)}</div>
    <div><strong>Fecha:</strong> ${fmtDate(p.fecha)}</div>
    <div><strong>Concepto:</strong> ${escHtml(p.concepto)}</div>
    <div><strong>Estado:</strong> ${statusBadge(p.estatus)}</div>
    <div><strong>Moneda:</strong> ${escHtml(p.moneda || 'MXN')}</div>
    <div><strong>Origen:</strong> ${escHtml(p.erp_source || '--')}</div>
  `;

  const movs = p.movimientos || [];
  if (movTbody) {
    if (movs.length === 0) {
      movTbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin movimientos</td></tr>';
    } else {
      movTbody.innerHTML = movs.map(m => `<tr>
        <td>${escHtml(m.num_cuenta)}</td>
        <td>${escHtml(m.concepto_mov)}</td>
        <td>${fmtMoney(m.cargo)}</td>
        <td>${fmtMoney(m.abono)}</td>
        <td>${escHtml(m.cliente_rfc || '')}</td>
        <td>${escHtml(m.cliente_nombre || '')}</td>
      </tr>`).join('');
    }
  }

  detailEl.scrollIntoView({ behavior: 'smooth' });
}

// ================================================
// CONNECTION STATUS
// ================================================

function updateConnectionStatus(status, text) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  if (indicator) {
    indicator.className = 'status-indicator';
    if (status === 'connected') indicator.classList.add('connected');
    if (status === 'error') indicator.classList.add('error');
  }
  if (statusText) statusText.textContent = text;
}

