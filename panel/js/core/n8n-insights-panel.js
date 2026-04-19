// ================================================
// ARCHIVO: n8n-insights-panel.js
// Panel de insights generados por los workflows de n8n
// ================================================

import { authService } from './auth-service.js';

export const N8nInsightsPanel = (function() {
    let _channel = null;
    let _pollInterval = null;
    let _insights = [];
    let _expanded = false;

    const SEVERITY_CONFIG = {
        critical: { color: '#dc2626', icon: 'fas fa-exclamation-circle', label: 'CRÍTICO' },
        warning:  { color: '#f59e0b', icon: 'fas fa-exclamation-triangle', label: 'AVISO' },
        info:     { color: '#3b82f6', icon: 'fas fa-info-circle', label: 'INFO' }
    };

    function _render() {
        const container = document.getElementById('n8nInsightsPanel');
        if (!container) return;

        const activeInsights = _insights.filter(i => !i.dismissed).slice(0, 15);

        container.innerHTML = `
            <div class="n8n-insights-header" id="n8nInsightsToggle">
                <span><i class="fas fa-brain"></i> INSIGHTS IA</span>
                <span class="n8n-insights-badge">${activeInsights.length > 0 ? activeInsights.length : ''}</span>
                <i class="fas fa-chevron-${_expanded ? 'up' : 'down'} n8n-insights-chevron"></i>
            </div>
            <div class="n8n-insights-body${_expanded ? ' expanded' : ''}" id="n8nInsightsBody">
                ${activeInsights.length === 0
                    ? '<div class="n8n-insights-empty">Sin insights pendientes</div>'
                    : activeInsights.map(i => _renderInsight(i)).join('')
                }
            </div>
        `;

        const toggle = document.getElementById('n8nInsightsToggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                _expanded = !_expanded;
                _render();
            });
        }

        activeInsights.forEach(i => {
            const dismissBtn = document.getElementById(`n8n-dismiss-${i.id}`);
            if (dismissBtn) {
                dismissBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _dismissInsight(i.id);
                });
            }
            const insightEl = document.getElementById(`n8n-insight-${i.id}`);
            if (insightEl) {
                insightEl.addEventListener('click', () => _toggleDetail(i.id));
            }
        });
    }

    function _renderInsight(i) {
        const sev = SEVERITY_CONFIG[i.severity] || SEVERITY_CONFIG.info;
        const ts = i.created_at ? new Date(i.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const detailId = `n8n-insight-detail-${i.id}`;

        return `
            <div class="n8n-insight-item" id="n8n-insight-${i.id}">
                <div class="n8n-insight-row">
                    <i class="${sev.icon}" style="color:${sev.color};margin-right:6px;"></i>
                    <span class="n8n-insight-summary">${i.summary || ''}</span>
                    <span class="n8n-insight-time">${ts}</span>
                    <button class="n8n-dismiss-btn" id="n8n-dismiss-${i.id}" title="Descartar"><i class="fas fa-times"></i></button>
                </div>
                <div class="n8n-insight-detail" id="${detailId}" style="display:none;">
                    ${i.detail ? `<p>${i.detail}</p>` : ''}
                    ${i.action_suggested ? `<p class="n8n-insight-action"><i class="fas fa-lightbulb"></i> ${i.action_suggested}</p>` : ''}
                </div>
            </div>
        `;
    }

    function _toggleDetail(id) {
        const el = document.getElementById(`n8n-insight-detail-${id}`);
        if (el) {
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }
    }

    async function _dismissInsight(id) {
        const supabase = window.supabase;
        if (!supabase) return;
        try {
            await supabase.from('n8n_insights').update({ dismissed: true }).eq('id', id);
            _insights = _insights.map(i => i.id === id ? { ...i, dismissed: true } : i);
            _render();
        } catch (e) {
            console.warn('[n8n-insights] Error dismissing:', e);
        }
    }

    async function _loadInsights() {
        const supabase = window.supabase;
        if (!supabase) return;

        try {
            const profile = await authService.getCurrentProfile();
            const rol = profile?.rol || sessionStorage.getItem('ssepi_rol') || '';

            let query = supabase
                .from('n8n_insights')
                .select('*')
                .eq('dismissed', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (rol && !['admin', 'superadmin'].includes(rol)) {
                query = query.or(`module_target.is.null,module_target.eq.${rol}`);
            }

            const { data, error } = await query;
            if (error) throw error;
            _insights = data || [];
            _render();
        } catch (e) {
            console.warn('[n8n-insights] Load error:', e);
        }
    }

    function _startRealtime() {
        const supabase = window.supabase;
        if (!supabase) return;

        _channel = supabase
            .channel('n8n_insights_panel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'n8n_insights' }, (payload) => {
                const newInsight = payload.new;
                if (newInsight && !newInsight.dismissed) {
                    if (!_insights.find(i => i.id === newInsight.id)) {
                        _insights.unshift(newInsight);
                        _render();
                    }
                }
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    _startPolling();
                }
            });
    }

    function _startPolling() {
        if (_pollInterval) return;
        _pollInterval = setInterval(_loadInsights, 30_000);
    }

    function init() {
        _loadInsights();
        _startRealtime();
    }

    function getInsights() {
        return _insights.filter(i => !i.dismissed);
    }

    return { init, getInsights };
})();

window.N8nInsightsPanel = N8nInsightsPanel;