/**
 * user-menu.js — Menú del botón Admin: configuración de perfil, cerrar sesión, tema, reinicio ERP, descargar SQL.
 * Depende de window.authService (auth-service.js).
 */
(function () {
    'use strict';

    var dropdown = null;
    var configModal = null;
    var isAdmin = false;

    function getAuth() {
        return window.authService || null;
    }

    function createDropdown() {
        if (document.getElementById('userMenuDropdown')) return;
        var wrap = document.createElement('div');
        wrap.id = 'userMenuDropdown';
        wrap.className = 'user-menu-dropdown';
        wrap.innerHTML =
            '<button type="button" class="user-menu-item" data-action="config"><i class="fas fa-user-cog"></i> Configuración</button>' +
            '<button type="button" class="user-menu-item" data-action="themeLight"><i class="fas fa-sun"></i> Modo claro</button>' +
            '<button type="button" class="user-menu-item" data-action="themeDark"><i class="fas fa-moon"></i> Modo oscuro</button>' +
            '<div class="user-menu-divider"></div>' +
            '<button type="button" class="user-menu-item" data-action="logout"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>';
        document.body.appendChild(wrap);
        dropdown = wrap;
        bindDropdownActions();
    }

    function createConfigModal() {
        if (document.getElementById('configModal')) return;
        var wrap = document.createElement('div');
        wrap.id = 'configModalBackdrop';
        wrap.className = 'config-modal-backdrop';
        wrap.innerHTML =
            '<div id="configModal" class="config-modal" role="dialog" aria-labelledby="configModalTitle">' +
            '  <div class="config-modal-header">' +
            '    <h2 id="configModalTitle">Configuración (Admin)</h2>' +
            '    <button type="button" class="config-modal-close" id="configModalClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>' +
            '  </div>' +
            '  <div class="config-modal-body">' +
            '    <form id="configProfileForm">' +
            '      <label>Nombre</label>' +
            '      <input type="text" id="configNombre" name="nombre" placeholder="Nombre completo" autocomplete="name">' +
            '      <label>Correo</label>' +
            '      <input type="email" id="configCorreo" name="correo" placeholder="correo@ejemplo.com" autocomplete="email">' +
            '      <label>Teléfono</label>' +
            '      <input type="tel" id="configTelefono" name="telefono" placeholder="Teléfono" autocomplete="tel">' +
            '      <hr class="config-modal-hr">' +
            '      <label>Carpeta de respaldo</label>' +
            '      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' +
            '        <input type="text" id="configBackupFolder" readonly placeholder="Sin carpeta seleccionada" style="flex:1; min-width:240px;">' +
            '        <button type="button" class="config-modal-btn config-modal-save" id="configBackupPick"><i class="fas fa-folder-open"></i> Elegir carpeta</button>' +
            '      </div>' +
            '      <p class="users-integration-note" style="margin-top:8px;">El navegador guardará el permiso para escribir respaldos en esta carpeta (si tu navegador lo soporta).</p>' +
            '      <hr class="config-modal-hr">' +
            '      <label>Cambiar contraseña (opcional)</label>' +
            '      <input type="password" id="configPassActual" name="passActual" placeholder="Contraseña actual" autocomplete="current-password">' +
            '      <input type="password" id="configPassNueva" name="passNueva" placeholder="Nueva contraseña" autocomplete="new-password">' +
            '      <input type="password" id="configPassRepetir" name="passRepetir" placeholder="Repetir nueva contraseña" autocomplete="new-password">' +
            '    </form>' +
            '  </div>' +
            '  <div class="config-modal-footer">' +
            '    <button type="button" class="config-modal-btn config-modal-cancel" id="configModalCancel">Cancelar</button>' +
            '    <button type="button" class="config-modal-btn config-modal-save" id="configModalSave"><i class="fas fa-save"></i> Guardar</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(wrap);
        configModal = wrap;
        bindConfigModal();
    }

    // ==================== CFG: carpeta de respaldo (File System Access API) ====================
    function _idbOpen() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open('ssepi_cfg', 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    async function _idbGet(key) {
        var db = await _idbOpen();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('kv', 'readonly');
            var st = tx.objectStore('kv');
            var req = st.get(key);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    async function _idbPut(key, val) {
        var db = await _idbOpen();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('kv', 'readwrite');
            var st = tx.objectStore('kv');
            var req = st.put(val, key);
            req.onsuccess = function () { resolve(true); };
            req.onerror = function () { reject(req.error); };
        });
    }

    async function _loadBackupFolderLabel() {
        var inp = document.getElementById('configBackupFolder');
        if (!inp) return;
        try {
            var h = await _idbGet('backupDir');
            inp.value = h && h.name ? h.name : '';
            inp.placeholder = h && h.name ? h.name : 'Sin carpeta seleccionada';
        } catch (e) {
            inp.placeholder = 'Sin carpeta seleccionada';
        }
    }

    async function _pickBackupFolder() {
        if (!window.showDirectoryPicker) {
            alert('Este navegador no soporta seleccionar carpeta. Usa Chrome/Edge actualizado.');
            return;
        }
        try {
            var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await _idbPut('backupDir', handle);
            await _loadBackupFolderLabel();
            alert('Carpeta guardada: ' + (handle && handle.name ? handle.name : 'seleccionada'));
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            alert('No se pudo seleccionar carpeta: ' + (e.message || e));
        }
    }

    var usersModal = null;

    function createUsersModal() {
        if (document.getElementById('usersModalBackdrop')) return;
        var wrap = document.createElement('div');
        wrap.id = 'usersModalBackdrop';
        wrap.className = 'config-modal-backdrop';
        wrap.innerHTML =
            '<div id="usersModal" class="config-modal users-modal" role="dialog">' +
            '  <div class="config-modal-header">' +
            '    <h2>Configurador de usuarios</h2>' +
            '    <button type="button" class="config-modal-close" id="usersModalClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>' +
            '  </div>' +
            '  <div class="config-modal-body">' +
            '    <div class="users-modal-actions">' +
            '      <button type="button" class="config-modal-btn config-modal-save" id="usersModalAdd"><i class="fas fa-user-plus"></i> Nuevo usuario</button>' +
            '      <p class="users-integration-note">Correo y WhatsApp: para enviar correos o mensajes desde la app se puede conectar Gmail API o Resend/SendGrid (vía Supabase Edge Functions) y WhatsApp Business API. Configurable en una siguiente fase.</p>' +
            '    </div>' +
            '    <div class="users-pending-wrap" id="usersPendingWrap" style="display:none;">' +
            '      <h3 class="users-pending-title">Cambios de perfil pendientes</h3>' +
            '      <p class="users-integration-note">Los usuarios (no admin) envían aquí nombre, teléfono y correo; al aprobar se actualiza la tabla usuarios/users. El correo en Authentication debe alinearse en Supabase si cambia el email.</p>' +
            '      <div class="users-list-wrap"><table class="users-list-table"><thead><tr><th>Solicitante</th><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Fecha</th><th></th></tr></thead><tbody id="usersPendingBody"></tbody></table></div>' +
            '    </div>' +
            '    <div class="users-list-wrap">' +
            '      <table class="users-list-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead><tbody id="usersListBody"></tbody></table>' +
            '    </div>' +
            '    <div id="usersAddForm" class="users-add-form" style="display:none;">' +
            '      <h3>Añadir usuario</h3>' +
            '      <label>Correo</label><input type="email" id="newUserEmail" placeholder="correo@ejemplo.com">' +
            '      <label>Nombre</label><input type="text" id="newUserName" placeholder="Nombre completo">' +
            '      <label>Rol</label><select id="newUserRol"><option value="ventas">Ventas</option><option value="ventas_sin_compras">Ventas (sin compras)</option><option value="administracion">Administración</option><option value="compras">Compras</option><option value="taller">Taller</option><option value="motores">Motores</option><option value="facturacion">Facturación</option><option value="contabilidad">Contabilidad</option><option value="automatizacion">Automatización</option><option value="admin">Admin</option></select>' +
            '      <label>ID (UUID) en Auth <em>— opcional, si ya creaste el usuario en Dashboard</em></label><input type="text" id="newUserId" placeholder="ej. 550e8400-e29b-41d4-a716-446655440000">' +
            '      <p class="users-add-hint">Crea el usuario en Supabase Dashboard (Authentication → Add user) y copia aquí su UUID para añadir el perfil.</p>' +
            '      <div class="config-modal-footer">' +
            '        <button type="button" class="config-modal-btn config-modal-cancel" id="usersAddCancel">Cancelar</button>' +
            '        <button type="button" class="config-modal-btn config-modal-save" id="usersAddSave"><i class="fas fa-save"></i> Guardar perfil</button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(wrap);
        usersModal = wrap;
        bindUsersModal();
    }

    function bindUsersModal() {
        var back = document.getElementById('usersModalBackdrop');
        var closeBtn = document.getElementById('usersModalClose');
        var addBtn = document.getElementById('usersModalAdd');
        var addCancel = document.getElementById('usersAddCancel');
        var addSave = document.getElementById('usersAddSave');
        if (back) back.addEventListener('click', function (e) { if (e.target === back) closeUsersModal(); });
        if (closeBtn) closeBtn.addEventListener('click', closeUsersModal);
        if (addBtn) addBtn.addEventListener('click', function () {
            document.getElementById('usersAddForm').style.display = 'block';
            document.getElementById('newUserEmail').value = '';
            document.getElementById('newUserName').value = '';
            document.getElementById('newUserRol').value = 'ventas';
            if (document.getElementById('newUserId')) document.getElementById('newUserId').value = '';
        });
        if (addCancel) addCancel.addEventListener('click', function () { document.getElementById('usersAddForm').style.display = 'none'; });
        if (addSave) addSave.addEventListener('click', saveNewUser);
    }

    function openUsersModal() {
        if (!usersModal) createUsersModal();
        document.getElementById('usersAddForm').style.display = 'none';
        usersModal.classList.add('config-modal-visible');
        var auth = getAuth();
        if (!auth) {
            loadUsersList();
            return;
        }
        auth.getCurrentProfile().then(function (p) {
            isAdmin = p && (p.rol === 'admin' || p.rol === 'superadmin');
            loadPendingProfileRequests();
            loadUsersList();
        }).catch(function () {
            loadUsersList();
        });
    }

    function loadPendingProfileRequests() {
        var wrap = document.getElementById('usersPendingWrap');
        var tbody = document.getElementById('usersPendingBody');
        if (!wrap || !tbody) return;
        var auth = getAuth();
        if (!auth || !isAdmin) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = 'block';
        tbody.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
        auth.listPendingProfileChanges().then(function (rows) {
            tbody.innerHTML = '';
            if (!rows || rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No hay solicitudes pendientes.</td></tr>';
                return;
            }
            rows.forEach(function (r) {
                var tr = document.createElement('tr');
                var uid = (r.auth_user_id || '').substring(0, 8) + '…';
                var dt = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
                tr.innerHTML =
                    '<td><code>' + uid + '</code></td>' +
                    '<td>' + (r.nombre || '—') + '</td>' +
                    '<td>' + (r.telefono || '—') + '</td>' +
                    '<td>' + (r.email || '—') + '</td>' +
                    '<td>' + dt + '</td>' +
                    '<td class="users-actions">' +
                    '<button type="button" class="user-action-btn approve-pend" title="Aprobar"><i class="fas fa-check"></i></button> ' +
                    '<button type="button" class="user-action-btn reject-pend" title="Rechazar"><i class="fas fa-times"></i></button>' +
                    '</td>';
                tr.querySelector('.approve-pend').addEventListener('click', function () {
                    auth.approveProfileChange(r.id).then(function () {
                        loadPendingProfileRequests();
                        loadUsersList();
                        alert('Cambio aplicado.');
                    }).catch(function (err) {
                        alert('Error: ' + (err.message || err));
                    });
                });
                tr.querySelector('.reject-pend').addEventListener('click', function () {
                    var m = window.prompt('Motivo del rechazo (opcional):') || '';
                    auth.rejectProfileChange(r.id, m).then(function () {
                        loadPendingProfileRequests();
                        alert('Solicitud rechazada.');
                    }).catch(function (err) {
                        alert('Error: ' + (err.message || err));
                    });
                });
                tbody.appendChild(tr);
            });
        }).catch(function () {
            wrap.style.display = 'none';
        });
    }

    var inboundModal = null;

    function createInboundModal() {
        if (document.getElementById('inboundModalBackdrop')) return;
        var wrap = document.createElement('div');
        wrap.id = 'inboundModalBackdrop';
        wrap.className = 'config-modal-backdrop';
        wrap.innerHTML =
            '<div id="inboundModal" class="config-modal users-modal" role="dialog">' +
            '  <div class="config-modal-header">' +
            '    <h2><i class="fas fa-inbox"></i> Correos recibidos</h2>' +
            '    <button type="button" class="config-modal-close" id="inboundModalClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>' +
            '  </div>' +
            '  <div class="config-modal-body">' +
            '    <p class="users-integration-note">Correos que han llegado a tu dirección de Resend Inbound (cuando un cliente te escribe). Configura el webhook en Resend y la tabla inbound_emails en Supabase.</p>' +
            '    <div class="users-list-wrap"><table class="users-list-table"><thead><tr><th>De</th><th>Asunto</th><th>Fecha</th><th></th></tr></thead><tbody id="inboundListBody"></tbody></table></div>' +
            '    <div id="inboundDetail" style="display:none; margin-top:16px; padding:12px; background:var(--bg-hover); border-radius:8px;"><pre id="inboundDetailBody"></pre><button type="button" class="config-modal-btn config-modal-cancel" id="inboundDetailClose">Cerrar</button></div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(wrap);
        inboundModal = wrap;
        var closeBtn = document.getElementById('inboundModalClose');
        if (closeBtn) closeBtn.addEventListener('click', closeInboundModal);
        var detailClose = document.getElementById('inboundDetailClose');
        if (detailClose) detailClose.addEventListener('click', function () {
            var d = document.getElementById('inboundDetail');
            if (d) d.style.display = 'none';
        });
        wrap.addEventListener('click', function (e) {
            if (e.target.id === 'inboundModalBackdrop') closeInboundModal();
        });
    }

    function openInboundModal() {
        if (!inboundModal) createInboundModal();
        document.getElementById('inboundDetail').style.display = 'none';
        inboundModal.classList.add('config-modal-visible');
        loadInboundList();
    }

    function closeInboundModal() {
        if (inboundModal) inboundModal.classList.remove('config-modal-visible');
    }

    function loadInboundList() {
        var tbody = document.getElementById('inboundListBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4">Cargando…</td></tr>';
        var supabase = window.supabase;
        if (!supabase) {
            tbody.innerHTML = '<tr><td colspan="4">Supabase no disponible.</td></tr>';
            return;
        }
        supabase.from('inbound_emails').select('id, from_email, subject, received_at, leido, body_text, body_html').order('received_at', { ascending: false }).limit(50).then(function (r) {
            if (r.error) {
                tbody.innerHTML = '<tr><td colspan="4">Tabla inbound_emails no existe o sin permiso. Ejecuta scripts/migrations/add_inbound_emails.sql y configura el webhook Resend.</td></tr>';
                return;
            }
            var list = r.data || [];
            tbody.innerHTML = '';
            list.forEach(function (row) {
                var tr = document.createElement('tr');
                tr.className = row.leido ? '' : 'inbound-unread';
                var from = (row.from_email || '').replace(/^.*<([^>]+)>$/, '$1') || row.from_email || '—';
                var subj = (row.subject || '(sin asunto)').substring(0, 60);
                var date = row.received_at ? new Date(row.received_at).toLocaleString() : '—';
                tr.innerHTML = '<td>' + from + '</td><td>' + subj + '</td><td>' + date + '</td><td><button type="button" class="user-action-btn request-pass">Ver</button></td>';
                tbody.appendChild(tr);
                tr.querySelector('button').addEventListener('click', function () {
                    var body = row.body_text || row.body_html || '(sin contenido)';
                    document.getElementById('inboundDetailBody').textContent = body;
                    document.getElementById('inboundDetail').style.display = 'block';
                    supabase.from('inbound_emails').update({ leido: true }).eq('id', row.id).then(function () {});
                });
            });
            if (list.length === 0) tbody.innerHTML = '<tr><td colspan="4">No hay correos recibidos aún.</td></tr>';
        });
    }

    function closeUsersModal() {
        if (usersModal) usersModal.classList.remove('config-modal-visible');
    }

    function loadUsersList() {
        var auth = getAuth();
        if (!auth) return;
        var tbody = document.getElementById('usersListBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4">Cargando…</td></tr>';
        auth.listProfiles().then(function (list) {
            tbody.innerHTML = '';
            list.forEach(function (p) {
                var tr = document.createElement('tr');
                tr.dataset.id = p.id;
                tr.innerHTML =
                    '<td>' + (p.nombre || '—') + '</td>' +
                    '<td>' + (p.email || '—') + '</td>' +
                    '<td>' + (p.rol || '—') + '</td>' +
                    '<td class="users-actions">' +
                    '<button type="button" class="user-action-btn request-pass" title="Solicitar cambio de contraseña por correo"><i class="fas fa-envelope"></i></button> ' +
                    '<button type="button" class="user-action-btn delete-user" title="Eliminar perfil"><i class="fas fa-trash"></i></button>' +
                    '</td>';
                tbody.appendChild(tr);
                tr.querySelector('.request-pass').addEventListener('click', function () { requestPasswordFor(p.email); });
                tr.querySelector('.delete-user').addEventListener('click', function () { deleteUser(p.id, p.email); });
            });
        }).catch(function (err) {
            tbody.innerHTML = '<tr><td colspan="4">Error: ' + (err.message || err) + '</td></tr>';
        });
    }

    function requestPasswordFor(email) {
        var auth = getAuth();
        if (!auth) return;
        if (!confirm('Se enviará un correo a ' + email + ' para que el usuario pueda cambiar su contraseña. ¿Continuar?')) return;
        auth.requestPasswordResetForUser(email).then(function () {
            alert('Correo enviado. El usuario recibirá un enlace para restablecer su contraseña.');
        }).catch(function (err) {
            alert('Error: ' + (err.message || err));
        });
    }

    function deleteUser(profileId, email) {
        if (!isAdmin) { alert('Solo un administrador puede eliminar perfiles.'); return; }
        if (!confirm('¿Eliminar el perfil de ' + email + '? La cuenta en Authentication debe eliminarse manualmente desde Supabase Dashboard si es necesario.')) return;
        var auth = getAuth();
        if (!auth) return;
        auth.deleteProfile(profileId).then(function () {
            loadUsersList();
        }).catch(function (err) {
            alert('Error: ' + (err.message || err));
        });
    }

    function saveNewUser() {
        var email = (document.getElementById('newUserEmail') && document.getElementById('newUserEmail').value.trim()) || '';
        var nombre = (document.getElementById('newUserName') && document.getElementById('newUserName').value.trim()) || '';
        var rol = (document.getElementById('newUserRol') && document.getElementById('newUserRol').value) || 'ventas';
        var idRaw = document.getElementById('newUserId') && document.getElementById('newUserId').value.trim();
        if (!email) { alert('Indica el correo.'); return; }
        if (!nombre) { alert('Indica el nombre.'); return; }
        if (!idRaw) {
            alert('Para dar de alta un usuario nuevo:\n\n1) En Supabase Dashboard → Authentication → Users → Add user, crea la cuenta con el correo y una contraseña temporal.\n2) Copia el UUID del usuario creado y pégalo en el campo "ID (UUID) en Auth" en este formulario.\n3) Vuelve a hacer clic en Guardar perfil.\n\nRol elegido: ' + rol + '.');
            return;
        }
        var supabase = window.supabase;
        if (!supabase) { alert('Supabase no disponible.'); return; }
        var payload = { auth_user_id: idRaw, email: email, nombre: nombre, rol: rol };
        function tryInsert(table, row, cb) {
            supabase.from(table).insert(row).then(cb);
        }
        // Preferir "usuarios", luego "users", y al final "profiles" (legacy)
        tryInsert('usuarios', payload, function (r1) {
            if (!r1.error) {
                document.getElementById('usersAddForm').style.display = 'none';
                loadUsersList();
                alert('Perfil añadido.');
                return;
            }
            tryInsert('users', payload, function (r2) {
                if (!r2.error) {
                    document.getElementById('usersAddForm').style.display = 'none';
                    loadUsersList();
                    alert('Perfil añadido.');
                    return;
                }
                // fallback: profiles usa id como PK
                supabase.from('profiles').insert({ id: idRaw, email: email, nombre: nombre, rol: rol }).then(function (r3) {
                    if (r3.error) {
                        if (r3.error.code === '23503') alert('No existe un usuario en Authentication con ese ID. Crea primero el usuario en Supabase Dashboard (Authentication → Add user) y usa su UUID.');
                        else alert('Error: ' + (r3.error.message || r3.error));
                        return;
                    }
                    document.getElementById('usersAddForm').style.display = 'none';
                    loadUsersList();
                    alert('Perfil añadido.');
                });
            });
        });
    }

    function positionDropdown(pill) {
        if (!dropdown) return;
        var rect = pill.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.display = 'block';
    }

    function hideDropdown() {
        if (dropdown) dropdown.style.display = 'none';
    }

    function setTheme(theme) {
        var body = document.body;
        var btn = document.getElementById('themeBtn');
        if (theme === 'dark') {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function toggleDropdown(ev) {
        var pill = ev.target.closest('.user-pill');
        if (!pill) return;
        if (!dropdown) createDropdown();
        if (!configModal) createConfigModal();
        var isOpen = dropdown.style.display === 'block';
        if (isOpen) {
            hideDropdown();
            return;
        }
        positionDropdown(pill);
        var auth = getAuth();
        if (auth) auth.getCurrentProfile().then(function (p) { isAdmin = p && (p.rol === 'admin' || p.rol === 'superadmin'); }).catch(function () { isAdmin = false; });
    }

    function bindDropdownActions() {
        if (!dropdown) return;
        dropdown.querySelectorAll('.user-menu-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-action');
                hideDropdown();
                if (action === 'config') openConfigModal();
                else if (action === 'themeLight') setTheme('light');
                else if (action === 'themeDark') setTheme('dark');
                else if (action === 'logout') doLogout();
            });
        });
    }

    function openConfigModal() {
        if (!configModal) createConfigModal();
        var auth = getAuth();
        if (!auth) {
            alert('Servicio de autenticación no disponible.');
            return;
        }
        document.getElementById('configNombre').value = '';
        document.getElementById('configCorreo').value = '';
        document.getElementById('configTelefono').value = '';
        document.getElementById('configPassActual').value = '';
        document.getElementById('configPassNueva').value = '';
        document.getElementById('configPassRepetir').value = '';
        configModal.classList.add('config-modal-visible');
        _loadBackupFolderLabel();
        auth.getCurrentProfile().then(function (p) {
            if (p) {
                document.getElementById('configNombre').value = p.nombre || '';
                document.getElementById('configCorreo').value = p.email || '';
                document.getElementById('configTelefono').value = p.telefono || '';
            }
        }).catch(function (err) {
            console.error('Error cargando perfil:', err);
        });
    }

    function closeConfigModal() {
        if (configModal) configModal.classList.remove('config-modal-visible');
    }

    function doLogout() {
        var auth = getAuth();
        if (!auth) {
            window.location.href = '/';
            return;
        }
        auth.logout().then(function () {
            window.location.href = '/';
        }).catch(function (err) {
            console.error('Error al cerrar sesión:', err);
            window.location.href = '/';
        });
    }

    function doResetErp() {
        if (!isAdmin) { alert('Solo administradores pueden reiniciar el ERP.'); return; }
        if (!confirm('¿Reiniciar el ERP completo? Se eliminará toda la información. Esta acción no se puede deshacer.')) return;
        alert('Reinicio ERP: en la siguiente fase se conectará con Supabase para vaciar tablas y generar el script de reinicio.');
    }

    function doDownloadSql() {
        if (!isAdmin) { alert('Solo administradores pueden descargar SQL.'); return; }
        if (!window.supabase) {
            alert('Supabase no está disponible.');
            return;
        }
        alert('Descargar SQL: en la siguiente fase se exportarán los datos y se generará un archivo .sql para importar en el ejecutor de Supabase.');
    }

    function saveConfig() {
        var auth = getAuth();
        if (!auth) {
            alert('Servicio de autenticación no disponible.');
            return;
        }
        var nombre = (document.getElementById('configNombre') && document.getElementById('configNombre').value) || '';
        var correo = (document.getElementById('configCorreo') && document.getElementById('configCorreo').value) || '';
        var telefono = (document.getElementById('configTelefono') && document.getElementById('configTelefono').value) || '';
        var passActual = document.getElementById('configPassActual') && document.getElementById('configPassActual').value;
        var passNueva = document.getElementById('configPassNueva') && document.getElementById('configPassNueva').value;
        var passRepetir = document.getElementById('configPassRepetir') && document.getElementById('configPassRepetir').value;

        if (passNueva || passRepetir) {
            if (passNueva !== passRepetir) {
                alert('La nueva contraseña y la repetición no coinciden.');
                return;
            }
            if (!passActual) {
                alert('Indica la contraseña actual para cambiar la contraseña.');
                return;
            }
        }

        var promise = auth.updateProfile({ nombre: nombre.trim() || undefined, telefono: telefono.trim() || undefined, email: correo.trim() || undefined });
        promise.then(function (result) {
            if (result && result.pendingApproval) {
                var chain = Promise.resolve();
                if (passNueva && passActual) {
                    chain = auth.changePassword(passActual, passNueva);
                }
                return chain.then(function () {
                    closeConfigModal();
                    alert((result.message || 'Solicitud enviada al administrador.') + (passNueva ? ' Contraseña actualizada.' : ''));
                });
            }
            var after = Promise.resolve();
            if (passNueva && passActual) {
                after = auth.changePassword(passActual, passNueva);
            }
            return after.then(function () {
                closeConfigModal();
                var userName = document.getElementById('userName');
                var userAvatar = document.getElementById('userAvatar');
                if (userName) userName.textContent = (nombre.trim() || 'Admin').split(' ')[0] || 'Admin';
                if (userAvatar) userAvatar.textContent = (nombre.trim() || 'A').charAt(0).toUpperCase();
                alert('Perfil actualizado correctamente.');
            });
        }).catch(function (err) {
            alert('Error: ' + (err.message || err));
        });
    }

    function bindConfigModal() {
        var back = document.getElementById('configModalBackdrop');
        var closeBtn = document.getElementById('configModalClose');
        var cancelBtn = document.getElementById('configModalCancel');
        var saveBtn = document.getElementById('configModalSave');
        var pickBtn = document.getElementById('configBackupPick');
        if (back) back.addEventListener('click', function (e) { if (e.target === back) closeConfigModal(); });
        if (closeBtn) closeBtn.addEventListener('click', closeConfigModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeConfigModal);
        if (saveBtn) saveBtn.addEventListener('click', saveConfig);
        if (pickBtn) pickBtn.addEventListener('click', function () { _pickBackupFolder(); });
    }

    function init() {
        createDropdown();
        createConfigModal();
        var headerRight = document.querySelector('.header-right');
        /* Correo solo envío: no mostrar botón de bandeja de entrada */
        document.addEventListener('click', function (ev) {
            if (dropdown && dropdown.style.display === 'block') {
                if (!ev.target.closest('.user-menu-dropdown') && !ev.target.closest('.user-pill')) hideDropdown();
            }
        });
        var pill = document.getElementById('userMenu') || document.querySelector('.user-pill');
        if (pill) {
            pill.style.cursor = 'pointer';
            pill.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleDropdown(e);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ssepiOpenUserConfig = function () {
        if (!configModal) createConfigModal();
        openConfigModal();
    };
})();
