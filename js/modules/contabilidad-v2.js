import { createDataService } from '../core/data-service.js';
import { initAuditFeed } from '../core/audit-feed.js';

const facturasService = createDataService('facturas');
const comprasService = createDataService('compras');
const bancosService = createDataService('movimientos_banco');
const nominaService = createDataService('pagos_nomina');
const inventarioService = createDataService('inventario');

function _fmtMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n));
}

function _fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-MX'); } catch (_) { return iso; }
}

function _escape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function _getFilterInputs() {
    const desde = (document.getElementById('contabDesde')?.value || '').trim();
    const hasta = (document.getElementById('contabHasta')?.value || '').trim();
    const cat = (document.getElementById('contabCategoria')?.value || 'todos').trim();
    return { desde, hasta, cat };
}

function _queryString(extra = {}) {
    const { desde, hasta, cat } = _getFilterInputs();
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    if (cat && cat !== 'todos') p.set('departamento', cat);
    Object.entries(extra).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : '';
}

function _syncExternalModuleLinks() {
    const qFactEmit = _queryString({ estado: 'emitida' });
    const qVentas = _queryString({});
    const qVentasPend = _queryString({ estado: 'Pendiente' });
    const qCompras = _queryString({});
    const qNom = _queryString({});

    const setHref = (id, path) => {
        const el = document.getElementById(id);
        if (el) el.href = path;
    };
    setHref('contabLinkFacturacion', `/pages/ssepi_facturacion.html${qFactEmit}`);
    setHref('contabLinkVentas', `/pages/ssepi_ventas.html${qVentas}`);
    setHref('contabLinkCompras', `/pages/ssepi_compras.html${qCompras}`);
    setHref('contabLinkCobranza', `/pages/ssepi_ventas.html${qVentasPend}`);
    setHref('contabLinkNomina', `/pages/ssepi_nomina.html${qNom}`);
    setHref('contabDupFacturacion', `/pages/ssepi_facturacion.html${qFactEmit}`);
    setHref('contabDupCompras', `/pages/ssepi_compras.html${qCompras}`);
    setHref('contabDupCobranza', `/pages/ssepi_ventas.html${qVentasPend}`);
    setHref('contabLinkInventario', '/pages/ssepi_productos.html');
}

function _inDateRange(iso, desde, hasta) {
    if (!desde && !hasta) return true;
    const t = iso ? new Date(iso).getTime() : NaN;
    if (Number.isNaN(t)) return true;
    if (desde) {
        const d0 = new Date(desde + 'T00:00:00').getTime();
        if (t < d0) return false;
    }
    if (hasta) {
        const d1 = new Date(hasta + 'T23:59:59').getTime();
        if (t > d1) return false;
    }
    return true;
}

function _comprasFechaRaw(c) {
    return c.fecha_creacion || c.created_at || c.fecha_requerida || c.updated_at;
}

async function _selectComprasOrdered() {
    const opts = { orderBy: 'fecha_creacion', ascending: false, limit: 300 };
    try {
        return await comprasService.select({}, opts);
    } catch (e) {
        const m = String(e?.message || e);
        if (m.includes('fecha_creacion')) {
            try {
                return await comprasService.select({}, { orderBy: 'created_at', ascending: false, limit: 300 });
            } catch (e2) {
                return await comprasService.select({}, { limit: 300 });
            }
        }
        throw e;
    }
}

function _setActiveTab(tabId) {
    document.querySelectorAll('.contab-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.contab-pill').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
    const pillMap = { tabVentas: 'tabVentasBtn', tabCompras: 'tabComprasBtn', tabCobranza: 'tabCobranzaBtn', tabNomina: 'tabNominaBtn' };
    const pb = document.getElementById(pillMap[tabId]);
    if (pb) pb.classList.add('active');
}

