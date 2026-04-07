/**
 * Contabilidad híbrida: COI local + motor bridge + historial en Supabase (coi_sync_log).
 */
import { checkCoiBridgeHealth, getCoiBridgeBaseUrl, COI_SYNC_DEFAULT_BASE } from '../core/coi-sync-engine.js';
import { createDataService } from '../core/data-service.js';

const BRIDGE_CMD = 'python -m bridge.bridge_server';
const coiLogService = createDataService('coi_sync_log');
const coiQueueService = createDataService('coi_sync_queue');
const tallerService = createDataService('ordenes_taller');
const motoresService = createDataService('ordenes_motores');
const facturasService = createDataService('facturas');

let logChannel = null;
let inboxChannel = null;

function _bindSidebarToggle() {
    const btn = document.getElementById('toggleMenuBtn') || document.getElementById('toggleMenu');
    const sidebar = document.getElementById('sidebar');
    const body = document.body;
    if (btn && sidebar) {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) sidebar.classList.toggle('active');
            else body.classList.toggle('sidebar-closed');
        });
    }
}

async function _refreshMotorStatus() {
    const el = document.getElementById('coiMotorStatus');
    const dot = document.getElementById('coiMotorDot');
    if (!el) return;
    el.textContent = 'Comprobando…';
    if (dot) dot.className = 'coi-status-dot coi-status-pending';
    const { ok } = await checkCoiBridgeHealth();
    if (ok) {
        el.textContent = 'Motor local activo (puerto 8765)';
        if (dot) dot.className = 'coi-status-dot coi-status-on';
    } else {
        el.textContent = 'Motor no responde — en esta PC ejecuta el bridge (mi-coi)';
        if (dot) dot.className = 'coi-status-dot coi-status-off';
    }
}

function _fmtMoney(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n));
}

function _fmtDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
        return iso;
    }
}

function _statusBadge(status) {
    const s = (status || '').toLowerCase();
    if (s === 'ok') return '<span class="coi-badge coi-badge-ok">Póliza</span>';
    if (s === 'skipped') return '<span class="coi-badge coi-badge-skip">Ya estaba</span>';
    if (s === 'error') return '<span class="coi-badge coi-badge-err">Error</span>';
    return `<span class="coi-badge">${status || '—'}</span>`;
}

