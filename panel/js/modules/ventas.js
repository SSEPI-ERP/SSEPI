// ================================================
// ARCHIVO: ventas.js
// DESCRIPCIÓN: Módulo de Ventas adaptado a Supabase
// BASADO EN: ventas-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de ventas, cotizaciones, calculadora de costos, PDF, notificaciones
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { ContactosFormulas } from '../core/contactos-formulas.js';
import { pdfGenerator } from '../core/pdf-generator.js';
import { notifyVentaIfEligible } from '../core/coi-sync-engine.js';
import { syncFolioAfterCotizacionInsert } from '../core/folio-operativo-service.js';

const VentasModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let ventas = [];
    let cotizaciones = [];
    let inventario = [];
    let contactos = [];
    let proyectos = [];
    let taller = [];
    let motores = [];
    let solicitudesTaller = [];
    let solicitudesFacturacion = [];

    let currentVenta = null;
    let ventaId = null;
    let isNewVenta = true;

    // Estado de la calculadora
    let calculadoraComponentes = [];
    let calculadoraClienteActual = null;
    let compraActual = null;

    // Wizard de cotización (4 pasos)
    let wizardPaso = 1;
    /** Registro paso 1 (falla, prioridad, departamento, orden) — se guarda en cotización.cerebro_registro */
    let ventasWizardCerebro = null;
    let lastGastosGenerales = 0;
    let lastPrecioConUtilidad = 0;
    let lastPrecioAntesIVA = 0;
    let lastIva = 0;
    let lastTotal = 0;

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroVendedor = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    function _normStr(s) {
        return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function _cerebroRegistroPayload() {
        return ventasWizardCerebro && typeof ventasWizardCerebro === 'object' ? { ...ventasWizardCerebro } : {};
    }

    function _wizardSetPaso1Error(msg) {
        const el = document.getElementById('wizardPaso1Error');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    function _wizardActualizarAyudaFolio() {
        const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
        const el = document.getElementById('wizardFolioAyuda');
        if (!el) return;
        const map = {
            'Taller Electrónica': 'Al continuar se crea la orden con folio SP-E…',
            'Taller Motores': 'Al continuar se crea la orden con folio SP-M…',
            'Automatización': 'Al continuar se crea el registro con folio SP-A…',
            'Proyectos': 'Al continuar se crea el registro con folio SP-A…',
            'Administración': 'Sin orden de área; la cotización queda directa.'
        };
        el.textContent = map[dept] || 'Elige departamento.';
    }

    function _attachWizardPaso1() {
        const deptEl = document.getElementById('wizardDepartamentoSelect');
        if (deptEl && !deptEl._ssepiBound) {
            deptEl._ssepiBound = true;
            deptEl.addEventListener('change', () => {
                _wizardSetPaso1Error('');
                _wizardActualizarAyudaFolio();
            });
        }
        _wizardActualizarAyudaFolio();
    }

    /**
     * Valida que el usuario tenga sesión activa y token válido antes de operaciones de escritura.
     * Retorna { valid: boolean, error?: string, user?: object }
     */
    async function _validateAuthForWrite() {
        try {
            const { data: { user }, error } = await window.supabase.auth.getUser();
            if (error || !user) {
                return { valid: false, error: 'Sesión expirada o inválida. Por favor inicia sesión nuevamente.' };
            }
            // Verificar que la sesión no esté cerca de expirar
            const session = window.supabase.auth.getSession();
            if (session?.expires_at && session.expires_at < Date.now() / 1000 + 60) {
                return { valid: false, error: 'Sesión por expirar. Por favor inicia sesión nuevamente.' };
            }
            return { valid: true, user };
        } catch (e) {
            console.error('[Ventas] validateAuthForWrite:', e);
            return { valid: false, error: 'Error de conexión con el servidor de autenticación.' };
        }
    }

    /**
     * Clasifica un error de Supabase para dar mensaje útil al usuario.
     */
    function _classifyError(error) {
        if (!error) return { type: 'unknown', message: 'Error desconocido.' };

        const code = error.code || '';
        const msg = (error.message || '').toLowerCase();

        // Errores de autenticación/autorización
        if (code === 'PGRST301' || msg.includes('jwt') || msg.includes('token') || msg.includes('auth')) {
            return { type: 'auth', message: 'Tu sesión expiró o no es válida. Por favor inicia sesión nuevamente.' };
        }
        if (code === 'PGRST101' || msg.includes('permission') || msg.includes('rls') || msg.includes('denied')) {
            return { type: 'permission', message: 'No tienes permisos para realizar esta acción. Contacta al administrador.' };
        }
        // Errores de red/conexión
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
            return { type: 'network', message: 'Error de conexión. Verifica tu internet e intenta de nuevo.' };
        }
        // Errores de validación
        if (code === '23505') {
            return { type: 'duplicate', message: 'Ya existe un registro con estos datos.' };
        }
        if (code.startsWith('23')) {
            return { type: 'validation', message: 'Datos inválidos. Verifica la información capturada.' };
        }
        return { type: 'unknown', message: 'Error: ' + (error.message || 'Intenta de nuevo.') };
    }

    async function _ventasCrearOrdenOperativa(dept, clienteNombre, falla, fechaStr, prioridad, csrfToken, nombreProducto) {
        // VALIDACIÓN DE AUTENTICACIÓN ANTES DE ESCRIBIR
        const authCheck = await _validateAuthForWrite();
        if (!authCheck.valid) {
            const err = new Error(authCheck.error);
            err._ssepiAuthFailure = true;
            throw err;
        }

        const fechaIso = fechaStr
            ? new Date(fechaStr + 'T12:00:00.000Z').toISOString()
            : new Date().toISOString();
        const prioLine = 'Prioridad (Ventas): ' + (prioridad || 'Normal');
        const productoServicio = nombreProducto || 'N/A';
        const notasAlta = [
            prioLine,
            'Alta desde Ventas (cerebro).',
            `Producto/Servicio: ${productoServicio}`,
            `Falla/Requerimiento: ${falla || 'N/A'}`
        ].join('\n');

        try {
            if (dept === 'Taller Electrónica') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioLaboratorio;
                const folio = folioFn ? await folioFn() : 'SP-E' + new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0') + '001';
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    equipo: productoServicio,
                    falla_reportada: falla,
                    fecha_ingreso: fechaIso,
                    estado: 'Nuevo',
                    notas_generales: notasAlta
                };
                const inserted = await tallerService.insert(row, csrfToken);
                if (!inserted) {
                    throw new Error('No se recibió confirmación del servidor al crear la orden de Taller.');
                }
                if (inserted && taller && !taller.some((o) => o.id === inserted.id)) taller.unshift(inserted);
                compraActual = {
                    id: inserted.id,
                    vinculacion: {
                        id: inserted.id,
                        nombre: clienteNombre,
                        tipo: 'taller',
                        folio_taller: folio,
                        producto: productoServicio,
                        falla: falla,
                        prioridad: prioridad
                    },
                    _origen: 'taller'
                };
                return { folio, ordenId: inserted.id, tipo: 'taller', data: row };
            }

            if (dept === 'Taller Motores') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioMotores;
                const folio = folioFn ? await folioFn() : 'SP-M' + new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0') + '001';
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    motor: productoServicio,
                    fecha_ingreso: fechaIso,
                    falla_reportada: falla,
                    estado: 'Nuevo',
                    notas_generales: notasAlta
                };
                const inserted = await motoresService.insert(row, csrfToken);
                if (!inserted) {
                    throw new Error('No se recibió confirmación del servidor al crear la orden de Motores.');
                }
                if (inserted && motores && !motores.some((o) => o.id === inserted.id)) motores.unshift(inserted);
                compraActual = {
                    id: inserted.id,
                    vinculacion: {
                        id: inserted.id,
                        nombre: clienteNombre,
                        tipo: 'motor',
                        folio_motores: folio,
                        producto: productoServicio,
                        falla: falla,
                        prioridad: prioridad
                    },
                    _origen: 'motores'
                };
                return { folio, ordenId: inserted.id, tipo: 'motor', data: row };
            }

            if (dept === 'Automatización' || dept === 'Proyectos') {
                const profile = await authService.getCurrentProfile();
                const userName = profile?.nombre || 'Ventas';
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioAutomatizacion;
                const folio = folioFn
                    ? await folioFn()
                    : 'SP-A' + new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0') + '/1';
                const nombre = dept === 'Proyectos' ? 'Proyecto (Ventas)' : 'Automatización (Ventas)';
                const row = {
                    folio,
                    nombre: productoServicio || nombre,
                    cliente: clienteNombre,
                    fecha: (fechaStr || new Date().toISOString().split('T')[0]),
                    vendedor: userName,
                    notas_generales: [falla, prioLine, `Producto: ${productoServicio}`].filter(Boolean).join('\n\n'),
                    estado: 'pendiente',
                    producto_servicio: productoServicio,
                    prioridad: prioridad
                };
                const inserted = await proyectosService.insert(row, csrfToken);
                if (!inserted) {
                    throw new Error('No se recibió confirmación del servidor al crear el registro de Automatización/Proyectos.');
                }
                if (inserted && proyectos && !proyectos.some((p) => p.id === inserted.id)) proyectos.unshift(inserted);
                const origen = dept === 'Automatización' ? 'automatizacion' : 'proyecto';
                compraActual = {
                    id: inserted.id,
                    vinculacion: {
                        id: inserted.id,
                        nombre: clienteNombre,
                        tipo: 'proyecto',
                        folio_proyecto: folio,
                        producto: productoServicio,
                        falla: falla,
                        prioridad: prioridad
                    },
                    _origen: origen
                };
                return { folio, ordenId: inserted.id, tipo: 'proyecto', data: row };
            }

            throw new Error('Departamento no soportado para alta de orden');
        } catch (error) {
            // Re-lanzar con información clasificada para UI
            if (error._ssepiAuthFailure) throw error;
            const classified = _classifyError(error);
            const wrapped = new Error(classified.message);
            wrapped._ssepiErrorType = classified.type;
            wrapped._originalError = error;
            throw wrapped;
        }
    }

    function _itemsToComponentesFolio(items) {
        return (items || []).map((i) => ({
            nombre: i.descripcion || i.nombre || '',
            cantidad: Number(i.cantidad) || 0,
            costo_unitario: Number(i.precio_unitario ?? i.costo_unitario) || 0
        }));
    }

    async function _syncFolioTrasCotizacion(insertedRow, cotizacionData, componentes, csrfToken) {
        if (!insertedRow?.id) return;
        try {
            const r = await syncFolioAfterCotizacionInsert(
                { id: insertedRow.id, origen: cotizacionData.origen },
                { componentes: componentes || [], inventario },
                csrfToken
            );
            if (!r.ok && r.error) console.warn('[Ventas] folio operativo:', r.error?.message || r.error);
        } catch (e) {
            console.warn('[Ventas] folio operativo:', e?.message || e);
        }
    }

    // Servicios de datos
    const ventasService = createDataService('ventas');
    const cotizacionesService = createDataService('cotizaciones');
    const inventarioService = createDataService('inventario');
    const contactosService = createDataService('contactos');
    const proyectosService = createDataService('proyectos_automatizacion');
    const tallerService = createDataService('ordenes_taller');
    const motoresService = createDataService('ordenes_motores');
    const comprasService = createDataService('compras');
    const notificacionesService = createDataService('notificaciones');

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];

    // Tabuladores (datos fijos para cálculos logísticos)
    // NOTA: Los valores reales se cargan desde BD (gastos_fijos, parametros_costos, clientes_tabulador)
    const tabuladorTaller = {
        variables: {
            gasolina: 24.50,
            rendimiento: 9.5,
            costoTecnico: 104.16,
            gastosFijosHora: 124.18,
            camionetaHora: 39.35,
            utilidad: 40,
            credito: 3,
            iva: 16
        },
        clientes: []  // Se carga dinámicamente desde clientes_tabulador
    };

    const tabuladorAutomatizacion = {
        variables: {
            gasolina: 24.50,
            rendimiento: 9.5,
            jornada: 9,
            diasLaborales: 20,
            utilidad: 40,
            credito: 3,
            iva: 16
        },
        servicios: [
            { area: "Diseño e ingeniería", servicio: "Diseño de arquitectura de control", tipo: "O", valorAgregado: 308.1, unidad: "por hora" },
            { area: "Diseño e ingeniería", servicio: "Selección de equipos de control", tipo: "O", valorAgregado: 308.1, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Diseño de tablero eléctrico BT", tipo: "O", valorAgregado: 341.43, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Fabricación e instalación de tablero BT", tipo: "O", valorAgregado: 330.32, unidad: "por hora" },
            { area: "Eléctrica", servicio: "Instalación de cableado/sensores", tipo: "P", valorAgregado: 111.1, unidad: "por hora" },
            { area: "Control", servicio: "Programación de rutinas en PLC", tipo: "O", valorAgregado: 647.01, unidad: "por hora" },
            { area: "Control", servicio: "Creación de interfaz HMI", tipo: "O", valorAgregado: 647.01, unidad: "por hora" },
            { area: "Control", servicio: "Configuración de servomotores", tipo: "O", valorAgregado: 708.63, unidad: "por hora" },
            { area: "Control", servicio: "Programación de variadores VFD", tipo: "O", valorAgregado: 677.82, unidad: "por hora" },
            { area: "Diseño mecánico", servicio: "Modelado 3D de herramental", tipo: "O", valorAgregado: 770.25, unidad: "por modelo" },
            { area: "Sistemas de visión", servicio: "Lectura y validación de códigos QR", tipo: "O", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Sistemas de visión", servicio: "Integración de cámaras industriales", tipo: "O", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Sistemas de visión", servicio: "Trazabilidad y registro de producción", tipo: "P", valorAgregado: 770.25, unidad: "por hora" },
            { area: "Soporte", servicio: "Diagnóstico de fallas en sistemas", tipo: "P", valorAgregado: 1111, unidad: "por hora" },
            { area: "Soporte", servicio: "Optimización de tiempos de ciclo", tipo: "O", valorAgregado: 1111, unidad: "por hora" },
            { area: "Soporte", servicio: "Respaldo y documentación", tipo: "O", valorAgregado: 333.3, unidad: "por hora" },
            { area: "Soporte", servicio: "Capacitación a personal", tipo: "O", valorAgregado: 888.8, unidad: "por hora" }
        ]
    };

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Ventas] Conectado');

        // Cargar configuración de costos desde BD
        try {
            await CostosEngine.loadFromDatabase();
            tabuladorTaller.clientes = await _cargarClientesTabulador();
            console.log('✅ Costos y clientes cargados desde BD');
        } catch (e) {
            console.warn('[Ventas] Error cargando costos desde BD:', e);
        }

        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
        } catch (e) {
            console.warn('[Ventas] _initUI:', e);
        }
        try {
            await _loadInitialData();
        } catch (err) {
            console.error('[Ventas] Error cargando datos iniciales:', err);
            ventas = ventas || [];
            cotizaciones = cotizaciones || [];
            _applyFilters();
        }
        _startClock();
        try {
            _setupRealtime();
        } catch (e) {
            console.warn('[Ventas] Realtime:', e);
        }
        console.log('✅ Módulo ventas iniciado');
    }

    function _setVistaInicial() {
        vistaActual = 'kanban';
        var kanban = document.getElementById('kanbanContainer');
        var lista = document.getElementById('listaContainer');
        var grafica = document.getElementById('graficaContainer');
        if (kanban) kanban.style.display = 'flex';
        if (lista) lista.style.display = 'none';
        if (grafica) grafica.style.display = 'none';
        var btnKanban = document.getElementById('vistaKanban');
        var btnLista = document.getElementById('vistaLista');
        var btnGrafica = document.getElementById('vistaGrafica');
        if (btnKanban) btnKanban.classList.add('active');
        if (btnLista) btnLista.classList.remove('active');
        if (btnGrafica) btnGrafica.classList.remove('active');
    }

    async function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-moon"></i>';
        }
        _setFiltroMesActual();
        _applyUrlQueryFilters();
    }

    function _setFiltroMesActual() {
        const now = new Date();
        filtroFechaInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        filtroFechaFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.valueAsDate = filtroFechaInicio;
        if (filtroFin) filtroFin.valueAsDate = filtroFechaFin;
    }

    function _parseYmdLocal(s) {
        if (!s || typeof s !== 'string') return null;
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    /** Desde Contabilidad: ?desde=&hasta=&estado= */
    function _applyUrlQueryFilters() {
        const p = new URLSearchParams(window.location.search);
        const desde = p.get('desde');
        const hasta = p.get('hasta');
        const estado = p.get('estado');
        if (desde) {
            const d = _parseYmdLocal(desde);
            if (d) {
                filtroFechaInicio = d;
                const el = document.getElementById('filtroFechaInicio');
                if (el) el.valueAsDate = d;
            }
        }
        if (hasta) {
            const d = _parseYmdLocal(hasta);
            if (d) {
                filtroFechaFin = d;
                const el = document.getElementById('filtroFechaFin');
                if (el) el.valueAsDate = d;
            }
        }
        if (estado && ['todos', 'Pendiente', 'Autorizado', 'Rechazadas'].includes(estado)) {
            filtroEstado = estado;
            const sel = document.getElementById('filtroEstado');
            if (sel) sel.value = estado;
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
            el = document.getElementById('clock');
            if (el) el.innerText = fmt24();
        }, 1000);
    }

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        // Fase 1: lo necesario para listas/KPI y wizard (cotización + cliente + inventario)
        await Promise.all([
            _loadVentas(),
            _loadCotizaciones(),
            _loadInventario(),
            _loadContactos()
        ]);
        _populateVendedoresFilter();
        _applyFilters();
        _renderSolicitudesTaller();
        _renderPendientesAutorizacion();

        // Fase 2: vínculos a taller/motores/proyectos/compras — no bloquea el primer pintado
        Promise.all([
            _loadProyectos(),
            _loadTaller(),
            _loadMotores(),
            _loadCompras()
        ])
            .then(() => {
                _renderSolicitudesTaller();
                _renderPendientesAutorizacion();
            })
            .catch((e) => console.warn('[Ventas] carga secundaria:', e));
    }

    async function _loadVentas() {
        try {
            ventas = await ventasService.select(
                {},
                { orderBy: 'fecha', ascending: false, page: 0, pageSize: 400 }
            ) || [];
        } catch (e) {
            console.warn('[Ventas] Error cargando ventas:', e);
            ventas = [];
        }
    }

    async function _loadCotizaciones() {
        try {
            cotizaciones = await cotizacionesService.select(
                {},
                { orderBy: 'fecha_cotizacion', ascending: false, page: 0, pageSize: 400 }
            ) || [];
            console.log('[Ventas] cotizaciones cargadas:', cotizaciones.length, cotizaciones.slice(0, 2));
        } catch (e) {
            try {
                cotizaciones = await cotizacionesService.select(
                    {},
                    { orderBy: 'fecha', ascending: false, page: 0, pageSize: 400 }
                ) || [];
                console.log('[Ventas] cotizaciones (fecha):', cotizaciones.length);
            } catch (e2) {
                try {
                    cotizaciones = await cotizacionesService.select(
                        {},
                        { orderBy: 'fecha_creacion', ascending: false, page: 0, pageSize: 400 }
                    ) || [];
                    console.log('[Ventas] cotizaciones (fecha_creacion):', cotizaciones.length);
                } catch (e3) {
                    console.warn('[Ventas] Error cargando cotizaciones:', e3);
                    cotizaciones = [];
                }
            }
        }
    }

    async function _loadInventario() {
        try {
            inventario = await inventarioService.select({}, { orderBy: 'sku', ascending: true, page: 0, pageSize: 2000 }) || [];
        } catch (e) { console.warn('[Ventas] inventario:', e); inventario = []; }
    }

    async function _loadContactos() {
        try {
            contactos = await contactosService.select({ tipo: 'client' }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 }) || [];
        } catch (e) { console.warn('[Ventas] contactos:', e); contactos = []; }
    }

    async function _loadProyectos() {
        try { proyectos = await proyectosService.select({}, { orderBy: 'fecha', ascending: false, page: 0, pageSize: 800 }) || []; } catch (e) { console.warn('[Ventas] proyectos:', e); proyectos = []; }
    }

    async function _loadTaller() {
        try { taller = await tallerService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 }) || []; } catch (e) { console.warn('[Ventas] taller:', e); taller = []; }
    }

    async function _loadMotores() {
        try { motores = await motoresService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 }) || []; } catch (e) { console.warn('[Ventas] motores:', e); motores = []; }
    }

    async function _loadCompras() {
        try {
            const compras = await comprasService.select({}, { orderBy: 'fecha_creacion', ascending: false, page: 0, pageSize: 800 }) || [];
            solicitudesTaller = compras.filter(c => c.vinculacion?.tipo === 'taller' && c.estado === 1);
        } catch (e) {
            console.warn('[Ventas] compras:', e);
            solicitudesTaller = [];
        }
    }

    function _populateVendedoresFilter() {
        const select = document.getElementById('filtroVendedor');
        if (!select) return;
        const vendedores = new Set();
        ventas.forEach(v => { if (v.vendedor) vendedores.add(v.vendedor); });
        cotizaciones.forEach(c => { if (c.vendedor) vendedores.add(c.vendedor); });
        vendedores.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            select.appendChild(opt);
        });
    }

    /**
     * Inserta un evento en orden_historial para auditar cambios en cotizaciones/ventas/órdenes.
     * @param {string} tipo - 'cotizacion' | 'venta' | 'taller' | 'motor' | 'proyecto'
     * @param {string} id - ID del registro
     * @param {string} evento - Tipo de evento: 'creacion', 'cambio_estado', 'folio_generado', 'compra_vinculada', etc.
     * @param {string} descripcion - Descripción legible del evento
     * @param {string} csrfToken - Token de autenticación
     */
    async function _insertarEventoHistorial(tipo, id, evento, descripcion, csrfToken) {
        if (!window.supabase) return;

        const columnMap = {
            'cotizacion': 'cotizacion_id',
            'venta': 'cotizacion_id',
            'taller': 'orden_taller_id',
            'motor': 'orden_motor_id',
            'proyecto': 'proyecto_id',
            'automatizacion': 'proyecto_id'
        };
        const columnName = columnMap[tipo] || 'cotizacion_id';

        const row = {
            [columnName]: id,
            evento,
            descripcion,
            creado_por: (await authService.getCurrentProfile())?.id || null
        };

        try {
            const { data, error } = await window.supabase
                .from('orden_historial')
                .insert(row)
                .select()
                .single();

            if (error) {
                console.warn('[Ventas] Error insertando evento en historial:', error);
            } else {
                console.log(`[Ventas] Evento registrado en historial: ${evento} para ${tipo} ${id}`);
                // Disparar actualización del timeline si el modal está abierto
                const modalAbierto = document.getElementById('historialModal');
                if (modalAbierto && modalAbierto.classList.contains('active')) {
                    _mostrarHistorial(id, tipo);
                }
            }
            return data;
        } catch (error) {
            console.error('[Ventas] _insertarEventoHistorial:', error);
            return null;
        }
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;

        // Realtime para ventas
        const subVentas = supabase
            .channel('ventas_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, payload => {
                _loadVentas().then(() => {
                    _applyFilters();
                    _addToFeed('📊', 'Datos de ventas actualizados');
                    if (payload.new && payload.eventType !== 'DELETE') {
                        notifyVentaIfEligible(payload.new, payload.old);
                    }
                });
            })
            .subscribe();
        subscriptions.push(subVentas);

        // Realtime para cotizaciones
        const subCotizaciones = supabase
            .channel('cotizaciones_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, payload => {
                _loadCotizaciones().then(() => {
                    _renderPendientesAutorizacion();
                    _applyFilters();
                });
            })
            .subscribe();
        subscriptions.push(subCotizaciones);

        // Realtime para compras
        const subCompras = supabase
            .channel('compras_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                _loadCompras();
                _renderSolicitudesTaller();
            })
            .subscribe();
        subscriptions.push(subCompras);

        // Realtime para ordenes_taller (sincronización con Ventas)
        const subTaller = supabase
            .channel('taller_realtime_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_taller' }, payload => {
                _loadTaller().then(() => {
                    _renderSolicitudesTaller();
                    _applyFilters(); // Refrescar kanban por si hay cambios de estado
                });
            })
            .subscribe();
        subscriptions.push(subTaller);

        // Realtime para ordenes_motores (sincronización con Ventas)
        const subMotores = supabase
            .channel('motores_realtime_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_motores' }, payload => {
                _loadMotores().then(() => {
                    _renderSolicitudesTaller();
                    _applyFilters();
                });
            })
            .subscribe();
        subscriptions.push(subMotores);

        // Realtime para proyectos_automatizacion (sincronización con Ventas)
        const subProyectos = supabase
            .channel('proyectos_realtime_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_automatizacion' }, payload => {
                _loadProyectos().then(() => {
                    _renderSolicitudesTaller();
                    _applyFilters();
                });
            })
            .subscribe();
        subscriptions.push(subProyectos);

        // Realtime para orden_historial (actualizar timeline cuando llegue nuevo evento)
        const subHistorial = supabase
            .channel('historial_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orden_historial' }, payload => {
                // Verificar si el evento es relevante para una cotización/venta visible
                const nueva = payload.new;
                const idAfectado = nueva.cotizacion_id || nueva.orden_taller_id || nueva.orden_motor_id || nueva.proyecto_id;
                if (idAfectado) {
                    // Refresh del feed lateral
                    _addToFeed('📝', `Nuevo evento en historial: ${nueva.evento}`);
                    // Si el modal de historial está abierto para este ID, refrescar
                    const modalAbierto = document.getElementById('historialModal');
                    if (modalAbierto && modalAbierto.classList.contains('active')) {
                        // Determinar tipo basado en qué campo tiene el ID
                        const tipo = nueva.cotizacion_id ? 'cotizacion' : nueva.orden_taller_id ? 'taller' : nueva.orden_motor_id ? 'motor' : 'proyecto';
                        _mostrarHistorial(idAfectado, tipo);
                    }
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);
    }

    // ==================== FILTROS Y VISTAS ====================
    /** Une ventas + cotizaciones marcando tipo para no mezclar órdenes operativas con el flujo comercial. */
    function _mergeVentasCotizaciones() {
        const v = (Array.isArray(ventas) ? ventas : []).map((r) => ({ ...r, tipo: r.tipo || 'venta' }));
        const c = (Array.isArray(cotizaciones) ? cotizaciones : []).map((r) => ({ ...r, tipo: 'cotizacion' }));
        return [...v, ...c];
    }

    /** Compara solo la fecha local (evita que cotizaciones del último día del mes queden fuera por zona horaria). */
    function _fechaItemEnRango(item) {
        if (!filtroFechaInicio || !filtroFechaFin) return true;
        const raw = item.fecha ?? item.fecha_cotizacion ?? item.fecha_creacion;
        if (!raw) return true;
        const t = new Date(raw);
        if (Number.isNaN(t.getTime())) return true;
        const d = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
        const a = new Date(filtroFechaInicio.getFullYear(), filtroFechaInicio.getMonth(), filtroFechaInicio.getDate()).getTime();
        const b = new Date(filtroFechaFin.getFullYear(), filtroFechaFin.getMonth(), filtroFechaFin.getDate()).getTime();
        return d >= a && d <= b;
    }

    function _applyFilters() {
        let filtered = _mergeVentasCotizaciones();

        filtered = filtered.filter(_fechaItemEnRango);
        if (filtroVendedor !== 'todos') {
            filtered = filtered.filter(item => item.vendedor === filtroVendedor);
        }
        if (filtroEstado !== 'todos') {
            if (filtroEstado === 'registro') {
                filtered = filtered.filter((item) => {
                    const e = String(item.estado || '').trim().toLowerCase();
                    if (e === 'registro') return true;
                    // "Nuevo" solo en cotizaciones; en `ventas` u otros módulos no debe colarse en este filtro
                    return item.tipo === 'cotizacion' && e === 'nuevo';
                });
            } else if (filtroEstado === 'diagnostico') {
                filtered = filtered.filter(item => item.estado === 'diagnostico' || item.estado === 'en_diagnostico');
            } else if (filtroEstado === 'cotizacion') {
                filtered = filtered.filter(item => item.estado === 'cotizacion' || item.estado === 'pendiente_autorizacion_ventas');
            } else if (filtroEstado === 'autorizado') {
                filtered = filtered.filter(item => item.estado === 'autorizado' || item.estado === 'autorizada_por_ventas');
            } else if (filtroEstado === 'compra') {
                filtered = filtered.filter(item => item.estado === 'compra' || item.estado === 'en_compra');
            } else if (filtroEstado === 'ejecucion') {
                filtered = filtered.filter(item => item.estado === 'ejecucion' || item.estado === 'en_ejecucion');
            } else if (filtroEstado === 'entregado') {
                filtered = filtered.filter(item => item.estado === 'entregado' || item.estatus_pago === 'Pendiente');
            } else if (filtroEstado === 'pagado') {
                filtered = filtered.filter(item => item.estatus_pago === 'Pagado' || item.estado === 'pagado');
            }
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(item =>
                (item.cliente && item.cliente.toLowerCase().includes(term)) ||
                (item.folio && item.folio.toLowerCase().includes(term))
            );
        }

        _syncChipEstado();
        // Kanban operativo = solo cotizaciones (no filas de `ventas` ni órdenes de otros módulos con estado "Nuevo").
        if (vistaActual === 'kanban') {
            // Filtro más permisivo: incluye cotizaciones o items sin tipo pero con campos de cotización
            const soloCot = filtered.filter((i) => {
                if (i.tipo === 'cotizacion') return true;
                // Si no tiene tipo pero tiene campos típicos de cotización, también es cotización
                if (!i.tipo && (i.cerebro_registro || i.origen === 'ventas_wizard')) return true;
                return false;
            });
            console.log('[Ventas] Kanban:', { total: filtered.length, cotizaciones: soloCot.length, data: soloCot.slice(0, 3) });
            _renderKanban(soloCot);
        } else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        // Renderizar Historia Comercial si hay cotizaciones cargadas (independiente de la vista)
        if (cotizaciones && cotizaciones.length > 0) {
            _renderHistoriaComercial();
        }

        _updateKPIs(filtered);
    }

    function _syncChipEstado() {
        document.querySelectorAll('.chip-filtro').forEach(function (chip) {
            var estado = chip.getAttribute('data-estado');
            if (estado === filtroEstado) chip.classList.add('active');
            else chip.classList.remove('active');
        });
    }

    async function _renderKanban(items) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;

        // Nuevos estatus para kanban
        const es = (i) => String(i.estado || '').trim().toLowerCase();
        const registro = items.filter((i) => es(i) === 'registro' || es(i) === 'nuevo');
        const diagnostico = items.filter((i) => es(i) === 'diagnostico' || es(i) === 'en_diagnostico');
        const cotizacion = items.filter((i) => es(i) === 'cotizacion' || es(i) === 'pendiente_autorizacion_ventas');
        const autorizado = items.filter((i) => es(i) === 'autorizado' || es(i) === 'autorizada_por_ventas');
        const compra = items.filter((i) => es(i) === 'compra' || es(i) === 'en_compra');
        const ejecucion = items.filter((i) => es(i) === 'ejecucion' || es(i) === 'en_ejecucion');
        const entregado = items.filter((i) => es(i) === 'entregado' || (i.tipo !== 'cotizacion' && i.estatus_pago === 'Pendiente'));
        const pagado = items.filter((i) => i.estatus_pago === 'Pagado' || es(i) === 'pagado');

        // Renderizar tarjetas asíncronamente para cargar folios vinculados
        const [cardsRegistro, cardsDiagnostico, cardsCotizacion, cardsAutorizado, cardsCompra, cardsEjecucion, cardsEntregado, cardsPagado] = await Promise.all([
            _renderKanbanCardsAsync(registro),
            _renderKanbanCardsAsync(diagnostico),
            _renderKanbanCardsAsync(cotizacion),
            _renderKanbanCardsAsync(autorizado),
            _renderKanbanCardsAsync(compra),
            _renderKanbanCardsAsync(ejecucion),
            _renderKanbanCardsAsync(entregado),
            _renderKanbanCardsAsync(pagado)
        ]);

        let html = `
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #9e9e9e;">
                    <span>Registro</span>
                    <span class="badge" style="background: #9e9e9e;">${registro.length}</span>
                </div>
                <div class="kanban-cards">${cardsRegistro}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #2196f3;">
                    <span>Diagnóstico</span>
                    <span class="badge" style="background: #2196f3;">${diagnostico.length}</span>
                </div>
                <div class="kanban-cards">${cardsDiagnostico}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #ff9800;">
                    <span>Cotización</span>
                    <span class="badge" style="background: #ff9800;">${cotizacion.length}</span>
                </div>
                <div class="kanban-cards">${cardsCotizacion}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #4caf50;">
                    <span>Autorizado</span>
                    <span class="badge" style="background: #4caf50;">${autorizado.length}</span>
                </div>
                <div class="kanban-cards">${cardsAutorizado}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #9c27b0;">
                    <span>En Compra</span>
                    <span class="badge" style="background: #9c27b0;">${compra.length}</span>
                </div>
                <div class="kanban-cards">${cardsCompra}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #ff5722;">
                    <span>En Ejecución</span>
                    <span class="badge" style="background: #ff5722;">${ejecucion.length}</span>
                </div>
                <div class="kanban-cards">${cardsEjecucion}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #00bcd4;">
                    <span>Entregado</span>
                    <span class="badge" style="background: #00bcd4;">${entregado.length}</span>
                </div>
                <div class="kanban-cards">${cardsEntregado}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #4caf50;">
                    <span>Pagado</span>
                    <span class="badge" style="background: #4caf50;">${pagado.length}</span>
                </div>
                <div class="kanban-cards">${cardsPagado}</div>
            </div>
        `;
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id, card.dataset.tipo));
        });
    }

    /**
     * Obtiene el folio y estatus de la orden operativa vinculada a una cotización.
     * Busca en taller, motores o proyectos según el origen.
     */
    async function _getFolioOrdenVinculada(cotizacion) {
        if (!cotizacion.orden_origen_id || !window.supabase) return null;

        try {
            // Intentar en ordenes_taller
            if (cotizacion.origen === 'taller') {
                const { data } = await window.supabase
                    .from('ordenes_taller')
                    .select('folio, estado')
                    .eq('id', cotizacion.orden_origen_id)
                    .single();
                if (data?.folio) return { tipo: 'taller', folio: data.folio, estado: data.estado };
            }

            // Intentar en ordenes_motores
            if (cotizacion.origen === 'motor' || cotizacion.origen === 'motores') {
                const { data } = await window.supabase
                    .from('ordenes_motores')
                    .select('folio, estado')
                    .eq('id', cotizacion.orden_origen_id)
                    .single();
                if (data?.folio) return { tipo: 'motor', folio: data.folio, estado: data.estado };
            }

            // Intentar en proyectos_automatizacion
            if (cotizacion.origen === 'automatizacion' || cotizacion.origen === 'proyecto' || cotizacion.origen === 'proyectos') {
                const { data } = await window.supabase
                    .from('proyectos_automatizacion')
                    .select('folio, estado')
                    .eq('id', cotizacion.orden_origen_id)
                    .single();
                if (data?.folio) return { tipo: 'proyecto', folio: data.folio, estado: data.estado };
            }

            // Búsqueda genérica si no hay origen claro
            for (const tabla of ['ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion']) {
                const { data } = await window.supabase
                    .from(tabla)
                    .select('folio, estado')
                    .eq('id', cotizacion.orden_origen_id)
                    .single();
                if (data?.folio) {
                    const tipoMap = { ordenes_taller: 'taller', ordenes_motores: 'motor', proyectos_automatizacion: 'proyecto' };
                    return { tipo: tipoMap[tabla], folio: data.folio };
                }
            }
        } catch (e) {
            console.warn('[Ventas] Error obteniendo folio vinculado:', e);
        }
        return null;
    }

    /**
     * Renderiza las tarjetas del Kanban con etiqueta de "Creada en Taller/Motor/Proyecto" si aplica.
     * Función asíncrona para poder consultar los folios vinculados.
     */
    async function _renderKanbanCardsAsync(items) {
        if (items.length === 0) return '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin elementos</div>';

        // Precargar folios vinculados para todas las cotizaciones
        const foliosVinculados = await Promise.all(
            items.map(async item => {
                if (item.tipo === 'cotizacion' && item.orden_origen_id) {
                    return await _getFolioOrdenVinculada(item);
                }
                return null;
            })
        );

        const iconos = {
            'taller': '🔬',
            'motor': '🏭',
            'proyecto': '🤖'
        };

        const etiquetas = {
            'taller': 'Laboratorio',
            'motor': 'Motores',
            'proyecto': 'Automatización'
        };

        const estadoColores = {
            'Nuevo': '#3b82f6',
            'Confirmado': '#8b5cf6',
            'Diagnóstico': '#f59e0b',
            'En Espera': '#f59e0b',
            'En reparación': '#f59e0b',
            'Reparado': '#10b981',
            'Entregado': '#059669',
            'Cancelado': '#ef4444',
            'pendiente': '#3b82f6',
            'en_proceso': '#f59e0b',
            'completado': '#10b981'
        };

        return items.map((item, idx) => {
            const folioVinculado = foliosVinculados[idx];
            const etiquetaHtml = folioVinculado
                ? `<div class="vinculacion-badge" title="Orden creada en ${etiquetas[folioVinculado.tipo]}: ${folioVinculado.folio} (${folioVinculado.estado || 'N/A'})">
                    <span>${iconos[folioVinculado.tipo]}</span> ${etiquetas[folioVinculado.tipo]}: ${folioVinculado.folio}
                    ${folioVinculado.estado ? `<span style="margin-left: 6px; padding: 2px 6px; background: ${estadoColores[folioVinculado.estado] || '#666'}; color: white; border-radius: 4px; font-size: 10px;">${folioVinculado.estado}</span>` : ''}
                   </div>`
                : '';

            return `
                <div class="kanban-card" data-id="${item.id}" data-tipo="${item.tipo || 'venta'}">
                    <div class="card-header">
                        <span class="folio">${item.folio || item.id.slice(-6)}</span>
                    </div>
                    ${etiquetaHtml ? `<div class="card-vinculacion">${etiquetaHtml}</div>` : ''}
                    <div class="card-body">
                        <div class="cliente">${item.cliente || 'Cliente'}</div>
                        <div class="total">$${(item.total || 0).toFixed(2)}</div>
                    </div>
                    <div class="card-footer">
                        <small>${item.fecha ? new Date(item.fecha).toLocaleDateString() : ''}</small>
                        <small>${item.vendedor || ''}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _renderKanbanCards(items) {
        // Wrapper síncrono para compatibilidad - se llama desde _renderKanban
        // Para versión con folios vinculados, usar _renderKanbanCardsAsync
        if (items.length === 0) return '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin elementos</div>';
        return items.map(item => `
            <div class="kanban-card" data-id="${item.id}" data-tipo="${item.tipo || 'venta'}">
                <div class="card-header">
                    <span class="folio">${item.folio || item.id.slice(-6)}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${item.cliente || 'Cliente'}</div>
                    <div class="total">$${(item.total || 0).toFixed(2)}</div>
                </div>
                <div class="card-footer">
                    <small>${item.fecha ? new Date(item.fecha).toLocaleDateString() : ''}</small>
                    <small>${item.vendedor || ''}</small>
                </div>
            </div>
        `).join('');
    }

    function _renderLista(items) {
        const tbody = document.getElementById('tablaVentasBody');
        if (!tbody) return;
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay registros</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(item => {
            const fecha = item.fecha ? new Date(item.fecha).toLocaleDateString('es-MX') : '--/--/----';
            const folio = item.folio || item.id.slice(-6);
            const cliente = item.cliente || 'N/A';
            const tipo = item.tipo === 'cotizacion' ? 'Cotización' : 'Venta';
            const estatus = item.tipo === 'cotizacion' ? (item.estado || 'Pendiente') : (item.estatus_pago || 'Pendiente');
            const total = item.total || 0;
            let estatusClass = '';
            if (estatus === 'Pagado') estatusClass = 'status-pagado';
            else if (estatus === 'Pendiente') estatusClass = 'status-pendiente';
            else if (item.tipo === 'cotizacion') estatusClass = 'status-cotizacion';
            return `
                <tr onclick="ventasModule._abrirDetalle('${item.id}', '${item.tipo || 'venta'}')">
                    <td>${fecha}</td>
                    <td><strong>${folio}</strong></td>
                    <td>${cliente}</td>
                    <td>${tipo}</td>
                    <td><span class="status-badge ${estatusClass}">${estatus}</span></td>
                    <td>$${total.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-info" style="background:#0077b6;color:#fff;" onclick="event.stopPropagation(); ventasModule._abrirDetalle('${item.id}', '${item.tipo || 'venta'}')" title="Ver historial">
                            <i class="fas fa-history"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); ventasModule._editarVenta('${item.id}', '${item.tipo || 'venta'}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${item.tipo === 'cotizacion' ? `
                            <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); ventasModule._reenviarCotizacion('${item.id}')" title="Reenviar">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    function _renderGrafica(items) {
        const canvas = document.getElementById('ventasChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (chartInstance) chartInstance.destroy();

        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const ingresos = new Array(12).fill(0);
        const cotizaciones = new Array(12).fill(0);

        items.forEach(item => {
            if (!item.fecha) return;
            const fecha = new Date(item.fecha);
            const mes = fecha.getMonth();
            if (item.tipo === 'cotizacion') {
                cotizaciones[mes] += item.total || 0;
            } else if (item.estatus_pago === 'Pagado') {
                ingresos[mes] += item.total || 0;
            }
        });

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [
                    { label: 'Ventas Cerradas', data: ingresos, backgroundColor: 'rgba(0,82,204,0.8)', borderColor: '#0052cc', borderWidth: 1 },
                    { label: 'Ingresos Proyectados (cotizaciones)', data: cotizaciones, backgroundColor: 'rgba(255,152,0,0.8)', borderColor: '#ff9800', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Ingresos Proyectados vs Ventas Cerradas (por mes)' }
                },
                scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return '$' + Number(v).toLocaleString(); } } } }
            }
        });
    }

    function _updateKPIs(items) {
        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();

        let totalVentasDinero = 0;   // Total de ventas (cerradas/pagadas en período)
        let cotizacionesPendientesCount = 0;
        let sumaTotalVentas = 0;
        let countVentasCerradas = 0;

        const allCotizaciones = Array.isArray(cotizaciones) ? cotizaciones : [];
        cotizacionesPendientesCount = allCotizaciones.filter(c =>
            c.estado === 'pendiente_autorizacion_ventas' || !c.estado
        ).length;

        (Array.isArray(items) ? items : []).forEach(item => {
            if (item.tipo === 'cotizacion') {
                // ya contamos pendientes arriba
            } else {
                const fecha = item.fecha ? new Date(item.fecha) : null;
                const total = item.total || 0;
                if (item.estatus_pago === 'Pagado') {
                    if (fecha && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                        totalVentasDinero += total;
                    }
                    countVentasCerradas++;
                    sumaTotalVentas += total;
                }
            }
        });

        const ticketPromedio = countVentasCerradas ? sumaTotalVentas / countVentasCerradas : 0;
        const margenObjetivo = 40; // % por defecto; si en el futuro se guarda margen por venta se puede promediar

        const elTotalVentas = document.getElementById('kpiTotalVentas');
        const elCotizPend = document.getElementById('kpiCotizacionesPendientes');
        const elMargen = document.getElementById('kpiMargenUtilidad');
        const elTicket = document.getElementById('kpiTicketPromedio');
        if (elTotalVentas) elTotalVentas.innerHTML = '$' + totalVentasDinero.toLocaleString('es-MX', { minimumFractionDigits: 2 });
        if (elCotizPend) elCotizPend.innerText = cotizacionesPendientesCount;
        if (elMargen) elMargen.innerHTML = margenObjetivo + '%';
        if (elTicket) elTicket.innerHTML = countVentasCerradas ? '$' + ticketPromedio.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '$0';
    }

    // ==================== SOLICITUDES DE TALLER ====================
    function _renderSolicitudesTaller() {
        const container = document.getElementById('solicitudesTaller');
        if (!container) return;
        if (solicitudesTaller.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay solicitudes pendientes</div>';
            return;
        }
        container.innerHTML = solicitudesTaller.map(s => `
            <div class="solicitud-card">
                <div class="solicitud-header">
                    <span class="solicitud-folio">${s.folio || s.id.slice(-6)}</span>
                    <span class="solicitud-cliente">${s.vinculacion?.nombre || 'Cliente'}</span>
                </div>
                <div class="solicitud-total">$${(s.total || 0).toFixed(2)}</div>
                <div class="solicitud-items">${s.items?.length || 0} producto(s)</div>
                <div class="solicitud-acciones">
                    <button class="btn btn-sm btn-primary" onclick="ventasModule._abrirCalculadora('${s.id}')">
                        <i class="fas fa-calculator"></i> Calcular
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="ventasModule._verOrdenTaller('${s.id}')" title="Ver orden">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="ventasModule._editarOrdenTaller('${s.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="ventasModule._eliminarOrdenTaller('${s.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    function _renderPendientesAutorizacion() {
        const container = document.getElementById('pendientesAutorizacion');
        if (!container) return;
        const pendientes = cotizaciones.filter(c => c.estado === 'pendiente_autorizacion_ventas');
        if (pendientes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay cotizaciones pendientes</div>';
            return;
        }
        container.innerHTML = pendientes.map(c => `
            <div class="solicitud-card">
                <div class="solicitud-header">
                    <span class="solicitud-folio">${c.folio || c.id.slice(-6)}</span>
                    <span class="solicitud-cliente">${c.cliente}</span>
                </div>
                <div class="solicitud-total">$${(c.total || 0).toFixed(2)}</div>
                <div class="solicitud-items">Origen: ${c.origen || 'Taller'}</div>
                <div class="solicitud-acciones">
                    <button class="btn btn-sm btn-success" onclick="ventasModule._autorizarCotizacion('${c.id}')">
                        <i class="fas fa-check"></i> Autorizar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="ventasModule._rechazarCotizacion('${c.id}')">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ==================== VER / EDITAR / ELIMINAR ÓRDENES DE TALLER ====================
    async function _verOrdenTaller(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;
        const ordenTallerId = compra.vinculacion?.id;
        if (!ordenTallerId) { alert('No hay orden de taller vinculada'); return; }
        const orden = taller.find(o => o.id === ordenTallerId);
        if (!orden) { alert('Orden no encontrada en Taller'); return; }
        alert(`Orden ${orden.folio}\nCliente: ${orden.cliente_nombre || 'N/A'}\nEstado: ${orden.estado || 'Pendiente'}\nEquipo: ${orden.equipo || 'N/A'}`);
    }

    async function _editarOrdenTaller(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;
        const ordenTallerId = compra.vinculacion?.id;
        if (!ordenTallerId) { alert('No hay orden de taller vinculada'); return; }
        const orden = taller.find(o => o.id === ordenTallerId);
        if (!orden) { alert('Orden no encontrada en Taller'); return; }
        alert('Función de edición en implementación. ID: ' + ordenTallerId);
    }

    function _eliminarOrdenTaller(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;
        const folio = compra.folio || compra.id.slice(-6);
        const cliente = compra.vinculacion?.nombre || 'N/A';
        const equipo = compra.vinculacion?.equipo || '—';
        _showDeleteConfirm(folio, cliente, equipo, async () => {
            try {
                const ordenTallerId = compra.vinculacion?.id;
                if (ordenTallerId) {
                    const { error: err1 } = await window.supabase.from('ordenes_taller').delete().eq('id', ordenTallerId);
                    if (err1) throw err1;
                }
                const { error: err2 } = await window.supabase.from('compras').delete().eq('id', compraId);
                if (err2) throw err2;
                _addToFeed('🗑️', 'Orden eliminada: ' + folio);
                await _loadCompras();
                _renderSolicitudesTaller();
            } catch (e) {
                console.error(e);
                _showErrorModal('Error al eliminar', e.message);
            }
        });
    }

    function _showDeleteConfirm(folio, cliente, equipo, onConfirm) {
        const existing = document.getElementById('ssepiDeleteConfirmModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'ssepiDeleteConfirmModal';
        modal.className = 'ssepi-modal-overlay';
        modal.innerHTML = `
            <div class="ssepi-delete-modal">
                <div class="ssepi-modal-header">
                    <div class="ssepi-modal-icon warning">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 class="ssepi-modal-title">¿Eliminar orden ${folio}?</h3>
                </div>
                <div class="ssepi-modal-body">
                    <div class="ssepi-info-row">
                        <span class="ssepi-info-label">Cliente:</span>
                        <span class="ssepi-info-value">${cliente}</span>
                    </div>
                    <div class="ssepi-info-row">
                        <span class="ssepi-info-label">Equipo:</span>
                        <span class="ssepi-info-value">${equipo}</span>
                    </div>
                    <p class="ssepi-warning-text">
                        <i class="fas fa-triangle-exclamation"></i>
                        Esta acción no se puede deshacer.
                    </p>
                </div>
                <div class="ssepi-modal-footer">
                    <button class="ssepi-btn ssepi-btn-cancel">Cancelar</button>
                    <button class="ssepi-btn ssepi-btn-delete">Eliminar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
        modal.querySelector('.ssepi-btn-cancel').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        });
        modal.querySelector('.ssepi-btn-delete').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
            onConfirm();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 300);
            }
        });
    }

    function _showErrorModal(title, message) {
        const existing = document.getElementById('ssepiErrorModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'ssepiErrorModal';
        modal.className = 'ssepi-modal-overlay';
        modal.innerHTML = `
            <div class="ssepi-error-modal">
                <div class="ssepi-modal-header">
                    <div class="ssepi-modal-icon error">
                        <i class="fas fa-circle-xmark"></i>
                    </div>
                    <h3 class="ssepi-modal-title">${title}</h3>
                </div>
                <div class="ssepi-modal-body">
                    <p class="ssepi-error-message">${message}</p>
                </div>
                <div class="ssepi-modal-footer">
                    <button class="ssepi-btn ssepi-btn-primary">Aceptar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
        modal.querySelector('.ssepi-btn-primary').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        });
    }

    // ==================== CALCULADORA DE COSTOS ====================
    async function _abrirCalculadora(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;

        compraActual = compra;
        const ordenTallerId = compra.vinculacion?.id;

        let horasEstimadas = 0;
        if (ordenTallerId) {
            const orden = taller.find(o => o.id === ordenTallerId);
            if (orden) horasEstimadas = orden.horas_estimadas || 0;
        }

        const clienteNombre = (compra.vinculacion?.nombre || '').trim() || 'Cliente';

        // Cargar clientes desde BD si está vacío
        if (tabuladorTaller.clientes.length === 0) {
            tabuladorTaller.clientes = await _cargarClientesTabulador();
        }

        const clienteTabulador = tabuladorTaller.clientes.find(c => c.nombre === clienteNombre);
        calculadoraClienteActual = {
            nombre: clienteNombre,
            km: clienteTabulador?.km || 0,
            horas: clienteTabulador?.horas || 0
        };

        calculadoraComponentes = [];
        wizardPaso = 2;

        const modal = document.getElementById('calculadoraModal');
        await _renderWizardPaso(2);
        modal.classList.add('active');
        _bindWizardEvents();
    }

    function _generarHTMLCalculadora(compra, horasEstimadas) {
        const cliente = calculadoraClienteActual;
        const rolActual = sessionStorage.getItem('ssepi_rol') || '';
        const esAdmin = ['admin', 'automatizacion', 'electronica', 'superadmin'].includes(rolActual);

        // Verificar si hay orden de compras vinculada (para desbloquear)
        const hayOrdenCompras = compra?.vinculacion?.orden_compras_id || compra?.orden_compras_id || false;

        // Calcular costos en tiempo real
        const gasolina = CostosEngine.calcularCostoGasolina(cliente.km || 0);
        const traslado = CostosEngine.calcularCostoTrasladoTecnico(cliente.horas || 0);
        const gasolinaMasTraslado = CostosEngine.calcularGasolinaMasTraslado(cliente.km || 0, cliente.horas || 0);
        const manoObraBase = CostosEngine.calcularManoObra(horasEstimadas || 0);
        const gastosFijosBase = CostosEngine.calcularGastosFijos(horasEstimadas || 0);
        const camionetaBase = CostosEngine.calcularCostoCamioneta(cliente.horas || 0);

        // Calcular total final
        const totalFinal = CostosEngine.calcularPrecioFinal({
            km: Number(cliente.km) || 0,
            horasViaje: Number(cliente.horas) || 0,
            horasTaller: horasEstimadas || 0,
            costoRefacciones: 0
        }).total;

        // Estado de bloqueo
        const bloqueado = !hayOrdenCompras;

        // VISTA DE PREVIEW BLOQUEADO - Paso 2 en espera de compras
        if (bloqueado) {
            return `
                <div class="calculadora-section" style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
                    <div style="color: white; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">
                        <i class="fas fa-hourglass-half"></i> En Espera de Orden de Compras
                    </div>
                    <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin-top: 8px;">
                        Esta sección se desbloqueará cuando se genere la orden de compras/materiales
                    </p>
                </div>

                <div class="calculadora-section" style="background: var(--bg-panel); border: 1px solid var(--border); padding: 20px; border-radius: 12px;">
                    <div class="calculadora-titulo" style="background: var(--c-taller); color: white; margin-bottom: 16px;">
                        <i class="fas fa-gas-pump"></i> Preview de Costos en Tiempo Real
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px;">
                        <div style="background: #1a3a3a; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Gasolina</div>
                            <div style="color: var(--c-ventas); font-size: 24px; font-weight: 700;" id="previewGasolina">$${gasolina.toFixed(2)}</div>
                            <div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">${(cliente.km || 0).toFixed(1)} km</div>
                        </div>
                        <div style="background: #1a3a3a; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Traslado Técnico</div>
                            <div style="color: var(--c-taller); font-size: 24px; font-weight: 700;" id="previewTraslado">$${traslado.toFixed(2)}</div>
                            <div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">${(cliente.horas || 0).toFixed(1)} hrs</div>
                        </div>
                        <div style="background: #1a3a3a; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Gasolina + Traslado</div>
                            <div style="color: var(--c-automatizacion); font-size: 24px; font-weight: 700;" id="previewGasPlus">$${gasolinaMasTraslado.toFixed(2)}</div>
                        </div>
                        <div style="background: #1a3a3a; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Mano de Obra</div>
                            <div style="color: var(--c-inventario); font-size: 24px; font-weight: 700;" id="previewManoObra">$${manoObraBase.toFixed(2)}</div>
                            <div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">${horasEstimadas || 0} hrs taller</div>
                        </div>
                    </div>

                    <div style="background: #0f1f1f; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-muted); font-size: 12px;">Gastos Fijos</span>
                            <span style="color: var(--text); font-weight: 600;" id="previewGastosFijos">$${gastosFijosBase.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-muted); font-size: 12px;">Camioneta</span>
                            <span style="color: var(--text); font-weight: 600;" id="previewCamioneta">$${camionetaBase.toFixed(2)}</span>
                        </div>
                        <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Subtotal Estimado</span>
                                <span style="color: var(--text); font-weight: 700;" id="previewSubtotal">$${(totalFinal / 1.16).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="total-box" style="background: linear-gradient(135deg, var(--c-ventas), #059669); padding: 20px; border-radius: 8px; text-align: center;">
                        <div style="color: white; font-size: 12px; text-transform: uppercase; margin-bottom: 8px;">Total Estimado (con IVA)</div>
                        <div style="color: white; font-size: 36px; font-weight: 800;" id="previewTotal">$${totalFinal.toFixed(2)}</div>
                    </div>

                    <div style="margin-top: 20px; padding: 16px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px; color: #ffc107; font-size: 13px;">
                            <i class="fas fa-lock"></i>
                            <span>Sección bloqueada - Los costos se actualizarán automáticamente cuando se genere la orden de compras</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // VISTA COMPLETA DESBLOQUEADA - Cuando hay orden de compras
        return `
            <div class="calculadora-section" style="background: linear-gradient(135deg, var(--c-ventas, #10b981), #059669); padding: 24px; border-radius: 12px; text-align: center;">
                <div style="color: white; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">
                    <i class="fas fa-check-circle"></i> Orden de Compras Generada - Costo Final
                </div>
                <div style="color: white; font-size: 42px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    $${totalFinal.toFixed(2)}
                </div>
                <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 12px;">
                    Incluye viáticos, mano de obra, refacciones e IVA
                </p>
            </div>

            <div class="calculadora-section" style="margin-top: 20px;">
                <div class="calculadora-titulo" style="background: var(--c-ventas, #10b981); color: white;">
                    <i class="fas fa-boxes"></i> Refacciones y Componentes
                </div>
                <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">
                    Agrega refacciones desde el Inventario Maestro o componentes manualmente.
                </p>
                <table class="componentes-table">
                    <thead><tr><th>Componente</th><th>Cantidad</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody id="componentesTableBody"></tbody>
                </table>
                <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:10px; margin-top:15px;">
                    <input type="text" id="compNombre" placeholder="Componente" style="padding:8px;">
                    <input type="number" id="compCantidad" value="1" min="1" style="padding:8px;">
                    <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarComponente()">Agregar</button>
                </div>
            </div>
            <button type="button" class="btn btn-sm btn-primary" onclick="ventasModule._abrirEditorCostos()" style="margin-top: 16px; width: 100%; background: linear-gradient(135deg, #6b7280, #4b5563);">
                <i class="fas fa-table"></i> Ver Tablas de Costos y Gastos Fijos
            </button>
        `;
    }

    function _agregarComponente() {
        const nombre = document.getElementById('compNombre')?.value;
        const cantidad = parseFloat(document.getElementById('compCantidad')?.value) || 1;
        const costo = parseFloat(document.getElementById('compCosto')?.value) || 0;
        if (!nombre) { alert('Ingrese el nombre del componente'); return; }
        calculadoraComponentes.push({ nombre, cantidad, costo_unitario: costo, subtotal: cantidad * costo });
        _renderizarComponentes();
        _recalcular();
        document.getElementById('compNombre').value = '';
        document.getElementById('compCantidad').value = 1;
        document.getElementById('compCosto').value = 0;
    }

    function _renderizarComponentes() {
        const tbody = document.getElementById('componentesTableBody');
        if (!tbody) return;
        if (calculadoraComponentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay componentes agregados</td></tr>';
            return;
        }
        tbody.innerHTML = calculadoraComponentes.map((comp, idx) => `
            <tr>
                <td>${comp.nombre}</td>
                <td>${comp.cantidad}</td>
                <td>$${comp.costo_unitario.toFixed(2)}</td>
                <td>$${comp.subtotal.toFixed(2)}</td>
                <td><button class="btn-remove" onclick="ventasModule._eliminarComponente(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _eliminarComponente(idx) {
        calculadoraComponentes.splice(idx, 1);
        _renderizarComponentes();
        _recalcular();
    }

    function _refreshLogisticaFromInputs() {
        const kmIn = document.getElementById('inpLogisticaKm');
        const hrsIn = document.getElementById('inpLogisticaHoras');
        if (!kmIn || !hrsIn || !calculadoraClienteActual) return;
        const km = parseFloat(kmIn.value) || 0;
        const horas = parseFloat(hrsIn.value) || 0;
        calculadoraClienteActual.km = km;
        calculadoraClienteActual.horas = horas;
        const gasolina = CostosEngine.calcularCostoGasolina(km);
        const traslado = CostosEngine.calcularCostoTrasladoTecnico(horas);
        const gasPlus = CostosEngine.calcularGasolinaMasTraslado(km, horas);
        const lg = document.getElementById('lblLogisticaGasolina');
        const lt = document.getElementById('lblLogisticaTraslado');
        const lp = document.getElementById('lblLogisticaGasPlus');
        if (lg) lg.textContent = '$' + gasolina.toFixed(2);
        if (lt) lt.textContent = '$' + traslado.toFixed(2);
        if (lp) lp.textContent = '$' + gasPlus.toFixed(2);
        const vgps = document.getElementById('valGasPlusSales');
        if (vgps) vgps.textContent = '$' + gasPlus.toFixed(2);
        const camionetaBase = CostosEngine.calcularCostoCamioneta(horas);
        const elTruck = document.getElementById('valTruck');
        if (elTruck) elTruck.textContent = '$' + camionetaBase.toFixed(2);
        _recalcular();
    }

    function _abrirRegistroViaticos() {
        const cliente = calculadoraClienteActual;
        if (!cliente) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Registrar Viáticos - ${cliente.nombre}</h3>
                        <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                    </div>
                    <div class="modal-body">
                        <p class="text-muted">Ingresa los datos de viáticos para este cliente. Estos valores se guardarán en la base de datos.</p>
                        <div style="display:grid; gap:16px; margin-top:20px;">
                            <div>
                                <label>Kilómetros (KM)</label>
                                <input type="number" id="modalKmInput" min="0" step="0.1" value="0" style="width:100%; padding:10px; font-size:16px;">
                                <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Distancia desde taller hasta el cliente.</p>
                            </div>
                            <div>
                                <label>Horas de Viaje</label>
                                <input type="number" id="modalHorasInput" min="0" step="0.5" value="0" style="width:100%; padding:10px; font-size:16px;">
                                <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Tiempo estimado de traslado (ida).</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="ventasModule._guardarViaticosCliente()">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function _editarViaticosCliente() {
        const cliente = calculadoraClienteActual;
        if (!cliente) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Editar Viáticos - ${cliente.nombre}</h3>
                        <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                    </div>
                    <div class="modal-body">
                        <p class="text-muted">Actualiza los datos de viáticos para este cliente.</p>
                        <div style="display:grid; gap:16px; margin-top:20px;">
                            <div>
                                <label>Kilómetros (KM)</label>
                                <input type="number" id="modalKmInput" min="0" step="0.1" value="${Number(cliente.km) || 0}" style="width:100%; padding:10px; font-size:16px;">
                            </div>
                            <div>
                                <label>Horas de Viaje</label>
                                <input type="number" id="modalHorasInput" min="0" step="0.5" value="${Number(cliente.horas) || 0}" style="width:100%; padding:10px; font-size:16px;">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="ventasModule._guardarViaticosCliente()">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function _guardarViaticosCliente() {
        const modal = document.querySelector('.modal.active');
        if (!modal) return;

        const kmInput = document.getElementById('modalKmInput');
        const horasInput = document.getElementById('modalHorasInput');
        const cliente = calculadoraClienteActual;

        if (!cliente || !cliente.id) {
            alert('Cliente no válido.');
            return;
        }

        const km = parseFloat(kmInput?.value) || 0;
        const horas = parseFloat(horasInput?.value) || 0;

        const supabaseClient = _supabase();
        if (!supabaseClient) {
            alert('Error de conexión con la base de datos.');
            return;
        }

        // Guardar en tabla contactos
        const { data, error } = await supabaseClient
            .from('contactos')
            .update({ km: km, horas_viaje: horas })
            .eq('id', cliente.id)
            .select()
            .single();

        if (error) {
            alert('Error al guardar: ' + (error.message || error));
            return;
        }

        // Actualizar estado local
        calculadoraClienteActual.km = km;
        calculadoraClienteActual.horas = horas;

        // Actualizar cliente en la lista local
        const idx = contactos.findIndex(c => c.id === cliente.id);
        if (idx >= 0) {
            contactos[idx] = { ...contactos[idx], km: km, horas_viaje: horas };
        }

        modal.remove();

        // Recargar la calculadora con los nuevos valores
        _irPaso(2);

        alert('Viáticos guardados correctamente para ' + (cliente.nombre || 'el cliente'));
    }

    // ==================== CARGA DE COSTOS DESDE BD ====================
    /** Carga parámetros de costos desde parametros_costos */
    async function _cargarParametrosCostos() {
        try {
            const { data, error } = await window.supabase
                .from('parametros_costos')
                .select('clave, valor');
            if (error || !data) return tabuladorTaller.variables;

            const params = {};
            data.forEach(p => {
                if (p.clave === 'gasolina') params.gasolina = Number(p.valor);
                if (p.clave === 'rendimiento') params.rendimiento = Number(p.valor);
                if (p.clave === 'costo_tecnico') params.costoTecnico = Number(p.valor);
                if (p.clave === 'gastos_fijos_hora') params.gastosFijosHora = Number(p.valor);
                if (p.clave === 'camioneta_hora') params.camionetaHora = Number(p.valor);
                if (p.clave === 'utilidad') params.utilidad = Number(p.valor);
                if (p.clave === 'credito') params.credito = Number(p.valor);
                if (p.clave === 'iva') params.iva = Number(p.valor);
            });
            return params;
        } catch (e) {
            console.warn('[Ventas] Error cargando parámetros:', e);
            return tabuladorTaller.variables;
        }
    }

    /** Carga gastos fijos desde gastos_fijos */
    async function _cargarGastosFijos() {
        try {
            const { data, error } = await window.supabase
                .from('gastos_fijos')
                .select('id, nombre, monto, activo')
                .eq('activo', true)
                .order('nombre');
            if (error || !data) return [];
            return data.filter(g => g.nombre && g.monto !== null);
        } catch (e) {
            console.warn('[Ventas] Error cargando gastos fijos:', e);
            return [];
        }
    }

    /** Carga clientes tabulador desde clientes_tabulador */
    async function _cargarClientesTabulador() {
        try {
            const { data, error } = await window.supabase
                .from('clientes_tabulador')
                .select('nombre_cliente, km, horas_viaje')
                .order('nombre_cliente');
            if (error || !data) return [];
            return data.map(c => ({
                nombre: c.nombre_cliente,
                km: Number(c.km) || 0,
                horas: Number(c.horas_viaje) || 0
            }));
        } catch (e) {
            console.warn('[Ventas] Error cargando clientes:', e);
            return [];
        }
    }

    /** Abre modal para editar gastos fijos y parámetros */
    async function _abrirEditorCostos() {
        const [parametros, gastosFijos, clientes] = await Promise.all([
            _cargarParametrosCostos(),
            _cargarGastosFijos(),
            _cargarClientesTabulador()
        ]);

        const totalGastosFijos = gastosFijos.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
        const gastoFijoHora = (totalGastosFijos / 160).toFixed(2); // 160 hrs/mes

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header" style="background: linear-gradient(135deg, var(--c-ventas), #059669); color: white;">
                        <h3><i class="fas fa-calculator"></i> Configuración de Costos</h3>
                        <button type="button" class="btn-close" style="filter: brightness(0) invert(1);" onclick="this.closest('.modal').remove()"></button>
                    </div>
                    <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                        <div style="display: grid; gap: 24px;">
                            <!-- PARÁMETROS -->
                            <div>
                                <h4 style="color: var(--c-ventas); margin-bottom: 12px; font-size: 16px;">
                                    <i class="fas fa-cog"></i> Parámetros de Costos
                                </h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Gasolina ($/L)</label>
                                        <input type="number" id="paramGasolina" step="0.01" value="${parametros.gasolina}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="gasolina">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Rendimiento (km/L)</label>
                                        <input type="number" id="paramRendimiento" step="0.1" value="${parametros.rendimiento}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="rendimiento">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Costo Técnico ($/hr)</label>
                                        <input type="number" id="paramCostoTecnico" step="0.01" value="${parametros.costoTecnico}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="costo_tecnico">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Camioneta ($/hr)</label>
                                        <input type="number" id="paramCamioneta" step="0.01" value="${parametros.camionetaHora}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="camioneta_hora">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Utilidad (%)</label>
                                        <input type="number" id="paramUtilidad" step="0.1" value="${parametros.utilidad}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="utilidad">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Crédito (%)</label>
                                        <input type="number" id="paramCredito" step="0.1" value="${parametros.credito}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="credito">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">IVA (%)</label>
                                        <input type="number" id="paramIva" step="0.1" value="${parametros.iva}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="iva">
                                    </div>
                                </div>
                            </div>

                            <!-- GASTOS FIJOS -->
                            <div>
                                <h4 style="color: var(--c-ventas); margin-bottom: 12px; font-size: 16px;">
                                    <i class="fas fa-file-invoice-dollar"></i> Gastos Fijos Mensuales
                                    <span style="float: right; font-size: 12px; color: var(--text-muted);">Total: $${totalGastosFijos.toFixed(2)} → $${gastoFijoHora}/hr</span>
                                </h4>
                                <table class="tabla-dinamica" style="width: 100%; font-size: 13px;">
                                    <thead>
                                        <tr>
                                            <th>Concepto</th>
                                            <th style="width: 120px;">Monto Mensual</th>
                                            <th style="width: 80px;">Activo</th>
                                            <th style="width: 60px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="gastosFijosBody">
                                        ${gastosFijos.map(g => `
                                            <tr data-id="${g.id}">
                                                <td><input type="text" value="${g.nombre}" class="gasto-nombre" style="width: 100%; padding: 6px;"></td>
                                                <td><input type="number" value="${g.monto}" step="0.01" class="gasto-monto" style="width: 100%; padding: 6px;"></td>
                                                <td><input type="checkbox" class="gasto-activo" ${g.activo ? 'checked' : ''}></td>
                                                <td><button class="btn-remove btn-sm" onclick="ventasModule._eliminarGastoFijo('${g.id}', this)"><i class="fas fa-trash"></i></button></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarGastoFijo()" style="margin-top: 8px;">
                                    <i class="fas fa-plus"></i> Agregar Gasto
                                </button>
                            </div>

                            <!-- CLIENTES TABULADOR -->
                            <div>
                                <h4 style="color: var(--c-ventas); margin-bottom: 12px; font-size: 16px;">
                                    <i class="fas fa-map-marker-alt"></i> Clientes (Viáticos)
                                </h4>
                                <div style="max-height: 200px; overflow-y: auto;">
                                    <table class="tabla-dinamica" style="width: 100%; font-size: 13px;">
                                        <thead>
                                            <tr>
                                                <th>Cliente</th>
                                                <th style="width: 80px;">KM</th>
                                                <th style="width: 80px;">Horas</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${clientes.map(c => `
                                                <tr>
                                                    <td>${c.nombre}</td>
                                                    <td>${c.km}</td>
                                                    <td>${c.horas}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                                <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                                    * Para editar clientes, ve al módulo de Contactos
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="ventasModule._guardarConfiguracionCostos()">
                            <i class="fas fa-save"></i> Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function _agregarGastoFijo() {
        const tbody = document.getElementById('gastosFijosBody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" placeholder="Nuevo concepto" class="gasto-nombre" style="width: 100%; padding: 6px;"></td>
            <td><input type="number" value="0" step="0.01" class="gasto-monto" style="width: 100%; padding: 6px;"></td>
            <td><input type="checkbox" class="gasto-activo" checked></td>
            <td><button class="btn-remove btn-sm" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    }

    async function _eliminarGastoFijo(id, btn) {
        if (!confirm('¿Eliminar este gasto fijo?')) return;
        try {
            // Marcar como inactivo en lugar de eliminar (soft delete)
            const { error } = await window.supabase.from('gastos_fijos').update({ activo: false }).eq('id', id);
            if (error) throw error;
            btn.closest('tr').remove();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    async function _guardarConfiguracionCostos() {
        // Guardar parámetros
        const parametros = {};
        ['gasolina', 'rendimiento', 'costo_tecnico', 'camioneta_hora', 'utilidad', 'credito', 'iva'].forEach(key => {
            const input = document.querySelector(`[data-param="${key}"]`);
            if (input) parametros[key] = parseFloat(input.value) || 0;
        });

        // Actualizar parametros_costos usando upsert directo
        for (const [clave, valor] of Object.entries(parametros)) {
            const descripcion = 'Actualizado desde calculadora';
            await window.supabase
                .from('parametros_costos')
                .upsert({ clave, valor, descripcion }, { onConflict: 'clave' })
                .eq('clave', clave);
        }

        // Guardar gastos fijos
        const rows = document.querySelectorAll('#gastosFijosBody tr');
        for (const tr of rows) {
            const id = tr.dataset.id;
            const nombre = tr.querySelector('.gasto-nombre')?.value;
            const monto = parseFloat(tr.querySelector('.gasto-monto')?.value) || 0;
            const activo = tr.querySelector('.gasto-activo')?.checked;

            if (id) {
                await window.supabase.from('gastos_fijos').update({ nombre, monto, activo }).eq('id', id);
            } else {
                await window.supabase.from('gastos_fijos').insert({ nombre, monto, activo });
            }
        }

        // Actualizar CostosEngine con nuevos valores
        const nuevosParametros = await _cargarParametrosCostos();
        CostosEngine.applyConfig(nuevosParametros);

        alert('Configuración guardada. Los cálculos se actualizarán automáticamente.');
        document.querySelector('.modal.active')?.remove();

        // Recalcular si hay calculadora abierta
        _recalcular();
    }

    function _recalcular() {
        const inpTechHours = document.getElementById('inpTechHours');
        const inpUtilidadPct = document.getElementById('inpUtilidadPct');
        const inpCreditoPct = document.getElementById('inpCreditoPct');
        const utilidadPct = parseFloat(inpUtilidadPct?.value) || CostosEngine.CONFIG.utilidad;
        const creditoPct = parseFloat(inpCreditoPct?.value) || CostosEngine.CONFIG.credito;

        let gastosGenerales = lastGastosGenerales;
        if (inpTechHours) {
            const techHours = parseFloat(document.getElementById('inpTechHours')?.value) || 0;
            const partsCost = parseFloat(document.getElementById('inpParts')?.value) || 0;
            const kmLive = parseFloat(document.getElementById('inpLogisticaKm')?.value);
            const hrsLive = parseFloat(document.getElementById('inpLogisticaHoras')?.value);
            let gasPlusSales = parseFloat(document.getElementById('valGasPlusSales')?.innerText.replace(/[$,]/g, '')) || 0;
            if (document.getElementById('inpLogisticaKm') && calculadoraClienteActual && !Number.isNaN(kmLive) && !Number.isNaN(hrsLive)) {
                gasPlusSales = CostosEngine.calcularGasolinaMasTraslado(kmLive, hrsLive);
                const vgps = document.getElementById('valGasPlusSales');
                if (vgps) vgps.textContent = '$' + gasPlusSales.toFixed(2);
            }
            const componentesTotal = calculadoraComponentes.reduce((sum, c) => sum + c.subtotal, 0);
            const totalParts = partsCost + componentesTotal;
            const laborCost = CostosEngine.calcularManoObra(techHours);
            const fixedCosts = CostosEngine.calcularGastosFijos(techHours);
            const truckCost = CostosEngine.calcularCostoCamioneta(calculadoraClienteActual?.horas || 0);
            gastosGenerales = CostosEngine.calcularGastosGenerales(gasPlusSales, laborCost, fixedCosts, totalParts, truckCost);
            lastGastosGenerales = gastosGenerales;
            const elFixed = document.getElementById('valFixedCosts');
            const elTruck = document.getElementById('valTruck');
            if (elFixed) elFixed.innerText = '$' + fixedCosts.toFixed(2);
            if (elTruck) elTruck.innerText = '$' + truckCost.toFixed(2);
        }

        const precioConUtilidad = gastosGenerales * (1 + utilidadPct / 100);
        const precioAntesIVA = precioConUtilidad * (1 + creditoPct / 100);
        const iva = CostosEngine.calcularIVA(precioAntesIVA);
        const total = CostosEngine.calcularTotalConIVA(precioAntesIVA);

        lastPrecioConUtilidad = precioConUtilidad;
        lastPrecioAntesIVA = precioAntesIVA;
        lastIva = iva;
        lastTotal = total;

        const elGen = document.getElementById('resGeneralExpenses');
        const elUtil = document.getElementById('resUtility');
        const elCred = document.getElementById('resCredit');
        const elIva = document.getElementById('resIVA');
        const elTotal = document.getElementById('resTotal');
        if (elGen) elGen.innerText = '$' + gastosGenerales.toFixed(2);
        if (elUtil) elUtil.innerText = '$' + precioConUtilidad.toFixed(2);
        if (elCred) elCred.innerText = '$' + precioAntesIVA.toFixed(2);
        if (elIva) elIva.innerText = '$' + iva.toFixed(2);
        if (elTotal) elTotal.innerText = '$' + total.toFixed(2);
    }

    function _adjuntarEventosCalculadora() {
        document.getElementById('generarCotizacionBtn').onclick = _generarCotizacion;
        document.getElementById('enviarCotizacionBtn').onclick = _enviarCotizacionCliente;

        // Agregar listeners para actualizar preview en tiempo real (paso 2 bloqueado)
        const kmInput = document.getElementById('inpLogisticaKm');
        const horasInput = document.getElementById('inpLogisticaHoras');
        const horasTallerInput = document.getElementById('inpHorasTaller');

        function _actualizarPreview() {
            const km = parseFloat(kmInput?.value) || 0;
            const horasViaje = parseFloat(horasInput?.value) || 0;
            const horasTaller = parseFloat(horasTallerInput?.value) || 0;

            // Actualizar valores del cliente
            if (calculadoraClienteActual) {
                calculadoraClienteActual.km = km;
                calculadoraClienteActual.horas = horasViaje;
            }

            // Calcular costos actualizados
            const gasolina = CostosEngine.calcularCostoGasolina(km);
            const traslado = CostosEngine.calcularCostoTrasladoTecnico(horasViaje);
            const gasPlus = CostosEngine.calcularGasolinaMasTraslado(km, horasViaje);
            const manoObra = CostosEngine.calcularManoObra(horasTaller);
            const gastosFijos = CostosEngine.calcularGastosFijos(horasTaller);
            const camioneta = CostosEngine.calcularCostoCamioneta(horasViaje);

            const totalFinal = CostosEngine.calcularPrecioFinal({
                km,
                horasViaje,
                horasTaller,
                costoRefacciones: 0
            }).total;

            // Actualizar elementos del preview
            const elGasolina = document.getElementById('previewGasolina');
            const elTraslado = document.getElementById('previewTraslado');
            const elGasPlus = document.getElementById('previewGasPlus');
            const elManoObra = document.getElementById('previewManoObra');
            const elGastosFijos = document.getElementById('previewGastosFijos');
            const elCamioneta = document.getElementById('previewCamioneta');
            const elSubtotal = document.getElementById('previewSubtotal');
            const elTotal = document.getElementById('previewTotal');

            if (elGasolina) elGasolina.textContent = '$' + gasolina.toFixed(2);
            if (elTraslado) elTraslado.textContent = '$' + traslado.toFixed(2);
            if (elGasPlus) elGasPlus.textContent = '$' + gasPlus.toFixed(2);
            if (elManoObra) elManoObra.textContent = '$' + manoObra.toFixed(2);
            if (elGastosFijos) elGastosFijos.textContent = '$' + gastosFijos.toFixed(2);
            if (elCamioneta) elCamioneta.textContent = '$' + camioneta.toFixed(2);
            if (elSubtotal) elSubtotal.textContent = '$' + (totalFinal / 1.16).toFixed(2);
            if (elTotal) elTotal.textContent = '$' + totalFinal.toFixed(2);
        }

        if (kmInput) kmInput.addEventListener('input', _actualizarPreview);
        if (horasInput) horasInput.addEventListener('input', _actualizarPreview);
        if (horasTallerInput) horasTallerInput.addEventListener('input', _actualizarPreview);
    }

    // ==================== GENERACIÓN DE COTIZACIÓN ====================
    function _generarCotizacion() {
        document.getElementById('calculadoraModal').classList.remove('active');
        document.getElementById('cotizacionModal').classList.add('active');

        const total = parseFloat(document.getElementById('resTotal')?.innerText.replace('$', '')) || 0;
        const general = parseFloat(document.getElementById('resGeneralExpenses')?.innerText.replace('$', '')) || 0;
        const utilidad = parseFloat(document.getElementById('resUtility')?.innerText.replace('$', '')) || 0;
        const antesIVA = parseFloat(document.getElementById('resCredit')?.innerText.replace('$', '')) || 0;
        const iva = parseFloat(document.getElementById('resIVA')?.innerText.replace('$', '')) || 0;

        document.getElementById('editGastosGenerales').value = general.toFixed(2);
        document.getElementById('editUtilidad').value = utilidad.toFixed(2);
        document.getElementById('editCredito').value = antesIVA.toFixed(2);
        document.getElementById('editPrecioFinal').value = antesIVA.toFixed(2);
        document.getElementById('editIVA').value = iva.toFixed(2);
        document.getElementById('editTotal').value = total.toFixed(2);
        document.getElementById('editCliente').value = calculadoraClienteActual?.nombre || '';
        var editEmailEl = document.getElementById('editEmail');
        var editTelefonoEl = document.getElementById('editTelefono');
        if (editEmailEl) editEmailEl.value = calculadoraClienteActual?.email || '';
        if (editTelefonoEl) editTelefonoEl.value = calculadoraClienteActual?.telefono || '';
        var enviarA = document.getElementById('editEnviarAContacto');
        if (enviarA) {
            enviarA.innerHTML = '<option value="">— Escribir correo manualmente —</option>';
            (contactos || []).filter(function (c) { return c.email && String(c.email).trim(); }).forEach(function (c) {
                var opt = document.createElement('option');
                opt.value = c.email.trim();
                opt.textContent = (c.nombre || c.empresa || c.email || 'Sin nombre').substring(0, 50);
                if (calculadoraClienteActual && (c.email === calculadoraClienteActual.email || c.id === calculadoraClienteActual.id)) opt.selected = true;
                enviarA.appendChild(opt);
            });
            if (!enviarA._boundEnviarA) {
                enviarA._boundEnviarA = true;
                enviarA.addEventListener('change', function () {
                    if (editEmailEl) editEmailEl.value = this.value || '';
                });
            }
        }

        const tbody = document.getElementById('editProductosBody');
        tbody.innerHTML = '';
        calculadoraComponentes.forEach((comp, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${comp.nombre}" style="width:100%; padding:4px;"></td>
                <td><input type="number" value="${comp.cantidad}" style="width:60px; text-align:center;"></td>
                <td><input type="number" value="${comp.costo_unitario}" step="0.01" style="width:80px; text-align:right;"></td>
                <td>$${comp.subtotal.toFixed(2)}</td>
                <td><button class="btn-remove" onclick="this.closest('tr').remove()">✖</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function _enviarCotizacionCliente() {
        const cliente = document.getElementById('editCliente').value;
        const email = document.getElementById('editEmail').value;
        const telefono = document.getElementById('editTelefono').value;
        const total = parseFloat(document.getElementById('editTotal').value) || 0;
        const rfc = document.getElementById('editRFC').value;

        if (!cliente) { alert('El nombre del cliente es obligatorio'); return; }
        if (!total || total <= 0) {
            alert('Calcule el costo final (Total) con la calculadora antes de enviar la cotización.');
            return;
        }

        const items = [];
        document.querySelectorAll('#editProductosBody tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            if (inputs.length >= 3) {
                items.push({
                    descripcion: inputs[0].value,
                    cantidad: parseInt(inputs[1].value) || 1,
                    precio_unitario: parseFloat(inputs[2].value) || 0,
                    importe: (parseInt(inputs[1].value) || 1) * (parseFloat(inputs[2].value) || 0)
                });
            }
        });

        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const cotizacionData = {
            folio,
            tipo: 'cotizacion',
            cliente,
            email,
            telefono,
            rfc,
            fecha: new Date().toISOString().split('T')[0],
            items,
            tipo: 'cotizacion',
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: total * 0.16 / 1.16,
            total,
            estado: 'registro',
            origen: compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo',
            orden_origen_id: compraActual?.id,
            vendedor: (await authService.getCurrentProfile())?.nombre || 'Ventas',
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await cotizacionesService.insert(cotizacionData, csrfToken);
            await _syncFolioTrasCotizacion(inserted, cotizacionData, _itemsToComponentesFolio(items), csrfToken);
            if (email && window.emailService) {
                const profile = await authService.getCurrentProfile();
                const fromVendedor = profile && profile.email ? (profile.nombre || 'Ventas') + ' <' + profile.email + '>' : undefined;
                const html = '<p>Hola ' + (cliente || 'Cliente') + ',</p><p>Adjuntamos la cotización <strong>' + folio + '</strong> por un total de <strong>$' + (total || 0).toLocaleString() + '</strong>.</p><p>Quedamos atentos a sus comentarios.</p><p>— SSEPI Ventas</p>';
                window.emailService.send(email.trim(), 'Cotización SSEPI - ' + folio, html, undefined, fromVendedor).then(function (r) {
                    if (r.error) console.warn('Correo no enviado:', r.error);
                });
            }
            // Mostrar toast de éxito
            _showToast('✅ Cotización guardada y enviada para autorización', 'success');
            _addToFeed('📧', `Cotización ${folio} enviada a ${cliente}`);
            document.getElementById('cotizacionModal').classList.remove('active');
            document.getElementById('calculadoraModal').classList.remove('active');
        } catch (error) {
            console.error(error);
            _showToast('Error al guardar cotización: ' + error.message, 'error');
        }
    }

    // ==================== AUTORIZACIÓN DE COTIZACIONES ====================
    async function _autorizarCotizacion(id) {
        if (!confirm('¿Autorizar esta cotización?')) return;
        const cotizacion = cotizaciones.find(c => c.id === id);
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await cotizacionesService.update(id, { estado: 'autorizada_por_ventas' }, csrfToken);
            await notificacionesService.insert({
                para: 'compras',
                tipo: 'cotizacion_autorizada',
                cotizacion_id: id,
                folio: cotizacion?.folio || id.slice(-6),
                cliente: cotizacion?.cliente || 'Cliente',
                mensaje: `Cotización ${cotizacion?.folio || id.slice(-6)} autorizada - Proceder con compra`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);
            _addToFeed('✅', 'Cotización autorizada - Notificación enviada a Compras');
            _renderPendientesAutorizacion();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _rechazarCotizacion(id) {
        if (!confirm('¿Rechazar esta cotización?')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await cotizacionesService.update(id, { estado: 'rechazada_por_ventas' }, csrfToken);
            _addToFeed('❌', 'Cotización rechazada');
            _renderPendientesAutorizacion();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    // ==================== DETALLE Y EDICIÓN ====================

    /**
     * Carga y muestra el historial de una cotización/orden
     */
    async function _mostrarHistorial(id, tipo) {
        const modal = document.getElementById('historialModal');
        const body = document.getElementById('historialBody');
        if (!modal || !body) {
            alert('Error: No se encontró el modal de historial.');
            return;
        }

        const columnMap = {
            'cotizacion': 'cotizacion_id',
            'venta': 'cotizacion_id',
            'taller': 'orden_taller_id',
            'motor': 'orden_motor_id',
            'proyecto': 'proyecto_id',
            'automatizacion': 'proyecto_id'
        };
        const columnName = columnMap[tipo] || 'cotizacion_id';

        try {
            const { data, error } = await window.supabase
                .from('orden_historial')
                .select(`*, creado_por_usuario:usuarios (nombre, email)`)
                .eq(columnName, id)
                .order('creado_en', { ascending: false });

            if (error) throw error;
            const events = data || [];
            const item = [...ventas, ...cotizaciones].find(i => i.id === id);
            const estadoActual = item?.estado || item?.estatus_pago || 'registro';

            body.innerHTML = `
                ${_renderTimeline(estadoActual)}
                <div style="margin-top:24px;">
                    <h4 style="margin-bottom:16px; color:var(--text-primary);"><i class="fas fa-history"></i> Historial de Eventos</h4>
                    ${events.length === 0 ? `
                        <div style="text-align:center; padding:40px; color:var(--text-secondary);">
                            <i class="fas fa-history" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                            <p>No hay eventos registrados.</p>
                        </div>
                    ` : `
                        <div style="max-height:50vh; overflow-y:auto;">
                            ${events.map(e => {
                                const fecha = new Date(e.creado_en).toLocaleString('es-MX');
                                const usuario = e.creado_por_usuario?.nombre || e.creado_por_usuario?.email?.split('@')[0] || 'Sistema';
                                const iconMap = {
                                    'creacion': '🆕', 'cotizacion_guardada': '💾', 'cotizacion_enviada': '📧',
                                    'cotizacion_autorizada': '✅', 'cotizacion_rechazada': '❌', 'cambio_estado': '🔄',
                                    'costo_agregado': '💰', 'compra_vinculada': '🔗', 'folio_generado': '📄', 'venta_cerrada': '💵'
                                };
                                const icon = iconMap[e.evento] || '📝';
                                return `<div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:flex-start;">
                                    <span style="font-size:20px;">${icon}</span><div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <strong style="color:var(--c-ventas);">${e.evento.replace(/_/g, ' ').toUpperCase()}</strong>
                                        <span style="font-size:12px; color:var(--text-secondary);">${fecha}</span>
                                    </div><p style="margin:4px 0; color:var(--text-secondary);">${e.descripcion || ''}</p>
                                    <span style="font-size:11px; color:var(--text-muted);">Por: ${usuario}</span></div></div>`;
                            }).join('')}
                        </div>
                    `}
                </div>
            `;
            modal.classList.add('active');
        } catch (error) {
            console.error('[Ventas] mostrarHistorial:', error);
            body.innerHTML = `<p style="color:#c62828;">Error: ${error.message}</p>`;
            modal.classList.add('active');
        }
    }

    function _renderTimeline(estadoActual) {
        const pasos = [
            { id: 'registro', icono: '📝', label: 'Registro' },
            { id: 'diagnostico', icono: '🔍', label: 'Diagnóstico' },
            { id: 'cotizacion', icono: '💰', label: 'Cotización' },
            { id: 'autorizado', icono: '✅', label: 'Autorizado' },
            { id: 'compra', icono: '🛒', label: 'Compra' },
            { id: 'ejecucion', icono: '⚙️', label: 'Ejecución' },
            { id: 'entregado', icono: '📦', label: 'Entregado' },
            { id: 'pagado', icono: '💵', label: 'Pagado' }
        ];
        const ordenMap = {
            'registro': 0, 'Nuevo': 0, 'diagnostico': 1, 'en_diagnostico': 1,
            'cotizacion': 2, 'pendiente_autorizacion_ventas': 2,
            'autorizado': 3, 'autorizada_por_ventas': 3,
            'compra': 4, 'en_compra': 4, 'ejecucion': 5, 'en_ejecucion': 5,
            'entregado': 6, 'pagado': 7
        };
        const indiceActual = ordenMap[estadoActual] ?? 0;

        return `<div class="timeline-container"><div class="timeline">
            <div class="timeline-progress" style="width: ${(indiceActual / (pasos.length - 1)) * 100}%;"></div>
            ${pasos.map((paso, idx) => {
                let clase = idx < indiceActual ? 'completed' : (idx === indiceActual ? 'active current' : '');
                return `<div class="timeline-step ${clase}"><div class="timeline-icon">${paso.icono}</div>
                    <div class="timeline-label">${paso.label}</div></div>`;
            }).join('')}</div></div>`;
    }

    function _abrirDetalle(id, tipo) {
        // Abrir historial directamente
        _mostrarHistorial(id, tipo);
    }

    function _editarVenta(id, tipo) {
        alert(`Editar ${tipo} con id ${id}`);
    }

    async function _reenviarCotizacion(id) {
        const cotizacion = cotizaciones.find(c => c.id === id);
        if (!cotizacion) return;
        alert(`✅ Cotización reenviada a ${cotizacion.cliente || 'cliente'}`);
        _addToFeed('📧', `Cotización reenviada`);
    }

    // ==================== REGISTRO RÁPIDO DE COTIZACIÓN ====================
    async function _abrirRegistroRapido() {
        const modal = document.getElementById('registroRapidoModal');
        if (!modal) return;

        // Limpiar campos
        document.getElementById('rrCliente').value = '';
        document.getElementById('rrEmail').value = '';
        document.getElementById('rrTelefono').value = '';
        document.getElementById('rrFalla').value = '';
        document.getElementById('rrDepartamento').value = '';
        document.getElementById('rrPrioridad').value = 'Normal';

        modal.classList.add('active');
    }

    async function _guardarRegistroRapido() {
        const cliente = document.getElementById('rrCliente').value.trim();
        const email = document.getElementById('rrEmail').value.trim();
        const telefono = document.getElementById('rrTelefono').value.trim();
        const falla = document.getElementById('rrFalla').value.trim();
        const departamento = document.getElementById('rrDepartamento').value.trim();
        const prioridad = document.getElementById('rrPrioridad').value.trim();

        if (!cliente || !falla || !departamento) {
            alert('❗ Cliente, falla y departamento son obligatorios.');
            return;
        }

        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const profile = await authService.getCurrentProfile();

        const cotizacionData = {
            folio,
            tipo: 'cotizacion',
            cliente,
            email: email || '',
            telefono: telefono || '',
            rfc: '',
            fecha: new Date().toISOString().split('T')[0],
            items: [{
                descripcion: falla,
                cantidad: 1,
                precio_unitario: 0,
                importe: 0
            }],
            tipo: 'cotizacion',
            subtotal: 0,
            iva: 0,
            total: 0,
            estado: 'registro',
            origen: 'directo',
            orden_origen_id: null,
            cerebro_registro: {
                departamento,
                prioridad,
                falla_reportada: falla,
                origen_cotizacion: 'directo'
            },
            vendedor: profile?.nombre || 'Ventas',
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await cotizacionesService.insert(cotizacionData, csrfToken);

            // Registrar evento en orden_historial: creación de cotización rápida
            if (inserted?.id) {
                await _insertarEventoHistorial('cotizacion', inserted.id, 'creacion', `Cotización rápida ${folio} creada en Registro`, csrfToken);
            }

            // Mostrar toast de éxito
            _showToast('✅ Cotización guardada en Kanban. Folio: ' + folio, 'success');
            _addToFeed('💾', `Cotización ${folio} guardada en Registro`);
            document.getElementById('registroRapidoModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    // ==================== NUEVA COTIZACIÓN DIRECTA (Wizard 4 pasos) ====================
    async function _nuevaCotizacion() {
        calculadoraComponentes = [];
        calculadoraClienteActual = null;
        compraActual = null;
        ventasWizardCerebro = null;
        wizardPaso = 1;
        var modal = document.getElementById('calculadoraModal');
        if (!modal) {
            console.error('[Ventas] No se encontró #calculadoraModal');
            alert('No se pudo abrir el wizard. Recarga la página.');
            return;
        }
        await _renderWizardPaso(1);
        modal.classList.add('active');
        _bindWizardEvents();
    }

    function _getWizardTitles() {
        return {
            1: '📋 Registro y Generación de Orden',
            2: '⏳ En Espera - Compras/Materiales',
            3: '💰 Cotización al Cliente',
            4: '📊 Seguimiento y Estatus'
        };
    }

    async function _renderWizardPaso(paso) {
        wizardPaso = paso;
        var titles = _getWizardTitles();
        var titleEl = document.getElementById('wizardModalTitle');
        var indicatorEl = document.getElementById('wizardStepIndicator');
        if (titleEl) titleEl.textContent = 'Paso ' + paso + ': ' + (titles[paso] || '');
        if (indicatorEl) indicatorEl.textContent = 'Paso ' + paso + ' de 4';

        var body = document.getElementById('calculadoraBody');
        if (!body) return;
        if (paso === 1) {
            // Recargar contactos desde BD para tener lista actualizada
            if (window.supabase) {
                try {
                    const { data } = await window.supabase
                        .from('contactos')
                        .select('*')
                        .eq('tipo', 'client')
                        .order('nombre');
                    if (data) contactos = data;
                } catch (e) { console.warn('[Ventas] Error recargando contactos:', e); }
            }
            body.innerHTML = _renderWizardPaso1();
            _attachWizardPaso1();
        } else if (paso === 2) {
            let horasEst = 0;
            const vid = compraActual?.vinculacion?.id;
            if (vid) {
                horasEst = Number(taller.find((o) => o.id === vid)?.horas_estimadas)
                    || Number(motores.find((o) => o.id === vid)?.horas_estimadas)
                    || 0;
            }
            body.innerHTML = _generarHTMLCalculadora(compraActual || {}, horasEst);
        }
        else if (paso === 3) body.innerHTML = _renderWizardPaso3();
        else if (paso === 4) body.innerHTML = _renderWizardPaso4();

        if (paso === 2) {
            _adjuntarEventosCalculadora();
            _recalcular();
        }
        if (paso === 3) {
            _adjuntarEventosPaso3();
            _recalcular();
        }

        var footer = document.getElementById('calculadoraModalFooter');
        if (!footer) return;
        var cancelBtn = footer.querySelector('#wizardCancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        var prevBtn = footer.querySelector('#wizardPrevBtn');
        if (prevBtn) prevBtn.style.display = paso > 1 ? 'inline-block' : 'none';
        var nextBtn = footer.querySelector('#wizardNextBtn');
        if (nextBtn) nextBtn.style.display = paso < 4 ? 'inline-block' : 'none';
        var guardarBtn = footer.querySelector('#guardarCotizacionWizardBtn');
        if (guardarBtn) guardarBtn.style.display = 'inline-block';
        var descargarPDFWizard = footer.querySelector('#descargarPDFWizardBtn');
        if (descargarPDFWizard) descargarPDFWizard.style.display = paso === 4 ? 'inline-block' : 'none';
        var generarBtn = footer.querySelector('#generarCotizacionBtn');
        if (generarBtn) generarBtn.style.display = 'none';
        var enviarBtn = footer.querySelector('#enviarCotizacionBtn');
        if (enviarBtn) enviarBtn.style.display = paso === 4 ? 'inline-block' : 'none';
    }

    function _renderWizardPaso1() {
        var contactosList = contactos || [];
        var clientesOptions = contactosList.map(function (c) {
            return '<option value="' + c.id + '" data-nombre="' + (c.nombre || c.empresa || '') + '" data-km="' + (c.km || 0) + '" data-email="' + (c.email || '') + '" data-telefono="' + (c.telefono || '') + '" data-rfc="' + (c.rfc || '') + '">' + (c.nombre || c.empresa || c.email || 'Sin nombre') + '</option>';
        }).join('');
        const hoy = new Date().toISOString().split('T')[0];
        var sinClientes = contactosList.length === 0;

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-clipboard-list"></i> Paso 1: Datos del Cliente</div>
                <p id="wizardPaso1Error" style="display:none; font-size:13px; color:#c62828; margin:0 0 12px 0;" role="alert"></p>
                ${sinClientes ? '<div class="alert a-warn" style="margin-bottom:12px;">⚠️ No hay clientes registrados. <a href="/panel/pages/ssepi_contactos.html" target="_blank" style="color:var(--c-ventas);font-weight:600;">Crear cliente en Contactos →</a></div>' : ''}
                <div class="editor-item" style="margin-bottom:14px;">
                    <p id="wizardFolioAyuda" style="font-size:13px; color:var(--text-secondary); margin:0;">${sinClientes ? 'Primero crea un cliente en Contactos.' : 'Elige departamento para generar orden.'}</p>
                </div>
                <div class="editor-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                    <div class="editor-item">
                        <label>Cliente <span style="color:#c62828;">*</span></label>
                        <select id="wizardClienteSelect" style="width:100%; padding:10px;">
                            <option value="">-- Seleccionar cliente --</option>
                            ${clientesOptions}
                        </select>
                    </div>
                    <div class="editor-item">
                        <label>Fecha de ingreso <span style="color:#c62828;">*</span></label>
                        <input type="date" id="wizardFechaIngreso" value="${hoy}" style="width:100%; padding:10px;">
                    </div>
                </div>
                <div class="editor-item" style="margin-top:14px;">
                    <label>Nombre del producto <span style="color:#c62828;">*</span></label>
                    <input type="text" id="wizardNombreProducto" placeholder="Ej. Sistema de control, Motor trifásico, Tablero eléctrico..." style="width:100%; padding:10px;">
                    <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Requerido para generar la orden.</p>
                </div>
                <div class="editor-item" style="margin-top:14px;">
                    <label>Falla reportada / Requerimiento <span style="color:#c62828;">*</span></label>
                    <textarea id="wizardFallaReportada" rows="3" placeholder="Describe la falla o el requerimiento del cliente..." style="width:100%; padding:10px; resize:vertical;"></textarea>
                </div>
                <div class="editor-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:14px;">
                    <div class="editor-item">
                        <label>Prioridad (urgencia)</label>
                        <select id="wizardPrioridadSelect" style="width:100%; padding:10px;">
                            <option value="Baja">Baja</option>
                            <option value="Normal" selected>Normal</option>
                            <option value="Alta">Alta</option>
                            <option value="Urgente">Urgente</option>
                        </select>
                    </div>
                    <div class="editor-item">
                        <label>Departamento que recibe el caso <span style="color:#c62828;">*</span></label>
                        <select id="wizardDepartamentoSelect" style="width:100%; padding:10px;">
                            <option value="">-- Seleccionar departamento --</option>
                            <option value="Taller Electrónica">Taller Electrónica</option>
                            <option value="Taller Motores">Taller Motores</option>
                            <option value="Automatización">Automatización</option>
                            <option value="Proyectos">Proyectos</option>
                            <option value="Administración">Administración (Sin orden)</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderWizardPaso3() {
        const gastos = document.getElementById('resGeneralExpenses')?.innerText || '$0.00';
        const utilidadVal = document.getElementById('resUtility')?.innerText || '$0.00';
        const creditoVal = document.getElementById('resCredit')?.innerText || '$0.00';
        const ivaVal = document.getElementById('resIVA')?.innerText || '$0.00';
        const totalVal = document.getElementById('resTotal')?.innerText || '$0.00';
        const utilidadPct = CostosEngine.CONFIG.utilidad;
        const creditoPct = CostosEngine.CONFIG.credito;

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-percent"></i> Paso 3: Margen y Finanzas</div>
                <p style="color:var(--text-secondary); margin-bottom:20px;">Ajusta el % de Utilidad y el % de Crédito si el cliente paga a plazos. El sistema calcula subtotal, IVA y total automáticamente.</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
                    <div class="editor-item">
                        <label>% Utilidad (por defecto ${utilidadPct}%)</label>
                        <input type="number" id="inpUtilidadPct" value="${utilidadPct}" min="0" max="100" step="0.5" style="width:100%; padding:10px;">
                    </div>
                    <div class="editor-item">
                        <label>% Crédito (pago a plazos)</label>
                        <input type="number" id="inpCreditoPct" value="${creditoPct}" min="0" max="20" step="0.5" style="width:100%; padding:10px;">
                    </div>
                </div>
                <div style="background:#f5f5f5; padding:20px; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>GASTOS GENERALES</strong></span><span id="resGeneralExpenses">${gastos}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; color:var(--c-ventas);"><span><strong>UTILIDAD <span id="lblUtilidadPct">${utilidadPct}</span>%</strong></span><span id="resUtility">${utilidadVal}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>CRÉDITO <span id="lblCreditoPct">${creditoPct}</span>%</strong></span><span id="resCredit">${creditoVal}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>IVA ${CostosEngine.CONFIG.iva}%</strong></span><span id="resIVA">${ivaVal}</span></div>
                </div>
                <div class="total-box" style="margin-top:20px;">
                    <div class="label">TOTAL CON IVA</div>
                    <div class="value" id="resTotal">${totalVal}</div>
                </div>
            </div>
        `;
    }

    function _renderWizardPaso4() {
        const cliente = calculadoraClienteActual?.nombre || 'Cliente';
        const total = document.getElementById('resTotal')?.innerText || '$0.00';
        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const fecha = new Date().toLocaleDateString('es-MX');

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-eye"></i> Paso 4: Confirmación</div>
                <p style="color:var(--text-secondary); margin-bottom:20px;">Vista previa de la cotización antes de guardarla en el sistema.</p>
                <div style="background: var(--bg-panel); padding: 20px; border-radius: 8px; border: 1px solid var(--border);">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: var(--c-ventas); font-size: 28px;">SSEPI</h2>
                        <p style="color: var(--text-secondary); font-size: 12px;">Soluciones en Sistemas Eléctricos y Proyectos Industriales</p>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                        <div>
                            <p><strong>Cliente:</strong> ${cliente}</p>
                            <p><strong>Origen:</strong> ${compraActual ? (compraActual._origen === 'proyecto' ? 'Soporte en planta' : compraActual._origen === 'automatizacion' ? 'Automatización' : compraActual.vinculacion ? 'Taller' : 'Motores') : 'Directo'}</p>
                        </div>
                        <div style="text-align: right;">
                            <p><strong>Folio:</strong> ${folio}</p>
                            <p><strong>Fecha:</strong> ${fecha}</p>
                        </div>
                    </div>
                    <div style="border-top: 2px solid var(--c-ventas); padding-top: 20px; margin-top: 20px;">
                        <div style="font-size: 32px; font-weight: 900; color: var(--c-ventas); text-align: right;">${total}</div>
                        <p style="font-size: 12px; color: var(--text-muted); text-align: right;">IVA incluido</p>
                    </div>
                </div>
            </div>
        `;
    }

    function _adjuntarEventosPaso3() {
        const inpUtilidad = document.getElementById('inpUtilidadPct');
        const inpCredito = document.getElementById('inpCreditoPct');
        if (inpUtilidad) inpUtilidad.addEventListener('input', () => { _recalcular(); if (document.getElementById('lblUtilidadPct')) document.getElementById('lblUtilidadPct').textContent = inpUtilidad.value; });
        if (inpCredito) inpCredito.addEventListener('input', () => { _recalcular(); if (document.getElementById('lblCreditoPct')) document.getElementById('lblCreditoPct').textContent = inpCredito.value; });
    }

    async function _wizardSiguiente() {
        if (wizardPaso === 1) {
            _wizardSetPaso1Error('');
            const clienteSelect = document.getElementById('wizardClienteSelect');
            const fechaIn = document.getElementById('wizardFechaIngreso');
            const nombreProducto = document.getElementById('wizardNombreProducto')?.value?.trim() || '';
            const falla = document.getElementById('wizardFallaReportada')?.value?.trim() || '';
            const prioridad = document.getElementById('wizardPrioridadSelect')?.value || 'Normal';
            const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
            const clienteId = clienteSelect?.value;

            // VALIDACIÓN DE CAMPOS REQUERIDOS
            console.log('[Ventas] Validación paso 1:', { clienteId, fechaIn: fechaIn?.value, nombreProducto, falla, dept, contactosCount: contactos.length });
            if (!clienteId) { _wizardSetPaso1Error('❌ Selecciona un cliente. Si no hay clientes, créalos en Contactos primero.'); return; }
            if (!fechaIn?.value) { _wizardSetPaso1Error('❌ Indica la fecha de ingreso.'); return; }
            if (!nombreProducto) { _wizardSetPaso1Error('❌ Ingresa el nombre del producto (requerido para continuar).'); return; }
            if (!falla) { _wizardSetPaso1Error('❌ Describe la falla o el requerimiento.'); return; }
            if (!dept) { _wizardSetPaso1Error('❌ Selecciona el departamento que recibe el caso.'); return; }

            const contacto = contactos.find(c => String(c.id) === String(clienteId));
            const optLabel = (clienteSelect?.selectedOptions?.[0]?.textContent || '').trim();
            const dataNombre = clienteSelect?.selectedOptions?.[0]?.getAttribute('data-nombre') || '';
            let clienteNombre = '';

            // Prioridad: 1) data-nombre attribute, 2) contacto de BD, 3) texto del option
            if (dataNombre && dataNombre !== 'Sin nombre') {
                clienteNombre = dataNombre;
            } else if (contacto) {
                clienteNombre = (contacto.nombre || contacto.empresa || contacto.email || 'Cliente').trim() || 'Cliente';
            } else if (optLabel && optLabel !== '-- Seleccionar cliente --') {
                clienteNombre = optLabel === 'Sin nombre' ? 'Cliente' : optLabel;
            } else {
                clienteNombre = 'Cliente';
            }

            console.log('[Ventas] Cliente seleccionado:', { clienteId, clienteNombre, dataNombre, optLabel, hayContacto: !!contacto });

            if (contacto) {
                // Priorizar datos de BD (km y horas_viaje) sobre tabulador hardcoded
                const kmDesdeBD = contacto.km || contacto.horas_viaje ? contacto.km : 0;
                const horasDesdeBD = contacto.horas_viaje || 0;

                calculadoraClienteActual = {
                    contactoId: clienteId,
                    nombre: clienteNombre,
                    km: kmDesdeBD,
                    horas: horasDesdeBD,
                    email: contacto.email,
                    telefono: contacto.telefono,
                    rfc: contacto.rfc,
                    producto: nombreProducto
                };
            } else {
                calculadoraClienteActual = {
                    contactoId: clienteId,
                    nombre: clienteNombre,
                    km: 0,
                    horas: 0,
                    producto: nombreProducto
                };
            }

            console.log('[Ventas] calculadoraClienteActual:', calculadoraClienteActual);

            let origenCot = 'directo';
            if (dept === 'Taller Electrónica') origenCot = 'taller';
            else if (dept === 'Taller Motores') origenCot = 'motores';
            else if (dept === 'Automatización') origenCot = 'automatizacion';
            else if (dept === 'Proyectos') origenCot = 'proyecto';

            const csrfToken = sessionStorage.getItem('csrfToken');
            const nextBtn = document.getElementById('wizardNextBtn');
            let creado = { folio: null, ordenId: null, tipo: null };

            if (dept === 'Administración') {
                compraActual = { id: null, vinculacion: null, _origen: 'directo' };
            } else {
                try {
                    if (nextBtn) nextBtn.disabled = true;
                    creado = await _ventasCrearOrdenOperativa(dept, clienteNombre, falla, fechaIn.value, prioridad, csrfToken);
                } catch (e) {
                    console.error('[Ventas] alta orden cerebro', e);

                    // Manejo de errores mejorado con mensajes específicos
                    const isAuthFailure = e._ssepiAuthFailure === true;
                    const errorType = e._ssepiErrorType || 'unknown';

                    if (isAuthFailure || errorType === 'auth') {
                        _wizardSetPaso1Error('🔐 ' + e.message + ' Redirigiendo al login...');
                        // Forzar logout y redireccionar
                        setTimeout(async () => {
                            try { await authService.logout(); } catch (_) {}
                            window.location.href = '/';
                        }, 2000);
                    } else if (errorType === 'permission') {
                        _wizardSetPaso1Error('⛔ ' + e.message);
                    } else if (errorType === 'network') {
                        _wizardSetPaso1Error('📡 ' + e.message);
                    } else if (errorType === 'validation' || errorType === 'duplicate') {
                        _wizardSetPaso1Error('⚠️ ' + e.message);
                    } else {
                        _wizardSetPaso1Error('❌ ' + (e.message || 'Error al crear la orden. Intenta de nuevo.'));
                    }

                    if (nextBtn) nextBtn.disabled = false;
                    return;
                } finally {
                    if (nextBtn) nextBtn.disabled = false;
                }
            }

            ventasWizardCerebro = {
                fecha_ingreso: fechaIn.value,
                falla_reportada: falla,
                prioridad,
                departamento: dept,
                orden_id: creado.ordenId || null,
                folio_operativo: creado.folio || null,
                tipo_vinculo: creado.tipo || null,
                origen_cotizacion: origenCot,
                nombre_producto: nombreProducto
            };
        }
        if (wizardPaso === 4) return;
        (async () => { await _renderWizardPaso(wizardPaso + 1); })();
    }

    function _wizardAnterior() {
        if (wizardPaso <= 1) return;
        (async () => { await _renderWizardPaso(wizardPaso - 1); })();
    }

    function _bindWizardEvents() {
        var wizardCancel = document.getElementById('wizardCancelBtn');
        if (wizardCancel) wizardCancel.onclick = function () {
            var m = document.getElementById('calculadoraModal');
            if (m) m.classList.remove('active');
        };
        var wizardPrev = document.getElementById('wizardPrevBtn');
        if (wizardPrev) wizardPrev.onclick = _wizardAnterior;
        var wizardNext = document.getElementById('wizardNextBtn');
        if (wizardNext) {
            wizardNext.onclick = function () {
                _wizardSiguiente().catch(function (err) {
                    console.error('[Ventas] wizard siguiente', err);
                    if (wizardPaso === 1) {
                        _wizardSetPaso1Error('No se pudo continuar. Intenta de nuevo.');
                    }
                });
            };
        }
        var guardarWizard = document.getElementById('guardarCotizacionWizardBtn');
        if (guardarWizard) guardarWizard.onclick = _guardarCotizacionDesdeWizard;
        var descargarWizard = document.getElementById('descargarPDFWizardBtn');
        if (descargarWizard) descargarWizard.onclick = _descargarPDFDesdeWizard;
        var enviarWizard = document.getElementById('enviarCotizacionBtn');
        if (enviarWizard) enviarWizard.onclick = _enviarCotizacionDesdeWizard;
    }

    function _nombreClienteWizardResuelto() {
        // 1. Primero intentar con el nombre ya guardado en calculadoraClienteActual
        let n = (calculadoraClienteActual?.nombre || '').trim();
        if (n) return n;

        // 2. Intentar obtener desde el select directamente
        const clienteSelect = document.getElementById('wizardClienteSelect');
        if (clienteSelect && clienteSelect.value) {
            const selectedOption = clienteSelect.selectedOptions?.[0];
            if (selectedOption) {
                // Obtener nombre desde data-nombre attribute o textContent
                n = selectedOption.getAttribute('data-nombre') || selectedOption.textContent || '';
                n = n.trim() || '';
                if (n && n !== '-- Seleccionar cliente --' && n !== 'Sin nombre') {
                    if (calculadoraClienteActual) calculadoraClienteActual.nombre = n;
                    return n;
                }
            }
        }

        // 3. Buscar en el array de contactos por ID
        const cid = calculadoraClienteActual?.contactoId ?? calculadoraClienteActual?.id;
        if (cid != null && Array.isArray(contactos) && contactos.length) {
            const c = contactos.find(x => String(x.id) === String(cid));
            if (c) {
                n = (c.nombre || c.empresa || c.email || 'Cliente').trim() || 'Cliente';
                if (calculadoraClienteActual) calculadoraClienteActual.nombre = n;
                return n;
            }
        }

        // 4. Fallback: intentar con el texto del select
        if (clienteSelect && clienteSelect.selectedOptions?.[0]) {
            n = clienteSelect.selectedOptions[0].textContent?.trim() || '';
            if (n && n !== '-- Seleccionar cliente --') {
                return n;
            }
        }

        return '';
    }

    function _descargarPDFDesdeWizard() {
        const cliente = _nombreClienteWizardResuelto();
        const totalStr = document.getElementById('resTotal')?.innerText || '$0';
        const total = parseFloat(totalStr.replace(/[$,]/g, '')) || 0;
        const rfc = calculadoraClienteActual?.rfc || 'XAXX010101000';
        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const items = calculadoraComponentes.map(c => ({ descripcion: c.nombre, cantidad: c.cantidad, precioUnitario: c.costo_unitario, importe: c.subtotal }));
        const subtotal = total / 1.16;
        const iva = total - subtotal;
        if (!cliente) { alert('Cliente requerido para el PDF.'); return; }
        (async () => {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                await pdfGenerator.generateCotizacion({ folio, cliente, rfc, items, subtotal, iva, total }, user);
                _addToFeed('🧾', `PDF generado: ${folio}`);
            } catch (error) {
                console.error(error);
                alert('Error al generar PDF: ' + error.message);
            }
        })();
    }

    async function _guardarCotizacionDesdeWizard() {
        const cliente = _nombreClienteWizardResuelto();
        const totalStr = document.getElementById('resTotal')?.innerText || '0';
        const total = parseFloat(totalStr.replace(/[$,]/g, '')) || 0;
        if (!cliente) { alert('Falta el nombre del cliente.'); return; }
        if (total <= 0) { alert('El total debe ser mayor a 0. Agrega materiales o servicios en el Paso 2.'); return; }

        // Construir ítems: componentes manuales + costos calculados (gasolina, traslado, mano de obra)
        const items = [];

        // Agregar componentes manuales (materiales, refacciones)
        items.push(...calculadoraComponentes.map(c => ({
            descripcion: c.nombre,
            cantidad: c.cantidad,
            precio_unitario: c.costo_unitario,
            importe: c.subtotal
        })));

        // Agregar costos calculados del preview si existen
        const km = parseFloat(document.getElementById('inpLogisticaKm')?.value) || 0;
        const horasViaje = parseFloat(document.getElementById('inpLogisticaHoras')?.value) || 0;
        const horasTaller = parseFloat(document.getElementById('inpHorasTaller')?.value) || 0;

        if (km > 0) {
            const gasolina = CostosEngine.calcularCostoGasolina(km);
            if (gasolina > 0) {
                items.push({ descripcion: 'Gasolina (servicio)', cantidad: 1, precio_unitario: gasolina, importe: gasolina });
            }
        }
        if (horasViaje > 0) {
            const traslado = CostosEngine.calcularCostoTrasladoTecnico(horasViaje);
            if (traslado > 0) {
                items.push({ descripcion: 'Traslado técnico', cantidad: 1, precio_unitario: traslado, importe: traslado });
            }
        }
        if (horasTaller > 0) {
            const manoObra = CostosEngine.calcularManoObra(horasTaller);
            if (manoObra > 0) {
                items.push({ descripcion: 'Mano de obra', cantidad: horasTaller, precio_unitario: CostosEngine.CONFIG.manoObra, importe: manoObra });
            }
            const gastosFijos = CostosEngine.calcularGastosFijos(horasTaller);
            if (gastosFijos > 0) {
                items.push({ descripcion: 'Gastos fijos', cantidad: 1, precio_unitario: gastosFijos, importe: gastosFijos });
            }
        }
        const camionetaHoras = calculadoraClienteActual?.horas || 0;
        if (camionetaHoras > 0) {
            const camioneta = CostosEngine.calcularCostoCamioneta(camionetaHoras);
            if (camioneta > 0) {
                items.push({ descripcion: 'Uso de camioneta', cantidad: 1, precio_unitario: camioneta, importe: camioneta });
            }
        }

        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const cotizacionData = {
            folio,
            tipo: 'cotizacion',
            cliente,
            email: calculadoraClienteActual?.email || '',
            telefono: calculadoraClienteActual?.telefono || '',
            rfc: calculadoraClienteActual?.rfc || '',
            fecha: new Date().toISOString().split('T')[0],
            items,
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: total * 0.16 / 1.16,
            total,
            estado: 'registro',
            origen: (ventasWizardCerebro && ventasWizardCerebro.origen_cotizacion) || (compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo'),
            orden_origen_id: compraActual?.vinculacion?.id || compraActual?.id || null,
            cerebro_registro: _cerebroRegistroPayload(),
            vendedor: (await authService.getCurrentProfile())?.nombre || 'Ventas',
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await cotizacionesService.insert(cotizacionData, csrfToken);
            await _syncFolioTrasCotizacion(inserted, cotizacionData, calculadoraComponentes, csrfToken);

            // Registrar evento en orden_historial: creación de cotización
            if (inserted?.id) {
                await _insertarEventoHistorial('cotizacion', inserted.id, 'creacion', `Cotización ${folio} creada desde Ventas`, csrfToken);

                // Si hay orden operativa vinculada, registrar evento de vinculación
                if (compraActual?.vinculacion) {
                    const tipoOrden = compraActual._origen || 'taller';
                    const folioOperativo = ventasWizardCerebro?.folio_operativo || 'N/A';
                    await _insertarEventoHistorial('cotizacion', inserted.id, 'compra_vinculada', `Vinculada con orden de ${tipoOrden}: ${folioOperativo}`, csrfToken);
                }
            }

            // Mostrar toast de éxito
            _showToast('✅ Cotización guardada. Folio: ' + folio, 'success');
            _addToFeed('💾', `Cotización ${folio} guardada`);
            document.getElementById('calculadoraModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            _showToast('Error al guardar: ' + error.message, 'error');
        }
    }

    async function _enviarCotizacionDesdeWizard() {
        const email = calculadoraClienteActual?.email || '';
        if (!email) {
            alert('Para enviar por Gmail necesitas el correo del cliente. Edita el contacto o ingresa el email.');
            return;
        }
        const totalStr = document.getElementById('resTotal')?.innerText || '$0';
        const cliente = calculadoraClienteActual?.nombre || 'Cliente';
        const items = calculadoraComponentes.map(c => ({
            descripcion: c.nombre,
            cantidad: c.cantidad,
            precio_unitario: c.costo_unitario,
            importe: c.subtotal
        }));
        const total = parseFloat(totalStr.replace(/[$,]/g, '')) || 0;
        const folio = `COT-${Date.now().toString().slice(-6)}`;
        const cotizacionData = {
            folio,
            tipo: 'cotizacion',
            cliente,
            email: calculadoraClienteActual?.email || '',
            telefono: calculadoraClienteActual?.telefono || '',
            rfc: calculadoraClienteActual?.rfc || '',
            fecha: new Date().toISOString().split('T')[0],
            items,
            tipo: 'cotizacion',
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: total * 0.16 / 1.16,
            total,
            estado: 'registro',
            origen: (ventasWizardCerebro && ventasWizardCerebro.origen_cotizacion) || (compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo'),
            orden_origen_id: compraActual?.vinculacion?.id || compraActual?.id || null,
            cerebro_registro: _cerebroRegistroPayload(),
            vendedor: (await authService.getCurrentProfile())?.nombre || 'Ventas',
            fecha_creacion: new Date().toISOString()
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await cotizacionesService.insert(cotizacionData, csrfToken);
            await _syncFolioTrasCotizacion(inserted, cotizacionData, calculadoraComponentes, csrfToken);
            if (window.emailService) {
                const profile = await authService.getCurrentProfile();
                const fromVendedor = profile && profile.email ? (profile.nombre || 'Ventas') + ' <' + profile.email + '>' : undefined;
                const html = '<p>Hola ' + cliente + ',</p><p>Adjuntamos la cotización <strong>' + folio + '</strong> por un total de <strong>' + totalStr + '</strong>.</p><p>Quedamos atentos.</p><p>— SSEPI Ventas</p>';
                window.emailService.send(email.trim(), 'Cotización SSEPI - ' + folio, html, undefined, fromVendedor).then(r => { if (r.error) console.warn('Correo:', r.error); });
            }

            // Registrar evento en orden_historial: creación y envío de cotización
            if (inserted?.id) {
                await _insertarEventoHistorial('cotizacion', inserted.id, 'creacion', `Cotización ${folio} creada desde Ventas`, csrfToken);
                await _insertarEventoHistorial('cotizacion', inserted.id, 'cotizacion_enviada', `Cotización enviada a ${email}`, csrfToken);

                if (compraActual?.vinculacion) {
                    const tipoOrden = compraActual._origen || 'taller';
                    const folioOperativo = ventasWizardCerebro?.folio_operativo || 'N/A';
                    await _insertarEventoHistorial('cotizacion', inserted.id, 'compra_vinculada', `Vinculada con orden de ${tipoOrden}: ${folioOperativo}`, csrfToken);
                }
            }

            alert('✅ Cotización guardada y enviada. Folio: ' + folio);
            _addToFeed('📧', `Cotización ${folio} enviada a ${cliente}`);
            document.getElementById('calculadoraModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    // ==================== TOAST NOTIFICATIONS ====================
    function _showToast(mensaje, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${tipo}`;

        const iconos = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = `
            <i class="fas ${iconos[tipo] || iconos.info} toast-icon"></i>
            <span class="toast-message">${mensaje}</span>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(toast);

        // Cerrar al hacer click en X
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        });

        // Auto-cerrar después de 5 segundos
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-ventas);">VENTAS</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        var toggleMenu = document.getElementById('toggleMenu');
        if (toggleMenu) toggleMenu.addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */

        var newCotizacionBtn = document.getElementById('newCotizacionBtn');
        if (newCotizacionBtn) newCotizacionBtn.addEventListener('click', _nuevaCotizacion);

        var closeCalc = document.getElementById('closeCalculadoraModal');
        if (closeCalc) closeCalc.addEventListener('click', function () {
            var m = document.getElementById('calculadoraModal');
            if (m) m.classList.remove('active');
        });
        var closeCotiz = document.getElementById('closeCotizacionModal');
        if (closeCotiz) closeCotiz.addEventListener('click', function () {
            var m = document.getElementById('cotizacionModal');
            if (m) m.classList.remove('active');
        });
        var closeVista = document.getElementById('closeVistaPreviaModal');
        if (closeVista) closeVista.addEventListener('click', function () {
            var m = document.getElementById('vistaPreviaModal');
            if (m) m.classList.remove('active');
        });
        var cancelEdit = document.getElementById('cancelEditBtn');
        if (cancelEdit) cancelEdit.addEventListener('click', function () {
            var m = document.getElementById('cotizacionModal');
            if (m) m.classList.remove('active');
        });
        var guardarCotiz = document.getElementById('guardarCotizacionBtn');
        if (guardarCotiz) guardarCotiz.addEventListener('click', _enviarCotizacionCliente);
        var addProducto = document.getElementById('addProductoBtn');
        if (addProducto) addProducto.addEventListener('click', function () {
            var tbody = document.getElementById('editProductosBody');
            if (!tbody) return;
            var tr = document.createElement('tr');
            tr.innerHTML = '<td><input type="text" placeholder="Descripción" style="width:100%; padding:4px;"></td><td><input type="number" value="1" min="1" style="width:60px; text-align:center;"></td><td><input type="number" value="0" step="0.01" style="width:80px; text-align:right;"></td><td>$0.00</td><td><button class="btn-remove" onclick="this.closest(\'tr\').remove()">✖</button></td>';
            tbody.appendChild(tr);
        });
        var descargarPDF = document.getElementById('descargarPDFBtn');
        if (descargarPDF) descargarPDF.addEventListener('click', _generarPDF);

        var imprimirPreview = document.getElementById('imprimirVistaPreviaBtn');
        if (imprimirPreview) imprimirPreview.addEventListener('click', function () {
            var el = document.getElementById('vistaPreviaImprimible');
            if (!el) return;
            var ventana = window.open('', '_blank');
            ventana.document.write('<!DOCTYPE html><html><head><title>Vista previa - Cotización</title><style>body{font-family:Inter,sans-serif;padding:20px;}</style></head><body>' + el.innerHTML + '</body></html>');
            ventana.document.close();
            ventana.focus();
            ventana.onload = function () { ventana.print(); ventana.close(); };
            setTimeout(function () { ventana.print(); ventana.close(); }, 300);
        });

        var aplicarFiltros = document.getElementById('aplicarFiltrosBtn');
        if (aplicarFiltros) aplicarFiltros.addEventListener('click', function () {
            var fi = document.getElementById('filtroFechaInicio');
            var ff = document.getElementById('filtroFechaFin');
            filtroFechaInicio = fi ? fi.valueAsDate : null;
            filtroFechaFin = ff ? ff.valueAsDate : null;
            var fv = document.getElementById('filtroVendedor');
            filtroVendedor = fv ? fv.value : 'todos';
            var fe = document.getElementById('filtroEstado');
            filtroEstado = fe ? fe.value : 'todos';
            var fb = document.getElementById('filtroBuscar');
            filtroBuscar = fb ? fb.value.trim() : '';
            _syncChipEstado();
            _applyFilters();
        });
        document.querySelectorAll('.chip-filtro').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var estado = chip.getAttribute('data-estado');
                filtroEstado = estado;
                var sel = document.getElementById('filtroEstado');
                if (sel) sel.value = estado;
                _syncChipEstado();
                _applyFilters();
            });
        });

        var vistaKanban = document.getElementById('vistaKanban');
        if (vistaKanban) vistaKanban.addEventListener('click', function () {
            vistaActual = 'kanban';
            var k = document.getElementById('kanbanContainer');
            var l = document.getElementById('listaContainer');
            var g = document.getElementById('graficaContainer');
            if (k) k.style.display = 'flex';
            if (l) l.style.display = 'none';
            if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(function (b) { b.classList.remove('active'); });
            vistaKanban.classList.add('active');
            _applyFilters();
        });
        var vistaLista = document.getElementById('vistaLista');
        if (vistaLista) vistaLista.addEventListener('click', function () {
            vistaActual = 'lista';
            var k = document.getElementById('kanbanContainer');
            var l = document.getElementById('listaContainer');
            var g = document.getElementById('graficaContainer');
            if (k) k.style.display = 'none';
            if (l) l.style.display = 'block';
            if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(function (b) { b.classList.remove('active'); });
            vistaLista.classList.add('active');
            _applyFilters();
        });
        var vistaGrafica = document.getElementById('vistaGrafica');
        if (vistaGrafica) vistaGrafica.addEventListener('click', function () {
            vistaActual = 'grafica';
            var k = document.getElementById('kanbanContainer');
            var l = document.getElementById('listaContainer');
            var g = document.getElementById('graficaContainer');
            if (k) k.style.display = 'none';
            if (l) l.style.display = 'none';
            if (g) g.style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(function (b) { b.classList.remove('active'); });
            vistaGrafica.classList.add('active');
            _applyFilters();
        });

        // Setup de tabs de Historia Comercial (Operativo/Comercial/Gráfica y Pendientes/Emitidas)
        _setupHistoriaComercialTabs();
    }

    // ==================== HISTORIA COMERCIAL (Pendientes vs Emitidas) ====================
    let comercialTabActual = 'pendientes';

    function _renderHistoriaComercial() {
        const container = document.getElementById('historiaComercialContainer');
        if (!container) return;

        // Obtener todas las cotizaciones
        const todas = Array.isArray(cotizaciones) ? cotizaciones : [];

        // Definir "emitida": enviada, autorizada, o con venta cerrada
        const estadosPendientes = ['registro', 'Nuevo', 'diagnostico', 'en_diagnostico', 'cotizacion', 'pendiente_autorizacion_ventas'];
        const estadosEmitidas = ['autorizado', 'autorizada_por_ventas', 'compra', 'en_compra', 'ejecucion', 'en_ejecucion', 'entregado', 'pagado'];

        const pendientes = todas.filter(c => estadosPendientes.includes(c.estado));
        const emitidas = todas.filter(c => estadosEmitidas.includes(c.estado));

        if (comercialTabActual === 'pendientes') {
            _renderComercialPanel('pendientesGrid', pendientes, 'pendiente');
        } else {
            _renderComercialPanel('emitidasGrid', emitidas, 'emitida');
        }
    }

    function _renderComercialPanel(gridId, items, tipo) {
        const grid = document.getElementById(gridId);
        if (!grid) return;

        if (items.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>No hay cotizaciones ${tipo === 'pendiente' ? 'pendientes' : 'emitidas'} en este período.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = items.map(item => {
            const estadoClass = _getEstadoComercialClass(item.estado);
            const estadoLabel = _getEstadoComercialLabel(item.estado);
            const fecha = item.fecha_creacion || item.fecha || '';
            const fechaStr = fecha ? new Date(fecha).toLocaleDateString('es-MX') : '--/--/----';

            return `
                <div class="comercial-card" data-id="${item.id}" data-tipo="cotizacion">
                    <div class="comercial-card-header">
                        <span class="comercial-folio">${item.folio || item.id.slice(-6)}</span>
                        <span class="comercial-estado ${estadoClass}">${estadoLabel}</span>
                    </div>
                    <div class="comercial-card-body">
                        <div class="comercial-cliente">${item.cliente || 'Cliente'}</div>
                        <div class="comercial-total">$${(item.total || 0).toFixed(2)}</div>
                    </div>
                    <div class="comercial-card-footer">
                        <small><i class="fas fa-calendar"></i> ${fechaStr}</small>
                        <small><i class="fas fa-user"></i> ${item.vendedor || 'Ventas'}</small>
                    </div>
                </div>
            `;
        }).join('');

        // Bind click events
        grid.querySelectorAll('.comercial-card').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id, card.dataset.tipo));
        });
    }

    function _getEstadoComercialClass(estado) {
        const map = {
            'registro': 'pendiente',
            'Nuevo': 'pendiente',
            'diagnostico': 'pendiente',
            'en_diagnostico': 'pendiente',
            'cotizacion': 'pendiente',
            'pendiente_autorizacion_ventas': 'pendiente',
            'autorizado': 'autorizado',
            'autorizada_por_ventas': 'autorizado',
            'compra': 'enviado',
            'en_compra': 'enviado',
            'ejecucion': 'enviado',
            'en_ejecucion': 'enviado',
            'entregado': 'facturado',
            'pagado': 'facturado'
        };
        return map[estado] || 'pendiente';
    }

    function _getEstadoComercialLabel(estado) {
        const map = {
            'registro': '📝 Registro',
            'Nuevo': '📝 Nuevo',
            'diagnostico': '🔍 Diagnóstico',
            'en_diagnostico': '🔍 En Diagnóstico',
            'cotizacion': '💰 Cotizando',
            'pendiente_autorizacion_ventas': '⏳ Por Autorizar',
            'autorizado': '✅ Autorizado',
            'autorizada_por_ventas': '✅ Autorizada',
            'compra': '🛒 En Compra',
            'en_compra': '🛒 Comprando',
            'ejecucion': '⚙️ En Ejecución',
            'en_ejecucion': '⚙️ Ejecutando',
            'entregado': '📦 Entregado',
            'pagado': '💵 Pagado'
        };
        return map[estado] || estado;
    }

    function _setupHistoriaComercialTabs() {
        // Tabs principales (Operativo / Comercial / Gráfica)
        document.querySelectorAll('.ventas-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.dataset.tab;

                // Update active state
                document.querySelectorAll('.ventas-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                // Show/hide containers
                const kanban = document.getElementById('kanbanContainer');
                const lista = document.getElementById('listaContainer');
                const comercial = document.getElementById('historiaComercialContainer');
                const grafica = document.getElementById('graficaContainer');

                kanban.style.display = 'none';
                lista.style.display = 'none';
                comercial.style.display = 'none';
                grafica.style.display = 'none';

                if (tabName === 'operativo') {
                    kanban.style.display = 'flex';
                    vistaActual = 'kanban';
                    _applyFilters();
                } else if (tabName === 'comercial') {
                    comercial.style.display = 'block';
                    _renderHistoriaComercial();
                } else if (tabName === 'grafica') {
                    grafica.style.display = 'block';
                    vistaActual = 'grafica';
                    _applyFilters();
                }
            });
        });

        // Tabs comerciales (Pendientes / Emitidas)
        document.querySelectorAll('.comercial-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                comercialTabActual = this.dataset.comercial;

                document.querySelectorAll('.comercial-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                const pendientesPanel = document.getElementById('comercialPendientes');
                const emitidasPanel = document.getElementById('comercialEmitidas');

                if (comercialTabActual === 'pendientes') {
                    pendientesPanel.style.display = 'block';
                    emitidasPanel.style.display = 'none';
                } else {
                    pendientesPanel.style.display = 'none';
                    emitidasPanel.style.display = 'block';
                }

                _renderHistoriaComercial();
            });
        });
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar'), b = document.body;
        if (window.innerWidth <= 768) s.classList.toggle('active');
        else b.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const b = document.body, btn = document.getElementById('themeBtn');
        if (b.getAttribute('data-theme') === 'dark') {
            b.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            b.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    function _generarPDF() {
        const cliente = (document.getElementById('editCliente')?.value || document.getElementById('previewCliente')?.innerText || '').trim();
        const rfc = (document.getElementById('editRFC')?.value || '').trim();
        const total = parseFloat(document.getElementById('editTotal')?.value || '') || 0;

        if (!cliente) {
            alert('Cliente requerido para generar el PDF.');
            return;
        }
        if (!total || total <= 0) {
            alert('Antes de generar PDF, calcula el costo final (Total).');
            return;
        }

        const folio = (document.getElementById('previewFolio')?.innerText || '').trim() || `COT-${Date.now().toString().slice(-6)}`;

        const items = [];
        document.querySelectorAll('#editProductosBody tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            if (inputs.length >= 3) {
                const cantidad = parseInt(inputs[1].value) || 1;
                const precioUnitario = parseFloat(inputs[2].value) || 0;
                items.push({
                    descripcion: inputs[0].value,
                    cantidad,
                    precioUnitario,
                    importe: cantidad * precioUnitario
                });
            }
        });

        const subtotal = total / 1.16;
        const iva = total - subtotal;

        const pdfData = {
            folio,
            cliente,
            rfc: rfc || 'XAXX010101000',
            items,
            subtotal,
            iva,
            total
        };

        (async () => {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                await pdfGenerator.generateCotizacion(pdfData, user);
                _addToFeed('🧾', `PDF generado: ${folio}`);
            } catch (error) {
                console.error(error);
                alert('Error al generar PDF: ' + error.message);
            }
        })();
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _nuevaCotizacion,
        _abrirRegistroRapido,
        _guardarRegistroRapido,
        _abrirCalculadora,
        _agregarComponente,
        _eliminarComponente,
        _recalcular,
        _refreshLogisticaFromInputs,
        _abrirRegistroViaticos,
        _editarViaticosCliente,
        _guardarViaticosCliente,
        _abrirEditorCostos,
        _agregarGastoFijo,
        _eliminarGastoFijo,
        _guardarConfiguracionCostos,
        _autorizarCotizacion,
        _rechazarCotizacion,
        _editarVenta,
        _reenviarCotizacion,
        _abrirDetalle,
        _mostrarHistorial,
        _verOrdenTaller,
        _editarOrdenTaller,
        _eliminarOrdenTaller,
        _insertarEventoHistorial,  // Expuesto para otros módulos que registren eventos
        _getFolioOrdenVinculada,   // Utilidad para obtener folios vinculados
        _renderKanbanCardsAsync    // Render asíncrono con etiquetas de vinculación
    };
})();

window.ventasModule = VentasModule;