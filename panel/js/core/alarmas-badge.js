/**
 * SSEPI Alarmas Badge — mini-widget en el header con conteo de alarmas pendientes.
 * Polling 60s a Supabase. Emite evento 'ssepi:alarmas-new' por el event-bus
 * cuando detecta una alarma nueva.
 */
import { ssepiEmit, SSEPI_EVENTS } from './ssepi-event-bus.js';

const POLL_MS = 60_000;
const SSEPI_EVENTS_ALARMAS_NEW = 'ssepi:alarmas-new';

let _timer = null;
let _lastSeenIds = new Set();
let _currentSession = null;

function _getCurrentSession() {
    return window.supabase?.auth?.getUser?.().then(r => r?.data?.user?.id || null).catch(() => null);
}

function _getCurrentRol() {
    try { return (sessionStorage.getItem('ssepi_rol') || '').trim(); }
    catch { return ''; }
}

function _isAlarmaForCurrentUser(a) {
    if (!_currentSession) return true; // sin sesión conocida -> mostrar
    if (a.para_usuario && a.para_usuario !== _currentSession) return false;
    const rol = _getCurrentRol();
    if (a.para_modulo && rol && a.para_modulo !== rol && rol !== 'admin' && rol !== 'superadmin') {
        return false;
    }
    return true;
}

function _paintBadge(count) {
    const el = document.getElementById('ssepiAlarmasBadge');
    if (!el) return;
    if (count > 0) {
        el.textContent = String(count);
        el.style.display = '';
    } else {
        el.textContent = '0';
        el.style.display = 'none';
    }
}

async function _fetchPendientes() {
    if (!window.supabase) return [];
    try {
        const { data, error } = await window.supabase
            .from('alarmas')
            .select('id,titulo,mensaje,tipo,prioridad,para_modulo,para_usuario,disparar_at,created_at,metadata')
            .eq('estado', 'pendiente')
            .order('disparar_at', { ascending: true })
            .limit(50);
        if (error) { console.warn('[alarmas-badge] fetch', error.message); return []; }
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('[alarmas-badge] fetch exception', e?.message || e);
        return [];
    }
}

async function _tick() {
    if (!_currentSession) _currentSession = await _getCurrentSession();
    const all = await _fetchPendientes();
    const visibles = all.filter(_isAlarmaForCurrentUser);
    _paintBadge(visibles.length);
    // Detectar nuevas (id nunca visto)
    const nuevas = visibles.filter(a => !_lastSeenIds.has(a.id));
    if (nuevas.length && _lastSeenIds.size > 0) {
        // Ya estábamos pintando, emitir para que badges externos se enteren
        for (const a of nuevas) {
            try { ssepiEmit(SSEPI_EVENTS_ALARMAS_NEW, a); } catch (e) { /* ignore */ }
        }
    }
    _lastSeenIds = new Set(visibles.map(a => a.id));
}

function _setupRealtime() {
    if (!window.supabase || !window.supabase.channel) return;
    try {
        const ch = window.supabase.channel('alarmas_badge_global')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'alarmas' },
                (payload) => {
                    // Refrescar al recibir cualquier cambio
                    _tick();
                })
            .subscribe();
    } catch (e) {
        console.warn('[alarmas-badge] realtime setup failed', e?.message || e);
    }
}

export function mountAlarmasBadge() {
    if (_timer) return; // ya montado
    const el = document.getElementById('ssepiAlarmasBadge');
    if (!el) return;
    // Inicializar a 0
    el.style.display = 'none';
    _tick();
    _setupRealtime();
    _timer = setInterval(_tick, POLL_MS);
}

export function unmountAlarmasBadge() {
    if (_timer) { clearInterval(_timer); _timer = null; }
}

export { SSEPI_EVENTS_ALARMAS_NEW };
