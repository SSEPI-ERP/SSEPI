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
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';

const ContactosModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let contactos = [];
    /** Última lista mostrada (incluye fila sintética de catálogo si aplica). */
    let ultimaVistaFiltrada = [];
    let _ensuringPrioritySuppliers = false;
    let filtroTipo = 'all';
    let busqueda = '';
    let filtroEmpresaKey = '';
    let empresaGrupos = [];
    /** Mejor email/tel/RFC por clave empresa tabulador (rollup vista). */
    let rollupPorEmpresa = new Map();
    let periodo = 'all';
    let vistaActual = 'kanban';
    let contactoSeleccionado = null;

    // Servicios de datos
    const contactosService = createDataService('contactos');

    function _supabase() { return window.supabase; }

    function _normalizarDedupe(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Lookup tabulador Excel → RFC / dirección fiscal en memoria. */
    let _tabuladorEnriquecimiento = null;
    async function _getTabuladorEnriquecimiento() {
        if (_tabuladorEnriquecimiento) return _tabuladorEnriquecimiento;
        const map = new Map();
        const supabase = _supabase();
        if (!supabase) {
            _tabuladorEnriquecimiento = map;
            return map;
        }
        try {
            const { data } = await supabase.from('clientes_tabulador').select('nombre_cliente,rfc,direccion_fiscal,contacto_referencia,km');
            (data || []).forEach((r) => {
                const key = _normalizarDedupe(r.nombre_cliente);
                if (key) map.set(key, r);
            });
        } catch (e) {
            console.warn('[Contactos] clientes_tabulador enriquecimiento:', e?.message || e);
        }
        _tabuladorEnriquecimiento = map;
        return map;
    }

    function _aplicarEnriquecimientoTabulador(c, tabMap) {
        if (!tabMap || !tabMap.size) return c;
        const keys = [
            _normalizarDedupe(c.empresa_tabulador),
            _normalizarDedupe(c.empresa),
            _normalizarDedupe(c.nombre),
        ].filter(Boolean);
        let row = null;
        for (const k of keys) {
            if (tabMap.has(k)) { row = tabMap.get(k); break; }
        }
        if (!row) return c;
        return {
            ...c,
            rfc: (c.rfc || row.rfc || '').trim(),
            direccion: (c.direccion || row.direccion_fiscal || '').trim(),
            puesto: c.puesto || row.contacto_referencia || c.puesto,
            km: c.km ?? row.km,
        };
    }

    /** Evita duplicar la misma persona al fusionar `clientes` con `contactos` (misma clave = una sola fila). */
    function _claveDedupeContacto(c) {
        if (c.odoo_captura_id != null && String(c.odoo_captura_id).trim() !== '') {
            return 'odoo:' + String(c.odoo_captura_id).trim();
        }
        const email = (c.email || '').toString().toLowerCase().trim();
        const nom = _normalizarDedupe(c.nombre);
        const emp = _normalizarDedupe(c.empresa);
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

    /** Caracteres "basura" al inicio de un nombre OCR (— em-dash, comillas, simbolos varios) */
    const _OCR_NOISE_START = /^[A-Z]\s|^[)\]}\-_,.;:!?¡¿'"`~\\\/—–]|^[A-Z]{1,2}\s[A-Z]/;

    /** Clave de grupo empresa (Pac_Contactos: solo ficha empresa o vendedor bajo empresa). */
    function _empresaGrupoKey(c) {
        if (!c) return '';
        const tipo = c.tipo_ficha || '';
        if (tipo === 'empresa' || c.categoria === 'empresa') {
            // Prioridad 1: empresa_tabulador (vinculacion Pac_Contactos)
            if (c.empresa_tabulador && String(c.empresa_tabulador).trim()) {
                return _normalizarDedupe(c.empresa_tabulador);
            }
            // Prioridad 2: nombre solo si NO es OCR basura (sin simbolos sueltos al inicio)
            const nom = (c.nombre || '').trim();
            if (nom && !_OCR_NOISE_START.test(nom) && nom.length >= 3) {
                return _normalizarDedupe(nom);
            }
            // Sin tabulador y nombre OCR: no agrupar (queda en vista plana)
            return '';
        }
        if (tipo === 'contacto_empresa') {
            // Prioridad 1: empresa_tabulador (vinculacion Pac_Contactos)
            if (c.empresa_tabulador && String(c.empresa_tabulador).trim()) {
                return _normalizarDedupe(c.empresa_tabulador);
            }
            // Prioridad 2: c.empresa solo si NO es OCR basura
            const base = (c.empresa || '').trim();
            if (!base || _OCR_NOISE_START.test(base) || base.length < 3) return '';
            const nomEmp = _normalizarDedupe(c.nombre);
            const keyEmp = _normalizarDedupe(base);
            if (nomEmp && nomEmp === keyEmp) return '';
            return keyEmp;
        }
        return '';
    }

    function _labelEmpresaGrupo(key, fallback) {
        const g = empresaGrupos.find(x => x.key === key);
        if (g) return g.label;
        return (fallback || key || '').toUpperCase();
    }

    function _escHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function _buildRollupPorEmpresa() {
        rollupPorEmpresa = new Map();
        const acc = (key, c) => {
            if (!key) return;
            if (!rollupPorEmpresa.has(key)) {
                rollupPorEmpresa.set(key, { email: '', telefono: '', rfc: '', direccion: '', puesto: '' });
            }
            const r = rollupPorEmpresa.get(key);
            if (!r.email && c.email) r.email = String(c.email).trim();
            if (!r.telefono && c.telefono) r.telefono = String(c.telefono).trim();
            if (!r.rfc && c.rfc) r.rfc = String(c.rfc).trim();
            if (!r.direccion && c.direccion) r.direccion = String(c.direccion).trim();
            if (!r.puesto && c.puesto) r.puesto = String(c.puesto).trim();
        };
        for (const c of contactos) {
            if (!c.email && !c.telefono && !c.rfc && !c.direccion) continue;
            for (const raw of [c.empresa_tabulador, c.empresa, c.nombre]) {
                if (!raw) continue;
                acc(_normalizarDedupe(raw), c);
            }
        }
    }

    /** Muestra email/tel de vendedores Odoo en la ficha corta del tabulador. */
    function _contactoParaVista(c) {
        if (!c) return c;
        if (c.email && c.telefono) return c;
        const keys = [];
        if (c.empresa_tabulador) keys.push(_normalizarDedupe(c.empresa_tabulador));
        if (c.empresa) keys.push(_normalizarDedupe(c.empresa));
        if (c.tipo_ficha === 'empresa' || c.categoria === 'empresa') {
            if (c.nombre) keys.push(_normalizarDedupe(c.nombre));
        }
        let rollup = null;
        for (const k of keys) {
            if (rollupPorEmpresa.has(k)) {
                rollup = rollupPorEmpresa.get(k);
                break;
            }
        }
        if (!rollup) return c;
        return {
            ...c,
            email: c.email || rollup.email || '',
            telefono: c.telefono || rollup.telefono || '',
            rfc: c.rfc || rollup.rfc || '',
            direccion: c.direccion || rollup.direccion || '',
            puesto: c.puesto || rollup.puesto || '',
        };
    }

    function _badgeMatchScore(score) {
        const n = Number(score);
        if (!n || n !== n) return '';
        const cls = n >= 90 ? 'match-ok' : (n >= 70 ? 'match-med' : 'match-low');
        return `<span class="contact-badge ${cls}">${Math.round(n)}%</span>`;
    }

    function _badgeTipoFicha(tipo) {
        const m = {
            empresa: ['tf-empresa', 'Empresa (dirección)'],
            contacto_empresa: ['tf-vendedor', 'Vendedor → empresa'],
            contacto_solo: ['tf-solo', 'Contacto solo'],
        };
        const [cls, label] = m[tipo] || ['tf-solo', tipo || 'Contacto'];
        return `<span class="contact-badge ${cls}">${label}</span>`;
    }

    function _metaLineaContacto(c) {
        const parts = [];
        if (c.puesto) parts.push(_escHtml(c.puesto));
        if (c.empresa_tabulador && c.tipo_ficha === 'contacto_empresa') {
            parts.push(`<span class="contact-empresa-link">empresa: ${_escHtml(c.empresa_tabulador)}</span>`);
        }
        return parts.length ? `<p class="contact-meta">${parts.join(' · ')}</p>` : '';
    }

    function _buildEmpresaGrupos() {
        const map = new Map();
        for (const c of contactos) {
            const key = _empresaGrupoKey(c);
            if (!key) continue;
            if (!map.has(key)) {
                map.set(key, { key, label: '', vendedores: 0, empresaId: null, tieneFicha: false });
            }
            const g = map.get(key);
            const tipo = c.tipo_ficha || '';
            if (tipo === 'empresa' || c.categoria === 'empresa') {
                g.empresaId = c.id;
                g.tieneFicha = true;
                // Label: priorizar empresa_tabulador (validado por Pac) sobre nombre OCR
                const nomOCR = c.nombre && !_OCR_NOISE_START.test(c.nombre) ? c.nombre : '';
                g.label = (c.empresa_tabulador || c.empresa || nomOCR || key).toUpperCase();
            } else if (tipo === 'contacto_empresa') {
                g.vendedores++;
                if (!g.label) g.label = (c.empresa_tabulador || c.empresa || key).toUpperCase();
            }
        }
        for (const g of map.values()) {
            if (!g.label) g.label = g.key.toUpperCase();
        }
        return Array.from(map.values()).sort((a, b) => {
            const dv = (b.vendedores || 0) - (a.vendedores || 0);
            if (dv !== 0) return dv;
            return a.label.localeCompare(b.label, 'es');
        });
    }

    function _perteneceAEmpresa(c, empresaKey) {
        if (!empresaKey) return true;
        const g = empresaGrupos.find(x => x.key === empresaKey);
        if (g && g.empresaId && c.empresa_padre_id === g.empresaId) return true;
        const key = _empresaGrupoKey(c);
        if (key === empresaKey) return true;
        if ((c.tipo_ficha === 'empresa' || c.categoria === 'empresa') && _normalizarDedupe(c.nombre) === empresaKey) return true;
        return false;
    }

    function _populateEmpresaSelect() {
        const sel = document.getElementById('filtroEmpresa');
        if (!sel) return;
        const cur = filtroEmpresaKey;
        let list = empresaGrupos;
        if (busqueda) {
            const q = busqueda;
            list = list.filter(g => {
                if (g.label.toLowerCase().includes(q)) return true;
                return contactos.some(c =>
                    _perteneceAEmpresa(c, g.key) && (
                        (c.nombre && c.nombre.toLowerCase().includes(q)) ||
                        (c.email && c.email.toLowerCase().includes(q)) ||
                        (c.puesto && c.puesto.toLowerCase().includes(q))
                    )
                );
            });
        }
        sel.innerHTML = '<option value="">— Todas las empresas —</option>' +
            list.map(g => {
                const nv = g.vendedores || 0;
                const extra = nv ? ` · ${nv} vendedor${nv !== 1 ? 'es' : ''}` : '';
                return `<option value="${g.key}">${g.label}${extra}</option>`;
            }).join('');
        if (cur && list.some(g => g.key === cur)) sel.value = cur;
        else if (cur) {
            sel.value = '';
            filtroEmpresaKey = '';
        }
    }

    function _rebuildEmpresaGrupos() {
        empresaGrupos = _buildEmpresaGrupos();
        _populateEmpresaSelect();
    }

    function _renderEmpresaFiltroHint(filtered) {
        const el = document.getElementById('empresaFiltroHint');
        if (!el) return;
        if (!filtroEmpresaKey) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const g = empresaGrupos.find(x => x.key === filtroEmpresaKey);
        const vend = filtered.filter(c => c.tipo_ficha === 'contacto_empresa').length;
        const label = g ? g.label : filtroEmpresaKey;
        const vendTxt = vend ? ` · ${vend} vendedor${vend !== 1 ? 'es' : ''}` : '';
        el.style.display = 'block';
        el.innerHTML = `<i class="fas fa-building"></i> <strong>${label}</strong> — ${filtered.length} contacto(s) mostrado(s)${vendTxt}. <span style="opacity:0.85">Incluye ficha empresa y personas vinculadas.</span>`;
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
        _initExportButton();
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'nombre', label: 'Nombre' },
                    { key: 'empresa', label: 'Empresa' },
                    { key: 'tipo', label: 'Tipo' },
                    { key: 'email', label: 'Email' },
                    { key: 'telefono', label: 'Teléfono' }
                ];
                downloadCSV('contactos_' + new Date().toISOString().slice(0,10) + '.csv', contactos, headers);
            });
        } catch (e) { console.warn('[Contactos] Export CSV init:', e); }
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
            _populateEmpresaSelect();
            _renderView();
        });

        if (byId('filtroEmpresa')) byId('filtroEmpresa').addEventListener('change', function(e) {
            filtroEmpresaKey = e.target.value || '';
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
        if (byId('panelNombre')) byId('panelNombre').addEventListener('input', _updateAvatarPreview);

        // Delegación de clicks para kanban y lista (sin inline onclick — CSP-safe)
        const kanbanContainer = document.getElementById('kanbanContainer');
        if (kanbanContainer) {
            kanbanContainer.addEventListener('click', function(e) {
                const card = e.target.closest('.contact-card');
                if (card) {
                    const id = card.dataset.id;
                    if (id) abrirDetalle(id);
                }
            });
        }
        const listTableBody = document.getElementById('listTableBody');
        if (listTableBody) {
            listTableBody.addEventListener('click', function(e) {
                const row = e.target.closest('tr[data-id]');
                if (row) {
                    const id = row.dataset.id;
                    if (id) abrirDetalle(id);
                }
            });
        }
        const sidePanel = document.getElementById('sidePanel');
        if (sidePanel) {
            sidePanel.addEventListener('click', function(e) {
                const row = e.target.closest('.related-person-row');
                if (row) {
                    const id = row.dataset.id;
                    if (id) abrirDetalle(id);
                }
            });
        }
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
        let rawContactos = [];
        try {
            rawContactos = await contactosService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 3000 }) || [];
        } catch (e) {
            console.warn('[Contactos] Error cargando contactos:', e?.message || e);
        }

        console.log('[Contactos] local_contactos devueltos:', rawContactos.length);
        const tabMap = await _getTabuladorEnriquecimiento();
        // Solo contactos reales en BD — tabulador es tabla aparte (calculadoras/taller)
        const vistos = new Set();
        contactos = rawContactos.filter(c => {
            // Descartar filas vacías / sin identidad usable
            if (!c.nombre && !c.empresa && !c.email && !c.telefono) return false;
            const k = _claveDedupeContacto(c);
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        }).map((c) => _aplicarEnriquecimientoTabulador(c, tabMap));
        console.log('[Contactos] Total después de dedupe:', contactos.length);
        _buildRollupPorEmpresa();
        _rebuildEmpresaGrupos();
        // Proveedores de catálogo PRIORITY desactivados — solo contactos reales
        // if (!skipPriorityEnsure && !_ensuringPrioritySuppliers) {
        //     _ensuringPrioritySuppliers = true;
        //     try { await _ensurePrioritySuppliers(); } catch (e) { console.warn('[Contactos] Proveedores prioridad:', e?.message || e); } finally { _ensuringPrioritySuppliers = false; }
        // }
        _renderView();
        _updateKPIs();
    }

    async function _ensurePrioritySuppliers() {
        const base = contactos.filter(c => (c.tipo === 'provider' || c.tipo === 'proveedor') && c.sitio_web && !c._fromClientes);
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
        } else if (filtroTipo === 'client') {
            filtered = filtered.filter(c => c.tipo === 'client' || c.tipo === 'cliente');
        } else if (filtroTipo !== 'all') {
            filtered = filtered.filter(c => c.tipo === filtroTipo);
        }
        if (busqueda) {
            const q = busqueda;
            filtered = filtered.filter(c =>
                (c.nombre && c.nombre.toLowerCase().includes(q)) ||
                (c.email && c.email.toLowerCase().includes(q)) ||
                (c.rfc && c.rfc.toLowerCase().includes(q)) ||
                (Array.isArray(c.etiquetas) ? c.etiquetas.some(function(t) { return String(t).toLowerCase().includes(q); }) : (c.etiquetas && String(c.etiquetas).toLowerCase().includes(q))) ||
                (c.empresa && c.empresa.toLowerCase().includes(q)) ||
                (c.sitio_web && c.sitio_web.toLowerCase().includes(q)) ||
                (c.puesto && c.puesto.toLowerCase().includes(q))
            );
        }
        if (periodo !== 'all') {
            const now = new Date();
            filtered = filtered.filter(c => {
                if (c._isCatalogPreset) return true;
                if (!c.created_at) return (c.tipo === 'provider' || c.tipo === 'proveedor');
                const fecha = new Date(c.created_at);
                if (periodo === 'month') return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
                if (periodo === 'year') return fecha.getFullYear() === now.getFullYear();
                return true;
            });
        }

        if (filtroEmpresaKey) {
            filtered = filtered.filter(c => _perteneceAEmpresa(c, filtroEmpresaKey));
        }

        _renderEmpresaFiltroHint(filtered);

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
        container.innerHTML = contacts.map(raw => {
            const c = _contactoParaVista(raw);
            const inicial = (c.nombre || '?').charAt(0).toUpperCase();
            const estiloAvatar = c.logo_url
                ? `background-image: url('${_escHtml(c.logo_url)}'); background-size: cover; background-position: center;`
                : `background: linear-gradient(135deg, ${c.color || '#00a09d'}, ${c.color || '#008a87'});`;
            const tipoClass = (c.tipo === 'client' || c.tipo === 'cliente') ? 'client' : 'provider';
            const tipoText = (c.tipo === 'client' || c.tipo === 'cliente') ? 'CLIENTE' : 'PROVEEDOR';
            const catClass = (c.categoria === 'empresa' || c.tipo_ficha === 'empresa') ? 'empresa' : 'persona';
            const catText = catClass === 'empresa' ? 'EMPRESA' : 'PERSONA';
            const tipoFicha = c.tipo_ficha || (catClass === 'empresa' ? 'empresa' : '');
            const badgesTop = tipoFicha ? _badgeTipoFicha(tipoFicha) : '';
            const matchBadge = _badgeMatchScore(c.match_score);
            const odooId = c.odoo_captura_id ? `<span class="contact-odoo-id">#${_escHtml(c.odoo_captura_id)}</span>` : '';
            const emailLine = c.email
                ? `<p class="contact-email"><i class="fas fa-envelope"></i> ${_escHtml(c.email)}</p>`
                : `<p class="contact-muted" title="Sin email en Pac_Contactos / Odoo / tabulador${c.fuente ? ' (fuente actual: ' + _escHtml(c.fuente) + ')' : ''}"><i class="fas fa-envelope"></i> Sin email disponible</p>`;
            const telLine = c.telefono
                ? `<p><i class="fas fa-phone-alt"></i> ${_escHtml(c.telefono)}</p>`
                : `<p class="contact-muted" title="Sin telefono en Pac_Contactos / Odoo / tabulador${c.fuente ? ' (fuente actual: ' + _escHtml(c.fuente) + ')' : ''}"><i class="fas fa-phone-alt"></i> Sin telefono disponible</p>`;
            const empresaShow = c.empresa_tabulador || c.empresa || '';
            return `
                <div class="contact-card" data-id="${c.id}">
                    <div class="avatar-box" style="${estiloAvatar}">${c.logo_url ? '' : inicial}</div>
                    <div class="info">
                        <div class="contact-card-tags">${badgesTop}${matchBadge}${odooId}</div>
                        <h3>${_escHtml(c.nombre || 'Sin nombre')}</h3>
                        ${_metaLineaContacto(c)}
                        ${emailLine}
                        ${telLine}
                        <p><i class="fas fa-building"></i> ${_escHtml(empresaShow || '—')}</p>
                        <div class="contact-card-badges">
                            <span class="badge ${catClass}">${catText}</span>
                            <span class="badge ${tipoClass}">${tipoText}</span>
                        </div>
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

        tbody.innerHTML = contacts.map(raw => {
            const c = _contactoParaVista(raw);
            const tipoClass = (c.tipo === 'client' || c.tipo === 'cliente') ? 'client' : 'provider';
            const tipoText = (c.tipo === 'client' || c.tipo === 'cliente') ? 'Cliente' : 'Proveedor';
            const catClass = (c.categoria === 'empresa') ? 'empresa' : 'persona';
            const catText = (c.categoria === 'empresa') ? 'Empresa' : 'Persona';
            const avatarHtml = c.logo_url
                ? `<img src="${c.logo_url}" class="list-avatar-img" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;">`
                : `<span class="list-avatar-letter" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${c.color || '#00a09d'},${c.color || '#008a87'});color:#fff;font-size:12px;font-weight:700;vertical-align:middle;margin-right:8px;">${(c.nombre || '?').charAt(0).toUpperCase()}</span>`;
            return `
            <tr data-id="${c.id}">
                <td>${avatarHtml}<strong>${c.nombre || ''}</strong></td>
                <td>${c.empresa_tabulador ? '<span title="Tabulador">' + c.empresa_tabulador + '</span>' : (c.empresa || '')}</td>
                <td>${c.email || ''}</td>
                <td>${c.telefono || ''}</td>
                <td>${c.rfc || ''}</td>
                <td><span class="badge ${catClass}">${catText}</span></td>
                <td><span class="badge ${tipoClass}">${tipoText}</span></td>
            </tr>
        `;
        }).join('');
    }

    async function _updateKPIs() {
        const total = contactos.length;
        const clientes = contactos.filter(c => c.tipo === 'client' || c.tipo === 'cliente').length;
        const proveedores = contactos.filter(c => c.tipo === 'provider' || c.tipo === 'proveedor').length;
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
        _renderDatosFaltantes();
    }

    /**
     * Sección "Datos faltantes": fichas sin email/tel/RFC.
     * Muestra un botón "Buscar en Google" que abre una búsqueda con RFC + nombre.
     * La persona decide si el dato es válido y lo pega en la ficha.
     */
    function _renderDatosFaltantes() {
        const sec = document.getElementById('datosFaltantesSection');
        const listEl = document.getElementById('datosFaltantesList');
        const countEl = document.getElementById('datosFaltantesCount');
        if (!sec || !listEl) return;

        const fEmail = document.getElementById('datosFaltantesFiltroEmail')?.checked !== false;
        const fTel = document.getElementById('datosFaltantesFiltroTel')?.checked !== false;
        const fRfc = document.getElementById('datosFaltantesFiltroRfc')?.checked !== false;
        if (!fEmail && !fTel && !fRfc) { sec.style.display = 'none'; return; }

        const faltantes = contactos.filter(c => {
            if (!c || c._isCatalogPreset) return false;
            const noEmail = !c.email || !String(c.email).trim();
            const noTel = !c.telefono || !String(c.telefono).trim();
            const noRfc = !c.rfc || !String(c.rfc).trim();
            return (fEmail && noEmail) || (fTel && noTel) || (fRfc && noRfc);
        });

        if (!faltantes.length) {
            sec.style.display = 'none';
            return;
        }
        sec.style.display = '';
        if (countEl) countEl.textContent = `(${faltantes.length})`;

        faltantes.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
        listEl.innerHTML = faltantes.map(c => {
            const emp = c.empresa_tabulador || c.empresa || '';
            const rfc = c.rfc || '';
            const inicial = (c.nombre || '?').charAt(0).toUpperCase();
            const colorBg = c.color || '#888';
            const queryParts = [c.nombre, emp, rfc].filter(Boolean).join(' ');
            const queryEnc = encodeURIComponent(queryParts + ' contacto email telefono');
            const googleUrl = `https://www.google.com/search?q=${queryEnc}`;
            const fuenteLabel = c.fuente ? `fuente: ${_escHtml(c.fuente)}` : '';
            return `
                <div class="datos-faltantes-row" data-id="${_escHtml(c.id)}">
                    <div class="datos-faltantes-avatar" style="background:${colorBg}">${inicial}</div>
                    <div class="datos-faltantes-info">
                        <strong>${_escHtml(c.nombre || '(sin nombre)')}</strong>
                        <span class="datos-faltantes-emp">${_escHtml(emp)}</span>
                        <span class="datos-faltantes-faltante">
                            ${!c.email ? '<i class="fas fa-envelope"></i> sin email' : ''}
                            ${!c.telefono ? '<i class="fas fa-phone-alt"></i> sin tel' : ''}
                            ${!c.rfc ? '<i class="fas fa-id-card"></i> sin RFC' : ''}
                        </span>
                        ${rfc ? `<span class="datos-faltantes-rfc">RFC: ${_escHtml(rfc)}</span>` : ''}
                        ${fuenteLabel ? `<span class="datos-faltantes-fuente">${fuenteLabel}</span>` : ''}
                    </div>
                    <div class="datos-faltantes-actions">
                        <button type="button" class="btn-ssepi btn-taller btn-buscar-google" data-url="${googleUrl}">
                            <i class="fab fa-google"></i> Buscar en Google
                        </button>
                        <button type="button" class="btn-ssepi btn-taller btn-abrir-ficha" data-id="${_escHtml(c.id)}">
                            <i class="fas fa-pen"></i> Editar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (!listEl.dataset.bound) {
            listEl.dataset.bound = '1';
            listEl.addEventListener('click', function(ev) {
                const btnGoogle = ev.target.closest('.btn-buscar-google');
                if (btnGoogle) {
                    const url = btnGoogle.getAttribute('data-url');
                    if (url) window.open(url, '_blank', 'noopener');
                    return;
                }
                const btnEdit = ev.target.closest('.btn-abrir-ficha');
                if (btnEdit) {
                    const id = btnEdit.getAttribute('data-id');
                    if (id) abrirDetalle(id);
                }
            });
        }

        // Re-bind de los filtros (solo una vez)
        ['datosFaltantesFiltroEmail', 'datosFaltantesFiltroTel', 'datosFaltantesFiltroRfc'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('change', _renderDatosFaltantes);
            }
        });
    }

    // ==================== PANEL DE DETALLE ====================
    async function abrirDetalle(id) {
        const sid = String(id);
        const raw = ultimaVistaFiltrada.find(c => String(c.id) === sid) || contactos.find(c => String(c.id) === sid);
        if (!raw) return;
        const contacto = _contactoParaVista(raw);
        contactoSeleccionado = contacto;
        const backdrop = document.getElementById('backdrop');
        const sidePanel = document.getElementById('sidePanel');
        if (backdrop) backdrop.style.display = 'block';
        if (sidePanel) sidePanel.classList.add('open');

        const panelNombre = document.getElementById('panelNombre');
        const panelEmpresa = document.getElementById('panelEmpresa');
        if (panelNombre) panelNombre.value = contacto.nombre || '';
        if (panelEmpresa) panelEmpresa.value = contacto.empresa || contacto.empresa_tabulador || '';
        _updateAvatarFromContact(contacto);

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        setVal('panelId', contacto.id);
        setVal('panelPuesto', contacto.puesto);
        setVal('panelTelefono', contacto.telefono);
        setVal('panelEmail', contacto.email);
        setVal('panelRfc', contacto.rfc);
        setVal('panelDireccion', contacto.direccion);
        setVal('panelSitio', contacto.sitio_web);
        const catPanel = contacto.categoria || (contacto.tipo_ficha === 'empresa' ? 'empresa' : 'persona');
        setVal('panelCategoria', catPanel);
        setVal('panelTipo', contacto.tipo || 'client');
        setVal('panelEtiquetas', contacto.etiquetas);
        setVal('panelLogoUrl', contacto.logo_url);

        const existingErp = document.getElementById('panelErpMaestro');
        if (existingErp) existingErp.remove();
        const existingAdeudo = document.getElementById('panelAdeudoLink');
        if (existingAdeudo) existingAdeudo.remove();

        if (contacto.empresa_tabulador || contacto.tipo_ficha) {
            const tab = contacto.empresa_tabulador || '—';
            const tipo = contacto.tipo_ficha || '—';
            let adeudoHtml = '';
            const adeudo = Number(contacto.adeudo_acumulado) || 0;
            if (adeudo > 0) {
                adeudoHtml = `<div id="panelAdeudoLink" class="detail-section" style="margin-top:10px;padding:10px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;">
                    <strong style="color:#9a3412;"><i class="fas fa-exclamation-triangle"></i> Adeudo acumulado: $${adeudo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                    <p style="font-size:12px;color:#7c2d12;margin:6px 0 0;">Ver detalle en módulo Ventas / Contabilidad.</p>
                </div>`;
            }
            const erpSection = `
                <div class="detail-section" id="panelErpMaestro">
                    <h4 style="color: var(--accent-primary); margin-bottom: 8px;"><i class="fas fa-link"></i> Empresa tabulador (ERP)</h4>
                    <p style="margin:0;font-size:14px;"><strong>${tab}</strong> <span class="badge empresa" style="margin-left:6px;">${tipo}</span></p>
                    ${contacto.match_score ? '<p style="font-size:12px;color:#666;margin:4px 0 0;">Confianza cruce: ' + contacto.match_score + '%</p>' : ''}
                </div>${adeudoHtml}`;
            const timelineSection = document.getElementById('timelineContainer');
            if (timelineSection && timelineSection.parentElement) {
                timelineSection.parentElement.insertAdjacentHTML('beforebegin', erpSection);
            }
        }

        // Mostrar personas de la empresa si es empresa
        const existingRelated = document.getElementById('panelRelatedPeople');
        if (existingRelated) existingRelated.remove();
        const empresaBuscar = contacto.empresa_tabulador || contacto.empresa || contacto.nombre;
        if (contacto.categoria === 'empresa' || contacto.tipo_ficha === 'empresa' || contacto.empresa_tabulador) {
            const related = contactos.filter(c =>
                c.id !== contacto.id &&
                (c.empresa_padre_id === contacto.id ||
                    c.tipo_ficha === 'contacto_empresa' && (
                        (c.empresa_tabulador || c.empresa || '').toLowerCase().trim() === String(empresaBuscar).toLowerCase().trim()
                    ) ||
                    (c.categoria !== 'empresa' && (c.empresa === empresaBuscar || c.empresa === contacto.nombre))
                ))
            ;
            if (related.length > 0) {
                const relatedHtml = related.map(r => {
                    const avatar = r.logo_url
                        ? `<img src="${r.logo_url}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;">`
                        : `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,${r.color || '#00a09d'},${r.color || '#008a87'});color:#fff;font-size:11px;font-weight:700;vertical-align:middle;margin-right:6px;">${(r.nombre || '?').charAt(0).toUpperCase()}</span>`;
                    const tags = _badgeTipoFicha(r.tipo_ficha || 'contacto_empresa') + _badgeMatchScore(r.match_score);
                    const email = r.email ? `<span style="display:block;font-size:12px;color:#666;">${_escHtml(r.email)}</span>` : '';
                    const odoo = r.odoo_captura_id ? `<span style="font-size:11px;color:#999;">#${_escHtml(r.odoo_captura_id)}</span>` : '';
                    return `<div class="related-person-row" data-id="${r.id}" style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05);cursor:pointer;">${avatar}<div style="display:inline-block;vertical-align:top;max-width:calc(100% - 36px);"><div style="margin-bottom:4px;">${tags}</div><strong>${_escHtml(r.nombre)}</strong> <span style="color:#888;font-size:12px;">${_escHtml(r.puesto || '')}</span>${email}${odoo ? `<span style="margin-left:6px;">${odoo}</span>` : ''}</div></div>`;
                }).join('');
                const sectionHtml = `
                    <div class="detail-section" id="panelRelatedPeople">
                        <h4 style="color: var(--accent-primary); margin-bottom: 10px;"><i class="fas fa-users"></i> Personas en esta empresa (${related.length})</h4>
                        <div style="max-height:160px;overflow-y:auto;">${relatedHtml}</div>
                    </div>
                `;
                const timelineSection = document.getElementById('timelineContainer');
                if (timelineSection && timelineSection.parentElement) {
                    timelineSection.parentElement.insertAdjacentHTML('beforebegin', sectionHtml);
                }
            }
        }

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
        const logoUrl = document.getElementById('panelLogoUrl')?.value;
        const avatarDiv = document.getElementById('panelAvatar');
        if (!avatarDiv) return;
        if (logoUrl) {
            avatarDiv.style.background = `url('${logoUrl}') center / cover no-repeat`;
            avatarDiv.innerHTML = '';
            return;
        }
        const nombreInput = document.getElementById('panelNombre')?.value?.trim();
        const base = nombreInput || contactoSeleccionado?.nombre || '?';
        const color = contactoSeleccionado?.color || '#00a09d';
        const inicial = base.charAt(0).toUpperCase();
        avatarDiv.style.background = `linear-gradient(135deg, ${color}, ${color})`;
        avatarDiv.innerHTML = inicial;
    }

    async function _updateContactData() {
        const id = document.getElementById('panelId').value;
        if (String(id).indexOf('__prio_') === 0) {
            showNotification('Proveedor de catálogo: cree un contacto nuevo para guardar en la base.', 'error');
            return;
        }
        const nombreRaw = document.getElementById('panelNombre')?.value?.trim() || '';
        const empresaRaw = document.getElementById('panelEmpresa')?.value?.trim() || '';
        if (!nombreRaw && !empresaRaw) {
            showNotification('Indique al menos nombre o empresa', 'error');
            return;
        }
        const updatedData = {
            nombre: (nombreRaw || empresaRaw).toUpperCase(),
            empresa: empresaRaw.toUpperCase(),
            puesto: document.getElementById('panelPuesto').value.trim() || '',
            telefono: document.getElementById('panelTelefono').value.trim() || '',
            email: document.getElementById('panelEmail').value.trim() || '',
            rfc: document.getElementById('panelRfc').value.trim() || '',
            sitio_web: document.getElementById('panelSitio').value.trim() || '',
            categoria: document.getElementById('panelCategoria').value || 'persona',
            tipo: document.getElementById('panelTipo').value || 'client',
            etiquetas: document.getElementById('panelEtiquetas').value.trim() || '',
            direccion: document.getElementById('panelDireccion').value.trim() || '',
            logo_url: document.getElementById('panelLogoUrl').value.trim() || '',
            avatar: (nombreRaw || empresaRaw).charAt(0).toUpperCase(),
            updated_at: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await contactosService.update(id, updatedData, csrfToken);
            const idx = contactos.findIndex(c => String(c.id) === String(id));
            if (idx >= 0) Object.assign(contactos[idx], updatedData);
            if (contactoSeleccionado && String(contactoSeleccionado.id) === String(id)) {
                Object.assign(contactoSeleccionado, updatedData);
            }
            _rebuildEmpresaGrupos();
            _renderView();
            _renderDatosFaltantes();
            _updateAvatarFromContact(contactoSeleccionado || updatedData);
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
            if (error) {
                if (String(error.message || '').includes('Tabla no existe')) {
                    container.innerHTML = '<div class="empty-timeline">Timeline no disponible en modo local</div>';
                    return;
                }
                throw error;
            }
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
            categoria: document.getElementById('inputCategoria')?.value || 'persona',
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

    function _isTabuladorCotizacionSheet(rows) {
        if (!rows || !rows.length) return false;
        const keys = Object.keys(rows[0] || {}).map((k) => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
        return keys.some((k) => k.includes('empresa')) && keys.some((k) => k.includes('rfc') || k.includes('direccion'));
    }

    function _pickCol(obj, patterns) {
        for (const [k, v] of Object.entries(obj || {})) {
            const kl = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (patterns.some((p) => kl.includes(p))) return String(v != null ? v : '').trim();
        }
        return '';
    }

    function _rowFromTabuladorSheet(obj) {
        const empresa = (_pickCol(obj, ['empresa', 'cliente']) || '').toUpperCase();
        if (!empresa || empresa === 'EMPRESA') return null;
        const rfc = _pickCol(obj, ['rfc']).toUpperCase();
        const direccion = _pickCol(obj, ['direccion fiscal', 'direccion', 'domicilio']);
        const contactoRef = _pickCol(obj, ['contacto', 'puesto', 'referencia']);
        return {
            nombre: empresa,
            empresa,
            empresa_tabulador: empresa,
            tipo_ficha: 'empresa',
            categoria: 'empresa',
            tipo: 'client',
            rfc,
            direccion,
            puesto: contactoRef,
            email: '',
            telefono: '',
            avatar: empresa.charAt(0),
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            etiquetas: ['tabulador_excel_import'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    function _claveEmpresaTabulador(row) {
        return 'emp:' + _normalizarDedupe(row.empresa || row.nombre);
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
                    let updated = 0;
                    let skipped = 0;
                    const keySeen = new Set();
                    let existingKeys = new Set();
                    let existList = [];
                    try {
                        existList = await contactosService.select({}, { orderBy: 'nombre', ascending: true }) || [];
                        existingKeys = new Set(existList.map(_claveDedupeContacto));
                    } catch (err) {
                        console.warn('[Contactos] No se pudieron leer contactos existentes para omitir duplicados:', err);
                    }

                    const tryInsert = async (row, opts) => {
                        const isTabuladorEmpresa = opts && opts.tabuladorEmpresa;
                        const k = isTabuladorEmpresa ? _claveEmpresaTabulador(row) : _claveDedupeContacto(row);
                        if (!k || k === 'id:' || k === 'emp:') return;
                        if (keySeen.has(k)) { skipped++; return; }

                        const empKey = _normalizarDedupe(row.empresa || row.nombre);
                        const existing = existList.find((c) => {
                            const ck = _normalizarDedupe(c.empresa_tabulador || c.empresa || c.nombre);
                            return ck && ck === empKey;
                        });

                        if (existing) {
                            const patch = {
                                ...existing,
                                rfc: (row.rfc || existing.rfc || '').trim(),
                                direccion: (row.direccion || existing.direccion || '').trim(),
                                puesto: row.puesto || existing.puesto,
                                empresa_tabulador: existing.empresa_tabulador || row.empresa_tabulador || row.empresa,
                                updated_at: new Date().toISOString(),
                            };
                            if (isTabuladorEmpresa) {
                                patch.tipo_ficha = patch.tipo_ficha || 'empresa';
                                patch.categoria = patch.categoria || 'empresa';
                            }
                            if (patch.rfc !== existing.rfc || patch.direccion !== existing.direccion) {
                                try {
                                    await contactosService.update(existing.id, patch, csrfToken);
                                    updated++;
                                    keySeen.add(k);
                                } catch (err) {
                                    console.error('Error actualizando fila:', err);
                                }
                            } else {
                                skipped++;
                            }
                            return;
                        }

                        if (existingKeys.has(k)) { skipped++; return; }
                        try {
                            await contactosService.insert(row, csrfToken);
                            keySeen.add(k);
                            existingKeys.add(k);
                            existList.push(row);
                            imported++;
                        } catch (err) {
                            console.error('Error importando fila:', err);
                        }
                    };

                    const objectRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    if (_isTabuladorCotizacionSheet(objectRows)) {
                        for (const obj of objectRows) {
                            const row = _rowFromTabuladorSheet(obj);
                            if (!row) continue;
                            await tryInsert(row, { tabuladorEmpresa: true });
                        }
                    } else if (_isOdooPartnerSheet(objectRows)) {
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
                    const msg = updated
                        ? `✅ ${imported} nuevos · ${updated} actualizados (RFC/dirección) · ${skipped} sin cambios`
                        : skipped
                            ? `✅ ${imported} importados · ${skipped} omitidos (ya en BD o repetidos en el archivo)`
                            : `✅ ${imported} contactos importados desde Excel`;
                    _tabuladorEnriquecimiento = null;
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