async function loadSyncLog() {
    const tbody = document.getElementById('coiSyncLogBody');
    const hint = document.getElementById('coiSyncLogHint');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="coi-log-loading">Cargando historial…</td></tr>';
    if (hint) hint.style.display = 'none';

    try {
        const rows = await coiLogService.select({}, {
            orderBy: 'created_at',
            ascending: false,
            limit: 100
        });
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="coi-log-empty">Sin eventos aún. Cuando el bridge procese ventas/compras y esté configurado Supabase, aparecerán aquí.</td></tr>';
            if (hint) hint.style.display = 'block';
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${_fmtDate(r.created_at)}</td>
                <td><span class="coi-src">${(r.source || '').toUpperCase()}</span></td>
                <td>${_escapeHtml(r.folio || '—')}</td>
                <td><code class="coi-code-inline">${_escapeHtml((r.erp_id || '').slice(0, 8))}…</code></td>
                <td>${_statusBadge(r.status)}</td>
                <td>${r.poliza_id != null ? r.poliza_id : '—'}</td>
                <td>${r.numero_poliza != null ? r.numero_poliza : '—'}</td>
                <td>${_fmtMoney(r.monto)}</td>
            </tr>
        `).join('');
        const errRows = rows.filter(x => x.status === 'error' && x.error_message);
        if (errRows.length && hint) {
            hint.innerHTML = '<strong>Último error:</strong> ' + _escapeHtml(errRows[0].error_message);
            hint.style.display = 'block';
        }
    } catch (e) {
        console.warn('[Contabilidad COI] coi_sync_log:', e);
        tbody.innerHTML = '<tr><td colspan="8" class="coi-log-empty">No se pudo leer el historial. Ejecuta en Supabase <code>scripts/migrations/coi-sync-log.sql</code> y comprueba tu rol (admin / contabilidad).</td></tr>';
        if (hint) {
            hint.textContent = (e && e.message) ? e.message : String(e);
            hint.style.display = 'block';
        }
    }
}

function _badgeHtml(text, kind) {
    const k = kind || 'muted';
    const cls = k === 'ok' ? 'coi-badge coi-badge-ok' : k === 'err' ? 'coi-badge coi-badge-err' : 'coi-badge coi-badge-skip';
    return `<span class="${cls}">${_escapeHtml(text)}</span>`;
}

function _actionBtnHtml(label, href) {
    const safeHref = href ? String(href) : '#';
    return `<a class="btn-ssepi" style="display:inline-flex; align-items:center; gap:.4rem; text-decoration:none;" href="${_escapeHtml(safeHref)}">${_escapeHtml(label)}</a>`;
}

async function loadInbox() {
    const kpiFact = document.getElementById('coiInboxKpiFacturar');
    const kpiPend = document.getElementById('coiInboxKpiPolizasPend');
    const kpiErr = document.getElementById('coiInboxKpiErrores');
    const tbody = document.getElementById('coiInboxBody');
    const hint = document.getElementById('coiInboxHint');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="coi-log-loading">Cargando entradas…</td></tr>';
    if (hint) hint.style.display = 'none';
    if (kpiFact) kpiFact.textContent = '—';
    if (kpiPend) kpiPend.textContent = '—';
    if (kpiErr) kpiErr.textContent = '—';

    try {
        const [tallerRep, motoresRep, facturasUlt, queuePend, queueErr] = await Promise.all([
            tallerService.select({ estado: 'Reparado' }, { select: 'id, folio, estado', orderBy: 'fecha_reparacion', ascending: false, limit: 25 }).catch(() => []),
            motoresService.select({ estado: 'Reparado' }, { select: 'id, folio, estado', orderBy: 'fecha_reparacion', ascending: false, limit: 25 }).catch(() => []),
            facturasService.select({}, { select: 'id, folio_factura, uuid_cfdi, estatus, total, fecha_emision, cliente', orderBy: 'fecha_emision', ascending: false, limit: 25 }).catch(() => []),
            coiQueueService.select({ status: 'pending' }, { select: 'id, erp_source, erp_id, folio, status, created_at', orderBy: 'created_at', ascending: false, limit: 50 }).catch(() => []),
            coiQueueService.select({ status: 'error' }, { select: 'id, erp_source, erp_id, folio, status, last_error, created_at', orderBy: 'created_at', ascending: false, limit: 25 }).catch(() => []),
        ]);

        const facturarCount = (tallerRep?.length || 0) + (motoresRep?.length || 0);
        const pendCount = queuePend?.length || 0;
        const errCount = queueErr?.length || 0;

        if (kpiFact) kpiFact.textContent = String(facturarCount);
        if (kpiPend) kpiPend.textContent = String(pendCount);
        if (kpiErr) kpiErr.textContent = String(errCount);

        const rows = [];
        (tallerRep || []).slice(0, 10).forEach(o => rows.push({
            tipo: 'Taller',
            folio: o.folio || (o.id ? String(o.id).slice(-6) : '—'),
            estado: 'Por facturar/timbrar',
            actionHtml: _actionBtnHtml('Abrir facturación', '/pages/ssepi_facturacion.html'),
        }));
        (motoresRep || []).slice(0, 10).forEach(o => rows.push({
            tipo: 'Motores',
            folio: o.folio || (o.id ? String(o.id).slice(-6) : '—'),
            estado: 'Por facturar/timbrar',
            actionHtml: _actionBtnHtml('Abrir facturación', '/pages/ssepi_facturacion.html'),
        }));

        // Facturas timbradas (ya registradas): se envían a COI por cola (factura) cuando exista bridge
        (facturasUlt || []).filter(f => (f.estatus || '').toLowerCase() === 'activa').slice(0, 10).forEach(f => rows.push({
            tipo: 'Factura',
            folio: f.folio_factura || (f.id ? String(f.id).slice(-6) : '—'),
            estado: 'Timbrada (lista para COI)',
            actionHtml: _badgeHtml('Automático', 'ok'),
        }));
        (queueErr || []).slice(0, 10).forEach(q => rows.push({
            tipo: `COI (${(q.erp_source || '').toUpperCase()})`,
            folio: q.folio || (q.erp_id ? String(q.erp_id).slice(-6) : '—'),
            estado: 'Error contable',
            actionHtml: _badgeHtml('Revisar', 'err'),
        }));
        (queuePend || []).slice(0, 10).forEach(q => rows.push({
            tipo: `COI (${(q.erp_source || '').toUpperCase()})`,
            folio: q.folio || (q.erp_id ? String(q.erp_id).slice(-6) : '—'),
            estado: 'Pendiente de póliza',
            actionHtml: _badgeHtml('Automático', 'muted'),
        }));

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="coi-log-empty">Sin pendientes. Si acabas de registrar ventas/compras o facturas, usa “Actualizar entradas”.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${_escapeHtml(r.tipo)}</td>
                <td>${_escapeHtml(r.folio)}</td>
                <td>${_escapeHtml(r.estado)}</td>
                <td>${r.actionHtml}</td>
            </tr>
        `).join('');

        if (errCount && hint) {
            const msg = (queueErr && queueErr[0] && queueErr[0].last_error) ? String(queueErr[0].last_error) : 'Hay errores contables en la cola.';
            hint.innerHTML = '<strong>Atención:</strong> ' + _escapeHtml(msg);
            hint.style.display = 'block';
        }
    } catch (e) {
        console.warn('[Contabilidad COI] inbox:', e);
        tbody.innerHTML = '<tr><td colspan="4" class="coi-log-empty">No se pudo cargar “Entradas”. Asegura la migración <code>scripts/migrations/coi-sync-queue.sql</code> y permisos del rol.</td></tr>';
        if (hint) {
            hint.textContent = (e && e.message) ? e.message : String(e);
            hint.style.display = 'block';
        }
    }
}

