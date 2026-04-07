// servicios-core.js - Lógica completa del módulo de Automatización
const ServiciosCore = (function() {
    // ============================================================
    // 1. ESTADO PRIVADO
    // ============================================================
    let proyectos = [];
    let currentProjectId = null;
    let currentStep = 1;
    
    let actividades = [];
    let materiales = [];
    let epicas = [];
    let apartados = [
        { id: 'ap1', titulo: 'Formato de entrega', nota: '', archivos: [] },
        { id: 'ap2', titulo: 'Manual de operación', nota: '', archivos: [] },
        { id: 'ap3', titulo: 'Reporte de evidencias', nota: '', archivos: [] },
        { id: 'ap4', titulo: 'Manuales eléctricos', nota: '', archivos: [] },
        { id: 'ap5', titulo: 'Respaldos de programa', nota: '', archivos: [] }
    ];
    let comentarios = [];

    let inventario = [
        { sku: 'PERFIL-001', nombre: 'Perfil unicanal', descripcion: 'PERFIL UNICANAL SOLIDO 4X2' },
        { sku: 'ABRA-001', nombre: 'Abrazadera unicanal', descripcion: 'ABRAZADERA UNICANAL 1/2"' },
        { sku: 'TAQ-001', nombre: 'Taquete arpon', descripcion: 'TAQUETE ARPON 1/4X2-1/4' },
        { sku: 'COND-001', nombre: 'Tubo conduit', descripcion: 'TUBO CONDUIT 1/2"' },
        { sku: 'PLC-001', nombre: 'PLC Siemens', descripcion: 'CPU 1215C' }
    ];

    let catalogoServicios = [
        { area: "Diseño", servicio: "Diseño arquitectura de control", tipo: "O", horasBase: 6 },
        { area: "Eléctrica", servicio: "Diseño tablero BT", tipo: "O", horasBase: 8 },
        { area: "Eléctrica", servicio: "Instalación cableado", tipo: "P", horasBase: 4 },
        { area: "Control", servicio: "Programación PLC", tipo: "O", horasBase: 10 },
        { area: "Control", servicio: "Configuración variadores", tipo: "O", horasBase: 6 },
        { area: "Visión", servicio: "Integración cámaras", tipo: "P", horasBase: 8 },
        { area: "Soporte", servicio: "Diagnóstico en sitio", tipo: "P", horasBase: 4 }
    ];

    let chartInstance = null;

    // ============================================================
    // 2. VALIDACIÓN
    // ============================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ============================================================
    // 3. INICIALIZACIÓN
    // ============================================================
    function init() {
        if (!__x()) {
            window.location.href = 'ssepi_website.html';
            return;
        }

        _initUI();
        _initEventListeners();
        _cargarDatosIniciales();
        _startClock();
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        }

        // Establecer fecha actual
        const hoy = new Date().toISOString().split('T')[0];
        const fechaInput = document.getElementById('paso1_fecha');
        if (fechaInput) fechaInput.value = hoy;
    }

    function _startClock() {
        setInterval(() => {
            const clock = document.getElementById('clock');
            if (clock) clock.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    function _initEventListeners() {
        // Toggle menú
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);

        // Filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                aplicarFiltros();
            });
        });

        document.querySelectorAll('.period-option').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.period-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                aplicarFiltros();
            });
        });

        // Vistas
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                cambiarVista(this.dataset.view);
            });
        });

        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', aplicarFiltros);

        // Botón cerrar proyecto
        document.getElementById('btnCerrarProyecto').addEventListener('click', deseleccionarProyecto);

        // Botones de pasos
        document.querySelectorAll('.step-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                cambiarPaso(parseInt(this.dataset.step));
            });
        });

        // Botones de acciones
        document.getElementById('guardarPaso1').addEventListener('click', guardarPaso1);
        document.getElementById('agregarActividad').addEventListener('click', agregarActividad);
        document.getElementById('generarCronograma').addEventListener('click', generarCronograma);
        document.getElementById('exportarCronogramaPDF').addEventListener('click', exportarCronogramaPDF);
        document.getElementById('agregarDesdeInventario').addEventListener('click', agregarDesdeInventario);
        document.getElementById('agregarMaterialManual').addEventListener('click', agregarMaterialManual);
        document.getElementById('guardarMateriales').addEventListener('click', guardarMateriales);
        document.getElementById('crearEpica').addEventListener('click', crearEpica);
        document.getElementById('crearNuevoApartado').addEventListener('click', crearNuevoApartado);
    }

    function _toggleMenu() {
        document.body.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    function _cargarDatosIniciales() {
        // Proyectos de ejemplo
        proyectos = [
            { 
                id: '1', 
                folio: 'AUT-001', 
                nombre: 'Sistema medición encoder', 
                cliente: 'SERVIACERO', 
                fecha: '2026-02-15', 
                estado: 'progreso', 
                avance: 45,
                vendedor: 'Daniel Z.',
                notasGenerales: '',
                notasInternas: ''
            },
            { 
                id: '2', 
                folio: 'AUT-002', 
                nombre: 'Control horno industrial', 
                cliente: 'PIELES AZTECA', 
                fecha: '2026-02-10', 
                estado: 'pendiente', 
                avance: 0,
                vendedor: 'Carlos R.',
                notasGenerales: '',
                notasInternas: ''
            },
            { 
                id: '3', 
                folio: 'AUT-003', 
                nombre: 'Automatización ensamble', 
                cliente: 'BODYCOTE', 
                fecha: '2026-01-20', 
                estado: 'completado', 
                avance: 100,
                vendedor: 'María L.',
                notasGenerales: '',
                notasInternas: ''
            }
        ];

        renderTabla();
        renderKanban();
        renderChart();
        actualizarKPIs();
        cargarInventarioSelect();
        renderApartados();
    }

    // ============================================================
    // 4. FUNCIONES DE RENDERIZADO
    // ============================================================
    function renderTabla() {
        const tbody = document.getElementById('tablaProyectosBody');
        if (!tbody) return;

        let filtrados = filtrarProyectos();

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">No hay proyectos</td></tr>';
            return;
        }

        tbody.innerHTML = filtrados.map(p => {
            let estadoClass = '';
            let estadoTexto = '';
            
            if (p.estado === 'pendiente') {
                estadoClass = 'status-pendiente';
                estadoTexto = 'Pendiente';
            } else if (p.estado === 'progreso') {
                estadoClass = 'status-progreso';
                estadoTexto = 'En Progreso';
            } else if (p.estado === 'completado') {
                estadoClass = 'status-completado';
                estadoTexto = 'Completado';
            }

            return `
                <tr onclick="ServiciosCore.seleccionarProyecto('${p.id}')">
                    <td><strong>${p.folio}</strong></td>
                    <td>${p.nombre}</td>
                    <td>${p.cliente || '—'}</td>
                    <td>${p.fecha || '—'}</td>
                    <td><span class="status-badge ${estadoClass}">${estadoTexto}</span></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:11px;">${p.avance}%</span>
                            <div style="width:60px; height:6px; background:#e0e0e0; border-radius:3px;">
                                <div style="width:${p.avance}%; height:6px; background:var(--primary); border-radius:3px;"></div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderKanban() {
        let filtrados = filtrarProyectos();

        const pendiente = filtrados.filter(p => p.estado === 'pendiente');
        const progreso = filtrados.filter(p => p.estado === 'progreso');
        const completado = filtrados.filter(p => p.estado === 'completado');

        document.getElementById('kanbanPendienteCount').innerText = pendiente.length;
        document.getElementById('kanbanProgresoCount').innerText = progreso.length;
        document.getElementById('kanbanCompletadoCount').innerText = completado.length;

        document.getElementById('kanbanPendiente').innerHTML = renderKanbanCards(pendiente);
        document.getElementById('kanbanProgreso').innerHTML = renderKanbanCards(progreso);
        document.getElementById('kanbanCompletado').innerHTML = renderKanbanCards(completado);
    }

    function renderKanbanCards(items) {
        if (items.length === 0) {
            return '<div style="text-align:center; padding:20px; color:var(--text-light);">Sin elementos</div>';
        }

        return items.map(p => `
            <div class="kanban-card" onclick="ServiciosCore.seleccionarProyecto('${p.id}')">
                <div class="kanban-folio">${p.folio}</div>
                <div class="kanban-titulo">${p.nombre}</div>
                <div class="kanban-cliente">${p.cliente || 'Cliente'}</div>
                <div class="kanban-footer">
                    <span>${p.fecha || '—'}</span>
                    <span>${p.avance}%</span>
                </div>
            </div>
        `).join('');
    }

    function renderChart() {
        const ctx = document.getElementById('proyectosChart').getContext('2d');
        
        if (chartInstance) {
            chartInstance.destroy();
        }

        const pendiente = proyectos.filter(p => p.estado === 'pendiente').length;
        const progreso = proyectos.filter(p => p.estado === 'progreso').length;
        const completado = proyectos.filter(p => p.estado === 'completado').length;

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Pendientes', 'En Progreso', 'Completados'],
                datasets: [{
                    data: [pendiente, progreso, completado],
                    backgroundColor: ['#ff9800', '#2196f3', '#4caf50']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function filtrarProyectos() {
        let filtrados = [...proyectos];

        const estadoFiltro = document.querySelector('.filter-btn.active')?.dataset.filter;
        if (estadoFiltro && estadoFiltro !== 'all') {
            filtrados = filtrados.filter(p => p.estado === estadoFiltro);
        }

        const busqueda = document.getElementById('searchInput').value.toLowerCase();
        if (busqueda) {
            filtrados = filtrados.filter(p => 
                p.nombre.toLowerCase().includes(busqueda) ||
                (p.cliente && p.cliente.toLowerCase().includes(busqueda)) ||
                p.folio.toLowerCase().includes(busqueda)
            );
        }

        return filtrados;
    }

    function actualizarKPIs() {
        document.getElementById('kpiTotal').innerText = proyectos.length;
        document.getElementById('kpiPendiente').innerText = proyectos.filter(p => p.estado === 'pendiente').length;
        document.getElementById('kpiProgreso').innerText = proyectos.filter(p => p.estado === 'progreso').length;
        document.getElementById('kpiCompletado').innerText = proyectos.filter(p => p.estado === 'completado').length;
    }

    function cambiarVista(vista) {
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        document.getElementById(vista + 'View').classList.add('active');
        
        if (vista === 'kanban') renderKanban();
        if (vista === 'chart') renderChart();
    }

    function aplicarFiltros() {
        renderTabla();
        renderKanban();
    }

    // ============================================================
    // 5. SELECCIÓN DE PROYECTO
    // ============================================================
    function seleccionarProyecto(id) {
        currentProjectId = id;
        const proyecto = proyectos.find(p => p.id === id);
        
        if (!proyecto) return;

        document.getElementById('selectedProject').style.display = 'block';
        
        document.getElementById('selectedTitulo').innerText = proyecto.nombre;
        document.getElementById('selectedFolio').innerText = proyecto.folio;

        document.getElementById('selectedInfo').innerHTML = `
            <div><strong>Cliente:</strong> ${proyecto.cliente || '—'}</div>
            <div><strong>Fecha:</strong> ${proyecto.fecha || '—'}</div>
            <div><strong>Vendedor:</strong> ${proyecto.vendedor || '—'}</div>
            <div><strong>Estado:</strong> ${proyecto.estado}</div>
            <div><strong>Avance:</strong> ${proyecto.avance}%</div>
        `;

        document.getElementById('paso1_nombre').value = proyecto.nombre || '';
        document.getElementById('paso1_cliente').value = proyecto.cliente || '';
        document.getElementById('paso1_fecha').value = proyecto.fecha || '';
        document.getElementById('paso1_vendedor').value = proyecto.vendedor || '';
        document.getElementById('paso1_notasGenerales').value = proyecto.notasGenerales || '';
        document.getElementById('paso1_notasInternas').value = proyecto.notasInternas || '';

        actividades = proyecto.actividades || [];
        materiales = proyecto.materiales || [];
        epicas = proyecto.epicas || [];

        renderActividades();
        renderMateriales();
        renderEpicas();
        
        cambiarPaso(1);
    }

    function deseleccionarProyecto() {
        document.getElementById('selectedProject').style.display = 'none';
        currentProjectId = null;
    }

    function cambiarPaso(paso) {
        document.querySelectorAll('.step-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.step-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`.step-btn[data-step="${paso}"]`).classList.add('active');
        document.getElementById(`paso${paso}`).classList.add('active');
        currentStep = paso;
    }

    // ============================================================
    // 6. PASO 1: LEVANTAMIENTO
    // ============================================================
    function guardarPaso1() {
        if (!currentProjectId) return;

        const proyecto = proyectos.find(p => p.id === currentProjectId);
        if (!proyecto) return;

        proyecto.nombre = document.getElementById('paso1_nombre').value;
        proyecto.cliente = document.getElementById('paso1_cliente').value;
        proyecto.fecha = document.getElementById('paso1_fecha').value;
        proyecto.vendedor = document.getElementById('paso1_vendedor').value;
        proyecto.notasGenerales = document.getElementById('paso1_notasGenerales').value;
        proyecto.notasInternas = document.getElementById('paso1_notasInternas').value;

        renderTabla();
        renderKanban();
        alert('✅ Datos guardados');
    }

    // ============================================================
    // 7. PASO 2: INGENIERÍA
    // ============================================================
    function agregarActividad() {
        actividades.push({
            area: '',
            servicio: '',
            tipo: 'O',
            horas: 0
        });
        renderActividades();
    }

    function renderActividades() {
        const tbody = document.getElementById('actividadesBody');
        if (!tbody) return;

        if (actividades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay actividades</td></tr>';
            return;
        }

        tbody.innerHTML = actividades.map((act, index) => {
            let areaOptions = '<option value="">Seleccionar</option>';
            catalogoServicios.forEach(s => {
                areaOptions += `<option value="${s.area}" ${act.area === s.area ? 'selected' : ''}>${s.area}</option>`;
            });

            let servicioOptions = '<option value="">Seleccionar</option>';
            catalogoServicios.filter(s => s.area === act.area).forEach(s => {
                servicioOptions += `<option value="${s.servicio}" ${act.servicio === s.servicio ? 'selected' : ''}>${s.servicio}</option>`;
            });

            return `
                <tr>
                    <td>
                        <select onchange="ServiciosCore.actualizarActividad(${index}, 'area', this.value)">
                            ${areaOptions}
                        </select>
                    </td>
                    <td>
                        <select onchange="ServiciosCore.actualizarActividad(${index}, 'servicio', this.value)">
                            ${servicioOptions}
                        </select>
                    </td>
                    <td>
                        <select onchange="ServiciosCore.actualizarActividad(${index}, 'tipo', this.value)">
                            <option value="O" ${act.tipo === 'O' ? 'selected' : ''}>Oficina</option>
                            <option value="P" ${act.tipo === 'P' ? 'selected' : ''}>Planta</option>
                        </select>
                    </td>
                    <td><input type="number" value="${act.horas}" min="0" step="0.5" onchange="ServiciosCore.actualizarActividad(${index}, 'horas', this.value)"></td>
                    <td><button class="btn-remove" onclick="ServiciosCore.eliminarActividad(${index})">✖</button></td>
                </tr>
            `;
        }).join('');
    }

    function actualizarActividad(index, campo, valor) {
        if (actividades[index]) {
            actividades[index][campo] = valor;
            if (campo === 'area') {
                actividades[index].servicio = '';
                renderActividades();
            }
        }
    }

    function eliminarActividad(index) {
        actividades.splice(index, 1);
        renderActividades();
    }

    function generarCronograma() {
        const ganttContainer = document.getElementById('ganttContainer');
        const ganttHeader = document.getElementById('ganttHeader');
        const ganttBody = document.getElementById('ganttBody');

        if (actividades.length === 0) {
            alert('Agregue actividades primero');
            return;
        }

        let totalHoras = actividades.reduce((sum, a) => sum + (parseFloat(a.horas) || 0), 0);
        if (totalHoras === 0) {
            alert('Las actividades deben tener horas asignadas');
            return;
        }

        const diasTotales = Math.ceil(totalHoras / 8);
        const fechaInicio = new Date();

        let headerHtml = '<div style="width:200px;"></div>';
        for (let i = 0; i < diasTotales; i++) {
            const fecha = new Date(fechaInicio);
            fecha.setDate(fecha.getDate() + i);
            headerHtml += `<div style="width:40px; text-align:center; font-size:10px;">D${i+1}</div>`;
        }
        ganttHeader.innerHTML = headerHtml;

        let bodyHtml = '';
        let inicioAcumulado = 0;

        actividades.forEach((act, index) => {
            if (!act.servicio || !act.horas) return;

            const horas = parseFloat(act.horas);
            const dias = horas / 8;
            const ancho = Math.round(dias * 40);
            const inicio = inicioAcumulado * 40;
            
            bodyHtml += `
                <div class="gantt-row">
                    <div class="gantt-label">${act.servicio}</div>
                    <div class="gantt-bar-container">
                        <div class="gantt-bar ${act.tipo === 'O' ? 'gantt-office' : 'gantt-plant'}" 
                             style="width: ${ancho}px; margin-left: ${inicio}px;">
                            ${horas}h
                        </div>
                    </div>
                </div>
            `;

            inicioAcumulado += dias;
        });

        ganttBody.innerHTML = bodyHtml;
        ganttContainer.style.display = 'block';
    }

    function exportarCronogramaPDF() {
        alert('Función de exportar PDF (simulada)');
    }

    // ============================================================
    // 8. PASO 3: MATERIALES
    // ============================================================
    function cargarInventarioSelect() {
        const select = document.getElementById('inventarioSelect');
        if (!select) return;

        select.innerHTML = '<option value="">Seleccionar producto</option>';
        inventario.forEach(item => {
            select.innerHTML += `<option value="${item.sku}">${item.nombre}</option>`;
        });
    }

    function agregarDesdeInventario() {
        const select = document.getElementById('inventarioSelect');
        const sku = select.value;
        if (!sku) return;

        const item = inventario.find(i => i.sku === sku);
        if (item) {
            materiales.push({
                nombre: item.nombre,
                descripcion: item.descripcion,
                cantidad: 1,
                sku: item.sku
            });
            renderMateriales();
        }
    }

    function agregarMaterialManual() {
        materiales.push({
            nombre: '',
            descripcion: '',
            cantidad: 1,
            sku: ''
        });
        renderMateriales();
    }

    function renderMateriales() {
        const tbody = document.getElementById('materialesBody');
        if (!tbody) return;

        if (materiales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay materiales</td></tr>';
            return;
        }

        tbody.innerHTML = materiales.map((mat, index) => `
            <tr>
                <td><input type="text" value="${mat.nombre}" onchange="ServiciosCore.actualizarMaterial(${index}, 'nombre', this.value)"></td>
                <td><input type="text" value="${mat.descripcion}" onchange="ServiciosCore.actualizarMaterial(${index}, 'descripcion', this.value)"></td>
                <td><input type="number" value="${mat.cantidad}" min="1" onchange="ServiciosCore.actualizarMaterial(${index}, 'cantidad', this.value)"></td>
                <td><input type="text" value="${mat.sku}" onchange="ServiciosCore.actualizarMaterial(${index}, 'sku', this.value)"></td>
                <td><button class="btn-remove" onclick="ServiciosCore.eliminarMaterial(${index})">✖</button></td>
            </tr>
        `).join('');
    }

    function actualizarMaterial(index, campo, valor) {
        if (materiales[index]) {
            materiales[index][campo] = valor;
        }
    }

    function eliminarMaterial(index) {
        materiales.splice(index, 1);
        renderMateriales();
    }

    function guardarMateriales() {
        if (currentProjectId) {
            const proyecto = proyectos.find(p => p.id === currentProjectId);
            if (proyecto) {
                proyecto.materiales = materiales;
                alert('✅ Materiales guardados');
            }
        }
    }

    // ============================================================
    // 9. PASO 4: DESARROLLO
    // ============================================================
    function crearEpica() {
        const input = document.getElementById('nuevaEpica');
        const titulo = input.value.trim();
        if (!titulo) return;

        epicas.push({
            id: Date.now(),
            titulo: titulo,
            key: `PRUEB-${epicas.length + 1}`,
            tareas: []
        });

        input.value = '';
        renderEpicas();
    }

    function renderEpicas() {
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
                    <span class="epica-key">${epica.key}</span>
                </div>
                <div class="tareas-container" id="tareas-${epica.id}">
                    ${renderTareas(epica.tareas, epica.id, epicaIndex)}
                </div>
                <button class="btn-add" onclick="ServiciosCore.agregarTarea(${epicaIndex})">
                    <i class="fas fa-plus"></i> Agregar tarea
                </button>
            </div>
        `).join('');
    }

    function renderTareas(tareas, epicaId, epicaIndex) {
        if (tareas.length === 0) return '<p style="color:var(--text-light);">No hay tareas</p>';

        return tareas.map((tarea, tIndex) => `
            <div class="tarea-item">
                <div class="tarea-header">
                    <span class="tarea-titulo">${tarea.titulo}</span>
                    <span class="tarea-asignado">${tarea.asignado || 'Sin asignar'}</span>
                </div>
                <div class="subtareas-list" id="subtareas-${epicaId}-${tIndex}">
                    ${renderSubtareas(tarea.subtareas, epicaId, tIndex)}
                </div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" id="nuevaSubtarea-${epicaId}-${tIndex}" placeholder="Nueva subtarea..." style="flex:1; padding:5px;">
                    <button onclick="ServiciosCore.agregarSubtarea('${epicaId}', ${tIndex})">➕</button>
                </div>
            </div>
        `).join('');
    }

    function renderSubtareas(subtareas, epicaId, tareaIndex) {
        if (!subtareas || subtareas.length === 0) return '';

        return subtareas.map((sub, sIndex) => `
            <div class="subtarea-item">
                <div class="subtarea-checkbox ${sub.completado ? 'checked' : ''}" 
                     onclick="ServiciosCore.toggleSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})">
                    ${sub.completado ? '✓' : ''}
                </div>
                <span class="${sub.completado ? 'completado' : ''}">${sub.texto}</span>
                <button onclick="ServiciosCore.eliminarSubtarea('${epicaId}', ${tareaIndex}, ${sIndex})" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function agregarTarea(epicaIndex) {
        const titulo = prompt('Título de la tarea:');
        if (!titulo) return;

        epicas[epicaIndex].tareas.push({
            titulo: titulo,
            asignado: '',
            subtareas: []
        });

        renderEpicas();
    }

    function agregarSubtarea(epicaId, tareaIndex) {
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
            renderEpicas();
        }
    }

    function toggleSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex] && epica.tareas[tareaIndex].subtareas[subIndex]) {
            epica.tareas[tareaIndex].subtareas[subIndex].completado = 
                !epica.tareas[tareaIndex].subtareas[subIndex].completado;
            renderEpicas();
        }
    }

    function eliminarSubtarea(epicaId, tareaIndex, subIndex) {
        const epica = epicas.find(e => e.id == epicaId);
        if (epica && epica.tareas[tareaIndex]) {
            epica.tareas[tareaIndex].subtareas.splice(subIndex, 1);
            renderEpicas();
        }
    }

    // ============================================================
    // 10. PASO 5: ENTREGA
    // ============================================================
    function renderApartados() {
        const container = document.getElementById('apartadosContainer');
        if (!container) return;

        container.innerHTML = apartados.map(ap => `
            <div class="apartado-card">
                <div class="apartado-header">
                    <input type="text" class="apartado-titulo-input" value="${ap.titulo}" 
                           onchange="ServiciosCore.actualizarTituloApartado('${ap.id}', this.value)">
                    <div class="apartado-actions">
                        <button onclick="ServiciosCore.subirArchivo('${ap.id}')"><i class="fas fa-upload"></i></button>
                        <button onclick="ServiciosCore.eliminarApartado('${ap.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <textarea class="apartado-nota" placeholder="Notas..." 
                          onchange="ServiciosCore.actualizarNotaApartado('${ap.id}', this.value)">${ap.nota || ''}</textarea>
                <div id="archivos-${ap.id}">
                    ${renderArchivos(ap.archivos, ap.id)}
                </div>
            </div>
        `).join('');
    }

    function renderArchivos(archivos, apartadoId) {
        if (!archivos || archivos.length === 0) return '';

        return archivos.map(arch => `
            <div class="archivo-item">
                <i class="fas fa-file"></i> ${arch.nombre}
                <button onclick="ServiciosCore.eliminarArchivo('${apartadoId}', '${arch.nombre}')" style="margin-left:auto;">✖</button>
            </div>
        `).join('');
    }

    function crearNuevoApartado() {
        const titulo = prompt('Título del nuevo apartado:');
        if (!titulo) return;

        apartados.push({
            id: 'ap' + Date.now(),
            titulo: titulo,
            nota: '',
            archivos: []
        });

        renderApartados();
    }

    function actualizarTituloApartado(id, nuevoTitulo) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.titulo = nuevoTitulo;
    }

    function actualizarNotaApartado(id, nota) {
        const ap = apartados.find(a => a.id === id);
        if (ap) ap.nota = nota;
    }

    function subirArchivo(id) {
        alert('Simulación: Seleccionar archivo para subir');
    }

    function eliminarArchivo(apartadoId, nombreArchivo) {
        const ap = apartados.find(a => a.id === apartadoId);
        if (ap && ap.archivos) {
            ap.archivos = ap.archivos.filter(a => a.nombre !== nombreArchivo);
            renderApartados();
        }
    }

    function eliminarApartado(id) {
        if (confirm('¿Eliminar este apartado?')) {
            apartados = apartados.filter(a => a.id !== id);
            renderApartados();
        }
    }

    // ============================================================
    // 11. LIMPIEZA
    // ============================================================
    function _cleanup() {
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ============================================================
    // 12. API PÚBLICA
    // ============================================================
    return {
        init,
        seleccionarProyecto,
        deseleccionarProyecto,
        cambiarPaso,
        actualizarActividad,
        eliminarActividad,
        actualizarMaterial,
        eliminarMaterial,
        agregarTarea,
        agregarSubtarea,
        toggleSubtarea,
        eliminarSubtarea,
        actualizarTituloApartado,
        actualizarNotaApartado,
        subirArchivo,
        eliminarArchivo,
        eliminarApartado
    };
})();

// ============================================================
// INICIALIZACIÓN AUTOMÁTICA
// ============================================================
(function() {
    let checkAuth = setInterval(function() {
        if (window.auth) {
            clearInterval(checkAuth);
            window.auth.onAuthStateChanged(function(user) {
                if (user && user.email === 'norbertomoro4@gmail.com') {
                    window.ServiciosCore = ServiciosCore;
                    ServiciosCore.init();
                } else {
                    window.location.href = 'ssepi_website.html';
                }
            });
        }
    }, 100);
})();