// ================================================
// ARCHIVO: facturacion.js
// DESCRIPCIÓN: Módulo de Facturación adaptado a Supabase
// BASADO EN: facturacion-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Visibilidad 360°, cálculo de costos, emisión de CFDI, notificaciones
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { CostosEngine } from '../core/costos-engine.js';
import { ContactosFormulas } from '../core/contactos-formulas.js';
import { notifyVentaIfEligible } from '../core/coi-sync-engine.js';
import { enqueueCoiJob } from '../core/coi-queue.js';

const FacturacionModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let ordenesTaller = [];           // órdenes de taller en estado 'Reparado'
    let ordenesMotores = [];          // órdenes de motores en estado 'Reparado'
    let ventas = [];                  // ventas pagadas (para consultar clientes)
    let contactos = [];               // contactos (para datos fiscales)
    let facturas = [];                // facturas emitidas

    let ordenSeleccionada = null;     // { tipo: 'taller', id: '...', data: {...} }
    let chartInstance = null;

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';

    // Servicios de datos
    const tallerService = createDataService('ordenes_taller');
    const motoresService = createDataService('ordenes_motores');
    const ventasService = createDataService('ventas');
    const contactosService = createDataService('contactos');
    const facturasService = createDataService('facturas');
    const ingresosService = createDataService('ingresos_contabilidad');
    const notificacionesService = createDataService('notificaciones');

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Facturación] Conectado');
        await _initUI();
        _bindEvents();
        _startListeners();
        _startClock();
        console.log('✅ Módulo facturación iniciado');
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

    // ==================== LISTENERS SUPABASE ====================
    function _startListeners() {
        // Órdenes de taller en estado "Reparado"
        const subTaller = supabase
            .channel('taller_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_taller', filter: 'estado=eq.Reparado' }, () => {
                _loadTaller();
            })
            .subscribe();
        subscriptions.push(subTaller);

        // Órdenes de motores en estado "Reparado"
        const subMotores = supabase
            .channel('motores_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_motores', filter: 'estado=eq.Reparado' }, () => {
                _loadMotores();
            })
            .subscribe();
        subscriptions.push(subMotores);

        // Ventas (para clientes)
        const subVentas = supabase
            .channel('ventas_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, payload => {
                _loadVentas();
                if (payload.new && payload.eventType !== 'DELETE') {
                    notifyVentaIfEligible(payload.new, payload.old);
                }
            })
            .subscribe();
        subscriptions.push(subVentas);

        // Contactos
        const subContactos = supabase
            .channel('contactos_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => {
                _loadContactos();
            })
            .subscribe();
        subscriptions.push(subContactos);

        // Facturas emitidas
        const subFacturas = supabase
            .channel('facturas_facturacion')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, () => {
                _loadFacturas();
            })
            .subscribe();
        subscriptions.push(subFacturas);

        // Carga inicial
        _loadTaller();
        _loadMotores();
        _loadVentas();
        _loadContactos();
        _loadFacturas();
    }

    async function _loadTaller() {
        const { data, error } = await supabase
            .from('ordenes_taller')
            .select('*')
            .eq('estado', 'Reparado')
            .order('fecha_reparacion', { ascending: false });
        if (error) console.error(error);
        else {
            ordenesTaller = data.map(d => ({ ...d, tipoOrigen: 'taller' }));
            _actualizarTodo();
        }
    }

    async function _loadMotores() {
        const { data, error } = await supabase
            .from('ordenes_motores')
            .select('*')
            .eq('estado', 'Reparado')
            .order('fecha_reparacion', { ascending: false });
        if (error) console.error(error);
        else {
            ordenesMotores = data.map(d => ({ ...d, tipoOrigen: 'motor' }));
            _actualizarTodo();
        }
    }

    async function _loadVentas() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase.from('ventas').select('*');
            if (error) console.error(error);
            else ventas = data;
        }
    }

    async function _loadContactos() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase.from('contactos').select('*');
            if (error) console.error(error);
            else contactos = data;
        }
    }

    async function _loadFacturas() {
        const supabase = _supabase();
        if (supabase) {
            const { data, error } = await supabase
                .from('facturas')
                .select('*')
                .order('fecha_emision', { ascending: false });
            if (error) console.error(error);
            else facturas = data;
        }
    }

    function _actualizarTodo() {
        _aplicarFiltros();
        _updateKPIs();
    }

    // ==================== FILTROS Y VISTAS ====================
    function _aplicarFiltros() {
        let pendientes = [...ordenesTaller, ...ordenesMotores];
        let emitidas = facturas;

        // Filtrar por fecha
        if (filtroFechaInicio && filtroFechaFin) {
            pendientes = pendientes.filter(o => {
                const f = new Date(o.fecha_reparacion || o.fecha_ingreso);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
            emitidas = emitidas.filter(f => {
                const fecha = new Date(f.fecha_emision);
                return fecha >= filtroFechaInicio && fecha <= filtroFechaFin;
            });
        }

        // Filtrar por estado
        if (filtroEstado !== 'todos') {
            if (filtroEstado === 'pendiente') emitidas = [];
            else if (filtroEstado === 'emitida') pendientes = [];
        }

        // Filtrar por búsqueda
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            pendientes = pendientes.filter(o => 
                (o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(term)) ||
                (o.folio && o.folio.toLowerCase().includes(term))
            );
            emitidas = emitidas.filter(f => 
                (f.cliente && f.cliente.toLowerCase().includes(term)) ||
                (f.folio_factura && f.folio_factura.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(pendientes, emitidas);
        else if (vistaActual === 'lista') _renderLista(pendientes, emitidas);
        else if (vistaActual === 'grafica') _renderGrafica(emitidas);
    }

    function _renderKanban(pendientes, emitidas) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        let html = `
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #ff9800;">
                    <span>⏳ Pendientes de Facturar</span>
                    <span class="badge" style="background: #ff9800;">${pendientes.length}</span>
                </div>
                <div class="kanban-cards">
                    ${pendientes.map(o => _crearCardPendiente(o)).join('')}
                </div>
            </div>
            <div class="kanban-column">
                <div class="kanban-header" style="border-bottom-color: #4caf50;">
                    <span>✅ Facturas Emitidas</span>
                    <span class="badge" style="background: #4caf50;">${emitidas.length}</span>
                </div>
                <div class="kanban-cards">
                    ${emitidas.map(f => _crearCardFactura(f)).join('')}
                </div>
            </div>
        `;
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card[data-id]').forEach(card => {
            card.addEventListener('click', () => _abrirDetalle(card.dataset.id, card.dataset.tipo));
        });
    }

    function _crearCardPendiente(orden) {
        const fecha = orden.fecha_reparacion ? new Date(orden.fecha_reparacion).toLocaleDateString() : '';
        return `
            <div class="kanban-card" data-id="${orden.id}" data-tipo="${orden.tipoOrigen}">
                <div class="card-header">
                    <span class="folio">${orden.folio || orden.id.slice(-6)}</span>
                    <span class="badge tipo-${orden.tipoOrigen}">${orden.tipoOrigen === 'taller' ? '🔧 Taller' : '⚙️ Motor'}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${orden.cliente_nombre || 'Cliente'}</div>
                </div>
                <div class="card-footer">
                    <small>Reparación: ${fecha}</small>
                </div>
            </div>
        `;
    }

    function _crearCardFactura(factura) {
        return `
            <div class="kanban-card" data-id="${factura.id}" data-tipo="factura">
                <div class="card-header">
                    <span class="folio">${factura.folio_factura || factura.id.slice(-6)}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${factura.cliente || 'Cliente'}</div>
                    <div class="total">$${(factura.total || 0).toFixed(2)}</div>
                </div>
                <div class="card-footer">
                    <small>${factura.fecha_emision ? new Date(factura.fecha_emision).toLocaleDateString() : ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(pendientes, emitidas) {
        const tbody = document.getElementById('facturacionTableBody');
        if (!tbody) return;
        let html = '';

        pendientes.forEach(o => {
            const fecha = o.fecha_reparacion ? new Date(o.fecha_reparacion).toLocaleDateString() : '—';
            const folio = o.folio || o.id.slice(-6);
            const cliente = o.cliente_nombre || 'N/A';
            const tipo = o.tipoOrigen === 'taller' ? 'Taller' : 'Motor';
            html += `
                <tr onclick="facturacionModule._abrirDetalle('${o.id}', '${o.tipoOrigen}')">
                    <td><span class="tipo-badge tipo-${o.tipoOrigen}">${tipo}</span></td>
                    <td><strong>${folio}</strong></td>
                    <td>${cliente}</td>
                    <td>${fecha}</td>
                    <td><span class="status-badge status-pendiente">Pendiente</span></td>
                    <td>—</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); facturacionModule._generarFactura('${o.id}', '${o.tipoOrigen}')">
                            <i class="fas fa-file-invoice"></i> Facturar
                        </button>
                    </td>
                </tr>
            `;
        });

        emitidas.forEach(f => {
            html += `
                <tr style="opacity:0.8;" onclick="facturacionModule._verPDF('${f.id}')">
                    <td><span class="tipo-badge tipo-factura">Factura</span></td>
                    <td><strong>${f.folio_factura || 'N/A'}</strong></td>
                    <td>${f.cliente || 'N/A'}</td>
                    <td>${f.fecha_emision ? new Date(f.fecha_emision).toLocaleDateString() : '—'}</td>
                    <td><span class="status-badge status-emitida">Emitida</span></td>
                    <td>$${(f.total || 0).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-success" title="Enviar a COI (cola)" onclick="event.stopPropagation(); facturacionModule._enviarFacturaACoi('${f.id}')">
                            <i class="fas fa-file-invoice"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); facturacionModule._verPDF('${f.id}')">
                            <i class="fas fa-file-pdf"></i> Ver
                        </button>
                    </td>
                </tr>
            `;
        });

        if (html === '') {
            html = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay registros</td></tr>';
        }
        tbody.innerHTML = html;
    }

    function _renderGrafica(emitidas) {
        const ctx = document.getElementById('facturacionChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const facturadoPorMes = new Array(12).fill(0);

        emitidas.forEach(f => {
            if (f.fecha_emision) {
                const fecha = new Date(f.fecha_emision);
                const mes = fecha.getMonth();
                facturadoPorMes[mes] += f.total || 0;
            }
        });

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Facturación ($)',
                    data: facturadoPorMes,
                    backgroundColor: 'rgba(0,82,204,0.1)',
                    borderColor: '#0052cc',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#0052cc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
            }
        });
    }

    function _updateKPIs() {
        const pendientes = ordenesTaller.length + ordenesMotores.length;

        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();

        let facturasMes = 0;
        let totalFacturadoMes = 0;

        facturas.forEach(f => {
            if (f.fecha_emision) {
                const fecha = new Date(f.fecha_emision);
                if (fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                    facturasMes++;
                    totalFacturadoMes += f.total || 0;
                }
            }
        });

        document.getElementById('kpiPendientes').innerText = pendientes;
        document.getElementById('kpiFacturasMes').innerText = facturasMes;
        document.getElementById('kpiTotalFacturado').innerHTML = `$${totalFacturadoMes.toFixed(2)}`;
        document.getElementById('kpiEmitidas').innerText = facturas.length;
    }

    // ==================== DETALLE DE ORDEN ====================
    function _abrirDetalle(id, tipo) {
        let orden = null;
        if (tipo === 'taller') orden = ordenesTaller.find(o => o.id === id);
        else if (tipo === 'motor') orden = ordenesMotores.find(o => o.id === id);
        else if (tipo === 'factura') return _verPDF(id);
        if (!orden) return;

        ordenSeleccionada = { ...orden, tipo };

        // Obtener datos del cliente desde contactos
        const contacto = contactos.find(c => c.nombre === orden.cliente_nombre || c.empresa === orden.cliente_nombre);

        // Calcular costos usando el motor
        const resultadoCalculo = _calcularCostosOrden(orden, contacto);

        _renderDetalleHTML(orden, contacto, resultadoCalculo);

        document.getElementById('detalleModal').classList.add('active');
        document.getElementById('generarFacturaBtn').style.display = 'inline-flex';
        document.getElementById('generarFacturaBtn').onclick = () => _generarFactura(orden.id, tipo);
    }

    function _calcularCostosOrden(orden, contacto) {
        const km = contacto ? ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa) : 0;
        const horasViaje = km > 0 ? Math.ceil(km / 50) : 0;
        const horasTaller = orden.horas_estimadas || 0;

        let costoRefacciones = 0;
        if (orden.componentes_inventario) {
            orden.componentes_inventario.forEach(comp => {
                costoRefacciones += (comp.costo_unitario || 100) * (comp.cantidad_usada || 0);
            });
        }
        if (orden.componentes_compra) {
            orden.componentes_compra.forEach(comp => {
                costoRefacciones += (comp.costo_unitario || 50) * (comp.cantidad_usada || 0);
            });
        }

        return CostosEngine.calcularPrecioFinal({ km, horasViaje, horasTaller, costoRefacciones });
    }

    function _renderDetalleHTML(orden, contacto, calculo) {
        const container = document.getElementById('detalleContenido');
        const fechaReparacion = orden.fecha_reparacion ? new Date(orden.fecha_reparacion).toLocaleString() : '—';
        const rfc = contacto?.rfc || 'XAXX010101000';

        let html = `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Resumen de la Orden</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><strong>Folio:</strong> ${orden.folio || orden.id.slice(-6)}</div>
                    <div><strong>Cliente:</strong> ${orden.cliente_nombre || 'N/A'}</div>
                    <div><strong>RFC:</strong> ${rfc}</div>
                    <div><strong>Fecha Reparación:</strong> ${fechaReparacion}</div>
                </div>
            </div>
        `;

        html += `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Detalle de Costos</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><strong>Gasolina:</strong> $${calculo.gasolina.toFixed(2)}</div>
                    <div><strong>Traslado Técnico:</strong> $${calculo.trasladoTecnico.toFixed(2)}</div>
                    <div><strong>Mano de Obra:</strong> $${calculo.manoObra.toFixed(2)}</div>
                    <div><strong>Gastos Fijos:</strong> $${calculo.gastosFijos.toFixed(2)}</div>
                    <div><strong>Camioneta:</strong> $${calculo.camioneta.toFixed(2)}</div>
                    <div><strong>Refacciones:</strong> $${calculo.refacciones.toFixed(2)}</div>
                </div>
                <div style="margin-top:15px; padding-top:15px; border-top:1px dashed var(--border);">
                    <div style="display:flex; justify-content:space-between;"><span><strong>Gastos Generales:</strong></span> <span>$${calculo.gastosGenerales.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between; color:var(--c-ventas);"><span><strong>+ Utilidad (${CostosEngine.CONFIG.utilidad}%):</strong></span> <span>$${calculo.precioConUtilidad.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between;"><span><strong>+ Crédito (${CostosEngine.CONFIG.credito}%):</strong></span> <span>$${calculo.precioAntesIVA.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between;"><span><strong>IVA (${CostosEngine.CONFIG.iva}%):</strong></span> <span>$${calculo.iva.toFixed(2)}</span></div>
                </div>
                <div style="margin-top:15px; font-size:18px; font-weight:800; color:var(--c-facturacion); text-align:right;">
                    TOTAL: $${calculo.total.toFixed(2)}
                </div>
            </div>
        `;

        if (orden.historial && orden.historial.length > 0) {
            html += `
                <div style="background:var(--bg-body); padding:20px; border-radius:12px;">
                    <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Historial</h4>
                    ${orden.historial.slice().reverse().map(h => `
                        <div style="border-bottom:1px solid var(--border); padding:8px 0;">
                            <small style="color:var(--text-muted);">${new Date(h.fecha).toLocaleString()}</small>
                            <div>${h.accion || h.mensaje || ''}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // ==================== GENERACIÓN DE FACTURA ====================
    function _generarFactura(id, tipo) {
        let orden = null;
        if (tipo === 'taller') orden = ordenesTaller.find(o => o.id === id);
        else if (tipo === 'motor') orden = ordenesMotores.find(o => o.id === id);
        if (!orden) return;

        const contacto = contactos.find(c => c.nombre === orden.cliente_nombre || c.empresa === orden.cliente_nombre);
        const calculo = _calcularCostosOrden(orden, contacto);

        const folioFactura = `F-${Date.now().toString().slice(-8)}`;
        const fecha = new Date().toISOString();
        const cliente = orden.cliente_nombre || 'Cliente';
        const rfc = contacto?.rfc || 'XAXX010101000';
        const total = calculo.total;
        const uuid = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        const preview = document.getElementById('facturaPreview');
        preview.innerHTML = `
            <div class="factura-header">
                <div class="factura-logo">
                    <h2>SSEPI</h2>
                    <p style="font-size:12px; color:#666;">Soluciones en Sistemas Eléctricos</p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px; color:#666;">FACTURA CFDI 4.0</div>
                    <div style="font-size:18px; font-weight:bold; color:var(--c-facturacion);">${folioFactura}</div>
                </div>
            </div>
            <div class="factura-datos">
                <div>
                    <strong>Emisor:</strong><br>
                    SSEPI AUTOMATIZACIÓN INDUSTRIAL<br>
                    RFC: SSE240317XXX<br>
                    Blvd. Zodiaco 336, Los Limones, León, GTO
                </div>
                <div>
                    <strong>Receptor:</strong><br>
                    ${cliente}<br>
                    RFC: ${rfc}
                </div>
            </div>
            <div style="margin:20px 0;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--c-facturacion); color:white;">
                            <th style="padding:10px; text-align:left;">Cant.</th>
                            <th style="padding:10px; text-align:left;">Descripción</th>
                            <th style="padding:10px; text-align:right;">Precio Unit.</th>
                            <th style="padding:10px; text-align:right;">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding:8px; border-bottom:1px solid #ddd;">1</td>
                            <td style="padding:8px; border-bottom:1px solid #ddd;">Servicio de reparación (${orden.folio})</td>
                            <td style="padding:8px; text-align:right; border-bottom:1px solid #ddd;">$${(calculo.precioAntesIVA).toFixed(2)}</td>
                            <td style="padding:8px; text-align:right; border-bottom:1px solid #ddd;">$${(calculo.precioAntesIVA).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div style="text-align:right; margin-top:20px;">
                <div><strong>Subtotal:</strong> $${(calculo.precioAntesIVA).toFixed(2)}</div>
                <div><strong>IVA 16%:</strong> $${(calculo.iva).toFixed(2)}</div>
                <div style="font-size:18px; font-weight:800; color:var(--c-facturacion);">Total: $${(calculo.total).toFixed(2)}</div>
            </div>
            <div style="margin-top:30px; padding:15px; background:#f5f5f5; border-radius:8px; font-size:11px;">
                <p><strong>UUID:</strong> ${uuid}</p>
                <p><strong>Fecha de timbrado:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Sello digital:</strong> 5OCvBu8CEl2yERjGyZgntfev+Bk=</p>
            </div>
        `;

        document.getElementById('facturaModal').classList.add('active');
        document.getElementById('detalleModal').classList.remove('active');

        document.getElementById('timbrarFacturaBtn').onclick = () => _timbrarFactura(orden, folioFactura, uuid, calculo, contacto);
    }

    async function _timbrarFactura(orden, folioFactura, uuid, calculo, contacto) {
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            const facturaData = {
                folio_factura: folioFactura,
                orden_taller_id: orden.tipoOrigen === 'taller' ? orden.id : null,
                orden_motor_id: orden.tipoOrigen === 'motor' ? orden.id : null,
                cliente: orden.cliente_nombre,
                rfc: contacto?.rfc || 'XAXX010101000',
                fecha_emision: new Date().toISOString(),
                subtotal: calculo.precioAntesIVA,
                iva: calculo.iva,
                total: calculo.total,
                uuid_cfdi: uuid,
                estatus: 'activa',
                pdf_url: '',
                xml_url: '',
                created_at: new Date().toISOString()
            };
            const facturaRef = await facturasService.insert(facturaData, csrfToken);
            // Encolar para COI (factura timbrada)
            enqueueCoiJob({
                erp_source: 'factura',
                erp_id: String(facturaRef?.id || uuid || folioFactura),
                folio: folioFactura,
                idempotency_key: `factura:${facturaRef?.id || uuid || folioFactura}`,
                payload_json: { ...facturaData, id: facturaRef?.id },
            }).then(r => {
                if (!r.ok) console.warn('[COI queue] Factura no encolada:', r.error?.message || r.error || r);
            });

            // Actualizar la orden de taller/motor a "Facturado"
            const updateData = { estado: 'Facturado', factura_id: facturaRef.id, folio_factura: folioFactura, fecha_factura: new Date().toISOString() };
            if (orden.tipoOrigen === 'taller') {
                await tallerService.update(orden.id, updateData, csrfToken);
            } else {
                await motoresService.update(orden.id, updateData, csrfToken);
            }

            // Registrar ingreso en contabilidad
            await ingresosService.insert({
                folio: folioFactura,
                monto_total: calculo.total,
                iva: calculo.iva,
                subtotal: calculo.precioAntesIVA,
                cliente: orden.cliente_nombre,
                fecha_pago: new Date().toISOString().split('T')[0],
                tipo_servicio: 'reparacion',
                orden_taller_id: orden.tipoOrigen === 'taller' ? orden.id : null,
                orden_motor_id: orden.tipoOrigen === 'motor' ? orden.id : null,
                uuid_cfdi: uuid,
                timestamp: new Date().toISOString()
            }, csrfToken);

            // Notificar a Ventas
            await notificacionesService.insert({
                para: 'ventas',
                tipo: 'factura_generada',
                orden_id: orden.id,
                factura_id: facturaRef.id,
                folio: folioFactura,
                cliente: orden.cliente_nombre,
                mensaje: `Factura ${folioFactura} generada - Lista para entrega`,
                leido: false,
                fecha: new Date().toISOString()
            }, csrfToken);

            alert('✅ Factura timbrada y registrada correctamente');
            document.getElementById('facturaModal').classList.remove('active');
            _addToFeed('✅', `Factura ${folioFactura} generada para ${orden.cliente_nombre}`);
        } catch (error) {
            console.error(error);
            alert('Error al timbrar factura: ' + error.message);
        }
    }

    async function _enviarFacturaACoi(facturaId) {
        const f = (facturas || []).find(x => x.id === facturaId);
        if (!f) { alert('Factura no encontrada.'); return; }
        try {
            const payload = { ...f };
            const r = await enqueueCoiJob({
                erp_source: 'factura',
                erp_id: String(f.id || f.uuid_cfdi || f.folio_factura),
                folio: f.folio_factura || null,
                idempotency_key: `factura:${f.id || f.uuid_cfdi || f.folio_factura}`,
                payload_json: payload
            });
            if (!r.ok) throw (r.error || new Error('No se pudo encolar'));
            alert('✅ Enviada a COI (cola).');
        } catch (e) {
            alert('Error: ' + (e?.message || e));
        }
    }

    function _verPDF(id) {
        alert('Funcionalidad: Visualizar PDF de factura (pendiente implementación)');
    }

    // ==================== FEED ====================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta"><span style="color:var(--c-facturacion);">FACTURACIÓN</span><span>${new Date().toLocaleTimeString()}</span></div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('closeDetalleModal').addEventListener('click', () => {
            document.getElementById('detalleModal').classList.remove('active');
        });
        document.getElementById('closeFacturaModal').addEventListener('click', () => {
            document.getElementById('facturaModal').classList.remove('active');
        });

        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            filtroEstado = document.getElementById('filtroEstado').value;
            filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _aplicarFiltros();
        });

        document.getElementById('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _aplicarFiltros();
        });
        document.getElementById('vistaLista').addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _aplicarFiltros();
        });
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
            _aplicarFiltros();
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

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirDetalle,
        _generarFactura,
        _verPDF,
        _enviarFacturaACoi
    };
})();

window.facturacionModule = FacturacionModule;