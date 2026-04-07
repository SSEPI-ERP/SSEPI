// motores-core.js - SSEPI Taller de Motores V18
// Módulo completo con 5 pasos, listas de materiales y generación de compras

const MotoresCore = (function() {
    // ==========================================================================
    // 1. ESTADO PRIVADO
    // ==========================================================================
    let m_orders = [];               // órdenes de motores
    let m_clients = [];              // clientes desde contactos
    let m_inventory = [];            // inventario (refacciones y consumibles)
    let m_comprasVinculadas = {};    // { ordenId: { estado, folio } }
    
    // Estado de la orden actual
    let m_currentOrder = null;
    let m_orderId = null;
    let m_isNewOrder = true;
    let m_currentStep = 1;
    let m_fechaInicioOrden = null;
    let m_fechasEtapas = {};

    // Listas específicas
    let m_diagnosticoEnlaces = [];     // refacciones con link de compra
    let m_diagnosticoInventario = [];  // productos desde inventario
    let m_consumiblesUsados = [];      // consumibles usados
    let m_componentesInventario = [];  // componentes usados desde inventario
    let m_componentesCompra = [];      // componentes usados desde compra

    // Filtros
    let m_filtroEstado = 'all';
    let m_periodoActual = 'month';
    let m_filtroBuscar = '';
    let m_vistaActual = 'kanban';
    let m_tecnicos = ['Dani', 'Carlos', 'Mario'];

    // Unsubscribe
    let m_unsubscribe = null;

    // Gráfica
    let m_chartInstance = null;

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
        _loadInventory();
        _loadClients();
        _initFilters();
        _startClock();
        _addToFeed('🚀', 'Módulo de motores iniciado');
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
                m_filtroEstado = this.dataset.filter;
                _aplicarFiltros();
            });
        });

        // Selector de período
        document.querySelectorAll('.periodo-option').forEach(opt => {
            opt.addEventListener('click', function(e) {
                document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                m_periodoActual = this.dataset.period;
                _toggleDatePicker(this.dataset.period);
                _aplicarFiltros();
            });
        });

        // Vistas
        document.querySelectorAll('.vistas-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                document.querySelectorAll('.vistas-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                m_vistaActual = this.dataset.view;
                _switchView(this.dataset.view);
            });
        });

        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', function(e) {
            m_filtroBuscar = e.target.value.toLowerCase();
            _aplicarFiltros();
        });

        // Date pickers
        document.getElementById('datePicker').addEventListener('change', _aplicarFiltros);
        document.getElementById('monthPicker').addEventListener('change', _aplicarFiltros);
        document.getElementById('yearPicker').addEventListener('change', _aplicarFiltros);

        // Botones de nueva orden
        document.getElementById('newOrderBtn').addEventListener('click', _abrirNuevaOrden);
        document.getElementById('closeWsBtn').addEventListener('click', _cerrarModal);
        document.getElementById('cancelWsBtn').addEventListener('click', _cerrarModal);
        
        // Navegación de pasos
        document.querySelectorAll('.ws-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => _irPaso(parseInt(e.target.dataset.step)));
        });

        document.getElementById('prevStepBtn').addEventListener('click', _prevStep);
        document.getElementById('nextStepBtn').addEventListener('click', _nextStep);
        document.getElementById('saveOrderBtn').addEventListener('click', _guardarOrden);
        document.getElementById('completarEntregaBtn').addEventListener('click', _completarEntrega);
        document.getElementById('generarCompraBtn').addEventListener('click', _generarSolicitudCompra);
        document.getElementById('sinReparacionBtn').addEventListener('click', _sinReparacion);
        document.getElementById('terminarReparacionBtn').addEventListener('click', _terminarReparacion);

        // Botones de terminar etapa
        for (let i = 1; i <= 3; i++) {
            const btn = document.getElementById(`terminarEtapa${i}`);
            if (btn) {
                btn.addEventListener('click', () => _terminarEtapa(i));
            }
        }

        // Botones para agregar items
        document.getElementById('addEnlaceBtn').addEventListener('click', () => {
            m_diagnosticoEnlaces.push({ descripcion: '', sku: '', cantidad: 1, link: '' });
            _renderDiagnosticoEnlaces();
        });

        document.getElementById('addInventarioBtn').addEventListener('click', () => {
            m_diagnosticoInventario.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderDiagnosticoInventario();
        });

        document.getElementById('addConsumibleBtn').addEventListener('click', () => {
            m_consumiblesUsados.push({ sku: '', descripcion: '', cantidad: 1 });
            _renderConsumibles();
        });

        // Preview de imagen
        document.getElementById('productImage').addEventListener('change', _previewImage);
        document.getElementById('fotoEntrega').addEventListener('change', function(e) {
            const preview = document.getElementById('previewEntrega');
            if (e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%; max-height:120px;">`;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    function _toggleDatePicker(period) {
        document.getElementById('datePicker').style.display = period === 'day' ? 'inline-block' : 'none';
        document.getElementById('monthPicker').style.display = period === 'month' ? 'inline-block' : 'none';
        document.getElementById('yearPicker').style.display = period === 'year' ? 'inline-block' : 'none';
    }

    function _switchView(view) {
        document.getElementById('kanbanView').classList.remove('active');
        document.getElementById('tableView').classList.remove('active');
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

        // Órdenes de motores
        m_unsubscribe = window.db.collection('ordenes_motores')
            .orderBy('fechaIngreso', 'desc')
            .onSnapshot(snap => {
                m_orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _aplicarFiltros();
                _updateKPIs();
                _addToFeed('📋', `Datos actualizados: ${m_orders.length} órdenes`);
            }, console.error);

        // Compras vinculadas
        window.db.collection('compras')
            .where('vinculacion.tipo', '==', 'motor')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    const compra = { id: change.doc.id, ...change.doc.data() };
                    const ordenId = compra.vinculacion?.id;
                    if (ordenId) {
                        m_comprasVinculadas[ordenId] = {
                            estado: compra.estado,
                            folio: compra.folio
                        };
                    }
                });
                _aplicarFiltros();
            }, console.error);

        // Contactos (clientes)
        window.db.collection('contactos')
            .where('tipo', '==', 'client')
            .onSnapshot(snap => {
                m_clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _populateClientSelect();
            }, console.error);
    }

    // ==========================================================================
    // 5. CARGA DE DATOS
    // ==========================================================================
    async function _loadClients() {
        if (!window.db) return;
        try {
            const snap = await window.db.collection('contactos')
                .where('tipo', '==', 'client')
                .get();
            m_clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            _populateClientSelect();
        } catch (e) {
            console.error('Error cargando clientes:', e);
        }
    }

    async function _loadInventory() {
        if (!window.db) return;
        try {
            const snap = await window.db.collection('inventario')
                .where('categoria', 'in', ['refaccion', 'consumible'])
                .get();
            m_inventory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('Error cargando inventario:', e);
        }
    }

    // ==========================================================================
    // 6. FILTROS Y APLICACIÓN
    // ==========================================================================
    function _aplicarFiltros() {
        let filtradas = m_orders;

        // Filtro por estado
        if (m_filtroEstado !== 'all') {
            filtradas = filtradas.filter(o => {
                const estado = o.estado || 'Nuevo';
                return estado.toLowerCase() === m_filtroEstado.toLowerCase();
            });
        }

        // Filtro por fecha
        filtradas = _filtrarPorFecha(filtradas);

        // Filtro por búsqueda
        if (m_filtroBuscar) {
            filtradas = filtradas.filter(o => 
                (o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(m_filtroBuscar)) ||
                (o.motor && o.motor.toLowerCase().includes(m_filtroBuscar)) ||
                (o.folio && o.folio.toLowerCase().includes(m_filtroBuscar)) ||
                (o.marca && o.marca.toLowerCase().includes(m_filtroBuscar))
            );
        }

        // Renderizar según vista
        if (m_vistaActual === 'kanban') _renderKanban(filtradas);
        else if (m_vistaActual === 'table') _renderTable(filtradas);
        
        _updateKPIs(filtradas);
    }

    function _filtrarPorFecha(arr) {
        const now = new Date();
        let inicio, fin;

        if (m_periodoActual === 'day') {
            const fecha = document.getElementById('datePicker').value;
            if (fecha) {
                inicio = new Date(fecha);
                inicio.setHours(0,0,0,0);
                fin = new Date(fecha);
                fin.setHours(23,59,59,999);
            }
        } else if (m_periodoActual === 'month') {
            const mes = parseInt(document.getElementById('monthPicker').value);
            if (!isNaN(mes)) {
                inicio = new Date(now.getFullYear(), mes, 1);
                fin = new Date(now.getFullYear(), mes + 1, 0, 23, 59, 59);
            }
        } else if (m_periodoActual === 'year') {
            const año = parseInt(document.getElementById('yearPicker').value);
            if (año) {
                inicio = new Date(año, 0, 1);
                fin = new Date(año, 11, 31, 23, 59, 59);
            }
        }

        if (!inicio || !fin) return arr;

        return arr.filter(o => {
            const fecha = o.fechaIngreso ? new Date(o.fechaIngreso) : null;
            return fecha && fecha >= inicio && fecha <= fin;
        });
    }

    // ==========================================================================
    // 7. RENDERIZADO DE VISTAS
    // ==========================================================================
    function _renderKanban(ordenes) {
        const estados = ['Nuevo', 'Diagnóstico', 'En Espera', 'Reparado', 'Entregado'];
        
        // Actualizar contadores
        estados.forEach(estado => {
            const count = ordenes.filter(o => (o.estado || 'Nuevo') === estado).length;
            const mapId = {
                'Nuevo': 'kanbanNuevoCount',
                'Diagnóstico': 'kanbanDiagnosticoCount',
                'En Espera': 'kanbanEsperaCount',
                'Reparado': 'kanbanReparadoCount',
                'Entregado': 'kanbanEntregadoCount'
            };
            const el = document.getElementById(mapId[estado]);
            if (el) el.innerText = count;
        });

        // Renderizar cada columna
        estados.forEach(estado => {
            const mapId = {
                'Nuevo': 'kanbanNuevo',
                'Diagnóstico': 'kanbanDiagnostico',
                'En Espera': 'kanbanEspera',
                'Reparado': 'kanbanReparado',
                'Entregado': 'kanbanEntregado'
            };
            const container = document.getElementById(mapId[estado]);
            if (!container) return;

            const ordenesFiltradas = ordenes.filter(o => (o.estado || 'Nuevo') === estado);
            
            if (ordenesFiltradas.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Sin órdenes</div>';
                return;
            }

            container.innerHTML = ordenesFiltradas.map(o => {
                const compraInfo = m_comprasVinculadas[o.id];
                const tieneCompra = compraInfo && compraInfo.estado < 4;
                const fecha = o.fechaIngreso ? new Date(o.fechaIngreso).toLocaleDateString() : '';

                return `
                    <div class="kanban-card" onclick="MotoresCore._abrirOrden('${o.id}')">
                        <div class="card-header">
                            <span class="folio">${o.folio || o.id.slice(-6)}</span>
                            ${tieneCompra ? `<span class="badge-compra">🛒 Compra</span>` : ''}
                        </div>
                        <div class="cliente">${o.cliente_nombre || 'Cliente'}</div>
                        <div class="motor">${o.motor || 'Motor'} ${o.hp ? o.hp + 'HP' : ''}</div>
                        <div class="card-footer">
                            <span>${fecha}</span>
                            <span>${o.tecnico_responsable || '—'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        });
    }

    function _renderTable(ordenes) {
        const tbody = document.getElementById('motoresTableBody');
        if (!tbody) return;

        if (ordenes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">No hay órdenes</td></tr>';
            return;
        }

        tbody.innerHTML = ordenes.map(o => {
            const fecha = o.fechaIngreso ? new Date(o.fechaIngreso).toLocaleDateString() : '';
            const estado = o.estado || 'Nuevo';
            let estadoClass = '';
            
            if (estado === 'Nuevo') estadoClass = 'status-nuevo';
            else if (estado === 'Diagnóstico') estadoClass = 'status-diagnostico';
            else if (estado === 'En Espera') estadoClass = 'status-espera';
            else if (estado === 'Reparado') estadoClass = 'status-reparado';
            else if (estado === 'Entregado') estadoClass = 'status-entregado';

            return `
                <tr onclick="MotoresCore._abrirOrden('${o.id}')">
                    <td><strong>${o.folio || o.id.slice(-6)}</strong></td>
                    <td>${o.cliente_nombre || '—'}</td>
                    <td>${o.motor || '—'}</td>
                    <td>${o.hp || '—'}</td>
                    <td>${fecha}</td>
                    <td>${o.tecnico_responsable || '—'}</td>
                    <td><span class="status-badge ${estadoClass}">${estado}</span></td>
                </tr>
            `;
        }).join('');
    }

    function _renderChart() {
        const ctx = document.getElementById('motoresChart').getContext('2d');
        if (m_chartInstance) m_chartInstance.destroy();

        // Contar órdenes por mes
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const ingresos = new Array(12).fill(0);
        const diagnosticos = new Array(12).fill(0);
        const reparados = new Array(12).fill(0);

        m_orders.forEach(o => {
            if (!o.fechaIngreso) return;
            const fecha = new Date(o.fechaIngreso);
            const mes = fecha.getMonth();
            
            ingresos[mes]++;
            
            if (o.estado === 'Diagnóstico') diagnosticos[mes]++;
            if (o.estado === 'Reparado' || o.estado === 'Entregado') reparados[mes]++;
        });

        m_chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [
                    {
                        label: 'Ingresos',
                        data: ingresos,
                        backgroundColor: 'rgba(93,64,55,0.8)',
                        borderColor: '#5d4037',
                        borderWidth: 1
                    },
                    {
                        label: 'En Diagnóstico',
                        data: diagnosticos,
                        backgroundColor: 'rgba(255,152,0,0.8)',
                        borderColor: '#ff9800',
                        borderWidth: 1
                    },
                    {
                        label: 'Reparados',
                        data: reparados,
                        backgroundColor: 'rgba(76,175,80,0.8)',
                        borderColor: '#4caf50',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // ==========================================================================
    // 8. FUNCIONES DEL MODAL (5 PASOS)
    // ==========================================================================
    function _abrirOrden(id) {
        const orden = m_orders.find(o => o.id === id);
        if (!orden) return;

        m_currentOrder = orden;
        m_orderId = id;
        m_isNewOrder = false;
        _cargarDatosEnModal(orden);
        document.getElementById('wsModal').classList.add('active');
        _irPaso(_estadoToPaso(orden.estado || 'Nuevo'));
    }

    function _abrirNuevaOrden() {
        m_isNewOrder = true;
        m_currentOrder = null;
        m_orderId = null;
        m_fechaInicioOrden = new Date().toISOString();
        m_fechasEtapas = {};
        m_diagnosticoEnlaces = [];
        m_diagnosticoInventario = [];
        m_consumiblesUsados = [];
        m_componentesInventario = [];
        m_componentesCompra = [];

        _resetForm();
        _generarFolio();
        _irPaso(1);
        document.getElementById('wsModal').classList.add('active');
        document.getElementById('fechaInicioDisplay').innerText = new Date().toLocaleString();
    }

    function _estadoToPaso(estado) {
        const mapa = {
            'Nuevo': 1,
            'Diagnóstico': 2,
            'En Espera': 3,
            'Reparado': 4,
            'Entregado': 5
        };
        return mapa[estado] || 1;
    }

    function _pasoToEstado(paso) {
        const mapa = {
            1: 'Nuevo',
            2: 'Diagnóstico',
            3: 'En Espera',
            4: 'Reparado',
            5: 'Entregado'
        };
        return mapa[paso] || 'Nuevo';
    }

    function _cargarDatosEnModal(orden) {
        document.getElementById('inpFolio').value = orden.folio || '';
        document.getElementById('selClient').value = orden.cliente_nombre || '';
        document.getElementById('inpDateTime').value = orden.fechaIngreso || '';
        document.getElementById('inpClientRef').value = orden.referencia || '';
        document.getElementById('inpMotor').value = orden.motor || '';
        document.getElementById('inpBrand').value = orden.marca || '';
        document.getElementById('inpModel').value = orden.modelo || '';
        document.getElementById('inpSerial').value = orden.serie || '';
        document.getElementById('inpHp').value = orden.hp || '';
        document.getElementById('inpRpm').value = orden.rpm || '';
        document.getElementById('inpVoltaje').value = orden.voltaje || '';
        document.getElementById('inpFail').value = orden.falla_reportada || '';
        document.getElementById('inpCond').value = orden.condiciones_fisicas || '';
        document.getElementById('inpReceptionBy').value = orden.encargado_recepcion || '';
        document.getElementById('inpUnderWarranty').checked = orden.bajo_garantia || false;
        document.getElementById('techSelect').value = orden.tecnico_responsable || '';
        document.getElementById('megger').value = orden.megger || '';
        document.getElementById('ip').value = orden.ip || '';
        document.getElementById('rU').value = orden.rU || '';
        document.getElementById('rV').value = orden.rV || '';
        document.getElementById('rW').value = orden.rW || '';
        document.getElementById('internalNotes').value = orden.notas_internas || '';
        document.getElementById('generalNotes').value = orden.notas_generales || '';
        document.getElementById('horasEstimadas').value = orden.horas_estimadas || 0;

        m_diagnosticoEnlaces = orden.refacciones_enlaces || [];
        m_diagnosticoInventario = orden.refacciones_inventario || [];
        m_consumiblesUsados = orden.consumibles_usados || [];
        m_componentesInventario = orden.componentes_inventario || [];
        m_componentesCompra = orden.componentes_compra || [];
        m_fechaInicioOrden = orden.fecha_inicio || new Date().toISOString();
        m_fechasEtapas = orden.fechas_etapas || {};

        _renderDiagnosticoEnlaces();
        _renderDiagnosticoInventario();
        _renderConsumibles();
        _renderComponentesInventario();
        _renderComponentesCompra();

        // Resumen en paso 4
        document.getElementById('resumenCliente').innerText = orden.cliente_nombre || '';
        document.getElementById('resumenMotor').innerText = orden.motor || '';
        document.getElementById('resumenMarca').innerText = orden.marca || '';
        document.getElementById('resumenModelo').innerText = orden.modelo || '';
        document.getElementById('resumenSerie').innerText = orden.serie || '';
        document.getElementById('resumenFalla').innerText = orden.falla_reportada || '';

        document.getElementById('fechaInicioDisplay').innerText = new Date(m_fechaInicioOrden).toLocaleString();
    }

    function _irPaso(paso) {
        if (paso < 1 || paso > 5) return;
        m_currentStep = paso;

        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`step-${paso}`).classList.add('active');

        document.querySelectorAll('.ws-step-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.ws-step-btn[data-step="${paso}"]`).classList.add('active');

        _actualizarBotonesPaso();

        if (paso === 2) {
            _renderDiagnosticoEnlaces();
            _renderDiagnosticoInventario();
        }
        if (paso === 4) {
            _renderComponentesInventario();
            _renderComponentesCompra();
            _renderConsumibles();
        }
    }

    function _actualizarBotonesPaso() {
        const prevBtn = document.getElementById('prevStepBtn');
        const nextBtn = document.getElementById('nextStepBtn');
        const saveBtn = document.getElementById('saveOrderBtn');

        if (m_currentStep === 1) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'inline-flex';
            saveBtn.style.display = 'none';
        } else if (m_currentStep === 5) {
            prevBtn.style.display = 'inline-flex';
            nextBtn.style.display = 'none';
            saveBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'inline-flex';
            nextBtn.style.display = 'inline-flex';
            saveBtn.style.display = 'none';
        }
    }

    function _prevStep() {
        if (m_currentStep > 1) _irPaso(m_currentStep - 1);
    }

    function _nextStep() {
        if (_validarPasoActual() && m_currentStep < 5) {
            _irPaso(m_currentStep + 1);
        }
    }

    function _validarPasoActual() {
        switch(m_currentStep) {
            case 1:
                if (!document.getElementById('selClient').value) {
                    alert('Seleccione un cliente');
                    return false;
                }
                if (!document.getElementById('inpMotor').value) {
                    alert('Ingrese el tipo de motor');
                    return false;
                }
                if (m_isNewOrder && !document.getElementById('productImage').files.length) {
                    alert('Suba la foto del motor');
                    return false;
                }
                break;
            case 2:
                if (!document.getElementById('techSelect').value) {
                    alert('Seleccione técnico responsable');
                    return false;
                }
                if (parseFloat(document.getElementById('horasEstimadas').value) <= 0) {
                    alert('Ingrese horas estimadas válidas');
                    return false;
                }
                break;
            case 5:
                if (!document.getElementById('recibeNombre').value) {
                    alert('Ingrese el nombre de quien recibe');
                    return false;
                }
                if (!document.getElementById('fechaEntrega').value) {
                    alert('Ingrese la fecha de entrega');
                    return false;
                }
                break;
        }
        return true;
    }

    // ==========================================================================
    // 9. RENDERIZADO DE LISTAS ESPECÍFICAS
    // ==========================================================================
    function _renderDiagnosticoEnlaces() {
        const tbody = document.getElementById('diagnosticoEnlacesBody');
        if (!tbody) return;

        if (m_diagnosticoEnlaces.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay refacciones agregadas</td></tr>';
            return;
        }

        tbody.innerHTML = m_diagnosticoEnlaces.map((item, idx) => `
            <tr>
                <td><input type="text" value="${item.descripcion || ''}" placeholder="Descripción" data-index="${idx}" onchange="MotoresCore._actualizarEnlace(${idx}, 'descripcion', this.value)"></td>
                <td><input type="text" value="${item.sku || ''}" placeholder="SKU" data-index="${idx}" onchange="MotoresCore._actualizarEnlace(${idx}, 'sku', this.value)"></td>
                <td><input type="number" value="${item.cantidad || 1}" min="1" data-index="${idx}" onchange="MotoresCore._actualizarEnlace(${idx}, 'cantidad', this.value)"></td>
                <td><input type="url" value="${item.link || ''}" placeholder="https://..." data-index="${idx}" onchange="MotoresCore._actualizarEnlace(${idx}, 'link', this.value)"></td>
                <td><button class="btn btn-sm btn-danger" onclick="MotoresCore._eliminarEnlace(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _renderDiagnosticoInventario() {
        const tbody = document.getElementById('diagnosticoInventarioBody');
        if (!tbody) return;

        if (m_diagnosticoInventario.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay productos seleccionados</td></tr>';
            return;
        }

        tbody.innerHTML = m_diagnosticoInventario.map((item, idx) => {
            const producto = m_inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';

            return `
                <tr>
                    <td>
                        <select data-index="${idx}" onchange="MotoresCore._actualizarInventarioSeleccion(${idx}, this.value)">
                            <option value="">Seleccionar SKU</option>
                            ${m_inventory.map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="text" value="${desc}" readonly></td>
                    <td>${stock}</td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="MotoresCore._actualizarInventarioCantidad(${idx}, this.value)"></td>
                    <td><button class="btn btn-sm btn-danger" onclick="MotoresCore._eliminarInventario(${idx})">✖</button></td>
                </tr>
            `;
        }).join('');
    }

    function _renderConsumibles() {
        const tbody = document.getElementById('consumiblesBody');
        if (!tbody) return;

        if (m_consumiblesUsados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay consumibles agregados</td></tr>';
            return;
        }

        tbody.innerHTML = m_consumiblesUsados.map((item, idx) => {
            const producto = m_inventory.find(p => p.sku === item.sku);
            const stock = producto ? producto.stock : 0;
            const desc = producto ? producto.nombre : item.descripcion || '';

            return `
                <tr>
                    <td>
                        <select data-index="${idx}" onchange="MotoresCore._actualizarConsumibleSeleccion(${idx}, this.value)">
                            <option value="">Seleccionar SKU</option>
                            ${m_inventory.filter(p => p.categoria === 'consumible').map(p => `<option value="${p.sku}" ${p.sku === item.sku ? 'selected' : ''}>${p.sku} - ${p.nombre}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="text" value="${desc}" readonly></td>
                    <td>${stock}</td>
                    <td><input type="number" value="${item.cantidad || 1}" min="1" max="${stock}" data-index="${idx}" onchange="MotoresCore._actualizarConsumibleCantidad(${idx}, this.value)"></td>
                    <td><button class="btn btn-sm btn-danger" onclick="MotoresCore._eliminarConsumible(${idx})">✖</button></td>
                </tr>
            `;
        }).join('');
    }

    function _renderComponentesInventario() {
        const tbody = document.getElementById('componentesInventarioBody');
        if (!tbody) return;

        // Combinar con lo solicitado en diagnóstico
        const items = m_diagnosticoInventario.map(solicitado => {
            const existente = m_componentesInventario.find(c => c.sku === solicitado.sku);
            return {
                sku: solicitado.sku,
                descripcion: solicitado.descripcion,
                cantidad_solicitada: solicitado.cantidad,
                cantidad_usada: existente ? existente.cantidad_usada : solicitado.cantidad
            };
        });

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay componentes de inventario</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, idx) => `
            <tr>
                <td>${item.sku}</td>
                <td>${item.descripcion}</td>
                <td>${item.cantidad_solicitada}</td>
                <td><input type="number" value="${item.cantidad_usada}" min="0" data-index="${idx}" onchange="MotoresCore._actualizarComponenteInventario(${idx}, this.value)"></td>
                <td><button class="btn btn-sm btn-danger" onclick="MotoresCore._eliminarComponenteInventario(${idx})">✖</button></td>
            </tr>
        `).join('');
    }

    function _renderComponentesCompra() {
        const tbody = document.getElementById('componentesCompraBody');
        if (!tbody) return;

        // Verificar si hay compra vinculada y completada
        if (m_orderId && m_comprasVinculadas[m_orderId] && m_comprasVinculadas[m_orderId].estado >= 4) {
            if (m_componentesCompra.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay componentes de compra</td></tr>';
                return;
            }

            tbody.innerHTML = m_componentesCompra.map((item, idx) => `
                <tr>
                    <td>${item.descripcion}</td>
                    <td>${item.sku}</td>
                    <td>${item.cantidad_recibida || 0}</td>
                    <td><input type="number" value="${item.cantidad_usada || item.cantidad_recibida || 0}" min="0" data-index="${idx}" onchange="MotoresCore._actualizarComponenteCompra(${idx}, this.value)"></td>
                    <td><button class="btn btn-sm btn-danger" onclick="MotoresCore._eliminarComponenteCompra(${idx})">✖</button></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay compra completada para esta orden</td></tr>';
        }
    }

    // ==========================================================================
    // 10. FUNCIONES DE ACTUALIZACIÓN DE LISTAS
    // ==========================================================================
    function _actualizarEnlace(idx, campo, valor) {
        if (!m_diagnosticoEnlaces[idx]) return;
        m_diagnosticoEnlaces[idx][campo] = campo === 'cantidad' ? parseInt(valor) || 1 : valor;
    }

    function _eliminarEnlace(idx) {
        m_diagnosticoEnlaces.splice(idx, 1);
        _renderDiagnosticoEnlaces();
    }

    function _actualizarInventarioSeleccion(idx, sku) {
        const producto = m_inventory.find(p => p.sku === sku);
        m_diagnosticoInventario[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: m_diagnosticoInventario[idx]?.cantidad || 1
        };
        _renderDiagnosticoInventario();
    }

    function _actualizarInventarioCantidad(idx, cantidad) {
        if (!m_diagnosticoInventario[idx]) return;
        m_diagnosticoInventario[idx].cantidad = parseInt(cantidad) || 1;
    }

    function _eliminarInventario(idx) {
        m_diagnosticoInventario.splice(idx, 1);
        _renderDiagnosticoInventario();
    }

    function _actualizarConsumibleSeleccion(idx, sku) {
        const producto = m_inventory.find(p => p.sku === sku);
        m_consumiblesUsados[idx] = {
            sku: sku,
            descripcion: producto ? producto.nombre : '',
            cantidad: m_consumiblesUsados[idx]?.cantidad || 1
        };
        _renderConsumibles();
    }

    function _actualizarConsumibleCantidad(idx, cantidad) {
        if (!m_consumiblesUsados[idx]) return;
        m_consumiblesUsados[idx].cantidad = parseInt(cantidad) || 1;
    }

    function _eliminarConsumible(idx) {
        m_consumiblesUsados.splice(idx, 1);
        _renderConsumibles();
    }

    function _actualizarComponenteInventario(idx, cantidad) {
        if (!m_componentesInventario[idx]) {
            m_componentesInventario[idx] = {};
        }
        m_componentesInventario[idx].cantidad_usada = parseInt(cantidad) || 0;
    }

    function _eliminarComponenteInventario(idx) {
        m_componentesInventario.splice(idx, 1);
        _renderComponentesInventario();
    }

    function _actualizarComponenteCompra(idx, cantidad) {
        if (!m_componentesCompra[idx]) {
            m_componentesCompra[idx] = {};
        }
        m_componentesCompra[idx].cantidad_usada = parseInt(cantidad) || 0;
    }

    function _eliminarComponenteCompra(idx) {
        m_componentesCompra.splice(idx, 1);
        _renderComponentesCompra();
    }

    // ==========================================================================
    // 11. ACCIONES ESPECIALES
    // ==========================================================================
    async function _sinReparacion() {
        if (!confirm('¿Marcar como "Sin reparación"? Esto moverá la orden a "En espera" y notificará a compras.')) return;

        const data = _recolectarDatos();
        data.estado = 'En Espera';
        data.sin_reparacion = true;
        data.fecha_sin_reparacion = new Date().toISOString();

        try {
            if (m_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_motores').add(data);
            } else {
                await window.db.collection('ordenes_motores').doc(m_orderId).update(data);
            }

            // Crear notificación en compras
            const solicitud = {
                folio: `SNR-${data.folio}`,
                proveedor: 'N/A',
                departamento: 'Taller Motores',
                vinculacion: { tipo: 'motor', id: m_orderId || 'nueva', nombre: data.cliente_nombre },
                items: [{ desc: 'Sin reparación - evaluar compra de motor nuevo', qty: 1, price: 0 }],
                total: 0,
                estado: 1,
                sinReparacion: true,
                fechaCreacion: window.firebase.firestore.FieldValue.serverTimestamp()
            };
            await window.db.collection('compras').add(solicitud);

            _cerrarModal();
            _addToFeed('⚠️', `Orden marcada sin reparación`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _generarSolicitudCompra() {
        if (!__x() || !window.db) return;

        const data = _recolectarDatos();
        if (!data.cliente_nombre) { alert('Seleccione cliente'); _irPaso(1); return; }
        if (!data.motor) { alert('Ingrese el motor'); _irPaso(1); return; }

        if (m_diagnosticoEnlaces.length === 0 && m_diagnosticoInventario.length === 0) {
            alert('Debe agregar al menos una refacción a comprar');
            return;
        }

        // Construir items para compras (solo enlaces externos)
        const items = m_diagnosticoEnlaces.map(e => ({
            sku: e.sku || '',
            desc: e.descripcion,
            qty: e.cantidad,
            price: 0,
            link: e.link
        }));

        const nuevaCompra = {
            folio: `PO-${data.folio}`,
            proveedor: 'Por asignar',
            departamento: 'Taller Motores',
            fechaRequerida: new Date().toISOString().split('T')[0],
            prioridad: 'Normal',
            vinculacion: { tipo: 'motor', id: m_orderId || 'nueva', nombre: data.cliente_nombre },
            items: items,
            total: 0,
            estado: 1,
            pasos: [{
                paso: 1,
                fecha: new Date().toISOString(),
                usuario: 'Motores',
                accion: 'Solicitud creada desde taller de motores',
                fotoUrl: null
            }],
            confirmadoVentas: false,
            fechaCreacion: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await window.db.collection('compras').add(nuevaCompra);
            alert('✅ Solicitud de compra generada');
            _addToFeed('🛒', `Solicitud de compra creada para ${data.folio}`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _terminarReparacion() {
        if (!confirm('¿Finalizar la reparación? Se registrará la fecha y hora actual.')) return;

        const data = _recolectarDatos();
        data.estado = 'Reparado';
        data.fechaReparacion = new Date().toISOString();
        data.componentes_inventario = m_componentesInventario;
        data.componentes_compra = m_componentesCompra;
        data.consumibles_usados = m_consumiblesUsados;

        // Descontar del inventario
        for (let item of m_componentesInventario) {
            if (item.cantidad_usada > 0 && item.sku) {
                const producto = m_inventory.find(p => p.sku === item.sku);
                if (producto) {
                    await window.db.collection('inventario').doc(producto.id).update({
                        stock: window.firebase.firestore.FieldValue.increment(-item.cantidad_usada)
                    });
                }
            }
        }

        for (let item of m_consumiblesUsados) {
            if (item.cantidad > 0 && item.sku) {
                const producto = m_inventory.find(p => p.sku === item.sku);
                if (producto) {
                    await window.db.collection('inventario').doc(producto.id).update({
                        stock: window.firebase.firestore.FieldValue.increment(-item.cantidad)
                    });
                }
            }
        }

        try {
            if (m_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_motores').add(data);
            } else {
                await window.db.collection('ordenes_motores').doc(m_orderId).update(data);
            }

            _irPaso(4);
            alert('✅ Reparación finalizada');
            _addToFeed('✅', `Reparación completada para ${data.folio}`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _terminarEtapa(etapa) {
        const campo = `etapa${etapa}_fin`;
        m_fechasEtapas[campo] = new Date().toISOString();

        if (m_orderId) {
            await window.db.collection('ordenes_motores').doc(m_orderId).update({
                fechas_etapas: m_fechasEtapas
            });
        }

        _addToFeed(`✅ Etapa ${etapa} finalizada`);

        if (etapa < 5) {
            _irPaso(etapa + 1);
        }
    }

    // ==========================================================================
    // 12. GUARDAR ORDEN
    // ==========================================================================
    function _recolectarDatos() {
        return {
            cliente_nombre: document.getElementById('selClient').value,
            referencia: document.getElementById('inpClientRef').value,
            fechaIngreso: document.getElementById('inpDateTime').value,
            motor: document.getElementById('inpMotor').value,
            marca: document.getElementById('inpBrand').value,
            modelo: document.getElementById('inpModel').value,
            serie: document.getElementById('inpSerial').value,
            hp: parseFloat(document.getElementById('inpHp').value) || 0,
            rpm: parseFloat(document.getElementById('inpRpm').value) || 0,
            voltaje: document.getElementById('inpVoltaje').value,
            falla_reportada: document.getElementById('inpFail').value,
            condiciones_fisicas: document.getElementById('inpCond').value,
            encargado_recepcion: document.getElementById('inpReceptionBy').value,
            bajo_garantia: document.getElementById('inpUnderWarranty').checked,
            tecnico_responsable: document.getElementById('techSelect').value,
            megger: parseFloat(document.getElementById('megger').value) || 0,
            ip: parseFloat(document.getElementById('ip').value) || 0,
            rU: parseFloat(document.getElementById('rU').value) || 0,
            rV: parseFloat(document.getElementById('rV').value) || 0,
            rW: parseFloat(document.getElementById('rW').value) || 0,
            notas_internas: document.getElementById('internalNotes').value,
            notas_generales: document.getElementById('generalNotes').value,
            horas_estimadas: parseFloat(document.getElementById('horasEstimadas').value) || 0,
            refacciones_enlaces: m_diagnosticoEnlaces,
            refacciones_inventario: m_diagnosticoInventario,
            fecha_entrega: document.getElementById('fechaEntrega').value,
            recibe_nombre: document.getElementById('recibeNombre').value,
            recibe_identificacion: document.getElementById('recibeIdentificacion').value,
            factura_numero: document.getElementById('facturaNumero').value,
            entrega_obs: document.getElementById('entregaObs').value,
            fecha_inicio: m_fechaInicioOrden,
            fechas_etapas: m_fechasEtapas,
            actualizado: new Date().toISOString()
        };
    }

    async function _guardarOrden() {
        if (!__x() || !window.db) return;

        const data = _recolectarDatos();
        if (!data.cliente_nombre) { alert('Seleccione cliente'); _irPaso(1); return; }
        if (!data.motor) { alert('Ingrese el motor'); _irPaso(1); return; }

        const fotoInput = document.getElementById('productImage');
        if (m_isNewOrder && (!fotoInput || !fotoInput.files[0])) {
            alert('Suba foto del motor');
            _irPaso(1);
            return;
        }

        if (fotoInput && fotoInput.files[0]) {
            data.foto_ingreso = await _subirFoto(fotoInput.files[0], 'motores/' + (m_orderId || 'nueva'));
        }

        try {
            if (m_isNewOrder) {
                data.folio = `MTR-${Date.now().toString().slice(-6)}`;
                data.estado = 'Nuevo';
                data.fechaIngreso = new Date().toISOString();
                data.historial = [{ 
                    fecha: new Date().toISOString(), 
                    usuario: 'Motores', 
                    accion: 'Orden creada' 
                }];
                await window.db.collection('ordenes_motores').add(data);
                _addToFeed('🆕', `Nueva orden ${data.folio}`);
            } else {
                await window.db.collection('ordenes_motores').doc(m_orderId).update(data);
                _addToFeed('📝', `Orden ${data.folio} actualizada`);
            }
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    async function _completarEntrega() {
        if (!_validarPasoActual()) return;

        const data = _recolectarDatos();
        data.estado = 'Entregado';
        data.fechaEntrega = new Date().toISOString();

        const fotoInput = document.getElementById('fotoEntrega');
        if (fotoInput && fotoInput.files[0]) {
            data.foto_entrega = await _subirFoto(fotoInput.files[0], 'motores/' + m_orderId);
        }

        try {
            if (m_isNewOrder) {
                data.folio = document.getElementById('inpFolio').value;
                data.fechaIngreso = new Date().toISOString();
                await window.db.collection('ordenes_motores').add(data);
            } else {
                await window.db.collection('ordenes_motores').doc(m_orderId).update(data);
            }
            _cerrarModal();
            _addToFeed('🚚', `Orden ${data.folio} entregada`);
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    // ==========================================================================
    // 13. SUBIDA DE FOTOS
    // ==========================================================================
    async function _subirFoto(file, carpeta) {
        if (!file) return null;
        const storageRef = firebase.storage().ref();
        const fileName = `${Date.now()}_${file.name}`;
        const fileRef = storageRef.child(`${carpeta}/${fileName}`);
        try {
            await fileRef.put(file);
            return await fileRef.getDownloadURL();
        } catch (error) {
            console.error('Error subiendo foto:', error);
            return null;
        }
    }

    // ==========================================================================
    // 14. KPIs
    // ==========================================================================
    function _updateKPIs(ordenes = m_orders) {
        const nuevo = ordenes.filter(o => (o.estado || 'Nuevo') === 'Nuevo').length;
        const diagnostico = ordenes.filter(o => o.estado === 'Diagnóstico').length;
        const espera = ordenes.filter(o => o.estado === 'En Espera').length;
        const reparado = ordenes.filter(o => o.estado === 'Reparado').length;

        document.getElementById('kpiNuevo').innerText = nuevo;
        document.getElementById('kpiDiagnostico').innerText = diagnostico;
        document.getElementById('kpiEspera').innerText = espera;
        document.getElementById('kpiReparado').innerText = reparado;
    }

    // ==========================================================================
    // 15. FUNCIONES AUXILIARES
    // ==========================================================================
    function _populateClientSelect() {
        const sel = document.getElementById('selClient');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Seleccionar cliente --</option>';
        m_clients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nombre || c.empresa;
            opt.textContent = c.nombre || c.empresa;
            sel.appendChild(opt);
        });
    }

    function _generarFolio() {
        const now = new Date();
        const folio = `MTR-${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        document.getElementById('inpFolio').value = folio;
    }

    function _resetForm() {
        document.getElementById('inpFolio').value = '';
        document.getElementById('selClient').value = '';
        document.getElementById('inpDateTime').value = new Date().toISOString().slice(0,16);
        document.getElementById('inpClientRef').value = '';
        document.getElementById('inpMotor').value = '';
        document.getElementById('inpBrand').value = '';
        document.getElementById('inpModel').value = '';
        document.getElementById('inpSerial').value = '';
        document.getElementById('inpHp').value = '';
        document.getElementById('inpRpm').value = '';
        document.getElementById('inpVoltaje').value = '';
        document.getElementById('inpFail').value = '';
        document.getElementById('inpCond').value = '';
        document.getElementById('inpReceptionBy').value = '';
        document.getElementById('inpUnderWarranty').checked = false;
        document.getElementById('techSelect').value = '';
        document.getElementById('megger').value = '';
        document.getElementById('ip').value = '';
        document.getElementById('rU').value = '';
        document.getElementById('rV').value = '';
        document.getElementById('rW').value = '';
        document.getElementById('internalNotes').value = '';
        document.getElementById('generalNotes').value = '';
        document.getElementById('horasEstimadas').value = 0;
        document.getElementById('fechaEntrega').value = new Date().toISOString().slice(0,16);
        document.getElementById('recibeNombre').value = '';
        document.getElementById('recibeIdentificacion').value = '';
        document.getElementById('facturaNumero').value = '';
        document.getElementById('entregaObs').value = '';
        document.getElementById('productImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
    }

    function _previewImage() {
        const input = document.getElementById('productImage');
        const preview = document.getElementById('imagePreview');
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%; max-height:120px;">`;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    function _cerrarModal() {
        document.getElementById('wsModal').classList.remove('active');
        m_currentOrder = null;
        m_orderId = null;
        m_isNewOrder = true;
    }

    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;

        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-motores);">MOTORES</span>
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
    // 16. EVENTOS DOM
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
    }

    // ==========================================================================
    // 17. LIMPIEZA
    // ==========================================================================
    function _cleanup() {
        if (m_unsubscribe) m_unsubscribe();
        if (m_chartInstance) m_chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==========================================================================
    // 18. EXPOSICIÓN PÚBLICA
    // ==========================================================================
    return {
        init: init,
        _abrirOrden: _abrirOrden,
        _actualizarEnlace: _actualizarEnlace,
        _eliminarEnlace: _eliminarEnlace,
        _actualizarInventarioSeleccion: _actualizarInventarioSeleccion,
        _actualizarInventarioCantidad: _actualizarInventarioCantidad,
        _eliminarInventario: _eliminarInventario,
        _actualizarConsumibleSeleccion: _actualizarConsumibleSeleccion,
        _actualizarConsumibleCantidad: _actualizarConsumibleCantidad,
        _eliminarConsumible: _eliminarConsumible,
        _actualizarComponenteInventario: _actualizarComponenteInventario,
        _eliminarComponenteInventario: _eliminarComponenteInventario,
        _actualizarComponenteCompra: _actualizarComponenteCompra,
        _eliminarComponenteCompra: _eliminarComponenteCompra
    };
})();

window.MotoresCore = MotoresCore;   