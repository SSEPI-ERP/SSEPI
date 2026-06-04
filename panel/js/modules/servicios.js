// ================================================
// ARCHIVO: servicios.js
// DESCRIPCIÓN: Módulo de Automatización Industrial adaptado a Supabase
// BASADO EN: servicios-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de proyectos de automatización con 5 pasos,
//                épicas, tareas, subtareas, materiales, cronograma Gantt.
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { pdfGenerator } from '../core/pdf-generator.js?v=8';
import { getPrioritySuppliersForModule } from '../core/ssepi-runtime/priority-suppliers-catalog.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';
import { purgeDraftRecordKeys } from '../core/ssepi-runtime/draft-purge-keys.js';
import { ssepiOn, SSEPI_EVENTS } from '../core/ssepi-runtime/ssepi-event-bus.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';
import {
    validarHorasPlan,
    aplicarHorasExtraEnSub,
    calcularHorasExtraSub
} from '../core/horas-jerarquia.js';

const HJ = () => window.SSEPIHorasJerarquia || {};

const ServiciosModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let projects = [];
    let inventory = [];
    let materialCatalogLoaded = false;
    let currentProject = null;
    let projectId = null;
    let isNewProject = true;
    let currentStep = 1;
    let fechaInicio = null;
    let fechasEtapas = {};

    // Listas específicas
    let actividades = [];
    let materiales = [];
    let epicas = [];
    let apartados = [];
    /** Servicios acordados en Ventas (paso 1 levantamiento), editables aquí */
    let serviciosLevantamiento = [];
    let clientesSelectList = [];
    let ganttMeta = null;
    /** Evidencias generales del paso Desarrollo (no por sub-actividad) */
    let archivosDesarrollo = [];

    /** Mismo catálogo que Ventas (tabuladorAutomatizacion.servicios) para agregar en levantamiento */
    const CATALOGO_SERVICIOS_VENTAS = [
        { area: "Diseño e ingeniería", servicio: "Diseño de arquitectura de control" },
        { area: "Diseño e ingeniería", servicio: "Selección de equipos de control" },
        { area: "Eléctrica", servicio: "Diseño de tablero eléctrico BT" },
        { area: "Eléctrica", servicio: "Fabricación e instalación de tablero BT" },
        { area: "Eléctrica", servicio: "Instalación de cableado/sensores" },
        { area: "Control", servicio: "Programación de rutinas en PLC" },
        { area: "Control", servicio: "Creación de interfaz HMI" },
        { area: "Control", servicio: "Configuración de servomotores" },
        { area: "Control", servicio: "Programación de variadores VFD" },
        { area: "Diseño mecánico", servicio: "Modelado 3D de herramental" },
        { area: "Sistemas de visión", servicio: "Lectura y validación de códigos QR" },
        { area: "Sistemas de visión", servicio: "Integración de cámaras industriales" },
        { area: "Sistemas de visión", servicio: "Trazabilidad y registro de producción" },
        { area: "Soporte", servicio: "Diagnóstico de fallas en sistemas" },
        { area: "Soporte", servicio: "Optimización de tiempos de ciclo" },
        { area: "Soporte", servicio: "Respaldo y documentación" },
        { area: "Soporte", servicio: "Capacitación a personal" }
    ];

    // Catálogo de servicios (fijo)
    const catalogoServicios = [
        { area: "Diseño", servicio: "Diseño arquitectura de control", tipo: "O", horasBase: 6 },
        { area: "Eléctrica", servicio: "Diseño tablero BT", tipo: "O", horasBase: 8 },
        { area: "Eléctrica", servicio: "Instalación cableado", tipo: "P", horasBase: 4 },
        { area: "Control", servicio: "Programación PLC", tipo: "O", horasBase: 10 },
        { area: "Control", servicio: "Configuración variadores", tipo: "O", horasBase: 6 },
        { area: "Visión", servicio: "Integración cámaras", tipo: "P", horasBase: 8 },
        { area: "Soporte", servicio: "Diagnóstico en sitio", tipo: "P", horasBase: 4 }
    ];

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroIngeniero = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    // Servicios de datos
    const proyectosService = createDataService('proyectos_automatizacion');