async function _renderVentasFacturas() {
    const tbody = document.getElementById('ventasFacturasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="coi-log-loading">Cargando…</td></tr>';
    const { desde, hasta } = _getFilterInputs();
    try {
        const rows = await facturasService.select({}, { orderBy: 'fecha_emision', ascending: false, limit: 300 });
        let list = (rows || []).filter(f => _inDateRange(f.fecha_emision, desde, hasta));
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Sin facturas en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 200);
        const q = _queryString({});
        tbody.innerHTML = list.map(f => `
            <tr>
                <td>${_escape(_fmtDate(f.fecha_emision))}</td>
                <td><strong>${_escape(f.folio_factura || '—')}</strong></td>
                <td>${_escape(f.cliente || '—')}</td>
                <td>${_escape(_fmtMoney(f.total || 0))}</td>
                <td>${_escape(f.estatus || '—')}</td>
                <td>
                    <a class="btn-ssepi btn-ssepi--sm" href="/pages/ssepi_facturacion.html${q}"><i class="fas fa-external-link-alt"></i></a>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="coi-log-empty">Error: ${_escape(e?.message || e)}</td></tr>`;
    }
}

async function _renderCompras() {
    const tbody = document.getElementById('comprasFacturasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="coi-log-loading">Cargando…</td></tr>';
    const { desde, hasta, cat } = _getFilterInputs();
    try {
        const rows = await _selectComprasOrdered();
        let list = rows || [];
        list = list.filter(c => _inDateRange(_comprasFechaRaw(c), desde, hasta));
        if (cat && cat !== 'todos') list = list.filter(c => (c.departamento || '') === cat);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Sin compras en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 200);
        const q = _queryString(cat !== 'todos' ? { departamento: cat } : {});
        tbody.innerHTML = list.map(c => {
            const idEsc = _escape(c.id);
            return `
            <tr>
                <td>${_escape(_fmtDate(_comprasFechaRaw(c)))}</td>
                <td><strong>${_escape(c.folio || (c.id ? String(c.id).slice(-6) : '—'))}</strong></td>
                <td>${_escape(c.proveedor || '—')}</td>
                <td>${_escape(_fmtMoney(c.total || 0))}</td>
                <td>${_escape(c.estado != null ? String(c.estado) : '—')}</td>
                <td>
                    <button type="button" class="btn-ssepi btn-ssepi--sm" onclick="window.contabilidadV2Module.pagarCompra('${idEsc}')"><i class="fas fa-money-bill-wave"></i></button>
                    <a class="btn-ssepi btn-ssepi--sm" href="/pages/ssepi_compras.html${q}"><i class="fas fa-external-link-alt"></i></a>
                </td>
            </tr>
        `;
        }).join('');
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('fecha_creacion') || msg.includes('created_at')) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Ejecuta en Supabase <code>scripts/migrations/contabilidad-supabase-fix.sql</code> (columna <code>fecha_creacion</code> en <code>compras</code>).</td></tr>';
            return;
        }
        tbody.innerHTML = `<tr><td colspan="6" class="coi-log-empty">Error: ${_escape(msg)}</td></tr>`;
    }
}

async function _renderCobranza() {
    const tbody = document.getElementById('cobranzaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="coi-log-loading">Cargando…</td></tr>';
    const { desde, hasta } = _getFilterInputs();
    try {
        const rows = await bancosService.select({}, { orderBy: 'fecha', ascending: false, limit: 300 });
        let list = (rows || []).filter(x => (x.tipo || '').toLowerCase() === 'ingreso');
        list = list.filter(m => _inDateRange(m.fecha, desde, hasta));
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Sin cobros en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 200);
        tbody.innerHTML = list.map(m => `
            <tr>
                <td>${_escape(_fmtDate(m.fecha))}</td>
                <td>${_escape(m.concepto || '—')}</td>
                <td>${_escape(m.metodo || '—')}</td>
                <td>${_escape(_fmtMoney(m.monto || 0))}</td>
                <td><span class="coi-badge coi-badge-ok">OK</span></td>
            </tr>
        `).join('');
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('movimientos_banco') && (msg.includes('schema cache') || msg.includes('does not exist'))) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Crea la tabla con <code>scripts/migrations/contabilidad-supabase-fix.sql</code> en Supabase.</td></tr>';
            return;
        }
        tbody.innerHTML = `<tr><td colspan="5" class="coi-log-empty">Error: ${_escape(msg)}</td></tr>`;
    }
}

async function _renderNomina() {
    const tbody = document.getElementById('nominaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="coi-log-loading">Cargando…</td></tr>';
    const { desde, hasta } = _getFilterInputs();
    try {
        const rows = await nominaService.select({}, { orderBy: 'fecha_pago', ascending: false, limit: 300 });
        let list = (rows || []).filter(n => _inDateRange(n.fecha_pago, desde, hasta));
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Sin registros en el rango.</td></tr>';
            return;
        }
        list = list.slice(0, 200);
        tbody.innerHTML = list.map(n => `
            <tr>
                <td>${_escape(_fmtDate(n.fecha_pago))}</td>
                <td>${_escape(n.empleado_nombre || '—')}</td>
                <td>${_escape((n.periodo_inicio || '—') + ' → ' + (n.periodo_fin || '—'))}</td>
                <td>${_escape(_fmtMoney(n.total || 0))}</td>
                <td>${_escape(n.estado || '—')}</td>
            </tr>
        `).join('');
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('pagos_nomina') && (msg.includes('schema cache') || msg.includes('does not exist'))) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Ejecuta <code>scripts/migrations/contabilidad-supabase-fix.sql</code> en Supabase.</td></tr>';
            return;
        }
        if (msg.includes('permission denied') || msg.includes('42501')) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Permiso RLS: vuelve a ejecutar <code>contabilidad-supabase-fix.sql</code> (políticas <code>pagos_nomina</code>).</td></tr>';
            return;
        }
        tbody.innerHTML = `<tr><td colspan="5" class="coi-log-empty">Error: ${_escape(msg)}</td></tr>`;
    }
}

