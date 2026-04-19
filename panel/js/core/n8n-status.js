// ================================================
// ARCHIVO: n8n-status.js
// Indicador de estado de n8n via heartbeat en Supabase
// ================================================

export const N8nStatus = (function() {
    let _interval = null;
    let _active = false;

    async function check() {
        const supabase = window.supabase;
        const el = document.getElementById('n8nStatusIndicator');
        if (!el || !supabase) return;

        try {
            const { data, error } = await supabase
                .from('n8n_heartbeat')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            const latest = data && data.length > 0 ? data[0].created_at : null;
            const ageMs = latest ? (Date.now() - new Date(latest).getTime()) : Infinity;
            _active = ageMs < 120_000;

            el.innerHTML = `
                <span class="status-indicator" style="background:${_active ? '#16a34a' : '#dc2626'};"></span>
                <span>${_active ? 'N8N ACTIVO' : 'N8N DESCONECTADO'}</span>
            `;
            el.dataset.status = _active ? 'active' : 'inactive';
        } catch {
            _active = false;
            el.innerHTML = `
                <span class="status-indicator" style="background:#dc2626;"></span>
                <span>N8N DESCONECTADO</span>
            `;
            el.dataset.status = 'inactive';
        }
    }

    function init() {
        check();
        if (_interval) clearInterval(_interval);
        _interval = setInterval(check, 60_000);
    }

    function isActive() {
        return _active;
    }

    return { init, isActive, check };
})();

window.N8nStatus = N8nStatus;