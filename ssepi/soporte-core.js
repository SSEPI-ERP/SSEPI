// soporte-core.js - Lógica de Soporte de Planta
const SoporteCore = (function() {
    // ============================================================
    // 1. ESTADO PRIVADO
    // ============================================================
    let visitas = [];
    let currentVisitaId = null;
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
        document.getElementById('fecha').value = hoy;

        // Generar folio
        document.getElementById('folio').value = 'SP-' + Date.now().toString().slice(-6);
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

        // Botones
        document.getElementById('nuevaVisitaBtn').addEventListener('click', nuevaVisita);
        document.getElementById('cancelarVisitaBtn').addEventListener('click', cancelarEdicion);
        document.getElementById('guardarVisitaBtn').addEventListener('click', guardarVisita);
        document.getElementById('confirmarVisitaBtn').addEventListener('click', confirmarVisita);
        document.getElementById('cancelarVisitaEstadoBtn').addEventListener('click', cancelarVisitaEstado);
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
        // Visitas de ejemplo
        visitas = [
            {
                id: '1',
                folio: 'SP-001',
                fecha: '2026-02-15',
                cliente: 'SERVIACERO',
                area: 'Producción',
                equipo: 'Horno industrial',
                tecnico: 'Carlos Ruiz',
                estado: 'confirmacion',
                actividades: []
            },
            {
                id: '2',
                folio: 'SP-002',
                fecha: '2026-02-10',
                cliente: 'PIELES AZTECA',
                area: 'Mantenimiento',
                equipo: 'Secadora',
                tecnico: 'María López',
                estado: 'proyecto',
                actividades: []
            },
            {
                id: '3',
                folio: 'SP-003',
                fecha: '2026-02-05',
                cliente: 'BODYCOTE',
                area: 'Calidad',
                equipo: 'Medidor',
                tecnico: 'Juan Pérez',
                estado: 'cancelado',
                actividades: []
            }
        ];

        renderTabla();
        renderKanban();
        renderChart();
        actualizarKPIs();
    }

    // ============================================================
    // 4. FUNCIONES DE RENDERIZADO
    // ============================================================
    function renderTabla() {
        const tbody = document.getElementById('visitasTableBody');
        if (!tbody) return;

        let filtradas = filtrarVisitas();

        if (filtradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px;">No hay visitas</td></tr>';
            return;
        }

        tbody.innerHTML = filtradas.map(v => {
            let estadoClass = '';
            let estadoTexto = '';
            
            if (v.estado === 'confirmacion') {
                estadoClass = 'status-confirmacion';
                estadoTexto = 'En confirmación';
            } else if (v.estado === 'proyecto') {
                estadoClass = 'status-proyecto';
                estadoTexto = 'Proyecto';
            } else if (v.estado === 'cancelado') {
                estadoClass = 'status-cancelado';
                estadoTexto = 'Cancelado';
            }

            return `
                <tr onclick="SoporteCore.editarVisita('${v.id}')">
                    <td><strong>${v.folio}</strong></td>
                    <td>${v.cliente}</td>
                    <td>${v.equipo || '—'}</td>
                    <td>${v.tecnico || '—'}</td>
                    <td>${v.fecha}</td>
                    <td><span class="status-badge ${estadoClass}">${estadoTexto}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); SoporteCore.editarVisita('${v.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderKanban() {
        let filtradas = filtrarVisitas();

        const confirmacion = filtradas.filter(v => v.estado === 'confirmacion');
        const proyecto = filtradas.filter(v => v.estado === 'proyecto');
        const cancelado = filtradas.filter(v => v.estado === 'cancelado');

        document.getElementById('kanbanConfirmacionCount').innerText = confirmacion.length;
        document.getElementById('kanbanProyectoCount').innerText = proyecto.length;
        document.getElementById('kanbanCanceladoCount').innerText = cancelado.length;

        document.getElementById('kanbanConfirmacion').innerHTML = renderKanbanCards(confirmacion);
        document.getElementById('kanbanProyecto').innerHTML = renderKanbanCards(proyecto);
        document.getElementById('kanbanCancelado').innerHTML = renderKanbanCards(cancelado);
    }

    function renderKanbanCards(items) {
        if (items.length === 0) {
            return '<div style="text-align:center; padding:20px; color:var(--text-light);">Sin elementos</div>';
        }

        return items.map(v => `
            <div class="kanban-card" onclick="SoporteCore.editarVisita('${v.id}')">
                <div class="kanban-folio">${v.folio}</div>
                <div class="kanban-titulo">${v.cliente}</div>
                <div class="kanban-cliente">${v.equipo || 'Sin equipo'}</div>
                <div class="kanban-footer">
                    <span>${v.fecha}</span>
                    <span>${v.tecnico || '—'}</span>
                </div>
            </div>
        `).join('');
    }

    function renderChart() {
        const ctx = document.getElementById('visitasChart').getContext('2d');
        
        if (chartInstance) {
            chartInstance.destroy();
        }

        const confirmacion = visitas.filter(v => v.estado === 'confirmacion').length;
        const proyecto = visitas.filter(v => v.estado === 'proyecto').length;
        const cancelado = visitas.filter(v => v.estado === 'cancelado').length;

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['En confirmación', 'Convertidas a proyecto', 'Canceladas'],
                datasets: [{
                    data: [confirmacion, proyecto, cancelado],
                    backgroundColor: ['#ff9800', '#2196f3', '#f44336']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    function filtrarVisitas() {
        let filtradas = [...visitas];

        const estadoFiltro = document.querySelector('.filter-btn.active')?.dataset.filter;
        if (estadoFiltro && estadoFiltro !== 'all') {
            filtradas = filtradas.filter(v => v.estado === estadoFiltro);
        }

        const busqueda = document.getElementById('searchInput').value.toLowerCase();
        if (busqueda) {
            filtradas = filtradas.filter(v => 
                v.cliente.toLowerCase().includes(busqueda) ||
                (v.equipo && v.equipo.toLowerCase().includes(busqueda)) ||
                v.folio.toLowerCase().includes(busqueda)
            );
        }

        return filtradas;
    }

    function actualizarKPIs() {
        document.getElementById('kpiTotal').innerText = visitas.length;
        document.getElementById('kpiConfirmacion').innerText = visitas.filter(v => v.estado === 'confirmacion').length;
        document.getElementById('kpiProyecto').innerText = visitas.filter(v => v.estado === 'proyecto').length;
        document.getElementById('kpiCancelado').innerText = visitas.filter(v => v.estado === 'cancelado').length;
    }

    function aplicarFiltros() {
        renderTabla();
        renderKanban();
    }

    function cambiarVista(vista) {
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        document.getElementById(vista + 'View').classList.add('active');
        
        if (vista === 'kanban') renderKanban();
        if (vista === 'chart') renderChart();
    }

    // ============================================================
    // 5. CRUD DE VISITAS
    // ============================================================
    function nuevaVisita() {
        currentVisitaId = null;
        document.getElementById('formTitulo').innerText = 'Nueva Visita de Soporte';
        document.getElementById('visitaForm').style.display = 'block';
        document.getElementById('folio').value = 'SP-' + Date.now().toString().slice(-6);
        
        // Limpiar formulario
        document.getElementById('visitaId').value = '';
        document.getElementById('cliente').value = '';
        document.getElementById('area').value = '';
        document.getElementById('ubicacion').value = '';
        document.getElementById('equipo').value = '';
        document.getElementById('responsableCliente').value = '';
        document.getElementById('tecnico').value = '';
        document.getElementById('horaInicio').value = '';
        document.getElementById('horaFinal').value = '';
        document.getElementById('objetivo').value = '';
        document.getElementById('descripcionActividades').value = '';
        document.getElementById('pruebasRealizadas').value = '';
        document.getElementById('recomendaciones').value = '';
        document.getElementById('observacionesCliente').value = '';

        // Desmarcar checkboxes
        document.querySelectorAll('#actividadesCheckbox input').forEach(cb => cb.checked = false);
    }

    function editarVisita(id) {
        currentVisitaId = id;
        const visita = visitas.find(v => v.id === id);
        if (!visita) return;

        document.getElementById('formTitulo').innerText = 'Editar Visita';
        document.getElementById('visitaForm').style.display = 'block';
        document.getElementById('visitaId').value = visita.id;
        document.getElementById('folio').value = visita.folio;
        document.getElementById('fecha').value = visita.fecha;
        document.getElementById('cliente').value = visita.cliente;
        document.getElementById('area').value = visita.area || '';
        document.getElementById('ubicacion').value = visita.ubicacion || '';
        document.getElementById('equipo').value = visita.equipo || '';
        document.getElementById('responsableCliente').value = visita.responsableCliente || '';
        document.getElementById('tecnico').value = visita.tecnico || '';
        document.getElementById('departamento').value = visita.departamento || 'Electrónica';
        document.getElementById('horaInicio').value = visita.horaInicio || '';
        document.getElementById('horaFinal').value = visita.horaFinal || '';
        document.getElementById('objetivo').value = visita.objetivo || '';
        document.getElementById('descripcionActividades').value = visita.descripcionActividades || '';
        document.getElementById('pruebasRealizadas').value = visita.pruebasRealizadas || '';
        document.getElementById('recomendaciones').value = visita.recomendaciones || '';
        document.getElementById('observacionesCliente').value = visita.observacionesCliente || '';

        // Marcar checkboxes
        document.querySelectorAll('#actividadesCheckbox input').forEach(cb => {
            cb.checked = visita.actividades && visita.actividades.includes(cb.value);
        });
    }

    function guardarVisita() {
        const visita = {
            id: currentVisitaId || Date.now().toString(),
            folio: document.getElementById('folio').value,
            fecha: document.getElementById('fecha').value,
            cliente: document.getElementById('cliente').value,
            area: document.getElementById('area').value,
            ubicacion: document.getElementById('ubicacion').value,
            equipo: document.getElementById('equipo').value,
            responsableCliente: document.getElementById('responsableCliente').value,
            tecnico: document.getElementById('tecnico').value,
            departamento: document.getElementById('departamento').value,
            horaInicio: document.getElementById('horaInicio').value,
            horaFinal: document.getElementById('horaFinal').value,
            objetivo: document.getElementById('objetivo').value,
            actividades: [],
            descripcionActividades: document.getElementById('descripcionActividades').value,
            pruebasRealizadas: document.getElementById('pruebasRealizadas').value,
            recomendaciones: document.getElementById('recomendaciones').value,
            observacionesCliente: document.getElementById('observacionesCliente').value,
            estado: 'confirmacion'
        };

        document.querySelectorAll('#actividadesCheckbox input:checked').forEach(cb => {
            visita.actividades.push(cb.value);
        });

        if (!visita.cliente) {
            alert('El cliente es obligatorio');
            return;
        }

        if (currentVisitaId) {
            const index = visitas.findIndex(v => v.id === currentVisitaId);
            if (index !== -1) visitas[index] = visita;
        } else {
            visitas.push(visita);
        }

        renderTabla();
        renderKanban();
        renderChart();
        actualizarKPIs();
        cancelarEdicion();

        // Guardar en Firebase si existe
        if (window.db) {
            window.db.collection('soporte_visitas').doc(visita.id).set(visita).catch(console.error);
        }
    }

    function cancelarEdicion() {
        document.getElementById('visitaForm').style.display = 'none';
        currentVisitaId = null;
    }

    function confirmarVisita() {
        if (!currentVisitaId) {
            alert('Primero guarde la visita');
            return;
        }

        const visita = visitas.find(v => v.id === currentVisitaId);
        if (!visita) return;

        visita.estado = 'proyecto';

        // Enviar a Automatización como proyecto precargado
        if (window.db) {
            // Crear proyecto en Automatización con los datos de la visita
            const proyectoAutomatizacion = {
                origen: 'soporte',
                visitaId: visita.id,
                folio: 'AUT-' + Date.now().toString().slice(-6),
                nombre: `Proyecto: ${visita.equipo || visita.cliente}`,
                cliente: visita.cliente,
                fecha: new Date().toISOString().split('T')[0],
                vendedor: visita.tecnico,
                notasGenerales: `Proyecto generado desde visita de soporte ${visita.folio}\n\nObjetivo: ${visita.objetivo}\nRecomendaciones: ${visita.recomendaciones}`,
                notasInternas: `Visita original: ${visita.folio}\nTécnico: ${visita.tecnico}\nActividades: ${visita.actividades.join(', ')}`,
                estado: 'pendiente',
                avance: 0,
                actividades: [],
                materiales: [],
                epicas: []
            };

            window.db.collection('proyectos_automatizacion').add(proyectoAutomatizacion).then(() => {
                alert('✅ Visita confirmada y enviada a Automatización como proyecto');
            }).catch(console.error);
        } else {
            alert('✅ Visita confirmada (simulación)');
        }

        renderTabla();
        renderKanban();
        renderChart();
        actualizarKPIs();
        cancelarEdicion();
    }

    function cancelarVisitaEstado() {
        if (!currentVisitaId) {
            alert('Primero guarde la visita');
            return;
        }

        if (!confirm('¿Cancelar esta visita? Se marcará como cancelada.')) return;

        const visita = visitas.find(v => v.id === currentVisitaId);
        if (visita) {
            visita.estado = 'cancelado';
            renderTabla();
            renderKanban();
            renderChart();
            actualizarKPIs();
            cancelarEdicion();

            if (window.db) {
                window.db.collection('soporte_visitas').doc(visita.id).update({ estado: 'cancelado' }).catch(console.error);
            }
        }
    }

    // ============================================================
    // 6. LIMPIEZA
    // ============================================================
    function _cleanup() {
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ============================================================
    // 7. API PÚBLICA
    // ============================================================
    return {
        init,
        editarVisita,
        guardarVisita,
        confirmarVisita,
        cancelarVisitaEstado
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
                    window.SoporteCore = SoporteCore;
                    SoporteCore.init();
                } else {
                    window.location.href = 'ssepi_website.html';
                }
            });
        }
    }, 100);
})();