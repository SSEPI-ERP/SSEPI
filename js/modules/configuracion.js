/**
 * configuracion.js - Gestión de permisos, roles y usuarios
 */
(function () {
    'use strict';

    var supabase = null;
    var currentProfile = null;

    // Módulos disponibles
    var MODULES = [
        { id: 'ventas', name: 'Ventas' },
        { id: 'compras', name: 'Compras' },
        { id: 'facturas', name: 'Facturación' },
        { id: 'contabilidad', name: 'Contabilidad' },
        { id: 'pagos_nomina', name: 'Nómina' },
        { id: 'ordenes_taller', name: 'Laboratorio' },
        { id: 'ordenes_motores', name: 'Motores' },
        { id: 'proyectos_automatizacion', name: 'Automatización' },
        { id: 'inventario', name: 'Inventario' },
        { id: 'contactos', name: 'Contactos' },
        { id: 'vacaciones', name: 'Vacaciones' },
        { id: 'calculadoras', name: 'Calculadoras' },
        { id: 'analisis_ventas', name: 'Análisis Ventas' },
        { id: 'analisis_compras', name: 'Análisis Compras' },
        { id: 'analisis_taller', name: 'Análisis Laboratorio' },
        { id: 'configuracion', name: 'Configuración' }
    ];

    // Roles disponibles
    var ROLES = ['admin', 'ventas', 'ventas_sin_compras', 'administracion', 'taller', 'motores', 'automatizacion', 'compras', 'facturacion', 'contabilidad'];

    function init() {
        // Esperar a que Supabase esté disponible
        var checkSupabase = setInterval(function () {
            if (window.supabase && window.supabaseConfig) {
                clearInterval(checkSupabase);
                supabase = window.supabase.createClient(window.supabaseConfig.supabaseUrl, window.supabaseConfig.supabaseAnonKey);
                loadCurrentProfile();
                bindEvents();
            }
        }, 100);
    }

    function loadCurrentProfile() {
        if (!window.authService) return;
        window.authService.getCurrentProfile().then(function (p) {
            currentProfile = p;
            if (!p || (p.rol !== 'admin' && p.rol !== 'superadmin')) {
                alert('Acceso denegado. Solo administradores pueden configurar permisos.');
                window.location.href = '/panel.html';
                return;
            }
            loadUsuarios();
            loadPermisosPorRol('admin');
            loadUsuariosParaSwitches();
        }).catch(function (err) {
            console.error('Error cargando perfil:', err);
        });
    }

    function bindEvents() {
        // Selector de rol para permisos
        var rolSelector = document.getElementById('rolSelector');
        if (rolSelector) {
            rolSelector.addEventListener('change', function () {
                loadPermisosPorRol(this.value);
            });
        }

        // Guardar permisos por rol
        var btnGuardarPermisos = document.getElementById('btnGuardarPermisos');
        if (btnGuardarPermisos) {
            btnGuardarPermisos.addEventListener('click', guardarPermisosPorRol);
        }

        // Selector de usuario para switches
        var usuarioSelector = document.getElementById('usuarioSelector');
        if (usuarioSelector) {
            usuarioSelector.addEventListener('change', function () {
                loadPermisosPorUsuario(this.value);
            });
        }

        // Guardar permisos por usuario
        var btnGuardarPermisosUsuario = document.getElementById('btnGuardarPermisosUsuario');
        if (btnGuardarPermisosUsuario) {
            btnGuardarPermisosUsuario.addEventListener('click', guardarPermisosPorUsuario);
        }

        // Exportar CSV
        var btnExportar = document.getElementById('btnExportar');
        if (btnExportar) {
            btnExportar.addEventListener('click', exportarCSV);
        }

        // Importar CSV
        var btnImportar = document.getElementById('btnImportar');
        if (btnImportar) {
            btnImportar.addEventListener('change', importarCSV);
        }
    }

    // ==========================================
    // USUARIOS Y ROLES
    // ==========================================

    function loadUsuarios() {
        if (!supabase) return;
        var tbody = document.getElementById('usuariosBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4">Cargando usuarios...</td></tr>';

        supabase.from('usuarios').select('*').order('nombre', { ascending: true }).then(function (result) {
            if (result.error) {
                tbody.innerHTML = '<tr><td colspan="4">Error: ' + (result.error.message || result.error) + '</td></tr>';
                return;
            }

            var list = result.data || [];
            tbody.innerHTML = '';

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">No hay usuarios registrados.</td></tr>';
                return;
            }

            list.forEach(function (u) {
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + (u.nombre || '—') + '</td>' +
                    '<td>' + (u.email || '—') + '</td>' +
                    '<td><span class="badge badge-' + (u.rol || 'ventas') + '">' + (u.rol || 'ventas') + '</span></td>' +
                    '<td>' +
                    '  <select class="rol-cambio-select" data-user-id="' + u.id + '">' +
                    '    <option value="">Cambiar rol...</option>' +
                    ROLES.map(function (r) { return '<option value="' + r + '">' + r + '</option>'; }).join('') +
                    '  </select>' +
                    '</td>';
                tbody.appendChild(tr);
            });

            // Bind change events
            tbody.querySelectorAll('.rol-cambio-select').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    if (this.value) {
                        cambiarRolUsuario(this.dataset.userId, this.value);
                    }
                });
            });
        });
    }

    function cambiarRolUsuario(userId, nuevoRol) {
        if (!supabase) return;
        if (!confirm('¿Cambiar rol de usuario a "' + nuevoRol + '"?')) return;

        supabase.from('usuarios').update({ rol: nuevoRol }).eq('id', userId).then(function (result) {
            if (result.error) {
                alert('Error: ' + (result.error.message || result.error));
                return;
            }
            alert('Rol actualizado correctamente.');
            loadUsuarios();
        });
    }

    // ==========================================
    // PERMISOS POR ROL
    // ==========================================

    function loadPermisosPorRol(rol) {
        if (!supabase) return;
        var tbody = document.getElementById('permisosBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5">Cargando permisos...</td></tr>';

        supabase.from('role_permissions').select('*').eq('role', rol).order('module', { ascending: true }).then(function (result) {
            if (result.error) {
                tbody.innerHTML = '<tr><td colspan="5">Error: ' + (result.error.message || result.error) + '</td></tr>';
                return;
            }

            var perms = (result.data || []).reduce(function (acc, p) {
                acc[p.module] = p;
                return acc;
            }, {});

            tbody.innerHTML = '';

            MODULES.forEach(function (m) {
                var p = perms[m.id] || {};
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + m.name + '</td>' +
                    '<td><input type="checkbox" class="perm-check" data-module="' + m.id + '" data-action="read" ' + (p.read ? 'checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="perm-check" data-module="' + m.id + '" data-action="create" ' + (p.create ? 'checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="perm-check" data-module="' + m.id + '" data-action="update" ' + (p.update ? 'checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="perm-check" data-module="' + m.id + '" data-action="delete" ' + (p.delete ? 'checked' : '') + '></td>';
                tbody.appendChild(tr);
            });
        });
    }

    function guardarPermisosPorRol() {
        var rolSelector = document.getElementById('rolSelector');
        if (!rolSelector) return;
        var rol = rolSelector.value;

        var checks = document.querySelectorAll('#permisosBody .perm-check');
        var updates = [];

        checks.forEach(function (chk) {
            var mod = chk.dataset.module;
            var action = chk.dataset.action;
            var existing = updates.find(function (u) { return u.module === mod; });

            if (!existing) {
                updates.push({
                    role: rol,
                    module: mod,
                    read: document.querySelector('.perm-check[data-module="' + mod + '"][data-action="read"]').checked,
                    create: document.querySelector('.perm-check[data-module="' + mod + '"][data-action="create"]').checked,
                    update: document.querySelector('.perm-check[data-module="' + mod + '"][data-action="update"]').checked,
                    delete: document.querySelector('.perm-check[data-module="' + mod + '"][data-action="delete"]').checked
                });
            }
        });

        if (!supabase) return;

        // Upsert: insert or update
        var promises = updates.map(function (u) {
            return supabase.from('role_permissions').upsert(u, { onConflict: 'role,module' });
        });

        Promise.all(promises).then(function (results) {
            var hasError = results.some(function (r) { return r.error; });
            if (hasError) {
                alert('Error al guardar permisos.');
                return;
            }
            alert('Permisos guardados correctamente para el rol "' + rol + '".');
        });
    }

    // ==========================================
    // PERMISOS POR USUARIO (SWITCHES)
    // ==========================================

    function loadUsuariosParaSwitches() {
        var selector = document.getElementById('usuarioSelector');
        if (!selector || !supabase) return;

        supabase.from('usuarios').select('id, nombre, email').order('nombre', { ascending: true }).then(function (result) {
            if (result.error) {
                selector.innerHTML = '<option>Error cargando usuarios</option>';
                return;
            }

            var list = result.data || [];
            selector.innerHTML = '<option value="">Seleccionar usuario...</option>' +
                list.map(function (u) {
                    return '<option value="' + u.id + '">' + (u.nombre || u.email) + '</option>';
                }).join('');
        });
    }

    function loadPermisosPorUsuario(userId) {
        if (!supabase || !userId) return;
        var tbody = document.getElementById('userModulesBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="3">Cargando módulos...</td></tr>';

        // Obtener permisos actuales
        supabase.from('user_module_permissions').select('*').eq('user_id', userId).then(function (result) {
            if (result.error) {
                tbody.innerHTML = '<tr><td colspan="3">Error: ' + (result.error.message || result.error) + '</td></tr>';
                return;
            }

            var perms = (result.data || []).reduce(function (acc, p) {
                acc[p.module] = p;
                return acc;
            }, {});

            // Obtener rol del usuario para defaults
            supabase.from('usuarios').select('rol').eq('id', userId).single().then(function (r) {
                var userRole = r.data?.rol || 'ventas';

                tbody.innerHTML = '';

                MODULES.forEach(function (m) {
                    var p = perms[m.id];
                    var enabled = p ? p.enabled : false;

                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + m.name + '</td>' +
                        '<td><span class="switch-label">' + (enabled ? 'Activo' : 'Inactivo') + '</span></td>' +
                        '<td><label class="switch"><input type="checkbox" class="module-switch" data-module="' + m.id + '" ' + (enabled ? 'checked' : '') + '><span class="slider"></span></label></td>';
                    tbody.appendChild(tr);
                });

                // Bind switch events
                tbody.querySelectorAll('.module-switch').forEach(function (sw) {
                    sw.addEventListener('change', function () {
                        var label = this.closest('tr').querySelector('.switch-label');
                        label.textContent = this.checked ? 'Activo' : 'Inactivo';
                    });
                });
            });
        });
    }

    function guardarPermisosPorUsuario() {
        var selector = document.getElementById('usuarioSelector');
        if (!selector) return;
        var userId = selector.value;

        if (!userId) {
            alert('Selecciona un usuario.');
            return;
        }

        var switches = document.querySelectorAll('#userModulesBody .module-switch');
        var updates = [];

        switches.forEach(function (sw) {
            updates.push({
                user_id: userId,
                module: sw.dataset.module,
                enabled: sw.checked
            });
        });

        if (!supabase) return;

        // Upsert
        var promises = updates.map(function (u) {
            return supabase.from('user_module_permissions').upsert(u, { onConflict: 'user_id,module' });
        });

        Promise.all(promises).then(function (results) {
            var hasError = results.some(function (r) { return r.error; });
            if (hasError) {
                alert('Error al guardar permisos.');
                return;
            }
            alert('Permisos guardados correctamente.');
        });
    }

    // ==========================================
    // IMPORTAR / EXPORTAR CSV
    // ==========================================

    function exportarCSV() {
        var moduleSel = document.getElementById('importExportModule');
        if (!moduleSel) return;
        var mod = moduleSel.value;

        if (!mod) {
            alert('Selecciona un módulo.');
            return;
        }

        if (!supabase) return;

        supabase.from(mod).select('*').then(function (result) {
            if (result.error) {
                alert('Error exportando: ' + (result.error.message || result.error));
                return;
            }

            var data = result.data || [];
            if (data.length === 0) {
                alert('No hay datos para exportar.');
                return;
            }

            // Convert to CSV
            var headers = Object.keys(data[0]);
            var csv = headers.join(',') + '\n' +
                data.map(function (row) {
                    return headers.map(function (h) {
                        var val = row[h];
                        if (val === null || val === undefined) return '';
                        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                            return '"' + val.replace(/"/g, '""') + '"';
                        }
                        return val;
                    }).join(',');
                }).join('\n');

            // Download
            var blob = new Blob([csv], { type: 'text/csv' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = mod + '_' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            URL.revokeObjectURL(url);

            alert('Exportación completada: ' + data.length + ' registros.');
        });
    }

    function importarCSV() {
        var moduleSel = document.getElementById('importExportModule');
        if (!moduleSel) return;
        var mod = moduleSel.value;

        if (!mod) {
            alert('Selecciona un módulo.');
            return;
        }

        var file = this.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (e) {
            var text = e.target.result;
            var lines = text.split('\n').filter(function (l) { return l.trim(); });
            if (lines.length < 2) {
                alert('El archivo está vacío o no tiene datos.');
                return;
            }

            var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
            var rows = [];

            for (var i = 1; i < lines.length; i++) {
                var values = parseCSVLine(lines[i]);
                if (values.length === headers.length) {
                    var row = {};
                    headers.forEach(function (h, idx) {
                        row[h] = values[idx];
                    });
                    rows.push(row);
                }
            }

            if (rows.length === 0) {
                alert('No se pudieron parsear los datos.');
                return;
            }

            if (!confirm('¿Importar ' + rows.length + ' registros en "' + mod + '"?')) return;

            if (!supabase) return;

            supabase.from(mod).insert(rows).then(function (result) {
                if (result.error) {
                    alert('Error importando: ' + (result.error.message || result.error));
                    return;
                }
                alert('Importación completada: ' + rows.length + ' registros.');
            });
        };
        reader.readAsText(file);
    }

    function parseCSVLine(line) {
        var result = [];
        var current = '';
        var inQuotes = false;

        for (var i = 0; i < line.length; i++) {
            var char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
