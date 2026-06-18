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
import { pdfGenerator } from '../core/pdf-generator.js?v=8';
import { notifyVentaIfEligible } from '../core/coi-sync-engine.js';
import { syncFolioAfterCotizacionInsert } from '../core/folio-operativo-service.js';
import { createAutosaveController } from '../core/ssepi-runtime/autosave-coordinator.js';
import { loadLocalDraft } from '../core/ssepi-runtime/draft-local-store.js';
import { purgeDraftRecordKeys } from '../core/ssepi-runtime/draft-purge-keys.js';
import { ssepiOn, SSEPI_EVENTS } from '../core/ssepi-runtime/ssepi-event-bus.js';
import { isAdminExportAllowed, downloadCSV, createExportButton } from '../core/csv-export.js';
import { filterOrdenesOperativas } from '../core/ssepi-runtime/lab-order-filter.js';
import { canSeeFinancials, applyBodyFinancialClass } from '../core/ssepi-runtime/cost-visibility.js';
import {
    buildDesgloseDesdeFuentes,
    recalcularDesglose,
    renderDesgloseTableHTML,
    buildConceptosPDFPublicos
} from '../core/ventas-costo-desglose.js';
import { horasParaCotizacionActividad } from '../core/horas-jerarquia.js';

const VentasModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let ventas = [];
    let cotizaciones = [];
    let inventario = [];
    let contactos = [];
    let proyectos = [];
    let taller = [];
    let motores = [];
    let suministrosVentas = [];
    /** Catálogo BOM para wizard Suministro (solo bom_automatizacion) */
    let bomCatalogoVentas = [];
    let bomVentasLoaded = false;
    const bomServiceVentas = createDataService('bom_automatizacion');
    /** Pestaña panel órdenes operativas (Laboratorio / Motores / Auto) en Ventas */
    let operativasTabVentas = 'taller';
    let solicitudesTaller = [];
    let solicitudesTallerFiltradas = []; // vista UI: solo preregistro/esperando_cotizacion
    let solicitudesFacturacion = [];

    let currentVenta = null;
    let ventaId = null;
    let isNewVenta = true;
    let editingCotizacionId = null;
    /** Desglose tipo Excel (Automatización) — solo admin en paso 2. */
    let costoDesgloseVentas = null;

    // Estado de la calculadora
    let calculadoraComponentes = [];
    let calculadoraClienteActual = null;
    let compraActual = null;

    // Wizard de cotización (4 pasos)
    let wizardPaso = 1;
    let fechasEtapas = {};
    /** Registro paso 1 (falla, prioridad, departamento, orden) — se guarda en cotización.cerebro_registro */
    let ventasWizardCerebro = null;
    let lastGastosGenerales = 0;
    let lastPrecioConUtilidad = 0;
    let lastPrecioAntesIVA = 0;
    let lastIva = 0;
    let lastTotal = 0;
    /** Porcentajes capturados en paso 2 para reutilizar en paso 3. */
    let wizardPctSnap = { utilidadPct: null, creditoPct: null, markupPct: 30, descuentoPct: 5 };

    // Autosave
    let ventasDraftSessionKey = null;
    let ventasAutosaveCtrl = null;
    let currentUserName = '';
    let actividadesDiarias = []; // Tabla de actividades para Automatización

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroVendedor = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let mostrarCanceladas = false;  // Por defecto ocultar canceladas
    let vistaActual = 'kanban';
    let chartInstance = null;
    let perfilUsuario = null;

    function _verFinanciero() {
        return canSeeFinancials(perfilUsuario);
    }

    function _normStr(s) {
        return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function _showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer') || document.body;
        const toast = document.createElement('div');
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const bg = colors[type] || colors.info;
        toast.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;background:${bg};color:white;padding:12px 20px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:350px;cursor:pointer;`;
        toast.textContent = message;
        toast.onclick = () => toast.remove();
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function _cerebroRegistroPayload() {
        const base = ventasWizardCerebro && typeof ventasWizardCerebro === 'object' ? { ...ventasWizardCerebro } : {};
        // Issue C: persistir también los porcentajes del snapshot del wizard
        // para que al editar la cotización se restauren utilidad/credito/markup/descuento.
        if (wizardPctSnap && typeof wizardPctSnap === 'object') {
            if (wizardPctSnap.utilidadPct != null) base.utilidad_pct = wizardPctSnap.utilidadPct;
            if (wizardPctSnap.creditoPct != null) base.credito_pct = wizardPctSnap.creditoPct;
            if (wizardPctSnap.markupPct != null) base.markup_pct = wizardPctSnap.markupPct;
            if (wizardPctSnap.descuentoPct != null) base.descuento_pct = wizardPctSnap.descuentoPct;
        }
        return base;
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
            'Laboratorio de Electrónica': 'Al continuar se crea la orden con folio SP-E…',
            'Taller Motores': 'Al continuar se crea la orden con folio SP-M…',
            'Automatización': 'Al continuar se crea el registro con folio SP-A…',
            'Proyectos': 'Al continuar se crea el registro con folio SP-A…',
            'Soporte en planta': 'Se crea visita de soporte y se envía a Automatización…',
            'Suministro': 'Selecciona materiales del catálogo BOM (lista completa) y agrega componentes manuales si hace falta.',
            'Administración': 'Sin orden de área; la cotización queda directa.'
        };
        el.textContent = map[dept] || 'Elige departamento.';
    }

    async function _loadBomCatalogoVentas() {
        if (bomVentasLoaded && bomCatalogoVentas.length) return bomCatalogoVentas;
        try {
            // 1) BOM de automatización
            const bomData = await bomServiceVentas.select({}, { orderBy: 'numero_item', ascending: true, page: 0, pageSize: 2000 });
            const bomItems = (bomData || []).map((b) => ({
                id: 'bom-' + (b.id || b.numero_item),
                rawId: b.id || b.numero_item,
                codigo: b.part_number || b.numero_parte || '',
                descripcion: b.descripcion || b.description || b.part_number || '—',
                categoria: b.categoria_original || b.categoria || '',
                precio: Number(b.mejor_precio) || 0,
                numero_item: b.numero_item || b.item || '',
                source: 'BOM'
            }));
            // 2) Inventario (stock + consumibles)
            const invData = await inventarioService.select({ activo: true }, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 });
            const invItems = (invData || []).map((i) => ({
                id: 'inv-' + (i.id || i.codigo),
                rawId: i.id || i.codigo,
                codigo: i.codigo || i.sku || '',
                descripcion: i.nombre || i.descripcion || i.codigo || '—',
                categoria: i.categoria || '',
                precio: Number(i.precio_venta || i.precio || i.costo || 0),
                numero_item: i.codigo || i.sku || '',
                source: 'STOCK',
                stock: i.stock || 0
            }));
            // 3) Unificar sin duplicados por código
            const seen = new Set();
            bomCatalogoVentas = [];
            for (const it of [...bomItems, ...invItems]) {
                const key = (it.codigo || '').toLowerCase().trim();
                if (key && seen.has(key)) continue;
                if (key) seen.add(key);
                bomCatalogoVentas.push(it);
            }
            bomVentasLoaded = true;
            console.log('[Ventas] Catálogo unificado cargado:', bomCatalogoVentas.length, '(BOM:', bomItems.length, 'Inv:', invItems.length + ')');
        } catch (e) {
            console.warn('[Ventas] Error cargando catálogo unificado:', e);
            bomCatalogoVentas = [];
        }
        return bomCatalogoVentas;
    }

    function _renderWizardBomSeleccionados() {
        const tbody = document.getElementById('wizardBomSeleccionadosBody');
        if (!tbody) return;
        if (!calculadoraComponentes.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Sin materiales — agrega desde el catálogo o manualmente</td></tr>';
            return;
        }
        tbody.innerHTML = calculadoraComponentes.map((c, idx) => `
            <tr>
                <td>${(c.codigo || '—')}</td>
                <td>${c.nombre}</td>
                <td>${c.cantidad}</td>
                <td>$${(Number(c.costo_unitario) || 0).toFixed(2)}</td>
                <td><button type="button" class="btn-remove" onclick="ventasModule._eliminarComponente(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _renderWizardBomLista(filtro) {
        const tbody = document.getElementById('wizardBomListaBody');
        if (!tbody) return;
        const term = _normStr(filtro || '');
        let items = bomCatalogoVentas;
        if (term) {
            items = items.filter((i) =>
                _normStr(i.descripcion).includes(term) ||
                _normStr(i.codigo).includes(term) ||
                _normStr(String(i.numero_item)).includes(term)
            );
        }
        const max = 120;
        const slice = items.slice(0, max);
        if (!slice.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Sin resultados</td></tr>';
            return;
        }
        tbody.innerHTML = slice.map((i) => {
            const badge = i.source === 'STOCK'
                ? `<span style="font-size:10px;background:#dcfce7;color:#166534;padding:1px 4px;border-radius:4px;">STOCK ${i.stock || 0}</span>`
                : `<span style="font-size:10px;background:#e0e7ff;color:#3730a3;padding:1px 4px;border-radius:4px;">BOM</span>`;
            return `
            <tr>
                <td style="font-size:11px;">${i.numero_item || '—'}</td>
                <td>${i.descripcion} ${badge}</td>
                <td>${i.codigo || '—'}</td>
                <td style="font-size:11px;">$${(i.precio || 0).toFixed(2)}</td>
                <td><button type="button" class="btn btn-sm btn-primary" data-bom-id="${String(i.id).replace(/"/g, '&quot;')}">+</button></td>
            </tr>
        `;
        }).join('');
        tbody.querySelectorAll('button[data-bom-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-bom-id');
                const item = bomCatalogoVentas.find((x) => String(x.id) === String(id));
                if (item) _agregarBomItemVentas(item);
            });
        });
        if (items.length > max) {
            tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;font-size:11px;color:#64748b;">Mostrando ${max} de ${items.length}. Refina la búsqueda.</td></tr>`;
        }
    }

    function _agregarBomItemVentas(item) {
        const precio = Number(item.precio) || 0;
        const isStock = item.source === 'STOCK';
        const rawId = item.rawId || item.id;
        const existente = calculadoraComponentes.find((c) =>
            (isStock && c.inv_id && String(c.inv_id) === String(rawId)) ||
            (!isStock && c.bom_id && String(c.bom_id) === String(rawId))
        );
        if (existente) {
            existente.cantidad = (Number(existente.cantidad) || 0) + 1;
            existente.subtotal = existente.cantidad * (Number(existente.costo_unitario) || 0);
        } else {
            const nuevo = {
                codigo: item.codigo,
                nombre: item.descripcion,
                cantidad: 1,
                costo_unitario: precio,
                costo_compra: precio,
                subtotal: precio,
                source: item.source || 'BOM'
            };
            if (isStock) nuevo.inv_id = rawId;
            else nuevo.bom_id = rawId;
            calculadoraComponentes.push(nuevo);
        }
        _renderWizardBomSeleccionados();
        if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
        _showToast('Material agregado: ' + item.descripcion, 'success');
    }

    function _agregarManualSuministroVentas() {
        const nombre = ((document.getElementById('wizardBomManualNombre') || {}).value || '').trim();
        const cantidad = parseFloat((document.getElementById('wizardBomManualCant') || {}).value) || 1;
        const precio = parseFloat((document.getElementById('wizardBomManualPrecio') || {}).value) || 0;
        if (!nombre) { _showToast('Escribe el nombre del componente', 'warning'); return; }
        calculadoraComponentes.push({
            nombre,
            codigo: '',
            cantidad,
            costo_unitario: precio,
            costo_compra: precio,
            subtotal: cantidad * precio,
            source: 'manual'
        });
        document.getElementById('wizardBomManualNombre').value = '';
        document.getElementById('wizardBomManualCant').value = '1';
        document.getElementById('wizardBomManualPrecio').value = '';
        _renderWizardBomSeleccionados();
        if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
    }

    async function _toggleWizardDeptFields() {
        const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
        const esSuministro = dept === 'Suministro';
        const esEquipos = _deptUsaEquiposMulti(dept);
        const esServicios = _deptUsaServiciosMulti(dept);
        const wrapBom = document.getElementById('wizardSuministroWrap');
        const wrapProducto = document.getElementById('wizardNombreProductoWrap');
        const wrapEquipos = document.getElementById('wizardEquiposWrap');
        const wrapServicios = document.getElementById('wizardServicioAutoWrap');
        const lblProd = wrapProducto?.querySelector('label');
        if (wrapBom) wrapBom.style.display = esSuministro ? 'block' : 'none';
        if (wrapEquipos) wrapEquipos.style.display = esEquipos ? 'block' : 'none';
        if (wrapServicios) wrapServicios.style.display = esServicios ? 'block' : 'none';
        if (wrapProducto) wrapProducto.style.display = (esSuministro || esEquipos) ? 'none' : 'block';
        if (lblProd && esServicios) {
            lblProd.innerHTML = 'Nombre del proyecto / orden <span style="color:#c62828;">*</span>';
        } else if (lblProd && !esSuministro && !esEquipos) {
            lblProd.innerHTML = 'Nombre del producto / Equipo <span style="color:#c62828;">*</span>';
        }
        if (esEquipos) _syncWizardNombreProductoDesdeEquipos();
        const fallaEl = document.getElementById('wizardFallaReportada');
        if (fallaEl && esSuministro && !fallaEl.value.trim()) {
            fallaEl.placeholder = 'Notas de la solicitud (opcional si ya describiste los materiales arriba)';
        }
        if (esSuministro) {
            await _loadBomCatalogoVentas();
            _renderWizardBomLista((document.getElementById('wizardBomBusqueda') || {}).value || '');
            _renderWizardBomSeleccionados();
        }
        _wizardActualizarAyudaFolio();
    }

    async function _persistirOrdenTrasConfirmacionCliente(cot) {
        if (!cot?.orden_origen_id || !window.supabase) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        const origen = (cot.origen || cot.cerebro_registro?.origen_cotizacion || '').toLowerCase();
        const patch = {
            estado: 'Confirmado',
            fecha_confirmacion_cliente: new Date().toISOString(),
            espera_confirmacion_cliente: false
        };
        try {
            if (origen === 'motor' || origen === 'motores') {
                await window.supabase.from('ordenes_motores').update(patch).eq('id', cot.orden_origen_id);
            } else if (origen === 'proyecto' || origen === 'automatizacion') {
                await window.supabase.from('proyectos_automatizacion').update({
                    estado: 'Confirmado',
                    fecha_confirmacion_cliente: patch.fecha_confirmacion_cliente
                }).eq('id', cot.orden_origen_id);
            } else if (origen === 'soporte') {
                await window.supabase.from('soporte_visitas').update({ estado: 'Confirmado' }).eq('id', cot.orden_origen_id);
            } else {
                await window.supabase.from('ordenes_taller').update(patch).eq('id', cot.orden_origen_id);
            }
            if (window.SSEPIStateMachine) {
                const tipoSm = origen === 'motor' || origen === 'motores' ? 'motor' : (origen === 'proyecto' || origen === 'automatizacion' ? 'proyecto' : 'taller');
                await SSEPIStateMachine.actualizarEstadoOrden(
                    window.supabase, tipoSm, cot.orden_origen_id, 'cliente_confirmo',
                    'Cliente confirmó cotización ' + (cot.folio || ''), csrfToken
                );
            }
        } catch (e) {
            console.warn('[Ventas] Error actualizando orden tras confirmación:', e);
        }
    }

    // ==================== AUTOSAVE VENTAS ====================
    function _ventasRecordKey() {
        if (compraActual && compraActual.id) return String(compraActual.id);
        if (ventasDraftSessionKey) return ventasDraftSessionKey;
        ventasDraftSessionKey = 'tmp:' + Date.now();
        return ventasDraftSessionKey;
    }

    function _ventasDraftKeysToPurge() {
        const keys = [];
        if (compraActual && compraActual.id) keys.push(String(compraActual.id));
        if (ventasDraftSessionKey) keys.push(ventasDraftSessionKey);
        return keys;
    }

    function _afterVentasPersistOk() {
        purgeDraftRecordKeys('ventas', _ventasDraftKeysToPurge());
        ventasDraftSessionKey = null;
    }

    function _collectVentasDraftPayload() {
        return {
            v: 1,
            wizardPaso: wizardPaso,
            fechasEtapas: fechasEtapas,
            calculadoraClienteActual: calculadoraClienteActual ? { ...calculadoraClienteActual } : null,
            calculadoraComponentes: calculadoraComponentes.slice(),
            compraActual: compraActual ? { ...compraActual } : null,
            ventasWizardCerebro: ventasWizardCerebro ? { ...ventasWizardCerebro } : null,
            lastGastosGenerales: lastGastosGenerales,
            lastPrecioConUtilidad: lastPrecioConUtilidad,
            lastPrecioAntesIVA: lastPrecioAntesIVA,
            lastIva: lastIva,
            lastTotal: lastTotal,
            costoDesgloseVentas: costoDesgloseVentas ? { ...costoDesgloseVentas } : null,
            wizardPctSnap: { ...wizardPctSnap },
            paso1Fields: _collectPaso1Fields(),
            paso2Fields: _collectPaso2Fields(),
            paso3Fields: _collectPaso3Fields(),
        };
    }

    function _collectPaso1Fields() {
        const dept = (document.getElementById('wizardDepartamentoSelect') || {}).value || '';
        return {
            clienteId: (document.getElementById('wizardClienteSelect') || {}).value || '',
            fechaIngreso: (document.getElementById('wizardFechaIngreso') || {}).value || '',
            nombreProducto: _wizardResolverNombreProducto(dept) || (document.getElementById('wizardNombreProducto') || {}).value || '',
            fallaReportada: (document.getElementById('wizardFallaReportada') || {}).value || '',
            prioridad: (document.getElementById('wizardPrioridadSelect') || {}).value || 'Normal',
            departamento: dept,
            equipos: _getWizardEquiposSeleccionados(),
            equipo_otro: (document.getElementById('wizardEquipoOtro') || {}).value || '',
            servicios_automatizacion: _getWizardServiciosSeleccionados(),
            servicio_automatizacion: _wizardResolverServiciosAuto(),
        };
    }

    function _collectPaso2Fields() {
        const kmEl = document.getElementById('inpLogisticaKm');
        const hrsEl = document.getElementById('inpLogisticaHoras');
        const techEl = document.getElementById('inpTechHours');
        const partsEl = document.getElementById('inpParts');
        return {
            logisticaKm: kmEl ? kmEl.value : '',
            logisticaHoras: hrsEl ? hrsEl.value : '',
            techHours: techEl ? techEl.value : '',
            parts: partsEl ? partsEl.value : '',
        };
    }

    function _collectPaso3Fields() {
        const utilEl = document.getElementById('inpUtilidadPct');
        const credEl = document.getElementById('inpCreditoPct');
        return {
            utilidadPct: utilEl ? utilEl.value : '',
            creditoPct: credEl ? credEl.value : '',
        };
    }

    function _applyVentasDraft(w) {
        if (!w || !w.payload) return;
        const p = w.payload;

        // Restaurar estado JS
        if (p.calculadoraClienteActual) calculadoraClienteActual = { ...p.calculadoraClienteActual };
        if (Array.isArray(p.calculadoraComponentes)) calculadoraComponentes = p.calculadoraComponentes.slice();
        if (p.compraActual) compraActual = { ...p.compraActual };
        if (p.ventasWizardCerebro) ventasWizardCerebro = { ...p.ventasWizardCerebro };
        if (p.lastGastosGenerales !== undefined) lastGastosGenerales = p.lastGastosGenerales;
        if (p.lastPrecioConUtilidad !== undefined) lastPrecioConUtilidad = p.lastPrecioConUtilidad;
        if (p.lastPrecioAntesIVA !== undefined) lastPrecioAntesIVA = p.lastPrecioAntesIVA;
        if (p.lastIva !== undefined) lastIva = p.lastIva;
        if (p.lastTotal !== undefined) lastTotal = p.lastTotal;
        if (p.costoDesgloseVentas) costoDesgloseVentas = recalcularDesglose({ ...p.costoDesgloseVentas }, { aplicarIva: true });
        if (p.wizardPctSnap) wizardPctSnap = { ...wizardPctSnap, ...p.wizardPctSnap };
        if (Array.isArray(p.actividadesDiarias)) actividadesDiarias = p.actividadesDiarias.slice();
        if (p.fechasEtapas && typeof p.fechasEtapas === 'object') fechasEtapas = { ...p.fechasEtapas };

        // Abrir modal y renderizar paso guardado
        const modal = document.getElementById('calculadoraModal');
        if (modal) modal.classList.add('active');

        const targetStep = p.wizardPaso || 1;
        wizardPaso = targetStep;
        _renderWizardPaso(targetStep).then(() => {
            // Después de renderizar, restaurar campos del paso actual
            if (targetStep === 1) _applyPaso1DraftFields(p.paso1Fields);
            if (targetStep >= 2) _applyPaso2DraftFields(p.paso2Fields);
            if (targetStep >= 3) _applyPaso3DraftFields(p.paso3Fields);
            try { _recalcular(); } catch (e) { /* ignore */ }
        });
    }

    function _applyPaso1DraftFields(f) {
        if (!f) return;
        const setv = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val == null ? '' : val; };
        setv('wizardClienteSelect', f.clienteId);
        setv('wizardFechaIngreso', f.fechaIngreso);
        setv('wizardNombreProducto', f.nombreProducto);
        setv('wizardNombreProductoVisible', f.nombreProducto);
        setv('wizardFallaReportada', f.fallaReportada);
        setv('wizardPrioridadSelect', f.prioridad);
        setv('wizardDepartamentoSelect', f.departamento);
        if (f.departamento && window.__onDeptChangeVentas) window.__onDeptChangeVentas();
        _restoreWizardMultiSelects(f);
        setv('wizardServicioAutoSelect', f.servicio_automatizacion);
        if (f.clienteId) {
            const sel = document.getElementById('wizardClienteSelect');
            const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
            setv('wizardEmailCliente', opt ? (opt.dataset.email || '') : '');
            setv('wizardTelefonoCliente', opt ? (opt.dataset.telefono || '') : '');
            setv('wizardRfcCliente', opt ? (opt.dataset.rfc || '') : '');
        }
    }

    function _applyPaso2DraftFields(f) {
        if (!f) return;
        const setv = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val == null ? '' : val; };
        setv('inpLogisticaKm', f.logisticaKm);
        setv('inpLogisticaHoras', f.logisticaHoras);
        setv('inpTechHours', f.techHours);
        setv('inpParts', f.parts);
    }

    function _applyPaso3DraftFields(f) {
        if (!f) return;
        const setv = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val == null ? '' : val; };
        setv('inpUtilidadPct', f.utilidadPct);
        setv('inpCreditoPct', f.creditoPct);
    }

    function _initVentasAutosave() {
        ventasAutosaveCtrl = createAutosaveController({
            module: 'ventas',
            getRecordKey: _ventasRecordKey,
            collectPayload: _collectVentasDraftPayload,
            getLabel: () => {
                const n = calculadoraClienteActual && calculadoraClienteActual.nombre;
                return 'Ventas ' + (n || 'borrador');
            },
            debounceMs: 1800,
        });
        const modal = document.getElementById('calculadoraModal');
        if (modal) {
            modal.addEventListener('input', () => { if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule(); }, true);
            modal.addEventListener('change', () => { if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule(); }, true);
        }
    }

    function _flushVentasAutosave() {
        if (ventasAutosaveCtrl) ventasAutosaveCtrl.flush();
    }

    function _resumeVentasDraftKey(recordKey) {
        const w = loadLocalDraft('ventas', recordKey);
        if (!w || !w.payload) {
            _showToast('No se encontró el borrador', 'warning');
            return;
        }
        ventasDraftSessionKey = recordKey.indexOf('tmp:') === 0 ? recordKey : null;
        _applyVentasDraft(w);
    }

    function _tryResumeVentasDraft() {
        const resume = new URLSearchParams(window.location.search).get('resume');
        if (!resume) return;
        const w = loadLocalDraft('ventas', resume);
        if (!w || !w.payload) return;
        if (!confirm('Se encontró un borrador guardado. ¿Recuperar?')) {
            history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        _resumeVentasDraftKey(resume);
        history.replaceState({}, document.title, window.location.pathname);
    }

    function _attachWizardPaso1() {
        const deptEl = document.getElementById('wizardDepartamentoSelect');
        if (deptEl && !deptEl._ssepiBound) {
            deptEl._ssepiBound = true;
            deptEl.addEventListener('change', () => {
                _wizardSetPaso1Error('');
                _toggleWizardDeptFields();
                // Mapear etiqueta de depto a slug del CostosEngine y aplicar tarifas
                try {
                    if (window.DeptosHelper && window.CostosEngine) {
                        const slug = window.DeptosHelper.ventasToEngine(deptEl.value);
                        if (window.CostosEngine.setDepartamento) {
                            window.CostosEngine.setDepartamento(slug);
                        }
                        if (window.CostosEngine.loadFromDatabase) {
                            window.CostosEngine.loadFromDatabase(slug).catch(() => { /* no bloquear UI */ });
                        }
                    }
                } catch (e) { console.warn('[ventas] setDepartamento wizard depto', e); }
            });
        }

        // Autofill: al seleccionar cliente, llenar email/tel/rfc y buscar KM/horas desde clientes_tabulador
        const clienteEl = document.getElementById('wizardClienteSelect');
        if (clienteEl && !clienteEl._ssepiBound) {
            clienteEl._ssepiBound = true;
            clienteEl.addEventListener('change', () => {
                const opt = clienteEl.selectedOptions && clienteEl.selectedOptions[0];
                const emailEl = document.getElementById('wizardEmailCliente');
                const telEl = document.getElementById('wizardTelefonoCliente');
                const rfcEl = document.getElementById('wizardRfcCliente');
                if (emailEl) emailEl.value = opt ? (opt.dataset.email || '') : '';
                if (telEl) telEl.value = opt ? (opt.dataset.telefono || '') : '';
                if (rfcEl) rfcEl.value = opt ? (opt.dataset.rfc || '') : '';

                // Actualizar calculadoraClienteActual: buscar KM/horas en clientes_tabulador
                if (opt && opt.value) {
                    const contactoId = opt.value;
                    let contacto = null;
                    let nombreCliente = '';
                    let km = 0;
                    let horas = 0;
                    let email = '';
                    let telefono = '';
                    let rfc = '';

                    if (String(contactoId).startsWith('tab-')) {
                        // Cliente del tabulador (no está en contactos)
                        nombreCliente = decodeURIComponent(contactoId.replace('tab-', ''));
                        const tabCliente = tabuladorTaller.clientes.find(
                            tc => tc.nombre && tc.nombre.toLowerCase().trim() === nombreCliente.toLowerCase().trim()
                        );
                        km = tabCliente?.km || Number(opt.dataset.km) || 0;
                        horas = tabCliente?.horas || Number(opt.dataset.horas) || 0;
                    } else {
                        contacto = contactos.find(c => String(c.id) === String(contactoId));
                        const empresaTab = (contacto?.empresa_tabulador || opt?.dataset?.empresaTabulador || contacto?.empresa || '').trim();
                        nombreCliente = empresaTab || (contacto?.nombre || contacto?.empresa || contacto?.email || 'Cliente').trim() || 'Cliente';
                        email = contacto?.email || '';
                        telefono = contacto?.telefono || '';
                        rfc = contacto?.rfc || '';
                        const tabCliente = tabuladorTaller.clientes.find(
                            tc => tc.nombre && empresaTab && tc.nombre.toLowerCase().trim() === empresaTab.toLowerCase().trim()
                        ) || tabuladorTaller.clientes.find(
                            tc => tc.nombre && nombreCliente && tc.nombre.toLowerCase().trim() === nombreCliente.toLowerCase().trim()
                        );
                        km = tabCliente?.km || Number(opt.dataset.km) || 0;
                        horas = tabCliente?.horas || Number(opt.dataset.horas) || 0;
                        const vendEl = document.getElementById('wizardVendedorAsociado');
                        if (vendEl && empresaTab) {
                            const vendedores = contactos.filter(c =>
                                c.tipo_ficha === 'contacto_empresa' &&
                                (c.empresa_tabulador || c.empresa || '').toLowerCase().trim() === empresaTab.toLowerCase().trim()
                            );
                            vendEl.value = vendedores.length
                                ? vendedores.map(v => (v.nombre || '') + (v.puesto ? ' (' + v.puesto + ')' : '')).join('; ')
                                : '';
                        }
                    }

                    calculadoraClienteActual = {
                        contactoId,
                        nombre: nombreCliente,
                        km,
                        horas,
                        email,
                        telefono,
                        rfc,
                        producto: ''
                    };

                    // Autoload KM/gasolina en tiempo real: prellenar inputs logísticos
                    // y recalcular gasolina+traslado con CostosEngine. Si el bloque
                    // logístico del paso 2 no está renderizado aún, no hace nada
                    // (el render del paso 2 ya pinta los inputs con `cliente.km/horas`).
                    _renderLogisticaInputs(km, horas);

                    // Consultar adeudo y mostrar banner
                    (async () => {
                        const adeudo = await _consultarAdeudoCliente(contactoId);
                        const banner = document.getElementById('wizardAdeudoBanner');
                        const rolActual = sessionStorage.getItem('ssepi_rol') || '';
                        const verFin = canSeeFinancials(perfilUsuario);
                        if (banner) {
                            if (adeudo > 0) {
                                if (verFin) {
                                    banner.innerHTML = `<div class="alert-adeudo" style="padding:10px 14px; background:#fff7ed; border:1px solid #fdba74; border-radius:8px; color:#9a3412; font-size:13px;">
                                        <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
                                        Este cliente tiene un adeudo acumulado de <strong>$${adeudo.toLocaleString()}</strong>.
                                        <label style="display:block;margin-top:6px;"><input type="checkbox" id="chkIncluirAdeudo"> Incluir adeudo en cotización</label>
                                    </div>`;
                                } else {
                                    banner.innerHTML = `<div class="alert-adeudo" style="padding:10px 14px; background:#fff7ed; border:1px solid #fdba74; border-radius:8px; color:#9a3412; font-size:13px;">
                                        <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
                                        Cliente con historial pendiente. Notificar a admin.
                                    </div>`;
                                    // Notificar a admin
                                    try {
                                        await notificacionesService.insert({
                                            para: 'admin',
                                            tipo: 'adeudo_alerta',
                                            cliente_id: contactoId,
                                            mensaje: `Vendedor ${rolActual} seleccionó cliente con adeudo de $${adeudo.toLocaleString()}`,
                                            leido: false,
                                            fecha: new Date().toISOString()
                                        });
                                    } catch (nErr) { console.warn('[Ventas] Notificación adeudo error:', nErr); }
                                }
                                banner.style.display = 'block';
                            } else {
                                banner.style.display = 'none';
                            }
                        }
                    })();
                }
            });
        }

        const bomSearch = document.getElementById('wizardBomBusqueda');
        if (bomSearch && !bomSearch._ssepiBound) {
            bomSearch._ssepiBound = true;
            let bomT;
            bomSearch.addEventListener('input', () => {
                clearTimeout(bomT);
                bomT = setTimeout(() => _renderWizardBomLista(bomSearch.value), 280);
            });
        }
        const bomManualBtn = document.getElementById('wizardBomManualBtn');
        if (bomManualBtn && !bomManualBtn._ssepiBound) {
            bomManualBtn._ssepiBound = true;
            bomManualBtn.addEventListener('click', _agregarManualSuministroVentas);
        }

        const nombreVis = document.getElementById('wizardNombreProductoVisible');
        if (nombreVis && !nombreVis._ssepiBound) {
            nombreVis._ssepiBound = true;
            nombreVis.addEventListener('input', () => { if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule(); });
        }

        _bindWizardEquiposServiciosEvents();
        _wizardActualizarAyudaFolio();

        // Si hay cliente pre-seleccionado (modo edición), disparar autofill
        const clienteSel = document.getElementById('wizardClienteSelect');
        if (clienteSel && clienteSel.value) {
            clienteSel.dispatchEvent(new Event('change'));
        }
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
        const nombreProducto = _wizardResolverNombreProducto(dept);
        const serviciosAuto = _wizardResolverServiciosAuto();
        const resumenTrabajo = nombreProducto || serviciosAuto || '';

        try {
            if (dept === 'Laboratorio de Electrónica') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioLaboratorio;
                let folio;
                try {
                    folio = folioFn ? await folioFn() : 'SP-E' + Date.now().toString(36).toUpperCase();
                } catch (e) {
                    folio = 'SP-E' + Date.now().toString(36).toUpperCase();
                }
                const nombreProductoLab = nombreProducto || resumenTrabajo || '—';
                const marca = (document.getElementById('wizardMarca') || {}).value || '';
                const modelo = (document.getElementById('wizardModelo') || {}).value || '';
                const serie = (document.getElementById('wizardSerie') || {}).value || '';
                const fallaReportada = (document.getElementById('wizardFallaReportada') || {}).value || falla;
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    equipo: nombreProductoLab || '—',
                    marca: marca,
                    modelo: modelo,
                    serie: serie,
                    falla_reportada: fallaReportada,
                    fecha_ingreso: fechaIso,
                    estado: 'Nuevo',
                    notas_generales: notasAlta
                };

                // Verificar si ya existe una orden similar (comparar solo fecha YYYY-MM-DD)
                const fechaSolo = fechaIso.split('T')[0];
                let existing = null;
                try {
                    const { data } = await window.supabase
                        .from('ordenes_taller')
                        .select('*')
                        .eq('cliente_nombre', clienteNombre)
                        .eq('falla_reportada', falla)
                        .eq('fecha_ingreso', fechaSolo)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    existing = data;
                } catch (e) {
                    // Si falla (columnas no existen), continuar sin verificación
                    console.warn('[Ventas] No se pudo verificar duplicados:', e);
                }

                let inserted;
                if (existing) {
                    inserted = existing;
                    _showToast('📋 Orden existente recuperada: ' + (existing.folio || ''), 'info');
                } else {
                    try {
                        inserted = await tallerService.insert(row, csrfToken);
                    } catch (err) {
                        console.warn('[Ventas] Error insertando orden:', err);
                        // Buscar por folio primero (más preciso)
                        try {
                            const { data: byFolio } = await window.supabase
                                .from('ordenes_taller')
                                .select('*')
                                .eq('folio', folio)
                                .maybeSingle();
                            if (byFolio) {
                                inserted = byFolio;
                                _showToast('📋 Orden recuperada por folio: ' + (byFolio.folio || ''), 'info');
                            }
                        } catch (e2) { /* ignorar */ }

                        // Si no, buscar por cliente + fecha
                        if (!inserted) {
                            try {
                                const { data: fallback } = await window.supabase
                                    .from('ordenes_taller')
                                    .select('*')
                                    .eq('cliente_nombre', clienteNombre)
                                    .eq('fecha_ingreso', fechaSolo)
                                    .order('created_at', { ascending: false })
                                    .limit(1)
                                    .maybeSingle();
                                if (fallback) {
                                    inserted = fallback;
                                    _showToast('📋 Orden recuperada por cliente/fecha: ' + (fallback.folio || ''), 'info');
                                }
                            } catch (e3) {
                                console.warn('[Ventas] Error buscando fallback:', e3);
                            }
                        }

                        // Último recurso: reintentar con folio único
                        if (!inserted) {
                            row.folio = folio + '-' + Date.now().toString(36).toUpperCase();
                            try {
                                inserted = await tallerService.insert(row, csrfToken);
                            } catch (err2) {
                                console.error('[Ventas] Falló reintento de insert:', err2);
                                throw new Error('No se pudo crear la orden de Laboratorio: ' + (err2.message || err2));
                            }
                        }
                    }
                    if (!inserted) throw new Error('No se recibió confirmación del servidor al crear la orden de Laboratorio.');
                }

                if (inserted && taller && !taller.some((o) => o.id === inserted.id)) taller.unshift(inserted);
                compraActual = {
                    id: inserted.id,
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'taller', folio_taller: inserted.folio || folio },
                    _origen: 'taller'
                };
                return { folio: inserted.folio || folio, ordenId: inserted.id, tipo: 'taller' };
            }

            if (dept === 'Taller Motores') {
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioMotores;
                let folio;
                try {
                    folio = folioFn ? await folioFn() : 'SP-M' + Date.now().toString(36).toUpperCase();
                } catch (e) {
                    folio = 'SP-M' + Date.now().toString(36).toUpperCase();
                }
                const nombreEquipo = nombreProducto || resumenTrabajo || '—';
                const row = {
                    folio,
                    cliente_nombre: clienteNombre,
                    motor: nombreEquipo,
                    fecha_ingreso: fechaIso,
                    falla_reportada: falla,
                    estado: 'Nuevo',
                    notas_generales: notasAlta
                };

                // Verificar si ya existe una orden similar (comparar solo fecha YYYY-MM-DD)
                const fechaSolo = fechaIso.split('T')[0];
                let existing = null;
                try {
                    const { data } = await window.supabase
                        .from('ordenes_motores')
                        .select('*')
                        .eq('cliente_nombre', clienteNombre)
                        .eq('falla_reportada', falla)
                        .eq('fecha_ingreso', fechaSolo)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    existing = data;
                } catch (e) {
                    console.warn('[Ventas] No se pudo verificar duplicados motores:', e);
                }

                let inserted;
                if (existing) {
                    inserted = existing;
                    _showToast('📋 Orden existente recuperada: ' + (existing.folio || ''), 'info');
                } else {
                    try {
                        inserted = await motoresService.insert(row, csrfToken);
                    } catch (err) {
                        console.warn('[Ventas] Error insertando orden motores:', err);
                        try {
                            const { data: byFolio } = await window.supabase
                                .from('ordenes_motores')
                                .select('*')
                                .eq('folio', folio)
                                .maybeSingle();
                            if (byFolio) { inserted = byFolio; }
                        } catch (e2) { /* ignorar */ }
                        if (!inserted) {
                            try {
                                const { data: fallback } = await window.supabase
                                    .from('ordenes_motores')
                                    .select('*')
                                    .eq('cliente_nombre', clienteNombre)
                                    .eq('fecha_ingreso', fechaSolo)
                                    .order('created_at', { ascending: false })
                                    .limit(1)
                                    .maybeSingle();
                                if (fallback) { inserted = fallback; }
                            } catch (e3) { console.warn('[Ventas] Error fallback motores:', e3); }
                        }
                        if (!inserted) {
                            row.folio = folio + '-' + Date.now().toString(36).toUpperCase();
                            try { inserted = await motoresService.insert(row, csrfToken); }
                            catch (err2) { throw new Error('No se pudo crear orden de Motores: ' + (err2.message || err2)); }
                        }
                    }
                    if (!inserted) throw new Error('No se recibió confirmación del servidor al crear la orden de Motores.');
                }

                if (inserted && motores && !motores.some((o) => o.id === inserted.id)) motores.unshift(inserted);
                compraActual = {
                    id: inserted.id,
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'motor' },
                    _origen: 'motores'
                };
                return { folio: inserted.folio || folio, ordenId: inserted.id, tipo: 'motor' };
            }

            if (dept === 'Automatización' || dept === 'Proyectos') {
                const profile = await authService.getCurrentProfile();
                const userName = profile?.nombre || 'Ventas';
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioAutomatizacion;
                let folio;
                try {
                    folio = folioFn
                        ? await folioFn()
                        : 'SP-A' + Date.now().toString(36).toUpperCase();
                } catch (e) {
                    folio = 'SP-A' + Date.now().toString(36).toUpperCase();
                }
                const fallaReq = (document.getElementById('wizardFallaReportada') || {}).value?.trim() || falla || '';
                const serviciosSel = _getWizardServiciosSeleccionados();
                const serviciosLevantamiento = serviciosSel.map((key, i) => {
                    const parts = key.split(' | ');
                    const area = parts[0] || '';
                    const servicio = parts.slice(1).join(' | ') || key;
                    return { id: 'sl' + i, area, servicio, key };
                });
                const nombreProyecto = nombreProducto
                    || (fallaReq.slice(0, 80) || resumenTrabajo || (dept === 'Proyectos' ? 'Proyecto (Ventas)' : 'Automatización (Ventas)'));
                const actividadesIniciales = serviciosLevantamiento.map((s, i) => {
                    const cat = tabuladorAutomatizacion.servicios.find(
                        (x) => (x.area + ' | ' + x.servicio) === s.key || (x.area === s.area && x.servicio === s.servicio)
                    );
                    return {
                        id: 'act-v-' + i,
                        area: s.area || 'General',
                        servicio: s.servicio || s.key,
                        tipo: cat?.tipo || 'O',
                        horas: 0,
                        tarifa: cat?.valorAgregado || 0,
                        subactividades: []
                    };
                });
                const notasProy = [fallaReq, serviciosSel.length ? ('Servicios: ' + serviciosSel.join(' | ')) : '', prioLine].filter(Boolean).join('\n\n');
                const row = {
                    folio,
                    nombre: nombreProyecto,
                    cliente: clienteNombre,
                    fecha: (fechaStr || new Date().toISOString().split('T')[0]),
                    vendedor: userName,
                    requerimiento_cliente: fallaReq,
                    servicios_levantamiento: serviciosLevantamiento,
                    servicios_automatizacion: serviciosSel,
                    actividades: actividadesIniciales,
                    notas_generales: notasProy,
                    estado: 'pendiente'
                };

                // Verificar si ya existe un proyecto similar
                const fechaSolo = fechaStr || new Date().toISOString().split('T')[0];
                let existing = null;
                try {
                    const { data } = await window.supabase
                        .from('proyectos_automatizacion')
                        .select('*')
                        .eq('cliente', clienteNombre)
                        .gte('created_at', fechaSolo + 'T00:00:00')
                        .lte('created_at', fechaSolo + 'T23:59:59')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    existing = data;
                } catch (e) {
                    console.warn('[Ventas] No se pudo verificar duplicados proyectos:', e);
                }

                let inserted;
                if (existing) {
                    inserted = existing;
                    _showToast('📋 Proyecto existente recuperado: ' + (existing.folio || ''), 'info');
                } else {
                    try {
                        inserted = await proyectosService.insert(row, csrfToken);
                    } catch (err) {
                        console.warn('[Ventas] Error insertando proyecto:', err);
                        try {
                            const { data: byFolio } = await window.supabase
                                .from('proyectos_automatizacion')
                                .select('*')
                                .eq('folio', folio)
                                .maybeSingle();
                            if (byFolio) { inserted = byFolio; }
                        } catch (e2) { /* ignorar */ }
                        if (!inserted) {
                            try {
                                const { data: fallback } = await window.supabase
                                    .from('proyectos_automatizacion')
                                    .select('*')
                                    .eq('cliente', clienteNombre)
                                    .gte('created_at', fechaSolo + 'T00:00:00')
                                    .lte('created_at', fechaSolo + 'T23:59:59')
                                    .order('created_at', { ascending: false })
                                    .limit(1)
                                    .maybeSingle();
                                if (fallback) { inserted = fallback; }
                            } catch (e3) { console.warn('[Ventas] Error fallback proyectos:', e3); }
                        }
                        if (!inserted) {
                            row.folio = folio + '-' + Date.now().toString(36).toUpperCase();
                            try { inserted = await proyectosService.insert(row, csrfToken); }
                            catch (err2) { throw new Error('No se pudo crear proyecto: ' + (err2.message || err2)); }
                        }
                    }
                    if (!inserted) throw new Error('No se recibió confirmación del servidor al crear el registro de Automatización/Proyectos.');
                }

                if (inserted && proyectos && !proyectos.some((p) => p.id === inserted.id)) proyectos.unshift(inserted);
                const origen = dept === 'Automatización' ? 'automatizacion' : 'proyecto';
                compraActual = {
                    id: inserted.id,
                    vinculacion: { id: inserted.id, nombre: clienteNombre, tipo: 'proyecto' },
                    _origen: origen
                };
                return { folio: inserted.folio || folio, ordenId: inserted.id, tipo: 'proyecto' };
            }

            if (dept === 'Soporte en planta') {
                // Crear visita de soporte y proyecto de automatización vinculado
                const profile = await authService.getCurrentProfile();
                const userName = profile?.nombre || 'Ventas';
                const now = new Date();
                const folioVisita = 'SP-SOP' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const visitaData = {
                    folio: folioVisita,
                    fecha: now.toISOString().split('T')[0],
                    cliente: clienteNombre,
                    equipo: resumenTrabajo || falla.substring(0, 80),
                    tecnico: userName,
                    departamento: 'Automatización',
                    objetivo: [falla, serviciosAuto ? ('Servicios: ' + serviciosAuto) : ''].filter(Boolean).join('\n\n'),
                    estado: 'confirmacion',
                    origen: 'ventas'
                };
                let visitaInserted;
                try {
                    const soporteService = createDataService('soporte_visitas');
                    visitaInserted = await soporteService.insert(visitaData, csrfToken);
                } catch (err) {
                    console.warn('[Ventas] Error creando visita soporte:', err);
                }

                // También crear proyecto en automatización para que aparezca en ese módulo
                const folioFn = window.folioFormats && window.folioFormats.getNextFolioAutomatizacion;
                let folioProy;
                try {
                    folioProy = folioFn ? await folioFn() : 'SP-A' + Date.now().toString(36).toUpperCase();
                } catch (e) {
                    folioProy = 'SP-A' + Date.now().toString(36).toUpperCase();
                }
                const proyectoData = {
                    folio: folioProy,
                    nombre: 'Soporte: ' + (resumenTrabajo || clienteNombre),
                    cliente: clienteNombre,
                    fecha: now.toISOString().split('T')[0],
                    vendedor: userName,
                    origen: 'soporte',
                    visita_id: visitaInserted?.id || null,
                    notas_generales: 'Visita de soporte generada desde Ventas\n\nObjetivo: ' + falla + '\n\nVisita: ' + folioVisita,
                    estado: 'pendiente',
                    avance: 0,
                    actividades: [],
                    materiales: [],
                    epicas: []
                };
                let proyectoInserted;
                try {
                    proyectoInserted = await proyectosService.insert(proyectoData, csrfToken);
                } catch (err) {
                    console.warn('[Ventas] Error creando proyecto desde soporte:', err);
                }

                if (proyectoInserted && proyectos && !proyectos.some((p) => p.id === proyectoInserted.id)) proyectos.unshift(proyectoInserted);
                compraActual = {
                    id: proyectoInserted?.id || visitaInserted?.id,
                    vinculacion: { id: proyectoInserted?.id || visitaInserted?.id, nombre: clienteNombre, tipo: 'proyecto' },
                    _origen: 'soporte'
                };
                return { folio: folioVisita, ordenId: proyectoInserted?.id || visitaInserted?.id, tipo: 'soporte', redirectTo: '/panel/pages/ssepi_proyectos.html' };
            }

            if (dept === 'Suministro') {
                let folioS = 'SP-S';
                try {
                    const folioFn = window.folioFormats && window.folioFormats.getNextFolioSuministro;
                    if (folioFn) folioS = await folioFn();
                } catch (e) { /* fallback */ }
                compraActual = { id: null, vinculacion: null, _origen: 'suministro', folio_preliminar: folioS };
                return { folio: folioS, ordenId: null, tipo: 'suministro' };
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

    async function _crearCompraVinculada(ordenFolio, ordenId, ordenTipo, clienteNombre, csrfToken) {
        try {
            const compraFolio = 'CMP-' + (ordenFolio || ordenId?.slice(-6) || Date.now().toString(36).toUpperCase());
            const compraRow = {
                folio: compraFolio,
                proveedor_id: null,
                subtotal: 0,
                iva: 0,
                total: 0,
                estado: 0,
                estatus_pago: 'Solicitud',
                notas: 'Preregistro desde Ventas para orden ' + (ordenFolio || '') + ' (' + ordenTipo + '). Esperando diagnóstico técnico.',
                vinculacion_tipo: ordenTipo,
                vinculacion_id: ordenId,
                estado_interno: 'esperando_diagnostico'
            };
            await comprasService.insert(compraRow, csrfToken);
            _addToFeed('🛒', 'Compra preregistrada (borrador): ' + compraFolio);
        } catch (e) {
            console.warn('[Ventas] Error creando compra vinculada (no crítico):', e);
        }
    }

    async function _crearFacturaVinculada(cotizacionId, folio, clienteNombre, total, csrfToken) {
        try {
            const factFolio = 'FAC-' + (folio || cotizacionId?.slice(-6) || Date.now().toString(36).toUpperCase());
            const payload = {
                folio_factura: factFolio,
                cliente: clienteNombre || 'Cliente',
                total: total || 0,
                estatus: 'borrador',
                estado: 'borrador',
                fecha_emision: new Date().toISOString()
            };
            if (cotizacionId) payload.venta_id = cotizacionId;
            await window.supabase.from('facturas').insert(payload);
            _addToFeed('🧾', 'Factura preregistrada (borrador): ' + factFolio);
        } catch (e) {
            console.warn('[Ventas] Error creando factura vinculada (no crítico):', e);
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
            gasolina: 30.00,
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
            gasolina: 30.00,
            rendimiento: 9.5,
            jornada: 9,
            diasLaborales: 20,
            utilidad: 40,
            credito: 2,
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
        ],
        // Actividades diarias - Tipos de actividad (23 tipos)
        tiposActividad: [
            "ADMINISTRACION DE PROYECTOS", "ASESORAMIENTO", "BUSQUEDA DE COMPONENTES", "COMIDA",
            "DISEÑO ELECTRICO", "DISEÑO MECANICO", "ENTRENAMIENTO", "EQUIPOS ELECTRÓNICA",
            "INCAPACIDAD", "LEVANTAMIENTO", "MANTENIMIENTO", "OTRA", "PROGRAMACION APLICACIÓN",
            "PROGRAMACION HMI", "PROGRAMACION PLC", "PROGRAMACION SERVO", "PROGRAMACION VARIADOR",
            "REPORTES", "RESPALDOS", "SOPORTE A PLANTA", "TRANSPORTE", "TXT", "VACACIONES", "HVAC"
        ],
        // Empresas / Servicios (48 empresas)
        empresas: [
            "ACEROMEX", "AFRA", "ALFAMEX", "AM", "ANTOLIN", "AVON CELAYA", "AVON LEON",
            "BACHOCO AGUASCALIENTES", "BACHOCO CELAYA", "BACHOCO LAGOS", "BADER", "BAUMANN",
            "BIOFLEX", "BIOPAPEL LEON", "BIOPAPEL TEPATITLAN", "BODYCOTE", "BOLSAS DE LOS ALTOS",
            "CALDERAS LEON", "CARTONERA DE LOS ALTOS", "CME LEON", "COLESA", "CONCURMEX",
            "DATWYLER", "DEACERO CELAYA", "DEACERO LEON", "ECOBOLSA", "EPC", "FAREVA",
            "FORVIA", "FREUDEMBERG", "HIROTAI", "HIROTEC", "KCHM", "KRABICA", "LABORATORIO GIGA",
            "MAJOSE", "MASECA", "MEXIPAC", "MR LUCKY", "NHK", "NIVEA CELAYA", "NIVEA LEON",
            "NOVATEC", "PANGEA", "POLISHAPE", "ROKY", "SEROC", "SERVICARTON", "STARCHE LION",
            "TENERIA VARGAS", "WALDASCHAFF", "WASION", "WINKELMAN", "OFICINA GIGA INDUSTRIAL",
            "COFICAB", "SERVIACERO", "COMETA", "ENERTAM", "ESECSA", "CUERO CENTRO", "ALFADRY",
            "GUILLERMO"
        ]
    };

    /** Catálogo alineado a ssepi_taller.html #inpEquipSelect */
    const CATALOGO_EQUIPOS_LAB = [
        'Tablero', 'HMI', 'PLC', 'Servos', 'Tarjeta Electrónica',
        'Sensores', 'Chillers', 'Teach Pencil', 'Otro'
    ];

    function _deptUsaEquiposMulti(dept) {
        return dept === 'Laboratorio de Electrónica' || dept === 'Taller Motores';
    }

    function _deptUsaServiciosMulti(dept) {
        return dept === 'Automatización' || dept === 'Proyectos' || dept === 'Soporte en planta';
    }

    function _getWizardEquiposSeleccionados() {
        const wrap = document.getElementById('wizardEquiposWrap');
        if (!wrap) return [];
        const list = Array.from(wrap.querySelectorAll('input[type=checkbox][data-equipo]:checked'))
            .map((b) => b.dataset.equipo)
            .filter(Boolean);
        if (list.includes('Otro')) {
            const otroTxt = (document.getElementById('wizardEquipoOtro') || {}).value?.trim() || '';
            return list.filter((e) => e !== 'Otro').concat(otroTxt ? [otroTxt] : ['Otro']);
        }
        return list;
    }

    function _getWizardServiciosSeleccionados() {
        const wrap = document.getElementById('wizardServiciosAutoWrap');
        if (!wrap) return [];
        return Array.from(wrap.querySelectorAll('input[type=checkbox][data-servicio-val]:checked'))
            .map((b) => b.dataset.servicioVal)
            .filter(Boolean);
    }

    function _wizardResolverNombreProducto(dept) {
        if (_deptUsaEquiposMulti(dept)) {
            const eq = _getWizardEquiposSeleccionados();
            return eq.length ? eq.join(', ') : '';
        }
        const vis = document.getElementById('wizardNombreProductoVisible');
        if (vis) return (vis.value || '').trim();
        return (document.getElementById('wizardNombreProducto') || {}).value?.trim() || '';
    }

    function _wizardResolverServiciosAuto() {
        const sel = _getWizardServiciosSeleccionados();
        return sel.length ? sel.join(' | ') : '';
    }

    function _syncWizardNombreProductoDesdeEquipos() {
        const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
        const np = document.getElementById('wizardNombreProducto');
        if (np && _deptUsaEquiposMulti(dept)) np.value = _wizardResolverNombreProducto(dept);
    }

    function _restoreWizardMultiSelects(f) {
        if (!f) return;
        (f.equipos || []).forEach((eq) => {
            const cb = document.querySelector('#wizardEquiposWrap input[data-equipo="' + eq.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
            if (cb) {
                cb.checked = true;
                return;
            }
            const otroCb = document.querySelector('#wizardEquiposWrap input[data-equipo="Otro"]');
            if (otroCb) {
                otroCb.checked = true;
                const ow = document.getElementById('wizardEquipoOtroWrap');
                const oi = document.getElementById('wizardEquipoOtro');
                if (ow) ow.style.display = 'block';
                if (oi) oi.value = eq === 'Otro' ? (f.equipo_otro || '') : eq;
            }
        });
        const servs = Array.isArray(f.servicios_automatizacion)
            ? f.servicios_automatizacion
            : (f.servicio_automatizacion ? String(f.servicio_automatizacion).split(' | ').map((s) => s.trim()).filter(Boolean) : []);
        servs.forEach((sv) => {
            document.querySelectorAll('#wizardServiciosAutoWrap input[data-servicio-val]').forEach((cb) => {
                if (cb.dataset.servicioVal === sv) cb.checked = true;
            });
        });
        _syncWizardNombreProductoDesdeEquipos();
    }

    function _bindWizardEquiposServiciosEvents() {
        const wrapEq = document.getElementById('wizardEquiposWrap');
        if (wrapEq && !wrapEq._ssepiBound) {
            wrapEq._ssepiBound = true;
            wrapEq.addEventListener('change', (e) => {
                const t = e.target;
                if (t && t.dataset && t.dataset.equipo === 'Otro') {
                    const ow = document.getElementById('wizardEquipoOtroWrap');
                    if (ow) ow.style.display = t.checked ? 'block' : 'none';
                }
                _syncWizardNombreProductoDesdeEquipos();
                if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
            });
        }
        const otroInp = document.getElementById('wizardEquipoOtro');
        if (otroInp && !otroInp._ssepiBound) {
            otroInp._ssepiBound = true;
            otroInp.addEventListener('input', () => {
                _syncWizardNombreProductoDesdeEquipos();
                if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
            });
        }
        const wrapSv = document.getElementById('wizardServiciosAutoWrap');
        if (wrapSv && !wrapSv._ssepiBound) {
            wrapSv._ssepiBound = true;
            wrapSv.addEventListener('change', () => {
                if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
            });
        }
    }

    async function generarFolioCotizacion() {
        const { data, error } = await window.supabase
            .from('foliador_control')
            .select('ultimo_folio')
            .eq('tipo', 'COT')
            .single();
        if (error && error.code !== 'PGRST116') {
            console.warn('[Folios] Error leyendo foliador COT:', error);
        }
        const ultimo = data?.ultimo_folio || 0;
        const nuevo = ultimo + 1;
        await window.supabase
            .from('foliador_control')
            .upsert({ tipo: 'COT', ultimo_folio: nuevo, ultimo_folio_entero: nuevo }, { onConflict: 'tipo' });
        return 'COT-' + String(nuevo).padStart(4, '0');
    }

    /**
     * Genera el siguiente folio según el tipo de departamento
     * @param {string} departamento - 'Automatización' | 'Laboratorio de Electrónica' | 'Taller Motores' | 'Proyectos' | 'Suministro'
     * @returns {Promise<string>} Folio generado
     */
    async function generarFolioPorTipo(departamento) {
        const tipoMap = {
            'Laboratorio de Electrónica': 'SP-E',
            'Taller Motores': 'SP-M',
            'Automatización': 'SP-A',
            'Proyectos': 'SP-P',
            'Suministro': 'SP-S'
        };
        const tipoFolio = tipoMap[departamento] || 'SP-' + departamento.charAt(0).toUpperCase();

        const { data, error } = await window.supabase
            .from('foliador_control')
            .select('ultimo_folio')
            .eq('tipo', tipoFolio)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.warn('[Folios] Error leyendo foliador:', error);
        }

        const ultimoFolio = data?.ultimo_folio || 0;
        const nuevoFolio = ultimoFolio + 1;

        // Actualizar el foliador
        await window.supabase
            .from('foliador_control')
            .upsert({
                tipo: tipoFolio,
                ultimo_folio: nuevoFolio,
                ultimo_folio_entero: nuevoFolio
            }, { onConflict: 'tipo' });

        switch (departamento) {
            case 'Laboratorio de Electrónica':
                // SP-E: Consecutivo simple de 4 dígitos (ej: 0742, 0843)
                return 'SP-E' + String(nuevoFolio).padStart(4, '0');

            case 'Taller Motores':
                // SP-M: SP-M[Vendedor 2 letras]-[Cliente 3 dígitos]-[Motor 2 dígitos]-[Consecutivo]
                // El vendedor y cliente se pasan como parámetros adicionales
                const perfil = await authService.getCurrentProfile();
                const iniciales = (perfil?.nombre || 'VE').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                return `SP-M${iniciales}-000-01-${String(nuevoFolio).padStart(2, '0')}`;

            case 'Automatización':
            case 'Proyectos':
                // SP-A: Folio principal + subproyecto (ej: 26139-7)
                const folioPrincipal = Math.floor(nuevoFolio / 10);
                const subProyecto = nuevoFolio % 10;
                return `SP-A${folioPrincipal}-${subProyecto || 1}`;

            case 'Suministro':
                // SP-S: Fecha YYMMDD + consecutivo si hay múltiples el mismo día
                const hoy = new Date();
                const fechaStr = hoy.getFullYear().toString().slice(-2) +
                    String(hoy.getMonth() + 1).padStart(2, '0') +
                    String(hoy.getDate()).padStart(2, '0');
                return `SP-S${fechaStr}-${String(nuevoFolio).padStart(2, '0')}`;

            default:
                return 'SP-' + nuevoFolio;
        }
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Ventas] Conectado');
        try {
            perfilUsuario = await authService.getCurrentProfile();
            applyBodyFinancialClass(perfilUsuario);
        } catch(e) {}

        // Re-aplicar visibilidad financiera al togglear admin<->normal en sesión
        document.body.addEventListener('ssepi:cost-visibility-changed', function(ev) {
            try { applyBodyFinancialClass({ rol: (ev && ev.detail && ev.detail.rol) || '' }); } catch (e) {}
        });

        // Cargar configuración de costos desde BD
        try {
            await CostosEngine.loadFromDatabase('ventas');
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
        _bindOperativasVentasPanel();
        _startClock();
        try {
            _setupRealtime();
        } catch (e) {
            console.warn('[Ventas] Realtime:', e);
        }

        // Cargar nombre del usuario actual para autofill de vendedor
        try {
            const profile = await authService.getCurrentProfile();
            if (profile && profile.nombre) currentUserName = profile.nombre;
        } catch (e) { /* ignore */ }

        // Inicializar autosave y reanudar borradores
        _initVentasAutosave();
        _tryResumeVentasDraft();
        ssepiOn(SSEPI_EVENTS.RESUME_DRAFT, (detail) => {
            if (!detail || detail.module !== 'ventas') return;
            _resumeVentasDraftKey(detail.recordKey);
        });
        window.addEventListener('beforeunload', _flushVentasAutosave);

        // Exportar funciones de folios para uso global
        _exportFunctions();

        console.log('✅ Módulo ventas iniciado');
        _initExportButton();
    }

    async function _initExportButton() {
        try {
            const profile = await authService.getCurrentProfile();
            if (!isAdminExportAllowed(profile)) return;
            createExportButton('exportCSVContainer', function() {
                const headers = [
                    { key: 'folio', label: 'Folio' },
                    { key: 'cliente_nombre', label: 'Cliente' },
                    { key: 'proyecto', label: 'Proyecto' },
                    { key: 'vendedor', label: 'Vendedor' },
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'total', label: 'Total' },
                    { key: 'estado', label: 'Estado' }
                ];
                downloadCSV('ventas_' + new Date().toISOString().slice(0,10) + '.csv', ventas, headers);
            });
        } catch (e) { console.warn('[Ventas] Export CSV init:', e); }
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
            _loadContactos(),
            _loadProyectos(),
            _loadTaller(),
            _loadMotores()
        ]);
        _populateVendedoresFilter();
        _applyFilters();
        _renderPipelineCards();

        Promise.all([
            _loadCompras(),
            _loadSuministrosVentas()
        ])
            .then(() => {
                _applyFilters();
                _renderPipelineCards();
                _renderOperativasVentasList();
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
        } catch (e) {
            try {
                cotizaciones = await cotizacionesService.select(
                    {},
                    { orderBy: 'fecha', ascending: false, page: 0, pageSize: 400 }
                ) || [];
            } catch (e2) {
                try {
                    cotizaciones = await cotizacionesService.select(
                        {},
                        { orderBy: 'fecha_creacion', ascending: false, page: 0, pageSize: 400 }
                    ) || [];
                } catch (e3) {
                    console.warn('[Ventas] Error cargando cotizaciones:', e3);
                    cotizaciones = [];
                }
            }
        }
        // Parsear notas JSON para compatibilidad con datos almacenados como JSON
        cotizaciones.forEach(c => {
            if (c.notas && typeof c.notas === 'string') {
                try {
                    const parsed = JSON.parse(c.notas);
                    Object.assign(c, parsed);
                } catch (e) { /* ignorar JSON inválido */ }
            } else if (c.notas && typeof c.notas === 'object') {
                Object.assign(c, c.notas);
            }
        });
    }

    async function _loadInventario() {
        try {
            inventario = await inventarioService.select({}, { orderBy: 'sku', ascending: true, page: 0, pageSize: 2000 }) || [];
        } catch (e) { console.warn('[Ventas] inventario:', e); inventario = []; }
    }

    async function _loadContactos() {
        /** Clientes del wizard Ventas = solo las 50 empresas del tabulador Excel oficial. */
        const normKey = (s) => (s || '').toString().toLowerCase().trim();
        let tabRows = [];
        try {
            const { data, error } = await window.supabase
                .from('clientes_tabulador')
                .select('id, nombre_cliente, km, horas_viaje, rfc, activo, precio_lab_3pct, precio_mot_3pct, precio_sum_3pct, precio_auto_venta, orden')
                .eq('activo', true)
                .order('orden', { ascending: true });
            if (!error && data) tabRows = data.filter((c) => c.activo !== false && c.nombre_cliente);
        } catch (e) { console.warn('[Ventas] clientes_tabulador:', e); }

        let contactosTab = [];
        try {
            const allContactos = await contactosService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 }) || [];
            contactosTab = allContactos.filter((c) =>
                c.es_tabulador === true || c.fuente === 'tabulador_excel_50' || (c.etiquetas || []).includes('tabulador_excel_50')
            );
        } catch (e) { console.warn('[Ventas] contactos tabulador:', e); }

        const byTab = new Map(contactosTab.map((c) => [normKey(c.empresa_tabulador || c.nombre || c.empresa), c]));

        if (tabRows.length) {
            contactos = tabRows.map((t) => {
                const nombre = (t.nombre_cliente || '').trim();
                const key = normKey(nombre);
                const c = byTab.get(key);
                const base = {
                    nombre: nombre.toUpperCase(),
                    empresa: nombre.toUpperCase(),
                    empresa_tabulador: nombre.toUpperCase(),
                    tipo: 'client',
                    tipo_ficha: 'empresa',
                    rfc: t.rfc || '',
                    km: Number(t.km) || 0,
                    horas_viaje: Number(t.horas_viaje) || 0,
                    precio_lab_3pct: t.precio_lab_3pct,
                    precio_mot_3pct: t.precio_mot_3pct,
                    precio_sum_3pct: t.precio_sum_3pct,
                    precio_auto_venta: t.precio_auto_venta,
                    es_tabulador: true,
                    _fromTabulador: true
                };
                if (c) return { ...c, ...base, id: c.id };
                return { ...base, id: 'tab-' + key.replace(/\s+/g, '-') };
            });
            console.log('[Ventas] Clientes tabulador (oficial):', contactos.length);
            return;
        }

        // Respaldo si aún no corrió seed-tabulador-50
        contactos = contactosTab.length
            ? contactosTab
            : (await contactosService.select({}, { orderBy: 'nombre', ascending: true, page: 0, pageSize: 2000 }) || [])
                .filter((c) => c.tipo === 'client' || c.tipo === 'cliente');
        console.warn('[Ventas] Sin filas en clientes_tabulador — ejecuta: node ssepinext/seed-tabulador-50.mjs --replace-contactos');
    }

    async function _loadProyectos() {
        try { proyectos = await proyectosService.select({}, { orderBy: 'fecha', ascending: false, page: 0, pageSize: 800 }) || []; } catch (e) { console.warn('[Ventas] proyectos:', e); proyectos = []; }
    }

    async function _loadTaller() {
        try {
            const raw = await tallerService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 }) || [];
            taller = filterOrdenesOperativas(raw);
        } catch (e) { console.warn('[Ventas] taller:', e); taller = []; }
    }

    async function _loadMotores() {
        try { motores = await motoresService.select({}, { orderBy: 'fecha_ingreso', ascending: false, page: 0, pageSize: 600 }) || []; } catch (e) { console.warn('[Ventas] motores:', e); motores = []; }
    }

    async function _loadCompras() {
        try {
            const compras = await comprasService.select({}, { orderBy: 'fecha_creacion', ascending: false, page: 0, pageSize: 800 }) || [];
            solicitudesTaller = compras.filter(c => c.vinculacion?.tipo === 'taller' && c.estado === 1);
            // Filtrado estricto para UI: distingue preregistro (sin items) vs esperando_cotizacion
            solicitudesTallerFiltradas = compras.filter(c =>
                c.vinculacion?.tipo === 'taller' &&
                (c.estado === 1 || c.estado === 2) &&
                (c.estado_interno === 'preregistro' || c.estado_interno === 'esperando_cotizacion')
            );
        } catch (e) {
            console.warn('[Ventas] compras:', e);
            solicitudesTaller = [];
            solicitudesTallerFiltradas = [];
        }
    }

    // ==================== TABULADOR DE COTIZACIÓN (CSV) ====================
    /**
     * Carga el tabulador de cotización desde el CSV
     * Retorna estructura: { EMPRESA, KM, LITROS, $GASOLINA, $GASOLINA2, HRS, $HR_DANI, $DANI, TOTAL }
     */
    async function _cargarTabuladorCotizacion() {
        try {
            const response = await fetch('docs/TABULADOR DE COTIZACIÓN (1).csv');
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

            const tabulador = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line === ',,,,,,,,') continue;

                // Parsear CSV considerando comillas y comas
                const values = [];
                let current = '';
                let inQuotes = false;
                for (let char of line) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim().replace(/"/g, ''));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim().replace(/"/g, ''));

                const empresa = values[0] || '';
                if (!empresa) continue;

                tabulador.push({
                    empresa: empresa,
                    km: parseFloat(values[1]) || 0,
                    litros: parseFloat(values[2]) || 0,
                    gasolina: parseFloat((values[3] || '0').replace(/[$,]/g, '')) || 0,
                    gasolina2: parseFloat((values[4] || '0').replace(/[$,]/g, '')) || 0,
                    horas: parseFloat(values[5]) || 0,
                    hrDani: parseFloat((values[6] || '0').replace(/[$,]/g, '')) || 0,
                    dani: parseFloat((values[7] || '0').replace(/[$,]/g, '')) || 0,
                    total: parseFloat((values[8] || '0').replace(/[$,]/g, '')) || 0
                });
            }
            return tabulador;
        } catch (e) {
            console.warn('[Tabulador] Error cargando CSV:', e);
            return [];
        }
    }

    /**
     * Calcula el costo final basado en el tabulador de cotización
     * @param {string} empresa - Nombre de la empresa
     * @param {number} km - Kilómetros (ida y vuelta)
     * @param {number} horas - Horas estimadas
     * @param {number} refacciones - Costo de refacciones/componentes
     * @returns {object} Desglose de costos
     */
    function _calcularCostoPorTabulador(empresa, km, horas, refacciones = 0) {
        const gasPrice = CostosEngine.CONFIG.gasolina || 24.50;
        const rendimiento = 9.5;
        const costoHoraTecnico = 104.16;

        // Calcular litros necesarios
        const litros = km / rendimiento;

        // Costos
        const gasolina = litros * gasPrice;
        const manoObra = horas * costoHoraTecnico;
        const gastosFijos = horas * (CostosEngine.CONFIG.gastosFijosHora || 124.18);
        const costoCamioneta = horas * (CostosEngine.CONFIG.camionetaHora || 39.35);

        // Subtotal
        const subtotal = gasolina + manoObra + gastosFijos + costoCamioneta + refacciones;

        // Utilidad (40% por defecto)
        const utilidad = subtotal * ((CostosEngine.CONFIG?.utilidad || 40) / 100);
        const conUtilidad = subtotal + utilidad;

        // Crédito (3% por defecto)
        const credito = conUtilidad * ((CostosEngine.CONFIG?.credito || 3) / 100);
        const antesIva = conUtilidad + credito;

        // IVA (16%)
        const iva = antesIva * 0.16;
        const total = antesIva + iva;

        return {
            empresa,
            km,
            litros: litros.toFixed(2),
            gasolina: gasolina.toFixed(2),
            horas,
            manoObra: manoObra.toFixed(2),
            gastosFijos: gastosFijos.toFixed(2),
            camioneta: costoCamioneta.toFixed(2),
            refacciones: refacciones.toFixed(2),
            subtotal: subtotal.toFixed(2),
            utilidad: utilidad.toFixed(2),
            credito: credito.toFixed(2),
            antesIva: antesIva.toFixed(2),
            iva: iva.toFixed(2),
            total: total.toFixed(2)
        };
    }

    // ==================== ACTIVIDADES DIARIAS AUTOMATIZACIÓN ====================
    /**
     * Calcula el tiempo total entre dos horas
     * @param {string} inicio - Hora inicio (HH:MM)
     * @param {string} fin - Hora fin (HH:MM)
     * @returns {string} Tiempo total formato HH:MM
     */
    function _calcularTiempoTotal(inicio, fin) {
        if (!inicio || !fin) return '00:00';

        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = fin.split(':').map(Number);

        const start = new Date(0, 0, 0, h1, m1);
        const end = new Date(0, 0, 0, h2, m2);

        let diff = end - start;
        if (diff < 0) {
            // Cruza medianoche
            end.setDate(end.getDate() + 1);
            diff = end - start;
        }

        const horas = Math.floor(diff / (1000 * 60 * 60));
        const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return String(horas).padStart(2, '0') + ':' + String(minutos).padStart(2, '0');
    }

    /**
     * Renderiza la tabla de actividades diarias para Automatización
     */
    function _renderTablaActividadesDiarias(actividades = []) {
        const tiposActividad = tabuladorAutomatizacion.tiposActividad;
        const empresas = tabuladorAutomatizacion.empresas;

        const tiposOptions = tiposActividad.map(t => `<option value="${t}">${t}</option>`).join('');
        const empresasOptions = empresas.map(e => `<option value="${e}">${e}</option>`).join('');

        let rows = '';
        actividades.forEach((act, idx) => {
            rows += `
                <tr data-idx="${idx}">
                    <td><input type="date" class="act-fecha" value="${act.fecha || ''}" style="width:120px;"></td>
                    <td>
                        <select class="act-actividad" style="width:180px;">
                            <option value="">-- Actividad --</option>
                            ${tiposOptions}
                        </select>
                    </td>
                    <td><input type="text" class="act-desc" value="${act.descripcion || ''}" style="width:200px;"></td>
                    <td>
                        <select class="act-servicio" style="width:180px;">
                            <option value="">-- Empresa --</option>
                            ${empresasOptions}
                        </select>
                    </td>
                    <td><input type="time" class="act-inicio" value="${act.inicio || '08:00'}" style="width:90px;"></td>
                    <td><input type="time" class="act-fin" value="${act.fin || '17:00'}" style="width:90px;"></td>
                    <td><input type="text" class="act-total" readonly value="${act.tiempoTotal || '08:00'}" style="width:70px; background:#f5f5f5;"></td>
                    <td><input type="number" class="act-extras" value="${act.extras || 0}" min="0" step="0.5" style="width:60px;"></td>
                    <td><button class="btn-trash" onclick="ventasModule._eliminarActividad(${idx})"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        });

        return rows;
    }

    /**
     * Agrega una nueva fila de actividad diaria
     */
    function _agregarActividadDiaria() {
        const tbody = document.getElementById('tablaActividadesBody');
        if (!tbody) return;

        const idx = actividadesDiarias.length;
        actividadesDiarias.push({
            fecha: new Date().toISOString().split('T')[0],
            actividad: '',
            descripcion: '',
            servicio: '',
            inicio: '08:00',
            fin: '17:00',
            tiempoTotal: '08:00',
            extras: 0
        });

        _renderTablaActividadesDiarias(actividadesDiarias);
        _attachActividadesEvents();
    }

    /**
     * Elimina una actividad de la lista
     */
    function _eliminarActividad(idx) {
        if (idx >= 0 && idx < actividadesDiarias.length) {
            actividadesDiarias.splice(idx, 1);
            _renderTablaActividadesDiarias(actividadesDiarias);
            _attachActividadesEvents();
        }
    }

    /**
     * Adjunta eventos para cálculo automático de tiempo
     */
    function _attachActividadesEvents() {
        document.querySelectorAll('#tablaActividadesBody tr').forEach(tr => {
            const inicioInput = tr.querySelector('.act-inicio');
            const finInput = tr.querySelector('.act-fin');
            const totalInput = tr.querySelector('.act-total');

            if (inicioInput && finInput && totalInput) {
                const calcTime = () => {
                    totalInput.value = _calcularTiempoTotal(inicioInput.value, finInput.value);
                };
                inicioInput.addEventListener('change', calcTime);
                finInput.addEventListener('change', calcTime);
            }
        });
    }

    /**
     * Exporta la bitácora de actividades a CSV
     */
    function _exportarBitacoraCSV() {
        if (actividadesDiarias.length === 0) {
            _showToast('No hay actividades para exportar', 'warning');
            return;
        }

        const perfil = authService.getCurrentProfile();
        const empleadoNombre = perfil?.nombre || 'EMPLEADO';
        const empleadoId = perfil?.id || '00';

        // Encabezados del CSV
        let csv = 'N. EMPLEADO,NOMBRE EMPLEADO,FECHA,ACTIVIDAD,DESCRIPCION,SERVICIO,INICIO,FIN,TIEMPO TOTAL,EXTRAS\n';

        // Filas de actividades
        actividadesDiarias.forEach(act => {
            const tiempoTotal = _calcularTiempoTotal(act.inicio || '08:00', act.fin || '17:00');
            const row = [
                empleadoId,
                `"${empleadoNombre}"`,
                act.fecha || '',
                `"${act.actividad || ''}"`,
                `"${act.descripcion || ''}"`,
                `"${act.servicio || ''}"`,
                act.inicio || '08:00',
                act.fin || '17:00',
                tiempoTotal,
                act.extras || 0
            ].join(',');
            csv += row + '\n';
        });

        // Crear blob y descargar
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const fechaStr = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `bitacora_${empleadoId}_${fechaStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        _showToast('Bitácora exportada correctamente', 'success');
    }

    /**
     * Exporta funciones para uso desde HTML
     */
    function _exportFunctions() {
        window.folioFormats = window.folioFormats || {};
        window.folioFormats.generarFolioPorTipo = generarFolioPorTipo;
        window.folioFormats.getNextFolioLaboratorio = () => generarFolioPorTipo('Laboratorio de Electrónica');
        window.folioFormats.getNextFolioMotores = () => generarFolioPorTipo('Taller Motores');
        window.folioFormats.getNextFolioAutomatizacion = () => generarFolioPorTipo('Automatización');

        // Exportar funciones de bitácora
        window.ventasModule = window.ventasModule || {};
        window.ventasModule._exportarBitacoraCSV = _exportarBitacoraCSV;
        window.ventasModule._agregarActividadDiaria = _agregarActividadDiaria;
        window.ventasModule._eliminarActividad = _eliminarActividad;
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
     * Delegado a state-machine.js para deduplicación y unificación.
     * @param {string} tipo - 'cotizacion' | 'venta' | 'taller' | 'motor' | 'proyecto'
     * @param {string} id - ID del registro
     * @param {string} evento - Tipo de evento: 'creacion', 'cambio_estado', 'folio_generado', 'compra_vinculada', etc.
     * @param {string} descripcion - Descripción legible del evento
     * @param {string} csrfToken - Token de autenticación
     */
    async function _insertarEventoHistorial(tipo, id, evento, descripcion, csrfToken) {
        if (!window.supabase) return null;
        try {
            const data = await window.SSEPIStateMachine.actualizarEstadoOrden(
                window.supabase, tipo, id, evento, descripcion, csrfToken
            );
            if (data) {
                console.log(`[Ventas] Evento registrado en historial: ${evento} para ${tipo} ${id}`);
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
                    _renderPipelineCards();
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
                _renderPipelineCards();
            })
            .subscribe();
        subscriptions.push(subCompras);

        // Realtime para ordenes_taller (sincronización con Ventas)
        const subTaller = supabase
            .channel('taller_realtime_ventas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_taller' }, payload => {
                _loadTaller().then(() => {
                    _renderPipelineCards();
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
                    _renderPipelineCards();
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
                    _renderPipelineCards();
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
                        const tipo = nueva.cotizacion_id ? 'cotizacion' : nueva.orden_taller_id ? 'taller' : nueva.orden_motor_id ? 'motor' : 'proyecto';
                        _mostrarHistorial(idAfectado, tipo);
                    }
                }
            })
            .subscribe();
        subscriptions.push(subHistorial);

        // Realtime para notificaciones (avisos de técnicos y compras)
        const subNotif = supabase
            .channel('notificaciones_ventas')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.ventas' }, payload => {
                const notif = payload.new || {};
                _addToFeed('🔔', notif.mensaje || 'Nueva notificación');
                if (notif.tipo === 'trabajo_terminado') {
                    _showToast('✅ ' + (notif.mensaje || 'Trabajo terminado. Proceda a facturar/entregar.'), 'success');
                } else if (notif.tipo === 'diagnostico_completado') {
                    _showToast('🔧 ' + (notif.mensaje || 'Diagnóstico completado. Calcule cotización.'), 'info');
                } else if (notif.tipo === 'esperando_cotizacion_compras') {
                    _showToast('📋 Compras envió cotización de refacciones. Revísela.', 'info');
                }
                _loadCotizaciones();
                _renderPipelineCards();
                _applyFilters();
            })
            .subscribe();
        subscriptions.push(subNotif);
    }

    // ==================== FILTROS Y VISTAS ====================
    /** Une ventas + cotizaciones marcando tipo para no mezclar órdenes operativas con el flujo comercial. */
    function _mergeVentasCotizaciones() {
        const v = (Array.isArray(ventas) ? ventas : []).map((r) => ({ ...r, tipo: r.tipo || 'venta' }));
        const c = (Array.isArray(cotizaciones) ? cotizaciones : []).map((r) => ({ ...r, tipo: 'cotizacion' }));
        return [...v, ...c];
    }

    /** Compara solo la fecha local. Órdenes de venta terminadas siempre visibles (no las oculta el filtro de mes). */
    function _fechaItemEnRango(item) {
        if (!filtroFechaInicio || !filtroFechaFin) return true;
        if (item.tipo === 'cotizacion' && _estadoKanbanEfectivo(item) === 'entregado') return true;
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

        // Excluir registros de Suministros del pipeline general (tienen su propia pestaña)
        filtered = filtered.filter(item => {
            if (item.departamento === 'Suministro') return false;
            if (item.tipo === 'suministro' || item.origen === 'suministro' || item.modulo_origen === 'suministros') return false;
            return true;
        });

        // Filtrar canceladas por defecto (solo mostrar si mostrarCanceladas === true)
        if (!mostrarCanceladas) {
            filtered = filtered.filter(item => {
                const estado = String(item.estado || item.estatus_pago || '').toLowerCase();
                return estado !== 'cancelado' && estado !== 'cancelada';
            });
        }

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
            } else if (filtroEstado === 'esperando_confirmacion') {
                filtered = filtered.filter(item => item.estado === 'esperando_confirmacion' || item.estado === 'esperando_confirmacion_cliente' || item.estado === 'pendiente_confirmacion');
            } else if (filtroEstado === 'confirmado') {
                filtered = filtered.filter(item => item.estado === 'confirmado' || item.estado === 'confirmada_por_cliente');
            } else if (filtroEstado === 'autorizado') {
                filtered = filtered.filter(item => {
                    const ef = _estadoKanbanEfectivo(item);
                    return ef !== 'entregado' && ['autorizado', 'autorizada_por_ventas', 'autorizada'].includes(String(item.estado || '').toLowerCase());
                });
            } else if (filtroEstado === 'compra') {
                filtered = filtered.filter(item => item.estado === 'compra' || item.estado === 'en_compra');
            } else if (filtroEstado === 'ejecucion') {
                filtered = filtered.filter(item => item.estado === 'ejecucion' || item.estado === 'en_ejecucion');
            } else if (filtroEstado === 'entregado') {
                filtered = filtered.filter(item => {
                    const ef = _estadoKanbanEfectivo(item);
                    return ef === 'entregado' || ef === 'completado' || ef === 'cerrado'
                        || (item.tipo !== 'cotizacion' && item.estatus_pago === 'Pendiente');
                });
            } else if (filtroEstado === 'pagado') {
                filtered = filtered.filter(item => item.estatus_pago === 'Pagado' || item.estado === 'pagado');
            } else if (filtroEstado === 'cancelado') {
                filtered = filtered.filter(item => {
                    const estado = String(item.estado || item.estatus_pago || '').toLowerCase();
                    return estado === 'cancelado' || estado === 'cancelada';
                });
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
            const soloCot = filtered.filter((i) => i.tipo === 'cotizacion');
            _renderKanban(soloCot);
        } else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        // Renderizar Historia Comercial (unificada con todos los módulos)
        _renderHistoriaComercial();

        _updateKPIs(filtered);
    }

    function _syncChipEstado() {
        document.querySelectorAll('.chip-filtro').forEach(function (chip) {
            var estado = chip.getAttribute('data-estado');
            if (estado === filtroEstado) chip.classList.add('active');
            else chip.classList.remove('active');
        });
    }

    function _operativaEstaTerminada(estado) {
        const s = String(estado || '').toLowerCase().trim();
        return ['completado', 'terminado', 'entregado', 'cerrado', 'reparado', 'reparado / listo', 'listo para facturar', 'completada'].includes(s)
            || /completad|entregad|terminad/.test(s);
    }

    function _matchOperativaId(row, id) {
        if (!row || id == null) return false;
        const sid = String(id);
        return String(row.id) === sid || String(row.local_id) === sid;
    }

    function _ordenOperativaPorCotizacion(cot) {
        if (!cot) return null;
        const orig = String(cot.origen || cot.departamento || '').toLowerCase();
        const byId = (list, id) => (list || []).find((o) => _matchOperativaId(o, id)) || null;
        if (cot.orden_origen_id) {
            const id = String(cot.orden_origen_id);
            if (/taller|laboratorio|electr/.test(orig)) return byId(taller, id);
            if (/motor/.test(orig)) return byId(motores, id);
            if (/automat|proyecto|soporte/.test(orig)) return byId(proyectos, id);
            return byId(proyectos, id) || byId(motores, id) || byId(taller, id);
        }
        const folioOp = cot.cerebro_registro?.folio_operativo;
        if (folioOp) {
            return (proyectos || []).find((p) => p.folio === folioOp)
                || (motores || []).find((p) => p.folio === folioOp)
                || (taller || []).find((p) => p.folio === folioOp)
                || null;
        }
        return null;
    }

    /** Cotización / orden de venta vinculada a operativa (servicios + materiales + desglose). */
    function _cotizacionPorOperativa(operativaId, folioOperativo) {
        return (cotizaciones || []).find((c) => {
            if (operativaId != null && String(c.orden_origen_id) === String(operativaId)) return true;
            if (folioOperativo && c.cerebro_registro?.folio_operativo === folioOperativo) return true;
            return false;
        }) || null;
    }

    function _resumenOrdenVenta(item) {
        if (!item || item.tipo !== 'cotizacion') return '';
        const items = Array.isArray(item.items) ? item.items : [];
        const partes = [];
        const tieneServicios = items.some((i) => /servicio|ingenier|traslado|gasolina|horas|actividad/i.test(String(i.descripcion || i.nombre || '')))
            || !!(item.costo_desglose && Object.keys(item.costo_desglose).length);
        const nMat = items.filter((i) => !/servicio|ingenier/i.test(String(i.descripcion || i.nombre || ''))).length;
        if (tieneServicios) partes.push('Servicios');
        if (nMat > 0) partes.push(nMat + ' concepto' + (nMat > 1 ? 's' : ''));
        if (item.km_distancia || item.costo_traslado) partes.push('Traslado');
        return partes.length ? partes.join(' · ') : 'Orden de venta';
    }

    /** Estado efectivo en Kanban: si la orden Lab/Motor/Auto está terminada → columna Terminado. */
    function _estadoKanbanEfectivo(item) {
        const raw = String(item.estado || item.estatus_pago || '').trim().toLowerCase();
        if (item.tipo === 'cotizacion') {
            const ord = _ordenOperativaPorCotizacion(item);
            if (ord && _operativaEstaTerminada(ord.estado)) return 'entregado';
        }
        if (_operativaEstaTerminada(raw)) return 'entregado';
        return raw;
    }

    function _estadoVentasDisplay(item) {
        const ef = _estadoKanbanEfectivo(item);
        if (ef === 'entregado') return 'Terminado';
        if (['autorizado', 'autorizada', 'autorizada_por_ventas'].includes(ef)) return 'Autorizado';
        return item.estado || item.estatus_pago || 'Pendiente';
    }

    function _labelEstadoOperativaVentas(st) {
        const s = String(st || '').toLowerCase().trim();
        if (_operativaEstaTerminada(s)) return 'Terminado';
        return st || '—';
    }

    async function _renderKanban(items) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;

        const es = (i) => _estadoKanbanEfectivo(i);
        const registro = items.filter((i) => es(i) === 'registro' || es(i) === 'nuevo' || es(i) === 'borrador');
        const diagnostico = items.filter((i) => es(i) === 'diagnostico' || es(i) === 'en_diagnostico');
        const cotizacion = items.filter((i) => es(i) === 'cotizacion' || es(i) === 'pendiente_autorizacion_ventas');
        const esperandoConfirmacion = items.filter((i) => es(i) === 'esperando_confirmacion' || es(i) === 'esperando_confirmacion_cliente' || es(i) === 'pendiente_confirmacion');
        const confirmado = items.filter((i) => es(i) === 'confirmado' || es(i) === 'confirmada_por_cliente');
        const autorizado = items.filter((i) => ['autorizado', 'autorizada_por_ventas', 'autorizada'].includes(es(i)));
        const compra = items.filter((i) => es(i) === 'compra' || es(i) === 'en_compra');
        const ejecucion = items.filter((i) => es(i) === 'ejecucion' || es(i) === 'en_ejecucion' || es(i) === 'en ejecución' || es(i) === 'progreso');
        const entregado = items.filter((i) => es(i) === 'entregado' || es(i) === 'completado' || es(i) === 'cerrado' || (i.tipo !== 'cotizacion' && i.estatus_pago === 'Pendiente'));
        const pagado = items.filter((i) => i.estatus_pago === 'Pagado' || es(i) === 'pagado');

        // Renderizar tarjetas asíncronamente para cargar folios vinculados
        const [cardsRegistro, cardsDiagnostico, cardsCotizacion, cardsEsperaConfirmacion, cardsConfirmado, cardsAutorizado, cardsCompra, cardsEjecucion, cardsEntregado, cardsPagado] = await Promise.all([
            _renderKanbanCardsAsync(registro),
            _renderKanbanCardsAsync(diagnostico),
            _renderKanbanCardsAsync(cotizacion),
            _renderKanbanCardsAsync(esperandoConfirmacion),
            _renderKanbanCardsAsync(confirmado),
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
                <div class="kanban-header" style="border-bottom-color: #ab47bc;">
                    <span>Esperando Confirmación</span>
                    <span class="badge" style="background: #ab47bc;">${esperandoConfirmacion.length}</span>
                </div>
                <div class="kanban-cards">${cardsEsperaConfirmacion}</div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #66bb6a;">
                    <span>Confirmado</span>
                    <span class="badge" style="background: #66bb6a;">${confirmado.length}</span>
                </div>
                <div class="kanban-cards">${cardsConfirmado}</div>
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
                    <span>Terminado</span>
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
     * Obtiene el folio de la orden operativa vinculada a una cotización.
     * Busca en taller, motores o proyectos según el origen.
     */
    async function _getFolioOrdenVinculada(cotizacion) {
        if (!cotizacion.orden_origen_id || !window.supabase) return null;

        try {
            // Intentar en ordenes_taller
            if (cotizacion.origen === 'taller') {
                const { data } = await window.supabase
                    .from('ordenes_taller')
                    .select('folio')
                    .eq('id', cotizacion.orden_origen_id)
                    .maybeSingle();
                if (data?.folio) return { tipo: 'taller', folio: data.folio };
            }

            // Intentar en ordenes_motores
            if (cotizacion.origen === 'motor' || cotizacion.origen === 'motores') {
                const { data } = await window.supabase
                    .from('ordenes_motores')
                    .select('folio')
                    .eq('id', cotizacion.orden_origen_id)
                    .maybeSingle();
                if (data?.folio) return { tipo: 'motor', folio: data.folio };
            }

            // Intentar en proyectos_automatizacion
            if (cotizacion.origen === 'automatizacion' || cotizacion.origen === 'proyecto' || cotizacion.origen === 'proyectos' || cotizacion.origen === 'soporte') {
                const { data } = await window.supabase
                    .from('proyectos_automatizacion')
                    .select('folio')
                    .eq('id', cotizacion.orden_origen_id)
                    .maybeSingle();
                if (data?.folio) return { tipo: 'proyecto', folio: data.folio };
            }

            // Búsqueda genérica si no hay origen claro
            for (const tabla of ['ordenes_taller', 'ordenes_motores', 'proyectos_automatizacion']) {
                const { data } = await window.supabase
                    .from(tabla)
                    .select('folio')
                    .eq('id', cotizacion.orden_origen_id)
                    .maybeSingle();
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
        const esAdminV = _verFinanciero();
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

        return items.map((item, idx) => {
            const folioVinculado = foliosVinculados[idx];
            const ordOp = item.tipo === 'cotizacion' ? _ordenOperativaPorCotizacion(item) : null;
            const terminadoBadge = ordOp && _operativaEstaTerminada(ordOp.estado)
                ? `<div class="vinculacion-badge" style="background:#e0f7fa;color:#006064;" title="Ejecución terminada en ${ordOp.folio || 'operativa'}">
                    <span>✅</span> Terminado · ${ordOp.folio || ''}
                   </div>`
                : '';
            const resumenOv = item.tipo === 'cotizacion' ? _resumenOrdenVenta(item) : '';
            const resumenHtml = resumenOv
                ? `<div class="op-meta" style="font-size:11px;color:var(--text-muted);margin-top:4px;">Orden venta: ${resumenOv}</div>`
                : '';
            const etiquetaHtml = folioVinculado
                ? `<div class="vinculacion-badge" title="Orden creada en ${etiquetas[folioVinculado.tipo]}: ${folioVinculado.folio}">
                    <span>${iconos[folioVinculado.tipo]}</span> ${etiquetas[folioVinculado.tipo]}: ${folioVinculado.folio}
                   </div>`
                : '';
            const esCancelado = (item.estado || item.estatus_pago || '').toLowerCase().includes('cancelad');
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(item);
            const puedeBorrar = window.SSEPIStateMachine?.puedeEliminar(item) ?? true;
            const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';

            return `
                <div class="kanban-card ${esCancelado ? 'kanban-card-cancelada' : ''} ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${item.id}" data-tipo="${item.tipo || 'venta'}">
                    <div class="card-header">
                        <span class="folio">${item.folio || item.id.slice(-6)}</span>
                        ${badgeCuarentena}
                        <div class="card-actions">
                            <button class="btn-icon btn-edit" onclick="event.stopPropagation(); ventasModule._editarVenta('${item.id}', '${item.tipo || 'venta'}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${puedeBorrar ? `<button class="btn-icon btn-delete" onclick="event.stopPropagation(); ventasModule._eliminarVenta('${item.id}', '${item.tipo || 'venta'}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                    </div>
                    ${terminadoBadge ? `<div class="card-vinculacion">${terminadoBadge}</div>` : ''}
                    ${etiquetaHtml ? `<div class="card-vinculacion">${etiquetaHtml}</div>` : ''}
                    <div class="card-body" onclick="ventasModule._abrirDetalle('${item.id}', '${item.tipo || 'venta'}')" style="cursor:pointer;">
                        <div class="cliente">${item.cliente_nombre || item.cliente || 'Cliente'}</div>
                        ${resumenHtml}
                        ${esAdminV ? `<div class="total">$${(item.total || 0).toFixed(2)}</div>` : ''}
                    </div>
                    <div class="card-footer">
                        <small>${item.fecha_cotizacion || item.fecha || item.fecha_creacion ? new Date(item.fecha_cotizacion || item.fecha || item.fecha_creacion).toLocaleDateString() : ''}</small>
                        <small>${_estadoVentasDisplay(item)}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _renderKanbanCards(items) {
        const esAdminV = _verFinanciero();
        // Wrapper síncrono para compatibilidad - se llama desde _renderKanban
        // Para versión con folios vinculados, usar _renderKanbanCardsAsync
        if (items.length === 0) return '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin elementos</div>';
        return items.map(item => {
            const esCancelado = (item.estado || item.estatus_pago || '').toLowerCase().includes('cancelad');
            const enCuarentena = window.SSEPIStateMachine?.estaEnCuarentena(item);
            const puedeBorrar = window.SSEPIStateMachine?.puedeEliminar(item) ?? true;
            const badgeCuarentena = enCuarentena ? window.SSEPIStateMachine.badgeCuarentenaHTML() : '';
            return `
                <div class="kanban-card ${esCancelado ? 'kanban-card-cancelada' : ''} ${enCuarentena ? 'card-cuarentena' : ''}" data-id="${item.id}" data-tipo="${item.tipo || 'venta'}">
                    <div class="card-header">
                        <span class="folio">${item.folio || item.id.slice(-6)}</span>
                        ${badgeCuarentena}
                        <div class="card-actions">
                            <button class="btn-icon btn-edit" onclick="event.stopPropagation(); ventasModule._editarVenta('${item.id}', '${item.tipo || 'venta'}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${puedeBorrar ? `<button class="btn-icon btn-delete" onclick="event.stopPropagation(); ventasModule._eliminarVenta('${item.id}', '${item.tipo || 'venta'}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                    </div>
                    <div class="card-body" onclick="ventasModule._abrirDetalle('${item.id}', '${item.tipo || 'venta'}')" style="cursor:pointer;">
                        <div class="cliente">${item.cliente_nombre || item.cliente || 'Cliente'}</div>
                        ${esAdminV ? `<div class="total">$${(item.total || 0).toFixed(2)}</div>` : ''}
                    </div>
                    <div class="card-footer">
                        <small>${item.fecha_cotizacion || item.fecha || item.fecha_creacion ? new Date(item.fecha_cotizacion || item.fecha || item.fecha_creacion).toLocaleDateString() : ''}</small>
                        <small>${item.vendedor || ''}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _renderLista(items) {
        const esAdminV = _verFinanciero();
        const tbody = document.getElementById('tablaVentasBody');
        if (!tbody) return;
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay registros</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(item => {
            const fecha = item.fecha_cotizacion || item.fecha || item.fecha_creacion ? new Date(item.fecha_cotizacion || item.fecha || item.fecha_creacion).toLocaleDateString('es-MX') : '--/--/----';
            const folio = item.folio || item.id.slice(-6);
            const cliente = item.cliente_nombre || item.cliente || 'N/A';
            const tipo = item.tipo === 'cotizacion' ? 'Cotización' : 'Venta';
            const estatus = item.tipo === 'cotizacion' ? _estadoVentasDisplay(item) : (item.estatus_pago || 'Pendiente');
            const total = item.total || 0;
            let estatusClass = '';
            if (estatus === 'Pagado') estatusClass = 'status-pagado';
            else if (estatus === 'Pendiente') estatusClass = 'status-pendiente';
            else if (estatus === 'Terminado') estatusClass = 'status-pagado';
            else if (item.tipo === 'cotizacion') estatusClass = 'status-cotizacion';
            return `
                <tr onclick="ventasModule._abrirDetalle('${item.id}', '${item.tipo || 'venta'}')">
                    <td>${fecha}</td>
                    <td><strong>${folio}</strong></td>
                    <td>${cliente}</td>
                    <td>${tipo}</td>
                    <td><span class="status-badge ${estatusClass}">${estatus}</span></td>
                    <td>${esAdminV ? '$' + total.toFixed(2) : '—'}</td>
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

    // ==================== SUMINISTROS ====================
    async function _loadSuministrosVentas() {
        try {
            const { data, error } = await window.supabase
                .from('cotizaciones')
                .select('*')
                .or('departamento.eq.Suministro,origen.eq.suministro')
                .order('created_at', { ascending: false });
            if (error) throw error;
            suministrosVentas = data || [];
        } catch (e) {
            console.warn('[Ventas] Error cargando Suministros:', e);
            suministrosVentas = [];
        }
    }

    function _renderSuministros() {
        const tbody = document.getElementById('suministrosTableBody');
        if (!tbody) return;
        if (!suministrosVentas || suministrosVentas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">Sin cotizaciones de Suministros</td></tr>';
            return;
        }
        tbody.innerHTML = suministrosVentas.map(item => {
            const data = item.data || item;
            const estado = data.estado || 'registro';
            const origen = data.vinculacion?.folio || '—';
            const esperando = ['registrado', 'esperando_cotizacion', 'cotizado', 'en_compra'].includes(estado);
            const confirmado = ['confirmado', 'compra'].includes(estado);
            const facturado = ['pagado', 'facturado'].includes(estado);
            return `<tr>
                <td><strong>${data.folio || '—'}</strong></td>
                <td>${data.cliente || data.cliente_nombre || '—'}</td>
                <td>$${(data.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td><span class="status-badge status-${estatus}">${estado}</span></td>
                <td>${origen}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="ventasModule._verPDFSuministro('${item.id}')" title="Ver PDF"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-primary" onclick="ventasModule._descargarPDFSuministro('${item.id}')" title="Descargar PDF"><i class="fas fa-download"></i></button>
                    ${esperando ? `
                    <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); ventasModule._confirmarCompraSuministro('${item.id}')" title="Cliente Confirmó"><i class="fas fa-check-circle"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); ventasModule._clienteCanceloSuministro('${item.id}')" title="Cliente Canceló"><i class="fas fa-times-circle"></i></button>` : ''}
                    ${confirmado ? `
                    <button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); ventasModule._enviarAFacturacionSuministro('${item.id}')" title="Enviar a Facturación"><i class="fas fa-file-invoice"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    }

    async function _verPDFSuministro(id) {
        await _generarPDFSuministro(id, true);
    }

    async function _descargarPDFSuministro(id) {
        await _generarPDFSuministro(id, false);
    }

    async function _generarPDFSuministro(id, preview) {
        const item = suministrosVentas.find(s => _idsMatch(s.id, id));
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        const data = item.data || item;
        const comps = data.componentes || data.items || [];
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            const conceptos = comps.map(c => ({
                cantidad: c.cantidad,
                descripcion: c.descripcion || c.codigo || '',
                precio: c.precio_venta_unitario || c.precio_unitario || 0,
                subtotal: c.subtotal_venta || c.importe || c.subtotal || 0
            }));
            await pdfGenerator.generateCotizacion({
                folio: data.folio,
                cliente: data.cliente || data.cliente_nombre || 'Cliente',
                departamento: 'Compras',
                conceptos,
                subtotal: data.subtotal || 0,
                iva: data.iva || 0,
                total: data.total || 0
            }, user, preview);
            if (!preview) _showToast(`PDF ${data.folio} descargado`, 'success');
        } catch (err) {
            console.error('[Ventas] Error PDF Suministro:', err);
            _showToast('Error al generar PDF: ' + (err.message || err), 'error');
        }
    }

    async function _confirmarCompraSuministro(id) {
        const item = suministrosVentas.find(s => _idsMatch(s.id, id));
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        const data = item.data || item;
        const compraId = data.vinculacion?.id;
        if (!compraId) { _showToast('No hay compra vinculada', 'warning'); return; }
        if (!confirm('¿El cliente confirmó la cotización de suministros? Se notificará a Compras para proceder con la entrega.')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const comprasService = createDataService('compras');
            const compra = await comprasService.getById(compraId);
            if (!compra) { _showToast('Compra vinculada no encontrada', 'error'); return; }
            if (compra.estado >= 3) { _showToast('La compra ya está confirmada', 'info'); return; }

            const pasos = Array.isArray(compra.pasos) ? [...compra.pasos] : [];
            pasos.push({
                paso: pasos.length + 1,
                fecha: new Date().toISOString(),
                usuario: currentUserName || 'Sistema',
                accion: 'Cliente confirmó - Ventas (Suministros)'
            });
            await comprasService.update(compraId, { estado: 3, pasos }, csrfToken);

            await cotizacionesService.update(id, {
                estado: 'confirmado',
                confirmacion_cliente: 'confirmado',
                fecha_confirmacion_cliente: new Date().toISOString()
            }, csrfToken);
            data.estado = 'confirmado';
            _showToast('Cliente confirmó. Enviada a Compras para ejecución.', 'success');
            _addToFeed('✅', `Compra ${compra.folio} confirmada por cliente desde Ventas/Suministros`);
            _renderSuministros();
        } catch (e) {
            console.error('[Ventas] Error confirmando compra:', e);
            _showToast('Error al confirmar compra: ' + (e.message || e), 'error');
        }
    }

    async function _enviarAFacturacionSuministro(id) {
        const item = suministrosVentas.find(s => _idsMatch(s.id, id));
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        const data = item.data || item;
        try {
            await _crearFacturaVinculada(id, data.folio, data.cliente || data.cliente_nombre, data.total);
            await cotizacionesService.update(id, { estado: 'pagado', estatus_pago: 'Pagado', facturado: true });
            data.estado = 'pagado';
            data.estatus_pago = 'Pagado';
            data.facturado = true;
            _showToast('Enviado a Facturación correctamente', 'success');
            _addToFeed('🧾', `Factura vinculada para ${data.folio}`);
            _renderSuministros();
        } catch (e) {
            console.error('[Ventas] Error enviando a facturación:', e);
            _showToast('Error al enviar a facturación: ' + (e.message || e), 'error');
        }
    }

    async function _clienteCanceloSuministro(id) {
        const item = suministrosVentas.find(s => _idsMatch(s.id, id));
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        const motivo = prompt('Motivo de cancelación (opcional):') || '';
        if (!confirm('¿El cliente canceló la cotización de suministros? Se cerrará la orden.')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const data = item.data || item;
            const compraId = data.vinculacion?.id;
            // Cancelar compra vinculada si existe
            if (compraId) {
                try {
                    const comprasService = createDataService('compras');
                    await comprasService.update(compraId, { estado: 0, estado_interno: 'cancelado' }, csrfToken);
                } catch (e) { console.warn('[Ventas] Error cancelando compra vinculada:', e); }
            }
            await cotizacionesService.update(id, {
                estado: 'cancelado',
                confirmacion_cliente: 'cancelado',
                motivo_cancelacion: motivo,
                fecha_confirmacion_cliente: new Date().toISOString()
            }, csrfToken);
            data.estado = 'cancelado';
            _showToast('Cotización de suministros cancelada.', 'warning');
            _addToFeed('❌', `Suministro ${data.folio} cancelado por cliente`);
            _renderSuministros();
        } catch (e) {
            console.error('[Ventas] Error cancelando suministro:', e);
            _showToast('Error al cancelar: ' + (e.message || e), 'error');
        }
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
        const esAdminV = _verFinanciero();
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
        if (elTotalVentas) elTotalVentas.innerHTML = esAdminV ? '$' + totalVentasDinero.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—';
        if (elCotizPend) elCotizPend.innerText = cotizacionesPendientesCount;
        if (elMargen) elMargen.innerHTML = esAdminV ? margenObjetivo + '%' : '—';
        if (elTicket) elTicket.innerHTML = countVentasCerradas && esAdminV ? '$' + ticketPromedio.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—';
    }

    function _pipelineRowForVentas(row, tabla, tipoUi) {
        const sm = window.SSEPIStateMachine;
        let estatus_actual = row.estatus_actual;
        if (!estatus_actual && sm && typeof sm.derivarEstatusActualDesdeNativo === 'function') {
            estatus_actual = sm.derivarEstatusActualDesdeNativo(tabla, row);
        }
        return { ...row, tipo: row.tipo || tipoUi, estatus_actual: estatus_actual || null };
    }

    // ==================== PIPELINE CARDS (reemplaza solicitudes pendientes) ====================
    function _renderPipelineCards() {
        const container = document.getElementById('pipelineCardsContainer');
        if (!container) return;
        const merged = [
            ...ventas.map((v) => _pipelineRowForVentas(v, 'ventas', 'venta')),
            ...cotizaciones.map((c) => _pipelineRowForVentas({ ...c, tipo: 'cotizacion' }, 'cotizaciones', 'cotizacion')),
            ...taller.map((o) => _pipelineRowForVentas(o, 'ordenes_taller', 'taller')),
            ...motores.map((o) => _pipelineRowForVentas(o, 'ordenes_motores', 'motor')),
            ...proyectos.map((p) => _pipelineRowForVentas(p, 'proyectos_automatizacion', 'proyecto'))
        ];
        const ordenes = merged
            .filter((o) => o.estatus_actual && o.estatus_actual !== 'entrega' && o.estatus_actual !== 'cancelado')
            .sort((a, b) => new Date(b.created_at || b.creado_en || 0) - new Date(a.created_at || a.creado_en || 0))
            .slice(0, 20);
        if (ordenes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay órdenes activas en pipeline</div>';
            return;
        }
        container.innerHTML = ordenes.map(o => {
            const info = SSEPIStateMachine.obtenerInfoPaso(o.estatus_actual);
            return `
            <div class="pipeline-card" data-active-step="${o.estatus_actual}" onclick="ventasModule._abrirDetalle('${o.id}', '${o.tipo || 'venta'}')" title="Abrir registro">
                <div class="pipeline-card-header">
                    <span class="pipeline-card-folio">${o.folio || o.id?.slice(-6)}</span>
                    <span class="pipeline-card-step active" style="background:${info.color};color:#fff;">${info.icono} ${info.label}</span>
                </div>
                <div class="pipeline-card-cliente">${o.cliente || o.cliente_nombre || 'Cliente'}</div>
                <div class="pipeline-card-meta">
                    <span>${o.departamento || info.modulo}</span>
                    <span>$${(o.total || 0).toFixed(2)}</span>
                </div>
            </div>`;
        }).join('');
    }

    function _operativaVigenteVentas(row) {
        const s = String(row.estado || '').toLowerCase();
        return !s.includes('cancel');
    }

    function _bindOperativasVentasPanel() {
        const host = document.getElementById('operativasTabsVentas');
        if (!host) return;
        host.querySelectorAll('button[data-op-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                operativasTabVentas = btn.getAttribute('data-op-tab') || 'taller';
                host.querySelectorAll('button[data-op-tab]').forEach(function (b) {
                    b.classList.toggle('active', b.getAttribute('data-op-tab') === operativasTabVentas);
                });
                _renderOperativasVentasList();
            });
        });
    }

    function _renderOperativasVentasList() {
        const list = document.getElementById('operativasListVentas');
        if (!list) return;
        const nt = (taller || []).filter(_operativaVigenteVentas).length;
        const nm = (motores || []).filter(_operativaVigenteVentas).length;
        const np = (proyectos || []).filter(_operativaVigenteVentas).length;
        const c1 = document.getElementById('opVCountTaller');
        const c2 = document.getElementById('opVCountMotor');
        const c3 = document.getElementById('opVCountAuto');
        const c4 = document.getElementById('opVCountFacturar');
        if (c1) c1.textContent = '(' + nt + ')';
        if (c2) c2.textContent = '(' + nm + ')';
        if (c3) c3.textContent = '(' + np + ')';
        function esc(s) {
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        }
        if (operativasTabVentas === 'solicitudes') {
            const c5 = document.getElementById('opVCountSolicitudes');
            if (c5) c5.textContent = '(' + (solicitudesTallerFiltradas || []).length + ')';
            if (!(solicitudesTallerFiltradas || []).length) {
                list.innerHTML = '<div class="op-empty">Sin solicitudes de Laboratorio pendientes. Las órdenes nuevas en Lab generan automáticamente un preregistro aquí.</div>';
                return;
            }
            list.innerHTML = solicitudesTallerFiltradas.map(function (c) {
                const folio = c.folio || (c.id && String(c.id).slice(-8)) || '—';
                const cliente = c.vinculacion?.nombre || '—';
                const tallerFolio = c.vinculacion?.folio_taller || '—';
                const tallerId = encodeURIComponent(c.vinculacion?.id || '');
                const estado = c.estado_interno === 'preregistro'
                    ? '<span class="estado-preregistro">Preregistro · sin materiales</span>'
                    : '<span class="estado-esperando">Esperando cotización</span>';
                const itemsCount = Array.isArray(c.items) ? c.items.length : 0;
                const sinMateriales = itemsCount === 0 ? ' <span class="op-meta">(sin materiales aún)</span>' : '';
                const hrefLab = '/panel/pages/ssepi_taller.html?open=' + tallerId;
                const hrefComp = '/panel/pages/ssepi_compras.html?vincTipo=taller&vincId=' + tallerId;
                return '<div class="op-row">' +
                    '<div><span class="op-badge" style="font-size:10px;background:#e3f2fd;padding:2px 6px;border-radius:4px;margin-right:6px;">Lab → Compras</span><strong>' + esc(folio) + '</strong> · ' + esc(cliente) +
                    '<br><span class="op-meta">Orden Lab: ' + esc(tallerFolio) + ' · ' + estado + sinMateriales + '</span></div>' +
                    '<div class="op-actions">' +
                    '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + esc(hrefLab) + '">Abrir Laboratorio</a> ' +
                    '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + esc(hrefComp) + '">Crear cotización</a>' +
                    '</div></div>';
            }).join('');
            return;
        }
        if (operativasTabVentas === 'facturar') {
            const estadosFacturar = ['reparado', 'terminado', 'entregado', 'listo para facturar', 'completado'];
            const ft = (taller || []).filter(r => estadosFacturar.includes(String(r.estado || '').toLowerCase()));
            const fm = (motores || []).filter(r => estadosFacturar.includes(String(r.estado || '').toLowerCase()));
            const fp = (proyectos || []).filter(r => estadosFacturar.includes(String(r.estado || '').toLowerCase()));
            const totalF = ft.length + fm.length + fp.length;
            if (c4) c4.textContent = '(' + totalF + ')';
            if (!totalF) {
                list.innerHTML = '<div class="op-empty">Sin órdenes ni proyectos listos para facturar en este momento.</div>';
                return;
            }
            const all = [
                ...ft.map(r => ({ ...r, _mod: 'taller', _modLabel: 'Laboratorio', _url: '/panel/pages/ssepi_taller.html' })),
                ...fm.map(r => ({ ...r, _mod: 'motor', _modLabel: 'Motores', _url: '/panel/pages/ssepi_motores.html' })),
                ...fp.map(r => ({ ...r, _mod: 'auto', _modLabel: 'Automatización', _url: '/panel/pages/ssepi_servicios.html' }))
            ];
            list.innerHTML = all.map(function (r) {
                const folio = r.folio || (r.id && String(r.id).slice(-8)) || '—';
                const cliente = r.cliente_nombre || r.cliente || r.nombre || '—';
                const st = r.estado || '—';
                const id = encodeURIComponent(r.id);
                const hrefCompras = '/panel/pages/ssepi_compras.html?vincTipo=' + encodeURIComponent(r._mod) + '&vincId=' + id;
                return '<div class="op-row">' +
                    '<div><span class="op-badge" style="font-size:10px;background:#f0f0f0;padding:2px 6px;border-radius:4px;margin-right:6px;">' + esc(r._modLabel) + '</span><strong>' + esc(folio) + '</strong> · ' + esc(cliente) + '<br><span class="op-meta">' + esc(st) + '</span></div>' +
                    '<div class="op-actions">' +
                    '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + esc(r._url) + '">Abrir módulo</a> ' +
                    '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + hrefCompras + '">Compras vinculadas</a>' +
                    '</div></div>';
            }).join('');
            return;
        }
        if (c4) c4.textContent = '(0)';
        let rows = operativasTabVentas === 'motor' ? motores : (operativasTabVentas === 'auto' ? proyectos : taller);
        rows = (rows || []).filter(_operativaVigenteVentas).slice(0, 50);
        if (!rows.length) {
            list.innerHTML = '<div class="op-empty">Sin registros en esta área o aún cargando.</div>';
            return;
        }
        const tipoVinc = operativasTabVentas === 'motor' ? 'motor' : (operativasTabVentas === 'auto' ? 'automatizacion' : 'taller');
        const modUrl = operativasTabVentas === 'motor' ? '/panel/pages/ssepi_motores.html' : (operativasTabVentas === 'auto' ? '/panel/pages/ssepi_servicios.html' : '/panel/pages/ssepi_taller.html');
        list.innerHTML = rows.map(function (r) {
            const folio = r.folio || (r.id && String(r.id).slice(-8)) || '—';
            const cliente = r.cliente_nombre || r.cliente || r.nombre || '—';
            const stRaw = r.estado || '—';
            const stLabel = _labelEstadoOperativaVentas(stRaw);
            const stClass = _operativaEstaTerminada(stRaw) ? ' style="color:#059669;font-weight:600;"' : '';
            const id = encodeURIComponent(r.id);
            const hrefCompras = '/panel/pages/ssepi_compras.html?vincTipo=' + encodeURIComponent(tipoVinc) + '&vincId=' + id;
            const cotOv = _cotizacionPorOperativa(r.id, folio);
            const cotMeta = cotOv
                ? '<br><span class="op-meta">Orden venta: <strong>' + esc(cotOv.folio || '—') + '</strong> · ' + esc(_resumenOrdenVenta({ ...cotOv, tipo: 'cotizacion' })) + '</span>'
                : '';
            const btnOrdenVenta = cotOv
                ? '<button type="button" class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;" onclick="ventasModule._abrirDetalle(\'' + String(cotOv.id).replace(/'/g, "\\'") + '\', \'cotizacion\')"><i class="fas fa-file-invoice-dollar"></i> Ver orden venta</button> '
                : '';
            const esperaConf = _estadoEsperandoConfirmacionCliente(stRaw);
            const tipoOp = operativasTabVentas === 'motor' ? 'motor' : (operativasTabVentas === 'auto' ? 'proyecto' : 'taller');
            const btnConf = esperaConf
                ? '<button type="button" class="btn-ssepi btn-success op-link" style="font-size:12px;padding:6px 12px;" onclick="ventasModule._clienteConfirmoOperativo(\'' + String(r.id).replace(/'/g, "\\'") + '\', \'' + tipoOp + '\')"><i class="fas fa-check-circle"></i> Cliente confirmó</button> '
                : '';
            return '<div class="op-row">' +
                '<div><strong>' + esc(folio) + '</strong> · ' + esc(cliente) + '<br><span class="op-meta"' + stClass + '>' + esc(stLabel) + '</span>' + cotMeta + '</div>' +
                '<div class="op-actions">' + btnConf + btnOrdenVenta +
                '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + esc(modUrl) + '">Abrir módulo</a> ' +
                '<a class="btn-ssepi btn-ventas op-link" style="font-size:12px;padding:6px 12px;text-decoration:none;display:inline-block;" href="' + hrefCompras + '" title="Solo materiales / OC">Compras (materiales)</a>' +
                '</div></div>';
        }).join('');
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

        const clienteTabulador = tabuladorTaller.clientes.find(c =>
            c.nombre && clienteNombre &&
            c.nombre.toLowerCase().trim() === clienteNombre.toLowerCase().trim()
        );
        calculadoraClienteActual = {
            nombre: clienteNombre,
            km: clienteTabulador?.km || 0,
            horas: clienteTabulador?.horas || 0
        };

        calculadoraComponentes = [];
        fechasEtapas = {};
        wizardPaso = 2;

        const modal = document.getElementById('calculadoraModal');
        await _renderWizardPaso(2);
        modal.classList.add('active');
        _bindWizardEvents();
    }

    function _calcularCostosGuardado() {
        const km = Number(calculadoraClienteActual?.km) || 0;
        const horas = Number(calculadoraClienteActual?.horas) || 0;
        const gasolina = CostosEngine.calcularCostoGasolina(km);
        const traslado = CostosEngine.calcularCostoTrasladoTecnico(horas);
        return { gasolina, traslado };
    }

    function _generarHTMLCalculadora(compra, horasEstimadas) {
        const cliente = calculadoraClienteActual || { km: 0, horas: 0, nombre: '' };
        horasEstimadas = Number(horasEstimadas) || 0;
        const verFin = canSeeFinancials(perfilUsuario);

        const deptWizard = ventasWizardCerebro?.departamento
            || (editingCotizacionId && (() => {
                const cot = cotizaciones.find((c) => c.id === editingCotizacionId);
                const map = { automatizacion: 'Automatización', proyecto: 'Proyectos', soporte: 'Soporte en planta' };
                return map[cot?.origen] || cot?.departamento || '';
            })());
        const esAutomatizacion = deptWizard === 'Automatización'
            || deptWizard === 'Proyectos'
            || deptWizard === 'Soporte en planta';

        // Calcular desglose completo de costos
        const desglose = CostosEngine.calcularPrecioFinal({
            km: Number(cliente.km) || 0,
            horasViaje: Number(cliente.horas) || 0,
            horasTaller: horasEstimadas,
            costoRefacciones: 0
        });
        const totalFinal = desglose.total;

        // VISTA SIN IMPORTES — ventas/compras/taller/etc. (solo admin/superadmin ven montos e IVA)
        if (!verFin) {
            if (esAutomatizacion) {
                return `
                <div class="calculadora-section" style="background:#ecfdf5;border:1px solid #6ee7b7;padding:20px;border-radius:12px;">
                    <div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:8px;"><i class="fas fa-robot"></i> Cotización simplificada (Automatización)</div>
                    <p style="font-size:13px;color:#047857;margin:0 0 12px;">
                        Registra componentes y avanza el wizard. El desglose financiero (servicios, materiales, viáticos e IVA)
                        lo completa un administrador con la tabla de costos y el proyecto en Automatización.
                    </p>
                    <ul style="font-size:12px;color:#334155;margin:0;padding-left:18px;">
                        <li>Servicios y horas: módulo Automatización (plan de ingeniería).</li>
                        <li>Materiales: módulo Compras (solo insumos).</li>
                        <li>Precio al cliente: paso 4 tras validación admin.</li>
                    </ul>
                </div>
                <div class="calculadora-section" style="margin-top: 20px;">
                    <div class="calculadora-titulo" style="background: var(--c-ventas, #10b981); color: white;">
                        <i class="fas fa-boxes"></i> Componentes del proyecto
                    </div>
                    <table class="componentes-table">
                        <thead><tr><th>Componente</th><th>Cantidad</th><th></th></tr></thead>
                        <tbody id="componentesTableBody"></tbody>
                    </table>
                    <div style="display:grid; grid-template-columns:1fr 120px auto; gap:10px; margin-top:15px;">
                        <input type="text" id="compNombre" placeholder="Componente" style="padding:8px;">
                        <input type="number" id="compCantidad" value="1" min="1" style="padding:8px;">
                        <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarComponente()">Agregar</button>
                    </div>
                </div>`;
            }
            return `
                <div class="calculadora-section" style="background:#f0fdf4;border:1px solid #86efac;padding:20px;border-radius:12px;text-align:center;">
                    <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px;"><i class="fas fa-calculator"></i> Armado de cotización</div>
                    <p class="calculadora-sin-precios-hint" style="display:block;font-size:13px;color:#15803d;margin:0;">
                        Agrega componentes y datos del cliente. Los importes, utilidad e IVA los valida un administrador antes de enviar al cliente.
                    </p>
                </div>

                <div class="calculadora-section" style="margin-top: 20px;">
                    <div class="calculadora-titulo" style="background: var(--c-ventas, #10b981); color: white;">
                        <i class="fas fa-boxes"></i> Refacciones y Componentes
                    </div>
                    <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">
                        Agrega refacciones desde el Inventario Maestro o componentes manualmente (sin ver precios).
                    </p>
                    <table class="componentes-table">
                        <thead><tr><th>Componente</th><th>Cantidad</th><th></th></tr></thead>
                        <tbody id="componentesTableBody"></tbody>
                    </table>
                    <div style="display:grid; grid-template-columns:1fr 120px auto; gap:10px; margin-top:15px;">
                        <input type="text" id="compNombre" placeholder="Componente" style="padding:8px;">
                        <input type="number" id="compCantidad" value="1" min="1" style="padding:8px;">
                        <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarComponente()">Agregar</button>
                    </div>
                </div>
            `;
        }

        // VISTA COMPLETA - Solo para admins
        const gasolina = CostosEngine.calcularCostoGasolina(cliente.km);
        const traslado = CostosEngine.calcularCostoTrasladoTecnico(cliente.horas);
        const gasolinaMasTraslado = CostosEngine.calcularGasolinaMasTraslado(cliente.km, cliente.horas);
        const manoObraBase = CostosEngine.calcularManoObra(horasEstimadas);
        const gastosFijosBase = CostosEngine.calcularGastosFijos(horasEstimadas);
        const camionetaBase = CostosEngine.calcularCostoCamioneta(cliente.horas);

        // HTML base para todos los departamentos
        let html = `
            <div class="calculadora-section" style="background: linear-gradient(135deg, var(--c-ventas, #10b981), #059669); padding: 24px; border-radius: 12px; text-align: center;">
                <div style="color: white; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">
                    <i class="fas fa-calculator"></i> Costo Final del Proyecto
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
                    <thead><tr><th>Componente</th><th>Cantidad</th><th>Costo Compra</th><th>Costo Venta</th><th>Subtotal</th><th></th></tr></thead>
                    <tbody id="componentesTableBody"></tbody>
                </table>
                <datalist id="listaInventarioVentas">${inventario.map(i => `<option value="${(i.nombre || i.descripcion || i.sku || '').replace(/"/g, '&quot;')}" data-sku="${(i.sku || '').replace(/"/g, '&quot;')}" data-costo="${i.costo_online || i.costo_local || i.costo || 0}">`).join('')}</datalist>
                <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr auto; gap:10px; margin-top:15px;">
                    <input type="text" id="compNombre" list="listaInventarioVentas" placeholder="Componente" style="padding:8px;" oninput="ventasModule._autoCompletarComponente(this.value)">
                    <input type="number" id="compCantidad" value="1" min="1" style="padding:8px;">
                    <input type="number" id="compCostoCompra" placeholder="Costo compra" style="padding:8px;" readonly title="Auto-completado desde inventario">
                    <input type="number" id="compCosto" placeholder="Costo venta" style="padding:8px;">
                    <button class="btn btn-sm btn-primary" onclick="ventasModule._agregarComponente()">Agregar</button>
                </div>
            </div>
        `;

        // TABLA DE ACTIVIDADES DIARIAS - Solo para Automatización
        if (esAutomatizacion) {
            const tiposActividad = tabuladorAutomatizacion.tiposActividad;
            const empresas = tabuladorAutomatizacion.empresas;
            const tiposOptions = tiposActividad.map(t => `<option value="${t}">${t}</option>`).join('');
            const empresasOptions = empresas.map(e => `<option value="${e}">${e}</option>`).join('');

            html += `
                <div class="calculadora-section" style="margin-top: 20px;">
                    <div class="calculadora-titulo" style="background: linear-gradient(135deg, #6b7280, #4b5563); color: white;">
                        <i class="fas fa-calendar-week"></i> Bitácora de Actividades Diarias - Automatización
                    </div>
                    <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">
                        Registra las actividades diarias del proyecto. Los selectores incluyen todas las actividades y empresas disponibles.
                    </p>
                    <div style="overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-color);">
                        <table class="calc-table" style="min-width: 1000px;">
                            <thead>
                                <tr>
                                    <th style="width:120px;">Fecha</th>
                                    <th style="width:180px;">Actividad</th>
                                    <th>Descripción</th>
                                    <th style="width:180px;">Empresa</th>
                                    <th style="width:90px;">Inicio</th>
                                    <th style="width:90px;">Fin</th>
                                    <th style="width:70px;">Total</th>
                                    <th style="width:60px;">Extras</th>
                                    <th style="width:50px;"></th>
                                </tr>
                            </thead>
                            <tbody id="tablaActividadesBody">
                                ${_renderTablaActividadesDiarias(actividadesDiarias)}
                            </tbody>
                        </table>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button type="button" class="btn btn-sm btn-primary" onclick="ventasModule._agregarActividadDiaria()">
                            <i class="fas fa-plus-circle"></i> Agregar Actividad
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="ventasModule._exportarBitacoraCSV()">
                            <i class="fas fa-file-csv"></i> Exportar CSV
                        </button>
                    </div>
                </div>
            `;
        }

        // ── SECCIÓN: Logística y Viáticos ─────────────────────────
        html += `
            <div class="calculadora-section" style="margin-top: 20px;">
                <div class="calculadora-titulo" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;">
                    <i class="fas fa-gas-pump"></i> Logística y Viáticos
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">Kilómetros (KM)</label>
                        <input type="number" id="inpLogisticaKm" value="${Number(cliente.km) || 0}" min="0" step="0.1" style="width:100%; padding:8px;">
                    </div>
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">Horas de viaje</label>
                        <input type="number" id="inpLogisticaHoras" value="${Number(cliente.horas) || 0}" min="0" step="0.5" style="width:100%; padding:8px;">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px;">
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Gasolina</div>
                        <div id="lblLogisticaGasolina" style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${gasolina.toFixed(2)}</div>
                    </div>
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Traslado técnico</div>
                        <div id="lblLogisticaTraslado" style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${traslado.toFixed(2)}</div>
                    </div>
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Gas + Traslado</div>
                        <div id="valGasPlusSales" style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${gasolinaMasTraslado.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div class="calculadora-section" style="margin-top: 20px;">
                <div class="calculadora-titulo" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                    <i class="fas fa-wrench"></i> Laboratorio y Gastos
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">Horas técnicas estimadas</label>
                        <input type="number" id="inpTechHours" value="${horasEstimadas}" min="0" step="0.5" style="width:100%; padding:8px;">
                    </div>
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">Costo refacciones ($)</label>
                        <input type="number" id="inpParts" value="0" min="0" step="0.01" style="width:100%; padding:8px;">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px;">
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Mano de obra</div>
                        <div style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${manoObraBase.toFixed(2)}</div>
                    </div>
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Gastos fijos</div>
                        <div id="valFixedCosts" style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${gastosFijosBase.toFixed(2)}</div>
                    </div>
                    <div style="background:var(--bg-hover); padding:10px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:var(--text-muted);">Camioneta</div>
                        <div id="valTruck" style="font-size:16px; font-weight:700; color:var(--c-ventas);">$${camionetaBase.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            ${!(esAutomatizacion && verFin && costoDesgloseVentas) ? `
            <div class="calculadora-section" style="margin-top: 20px;">
                <div class="calculadora-titulo" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                    <i class="fas fa-coins"></i> Totales y Margen
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">% Utilidad</label>
                        <input type="number" id="inpUtilidadPct" value="${CostosEngine.CONFIG?.utilidad || 40}" min="0" step="1" style="width:100%; padding:8px;">
                    </div>
                    <div>
                        <label style="font-size:12px; color:var(--text-secondary);">% Crédito</label>
                        <input type="number" id="inpCreditoPct" value="${CostosEngine.CONFIG?.credito || 2}" min="0" step="0.1" style="width:100%; padding:8px;">
                    </div>
                </div>
                <div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; color:var(--text-muted);">Gastos generales</span>
                        <span id="resGeneralExpenses" style="font-weight:700;">$${desglose.gastosGenerales.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; color:var(--text-muted);">Con utilidad</span>
                        <span id="resUtility" style="font-weight:700;">$${desglose.precioConUtilidad.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; color:var(--text-muted);">Con crédito</span>
                        <span id="resCredit" style="font-weight:700;">$${desglose.precioAntesIVA.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; color:var(--text-muted);">IVA ${CostosEngine.CONFIG?.iva || 16}%</span>
                        <span id="resIVA" style="font-weight:700;">$${desglose.iva.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:8px; border-top: 2px solid var(--c-ventas); padding-top:8px;">
                        <span style="font-size:14px; font-weight:700;">TOTAL</span>
                        <span id="resTotal" style="font-size:14px; font-weight:700; color:var(--c-ventas);">$${totalFinal.toFixed(2)}</span>
                    </div>
                </div>
            </div>` : `
            <div style="display:none;" aria-hidden="true">
                <span id="resGeneralExpenses"></span><span id="resUtility"></span><span id="resCredit"></span>
                <span id="resIVA"></span><span id="resTotal"></span>
            </div>`}

            ${(esAutomatizacion && verFin && costoDesgloseVentas) ? `
            <div class="calculadora-section" style="margin-top: 20px;">
                <div class="calculadora-titulo" style="background: linear-gradient(135deg, #0f766e, #115e59); color: white;">
                    <i class="fas fa-table"></i> Costos finales (Automatización)
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin:8px 0;">Importes editables. Las horas de servicios vienen del proyecto en Automatización.</p>
                <div id="ventasDesgloseAutoContainer">${renderDesgloseTableHTML(costoDesgloseVentas, true)}</div>
            </div>` : ''}

            <button type="button" class="btn btn-sm btn-primary" onclick="ventasModule._abrirEditorCostos()" style="margin-top: 16px; width: 100%; background: linear-gradient(135deg, #6b7280, #4b5563);">
                <i class="fas fa-table"></i> Ver Tablas de Costos y Gastos Fijos
            </button>
        `;

        return html;
    }

    async function _fetchActividadesProyectoVinculado() {
        const ordenId = compraActual?.vinculacion?.id
            || ventasWizardCerebro?.orden_id
            || compraActual?.id;
        if (!ordenId || !window.supabase) return [];
        try {
            const { data } = await window.supabase
                .from('proyectos_automatizacion')
                .select('actividades')
                .eq('id', ordenId)
                .maybeSingle();
            const raw = Array.isArray(data?.actividades) ? data.actividades : [];
            return raw.map((a) => ({
                ...a,
                horas: horasParaCotizacionActividad(a),
                horas_plan: horasParaCotizacionActividad(a)
            }));
        } catch (e) {
            return [];
        }
    }

    function _sumMaterialesCompraRow(compra) {
        const items = Array.isArray(compra?.items) ? compra.items : [];
        const mats = items.filter((i) => {
            const t = String(i.tipo || 'material').toLowerCase();
            return !t || t === 'material' || t === 'consumible' || t === 'inventario';
        });
        if (mats.length) {
            return mats.reduce(
                (s, i) => s + (Number(i.cantidad) || 1) * (
                    Number(i.costo_unitario) || Number(i.costo_compra) || Number(i.precio) || Number(i.costo) || 0
                ),
                0
            );
        }
        return Number(compra?.total) || 0;
    }

    async function _fetchTotalMaterialesCompraProyecto(ordenId) {
        if (!ordenId || !window.supabase) return 0;
        try {
            const { data } = await window.supabase
                .from('compras')
                .select('items,total,vinculacion,departamento,folio')
                .order('id', { ascending: false })
                .limit(200);
            const rows = (data || []).filter((c) => {
                const v = c.vinculacion;
                return v && String(v.id) === String(ordenId);
            });
            if (!rows.length) return 0;
            return rows.reduce((sum, c) => sum + _sumMaterialesCompraRow(c), 0);
        } catch (e) {
            return 0;
        }
    }

    function _bindDesgloseVentas() {
        const host = document.getElementById('ventasDesgloseAutoContainer');
        if (!host || !costoDesgloseVentas) return;
        host.querySelectorAll('.ventas-desglose-inp').forEach((inp) => {
            inp.addEventListener('change', () => {
                const key = inp.dataset.key;
                if (!key) return;
                if (inp.type === 'number') costoDesgloseVentas[key] = parseFloat(inp.value) || 0;
                else costoDesgloseVentas[key] = inp.value;
                costoDesgloseVentas = recalcularDesglose(costoDesgloseVentas, { aplicarIva: true });
                host.innerHTML = renderDesgloseTableHTML(costoDesgloseVentas, true);
                _bindDesgloseVentas();
                _syncTotalesWizardDesdeDesglose();
            });
        });
    }

    function _agregarComponente() {
        const nombre = document.getElementById('compNombre')?.value;
        const cantidad = parseFloat(document.getElementById('compCantidad')?.value) || 1;
        const costoVenta = parseFloat(document.getElementById('compCosto')?.value) || 0;
        const costoCompra = parseFloat(document.getElementById('compCostoCompra')?.value) || 0;
        if (!nombre) { _showToast('Ingrese el nombre del componente', 'warning'); return; }
        calculadoraComponentes.push({ nombre, cantidad, costo_unitario: costoVenta, costo_compra: costoCompra, subtotal: cantidad * costoVenta });
        _renderizarComponentes();
        _recalcular();
        document.getElementById('compNombre').value = '';
        document.getElementById('compCantidad').value = 1;
        document.getElementById('compCosto').value = 0;
        document.getElementById('compCostoCompra').value = 0;
    }

    function _autoCompletarComponente(valor) {
        if (!valor) return;
        const item = inventario.find(i => (i.nombre || i.descripcion || i.sku || '') === valor);
        if (item) {
            const costo = item.costo_online || item.costo_local || item.costo || 0;
            const cc = document.getElementById('compCostoCompra');
            if (cc) cc.value = costo;
            const cv = document.getElementById('compCosto');
            if (cv && !cv.value) cv.value = (costo * 1.4).toFixed(2);
        }
    }

    function _renderizarComponentes() {
        const tbody = document.getElementById('componentesTableBody');
        if (!tbody) return;
        const verFin = canSeeFinancials(perfilUsuario);
        if (calculadoraComponentes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${verFin ? 6 : 3}" style="text-align:center;">No hay componentes agregados</td></tr>`;
            return;
        }
        tbody.innerHTML = calculadoraComponentes.map((comp, idx) => `
            <tr>
                <td>${comp.nombre}</td>
                <td>${comp.cantidad}</td>
                ${verFin ? `<td>$${(comp.costo_compra || 0).toFixed(2)}</td><td>$${comp.costo_unitario.toFixed(2)}</td><td>$${comp.subtotal.toFixed(2)}</td>` : ''}
                <td><button class="btn-remove" onclick="ventasModule._eliminarComponente(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _eliminarComponente(idx) {
        calculadoraComponentes.splice(idx, 1);
        _renderizarComponentes();
        _renderWizardBomSeleccionados();
        _recalcular();
        if (ventasAutosaveCtrl) ventasAutosaveCtrl.schedule();
    }

    /**
     * Prellena los inputs logísticos del paso 2 (si están renderizados) y
     * recalcula gasolina+traslado en tiempo real. Llamado desde el handler
     * de cambio de cliente en paso 1 del wizard.
     */
    function _renderLogisticaInputs(km, horas) {
        const kmIn = document.getElementById('inpLogisticaKm');
        const hrsIn = document.getElementById('inpLogisticaHoras');
        if (kmIn) kmIn.value = Number(km) || 0;
        if (hrsIn) hrsIn.value = Number(horas) || 0;
        // Si los inputs existen, recalcular; si no, esperar al render del paso 2
        if (kmIn && hrsIn) _refreshLogisticaFromInputs();
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
                                <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Distancia desde Laboratorio hasta el cliente.</p>
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
            _showToast('Cliente no válido.', 'info');
            return;
        }

        const km = parseFloat(kmInput?.value) || 0;
        const horas = parseFloat(horasInput?.value) || 0;

        const supabaseClient = _supabase();
        if (!supabaseClient) {
            _showToast('Error de conexión con la base de datos.', 'error');
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
            _showToast('Error al guardar: ' + (error.message || error, 'error'));
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

        _showToast('Viáticos guardados correctamente para ' + (cliente.nombre || 'el cliente', 'error'));
    }

    // ==================== CARGA DE COSTOS DESDE BD ====================
    /** Carga parámetros de costos desde parametros_costos */
    function _parametrosCostosConDefaults(raw) {
        const base = { ...(tabuladorTaller.variables || {}) };
        const src = raw || {};
        return {
            gasolina: Number(src.gasolina ?? base.gasolina) || 0,
            rendimiento: Number(src.rendimiento ?? base.rendimiento) || 0,
            costoTecnico: Number(src.costoTecnico ?? base.costoTecnico) || 0,
            gastosFijosHora: Number(src.gastosFijosHora ?? base.gastosFijosHora) || 0,
            camionetaHora: Number(src.camionetaHora ?? base.camionetaHora) || 0,
            utilidad: Number(src.utilidad ?? base.utilidad) || 0,
            credito: Number(src.credito ?? base.credito) || 2,
            iva: Number(src.iva ?? base.iva) || 16
        };
    }

    async function _cargarParametrosCostos() {
        try {
            const { data, error } = await window.supabase
                .from('parametros_costos')
                .select('clave, valor');
            if (error || !data) return _parametrosCostosConDefaults(null);

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
            return _parametrosCostosConDefaults(params);
        } catch (e) {
            console.warn('[Ventas] Error cargando parámetros:', e);
            return _parametrosCostosConDefaults(null);
        }
    }

    /** Carga gastos fijos desde gastos_fijos */
    async function _cargarGastosFijos() {
        try {
            const { data, error } = await window.supabase
                .from('gastos_fijos')
                .select('id, nombre, monto, activo')
                .order('nombre');
            if (error || !data) return [];
            return data.filter(g => g.nombre && g.monto !== null && g.activo !== false);
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
                .select('nombre_cliente, km, horas_viaje, activo')
                .order('nombre_cliente');
            if (error) { console.error('[Ventas] Error Supabase clientes_tabulador:', error); return []; }
            if (!data) { console.warn('[Ventas] clientes_tabulador: sin datos'); return []; }
            console.log('[Ventas] clientes_tabulador raw:', data.length, data.slice(0,3));
            const filtrados = data.filter(c => c.activo !== false && c.nombre_cliente).map(c => ({
                nombre: c.nombre_cliente,
                km: Number(c.km) || 0,
                horas: Number(c.horas_viaje) || 0
            }));
            console.log('[Ventas] clientes_tabulador cargados:', filtrados.length, filtrados.slice(0,3));
            return filtrados;
        } catch (e) {
            console.warn('[Ventas] Error cargando clientes:', e);
            return [];
        }
    }

    /** Abre modal para editar gastos fijos y parámetros */
    async function _abrirEditorCostos() {
        const [parametrosRaw, gastosFijos, clientes] = await Promise.all([
            _cargarParametrosCostos(),
            _cargarGastosFijos(),
            _cargarClientesTabulador()
        ]);
        const parametros = _parametrosCostosConDefaults(parametrosRaw);

        const totalGastosFijos = gastosFijos.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
        const gastoFijoHora = (totalGastosFijos / 160).toFixed(2); // 160 hrs/mes

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop active';
        modal.id = 'ventasEditorCostosModal';
        modal.innerHTML = `
            <div class="modal" style="max-width: 900px;">
                <div class="modal-header" style="background: linear-gradient(135deg, var(--c-ventas), #059669); color: white;">
                    <h3 class="modal-title"><i class="fas fa-calculator"></i> Configuración de Costos</h3>
                    <button type="button" class="modal-close" style="color: white;" onclick="document.getElementById('ventasEditorCostosModal')?.remove()" aria-label="Cerrar">&times;</button>
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
                                        <input type="number" id="paramGasolina" step="0.01" value="${Number(parametros.gasolina) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="gasolina">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Rendimiento (km/L)</label>
                                        <input type="number" id="paramRendimiento" step="0.1" value="${Number(parametros.rendimiento) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="rendimiento">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Costo Técnico ($/hr)</label>
                                        <input type="number" id="paramCostoTecnico" step="0.01" value="${Number(parametros.costoTecnico) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="costo_tecnico">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Camioneta ($/hr)</label>
                                        <input type="number" id="paramCamioneta" step="0.01" value="${Number(parametros.camionetaHora) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="camioneta_hora">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Utilidad (%)</label>
                                        <input type="number" id="paramUtilidad" step="0.1" value="${Number(parametros.utilidad) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="utilidad">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">Crédito (%)</label>
                                        <input type="number" id="paramCredito" step="0.1" value="${Number(parametros.credito) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="credito">
                                    </div>
                                    <div style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
                                        <label style="font-size: 12px; color: var(--text-secondary);">IVA (%)</label>
                                        <input type="number" id="paramIva" step="0.1" value="${Number(parametros.iva) || 0}" style="width: 100%; padding: 8px; font-weight: 600;" data-param="iva">
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
                                                <td><input type="number" value="${Number(g.monto) || 0}" step="0.01" class="gasto-monto" style="width: 100%; padding: 6px;"></td>
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
                    <button type="button" class="btn-ssepi btn-secondary" onclick="document.getElementById('ventasEditorCostosModal')?.remove()">Cancelar</button>
                    <button type="button" class="btn-ssepi btn-ventas" onclick="ventasModule._guardarConfiguracionCostos()">
                        <i class="fas fa-save"></i> Guardar Cambios
                    </button>
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
            _showToast('Error: ' + e.message, 'error');
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

        _showToast('Configuración guardada. Los cálculos se actualizarán automáticamente.', 'info');
        document.getElementById('ventasEditorCostosModal')?.remove();

        // Recalcular si hay calculadora abierta
        _recalcular();
    }

    function _esDeptDesgloseAuto() {
        const dept = ventasWizardCerebro?.departamento || '';
        return dept === 'Automatización' || dept === 'Proyectos' || dept === 'Soporte en planta';
    }

    function _syncTotalesWizardDesdeDesglose() {
        const d = costoDesgloseVentas;
        if (!d) return;
        const sub = Number(d.total) || 0;
        const cred = Number(d.credito_2pct) || 0;
        const venta = Number(d.total_venta) || sub + cred;
        const desc = Number(d.descuento_5pct) || 0;
        const final = Number(d.total_final) || venta - desc;
        const iva = Number(d.iva) || final * 0.16;
        const totalIva = Number(d.total_con_iva) || final + iva;
        lastGastosGenerales = sub;
        lastPrecioConUtilidad = venta;
        lastPrecioAntesIVA = final;
        lastIva = iva;
        lastTotal = totalIva;
        const fmt = (n) => '$' + n.toFixed(2);
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
        set('resGeneralExpenses', sub);
        set('resUtility', venta);
        set('resCredit', final);
        set('resIVA', iva);
        set('resTotal', totalIva);
        set('resSubtotalDesglose', sub);
        set('resCreditoDesglose', cred);
        set('resDescuentoDesglose', desc);
        set('resFinalDesglose', final);
        const elPreviewTotal = document.getElementById('previewTotal');
        if (elPreviewTotal) elPreviewTotal.textContent = totalIva.toFixed(2);
    }

    function _snapshotWizardFromPaso2() {
        const utilEl = document.getElementById('inpUtilidadPct');
        const credEl = document.getElementById('inpCreditoPct');
        if (utilEl && utilEl.value !== '') wizardPctSnap.utilidadPct = parseFloat(utilEl.value);
        if (credEl && credEl.value !== '') wizardPctSnap.creditoPct = parseFloat(credEl.value);
        if (costoDesgloseVentas) {
            wizardPctSnap.markupPct = costoDesgloseVentas.markup_materiales_pct || 30;
            wizardPctSnap.creditoPct = costoDesgloseVentas.credito_pct ?? wizardPctSnap.creditoPct ?? 2;
            wizardPctSnap.descuentoPct = costoDesgloseVentas.descuento_pct || 5;
            _syncTotalesWizardDesdeDesglose();
        } else if (utilEl || credEl) {
            try { _recalcular(); } catch (e) { /* ignore */ }
            if (utilEl && utilEl.value !== '') wizardPctSnap.utilidadPct = parseFloat(utilEl.value);
            if (credEl && credEl.value !== '') wizardPctSnap.creditoPct = parseFloat(credEl.value);
        }
    }

    function _recalcular() {
        if (wizardPaso === 3 && _esDeptDesgloseAuto() && costoDesgloseVentas) {
            _syncTotalesWizardDesdeDesglose();
            return;
        }
        const inpTechHours = document.getElementById('inpTechHours');
        const inpUtilidadPct = document.getElementById('inpUtilidadPct');
        const inpCreditoPct = document.getElementById('inpCreditoPct');
        const utilidadPct = parseFloat(inpUtilidadPct?.value) || CostosEngine.CONFIG?.utilidad || 40;
        const creditoPct = parseFloat(inpCreditoPct?.value) || CostosEngine.CONFIG?.credito || 3;

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

        // Also update previewTotal on paso 2 when it exists
        const elPreviewTotal = document.getElementById('previewTotal');
        if (elPreviewTotal) elPreviewTotal.innerText = '$' + total.toFixed(2);
        const elPreviewSubtotal = document.getElementById('previewSubtotal');
        if (elPreviewSubtotal) elPreviewSubtotal.innerText = '$' + (total / 1.16).toFixed(2);
    }

    function _adjuntarEventosCalculadora() {
        var genBtn = document.getElementById('generarCotizacionBtn');
        if (genBtn) genBtn.onclick = _generarCotizacion;
        var envBtn = document.getElementById('enviarCotizacionBtn');
        if (envBtn) envBtn.onclick = _enviarCotizacionCliente;

        // Inputs de logística
        var kmIn = document.getElementById('inpLogisticaKm');
        var hrsIn = document.getElementById('inpLogisticaHoras');
        if (kmIn) kmIn.addEventListener('input', _refreshLogisticaFromInputs);
        if (hrsIn) hrsIn.addEventListener('input', _refreshLogisticaFromInputs);

        // Inputs de taller y totales
        var techH = document.getElementById('inpTechHours');
        var parts = document.getElementById('inpParts');
        var utilP = document.getElementById('inpUtilidadPct');
        var credP = document.getElementById('inpCreditoPct');
        if (techH) techH.addEventListener('input', _recalcular);
        if (parts) parts.addEventListener('input', _recalcular);
        if (utilP) utilP.addEventListener('input', _recalcular);
        if (credP) credP.addEventListener('input', _recalcular);
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

        if (!cliente) { _showToast('El nombre del cliente es obligatorio', 'info'); return; }
        if (!total || total <= 0) {
            _showToast('Calcule el costo final (Total) con la calculadora antes de enviar la cotización.', 'info');
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

        const folio = await generarFolioCotizacion();
        const subtotal = items.reduce((s, i) => s + i.importe, 0);
        const iva = total * 0.16 / 1.16;
        const cotizacionData = {
            folio,
            fecha_cotizacion: new Date().toISOString(),
            subtotal,
            iva,
            total,
            estado: 'Pendiente',
            notas: JSON.stringify({
                cliente,
                email,
                telefono,
                rfc,
                items,
                origen: compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo',
                orden_origen_id: compraActual?.id,
                vendedor: (await authService.getCurrentProfile())?.nombre || 'Ventas'
            })
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
            _showToast('Cotización guardada y enviada para autorización', 'success');
            _addToFeed('📧', `Cotización ${folio} enviada a ${cliente}`);
            document.getElementById('cotizacionModal').classList.remove('active');
            document.getElementById('calculadoraModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
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

            // Avanzar estado de la orden operativa vinculada y generar solicitud de compra
            const origen = cotizacion?.origen || cotizacion?.cerebro_registro?.origen_cotizacion;
            const ordenId = cotizacion?.orden_origen_id || cotizacion?.cerebro_registro?.orden_id;
            const departamentoReal = cotizacion?.departamento || ventasWizardCerebro?.departamento ||
                (origen === 'taller' ? 'Laboratorio de Electrónica' : origen === 'motores' ? 'Taller Motores' : origen === 'automatizacion' ? 'Automatización' : 'Proyectos');
            if (ordenId) {
                try {
                    if (origen === 'taller') {
                        await tallerService.update(ordenId, { estado: 'Diagnóstico' }, csrfToken);
                        const nuevaCompra = {
                            folio: `PO-${cotizacion.folio || 'SIN-FOLIO'}`,
                            proveedor: 'Por asignar',
                            departamento: departamentoReal,
                            vinculacion: { tipo: 'taller', id: ordenId, nombre: cotizacion.cliente || 'Cliente', folio_taller: cotizacion.cerebro_registro?.folio_operativo || cotizacion.folio },
                            items: (cotizacion.items || []).map(i => ({ sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1, precio_unitario: i.precio_unitario || 0 })),
                            estado: 1,
                            updated_at: new Date().toISOString()
                        };
                        const compraRef = await comprasService.insert(nuevaCompra, csrfToken);
                        await tallerService.update(ordenId, { compra_vinculada: compraRef?.id, estado: 'En Espera' }, csrfToken);
                    } else if (origen === 'motores') {
                        await motoresService.update(ordenId, { estado: 'Diagnóstico' }, csrfToken);
                        const nuevaCompra = {
                            folio: `PO-${cotizacion.folio || 'SIN-FOLIO'}`,
                            proveedor: 'Por asignar',
                            departamento: departamentoReal,
                            vinculacion: { tipo: 'motor', id: ordenId, nombre: cotizacion.cliente || 'Cliente', folio_motores: cotizacion.cerebro_registro?.folio_operativo || cotizacion.folio },
                            items: (cotizacion.items || []).map(i => ({ sku: i.sku || '', descripcion: i.descripcion || '', cantidad: i.cantidad || 1, precio_unitario: i.precio_unitario || 0 })),
                            estado: 1,
                            updated_at: new Date().toISOString()
                        };
                        const compraRef = await comprasService.insert(nuevaCompra, csrfToken);
                        await motoresService.update(ordenId, { compra_vinculada: compraRef?.id, estado: 'En Espera' }, csrfToken);
                    } else if (origen === 'automatizacion' || origen === 'proyecto' || origen === 'soporte') {
                        await proyectosService.update(ordenId, { estado: 'progreso' }, csrfToken);
                    }
                } catch (linkErr) {
                    console.warn('[Ventas] Error al vincular orden operativa:', linkErr);
                }
            }

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
            _addToFeed('✅', 'Cotización autorizada - Orden actualizada y notificación enviada a Compras');
            _renderPipelineCards();
        } catch (error) {
            console.error(error);
            _showToast('Error: ' + error.message, 'error');
        }
    }

    async function _rechazarCotizacion(id) {
        if (!confirm('¿Rechazar esta cotización?')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await cotizacionesService.update(id, { estado: 'rechazada_por_ventas' }, csrfToken);
            _addToFeed('❌', 'Cotización rechazada');
            _renderPipelineCards();
        } catch (error) {
            console.error(error);
            _showToast('Error: ' + error.message, 'error');
        }
    }

    // ==================== DETALLE Y EDICIÓN ====================

    function _idsMatch(a, b) {
        if (a == null || b == null) return false;
        return String(a) === String(b);
    }

    function _normalizarTipoRegistro(tipo) {
        const t = String(tipo || 'cotizacion').toLowerCase();
        if (t === 'ordenes_taller' || t === 'laboratorio') return 'taller';
        if (t === 'ordenes_motores' || t === 'motores') return 'motor';
        if (t === 'proyectos_automatizacion' || t === 'automatizacion' || t === 'proyecto' || t === 'proyectos') return 'proyecto';
        if (t === 'suministro' || t === 'suministros') return 'suministro';
        return t;
    }

    function _findRegistroVentas(id, tipo) {
        const t = _normalizarTipoRegistro(tipo);
        const poolByTipo = {
            venta: ventas,
            cotizacion: cotizaciones,
            suministro: suministrosVentas,
            taller: taller,
            motor: motores,
            proyecto: proyectos
        };
        const primary = poolByTipo[t];
        if (primary && primary.length) {
            const hit = primary.find((i) => _idsMatch(i.id, id));
            if (hit) return hit;
        }
        const all = [...cotizaciones, ...ventas, ...suministrosVentas, ...taller, ...motores, ...proyectos];
        return all.find((i) => _idsMatch(i.id, id)) || all.find((i) => _idsMatch(i.folio, id)) || null;
    }

    function _urlModuloOperativo(tipo, id) {
        const t = _normalizarTipoRegistro(tipo);
        if (t === 'taller') return '/panel/pages/ssepi_taller.html?open=' + encodeURIComponent(id);
        if (t === 'motor') return '/panel/pages/ssepi_motores.html?open=' + encodeURIComponent(id);
        if (t === 'proyecto') return '/panel/pages/ssepi_servicios.html?open=' + encodeURIComponent(id);
        if (t === 'suministro') return '/panel/pages/ssepi_suministros.html?edit=' + encodeURIComponent(id);
        return null;
    }

    function _esRegistroSuministro(item) {
        if (!item) return false;
        const d = item.departamento || item.data?.departamento;
        const o = item.origen || item.data?.origen;
        return o === 'suministro' || d === 'Suministro' || String(item.folio || '').startsWith('SP-S');
    }

    function _estadoEsperandoConfirmacionCliente(estado) {
        const s = String(estado || '').trim().toLowerCase();
        return s === 'esperando_confirmacion'
            || s === 'esperando_confirmacion_cliente'
            || s === 'pendiente_confirmacion'
            || s === 'esperando confirmación cliente'
            || s === 'esperando confirmacion cliente';
    }

    function _editarSuministroDesdeVentas(item) {
        const data = item.data || item;
        const folio = data.folio || item.folio;
        if (!folio) {
            _showToast('Cotización de suministro sin folio', 'warning');
            return;
        }
        window.location.href = '/panel/pages/ssepi_suministros.html?edit=' + encodeURIComponent(folio);
    }

    /**
     * Carga y muestra el historial de una cotización/orden
     */
    async function _mostrarHistorial(id, tipo) {
        const modal = document.getElementById('historialModal');
        const body = document.getElementById('historialBody');
        if (!modal || !body) {
            _showToast('Error: No se encontró el modal de historial.', 'error');
            return;
        }

        const tNorm = _normalizarTipoRegistro(tipo);
        const columnMap = {
            'cotizacion': 'cotizacion_id',
            'venta': 'cotizacion_id',
            'suministro': 'cotizacion_id',
            'taller': 'orden_taller_id',
            'motor': 'orden_motor_id',
            'proyecto': 'proyecto_id',
            'automatizacion': 'proyecto_id'
        };
        const columnName = columnMap[tNorm] || columnMap[tipo] || 'cotizacion_id';

        let data = [], userMap = {}, events = [];
        try {
            // Fetch historial sin join (PostgREST requiere FK para joins embebidos)
            let error;
            const query = window.supabase
                .from('orden_historial')
                .select('*');

            if (columnName === 'cotizacion_id') {
                const res = await query
                    .or(`cotizacion_id.eq.${id},descripcion.ilike.%${id}%`)
                    .order('creado_en', { ascending: false });
                data = res.data || [];
                error = res.error;
                if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
                    const fallback = await window.supabase
                        .from('orden_historial')
                        .select('*')
                        .ilike('descripcion', `%${id}%`)
                        .order('creado_en', { ascending: false });
                    data = fallback.data || [];
                    error = fallback.error;
                }
            } else {
                const res = await query
                    .eq(columnName, id)
                    .order('creado_en', { ascending: false });
                data = res.data || [];
                error = res.error;
                if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
                    const fallback = await window.supabase
                        .from('orden_historial')
                        .select('*')
                        .eq(columnName, id)
                        .order('creado_en', { ascending: false });
                    data = fallback.data || [];
                    error = fallback.error;
                }
            }

            // Si hay error pero tenemos datos, continuar sin tirar error
            if (error && data.length === 0) {
                console.warn('[Ventas] Error cargando historial (sin datos):', error);
            }

            // Resolve creado_por → nombre de usuario en segunda consulta (ignorar errores)
            events = data || [];
            const userIds = [...new Set(events.map(e => e.creado_por).filter(Boolean))];
            if (userIds.length > 0) {
                try {
                    const { data: users } = await window.supabase
                        .from('usuarios')
                        .select('id, nombre, email')
                        .in('id', userIds);
                    if (users) users.forEach(u => { userMap[u.id] = u; });
                } catch (e) { /* ignorar */ }
            }
            events.forEach(e => {
                e.creado_por_usuario = e.creado_por ? { nombre: userMap[e.creado_por]?.nombre, email: userMap[e.creado_por]?.email } : null;
            });
        } catch (err) {
            console.warn('[Ventas] Error en historial:', err);
        }

        const item = _findRegistroVentas(id, tipo);
        const tablaMap = {
            cotizacion: 'cotizaciones', venta: 'cotizaciones', suministro: 'cotizaciones',
            taller: 'ordenes_taller', motor: 'ordenes_motores',
            proyecto: 'proyectos_automatizacion', automatizacion: 'proyectos_automatizacion'
        };
        const tablaHist = tablaMap[tNorm] || 'cotizaciones';

        /** Si el registro no trae estado sync, inferir del historial (ej. "Estado cambiado a Entregado"). */
        function _estatusDesdeHistorial(evts) {
            if (!evts || !evts.length) return null;
            for (var i = 0; i < evts.length; i++) {
                const d = String(evts[i].descripcion || '').toLowerCase();
                if (/entregad|entregado a |entrega a /.test(d)) return 'entrega';
                if (/completad/.test(d)) return 'entrega';
                if (/facturad/.test(d)) return 'facturacion';
                if (/reparad/.test(d)) return 'facturacion';
                if (/cancelad/.test(d)) return 'cancelado';
            }
            return null;
        }

        let estadoActual = item?.estatus_actual || null;
        if (!estadoActual && window.SSEPIStateMachine?.derivarEstatusActualDesdeNativo) {
            estadoActual = SSEPIStateMachine.derivarEstatusActualDesdeNativo(tablaHist, item);
        }
        if (!estadoActual) {
            estadoActual = item?.estado || item?.estatus_pago || null;
        }
        const desdeHist = _estatusDesdeHistorial(events);
        if (desdeHist && window.SSEPIStateMachine?.normalizarEstatusPipeline) {
            const histNorm = SSEPIStateMachine.normalizarEstatusPipeline(desdeHist, tablaHist, item);
            const currNorm = SSEPIStateMachine.normalizarEstatusPipeline(estadoActual, tablaHist, item);
            const pasos = window.SSEPIStateMachine.PIPELINE_PASOS || [];
            const idxHist = pasos.findIndex(function (p) { return p.id === histNorm; });
            const idxCurr = pasos.findIndex(function (p) { return p.id === currNorm; });
            if (idxHist >= 0 && (idxCurr < 0 || idxHist > idxCurr)) {
                estadoActual = histNorm;
            }
        } else if (desdeHist && !estadoActual) {
            estadoActual = desdeHist;
        }
        if (window.SSEPIStateMachine?.normalizarEstatusPipeline) {
            estadoActual = SSEPIStateMachine.normalizarEstatusPipeline(estadoActual, tablaHist, item);
        } else if (!estadoActual) {
            estadoActual = 'recepcion';
        }
        const cerebro = item?.cerebro_registro || {};
        const equipoInfo = cerebro.producto_servicio || cerebro.nombre_producto || item?.descripcion || item?.equipo || null;
        const marcaInfo = cerebro.marca || null;
        const modeloInfo = cerebro.modelo || null;
        const serieInfo = cerebro.serie || null;
        const fallaInfo = cerebro.falla_reportada || null;

        const equipoHtml = equipoInfo ? `
            <div style="background:var(--bg-hover); border-radius:8px; padding:14px 16px; margin-bottom:20px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div><span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Equipo</span><div style="font-weight:600; margin-top:2px;">${equipoInfo}</div></div>
                ${marcaInfo ? `<div><span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Marca</span><div style="font-weight:600; margin-top:2px;">${marcaInfo}</div></div>` : ''}
                ${modeloInfo ? `<div><span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Modelo</span><div style="font-weight:600; margin-top:2px;">${modeloInfo}</div></div>` : ''}
                ${serieInfo ? `<div><span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Serie</span><div style="font-weight:600; margin-top:2px;">${serieInfo}</div></div>` : ''}
                ${fallaInfo ? `<div style="grid-column:1/-1;"><span style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Falla reportada</span><div style="margin-top:2px;">${fallaInfo}</div></div>` : ''}
            </div>
        ` : '';

        body.innerHTML = `
            ${equipoHtml}
            ${_renderTimeline(estadoActual, tablaHist, item)}
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
                            const fecha = new Date(e.creado_en || e.created_at).toLocaleString('es-MX');
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
            <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                ${(_estadoEsperandoConfirmacionCliente(estadoActual) && (tNorm === 'cotizacion' || tNorm === 'venta' || tNorm === 'suministro')) ? `
                <button class="btn btn-success" onclick="ventasModule._clienteConfirmo('${id}')">
                    <i class="fas fa-check-circle"></i> Cliente Confirmó
                </button>
                <button class="btn btn-danger" onclick="ventasModule._clienteCancelo('${id}')">
                    <i class="fas fa-times-circle"></i> Cliente Canceló
                </button>` : ''}
                ${(_estadoEsperandoConfirmacionCliente(estadoActual) && (tNorm === 'taller' || tNorm === 'motor' || tNorm === 'proyecto')) ? `
                <button class="btn btn-success" onclick="ventasModule._clienteConfirmoOperativo('${id}', '${tNorm}')">
                    <i class="fas fa-check-circle"></i> Cliente Confirmó (orden)
                </button>
                <button class="btn btn-danger" onclick="ventasModule._clienteCanceloOperativo('${id}', '${tNorm}')">
                    <i class="fas fa-times-circle"></i> Cliente Canceló (orden)
                </button>` : ''}
                ${(estadoActual === 'entrega' || estadoActual === 'entregado' || estadoActual === 'pagado' || estadoActual === 'facturacion' || estadoActual === 'reparado') ? `
                <button class="btn btn-primary" onclick="ventasModule._generarPDFDesdeHistorial('${id}', '${tipo}')">
                    <i class="fas fa-file-pdf"></i> Generar PDF
                </button>
                ${item && item.orden_origen_id ? `
                <button class="btn btn-info" onclick="ventasModule._activarGarantia('${item.orden_origen_id}', '${item.origen || 'taller'}')">
                    <i class="fas fa-shield-alt"></i> Activar Garantía
                </button>` : ''}` : ''}
                <button class="btn btn-warning" onclick="ventasModule._editarVenta('${id}', '${tipo}')">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-danger" onclick="ventasModule._eliminarVenta('${id}', '${tipo}')">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        `;
        modal.classList.add('active');
    }

    function _renderTimeline(estadoActual, tabla, item) {
        if (window.SSEPIStateMachine) {
            return SSEPIStateMachine.renderTimelineHTML(estadoActual, { tabla: tabla, item: item });
        }
        // Fallback si el core no cargó
        const pasos = [
            { id: 'recepcion', icono: '📥', label: 'Recepción' },
            { id: 'diagnostico', icono: '🔬', label: 'Diagnóstico' },
            { id: 'cotizacion', icono: '💰', label: 'Cotización' },
            { id: 'autorizacion', icono: '✅', label: 'Autorización' },
            { id: 'adquisicion', icono: '🛒', label: 'Adquisición' },
            { id: 'ejecucion', icono: '🔧', label: 'Ejecución' },
            { id: 'facturacion', icono: '🧾', label: 'Facturación' },
            { id: 'entrega', icono: '🚚', label: 'Entrega' }
        ];
        const ordenMap = {
            'recepcion': 0, 'Nuevo': 0,
            'diagnostico': 1, 'Diagnóstico': 1,
            'cotizacion': 2, 'En Espera': 2,
            'autorizacion': 3, 'aprobada': 3,
            'adquisicion': 4, 'en_compra': 4,
            'ejecucion': 5, 'En reparación': 5,
            'facturacion': 6, 'Reparado': 6,
            'entrega': 7, 'Entregado': 7
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
        const t = _normalizarTipoRegistro(tipo);
        if (t === 'taller' || t === 'motor' || t === 'proyecto') {
            const item = _findRegistroVentas(id, tipo);
            if (item && _estadoEsperandoConfirmacionCliente(item.estado)) {
                _mostrarHistorial(id, tipo);
                return;
            }
            const url = _urlModuloOperativo(t, id);
            if (url) {
                window.location.href = url;
                return;
            }
        }
        if (t === 'suministro') {
            const item = _findRegistroVentas(id, tipo);
            if (item && _esRegistroSuministro(item)) {
                _editarSuministroDesdeVentas(item);
                return;
            }
        }
        _mostrarHistorial(id, tipo);
    }

    async function _editarVenta(id, tipo) {
        const t = _normalizarTipoRegistro(tipo);
        const item = _findRegistroVentas(id, tipo);
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }

        document.getElementById('historialModal')?.classList.remove('active');

        if (t === 'taller' || t === 'motor' || t === 'proyecto') {
            const url = _urlModuloOperativo(t, item.id);
            if (url) {
                _showToast('Abriendo módulo operativo para editar…', 'info');
                window.location.href = url;
                return;
            }
        }

        if (t === 'suministro' || _esRegistroSuministro(item)) {
            _editarSuministroDesdeVentas(item);
            return;
        }

        if (t !== 'cotizacion' && t !== 'venta') {
            _showToast('Este tipo de registro se edita en su módulo.', 'info');
            return;
        }

        // Marcar que estamos editando esta cotizacion
        editingCotizacionId = item.id;

        // Cargar datos en el wizard
        calculadoraClienteActual = {
            id: item.cliente_id || '',
            nombre: item.cliente || item.cliente_nombre || '',
            email: item.email || '',
            telefono: item.telefono || '',
            rfc: item.rfc || '',
            km: Number(item.km_distancia) || 0,
            horas: Number(item.horas_viaje) || 0
        };
        compraActual = item.orden_origen_id
            ? { vinculacion: { id: item.orden_origen_id, tipo: item.origen || 'automatizacion' } }
            : null;
        const deptFromOrigen = {
            automatizacion: 'Automatización',
            proyecto: 'Proyectos',
            soporte: 'Soporte en planta',
            taller: 'Laboratorio de Electrónica',
            motores: 'Taller Motores',
            suministro: 'Suministro'
        }[item.origen];
        ventasWizardCerebro = item.cerebro_registro || (deptFromOrigen ? {
            departamento: deptFromOrigen,
            cliente_id: item.cliente_id,
            orden_id: item.orden_origen_id
        } : null);
        fechasEtapas = item.fechas_etapas || {};
        if (item.costo_desglose && typeof item.costo_desglose === 'object') {
            costoDesgloseVentas = recalcularDesglose({ ...item.costo_desglose }, { aplicarIva: true });
        }
        // Issue C: restaurar wizardPctSnap desde cerebro_registro para que
        // al re-editar la cotización se conserven utilidad/credito/markup/descuento.
        const crEdit = (item.cerebro_registro && typeof item.cerebro_registro === 'object') ? item.cerebro_registro : {};
        if (crEdit.utilidad_pct != null) wizardPctSnap.utilidadPct = crEdit.utilidad_pct;
        if (crEdit.credito_pct != null) wizardPctSnap.creditoPct = crEdit.credito_pct;
        if (crEdit.markup_pct != null) wizardPctSnap.markupPct = crEdit.markup_pct;
        if (crEdit.descuento_pct != null) wizardPctSnap.descuentoPct = crEdit.descuento_pct;

        // Reconstruir componentes desde items
        calculadoraComponentes = (item.items || []).map(i => ({
            nombre: i.descripcion || i.desc || '',
            cantidad: i.cantidad || i.qty || 1,
            costo_unitario: i.precio_unitario || i.price || 0,
            subtotal: i.importe || (i.cantidad || 1) * (i.precio_unitario || 0)
        }));

        // Abrir wizard en paso 2 (para editar componentes/costos)
        wizardPaso = 2;
        ventasDraftSessionKey = null;
        var modal = document.getElementById('calculadoraModal');
        if (!modal) return;
        await _renderWizardPaso(2);
        modal.classList.add('active');
        _bindWizardEvents();

        // Pre-llenar paso 1 fields (se usarán al guardar)
        setTimeout(() => {
            const clienteSel = document.getElementById('wizardClienteSelect');
            const fechaIn = document.getElementById('wizardFechaIngreso');
            const nombreProd = document.getElementById('wizardNombreProducto');
            const falla = document.getElementById('wizardFallaReportada');
            const prioridadSel = document.getElementById('wizardPrioridadSelect');
            const deptSel = document.getElementById('wizardDepartamentoSelect');
            if (clienteSel && calculadoraClienteActual?.id) clienteSel.value = calculadoraClienteActual.id;
            if (fechaIn) fechaIn.value = item.fecha || '';
            const cerebro = item.cerebro_registro || {};
            const npVal = cerebro.nombre_producto || cerebro.producto_servicio || '';
            if (nombreProd) nombreProd.value = npVal;
            const nombreVis = document.getElementById('wizardNombreProductoVisible');
            if (nombreVis) nombreVis.value = npVal;
            if (falla) falla.value = cerebro.falla_reportada || '';
            if (prioridadSel) prioridadSel.value = cerebro.prioridad || 'Normal';
            if (deptSel) deptSel.value = cerebro.departamento || '';
            if (window.__onDeptChangeVentas) window.__onDeptChangeVentas();
            _restoreWizardMultiSelects({
                equipos: cerebro.equipos,
                servicios_automatizacion: cerebro.servicios_automatizacion,
                servicio_automatizacion: cerebro.servicio_automatizacion,
                nombreProducto: npVal
            });
        }, 100);

        _showToast('Editando ' + (tipo || 'registro') + ': ' + (item.folio || ''), 'info');
    }

    async function _eliminarVenta(id, tipo) {
        const item = _findRegistroVentas(id, tipo);
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        if (_esRegistroSuministro(item)) {
            _showToast('Las cotizaciones de Suministros se gestionan en el módulo Suministros.', 'info');
            return;
        }
        const t = _normalizarTipoRegistro(tipo);
        if (t === 'taller' || t === 'motor' || t === 'proyecto') {
            _showToast('Cancela o edita esta orden en su módulo operativo.', 'info');
            return;
        }
        const folio = item.folio || id.slice(-6);

        // REGLA 2: validar cuarentena antes de cualquier acción de cancelación
        if (window.SSEPIStateMachine && window.SSEPIStateMachine.estaEnCuarentena(item)) {
            _showToast('Registro en cuarentena contable. No se puede cancelar.', 'error');
            return;
        }

        // REGLA 1: validar punto de no retorno (no cancelar si ya avanzó más allá de borrador/pendiente)
        if (window.SSEPIStateMachine && !window.SSEPIStateMachine.puedeEliminar(item)) {
            _showToast(`El registro ${folio} ya avanzó en el pipeline. Solo puede cancelarse desde etapas iniciales.`, 'error');
            return;
        }

        if (!confirm(`¿Cancelar ${tipo || 'registro'} ${folio}?`)) return;
        try {
            const csrfToken = sessionStorage.getItem('csrfToken');
            const tableName = tipo === 'cotizacion' ? 'cotizaciones' : 'ventas';
            const service = createDataService(tableName);

            // Borrado lógico: marcar como Cancelado en lugar de eliminar físicamente
            await service.update(id, {
                estado: 'cancelado',
                estatus_pago: tipo === 'venta' ? 'cancelado' : undefined,
                updated_at: new Date().toISOString(),
                notas_cancelacion: 'Cancelado por usuario ' + new Date().toLocaleString('es-MX')
            }, csrfToken);

            // Registrar evento en historial
            await _insertarEventoHistorial(tipo || 'cotizacion', id, 'cancelacion', `${tipo === 'venta' ? 'Venta' : 'Cotización'} ${folio} cancelada`, csrfToken);

            // Si hay orden operativa vinculada, también cancelarla
            if (item.orden_origen_id) {
                try {
                    const ordenOrigen = item.origen || 'directo';
                    let ordenTable = null;
                    if (ordenOrigen === 'taller' || ordenOrigen === 'laboratorio') ordenTable = 'ordenes_taller';
                    else if (ordenOrigen === 'motor' || ordenOrigen === 'motores') ordenTable = 'ordenes_motores';
                    else if (ordenOrigen === 'proyecto' || ordenOrigen === 'automatizacion' || ordenOrigen === 'soporte') ordenTable = 'proyectos_automatizacion';

                    if (ordenTable) {
                        const ordenService = createDataService(ordenTable);
                        await ordenService.update(item.orden_origen_id, {
                            estado: 'Cancelado',
                            updated_at: new Date().toISOString()
                        }, csrfToken);
                    }
                } catch (e) { console.warn('[Ventas] Error cancelando orden vinculada:', e); }
            }

            _showToast('Registro cancelado correctamente', 'success');
            document.getElementById('historialModal').classList.remove('active');
            _addToFeed('🗑️', `${tipo === 'venta' ? 'Venta' : 'Cotización'} ${folio} cancelada`);
            await _loadVentas();
            await _loadCotizaciones();
            _applyFilters();
        } catch (e) {
            console.error(e);
            _showToast('Error al cancelar: ' + e.message, 'error');
        }
    }

    async function _reenviarCotizacion(id) {
        const cotizacion = cotizaciones.find(c => c.id === id);
        if (!cotizacion) return;
        _showToast(`✅ Cotización reenviada a ${cotizacion.cliente || 'cliente'}`, 'info');
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
            _showToast('❗ Cliente, falla y departamento son obligatorios.', 'info');
            return;
        }

        const folio = await generarFolioCotizacion();
        const profile = await authService.getCurrentProfile();

        const cotizacionData = {
            folio,
            tipo: 'cotizacion',
            cliente,
            email: email || '',
            telefono: telefono || '',
            rfc: '',
            fecha_cotizacion: new Date().toISOString(),
            items: [{
                descripcion: falla,
                cantidad: 1,
                precio_unitario: 0,
                importe: 0
            }],
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

            _showToast('✅ Cotización guardada en 📝 Registro. Folio: ' + folio, 'success');
            _addToFeed('💾', `Cotización ${folio} guardada en Registro`);
            document.getElementById('registroRapidoModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            _showToast('Error al guardar: ' + error.message, 'error');
        }
    }

    // ==================== NUEVA COTIZACIÓN DIRECTA (Wizard 4 pasos) ====================
    async function _nuevaCotizacion() {
        // Verificar si hay un borrador guardado del paso 1
        const draftKey = 'ventas_draft_' + (await authService.getCurrentProfile())?.nombre?.replace(/\s+/g, '_').toLowerCase();
        const savedDraft = localStorage.getItem(draftKey);

        if (savedDraft) {
            try {
                const draft = JSON.parse(savedDraft);
                // Si hay un borrador del paso 1, preguntar si quiere continuar
                if (draft.wizardPaso === 1 && draft.ventasWizardCerebro) {
                    const dept = draft.ventasWizardCerebro.departamento || 'este departamento';
                    const ordenFolio = draft.ventasWizardCerebro.folio_operativo || 'pendiente';
                    const continuar = confirm(`Tienes una orden guardada en el paso 1 (${dept}, folio: ${ordenFolio}).\n\n¿Quieres continuar donde la dejaste?`);
                    if (continuar) {
                        // Restaurar borrador
                        calculadoraComponentes = draft.calculadoraComponentes || [];
                        calculadoraClienteActual = draft.calculadoraClienteActual || null;
                        compraActual = draft.compraActual || null;
                        ventasWizardCerebro = draft.ventasWizardCerebro || null;
                        wizardPaso = 2; // Ir directo al paso 2
                        ventasDraftSessionKey = draftKey;
                        var modal = document.getElementById('calculadoraModal');
                        if (!modal) {
                            console.error('[Ventas] No se encontró #calculadoraModal');
                            _showToast('No se pudo abrir el wizard. Recarga la página.', 'error');
                            return;
                        }
                        await _renderWizardPaso(2);
                        modal.classList.add('active');
                        _bindWizardEvents();
                        _showToast('📋 Borrador restaurado. Continúa en el paso 2.', 'info');
                        return;
                    }
                }
            } catch (e) {
                console.warn('[Ventas] Error al leer borrador:', e);
            }
        }

        // Iniciar nueva cotización desde cero
        editingCotizacionId = null;
        calculadoraComponentes = [];
        calculadoraClienteActual = null;
        compraActual = null;
        ventasWizardCerebro = null;
        fechasEtapas = {};
        wizardPaso = 1;
        ventasDraftSessionKey = null;
        var modal = document.getElementById('calculadoraModal');
        if (!modal) {
            console.error('[Ventas] No se encontró #calculadoraModal');
            _showToast('No se pudo abrir el wizard. Recarga la página.', 'error');
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

    function _renderRegistroTiemposVentas() {
        const panel = document.getElementById('registroTiemposPanel');
        if (!panel) return;
        const labels = ['Registro','Espera','Cotización','Seguimiento'];
        let html = '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
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
            html += `<div style="min-width:140px;"><strong style="color:#334155;">Paso ${i}:</strong> ${labels[i-1]}<br><span style="color:#64748b;">${iniStr} → ${finStr}</span> · ${badge}</div>`;
        }
        html += '</div>';
        panel.innerHTML = html;
    }

    async function _renderWizardPaso(paso) {
        wizardPaso = paso;
        var titles = _getWizardTitles();
        var titleEl = document.getElementById('wizardModalTitle');
        var indicatorEl = document.getElementById('wizardStepIndicator');
        if (titleEl) titleEl.textContent = 'Paso ' + paso + ': ' + (titles[paso] || '');
        if (indicatorEl) indicatorEl.textContent = 'Paso ' + paso + ' de 4';
        const campoInicio = `etapa${paso}_inicio`;
        if (!fechasEtapas[campoInicio]) {
            fechasEtapas[campoInicio] = new Date().toISOString();
        }
        _renderRegistroTiemposVentas();

        var body = document.getElementById('calculadoraBody');
        if (!body) return;
        if (paso === 1) {
            await _loadContactos();
            body.innerHTML = _renderWizardPaso1();
            _attachWizardPaso1();
            _bindWizardEquiposServiciosEvents();
            _toggleWizardDeptFields();
        } else if (paso === 2) {
            let horasEst = 0;
            const vid = compraActual?.vinculacion?.id || compraActual?.id;
            if (vid) {
                horasEst = Number(taller.find((o) => o.id === vid)?.horas_estimadas)
                    || Number(motores.find((o) => o.id === vid)?.horas_estimadas)
                    || 0;
            }
            const cotEdit = editingCotizacionId ? cotizaciones.find((c) => c.id === editingCotizacionId) : null;
            const log = _calcularCostosGuardado();
            const acts = await _fetchActividadesProyectoVinculado();
            const ordenIdMat = compraActual?.vinculacion?.id || ventasWizardCerebro?.orden_id || cotEdit?.orden_origen_id;
            const totalMatCompra = ordenIdMat ? await _fetchTotalMaterialesCompraProyecto(ordenIdMat) : 0;
            costoDesgloseVentas = buildDesgloseDesdeFuentes({
                base: {
                    ...(cotEdit?.costo_desglose || {}),
                    empresa: calculadoraClienteActual?.nombre || '',
                    materiales: totalMatCompra || cotEdit?.costo_desglose?.materiales || 0,
                    materiales_base: totalMatCompra || cotEdit?.costo_desglose?.materiales_base || 0,
                    viaticos: (log.gasolina || 0) + (log.traslado || 0),
                    gasolina: log.gasolina || 0,
                    hr_camioneta: log.traslado || 0,
                    credito_pct: 2,
                    descuento_pct: 5,
                    markup_materiales_pct: 30
                },
                actividades: acts,
                aplicarIva: true
            });
            body.innerHTML = _generarHTMLCalculadora(compraActual || {}, horasEst);
        }
        else if (paso === 3) body.innerHTML = _renderWizardPaso3();
        else if (paso === 4) body.innerHTML = _renderWizardPaso4();

        if (paso === 2) {
            _adjuntarEventosCalculadora();
            _bindDesgloseVentas();
            _recalcular();
            if (_esDeptDesgloseAuto() && costoDesgloseVentas) _syncTotalesWizardDesdeDesglose();
        }
        if (paso === 3) {
            _adjuntarEventosPaso3();
            _recalcular();
            _embedVistaPreviaWizard();
        }

        var footer = document.getElementById('calculadoraModalFooter');
        if (!footer) return;
        var cancelBtn = footer.querySelector('#wizardCancelBtn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        var prevBtn = footer.querySelector('#wizardPrevBtn');
        if (prevBtn) prevBtn.style.display = paso > 1 ? 'inline-block' : 'none';
        var nextBtn = footer.querySelector('#wizardNextBtn');
        if (nextBtn) nextBtn.style.display = paso < 4 ? 'inline-block' : 'none';
        // Botón Guardar: visible en todos los pasos
        // Paso 1: "GUARDAR ORDEN" → crea orden operativa
        // Pasos 2-3: "Guardar borrador" → guarda estado local
        // Paso 4: "GUARDAR COTIZACIÓN" → guarda cotización final
        var guardarBtn = footer.querySelector('#guardarCotizacionWizardBtn');
        if (guardarBtn) {
            guardarBtn.style.display = 'inline-block';
            if (paso === 1) {
                guardarBtn.innerHTML = '<i class="fas fa-save"></i> GUARDAR ORDEN';
            } else if (paso === 4) {
                guardarBtn.innerHTML = '<i class="fas fa-save"></i> GUARDAR COTIZACIÓN';
            } else {
                guardarBtn.innerHTML = '<i class="fas fa-save"></i> Guardar borrador';
            }
        }
        var descargarPDFWizard = footer.querySelector('#descargarPDFWizardBtn');
        if (descargarPDFWizard) descargarPDFWizard.style.display = paso >= 3 ? 'inline-block' : 'none';
        var vistaPreviaPDFWizard = footer.querySelector('#vistaPreviaPDFWizardBtn');
        if (vistaPreviaPDFWizard) vistaPreviaPDFWizard.style.display = paso >= 3 ? 'inline-block' : 'none';
        var generarBtn = footer.querySelector('#generarCotizacionBtn');
        if (generarBtn) generarBtn.style.display = 'none';
        var enviarBtn = footer.querySelector('#enviarCotizacionBtn');
        if (enviarBtn) enviarBtn.style.display = paso === 4 ? 'inline-block' : 'none';
    }

    function _renderWizardPaso1() {
        var contactosList = contactos || [];
        var clientesOptions = contactosList
            .filter(function (c) { return c.tipo_ficha !== 'contacto_empresa'; })
            .map(function (c) {
            var sel = (ventasWizardCerebro && String(ventasWizardCerebro.cliente_id || calculadoraClienteActual?.id) === String(c.id)) ? ' selected' : '';
            var tabLabel = c.empresa_tabulador || c.empresa || '';
            var label = tabLabel ? (tabLabel + (c.nombre && c.tipo_ficha === 'empresa' ? '' : (c.nombre ? ' — ' + c.nombre : ''))) : (c.nombre || c.empresa || c.email || 'Sin nombre');
            return '<option value="' + c.id + '"' + sel
                + ' data-nombre="' + (c.nombre || c.empresa || '') + '"'
                + ' data-empresa-tabulador="' + (c.empresa_tabulador || c.empresa || '') + '"'
                + ' data-tipo-ficha="' + (c.tipo_ficha || '') + '"'
                + ' data-km="' + (c.km || 0) + '" data-horas="' + (c.horas_viaje || 0) + '"'
                + ' data-email="' + (c.email || '') + '" data-telefono="' + (c.telefono || '') + '"'
                + ' data-rfc="' + (c.rfc || '') + '">' + label + '</option>';
        }).join('');
        // Incluir clientes del tabulador que no estén ya en contactos
        var nombresContactos = new Set(contactosList.map(function(c){ return (c.nombre || c.empresa || '').toLowerCase().trim(); }));
        var tabClientesOpts = (tabuladorTaller.clientes || []).filter(function(tc) {
            return !nombresContactos.has((tc.nombre || '').toLowerCase().trim());
        }).map(function(tc) {
            var val = 'tab-' + encodeURIComponent(tc.nombre);
            var sel = (calculadoraClienteActual && calculadoraClienteActual.nombre && calculadoraClienteActual.nombre.toLowerCase().trim() === (tc.nombre || '').toLowerCase().trim()) ? ' selected' : '';
            return '<option value="' + val + '"' + sel + ' data-nombre="' + (tc.nombre || '') + '" data-km="' + (tc.km || 0) + '" data-horas="' + (tc.horas || 0) + '">' + (tc.nombre || 'Cliente') + '</option>';
        }).join('');
        clientesOptions += tabClientesOpts;
        const hoy = new Date().toISOString().split('T')[0];
        const cerebro = ventasWizardCerebro || {};
        const preCliente = cerebro.cliente_id || calculadoraClienteActual?.id || '';
        const preFecha = cerebro.fecha_ingreso || hoy;
        const preProducto = cerebro.nombre_producto || cerebro.producto_servicio || '';
        const preFalla = cerebro.falla_reportada || '';
        const prePrioridad = cerebro.prioridad || 'Normal';
        const preDepto = cerebro.departamento || '';
        const preServicio = cerebro.servicio_automatizacion || '';
        const preEquipos = Array.isArray(cerebro.equipos)
            ? cerebro.equipos
            : (preProducto ? preProducto.split(',').map((s) => s.trim()).filter(Boolean) : []);
        const preServicios = Array.isArray(cerebro.servicios_automatizacion)
            ? cerebro.servicios_automatizacion
            : (preServicio ? String(preServicio).split(' | ').map((s) => s.trim()).filter(Boolean) : []);
        const preServSet = new Set(preServicios);
        const showEquipos = preDepto === 'Laboratorio de Electrónica' || preDepto === 'Taller Motores';
        const showServicios = preDepto === 'Automatización' || preDepto === 'Proyectos' || preDepto === 'Soporte en planta';

        const equiposCheckboxesHtml = CATALOGO_EQUIPOS_LAB.map((eq) => {
            const checked = preEquipos.includes(eq) ? ' checked' : '';
            return '<label style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">'
                + '<input type="checkbox" data-equipo="' + eq + '" value="' + eq + '"' + checked + '> ' + eq + '</label>';
        }).join('');

        const serviciosCheckboxesHtml = tabuladorAutomatizacion.servicios.map((s) => {
            const val = s.area + ' | ' + s.servicio;
            const checked = preServSet.has(val) ? ' checked' : '';
            const escVal = val.replace(/"/g, '&quot;');
            return '<label class="wizard-servicio-row">'
                + '<input type="checkbox" data-servicio-val="' + escVal + '" value="' + escVal + '"' + checked + '>'
                + '<span class="wizard-servicio-text"><strong>' + s.area + '</strong> — ' + s.servicio
                + ' <span class="wizard-servicio-meta">($' + s.valorAgregado + '/' + s.unidad.replace('por ', '') + ')</span></span></label>';
        }).join('');

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-clipboard-list"></i> Paso 1: Registro de Orden</div>
                <p id="wizardPaso1Error" style="display:none; font-size:13px; color:#c62828; margin:0 0 12px 0;" role="alert"></p>
                <div class="editor-item" style="margin-bottom:14px;">
                    <p id="wizardFolioAyuda" style="font-size:13px; color:var(--text-secondary); margin:0;">Elige departamento para generar orden.</p>
                </div>

                <!-- DEPARTAMENTO PRIMERO -->
                <div class="editor-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                    <div class="editor-item">
                        <label>Departamento que recibe el caso <span style="color:#c62828;">*</span></label>
                        <select id="wizardDepartamentoSelect" style="width:100%; padding:10px;" onchange="window.__onDeptChangeVentas && window.__onDeptChangeVentas()">
                            <option value=""${preDepto===''?' selected':''}>-- Seleccionar departamento --</option>
                            <option value="Laboratorio de Electrónica"${preDepto==='Laboratorio de Electrónica'?' selected':''}>Laboratorio de Electrónica</option>
                            <option value="Taller Motores"${preDepto==='Taller Motores'?' selected':''}>Taller Motores</option>
                            <option value="Automatización"${preDepto==='Automatización'?' selected':''}>Automatización</option>
                            <option value="Proyectos"${preDepto==='Proyectos'?' selected':''}>Proyectos</option>
                            <option value="Soporte en planta"${preDepto==='Soporte en planta'?' selected':''}>Soporte en planta</option>
                            <option value="Suministro"${preDepto==='Suministro'?' selected':''}>Suministro</option>
                            <option value="Administración"${preDepto==='Administración'?' selected':''}>Administración (Sin orden)</option>
                        </select>
                    </div>
                    <div class="editor-item">
                        <label>Cliente <span style="color:#c62828;">*</span></label>
                        <select id="wizardClienteSelect" style="width:100%; padding:10px;">
                            <option value="">-- Seleccionar cliente --</option>
                            ${clientesOptions}
                        </select>
                    </div>
                </div>

                <!-- Banner de adeudo (dinámico) -->
                <div id="wizardAdeudoBanner" style="display:none; margin-top:12px;"></div>

                <!-- SERVICIOS AUTOMATIZACIÓN / SOPORTE (multi-select) -->
                <div class="editor-item editor-item-full" id="wizardServicioAutoWrap" style="margin-top:14px; display:${showServicios?'block':'none'};">
                    <label>Servicios / Actividades <span style="color:#c62828;">*</span></label>
                    <p style="font-size:12px; color:var(--text-secondary); margin:0 0 8px 0;">Selecciona uno o más servicios del catálogo de automatización.</p>
                    <div id="wizardServiciosAutoWrap" class="wizard-servicios-list">
                        ${serviciosCheckboxesHtml}
                    </div>
                    <select id="wizardServicioAutoSelect" style="display:none;"><option value=""></option></select>
                </div>

                <div class="editor-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:14px;">
                    <div class="editor-item">
                        <label>Fecha de ingreso <span style="color:#c62828;">*</span></label>
                        <input type="date" id="wizardFechaIngreso" value="${preFecha}" style="width:100%; padding:10px;">
                    </div>
                    <div class="editor-item">
                        <label>Prioridad (urgencia)</label>
                        <select id="wizardPrioridadSelect" style="width:100%; padding:10px;">
                            <option value="Baja"${prePrioridad==='Baja'?' selected':''}>Baja</option>
                            <option value="Normal"${prePrioridad==='Normal'?' selected':''}>Normal</option>
                            <option value="Alta"${prePrioridad==='Alta'?' selected':''}>Alta</option>
                            <option value="Urgente"${prePrioridad==='Urgente'?' selected':''}>Urgente</option>
                        </select>
                    </div>
                </div>

                <div class="editor-item" id="wizardEquiposWrap" style="margin-top:14px; display:${showEquipos?'block':'none'};">
                    <label>Equipos a reparar / atender <span style="color:#c62828;">*</span></label>
                    <p style="font-size:12px; color:var(--text-secondary); margin:0 0 8px 0;">Catálogo del Laboratorio (mismo que Taller SP-E). Puedes elegir varios.</p>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px;">
                        ${equiposCheckboxesHtml}
                    </div>
                    <div id="wizardEquipoOtroWrap" style="display:${preEquipos.includes('Otro')?'block':'none'}; margin-top:8px;">
                        <input type="text" id="wizardEquipoOtro" placeholder="Especificar otro equipo" style="width:100%; padding:8px;">
                    </div>
                    <input type="hidden" id="wizardNombreProducto" value="${preProducto.replace(/"/g, '&quot;')}">
                </div>

                <div class="editor-item" id="wizardNombreProductoWrap" style="margin-top:14px; display:${(showEquipos||preDepto==='Suministro')?'none':'block'};">
                    <label>Nombre del producto / Equipo <span style="color:#c62828;">*</span></label>
                    <input type="text" id="wizardNombreProductoVisible" value="${preProducto.replace(/"/g, '&quot;')}" placeholder="Ej. Sistema de control, Motor trifásico, Tablero eléctrico..." style="width:100%; padding:10px;">
                    <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Requerido para generar la orden.</p>
                </div>

                <div id="wizardSuministroWrap" style="display:none; margin-top:14px; border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#f8fafc;">
                    <div class="calculadora-titulo" style="margin-bottom:8px;"><i class="fas fa-list"></i> Catálogo BOM — Suministros</div>
                    <p style="font-size:12px; color:var(--text-secondary); margin:0 0 10px 0;">Lista completa del BOM. Agrega ítems con + o captura un componente que no esté en el catálogo.</p>
                    <input type="search" id="wizardBomBusqueda" placeholder="Buscar por descripción, código o ítem…" style="width:100%; padding:8px; margin-bottom:8px;">
                    <div style="max-height:220px; overflow:auto; border:1px solid #e2e8f0; border-radius:6px; background:#fff;">
                        <table class="componentes-table" style="width:100%; font-size:12px;">
                            <thead><tr><th>Ítem</th><th>Descripción</th><th>Código</th><th>Precio</th><th></th></tr></thead>
                            <tbody id="wizardBomListaBody"><tr><td colspan="5">Cargando catálogo…</td></tr></tbody>
                        </table>
                    </div>
                    <div style="display:grid; grid-template-columns:2fr 80px 100px auto; gap:8px; margin-top:10px;">
                        <input type="text" id="wizardBomManualNombre" placeholder="Componente no en BOM (nombre)" style="padding:8px;">
                        <input type="number" id="wizardBomManualCant" value="1" min="1" style="padding:8px;">
                        <input type="number" id="wizardBomManualPrecio" placeholder="Precio ref." min="0" step="0.01" style="padding:8px;">
                        <button type="button" class="btn btn-sm btn-secondary" id="wizardBomManualBtn">Agregar</button>
                    </div>
                    <p style="font-size:12px; margin:10px 0 6px; font-weight:600;">Materiales seleccionados <span style="color:#c62828;">*</span></p>
                    <table class="componentes-table" style="width:100%; font-size:12px;">
                        <thead><tr><th>Código</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th></th></tr></thead>
                        <tbody id="wizardBomSeleccionadosBody"></tbody>
                    </table>
                </div>

                <div class="editor-item" style="margin-top:14px;">
                    <label id="wizardFallaLabel">Falla reportada / Requerimiento <span style="color:#c62828;">*</span></label>
                    <textarea id="wizardFallaReportada" rows="3" placeholder="Describe la falla o el requerimiento del cliente..." style="width:100%; padding:10px; resize:vertical;">${preFalla}</textarea>
                </div>

                <div class="editor-grid" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:14px;">
                    <div class="editor-item">
                        <label>Email</label>
                        <input type="email" id="wizardEmailCliente" readonly style="width:100%; padding:10px; background:#f5f5f5; color:var(--text-secondary);">
                    </div>
                    <div class="editor-item">
                        <label>Teléfono</label>
                        <input type="tel" id="wizardTelefonoCliente" readonly style="width:100%; padding:10px; background:#f5f5f5; color:var(--text-secondary);">
                    </div>
                    <div class="editor-item">
                        <label>RFC</label>
                        <input type="text" id="wizardRfcCliente" readonly style="width:100%; padding:10px; background:#f5f5f5; color:var(--text-secondary);">
                    </div>
                </div>
                <div class="editor-item" style="margin-top:10px;">
                    <label>Vendedor (usuario SSEPI)</label>
                    <input type="text" id="wizardVendedor" value="${currentUserName}" readonly style="width:100%; padding:10px; background:#f5f5f5; color:var(--text-secondary);">
                </div>
                <div class="editor-item" style="margin-top:8px;">
                    <label>Vendedor en empresa (Odoo)</label>
                    <input type="text" id="wizardVendedorAsociado" readonly placeholder="Se muestra al elegir empresa tabulador" style="width:100%; padding:10px; background:#f5f5f5; color:var(--text-secondary);">
                </div>
            </div>
        `;
    }

    function _renderWizardPaso3() {
        const esAuto = _esDeptDesgloseAuto() && costoDesgloseVentas;
        if (esAuto) {
            const d = costoDesgloseVentas;
            const mkPct = d.markup_materiales_pct || wizardPctSnap.markupPct || 30;
            const crPct = d.credito_pct ?? wizardPctSnap.creditoPct ?? 2;
            const descPct = d.descuento_pct ?? wizardPctSnap.descuentoPct ?? 5;
            const sub = Number(d.total) || 0;
            const cred = Number(d.credito_2pct) || 0;
            const desc = Number(d.descuento_5pct) || 0;
            const final = Number(d.total_final) || 0;
            const iva = Number(d.iva) || 0;
            const totalIva = Number(d.total_con_iva) || final + iva;
            const fmt = (n) => '$' + n.toFixed(2);
            return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-file-invoice-dollar"></i> Paso 3: Cotización al Cliente</div>
                <p style="color:var(--text-secondary); margin-bottom:16px;">
                    Los porcentajes ya se definieron en el paso 2 (Compras/Materiales). Aquí solo confirmas el total y revisas el documento.
                </p>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
                    <span style="background:#ecfdf5;color:#065f46;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;">Markup materiales ${mkPct}%</span>
                    <span style="background:#eff6ff;color:#1e40af;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;">Crédito ${crPct}%</span>
                    <span style="background:#fef3c7;color:#92400e;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;">Descuento ${descPct}%</span>
                </div>
                <div style="background:#f5f5f5; padding:20px; border-radius:8px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>SUBTOTAL COSTOS</strong></span><span id="resSubtotalDesglose">${fmt(sub)}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>CRÉDITO ${crPct}%</strong></span><span id="resCreditoDesglose">${fmt(cred)}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; color:#b45309;"><span><strong>DESCUENTO ${descPct}%</strong></span><span id="resDescuentoDesglose">−${fmt(desc)}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>SUBTOTAL</strong></span><span id="resCredit">${fmt(final)}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>IVA ${CostosEngine.CONFIG?.iva || 16}%</strong></span><span id="resIVA">${fmt(iva)}</span></div>
                </div>
                <div class="total-box" style="margin-bottom:24px;">
                    <div class="label">TOTAL CON IVA</div>
                    <div class="value" id="resTotal">${fmt(totalIva)}</div>
                </div>
                <div style="display:none;" aria-hidden="true"><span id="resGeneralExpenses">${fmt(sub)}</span><span id="resUtility">${fmt(Number(d.total_venta) || sub + cred)}</span></div>
                <div class="calculadora-section" style="margin-top:0;padding:0;">
                    <div class="calculadora-titulo" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;">
                        <i class="fas fa-eye"></i> Vista previa del documento
                    </div>
                    <div id="wizardPdfPreviewFrame" style="width:100%;height:480px;background:#f1f5f9;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:12px;">
                        <p style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Generando vista previa…</p>
                    </div>
                </div>
            </div>`;
        }

        const utilidadPct = wizardPctSnap.utilidadPct ?? CostosEngine.CONFIG?.utilidad ?? 40;
        const creditoPct = wizardPctSnap.creditoPct ?? CostosEngine.CONFIG?.credito ?? 3;
        const gastos = lastGastosGenerales ? '$' + lastGastosGenerales.toFixed(2) : (document.getElementById('resGeneralExpenses')?.innerText || '$0.00');
        const utilidadVal = lastPrecioConUtilidad ? '$' + lastPrecioConUtilidad.toFixed(2) : (document.getElementById('resUtility')?.innerText || '$0.00');
        const creditoVal = lastPrecioAntesIVA ? '$' + lastPrecioAntesIVA.toFixed(2) : (document.getElementById('resCredit')?.innerText || '$0.00');
        const ivaVal = lastIva ? '$' + lastIva.toFixed(2) : (document.getElementById('resIVA')?.innerText || '$0.00');
        const totalVal = lastTotal ? '$' + lastTotal.toFixed(2) : (document.getElementById('resTotal')?.innerText || '$0.00');

        return `
            <div class="calculadora-section">
                <div class="calculadora-titulo"><i class="fas fa-percent"></i> Paso 3: Cotización al Cliente</div>
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
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span><strong>IVA ${CostosEngine.CONFIG?.iva || 16}%</strong></span><span id="resIVA">${ivaVal}</span></div>
                </div>
                <div class="total-box" style="margin-top:20px; margin-bottom:24px;">
                    <div class="label">TOTAL CON IVA</div>
                    <div class="value" id="resTotal">${totalVal}</div>
                </div>
                <div class="calculadora-section" style="margin-top:0;padding:0;">
                    <div class="calculadora-titulo" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;">
                        <i class="fas fa-eye"></i> Vista previa del documento
                    </div>
                    <div id="wizardPdfPreviewFrame" style="width:100%;height:480px;background:#f1f5f9;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:12px;">
                        <p style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Generando vista previa…</p>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderWizardPaso4() {
        const cliente = calculadoraClienteActual?.nombre || 'Cliente';
        const total = document.getElementById('resTotal')?.innerText || '$0.00';
        const folio = editingCotizacionId ? (cotizaciones.find(c => c.id === editingCotizacionId)?.folio || 'COT-####') : 'COT-####';
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
                            <p><strong>Origen:</strong> ${compraActual ? (compraActual._origen === 'soporte' ? 'Soporte en planta' : compraActual._origen === 'proyecto' ? 'Soporte en planta' : compraActual._origen === 'automatizacion' ? 'Automatización' : compraActual._origen === 'suministro' ? 'Suministro' : compraActual.vinculacion ? 'Laboratorio de Electrónica' : 'Motores') : 'Directo'}</p>
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
        if (inpUtilidad) inpUtilidad.addEventListener('input', () => {
            wizardPctSnap.utilidadPct = parseFloat(inpUtilidad.value) || 0;
            _recalcular();
            if (document.getElementById('lblUtilidadPct')) document.getElementById('lblUtilidadPct').textContent = inpUtilidad.value;
            _embedVistaPreviaWizard();
        });
        if (inpCredito) inpCredito.addEventListener('input', () => {
            wizardPctSnap.creditoPct = parseFloat(inpCredito.value) || 0;
            _recalcular();
            if (document.getElementById('lblCreditoPct')) document.getElementById('lblCreditoPct').textContent = inpCredito.value;
            _embedVistaPreviaWizard();
        });
    }

    function _embedVistaPreviaWizard() {
        if (wizardPaso !== 3) return;
        const frame = document.getElementById('wizardPdfPreviewFrame');
        if (!frame) return;
        _descargarPDFDesdeWizard(true, 'wizardPdfPreviewFrame');
    }

    async function _wizardSiguiente() {
        if (wizardPaso === 1) {
            _wizardSetPaso1Error('');
            const clienteSelect = document.getElementById('wizardClienteSelect');
            const fechaIn = document.getElementById('wizardFechaIngreso');
            const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
            let nombreProducto = _wizardResolverNombreProducto(dept);
            const falla = document.getElementById('wizardFallaReportada')?.value?.trim() || '';
            const prioridad = document.getElementById('wizardPrioridadSelect')?.value || 'Normal';
            const clienteId = clienteSelect?.value;

            // VALIDACIÓN DE CAMPOS REQUERIDOS
            if (!clienteId) { _wizardSetPaso1Error('❌ Selecciona un cliente.'); return; }
            if (!fechaIn?.value) { _wizardSetPaso1Error('❌ Indica la fecha de ingreso.'); return; }
            const esSuministro = dept === 'Suministro';
            const esEquipos = _deptUsaEquiposMulti(dept);
            const esServicios = _deptUsaServiciosMulti(dept);
            if (!esSuministro && esEquipos) {
                const eq = _getWizardEquiposSeleccionados();
                if (!eq.length) { _wizardSetPaso1Error('❌ Selecciona al menos un equipo del catálogo.'); return; }
                nombreProducto = eq.join(', ');
                const np = document.getElementById('wizardNombreProducto');
                if (np) np.value = nombreProducto;
            } else if (!esSuministro && !nombreProducto) {
                _wizardSetPaso1Error('❌ Ingresa el nombre del producto (requerido para continuar).'); return;
            }
            if (esServicios && !_getWizardServiciosSeleccionados().length) {
                _wizardSetPaso1Error('❌ Selecciona al menos un servicio / actividad.'); return;
            }
            if (esSuministro && calculadoraComponentes.length === 0) {
                _wizardSetPaso1Error('❌ Agrega al menos un material del BOM o un componente manual.');
                return;
            }
            if (!esSuministro && !falla) { _wizardSetPaso1Error('❌ Describe la falla o el requerimiento.'); return; }
            if (esSuministro && !falla) {
                const notas = 'Solicitud de suministros — ' + calculadoraComponentes.length + ' material(es)';
                const fallaEl = document.getElementById('wizardFallaReportada');
                if (fallaEl) fallaEl.value = notas;
            }
            if (!dept) { _wizardSetPaso1Error('❌ Selecciona el departamento que recibe el caso.'); return; }

            const contacto = contactos.find(c => String(c.id) === String(clienteId));
            const optLabel = (clienteSelect?.selectedOptions?.[0]?.textContent || '').trim();
            let clienteNombre = '';
            if (contacto) {
                clienteNombre = (contacto.nombre || contacto.empresa || contacto.email || 'Cliente').trim() || 'Cliente';
            } else if (optLabel && optLabel !== '-- Seleccionar cliente --') {
                clienteNombre = optLabel === 'Sin nombre' ? 'Cliente' : optLabel;
            } else {
                clienteNombre = 'Cliente';
            }
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

            let origenCot = 'directo';
            if (dept === 'Laboratorio de Electrónica') origenCot = 'taller';
            else if (dept === 'Taller Motores') origenCot = 'motores';
            else if (dept === 'Automatización') origenCot = 'automatizacion';
            else if (dept === 'Proyectos') origenCot = 'proyecto';
            else if (dept === 'Soporte en planta') origenCot = 'soporte';
            else if (dept === 'Suministro') origenCot = 'suministro';

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

            const servicioAuto = _wizardResolverServiciosAuto();
            const serviciosAuto = _getWizardServiciosSeleccionados();
            const equiposSel = _getWizardEquiposSeleccionados();
            const fallaFinal = (document.getElementById('wizardFallaReportada') || {}).value?.trim() || falla;
            ventasWizardCerebro = {
                fecha_ingreso: fechaIn.value,
                falla_reportada: fallaFinal,
                prioridad,
                departamento: dept,
                cliente_id: clienteId,
                orden_id: creado.ordenId || null,
                folio_operativo: creado.folio || null,
                tipo_vinculo: creado.tipo || null,
                origen_cotizacion: origenCot,
                nombre_producto: esSuministro ? ('Suministros (' + calculadoraComponentes.length + ' ítems)') : nombreProducto,
                equipos: equiposSel.length ? equiposSel : undefined,
                servicio_automatizacion: servicioAuto,
                servicios_automatizacion: serviciosAuto.length ? serviciosAuto : undefined,
                componentes_suministro: esSuministro ? calculadoraComponentes.slice() : undefined
            };

            // Registrar evento en historial inmediatamente al crear orden (paso 1 → 2)
            if (creado.ordenId) {
                try {
                    await _insertarEventoHistorial(creado.tipo, creado.ordenId, 'creacion', `Orden ${creado.folio} creada desde Ventas`, csrfToken);
                } catch (e) { console.warn('[Ventas] Error registrando evento en historial:', e); }
            }

            // Nota: El auto-guardado al paso 2 ya no es necesario porque el usuario guarda manualmente en paso 1
            // Solo guardar si por algún motivo no se guardó antes
            if (ventasAutosaveCtrl && !ventasDraftSessionKey) {
                const payload = {
                    wizardPaso: 2,
                    calculadoraClienteActual,
                    compraActual,
                    ventasWizardCerebro,
                    paso1Fields: _collectPaso1Fields()
                };
                ventasAutosaveCtrl.collectPayload = () => payload;
                ventasAutosaveCtrl.schedule();
                ventasAutosaveCtrl.flush();
                ventasAutosaveCtrl.collectPayload = _collectVentasDraftPayload;
            }
        }
        if (wizardPaso === 4) return;
        // Issue B: snapshot ANTES del flush para que el payload
        // que se persiste en el borrador contenga los valores recién
        // capturados del DOM (utilidad%, crédito%, markup%, descuento%).
        if (wizardPaso === 2) _snapshotWizardFromPaso2();
        // Auto-guardar al cambiar de paso (solo pasos 2→3 y 3→4)
        if (ventasAutosaveCtrl && wizardPaso >= 2 && wizardPaso < 4) {
            const payload = {
                wizardPaso: wizardPaso + 1,
                calculadoraClienteActual: calculadoraClienteActual ? { ...calculadoraClienteActual } : null,
                calculadoraComponentes: calculadoraComponentes.slice(),
                compraActual: compraActual ? { ...compraActual } : null,
                ventasWizardCerebro: ventasWizardCerebro ? { ...ventasWizardCerebro } : null,
                lastGastosGenerales,
                lastPrecioConUtilidad,
                lastPrecioAntesIVA,
                lastIva,
                lastTotal,
                costoDesgloseVentas: costoDesgloseVentas ? { ...costoDesgloseVentas } : null,
                wizardPctSnap: { ...wizardPctSnap }
            };
            if (wizardPaso + 1 === 2) payload.paso1Fields = _collectPaso1Fields();
            if (wizardPaso + 1 >= 3) {
                payload.paso2Fields = _collectPaso2Fields();
            }
            if (wizardPaso + 1 === 4) {
                payload.paso3Fields = _collectPaso3Fields();
            }
            ventasAutosaveCtrl.collectPayload = () => payload;
            ventasAutosaveCtrl.schedule();
            ventasAutosaveCtrl.flush();
            // Restaurar collector default para evitar closure stale (Issue D).
            ventasAutosaveCtrl.collectPayload = _collectVentasDraftPayload;
        }
        (async () => { await _renderWizardPaso(wizardPaso + 1); })();
    }

    function _wizardAnterior() {
        if (wizardPaso <= 1) return;
        (async () => { await _renderWizardPaso(wizardPaso - 1); })();
    }

    function _bindWizardEvents() {
        var wizardCancel = document.getElementById('wizardCancelBtn');
        if (wizardCancel) wizardCancel.onclick = function () {
            _flushVentasAutosave();
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
        if (descargarWizard) descargarWizard.onclick = () => _descargarPDFDesdeWizard(false);
        var vistaPreviaWizard = document.getElementById('vistaPreviaPDFWizardBtn');
        if (vistaPreviaWizard) vistaPreviaWizard.onclick = () => _descargarPDFDesdeWizard(true, wizardPaso === 3 ? 'wizardPdfPreviewFrame' : null);
        var enviarWizard = document.getElementById('enviarCotizacionBtn');
        if (enviarWizard) enviarWizard.onclick = _enviarCotizacionDesdeWizard;

        // Handler global para cambio de departamento (llamado desde onchange del select)
        window.__onDeptChangeVentas = function () {
            const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
            const fallaLabel = document.getElementById('wizardFallaLabel');
            const fallaInput = document.getElementById('wizardFallaReportada');

            if (fallaLabel) {
                if (dept === 'Suministro') {
                    fallaLabel.innerHTML = 'Notas de la solicitud <span style="font-weight:normal;color:#64748b;">(opcional)</span>';
                    if (fallaInput) fallaInput.placeholder = 'Ej. urgencia, entrega en planta, referencia del cliente…';
                } else if (dept === 'Laboratorio de Electrónica' || dept === 'Taller Motores') {
                    fallaLabel.innerHTML = 'Falla reportada / Descripción del equipo <span style="color:#c62828;">*</span>';
                    if (fallaInput) fallaInput.placeholder = 'Describe la falla, modelo del equipo, número de serie, voltaje, etc.';
                } else if (dept === 'Automatización' || dept === 'Proyectos' || dept === 'Soporte en planta') {
                    fallaLabel.innerHTML = 'Alcance y requerimientos <span style="color:#c62828;">*</span>';
                    if (fallaInput) fallaInput.placeholder = 'Describe el alcance del proyecto, objetivos, entregables y condiciones especiales...';
                } else {
                    fallaLabel.innerHTML = 'Falla reportada / Requerimiento <span style="color:#c62828;">*</span>';
                    if (fallaInput) fallaInput.placeholder = 'Describe la falla o el requerimiento del cliente...';
                }
            }

            _toggleWizardDeptFields();
        };
    }

    async function _consultarAdeudoCliente(clienteId) {
        if (!clienteId || !window.supabase) return 0;
        try {
            const { data, error } = await window.supabase
                .from('contactos')
                .select('adeudo_acumulado')
                .eq('id', clienteId)
                .single();
            if (error) throw error;
            return Number(data?.adeudo_acumulado) || 0;
        } catch (e) {
            console.warn('[Ventas] Error consultando adeudo:', e);
            return 0;
        }
    }

    function _nombreClienteWizardResuelto() {
        let n = (calculadoraClienteActual?.nombre || '').trim();
        if (n) return n;
        const cid = calculadoraClienteActual?.contactoId ?? calculadoraClienteActual?.id;
        if (cid != null && Array.isArray(contactos) && contactos.length) {
            const c = contactos.find(x => String(x.id) === String(cid));
            if (c) {
                n = (c.nombre || c.empresa || c.email || 'Cliente').trim() || 'Cliente';
                if (calculadoraClienteActual) calculadoraClienteActual.nombre = n;
                return n;
            }
        }
        return '';
    }

    function _descargarPDFDesdeWizard(preview = false, embedFrameId = null) {
        const cliente = _nombreClienteWizardResuelto();
        let total = lastTotal || parseFloat((document.getElementById('resTotal')?.innerText || '$0').replace(/[$,]/g, '')) || 0;
        const rfc = calculadoraClienteActual?.rfc || 'XAXX010101000';
        const folio = editingCotizacionId ? (cotizaciones.find(c => c.id === editingCotizacionId)?.folio || 'COT-####') : 'COT-####';
        const departamento = ventasWizardCerebro?.departamento || 'Ventas';
        const esAuto = ['Automatización', 'Proyectos', 'Soporte en planta'].includes(departamento);
        let items = calculadoraComponentes.map(c => ({ descripcion: c.nombre, cantidad: c.cantidad, precioUnitario: c.costo_unitario, importe: c.subtotal }));
        let subtotal = total / 1.16;
        let iva = total - subtotal;
        if (esAuto && costoDesgloseVentas) {
            const pub = buildConceptosPDFPublicos(costoDesgloseVentas);
            items = pub.items;
            subtotal = pub.subtotal;
            iva = pub.iva;
            total = pub.total || total;
        }
        if (!cliente) {
            if (!preview || !embedFrameId) _showToast('Cliente requerido para el PDF.', 'info');
            return;
        }
        (async () => {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                await pdfGenerator.generateCotizacion({
                    folio, cliente, rfc, items, subtotal, iva, total, departamento,
                    embedPreviewId: embedFrameId || null
                }, user, preview);
                if (!preview) _addToFeed('🧾', `PDF generado: ${folio}`);
            } catch (error) {
                console.error(error);
                if (embedFrameId) {
                    const el = document.getElementById(embedFrameId);
                    if (el) el.innerHTML = '<p style="padding:24px;text-align:center;color:#c62828;">No se pudo generar la vista previa.</p>';
                }
                if (!embedFrameId) _showToast('Error al generar PDF: ' + error.message, 'error');
            }
        })();
    }

    async function _guardarCotizacionDesdeWizard() {
        const cliente = _nombreClienteWizardResuelto();

        // PASO 1: Guardar orden operativa (cerebro) y permitir cerrar el wizard
        if (wizardPaso === 1) {
            if (!cliente) { _showToast('Falta el nombre del cliente.', 'warning'); return; }

            const fechaIn = document.getElementById('wizardFechaIngreso')?.value;
            const dept = document.getElementById('wizardDepartamentoSelect')?.value || '';
            let nombreProducto = _wizardResolverNombreProducto(dept);
            const falla = document.getElementById('wizardFallaReportada')?.value?.trim() || '';
            const prioridad = document.getElementById('wizardPrioridadSelect')?.value || 'Normal';
            const clienteId = document.getElementById('wizardClienteSelect')?.value;

            if (!clienteId) { _showToast('Selecciona un cliente.', 'warning'); return; }
            const contacto = contactos.find(c => String(c.id) === String(clienteId));
            if (!contacto && !String(clienteId).startsWith('tab-')) {
                _showToast('Selecciona un cliente válido de la lista.', 'warning');
                return;
            }
            if (!fechaIn) { _showToast('Indica la fecha de ingreso.', 'warning'); return; }
            if (_deptUsaEquiposMulti(dept)) {
                const eq = _getWizardEquiposSeleccionados();
                if (!eq.length) { _showToast('Selecciona al menos un equipo.', 'warning'); return; }
                nombreProducto = eq.join(', ');
            } else if (!nombreProducto) {
                _showToast(_deptUsaServiciosMulti(dept) ? 'Ingresa el nombre del proyecto / orden.' : 'Ingresa el nombre del producto.', 'warning');
                return;
            }
            if (_deptUsaServiciosMulti(dept) && !_getWizardServiciosSeleccionados().length) {
                _showToast('Selecciona al menos un servicio / actividad.', 'warning'); return;
            }
            if (!falla) { _showToast('Describe la falla o requerimiento.', 'warning'); return; }
            if (!dept) { _showToast('Selecciona el departamento.', 'warning'); return; }

            const optLabel = (document.getElementById('wizardClienteSelect')?.selectedOptions?.[0]?.textContent || '').trim();
            let clienteNombre = '';
            if (contacto) {
                clienteNombre = (contacto.nombre || contacto.empresa || contacto.email || '').trim();
            } else if (String(clienteId).startsWith('tab-')) {
                clienteNombre = decodeURIComponent(String(clienteId).slice(4));
            } else if (optLabel && optLabel !== '-- Seleccionar cliente --' && optLabel !== 'Sin nombre') {
                clienteNombre = optLabel;
            }
            if (!clienteNombre) {
                _showToast('El cliente seleccionado no tiene nombre. Revísalo en Contactos.', 'warning');
                return;
            }

            let origenCot = 'directo';
            if (dept === 'Laboratorio de Electrónica') origenCot = 'taller';
            else if (dept === 'Taller Motores') origenCot = 'motores';
            else if (dept === 'Automatización') origenCot = 'automatizacion';
            else if (dept === 'Proyectos') origenCot = 'proyecto';
            else if (dept === 'Soporte en planta') origenCot = 'soporte';
            else if (dept === 'Suministro') origenCot = 'suministro';

            const csrfToken = sessionStorage.getItem('csrfToken');
            let creado = { folio: null, ordenId: null, tipo: null };

            if (dept !== 'Administración') {
                try {
                    creado = await _ventasCrearOrdenOperativa(dept, clienteNombre, falla, fechaIn, prioridad, csrfToken);
                } catch (e) {
                    console.error('[Ventas] alta orden cerebro', e);
                    _showToast('Error al crear orden: ' + e.message, 'error');
                    return;
                }
                if (creado?.ordenId) {
                    const esAuto = ['Automatización', 'Proyectos', 'Soporte en planta'].includes(dept);
                    if (!esAuto) {
                        await _crearCompraVinculada(creado.folio, creado.ordenId, creado.tipo, clienteNombre, csrfToken);
                    }
                }
            }

            // Guardar registro cerebro
            ventasWizardCerebro = {
                fecha_ingreso: fechaIn,
                falla_reportada: falla,
                prioridad,
                departamento: dept,
                cliente_id: clienteId,
                orden_id: creado.ordenId || null,
                folio_operativo: creado.folio || null,
                tipo_vinculo: creado.tipo || null,
                origen_cotizacion: origenCot,
                nombre_producto: nombreProducto,
                equipos: _getWizardEquiposSeleccionados(),
                servicio_automatizacion: _wizardResolverServiciosAuto(),
                servicios_automatizacion: _getWizardServiciosSeleccionados()
            };

            // Crear cotización provisional (visible en lista de Ventas)
            if (dept !== 'Administración') {
                try {
                    const folioCot = await generarFolioCotizacion();
                    const cotProv = {
                        folio: folioCot,
                        tipo_folio: 'COT',
                        cliente_nombre: clienteNombre,
                        cliente: clienteNombre,
                        vendedor: (await authService.getCurrentProfile())?.nombre || 'Ventas',
                        subtotal: 0,
                        iva: 0,
                        total: 0,
                        km_distancia: contacto?.km || 0,
                        horas_viaje: contacto?.horas_viaje || 0,
                        costo_gasolina: _calcularCostosGuardado().gasolina || 0,
                        costo_traslado: _calcularCostosGuardado().traslado || 0,
                        estado: 'borrador',
                        origen: origenCot,
                        departamento: dept,
                        orden_origen_id: creado.ordenId || null,
                        cerebro_registro: ventasWizardCerebro || {},
                        fechas_etapas: fechasEtapas,
                        items: [],
                        email: contacto?.email || '',
                        telefono: contacto?.telefono || '',
                        rfc: contacto?.rfc || ''
                    };
                    const insertedCot = await cotizacionesService.insert(cotProv, csrfToken);
                    if (insertedCot?.id) {
                        editingCotizacionId = insertedCot.id;
                        _showToast('Cotización provisional creada: ' + folioCot, 'success');
                    }
                    // Guardar fechas_etapas en la orden operativa vinculada
                    if (creado?.ordenId && creado?.tipo) {
                        try {
                            const svc = creado.tipo === 'taller' ? tallerService : creado.tipo === 'motores' ? motoresService : proyectosService;
                            await svc.update(creado.ordenId, { fechas_etapas: fechasEtapas }, csrfToken);
                        } catch (e) { console.warn('[Ventas] update fechas_etapas orden:', e); }
                    }
                } catch (e) {
                    console.warn('[Ventas] Error creando cotización provisional (no crítico):', e);
                }
            }

            // Guardar cliente actual (usar datos de contactos, NO de clientes_tabulador)
            if (contacto) {
                calculadoraClienteActual = {
                    contactoId: clienteId,
                    nombre: clienteNombre,
                    km: contacto.km || 0,
                    horas: contacto.horas_viaje || 0,
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

            // Registrar evento en historial
            if (creado.ordenId) {
                try {
                    await _insertarEventoHistorial(creado.tipo, creado.ordenId, 'creacion', `Orden ${creado.folio} creada desde Ventas`, csrfToken);
                } catch (e) { console.warn('[Ventas] Error registrando evento en historial:', e); }
            }

            // Guardar borrador local para continuar después
            if (ventasAutosaveCtrl) {
                const payload = {
                    wizardPaso: 1,
                    calculadoraClienteActual,
                    compraActual: dept === 'Administración' ? { id: null, vinculacion: null, _origen: 'directo' } : null,
                    ventasWizardCerebro,
                    paso1Fields: _collectPaso1Fields()
                };
                ventasAutosaveCtrl.collectPayload = () => payload;
                ventasAutosaveCtrl.schedule();
                // Forzar write sincrónico antes de cerrar el modal (Issue D).
                ventasAutosaveCtrl.flush();
                ventasAutosaveCtrl.collectPayload = _collectVentasDraftPayload;
            }

            _showToast('✅ Orden guardada. Puedes cerrar y esperar a que Laboratorio/Compras completen su información.', 'success');
            _addToFeed('📋', `Orden guardada - ${dept}`);

            // Recargar vistas para mostrar la orden creada
            try {
                await Promise.all([
                    dept === 'Laboratorio de Electrónica' ? _loadTaller() : Promise.resolve(),
                    dept === 'Taller Motores' ? _loadMotores() : Promise.resolve(),
                    (dept === 'Automatización' || dept === 'Proyectos' || dept === 'Soporte en planta') ? _loadProyectos() : Promise.resolve()
                ]);
                await _loadCotizaciones();
                _applyFilters();
            } catch (e) {
                console.warn('[Ventas] Error recargando vistas:', e);
            }

            // Cerrar wizard para permitir que el usuario espere
            document.getElementById('calculadoraModal').classList.remove('active');
            return;
        }

        // PASOS 2 y 3: Guardar borrador
        if (wizardPaso < 4) {
            if (ventasAutosaveCtrl) {
                const payload = {
                    wizardPaso,
                    calculadoraClienteActual,
                    calculadoraComponentes: calculadoraComponentes.slice(),
                    compraActual,
                    ventasWizardCerebro,
                    lastGastosGenerales,
                    lastPrecioConUtilidad,
                    lastPrecioAntesIVA,
                    lastIva,
                    lastTotal,
                    actividadesDiarias: actividadesDiarias.slice(),
                    costoDesgloseVentas: costoDesgloseVentas ? { ...costoDesgloseVentas } : null,
                    wizardPctSnap: { ...wizardPctSnap }
                };
                ventasAutosaveCtrl.collectPayload = () => payload;
                ventasAutosaveCtrl.schedule();
                ventasAutosaveCtrl.flush();
                // Restaurar el collector al default para que el próximo input/change
                // no use un closure con valores "viejos" (Issue D).
                ventasAutosaveCtrl.collectPayload = _collectVentasDraftPayload;
            }
            _showToast('✅ Borrador guardado. Puedes continuar editando.', 'success');
            _addToFeed('💾', 'Borrador de cotización guardado');
            return;
        }

        // Paso 4: Guardar cotización final
        let total = lastTotal || parseFloat((document.getElementById('resTotal')?.innerText || document.getElementById('previewTotal')?.innerText || '0').replace(/[$,]/g, '')) || 0;
        if (total <= 0) {
            _recalcular();
            total = lastTotal || parseFloat((document.getElementById('resTotal')?.innerText || document.getElementById('previewTotal')?.innerText || '0').replace(/[$,]/g, '')) || 0;
            if (total <= 0) { _showToast('El total debe ser mayor a 0. Agrega materiales o servicios en el Paso 2.', 'info'); return; }
        }
        // Recuperación de adeudo
        let adeudoRecuperado = 0;
        let notasAdeudo = '';
        const clienteIdAdeudo = calculadoraClienteActual?.contactoId || null;
        if (clienteIdAdeudo) {
            try {
                const { data: adeudoData } = await window.supabase
                    .from('contactos')
                    .select('adeudo_acumulado')
                    .eq('id', clienteIdAdeudo)
                    .single();
                if (adeudoData?.adeudo_acumulado > 0) {
                    adeudoRecuperado = Number(adeudoData.adeudo_acumulado) || 0;
                    notasAdeudo = `Recuperado $${adeudoRecuperado.toLocaleString()} de adeudo acumulado del cliente.`;
                }
            } catch (e) { console.warn('[Ventas] Error consultando adeudo:', e); }
        }
        const finalTotal = total + adeudoRecuperado;

        const items = calculadoraComponentes.map(c => ({
            descripcion: c.nombre,
            cantidad: c.cantidad,
            precio_unitario: c.costo_unitario,
            importe: c.subtotal
        }));

        const folio = await generarFolioCotizacion();
        const vendedorNombre = (await authService.getCurrentProfile())?.nombre || 'Ventas';
        const cotizacionData = {
            folio,
            tipo_folio: 'COT',
            cliente_nombre: cliente || 'Cliente',
            cliente: cliente || 'Cliente',
            cliente_id: calculadoraClienteActual?.contactoId || null,
            vendedor: vendedorNombre,
            subtotal: items.reduce((s, i) => s + i.importe, 0),
            iva: finalTotal * 0.16 / 1.16,
            total: finalTotal,
            km_distancia: calculadoraClienteActual?.km || 0,
            horas_viaje: calculadoraClienteActual?.horas || 0,
            costo_gasolina: _calcularCostosGuardado().gasolina || 0,
            costo_traslado: _calcularCostosGuardado().traslado || 0,
            estado: 'Pendiente',
            origen: (ventasWizardCerebro && ventasWizardCerebro.origen_cotizacion) || (compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo'),
            departamento: ventasWizardCerebro?.departamento || null,
            orden_origen_id: compraActual?.vinculacion?.id || compraActual?.id || null,
            cerebro_registro: _cerebroRegistroPayload() || {},
            fechas_etapas: fechasEtapas,
            items: items || [],
            email: calculadoraClienteActual?.email || '',
            telefono: calculadoraClienteActual?.telefono || '',
            rfc: calculadoraClienteActual?.rfc || '',
            adeudo_recuperado: adeudoRecuperado,
            notas_adeudo: notasAdeudo,
            costo_desglose: costoDesgloseVentas || null
        };

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            // Si estamos editando una cotizacion existente, actualizar en lugar de insertar
            if (editingCotizacionId) {
                const existing = cotizaciones.find(c => c.id === editingCotizacionId);
                const updated = await cotizacionesService.update(editingCotizacionId, {
                    cliente_nombre: cliente || 'Cliente',
                    cliente: cliente || 'Cliente',
                    subtotal: items.reduce((s, i) => s + i.importe, 0),
                    iva: finalTotal * 0.16 / 1.16,
                    total: finalTotal,
                    km_distancia: calculadoraClienteActual?.km || 0,
                    horas_viaje: calculadoraClienteActual?.horas || 0,
                    costo_gasolina: _calcularCostosGuardado().gasolina || 0,
                    costo_traslado: _calcularCostosGuardado().traslado || 0,
                    estado: 'Pendiente',
                    items: items || [],
                    email: calculadoraClienteActual?.email || '',
                    telefono: calculadoraClienteActual?.telefono || '',
                    rfc: calculadoraClienteActual?.rfc || '',
                    cerebro_registro: _cerebroRegistroPayload() || {},
                    fechas_etapas: fechasEtapas,
                    departamento: ventasWizardCerebro?.departamento || null,
                    vendedor: vendedorNombre,
                    costo_desglose: costoDesgloseVentas || null
                }, csrfToken);
                editingCotizacionId = null;
                _showToast('✅ Cotización actualizada. Folio: ' + (updated?.folio || existing?.folio || folio), 'success');
                _addToFeed('💾', `Cotización ${updated?.folio || folio} actualizada`);
                _afterVentasPersistOk();
                document.getElementById('calculadoraModal').classList.remove('active');
                await _loadCotizaciones();
                _applyFilters();
                return;
            }
            // Nueva cotizacion
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

            // Si se recuperó adeudo, actualizar contacto y marcar adeudos
            if (adeudoRecuperado > 0 && clienteIdAdeudo) {
                try {
                    await window.supabase.from('contactos').update({ adeudo_acumulado: 0 }).eq('id', clienteIdAdeudo);
                    await window.supabase.from('clientes_adeudos').update({ recuperado: true, monto_recuperado: adeudoRecuperado }).eq('cliente_id', clienteIdAdeudo).eq('recuperado', false);
                    await _insertarEventoHistorial('cotizacion', inserted.id, 'adeudo_recuperado', notasAdeudo, csrfToken);
                    _showToast(`Adeudo de $${adeudoRecuperado.toLocaleString()} recuperado en esta cotización.`, 'info');
                } catch (e) { console.warn('[Ventas] Error actualizando adeudo:', e); }
            }

            _showToast('✅ Cotización guardada. Folio: ' + folio, 'success');
            _addToFeed('💾', `Cotización ${folio} guardada`);
            _afterVentasPersistOk();
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
            _showToast('Para enviar por Gmail necesitas el correo del cliente. Edita el contacto o ingresa el email.', 'info');
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
        let total = lastTotal || parseFloat(totalStr.replace(/[$,]/g, '')) || 0;

        // Recuperación de adeudo
        let adeudoRecuperado = 0;
        let notasAdeudo = '';
        const clienteIdAdeudo = calculadoraClienteActual?.contactoId || null;
        if (clienteIdAdeudo) {
            try {
                const { data: adeudoData } = await window.supabase
                    .from('contactos')
                    .select('adeudo_acumulado')
                    .eq('id', clienteIdAdeudo)
                    .single();
                if (adeudoData?.adeudo_acumulado > 0) {
                    adeudoRecuperado = Number(adeudoData.adeudo_acumulado) || 0;
                    notasAdeudo = `Recuperado $${adeudoRecuperado.toLocaleString()} de adeudo acumulado del cliente.`;
                }
            } catch (e) { console.warn('[Ventas] Error consultando adeudo:', e); }
        }
        total = total + adeudoRecuperado;
        const totalStrFinal = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const folio = await generarFolioCotizacion();
        const subtotal = items.reduce((s, i) => s + i.importe, 0);
        const iva = total * 0.16 / 1.16;
        const vendedorNombre = (await authService.getCurrentProfile())?.nombre || 'Ventas';
        const cotizacionData = {
            folio,
            tipo_folio: 'COT',
            cliente_nombre: cliente || 'Cliente',
            cliente: cliente || 'Cliente',
            cliente_id: calculadoraClienteActual?.contactoId || null,
            email: calculadoraClienteActual?.email || '',
            telefono: calculadoraClienteActual?.telefono || '',
            rfc: calculadoraClienteActual?.rfc || '',
            items,
            subtotal,
            iva,
            total,
            km_distancia: calculadoraClienteActual?.km || 0,
            horas_viaje: calculadoraClienteActual?.horas || 0,
            costo_gasolina: _calcularCostosGuardado().gasolina || 0,
            costo_traslado: _calcularCostosGuardado().traslado || 0,
            estado: 'Pendiente',
            origen: (ventasWizardCerebro && ventasWizardCerebro.origen_cotizacion) || (compraActual ? (compraActual._origen || (compraActual.vinculacion ? 'taller' : 'motores')) : 'directo'),
            departamento: ventasWizardCerebro?.departamento || null,
            orden_origen_id: compraActual?.vinculacion?.id || compraActual?.id || null,
            cerebro_registro: _cerebroRegistroPayload() || {},
            vendedor: vendedorNombre,
            adeudo_recuperado: adeudoRecuperado,
            notas_adeudo: notasAdeudo
        };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const inserted = await cotizacionesService.insert(cotizacionData, csrfToken);
            await _syncFolioTrasCotizacion(inserted, cotizacionData, calculadoraComponentes, csrfToken);
            if (window.emailService) {
                const profile = await authService.getCurrentProfile();
                const fromVendedor = profile && profile.email ? (profile.nombre || 'Ventas') + ' <' + profile.email + '>' : undefined;
                const html = '<p>Hola ' + cliente + ',</p><p>Adjuntamos la cotización <strong>' + folio + '</strong> por un total de <strong>' + totalStrFinal + '</strong>.</p><p>Quedamos atentos.</p><p>— SSEPI Ventas</p>';
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

            // Si se recuperó adeudo, actualizar contacto y marcar adeudos
            if (adeudoRecuperado > 0 && clienteIdAdeudo) {
                try {
                    await window.supabase.from('contactos').update({ adeudo_acumulado: 0 }).eq('id', clienteIdAdeudo);
                    await window.supabase.from('clientes_adeudos').update({ recuperado: true, monto_recuperado: adeudoRecuperado }).eq('cliente_id', clienteIdAdeudo).eq('recuperado', false);
                    await _insertarEventoHistorial('cotizacion', inserted.id, 'adeudo_recuperado', notasAdeudo, csrfToken);
                    _showToast(`Adeudo de $${adeudoRecuperado.toLocaleString()} recuperado en esta cotización.`, 'info');
                } catch (e) { console.warn('[Ventas] Error actualizando adeudo:', e); }
            }

            _showToast('✅ Cotización guardada y enviada. Folio: ' + folio, 'success');
            _addToFeed('📧', `Cotización ${folio} enviada a ${cliente}`);
            _afterVentasPersistOk();
            document.getElementById('calculadoraModal').classList.remove('active');
            await _loadCotizaciones();
            _applyFilters();
        } catch (error) {
            console.error(error);
            _showToast('Error al guardar: ' + error.message, 'error');
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

        // Registro rápido de cotización
        var btnRegistroRapido = document.getElementById('btnNuevaCotizacionRapida');
        if (btnRegistroRapido) btnRegistroRapido.addEventListener('click', _abrirRegistroRapido);

        var closeRegistroRapido = document.getElementById('closeRegistroRapidoModal');
        if (closeRegistroRapido) closeRegistroRapido.addEventListener('click', function () {
            var m = document.getElementById('registroRapidoModal');
            if (m) m.classList.remove('active');
        });

        var cancelRegistroRapido = document.getElementById('cancelRegistroRapidoBtn');
        if (cancelRegistroRapido) cancelRegistroRapido.addEventListener('click', function () {
            var m = document.getElementById('registroRapidoModal');
            if (m) m.classList.remove('active');
        });

        var guardarRegistroRapido = document.getElementById('guardarRegistroRapidoBtn');
        if (guardarRegistroRapido) guardarRegistroRapido.addEventListener('click', _guardarRegistroRapido);

        var newCotizacionBtn = document.getElementById('newCotizacionBtn');
        if (newCotizacionBtn) newCotizacionBtn.addEventListener('click', _nuevaCotizacion);

        var closeCalc = document.getElementById('closeCalculadoraModal');
        if (closeCalc) closeCalc.addEventListener('click', function () {
            var m = document.getElementById('calculadoraModal');
            if (m) m.classList.remove('active');
            editingCotizacionId = null;
            currentVenta = null;
            compraActual = null;
            ventasWizardCerebro = null;
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
        if (descargarPDF) descargarPDF.addEventListener('click', () => _generarPDF(false));
        var vistaPreviaPDF = document.getElementById('vistaPreviaPDFBtn');
        if (vistaPreviaPDF) vistaPreviaPDF.addEventListener('click', () => _generarPDF(true));

        var imprimirPreview = document.getElementById('imprimirVistaPreviaBtn');
        if (imprimirPreview) imprimirPreview.addEventListener('click', function () {
            var el = document.getElementById('vistaPreviaImprimible');
            if (!el) return;
            var html = '<!DOCTYPE html><html><head><title>Vista previa - Cotización</title><style>body{font-family:Inter,sans-serif;padding:20px;}</style></head><body>' + el.innerHTML + '</body></html>';
            var blob = new Blob([html], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
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
            var mc = document.getElementById('chkMostrarCanceladas');
            mostrarCanceladas = mc ? mc.checked : false;
            _syncChipEstado();
            _applyFilters();
        });
        // Toggle mostrar canceladas - cambio reactivo
        var chkCanceladas = document.getElementById('chkMostrarCanceladas');
        if (chkCanceladas) {
            chkCanceladas.addEventListener('change', function() {
                mostrarCanceladas = this.checked;
                _applyFilters();
            });
        }
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

        // Delegated click handler para tarjetas Kanban (abre historial)
        var kanbanContainer = document.getElementById('kanbanContainer');
        if (kanbanContainer) {
            kanbanContainer.addEventListener('click', function (e) {
                var card = e.target.closest('.kanban-card');
                if (!card) return;
                var id = card.getAttribute('data-id');
                var tipo = card.getAttribute('data-tipo') || 'cotizacion';
                if (id) ventasModule._abrirDetalle(id, tipo);
            });
        }

        // Setup de tabs de Historia Comercial (Operativo/Comercial/Gráfica y Pendientes/Emitidas)
        _setupHistoriaComercialTabs();
    }

    // ==================== HISTORIA COMERCIAL (Activas vs Cerradas unificadas) ====================
    let comercialTabActual = 'pendientes';

    function _renderHistoriaComercial() {
        const container = document.getElementById('historiaComercialContainer');
        if (!container) return;

        const unified = [];

        // Cotizaciones / Ventas
        (cotizaciones || []).forEach(function (c) {
            unified.push({
                id: c.id,
                folio: c.folio || (c.id ? String(c.id).slice(-6) : '—'),
                cliente: c.cliente || '—',
                estado: String(c.estado || '').toLowerCase(),
                estadoRaw: c.estado,
                total: c.total || 0,
                fecha: c.fecha_creacion || c.fecha || c.created_at,
                tipo: 'cotizacion',
                modulo: 'Ventas',
                moduloKey: 'ventas',
                url: null
            });
        });

        // Laboratorio (Taller)
        (taller || []).forEach(function (r) {
            unified.push({
                id: r.id,
                folio: r.folio || (r.id ? String(r.id).slice(-6) : '—'),
                cliente: r.cliente_nombre || r.cliente || '—',
                estado: String(r.estado || '').toLowerCase(),
                estadoRaw: r.estado,
                total: r.total || r.costo_venta || r.presupuesto || 0,
                fecha: r.fecha_ingreso || r.fecha_creacion || r.created_at || r.fecha,
                tipo: 'ordenes_taller',
                modulo: 'Laboratorio',
                moduloKey: 'taller',
                url: '/panel/pages/ssepi_taller.html?open=' + encodeURIComponent(r.id)
            });
        });

        // Motores
        (motores || []).forEach(function (r) {
            unified.push({
                id: r.id,
                folio: r.folio || (r.id ? String(r.id).slice(-6) : '—'),
                cliente: r.cliente_nombre || r.cliente || '—',
                estado: String(r.estado || '').toLowerCase(),
                estadoRaw: r.estado,
                total: r.total || r.costo_venta || r.presupuesto || 0,
                fecha: r.fecha_ingreso || r.fecha_creacion || r.created_at || r.fecha,
                tipo: 'ordenes_motores',
                modulo: 'Motores',
                moduloKey: 'motores',
                url: '/panel/pages/ssepi_motores.html?open=' + encodeURIComponent(r.id)
            });
        });

        // Automatización (Proyectos)
        (proyectos || []).forEach(function (r) {
            unified.push({
                id: r.id,
                folio: r.folio || (r.id ? String(r.id).slice(-6) : '—'),
                cliente: r.cliente || r.cliente_nombre || r.nombre || '—',
                estado: String(r.estado || '').toLowerCase(),
                estadoRaw: r.estado,
                total: r.total || r.presupuesto || r.costo_venta || 0,
                fecha: r.fecha_creacion || r.created_at || r.fecha,
                tipo: 'proyectos_automatizacion',
                modulo: 'Automatización',
                moduloKey: 'auto',
                url: '/panel/pages/ssepi_servicios.html?open=' + encodeURIComponent(r.id)
            });
        });

        // Aplicar filtro de fechas
        const filtradas = unified.filter(_fechaItemEnRango);

        // Clasificar activas vs cerradas
        const estadosCerrados = ['entregado','pagado','terminado','completado','cancelado','cancelada','facturado','archivado','cerrado'];
        const activas = filtradas.filter(function (i) { return !estadosCerrados.includes(i.estado); });
        const cerradas = filtradas.filter(function (i) { return estadosCerrados.includes(i.estado); });

        // Ordenar por fecha descendente
        activas.sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); });
        cerradas.sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); });

        if (comercialTabActual === 'pendientes') {
            _renderHistoriaTable('pendientesGrid', activas, 'activa');
        } else {
            _renderHistoriaTable('emitidasGrid', cerradas, 'cerrada');
        }
    }

    function _renderHistoriaTable(gridId, items, tipo) {
        const grid = document.getElementById(gridId);
        if (!grid) return;

        if (items.length === 0) {
            grid.innerHTML =
                '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">' +
                '<i class="fas fa-inbox" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>' +
                '<p>No hay órdenes ' + (tipo === 'activa' ? 'activas' : 'cerradas') + ' en este período.</p>' +
                '<small>Ajusta el rango de fechas para ver más resultados.</small>' +
                '</div>';
            return;
        }

        function esc(s) {
            var d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        }

        var rows = items.map(function (item) {
            var estadoClass = _getEstadoComercialClass(item.estadoRaw);
            var estadoLabel = _getEstadoComercialLabel(item.estadoRaw);
            var fechaStr = item.fecha ? new Date(item.fecha).toLocaleDateString('es-MX') : '--/--/----';
            var moduloClass = _getModuloBadgeClass(item.moduloKey);
            return '<tr class="historia-row" data-id="' + esc(item.id) + '" data-tipo="' + esc(item.tipo) + '" data-url="' + esc(item.url || '') + '">' +
                '<td><small>' + esc(fechaStr) + '</small></td>' +
                '<td><strong>' + esc(item.folio) + '</strong></td>' +
                '<td>' + esc(item.cliente) + '</td>' +
                '<td><span class="status-badge ' + moduloClass + '">' + esc(item.modulo) + '</span></td>' +
                '<td><span class="status-badge ' + estadoClass + '">' + esc(estadoLabel) + '</span></td>' +
                '<td style="text-align:right;">' + esc('$' + (item.total || 0).toFixed(2)) + '</td>' +
                '<td style="white-space:nowrap;">' +
                '<button type="button" class="btn-ssepi btn-ventas btn-hist-ver" style="font-size:12px;padding:4px 10px;margin-right:4px;"><i class="fas fa-eye"></i> Ver</button>' +
                '<button type="button" class="btn-ssepi btn-secondary btn-hist-edit" style="font-size:12px;padding:4px 10px;"><i class="fas fa-edit"></i> Editar</button>' +
                '</td>' +
                '</tr>';
        }).join('');

        grid.innerHTML =
            '<table class="lista-table">' +
            '<thead><tr><th>Fecha</th><th>Folio</th><th>Cliente</th><th>Módulo</th><th>Estado</th><th style="text-align:right;">Total</th><th>Acción</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>';

        grid.querySelectorAll('.historia-row').forEach(function (row) {
            row.querySelector('.btn-hist-ver')?.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = row.dataset.id;
                var tipo = row.dataset.tipo;
                var url = row.dataset.url;
                if (url) window.location.href = url;
                else _abrirDetalle(id, tipo);
            });
            row.querySelector('.btn-hist-edit')?.addEventListener('click', function (e) {
                e.stopPropagation();
                ventasModule._editarVenta(row.dataset.id, row.dataset.tipo);
            });
            row.addEventListener('click', function () {
                var url = row.dataset.url;
                if (url) window.location.href = url;
                else _abrirDetalle(row.dataset.id, row.dataset.tipo);
            });
        });
    }

    function _getModuloBadgeClass(key) {
        var map = { ventas: 'status-cotizacion', taller: 'status-info', motores: 'status-warning', auto: 'status-success' };
        return map[key] || 'status-pendiente';
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
                const suministros = document.getElementById('suministrosContainer');

                kanban.style.display = 'none';
                lista.style.display = 'none';
                comercial.style.display = 'none';
                grafica.style.display = 'none';
                if (suministros) suministros.style.display = 'none';

                if (tabName === 'operativo') {
                    kanban.style.display = 'flex';
                    vistaActual = 'kanban';
                    _applyFilters();
                } else if (tabName === 'comercial') {
                    comercial.style.display = 'block';
                    _renderHistoriaComercial();
                } else if (tabName === 'suministros') {
                    if (suministros) suministros.style.display = 'block';
                    _renderSuministros();
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

    function _clienteContactoParaPdf(nombreCliente) {
        const base = calculadoraClienteActual || {};
        const n = String(nombreCliente || base.nombre || '').trim().toLowerCase();
        let c = null;
        if (base.contactoId && contactos.length) {
            c = contactos.find((x) => String(x.id) === String(base.contactoId));
        }
        if (!c && n && contactos.length) {
            c = contactos.find((x) => {
                const a = String(x.nombre || x.empresa || '').trim().toLowerCase();
                const e = String(x.empresa || '').trim().toLowerCase();
                return a === n || e === n || a.includes(n) || n.includes(a);
            });
        }
        return {
            nombre: c?.nombre || base.nombre || nombreCliente || '',
            empresa: c?.empresa || base.empresa || '',
            email: c?.email || base.email || document.getElementById('editEmail')?.value || '',
            telefono: c?.telefono || base.telefono || document.getElementById('editTelefono')?.value || '',
            rfc: c?.rfc || base.rfc || document.getElementById('editRFC')?.value || '',
            direccion: c?.direccion || base.direccion || '',
            puesto: c?.puesto || '',
            logo_url: c?.logo_url || null
        };
    }

    function _generarPDF(preview = false) {
        const cliente = (document.getElementById('editCliente')?.value || document.getElementById('previewCliente')?.innerText || '').trim();
        const rfc = (document.getElementById('editRFC')?.value || '').trim();
        const total = parseFloat(document.getElementById('editTotal')?.value || '') || 0;
        const departamento = ventasWizardCerebro?.departamento || 'Ventas';

        if (!cliente) {
            _showToast('Cliente requerido para generar el PDF.', 'info');
            return;
        }
        if (!total || total <= 0) {
            _showToast('Antes de generar PDF, calcula el costo final (Total).', 'info');
            return;
        }

        const folio = (document.getElementById('previewFolio')?.innerText || '').trim() || (editingCotizacionId ? (cotizaciones.find(c => c.id === editingCotizacionId)?.folio || 'COT-####') : 'COT-####');

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
        const cc = _clienteContactoParaPdf(cliente);

        const pdfData = {
            folio,
            cliente: cc.empresa || cc.nombre || cliente,
            rfc: cc.rfc || rfc || 'XAXX010101000',
            email: cc.email,
            telefono: cc.telefono,
            direccion: cc.direccion,
            clienteContacto: cc,
            clienteLogo: cc.logo_url,
            items,
            subtotal,
            iva,
            total,
            departamento,
            actividades: actividadesDiarias.length > 0 ? [...actividadesDiarias] : null
        };

        (async () => {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                await pdfGenerator.generate({ departamento, datos: pdfData, tipo: 'cotizacion', preview }, user);
                if (!preview) _addToFeed('🧾', `PDF generado: ${folio}`);
            } catch (error) {
                console.error(error);
                _showToast('Error al generar PDF: ' + error.message, 'error');
            }
        })();
    }

    async function _generarPDFDesdeHistorial(id, tipo) {
        const item = _findRegistroVentas(id, tipo);
        if (!item) { _showToast('Registro no encontrado', 'error'); return; }
        const cc = _clienteContactoParaPdf(item.cliente || item.cliente_nombre);
        const datos = {
            folio: item.folio || id.slice(-6),
            cliente: cc.empresa || cc.nombre || item.cliente || 'Cliente',
            rfc: cc.rfc || item.rfc || 'XAXX010101000',
            email: cc.email || item.email || '',
            telefono: cc.telefono || item.telefono || '',
            direccion: cc.direccion || '',
            clienteContacto: cc,
            clienteLogo: cc.logo_url,
            items: (item.items || []).map(i => {
                const raw = String(i.nombre || i.descripcion || i.desc || '').trim();
                const titulo = raw.includes(' — ') ? raw.split(' — ')[0].trim() : raw;
                return {
                    nombre: titulo,
                    descripcion: titulo,
                    sku: i.sku || i.especificaciones || '',
                    cantidad: i.cantidad || i.qty || 1,
                    precio_unitario: i.precio_unitario || i.price || 0,
                    importe: i.importe || (i.cantidad || 1) * (i.precio_unitario || 0)
                };
            }),
            subtotal: item.subtotal || 0,
            iva: item.iva || 0,
            total: item.total || 0,
            departamento: item.departamento || 'Ventas'
        };
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            await pdfGenerator.generateCotizacion(datos, user);
            _addToFeed('🧾', `PDF generado: ${datos.folio}`);
        } catch (error) {
            console.error(error);
            _showToast('Error al generar PDF: ' + error.message, 'error');
        }
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    // ===== FLUJO COMERCIAL: Confirmación / Cancelación / Garantía =====
    async function _clienteConfirmoOperativo(ordenId, tipo) {
        if (!confirm('¿El cliente confirmó la cotización? El área técnica podrá continuar con el desarrollo.')) return;
        const t = _normalizarTipoRegistro(tipo);
        const csrfToken = sessionStorage.getItem('csrfToken');
        const patch = {
            estado: 'Confirmado',
            fecha_confirmacion_cliente: new Date().toISOString(),
            espera_confirmacion_cliente: false,
            updated_at: new Date().toISOString()
        };
        const notifPara = t === 'motor' ? 'motores' : (t === 'proyecto' ? 'automatizacion' : 'taller');
        const smTipo = t === 'motor' ? 'motor' : (t === 'proyecto' ? 'proyecto' : 'taller');
        try {
            if (t === 'motor') {
                await motoresService.update(ordenId, patch, csrfToken);
            } else if (t === 'proyecto') {
                await proyectosService.update(ordenId, patch, csrfToken);
            } else {
                await tallerService.update(ordenId, patch, csrfToken);
            }
            const item = _findRegistroVentas(ordenId, t);
            if (window.SSEPIStateMachine) {
                await SSEPIStateMachine.actualizarEstadoOrden(
                    window.supabase, smTipo, ordenId, 'cliente_confirmo',
                    'Cliente confirmó — ' + (item?.folio || ordenId), csrfToken
                );
            }
            await notificacionesService.insert({
                para: notifPara,
                tipo: 'cliente_confirmo',
                orden_id: ordenId,
                folio: item?.folio || '',
                cliente: item?.cliente || item?.cliente_nombre || item?.nombre || '',
                mensaje: `Ventas: el cliente confirmó ${item?.folio || 'la orden'}. Puede continuar desarrollo/ejecución.`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);
            if (item) item.estado = 'Confirmado';
            _showToast('Cliente confirmó. Área técnica notificada.', 'success');
            _loadTaller();
            _loadMotores();
            _loadProyectos();
            _renderOperativasVentasList();
            _renderPipelineCards();
            document.getElementById('historialModal')?.classList.remove('active');
        } catch (e) {
            console.error(e);
            _showToast('Error al confirmar: ' + (e.message || e), 'error');
        }
    }

    async function _clienteCanceloOperativo(ordenId, tipo) {
        const motivo = prompt('Motivo de cancelación (opcional):') || '';
        if (!confirm('¿El cliente canceló? Se cerrará la orden operativa.')) return;
        const t = _normalizarTipoRegistro(tipo);
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const patch = { estado: 'Cancelado', motivo_cancelacion: motivo, updated_at: new Date().toISOString() };
            if (t === 'motor') await motoresService.update(ordenId, patch, csrfToken);
            else if (t === 'proyecto') await proyectosService.update(ordenId, patch, csrfToken);
            else await tallerService.update(ordenId, patch, csrfToken);
            const item = _findRegistroVentas(ordenId, t);
            if (item) item.estado = 'Cancelado';
            _showToast('Orden cancelada por decisión del cliente.', 'warning');
            _loadTaller();
            _loadMotores();
            _loadProyectos();
            _renderOperativasVentasList();
            document.getElementById('historialModal')?.classList.remove('active');
        } catch (e) {
            console.error(e);
            _showToast('Error al cancelar: ' + (e.message || e), 'error');
        }
    }

    async function _clienteConfirmo(cotizacionId) {
        if (!confirm('¿El cliente confirmó la cotización? Se notificará al departamento técnico para proceder.')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await cotizacionesService.update(cotizacionId, { estado: 'confirmado', confirmacion_cliente: 'confirmado', fecha_confirmacion_cliente: new Date().toISOString() }, csrfToken);
            const c = cotizaciones.find(x => x.id === cotizacionId);
            if (c) await _persistirOrdenTrasConfirmacionCliente(c);
            if (c && c.orden_origen_id) {
                const tipoMap = { taller: 'taller', motor: 'motores', proyecto: 'automatizacion', soporte: 'soporte' };
                const para = tipoMap[c.origen] || c.origen || 'taller';
                await notificacionesService.insert({
                    para,
                    tipo: 'cliente_confirmo',
                    orden_id: c.orden_origen_id,
                    cotizacion_id: cotizacionId,
                    folio: c.folio,
                    cliente: c.cliente || c.cliente_nombre,
                    mensaje: `Cliente confirmó cotización ${c.folio}. Proceda con la reparación/ejecución.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
            }
            _showToast('Cliente confirmó. Departamento técnico notificado.', 'success');
            _applyFilters();
        } catch (e) {
            console.error(e);
            _showToast('Error al confirmar: ' + e.message, 'error');
        }
    }

    async function _clienteCancelo(cotizacionId) {
        const motivo = prompt('Motivo de cancelación (opcional):') || '';
        if (!confirm('¿El cliente canceló la cotización? Se cerrará la orden y se cancelará la compra vinculada.')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await cotizacionesService.update(cotizacionId, { estado: 'cancelado', confirmacion_cliente: 'cancelado', motivo_cancelacion: motivo, fecha_confirmacion_cliente: new Date().toISOString() }, csrfToken);
            const c = cotizaciones.find(x => x.id === cotizacionId);
            if (c && c.orden_origen_id) {
                // Actualizar orden operativa a Cancelado
                const tipo = c.origen || 'taller';
                const tabla = tipo === 'motor' ? 'ordenes_motores' : (tipo === 'proyecto' ? 'proyectos_automatizacion' : (tipo === 'soporte' ? 'soporte_visitas' : 'ordenes_taller'));
                try { await window.supabase.from(tabla).update({ estado: 'Cancelado' }).eq('id', c.orden_origen_id); } catch (e2) {}
                // Cancelar compra vinculada
                try {
                    const { data: cmp } = await window.supabase.from('compras').select('id').eq('vinculacion->>id', c.orden_origen_id).limit(1).single();
                    if (cmp) await window.supabase.from('compras').update({ estado: 0, estado_interno: 'cancelado' }).eq('id', cmp.id);
                } catch (e3) {}
            }
            _showToast('Cotización cancelada.', 'warning');
            _applyFilters();
        } catch (e) {
            console.error(e);
            _showToast('Error al cancelar: ' + e.message, 'error');
        }
    }

    async function _activarGarantia(ordenId, tipoOrden) {
        if (!confirm('¿Activar garantía para esta orden? Se creará una nueva orden en estado Garantía-Diagnóstico.')) return;
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const tabla = tipoOrden === 'motor' ? 'ordenes_motores' : (tipoOrden === 'proyecto' ? 'proyectos_automatizacion' : (tipoOrden === 'soporte' ? 'soporte_visitas' : 'ordenes_taller'));
            const { data: orden } = await window.supabase.from(tabla).select('*').eq('id', ordenId).single();
            if (!orden) { _showToast('Orden no encontrada', 'error'); return; }

            const nuevoFolio = (orden.folio || 'G') + '-G1';
            const nuevaOrden = { ...orden };
            delete nuevaOrden.id;
            delete nuevaOrden.created_at;
            nuevaOrden.folio = nuevoFolio;
            nuevaOrden.estado = 'Garantía';
            nuevaOrden.es_garantia = true;
            nuevaOrden.garantia_origen_id = ordenId;
            nuevaOrden.fecha_ingreso = new Date().toISOString();
            nuevaOrden.notas_generales = (orden.notas_generales || '') + '\n\n[GARANTÍA] Orden activada desde ' + orden.folio;

            const inserted = await window.supabase.from(tabla).insert(nuevaOrden).select().single();
            if (inserted.data) {
                await notificacionesService.insert({
                    para: tipoOrden === 'motor' ? 'motores' : (tipoOrden === 'proyecto' ? 'automatizacion' : 'taller'),
                    tipo: 'garantia_activada',
                    orden_id: inserted.data.id,
                    folio: nuevoFolio,
                    cliente: orden.cliente_nombre || orden.cliente,
                    mensaje: `Garantía activada: ${nuevoFolio}. Proceda con diagnóstico.`,
                    leido: false,
                    fecha: new Date().toISOString()
                }, csrfToken);
                _showToast('Garantía activada: ' + nuevoFolio, 'success');
                _applyFilters();
            }
        } catch (e) {
            console.error(e);
            _showToast('Error al activar garantía: ' + e.message, 'error');
        }
    }

    return {
        init,
        _nuevaCotizacion,
        _abrirRegistroRapido,
        _guardarRegistroRapido,
        _abrirCalculadora,
        _agregarComponente,
        _eliminarComponente,
        _autoCompletarComponente,
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
        _eliminarVenta,
        _generarPDFDesdeHistorial,
        _insertarEventoHistorial,
        _getFolioOrdenVinculada,
        _renderKanbanCardsAsync,
        _verPDFSuministro,
        _descargarPDFSuministro,
        _confirmarCompraSuministro,
        _enviarAFacturacionSuministro,
        _clienteCanceloSuministro,
        _clienteConfirmo,
        _clienteConfirmoOperativo,
        _clienteCancelo,
        _clienteCanceloOperativo,
        _activarGarantia
    };
})();

window.ventasModule = VentasModule;