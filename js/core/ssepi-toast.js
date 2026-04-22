/**
 * SSEPI Toast Notification System
 * Reemplaza alert() con notificaciones estilizadas por modulo.
 * Uso: _showToast('mensaje', 'success'|'error'|'warning'|'info')
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