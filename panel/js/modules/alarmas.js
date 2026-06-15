/**
 * SSEPI · Módulo Alarmas — UI admin
 * Lista + filtros + CRUD contra tabla `public.alarmas`
 */

const AlarmasModule = (function () {
    let _cache = [];
    let _channel = null;

    // ── Init ───────────────────────────────────────────────────────────────
    async function init() {
        if (!window.supabase) {
            console.error('[Alarmas] Supabase no disponible');
            return;
        }
        bindFiltros();
        bindModal();
        await refresh();
        setupRealtime();
    }

    // ── Render ─────────────────────────────────────────────────────────────
    async function refresh() {
        const tbody = document.getElementById('alarmasBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Cargando...</td></tr>';
        try {
            const { data, error } = await window.supabase
                .from('alarmas')
                .select('*')
                .order('disparar_at', { ascending: true })
                .limit(200);
            if (error) throw error;
            _cache = Array.isArray(data) ? data : [];
            renderTable();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#dc2626;">Error: ' + esc(e?.message || e) + '</td></tr>';
        }
    }

    function renderTable() {
        const tbody = document.getElementById('alarmasBody');
        if (!tbody) return;
        const filtros = getFiltros();
        const filtradas = _cache.filter(a => {
            if (filtros.estado && a.estado !== filtros.estado) return false;
            if (filtros.modulo && a.para_modulo !== filtros.modulo) return false;
            if (filtros.prioridad && a.prioridad !== filtros.prioridad) return false;
            return true;
        });
        document.getElementById('alarmasCount').textContent = String(filtradas.length);
        if (!filtradas.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No hay alarmas con esos filtros.</td></tr>';
            return;
        }
        const colorByPrioridad = { baja: '#3b82f6', media: '#f59e0b', alta: '#ef4444', critica: '#dc2626' };
        const estadoBadge = (e) => {
            const map = {
                pendiente: { bg: '#fef3c7', fg: '#92400e', label: 'Pendiente' },
                disparada: { bg: '#d1fae5', fg: '#065f46', label: 'Disparada' },
                cancelada: { bg: '#e2e8f0', fg: '#475569', label: 'Cancelada' }
            };
            const m = map[e] || map.pendiente;
            return '<span style="background:' + m.bg + ';color:' + m.fg + ';padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;text-transform:uppercase;">' + m.label + '</span>';
        };
        tbody.innerHTML = filtradas.map(a => {
            const prio = (a.prioridad || 'media');
            const color = colorByPrioridad[prio] || colorByPrioridad.media;
            const disparar = a.disparar_at ? new Date(a.disparar_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';
            const acciones = [];
            if (a.estado === 'pendiente') {
                acciones.push('<button class="btn-accion btn-cancelar" data-id="' + a.id + '" title="Cancelar" style="background:#fef3c7;color:#92400e;border:none;padding:5px 9px;border-radius:5px;cursor:pointer;margin-right:4px;"><i class="fas fa-ban"></i></button>');
                acciones.push('<button class="btn-accion btn-disparar" data-id="' + a.id + '" title="Marcar como disparada" style="background:#d1fae5;color:#065f46;border:none;padding:5px 9px;border-radius:5px;cursor:pointer;margin-right:4px;"><i class="fas fa-check"></i></button>');
            }
            acciones.push('<button class="btn-accion btn-eliminar" data-id="' + a.id + '" title="Eliminar" style="background:#fee2e2;color:#991b1b;border:none;padding:5px 9px;border-radius:5px;cursor:pointer;"><i class="fas fa-trash"></i></button>');
            return '<tr>' +
                '<td><div style="font-weight:600;color:#0f172a;">' + esc(a.titulo) + '</div><div style="color:#64748b;font-size:12px;margin-top:2px;">' + esc((a.mensaje || '').slice(0, 100)) + '</div></td>' +
                '<td><span style="color:#475569;font-size:12px;">' + esc(a.tipo) + '</span></td>' +
                '<td><span style="color:#475569;">' + esc(a.para_modulo || 'Todos') + '</span></td>' +
                '<td><span style="background:' + color + '22;color:' + color + ';padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;text-transform:uppercase;">' + esc(prio) + '</span></td>' +
                '<td style="font-size:13px;color:#334155;">' + disparar + '</td>' +
                '<td>' + estadoBadge(a.estado) + '</td>' +
                '<td>' + acciones.join('') + '</td>' +
                '</tr>';
        }).join('');
        bindAcciones();
    }

    // ── Filtros ────────────────────────────────────────────────────────────
    function getFiltros() {
        return {
            estado: document.getElementById('filtroEstado')?.value || '',
            modulo: document.getElementById('filtroModulo')?.value || '',
            prioridad: document.getElementById('filtroPrioridad')?.value || ''
        };
    }
    function bindFiltros() {
        ['filtroEstado', 'filtroModulo', 'filtroPrioridad'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderTable);
        });
    }

    // ── Acciones ───────────────────────────────────────────────────────────
    function bindAcciones() {
        document.querySelectorAll('.btn-cancelar').forEach(b => b.addEventListener('click', () => cambiarEstado(b.dataset.id, 'cancelada')));
        document.querySelectorAll('.btn-disparar').forEach(b => b.addEventListener('click', () => cambiarEstado(b.dataset.id, 'disparada')));
        document.querySelectorAll('.btn-eliminar').forEach(b => b.addEventListener('click', () => eliminar(b.dataset.id)));
    }

    async function cambiarEstado(id, estado) {
        const update = { estado };
        if (estado === 'disparada') update.disparada_at = new Date().toISOString();
        const { error } = await window.supabase.from('alarmas').update(update).eq('id', id);
        if (error) { _showToast('Error: ' + error.message, 'error'); return; }
        _showToast('Alarma ' + estado, 'success');
        await refresh();
    }

    async function eliminar(id) {
        if (!confirm('¿Eliminar definitivamente esta alarma?')) return;
        const { error } = await window.supabase.from('alarmas').delete().eq('id', id);
        if (error) { _showToast('Error: ' + error.message, 'error'); return; }
        _showToast('Alarma eliminada', 'success');
        await refresh();
    }

    // ── Modal ──────────────────────────────────────────────────────────────
    function bindModal() {
        const btnNueva = document.getElementById('btnNuevaAlarma');
        if (btnNueva) btnNueva.addEventListener('click', openCrear);
        const btnCerrar = document.getElementById('btnCerrarAlarmaModal');
        if (btnCerrar) btnCerrar.addEventListener('click', closeModal);
        const btnCancelar = document.getElementById('btnCancelarAlarma');
        if (btnCancelar) btnCancelar.addEventListener('click', closeModal);
        const form = document.getElementById('alarmaForm');
        if (form) form.addEventListener('submit', onSubmit);
    }
    function openCrear() {
        document.getElementById('alarmaModalTitle').textContent = 'Nueva alarma';
        document.getElementById('alarmaId').value = '';
        document.getElementById('alarmaForm').reset();
        // default disparar_at = ahora + 1h
        const t = new Date(Date.now() + 60 * 60 * 1000);
        const isoLocal = t.toISOString().slice(0, 16);
        document.getElementById('alarmaDispararAt').value = isoLocal;
        document.getElementById('alarmaModal').style.display = 'flex';
    }
    function closeModal() {
        document.getElementById('alarmaModal').style.display = 'none';
    }
    async function onSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('alarmaId').value;
        const dispararLocal = document.getElementById('alarmaDispararAt').value;
        const dispararIso = dispararLocal ? new Date(dispararLocal).toISOString() : null;
        const payload = {
            titulo: document.getElementById('alarmaTitulo').value.trim(),
            mensaje: document.getElementById('alarmaMensaje').value.trim(),
            tipo: document.getElementById('alarmaTipo').value,
            prioridad: document.getElementById('alarmaPrioridad').value,
            para_modulo: document.getElementById('alarmaModulo').value || null,
            disparar_at: dispararIso
        };
        if (!payload.titulo || !payload.mensaje || !payload.disparar_at) {
            _showToast('Completa título, mensaje y fecha de disparo.', 'warning');
            return;
        }
        let result;
        if (id) {
            result = await window.supabase.from('alarmas').update(payload).eq('id', id);
        } else {
            payload.estado = 'pendiente';
            result = await window.supabase.from('alarmas').insert(payload);
        }
        if (result.error) { _showToast('Error: ' + result.error.message, 'error'); return; }
        _showToast(id ? 'Alarma actualizada' : 'Alarma creada', 'success');
        closeModal();
        await refresh();
    }

    // ── Realtime ───────────────────────────────────────────────────────────
    function setupRealtime() {
        try {
            _channel = window.supabase.channel('alarmas_admin')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'alarmas' }, () => {
                    refresh();
                })
                .subscribe();
        } catch (e) { console.warn('[Alarmas] realtime setup', e?.message || e); }
    }

    // ── Util ───────────────────────────────────────────────────────────────
    function esc(s) {
        return s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    return { init, refresh };
})();

document.addEventListener('DOMContentLoaded', () => {
    AlarmasModule.init().catch(err => console.error('[Alarmas] init', err));
});
