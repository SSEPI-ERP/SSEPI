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

        // ─── 5 roles básicos (solo sus módulos + análisis general) ───
        // Nota: 'calculadoras' solo visible para admin/superadmin o dual mode en modo Admin
        // 'analisis' ahora es módulo unificado accesible para todos los roles operativos
        ventas:              ['ventas', 'inventario', 'contactos', 'vacaciones', 'analisis'],
        administracion:      ['compras', 'facturas', 'contabilidad', 'pagos_nomina', 'inventario', 'contactos', 'vacaciones', 'analisis'],
        taller:              ['ordenes_taller', 'inventario', 'vacaciones', 'analisis'],
        motores:             ['ordenes_motores', 'inventario', 'vacaciones', 'analisis'],
        automatizacion:      ['proyectos_automatizacion', 'inventario', 'vacaciones', 'analisis', 'configuracion'],

        // ─── Variante de ventas (sin módulo Compras; nav idéntico a ventas) ───
        ventas_sin_compras:  ['ventas', 'inventario', 'contactos', 'vacaciones', 'analisis'],

        // ─── Roles de soporte (compatibilidad hacia atrás) ───
        compras:             ['compras', 'inventario', 'vacaciones', 'analisis'],
        facturacion:         ['ventas', 'compras', 'facturas', 'vacaciones', 'analisis'],
        contabilidad:        null,

        // ─── Módulo de Configuración (solo admin, automatizacion, electronica) ───
        electronica:         ['ordenes_taller', 'inventario', 'vacaciones', 'analisis', 'configuracion'],
        configuracion:       null  // Alias de admin, solo para visibilidad en nav
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
     * Configuración interna de usuarios.
     * Los valores se gestionan internamente en el sistema.
     */
    var INTERNAL_USER_CONFIG = {
        'norbertomoro4@gmail.com': 'automatizacion'
    };

    function isDualModeUser(profile) {
        if (!profile || profile.rol !== 'admin') return false;
        return INTERNAL_USER_CONFIG.hasOwnProperty(profile.email);
    }

    function getBaseRolForDualMode(profile) {
        if (!profile) return null;
        return INTERNAL_USER_CONFIG[profile.email] || null;
    }

    function getEffectiveRol(profile) {
        try {
            if (isDualModeUser(profile) && sessionStorage.getItem('ssepi_mode') === 'normal') {
                return getBaseRolForDualMode(profile);
            }
        } catch (e) {}
        return profile ? profile.rol : null;
    }

    /**
     * Verifica si un rol puede ver un módulo especial (calculadoras, configuracion).
     * - calculadoras: solo admin/superadmin o dual mode en modo Admin
     * - configuracion: solo admin/superadmin, automatizacion, y Norberto (dual mode)
     */
    function canSeeSpecialModule(rol, moduleName, profile) {
        // Calculadoras: solo admin/superadmin o dual mode activo
        if (moduleName === 'calculadoras') {
            if (rol === 'admin' || rol === 'superadmin') return true;
            // Si es dual mode y está en modo Admin, puede ver calculadoras
            if (profile && isDualModeUser(profile)) {
                try {
                    if (sessionStorage.getItem('ssepi_mode') === 'admin') return true;
                } catch (e) {}
            }
            return false;
        }
        // Configuracion: solo admin/superadmin, automatizacion, electronica, y dual mode
        if (moduleName === 'configuracion') {
            if (rol === 'admin' || rol === 'superadmin') return true;
            if (rol === 'automatizacion' || rol === 'electronica') return true;
            // Dual mode puede ver configuración
            if (profile && isDualModeUser(profile)) {
                return true;
            }
            return false;
        }
        return true;
    }

    /**
     * Verifica permisos individuales de usuario desde user_module_permissions (sync).
     * Devuelve null si no hay registro (seguir con lógica de rol).
     * Devuelve true/false si hay registro explícito.
     */
    function getUserModulePermissionSync(moduleName) {
        try {
            var profile = window.authService ? window.authService.getProfileSync() : null;
            if (!profile || !profile.auth_user_id) return null;
            var cached = sessionStorage.getItem('ssepi_user_perms_' + profile.auth_user_id);
            if (!cached) return null;
            var perms = JSON.parse(cached);
            if (!perms.hasOwnProperty(moduleName)) return null;
            return perms[moduleName] === true;
        } catch (e) {
            return null;
        }
    }

    /**
     * Carga permisos individuales de usuario en sessionStorage para acceso rápido.
     */
    async function loadUserModulePermissions() {
        try {
            if (!window.supabase) return;
            var profile = await window.authService.getCurrentProfile();
            if (!profile || !profile.auth_user_id) return;
            var _ = await window.supabase
                .from('user_module_permissions')
                .select('module, enabled')
                .eq('user_id', profile.auth_user_id);
            if (_.error || !_.data) return;
            var perms = {};
            _.data.forEach(function(p) { perms[p.module] = p.enabled === true; });
            sessionStorage.setItem('ssepi_user_perms_' + profile.auth_user_id, JSON.stringify(perms));
        } catch (e) {
            console.warn('[nav-by-role] Error loading user perms:', e);
        }
    }

    /** Aplica visibilidad por rol usando solo el mapa (síncrono, sin DB). */
    function applyNavByRoleFromCache(rol) {
        if (!rol) return;
        var selector = '.nav-item[data-module], .nav-item-has-submenu[data-module], .card-module[data-module], .card-kpi[data-module], .card-kpi[data-module-any]';
        var elements = document.querySelectorAll(selector);
        for (var i = 0; i < elements.length; i++) {
            elements[i].style.display = '';
            elements[i].removeAttribute('aria-hidden');
        }
        if (ROLE_MODULES[rol] === null) return;
        elements = document.querySelectorAll(selector);
        var profile = null;
        try {
            profile = window.authService ? window.authService.getProfileSync() : null;
        } catch (e) {}
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var moduleAny = el.getAttribute('data-module-any');
            var module = el.getAttribute('data-module');
            if (moduleAny) {
                if (!allowedForModule(rol, null, moduleAny)) hide(el);
                continue;
            }
            if (module) {
                // 1. Verificar permisos individuales de usuario (prioridad)
                var userPerm = getUserModulePermissionSync(module);
                if (userPerm === false) {
                    hide(el);
                    continue;
                }
                // 2. Verificar módulos especiales (calculadoras, configuracion)
                if (!canSeeSpecialModule(rol, module, profile)) {
                    hide(el);
                    // Si es el submenú de configuración, también ocultar el ul.nav-submenu asociado
                    if (module === 'configuracion' && el.classList.contains('nav-item-has-submenu')) {
                        var submenu = el.nextElementSibling;
                        if (submenu && submenu.classList.contains('nav-submenu')) {
                            submenu.style.display = 'none';
                        }
                    }
                } else if (!allowedForModule(rol, module, null)) {
                    hide(el);
                } else {
                    // Si el elemento es visible y es un submenú de configuración, asegurar que el submenu pueda desplegarse
                    if (module === 'configuracion' && el.classList.contains('nav-item-has-submenu')) {
                        var submenu = el.nextElementSibling;
                        if (submenu && submenu.classList.contains('nav-submenu')) {
                            // No forzar display aquí, el toggle lo controla
                        }
                    }
                }
            }
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
            // 1. Verificar permisos individuales de usuario (prioridad)
            var userPerm = getUserModulePermissionSync(module);
            if (userPerm === false) {
                hide(el);
                continue;
            }
            // 2. Verificar módulos especiales (calculadoras, configuracion)
            if (!canSeeSpecialModule(effectiveRol, module, profile)) {
                hide(el);
                continue;
            }
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
        // Cargar permisos individuales de usuario en caché
        await loadUserModulePermissions();
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
     *
     * ESTÉTICA:
     * - Modo Admin: Dorado/ámbar con gradiente
     * - Modo Normal: Verde/esmeralda con gradiente
     * - Animaciones suaves con hover y tooltip
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
        // Los estilos ahora están en main.css (.dual-mode-toggle)
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
