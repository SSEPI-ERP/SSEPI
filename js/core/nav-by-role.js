/**
 * nav-by-role.js — Oculta ítems del menú lateral, tarjetas del panel y KPIs según el rol del usuario.
 * Usa authService.getCurrentProfile() y hasPermission(module, 'read').
 * data-module="X": mostrar solo si tiene permiso X.
 * data-module-any="X,Y": mostrar si tiene permiso X o Y.
 * Si hay rol en sessionStorage (guardado al login), aplica visibilidad al instante con mapa estático (sin esperar DB).
 *
 * ─── MODELO DE ROLES ───
 *
 * Roles BÁSICOS (solo ven sus módulos asignados; NO ven análisis ni módulos ajenos):
 *   ventas, administracion, taller, motores, automatizacion
 *
 * Rol ADMINISTRADOR DEL SISTEMA (admin / superadmin):
 *   Ve TODOS los módulos operativos + análisis + administración.
 *
 * Perfil con MODO DUAL (Normal ↔ Admin):
 *   Usuarios identificados en DUAL_MODE_USERS pueden alternar entre modo Normal
 *   (comportamiento acotado como su rol base) y modo Admin (ven todo).
 *   Controlado por: sessionStorage.ssepi_mode = 'normal' | 'admin'
 *   Rol base: sessionStorage.ssepi_rol_normal y DUAL_MODE_USERS[email].
 *   Futuro: campo users.modo_dual (boolean) y users.rol_normal (text) en BD.
 *
 * Variantes heredadas (compatibilidad):
 *   ventas_sin_compras, compras, facturacion, contabilidad (null = ve todo, RLS limita escritura)
 */
