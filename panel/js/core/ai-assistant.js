// ================================================
// ARCHIVO: ai-assistant.js
// DESCRIPCIÓN: Asistente IA para análisis inteligente de datos ERP
// FUNCIONALIDAD: Procesamiento de datos de Ventas, Taller, Motores, Automatización y Compras
// ================================================

export const AIAssistant = (function() {
    // ==================== ESTADO PRIVADO ====================
    let _dataCache = {
        ventas: [],
        taller: [],
        motores: [],
        automatizacion: [],
        compras: [],
        proyectos: []
    };
    let _lastUpdate = null;
    let _supabase = null;

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('[AI Assistant] Inicializando...');
        _supabase = window.supabaseClient || (window.supabase && window.supabase.supabaseClient);

        if (!_supabase) {
            console.error('[AI Assistant] Supabase client no disponible');
            return false;
        }

        await refreshData();
        console.log('[AI Assistant] Inicializado correctamente');
        return true;
    }

    // ==================== ACTUALIZACIÓN DE DATOS ====================
    async function refreshData() {
        console.log('[AI Assistant] Actualizando caché de datos...');

        try {
            // Ventas
            const { data: ventasData, error: ventasError } = await _supabase
                .from('ventas')
                .select('*')
                .order('fecha', { ascending: false })
                .limit(100);
            if (!ventasError) _dataCache.ventas = ventasData || [];

            // Taller
            const { data: tallerData, error: tallerError } = await _supabase
                .from('ordenes_taller')
                .select('*')
                .order('fecha_ingreso', { ascending: false })
                .limit(100);
            if (!tallerError) _dataCache.taller = tallerData || [];

            // Motores
            const { data: motoresData, error: motoresError } = await _supabase
                .from('ordenes_motores')
                .select('*')
                .order('fecha_ingreso', { ascending: false })
                .limit(100);
            if (!motoresError) _dataCache.motores = motoresData || [];

            // Automatización/Proyectos
            const { data: autoData, error: autoError } = await _supabase
                .from('proyectos_automatizacion')
                .select('*')
                .order('fecha_inicio', { ascending: false })
                .limit(100);
            if (!autoError) _dataCache.automatizacion = autoData || [];

            // Compras
            const { data: comprasData, error: comprasError } = await _supabase
                .from('compras')
                .select('*')
                .order('fecha', { ascending: false })
                .limit(100);
            if (!comprasError) _dataCache.compras = comprasData || [];

            _lastUpdate = new Date();
            console.log('[AI Assistant] Datos actualizados:', {
                ventas: _dataCache.ventas.length,
                taller: _dataCache.taller.length,
                motores: _dataCache.motores.length,
                automatizacion: _dataCache.automatizacion.length,
                compras: _dataCache.compras.length
            });

            return true;
        } catch (error) {
            console.error('[AI Assistant] Error actualizando datos:', error);
            return false;
        }
    }

    // ==================== ANÁLISIS DE VENTAS ====================
    function analizarVentas() {
        const ventas = _dataCache.ventas || [];
        const ahora = new Date();

        // Ventas del mes actual
        const ventasMes = ventas.filter(v => {
            const fecha = new Date(v.fecha);
            return fecha.getMonth() === ahora.getMonth() &&
                   fecha.getFullYear() === ahora.getFullYear();
        });

        // Tasa de conversión (cotizaciones → ventas cerradas)
        const totalCotizaciones = ventas.length;
        const ventasCerradas = ventas.filter(v => v.estado === 'Cerrado' || v.estado === 'Aprobado').length;
        const tasaConversion = totalCotizaciones > 0 ? (ventasCerradas / totalCotizaciones * 100).toFixed(1) : 0;

        // Ticket promedio
        const totalVentas = ventasCerradas > 0
            ? ventas.filter(v => v.estado === 'Cerrado' || v.estado === 'Aprobado')
                .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0)
            : 0;
        const ticketPromedio = ventasCerradas > 0 ? totalVentas / ventasCerradas : 0;

        // Top vendedores
        const ventasPorVendedor = {};
        ventas.forEach(v => {
            const vendedor = v.vendedor || 'Sin asignar';
            if (!ventasPorVendedor[vendedor]) {
                ventasPorVendedor[vendedor] = { count: 0, total: 0 };
            }
            ventasPorVendedor[vendedor].count++;
            ventasPorVendedor[vendedor].total += parseFloat(v.total) || 0;
        });

        const topVendedores = Object.entries(ventasPorVendedor)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([nombre, datos]) => ({ nombre, ventas: datos.count, total: datos.total.toFixed(2) }));

        return {
            totalCotizaciones,
            ventasMes: ventasMes.length,
            ventasCerradas,
            tasaConversion: parseFloat(tasaConversion),
            ticketPromedio: ticketPromedio.toFixed(2),
            totalVentas: totalVentas.toFixed(2),
            topVendedores,
            recomendaciones: _generarRecomendacionesVentas(ventas, { tasaConversion, ticketPromedio, ventasCerradas })
        };
    }

    function _generarRecomendacionesVentas(ventas, metricas) {
        const recomendaciones = [];

        if (metricas.tasaConversion < 30) {
            recomendaciones.push({
                tipo: 'conversion',
                prioridad: 'alta',
                mensaje: `La tasa de conversión (${metricas.tasaConversion}%) está por debajo del 30%. Considera revisar el seguimiento a cotizaciones pendientes.`
            });
        }

        const pendientes = ventas.filter(v => v.estado === 'Pendiente' || v.estado === 'En seguimiento').length;
        if (pendientes > 10) {
            recomendaciones.push({
                tipo: 'seguimiento',
                prioridad: 'media',
                mensaje: `Hay ${pendientes} cotizaciones pendientes de seguimiento. Prioriza las de mayor valor.`
            });
        }

        if (metricas.ventasCerradas < 5) {
            recomendaciones.push({
                tipo: 'volumen',
                prioridad: 'alta',
                mensaje: 'Volumen de ventas bajo este mes. Considera campañas de reactivación de clientes.'
            });
        }

        return recomendaciones;
    }

    // ==================== ANÁLISIS DE TALLER/MOTORES ====================
    function analizarTallerYMotors() {
        const taller = _dataCache.taller || [];
        const motores = _dataCache.motores || [];

        // Estados
        const estadosTaller = _contarPorEstado(taller, 'estado');
        const estadosMotores = _contarPorEstado(motores, 'estado');

        // Tiempo promedio en reparación
        const completadosTaller = taller.filter(t => t.estado === 'Completado' || t.estado === 'Listo para entregar');
        const tiempoPromedioTaller = _calcularTiempoPromedio(completadosTaller, 'fecha_ingreso', 'fecha_entrega');

        // Órdenes retrasadas (más de 7 días en progreso)
        const ordenesRetrasadas = _identificarOrdenesRetrasadas(taller.concat(motores));

        // Utilización del taller
        const enProgreso = taller.filter(t => t.estado === 'En progreso' || t.estado === 'Reparación').length +
                          motores.filter(m => m.estado === 'En progreso' || m.estado === 'Reparación').length;
        const capacidadUtilizacion = Math.min((enProgreso / 20) * 100, 100).toFixed(1); // 20 es capacidad máxima estimada

        return {
            taller: {
                total: taller.length,
                estados: estadosTaller,
                tiempoPromedio: tiempoPromedioTaller,
                enProgreso: enProgreso
            },
            motores: {
                total: motores.length,
                estados: estadosMotores
            },
            ordenesRetrasadas: ordenesRetrasadas.length,
            capacidadUtilizacion,
            recomendaciones: _generarRecomendacionesTaller(taller, motores, ordenesRetrasadas)
        };
    }

    function _contarPorEstado(ordenes, campoEstado) {
        const conteo = {};
        (ordenes || []).forEach(o => {
            const estado = o[campoEstado] || 'Sin estado';
            conteo[estado] = (conteo[estado] || 0) + 1;
        });
        return conteo;
    }

    function _calcularTiempoPromedio(ordenes, fechaInicio, fechaFin) {
        if (!ordenes || ordenes.length === 0) return 0;

        const tiempos = ordenes
            .filter(o => o[fechaInicio] && o[fechaFin])
            .map(o => {
                const inicio = new Date(o[fechaInicio]);
                const fin = new Date(o[fechaFin]);
                return (fin - inicio) / (1000 * 60 * 60 * 24); // días
            });

        return tiempos.length > 0
            ? (tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(1)
            : 'N/A';
    }

    function _identificarOrdenesRetrasadas(ordenes) {
        const ahora = new Date();
        const sieteDias = 7 * 24 * 60 * 60 * 1000;

        return (ordenes || []).filter(o => {
            if (o.estado === 'Completado' || o.estado === 'Entregado' || o.estado === 'Listo para entregar') return false;
            const fechaIngreso = o.fecha_ingreso ? new Date(o.fecha_ingreso) : null;
            if (!fechaIngreso) return false;
            return (ahora - fechaIngreso) > sieteDias;
        }).map(o => ({
            folio: o.folio,
            cliente: o.cliente_nombre,
            dias: Math.floor((ahora - new Date(o.fecha_ingreso)) / (1000 * 60 * 60 * 24)),
            estado: o.estado
        }));
    }

    function _generarRecomendacionesTaller(taller, motores, retrasadas) {
        const recomendaciones = [];

        if (retrasadas.length > 0) {
            recomendaciones.push({
                tipo: 'retraso',
                prioridad: 'alta',
                mensaje: `${retrasadas.length} órdenes llevan más de 7 días en proceso. Revisar capacidad del taller.`
            });
        }

        const espera = (taller || []).filter(t => t.estado === 'Espera de repuestos' || t.estado === 'En espera').length +
                      (motores || []).filter(m => m.estado === 'Espera de repuestos' || m.estado === 'En espera').length;

        if (espera > 5) {
            recomendaciones.push({
                tipo: 'repuestos',
                prioridad: 'media',
                mensaje: `${espera} órdenes en espera de repuestos. Coordinar con Compras.`
            });
        }

        return recomendaciones;
    }

    // ==================== ANÁLISIS DE COMPRAS ====================
    function analizarCompras() {
        const compras = _dataCache.compras || [];

        // Compras por estado
        const estados = _contarPorEstado(compras, 'estado');

        // Compras del mes
        const ahora = new Date();
        const comprasMes = compras.filter(c => {
            const fecha = new Date(c.fecha);
            return fecha.getMonth() === ahora.getMonth() &&
                   fecha.getFullYear() === ahora.getFullYear();
        });

        // Total gastado
        const totalGastado = comprasMes.reduce((sum, c) => sum + (parseFloat(c.total) || 0), 0);

        // Compras vinculadas a ventas/proyectos
        const vinculadas = compras.filter(c => c.orden_origen_id || c.vinculada_a_venta).length;
        const tasaVinculacion = compras.length > 0 ? (vinculadas / compras.length * 100).toFixed(1) : 0;

        // Proveedores más usados
        const proveedores = {};
        (compras || []).forEach(c => {
            const prov = c.proveedor || 'Sin proveedor';
            proveedores[prov] = (proveedores[prov] || 0) + 1;
        });
        const topProveedores = Object.entries(proveedores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([nombre, count]) => ({ nombre, compras: count }));

        return {
            totalCompras: compras.length,
            comprasMes: comprasMes.length,
            totalGastado: totalGastado.toFixed(2),
            estados,
            tasaVinculacion: parseFloat(tasaVinculacion),
            topProveedores,
            recomendaciones: _generarRecomendacionesCompras(compras, comprasMes)
        };
    }

    function _generarRecomendacionesCompras(compras, comprasMes) {
        const recomendaciones = [];

        const pendientes = (compras || []).filter(c => c.estado === 'Pendiente' || c.estado === 'Por recibir').length;
        if (pendientes > 5) {
            recomendaciones.push({
                tipo: 'pendientes',
                prioridad: 'media',
                mensaje: `${pendientes} compras pendientes de recibir. Dar seguimiento a proveedores.`
            });
        }

        const totalMes = comprasMes.reduce((sum, c) => sum + (parseFloat(c.total) || 0), 0);
        if (totalMes > 50000) {
            recomendaciones.push({
                tipo: 'presupuesto',
                prioridad: 'baja',
                mensaje: `Gasto mensual alto ($${totalMes.toFixed(2)}). Revisar presupuesto del mes.`
            });
        }

        return recomendaciones;
    }

    // ==================== ANÁLISIS DE PROYECTOS/AUTOMATIZACIÓN ====================
    function analizarProyectos() {
        const proyectos = _dataCache.automatizacion || [];

        // Estados
        const estados = _contarPorEstado(proyectos, 'estado');

        // Proyectos por tipo
        const tipos = {};
        (proyectos || []).forEach(p => {
            const tipo = p.tipo_proyecto || p.tipo || 'Sin tipo';
            tipos[tipo] = (tipos[tipo] || 0) + 1;
        });

        // Proyectos activos
        const activos = proyectos.filter(p => p.estado === 'En progreso' || p.estado === 'Activo').length;

        // Valor total de proyectos activos
        const valorActivos = proyectos
            .filter(p => p.estado === 'En progreso' || p.estado === 'Activo')
            .reduce((sum, p) => sum + (parseFloat(p.valor) || parseFloat(p.total) || 0), 0);

        return {
            totalProyectos: proyectos.length,
            activos,
            valorActivos: valorActivos.toFixed(2),
            estados,
            tipos,
            recomendaciones: _generarRecomendacionesProyectos(proyectos, activos)
        };
    }

    function _generarRecomendacionesProyectos(proyectos, activos) {
        const recomendaciones = [];

        if (activos > 5) {
            recomendaciones.push({
                tipo: 'capacidad',
                prioridad: 'media',
                mensaje: `${activos} proyectos activos. Monitorear capacidad del equipo de automatización.`
            });
        }

        const sinAvance = (proyectos || []).filter(p => {
            if (p.estado !== 'En progreso') return false;
            const ultimaAct = p.ultima_actualizacion ? new Date(p.ultima_actualizacion) : null;
            if (!ultimaAct) return false;
            return (new Date() - ultimaAct) > (14 * 24 * 60 * 60 * 1000); // 14 días sin actualización
        }).length;

        if (sinAvance > 0) {
            recomendaciones.push({
                tipo: 'seguimiento',
                prioridad: 'alta',
                mensaje: `${sinAvance} proyectos sin actualización en 2 semanas. Requieren seguimiento.`
            });
        }

        return recomendaciones;
    }

    // ==================== DASHBOARD CONSOLIDADO ====================
    function getDashboardConsolidado() {
        const ventas = analizarVentas();
        const taller = analizarTallerYMotors();
        const compras = analizarCompras();
        const proyectos = analizarProyectos();

        // KPIs principales
        const kpis = {
            ventasDelMes: ventas.ventasMes,
            tasaConversionVentas: ventas.tasaConversion,
            ticketPromedio: ventas.ticketPromedio,
            ordenesEnTaller: taller.taller.enProgreso,
            tiempoPromedioReparacion: taller.taller.tiempoPromedio,
            comprasPendientes: compras.estados['Pendiente'] || compras.estados['Por recibir'] || 0,
            proyectosActivos: proyectos.activos,
            valorProyectosActivos: proyectos.valorActivos
        };

        // Todas las recomendaciones consolidadas
        const todasRecomendaciones = [
            ...ventas.recomendaciones,
            ...taller.recomendaciones,
            ...compras.recomendaciones,
            ...proyectos.recomendaciones
        ].sort((a, b) => {
            const prioridadOrder = { 'alta': 0, 'media': 1, 'baja': 2 };
            return prioridadOrder[a.prioridad] - prioridadOrder[b.prioridad];
        });

        return {
            kpis,
            ventas,
            taller,
            compras,
            proyectos,
            recomendaciones: todasRecomendaciones,
            ultimaActualizacion: _lastUpdate
        };
    }

    // ==================== CONSULTAS EN LENGUAJE NATURAL ====================
    function consultar(query) {
        const q = query.toLowerCase();

        // Ventas
        if (q.includes('ventas') || q.includes('cotizaciones')) {
            if (q.includes('conversión') || q.includes('conversion')) {
                const data = analizarVentas();
                return `Tasa de conversión: ${data.tasaConversion}% (${data.ventasCerradas} ventas de ${data.totalCotizaciones} cotizaciones). Ticket promedio: $${data.ticketPromedio}`;
            }
            if (q.includes('mejor') || q.includes('top') || q.includes('vendedor')) {
                const data = analizarVentas();
                const top = data.topVendedores[0];
                return `Mejor vendedor: ${top.nombre} con ${top.ventas} ventas totaling $${top.total}`;
            }
            const data = analizarVentas();
            return `Ventas: ${data.totalCotizaciones} cotizaciones, ${data.ventasCerradas} cerradas (${data.tasaConversion}% conversión), ticket promedio $${data.ticketPromedio}`;
        }

        // Taller
        if (q.includes('taller') || q.includes('reparacion') || q.includes('laboratorio')) {
            const data = analizarTallerYMotors();
            return `Taller: ${data.taller.total} órdenes, ${data.taller.enProgreso} en progreso, tiempo promedio ${data.taller.tiempoPromedio} días. ${data.ordenesRetrasadas} retrasadas.`;
        }

        // Motores
        if (q.includes('motores')) {
            const data = analizarTallerYMotors();
            return `Motores: ${data.motores.total} órdenes. Estados: ${JSON.stringify(data.motores.estados)}`;
        }

        // Compras
        if (q.includes('compras')) {
            const data = analizarCompras();
            return `Compras: ${data.comprasMes} este mes, $${data.totalGastado} gastados, ${data.tasaVinculacion}% vinculadas a ventas/proyectos`;
        }

        // Proyectos/Automatización
        if (q.includes('proyectos') || q.includes('automatizacion') || q.includes('automatización')) {
            const data = analizarProyectos();
            return `Proyectos: ${data.totalProyectos} total, ${data.activos} activos, valor $${data.valorActivos}`;
        }

        // Recomendaciones/Alertas
        if (q.includes('recomendacion') || q.includes('alerta') || q.includes('pendiente')) {
            const dashboard = getDashboardConsolidado();
            const altas = dashboard.recomendaciones.filter(r => r.prioridad === 'alta');
            if (altas.length === 0) {
                return 'No hay alertas prioritarias en este momento.';
            }
            return 'Alertas prioritarias:\n' + altas.map(r => `• ${r.mensaje}`).join('\n');
        }

        // Resumen general
        if (q.includes('resumen') || q.includes('general') || q.includes('como estamos')) {
            const dashboard = getDashboardConsolidado();
            return `Resumen SSEPI:
- Ventas: ${dashboard.kpis.ventasDelMes} este mes, ${dashboard.kpis.tasaConversionVentas}% conversión
- Taller: ${dashboard.kpis.ordenesEnTaller} órdenes en progreso (${dashboard.kpis.tiempoPromedioReparacion} días promedio)
- Compras: ${dashboard.kpis.comprasPendientes} pendientes
- Proyectos: ${dashboard.kpis.proyectosActivos} activos ($${dashboard.kpis.valorProyectosActivos})
${dashboard.recomendaciones.length > 0 ? '\nRecomendaciones: ' + dashboard.recomendaciones.slice(0, 3).map(r => r.mensaje).join(' | ') : ''}`;
        }

        return 'No entendí tu consulta. Puedo ayudarte con información sobre ventas, taller, motores, compras o proyectos. Intenta preguntar como "¿Cómo están las ventas?" o "¿Qué órdenes están retrasadas?"';
    }

    // ==================== EXPORTAR PÚBLICO ====================
    return {
        init,
        refreshData,
        analizarVentas,
        analizarTallerYMotors,
        analizarCompras,
        analizarProyectos,
        getDashboardConsolidado,
        consultar,
        getDataCache: () => _dataCache
    };
})();

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.AIAssistant = AIAssistant;
}
