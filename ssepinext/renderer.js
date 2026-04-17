/**
 * SSEPI-NEXT Renderer
 * Lógica de la interfaz y conexión con Supabase
 */

// ================================================
// CONFIGURACIÓN DE SUPABASE
// ================================================

const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key';

// ================================================
// ESTADO DE LA APLICACIÓN
// ================================================

let currentModule = 'dashboard';
let cachedData = {
  ventas: [],
  taller: [],
  motores: [],
  automatizacion: [],
  inventario: [],
  contactos: []
};

// ================================================
// INICIALIZACIÓN
// ================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initButtons();
  connectToSupabase();
});

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const module = item.dataset.module;
      switchModule(module);
    });
  });
}

function initButtons() {
  document.getElementById('refreshBtn')?.addEventListener('click', refreshData);
  document.getElementById('exportBtn')?.addEventListener('click', exportData);
}

function switchModule(module) {
  currentModule = module;

  // Actualizar nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === module);
  });

  // Actualizar vista
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${module}`);
  });

  // Actualizar título
  const titles = {
    dashboard: 'Dashboard',
    ventas: 'Ventas',
    taller: 'Taller',
    motores: 'Motores',
    automatizacion: 'Automatización',
    inventario: 'Inventario',
    contactos: 'Contactos'
  };
  document.getElementById('pageTitle').textContent = titles[module] || module;

  // Cargar datos
  loadDataForModule(module);
}

// ================================================
// CONEXIÓN CON SUPABASE
// ================================================

async function connectToSupabase() {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  try {
    // Verificar conexión
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (response.ok) {
      statusIndicator.classList.add('connected');
      statusIndicator.classList.remove('error');
      statusText.textContent = 'Conectado a Supabase';
      console.log('[SSEPI-NEXT] Conectado a Supabase');
    } else {
      throw new Error('Respuesta no exitosa');
    }
  } catch (error) {
    statusIndicator.classList.add('error');
    statusText.textContent = 'Error de conexión';
    console.error('[SSEPI-NEXT] Error de conexión:', error);
  }
}

// ================================================
// CARGA DE DATOS
// ================================================

async function loadDataForModule(module) {
  if (module === 'dashboard') {
    await loadDashboard();
  } else if (cachedData[module]?.length === 0 || true) {
    // Siempre recargar datos
    await fetchModuleData(module);
  }
}

async function fetchModuleData(module) {
  const tableMap = {
    ventas: 'ventas',
    taller: 'ordenes_taller',
    motores: 'ordenes_motores',
    automatizacion: 'proyectos_automatizacion',
    inventario: 'inventario',
    contactos: 'contactos'
  };

  const table = tableMap[module];
  if (!table) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      cachedData[module] = data;
      renderTable(module, data);
    }
  } catch (error) {
    console.error(`[SSEPI-NEXT] Error cargando ${module}:`, error);
  }
}

async function loadDashboard() {
  // Cargar todos los módulos para el dashboard
  await Promise.all([
    fetchModuleData('ventas'),
    fetchModuleData('taller'),
    fetchModuleData('motores'),
    fetchModuleData('automatizacion'),
    fetchModuleData('inventario'),
    fetchModuleData('contactos')
  ]);

  updateDashboardCards();
  renderRecentActivity();
}

function updateDashboardCards() {
  // Ventas totales
  const ventasTotal = cachedData.ventas.reduce((sum, v) => sum + (v.total || 0), 0);
  document.getElementById('dashVentasTotal').textContent = `$${ventasTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  // Órdenes activas
  const ordenesActivas =
    (cachedData.taller.filter(o => o.estado !== 'entregado')?.length || 0) +
    (cachedData.motores.filter(o => o.estado !== 'entregado')?.length || 0) +
    (cachedData.automatizacion.filter(o => o.estado !== 'entregado')?.length || 0);
  document.getElementById('dashOrdenesActivas').textContent = ordenesActivas;

  // Clientes
  document.getElementById('dashClientes').textContent = cachedData.contactos.filter(c => c.tipo === 'cliente')?.length || 0;

  // Productos
  document.getElementById('dashProductos').textContent = cachedData.inventario?.length || 0;
}