(function () {
    'use strict';

    /**
     * Mapa rol -> módulos permitidos (read). null = mostrar todo (admin/superadmin/contabilidad).
     *
     * Reglas:
     *   - Los 5 roles básicos SOLO ven sus módulos operativos, sin analisis_* ni módulos ajenos.
     *   - admin/superadmin ven todo (incluidos análisis).
     *   - ventas_sin_compras = variante de ventas sin Compras (no es admin lite).
     *   - contabilidad ve todo en solo lectura (RLS limita escritura).
     */
    var ROLE_MODULES = {
        // ─── Roles con acceso global (operativo + análisis + administración) ───
        admin: null,
        superadmin: null,

        // ─── 5 roles básicos (solo sus módulos, sin análisis ni módulos ajenos) ───
        ventas:              ['ventas', 'inventario', 'contactos', 'vacaciones'],
        administracion:      ['compras', 'facturas', 'contabilidad', 'pagos_nomina', 'inventario', 'contactos', 'vacaciones'],
        taller:              ['ordenes_taller', 'inventario', 'vacaciones', 'calculadoras'],
        motores:             ['ordenes_motores', 'inventario', 'vacaciones', 'calculadoras'],
        automatizacion:      ['proyectos_automatizacion', 'inventario', 'vacaciones', 'calculadoras'],

        // ─── Variante de ventas (sin módulo Compras; nav idéntico a ventas) ───
        ventas_sin_compras:  ['ventas', 'inventario', 'contactos', 'vacaciones'],

        // ─── Roles de soporte (compatibilidad hacia atrás) ───
        compras:             ['compras', 'inventario', 'vacaciones'],
        facturacion:         ['ventas', 'compras', 'facturas', 'vacaciones'],
        contabilidad:        null
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

    /**
     * Usuarios con modo dual Normal ↔ Admin.
     * Clave: email del usuario. Valor: rol base cuando está en modo Normal.
     * Futuro: migrar a campos users.modo_dual (boolean) y users.rol_normal (text) en BD.
     */
    var DUAL_MODE_USERS = {
        'norbertomoro4@gmail.com': 'automatizacion'
        // Agregar más usuarios con modo dual aquí: 'email@ejemplo.com': 'rol_base'
    };

    function isDualModeUser(profile) {
        if (!profile || profile.rol !== 'admin') return false;
        // Futuro: return profile.modo_dual === true;
        return DUAL_MODE_USERS.hasOwnProperty(profile.email);
    }

    function getBaseRolForDualMode(profile) {
        if (!profile) return null;
        // Futuro: return profile.rol_normal;
        return DUAL_MODE_USERS[profile.email] || null;
    }

    function getEffectiveRol(profile) {
        try {
            if (isDualModeUser(profile) && sessionStorage.getItem('ssepi_mode') === 'normal') {
                return getBaseRolForDualMode(profile);
            }
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
        var effectiveRol = getEffectiveRol(profile);
        if (effectiveRol === 'admin' || profile.rol === 'superadmin') return;

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

    /** Migrar clave legacy ssepi_norberto_empleado → ssepi_mode para compatibilidad hacia atrás. */
    function migrateLegacyModeKeys() {
        try {
            if (sessionStorage.getItem('ssepi_norberto_empleado') && !sessionStorage.getItem('ssepi_mode')) {
                var isEmpleado = sessionStorage.getItem('ssepi_norberto_empleado') === 'true';
                sessionStorage.setItem('ssepi_mode', isEmpleado ? 'normal' : 'admin');
            }
        } catch (e) {}
    }

    async function runWhenReady() {
        migrateLegacyModeKeys();
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
                if (isDualModeUser(profile)) {
                    injectDualModeToggle(profile);
                    if (sessionStorage.getItem('ssepi_mode') !== 'normal') await applyNavByRole(profile);
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

    /**
     * Inyecta el botón de toggle Normal ↔ Admin para usuarios con modo dual.
     * El botón aparece junto a "Panel Principal" en la barra lateral.
     * Estado: sessionStorage.ssepi_mode = 'normal' | 'admin' (default: 'admin').
     */
    function injectDualModeToggle(profile) {
        var homeLink = document.querySelector('.home-link');
        if (!homeLink || document.getElementById('ssepiDualModeToggle')) return;
        var baseRol = getBaseRolForDualMode(profile);
        if (!baseRol) return;
        var isNormal = sessionStorage.getItem('ssepi_mode') === 'normal';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'ssepiDualModeToggle';
        btn.className = 'dual-mode-toggle';
        btn.setAttribute('aria-label', isNormal ? 'Cambiar a modo admin' : 'Cambiar a modo normal');
        btn.title = isNormal ? 'Modo normal: ' + baseRol + ' (clic para modo admin)' : 'Modo admin (clic para modo normal: ' + baseRol + ')';
        btn.innerHTML = isNormal ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-shield"></i>';
        btn.style.cssText = 'margin-left:8px;padding:4px 8px;border-radius:6px;border:1px solid var(--border-color,#e2e8f0);background:var(--card-bg,#fff);cursor:pointer;font-size:0.9rem;';
        btn.addEventListener('click', function() {
            var currentlyNormal = sessionStorage.getItem('ssepi_mode') === 'normal';
            var newMode = currentlyNormal ? 'admin' : 'normal';
            var newRol = currentlyNormal ? 'admin' : baseRol;
            try {
                sessionStorage.setItem('ssepi_mode', newMode);
                sessionStorage.setItem('ssepi_rol', newRol);
                if (currentlyNormal) sessionStorage.removeItem('ssepi_norberto_empleado');
                else sessionStorage.setItem('ssepi_norberto_empleado', 'true');
            } catch (e) {}
            document.body.dataset.rol = newRol;
            applyNavByRoleFromCache(newRol);
            btn.title = currentlyNormal ? 'Modo admin (clic para modo normal: ' + baseRol + ')' : 'Modo normal: ' + baseRol + ' (clic para modo admin)';
            btn.innerHTML = currentlyNormal ? '<i class="fas fa-user-shield"></i>' : '<i class="fas fa-user"></i>';
            btn.setAttribute('aria-label', currentlyNormal ? 'Cambiar a modo normal' : 'Cambiar a modo admin');
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