const notificacionesService = createDataService('notificaciones');
    const inventarioService = createDataService('inventario');
    const bomService = createDataService('bom_automatizacion');
    const comprasService = createDataService('compras');

    // ===== Mapeo de estados del flujo comercial =====
    function _estadoToPaso(estado) {
        const mapa = {
            'Nuevo': 1, 'Registrado': 1, 'pendiente': 1,
            'Diagnóstico': 2, 'progreso': 2,
            'Esperando Cotización': 3,
            'Esperando Confirmación Cliente': 3,
            'Garantía': 3,
            'Confirmado': 4, 'En ejecución': 4, 'Reparado / Listo': 4,
            'completado': 5, 'Completado': 5, 'Entregado': 5, 'Facturado': 5,
            'Cancelado': 0
        };
        return mapa[estado] || 1;
    }

    function _pasoToEstado(paso) {
        const mapa = { 1: 'Registrado', 2: 'Diagnóstico', 3: 'Esperando Cotización', 4: 'En ejecución', 5: 'Completado' };
        return mapa[paso] || 'Registrado';
    }

    function _estadoPrioridad(estado) {
        const mapa = {
            'Nuevo': 1, 'Registrado': 1, 'pendiente': 1,
            'Diagnóstico': 2, 'Garantía': 2, 'progreso': 2,
            'Esperando Cotización': 3, 'Esperando Confirmación Cliente': 3,
            'Confirmado': 4, 'En ejecución': 4, 'Reparado / Listo': 4,
            'Completado': 5, 'completado': 5, 'Entregado': 5, 'Facturado': 5,
            'Cancelado': 0
        };
        return mapa[estado] || 1;
    }

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];
    let serviciosAutosaveCtrl = null;
    let serviciosDraftSessionKey = null;
    let serviciosDraftIndTimer = null;
    let materialBusquedaQuery = '';
    let perfilUsuario = null;

    /** En Automatización no se muestran importes en pantalla (van en Ventas / admin contable). */
    function _verFinanciero() {
        return false;
    }

    function _esAdminAuto() {
        return !!(perfilUsuario && ['admin', 'superadmin'].includes(perfilUsuario.rol));
    }

    /** Garantía: flujo comercial estricto (materiales → compras → confirmación → desarrollo). */
    function _proyectoEsGarantiaFlujo() {
        if (!currentProject) return false;
        if (currentProject.es_garantia) return true;
        const s = String(currentProject.estado || '').trim();
        if (/garant[ií]a/i.test(s)) return true;
        return _normEstadoProyecto(currentProject.estado) === 'garantia';
    }

    /** Proyecto terminado: solo consulta/navegación entre pasos, sin empujar a Compras ni cambiar estado. */
    function _proyectoEsCompletadoConsulta() {
        if (!currentProject || _proyectoEsGarantiaFlujo()) return false;
        return _normEstadoProyecto(currentProject.estado) === 'completado';
    }

    function _urlCompraVinculadaProyecto() {
        if (!projectId) return null;
        const folio = currentProject?.compra_folio || currentProject?.compras_folios?.[0];
        let q = `vincTipo=proyecto&vincId=${encodeURIComponent(String(projectId))}`;
        if (folio) q += `&folio=${encodeURIComponent(folio)}`;
        return `/panel/pages/ssepi_compras.html?${q}`;
    }

    function _aplicarModoConsultaUI() {
        const consulta = _proyectoEsCompletadoConsulta();
        const banner = document.getElementById('autoModoConsultaBanner');
        if (banner) {
            banner.hidden = !consulta;
            banner.style.display = consulta ? 'block' : 'none';
        }
        const hint = consulta
            ? 'Puede revisar cualquier paso con Anterior/Siguiente o los botones de etapa. No se altera el flujo ni Compras.'
            : '';
        [
            'generarRequerimientoCompraBtn',
            'btnClienteConfirmadoAuto',
            'guardarMateriales',
            'terminarEtapa2',
            'terminarEtapa3',
            'terminarEtapa4',
            'terminarEtapa5'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.disabled = consulta;
            if (consulta) el.title = 'Orden completada — active garantía si requiere retrabajo formal';
            else el.removeAttribute('title');
        });
        const nextBtn = document.getElementById('nextStepBtn');
        if (nextBtn) nextBtn.textContent = consulta ? 'Ver siguiente paso →' : 'Siguiente →';
        const verOc = document.getElementById('btnVerOcCompraAuto');
        if (verOc) {
            const href = _urlCompraVinculadaProyecto();
            verOc.style.display = consulta && href ? 'inline-flex' : 'none';
            if (href) verOc.href = href;
        }
    }

    function _escHtml(t) {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    function _uid(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function _normalizarSubactividad(s, j) {
        const archivosRaw = s.archivos || s.images || [];
        const archivos = (Array.isArray(archivosRaw) ? archivosRaw : []).map((x) => {
            if (typeof x === 'string') return { url: x, nombre: 'archivo', tipo: 'image' };
            return { url: x.url, nombre: x.nombre || x.name || 'archivo', tipo: x.tipo || 'file' };
        });
        const hijos = Array.isArray(s.hijos) ? s.hijos.map(_normalizarSubactividad) : [];
        return {
            id: s.id || _uid('sub-'),
            titulo: s.titulo || '',
            horas_plan: Number(s.horas_plan ?? s.horas ?? 0),
            inicio_at: s.inicio_at || null,
            fin_at: s.fin_at || null,
            duracion_minutos: Number(s.duracion_minutos) || 0,
            estado: s.estado || (s.done ? 'completado' : 'pendiente'),
            archivos,
            subtarea_modulo_id: s.subtarea_modulo_id || null,
            hijos
        };
    }

    function _resolverSubPath(actIdx, pathStr) {
        const parts = String(pathStr).split('.').map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));
        if (!actividades[actIdx] || !parts.length) return null;
        let list = actividades[actIdx].subactividades;
        for (let i = 0; i < parts.length; i++) {
            const node = list?.[parts[i]];
            if (!node) return null;
            if (i === parts.length - 1) return { node, list, index: parts[i] };
            if (!node.hijos) node.hijos = [];
            list = node.hijos;
        }
        return null;
    }

    function _contarSubactividadesTotal(subs) {
        if (!subs?.length) return 0;
        return subs.reduce((n, s) => n + 1 + _contarSubactividadesTotal(s.hijos), 0);
    }

    function _flattenSubactividades(subs, prefix) {
        const out = [];
        (subs || []).forEach((sub, i) => {
            const path = prefix ? `${prefix}.${i}` : String(i);
            const depth = prefix ? (prefix.match(/\./g) || []).length + 1 : 0;
            out.push({ sub, path, depth });
            if (sub.hijos?.length) out.push(..._flattenSubactividades(sub.hijos, path));
        });
        return out;
    }

    let autoMarkupPctCache = null;

    function _costoUnitarioMaterial(m) {
        if (m.costo_unitario != null && Number(m.costo_unitario) >= 0) return Number(m.costo_unitario);
        const sku = String(m.sku || '').trim();
        if (sku) {
            const p = inventory.find((x) => x.sku === sku);
            if (p && p.costo != null) return Number(p.costo);
        }
        return 0;
    }

    async function _getAutoMarkupPct() {
        if (autoMarkupPctCache != null) return autoMarkupPctCache;
        let pct = 17;
        const sb = _supabase();
        if (sb) {
            try {
                const { data: aut } = await sb.from('calculadoras').select('id').ilike('nombre', '%Automatiz%').limit(1).maybeSingle();
                if (aut?.id) {
                    const { data: rows } = await sb.from('calculadora_costos').select('concepto,costo').eq('calculadora_id', aut.id);
                    const hit = (rows || []).find((r) => String(r.concepto || '').includes('markupMateriales'));
                    if (hit && Number(hit.costo) > 0) pct = Number(hit.costo);
                }
            } catch (e) { /* opcional */ }
        }
        autoMarkupPctCache = pct;
        return pct;
    }

    /** Líneas con costos para Compras: materiales, markup %, servicios/actividades, traslado. */
    async function _buildLineasCompraAutomatizacion() {
        const markupPct = await _getAutoMarkupPct();
        const lineas = [];
        let matBase = 0;

        materiales.forEach((m) => {
            const cu = _costoUnitarioMaterial(m);
            const q = parseInt(m.cantidad, 10) || 1;
            const ct = cu * q;
            matBase += ct;
            lineas.push({
                tipo: 'material',
                sku: m.sku || '',
                nombre: m.nombre || m.descripcion || 'Material',
                descripcion: [m.sku, m.descripcion].filter(Boolean).join(' · '),
                cantidad: q,
                costo_unitario: cu,
                costo_total: ct
            });
        });

        const markupMonto = matBase * (markupPct / 100);
        if (markupMonto > 0.005) {
            lineas.push({
                tipo: 'markup',
                sku: '',
                nombre: `Recargo materiales (${markupPct}%)`,
                descripcion: 'Markup ingeniería / automatización',
                cantidad: 1,
                costo_unitario: markupMonto,
                costo_total: markupMonto
            });
        }

        (actividades || []).forEach((a) => {
            if (!a.servicio) return;
            const hrs = Number(a.horas) || 1;
            const tarifa = Number(a.tarifa) || (a.tipo === 'P' ? 80 : 120);
            const ct = hrs * tarifa;
            lineas.push({
                tipo: 'servicio',
                sku: '',
                nombre: a.servicio,
                descripcion: (a.area || 'Ingeniería') + (a.tipo ? ' · ' + a.tipo : ''),
                cantidad: hrs,
                costo_unitario: tarifa,
                costo_total: ct
            });
        });

        const km = Number(document.getElementById('autoCostoKm')?.value) || Number(currentProject?.auto_costo_km) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || Number(currentProject?.auto_costo_hrs_cam) || 0;
        const costoGas = CostosEngine.calcularCostoGasolina(km);
        const costoCam = CostosEngine.calcularCostoCamioneta(hrsCam);
        if (costoGas > 0) {
            lineas.push({
                tipo: 'traslado',
                nombre: 'Gasolina (traslado)',
                descripcion: km + ' km',
                cantidad: 1,
                costo_unitario: costoGas,
                costo_total: costoGas
            });
        }
        if (costoCam > 0) {
            lineas.push({
                tipo: 'traslado',
                nombre: 'Camioneta (traslado)',
                descripcion: hrsCam + ' h',
                cantidad: 1,
                costo_unitario: costoCam,
                costo_total: costoCam
            });
        }

        const subtotal = lineas.reduce((s, l) => s + (Number(l.costo_total) || 0), 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;

        return {
            lineas,
            costo_resumen: {
                materiales_base: matBase,
                markup_materiales_pct: markupPct,
                markup_materiales_monto: markupMonto,
                subtotal,
                iva,
                total
            },
            subtotal,
            iva,
            total
        };
    }

    function _normalizarActividades(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map((a, i) => ({
            id: a.id || _uid('act-'),
            area: a.area || '',
            servicio: a.servicio || a.nombre || '',
            tipo: a.tipo === 'P' ? 'P' : 'O',
            horas: Number(a.horas) || 0,
            actividad_modulo_id: a.actividad_modulo_id || null,
            subactividades: Array.isArray(a.subactividades)
                ? a.subactividades.map(_normalizarSubactividad)
                : []
        }));
    }

    async function _cargarClientesSelect() {
        if (!window.supabase) return;
        try {
            const { data: tab } = await window.supabase
                .from('clientes_tabulador')
                .select('nombre_cliente, km, horas_viaje, activo, orden')
                .order('orden', { ascending: true });
            let contactos = [];
            try {
                const { data: cData } = await window.supabase
                    .from('contactos')
                    .select('nombre, tipo, empresa')
                    .in('tipo', ['cliente', 'contacto_empresa', 'empresa'])
                    .order('nombre');
                contactos = cData || [];
            } catch (e) { /* contactos opcional */ }
            const names = new Set();
            clientesSelectList = [];
            (tab || []).forEach((r) => {
                const n = String(r.nombre_cliente || '').trim();
                if (!n || names.has(n)) return;
                if (r.activo === false) return;
                names.add(n);
                clientesSelectList.push({ nombre: n, km: r.km, horas: r.horas_viaje, source: 'tabulador' });
            });
            contactos.forEach((c) => {
                const n = String(c.nombre || '').trim();
                if (!n || names.has(n)) return;
                names.add(n);
                clientesSelectList.push({ nombre: n, source: 'contacto' });
            });
            clientesSelectList.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
            _renderClientesSelect();
        } catch (e) {
            console.warn('[Automatización] clientes select:', e);
        }
    }

    function _renderClientesSelect(selectedNombre) {
        const sel = document.getElementById('paso1_cliente');
        if (!sel) return;
        const cur = selectedNombre != null ? selectedNombre : sel.value;
        let html = '<option value="">— Seleccionar cliente —</option>';
        clientesSelectList.forEach((c) => {
            html += '<option value="' + _escHtml(c.nombre) + '"' + (cur === c.nombre ? ' selected' : '') + '>' + _escHtml(c.nombre) + '</option>';
        });
        sel.innerHTML = html;
    }

    function _onClienteSelectChange() {
        _cargarTabuladorCliente();
    }

    function _getClienteNombre() {
        const sel = document.getElementById('paso1_cliente');
        return sel ? (sel.value || '').trim() : '';
    }

    function _syncActividadesDesdeServiciosLevantamiento(force) {
        if (!serviciosLevantamiento.length) {
            if (force) _showToast('No hay servicios en el paso 1', 'info');
            return;
        }
        const existentes = new Set(actividades.map((a) => (a.area + '|' + a.servicio).toLowerCase()));
        let changed = false;
        serviciosLevantamiento.forEach((sl) => {
            const key = (sl.area + '|' + sl.servicio).toLowerCase();
            if (existentes.has(key) && !force) return;
            if (!existentes.has(key)) {
                actividades.push({
                    id: _uid('act-'),
                    area: sl.area,
                    servicio: sl.servicio,
                    tipo: 'O',
                    horas: 0,
                    actividad_modulo_id: null,
                    subactividades: []
                });
                existentes.add(key);
                changed = true;
            }
        });
        if (changed) {
            _renderActividades();
            _poblarSelectActividadServicio();
            _showToast('Servicios importados al plan de ingeniería', 'success');
            _scheduleServiciosAutosave();
        } else if (force) {
            _showToast('Los servicios ya están en el plan', 'info');
        }
    }

    function _poblarSelectActividadServicio() {
        const sel = document.getElementById('agregarActividadServicioSelect');
        if (!sel) return;
        const usados = new Set(actividades.map((a) => (a.area + '|' + a.servicio).toLowerCase()));
        let html = '<option value="">Agregar servicio al plan…</option>';
        const fuente = serviciosLevantamiento.length ? serviciosLevantamiento : CATALOGO_SERVICIOS_VENTAS;
        fuente.forEach((sl) => {
            const area = sl.area || '';
            const servicio = sl.servicio || '';
            const key = area + ' | ' + servicio;
            if (usados.has((area + '|' + servicio).toLowerCase())) return;
            html += '<option value="' + _escHtml(key) + '">' + _escHtml(area + ' — ' + servicio) + '</option>';
        });
        sel.innerHTML = html;
    }

    function _formatMinutos(min) {
        const m = Number(min) || 0;
        if (m < 60) return m + ' min';
        const h = Math.floor(m / 60);
        const r = m % 60;
        return h + 'h' + (r ? ' ' + r + 'm' : '');
    }

    function _subTiempoTranscurrido(sub) {
        if (!sub.inicio_at) return '';
        const ini = new Date(sub.inicio_at);
        const fin = sub.fin_at ? new Date(sub.fin_at) : new Date();
        return _formatMinutos(Math.round((fin - ini) / 60000));
    }

    function _servicioLevantamientoKey(area, servicio) {
        return String(area || '').trim() + ' | ' + String(servicio || '').trim();
    }

    function _parseServiciosDesdeProyecto(proyecto) {
        if (!proyecto) return [];
        const norm = (item, i) => {
            if (typeof item === 'string') {
                const parts = item.split(' | ');
                const area = parts[0] || '';
                const servicio = parts.slice(1).join(' | ') || item;
                const key = item;
                return { id: 'sl' + i, area, servicio, key };
            }
            const area = item.area || '';
            const servicio = item.servicio || '';
            return {
                id: item.id || ('sl' + i),
                area,
                servicio,
                key: item.key || _servicioLevantamientoKey(area, servicio)
            };
        };
        if (Array.isArray(proyecto.servicios_levantamiento) && proyecto.servicios_levantamiento.length) {
            return proyecto.servicios_levantamiento.map(norm);
        }
        const auto = proyecto.servicios_automatizacion;
        if (Array.isArray(auto) && auto.length) {
            return auto.map(norm);
        }
        const ng = String(proyecto.notas_generales || '');
        const m = ng.match(/\n\nServicios:\s*([\s\S]*?)(?:\n\n|$)/i) || ng.match(/^Servicios:\s*([\s\S]*?)(?:\n\n|$)/i);
        if (!m) return [];
        const blob = m[1].trim();
        const keys = CATALOGO_SERVICIOS_VENTAS.map((s) => _servicioLevantamientoKey(s.area, s.servicio))
            .sort((a, b) => b.length - a.length);
        const found = [];
        let rest = blob;
        let guard = 0;
        while (rest && guard++ < 50) {
            let matched = null;
            for (const k of keys) {
                if (rest === k || rest.startsWith(k + ' | ') || rest.startsWith(k)) {
                    matched = k;
                    rest = rest.slice(k.length).replace(/^\s*\|\s*/, '').trim();
                    break;
                }
            }
            if (!matched) break;
            const cat = CATALOGO_SERVICIOS_VENTAS.find((s) => _servicioLevantamientoKey(s.area, s.servicio) === matched);
            if (cat) found.push({ id: 'sl' + found.length, area: cat.area, servicio: cat.servicio, key: matched });
        }
        return found;
    }

    function _requerimientoDesdeProyecto(proyecto) {
        if (!proyecto) return '';
        if (proyecto.requerimiento_cliente) return String(proyecto.requerimiento_cliente);
        const ng = String(proyecto.notas_generales || '');
        if (!ng) return '';
        return ng.split(/\n\nServicios:/i)[0].split(/\n\nPrioridad\s*\(/i)[0].trim();
    }

    function _poblarSelectServiciosLevantamiento() {
        const sel = document.getElementById('servicioLevantamientoSelect');
        if (!sel) return;
        const usados = new Set(serviciosLevantamiento.map((s) => s.key));
        let html = '<option value="">Agregar servicio del catálogo…</option>';
        CATALOGO_SERVICIOS_VENTAS.forEach((s) => {
            const key = _servicioLevantamientoKey(s.area, s.servicio);
            if (usados.has(key)) return;
            html += '<option value="' + key.replace(/"/g, '&quot;') + '">' + s.area + ' — ' + s.servicio + '</option>';
        });
        sel.innerHTML = html;
    }

    function _renderServiciosLevantamiento() {
        const tbody = document.getElementById('serviciosLevantamientoBody');
        if (!tbody) return;
        const esc = (t) => {
            const d = document.createElement('div');
            d.textContent = t == null ? '' : String(t);
            return d.innerHTML;
        };
        if (!serviciosLevantamiento.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="auto-servicios-lev-empty">Sin servicios registrados. Si el folio viene de Ventas, guarda de nuevo desde allí o agrega aquí.</td></tr>';
            _poblarSelectServiciosLevantamiento();
            return;
        }
        tbody.innerHTML = serviciosLevantamiento.map((s, idx) => (
            '<tr><td>' + esc(s.area) + '</td><td>' + esc(s.servicio) + '</td>'
            + '<td><button type="button" class="btn-icon auto-serv-lev-del" data-idx="' + idx + '" title="Quitar servicio"><i class="fas fa-trash"></i></button></td></tr>'
        )).join('');
        tbody.querySelectorAll('.auto-serv-lev-del').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                if (!Number.isNaN(idx)) _eliminarServicioLevantamiento(idx);
            });
        });
        _poblarSelectServiciosLevantamiento();
    }

    function _agregarServicioLevantamiento() {
        const sel = document.getElementById('servicioLevantamientoSelect');
        const key = sel && sel.value ? sel.value.trim() : '';
        if (!key) {
            alert('Selecciona un servicio del catálogo.');
            return;
        }
        if (serviciosLevantamiento.some((s) => s.key === key)) {
            alert('Ese servicio ya está en la lista.');
            return;
        }
        const parts = key.split(' | ');
        const area = parts[0] || '';
        const servicio = parts.slice(1).join(' | ') || key;
        serviciosLevantamiento.push({
            id: 'sl' + Date.now(),
            area,
            servicio,
            key
        });
        if (sel) sel.value = '';
        _renderServiciosLevantamiento();
        _scheduleServiciosAutosave();
    }

    function _eliminarServicioLevantamiento(idx) {
        if (idx < 0 || idx >= serviciosLevantamiento.length) return;
        serviciosLevantamiento.splice(idx, 1);
        _renderServiciosLevantamiento();
        _scheduleServiciosAutosave();
    }

    function _notasGeneralesDesdePaso1() {
        const req = (document.getElementById('paso1_requerimiento') || {}).value || '';
        const servLine = serviciosLevantamiento.length
            ? ('Servicios: ' + serviciosLevantamiento.map((s) => s.key).join(' | '))
            : '';
        return [req.trim(), servLine].filter(Boolean).join('\n\n');
    }

    async function _cargarTabuladorCliente() {
        const nombre = _getClienteNombre();
        if (!nombre || !window.supabase) return;
        try {
            const { data } = await window.supabase
                .from('clientes_tabulador')
                .select('nombre_cliente, km, horas_viaje')
                .ilike('nombre_cliente', '%' + nombre + '%')
                .limit(8);
            const rows = data || [];
            const low = nombre.toLowerCase();
            const match = rows.find((r) => String(r.nombre_cliente || '').toLowerCase() === low)
                || rows.find((r) => String(r.nombre_cliente || '').toLowerCase().includes(low) || low.includes(String(r.nombre_cliente || '').toLowerCase()))
                || rows[0];
            const kmEl = document.getElementById('autoCostoKm');
            const hrsEl = document.getElementById('autoCostoHrsCam');
            if (match) {
                if (kmEl) kmEl.value = Number(match.km) || 0;
                if (hrsEl) hrsEl.value = Number(match.horas_viaje) || 0;
            }
        } catch (e) {
            console.warn('[Automatización] tabulador cliente:', e);
        }
    }

    function _syncEpicasDesdeActividades() {
        if (epicas.length > 0 || !actividades.length) return;
        const porArea = {};
        actividades.forEach((a) => {
            const area = a.area || 'General';
            if (!porArea[area]) porArea[area] = [];
            porArea[area].push(a);
        });
        Object.entries(porArea).forEach(([area, acts], i) => {
            epicas.push({
                id: 'ep' + Date.now() + i,
                titulo: area,
                key: 'EP-' + (i + 1),
                tareas: acts.map((a) => ({
                    titulo: a.servicio || a.nombre || 'Actividad',
                    asignado: '',
                    subtareas: [],
                    actividad_ref: a.servicio || a.nombre,
                    horas_plan: a.horas || 0
                }))
            });
        });
        _renderEpicas();
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Automatización] Conectado');
        try { perfilUsuario = await authService.getCurrentProfile(); } catch(e) {}
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
            await _loadInitialData();
            await _cargarClientesSelect();
            try {
                var openId = new URLSearchParams(window.location.search).get('open');
                if (openId) { setTimeout(function () { _abrirProyecto(openId); }, 400); }
            } catch (e) {}
            _startClock();
            _setupRealtime();
        } catch (e) {
            console.error('[Automatización] init error:', e);
        }
        _renderAutoPriorityChips();
        _initServiciosAutosave();
        _tryResumeServiciosDraft();
        ssepiOn(SSEPI_EVENTS.RESUME_DRAFT, (detail) => {
            if (!detail || detail.module !== 'proyectos_automatizacion') return;
            _resumeServiciosDraftKey(detail.recordKey);
        });
        _initExportButton();
        document.body.classList.add('auto-modulo-sin-costos');
        console.log('✅ Módulo automatización iniciado');
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'folio', label: 'Folio' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'nombre', label: 'Proyecto' },
                    { key: 'vendedor', label: 'Ingeniero' },
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'etapa_actual', label: 'Etapa' },
                    { key: 'avance', label: 'Avance %' },
                    { key: 'costo_total', label: 'Costo Total' },
                    { key: 'rentabilidad_estado', label: 'Rentabilidad' }
                ];
                downloadCSV('proyectos_automatizacion_' + new Date().toISOString().slice(0,10) + '.csv', projects, headers);
            });
        } catch (e) { console.warn('[Automatización] Export CSV init:', e); }
    }

    function _serviciosRecordKey() {
        if (projectId) return String(projectId);
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) return 'new:' + folio;
        if (!serviciosDraftSessionKey) serviciosDraftSessionKey = 'tmp:' + Date.now();
        return serviciosDraftSessionKey;
    }

    function _serviciosDraftKeysToPurge() {
        const keys = [];
        if (projectId) keys.push(String(projectId));
        const folio = (document.getElementById('inpFolio') && document.getElementById('inpFolio').value || '').trim();
        if (folio) keys.push('new:' + folio);
        if (serviciosDraftSessionKey) keys.push(serviciosDraftSessionKey);
        return keys;
    }

    function _setElVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val == null ? '' : val;
    }

    function _getNotasInternasProyecto() {
        return (currentProject && currentProject.notas_internas) ? String(currentProject.notas_internas) : '';
    }

    function _setNotasInternasProyecto(val) {
        if (!currentProject) currentProject = {};
        currentProject.notas_internas = val == null ? '' : String(val);
    }

    function _afterServiciosPersistOk() {
        purgeDraftRecordKeys('proyectos_automatizacion', _serviciosDraftKeysToPurge());
        serviciosDraftSessionKey = null;
    }

    /** Lee inputs del DOM hacia arrays en memoria (evita perder texto sin blur/onchange). */
    function _syncDraftFromDom() {
        const ingHost = document.getElementById('actividadesIngenieriaList');
        if (ingHost) {
            ingHost.querySelectorAll('.auto-sub-row-plan[data-sub-path]').forEach((row) => {
                const actIdx = parseInt(row.getAttribute('data-act-idx'), 10);
                const path = row.getAttribute('data-sub-path');
                const resolved = _resolverSubPath(actIdx, path);
                if (!resolved) return;
                const titulo = row.querySelector('.auto-sub-title');
                if (titulo) resolved.node.titulo = titulo.value;
                const hrs = row.querySelector('.auto-sub-hrs');
                if (hrs) resolved.node.horas_plan = parseFloat(hrs.value) || 0;
            });
            ingHost.querySelectorAll('.auto-ing-card-plan').forEach((card, actIdx) => {
                if (!actividades[actIdx]) return;
                const tipoSel = card.querySelector('.auto-ing-select');
                if (tipoSel) actividades[actIdx].tipo = tipoSel.value;
                const hrsAct = card.querySelector('.auto-ing-num');
                if (hrsAct) actividades[actIdx].horas = parseFloat(hrsAct.value) || 0;
            });
        }
        const matBody = document.getElementById('materialesBody');
        if (matBody) {
            matBody.querySelectorAll('tr').forEach((row, idx) => {
                if (!materiales[idx]) return;
                const inputs = row.querySelectorAll('input');
                if (inputs[0]) materiales[idx].nombre = inputs[0].value;
                if (inputs[1]) materiales[idx].descripcion = inputs[1].value;
                if (inputs[2]) materiales[idx].cantidad = parseInt(inputs[2].value, 10) || 1;
                if (inputs[3]) materiales[idx].sku = inputs[3].value;
                if (inputs[4]) materiales[idx].proveedor = inputs[4].value;
            });
        }
        document.querySelectorAll('.apartado-card[data-apartado-id]').forEach((block) => {
            const id = block.getAttribute('data-apartado-id');
            const ap = apartados.find((a) => a.id === id);
            if (!ap) return;
            const titulo = block.querySelector('.apartado-titulo-input');
            const nota = block.querySelector('.apartado-nota');
            if (titulo) ap.titulo = titulo.value;
            if (nota) ap.nota = nota.value;
        });
    }

    function _collectServiciosDraftPayload() {
        _syncDraftFromDom();
        return {
            v: 2,
            currentStep: currentStep,
            projectId: projectId,
            isNewProject: isNewProject,
            folio: document.getElementById('inpFolio') ? document.getElementById('inpFolio').value : '',
            paso1_nombre: document.getElementById('paso1_nombre') ? document.getElementById('paso1_nombre').value : '',
            paso1_cliente: document.getElementById('paso1_cliente') ? document.getElementById('paso1_cliente').value : '',
            paso1_fecha: document.getElementById('paso1_fecha') ? document.getElementById('paso1_fecha').value : '',
            paso1_vendedor: document.getElementById('paso1_vendedor') ? document.getElementById('paso1_vendedor').value : '',
            paso1_requerimiento: document.getElementById('paso1_requerimiento') ? document.getElementById('paso1_requerimiento').value : '',
            serviciosLevantamiento: serviciosLevantamiento.slice(),
            paso1_notasInternas: _getNotasInternasProyecto(),
            actividades: actividades.slice(),
            materiales: materiales.slice(),
            epicas: epicas.slice(),
            apartados: apartados.slice(),
            ganttMeta: ganttMeta,
            archivosDesarrollo: archivosDesarrollo.slice(),
            entregaResumen: document.getElementById('entregaResumenAutomatizacion')?.value || '',
            materialBusquedaQuery: materialBusquedaQuery,
            fechasEtapas: { ...fechasEtapas },
        };
    }

    function _scheduleServiciosAutosave() {
        if (serviciosAutosaveCtrl) serviciosAutosaveCtrl.schedule();
        _setDraftIndicator('Guardando borrador…');
    }

    function _flushServiciosAutosave() {
        if (serviciosAutosaveCtrl) serviciosAutosaveCtrl.flush();
        _setDraftIndicator('Borrador guardado localmente');
    }

    function _setDraftIndicator(text) {
        const el = document.getElementById('serviciosDraftIndicator');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('visible', !!text);
        if (serviciosDraftIndTimer) clearTimeout(serviciosDraftIndTimer);
        if (text && text.indexOf('Guardando') >= 0) {
            serviciosDraftIndTimer = setTimeout(() => {
                if (el.textContent.indexOf('Guardando') >= 0) {
                    el.textContent = 'Borrador local activo';
                }
            }, 2500);
        }
    }

    function _mergeServiciosLocalDraft(recordKey) {
        if (!recordKey) return;
        const w = loadLocalDraft('proyectos_automatizacion', String(recordKey));
        if (!w || !w.payload) return;
        _applyServiciosDraft(w);
        _setDraftIndicator('Borrador local restaurado · ' + (w.savedAt ? new Date(w.savedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''));
    }

    function _applyServiciosDraft(w) {
        if (!w || !w.payload) return;
        const p = w.payload;
        const setv = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val == null ? '' : val;
        };
        setv('inpFolio', p.folio);
        setv('paso1_nombre', p.paso1_nombre);
        _renderClientesSelect(p.paso1_cliente || '');
        setv('paso1_fecha', p.paso1_fecha);
        setv('paso1_vendedor', p.paso1_vendedor);
        setv('paso1_requerimiento', p.paso1_requerimiento);
        if (p.paso1_notasInternas !== undefined) _setNotasInternasProyecto(p.paso1_notasInternas);
        if (Array.isArray(p.serviciosLevantamiento)) serviciosLevantamiento = p.serviciosLevantamiento.slice();
        if (Array.isArray(p.actividades)) actividades = _normalizarActividades(p.actividades);
        if (Array.isArray(p.materiales)) materiales = p.materiales.slice();
        if (Array.isArray(p.epicas)) epicas = p.epicas.slice();
        if (Array.isArray(p.apartados)) apartados = p.apartados.slice();
        if (p.ganttMeta) ganttMeta = p.ganttMeta;
        if (Array.isArray(p.archivosDesarrollo)) archivosDesarrollo = p.archivosDesarrollo.slice();
        if (p.fechasEtapas && typeof p.fechasEtapas === 'object') fechasEtapas = { ...p.fechasEtapas };
        setv('entregaResumenAutomatizacion', p.entregaResumen);
        materialBusquedaQuery = p.materialBusquedaQuery || '';
        const buscarMat = document.getElementById('buscarMaterialInventario');
        if (buscarMat) buscarMat.value = materialBusquedaQuery;
        projectId = p.projectId || null;
        isNewProject = p.isNewProject !== false && !projectId;
        currentStep = p.currentStep || 1;
        _renderServiciosLevantamiento();
        _poblarSelectActividadServicio();
        _renderActividades();
        _renderMateriales();
        _renderDesarrolloArchivos();
        _renderEpicas();
        _renderApartados();
        _populateInventarioSelect();
        if (ganttMeta && ganttMeta.filas && ganttMeta.filas.length) _restaurarGanttDesdeMeta();
        _irPaso(currentStep);
        if (currentStep === 4) _renderDesarrolloEjecucion();
        if (currentStep === 5) _rellenarEntregaResponsables();
        _renderWsNotesFromOrden(currentProject);
    }

    function _renderAutoPriorityChips() {
        const host = document.getElementById('autoPrioritySuppliers');
        if (!host) return;
        const list = getPrioritySuppliersForModule('automatizacion');
        const esc = (s) => {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        };
        let chips = '';
        list.forEach((s) => {
            chips += '<button type="button" class="prio-chip" data-url="' + esc(s.url) + '" title="' + esc(s.ubicacion) + '">' + esc(s.etiqueta) + ' · ' + esc(s.nombre) + '</button>';
        });
        host.innerHTML = '<div class="priority-suppliers-wrap"><div class="priority-suppliers-label">Tiendas de componentes (abrir en nueva pestaña)</div><div class="priority-suppliers-chips">' + chips + '</div></div>';
        host.querySelectorAll('.prio-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const u = btn.getAttribute('data-url');
                if (u) window.open(u, '_blank', 'noopener,noreferrer');
            });
        });
    }

    function _initServiciosAutosave() {
        serviciosAutosaveCtrl = createAutosaveController({
            module: 'proyectos_automatizacion',
            getRecordKey: _serviciosRecordKey,
            collectPayload: _collectServiciosDraftPayload,
            getLabel: () => {
                const n = document.getElementById('paso1_nombre') && document.getElementById('paso1_nombre').value;
                return 'Auto ' + (n || 'borrador');
            },
            debounceMs: 900,
        });
        const modal = document.getElementById('wsModal');
        if (modal) {
            modal.addEventListener('input', () => { _scheduleServiciosAutosave(); }, true);
            modal.addEventListener('change', () => { _scheduleServiciosAutosave(); }, true);
        }
        window.addEventListener('beforeunload', () => { _flushServiciosAutosave(); });
    }

    function _openServiciosDraft(w, recordKey) {
        if (!w || !w.payload) return;
        serviciosDraftSessionKey = recordKey && recordKey.indexOf('tmp:') === 0 ? recordKey : null;
        currentProject = null;
        projectId = w.payload.projectId || null;
        isNewProject = !projectId;
        _resetForm();
        _applyServiciosDraft(w);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        _setDraftIndicator('Borrador restaurado');
        _showToast('Borrador restaurado', 'success');
    }

    function _resumeServiciosDraftKey(recordKey) {
        const w = loadLocalDraft('proyectos_automatizacion', recordKey);
        if (!w || !w.payload) {
            _showToast('No se encontró el borrador', 'warning');
            return;
        }
        _openServiciosDraft(w, recordKey);
    }

    function _tryResumeServiciosDraft() {
        const resume = new URLSearchParams(window.location.search).get('resume');
        if (!resume) return;
        const w = loadLocalDraft('proyectos_automatizacion', resume);
        if (!w || !w.payload) return;
        if (!confirm('¿Recuperar borrador guardado en este equipo?')) {
            history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        _openServiciosDraft(w, resume);
        history.replaceState({}, document.title, window.location.pathname);
    }

    function _setVistaInicial() {
        const kanban = document.getElementById('kanbanContainer');
        const lista = document.getElementById('listaContainer');
        const grafica = document.getElementById('graficaContainer');
        if (kanban) kanban.style.display = vistaActual === 'kanban' ? 'flex' : 'none';
        if (lista) lista.style.display = vistaActual === 'lista' ? 'block' : 'none';
        if (grafica) grafica.style.display = vistaActual === 'grafica' ? 'block' : 'none';
        document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
        if (vistaActual === 'kanban') { const b = document.getElementById('vistaKanban'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'lista') { const b = document.getElementById('vistaLista'); if (b) b.classList.add('active'); }
        else if (vistaActual === 'grafica') { const b = document.getElementById('vistaGrafica'); if (b) b.classList.add('active'); }
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
        const paso1Fecha = document.getElementById('paso1_fecha');
        if (paso1Fecha) paso1Fecha.value = new Date().toISOString().split('T')[0];
        _setFiltroMesActual();
    }

    function _setFiltroMesActual() {
        // Por defecto sin filtro de fecha (mostrar todos los proyectos)
        filtroFechaInicio = null;
        filtroFechaFin = null;
        const filtroInicio = document.getElementById('filtroFechaInicio');
        const filtroFin = document.getElementById('filtroFechaFin');
        if (filtroInicio) filtroInicio.value = '';
        if (filtroFin) filtroFin.value = '';
    }

    function _getEtapaLabel(etapaNum) {
        const labels = { 1: 'Levantamiento', 2: 'Ingeniería', 3: 'Materiales', 4: 'Desarrollo', 5: 'Entrega' };
        return labels[etapaNum] || '—';
    }

    function _getAvanceYProceso(proyecto) {
        const etapa = _estadoToPaso(proyecto.estado) || proyecto.etapa_actual || 1;
        const avance = proyecto.avance != null ? proyecto.avance : Math.round((etapa / 5) * 100);
        return { avance, etapa, proceso: _getEtapaLabel(etapa) };
    }

    function _getLineaTiempo(proyecto) {
        const inicio = proyecto.fecha_creacion || proyecto.created_at || proyecto.fecha;
        const fin = proyecto.updated_at || proyecto.fecha;
        if (!inicio) return '—';
        const dInicio = new Date(inicio);
        const dFin = fin ? new Date(fin) : null;
        const fmt = d => d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
        return dFin ? `${fmt(dInicio)} → ${fmt(dFin)}` : `Desde ${fmt(dInicio)}`;
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

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        try {
            await Promise.all([
                _loadProjects(),
                _loadInventory(),
                _loadCalcCostsFromSupabase()
            ]);
            _populateIngenierosFilter();
            _recalcCostosServicios();
        } catch (e) {
            console.warn('[Automatización] Error cargando datos iniciales:', e);
            projects = [];
            inventory = [];
            _applyFilters();
        }
    }

    async function _loadCalcCostsFromSupabase() {
        const sb = _supabase();
        if (!sb) return;
        try {
            const partial = {};
            const ingest = (rows) => {
                (rows || []).forEach(({ concepto, costo }) => {
                    const k = String(concepto || '').toLowerCase().replace(/\s/g, '');
                    const n = Number(costo);
                    if (!Number.isFinite(n)) return;
                    if (k === 'gasolina' || k.includes('paramgasolina')) partial.gasolina = n;
                    if (k === 'rendimiento') partial.rendimiento = n;
                    if (k === 'costotecnico') partial.costoTecnico = n;
                    if (k.includes('auto:camioneta') || k === 'camionetahora') partial.camionetaHora = n;
                });
            };
            const { data: lab } = await sb.from('calculadoras').select('id').ilike('nombre', '%Laboratorio%').limit(1).maybeSingle();
            if (lab?.id) {
                const { data } = await sb.from('calculadora_costos').select('concepto,costo').eq('calculadora_id', lab.id);
                ingest(data);
            }
            const { data: aut } = await sb.from('calculadoras').select('id').ilike('nombre', '%Automatiz%').limit(1).maybeSingle();
            if (aut?.id) {
                const { data } = await sb.from('calculadora_costos').select('concepto,costo').eq('calculadora_id', aut.id);
                ingest(data);
            }
            CostosEngine.applyConfig(partial);
        } catch (e) {
            console.warn('[Automatización] calculadora_costos:', e);
        }
    }

    function _sumMaterialesCostoInventario() {
        let sum = 0;
        materiales.forEach((m) => {
            const q = parseInt(m.cantidad, 10) || 0;
            if (m.costo_unitario != null && Number(m.costo_unitario) >= 0) {
                sum += Number(m.costo_unitario) * q;
                return;
            }
            const sku = String(m.sku || '').trim();
            if (!sku) return;
            const p = inventory.find((x) => x.sku === sku);
            if (p && p.costo != null) sum += Number(p.costo) * q;
        });
        return sum;
    }

    function _calcularCostoActualServicios() {
        const km = Number(document.getElementById('autoCostoKm')?.value) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || 0;
        const mat = _sumMaterialesCostoInventario();
        const gas = CostosEngine.calcularCostoGasolina(km);
        const cam = CostosEngine.calcularCostoCamioneta(hrsCam);
        const act = (actividades || []).reduce((s, a) => s + (Number(a.horas) || 0) * (Number(a.tarifa) || 0), 0);
        return mat + gas + cam + act;
    }

    function _recalcCostosServicios() {
        /* Resumen de visita oculto en UI — km/horas solo para PDF/compras en backend */
    }

    function _renderPanelRentabilidad() {
        const panel = document.getElementById('panelRentabilidad');
        if (panel) panel.style.display = 'none';
    }

    async function _loadProjects() {
        try {
            projects = await proyectosService.select({}, { orderBy: 'fecha', ascending: false });
        } catch (e) {
            console.warn('[Automatización] Error cargando proyectos:', e);
            projects = [];
        }
        // Enriquecer proyectos legacy/demo sin rentabilidad calculada
        projects.forEach(p => {
            if (!p.rentabilidad_estado && p.costo_total) {
                const pres = Number(p.costo_presupuestado) || Number(p.costo_total) || 0;
                const real = CostosEngine.calcularCostoRealAutomatizacion(p);
                p.costo_presupuestado = pres;
                p.costo_real = real;
                p.adeudo_generado = Math.max(0, real - pres);
                p.rentabilidad_estado = CostosEngine.determinarRentabilidad(pres, real);
            }
        });
        _applyFilters();
    }

    async function _loadInventory() {
        if (materialCatalogLoaded && inventory.length) {
            _populateInventarioSelect();
            return;
        }
        try {
            const bomData = await bomService.select({}, { orderBy: 'numero_item', ascending: true, page: 0, pageSize: 2000 });
            const bomItems = (bomData || []).map((b) => {
                const sku = String(b.part_number || b.numero_parte || b.codigo || `BOM-${b.numero_item || b.id || ''}`).trim();
                const nombre = b.descripcion || b.description || b.part_number || sku;
                return {
                    sku,
                    codigo: sku,
                    nombre,
                    descripcion: b.descripcion || b.description || '',
                    categoria: b.categoria_original || b.categoria || 'BOM',
                    proveedor: b.proveedor || b.distribuidor || '',
                    costo: Number(b.mejor_precio) || Number(b.precio) || 0,
                    source: 'BOM',
                    bom_id: b.id || b.numero_item,
                };
            });

            const invData = await inventarioService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 });
            const invItems = (invData || []).filter(_esItemMaterialInventario).map((i) => ({
                sku: String(i.sku || i.codigo || '').trim(),
                codigo: String(i.codigo || i.sku || '').trim(),
                nombre: i.nombre || i.descripcion || i.sku || '',
                descripcion: i.descripcion || '',
                categoria: i.categoria || i.tipo || '',
                proveedor: i.proveedor || '',
                costo: Number(i.costo ?? i.precio ?? i.precio_venta) || 0,
                source: 'STOCK',
                stock: i.stock,
            }));

            const seen = new Set();
            inventory = [];
            for (const it of [...bomItems, ...invItems]) {
                const key = (it.sku || it.codigo || '').toLowerCase().trim();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                inventory.push(it);
            }
            materialCatalogLoaded = true;
            console.log('[Automatización] Catálogo materiales:', inventory.length, '(BOM:', bomItems.length, 'Stock:', invItems.length + ')');
        } catch (e) {
            console.warn('[Automatización] Error cargando catálogo materiales:', e);
            inventory = [];
        }
        _populateInventarioSelect();
    }

    function _categoriaBomLabel(p) {
        const c = String(p.categoria_original || p.categoria || 'OTROS').trim();
        if (!c) return 'OTROS';
        const u = c.toUpperCase();
        if (u === 'VARIADOR') return 'VARIADOR';
        if (u === 'HMI') return "HMI'S";
        if (u === 'PLC') return "PLC'S";
        return c;
    }

    function _populateInventarioSelect() {
        const select = document.getElementById('inventarioSelect');
        if (!select) return;
        const q = materialBusquedaQuery.toLowerCase().trim();
        const items = inventory.filter((p) => {
            if (!q) return true;
            const blob = [p.sku, p.codigo, p.nombre, p.descripcion, p.categoria, p.proveedor, p.source].filter(Boolean).join(' ').toLowerCase();
            return blob.includes(q);
        });
        select.innerHTML = '<option value="">Seleccionar componente del inventario…</option>';
        const porCat = new Map();
        items.forEach((p) => {
            const cat = _categoriaBomLabel(p);
            if (!porCat.has(cat)) porCat.set(cat, []);
            porCat.get(cat).push(p);
        });
        [...porCat.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach((cat) => {
            const og = document.createElement('optgroup');
            og.label = cat;
            porCat.get(cat).forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.sku;
                const tag = p.source === 'BOM' ? 'BOM' : 'Stock';
                opt.textContent = `[${tag}] ${p.sku} — ${p.nombre || p.descripcion || ''}`.trim();
                og.appendChild(opt);
            });
            select.appendChild(og);
        });
        const countEl = document.getElementById('materialBusquedaCount');
        if (countEl) {
            const total = inventory.length;
            const bomN = inventory.filter((p) => p.source === 'BOM').length;
            const stockN = total - bomN;
            countEl.textContent = q
                ? `${items.length} de ${total} (${bomN} BOM + ${stockN} stock)`
                : `${total} componentes (${bomN} BOM + ${stockN} stock)`;
        }
    }

    function _onBuscarMaterialInput(val) {
        materialBusquedaQuery = val || '';
        _populateInventarioSelect();
        _scheduleServiciosAutosave();
    }

    /** Excluye SERV-* y mano de obra; solo BOM / componentes físicos */
    function _esItemMaterialInventario(p) {
        if (!p) return false;
        const sku = String(p.sku || p.codigo || '').toUpperCase().trim();
        if (sku.startsWith('SERV-') || sku.startsWith('MO-') || sku.startsWith('LABOR-')) return false;
        const nombre = String(p.nombre || p.descripcion || '').toLowerCase();
        const cat = String(p.categoria || p.tipo || p.familia || '').toLowerCase();
        if (cat.includes('servicio') || cat.includes('mano de obra') || cat.includes('mo ')) return false;
        if (/mano de obra|servicio|gastos fijos|camioneta|traslado|ingenier[ií]a automatiz|programaci[oó]n plc|capacitaci[oó]n/.test(nombre)) return false;
        return true;
    }

    function _populateIngenierosFilter() {
        const select = document.getElementById('filtroIngeniero');
        if (!select) return;
        const ingenieros = new Set();
        projects.forEach(p => { if (p.vendedor) ingenieros.add(p.vendedor); });
        ingenieros.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            select.appendChild(opt);
        });
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        const subProyectos = supabase
            .channel('automatizacion_proyectos_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_automatizacion' }, payload => {
                _loadProjects();
                _addToFeed('📋', 'Datos de proyectos actualizados');
            })
            .subscribe();
        subscriptions.push(subProyectos);

        // Compras vinculadas a proyectos de automatización
        const subCompras = supabase
            .channel('automatizacion_compras')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, payload => {
                const nueva = payload.new;
                if (nueva?.vinculacion?.tipo === 'proyecto') {
                    _addToFeed('📦', `Compra actualizada: ${nueva.folio || ''}`);
                }
            })
            .subscribe();
        subscriptions.push(subCompras);

        // Notificaciones para automatización
        const subNotif = supabase
            .channel('automatizacion_notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.automatizacion' }, payload => {
                const notif = payload.new || {};
                _addToFeed('🔔', notif.mensaje || 'Nueva notificación');
                // Si es confirmación de cliente para el proyecto actual, actualizar estado local
                if (notif.tipo === 'cliente_confirmo' && currentProject && currentProject.id === notif.orden_id) {
                    currentProject.estado = 'Confirmado';
                    _showToast('✅ Cliente confirmó la cotización. Puede avanzar a Desarrollo.', 'success');
                }
                // Si es garantía activada, recargar para mostrar nueva orden
                if (notif.tipo === 'garantia_activada') {
                    _showToast('🔔 ' + (notif.mensaje || 'Garantía activada'), 'info');
                }
                _loadProjects();
            })
            .subscribe();
        subscriptions.push(subNotif);

        // Listener de orden_historial para sincronizar cambios de estado desde otros módulos
        const subHistorial = supabase
            .channel('automatizacion_historial')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orden_historial' }, payload => {
                const ev = payload.new;
                if (ev && ev.proyecto_id) {
                    _loadProjects();
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);
    }

    /** Normaliza variantes de BD a los estados del flujo comercial. */
    function _normEstadoProyecto(estado) {
        const s = String(estado == null ? '' : estado).trim().toLowerCase();
        if (!s) return 'pendiente';
        if (['registrado', 'pendiente', 'borrador', 'nuevo', 'planificacion', 'planificación'].includes(s)) return 'pendiente';
        if (['diagnostico', 'diagnóstico', 'levantamiento'].includes(s)) return 'pendiente';
        if (['esperando cotizacion', 'esperando cotización', 'espera cotizacion', 'cotizacion pendiente'].includes(s)) return 'esperando_cotizacion';
        if (['esperando confirmacion cliente', 'esperando confirmación cliente', 'confirmacion pendiente'].includes(s)) return 'esperando_confirmacion';
        if (['confirmado', 'progreso', 'en progreso', 'activo', 'ejecucion', 'ejecución', 'en ejecucion', 'en ejecución', 'en ejecucion', 'desarrollo'].includes(s)) return 'progreso';
        if (['reparado', 'reparado / listo', 'listo', 'puesta en marcha'].includes(s)) return 'progreso';
        if (['completado', 'cerrado', 'entregado', 'facturado', 'finalizado'].includes(s)) return 'completado';
        if (['cancelado', 'cancelada'].includes(s)) return 'cancelado';
        if (['garantia', 'garantía'].includes(s)) return 'garantia';
        return s;
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = projects;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(p => {
                const raw = p.fecha || p.created_at || p.updated_at;
                if (!raw) return true;
                const f = new Date(raw);
                if (Number.isNaN(f.getTime())) return true;
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroIngeniero !== 'todos') {
            filtered = filtered.filter(p => p.vendedor === filtroIngeniero);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(p => _normEstadoProyecto(p.estado) === filtroEstado);
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(p => 
                (p.nombre && p.nombre.toLowerCase().includes(term)) ||
                (p.cliente && p.cliente.toLowerCase().includes(term)) ||
                (p.folio && p.folio.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _renderKanban(proyectos) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const etapas = [
            { label: 'Registrado', match: s => s === 'Nuevo' || s === 'Registrado' || s === 'pendiente' },
            { label: 'Diagnóstico', match: s => s === 'Diagnóstico' || s === 'Garantía' },
            { label: 'Esperando Cotización', match: s => s === 'Esperando Cotización' || s === 'En Espera' },
            { label: 'Esperando Confirmación', match: s => s === 'Esperando Confirmación Cliente' },
            { label: 'En ejecución', match: s => s === 'Confirmado' || s === 'En ejecución' },
            { label: 'Completado', match: s => s === 'Completado' || s === 'completado' || s === 'Entregado' || s === 'Facturado' || s === 'Reparado / Listo' },
            { label: 'Cancelado', match: s => s === 'Cancelado' || s === 'Cancelada' },
        ];
        let html = '';
        etapas.forEach(etapa => {
            const filtrados = proyectos.filter(p => etapa.match(p.estado));
            html += `
                <div class="kanban-column">
                    <div class="kanban-header" style="border-bottom-color: ${etapa.color};">
                        <span>${etapa.label}</span>
                        <span class="badge" style="background: ${etapa.color};">${filtrados.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${filtrados.map(p => _crearCardKanban(p)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _abrirProyecto(card.dataset.id));
        });
    }

    function _crearCardKanban(proyecto) {
        const { avance, proceso } = _getAvanceYProceso(proyecto);
        const linea = _getLineaTiempo(proyecto);
        const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(proyecto);
        const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';

        const esAdminS = _verFinanciero();
        let badgeRentabilidad = '';
        if (proyecto.rentabilidad_estado === 'rojo') {
            badgeRentabilidad = esAdminS
                ? `<span class="badge-rentabilidad-rojo badge-rentabilidad-inline" title="Adeudo $${(proyecto.adeudo_generado||0).toFixed(2)}">🔴 $${(proyecto.adeudo_generado||0).toFixed(0)}</span>`
                : `<span class="badge-rentabilidad-rojo badge-rentabilidad-inline" title="Rentabilidad baja"></span>`;
        } else if (proyecto.rentabilidad_estado === 'verde') {
            badgeRentabilidad = `<span class="badge-rentabilidad-verde badge-rentabilidad-inline">🟢 OK</span>`;
        }

        let extrasHtml = '';
        const materiales = proyecto.materiales || [];
        const notas = proyecto.notas_internas || '';
        if (materiales.length > 0 || notas) {
            const chips = materiales.slice(0, 3).map(m => `<span class="extra-chip">${m.nombre || 'Material'}${m.cantidad > 1 ? ' x'+m.cantidad : ''}</span>`).join('');
            const mas = materiales.length > 3 ? `<span class="extra-chip">+${materiales.length - 3}</span>` : '';
            const preview = notas ? `<div class="nota-preview">${notas.slice(0, 90)}${notas.length > 90 ? '…' : ''}</div>` : '';
            extrasHtml = `<div class="card-extras">
                ${chips ? `<div class="extra-list">${chips}${mas}</div>` : ''}
                ${preview}
            </div>`;
        }

        return `
            <div class="kanban-card ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${proyecto.id}">
                <div class="card-header">
                    <div class="folio-line">
                        <span class="folio">${proyecto.folio || proyecto.id.slice(-6)}</span>
                        ${badgeRentabilidad}
                    </div>
                    <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                        ${badgeCuarentena}
                    </div>
                </div>
                <div class="card-body">
                    <div class="cliente">${proyecto.nombre || 'Sin nombre'}</div>
                    <div class="equipo">${proyecto.cliente || 'Cliente'}</div>
                    ${extrasHtml}
                    <div class="card-avance">
                        <div class="avance-bar"><div class="avance-fill" style="width:${avance}%"></div></div>
                        <span class="avance-pct">${avance}%</span> · ${proceso}
                    </div>
                    <div class="card-timeline"><small>${linea}</small></div>
                </div>
                <div class="card-footer">
                    <small>Fecha: ${proyecto.fecha ? new Date(proyecto.fecha).toLocaleDateString() : ''}</small>
                    <small>${proyecto.vendedor || ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(proyectos) {
        const container = document.getElementById('listaContainer');
        if (!container) return;
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Proyecto</th><th>Cliente</th><th>Vendedor</th><th>Avance</th><th>Etapa</th><th>Línea de tiempo</th><th>Estado</th><th>Balance</th></tr></thead><tbody>';
        proyectos.forEach(p => {
            const { avance, proceso } = _getAvanceYProceso(p);
            const linea = _getLineaTiempo(p);
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(p);
            html += `<tr onclick="serviciosModule._abrirProyecto('${p.id}')" class="${enCuarentena ? 'row-cuarentena' : ''}">
                <td>${p.folio || p.id.slice(-6)} ${enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : ''}</td>
                <td>${p.nombre || ''}</td>
                <td>${p.cliente || ''}</td>
                <td>${p.vendedor || ''}</td>
                <td><span class="avance-pct">${avance}%</span></td>
                <td>${proceso}</td>
                <td><small>${linea}</small></td>
                <td><span class="status-badge" style="background:${(function(){ const s=_normEstadoProyecto(p.estado); if(s==='pendiente') return '#ff9800'; if(s==='esperando_cotizacion'||s==='esperando_confirmacion') return '#9c27b0'; if(s==='progreso'||s==='garantia') return '#2196f3'; if(s==='cancelado') return '#f44336'; return '#4caf50'; })()}; color:white;">${p.estado}</span> · ${proceso}</td>
                <td>${p.rentabilidad_estado === 'rojo' ? (esAdminS ? `<span class="badge-rentabilidad-rojo" style="font-size:11px;padding:2px 6px;">🔴 $${(p.adeudo_generado||0).toFixed(0)}</span>` : `<span class="badge-rentabilidad-rojo" style="font-size:11px;padding:2px 6px;" title="Rentabilidad baja"></span>`) : (p.rentabilidad_estado === 'verde' ? `<span class="badge-rentabilidad-verde" style="font-size:11px;padding:2px 6px;">🟢 OK</span>` : '—')}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function _renderGrafica(proyectos) {
        const canvas = document.getElementById('graficaCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (chartInstance) chartInstance.destroy();
        const norm = e => _normEstadoProyecto(e);
        const labels = ['Pendientes', 'En Progreso', 'Completados'];
        const counts = [
            proyectos.filter(p => ['pendiente','esperando_cotizacion','esperando_confirmacion'].includes(norm(p.estado))).length,
            proyectos.filter(p => ['progreso','garantia'].includes(norm(p.estado))).length,
            proyectos.filter(p => norm(p.estado) === 'completado').length
        ];
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: counts, backgroundColor: ['#ff9800', '#2196f3', '#4caf50'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function _updateKPIs(proyectos) {
        const kpiTotal = document.getElementById('kpiTotal');
        const kpiPendiente = document.getElementById('kpiPendiente');
        const kpiProgreso = document.getElementById('kpiProgreso');
        const kpiCompletado = document.getElementById('kpiCompletado');
        const norm = e => _normEstadoProyecto(e);
        if (kpiTotal) kpiTotal.innerText = proyectos.length;
        if (kpiPendiente) kpiPendiente.innerText = proyectos.filter(p => ['pendiente','esperando_cotizacion','esperando_confirmacion'].includes(norm(p.estado))).length;
        if (kpiProgreso) kpiProgreso.innerText = proyectos.filter(p => ['progreso','garantia'].includes(norm(p.estado))).length;
        if (kpiCompletado) kpiCompletado.innerText = proyectos.filter(p => norm(p.estado) === 'completado').length;
    }

    // ==================== FUNCIONES DEL MODAL ====================
    async function _abrirProyecto(id) {
        const sid = String(id);
        const proyecto = projects.find(p => String(p.id) === sid);
        if (!proyecto) return;
        currentProject = proyecto;
        projectId = id;
        isNewProject = false;
        try { perfilUsuario = await authService.getCurrentProfile(); } catch (e) { /* ignore */ }
        const pasoEstado = _estadoToPaso(proyecto.estado);
        if (_normEstadoProyecto(proyecto.estado) === 'completado') {
            currentStep = (proyecto.etapa_actual >= 1 && proyecto.etapa_actual <= 5)
                ? proyecto.etapa_actual
                : 5;
        } else if (proyecto.etapa_actual != null && proyecto.etapa_actual >= 1 && proyecto.etapa_actual <= 5) {
            currentStep = (_estadoToPaso(proyecto.estado) === 1 && proyecto.etapa_actual > 1)
                ? proyecto.etapa_actual
                : pasoEstado;
        } else {
            currentStep = pasoEstado;
        }
        _cargarDatosEnModal(proyecto);
        _mergeServiciosLocalDraft(String(id));
        _initWsChatterUI(proyecto);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        _irPaso(currentStep);
        _aplicarModoConsultaUI();
    }

    async function _abrirNuevoProyecto() {
        isNewProject = true;

        // Buscar cotizaciones pendientes de Ventas para Automatización
        const cotizacionesPendientes = await _buscarCotizacionesPendientes();
        if (cotizacionesPendientes.length > 0) {
            const seleccion = await _mostrarSelectorCotizaciones(cotizacionesPendientes, 'Automatización');
            if (seleccion) {
                await _cargarProyectoDesdeCotizacion(seleccion);
                return;
            }
        }

        // Crear proyecto en blanco si no hay cotizaciones o usuario cancela
        currentProject = null;
        projectId = null;
        fechaInicio = new Date().toISOString();
        actividades = [];
        materiales = [];
        epicas = [];
        apartados = [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];
        _resetForm();
        _generarFolio();
        _irPaso(1);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
        _scheduleServiciosAutosave();
    }

    async function _buscarCotizacionesPendientes() {
        const supabaseClient = _supabase();
        if (!supabaseClient) return [];

        const { data, error } = await supabaseClient
            .from('cotizaciones')
            .select('*')
            .eq('estado', 'aprobada')
            .in('departamento', ['Automatización', 'Servicios de Automatización'])
            .is('orden_origen_id', null)
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) {
            console.error('[Automatización] Error buscando cotizaciones:', error);
            return [];
        }
        return data || [];
    }

    function _mostrarSelectorCotizaciones(cotizaciones, departamento) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Cotizaciones Pendientes de ${departamento}</h3>
                            <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted">Selecciona una cotización para cargar los datos automáticamente o crea un proyecto en blanco.</p>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Folio</th>
                                            <th>Cliente</th>
                                            <th>Fecha</th>
                                            <th>Total</th>
                                            <th>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cotizaciones.map(c => `
                                            <tr>
                                                <td>${c.folio || '—'}</td>
                                                <td>${c.cliente_nombre || c.contacto || '—'}</td>
                                                <td>${c.fecha ? new Date(c.fecha).toLocaleDateString() : '—'}</td>
                                                <td>$${(c.total || 0).toFixed(2)}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-primary" data-folio="${c.folio}">
                                                        Cargar
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Crear en blanco</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Bind click events
            modal.querySelectorAll('button[data-folio]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const folio = btn.dataset.folio;
                    const cotizacion = cotizaciones.find(c => c.folio === folio);
                    modal.remove();
                    resolve(cotizacion);
                });
            });

            // Handle backdrop click
            modal.querySelector('.modal-backdrop').addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
        });
    }

    async function _cargarProyectoDesdeCotizacion(cotizacion) {
        console.log('[Automatización] Cargando cotización:', cotizacion.folio);

        isNewProject = true;
        currentProject = null;
        projectId = null;
        fechaInicio = new Date().toISOString();
        actividades = [];
        materiales = [];
        epicas = [];
        apartados = [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];

        _resetForm();

        // Llenar campos con datos de la cotización
        document.getElementById('inpFolio').value = ''; // Se generará uno nuevo
        document.getElementById('paso1_nombre').value = cotizacion.concepto || cotizacion.notas || '';
        document.getElementById('paso1_cliente') && _renderClientesSelect(cotizacion.cliente_nombre || '');
        document.getElementById('paso1_fecha').value = new Date().toISOString().slice(0, 10);
        document.getElementById('paso1_requerimiento').value = cotizacion.notas || '';
        currentProject = { notas_internas: cotizacion.notas_internas || '' };
        serviciosLevantamiento = [];
        _renderServiciosLevantamiento();

        _generarFolio();
        _irPaso(1);
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');

        console.log('[Automatización] Proyecto cargado desde cotización', cotizacion.folio);
    }

    function _cargarDatosEnModal(proyecto) {
        _setElVal('inpFolio', proyecto.folio || '');
        _setElVal('paso1_nombre', proyecto.nombre || '');
        _renderClientesSelect(proyecto.cliente || '');
        _setElVal('paso1_fecha', proyecto.fecha || '');
        _setElVal('paso1_vendedor', proyecto.vendedor || '');
        const reqEl = document.getElementById('paso1_requerimiento');
        if (reqEl) reqEl.value = _requerimientoDesdeProyecto(proyecto);
        currentProject = { ...proyecto };
        const entregaRes = document.getElementById('entregaResumenAutomatizacion');
        if (entregaRes) entregaRes.value = proyecto.entrega_resumen || '';
        serviciosLevantamiento = _parseServiciosDesdeProyecto(proyecto);
        _renderServiciosLevantamiento();
        _poblarSelectActividadServicio();

        actividades = _normalizarActividades(proyecto.actividades || []);
        if (!actividades.length && serviciosLevantamiento.length) {
            actividades = serviciosLevantamiento.map((s) => ({
                id: _uid('act-'),
                area: s.area || '',
                servicio: s.servicio || '',
                tipo: 'O',
                horas: 0,
                tarifa: 0,
                subactividades: []
            }));
        }
        ganttMeta = proyecto.gantt_meta || null;
        archivosDesarrollo = Array.isArray(proyecto.archivos_desarrollo) ? proyecto.archivos_desarrollo.slice() : [];
        materiales = proyecto.materiales || [];
        epicas = proyecto.epicas || [];
        const kmEl = document.getElementById('autoCostoKm');
        const hrsEl = document.getElementById('autoCostoHrsCam');
        if (kmEl) kmEl.value = proyecto.auto_costo_km ?? proyecto.km_visita ?? '';
        if (hrsEl) hrsEl.value = proyecto.auto_costo_hrs_cam ?? proyecto.horas_camioneta ?? '';
        if (!kmEl?.value && !hrsEl?.value) _cargarTabuladorCliente();
        else _recalcCostosServicios();
        apartados = proyecto.apartados || [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];
        fechaInicio = proyecto.fecha_inicio || new Date().toISOString();
        fechasEtapas = proyecto.fechas_etapas || {};
        _renderRegistroTiempos();

        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
        _renderPanelRentabilidad();
        _initWsChatterUI(currentProject || proyecto);
        if (ganttMeta && ganttMeta.filas && ganttMeta.filas.length) {
            _restaurarGanttDesdeMeta();
        }
        if (currentStep === 4) {
            _renderDesarrolloEjecucion();
            _renderDesarrolloArchivos();
        }
    }

    function _restaurarGanttDesdeMeta() {
        const ganttContainer = document.getElementById('ganttContainer');
        const ganttHeader = document.getElementById('ganttHeader');
        const ganttBody = document.getElementById('ganttBody');
        if (!ganttContainer || !ganttMeta || !ganttMeta.filas) return;
        const diasTotales = ganttMeta.dias || Math.ceil((ganttMeta.total_horas || 8) / 8);
        let headerHtml = '<div class="gantt-label-col"></div>';
        for (let i = 0; i < diasTotales; i++) {
            headerHtml += '<div class="gantt-day-col">D' + (i + 1) + '</div>';
        }
        ganttHeader.innerHTML = headerHtml;
        let inicioAcumulado = 0;
        let bodyHtml = '';
        ganttMeta.filas.forEach((fila) => {
            const dias = fila.horas / 8;
            const ancho = Math.max(24, Math.round(dias * 40));
            const inicio = Math.round(inicioAcumulado * 40);
            const cls = fila.tipo === 'O' ? 'gantt-office' : 'gantt-plant';
            bodyHtml += '<div class="gantt-row ' + (fila.nivel === 'sub' ? 'gantt-row-sub' : '') + '"><div class="gantt-label">' + _escHtml(fila.label) + '</div><div class="gantt-bar-container"><div class="gantt-bar ' + cls + '" style="width:' + ancho + 'px;margin-left:' + inicio + 'px;">' + fila.horas + 'h</div></div></div>';
            inicioAcumulado += dias;
        });
        ganttBody.innerHTML = bodyHtml;
        ganttContainer.style.display = 'block';
    }

    function _getEtapaLabels() {
        return ['Levantamiento','Ingeniería','Materiales','Desarrollo','Entrega'];
    }

    function _renderRegistroTiemposBase() {
        const panel = document.getElementById('registroTiemposPanel');
        if (!panel) return;
        const labels = _getEtapaLabels();
        let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
        for (let i = 1; i <= labels.length; i++) {
            const ini = fechasEtapas[`etapa${i}_inicio`];
            const fin = fechasEtapas[`etapa${i}_fin`];
            let badge = '';
            if (ini && fin) {
                const d = new Date(fin) - new Date(ini);
                const mins = Math.round(d / 60000);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
                badge = `<span style="color:#059669;font-weight:600;">${dur}</span>`;
            } else if (ini) {
                badge = `<span style="color:#d97706;font-weight:600;">En curso</span>`;
            } else {
                badge = `<span style="color:#94a3b8;">—</span>`;
            }
            const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            html += `<div style="min-width:160px;"><strong style="color:#334155;">Etapa ${i}:</strong> ${labels[i-1]}<br><span style="color:#64748b;">${iniStr} → ${finStr}</span> · ${badge}</div>`;
        }
        html += '</div>';
        panel.innerHTML = html;
    }

    async function _renderRegistroTiemposRelacionados() {
        const panel = document.getElementById('registroTiemposRelacionados');
        if (!panel || !currentProject) return;
        const supabase = _supabase();
        if (!supabase) return;
        let html = '';
        try {
            const { data: cots } = await supabase.from('cotizaciones').select('folio,fechas_etapas,estado,created_at').eq('orden_origen_id', currentProject.id).limit(5).order('created_at',{ascending:false});
            const cardsVentas = [];
            (cots || []).forEach(c => {
                const fe = c.fechas_etapas || {};
                const ventasLabels = ['Registro','Espera','Cotización','Seguimiento'];
                const lineas = [];
                for (let i = 1; i <= 4; i++) {
                    const ini = fe[`etapa${i}_inicio`];
                    const fin = fe[`etapa${i}_fin`];
                    if (ini || fin) {
                        const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                        const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                        lineas.push(`<span style="color:#64748b;">P${i} ${ventasLabels[i-1]}: ${iniStr}→${finStr}</span>`);
                    }
                }
                if (lineas.length) {
                    cardsVentas.push(`<div style="min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;"><strong>${c.folio||'COT'}</strong> · ${lineas.join(' | ')}</div>`);
                }
            });
            if (cardsVentas.length) {
                html += '<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;"><strong style="color:#334155;font-size:13px;"><i class="fas fa-file-invoice-dollar"></i> Ventas (cotizaciones vinculadas)</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">' + cardsVentas.join('') + '</div></div>';
            }
        } catch(e) { console.warn('[Auto] tiempos ventas:', e); }
        try {
            const cliente = currentProject.cliente || '';
            if (cliente) {
                const { data: talleres } = await supabase.from('ordenes_taller').select('folio,cliente_nombre,fechas_etapas,estado,created_at').ilike('cliente_nombre','%'+cliente+'%').limit(3).order('created_at',{ascending:false});
                const cardsLab = [];
                (talleres || []).forEach(t => {
                    const fe = t.fechas_etapas || {};
                    const labLabels = ['Recepción','Confirmado / Diagnóstico','En espera / En reparación','Reparado','Entregado / Facturado'];
                    const lineas = [];
                    for (let i = 1; i <= 5; i++) {
                        const ini = fe[`etapa${i}_inicio`];
                        const fin = fe[`etapa${i}_fin`];
                        if (ini || fin) {
                            const iniStr = ini ? new Date(ini).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                            const finStr = fin ? new Date(fin).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
                            lineas.push(`<span style="color:#64748b;">E${i} ${labLabels[i-1]}: ${iniStr}→${finStr}</span>`);
                        }
                    }
                    if (lineas.length) {
                        cardsLab.push(`<div style="min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:11px;"><strong>${t.folio||'SP-E'}</strong> · ${lineas.join(' | ')}</div>`);
                    }
                });
                if (cardsLab.length) {
                    html += '<div style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px;"><strong style="color:#334155;font-size:13px;"><i class="fas fa-microchip"></i> Laboratorio (mismo cliente)</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">' + cardsLab.join('') + '</div></div>';
                }
            }
        } catch(e) { console.warn('[Auto] tiempos lab:', e); }
        panel.innerHTML = html || '';
        panel.style.display = html ? 'block' : 'none';
    }

    function _renderRegistroTiempos() {
        _renderRegistroTiemposBase();
        _renderRegistroTiemposRelacionados().catch(()=>{});
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        const consulta = _proyectoEsCompletadoConsulta();
        // Bloqueo comercial (no aplica a órdenes ya completadas ni a consulta libre)
        if (!consulta && paso === 4 && currentProject) {
            const est = String(currentProject.estado || '').trim();
            if (est === 'Esperando Cotización' || est === 'Esperando Confirmación Cliente' || est === 'esperando_cotizacion' || est === 'esperando_confirmacion_cliente') {
                _showToast('⏳ Esperando confirmación del cliente. Ventas presentará cotización y notificará cuando el cliente confirme.', 'warning');
                return;
            }
        }
        currentStep = paso;
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        const stepEl = document.getElementById(`step-${paso}`);
        if (stepEl) stepEl.classList.add('active');
        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        const stepBtn = document.querySelector(`.ws-step-btn[data-step="${paso}"]`);
        if (stepBtn) stepBtn.classList.add('active');
        _actualizarBotonesPaso();
        const campoInicio = `etapa${paso}_inicio`;
        if (!fechasEtapas[campoInicio]) {
            fechasEtapas[campoInicio] = new Date().toISOString();
        }
        _renderRegistroTiempos();
        if (paso === 2) {
            _syncActividadesDesdeServiciosLevantamiento(false);
            _poblarSelectActividadServicio();
            _renderActividades();
        }
        if (paso === 4) {
            _syncEpicasDesdeActividades();
            _renderDesarrolloEjecucion();
            _renderDesarrolloArchivos();
            const widgetHost = document.getElementById('widgetActividadesProyecto');
            if (widgetHost) {
                widgetHost.hidden = false;
                widgetHost.removeAttribute('aria-hidden');
            }
            if (window.actividadesModule?.renderWidgetActividades && projectId) {
                window.actividadesModule.renderWidgetActividades('widgetActividadesProyecto', projectId, 'proyectos_automatizacion');
            }
        } else {
            const widgetHost = document.getElementById('widgetActividadesProyecto');
            if (widgetHost) {
                widgetHost.hidden = true;
                widgetHost.setAttribute('aria-hidden', 'true');
                widgetHost.innerHTML = '';
            }
        }
        if (paso === 5) {
            _rellenarEntregaResponsables();
            _renderPanelRentabilidad();
        }
        if (paso === 3 && projectId && !consulta) {
            _upsertCompraDesdeAutomatizacion({ syncMateriales: false, silent: true }).catch(() => {});
        }
        _aplicarModoConsultaUI();
        _scheduleServiciosAutosave();
    }

    async function _rellenarEntregaResponsables() {
        const creadoEl = document.getElementById('entregaCreadoPorAuto');
        const desarrolloEl = document.getElementById('entregaDesarrolladoPorAuto');
        let creado = (document.getElementById('paso1_vendedor')?.value || '').trim()
            || currentProject?.vendedor
            || currentProject?.entrega_creado_por
            || '—';
        let desarrollador = currentProject?.entrega_desarrollado_por || '—';

        const subsActivas = actividades.flatMap((a) => a.subactividades || []).filter((s) => s.estado === 'completado' || s.estado === 'en_curso');
        if (subsActivas.length && perfilUsuario?.nombre) {
            desarrollador = perfilUsuario.nombre;
        }

        if (projectId && window.supabase) {
            try {
                const { data: acts } = await window.supabase
                    .from('actividades_diarias')
                    .select('estado, user_id, creado_por')
                    .eq('orden_origen_id', projectId)
                    .eq('orden_origen_tipo', 'proyectos_automatizacion');
                const relevantes = (acts || []).filter((a) => a.estado === 'completado' || a.estado === 'en_progreso');
                if (relevantes.length) {
                    const uid = relevantes[0].user_id || relevantes[0].creado_por;
                    if (uid) {
                        const { data: prof } = await window.supabase
                            .from('profiles')
                            .select('nombre')
                            .eq('id', uid)
                            .maybeSingle();
                        if (prof?.nombre) desarrollador = prof.nombre;
                        else if (perfilUsuario?.id === uid && perfilUsuario?.nombre) desarrollador = perfilUsuario.nombre;
                    } else if (perfilUsuario?.nombre) {
                        desarrollador = perfilUsuario.nombre;
                    }
                }
            } catch (e) { /* opcional */ }
        } else if (desarrollador === '—' && perfilUsuario?.nombre) {
            desarrollador = perfilUsuario.nombre;
        }

        if (creadoEl) creadoEl.textContent = creado;
        if (desarrolloEl) desarrolloEl.textContent = desarrollador;
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveProjectBtn');
        const btnNotificar = document.getElementById('btnNotificarVentasCompletado');
        const btnClienteConfirmado = document.getElementById('btnClienteConfirmadoAuto');
        if (!prevBtn && !nextBtn && !saveBtn) return;
        if (currentStep === 1) {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else if (currentStep === 5) {
            if (prevBtn) prevBtn.style.display = 'inline-flex';
            if (nextBtn) nextBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else {
            if (prevBtn) prevBtn.style.display = 'inline-flex';
            if (nextBtn) nextBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        }
        if (btnNotificar) btnNotificar.style.display = currentStep === 5 ? 'inline-flex' : 'none';
        // Confirmación de cliente: solo admin (Ventas es quien confirma la cotización en flujo normal)
        if (btnClienteConfirmado) {
            if (_proyectoEsCompletadoConsulta()) {
                btnClienteConfirmado.style.display = 'none';
            } else if (_esAdminAuto() && currentStep === 3 && currentProject) {
                const est = String(currentProject.estado || '').trim();
                const esperando = est === 'Esperando Cotización' || est === 'Esperando Confirmación Cliente' || est === 'esperando_cotizacion' || est === 'esperando_confirmacion_cliente';
                btnClienteConfirmado.style.display = esperando ? 'inline-flex' : 'none';
                btnClienteConfirmado.title = 'Solo administrador. En operación normal Ventas confirma en su módulo.';
            } else {
                btnClienteConfirmado.style.display = 'none';
            }
        }
    }

    function _terminarEtapa(etapa) {
        if (_proyectoEsCompletadoConsulta()) {
            _showToast('Orden completada: use los botones de etapa o Anterior/Siguiente para consultar. Para retrabajo formal use Garantía.', 'info');
            return;
        }
        const campo = `etapa${etapa}_fin`;
        fechasEtapas[campo] = new Date().toISOString();
        const csrfToken = sessionStorage.getItem('csrfToken');
        if (projectId) {
            proyectosService.update(projectId, { fechas_etapas: fechasEtapas }, csrfToken).catch(e => console.warn('[Auto] update fechas_etapas:', e));
        }
        _renderRegistroTiempos();
        alert(`Etapa ${etapa} finalizada`);
        if (etapa < 5) _irPaso(etapa + 1);
    }

    function _prevStep() {
        if (currentStep > 1) _irPaso(currentStep - 1);
    }

    async function _nextStep() {
        if (currentStep >= 5) return;
        if (_proyectoEsCompletadoConsulta()) {
            _irPaso(currentStep + 1);
            return;
        }
        if (!_validarPasoActual()) return;
        const siguiente = currentStep + 1;
        const nuevoEstado = _pasoToEstado(siguiente);
        const ok = await _guardarProyecto({ silent: true, pasoParaEstado: siguiente });
        if (!ok) {
            _showToast('No se pudo guardar. Revise nombre, cliente y permisos.', 'error');
            return;
        }
        try {
            if (siguiente === 3) {
                await _upsertCompraDesdeAutomatizacion({ syncMateriales: materiales.length > 0, silent: true });
            } else if (currentStep === 3 && siguiente === 4) {
                await _upsertCompraDesdeAutomatizacion({ syncMateriales: true, silent: true });
            }
        } catch (e) {
            console.warn('[Auto] sync compras en siguiente:', e);
            _showToast('Guardado en Automatización; revise Compras si no aparece la solicitud.', 'warning');
        }
        _flushServiciosAutosave();
        _irPaso(siguiente);
        _setDraftIndicator(`Guardado · ${nuevoEstado}`);
        let msg = `Paso ${siguiente} · Estado: ${nuevoEstado}`;
        if (siguiente === 3) msg += ' · Solicitud en Compras';
        _showToast(msg, 'success');
    }

    function _validarPasoActual() {
        switch(currentStep) {
            case 1:
                if (!document.getElementById('paso1_nombre').value) { alert('Ingrese el nombre del proyecto'); return false; }
                if (!_getClienteNombre()) { alert('Seleccione el cliente'); return false; }
                break;
        }
        return true;
    }

    // ==================== PASO 2: INGENIERÍA (solo planificación) ====================
    function _renderSubPlanRows(actIdx, subs, prefix, depth, admin) {
        return (subs || []).map((sub, subIdx) => {
            const path = prefix ? `${prefix}.${subIdx}` : String(subIdx);
            const pathQ = `'${path}'`;
            const hijos = sub.hijos || [];
            const hijosHtml = hijos.length
                ? _renderSubPlanRows(actIdx, hijos, path, depth + 1, admin)
                : '';
            return `
                <div class="auto-sub-row auto-sub-row-plan" data-act-idx="${actIdx}" data-sub-path="${path}" style="margin-left:${depth * 18}px">
                    <div class="auto-sub-main">
                        <input type="text" class="auto-sub-title" value="${_escHtml(sub.titulo)}" placeholder="Describe el paso de trabajo…"
                            oninput="serviciosModule._actualizarSubactividad(${actIdx}, ${pathQ}, 'titulo', this.value)">
                        <div class="auto-sub-meta">
                            ${admin
                                ? `<label class="auto-sub-hrs-lbl">Horas plan <input type="number" min="0" step="0.5" class="auto-sub-hrs" value="${Number(sub.horas_plan) || 0}" onchange="serviciosModule._actualizarSubactividad(${actIdx}, ${pathQ}, 'horas_plan', this.value)"></label>`
                                : `<span class="auto-sub-hrs-read">Tiempo asignado: <strong>${Number(sub.horas_plan) || 0} h</strong></span>`}
                            ${depth > 0 ? '<span class="auto-sub-dep-badge">Dependiente</span>' : ''}
                            ${admin && sub.tiene_horas_extra ? `<span class="auto-sub-extra-badge" title="No va a cotización">+${Number(sub.horas_extra).toFixed(1)} h extra</span>` : ''}
                        </div>
                    </div>
                    <div class="auto-sub-row-actions">
                        <button type="button" class="btn-icon auto-btn-sub-mini" onclick="serviciosModule._agregarSubactividadHija(${actIdx}, ${pathQ})" title="Agregar paso que depende de este"><i class="fas fa-level-down-alt"></i></button>
                        <button type="button" class="btn-icon auto-serv-lev-del" onclick="serviciosModule._eliminarSubactividad(${actIdx}, ${pathQ})" title="Quitar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>${hijosHtml}`;
        }).join('');
    }

    function _renderActividades() {
        const host = document.getElementById('actividadesIngenieriaList');
        if (!host) return;
        const admin = _esAdminAuto();
        if (!actividades.length) {
            host.innerHTML = '<div class="auto-ing-empty"><i class="fas fa-clipboard-list"></i><p>Sin actividades. Importa servicios del paso 1.</p></div>';
            return;
        }
        host.innerHTML = actividades.map((act, actIdx) => {
            const subs = act.subactividades || [];
            const subsHtml = subs.length
                ? _renderSubPlanRows(actIdx, subs, '', 0, admin)
                : '<div class="auto-sub-empty">Agrega pasos concretos — se ejecutarán en Desarrollo.</div>';

            return `
            <article class="auto-ing-card auto-ing-card-plan">
                <header class="auto-ing-head">
                    <div class="auto-ing-head-left">
                        <span class="auto-ing-badge-plan"><i class="fas fa-drafting-compass"></i> Plan</span>
                        <span class="auto-ing-area">${_escHtml(act.area || 'General')}</span>
                        <h4 class="auto-ing-serv">${_escHtml(act.servicio || 'Actividad')}</h4>
                    </div>
                    <div class="auto-ing-head-controls">
                        <label class="auto-ing-ctrl">Ubicación
                            <select class="auto-ing-select" onchange="serviciosModule._actualizarActividad(${actIdx}, 'tipo', this.value)">
                                <option value="O" ${act.tipo === 'O' ? 'selected' : ''}>Oficina</option>
                                <option value="P" ${act.tipo === 'P' ? 'selected' : ''}>Planta</option>
                            </select>
                        </label>
                        ${admin
                            ? `<label class="auto-ing-ctrl">Horas <input type="number" class="auto-ing-num" min="0" step="0.5" value="${Number(act.horas) || 0}" onchange="serviciosModule._actualizarActividad(${actIdx}, 'horas', this.value)"></label>`
                            : `<span class="auto-ing-hrs-read">${Number(act.horas) || 0} h</span>`}
                        <button type="button" class="btn-icon auto-serv-lev-del" onclick="serviciosModule._eliminarActividad(${actIdx})" title="Quitar"><i class="fas fa-trash"></i></button>
                    </div>
                </header>
                <div class="auto-sub-list">${subsHtml}</div>
                <button type="button" class="btn-add-row btn-sm auto-btn-sub" onclick="serviciosModule._agregarSubactividad(${actIdx})"><i class="fas fa-plus"></i> Sub-actividad</button>
            </article>`;
        }).join('');
    }

    // ==================== PASO 4: DESARROLLO (ejecución) ====================
    function _renderDesarrolloEjecucion() {
        const host = document.getElementById('desarrolloEjecucionList');
        if (!host) return;
        if (!actividades.length) {
            host.innerHTML = '<div class="auto-ing-empty"><i class="fas fa-hard-hat"></i><p>No hay actividades planeadas. Completa el paso <strong>Ingeniería</strong> y genera el cronograma.</p></div>';
            return;
        }
        const flatAll = actividades.flatMap((a) => _flattenSubactividades(a.subactividades));
        const totalSubs = flatAll.length;
        const doneSubs = flatAll.filter((x) => x.sub.estado === 'completado').length;
        const pct = totalSubs ? Math.round((doneSubs / totalSubs) * 100) : 0;

        let html = `<div class="auto-des-progreso"><div class="auto-des-progreso-bar"><div style="width:${pct}%"></div></div><span>${doneSubs}/${totalSubs} sub-actividades · ${pct}%</span></div>`;

        html += actividades.map((act, actIdx) => {
            const flat = _flattenSubactividades(act.subactividades);
            if (!flat.length) return '';
            const lugar = act.tipo === 'P' ? 'Planta' : 'Oficina';
            const subsHtml = flat.map(({ sub, path, depth }) => {
                const pathQ = `'${path}'`;
                const subIdx = path; // id único para archivos
                const planMin = Math.round((Number(sub.horas_plan) || 0) * 60);
                const enCurso = sub.estado === 'en_curso';
                const completado = sub.estado === 'completado';
                const archivosHtml = (sub.archivos || []).map((f) => {
                    const isImg = (f.tipo || '').includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.url || '');
                    if (isImg) {
                        return '<a href="' + _escHtml(f.url) + '" target="_blank" rel="noopener" class="auto-sub-file-thumb"><img src="' + _escHtml(f.url) + '" alt=""></a>';
                    }
                    return '<a href="' + _escHtml(f.url) + '" target="_blank" rel="noopener" class="auto-sub-file-link"><i class="fas fa-file"></i> ' + _escHtml(f.nombre || 'Doc') + '</a>';
                }).join('');
                const tiempoReal = sub.duracion_minutos ? _formatMinutos(sub.duracion_minutos) : (enCurso ? _subTiempoTranscurrido(sub) : '—');
                const cumple = planMin && sub.duracion_minutos ? (sub.duracion_minutos <= planMin ? 'ok' : 'over') : '';
                return `
                <div class="auto-sub-row auto-sub-row-exec ${completado ? 'done' : ''} ${enCurso ? 'running' : ''}" style="margin-left:${depth * 18}px">
                    <div class="auto-sub-status-dot ${completado ? 'done' : enCurso ? 'run' : 'pend'}"></div>
                    <div class="auto-sub-main">
                        <div class="auto-sub-title-read">${depth > 0 ? '↳ ' : ''}${_escHtml(sub.titulo || 'Sin título')}</div>
                        <div class="auto-sub-meta">
                            <span class="auto-sub-hrs-read">Plan: <strong>${Number(sub.horas_plan) || 0} h</strong></span>
                            <span class="auto-sub-timer ${cumple}">Real: <strong>${_escHtml(tiempoReal)}</strong></span>
                        </div>
                        <div class="auto-sub-files">${archivosHtml}</div>
                    </div>
                    <div class="auto-sub-actions">
                        ${!completado && !enCurso ? `<button type="button" class="btn btn-sm btn-play" onclick="serviciosModule._iniciarSubactividad(${actIdx}, ${pathQ})"><i class="fas fa-play"></i> Inicio</button>` : ''}
                        ${enCurso ? `<button type="button" class="btn btn-sm btn-stop" onclick="serviciosModule._finSubactividad(${actIdx}, ${pathQ})"><i class="fas fa-stop"></i> Fin</button>` : ''}
                        ${completado ? '<span class="auto-sub-done-badge"><i class="fas fa-check"></i> Hecho</span>' : ''}
                        <button type="button" class="btn btn-sm btn-attach" onclick="document.getElementById('autoSubExecFile_${actIdx}_${String(path).replace(/\./g, '_')}').click()" title="Adjuntar evidencia"><i class="fas fa-paperclip"></i></button>
                        <input type="file" id="autoSubExecFile_${actIdx}_${String(path).replace(/\./g, '_')}" accept="image/*,video/*,.pdf,.doc,.docx" multiple style="display:none"
                            onchange="serviciosModule._subirArchivosSubactividad(${actIdx}, ${pathQ}, this.files); this.value='';">
                    </div>
                </div>`;
            }).join('');

            return `
            <article class="auto-ing-card auto-ing-card-exec">
                <header class="auto-ing-head">
                    <div class="auto-ing-head-left">
                        <span class="auto-ing-badge-exec"><i class="fas fa-hard-hat"></i> ${lugar}</span>
                        <span class="auto-ing-area">${_escHtml(act.area || '')}</span>
                        <h4 class="auto-ing-serv">${_escHtml(act.servicio || '')}</h4>
                    </div>
                    <span class="auto-ing-hrs-read">${Number(act.horas) || 0} h plan</span>
                </header>
                <div class="auto-sub-list">${subsHtml}</div>
            </article>`;
        }).join('');

        host.innerHTML = html;
    }

    function _renderDesarrolloArchivos() {
        const list = document.getElementById('desarrolloArchivosList');
        if (!list) return;
        if (!archivosDesarrollo.length) {
            list.innerHTML = '';
            return;
        }
        list.innerHTML = archivosDesarrollo.map((f, i) => {
            const isImg = (f.tipo || '').includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.url || '');
            const preview = isImg
                ? `<img src="${_escHtml(f.url)}" alt="" class="auto-upload-thumb">`
                : `<i class="fas fa-file-alt"></i>`;
            return `<div class="auto-upload-item">${preview}<a href="${_escHtml(f.url)}" target="_blank" rel="noopener">${_escHtml(f.nombre || 'Archivo')}</a>
                <button type="button" class="btn-icon auto-serv-lev-del" onclick="serviciosModule._eliminarArchivoDesarrollo(${i})"><i class="fas fa-times"></i></button></div>`;
        }).join('');
    }

    async function _subirArchivosDesarrollo(fileList) {
        if (!fileList || !fileList.length) return;
        for (const file of Array.from(fileList)) {
            if (file.size > 15 * 1024 * 1024) {
                _showToast('Archivo muy grande (máx 15MB): ' + file.name, 'error');
                continue;
            }
            try {
                const url = await _uploadArchivoAuto(file, 'desarrollo/' + (projectId || 'tmp'));
                const tipo = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');
                archivosDesarrollo.push({ url, nombre: file.name, tipo, fecha: new Date().toISOString() });
            } catch (err) {
                _showToast('Error al subir ' + file.name, 'error');
            }
        }
        _renderDesarrolloArchivos();
        await _persistActividadesSilencioso();
        _scheduleServiciosAutosave();
    }

    function _eliminarArchivoDesarrollo(idx) {
        archivosDesarrollo.splice(idx, 1);
        _renderDesarrolloArchivos();
        _persistActividadesSilencioso();
        _scheduleServiciosAutosave();
    }

    async function _uploadArchivoAuto(file, carpeta) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const fileName = 'automatizacion/' + carpeta + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
        const isOffline = window.location.port === '3333' || window.location.port === '3443'
            || window.location.hostname.endsWith('.trycloudflare.com') || window.__SSEPI_NEXT_MODE__;
        if (isOffline) {
            const res = await fetch('/api/upload', { method: 'POST', headers: { 'X-Filename': fileName }, body: file });
            const json = await res.json();
            const publicUrl = json.data?.url || json.url || '';
            if (!publicUrl) throw new Error('Sin URL');
            return publicUrl;
        }
        if (!window.supabase) throw new Error('Sin conexión');
        const { error: uploadError } = await window.supabase.storage.from('actividades').upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = window.supabase.storage.from('actividades').getPublicUrl(fileName);
        return publicUrl;
    }

    async function _persistActividadesSilencioso() {
        if (!projectId) return;
        const csrf = sessionStorage.getItem('csrfToken');
        try {
            await proyectosService.update(projectId, {
                actividades,
                archivos_desarrollo: archivosDesarrollo,
                updated_at: new Date().toISOString()
            }, csrf);
        } catch (e) { console.warn('[Auto] persist actividades:', e); }
    }

    function _actualizarActividad(idx, campo, valor) {
        if (!actividades[idx]) return;
        if (campo === 'horas') {
            if (!_esAdminAuto()) return;
            const act = actividades[idx];
            const sumSubs = HJ().sumHorasPlanSubactividades?.(act.subactividades) || 0;
            const val = parseFloat(valor) || 0;
            if (sumSubs > val + 0.001) {
                _showToast(`Las subactividades suman ${sumSubs} h; no puede bajar el servicio a ${val} h.`, 'warning');
                _renderActividades();
                return;
            }
            actividades[idx].horas = val;
        } else {
            actividades[idx][campo] = valor;
        }
        if (campo === 'area') {
            actividades[idx].servicio = '';
            _renderActividades();
        }
        _scheduleServiciosAutosave();
    }

    function _eliminarActividad(idx) {
        if (!confirm('¿Quitar esta actividad del plan?')) return;
        actividades.splice(idx, 1);
        _renderActividades();
        _poblarSelectActividadServicio();
        _scheduleServiciosAutosave();
    }

    function _agregarActividad() {
        const sel = document.getElementById('agregarActividadServicioSelect');
        const key = sel && sel.value ? sel.value.trim() : '';
        if (key) {
            const parts = key.split(' | ');
            const area = parts[0] || '';
            const servicio = parts.slice(1).join(' | ') || key;
            if (serviciosLevantamiento.length) {
                const permitido = serviciosLevantamiento.some(
                    (s) => s.area === area && s.servicio === servicio
                );
                if (!permitido) {
                    alert('Solo puede agregar servicios definidos en Ventas (paso 1).');
                    return;
                }
            }
            if (actividades.some((a) => a.area === area && a.servicio === servicio)) {
                alert('Ese servicio ya está en el plan.');
                return;
            }
            actividades.push({
                id: _uid('act-'),
                area,
                servicio,
                tipo: 'O',
                horas: 0,
                actividad_modulo_id: null,
                subactividades: []
            });
            if (sel) sel.value = '';
        } else {
            actividades.push({
                id: _uid('act-'),
                area: '',
                servicio: 'Nueva actividad',
                tipo: 'O',
                horas: 0,
                actividad_modulo_id: null,
                subactividades: []
            });
        }
        _renderActividades();
        _poblarSelectActividadServicio();
        _scheduleServiciosAutosave();
    }

    function _nuevaSubactividadVacia() {
        return {
            id: _uid('sub-'),
            titulo: '',
            horas_plan: 0,
            inicio_at: null,
            fin_at: null,
            duracion_minutos: 0,
            estado: 'pendiente',
            archivos: [],
            subtarea_modulo_id: null,
            hijos: []
        };
    }

    function _agregarSubactividad(actIdx) {
        if (!actividades[actIdx]) return;
        if (!actividades[actIdx].subactividades) actividades[actIdx].subactividades = [];
        actividades[actIdx].subactividades.push(_nuevaSubactividadVacia());
        _renderActividades();
        _scheduleServiciosAutosave();
    }

    function _agregarSubactividadHija(actIdx, parentPath) {
        const resolved = _resolverSubPath(actIdx, parentPath);
        if (!resolved?.node) return;
        if (!resolved.node.hijos) resolved.node.hijos = [];
        resolved.node.hijos.push(_nuevaSubactividadVacia());
        _renderActividades();
        _scheduleServiciosAutosave();
    }

    function _actualizarSubactividad(actIdx, subPath, campo, valor) {
        const resolved = _resolverSubPath(actIdx, subPath);
        if (!resolved?.node) return;
        const sub = resolved.node;
        const act = actividades[actIdx];
        if (campo === 'horas_plan') {
            if (!_esAdminAuto()) return;
            const parts = String(subPath).split('.');
            const parentPath = parts.length > 1 ? parts.slice(0, -1).join('.') : null;
            let padreNode = act;
            if (parentPath) {
                const pr = _resolverSubPath(actIdx, parentPath);
                padreNode = pr?.node || act;
            }
            const val = parseFloat(valor) || 0;
            const v = validarHorasPlan({
                actividad: act,
                padreNode,
                nuevaHoras: val,
                subPath
            });
            if (!v.ok) {
                _showToast(v.mensaje, 'warning');
                _renderActividades();
                return;
            }
            sub.horas_plan = val;
        } else sub[campo] = valor;
        _scheduleServiciosAutosave();
    }

    function _eliminarSubactividad(actIdx, subPath) {
        const resolved = _resolverSubPath(actIdx, subPath);
        if (!resolved) return;
        resolved.list.splice(resolved.index, 1);
        _renderActividades();
        if (currentStep === 4) _renderDesarrolloEjecucion();
        _scheduleServiciosAutosave();
    }

    async function _iniciarSubactividad(actIdx, subPath) {
        const sub = _resolverSubPath(actIdx, subPath)?.node;
        if (!sub || sub.estado === 'completado') return;
        sub.inicio_at = new Date().toISOString();
        sub.fin_at = null;
        sub.estado = 'en_curso';
        sub.duracion_minutos = 0;
        _renderDesarrolloEjecucion();
        _scheduleServiciosAutosave();
        await _syncSubactividadModulo(actIdx, subPath);
        await _persistActividadesSilencioso();
    }

    async function _finSubactividad(actIdx, subPath) {
        const sub = _resolverSubPath(actIdx, subPath)?.node;
        if (!sub || !sub.inicio_at) return;
        sub.fin_at = new Date().toISOString();
        sub.duracion_minutos = Math.round((new Date(sub.fin_at) - new Date(sub.inicio_at)) / 60000);
        sub.estado = 'completado';
        aplicarHorasExtraEnSub(sub);
        _renderDesarrolloEjecucion();
        _scheduleServiciosAutosave();
        await _syncSubactividadModulo(actIdx, subPath, true);
        await _persistActividadesSilencioso();
        const planMin = Math.round((Number(sub.horas_plan) || 0) * 60);
        const extra = calcularHorasExtraSub(sub);
        let msg = 'Completada: ' + _formatMinutos(sub.duracion_minutos);
        if (planMin) msg += planMin >= sub.duracion_minutos ? ' ✓ dentro del plan' : ' ⚠ excedió el plan';
        if (extra > 0.01 && _esAdminAuto()) msg += ` (+${extra.toFixed(1)} h extra, interno)`;
        _showToast(msg, planMin && sub.duracion_minutos > planMin ? 'warning' : 'success');
    }

    async function _syncSubactividadModulo(actIdx, subPath, marcarDone) {
        const act = actividades[actIdx];
        const sub = _resolverSubPath(actIdx, subPath)?.node;
        if (!sub?.subtarea_modulo_id || !projectId) return;
        const csrf = sessionStorage.getItem('csrfToken');
        const subSvc = createDataService('actividades_subtareas');
        try {
            await subSvc.update(sub.subtarea_modulo_id, {
                done: marcarDone ? true : sub.estado === 'completado',
                titulo: sub.titulo || 'Sub-actividad',
                images: (sub.archivos || []).map((f) => ({ url: f.url, name: f.nombre }))
            }, csrf);
            if (marcarDone && act.actividad_modulo_id) {
                const actSvc = createDataService('actividades_diarias');
                const flat = _flattenSubactividades(act.subactividades);
                const allDone = flat.length > 0 && flat.every((x) => x.sub.estado === 'completado');
                if (allDone) {
                    await actSvc.update(act.actividad_modulo_id, {
                        estado: 'completado',
                        completado_en: new Date().toISOString()
                    }, csrf);
                } else {
                    await actSvc.update(act.actividad_modulo_id, { estado: 'en_progreso' }, csrf);
                }
            } else if (!marcarDone && act.actividad_modulo_id && sub.estado === 'en_curso') {
                const actSvc = createDataService('actividades_diarias');
                await actSvc.update(act.actividad_modulo_id, { estado: 'en_progreso' }, csrf);
            }
        } catch (e) { console.warn('[Auto] sync subtarea:', e); }
    }

    async function _subirArchivosSubactividad(actIdx, subPath, fileList) {
        const sub = _resolverSubPath(actIdx, subPath)?.node;
        if (!sub || !fileList || !fileList.length) return;
        for (const file of Array.from(fileList)) {
            if (file.size > 15 * 1024 * 1024) {
                _showToast('Archivo muy grande (máx 15MB): ' + file.name, 'error');
                continue;
            }
            try {
                const publicUrl = await _uploadArchivoAuto(file, (projectId || 'tmp') + '/sub/' + sub.id);
                const tipo = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');
                if (!sub.archivos) sub.archivos = [];
                sub.archivos.push({ url: publicUrl, nombre: file.name, tipo });
            } catch (err) {
                console.warn('[Auto] upload:', err);
                _showToast('Error al subir ' + file.name, 'error');
            }
        }
        _renderDesarrolloEjecucion();
        await _syncSubactividadModulo(actIdx, subPath);
        await _persistActividadesSilencioso();
    }

    async function _sincronizarActividadesModulo() {
        if (!projectId) {
            alert('Guarde el proyecto antes de sincronizar con Actividades.');
            return false;
        }
        const actSvc = createDataService('actividades_diarias');
        const subSvc = createDataService('actividades_subtareas');
        const csrf = sessionStorage.getItem('csrfToken');
        const profile = await authService.getCurrentProfile();
        const folio = document.getElementById('inpFolio')?.value || '';
        const cliente = _getClienteNombre();

        try {
            for (const act of actividades) {
                if (!act.servicio) continue;
                const lugar = act.tipo === 'P' ? 'Planta' : 'Oficina';
                const resumen = '[' + act.area + '] ' + act.servicio + ' · ' + lugar + ' · ' + (act.horas || 0) + 'h';
                let actId = act.actividad_modulo_id;
                const actPayload = {
                    resumen,
                    notas: 'Proyecto ' + folio + ' · ' + cliente + '. Horas plan: ' + (act.horas || 0) + '.',
                    departamento: 'automatizacion',
                    orden_origen_id: projectId,
                    orden_origen_tipo: 'proyectos_automatizacion',
                    fecha: new Date().toISOString().split('T')[0]
                };
                if (actId) {
                    await actSvc.update(actId, actPayload, csrf);
                } else {
                    const ins = await actSvc.insert({
                        ...actPayload,
                        estado: 'pendiente',
                        user_id: profile?.id,
                        creado_por: profile?.id
                    }, csrf);
                    actId = ins?.id;
                    act.actividad_modulo_id = actId;
                }
                if (!actId) continue;
                const flat = _flattenSubactividades(act.subactividades);
                for (let i = 0; i < flat.length; i++) {
                    const sub = flat[i].sub;
                    const payload = {
                        actividad_id: actId,
                        titulo: (flat[i].depth ? '↳ ' : '') + (sub.titulo || ('Paso ' + (i + 1))),
                        descripcion: 'Horas plan: ' + (sub.horas_plan || 0) + '. Proyecto ' + folio,
                        done: sub.estado === 'completado',
                        orden: i,
                        images: (sub.archivos || []).map((f) => ({ url: f.url, name: f.nombre }))
                    };
                    if (sub.subtarea_modulo_id) {
                        await subSvc.update(sub.subtarea_modulo_id, payload, csrf);
                    } else if (sub.titulo || (sub.archivos && sub.archivos.length)) {
                        const insSub = await subSvc.insert(payload, csrf);
                        sub.subtarea_modulo_id = insSub?.id;
                    }
                }
            }
            await proyectosService.update(projectId, {
                actividades,
                actividades_sincronizadas_at: new Date().toISOString(),
                gantt_meta: ganttMeta
            }, csrf);
            if (currentStep === 4 && window.actividadesModule?.renderWidgetActividades) {
                window.actividadesModule.renderWidgetActividades('widgetActividadesProyecto', projectId, 'proyectos_automatizacion');
            }
            _showToast('Actividades sincronizadas con el módulo Actividades', 'success');
            return true;
        } catch (err) {
            console.error('[Auto] sync actividades:', err);
            _showToast('Error al sincronizar: ' + (err.message || err), 'error');
            return false;
        }
    }

    async function _generarCronograma() {
        const ganttContainer = document.getElementById('ganttContainer');
        const ganttHeader = document.getElementById('ganttHeader');
        const ganttBody = document.getElementById('ganttBody');

        if (actividades.length === 0) {
            alert('Agregue actividades primero (importe servicios del paso 1).');
            return;
        }

        const filasGantt = [];
        actividades.forEach((act) => {
            const horasAct = parseFloat(act.horas) || 0;
            if (act.servicio && horasAct > 0) {
                filasGantt.push({ label: act.servicio, horas: horasAct, tipo: act.tipo, nivel: 'servicio' });
            }
            _flattenSubactividades(act.subactividades).forEach(({ sub, depth }) => {
                const h = parseFloat(sub.horas_plan) || 0;
                if (sub.titulo && h > 0) {
                    const indent = '  '.repeat(depth + 1) + '↳ ';
                    filasGantt.push({ label: indent + sub.titulo, horas: h, tipo: act.tipo, nivel: 'sub' });
                }
            });
        });

        if (!filasGantt.length) {
            alert('Asigne horas a las actividades o sub-actividades (admin) antes de generar el cronograma.');
            return;
        }

        const totalHoras = filasGantt.reduce((sum, f) => sum + f.horas, 0);
        const diasTotales = Math.max(1, Math.ceil(totalHoras / 8));
        const fechaInicioCron = new Date();

        let headerHtml = '<div class="gantt-label-col"></div>';
        for (let i = 0; i < diasTotales; i++) {
            const fecha = new Date(fechaInicioCron);
            fecha.setDate(fecha.getDate() + i);
            headerHtml += '<div class="gantt-day-col">D' + (i + 1) + '<br><small>' + fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + '</small></div>';
        }
        ganttHeader.innerHTML = headerHtml;

        let bodyHtml = '';
        let inicioAcumulado = 0;
        filasGantt.forEach((fila) => {
            const dias = fila.horas / 8;
            const ancho = Math.max(24, Math.round(dias * 40));
            const inicio = Math.round(inicioAcumulado * 40);
            const cls = fila.tipo === 'O' ? 'gantt-office' : 'gantt-plant';
            bodyHtml += `
                <div class="gantt-row ${fila.nivel === 'sub' ? 'gantt-row-sub' : ''}">
                    <div class="gantt-label">${_escHtml(fila.label)}</div>
                    <div class="gantt-bar-container">
                        <div class="gantt-bar ${cls}" style="width:${ancho}px;margin-left:${inicio}px;">${fila.horas}h</div>
                    </div>
                </div>`;
            inicioAcumulado += dias;
        });
        ganttBody.innerHTML = bodyHtml;
        ganttContainer.style.display = 'block';

        ganttMeta = {
            generado_at: new Date().toISOString(),
            total_horas: totalHoras,
            dias: diasTotales,
            filas: filasGantt
        };

        if (projectId) {
            const csrf = sessionStorage.getItem('csrfToken');
            proyectosService.update(projectId, { gantt_meta: ganttMeta, actividades }, csrf).catch(() => {});
        }

        await _sincronizarActividadesModulo();
        _scheduleServiciosAutosave();
    }

    function _exportarCronogramaPDF() {
        _generarCronogramaPDFInterno(false);
    }

    async function _generarCotizacionAuto(preview = false) {
        if (!currentProject) { _showToast('Abre un proyecto primero', 'info'); return; }
        const user = await authService.getCurrentProfile();
        const p = currentProject;
        const items = materiales.map(m => ({
            nombre: m.nombre || '',
            descripcion: m.nombre || m.descripcion || 'Material',
            especificaciones: m.sku || '',
            unidad: 'Pza',
            precio: Number(m.costo_unitario) || 0,
            cantidad: parseInt(m.cantidad) || 1,
            entrega: ''
        }));
        actividades.forEach(a => {
            if (a.servicio) {
                const hrs = Number(a.horas) || 1;
                const tarifa = Number(a.tarifa) || (a.tipo === 'P' ? 80 : 120);
                items.push({
                    descripcion: a.servicio,
                    especificaciones: (a.area || '') + (a.tipo ? ' · ' + a.tipo : ''),
                    unidad: 'Horas',
                    precio: tarifa,
                    cantidad: hrs,
                    entrega: ''
                });
            }
        });
        const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        const km = Number(document.getElementById('autoCostoKm')?.value) || 0;
        const hrsCam = Number(document.getElementById('autoCostoHrsCam')?.value) || 0;
        if (km > 0 || hrsCam > 0) {
            const costoGas = CostosEngine.calcularCostoGasolina(km);
            const costoCam = CostosEngine.calcularCostoCamioneta(hrsCam);
            if (costoGas > 0) items.push({ descripcion: 'Gasolina (traslado)', especificaciones: km + ' km ida y vuelta', unidad: 'Viaje', precio: costoGas, cantidad: 1, entrega: '' });
            if (costoCam > 0) items.push({ descripcion: 'Camioneta (traslado)', especificaciones: hrsCam + ' horas', unidad: 'Horas', precio: costoCam, cantidad: 1, entrega: '' });
        }
        const folio = p.folio || 'SP-A000000';
        const pdfData = {
            folio,
            cliente: p.cliente_nombre || p.cliente || '',
            rfc: p.rfc || '',
            direccion: p.direccion || '',
            fecha: p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vence: p.vence || '',
            vendedor: p.vendedor || p.ingeniero || '',
            departamento: 'Automatización',
            conceptos: items,
            items,
            subtotal,
            iva,
            total
        };
        try {
            await pdfGenerator.generateCotizacion(pdfData, user, preview);
            if (!preview) _showToast('Cotización PDF generada: ' + folio, 'success');
        } catch (error) {
            _showToast('Error al generar PDF: ' + error.message, 'error');
        }
    }

    async function _generarReporteAuto(preview = false) {
        if (!currentProject) { _showToast('Abre un proyecto primero', 'info'); return; }
        const user = await authService.getCurrentProfile();
        const p = currentProject;
        const folio = p.folio || 'SP-A000000';
        const actividadesTexto = actividades.map(a => `${a.area ? '[' + a.area + '] ' : ''}${a.servicio || a.nombre} — ${a.horas || 0} hrs`).join('\n');
        const materialesTexto = materiales.map(m => `${m.nombre}${m.sku ? ' (' + m.sku + ')' : ''} ×${m.cantidad || 1}`).join('\n');
        const epicasTexto = epicas.map(e => `${e.titulo}: ${(e.tareas || []).map(t => t.nombre).join(', ') || 'Sin tareas'}`).join('\n');
        const pdfData = {
            folio,
            cliente: p.cliente_nombre || p.cliente || '',
            rfc: p.rfc || '',
            direccion: p.direccion || '',
            fecha: p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            vendedor: p.vendedor || p.ingeniero || '',
            departamento: 'Automatización',
            repDescripcion: _requerimientoDesdeProyecto(p)
                || (serviciosLevantamiento.length ? serviciosLevantamiento.map((s) => s.servicio).join(', ') : '')
                || actividadesTexto
                || 'Servicio de automatización realizado',
            repHallazgos: p.notas_internas || '',
            repRefacciones: materialesTexto || '',
            repRecomendaciones: epicasTexto || '',
            imagenes: (p.reporte_imagenes || []).map(img => img.dataUrl || img.src).filter(Boolean)
        };
        try {
            await pdfGenerator.generateReport(pdfData, user, preview);
            if (!preview) _showToast('Reporte PDF generado: ' + folio, 'success');
        } catch (error) {
            _showToast('Error al generar reporte PDF: ' + error.message, 'error');
        }
    }

    function _generarCronogramaPDFInterno(preview = false) {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) { _showToast('jsPDF no disponible', 'error'); return; }
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const PW = 210, PH = 297, ML = 15, MR = 15, TW = PW - ML - MR;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(0, 47, 108);
        doc.text('CRONOGRAMA DE ACTIVIDADES', ML, 20);
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(currentProject?.folio || '', ML, 28);
        doc.text(currentProject?.cliente_nombre || currentProject?.cliente || '', ML, 34);
        doc.text(new Date().toLocaleDateString('es-MX'), PW - MR, 28, { align: 'right' });
        const head = [['#', 'Área', 'Actividad', 'Tipo', 'Horas', 'Inicio', 'Fin']];
        const rows = actividades.map((a, i) => [
            i + 1,
            a.area || '',
            a.servicio || a.nombre || '',
            a.tipo === 'P' ? 'Planta' : 'Oficina',
            a.horas || 0,
            a.inicio || '',
            a.fin || ''
        ]);
        doc.autoTable({
            head,
            body: rows,
            startY: 40,
            margin: { left: ML, right: MR },
            styles: { fontSize: 8, font: 'helvetica' },
            headStyles: { fillColor: [0, 47, 108], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });
        if (preview){
            const blobUrl = doc.output('bloburl');
            const a = document.createElement('a');
            a.href = blobUrl; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        else doc.save('Cronograma_' + (currentProject?.folio || 'auto') + '.pdf');
    }

    // ==================== PASO 3: MATERIALES ====================
    function _renderMateriales() {
        const tbody = document.getElementById('materialesBody');
        if (!tbody) return;
        if (materiales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay materiales</td></tr>';
            return;
        }
        tbody.innerHTML = materiales.map((mat, idx) => `
            <tr>
                <td><input type="text" value="${mat.nombre}" oninput="serviciosModule._actualizarMaterial(${idx}, 'nombre', this.value)"></td>
                <td><input type="text" value="${mat.descripcion}" oninput="serviciosModule._actualizarMaterial(${idx}, 'descripcion', this.value)"></td>
                <td><input type="number" value="${mat.cantidad}" min="1" oninput="serviciosModule._actualizarMaterial(${idx}, 'cantidad', this.value)"></td>
                <td><input type="text" value="${mat.sku}" oninput="serviciosModule._actualizarMaterial(${idx}, 'sku', this.value)"></td>
                <td><input type="text" placeholder="Distribuidor" value="${mat.proveedor || ''}" oninput="serviciosModule._actualizarMaterial(${idx}, 'proveedor', this.value)"></td>
                <td><button class="btn-remove" onclick="serviciosModule._eliminarMaterial(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _actualizarMaterial(idx, campo, valor) {
        if (!materiales[idx]) return;
        if (campo === 'cantidad') {
            materiales[idx].cantidad = parseInt(valor, 10) || 1;
        } else if (campo === 'costo_unitario') {
            materiales[idx].costo_unitario = parseFloat(valor) || 0;
        } else {
            materiales[idx][campo] = valor;
        }
        if (campo === 'sku') {
            const p = inventory.find((x) => x.sku === String(valor || '').trim());
            if (p && p.costo != null && (materiales[idx].costo_unitario == null || materiales[idx].costo_unitario === 0)) {
                materiales[idx].costo_unitario = Number(p.costo);
            }
            _renderMateriales();
            _recalcCostosServicios();
        } else if (campo === 'cantidad' || campo === 'costo_unitario') {
            _recalcCostosServicios();
        }
        _scheduleServiciosAutosave();
    }

    function _eliminarMaterial(idx) {
        materiales.splice(idx, 1);
        _renderMateriales();
        _recalcCostosServicios();
        _scheduleServiciosAutosave();
    }

    function _agregarDesdeInventario() {
        const select = document.getElementById('inventarioSelect');
        const sku = select.value;
        if (!sku) return;
        const producto = inventory.find(p => p.sku === sku || p.codigo === sku);
        if (producto) {
            const cu = producto.costo != null ? Number(producto.costo) : 0;
            materiales.push({
                nombre: producto.nombre,
                descripcion: producto.descripcion || '',
                cantidad: 1,
                sku: producto.sku || producto.codigo,
                proveedor: producto.proveedor || (producto.source === 'BOM' ? 'BOM' : ''),
                costo_unitario: cu,
            });
            _renderMateriales();
            _recalcCostosServicios();
            _scheduleServiciosAutosave();
        }
    }

    function _agregarMaterialManual() {
        materiales.push({ nombre: '', descripcion: '', cantidad: 1, sku: '', costo_unitario: 0 });
        _renderMateriales();
        _recalcCostosServicios();
        _scheduleServiciosAutosave();
    }

    async function _guardarMateriales() {
        if (projectId) {
            const csrfToken = sessionStorage.getItem('csrfToken');
            await proyectosService.update(projectId, { materiales: materiales }, csrfToken);
            alert('✅ Materiales guardados');
        }
    }

    // ==================== PASO 4: DESARROLLO ====================
    function _renderEpicas() {
        const container = document.getElementById('epicasContainer');
        if (!container) return;
        if (epicas.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-light);">No hay épicas</p>';
            return;
        }
        container.innerHTML = epicas.map((epica, epicaIndex) => `
            <div class="epica-item">
                <div class="epica-header">
                    <span class="epica-titulo">${epica.titulo}</span>
                    <span class="epica-key">${epica.key || 'EP-'+ (epicaIndex+1)}</span>
                </div>
                <div class="tareas-container" id="tareas-${epica.id}">
                    ${_renderTareas(epica.tareas, epica.id, epicaIndex)}
                </div>
                <div class="tarea-nueva-row">
                    <input type="text" id="nuevaTarea-${epicaIndex}" placeholder="Título de la tarea..." class="tarea-nueva-input">
                    <button type="button" class="btn-secondary btn-sm" onclick="serviciosModule._agregarTarea(${epicaIndex})"><i class="fas fa-plus"></i> Tarea</button>
                </div>
            </div>
        `).join('');
    }

    function _renderTareas(tareas, epicaId, epicaIndex) {
        if (!tareas || tareas.length === 0) return '<p style="color:var(--text-light);">No hay tareas</p>';
        return tareas.map((tarea, tIndex) => `
            <div class="tarea-item">
                <div class="tarea-header">
                    <span class="tarea-titulo">${tarea.titulo}</span>
                    <span class="tarea-asignado">${tarea.asignado || 'Sin asignar'}</span>
                </div>
                <div class="subtareas-list" id="subtareas-${epicaId}-${tIndex}">
                    ${_renderSubtareas(tarea.subtareas, epicaId, tIndex)}
                </div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" id="nuevaSubtarea-${epicaId}-${tIndex}" placeholder="Nueva subtarea..." style="flex:1; padding:5px;">
                    <button onclick="serviciosModule._agregarSubtarea('${epicaId}', ${tIndex})">➕</button>
                </div>
            </div>
        `).join('');
    }

    function _renderSubtareas(subtareas, epicaId, tareaIndex) {
        if (!subtareas || subtareas.length === 0) return '';
        return subtareas.map((sub, sIndex) => `
            <div class="subtarea-item">
                <div class="subtarea-checkbox ${sub.completado ? 'checked' : ''}" 
                     onclick="serviciosModule._toggleSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})">
                    ${sub.completado ? '✓' : ''}
                </div>
                <span class="${sub.completado ? 'completado' : ''}">${sub.texto}</span>
                <button onclick="serviciosModule._eliminarSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function _crearEpica() {
        const input = document.getElementById('nuevaEpica');
        const titulo = input.value.trim();
        if (!titulo) return;
        epicas.push({
            id: 'ep' + Date.now() + Math.random().toString(36).substr(2, 5),
            titulo: titulo,
            key: `EP-${epicas.length + 1}`,
            tareas: []
        });
        input.value = '';
        _renderEpicas();
    }

    function _agregarTarea(epicaIndex) {
        const input = document.getElementById(`nuevaTarea-${epicaIndex}`);
        const titulo = (input?.value || '').trim();
        if (!titulo) return;
        epicas[epicaIndex].tareas.push({
            titulo: titulo,
            asignado: '',
            subtareas: []
        });
        if (input) input.value = '';
        _renderEpicas();
    }

    function _agregarSubtarea(epicaId, tareaIndex) {
        const input = document.getElementById(`nuevaSubtarea-${epicaId}-${tareaIndex}`);
        const texto = input.value.trim();
        if (!texto) return;
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex]) {
            epica.tareas[tareaIndex].subtareas.push({
                texto: texto,
                completado: false
            });
            input.value = '';
            _renderEpicas();
        }
    }

    function _toggleSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex] && epica.tareas[tareaIndex].subtareas[subIndex]) {
            epica.tareas[tareaIndex].subtareas[subIndex].completado = 
                !epica.tareas[tareaIndex].subtareas[subIndex].completado;
            _renderEpicas();
        }
    }

    function _eliminarSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex]) {
            epica.tareas[tareaIndex].subtareas.splice(subIndex, 1);
            _renderEpicas();
        }
    }

    // ==================== PASO 5: ENTREGA ====================
    function _renderApartados() {
        const container = document.getElementById('apartadosContainer');
        if (!container) return;
        container.innerHTML = apartados.map(ap => `
            <div class="apartado-card" data-apartado-id="${ap.id}">
                <div class="apartado-header">
                    <input type="text" class="apartado-titulo-input" value="${ap.titulo}" 
                           oninput="serviciosModule._actualizarTituloApartado('${ap.id}', this.value)">
                    <div class="apartado-actions">
                        <button onclick="serviciosModule._subirArchivo('${ap.id}')"><i class="fas fa-upload"></i></button>
                        <button onclick="serviciosModule._eliminarApartado('${ap.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <textarea class="apartado-nota" placeholder="Notas..." 
                          oninput="serviciosModule._actualizarNotaApartado('${ap.id}', this.value)">${ap.nota || ''}</textarea>
                <div id="archivos-${ap.id}">
                    ${_renderArchivos(ap.archivos, ap.id)}
                </div>
            </div>
        `).join('');
    }

    function _renderArchivos(archivos, apartadoId) {
        if (!archivos || archivos.length === 0) return '';
        return archivos.map(arch => `
            <div class="archivo-item">
                <i class="fas fa-file"></i> ${arch.nombre}
                <button onclick="serviciosModule._eliminarArchivo('${apartadoId}', '${arch.nombre}')" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function _crearNuevoApartado() {
        const titulo = prompt('Título del nuevo apartado:');
        if (!titulo) return;
        apartados.push({
            id: 'ap' + Date.now() + Math.random().toString(36).substr(2, 5),
            titulo: titulo,
            nota: '',
            archivos: []
        });
        _renderApartados();
    }

    function _actualizarTituloApartado(id, nuevoTitulo) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.titulo = nuevoTitulo;
        _scheduleServiciosAutosave();
    }

    function _actualizarNotaApartado(id, nota) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.nota = nota;
        _scheduleServiciosAutosave();
    }

    function _subirArchivo(id) {
        alert('Simulación: Seleccionar archivo para subir');
    }

    function _eliminarArchivo(apartadoId, nombreArchivo) {
        const ap = apartados.find(a => a.id === apartadoId);
        if (ap && ap.archivos) {
            ap.archivos = ap.archivos.filter(a => a.nombre !== nombreArchivo);
            _renderApartados();
        }
    }

    function _eliminarApartado(id) {
        if (confirm('¿Eliminar este apartado?')) {
            apartados = apartados.filter(a => a.id !== id);
            _renderApartados();
        }
    }

    async function _buscarCompraVinculadaProyecto(proyectoId, folioProyecto) {
        const pid = String(proyectoId);
        const folioPo = `PO-${folioProyecto}`;
        try {
            const lista = await comprasService.select({}, { pageSize: 500, orderBy: 'updated_at', ascending: false });
            if (currentProject?.compra_vinculada) {
                const byRef = lista.find((c) => String(c.id) === String(currentProject.compra_vinculada));
                if (byRef) return byRef;
            }
            return lista.find((c) => {
                if (c.folio === folioPo || c.folio === folioProyecto) return true;
                let vinc = c.vinculacion;
                if (typeof vinc === 'string') {
                    try { vinc = JSON.parse(vinc); } catch { vinc = null; }
                }
                return vinc
                    && (vinc.tipo === 'proyecto' || vinc.tipo === 'automatizacion')
                    && String(vinc.id) === pid;
            }) || null;
        } catch (e) {
            console.warn('[Auto] buscar compra vinculada:', e);
            return null;
        }
    }

    // ==================== GUARDAR PROYECTO ====================
    /** @returns {Promise<boolean>} */
    async function _guardarProyecto(opts = {}) {
        const silent = !!opts.silent;
        const pasoParaEstado = opts.pasoParaEstado != null ? opts.pasoParaEstado : currentStep;

        // REGLA 2: validar cuarentena si es edición de proyecto existente
        if (!isNewProject && currentProject && window.SSEPIStateMachine && window.SSEPIStateMachine.estaEnCuarentena(currentProject)) {
            if (!silent) alert('Proyecto en cuarentena contable. No se puede modificar hasta desbloquearlo.');
            return false;
        }

        if (!document.getElementById('paso1_nombre')?.value?.trim()) {
            if (!silent) alert('Ingrese el nombre del proyecto');
            return false;
        }
        if (!_getClienteNombre()) {
            if (!silent) alert('Seleccione el cliente');
            return false;
        }

        const data = {
            folio: document.getElementById('inpFolio').value,
            nombre: document.getElementById('paso1_nombre').value,
            cliente: _getClienteNombre(),
            fecha: document.getElementById('paso1_fecha').value,
            vendedor: document.getElementById('paso1_vendedor').value,
            requerimiento_cliente: (document.getElementById('paso1_requerimiento') || {}).value || '',
            servicios_levantamiento: serviciosLevantamiento.slice(),
            servicios_automatizacion: serviciosLevantamiento.map((s) => s.key),
            notas_generales: _notasGeneralesDesdePaso1(),
            notas_internas: _getNotasInternasProyecto(),
            actividades: actividades,
            materiales: materiales,
            epicas: epicas,
            apartados: apartados,
            estado: (function() {
                if (_proyectoEsCompletadoConsulta() && currentProject?.estado) {
                    return currentProject.estado;
                }
                const pasoEstado = _pasoToEstado(pasoParaEstado);
                if (!isNewProject && currentProject && currentProject.estado) {
                    const prioridadActual = _estadoPrioridad(currentProject.estado);
                    const prioridadNueva = _estadoPrioridad(pasoEstado);
                    if (prioridadNueva <= prioridadActual) return currentProject.estado;
                }
                return pasoEstado;
            })(),
            etapa_actual: pasoParaEstado,
            avance: Math.round((pasoParaEstado / 5) * 100),
            fecha_inicio: currentProject?.fecha_inicio || fechaInicio || new Date().toISOString(),
            fechas_etapas: fechasEtapas,
            auto_costo_km: Number(document.getElementById('autoCostoKm')?.value) || 0,
            auto_costo_hrs_cam: Number(document.getElementById('autoCostoHrsCam')?.value) || 0,
            gantt_meta: ganttMeta,
            archivos_desarrollo: archivosDesarrollo.slice(),
            entrega_resumen: document.getElementById('entregaResumenAutomatizacion')?.value || '',
            entrega_creado_por: document.getElementById('entregaCreadoPorAuto')?.textContent?.trim() || '',
            entrega_desarrollado_por: document.getElementById('entregaDesarrolladoPorAuto')?.textContent?.trim() || '',
            updated_at: new Date().toISOString()
        };

        // Preservar datos de garantía si existen
        if (currentProject?.es_garantia) {
            data.es_garantia = currentProject.es_garantia;
            data.folio_original = currentProject.folio_original || null;
            data.iteracion_garantia = currentProject.iteracion_garantia || null;
        }

        // Calcular rentabilidad y adeudo
        try {
            const costoPresupuestado = currentProject?.costo_presupuestado || currentProject?.costo_total || _calcularCostoActualServicios();
            const costoReal = _calcularCostoActualServicios();
            data.costo_presupuestado = costoPresupuestado;
            data.costo_real = costoReal;
            data.adeudo_generado = Math.max(0, costoReal - costoPresupuestado);
            data.rentabilidad_estado = CostosEngine.determinarRentabilidad(costoPresupuestado, costoReal);
        } catch (re) {
            console.warn('[SSEPI-RENTABILIDAD] Error calculando rentabilidad:', re);
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        const fueNuevo = isNewProject;
        try {
            if (isNewProject) {
                var yy = new Date().getFullYear().toString().slice(-2);
                var mm = (new Date().getMonth() + 1).toString().padStart(2, '0');
                data.folio = data.folio || 'SP-A' + yy + mm + '/1';
                data.fecha_creacion = new Date().toISOString();
                const inserted = await proyectosService.insert(data, csrfToken);
                projectId = inserted.id;
                isNewProject = false;
                if (!silent) alert('✅ Proyecto guardado');
                // Registrar en historial unificado
                if (window.SSEPIStateMachine) {
                    await window.SSEPIStateMachine.actualizarEstadoOrden(
                        window.supabase, 'proyecto', projectId,
                        'creacion', `Proyecto ${data.folio} creado en Automatización`, csrfToken
                    );
                }
            } else if (!projectId) {
                throw new Error('Proyecto sin ID. Guarde de nuevo o recargue la página.');
            } else {
                await proyectosService.update(projectId, data, csrfToken);
                if (!silent) alert('✅ Proyecto actualizado');
                // Registrar cambio de estado en historial si aplica
                if (window.SSEPIStateMachine && currentProject && currentProject.estado !== data.estado) {
                    await window.SSEPIStateMachine.actualizarEstadoOrden(
                        window.supabase, 'proyecto', projectId,
                        'cambio_estado', `Proyecto ${data.folio} pasó a ${data.estado}`, csrfToken
                    );
                }
            }
            // Notificar a Ventas si el proyecto está completado
            if (data.estado === 'Completado' && (!currentProject || currentProject.estado !== 'Completado')) {
                try {
                    await notificacionesService.insert({
                        para: 'ventas',
                        tipo: 'trabajo_terminado',
                        orden_id: projectId,
                        folio: data.folio,
                        cliente: data.cliente,
                        mensaje: `Proyecto ${data.folio} completado en Automatización. Listo para facturación y entrega.`,
                        leido: false,
                        fecha: new Date().toISOString()
                    }, csrfToken);
                } catch (notifErr) { console.warn('[Auto] Error notificando a Ventas:', notifErr); }
            }
            _afterServiciosPersistOk();
            _addToFeed('💾', `Proyecto ${data.folio} guardado`);
            currentProject = { ...(currentProject || {}), ...data, id: projectId };
            const idx = projects.findIndex((p) => String(p.id) === String(projectId));
            if (idx >= 0) projects[idx] = { ...projects[idx], ...data, id: projectId };
            _applyFilters();

            // E8: Registrar en orden_historial
            try {
                const historialService = createDataService('orden_historial');
                await historialService.insert({
                    proyecto_id: projectId,
                    evento: fueNuevo ? 'creacion' : 'actualizacion',
                    descripcion: `Proyecto ${data.folio} ${fueNuevo ? 'creado' : 'guardado'} — estado: ${data.estado}`,
                    usuario: perfilUsuario?.nombre || 'Sistema',
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (histErr) { console.warn('[Automatización] Error historial:', histErr); }

            // Historial guardado — ya no se crea actividad genérica en cada guardado (ver Generar Cronograma)

            // Generar adeudo si el proyecto salió en números rojos
            if (data.adeudo_generado > 0 && projectId) {
                try {
                    let clienteId = null;
                    if (window.supabase && data.cliente) {
                        const { data: contactos } = await window.supabase.from('contactos').select('id').eq('nombre', data.cliente).limit(1);
                        if (contactos && contactos.length > 0) clienteId = contactos[0].id;
                    }
                    if (clienteId) {
                        const adeudoData = {
                            cliente_id: clienteId,
                            orden_origen_id: projectId,
                            orden_tipo: 'automatizacion',
                            folio_orden: data.folio,
                            monto_adeudo: data.adeudo_generado,
                            motivo: `Excedente de costos en proyecto ${data.folio}`,
                            recuperado: false
                        };
                        await window.supabase.from('clientes_adeudos').insert(adeudoData);
                        await window.supabase.rpc('actualizar_adeudo_cliente', { p_cliente_id: clienteId });
                        const notaAdeudo = `[${new Date().toLocaleString('es-MX')}] Sistema: Adeudo generado $${(data.adeudo_generado || 0).toFixed(2)} por excedente de costos en proyecto ${data.folio}.`;
                        await proyectosService.update(projectId, { notas_internas: (data.notas_internas || '') + '\n' + notaAdeudo }, csrfToken);
                    }
                } catch (e) {
                    console.warn('[Automatización] Error generando adeudo:', e);
                }
            }
            return true;
        } catch (error) {
            console.error(error);
            if (!silent) alert('Error: ' + error.message);
            return false;
        }
    }

    async function _completarEntrega() {
        if (currentStep !== 5) return;
        fechasEtapas['etapa5_fin'] = new Date().toISOString();
        _renderRegistroTiempos();
        await _guardarProyecto();
    }

    function _generarFolio() {
        var inp = document.getElementById('inpFolio');
        if (!window.folioFormats || !window.folioFormats.getNextFolioAutomatizacion) {
            var now = new Date();
            var folio = 'SP-A' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + '/1';
            if (inp) inp.value = folio;
            return;
        }
        window.folioFormats.getNextFolioAutomatizacion().then(function (folio) {
            if (inp) inp.value = folio;
        }).catch(function () {
            var now = new Date();
            if (inp) inp.value = 'SP-A' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + '/1';
        });
    }

    function _resetForm() {
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('inpFolio', '');
        setVal('paso1_nombre', '');
        _renderClientesSelect('');
        setVal('paso1_fecha', new Date().toISOString().split('T')[0]);
        setVal('paso1_vendedor', '');
        setVal('paso1_requerimiento', '');
        serviciosLevantamiento = [];
        ganttMeta = null;
        archivosDesarrollo = [];
        materialBusquedaQuery = '';
        const buscarMat = document.getElementById('buscarMaterialInventario');
        if (buscarMat) buscarMat.value = '';
        const entregaRes = document.getElementById('entregaResumenAutomatizacion');
        if (entregaRes) entregaRes.value = '';
        _renderServiciosLevantamiento();
        _renderClientesSelect('');
        actividades = [];
        materiales = [];
        epicas = [];
        apartados = [
            { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
            { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
            { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
            { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
            { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
        ];
        fechaInicio = new Date().toISOString();
        fechasEtapas = {};
        const panel = document.getElementById('registroTiemposPanel');
        if (panel) panel.innerHTML = '';
        _renderActividades();
        _renderMateriales();
        _renderEpicas();
        _renderApartados();
        _renderPanelRentabilidad();
    }

    function _cerrarModal() {
        _flushServiciosAutosave();
        const modal = document.getElementById('wsModal');
        if (modal) modal.classList.remove('active');
        _setDraftIndicator('');
        currentProject = null;
        projectId = null;
        isNewProject = true;
    }

    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-automatizacion);">AUTOMATIZACIÓN</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    function _showToast(mensaje, tipo) {
        if (typeof window.SSEPIToast !== 'undefined' && window.SSEPIToast.show) {
            window.SSEPIToast.show(mensaje, tipo || 'info');
        } else if (tipo === 'error') {
            alert(mensaje);
        } else {
            console.log('[Automatización]', mensaje);
        }
    }

    function _showSuccessAlert(mensaje) {
        const alertBox = document.createElement('div');
        alertBox.style.cssText = `
            position: fixed;
            top: 90px;
            right: 30px;
            background: #dcfce7;
            border: 1px solid #16a34a;
            color: #14532d;
            padding: 12px 16px;
            border-radius: 12px;
            font-weight: 800;
            z-index: 9999;
        `;
        alertBox.textContent = mensaje;
        document.body.appendChild(alertBox);
        setTimeout(() => alertBox.remove(), 2600);
    }

    async function _ensureProjectSavedForLinkage() {
        if (projectId && !isNewProject) return projectId;

        const data = {
            folio: document.getElementById('inpFolio').value || (await (window.folioFormats && window.folioFormats.getNextFolioAutomatizacion ? window.folioFormats.getNextFolioAutomatizacion() : Promise.resolve('SP-A' + new Date().getFullYear().toString().slice(-2) + (new Date().getMonth() + 1).toString().padStart(2, '0') + '/1'))),
            nombre: document.getElementById('paso1_nombre').value,
            cliente: _getClienteNombre(),
            fecha: document.getElementById('paso1_fecha').value,
            vendedor: document.getElementById('paso1_vendedor').value,
            requerimiento_cliente: (document.getElementById('paso1_requerimiento') || {}).value || '',
            servicios_levantamiento: serviciosLevantamiento.slice(),
            servicios_automatizacion: serviciosLevantamiento.map((s) => s.key),
            notas_generales: _notasGeneralesDesdePaso1(),
            notas_internas: _getNotasInternasProyecto(),
            actividades,
            materiales,
            epicas,
            apartados,
            estado: _pasoToEstado(currentStep),
            updated_at: new Date().toISOString(),
            fecha_creacion: new Date().toISOString()
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        const inserted = await proyectosService.insert(data, csrfToken);
        projectId = inserted.id;
        isNewProject = false;
        document.getElementById('inpFolio').value = inserted.folio || data.folio;
        if (data.estado === 'Completado') {
            try {
                await notificacionesService.insert({
                    para: 'ventas',
                    tipo: 'trabajo_terminado',
                    orden_id: projectId,
                    folio: data.folio,
                    cliente: data.cliente,
                    mensaje: `Proyecto ${data.folio} completado en Automatización. Listo para facturación y entrega.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
            } catch (notifErr) { console.warn('[Auto] Error notificando a Ventas:', notifErr); }
        }
        _afterServiciosPersistOk();
        _addToFeed('💾', `Proyecto ${data.folio} guardado (auto)`);
        return projectId;
    }

    async function _generarRequerimientoCompra() {
        console.log('✅ [Automatización] Click Generar Requerimiento');
        if (_proyectoEsCompletadoConsulta()) {
            _showToast('Orden completada: no se generan nuevas solicitudes de compra.', 'info');
            return;
        }

        if (!materiales || materiales.length === 0) {
            alert('Agrega materiales antes de generar el requerimiento.');
            return;
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const id = await _ensureProjectSavedForLinkage();
            const folioProyecto = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;
            const nombreProyecto = document.getElementById('paso1_nombre').value;
            const vendedor = document.getElementById('paso1_vendedor').value;

            // Buscar info completa del cliente (RFC, dirección, etc.)
            let clienteInfo = { nombre: cliente, rfc: '', direccion: '', telefono: '' };
            let gasolinaCosto = 0;
            try {
                if (window.supabase) {
                    const { data: cData } = await window.supabase.from('contactos').select('*').eq('nombre', cliente).limit(1).single();
                    if (cData) {
                        clienteInfo = {
                            nombre: cData.nombre || cliente,
                            rfc: cData.rfc || '',
                            direccion: cData.direccion || '',
                            telefono: cData.telefono || '',
                            nombre_comercial: cData.nombre_comercial || ''
                        };
                    }
                    // Buscar km en tabulador para calcular gasolina
                    const { data: tabData } = await window.supabase.from('clientes_tabulador').select('km').ilike('nombre_cliente', '%' + cliente + '%').limit(1).single();
                    const km = tabData ? (tabData.km || 0) : 0;
                    if (km > 0 && window.CostosEngine) {
                        gasolinaCosto = window.CostosEngine.calcularCostoGasolina(km);
                    }
                }
            } catch (cErr) { console.warn('[Automatización] Error buscando info cliente:', cErr); }

            // Agrupar materiales por proveedor
            const grupos = {};
            materiales.forEach(m => {
                const prov = (m.proveedor || 'PENDIENTE').trim();
                if (!grupos[prov]) grupos[prov] = [];
                grupos[prov].push({
                    sku: m.sku || '',
                    nombre: m.nombre || '',
                    descripcion: m.descripcion || '',
                    cantidad: parseInt(m.cantidad) || 1
                });
            });

            const proveedores = Object.keys(grupos);
            const foliosGenerados = [];

            for (let i = 0; i < proveedores.length; i++) {
                const prov = proveedores[i];
                const items = grupos[prov];
                // Si hay varios proveedores, se usa el mismo folio base sin sufijo (permitido por schema local)
                // En cloud, si folio es único, el primero usa folioProyecto, los demás folioProyecto-i
                const folioCompra = (i === 0) ? folioProyecto : folioProyecto + '-' + (i + 1);

                const compra = {
                    folio: folioCompra,
                    proveedor: prov,
                    departamento: 'Automatización',
                    fecha: new Date().toISOString(),
                    vinculacion: { tipo: 'proyecto', id, folio: folioProyecto, cliente, nombre: nombreProyecto, proveedor: prov },
                    items,
                    total: 0,
                    estado: 1,
                    observaciones: 'Generado desde Automatización. Cliente: ' + clienteInfo.nombre + (clienteInfo.rfc ? ' · RFC: ' + clienteInfo.rfc : '') + (gasolinaCosto > 0 ? ' · Gasolina incluida: $' + gasolinaCosto.toFixed(2) : ''),
                    pasos: [{ paso: 1, fecha: new Date().toISOString(), accion: 'Requerimiento generado desde Automatización', usuario: vendedor || 'Sistema' }],
                    data: { cliente_info: clienteInfo, gasolina: gasolinaCosto, origen: 'automatizacion' },
                    updated_at: new Date().toISOString()
                };

                try {
                    const compraRef = await comprasService.insert(compra, csrfToken);
                    foliosGenerados.push(compraRef.folio || folioCompra);
                    // Insertar items en compras_items
                    try {
                        const itemsService = createDataService('compras_items');
                        for (let ii = 0; ii < items.length; ii++) {
                            const it = items[ii];
                            await itemsService.insert({
                                compra_id: compraRef.id,
                                sku: it.sku || '',
                                descripcion: it.descripcion || '',
                                cantidad: it.cantidad || 1,
                                costo_unitario: 0,
                                costo_total: 0,
                                link_proveedor: ''
                            }, csrfToken);
                        }
                    } catch (itemsErr) {
                        console.warn('[Automatización] Error insertando items:', itemsErr);
                    }
                } catch (folioErr) {
                    // Si falla por folio duplicado (único en cloud), intentar con sufijo
                    if (String(folioErr?.message || '').toLowerCase().includes('duplicate') || String(folioErr?.code || '').includes('23505')) {
                        compra.folio = folioProyecto + '-' + (i + 1);
                        const compraRef = await comprasService.insert(compra, csrfToken);
                        foliosGenerados.push(compraRef.folio || compra.folio);
                        try {
                            const itemsService = createDataService('compras_items');
                            for (let ii = 0; ii < items.length; ii++) {
                                const it = items[ii];
                                await itemsService.insert({
                                    compra_id: compraRef.id,
                                    sku: it.sku || '',
                                    descripcion: it.descripcion || '',
                                    cantidad: it.cantidad || 1,
                                    costo_unitario: 0,
                                    costo_total: 0,
                                    link_proveedor: ''
                                }, csrfToken);
                            }
                        } catch (itemsErr2) { console.warn('[Automatización] Error insertando items (retry):', itemsErr2); }
                    } else {
                        throw folioErr;
                    }
                }
            }

            _showSuccessAlert('✅ ' + foliosGenerados.length + ' requerimiento(s) generado(s) y enviado(s) a Compras: ' + foliosGenerados.join(', '));
            _addToFeed('🧾', `Requerimientos generados (${foliosGenerados.join(', ')})`);
        } catch (error) {
            console.error(error);
            alert('Error al generar requerimiento: ' + error.message);
        }
    }

    /**
     * Crea o actualiza la solicitud en Compras al entrar al paso Materiales o al sincronizar ítems.
     * @returns {Promise<{id:string,folio?:string}|null>}
     */
    async function _upsertCompraDesdeAutomatizacion(opts = {}) {
        if (_proyectoEsCompletadoConsulta()) return null;
        const syncMateriales = !!opts.syncMateriales;
        const silent = !!opts.silent;

        const pasoParaEstado = Math.max(currentStep, 3);
        const ok = await _guardarProyecto({ silent: true, pasoParaEstado });
        if (!ok) {
            if (!silent) alert('No se pudo guardar el proyecto antes de sincronizar con Compras.');
            return null;
        }

        let id = projectId;
        if (!id) id = await _ensureProjectSavedForLinkage();
        if (!id) {
            if (!silent) alert('Guarde el proyecto antes de enviar a Compras.');
            return null;
        }
        id = String(id);

        const folioProyecto = (document.getElementById('inpFolio')?.value || currentProject?.folio || '').trim();
        if (!folioProyecto) return null;

        const cliente = _getClienteNombre();
        const nombreProyecto = document.getElementById('paso1_nombre')?.value || currentProject?.nombre || '';
        const costoPack = syncMateriales ? await _buildLineasCompraAutomatizacion() : { lineas: [], subtotal: 0, iva: 0, total: 0, costo_resumen: null };
        const itemsCompra = (costoPack.lineas || []).filter((l) => {
            const t = String(l.tipo || 'material').toLowerCase();
            return t === 'material' || t === 'consumible';
        });
        const subCompraMat = itemsCompra.reduce((s, l) => s + (Number(l.costo_total) || 0), 0);

        const csrfToken = sessionStorage.getItem('csrfToken');
        const compraExistente = await _buscarCompraVinculadaProyecto(id, folioProyecto);
        let compraRef;
        let compraFolio;

        const compraYaCerrada = compraExistente && (
            Number(compraExistente.estado) >= 5
            || String(compraExistente.estado_interno || '').toLowerCase() === 'recibida'
        );
        const proyectoAvanzado = currentProject && _estadoPrioridad(currentProject.estado) >= 4;

        if (compraExistente?.id) {
            compraFolio = compraExistente.folio || `PO-${folioProyecto}`;
            const patch = {
                departamento: 'Automatización',
                updated_at: new Date().toISOString(),
                data: {
                    ...(compraExistente?.data || {}),
                    costo_resumen: costoPack.costo_resumen,
                    vendedor: document.getElementById('paso1_vendedor')?.value || currentProject?.vendedor || '',
                    cliente_info: { nombre: cliente }
                }
            };
            if (!compraYaCerrada) {
                patch.estado = 1;
                patch.estado_interno = 'esperando_cotizacion';
                patch.observaciones = itemsCompra.length
                    ? 'Solicitud de cotización desde Automatización. Esperando precios de proveedores.'
                    : 'Solicitud desde Automatización (sin materiales aún).';
                patch.subtotal = subCompraMat;
                patch.iva = 0;
                patch.total = subCompraMat;
            }
            if (itemsCompra.length) patch.items = itemsCompra;
            await comprasService.update(compraExistente.id, patch, csrfToken);
            compraRef = { id: compraExistente.id };
        } else {
            compraFolio = `PO-${folioProyecto}`;
            compraRef = await comprasService.insert({
                folio: compraFolio,
                proveedor: 'Por asignar',
                departamento: 'Automatización',
                fecha: new Date().toISOString(),
                vinculacion: { tipo: 'proyecto', id, folio: folioProyecto, cliente, nombre: nombreProyecto },
                items: itemsCompra,
                subtotal: subCompraMat,
                iva: 0,
                total: subCompraMat,
                estado: 1,
                estado_interno: 'esperando_cotizacion',
                observaciones: itemsCompra.length
                    ? 'Solicitud de cotización desde Automatización.'
                    : 'Solicitud de cotización (sin materiales aún).',
                data: {
                    costo_resumen: costoPack.costo_resumen,
                    ajuste_3pct: false,
                    vendedor: document.getElementById('paso1_vendedor')?.value || currentProject?.vendedor || '',
                    cliente_info: { nombre: cliente }
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, csrfToken);
        }

        if (!compraRef?.id) throw new Error('No se creó la orden de compra (sin ID).');

        const estadoProyectoSync = (proyectoAvanzado && currentProject?.estado)
            ? currentProject.estado
            : 'Esperando Cotización';
        const patchProyecto = {
            compra_vinculada: compraRef.id,
            compra_folio: compraFolio,
            materiales: materiales.slice(),
            updated_at: new Date().toISOString()
        };
        if (!proyectoAvanzado) {
            patchProyecto.estado = estadoProyectoSync;
            patchProyecto.etapa_actual = Math.max(currentStep, 3);
        }
        await proyectosService.update(id, patchProyecto, csrfToken);

        if (currentProject) {
            if (!proyectoAvanzado) {
                currentProject.estado = estadoProyectoSync;
                currentProject.etapa_actual = Math.max(currentStep, 3);
            }
            currentProject.compra_vinculada = compraRef.id;
            currentProject.compra_folio = compraFolio;
        }
        const pIdx = projects.findIndex((p) => String(p.id) === id);
        if (pIdx >= 0) {
            if (!proyectoAvanzado) {
                projects[pIdx].estado = estadoProyectoSync;
                projects[pIdx].etapa_actual = Math.max(currentStep, 3);
            }
            projects[pIdx].compra_vinculada = compraRef.id;
            projects[pIdx].compra_folio = compraFolio;
        }
        _applyFilters();

        if (!compraExistente?.id) {
            await notificacionesService.insert({
                para: 'compras',
                tipo: 'solicitud_cotizacion',
                orden_id: id,
                compra_id: compraRef.id,
                folio: compraFolio,
                cliente,
                mensaje: `Automatización registró solicitud ${compraFolio}. Cotice con proveedores.`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken).catch(() => {});
        }

        if (!silent) {
            _showSuccessAlert('✅ Solicitud sincronizada en Compras: ' + compraFolio);
            _addToFeed('📤', `Compras: ${compraFolio}`);
        }
        return { id: compraRef.id, folio: compraFolio };
    }

    async function _enviarListaMaterialesACompras() {
        console.log('[Auto] Enviando lista de materiales a Compras');
        if (_proyectoEsCompletadoConsulta()) {
            _showToast('Orden completada: no se reenvía a Compras. Active garantía si aplica retrabajo.', 'info');
            return;
        }
        if (!materiales || materiales.length === 0) {
            alert('Agrega materiales antes de enviar la lista a Compras.');
            return;
        }
        try {
            const ref = await _upsertCompraDesdeAutomatizacion({ syncMateriales: true, silent: false });
            if (!ref) return;
            const folioProyecto = (document.getElementById('inpFolio')?.value || '').trim();
            const cliente = _getClienteNombre();
            const id = String(projectId);
            const csrfToken = sessionStorage.getItem('csrfToken');
            await notificacionesService.insert({
                para: 'ventas',
                tipo: 'diagnostico_completado',
                orden_id: id,
                folio: folioProyecto,
                cliente,
                mensaje: `Automatización envió materiales de ${folioProyecto} a Compras. Esperando cotización de proveedores.`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);
        } catch (error) {
            console.error(error);
            alert('Error al enviar lista a Compras: ' + error.message);
        }
    }

    async function _marcarClienteConfirmado() {
        console.log('[Auto] Marcando cliente confirmado y avanzando a Desarrollo');
        if (!projectId) { alert('Primero guarde el proyecto'); return; }
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await proyectosService.update(projectId, { estado: 'Confirmado', updated_at: new Date().toISOString() }, csrfToken);
            if (currentProject) currentProject.estado = 'Confirmado';
            _showToast('✅ Cliente confirmó. Avanzando a Desarrollo.', 'success');
            _irPaso(4);
        } catch (error) {
            console.error(error);
            alert('Error al marcar confirmación: ' + error.message);
        }
    }

    async function _activarGarantia() {
        console.log('[Auto] Activando garantía para proyecto:', projectId);
        if (!projectId || isNewProject) { alert('Primero guarde el proyecto'); return; }
        if (!confirm('¿Activar garantía? Se creará una nueva iteración del proyecto reiniciando en Materiales/Esperando Cotización.')) return;

        await _guardarProyecto();
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const folioOriginal = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;
            const nombre = document.getElementById('paso1_nombre').value;

            // Contar iteraciones previas
            let iteracion = 1;
            try {
                const { data: previas } = await window.supabase
                    .from('proyectos_automatizacion')
                    .select('iteracion_garantia')
                    .eq('folio_original', folioOriginal)
                    .order('iteracion_garantia', { ascending: false })
                    .limit(1);
                if (previas && previas.length > 0 && previas[0].iteracion_garantia) {
                    iteracion = previas[0].iteracion_garantia + 1;
                }
            } catch (e) { /* ignore */ }

            const nuevoFolio = folioOriginal + '-G' + iteracion;
            const dataNuevo = {
                folio: nuevoFolio,
                nombre: nombre + ' (Garantía ' + iteracion + ')',
                cliente: cliente,
                estado: 'Esperando Cotización',
                es_garantia: true,
                folio_original: folioOriginal,
                iteracion_garantia: iteracion,
                fecha_creacion: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                materiales: materiales.slice(),
                notas_internas: `[${new Date().toLocaleString('es-MX')}] Garantía activada desde proyecto ${folioOriginal}. Iteración ${iteracion}.\n---\n${_getNotasInternasProyecto()}`
            };

            const inserted = await proyectosService.insert(dataNuevo, csrfToken);

            await notificacionesService.insert({
                para: 'ventas', tipo: 'garantia_activada', orden_id: inserted.id, folio: nuevoFolio, cliente,
                mensaje: `Garantía activada para ${folioOriginal} → ${nuevoFolio}. Reinicia en Materiales/Esperando Cotización.`,
                leido: false, fecha: new Date().toISOString()
            }, csrfToken);

            _showSuccessAlert('✅ Garantía activada. Nueva iteración ' + nuevoFolio + ' creada en paso 3 (Materiales).');
            _addToFeed('🔧', `Garantía activada: ${nuevoFolio}`);
            _cerrarModal();
            await _loadProjects();
            _applyFilters();
        } catch (error) {
            console.error(error);
            alert('Error al activar garantía: ' + error.message);
        }
    }

    async function _notificarVentasCompletado() {
        console.log('[Auto] Notificando a Ventas que proyecto está completado');
        if (!projectId) { alert('Primero guarde el proyecto'); return; }
        await _guardarProyecto();
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const folio = document.getElementById('inpFolio').value;
            const cliente = document.getElementById('paso1_cliente').value;
            await proyectosService.update(projectId, { estado: 'Completado' }, csrfToken);
            await notificacionesService.insert({
                para: 'ventas', tipo: 'trabajo_terminado', orden_id: projectId, folio, cliente,
                mensaje: `Proyecto ${folio} completado en Automatización. Listo para facturación y entrega.`,
                leido: false, fecha: new Date().toISOString()
            }, csrfToken);
            _showSuccessAlert('✅ Proyecto completado. Ventas ha sido notificado.');
            _addToFeed('✅', `Proyecto completado. Notificado a Ventas: ${folio}`);
        } catch (error) {
            console.error(error);
            alert('Error al notificar a Ventas: ' + error.message);
        }
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        const byId = id => document.getElementById(id);
        if (byId('toggleMenu')) byId('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        if (byId('newProjectBtn')) byId('newProjectBtn').addEventListener('click', _abrirNuevoProyecto);
        if (byId('closeWsBtn')) byId('closeWsBtn').addEventListener('click', _cerrarModal);
        if (byId('cancelWsBtn')) byId('cancelWsBtn').addEventListener('click', _cerrarModal);
        document.querySelectorAll('.ws-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const step = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.step;
                if (step) _irPaso(parseInt(step, 10));
            });
        });
        if (byId('prevStepBtn')) byId('prevStepBtn').addEventListener('click', _prevStep);
        if (byId('nextStepBtn')) byId('nextStepBtn').addEventListener('click', _nextStep);
        if (byId('saveProjectBtn')) byId('saveProjectBtn').addEventListener('click', _guardarProyecto);
        if (byId('completarEntregaBtn')) byId('completarEntregaBtn').addEventListener('click', _completarEntrega);

        const btnClienteConfirmado = byId('btnClienteConfirmadoAuto');
        if (btnClienteConfirmado) btnClienteConfirmado.addEventListener('click', _marcarClienteConfirmado);
        const btnActivarGarantia = byId('btnActivarGarantiaAuto');
        if (btnActivarGarantia) btnActivarGarantia.addEventListener('click', _activarGarantia);
        if (byId('guardarPaso1')) byId('guardarPaso1').addEventListener('click', _guardarProyecto);
        if (byId('btnAgregarServicioLevantamiento')) byId('btnAgregarServicioLevantamiento').addEventListener('click', _agregarServicioLevantamiento);
        _poblarSelectServiciosLevantamiento();
        if (byId('syncActividadesDesdeServicios')) byId('syncActividadesDesdeServicios').addEventListener('click', () => _syncActividadesDesdeServiciosLevantamiento(true));
        if (byId('agregarActividad')) byId('agregarActividad').addEventListener('click', _agregarActividad);
        if (byId('generarCronograma')) byId('generarCronograma').addEventListener('click', _generarCronograma);
        if (byId('exportarCronogramaPDF')) byId('exportarCronogramaPDF').addEventListener('click', _exportarCronogramaPDF);
        if (byId('btnCotizacionPDFAuto')) byId('btnCotizacionPDFAuto').addEventListener('click', () => _generarCotizacionAuto(false));
        if (byId('btnVistaPreviaCotAuto')) byId('btnVistaPreviaCotAuto').addEventListener('click', () => _generarCotizacionAuto(true));
        if (byId('btnReportePDFAuto')) byId('btnReportePDFAuto').addEventListener('click', () => _generarReporteAuto(false));
        if (byId('btnVistaPreviaRepAuto')) byId('btnVistaPreviaRepAuto').addEventListener('click', () => _generarReporteAuto(true));
        if (byId('agregarDesdeInventario')) byId('agregarDesdeInventario').addEventListener('click', _agregarDesdeInventario);
        if (byId('agregarMaterialManual')) byId('agregarMaterialManual').addEventListener('click', _agregarMaterialManual);
        if (byId('guardarMateriales')) byId('guardarMateriales').addEventListener('click', _guardarMateriales);
        if (byId('btnRecalcCostosServicios')) byId('btnRecalcCostosServicios').addEventListener('click', _recalcCostosServicios);
        const clienteIn = byId('paso1_cliente');
        if (clienteIn) {
            clienteIn.addEventListener('change', _onClienteSelectChange);
        }
        ['autoCostoKm', 'autoCostoHrsCam'].forEach((id) => {
            const el = byId(id);
            if (el) el.addEventListener('input', _recalcCostosServicios);
        });
        const reqBtn = byId('generarRequerimientoCompraBtn');
        if (reqBtn) reqBtn.addEventListener('click', _enviarListaMaterialesACompras);
        if (byId('btnNotificarVentasCompletado')) byId('btnNotificarVentasCompletado').addEventListener('click', _notificarVentasCompletado);
        if (byId('crearEpica')) byId('crearEpica').addEventListener('click', _crearEpica);
        if (byId('crearNuevoApartado')) byId('crearNuevoApartado').addEventListener('click', _crearNuevoApartado);
        const devFiles = byId('desarrolloArchivosInput');
        if (devFiles) devFiles.addEventListener('change', (e) => _subirArchivosDesarrollo(e.target.files));
        const devZone = document.querySelector('.auto-upload-zone');
        if (devZone) {
            devZone.addEventListener('dragover', (e) => { e.preventDefault(); devZone.classList.add('drag-over'); });
            devZone.addEventListener('dragleave', () => devZone.classList.remove('drag-over'));
            devZone.addEventListener('drop', (e) => {
                e.preventDefault();
                devZone.classList.remove('drag-over');
                if (e.dataTransfer?.files?.length) _subirArchivosDesarrollo(e.dataTransfer.files);
            });
        }
        if (byId('btnRefrescarDesarrollo')) byId('btnRefrescarDesarrollo').addEventListener('click', () => {
            _renderDesarrolloEjecucion();
            _renderDesarrolloArchivos();
        });
        const buscarMat = byId('buscarMaterialInventario');
        if (buscarMat) {
            let matTimer;
            buscarMat.addEventListener('input', (e) => {
                clearTimeout(matTimer);
                matTimer = setTimeout(() => _onBuscarMaterialInput(e.target.value), 200);
            });
        }
        const closeVerAuto = byId('closeVerActividadModalAuto');
        const closeVerBtnAuto = byId('closeVerActividadBtnAuto');
        const closeVerFn = () => {
            const m = document.getElementById('verActividadModal');
            if (m) m.classList.remove('active');
        };
        if (closeVerAuto) closeVerAuto.addEventListener('click', closeVerFn);
        if (closeVerBtnAuto) closeVerBtnAuto.addEventListener('click', closeVerFn);
        const verModal = document.getElementById('verActividadModal');
        if (verModal) {
            verModal.addEventListener('click', (e) => {
                if (e.target === verModal) closeVerFn();
            });
        }

        for (let i = 1; i <= 4; i++) {
            const btn = byId(`terminarEtapa${i}`);
            if (btn) btn.addEventListener('click', () => _terminarEtapa(i));
        }
        const btnTerminar5 = byId('terminarEtapa5');
        if (btnTerminar5) btnTerminar5.addEventListener('click', () => _terminarEtapa(5));

        const aplicarBtn = byId('aplicarFiltrosBtn');
        if (aplicarBtn) aplicarBtn.addEventListener('click', () => {
            const fi = byId('filtroFechaInicio');
            const ff = byId('filtroFechaFin');
            filtroFechaInicio = fi ? fi.valueAsDate : null;
            filtroFechaFin = ff ? ff.valueAsDate : null;
            const ing = byId('filtroIngeniero');
            const est = byId('filtroEstado');
            const bus = byId('filtroBuscar');
            filtroIngeniero = ing ? ing.value : 'todos';
            filtroEstado = est ? est.value : 'todos';
            filtroBuscar = bus ? bus.value.trim() : '';
            _applyFilters();
        });

        const vistaKanban = byId('vistaKanban');
        if (vistaKanban) vistaKanban.addEventListener('click', () => {
            vistaActual = 'kanban';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'flex'; if (l) l.style.display = 'none'; if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaKanban.classList.add('active');
            _applyFilters();
        });
        const vistaLista = byId('vistaLista');
        if (vistaLista) vistaLista.addEventListener('click', () => {
            vistaActual = 'lista';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'none'; if (l) l.style.display = 'block'; if (g) g.style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaLista.classList.add('active');
            _applyFilters();
        });
        const vistaGrafica = byId('vistaGrafica');
        if (vistaGrafica) vistaGrafica.addEventListener('click', () => {
            vistaActual = 'grafica';
            const k = byId('kanbanContainer'); const l = byId('listaContainer'); const g = byId('graficaContainer');
            if (k) k.style.display = 'none'; if (l) l.style.display = 'none'; if (g) g.style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            vistaGrafica.classList.add('active');
            _applyFilters();
        });
    }

    function _toggleMenu() {
        const s = document.getElementById('sidebar');
        const b = document.body;
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

    // ==================== WS-CHATTER ====================
    function _escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function _initWsChatterUI(proyecto) {
        const folio = proyecto?.folio || '';
        const folioEl = document.getElementById('wsChatterFolio');
        if (folioEl) folioEl.textContent = folio ? `Proyecto ${folio}` : '—';
        _bindWsChatterTabs();
        _renderWsNotesFromOrden(proyecto);
        _loadWsActividad(proyecto).catch(() => {});
    }

    function _bindWsChatterTabs() {
        const tabs = document.querySelectorAll('.ws-chatter-tab');
        if (!tabs || !tabs.length) return;
        tabs.forEach(btn => {
            btn.onclick = () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.querySelectorAll('.ws-chatter-pane').forEach(p => p.classList.remove('active'));
                const pane = document.querySelector(`.ws-chatter-pane[data-pane="${tab}"]`);
                if (pane) pane.classList.add('active');
            };
        });
        const addBtn = document.getElementById('wsAddNoteBtn');
        if (addBtn && !addBtn.dataset.bound) {
            addBtn.dataset.bound = '1';
            addBtn.addEventListener('click', _wsAddNote);
        }
    }

    function _splitNotes(text) {
        const raw = String(text || '').trim();
        if (!raw) return [];
        return raw.split(/\n-{3,}\n/).map(s => s.trim()).filter(Boolean);
    }

    function _renderWsNotesFromOrden(proyecto) {
        const list = document.getElementById('wsNotesList');
        if (!list) return;
        const chunks = _splitNotes(proyecto?.notas_internas || '');
        if (!chunks.length) {
            list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Sin notas internas.</div></div>`;
            return;
        }
        list.innerHTML = chunks.map((c) => {
            const m = c.match(/^\[(.+?)\]\s*(.+?):\s*([\s\S]*)$/);
            const when = m ? m[1] : '';
            const who = m ? m[2] : 'Usuario';
            const body = m ? m[3] : c;
            return `
              <div class="ws-note-item">
                <div class="ws-note-meta"><span>${_escapeHtml(who)}</span><span>${_escapeHtml(when)}</span></div>
                <div class="ws-note-body">${_escapeHtml(body)}</div>
              </div>
            `;
        }).join('');
    }

    async function _wsAddNote() {
        if (!projectId || !currentProject) return;
        const ta = document.getElementById('wsNoteText');
        const txt = String(ta?.value || '').trim();
        if (!txt) return;
        const profile = await authService.getCurrentProfile();
        const who = profile?.nombre || profile?.email || 'Usuario';
        const when = new Date().toLocaleString('es-MX');
        const block = `[${when}] ${who}: ${txt}`;
        const next = (String(currentProject.notas_internas || '').trim() ? (String(currentProject.notas_internas).trim() + `\n---\n`) : '') + block;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await proyectosService.update(projectId, { notas_internas: next }, csrfToken);
            currentProject.notas_internas = next;
            if (ta) ta.value = '';
            _renderWsNotesFromOrden(currentProject);
            _addToFeed('📝', `Nota registrada en ${currentProject.folio || 'proyecto'}`);
        } catch (e) {
            console.error(e);
            _showToast('No se pudo registrar la nota', 'error');
        }
    }

    async function _loadWsActividad(proyecto) {
        const list = document.getElementById('wsActivityList');
        if (!list) return;
        list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Cargando actividad…</div></div>`;
        const supabase = _supabase();
        const items = [];
        const fe = proyecto?.fechas_etapas || {};
        const push = (title, iso, body) => {
            if (!iso) return;
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return;
            items.push({ when: d.toLocaleString('es-MX'), title, body: body || '' });
        };
        push('Levantamiento', fe['etapa1_inicio'], 'Levantamiento iniciado');
        push('Ingeniería', fe['etapa2_inicio'], 'Ingeniería en curso');
        push('Materiales', fe['etapa3_inicio'], 'Materiales en curso');
        push('Desarrollo', fe['etapa4_inicio'], 'Desarrollo en curso');
        push('Entrega', fe['etapa5_inicio'], 'Entrega registrada');
        if (supabase && proyecto?.id) {
            try {
                let rows = [];
                const q1 = await supabase
                    .from('audit_logs')
                    .select('timestamp,action,table_name')
                    .eq('table_name', 'proyectos_automatizacion')
                    .eq('record_id', proyecto.id)
                    .order('timestamp', { ascending: false })
                    .limit(30);
                if (!q1.error && q1.data) {
                    rows = q1.data;
                } else if (q1.error && String(q1.error.message || '').includes('table_name')) {
                    const q2 = await supabase
                        .from('audit_logs')
                        .select('timestamp,action,metadata')
                        .eq('record_id', proyecto.id)
                        .order('timestamp', { ascending: false })
                        .limit(40);
                    if (!q2.error && q2.data) {
                        rows = (q2.data || []).filter((l) => {
                            const t = (l.metadata && l.metadata.table) || '';
                            return !t || t === 'proyectos_automatizacion';
                        }).slice(0, 30);
                    }
                }
                if (rows.length) {
                    rows.forEach(l => {
                        const d = l.timestamp ? new Date(l.timestamp) : null;
                        items.push({ when: d ? d.toLocaleString('es-MX') : '—', title: String(l.action || 'EVENTO'), body: 'proyectos_automatizacion' });
                    });
                }
            } catch (e) { /* audit_logs opcional */ }
            try {
                const { data: histRows } = await supabase
                    .from('orden_historial')
                    .select('fecha,evento,descripcion,usuario')
                    .eq('proyecto_id', proyecto.id)
                    .order('fecha', { ascending: false })
                    .limit(30);
                if (histRows && histRows.length) {
                    histRows.forEach(h => {
                        const d = h.fecha ? new Date(h.fecha) : null;
                        items.push({ when: d ? d.toLocaleString('es-MX') : '—', title: String(h.evento || 'EVENTO').toUpperCase(), body: String(h.descripcion || '') + (h.usuario ? ` — ${h.usuario}` : '') });
                    });
                }
            } catch (e) { /* orden_historial opcional */ }
        }
        if (!items.length) {
            list.innerHTML = `<div class="ws-activity-item"><div class="ws-activity-body">Sin actividad.</div></div>`;
            return;
        }
        items.sort((a, b) => String(b.when).localeCompare(String(a.when)));
        list.innerHTML = items.map(it => `
          <div class="ws-activity-item">
            <div class="ws-activity-meta"><span>${_escapeHtml(it.title)}</span><span>${_escapeHtml(it.when)}</span></div>
            <div class="ws-activity-body">${_escapeHtml(it.body)}</div>
          </div>
        `).join('');
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
        _abrirProyecto,
        _actualizarActividad,
        _eliminarActividad,
        _agregarSubactividad,
        _agregarSubactividadHija,
        _actualizarSubactividad,
        _eliminarSubactividad,
        _iniciarSubactividad,
        _finSubactividad,
        _eliminarArchivoDesarrollo,
        _subirArchivosSubactividad,
        _actualizarMaterial,
        _eliminarMaterial,
        _agregarTarea,
        _agregarSubtarea,
        _toggleSubtarea,
        _eliminarSubtarea,
        _actualizarTituloApartado,
        _actualizarNotaApartado,
        _subirArchivo,
        _eliminarArchivo,
        _eliminarApartado,
        _generarCotizacionAuto,
        _generarReporteAuto
    };
})();

window.serviciosModule = ServiciosModule;