// facturacion-core.js - Módulo de Facturación y Cierre Financiero V2.0
// Dependencias: window.db, window.CostosEngine

const FacturacionManager = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let t_a = [];               // órdenes de taller (solo las reparadas)
    let v_a = [];               // ventas (para consultar clientes)
    let contactos_a = [];       // contactos (para datos fiscales)
    let f_a = [];               // facturas emitidas

    let chartInstance = null;
    let ordenSeleccionada = null; // { tipo: 'taller', id: '...', data: {...} }

    // Unsubscribes
    let u_t = null;
    let u_v = null;
    let u_c = null;
    let u_f = null;

    // ==========================================================================
    // 2. VALIDACIÓN
    // ==========================================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ==========================================================================
    // 3. INICIALIZACIÓN
    // ==========================================================================
    function init() {
        if (!__x()) { window.location.href = 'ssepi_website.html'; return; }
        _initUI();
        _bindEvents();
        _startListeners();
        _initFilters();
        _startClock();
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    function _startClock() {
        setInterval(() => {
            const el = document.getElementById('clock');
            if (el) el.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    function _initFilters() {
        // Filtros de estado
        document.querySelectorAll('.filtro-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                _renderTable();
                _renderKanban();
            });
        });

        // Selector de período
        document.querySelectorAll('.periodo-option').forEach(opt => {
            opt.addEventListener('click', function(e) {
                document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                _toggleDatePicker(this.dataset.period);
                _aplicarFiltroFecha();
            });
        });

        // Vistas
        document.querySelectorAll('.vistas-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                document.querySelectorAll('.vistas-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                _switchView(this.dataset.view);
            });
        });

        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', function(e) {
            _filterSearch(e.target.value);
        });

        // Date pickers
        document.getElementById('datePicker').addEventListener('change', _aplicarFiltroFecha);
        document.getElementById('monthPicker').addEventListener('change', _aplicarFiltroFecha);
        document.getElementById('yearPicker').addEventListener('change', _aplicarFiltroFecha);

        // Cerrar modales
        document.getElementById('closeDetalleModal').addEventListener('click', () => {
            document.getElementById('detalleModal').classList.remove('active');
        });
        document.getElementById('closeFacturaModal').addEventListener('click', () => {
            document.getElementById('facturaModal').classList.remove('active');
        });
    }

    function _toggleDatePicker(period) {
        document.getElementById('datePicker').style.display = period === 'day' ? 'inline-block' : 'none';
        document.getElementById('monthPicker').style.display = period === 'month' ? 'inline-block' : 'none';
        document.getElementById('yearPicker').style.display = period === 'year' ? 'inline-block' : 'none';
    }

    function _aplicarFiltroFecha() {
        _renderTable();
        _renderKanban();
        _renderChart();
        _updateKPIs();
    }

    function _filterSearch(term) {
        const rows = document.querySelectorAll('#facturacionTableBody tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term.toLowerCase()) ? '' : 'none';
        });
    }

    function _switchView(view) {
        document.getElementById('tableView').classList.remove('active');
        document.getElementById('kanbanView').classList.remove('active');
        document.getElementById('chartView').classList.remove('active');
        document.getElementById(view + 'View').classList.add('active');

        if (view === 'kanban') _renderKanban();
        if (view === 'chart') _renderChart();
    }

    // ==========================================================================
    // 4. LISTENERS FIRESTORE
    // ==========================================================================
    function _startListeners() {
        if (!window.db) return;

        // Órdenes de taller en estado "Reparado" (listas para facturar)
        u_t = window.db.collection('ordenes_taller')
            .where('estado', '==', 'Reparado')
            .orderBy('fechaReparacion', 'desc')
            .onSnapshot(snap => {
                t_a = snap.docs.map(d => ({ id: d.id, ...d.data(), tipoOrigen: 'taller' }));
                _actualizarTodo();
            }, console.error);

        // (Opcional) Proyectos de automatización terminados
        // u_p = window.db.collection('proyectos_automatizacion')...

        // Ventas (para obtener datos de clientes)
        u_v = window.db.collection('ventas').onSnapshot(snap => {
            v_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }, console.error);

        // Contactos (para datos fiscales de clientes)
        u_c = window.db.collection('contactos').onSnapshot(snap => {
            contactos_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }, console.error);

        // Facturas emitidas
        u_f = window.db.collection('facturas').orderBy('fechaEmision', 'desc').onSnapshot(snap => {
            f_a = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            _renderTable(); // Refresca la tabla para mostrar facturas
            _renderKanban();
            _updateKPIs();
        }, console.error);
    }

    function _actualizarTodo() {
        _renderTable();
        _renderKanban();
        _renderChart();
        _updateKPIs();
        _addToFeed('🔄', 'Datos de facturación actualizados');
    }

    // ==========================================================================
    // 5. RENDERIZADO DE TABLA PRINCIPAL (Órdenes Listas para Facturar)
    // ==========================================================================
    function _renderTable() {
        const tbody = document.getElementById('facturacionTableBody');
        if (!tbody) return;

        // Combinar órdenes listas para facturar (Taller reparado)
        let listas = [...t_a];

        // Aplicar filtro de fecha
        listas = _filtrarPorFecha(listas);

        if (listas.length === 0 && f_a.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay registros para facturar</td></tr>';
            return;
        }

        // Ordenar por fecha de reparación (más reciente primero)
        listas.sort((a, b) => new Date(b.fechaReparacion) - new Date(a.fechaReparacion));

        let html = '';
        // Primero las órdenes listas para facturar
        listas.forEach(o => {
            html += _generarFilaOrden(o);
        });
        // Luego el historial de facturas ya emitidas
        f_a.forEach(f => {
            html += _generarFilaFactura(f);
        });

        tbody.innerHTML = html;
    }

    function _generarFilaOrden(orden) {
        const folio = orden.folio || orden.id?.slice(-6) || 'N/A';
        const cliente = orden.cliente_nombre || 'N/A';
        const fecha = orden.fechaReparacion ? new Date(orden.fechaReparacion).toLocaleDateString() : '—';

        return `
            <tr onclick="FacturacionManager._abrirDetalle('${orden.id}', 'taller')">
                <td><span class="status-badge tipo-taller">Taller</span></td>
                <td><strong>${folio}</strong></td>
                <td>${cliente}</td>
                <td>—</td>
                <td><span class="status-badge status-proceso">Listo</span></td>
                <td>—</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); FacturacionManager._generarFactura('${orden.id}', 'taller')">
                        <i class="fas fa-file-invoice"></i> Facturar
                    </button>
                </td>
            </tr>
        `;
    }

    function _generarFilaFactura(factura) {
        return `
            <tr style="opacity:0.8;">
                <td><span class="status-badge tipo-factura">Factura</span></td>
                <td><strong>${factura.folioFactura || 'N/A'}</strong></td>
                <td>${factura.cliente || 'N/A'}</td>
                <td>${factura.fechaEmision ? new Date(factura.fechaEmision).toLocaleDateString() : '—'}</td>
                <td><span class="status-badge status-completado">Emitida</span></td>
                <td>$${(factura.total || 0).toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); FacturacionManager._verPDF('${factura.id}')">
                        <i class="fas fa-file-pdf"></i> Ver
                    </button>
                </td>
            </tr>
        `;
    }

    function _filtrarPorFecha(arr) {
        const now = new Date();
        const periodoActual = document.querySelector('.periodo-option.active')?.dataset.period || 'month';
        let inicio, fin;

        if (periodoActual === 'day') {
            const fecha = document.getElementById('datePicker').value;
            if (fecha) {
                inicio = new Date(fecha); inicio.setHours(0,0,0,0);
                fin = new Date(fecha); fin.setHours(23,59,59,999);
            }
        } else if (periodoActual === 'month') {
            const mes = parseInt(document.getElementById('monthPicker').value);
            if (!isNaN(mes)) {
                inicio = new Date(now.getFullYear(), mes, 1);
                fin = new Date(now.getFullYear(), mes + 1, 0, 23, 59, 59);
            }
        } else if (periodoActual === 'year') {
            const año = parseInt(document.getElementById('yearPicker').value);
            if (año) {
                inicio = new Date(año, 0, 1);
                fin = new Date(año, 11, 31, 23, 59, 59);
            }
        }

        if (!inicio || !fin) return arr;

        return arr.filter(o => {
            const fecha = o.fechaReparacion || o.fechaEmision;
            if (!fecha) return false;
            const f = new Date(fecha);
            return f >= inicio && f <= fin;
        });
    }

    // ==========================================================================
    // 6. RENDERIZADO DE KANBAN
    // ==========================================================================
    function _renderKanban() {
        const listas = t_a; // Órdenes de taller reparadas
        const emitidas = f_a; // Facturas emitidas

        document.getElementById('kanbanPendientesCount').innerText = listas.length;
        document.getElementById('kanbanEmitidasCount').innerText = emitidas.length;

        _renderKanbanCol('kanbanPendientes', listas, 'pendiente');
        _renderKanbanCol('kanbanEmitidas', emitidas, 'emitida');
    }

    function _renderKanbanCol(containerId, items, tipo) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin elementos</div>';
            return;
        }

        container.innerHTML = items.slice(0, 15).map(item => {
            let titulo, subtitulo, id, onclick;
            if (tipo === 'pendiente') {
                titulo = item.folio || item.id.slice(-6);
                subtitulo = item.cliente_nombre || 'Cliente';
                id = item.id;
                onclick = `FacturacionManager._abrirDetalle('${id}', 'taller')`;
            } else {
                titulo = item.folioFactura;
                subtitulo = item.cliente;
                id = item.id;
                onclick = `FacturacionManager._verPDF('${id}')`;
            }
            return `
                <div class="kanban-card" onclick="${onclick}">
                    <div style="font-weight:900;">${titulo}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin:5px 0;">${subtitulo}</div>
                    ${tipo === 'emitida' ? `<div style="font-weight:700; color:var(--c-facturacion);">$${(item.total || 0).toFixed(2)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // ==========================================================================
    // 7. GRÁFICA
    // ==========================================================================
    function _renderChart() {
        const ctx = document.getElementById('facturacionChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const facturadoPorMes = new Array(12).fill(0);

        f_a.forEach(f => {
            const fecha = f.fechaEmision ? new Date(f.fechaEmision) : null;
            if (fecha) {
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
                    backgroundColor: 'rgba(0,172,193,0.1)',
                    borderColor: '#00acc1',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#00acc1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => '$' + v.toLocaleString() }
                    }
                }
            }
        });
    }

    // ==========================================================================
    // 8. DETALLE DE ORDEN (CON CÁLCULO DE COSTOS)
    // ==========================================================================
    function _abrirDetalle(id, tipo) {
        let orden = null;
        if (tipo === 'taller') {
            orden = t_a.find(o => o.id === id);
        }
        if (!orden) return;

        ordenSeleccionada = { ...orden, tipo };

        // Obtener datos del cliente desde contactos para el RFC
        const contacto = contactos_a.find(c => c.nombre === orden.cliente_nombre || c.empresa === orden.cliente_nombre);

        // Calcular costos usando el motor unificado
        const resultadoCalculo = _calcularCostosOrden(orden, contacto);

        // Renderizar detalle
        _renderDetalleHTML(orden, contacto, resultadoCalculo);

        document.getElementById('detalleModal').classList.add('active');
    }

    function _calcularCostosOrden(orden, contacto) {
        // 1. Obtener km y horas del tabulador (o de contactos-formulas)
        const km = (contacto && typeof window.ContactosFormulas !== 'undefined')
            ? window.ContactosFormulas.getKmPorCliente(contacto.nombre || contacto.empresa)
            : 0;

        // 2. Horas de viaje: asumimos 1 hora por cada 50km (o usar dato de tabulador si existe)
        const horasViaje = km > 0 ? Math.ceil(km / 50) : 0;

        // 3. Horas de taller (de la orden)
        const horasTaller = orden.horas_estimadas || 0;

        // 4. Costo de refacciones (inventario + compra)
        let costoRefacciones = 0;

        // Componentes de inventario (costo * cantidad_usada)
        if (orden.componentes_inventario && orden.componentes_inventario.length > 0) {
            orden.componentes_inventario.forEach(comp => {
                // Necesitaríamos el costo unitario del inventario. Por ahora, simulamos.
                // Ideal: Hacer una consulta a window.InventarioManager o pasar el costo en el objeto.
                costoRefacciones += (comp.costo_unitario || 100) * (comp.cantidad_usada || 0);
            });
        }

        // Componentes de compra (costo * cantidad_usada)
        if (orden.componentes_compra && orden.componentes_compra.length > 0) {
            orden.componentes_compra.forEach(comp => {
                costoRefacciones += (comp.costo_unitario || 50) * (comp.cantidad_usada || 0);
            });
        }

        // 5. Calcular precio final usando el motor
        return window.CostosEngine.calcularPrecioFinal({
            km: km,
            horasViaje: horasViaje,
            horasTaller: horasTaller,
            costoRefacciones: costoRefacciones
        });
    }

    function _renderDetalleHTML(orden, contacto, calculo) {
        const container = document.getElementById('detalleContenido');
        const facturaBtn = document.getElementById('generarFacturaBtn');

        facturaBtn.style.display = 'inline-flex';
        facturaBtn.onclick = () => _generarFactura(orden.id, 'taller');

        const fechaReparacion = orden.fechaReparacion ? new Date(orden.fechaReparacion).toLocaleString() : '—';

        let html = `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Resumen de la Orden</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><strong>Folio Taller:</strong> ${orden.folio || orden.id.slice(-6)}</div>
                    <div><strong>Cliente:</strong> ${orden.cliente_nombre || 'N/A'}</div>
                    <div><strong>RFC:</strong> ${contacto?.rfc || 'XAXX010101000'}</div>
                    <div><strong>Fecha Reparación:</strong> ${fechaReparacion}</div>
                </div>
            </div>
        `;

        html += `
            <div style="background:var(--bg-body); padding:20px; border-radius:12px; margin-bottom:20px;">
                <h4 style="color:var(--c-facturacion); margin-bottom:15px;">Detalle de Costos (Según Motor de Cálculo)</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><strong>Gasolina:</strong> $${calculo.gasolina.toFixed(2)}</div>
                    <div><strong>Traslado Técnico:</strong> $${calculo.trasladoTecnico.toFixed(2)}</div>
                    <div><strong>Mano de Obra:</strong> $${calculo.manoObra.toFixed(2)}</div>
                    <div><strong>Gastos Fijos:</strong> $${calculo.gastosFijos.toFixed(2)}</div>
                    <div><strong>Camioneta:</strong> $${calculo.camioneta.toFixed(2)}</div>
                    <div><strong>Refacciones:</strong> $${calculo.refacciones.toFixed(2)}</div>
                </div>
                <div style="margin-top:15px; padding-top:15px; border-top:1px dashed var(--border);">
                    <div style="display:flex; justify-content:space-between;">
                        <span><strong>Gastos Generales:</strong></span>
                        <span>$${calculo.gastosGenerales.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:var(--c-ventas);">
                        <span><strong>+ Utilidad (${window.CostosEngine.CONFIG.utilidad}%):</strong></span>
                        <span>$${calculo.precioConUtilidad.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span><strong>+ Crédito (${window.CostosEngine.CONFIG.credito}%):</strong></span>
                        <span>$${calculo.precioAntesIVA.toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span><strong>IVA (${window.CostosEngine.CONFIG.iva}%):</strong></span>
                        <span>$${calculo.iva.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;

        // Historial si existe
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

    // ==========================================================================
    // 9. GENERACIÓN DE FACTURA (Timbrado y Registro)
    // ==========================================================================
    function _generarFactura(id, tipo) {
        let orden = t_a.find(o => o.id === id);
        if (!orden) return;

        // Re-calcular para asegurar datos frescos
        const contacto = contactos_a.find(c => c.nombre === orden.cliente_nombre);
        const calculo = _calcularCostosOrden(orden, contacto);

        // Preparar datos para factura
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

        // Configurar botón de timbrado
        document.getElementById('timbrarFacturaBtn').onclick = () => _timbrarFactura(orden, folioFactura, uuid, calculo, contacto);
    }

    async function _timbrarFactura(orden, folioFactura, uuid, calculo, contacto) {
        if (!__x() || !window.db) return;

        try {
            // 1. Crear el registro de factura en Firestore
            const facturaData = {
                folioFactura: folioFactura,
                ordenTallerId: orden.id,
                folioTaller: orden.folio,
                cliente: orden.cliente_nombre,
                rfc: contacto?.rfc || 'XAXX010101000',
                fechaEmision: new Date().toISOString(),
                subtotal: calculo.precioAntesIVA,
                iva: calculo.iva,
                total: calculo.total,
                uuid: uuid,
                estatus: 'activa',
                pdfURL: '', // Se generaría después con jsPDF y se subiría a Storage
                xmlURL: '',
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            const facturaRef = await window.db.collection('facturas').add(facturaData);

            // 2. Actualizar la orden de taller a "Facturado"
            await window.db.collection('ordenes_taller').doc(orden.id).update({
                estado: 'Facturado',
                facturaId: facturaRef.id,
                folioFactura: folioFactura,
                fechaFactura: new Date().toISOString()
            });

            // 3. Registrar el ingreso en contabilidad (opcional, pero recomendado)
            await window.db.collection('ingresos_contabilidad').add({
                folio: folioFactura,
                monto_total: calculo.total,
                iva: calculo.iva,
                subtotal: calculo.precioAntesIVA,
                cliente: orden.cliente_nombre,
                fecha_pago: new Date().toISOString(),
                tipo_servicio: 'reparacion',
                orden_taller_id: orden.id,
                uuid: uuid,
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
            });

            // 4. Crear notificación para Ventas
            await window.db.collection('notificaciones').add({
                para: 'ventas',
                tipo: 'factura_generada',
                ordenId: orden.id,
                facturaId: facturaRef.id,
                folio: folioFactura,
                cliente: orden.cliente_nombre,
                mensaje: `Factura ${folioFactura} generada - Lista para entrega`,
                leido: false,
                fecha: new Date().toISOString()
            });

            alert('✅ Factura timbrada y registrada correctamente');
            document.getElementById('facturaModal').classList.remove('active');
            _addToFeed('✅', `Factura ${folioFactura} generada para ${orden.cliente_nombre}`);

        } catch (error) {
            console.error(error);
            alert('Error al timbrar factura: ' + error.message);
        }
    }

    function _verPDF(id) {
        alert('Funcionalidad: Visualizar PDF de factura');
        // Aquí se implementaría la lógica para mostrar el PDF almacenado
    }

    // ==========================================================================
    // 10. KPIs
    // ==========================================================================
    function _updateKPIs() {
        const pendientes = t_a.length;

        const now = new Date();
        const mesActual = now.getMonth();
        const añoActual = now.getFullYear();

        let facturasMes = 0;
        let totalFacturadoMes = 0;

        f_a.forEach(f => {
            const fecha = f.fechaEmision ? new Date(f.fechaEmision) : null;
            if (fecha && fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual) {
                facturasMes++;
                totalFacturadoMes += f.total || 0;
            }
        });

        document.getElementById('kpiPendientes').innerText = pendientes;
        document.getElementById('kpiFacturasMes').innerText = facturasMes;
        document.getElementById('kpiTotalFacturado').innerHTML = `$${totalFacturadoMes.toFixed(2)}`;
    }

    // ==========================================================================
    // 11. BITÁCORA
    // ==========================================================================
    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;

        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-facturacion);">FACTURACIÓN</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;

        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 10) feed.removeChild(feed.lastChild);

        const count = document.getElementById('feedCount');
        if (count) count.innerText = feed.children.length;
    }

    // ==========================================================================
    // 12. EVENTOS DOM
    // ==========================================================================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);
    }

    function _toggleMenu() {
        const sidebar = document.getElementById('sidebar');
        const body = document.body;
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('active');
        } else {
            body.classList.toggle('sidebar-closed');
        }
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
        // Re-renderizar gráfica con nuevos colores si es necesario
        _renderChart();
    }

    // ==========================================================================
    // 13. LIMPIEZA
    // ==========================================================================
    function _cleanup() {
        if (u_t) u_t();
        if (u_v) u_v();
        if (u_c) u_c();
        if (u_f) u_f();
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==========================================================================
    // 14. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init,
        _abrirDetalle: _abrirDetalle,
        _generarFactura: _generarFactura,
        _verPDF: _verPDF
    };
})();

// Sobrescribir el manager anterior
window.FacturacionManager = FacturacionManager;