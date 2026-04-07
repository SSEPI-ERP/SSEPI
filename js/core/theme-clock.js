/**
 * theme-clock.js — Tema claro/oscuro y reloj en vivo.
 * Se ejecuta al cargar el DOM en todas las páginas que tienen #clock y #themeBtn.
 */
(function () {
    'use strict';

    function applyTheme(saved) {
        var theme = saved || localStorage.getItem('theme');
        var btn = document.getElementById('themeBtn');
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-sun"></i>';
                btn.setAttribute('aria-label', 'Cambiar a modo claro');
                btn.setAttribute('title', 'Modo oscuro (clic para claro)');
            }
        } else {
            document.body.removeAttribute('data-theme');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-moon"></i>';
                btn.setAttribute('aria-label', 'Cambiar a modo oscuro');
                btn.setAttribute('title', 'Modo claro (clic para oscuro)');
            }
        }
    }

    function toggleTheme() {
        var body = document.body;
        var btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-moon"></i>';
                btn.setAttribute('aria-label', 'Cambiar a modo oscuro');
                btn.setAttribute('title', 'Modo claro (clic para oscuro)');
            }
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-sun"></i>';
                btn.setAttribute('aria-label', 'Cambiar a modo claro');
                btn.setAttribute('title', 'Modo oscuro (clic para claro)');
            }
        }
    }

    function tickClock() {
        var el = document.getElementById('clock');
        if (!el) return;
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();
        var s = now.getSeconds();
        el.textContent =
            (h < 10 ? '0' : '') + h + ':' +
            (m < 10 ? '0' : '') + m + ':' +
            (s < 10 ? '0' : '') + s;
        el.setAttribute('aria-label', 'Hora actual ' + el.textContent);
    }

    function startClock() {
        tickClock();
        setInterval(tickClock, 1000);
    }

    function init() {
        applyTheme();
        startClock();
        var themeBtn = document.getElementById('themeBtn');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
