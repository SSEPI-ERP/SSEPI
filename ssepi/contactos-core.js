// contactos-core.js - Cerebro Inteligente Ironclad V16
// Adaptado para el nuevo flujo con separación clara de clientes y proveedores

const ContactosManager = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let c_a = [];               // contactos desde Firestore
    let f_c = 'all';           // filtro tipo (all, client, provider)
    let s_t = '';             // término de búsqueda
    let v_m = 'kanban';       // modo vista: kanban / list
    let p_periodo = 'all';     // filtro de período
    let u_ = null;            // unsubscribe de Firestore
    let c_ = null;            // contacto seleccionado

    // ==========================================================================
    // 2. BASE DE DATOS COMPLETA (54 CONTACTOS REALES)
    // ==========================================================================
    const _CONTACTOS_COMPLETOS = [
        {
            nombre: 'Anguiplast, S.A. de C.V.',
            empresa: 'Anguiplast, S.A. de C.V.',
            puesto: '',
            telefono: '+52 348 784 6573',
            email: 'aluquin@anguiplast.com',
            direccion: 'Arandas, México',
            rfc: 'ANG101215PG0',
            sitio: 'http://www.anguiplast.com',
            etiquetas: 'Bolsas plásticas',
            tipo: 'client',
            avatar: 'A',
            color: '#2e7d32'
        },
        {
            nombre: 'Jaziel Lopez',
            empresa: 'Anguiplast, S.A. de C.V.',
            puesto: 'Ventas',
            telefono: '+52 348 784 6573',
            email: 'ventas@anguiplast.com',
            direccion: 'Libramiento Norte Km. 2\nArandas Centro\n47180 Arandas, JAL\nMéxico',
            rfc: 'ANG101215PG0',
            sitio: 'http://www.anguiplast.com.mx',
            etiquetas: 'Bolsas plásticas',
            tipo: 'client',
            avatar: 'J',
            color: '#4caf50'
        },
        {
            nombre: 'BADER',
            empresa: 'BADER',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'B',
            color: '#66bb6a'
        },
        {
            nombre: 'BODYCOTE',
            empresa: 'BODYCOTE',
            puesto: '',
            telefono: '+52 472 103 5500',
            email: '',
            direccion: 'Silao, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'B',
            color: '#dc3545'
        },
        {
            nombre: 'Christian Ramirez',
            empresa: 'BODYCOTE',
            puesto: '',
            telefono: '+52 462 188 0922',
            email: 'christian.ramirez@bodycote.com',
            direccion: 'Silao, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'C',
            color: '#9c27b0'
        },
        {
            nombre: 'BOLSAS DE LOS ALTOS',
            empresa: 'BOLSAS DE LOS ALTOS',
            puesto: '',
            telefono: '+52 348 784 4666',
            email: '',
            direccion: 'Arandas, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'B',
            color: '#e53935'
        },
        {
            nombre: 'Jennifer Gerrero',
            empresa: 'BOLSAS DE LOS ALTOS',
            puesto: '',
            telefono: '+52 348 784 4666',
            email: '',
            direccion: 'Arandas, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'J',
            color: '#7cb342'
        },
        {
            nombre: 'COFICAB',
            empresa: 'COFICAB',
            puesto: '',
            telefono: '+52 477 162 2500',
            email: '',
            direccion: 'Silao, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'C',
            color: '#f5f5f5'
        },
        {
            nombre: 'CONDUMEX',
            empresa: 'CONDUMEX',
            puesto: '',
            telefono: '',
            email: '',
            direccion: 'SILAO, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Welding and soldering and brazing machi...',
            tipo: 'client',
            avatar: 'C',
            color: '#212121'
        },
        {
            nombre: 'DOMUM',
            empresa: 'DOMUM',
            puesto: '',
            telefono: '+52 477 312 0214',
            email: '',
            direccion: 'León, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'D',
            color: '#00acc1'
        },
        {
            nombre: 'Ariel Diaz',
            empresa: 'DOMUM',
            puesto: 'Integrador',
            telefono: '+52 477 564 2981',
            email: 'ventas1@d-automation.com',
            direccion: 'León, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Integrador',
            tipo: 'client',
            avatar: 'A',
            color: '#00acc1'
        },
        {
            nombre: 'Demo Technic Leon',
            empresa: 'Demo Technic Leon',
            puesto: '',
            telefono: '+52 477 344 1060',
            email: 'contact.demotechnic@safe-demo.com',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'D',
            color: '#1976d2'
        },
        {
            nombre: 'Lic. Blanca Vanesa',
            empresa: 'Demo Technic Leon',
            puesto: '',
            telefono: '',
            email: '',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'L',
            color: '#e91e63'
        },
        {
            nombre: 'ECOBOLSAS',
            empresa: 'ECOBOLSAS',
            puesto: '',
            telefono: '+52 348 784 4440',
            email: 'compras@eco-bolsas.com.mx',
            direccion: 'Arandas, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Bolsas plásticas',
            tipo: 'client',
            avatar: 'E',
            color: '#7cb342'
        },
        {
            nombre: 'Elio Cesar',
            empresa: 'ECOBOLSAS',
            puesto: '',
            telefono: '+52 348 784 4440',
            email: 'produccion@eco-bolsas.com.mx',
            direccion: 'Arandas, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'E',
            color: '#00897b'
        },
        {
            nombre: 'ECSA',
            empresa: 'ECSA',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'E',
            color: '#3f51b5'
        },
        {
            nombre: 'EPC 2',
            empresa: 'EPC 2',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'E',
            color: '#f5f5f5'
        },
        {
            nombre: 'Envases Plásticos del Centro, S.A. de C.V.',
            empresa: 'Envases Plásticos del Centro, S.A. de C.V.',
            puesto: '',
            telefono: '+52 444 824 2454',
            email: 'compras@eplasticos.com.mx',
            direccion: 'San Luis Potosí, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Bandejas para servicio de comidas, Bolsas, Containers and storage, Malla red',
            tipo: 'client',
            avatar: 'E',
            color: '#f5f5f5'
        },
        {
            nombre: 'Mauricio Santiago',
            empresa: 'Envases Plásticos del Centro, S.A. de C.V.',
            puesto: '',
            telefono: '+52 444 824 2454',
            email: 'ventas@eplasticos.com.mx',
            direccion: 'San Luis Potosí, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'M',
            color: '#ff9800'
        },
        {
            nombre: 'FAS',
            empresa: 'FAS',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'F',
            color: '#26a69a'
        },
        {
            nombre: 'HALL ALUMINIUM',
            empresa: 'HALL ALUMINIUM',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'H',
            color: '#66bb6a'
        },
        {
            nombre: 'HIRUTA',
            empresa: 'HIRUTA',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'H',
            color: '#26a69a'
        },
        {
            nombre: 'HT6 INGENIERIA S DE RL DE CV',
            empresa: 'HT6 INGENIERIA S DE RL DE CV',
            puesto: '',
            telefono: '+52 477 711 2851',
            email: 'administracion@ika.technology',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'H',
            color: '#f5f5f5'
        },
        {
            nombre: 'Maria Delucia',
            empresa: 'HT6 INGENIERIA S DE RL DE CV',
            puesto: '',
            telefono: '+52 477 449 1651',
            email: 'international@ika.technology',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'M',
            color: '#66bb6a'
        },
        {
            nombre: 'Hebillas y Herrajes Robor S.A. de C.V.',
            empresa: 'Hebillas y Herrajes Robor S.A. de C.V.',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'H',
            color: '#00acc1'
        },
        {
            nombre: 'ICEMAN',
            empresa: 'ICEMAN',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'I',
            color: '#c0ca33'
        },
        {
            nombre: 'IK PLASTIC',
            empresa: 'IK PLASTIC',
            puesto: '',
            telefono: '',
            email: '',
            direccion: 'Silao, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'I',
            color: '#f5f5f5'
        },
        {
            nombre: 'Iván Gutiérrez',
            empresa: '',
            puesto: '',
            telefono: '',
            email: 'betagtzm@gmail.com',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'I',
            color: '#9c27b0'
        },
        {
            nombre: 'Javier Cruz',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '4775747109',
            email: 'electronica@ssepi.org',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'J',
            color: '#212121'
        },
        {
            nombre: 'Javier Cruz Castro',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '',
            email: 'electronica@ssepi.org',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'J',
            color: '#7e57c2'
        },
        {
            nombre: 'Jorge Villanueva',
            empresa: '',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'J',
            color: '#ec407a'
        },
        {
            nombre: 'MARQ',
            empresa: 'MARQ',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'M',
            color: '#00acc1'
        },
        {
            nombre: 'MARQUARDT',
            empresa: 'MARQUARDT',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'M',
            color: '#f9a825'
        },
        {
            nombre: 'MR LUCKY',
            empresa: 'MR LUCKY',
            puesto: '',
            telefono: '+52 462 626 2663',
            email: '',
            direccion: 'Irapuato, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'M',
            color: '#f5f5f5'
        },
        {
            nombre: 'Reina Medina',
            empresa: 'MR LUCKY',
            puesto: '',
            telefono: '',
            email: '',
            direccion: 'Irapuato, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'R',
            color: '#c0ca33'
        },
        {
            nombre: 'NHK Spring México, S.A. de C.V.',
            empresa: 'NHK Spring México, S.A. de C.V.',
            puesto: '',
            telefono: '+52 462 623 8000',
            email: 'omar.vargaz@nhkusa.com',
            direccion: 'Irapuato, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Transportation components and systems',
            tipo: 'provider',
            avatar: 'N',
            color: '#f5f5f5'
        },
        {
            nombre: 'Felipe Garcia',
            empresa: 'NHK Spring México, S.A. de C.V.',
            puesto: '',
            telefono: '',
            email: 'felipe.garcia@nhkspgmx.com',
            direccion: 'Irapuato, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'F',
            color: '#7e57c2'
        },
        {
            nombre: 'Nishikawa Sealing Systems Mexico',
            empresa: 'Nishikawa Sealing Systems Mexico',
            puesto: '',
            telefono: '+52 472 722 6938',
            email: '',
            direccion: 'Silao, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'N',
            color: '#f5f5f5'
        },
        {
            nombre: 'Pieles Azteca, S.A. de C.V.',
            empresa: 'Pieles Azteca, S.A. de C.V.',
            puesto: '',
            telefono: '+52 477 778 3607',
            email: 'ahernandez@teneriaazateca.mx',
            direccion: 'León, México',
            rfc: '',
            sitio: '',
            etiquetas: 'Servicios de fabricación de curtidos de aca...',
            tipo: 'client',
            avatar: 'P',
            color: '#f5f5f5'
        },
        {
            nombre: 'Jesus Bolaños',
            empresa: 'Pieles Azteca, S.A. de C.V.',
            puesto: 'Mantenimiento',
            telefono: '+52 479 208 6446',
            email: '',
            direccion: 'Santa Crocce No. 213\nIndustrial Santa CROCCE\n37439 León, Guanajuato\nMéxico',
            rfc: 'PAZ970426LZ2',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'J',
            color: '#dc3545'
        },
        {
            nombre: 'RONGTAI',
            empresa: 'RONGTAI',
            puesto: '',
            telefono: '+52 479 262 7503',
            email: 'compras3@rtco.com.cn',
            direccion: 'LEÓN, México',
            rfc: '',
            sitio: '',
            etiquetas: 'VIP',
            tipo: 'provider',
            avatar: 'R',
            color: '#f5f5f5'
        },
        {
            nombre: 'Joatam álvarez',
            empresa: 'RONGTAI',
            puesto: '',
            telefono: '+52 479 262 7503',
            email: 'compras3@rtco.com.cn',
            direccion: 'LEÓN, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'J',
            color: '#f9a825'
        },
        {
            nombre: 'Ramiro',
            empresa: '',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'R',
            color: '#c0ca33'
        },
        {
            nombre: 'SADDLEBACK',
            empresa: 'SADDLEBACK',
            puesto: '',
            telefono: '',
            email: '',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'S',
            color: '#dc3545'
        },
        {
            nombre: 'Genaro Morales',
            empresa: 'SADDLEBACK',
            puesto: '',
            telefono: '+52 33 4016 5336',
            email: '',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'client',
            avatar: 'G',
            color: '#00acc1'
        },
        {
            nombre: 'SSEPI',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '',
            email: 'administracion@ssepi.org',
            direccion: 'Leon, México',
            rfc: '',
            sitio: 'http://www.ssepi.org',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'S',
            color: '#00a09d'
        },
        {
            nombre: 'Aarón Garcia',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '+52 477 134 2813',
            email: 'electronica.ssepi@gmail.com',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'A',
            color: '#f5f5f5'
        },
        {
            nombre: 'Arturo Moreno',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '+52 477 630 5230',
            email: 'automatizacion@ssepi.org',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'A',
            color: '#00a09d'
        },
        {
            nombre: 'Daniel Zuñiga',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '+52 477 737 3118',
            email: 'ventas@ssepi.org',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'D',
            color: '#00a09d'
        },
        {
            nombre: 'Iván Gutierrez',
            empresa: 'SSEPI',
            puesto: '',
            telefono: '+52 477 522 8007',
            email: 'ivang.ssepi@gmail.com',
            direccion: 'Leon, México',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'I',
            color: '#dc3545'
        },
        {
            nombre: 'TACSA',
            empresa: 'TACSA',
            puesto: '',
            telefono: '+52 33 1148 9204',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'T',
            color: '#f5f5f5'
        },
        {
            nombre: 'Delfino Ortega',
            empresa: 'TACSA',
            puesto: '',
            telefono: '+52 33 1148 9204',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'D',
            color: '#f9a825'
        },
        {
            nombre: 'TORNO',
            empresa: 'TORNO',
            puesto: '',
            telefono: '',
            email: '',
            direccion: '',
            rfc: '',
            sitio: '',
            etiquetas: '',
            tipo: 'provider',
            avatar: 'T',
            color: '#5e35b1'
        }
    ];

    // ==========================================================================
    // 3. VALIDACIÓN SILENCIOSA (solo admin)
    // ==========================================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ==========================================================================
    // 4. CONFIGURACIÓN UI Y EVENTOS
    // ==========================================================================
    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            const themeBtn = document.getElementById('themeBtn');
            if (themeBtn) themeBtn.innerHTML = '☀️';
        } else {
            document.body.removeAttribute('data-theme');
            const themeBtn = document.getElementById('themeBtn');
            if (themeBtn) themeBtn.innerHTML = '🌙';
        }
        const clock = document.getElementById('clock');
        if (clock) setInterval(() => clock.innerText = new Date().toLocaleTimeString(), 1000);
        
        _initFilters();
    }

    function _initFilters() {
        // Filtros de tipo
        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                f_c = this.dataset.filter;
                _renderView();
            });
        });

        // Selector de período
        document.querySelectorAll('.periodo-option').forEach(opt => {
            opt.addEventListener('click', function(e) {
                document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                p_periodo = this.dataset.period;
                _renderView();
            });
        });

        // Vistas
        document.querySelectorAll('.vistas-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                document.querySelectorAll('.vistas-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                v_m = this.dataset.view;
                _renderView();
            });
        });

        // Búsqueda
        const search = document.getElementById('searchInput');
        if (search) {
            search.addEventListener('input', function(e) {
                s_t = e.target.value.toLowerCase().trim();
                _renderView();
            });
        }
    }

    function _bindEvents() {
        const toggle = document.getElementById('toggleMenu');
        if (toggle) toggle.addEventListener('click', _toggleMenu);

        const newBtn = document.getElementById('newContactBtn');
        if (newBtn) newBtn.addEventListener('click', () => _openModal('nuevo'));

        const importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.addEventListener('click', () => document.getElementById('fileInput').click());

        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.addEventListener('change', _handleCSVImport);

        const saveBtn = document.getElementById('saveContactBtn');
        if (saveBtn) saveBtn.addEventListener('click', _saveContact);

        const closePanelBtn = document.querySelector('.panel-close');
        if (closePanelBtn) closePanelBtn.addEventListener('click', _closeDetail);
        const backdrop = document.getElementById('backdrop');
        if (backdrop) backdrop.addEventListener('click', _closeDetail);

        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) themeBtn.addEventListener('click', _toggleTheme);

        const waBtn = document.getElementById('btnWhatsApp');
        if (waBtn) waBtn.addEventListener('click', _enviarWhatsApp);

        const updateBtn = document.getElementById('updateContactBtn');
        if (updateBtn) updateBtn.addEventListener('click', _updateContactData);

        const logoInput = document.getElementById('panelLogoUrl');
        if (logoInput) logoInput.addEventListener('input', _updateAvatarPreview);
        
        const tipoSelect = document.getElementById('panelTipo');
        if (tipoSelect) tipoSelect.addEventListener('change', _updateContactType);
    }

    function _setView(mode) {
        v_m = mode;
        const kanbanBtn = document.querySelector('.vistas-tab[data-view="kanban"]');
        const listBtn = document.querySelector('.vistas-tab[data-view="table"]');
        if (kanbanBtn && listBtn) {
            kanbanBtn.classList.toggle('active', mode === 'kanban');
            listBtn.classList.toggle('active', mode === 'list');
        }
        _renderView();
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
        window.innerWidth <= 768 ? s.classList.toggle('active') : b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '🌙';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '☀️';
        }
    }

    // ==========================================================================
    // 5. FIREBASE LISTENERS
    // ==========================================================================
    function _startListeners() {
        if (!window.db) { console.error('Firestore no disponible'); return; }
        if (u_) u_();
        u_ = window.db.collection('contactos')
            .orderBy('nombre')
            .onSnapshot(snap => {
                c_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _renderView();
                _updateKPIs();
                _updateFirebaseStatus();
            }, console.error);
    }

    // ==========================================================================
    // 6. IMPORTACIÓN INICIAL CON CONTROL DE DUPLICADOS
    // ==========================================================================
    async function _importInitialContacts() {
        if (!window.db) return;
        try {
            const existing = await window.db.collection('contactos').get();
            if (!existing.empty) {
                console.log('ℹ️ Contactos ya existen, omitiendo importación.');
                return;
            }
            console.log('📦 Importando 54 contactos a Firebase...');
            const batch = window.db.batch();
            for (let contact of _CONTACTOS_COMPLETOS) {
                const docRef = window.db.collection('contactos').doc();
                batch.set(docRef, {
                    ...contact,
                    logoUrl: '',
                    createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            await batch.commit();
            console.log('✅ Contactos importados correctamente');
        } catch (e) {
            console.error('Error al importar contactos:', e);
        }
    }

    // ==========================================================================
    // 7. RENDERIZADO DE VISTAS (KANBAN / LISTA)
    // ==========================================================================
    function _renderView() {
        if (!c_a) return;
        
        let filtered = c_a.filter(c => {
            if (f_c !== 'all' && c.tipo !== f_c) return false;
            if (s_t) {
                const n = (c.nombre || '').toLowerCase();
                const e = (c.email || '').toLowerCase();
                const r = (c.rfc || '').toLowerCase();
                const et = (c.etiquetas || '').toLowerCase();
                const em = (c.empresa || '').toLowerCase();
                return n.includes(s_t) || e.includes(s_t) || r.includes(s_t) || et.includes(s_t) || em.includes(s_t);
            }
            return true;
        });
        
        // Aplicar filtro de período (basado en fecha de creación)
        if (p_periodo !== 'all') {
            const now = new Date();
            filtered = filtered.filter(c => {
                if (!c.createdAt) return false;
                const fecha = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
                if (p_periodo === 'month') {
                    return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
                } else if (p_periodo === 'year') {
                    return fecha.getFullYear() === now.getFullYear();
                }
                return true;
            });
        }
        
        document.getElementById('totalCount').innerText = filtered.length;
        
        if (v_m === 'kanban') _renderKanban(filtered);
        else _renderList(filtered);
    }

    function _renderKanban(contacts) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        container.style.display = 'grid';
        document.getElementById('listContainer').style.display = 'none';
        
        if (contacts.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-address-book"></i><p>No se encontraron contactos</p></div>`;
            return;
        }
        
        container.innerHTML = contacts.map(c => {
            const inicial = (c.nombre || '?').charAt(0).toUpperCase();
            const estiloAvatar = c.logoUrl
                ? `background-image: url('${c.logoUrl}'); background-size: cover; background-position: center;`
                : `background: linear-gradient(135deg, ${c.color || '#00a09d'}, ${c.color || '#008a87'});`;
            const tipoClass = c.tipo === 'client' ? 'client' : 'provider';
            const tipoText = c.tipo === 'client' ? 'CLIENTE' : 'PROVEEDOR';
            
            return `
                <div class="contact-card" data-id="${c.id}" onclick="ContactosManager.abrirDetalle('${c.id}')">
                    <div class="avatar-box" style="${estiloAvatar}">
                        ${c.logoUrl ? '' : inicial}
                    </div>
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
        if (!container) return;
        container.style.display = 'block';
        document.getElementById('kanbanContainer').style.display = 'none';
        
        const tbody = document.getElementById('listTableBody');
        if (contacts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="fas fa-address-book"></i><p>No se encontraron contactos</p></td></tr>`;
            return;
        }
        
        tbody.innerHTML = contacts.map(c => `
            <tr onclick="ContactosManager.abrirDetalle('${c.id}')">
                <td><strong>${c.nombre || ''}</strong></td>
                <td>${c.empresa || ''}</td>
                <td>${c.email || ''}</td>
                <td>${c.telefono || ''}</td>
                <td>${c.rfc || ''}</td>
                <td><span class="badge ${c.tipo === 'client' ? 'client' : 'provider'}">${c.tipo === 'client' ? 'Cliente' : 'Proveedor'}</span></td>
            </tr>
        `).join('');
    }

    // ==========================================================================
    // 8. KPIs
    // ==========================================================================
    async function _updateKPIs() {
        const total = c_a.length;
        const clientes = c_a.filter(c => c.tipo === 'client').length;
        const proveedores = c_a.filter(c => c.tipo === 'provider').length;
        
        let saldoTotal = 0;
        if (window.db) {
            try {
                const snap = await window.db.collection('ingresos_contabilidad')
                    .where('estatus', '==', 'pendiente')
                    .get();
                snap.forEach(doc => saldoTotal += doc.data().monto_total || 0);
            } catch (e) { console.error(e); }
        }
        
        document.getElementById('kpiTotalContactos').innerText = total;
        document.getElementById('kpiClientes').innerText = clientes;
        document.getElementById('kpiProveedores').innerText = proveedores;
        document.getElementById('kpiSaldoTotal').innerHTML = `$${saldoTotal.toFixed(2)}`;
    }

    function _updateFirebaseStatus() {
        const el = document.getElementById('firebaseStatus');
        if (el) el.innerHTML = `Conectado • ${c_a.length} contactos`;
    }

    // ==========================================================================
    // 9. PANEL DE DETALLE CON EDICIÓN
    // ==========================================================================
    async function abrirDetalle(id) {
        if (!__x()) return;
        const contacto = c_a.find(c => c.id === id);
        if (!contacto) return;
        c_ = contacto;

        document.getElementById('backdrop').style.display = 'block';
        document.getElementById('sidePanel').classList.add('open');

        document.getElementById('panelNombre').innerText = contacto.nombre || 'Sin nombre';
        document.getElementById('panelEmpresa').innerText = contacto.empresa || '—';
        _updateAvatarFromContact(contacto);

        document.getElementById('panelId').value = contacto.id;
        document.getElementById('panelPuesto').value = contacto.puesto || '';
        document.getElementById('panelTelefono').value = contacto.telefono || '';
        document.getElementById('panelEmail').value = contacto.email || '';
        document.getElementById('panelRfc').value = contacto.rfc || '';
        document.getElementById('panelSitio').value = contacto.sitio || '';
        document.getElementById('panelTipo').value = contacto.tipo || 'client';
        document.getElementById('panelEtiquetas').value = contacto.etiquetas || '';
        document.getElementById('panelDireccion').value = contacto.direccion || '';
        document.getElementById('panelLogoUrl').value = contacto.logoUrl || '';

        // Calcular costo de recolección (solo para clientes)
        if (contacto.tipo === 'client') {
            const km = ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa);
            const costo = ContactosFormulas.calcularCostoRecoleccionRedondo(km);
            // Mostrar en algún lado si se desea
        }

        await _cargarTimeline(contacto.id);
    }

    function _updateAvatarFromContact(contacto) {
        const avatarDiv = document.getElementById('panelAvatar');
        if (contacto.logoUrl) {
            avatarDiv.style.background = `url('${contacto.logoUrl}') center / cover no-repeat`;
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
        } else if (c_) {
            const inicial = (c_.nombre || '?').charAt(0).toUpperCase();
            avatarDiv.style.background = `linear-gradient(135deg, ${c_.color || '#00a09d'}, ${c_.color || '#008a87'})`;
            avatarDiv.innerHTML = inicial;
        }
    }

    function _updateContactType(e) {
        if (c_) {
            c_.tipo = e.target.value;
        }
    }

    // ==========================================================================
    // 10. ACTUALIZACIÓN PERSISTENTE (GUARDAR CAMBIOS)
    // ==========================================================================
    async function _updateContactData() {
        if (!__x() || !window.db || !c_) { alert('No autorizado o sin contacto seleccionado'); return; }

        const id = document.getElementById('panelId').value;
        const updatedData = {
            puesto: document.getElementById('panelPuesto').value.trim() || '',
            telefono: document.getElementById('panelTelefono').value.trim() || '',
            email: document.getElementById('panelEmail').value.trim() || '',
            rfc: document.getElementById('panelRfc').value.trim() || '',
            sitio: document.getElementById('panelSitio').value.trim() || '',
            tipo: document.getElementById('panelTipo').value || 'client',
            etiquetas: document.getElementById('panelEtiquetas').value.trim() || '',
            direccion: document.getElementById('panelDireccion').value.trim() || '',
            logoUrl: document.getElementById('panelLogoUrl').value.trim() || '',
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await window.db.collection('contactos').doc(id).update(updatedData);
            Object.assign(c_, updatedData);
            await _agregarActividad(id, 'nota', 'Contacto actualizado');
            showNotification('✅ Contacto actualizado', 'success');
        } catch (e) {
            console.error(e);
            showNotification('❌ Error al actualizar', 'error');
        }
    }

    function _closeDetail() {
        document.getElementById('sidePanel').classList.remove('open');
        document.getElementById('backdrop').style.display = 'none';
        c_ = null;
    }

    // ==========================================================================
    // 11. TIMELINE DE ACTIVIDADES
    // ==========================================================================
    async function _cargarTimeline(contactoId) {
        if (!window.db) return;
        const container = document.getElementById('timelineContainer');
        if (!container) return;
        try {
            const snap = await window.db.collection('contactos').doc(contactoId).collection('actividades')
                .orderBy('fecha', 'desc')
                .limit(20)
                .get();
            if (snap.empty) {
                container.innerHTML = '<div class="empty-timeline">No hay actividades registradas</div>';
                return;
            }
            let html = '';
            snap.forEach(doc => {
                const act = doc.data();
                const fecha = act.fecha?.toDate ? act.fecha.toDate() : new Date();
                const icon = act.tipo === 'whatsapp' ? 'fab fa-whatsapp' : (act.tipo === 'nota' ? 'fas fa-sticky-note' : 'fas fa-clock');
                html += `
                    <div class="timeline-item">
                        <div class="timeline-icon" style="background: var(--accent-primary);">
                            <i class="${icon}"></i>
                        </div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <span class="timeline-user">${act.usuario || 'Sistema'}</span>
                                <span class="timeline-time">${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
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
        if (!window.db || !__x()) return;
        try {
            await window.db.collection('contactos').doc(contactoId).collection('actividades').add({
                tipo,
                accion,
                usuario: window.auth.currentUser.email,
                fecha: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            if (c_ && c_.id === contactoId) {
                _cargarTimeline(contactoId);
            }
        } catch (e) {
            console.error('Error al registrar actividad:', e);
        }
    }

    // ==========================================================================
    // 12. WHATSAPP
    // ==========================================================================
    function _enviarWhatsApp() {
        if (!c_) { alert('Seleccione un contacto'); return; }
        const telefono = c_.telefono;
        if (!telefono) { alert('El contacto no tiene teléfono'); return; }
        const numero = telefono.replace(/[^\d]/g, '');
        const mensaje = `Hola ${c_.nombre}, contacto desde SSEPI.`;
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
        _agregarActividad(c_.id, 'whatsapp', 'Mensaje enviado por WhatsApp');
    }

    // ==========================================================================
    // 13. GUARDAR CONTACTO (CREAR)
    // ==========================================================================
    async function _saveContact() {
        if (!__x() || !window.db) return;
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
            sitio: document.getElementById('inputSitio')?.value?.trim() || '',
            tipo: document.getElementById('inputTipo')?.value || 'client',
            etiquetas: document.getElementById('inputEtiquetas')?.value?.trim() || '',
            favorito: false,
            avatar: nombre.charAt(0).toUpperCase(),
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            logoUrl: '',
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await window.db.collection('contactos').add(data);
            await _agregarActividad(docRef.id, 'nota', 'Contacto creado');
            _closeModal();
            showNotification('Contacto guardado correctamente', 'success');
        } catch (e) {
            console.error(e);
            showNotification('Error al guardar contacto', 'error');
        }
    }

    // ==========================================================================
    // 14. MODALES
    // ==========================================================================
    function _openModal(tipo) {
        if (!__x()) return;
        if (tipo === 'nuevo') {
            document.getElementById('modalNuevoContacto').classList.add('show');
        }
    }

    function _closeModal() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    }

    function showNotification(msg, type = 'success') {
        const notif = document.getElementById('notification');
        notif.textContent = msg;
        notif.className = `notification ${type} show`;
        setTimeout(() => notif.classList.remove('show'), 3000);
    }

    // ==========================================================================
    // 15. IMPORTACIÓN CSV
    // ==========================================================================
    async function _handleCSVImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target.result;
            const lines = text.split('\n').filter(l => l.trim());
            const batch = window.db.batch();
            const ts = window.firebase.firestore.FieldValue.serverTimestamp();
            let imported = 0;
            for (let i = 0; i < lines.length; i++) {
                if (i === 0 && lines[0].toLowerCase().includes('nombre')) continue;
                const cols = lines[i].split(',').map(c => c.trim());
                if (cols.length < 1) continue;
                const nombre = cols[0] || '';
                if (!nombre) continue;
                const docRef = window.db.collection('contactos').doc();
                batch.set(docRef, {
                    nombre: nombre.toUpperCase(),
                    email: cols[1] || '',
                    telefono: cols[2] || '',
                    empresa: cols[3] || '',
                    rfc: cols[4] || '',
                    tipo: cols[5]?.toLowerCase() === 'provider' ? 'provider' : 'client',
                    createdAt: ts,
                    updatedAt: ts,
                    avatar: nombre.charAt(0).toUpperCase(),
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
                });
                imported++;
            }
            await batch.commit();
            showNotification(`✅ ${imported} contactos importados`, 'success');
            document.getElementById('fileInput').value = '';
        };
        reader.readAsText(file);
    }

    // ==========================================================================
    // 16. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: function() {
            if (!__x()) { window.location.href = 'ssepi_website.html'; return; }
            _initUI();
            _bindEvents();
            _startListeners();
            _importInitialContacts();
            _updateKPIs();
        },
        abrirDetalle,
        enviarWhatsApp: _enviarWhatsApp,
        showNotification
    };
})();

window.ContactosManager = ContactosManager;