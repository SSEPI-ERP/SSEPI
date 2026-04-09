/**
 * nav-by-role.js — Oculta ítems del menú lateral, tarjetas del panel y KPIs según el rol del usuario.
 * Usa authService.getCurrentProfile() y hasPermission(module, 'read').
 * data-module="X": mostrar solo si tiene permiso X.
 * data-module-any="X,Y": mostrar si tiene permiso X o Y.
 * Si hay rol en sessionStorage (guardado al login), aplica visibilidad al instante con mapa estático (sin esperar DB).
 */
(function () {
    'use strict';

    /** Mapa rol -> módulos permitidos (read). null = mostrar todo (admin/superadmin/contabilidad). */
    var ROLE_MODULES = {
        admin: null,
        superadmin: null,
        ventas: ['compras', 'inventario', 'analisis_ventas', 'vacaciones'],
        ventas_sin_compras: ['compras', 'inventario', 'analisis_ventas', 'vacaciones'],
        taller: ['ordenes_taller', 'inventario', 'vacaciones', 'calculadoras'],
        automatizacion: ['proyectos_automatizacion', 'inventario', 'vacaciones', 'calculadoras'],
        motores: ['ordenes_motores', 'inventario', 'compras', 'ordenes_taller', 'vacaciones'],
        compras: ['compras', 'inventario', 'vacaciones'],
        facturacion: ['ventas', 'compras', 'facturas', 'vacaciones'],
        contabilidad: null
    };

    function allowedForModule(rol, moduleName, moduleAny) {
        var allowed = ROLE_MODULES[rol];
        if (allowed === null) return true;
        if (!allowed) return false;
        if (moduleAny) {
            var parts = moduleAny.split(',').map(function (m) { return m.trim(); });
            for (var i = 0; i < parts.length; i++) {
                if (allowed.indexOf(parts[i]) !== -1) return true;
            }
            return false;
        }
        return allowed.indexOf(moduleName) !== -1;
    }

    function hide(el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    function hideEmptyCategories() {
        var categories = document.querySelectorAll('.menu-category');
        categories.forEach(function (cat) {
            var next = cat.nextElementSibling;
            var hasVisible = false;
            while (next && !next.classList.contains('menu-category')) {
                if (next.classList.contains('nav-item') && next.style.display !== 'none') hasVisible = true;
                next = next.nextElementSibling;
            }
            if (!hasVisible) cat.style.display = 'none';
        });
    }

    /** Email del perfil con modo dual admin/empleado (mismo que Ivan - automatizacion). Ocultar botón admin; solo icono junto a Panel Principal. */
    var NORBERTO_EMAIL = 'norbertomoro4@gmail.com';

    function isNorberto(profile) {
        return profile && (profile.email === NORBERTO_EMAIL || (profile.nombre && profile.nombre.toLowerCase().indexOf('norberto moreno') !== -1));
    }

    function getEffectiveRol(profile) {
        try {
            if (profile && profile.rol === 'admin' && sessionStorage.getItem('ssepi_norberto_empleado') === 'true') return 'automatizacion';
        } catch (e) {}
        return profile ? profile.rol : null;
    }

    /** Aplica visibilidad por rol usando solo el mapa (síncrono, sin DB). */
    function applyNavByRoleFromCache(rol) {
        if (!rol) return;
        var selector = '.nav-item[data-module], .card-module[data-module], .card-kpi[data-module], .card-kpi[data-module-any]';
        var elements = document.querySelectorAll(selector);
        for (var i = 0; i < elements.length; i++) {
            elements[i].style.display = '';
            elements[i].removeAttribute('aria-hidden');
        }
        if (ROLE_MODULES[rol] === null) return;
        elements = document.querySelectorAll(selector);
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var moduleAny = el.getAttribute('data-module-any');
            var module = el.getAttribute('data-module');
            if (moduleAny) {
                if (!allowedForModule(rol, null, moduleAny)) hide(el);
                continue;
            }
            if (module && !allowedForModule(rol, module, null)) hide(el);
        }
        hideEmptyCategories();
    }

    function markNavReady() {
        if (document.body) {
            document.body.classList.remove('nav-loading');
            document.body.classList.add('nav-ready');
        }
    }

    async function applyNavByRole(profile) {
        if (!profile || !window.authService) return;
        if (profile.rol === 'admin' || profile.rol === 'superadmin') return;

        var auth = window.authService;

        var selector = '.nav-item[data-module], .card-module[data-module], .card-kpi[data-module], .card-kpi[data-module-any]';
        var elements = document.querySelectorAll(selector);

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var moduleAny = el.getAttribute('data-module-any');
            var module = el.getAttribute('data-module');

            if (moduleAny) {
                var modules = moduleAny.split(',').map(function (m) { return m.trim(); });
                var allowed = false;
                for (var j = 0; j < modules.length; j++) {
                    try {
                        if (await auth.hasPermission(modules[j], 'read')) { allowed = true; break; }
                    } catch (e) {}
                }
                if (!allowed) hide(el);
                continue;
            }

            if (!module) continue;
            try {
                var ok = await auth.hasPermission(module, 'read');
                if (!ok) hide(el);
            } catch (e) {
                hide(el);
            }
        }

        hideEmptyCategories();
    }

    async function runWhenReady() {
        var deadline = Date.now() + 8000;
        while (!window.authService) {
            if (Date.now() > deadline) return;
            await new Promise(function (r) { setTimeout(r, 80); });
        }
        var cachedRol = null;
        try {
            cachedRol = sessionStorage.getItem('ssepi_rol');
        } catch (e) {}
        if (cachedRol) {
            document.body.dataset.rol = cachedRol;
            applyNavByRoleFromCache(cachedRol);
            markNavReady();
        }
        try {
            var profile = await window.authService.getCurrentProfile();
            if (profile) {
                var effectiveRol = getEffectiveRol(profile);
                try { sessionStorage.setItem('ssepi_rol', effectiveRol || profile.rol); } catch (e) {}
                if (document.body) document.body.dataset.rol = effectiveRol || profile.rol;
                applyNavByRoleFromCache(effectiveRol || profile.rol);
                if (isNorberto(profile)) {
                    injectNorbertoToggle(profile);
                    if (sessionStorage.getItem('ssepi_norberto_empleado') !== 'true') await applyNavByRole(profile);
                } else {
                    await applyNavByRole(profile);
                }
            }
            markNavReady();
        } catch (e) {
            console.warn('[nav-by-role]', e);
            markNavReady();
        }
    }

    function injectNorbertoToggle(profile) {
        var homeLink = document.querySelector('.home-link');
        if (!homeLink || document.getElementById('ssepiNorbertoToggle')) return;
        var isEmpleado = sessionStorage.getItem('ssepi_norberto_empleado') === 'true';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'ssepiNorbertoToggle';
        btn.className = 'norberto-mode-toggle';
        btn.setAttribute('aria-label', isEmpleado ? 'Cambiar a modo admin' : 'Cambiar a modo empleado');
        btn.title = isEmpleado ? 'Modo empleado (clic para modo admin)' : 'Modo admin (clic para modo empleado)';
        btn.innerHTML = isEmpleado ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-shield"></i>';
        btn.style.cssText = 'margin-left:8px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-color,#e2e8f0);background:var(--card-bg,#fff);cursor:pointer;font-size:0.9rem;';
        btn.addEventListener('click', function() {
            var nowEmpleado = sessionStorage.getItem('ssepi_norberto_empleado') === 'true';
            try {
                sessionStorage.setItem('ssepi_norberto_empleado', nowEmpleado ? 'false' : 'true');
                sessionStorage.setItem('ssepi_rol', nowEmpleado ? 'admin' : 'automatizacion');
            } catch (e) {}
            document.body.dataset.rol = nowEmpleado ? 'admin' : 'automatizacion';
            applyNavByRoleFromCache(nowEmpleado ? 'admin' : 'automatizacion');
            btn.title = nowEmpleado ? 'Modo admin (clic para modo empleado)' : 'Modo empleado (clic para modo admin)';
            btn.innerHTML = nowEmpleado ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-user"></i>';
            btn.setAttribute('aria-label', nowEmpleado ? 'Cambiar a modo empleado' : 'Cambiar a modo admin');
        });
        homeLink.parentNode.insertBefore(btn, homeLink.nextSibling);
    }

    window.applyNavByRole = applyNavByRole;

    function loadNavActivityBootstrap() {
        try {
            if (!document.getElementById('sidebar')) return;
            if (document.getElementById('ssepiNavActivityBootstrap')) return;
            var s = document.createElement('script');
            s.id = 'ssepiNavActivityBootstrap';
            s.type = 'module';
            s.src = '/js/core/nav-activity-bootstrap.js';
            document.head.appendChild(s);
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { runWhenReady(); loadNavActivityBootstrap(); });
    } else {
        runWhenReady();
        loadNavActivityBootstrap();
    }
})();
