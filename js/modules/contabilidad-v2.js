import { createDataService } from '../core/data-service.js';

const facturasService = createDataService('facturas');
const comprasService = createDataService('compras');
const ventasService = createDataService('ventas');
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

function _setActiveTab(tabId) {
    document.querySelectorAll('.contab-tab').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
}

async function _renderVentasFacturas() {
    const tbody = document.getElementById('ventasFacturasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="coi-log-loading">Cargando…</td></tr>';
    try {
        const rows = await facturasService.select({}, { orderBy: 'fecha_emision', ascending: false, limit: 200 });
        const list = (rows || []).slice(0, 200);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Sin facturas.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(f => `
            <tr>
                <td>${_escape(_fmtDate(f.fecha_emision))}</td>
                <td><strong>${_escape(f.folio_factura || '—')}</strong></td>
                <td>${_escape(f.cliente || '—')}</td>
                <td>${_escape(_fmtMoney(f.total || 0))}</td>
                <td>${_escape(f.estatus || '—')}</td>
                <td>
                    <a class="btn-ssepi" style="display:inline-flex; align-items:center; gap:.4rem; text-decoration:none;" href="/pages/ssepi_facturacion.html" title="Abrir Facturación">
                        <i class="fas fa-file-invoice"></i> Ver
                    </a>
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
    try {
        const rows = await comprasService.select({}, { orderBy: 'fecha_creacion', ascending: false, limit: 200 });
        const list = (rows || []).slice(0, 200);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="coi-log-empty">Sin compras.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(c => `
            <tr>
                <td>${_escape(_fmtDate(c.fecha_creacion))}</td>
                <td><strong>${_escape(c.folio || (c.id ? String(c.id).slice(-6) : '—'))}</strong></td>
                <td>${_escape(c.proveedor || '—')}</td>
                <td>${_escape(_fmtMoney(c.total || 0))}</td>
                <td>${_escape(c.estado != null ? String(c.estado) : '—')}</td>
                <td>
                    <button type="button" class="btn-ssepi" onclick="window.contabilidadV2Module.pagarCompra('${_escape(c.id)}')" title="Registrar pago (egreso)">
                        <i class="fas fa-money-bill-wave"></i> Pagar
                    </button>
                    <a class="btn-ssepi" style="display:inline-flex; align-items:center; gap:.4rem; text-decoration:none;" href="/pages/ssepi_compras.html" title="Abrir Compras">
                        <i class="fas fa-shopping-cart"></i>
                    </a>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="coi-log-empty">Error: ${_escape(e?.message || e)}</td></tr>`;
    }
}

async function _renderCobranza() {
    const tbody = document.getElementById('cobranzaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="coi-log-loading">Cargando…</td></tr>';
    try {
        const rows = await bancosService.select({}, { orderBy: 'fecha', ascending: false, limit: 200 });
        const list = (rows || []).filter(x => (x.tipo || '').toLowerCase() === 'ingreso').slice(0, 200);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Sin cobros registrados.</td></tr>';
            return;
        }
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
        tbody.innerHTML = `<tr><td colspan="5" class="coi-log-empty">Error: ${_escape(e?.message || e)}</td></tr>`;
    }
}

async function _renderNomina() {
    const tbody = document.getElementById('nominaBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="coi-log-loading">Cargando…</td></tr>';
    try {
        const rows = await nominaService.select({}, { orderBy: 'fecha_pago', ascending: false, limit: 200 });
        const list = (rows || []).slice(0, 200);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="coi-log-empty">Sin pagos de nómina.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(n => `
            <tr>
                <td>${_escape(_fmtDate(n.fecha_pago))}</td>
                <td>${_escape(n.empleado_nombre || '—')}</td>
                <td>${_escape((n.periodo_inicio || '—') + ' a ' + (n.periodo_fin || '—'))}</td>
                <td>${_escape(_fmtMoney(n.total || 0))}</td>
                <td>${_escape(n.estado || '—')}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="coi-log-empty">Error: ${_escape(e?.message || e)}</td></tr>`;
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
        const productos = list.length;
        const unidades = list.reduce((a, p) => a + (parseInt(p.stock, 10) || 0), 0);
        const costoInv = list.reduce((a, p) => a + ((Number(p.costo) || 0) * (parseInt(p.stock, 10) || 0)), 0);
        if (k1) k1.textContent = String(productos);
        if (k2) k2.textContent = String(unidades);
        if (k3) k3.textContent = _fmtMoney(costoInv);
    } catch (_) {
        /* ignore */
    }
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

async function init() {
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

    const rv = document.getElementById('refreshVentasBtn');
    if (rv) rv.addEventListener('click', _renderVentasFacturas);
    const rc = document.getElementById('refreshComprasBtn');
    if (rc) rc.addEventListener('click', _renderCompras);
    const rco = document.getElementById('refreshCobranzaBtn');
    if (rco) rco.addEventListener('click', _renderCobranza);
    const rn = document.getElementById('refreshNominaBtn');
    if (rn) rn.addEventListener('click', _renderNomina);
    const ri = document.getElementById('refreshInventarioBtn');
    if (ri) ri.addEventListener('click', _renderInventarioKPIs);

    await Promise.all([
        _renderVentasFacturas(),
        _renderCompras(),
        _renderCobranza(),
        _renderNomina(),
        _renderInventarioKPIs()
    ]);
}

window.contabilidadV2Module = { init, pagarCompra };
export { init };

