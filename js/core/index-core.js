// ================================================
// ARCHIVO: index-core.js
// DESCRIPCIÓN: Lógica del dashboard principal con Supabase
// ================================================

import { authService } from './auth-service.js';
import { createDataService } from './data-service.js';

export const IndexCore = (function() {
    let subscriptions = [];

    async function init() {
        console.log('✅ [Index] Conectado');
        _initUI();
        _bindEvents();
        _startClock();
        await _checkSupabaseConnection();
        _startRealtime();
        try {
            await _startListeners();
        } catch (e) {
            console.warn('[Index] Carga de KPIs/feed:', e);
        }
    }

    function _setSystemStatus({ connected, message }) {
        const el = document.querySelector('.system-status');
        if (el) {
            const dot = document.createElement('span');
            dot.className = 'status-indicator';
            dot.style.background = connected ? '#16a34a' : '#dc2626';

            const text = document.createElement('span');
            text.textContent = message || (connected ? 'CONECTADO A SUPABASE' : 'SIN CONEXIÓN A SUPABASE');

            el.replaceChildren(dot, text);
            el.dataset.status = connected ? 'connected' : 'disconnected';
        }

        const welcomeSub = document.querySelector('.welcome-subtitle.system-status-text');
        if (welcomeSub) {
            welcomeSub.textContent = connected ? 'Conectado a Supabase' : (message || 'Sin conexión');
        }
    }

    async function _checkSupabaseConnection() {
        const supabase = window.supabase;
        if (!supabase) {
            _setSystemStatus({ connected: false, message: 'SUPABASE NO INICIALIZADO' });
            return false;
        }

        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;

            // Ping DB con una lectura pequeña (verifica conectividad real)
            const { error: pingError } = await supabase
                .from('audit_logs')
                .select('id')
                .limit(1);
            if (pingError) throw pingError;

            _setSystemStatus({ connected: true, message: 'CONECTADO A SUPABASE' });
            return true;
        } catch (err) {
            console.error('[Index] Supabase connection check failed:', err);
            _setSystemStatus({ connected: false, message: 'SUPABASE DESCONECTADO' });
            return false;
        }
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        const themeBtn = document.getElementById('themeBtn');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _bindEvents() {
        const toggleBtn = document.getElementById('toggleMenu');
        const themeBtn = document.getElementById('themeBtn');
        if (toggleBtn) toggleBtn.addEventListener('click', _toggleMenu);
        if (themeBtn) themeBtn.addEventListener('click', _toggleTheme);
    }

    function _toggleMenu() {
        document.body.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    function _startClock() {
        const el = document.getElementById('clock');
        if (el) {
            function tick() {
                const d = new Date();
                const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
                el.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            }
            tick();
            setInterval(tick, 1000);
        }
    }

    function _startRealtime() {
        const supabase = window.supabase;
        if (!supabase) return;

        const auditSub = supabase
            .channel('index_audit_logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
                _loadFeed();
            })
            .subscribe();
        subscriptions.push(auditSub);

        window.addEventListener('beforeunload', _cleanup);
    }

    function _cleanup() {
        subscriptions.forEach(sub => {
            try { sub.unsubscribe(); } catch {}
        });
        subscriptions = [];
    }

    async function _startListeners() {
        const supabase = window.supabase;
        var profile = null;
        try {
            profile = await authService.getCurrentProfile();
        } catch (e) {}
        var rol = (profile && profile.rol) || document.body.dataset.rol || sessionStorage.getItem('ssepi_rol');
        var isVentas = (rol === 'ventas' || rol === 'ventas_sin_compras');

        // Perfil Ventas: ocultar tarjeta "Valor Inventario" (costos) en el panel
        var cardValorInv = document.querySelector('.card-kpi.kpi-3');
        if (cardValorInv) cardValorInv.style.display = isVentas ? 'none' : '';

        // KPI Ventas del Mes (o Compras Pendientes si perfil Ventas — resumen del proceso de Compras)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        if (isVentas) {
            try {
                const comprasService = createDataService('compras');
                const comprasPendientes = await comprasService.select({ estado: 1 });
                var card1 = document.querySelector('.card-kpi.kpi-1');
                if (card1) {
                    var titleEl = card1.querySelector('.kpi-title');
                    if (titleEl) titleEl.textContent = 'Compras Pendientes';
                    var subEl = card1.querySelector('.kpi-subtitle');
                    if (subEl) subEl.textContent = 'Por recibir';
                }
                document.getElementById('kpiVentasMes').innerHTML = comprasPendientes.length;
            } catch (e) {
                document.getElementById('kpiVentasMes').innerHTML = '—';
            }
        } else {
            try {
                const ventasService = createDataService('ventas');
                const ventas = await ventasService.select({
                    estatus_pago: 'Pagado',
                    fecha: { gte: startOfMonth, lte: endOfMonth }
                });
                const totalVentas = ventas.reduce((sum, v) => sum + (v.total || 0), 0);
                document.getElementById('kpiVentasMes').innerHTML = '$' + totalVentas.toLocaleString();
            } catch (e) {
                document.getElementById('kpiVentasMes').innerHTML = '—';
            }
        }

        // KPI Tareas Taller (pendientes)
        try {
            const tallerService = createDataService('ordenes_taller');
            const tallerPendientes = await tallerService.select({ estado: ['Diagnóstico', 'En Espera'] });
            const motoresService = createDataService('ordenes_motores');
            const motoresPendientes = await motoresService.select({ estado: ['Diagnóstico', 'En Espera'] });
            document.getElementById('kpiTareasTaller').innerText = tallerPendientes.length + motoresPendientes.length;
        } catch (e) {
            console.error('[Index] KPI TareasTaller failed:', e);
            document.getElementById('kpiTareasTaller').innerText = '—';
        }

        // KPI Valor Inventario (no mostrar ni cargar para perfil Ventas — sin costos)
        if (!isVentas) {
            try {
                const inventarioService = createDataService('inventario');
                const inventario = await inventarioService.select();
                const valorInventario = inventario.reduce((sum, p) => sum + (p.costo || 0) * (p.stock || 0), 0);
                document.getElementById('kpiValorInventario').innerHTML = '$' + valorInventario.toLocaleString();
            } catch (e) {
                console.error('[Index] KPI ValorInventario failed:', e);
                document.getElementById('kpiValorInventario').innerHTML = '—';
            }
        }

        // KPI Compras Pendientes
        try {
            const comprasService = createDataService('compras');
            const comprasPendientes = await comprasService.select({ estado: 1 }); // estado 1 = solicitud
            document.getElementById('kpiComprasPendientes').innerText = comprasPendientes.length;
        } catch (e) {
            console.error('[Index] KPI ComprasPendientes failed:', e);
            document.getElementById('kpiComprasPendientes').innerText = '—';
        }

        // Feed de auditoría (últimos 10 eventos)
        await _loadFeed();
    }

    async function _loadFeed() {
        const supabase = window.supabase;
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error cargando feed:', error);
            return;
        }

        const feedList = document.getElementById('feedList');
        feedList.innerHTML = '';
        data.forEach(log => {
            const item = document.createElement('div');
            item.className = 'feed-item';
            item.innerHTML = `
                <div class="feed-dot"></div>
                <div class="feed-meta">
                    <span>${log.table_name?.toUpperCase() || 'SISTEMA'}</span>
                    <span>${new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="feed-body">
                    <strong>${log.action}</strong> en ${log.table_name} ID: ${log.record_id?.substring(0,8)}...
                </div>
            `;
            feedList.appendChild(item);
        });
        document.getElementById('feedBadge').innerText = data.length;
    }

    return { init };
})();

window.indexCore = IndexCore;