async function _renderInventarioKPIs() {
    const k1 = document.getElementById('invKpiProductos');
    const k2 = document.getElementById('invKpiUnidades');
    const k3 = document.getElementById('invKpiCosto');
    if (k1) k1.textContent = '—';
    if (k2) k2.textContent = '—';
    if (k3) k3.textContent = '—';
    try {
        const rows = await inventarioService.select({}, { limit: 5000 });
        const list = (rows || []).map(p => ({ ...p, stock: p.stock != null ? p.stock : (p.existencia != null ? p.existencia : 0) }));
        const { desde, hasta, cat } = _getFilterInputs();
        let filtered = list;
        if (cat && cat !== 'todos') {
            filtered = filtered.filter(p => {
                const dep = (p.categoria || p.departamento || '').toString();
                return dep === cat || (cat === 'Automatización' && dep.includes('auto'));
            });
        }
        const productos = filtered.length;
        const unidades = filtered.reduce((a, p) => a + (parseInt(p.stock, 10) || 0), 0);
        const costoInv = filtered.reduce((a, p) => a + ((Number(p.costo) || 0) * (parseInt(p.stock, 10) || 0)), 0);
        if (k1) k1.textContent = String(productos);
        if (k2) k2.textContent = String(unidades);
        if (k3) k3.textContent = _fmtMoney(costoInv);
    } catch (_) {
        /* ignore */
    }
}

function _setDefaultDates() {
    const de = document.getElementById('contabDesde');
    const ha = document.getElementById('contabHasta');
    if (!de || !ha || (de.value && ha.value)) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    de.valueAsDate = first;
    ha.valueAsDate = last;
}

async function pagarCompra(compraId) {
    const montoStr = prompt('Monto a pagar (MXN):');
    if (!montoStr) return;
    const monto = Number(String(montoStr).replace(/[$,]/g, ''));
    if (!Number.isFinite(monto) || monto <= 0) { alert('Monto inválido.'); return; }
    const metodo = prompt('Método (transferencia/efectivo/tarjeta):', 'transferencia') || 'transferencia';
    const concepto = `Pago compra ${compraId ? String(compraId).slice(-6) : ''}`.trim();

    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
        await bancosService.insert({
            tipo: 'egreso',
            concepto,
            monto,
            fecha: new Date().toISOString().split('T')[0],
            metodo,
            notas: `compra_id=${compraId}`
        }, csrfToken);
        alert('✅ Pago registrado (egreso).');
        await _renderCobranza();
    } catch (e) {
        alert('Error: ' + (e?.message || e));
    }
}

async function refreshAll() {
    _syncExternalModuleLinks();
    await Promise.all([
        _renderVentasFacturas(),
        _renderCompras(),
        _renderCobranza(),
        _renderNomina(),
        _renderInventarioKPIs()
    ]);
}

async function init() {
    const p0 = new URLSearchParams(window.location.search);
    if (p0.get('desde')) {
        const el = document.getElementById('contabDesde');
        if (el) el.value = p0.get('desde');
    }
    if (p0.get('hasta')) {
        const el = document.getElementById('contabHasta');
        if (el) el.value = p0.get('hasta');
    }
    if (p0.get('departamento')) {
        const el = document.getElementById('contabCategoria');
        if (el) el.value = p0.get('departamento');
    }
    _setDefaultDates();

    document.getElementById('contabDesde')?.addEventListener('change', () => { _syncExternalModuleLinks(); refreshAll(); });
    document.getElementById('contabHasta')?.addEventListener('change', () => { _syncExternalModuleLinks(); refreshAll(); });
    document.getElementById('contabCategoria')?.addEventListener('change', () => { _syncExternalModuleLinks(); refreshAll(); });
    document.getElementById('contabAplicarFiltrosBtn')?.addEventListener('click', () => { _syncExternalModuleLinks(); refreshAll(); });

    const tabs = [
        { btn: 'tabVentasBtn', tab: 'tabVentas' },
        { btn: 'tabComprasBtn', tab: 'tabCompras' },
        { btn: 'tabCobranzaBtn', tab: 'tabCobranza' },
        { btn: 'tabNominaBtn', tab: 'tabNomina' },
    ];
    tabs.forEach(t => {
        const b = document.getElementById(t.btn);
        if (b) b.addEventListener('click', () => _setActiveTab(t.tab));
    });

    document.getElementById('refreshVentasBtn')?.addEventListener('click', _renderVentasFacturas);
    document.getElementById('refreshComprasBtn')?.addEventListener('click', _renderCompras);
    document.getElementById('refreshCobranzaBtn')?.addEventListener('click', _renderCobranza);
    document.getElementById('refreshNominaBtn')?.addEventListener('click', _renderNomina);
    document.getElementById('refreshInventarioBtn')?.addEventListener('click', _renderInventarioKPIs);

    const tab = (p0.get('tab') || '').toLowerCase();
    if (tab === 'compras') _setActiveTab('tabCompras');
    else if (tab === 'cobranza') _setActiveTab('tabCobranza');
    else if (tab === 'nomina') _setActiveTab('tabNomina');
    else _setActiveTab('tabVentas');

    // Bitácora (audit_logs) filtrada a tablas de este módulo
    initAuditFeed({
        tables: ['facturas', 'compras', 'movimientos_banco', 'pagos_nomina'],
        label: 'CONTABILIDAD',
        accentCssVar: '--c-contabilidad'
    });

    _syncExternalModuleLinks();
    await refreshAll();
}

window.contabilidadV2Module = { init, pagarCompra, refreshAll };
export { init, refreshAll };