function _escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function _setupLogRealtime() {
    const supabase = window.supabase;
    if (!supabase || typeof supabase.channel !== 'function') return;
    try {
        if (logChannel) {
            supabase.removeChannel(logChannel);
            logChannel = null;
        }
        logChannel = supabase
            .channel('coi_sync_log_ui')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'coi_sync_log' }, () => {
                loadSyncLog();
            })
            .subscribe();
    } catch (_) {
        /* Realtime opcional: sin publicación en supabase_realtime no pasa nada */
    }
}

function _setupInboxRealtime() {
    const supabase = window.supabase;
    if (!supabase || typeof supabase.channel !== 'function') return;
    try {
        if (inboxChannel) {
            supabase.removeChannel(inboxChannel);
            inboxChannel = null;
        }
        inboxChannel = supabase
            .channel('coi_inbox_ui')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'coi_sync_queue' }, () => {
                loadInbox();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_taller' }, () => {
                loadInbox();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_motores' }, () => {
                loadInbox();
            })
            .subscribe();
    } catch (_) {
        /* realtime opcional */
    }
}

function _bindCoiPanel() {
    const testBtn = document.getElementById('coiTestMotorBtn');
    if (testBtn) testBtn.addEventListener('click', () => _refreshMotorStatus());

    const refreshLogBtn = document.getElementById('coiRefreshLogBtn');
    if (refreshLogBtn) refreshLogBtn.addEventListener('click', () => loadSyncLog());

    const goFactBtn = document.getElementById('coiInboxGoFacturacionBtn');
    if (goFactBtn) goFactBtn.addEventListener('click', () => { window.location.href = '/pages/ssepi_facturacion.html'; });
    const refreshInboxBtn = document.getElementById('coiInboxRefreshBtn');
    if (refreshInboxBtn) refreshInboxBtn.addEventListener('click', () => loadInbox());

    const copyBtn = document.getElementById('coiCopyBridgeCmdBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const text = `cd mi-coi\n${BRIDGE_CMD}`;
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado';
                setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar comandos'; }, 2000);
            } catch (_) {
                alert(text);
            }
        });
    }

    const copyMainBtn = document.getElementById('coiCopyMainCmdBtn');
    if (copyMainBtn) {
        copyMainBtn.addEventListener('click', async () => {
            const text = 'cd mi-coi\npython main.py';
            try {
                await navigator.clipboard.writeText(text);
                copyMainBtn.innerHTML = '<i class="fas fa-check"></i> Copiado';
                setTimeout(() => { copyMainBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar arranque COI'; }, 2000);
            } catch (_) {
                alert(text);
            }
        });
    }

    const urlInput = document.getElementById('coiBridgeUrlInput');
    if (urlInput) {
        try {
            urlInput.value = localStorage.getItem('ssepi_coi_bridge_url') || COI_SYNC_DEFAULT_BASE;
        } catch (_) {
            urlInput.value = COI_SYNC_DEFAULT_BASE;
        }
        urlInput.addEventListener('change', () => {
            try {
                const v = (urlInput.value || '').trim();
                if (v) localStorage.setItem('ssepi_coi_bridge_url', v.replace(/\/$/, ''));
            } catch (_) { /* ignore */ }
        });
    }

    const keyInput = document.getElementById('coiBridgeKeyInput');
    if (keyInput) {
        try {
            keyInput.value = localStorage.getItem('ssepi_coi_bridge_key') || '';
        } catch (_) {
            keyInput.value = '';
        }
        keyInput.addEventListener('change', () => {
            try {
                localStorage.setItem('ssepi_coi_bridge_key', (keyInput.value || '').trim());
            } catch (_) { /* ignore */ }
        });
    }
}

async function init() {
    console.log('[Contabilidad COI] Módulo iniciado');
    _bindSidebarToggle();
    _bindCoiPanel();
    await _refreshMotorStatus();
    await loadInbox();
    await loadSyncLog();
    _setupLogRealtime();
    _setupInboxRealtime();
}

window.addEventListener('beforeunload', () => {
    try {
        if (logChannel && window.supabase && typeof window.supabase.removeChannel === 'function') {
            window.supabase.removeChannel(logChannel);
        }
        if (inboxChannel && window.supabase && typeof window.supabase.removeChannel === 'function') {
            window.supabase.removeChannel(inboxChannel);
        }
    } catch (_) { /* ignore */ }
});

const ContabilidadCoiModule = { init, refreshMotorStatus: _refreshMotorStatus, loadSyncLog, getCoiBridgeBaseUrl };

export { ContabilidadCoiModule, init, loadSyncLog };
window.contabilidadCoiModule = ContabilidadCoiModule;
