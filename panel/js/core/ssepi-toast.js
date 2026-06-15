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
    var iconByPrioridad = {
        baja: 'fa-bell',
        media: 'fa-exclamation-circle',
        alta: 'fa-exclamation-triangle',
        critica: 'fa-radiation'
    };
    var icon = iconByPrioridad[prioridad] || iconByPrioridad.media;
    var toast = document.createElement('div');
    // Estructura con clases CSS (tokens). El color del border-left viene de .prio-*
    toast.className = 'toast-alarma prio-' + prioridad;
    toast.dataset.alarmaId = alarma.id;
    toast.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
            '<i class="fas ' + icon + ' toast-alarma-icon"></i>' +
            '<div style="flex:1;">' +
                '<div class="toast-alarma-title">' + (alarma.titulo || 'Alarma') + '</div>' +
                '<div class="toast-alarma-msg">' + (alarma.mensaje || '') + '</div>' +
                (alarma.para_modulo ? '<div class="toast-alarma-para">→ ' + alarma.para_modulo + '</div>' : '') +
            '</div>' +
            '<button class="toast-close toast-alarma-close" aria-label="Cerrar">&times;</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:6px;">' +
            '<button class="btn-marcar-leida toast-alarma-action">Marcar leída</button>' +
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
