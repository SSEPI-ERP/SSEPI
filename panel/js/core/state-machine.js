// ============================================================================
// state-machine.js — Máquina de estados unificada SSEPI (pipeline 8 pasos)
// Cargar ANTES de los módulos que lo consumen (ventas.js, taller.js, etc.)
// ============================================================================
(function() {
    'use strict';

    const PIPELINE_PASOS = [
        { orden: 1, id: 'recepcion',    label: 'Recepción',      modulo: 'Ventas',           icono: '📥', color: '#3498db' },
        { orden: 2, id: 'diagnostico',  label: 'Diagnóstico',    modulo: 'Taller/Motores/Auto', icono: '🔬', color: '#9b59b6' },
        { orden: 3, id: 'cotizacion',   label: 'Cotización',     modulo: 'Ventas/Compras',   icono: '💰', color: '#f1c40f' },
        { orden: 4, id: 'autorizacion', label: 'Autorización',   modulo: 'Cliente',          icono: '✅', color: '#2ecc71' },
        { orden: 5, id: 'adquisicion',  label: 'Adquisición',    modulo: 'Compras',          icono: '🛒', color: '#e67e22' },
        { orden: 6, id: 'ejecucion',    label: 'Ejecución',      modulo: 'Taller/Motores/Auto', icono: '🔧', color: '#e74c3c' },
        { orden: 7, id: 'facturacion',  label: 'Facturación',    modulo: 'Facturación',      icono: '🧾', color: '#1abc9c' },
        { orden: 8, id: 'entrega',      label: 'Entrega',        modulo: 'Ventas',           icono: '🚚', color: '#27ae60' },
    ];

    // Cache del mapeo para lookups rápidos: __ESTADO_MAPA__[tabla][estado_nativo] = { paso, etiqueta }
    window.__ESTADO_MAPA__ = {};

    async function _cargarMapaDesdeSupabase() {
        if (!window.supabase) return;
        try {
            const { data, error } = await window.supabase
                .from('estado_pipeline_unificado')
                .select('tabla, estado_nativo, paso, etiqueta');
            if (error) { console.warn('[state-machine] Error cargando mapa:', error); return; }
            data.forEach(r => {
                if (!window.__ESTADO_MAPA__[r.tabla]) window.__ESTADO_MAPA__[r.tabla] = {};
                window.__ESTADO_MAPA__[r.tabla][r.estado_nativo] = { paso: r.paso, etiqueta: r.etiqueta };
            });
            console.log('[state-machine] Mapa de estados cargado:', Object.keys(window.__ESTADO_MAPA__).length, 'tablas');
        } catch (e) {
            console.warn('[state-machine] Error cargando mapa:', e);
        }
    }

    function obtenerPasoUnificado(tabla, estadoNativo) {
        const val = String(estadoNativo || '').trim();
        const r = window.__ESTADO_MAPA__?.[tabla]?.[val];
        if (r) return r;
        // Fallback local si no hay Supabase
        const map = {
            'ordenes_taller': { 'Nuevo':1,'Confirmado':1,'Diagnóstico':2,'En Espera':3,'En reparación':6,'En reparacion':6,'Reparado':7,'Entregado':8,'Facturado':8,'Cancelado':0 },
            'ordenes_motores': { 'Nuevo':1,'Diagnóstico':2,'En Espera':3,'Reparado':7,'Entregado':8 },
            'proyectos_automatizacion': {
                'pendiente':1,'progreso':6,'completado':8,'cancelado':0,
                'Pendiente':1,'Activo':6,'activo':6,'En progreso':6,'en progreso':6,'Completado':8,'Cerrado':8,'cerrado':8
            },
            'cotizaciones': { 'borrador':1,'pendiente_autorizacion_ventas':3,'Pendiente':3,'aprobada':4,'cancelada':0 },
            'compras': { '0':3,'1':5,'2':5,'3':5,'4':6,'5':6 },
            'ventas': { 'Pendiente':7,'Pagado':8 }
        };
        const tbl = map[tabla];
        if (!tbl) return null;
        let paso = tbl[val];
        if (paso == null && val) {
            const low = val.toLowerCase();
            for (const k of Object.keys(tbl)) {
                if (k.toLowerCase() === low) { paso = tbl[k]; break; }
            }
        }
        return paso != null ? { paso, etiqueta: obtenerEtiquetaPaso(paso) } : null;
    }

    /** Para pipeline Ventas: deriva id de paso (recepcion, diagnostico, …) desde estado nativo de cada tabla. */
    function derivarEstatusActualDesdeNativo(tabla, item) {
        if (!item) return null;
        if (item.estatus_actual) return item.estatus_actual;
        const raw = item.estado != null ? item.estado : item.estatus;
        if (raw === undefined || raw === null || String(raw).trim() === '') return null;
        const candidates = [];
        const s = String(raw).trim();
        candidates.push(s, s.toLowerCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
        for (const key of candidates) {
            const r = obtenerPasoUnificado(tabla, key);
            if (r && r.paso != null) {
                const id = obtenerEtiquetaPaso(r.paso);
                return id === 'cancelado' ? 'cancelado' : id;
            }
        }
        return null;
    }

    function obtenerEtiquetaPaso(pasoOrden) {
        if (pasoOrden === 0) return 'cancelado';
        return PIPELINE_PASOS.find(p => p.orden === pasoOrden)?.id || 'recepcion';
    }

    function obtenerInfoPaso(estatusId) {
        return PIPELINE_PASOS.find(p => p.id === estatusId) || PIPELINE_PASOS[0];
    }

    function renderTimelineHTML(estatusActual, opts) {
        opts = opts || {};
        const activoIdx = PIPELINE_PASOS.findIndex(p => p.id === estatusActual);
        const indiceActual = activoIdx >= 0 ? activoIdx : 0;
        const progreso = (indiceActual / (PIPELINE_PASOS.length - 1)) * 100;

        return `<div class="timeline-container"><div class="timeline">
            <div class="timeline-progress" style="width: ${progreso}%; background: ${PIPELINE_PASOS[indiceActual]?.color || '#3498db'};"></div>
            ${PIPELINE_PASOS.map((paso, idx) => {
                let clase = '';
                if (idx < indiceActual) clase = 'completed';
                else if (idx === indiceActual) clase = 'active current';
                return `<div class="timeline-step ${clase}" data-step="${paso.id}">
                    <div class="timeline-icon" style="${clase.includes('active') ? 'box-shadow: 0 0 0 4px ' + paso.color + '33;' : ''}">${paso.icono}</div>
                    <div class="timeline-label">${paso.label}</div>
                </div>`;
            }).join('')}</div></div>`;
    }

    async function actualizarEstadoOrden(supabase, tipo, id, evento, descripcion, csrfToken, metadata) {
        if (!supabase) { console.warn('[state-machine] supabase no disponible'); return null; }
        metadata = metadata || {};

        const columnMap = {
            cotizacion: 'cotizacion_id',
            venta: 'cotizacion_id',
            taller: 'orden_taller_id',
            motor: 'orden_motor_id',
            proyecto: 'proyecto_id',
            compra: 'cotizacion_id', // compras se vinculan vía cotización si existe
            automatizacion: 'proyecto_id'
        };
        const col = columnMap[tipo];
        if (!col) { console.warn('[state-machine] Tipo no mapeado:', tipo); return null; }

        let perfil = null;
        try { perfil = await authService.getCurrentProfile(); } catch(e) {}

        const row = {
            [col]: id,
            evento,
            descripcion,
            metadata,
            creado_por: perfil?.usuarios_id || null
        };

        try {
            // Deduplicación: si en los últimos 5 segundos hay un evento idéntico, actualizar descripción en vez de insertar duplicado
            const desde = new Date(Date.now() - 5000).toISOString();
            const { data: dup, error: dupErr } = await supabase
                .from('orden_historial')
                .select('id, descripcion, metadata')
                .eq(col, id)
                .eq('evento', evento)
                .gte('creado_en', desde)
                .order('creado_en', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (dup && !dupErr) {
                const { data: upd, error: updErr } = await supabase
                    .from('orden_historial')
                    .update({ descripcion, metadata, creado_en: new Date().toISOString() })
                    .eq('id', dup.id)
                    .select()
                    .single();
                if (updErr) console.warn('[state-machine] Error en upsert deduplicado:', updErr);
                return upd;
            }

            const { data, error } = await supabase
                .from('orden_historial')
                .insert(row)
                .select()
                .single();

            if (error) {
                // Fallback: si la FK no existe, quitarla y reintentar
                if (col === 'cotizacion_id' && (error.message?.includes('does not exist') || error.code === '42703')) {
                    delete row.cotizacion_id;
                    row.descripcion = `[cotización ${id}] ${descripcion}`;
                    const { data: d2, error: e2 } = await supabase.from('orden_historial').insert(row).select().single();
                    if (e2) { console.warn('[state-machine] Fallback insert falló:', e2); return null; }
                    return d2;
                }
                console.warn('[state-machine] Error insertando evento:', error);
                return null;
            }
            return data;
        } catch (err) {
            console.error('[state-machine] Excepción en actualizarEstadoOrden:', err);
            return null;
        }
    }

    async function obtenerHistorialUnificado(supabase, tipo, id) {
        if (!supabase) return [];
        const columnMap = { cotizacion: 'cotizacion_id', venta: 'cotizacion_id', taller: 'orden_taller_id', motor: 'orden_motor_id', proyecto: 'proyecto_id' };
        const col = columnMap[tipo];
        if (!col) return [];
        const { data, error } = await supabase
            .from('orden_historial')
            .select('*')
            .eq(col, id)
            .order('creado_en', { ascending: false });
        if (error) { console.warn('[state-machine] Error cargando historial:', error); return []; }
        return data || [];
    }

    // Auto-cargar mapa al inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _cargarMapaDesdeSupabase);
    } else {
        _cargarMapaDesdeSupabase();
    }

    // =====================================================
    // REGLAS DE INTEGRIDAD: helpers para UI
    // =====================================================
    function puedeEliminar(item) {
        if (!item) return false;
        // Cuarentena bloquea TODO
        if (item.bloqueo_contable === true) return false;
        // Solo permitir eliminar en etapas iniciales
        const estatus = item.estatus_actual || item.estado || '';
        const eliminables = ['recepcion', 'diagnostico', 'Nuevo', 'Diagnostico', 'pendiente', 'borrador'];
        return eliminables.includes(estatus);
    }

    function estaEnCuarentena(item) {
        return item?.bloqueo_contable === true;
    }

    function badgeCuarentenaHTML() {
        return '<span class="badge-cuarentena" title="Orden en cuarentena contable. Acciones congeladas.">🚫 CUARENTENA</span>';
    }

    // =====================================================
    // CONEXIÓN SSEPI-COI: helpers para UI
    // =====================================================
    async function obtenerEventoCOI(supabase, tablaOrigen, registroId) {
        if (!supabase || !tablaOrigen || !registroId) return null;
        try {
            const { data, error } = await supabase
                .from('eventos_contables_coi')
                .select('*')
                .eq('tabla_origen', tablaOrigen)
                .eq('registro_id', registroId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) { console.warn('[state-machine] Error consultando COI:', error); return null; }
            return data;
        } catch (e) {
            console.warn('[state-machine] Excepción consultando COI:', e);
            return null;
        }
    }

    function badgeCOIHTML(evento) {
        if (!evento) return '';
        const estatus = evento.estatus_coi || 'pendiente';
        const cls = estatus === 'procesado' ? 'coi-badge-ok' : estatus === 'error' ? 'coi-badge-err' : 'coi-badge-pend';
        const icon = estatus === 'procesado' ? '✅' : estatus === 'error' ? '⚠️' : '⏳';
        return `<span class="coi-badge ${cls}" title="Evento contable COI: ${estatus} | ${evento.concepto || ''}">${icon} COI</span>`;
    }

    // Exponer globalmente
    window.SSEPIStateMachine = {
        PIPELINE_PASOS,
        obtenerPasoUnificado,
        derivarEstatusActualDesdeNativo,
        obtenerEtiquetaPaso,
        obtenerInfoPaso,
        renderTimelineHTML,
        actualizarEstadoOrden,
        obtenerHistorialUnificado,
        puedeEliminar,
        estaEnCuarentena,
        badgeCuarentenaHTML,
        obtenerEventoCOI,
        badgeCOIHTML
    };
})();
