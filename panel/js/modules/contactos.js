// ================================================
// ARCHIVO: contactos.js
// DESCRIPCIÓN: Módulo de Contactos (Clientes y Proveedores) adaptado a Supabase
// BASADO EN: contactos-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de contactos, timeline, importación CSV, WhatsApp
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { ContactosFormulas } from '../core/contactos-formulas.js';
import { PRIORITY_SUPPLIERS_BASE, normalizeUrl } from '../core/ssepi-runtime/priority-suppliers-catalog.js';
import { mergePriorityProvidersFirst } from '../core/ssepi-runtime/priority-suppliers-merge.js';

const ContactosModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let contactos = [];
    /** Última lista mostrada (incluye fila sintética de catálogo si aplica). */
    let ultimaVistaFiltrada = [];
    let _ensuringPrioritySuppliers = false;
    let filtroTipo = 'all';
    let busqueda = '';
    let periodo = 'all';
    let vistaActual = 'kanban';
    let contactoSeleccionado = null;

    // Servicios de datos
    const contactosService = createDataService('contactos');

    function _supabase() { return window.supabase; }

    /** Evita duplicar la misma persona al fusionar `clientes` con `contactos` (misma clave = una sola fila). */
    function _claveDedupeContacto(c) {
        const email = (c.email || '').toString().toLowerCase().trim();
        const nom = (c.nombre || '').toString().toLowerCase().trim();
        const emp = (c.empresa || '').toString().toLowerCase().trim();
        // Correo compartido (administración, ventas) ≠ una sola persona.
        if (email) return 'e:' + email + '|' + nom + '|' + emp;
        const tel = (c.telefono || '').toString().replace(/\D/g, '');
        // Mismo teléfono de central ≠ misma persona: incluir nombre y empresa en la clave.
        if (tel.length >= 10) return 't:' + tel + '|' + nom + '|' + emp;
        if (nom || emp) return 'n:' + nom + '|' + emp;
        return 'id:' + (c.id || '');
    }

    /** Export Odoo (res.partner): "Empresa legal, S.A. de C.V., Nombre persona" → persona + empresa. */
    function _splitOdooNombreCompleto(fullRaw) {
        const full = String(fullRaw || '').trim();
        if (!full) return { nombre: '', empresa: '' };
        const lastComma = full.lastIndexOf(',');
        if (lastComma <= 0) return { nombre: full.toUpperCase(), empresa: '' };
        const left = full.slice(0, lastComma).trim();
        const right = full.slice(lastComma + 1).trim();
        const legalEntity = /\b(s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?|inc\.?|llc|corp\.?|c\.?\s*v\.?)\b/i;
        if (right && (legalEntity.test(left) || left.length > 3) && !legalEntity.test(right)) {
            return { nombre: right.toUpperCase(), empresa: left.toUpperCase() };
        }
        return { nombre: full.toUpperCase(), empresa: '' };
    }

    function _rowFromOdooExport(obj) {
        const full = obj['Nombre completo'] ?? obj['nombre completo'] ?? '';
        const email = String(obj['Correo electrónico'] ?? obj['correo electrónico'] ?? obj['email'] ?? '').trim();
        const telefono = String(obj['Teléfono'] ?? obj['telefono'] ?? '').trim();
        const { nombre, empresa } = _splitOdooNombreCompleto(full);
        if (!nombre && !empresa) return null;
        const displayNombre = nombre || empresa;
        return {
            nombre: displayNombre,
            empresa: nombre ? empresa : '',
            email,
            telefono,
            rfc: '',
            tipo: 'client',
            avatar: displayNombre.charAt(0).toUpperCase(),
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }

    function _isOdooPartnerSheet(rows) {
        if (!rows || !rows.length) return false;
        const keys = Object.keys(rows[0] || {});
        const joined = keys.join('\u0000').toLowerCase();
        return joined.includes('nombre completo') && (joined.includes('correo') || joined.includes('teléfono') || joined.includes('telefono'));
    }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Contactos] Conectado');
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
            _startListeners();
            _startClock();
            // _importInitialContacts() eliminado - los contactos ya están en BD
        } catch (e) {
            console.error('[Contactos] init error:', e);
        }
        console.log('✅ Módulo contactos iniciado');
    }

    function _setVistaInicial() {
        const kanban = document.getElementById('kanbanContainer');
        const list = document.getElementById('listContainer');
        if (kanban) kanban.style.display = 'grid';
        if (list) list.style.display = vistaActual === 'list' ? 'block' : 'none';
        const vKanban = document.getElementById('vistaKanban');
        const vLista = document.getElementById('vistaLista');
        if (vistaActual === 'kanban' && vKanban) vKanban.classList.add('active');
        if (vistaActual === 'list' && vLista) vLista.classList.add('active');
    }

    async function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        const themeBtn = document.getElementById('themeBtn');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _startClock() {
        function fmt24() {
            var d = new Date();
            var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
            return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }
        var el = document.getElementById('clock');
        if (el) el.innerText = fmt24();
        setInterval(function () {
            var el = document.getElementById('clock');
            if (el) el.innerText = fmt24();
        }, 1000);
    }

    function _bindEvents() {
        const byId = id => document.getElementById(id);
        if (byId('toggleMenu')) byId('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */

        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                filtroTipo = this.dataset.filter;
                _renderView();
            });
        });

        document.querySelectorAll('.periodo-option').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                periodo = this.dataset.period;
                _renderView();
            });
        });

        if (byId('vistaKanban')) byId('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            if (byId('vistaKanban')) byId('vistaKanban').classList.add('active');
            if (byId('vistaLista')) byId('vistaLista').classList.remove('active');
            _renderView();
        });
        if (byId('vistaLista')) byId('vistaLista').addEventListener('click', () => {
            vistaActual = 'list';
            if (byId('vistaLista')) byId('vistaLista').classList.add('active');
            if (byId('vistaKanban')) byId('vistaKanban').classList.remove('active');
            _renderView();
        });

        if (byId('searchInput')) byId('searchInput').addEventListener('input', function(e) {
            busqueda = e.target.value.toLowerCase();
            _renderView();
        });

        if (byId('newContactBtn')) byId('newContactBtn').addEventListener('click', () => _abrirModalNuevo());
        if (byId('importBtn')) byId('importBtn').addEventListener('click', () => { const f = byId('fileInput'); if (f) f.click(); });
        if (byId('fileInput')) byId('fileInput').addEventListener('change', _handleFileImport);
        if (byId('saveContactBtn')) byId('saveContactBtn').addEventListener('click', _saveContact);

        const panelClose = document.querySelector('.panel-close');
        if (panelClose) panelClose.addEventListener('click', _closeDetail);
        if (byId('backdrop')) byId('backdrop').addEventListener('click', _closeDetail);
        if (byId('btnWhatsApp')) byId('btnWhatsApp').addEventListener('click', _enviarWhatsApp);
        if (byId('updateContactBtn')) byId('updateContactBtn').addEventListener('click', _updateContactData);
        if (byId('panelLogoUrl')) byId('panelLogoUrl').addEventListener('input', _updateAvatarPreview);
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
        if (!s) return;
        if (window.innerWidth <= 768) s.classList.toggle('active');
        else b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ==================== LISTENERS SUPABASE ====================
    function _startListeners() {
        const supabase = _supabase();
        if (!supabase) return;
        const subContactos = supabase
            .channel('contactos_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, payload => {
                _loadContactos();
            })
            .subscribe();
        subscriptions.push(subContactos);
        _loadContactos();
    }

    async function _loadContactos(opts) {
        const skipPriorityEnsure = opts && opts.skipPriorityEnsure;
        try {
            const rawContactos = await contactosService.select({}, { orderBy: 'nombre', ascending: true }) || [];

            // Deduplicar por clave única (email, teléfono, nombre+empresa)
            const vistos = new Set();
            contactos = rawContactos.filter(c => {
                const k = _claveDedupeContacto(c);
                if (vistos.has(k)) return false;
                vistos.add(k);
                return true;
            });
        } catch (e) {
            console.warn('[Contactos] Error cargando contactos:', e?.message || e);
            contactos = [];
        }
        if (!skipPriorityEnsure && !_ensuringPrioritySuppliers) {
            _ensuringPrioritySuppliers = true;
            try {
                await _ensurePrioritySuppliers();
            } catch (e) {
                console.warn('[Contactos] Proveedores prioridad:', e?.message || e);
            } finally {
                _ensuringPrioritySuppliers = false;
            }
        }
        _renderView();
        _updateKPIs();
    }

    async function _ensurePrioritySuppliers() {
        const base = contactos.filter(c => c.tipo === 'provider' && c.sitio_web && !c._fromClientes);
        const have = new Set(base.map(c => normalizeUrl(c.sitio_web)));
        const csrfToken = sessionStorage.getItem('csrfToken');
        let added = false;
        for (let i = 0; i < PRIORITY_SUPPLIERS_BASE.length; i++) {
            const p = PRIORITY_SUPPLIERS_BASE[i];
            const u = normalizeUrl(p.url);
            if (have.has(u)) continue;
            const row = {
                nombre: p.nombre,
                empresa: p.nombre,
                tipo: 'provider',
                sitio_web: p.url,
                puesto: p.etiqueta + ' · ' + p.ubicacion,
                direccion: p.ubicacion,
                avatar: (p.nombre || '?').charAt(0).toUpperCase(),
                color: '#00a09d',
            };
            try {
                await contactosService.insert(row, csrfToken);
                have.add(u);
                added = true;
            } catch (e) {
                console.warn('[Contactos] Alta proveedor catálogo', p.nombre, e?.message || e);
            }
        }
        if (added) {
            await _loadContactos({ skipPriorityEnsure: true });
        }
    }

    // ==================== IMPORTACIÓN INICIAL ELIMINADA ====================
    // Los contactos ya están en la base de datos - no insertar hardcoded

    // ==================== RENDERIZADO ====================
    function _renderView() {
        let filtered = contactos;

        if (filtroTipo === 'provider') {
            filtered = mergePriorityProvidersFirst(contactos, 'taller');
        } else if (filtroTipo !== 'all') {
            filtered = filtered.filter(c => c.tipo === filtroTipo);
        }
        if (busqueda) {
            const q = busqueda;
            filtered = filtered.filter(c =>
                (c.nombre && c.nombre.toLowerCase().includes(q)) ||
                (c.email && c.email.toLowerCase().includes(q)) ||
                (c.rfc && c.rfc.toLowerCase().includes(q)) ||
                (c.etiquetas && c.etiquetas?.toLowerCase().includes(q)) ||
                (c.empresa && c.empresa.toLowerCase().includes(q)) ||
                (c.sitio_web && c.sitio_web.toLowerCase().includes(q)) ||
                (c.puesto && c.puesto.toLowerCase().includes(q))
            );
        }
        if (periodo !== 'all') {
            const now = new Date();
            filtered = filtered.filter(c => {
                if (c._isCatalogPreset) return true;
                if (!c.created_at) return filtroTipo === 'provider';
                const fecha = new Date(c.created_at);
                if (periodo === 'month') return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
                if (periodo === 'year') return fecha.getFullYear() === now.getFullYear();
                return true;
            });
        }

        ultimaVistaFiltrada = filtered.slice();

        const totalEl = document.getElementById('totalCount');
        if (totalEl) totalEl.innerText = filtered.length;

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else _renderList(filtered);
    }

    function _renderKanban(contacts) {
        const container = document.getElementById('kanbanContainer');
        const listContainer = document.getElementById('listContainer');
        if (!container) return;
        if (container) container.style.display = 'grid';
        if (listContainer) listContainer.style.display = 'none';
        if (contacts.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-address-book"></i><p>No se encontraron contactos</p></div>`;
            return;
        }
        container.innerHTML = contacts.map(c => {
            const inicial = (c.nombre || '?').charAt(0).toUpperCase();
            const estiloAvatar = c.logo_url
                ? `background-image: url('${c.logo_url}'); background-size: cover; background-position: center;`
                : `background: linear-gradient(135deg, ${c.color || '#00a09d'}, ${c.color || '#008a87'});`;
            const tipoClass = c.tipo === 'client' ? 'client' : 'provider';
            const tipoText = c.tipo === 'client' ? 'CLIENTE' : 'PROVEEDOR';
            return `
                <div class="contact-card" data-id="${c.id}" onclick="contactosModule.abrirDetalle('${c.id}')">
                    <div class="avatar-box" style="${estiloAvatar}">${c.logo_url ? '' : inicial}</div>
                    <div class="info">
                        <h3>${c.nombre || 'Sin nombre'}</h3>
                        <p><i class="fas fa-envelope"></i> ${c.email || '—'}</p>
                        <p><i class="fas fa-phone-alt"></i> ${c.telefono || '—'}</p>
                        <p><i class="fas fa-building"></i> ${c.empresa || '—'}</p>
                        <span class="badge ${tipoClass}">${tipoText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _renderList(contacts) {
        const container = document.getElementById('listContainer');
        const tbody = document.getElementById('listTableBody');
        const kanbanContainer = document.getElementById('kanbanContainer');
        if (!container || !tbody) return;
        if (container) container.style.display = 'block';
        if (kanbanContainer) kanbanContainer.style.display = 'none';

        if (contacts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="fas fa-address-book"></i><p>No se encontraron contactos</p></td></tr>`;
            return;
        }

        tbody.innerHTML = contacts.map(c => `
            <tr onclick="contactosModule.abrirDetalle('${c.id}')">
                <td><strong>${c.nombre || ''}</strong></td>
                <td>${c.empresa || ''}</td>
                <td>${c.email || ''}</td>
                <td>${c.telefono || ''}</td>
                <td>${c.rfc || ''}</td>
                <td><span class="badge ${c.tipo === 'client' ? 'client' : 'provider'}">${c.tipo === 'client' ? 'Cliente' : 'Proveedor'}</span></td>
            </tr>
        `).join('');
    }

    async function _updateKPIs() {
        const total = contactos.length;
        const clientes = contactos.filter(c => c.tipo === 'client').length;
        const proveedores = contactos.filter(c => c.tipo === 'provider').length;
        let saldoTotal = 0;
        const supabase = _supabase();
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('ingresos_contabilidad')
                    .select('monto_total')
                    .eq('estatus', 'pendiente');
                if (!error && data) saldoTotal = data.reduce((s, i) => s + (i.monto_total || 0), 0);
            } catch (e) { console.error(e); }
        }
        const kpiTotal = document.getElementById('kpiTotalContactos');
        const kpiClientes = document.getElementById('kpiClientes');
        const kpiProveedores = document.getElementById('kpiProveedores');
        const kpiSaldo = document.getElementById('kpiSaldoTotal');
        if (kpiTotal) kpiTotal.innerText = total;
        if (kpiClientes) kpiClientes.innerText = clientes;
        if (kpiProveedores) kpiProveedores.innerText = proveedores;
        if (kpiSaldo) kpiSaldo.innerHTML = `$${saldoTotal.toFixed(2)}`;
    }

    // ==================== PANEL DE DETALLE ====================
    async function abrirDetalle(id) {
        const contacto = ultimaVistaFiltrada.find(c => c.id === id) || contactos.find(c => c.id === id);
        if (!contacto) return;
        contactoSeleccionado = contacto;
        const backdrop = document.getElementById('backdrop');
        const sidePanel = document.getElementById('sidePanel');
        if (backdrop) backdrop.style.display = 'block';
        if (sidePanel) sidePanel.classList.add('open');

        const panelNombre = document.getElementById('panelNombre');
        const panelEmpresa = document.getElementById('panelEmpresa');
        if (panelNombre) panelNombre.innerText = contacto.nombre || 'Sin nombre';
        if (panelEmpresa) panelEmpresa.innerText = contacto.empresa || '—';
        _updateAvatarFromContact(contacto);

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        setVal('panelId', contacto.id);
        setVal('panelPuesto', contacto.puesto);
        setVal('panelTelefono', contacto.telefono);
        setVal('panelEmail', contacto.email);
        setVal('panelRfc', contacto.rfc);
        setVal('panelSitio', contacto.sitio_web);
        setVal('panelTipo', contacto.tipo || 'client');
        setVal('panelEtiquetas', contacto.etiquetas);
        setVal('panelDireccion', contacto.direccion);
        setVal('panelLogoUrl', contacto.logo_url);

        if (contacto.tipo === 'client') {
            const km = ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa);
            const costo = ContactosFormulas.calcularCostoRecoleccionRedondo(km);
            // Podríamos mostrar esto en algún lado si se desea
        }

        if (String(contacto.id || '').indexOf('__prio_') === 0) {
            const container = document.getElementById('timelineContainer');
            if (container) {
                container.innerHTML = '<div class="empty-timeline">Proveedor de catálogo (entrega). Use el sitio web o guarde como contacto para actividades.</div>';
            }
        } else {
            await _cargarTimeline(contacto.id);
        }
    }

    function _updateAvatarFromContact(contacto) {
        const avatarDiv = document.getElementById('panelAvatar');
        if (!avatarDiv) return;
        if (contacto.logo_url) {
            avatarDiv.style.background = `url('${contacto.logo_url}') center / cover no-repeat`;
            avatarDiv.innerHTML = '';
        } else {
            const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
            avatarDiv.style.background = `linear-gradient(135deg, ${contacto.color || '#00a09d'}, ${contacto.color || '#008a87'})`;
            avatarDiv.innerHTML = inicial;
        }
    }

    function _updateAvatarPreview() {
        const logoUrl = document.getElementById('panelLogoUrl').value;
        const avatarDiv = document.getElementById('panelAvatar');
        if (logoUrl) {
            avatarDiv.style.background = `url('${logoUrl}') center / cover no-repeat`;
            avatarDiv.innerHTML = '';
        } else if (contactoSeleccionado) {
            const inicial = (contactoSeleccionado.nombre || '?').charAt(0).toUpperCase();
            avatarDiv.style.background = `linear-gradient(135deg, ${contactoSeleccionado.color || '#00a09d'}, ${contactoSeleccionado.color || '#008a87'})`;
            avatarDiv.innerHTML = inicial;
        }
    }

    async function _updateContactData() {
        const id = document.getElementById('panelId').value;
        if (String(id).indexOf('__prio_') === 0) {
            showNotification('Proveedor de catálogo: cree un contacto nuevo para guardar en la base.', 'error');
            return;
        }
        const updatedData = {
            puesto: document.getElementById('panelPuesto').value.trim() || '',
            telefono: document.getElementById('panelTelefono').value.trim() || '',
            email: document.getElementById('panelEmail').value.trim() || '',
            rfc: document.getElementById('panelRfc').value.trim() || '',
            sitio_web: document.getElementById('panelSitio').value.trim() || '',
            tipo: document.getElementById('panelTipo').value || 'client',
            etiquetas: document.getElementById('panelEtiquetas').value.trim() || '',
            direccion: document.getElementById('panelDireccion').value.trim() || '',
            logo_url: document.getElementById('panelLogoUrl').value.trim() || '',
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await contactosService.update(id, updatedData, csrfToken);
            await _agregarActividad(id, 'nota', 'Contacto actualizado');
            showNotification('✅ Contacto actualizado', 'success');
        } catch (e) {
            console.error(e);
            showNotification('❌ Error al actualizar', 'error');
        }
    }

    function _closeDetail() {
        const sidePanel = document.getElementById('sidePanel');
        const backdrop = document.getElementById('backdrop');
        if (sidePanel) sidePanel.classList.remove('open');
        if (backdrop) backdrop.style.display = 'none';
        contactoSeleccionado = null;
    }

    // ==================== TIMELINE ====================
    async function _cargarTimeline(contactoId) {
        const container = document.getElementById('timelineContainer');
        if (!container) return;
        const supabase = _supabase();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('actividades_contactos')
                .select('*')
                .eq('contacto_id', contactoId)
                .order('fecha', { ascending: false })
                .limit(20);
            if (error) throw error;
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty-timeline">No hay actividades registradas</div>';
                return;
            }
            let html = '';
            data.forEach(act => {
                const fecha = new Date(act.fecha);
                const icon = act.tipo === 'whatsapp' ? 'fab fa-whatsapp' : (act.tipo === 'nota' ? 'fas fa-sticky-note' : 'fas fa-clock');
                html += `
                    <div class="timeline-item">
                        <div class="timeline-icon" style="background: var(--accent-primary);"><i class="${icon}"></i></div>
                        <div class="timeline-content">
                            <div class="timeline-header"><span class="timeline-user">${act.usuario || 'Sistema'}</span><span class="timeline-time">${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
                            <div class="timeline-action">${act.accion}</div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            console.error(e);
            container.innerHTML = '<div class="empty-timeline">Error al cargar timeline</div>';
        }
    }

    async function _agregarActividad(contactoId, tipo, accion) {
        const user = await authService.getCurrentProfile();
        const supabase = _supabase();
        if (!supabase) return;
        try {
            await supabase.from('actividades_contactos').insert({
                contacto_id: contactoId,
                tipo,
                accion,
                usuario: user?.email || 'sistema',
                fecha: new Date().toISOString()
            });
            if (contactoSeleccionado && contactoSeleccionado.id === contactoId) {
                _cargarTimeline(contactoId);
            }
        } catch (e) {
            console.error('Error al registrar actividad:', e);
        }
    }

    // ==================== WHATSAPP ====================
    function _enviarWhatsApp() {
        if (!contactoSeleccionado) { alert('Seleccione un contacto'); return; }
        const telefono = contactoSeleccionado.telefono;
        if (!telefono) { alert('El contacto no tiene teléfono'); return; }
        const numero = telefono.replace(/[^\d]/g, '');
        const mensaje = `Hola ${contactoSeleccionado.nombre}, contacto desde SSEPI.`;
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
        _agregarActividad(contactoSeleccionado.id, 'whatsapp', 'Mensaje enviado por WhatsApp');
    }

    // ==================== GUARDAR NUEVO CONTACTO ====================
    async function _saveContact() {
        const nombre = document.getElementById('inputNombre')?.value?.trim();
        if (!nombre) { alert('El nombre es obligatorio'); return; }
        const data = {
            nombre: nombre.toUpperCase(),
            empresa: document.getElementById('inputEmpresa')?.value?.trim() || '',
            puesto: document.getElementById('inputPuesto')?.value?.trim() || '',
            telefono: document.getElementById('inputTelefono')?.value?.trim() || '',
            email: document.getElementById('inputEmailNuevo')?.value?.trim() || '',
            direccion: document.getElementById('inputDireccion')?.value?.trim() || '',
            rfc: document.getElementById('inputRfc')?.value?.trim() || '',
            sitio_web: document.getElementById('inputSitio')?.value?.trim() || '',
            tipo: document.getElementById('inputTipo')?.value || 'client',
            etiquetas: document.getElementById('inputEtiquetas')?.value?.trim() || '',
            avatar: nombre.charAt(0).toUpperCase(),
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            logo_url: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await contactosService.insert(data, csrfToken);
            await _agregarActividad(inserted.id, 'nota', 'Contacto creado');
            _cerrarModal();
            showNotification('Contacto guardado correctamente', 'success');
        } catch (e) {
            console.error(e);
            showNotification('Error al guardar contacto', 'error');
        }
    }

    function _abrirModalNuevo() {
        document.getElementById('modalNuevoContacto').classList.add('show');
    }

    function _cerrarModal() {
        document.getElementById('modalNuevoContacto').classList.remove('show');
    }

    function showNotification(msg, type = 'success') {
        const notif = document.getElementById('notification');
        if (!notif) return;
        notif.textContent = msg;
        notif.className = `notification ${type} show`;
        setTimeout(() => notif.classList.remove('show'), 3000);
    }

    // ==================== IMPORTACIÓN CSV / EXCEL / PDF ====================
    async function _handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const name = (file.name || '').toLowerCase();
        const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
        const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel';
        const isCsv = name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain';

        if (isPdf) {
            showNotification('Para importar contactos use archivos Excel o CSV. El PDF se acepta como referencia.', 'info');
            e.target.value = '';
            return;
        }

        if (isExcel && typeof XLSX !== 'undefined') {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = new Uint8Array(ev.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const csrfToken = sessionStorage.getItem('csrfToken');
                    let imported = 0;
                    let skipped = 0;
                    const keySeen = new Set();
                    let existingKeys = new Set();
                    try {
                        const exist = await contactosService.select({}, { orderBy: 'nombre', ascending: true });
                        existingKeys = new Set((exist || []).map(_claveDedupeContacto));
                    } catch (err) {
                        console.warn('[Contactos] No se pudieron leer contactos existentes para omitir duplicados:', err);
                    }

                    const tryInsert = async (row) => {
                        const k = _claveDedupeContacto(row);
                        if (!k || k === 'id:') return;
                        if (keySeen.has(k) || existingKeys.has(k)) {
                            skipped++;
                            return;
                        }
                        try {
                            await contactosService.insert(row, csrfToken);
                            keySeen.add(k);
                            existingKeys.add(k);
                            imported++;
                        } catch (err) {
                            console.error('Error importando fila:', err);
                        }
                    };

                    const objectRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    if (_isOdooPartnerSheet(objectRows)) {
                        for (const obj of objectRows) {
                            const row = _rowFromOdooExport(obj);
                            if (!row) continue;
                            await tryInsert(row);
                        }
                    } else {
                        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        const lines = json.filter(fila => fila.some(c => c != null && c !== ''));
                        for (let i = 0; i < lines.length; i++) {
                            if (i === 0 && String(lines[i][0] || '').toLowerCase().includes('nombre')) continue;
                            const cols = (lines[i] || []).map(c => (c != null ? String(c) : '').trim());
                            const nombre = cols[0] || '';
                            if (!nombre) continue;
                            const row = {
                                nombre: nombre.toUpperCase(),
                                email: cols[1] || '',
                                telefono: cols[2] || '',
                                empresa: (cols[3] || '').toUpperCase(),
                                rfc: cols[4] || '',
                                tipo: (cols[5] || '').toLowerCase() === 'provider' ? 'provider' : 'client',
                                avatar: nombre.charAt(0).toUpperCase(),
                                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                            await tryInsert(row);
                        }
                    }
                    const msg = skipped
                        ? `✅ ${imported} importados · ${skipped} omitidos (ya en BD o repetidos en el archivo)`
                        : `✅ ${imported} contactos importados desde Excel`;
                    showNotification(msg, 'success');
                } catch (ex) {
                    console.error(ex);
                    showNotification('Error al leer el archivo Excel', 'error');
                }
                e.target.value = '';
                _loadContactos();
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        if (isExcel && typeof XLSX === 'undefined') {
            showNotification('Cargue la librería XLSX para importar Excel, o use CSV.', 'info');
            e.target.value = '';
            return;
        }

        if (isCsv) {
            _handleCSVImport(e);
            return;
        }

        showNotification('Formato no soportado. Use CSV, Excel (.xlsx, .xls) o PDF.', 'info');
        e.target.value = '';
    }

    async function _handleCSVImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target.result;
            const lines = text.split('\n').filter(l => l.trim());
            const csrfToken = sessionStorage.getItem('csrfToken');
            let imported = 0;
            for (let i = 0; i < lines.length; i++) {
                if (i === 0 && lines[0].toLowerCase().includes('nombre')) continue;
                const cols = lines[i].split(',').map(c => c.trim());
                if (cols.length < 1) continue;
                const nombre = cols[0] || '';
                if (!nombre) continue;
                const data = {
                    nombre: nombre.toUpperCase(),
                    email: cols[1] || '',
                    telefono: cols[2] || '',
                    empresa: cols[3] || '',
                    rfc: cols[4] || '',
                    tipo: cols[5]?.toLowerCase() === 'provider' ? 'provider' : 'client',
                    avatar: nombre.charAt(0).toUpperCase(),
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                try {
                    await contactosService.insert(data, csrfToken);
                    imported++;
                } catch (err) {
                    console.error('Error importando fila:', err);
                }
            }
            showNotification(`✅ ${imported} contactos importados`, 'success');
            const fi = document.getElementById('fileInput');
            if (fi) fi.value = '';
        };
        reader.readAsText(file);
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-contact);">CONTACTOS</span><span>${new Date().toLocaleTimeString()}</span></div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        abrirDetalle
    };
})();

window.contactosModule = ContactosModule;