function renderRecentActivity() {
  const tbody = document.querySelector('#recentTable tbody');
  if (!tbody) return;

  // Combinar y ordenar por fecha
  const allItems = [
    ...cachedData.ventas.map(v => ({ ...v, tipo: 'venta' })),
    ...cachedData.taller.map(t => ({ ...t, tipo: 'taller' })),
    ...cachedData.motores.map(m => ({ ...m, tipo: 'motores' })),
    ...cachedData.automatizacion.map(a => ({ ...a, tipo: 'automatizacion' }))
  ].sort((a, b) => new Date(b.fecha_creacion || b.created_at || 0) - new Date(a.fecha_creacion || a.created_at || 0));

  tbody.innerHTML = allItems.slice(0, 10).map(item => {
    const getCliente = (item) => {
      if (typeof item.cliente_nombre === 'string') return item.cliente_nombre;
      if (typeof item.nombre_cliente === 'string') return item.nombre_cliente;
      return 'Sin cliente';
    };

    return `
      <tr>
        <td>${item.tipo.toUpperCase()}</td>
        <td>${item.folio || item.id || 'N/A'}</td>
        <td>${getCliente(item)}</td>
        <td><span class="status-badge">${item.estado || 'pendiente'}</span></td>
        <td>${new Date(item.fecha_creacion || item.created_at || Date.now()).toLocaleDateString('es-MX')}</td>
      </tr>
    `;
  }).join('');
}

function renderTable(module, data) {
  const tableId = `${module}Table`;
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;

  const renderers = {
    ventas: (v) => `
      <tr>
        <td>${v.folio || 'N/A'}</td>
        <td>${v.cliente_nombre || 'Sin cliente'}</td>
        <td>${v.producto_servicio || 'N/A'}</td>
        <td>${v.estado || 'pendiente'}</td>
        <td>$${(v.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td>${new Date(v.fecha_creacion || Date.now()).toLocaleDateString('es-MX')}</td>
      </tr>
    `,
    taller: (t) => `
      <tr>
        <td>${t.folio || 'N/A'}</td>
        <td>${t.equipo || 'N/A'}</td>
        <td>${t.cliente_nombre || 'Sin cliente'}</td>
        <td>${t.estado || 'pendiente'}</td>
        <td>${t.tecnico || 'Sin asignar'}</td>
        <td>${new Date(t.fecha_entrada || Date.now()).toLocaleDateString('es-MX')}</td>
      </tr>
    `,
    motores: (m) => `
      <tr>
        <td>${m.folio || 'N/A'}</td>
        <td>${m.motor || 'N/A'}</td>
        <td>${m.cliente_nombre || 'Sin cliente'}</td>
        <td>${m.estado || 'pendiente'}</td>
        <td>${m.tecnico || 'Sin asignar'}</td>
        <td>${new Date(m.fecha_creacion || Date.now()).toLocaleDateString('es-MX')}</td>
      </tr>
    `,
    automatizacion: (a) => `
      <tr>
        <td>${a.folio || 'N/A'}</td>
        <td>${a.proyecto || 'N/A'}</td>
        <td>${a.cliente_nombre || 'Sin cliente'}</td>
        <td>${a.estado || 'pendiente'}</td>
        <td>${a.ingeniero || 'Sin asignar'}</td>
        <td>${new Date(a.fecha_creacion || Date.now()).toLocaleDateString('es-MX')}</td>
      </tr>
    `,
    inventario: (p) => `
      <tr>
        <td>${p.codigo || 'N/A'}</td>
        <td>${p.nombre || 'N/A'}</td>
        <td>${p.categoria || 'N/A'}</td>
        <td>${p.stock || 0}</td>
        <td>$${(p.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td>${p.ubicacion || 'N/A'}</td>
      </tr>
    `,
    contactos: (c) => `
      <tr>
        <td>${c.nombre || 'N/A'}</td>
        <td>${c.tipo || 'N/A'}</td>
        <td>${c.email || 'N/A'}</td>
        <td>${c.telefono || 'N/A'}</td>
        <td>${c.empresa || 'N/A'}</td>
      </tr>
    `
  };

  const renderer = renderers[module];
  if (renderer) {
    tbody.innerHTML = data.map(renderer).join('');
  }
}

// ================================================
// REFRESCAR Y EXPORTAR
// ================================================

async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.innerHTML = '<span class="icon">⏳</span> Cargando...';

  await loadDashboard();
  await loadDataForModule(currentModule);

  btn.innerHTML = '<span class="icon">🔄</span> Actualizar';
}

function exportData() {
  const data = cachedData[currentModule];
  if (!data || data.length === 0) {
    alert('No hay datos para exportar');
    return;
  }

  // Convertir a CSV
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
  ].join('\n');

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ssepi-${currentModule}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
