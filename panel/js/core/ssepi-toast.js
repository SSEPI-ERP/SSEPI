/**
 * SSEPI Toast Notification System
 * Reemplaza alert() con notificaciones estilizadas por modulo.
 * Uso: _showToast('mensaje', 'success'|'error'|'warning'|'info')
 *
 * Extensiones para alarmas:
 *   addAlarmToast(alarma, onMarcarLeida)
 *   playAlarmSound(prioridad)
 */
function _showToast(mensaje, tipo) {
    tipo = tipo || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    var iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    var toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + tipo;
    toast.style.pointerEvents = 'auto';
    toast.innerHTML =
        '<i class="fas ' + (iconMap[tipo] || iconMap.info) + ' toast-icon"></i>' +
        '<span class="toast-message">' + mensaje + '</span>' +
        '<button class="toast-close" aria-label="Cerrar">&times;</button>';
    toast.querySelector('.toast-close').addEventListener('click', function () {
        toast.classList.add('hiding');
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    });
    container.appendChild(toast);
    setTimeout(function () {
        if (toast.parentNode) {
            toast.classList.add('hiding');
            setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }
    }, 5000);
}

/**
 * Toast persistente para alarmas. No se auto-dismiss.
 * @param {object} alarma - {id, titulo, mensaje, prioridad, tipo, para_modulo, created_at}
 * @param {function} onMarcarLeida - callback (id) cuando el usuario hace click en "Marcar leída"
 */
function addAlarmToast(alarma, onMarcarLeida) {
    if (!alarma || !alarma.id) return;
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    var prioridad = (alarma.prioridad || 'media').toLowerCase();
    var colorByPrioridad = {
        baja: '#3b82f6',
        media: '#f59e0b',
        alta: '#ef4444',
        critica: '#dc2626'
    };
    var iconByPrioridad = {
        baja: 'fa-bell',
        media: 'fa-exclamation-circle',
        alta: 'fa-exclamation-triangle',
        critica: 'fa-radiation'
    };
    var color = colorByPrioridad[prioridad] || colorByPrioridad.media;
    var icon = iconByPrioridad[prioridad] || iconByPrioridad.media;
    var toast = document.createElement('div');
    toast.className = 'toast-alarma';
    toast.dataset.alarmaId = alarma.id;
    toast.style.cssText = 'pointer-events:auto;background:white;border-left:5px solid ' + color + ';border-radius:8px;padding:14px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.12);min-width:320px;max-width:420px;display:flex;flex-direction:column;gap:6px;font-family:Inter,system-ui,sans-serif;';
    toast.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
            '<i class="fas ' + icon + '" style="color:' + color + ';font-size:20px;margin-top:2px;"></i>' +
            '<div style="flex:1;">' +
                '<div style="font-weight:700;color:#0f172a;font-size:14px;">' + (alarma.titulo || 'Alarma') + '</div>' +
                '<div style="color:#475569;font-size:13px;margin-top:2px;">' + (alarma.mensaje || '') + '</div>' +
                (alarma.para_modulo ? '<div style="color:#94a3b8;font-size:11px;margin-top:4px;text-transform:uppercase;">→ ' + alarma.para_modulo + '</div>' : '') +
            '</div>' +
            '<button class="toast-close" aria-label="Cerrar" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;">&times;</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:6px;">' +
            '<button class="btn-marcar-leida" style="flex:1;background:' + color + ';color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Marcar leída</button>' +
        '</div>';
    toast.querySelector('.toast-close').addEventListener('click', function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    toast.querySelector('.btn-marcar-leida').addEventListener('click', function () {
        if (typeof onMarcarLeida === 'function') onMarcarLeida(alarma.id);
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    container.appendChild(toast);
    // Las alarmas NO se auto-cierran. Suenan una vez.
    playAlarmSound(prioridad);
}

/**
 * Beep corto usando Web Audio API. Frecuencia distinta por prioridad.
 * Silencioso si el navegador bloquea AudioContext sin interacción previa.
 */
function playAlarmSound(prioridad) {
    try {
        var freqByPrioridad = { baja: 440, media: 660, alta: 880, critica: 1100 };
        var freq = freqByPrioridad[(prioridad || '').toLowerCase()] || 660;
        var ctx = window.__ssepiAudioCtx || (window.__ssepiAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
        /* ignore audio errors */
    }
}
