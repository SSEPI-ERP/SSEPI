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

    async function _ventasCrearOrdenOperativa(dept, clienteNombre, falla, fechaStr, prioridad, csrfToken) {
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
        const notasAlta = [prioLine, 'Alta desde Ventas (cerebro).'].join('\n');

        try {
            if (dept === 'Taller Electrónica') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioLaboratorio;
                const folio = folioFn ? await folioFn() : 'SP-E' + new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0') + '001';
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    equipo: '—',
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
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'taller', folio_taller: folio },
                    _origen: 'taller'
                };
                return { folio, ordenId: inserted.id, tipo: 'taller' };
            }

            if (dept === 'Taller Motores') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioMotores;
                const folio = folioFn ? await folioFn() : 'SP-M' + new Date().getFullYear().toString().slice(-2) + String(new Date().getMonth() + 1).padStart(2, '0') + '001';
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    motor: '—',
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
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'motor' },
                    _origen: 'motores'
                };
                return { folio, ordenId: inserted.id, tipo: 'motor' };
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
                    nombre,
                    cliente: clienteNombre,
                    fecha: (fechaStr || new Date().toISOString().split('T')[0]),
                    vendedor: userName,
                    notas_generales: [falla, prioLine].filter(Boolean).join('\n\n'),
                    estado: 'pendiente'
                };
                const inserted = await proyectosService.insert(row, csrfToken);
                if (!inserted) {
                    throw new Error('No se recibió confirmación del servidor al crear el registro de Automatización/Proyectos.');
                }
                if (inserted && proyectos && !proyectos.some((p) => p.id === inserted.id)) proyectos.unshift(inserted);
                const origen = dept === 'Automatización' ? 'automatizacion' : 'proyecto';
                compraActual = {
                    id: inserted.id,
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'proyecto' },
                    _origen: origen
                };
                return { folio, ordenId: inserted.id, tipo: 'proyecto' };
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
        clientes: [
            { nombre: "ANGUIPLAST", km: 234, horas: 6, direccion: "Libramiento Norte Km. 2, Arandas, JAL", rfc: "ANG101215PG0", contacto: "Ing. Compras" },
            { nombre: "BOLSAS DE LOS ALTOS", km: 226, horas: 5, direccion: "Carr. Tepatitlán - Arandas, JAL", rfc: "BAL050101AA1", contacto: "Lic. Adquisición" },
            { nombre: "ECOBOLSAS", km: 216, horas: 5, direccion: "Parque Industrial León, GTO", rfc: "ECO990202BB2", contacto: "Gerente Planta" },
            { nombre: "BADER TABACHINES", km: 17.2, horas: 2, direccion: "Blvd. J. Clouthier, León, GTO", rfc: "BAD880303CC3", contacto: "Mantenimiento" },
            { nombre: "BODYCOTE", km: 90.6, horas: 3, direccion: "Silao, Guanajuato Puerto Interior", rfc: "BOD770404DD4", contacto: "Ing. Proyectos" },
            { nombre: "COFICAB", km: 80, horas: 3, direccion: "Puerto Interior, Silao, GTO", rfc: "COF660505EE5", contacto: "Ing. Eléctrico" },
            { nombre: "CONDUMEX", km: 90.6, horas: 3, direccion: "Silao, GTO", rfc: "CON550606FF6", contacto: "Compras" },
            { nombre: "ECSA", km: 32, horas: 2, direccion: "León, GTO", rfc: "ECS440707GG7", contacto: "Admin" }
        ]
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
                { orderBy: 'fecha', ascending: false, page: 0, pageSize: 400 }
            ) || [];
        } catch (e) {
            console.warn('[Ventas] Error cargando cotizaciones:', e);
            cotizaciones = [];
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

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
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

        const subCompras = supabase
            .channel('compras_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                _loadCompras();
                _renderSolicitudesTaller();
            })
            .subscribe();
        subscriptions.push(subCompras);
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        const list = [...(Array.isArray(ventas) ? ventas : []), ...(Array.isArray(cotizaciones) ? cotizaciones : [])];
        let filtered = list;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(item => {
                const f = new Date(item.fecha);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroVendedor !== 'todos') {
            filtered = filtered.filter(item => item.vendedor === filtroVendedor);
        }
        if (filtroEstado !== 'todos') {
            if (filtroEstado === 'Pendiente') {
                filtered = filtered.filter(item =>
                    (item.tipo === 'cotizacion' && (item.estado === 'pendiente_autorizacion_ventas' || !item.estado)) ||
                    (item.tipo !== 'cotizacion' && item.estatus_pago === 'Pendiente')
                );
            } else if (filtroEstado === 'Autorizado') {
                filtered = filtered.filter(item =>
                    (item.tipo === 'cotizacion' && item.estado === 'autorizada_por_ventas') ||
                    (item.tipo !== 'cotizacion' && item.estatus_pago === 'Pagado')
                );
            } else if (filtroEstado === 'Rechazadas') {
                filtered = filtered.filter(item =>
                    item.tipo === 'cotizacion' && item.estado === 'rechazada_por_ventas'
                );
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
        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _syncChipEstado() {
        document.querySelectorAll('.chip-filtro').forEach(function (chip) {
            var estado = chip.getAttribute('data-estado');
            if (estado === filtroEstado) chip.classList.add('active');
            else chip.classList.remove('active');
        });
    }

    function _renderKanban(items) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const cotizaciones = items.filter(i => i.tipo === 'cotizacion' && i.estatus_pago !== 'Pagado');
        const pendientes = items.filter(i => i.tipo !== 'cotizacion' && i.estatus_pago === 'Pendiente');
        const pagadas = items.filter(i => i.tipo !== 'cotizacion' && i.estatus_pago === 'Pagado');

        let html = `
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #ff9800;">
                    <span>📄 Cotizaciones</span>
                    <span class="badge" style="background: #ff9800;">${cotizaciones.length}</span>
                </div>
                <div class="kanban-cards">${_renderKanbanCards(cotizaciones)}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #2196f3;">
                    <span>⏳ Pendientes</span>
                    <span class="badge" style="background: #2196f3;">${pendientes.length}</span>
                </div>
                <div class="kanban-cards">${_renderKanbanCards(pendientes)}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #4caf50;">
                    <span>✅ Pagadas</span>
                    <span class="badge" style="background: #4caf50;">${pagadas.length}</span>
                </div>
                <div class="kanban-cards">${_renderKanbanCards(pagadas)}</div>
            </div>
        `;
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id, card.dataset.tipo));
        });
    }

    function _renderKanbanCards(items) {
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

    // ==================== CALCULADORA DE COSTOS ====================
    function _abrirCalculadora(compraId) {
        const compra = solicitudesTaller.find(s => s.id === compraId);
        if (!compra) return;

        compraActual = compra;
        const ordenTallerId = compra.vinculacion?.id;

        let horasEstimadas = 0;
        if (ordenTallerId) {
            const orden = taller.find(o => o.id === ordenTallerId);
            if (orden) horasEstimadas = orden.horas_estimadas || 0;
        }

        const clienteNombre = compra.vinculacion?.nombre || '';
        const clienteTabulador = tabuladorTaller.clientes.find(c => c.nombre === clienteNombre);
        calculadoraClienteActual = {
            nombre: clienteNombre,
            km: clienteTabulador?.km || 0,
            horas: clienteTabulador?.horas || 0
        };

        calculadoraComponentes = [];
        wizardPaso = 2;

        const modal = document.getElementById('calculadoraModal');
        _renderWizardPaso(2);
        modal.classList.add('active');
        _bindWizardEvents();
    }

    function _generarHTMLCalculadora(compra, horasEstimadas) {
        const cliente = calculadoraClienteActual;
        const gasolina = CostosEngine.calcularCostoGasolina(cliente.km);
        const traslado = CostosEngine.calcularCostoTrasladoTecnico(cliente.horas);
        const gasolinaMasTraslado = CostosEngine.calcularGasolinaMasTraslado(cliente.km, cliente.horas);
        const manoObraBase = CostosEngine.calcularManoObra(horasEstimadas);
        const gastosFijosBase = CostosEngine.calcularGastosFijos(horasEstimadas);
        const camionetaBase = CostosEngine.calcularCostoCamioneta(cliente.horas);

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-truck"></i> Datos Logísticos (Viáticos y Traslados)</div>
                <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">Viáticos y traslados según kilómetros del cliente. Horas de viaje para costo técnico.</p>
                <div class="info-logistica" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
                    <label style="display:flex;align-items:center;gap:6px;">KM
                        <input type="number" id="inpLogisticaKm" min="0" step="0.1" value="${Number(cliente.km) || 0}" style="width:72px;padding:4px;" onchange="ventasModule._refreshLogisticaFromInputs()" oninput="ventasModule._refreshLogisticaFromInputs()">
                    </label>
                    <div>GASOLINA: <strong id="lblLogisticaGasolina">$${gasolina.toFixed(2)}</strong></div>
                    <div>TRASLADO: <strong id="lblLogisticaTraslado">$${traslado.toFixed(2)}</strong></div>
                    <div>GAS+VENTAS: <strong id="lblLogisticaGasPlus">$${gasolinaMasTraslado.toFixed(2)}</strong></div>
                    <label style="display:flex;align-items:center;gap:6px;">HRS VIAJE
                        <input type="number" id="inpLogisticaHoras" min="0" step="0.5" value="${Number(cliente.horas) || 0}" style="width:72px;padding:4px;" onchange="ventasModule._refreshLogisticaFromInputs()" oninput="ventasModule._refreshLogisticaFromInputs()">
                    </label>
                </div>
            </div>
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-boxes"></i> Refacciones y Componentes</div>
                <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">Agrega refacciones desde el Inventario Maestro o componentes manualmente. Horas de ingeniería abajo.</p>
                <table class="componentes-table">
                    <thead><tr><th>Componente</th><th>Cantidad</th><th>Costo Unit.</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody id="componentesTableBody"></tbody>
                </table>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; margin-top:15px;">
                    <input type="text" id="compNombre" placeholder="Componente" style="padding:8px;">
                    <input type="number" id="compCantidad" value="1" min="1" style="padding:8px;">
                    <input type="number" id="compCosto" value="0" step="0.01" style="padding:8px;">
                    <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarComponente()">Agregar</button>
                </div>
            </div>
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-chart-line"></i> Cálculo de Costos</div>
                <div class="costos-grid">
                    <div class="costo-item"><div class="costo-label">Gasolina + Ventas</div><div class="costo-value" id="valGasPlusSales">$${gasolinaMasTraslado.toFixed(2)}</div></div>
                    <div class="costo-item"><div class="costo-label">Mano de Obra</div><div class="costo-value"><input type="number" id="inpTechHours" value="${horasEstimadas}" onchange="ventasModule._recalcular()"></div></div>
                    <div class="costo-item"><div class="costo-label">Gastos Fijos</div><div class="costo-value" id="valFixedCosts">$${gastosFijosBase.toFixed(2)}</div></div>
                    <div class="costo-item"><div class="costo-label">Refacciones</div><div class="costo-value"><input type="number" id="inpParts" value="0" onchange="ventasModule._recalcular()"></div></div>
                    <div class="costo-item"><div class="costo-label">Camioneta</div><div class="costo-value" id="valTruck">$${camionetaBase.toFixed(2)}</div></div>
                </div>
                <div style="background:#f5f5f5; padding:20px; border-radius:8px; margin-top:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>GASTOS GENERALES</strong></span><span id="resGeneralExpenses">$0.00</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; color:var(--c-ventas);"><span><strong>UTILIDAD ${CostosEngine.CONFIG.utilidad}%</strong></span><span id="resUtility">$0.00</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>CRÉDITO ${CostosEngine.CONFIG.credito}%</strong></span><span id="resCredit">$0.00</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>IVA ${CostosEngine.CONFIG.iva}%</strong></span><span id="resIVA">$0.00</span></div>
                </div>
                <div class="total-box">
                    <div class="label">TOTAL CON IVA</div>
                    <div class="value" id="resTotal">$0.00</div>
                </div>
            </div>
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
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: total * 0.16 / 1.16,
            total,
            estado: 'pendiente_autorizacion_ventas',
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
            alert('✅ Cotización guardada y enviada para autorización');
            _addToFeed('📧', `Cotización ${folio} enviada a ${cliente}`);
            document.getElementById('cotizacionModal').classList.remove('active');
            document.getElementById('calculadoraModal').classList.remove('active');
        } catch (error) {
            console.error(error);
            alert('Error al guardar cotización: ' + error.message);
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

        // Mapeo de tipo a columna de BD
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
                .select(`
                    *,
                    creado_por_usuario:usuarios (nombre, email)
                `)
                .eq(columnName, id)
                .order('creado_en', { ascending: false });

            if (error) throw error;

            const events = data || [];

            if (events.length === 0) {
                body.innerHTML = `
                    <div style="text-align:center; padding:40px; color:var(--text-secondary);">
                        <i class="fas fa-history" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                        <p>No hay eventos registrados en el historial.</p>
                    </div>
                `;
            } else {
                body.innerHTML = `
                    <div style="max-height:60vh; overflow-y:auto;">
                        ${events.map(e => {
                            const fecha = new Date(e.creado_en).toLocaleString('es-MX');
                            const usuario = e.creado_por_usuario?.nombre || e.creado_por_usuario?.email?.split('@')[0] || 'Sistema';
                            const iconMap = {
                                'creacion': '🆕',
                                'cotizacion_guardada': '💾',
                                'cotizacion_enviada': '📧',
                                'cotizacion_autorizada': '✅',
                                'cotizacion_rechazada': '❌',
                                'cambio_estado': '🔄',
                                'costo_agregado': '💰',
                                'compra_vinculada': '🔗',
                                'folio_generado': '📄',
                                'venta_cerrada': '💵'
                            };
                            const icon = iconMap[e.evento] || '📝';
                            return `
                                <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:flex-start;">
                                    <span style="font-size:20px;">${icon}</span>
                                    <div style="flex:1;">
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <strong style="color:var(--c-ventas);">${e.evento.replace(/_/g, ' ').toUpperCase()}</strong>
                                            <span style="font-size:12px; color:var(--text-secondary);">${fecha}</span>
                                        </div>
                                        <p style="margin:4px 0; color:var(--text-secondary);">${e.descripcion || ''}</p>
                                        <span style="font-size:11px; color:var(--text-muted);">Por: ${usuario}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            modal.classList.add('active');
        } catch (error) {
            console.error('[Ventas] mostrarHistorial:', error);
            body.innerHTML = `<p style="color:#c62828;">Error al cargar historial: ${error.message}</p>`;
            modal.classList.add('active');
        }
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

    // ==================== NUEVA COTIZACIÓN DIRECTA (Wizard 4 pasos) ====================
    function _nuevaCotizacion() {
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
        _renderWizardPaso(1);
        modal.classList.add('active');
        _bindWizardEvents();
    }

    function _getWizardTitles() {
        return {
            1: 'Registro del caso',
            2: 'Calculadora de Ingeniería',
            3: 'Margen y Finanzas',
            4: 'Confirmación'
        };
    }

    function _renderWizardPaso(paso) {
        wizardPaso = paso;
        var titles = _getWizardTitles();
        var titleEl = document.getElementById('wizardModalTitle');
        var indicatorEl = document.getElementById('wizardStepIndicator');
        if (titleEl) titleEl.textContent = 'Paso ' + paso + ': ' + (titles[paso] || '');
        if (indicatorEl) indicatorEl.textContent = 'Paso ' + paso + ' de 4';

        var body = document.getElementById('calculadoraBody');
        if (!body) return;
        if (paso === 1) {
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
        if (guardarBtn) guardarBtn.style.display = paso === 4 ? 'inline-block' : 'none';
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

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-clipboard-list"></i> Paso 1: Registro de datos</div>
                <p id="wizardPaso1Error" style="display:none; font-size:13px; color:#c62828; margin:0 0 12px 0;" role="alert"></p>
                <div class="editor-item" style="margin-bottom:14px;">
                    <p id="wizardFolioAyuda" style="font-size:13px; color:var(--text-secondary); margin:0;">Elige departamento.</p>
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
                    <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Requerido para continuar con la cotización.</p>
                </div>
                <div class="editor-item" style="margin-top:14px;">
                    <label>Falla reportada <span style="color:#c62828;">*</span></label>
                    <textarea id="wizardFallaReportada" rows="3" placeholder="Describe la falla o requerimiento..." style="width:100%; padding:10px; resize:vertical;"></textarea>
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
                            <option value="Administración">Administración</option>
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
            if (!clienteId) { _wizardSetPaso1Error('❌ Selecciona un cliente.'); return; }
            if (!fechaIn?.value) { _wizardSetPaso1Error('❌ Indica la fecha de ingreso.'); return; }
            if (!nombreProducto) { _wizardSetPaso1Error('❌ Ingresa el nombre del producto (requerido para continuar).'); return; }
            if (!falla) { _wizardSetPaso1Error('❌ Describe la falla o el requerimiento.'); return; }
            if (!dept) { _wizardSetPaso1Error('❌ Selecciona el departamento que recibe el caso.'); return; }

            const contacto = contactos.find(c => c.id === clienteId);
            const clienteNombre = contacto
                ? (contacto.nombre || contacto.empresa || contacto.email || 'Cliente')
                : '';
            if (contacto) {
                const opt = clienteSelect?.options[clienteSelect.selectedIndex];
                const km = parseInt(opt?.dataset?.km, 10) || 0;
                const clienteTabulador = tabuladorTaller.clientes.find(c => c.nombre === (contacto.nombre || contacto.empresa));
                calculadoraClienteActual = {
                    nombre: clienteNombre,
                    km: clienteTabulador?.km || km || 0,
                    horas: clienteTabulador?.horas || 0,
                    email: contacto.email,
                    telefono: contacto.telefono,
                    rfc: contacto.rfc,
                    producto: nombreProducto
                };
            } else {
                calculadoraClienteActual = { nombre: clienteNombre, km: 0, horas: 0, producto: nombreProducto };
            }

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
        _renderWizardPaso(wizardPaso + 1);
    }

    function _wizardAnterior() {
        if (wizardPaso <= 1) return;
        _renderWizardPaso(wizardPaso - 1);
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

    function _descargarPDFDesdeWizard() {
        const cliente = calculadoraClienteActual?.nombre || '';
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
        const cliente = calculadoraClienteActual?.nombre || '';
        const totalStr = document.getElementById('resTotal')?.innerText || '0';
        const total = parseFloat(totalStr.replace(/[$,]/g, '')) || 0;
        if (!cliente) { alert('Falta el nombre del cliente.'); return; }
        if (total <= 0) { alert('El total debe ser mayor a 0.'); return; }

        const items = calculadoraComponentes.map(c => ({
            descripcion: c.nombre,
            cantidad: c.cantidad,
            precio_unitario: c.costo_unitario,
            importe: c.subtotal
        }));

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
            estado: 'pendiente_autorizacion_ventas',
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
            alert('✅ Cotización guardada. Folio: ' + folio);
            _addToFeed('💾', `Cotización ${folio} guardada`);
            document.getElementById('calculadoraModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
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
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: total * 0.16 / 1.16,
            total,
            estado: 'pendiente_autorizacion_ventas',
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
        _abrirCalculadora,
        _agregarComponente,
        _eliminarComponente,
        _recalcular,
        _refreshLogisticaFromInputs,
        _autorizarCotizacion,
        _rechazarCotizacion,
        _editarVenta,
        _reenviarCotizacion,
        _abrirDetalle,
        _mostrarHistorial
    };
})();

window.ventasModule = VentasModule;