// ================================================
// ARCHIVO: soporte.js
// DESCRIPCIÓN: Módulo completo de Soporte de Planta (Visitas Técnicas)
// SEGURIDAD: Integración con servicios de datos, autenticación, auditoría
// FUNCIONALIDAD: Gestión de visitas de soporte, conversión a proyectos de automatización
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';

const SoporteModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let visits = [];
    let currentVisit = null;
    let visitId = null;
    let isNewVisit = true;

    // Filtros
    let filtroFechaInicio = null;
    let filtroFechaFin = null;
    let filtroTecnico = 'todos';
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let vistaActual = 'kanban';
    let chartInstance = null;

    // Servicios de datos
    const visitasService = createDataService('soporte_visitas');
    const proyectosService = createDataService('proyectos_automatizacion');
    const supabase = window.supabase;

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        await _initUI();
        _bindEvents();
        await _loadInitialData();
        _startClock();
        console.log('✅ Módulo soporte iniciado');
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
        const now = new Date();
        document.getElementById('fecha').value = now.toISOString().split('T')[0];
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
            el = document.getElementById('clock');
            if (el) el.innerText = fmt24();
        }, 1000);
    }

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        await _loadVisits();
    }

    async function _loadVisits() {
        visits = await visitasService.select({}, { orderBy: 'fecha', ascending: false });
        _applyFilters();
    }

    // ==================== FILTROS Y VISTAS ====================
    function _applyFilters() {
        let filtered = visits;

        if (filtroFechaInicio && filtroFechaFin) {
            filtered = filtered.filter(v => {
                const f = new Date(v.fecha);
                return f >= filtroFechaInicio && f <= filtroFechaFin;
            });
        }
        if (filtroTecnico !== 'todos') {
            filtered = filtered.filter(v => v.tecnico === filtroTecnico);
        }
        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(v => v.estado === filtroEstado);
        }
        if (filtroBuscar) {
            const term = filtroBuscar.toLowerCase();
            filtered = filtered.filter(v => 
                (v.cliente && v.cliente.toLowerCase().includes(term)) ||
                (v.folio && v.folio.toLowerCase().includes(term)) ||
                (v.equipo && v.equipo.toLowerCase().includes(term))
            );
        }

        if (vistaActual === 'kanban') _renderKanban(filtered);
        else if (vistaActual === 'lista') _renderLista(filtered);
        else if (vistaActual === 'grafica') _renderGrafica(filtered);

        _updateKPIs(filtered);
    }

    function _renderKanban(visitas) {
        const container = document.getElementById('kanbanContainer');
        if (!container) return;
        const estados = [
            { id: 'confirmacion', label: 'En Confirmación', color: '#ff9800' },
            { id: 'proyecto', label: 'Convertidas a Proyecto', color: '#2196f3' },
            { id: 'cancelado', label: 'Canceladas', color: '#f44336' }
        ];
        let html = '';
        estados.forEach(estado => {
            const filtrados = visitas.filter(v => v.estado === estado.id);
            html += `
                <div class="kanban-column">
                    <div class="kanban-header" style="border-bottom-color: ${estado.color};">
                        <span>${estado.label}</span>
                        <span class="badge" style="background: ${estado.color};">${filtrados.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${filtrados.map(v => _crearCardKanban(v)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => _editarVisita(card.dataset.id));
        });
    }

    function _crearCardKanban(visita) {
        return `
            <div class="kanban-card" data-id="${visita.id}">
                <div class="card-header">
                    <span class="folio">${visita.folio || visita.id.slice(-6)}</span>
                </div>
                <div class="card-body">
                    <div class="cliente">${visita.cliente || 'Cliente'}</div>
                    <div class="equipo">${visita.equipo || 'Equipo'}</div>
                </div>
                <div class="card-footer">
                    <small>Fecha: ${visita.fecha ? new Date(visita.fecha).toLocaleDateString() : ''}</small>
                    <small>${visita.tecnico || ''}</small>
                </div>
            </div>
        `;
    }

    function _renderLista(visitas) {
        const container = document.getElementById('listaContainer');
        if (!container) return;
        let html = '<table class="lista-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Equipo</th><th>Técnico</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>';
        visitas.forEach(v => {
            let estadoClass = '';
            let estadoTexto = '';
            if (v.estado === 'confirmacion') { estadoClass = 'status-confirmacion'; estadoTexto = 'Confirmación'; }
            else if (v.estado === 'proyecto') { estadoClass = 'status-proyecto'; estadoTexto = 'Proyecto'; }
            else if (v.estado === 'cancelado') { estadoClass = 'status-cancelado'; estadoTexto = 'Cancelado'; }
            html += `<tr onclick="soporteModule._editarVisita('${v.id}')">
                <td>${v.folio || v.id.slice(-6)}</td>
                <td>${v.cliente || ''}</td>
                <td>${v.equipo || ''}</td>
                <td>${v.tecnico || ''}</td>
                <td>${v.fecha || ''}</td>
                <td><span class="status-badge ${estadoClass}">${estadoTexto}</span></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function _renderGrafica(visitas) {
        const ctx = document.getElementById('graficaCanvas').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        const confirmacion = visitas.filter(v => v.estado === 'confirmacion').length;
        const proyecto = visitas.filter(v => v.estado === 'proyecto').length;
        const cancelado = visitas.filter(v => v.estado === 'cancelado').length;
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['En Confirmación', 'Convertidas', 'Canceladas'],
                datasets: [{
                    data: [confirmacion, proyecto, cancelado],
                    backgroundColor: ['#ff9800', '#2196f3', '#f44336']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function _updateKPIs(visitas) {
        document.getElementById('kpiTotal').innerText = visitas.length;
        document.getElementById('kpiConfirmacion').innerText = visitas.filter(v => v.estado === 'confirmacion').length;
        document.getElementById('kpiProyecto').innerText = visitas.filter(v => v.estado === 'proyecto').length;
        document.getElementById('kpiCancelado').innerText = visitas.filter(v => v.estado === 'cancelado').length;
    }

    // ==================== FUNCIONES DEL MODAL ====================
    function _nuevaVisita() {
        isNewVisit = true;
        currentVisit = null;
        visitId = null;
        _resetForm();
        _generarFolio();
        document.getElementById('wsModal').classList.add('active');
    }

    async function _editarVisita(id) {
        const visita = visits.find(v => v.id === id);
        if (!visita) return;
        currentVisit = visita;
        visitId = id;
        isNewVisit = false;
        _cargarDatosEnModal(visita);
        document.getElementById('wsModal').classList.add('active');
    }

    function _cargarDatosEnModal(visita) {
        document.getElementById('folio').value = visita.folio || '';
        document.getElementById('fecha').value = visita.fecha || '';
        document.getElementById('cliente').value = visita.cliente || '';
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

        document.querySelectorAll('#actividadesCheckbox input').forEach(cb => {
            cb.checked = visita.actividades && visita.actividades.includes(cb.value);
        });
    }

    async function _guardarVisita() {
        const data = {
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
            data.actividades.push(cb.value);
        });

        if (!data.cliente) { alert('El cliente es obligatorio'); return; }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            if (isNewVisit) {
                const inserted = await visitasService.insert(data, csrfToken);
                visitId = inserted.id;
                isNewVisit = false;
                alert('✅ Visita guardada');
            } else {
                await visitasService.update(visitId, data, csrfToken);
                alert('✅ Visita actualizada');
            }
            _addToFeed('💾', `Visita ${data.folio} guardada`);
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _confirmarVisita() {
        if (!visitId && !isNewVisit) {
            alert('Primero guarde la visita');
            return;
        }

        // Guardar primero si es nueva
        if (isNewVisit) {
            await _guardarVisita();
        }

        const data = { estado: 'proyecto' };
        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await visitasService.update(visitId, data, csrfToken);

            // Crear proyecto en Automatización con los datos de la visita
            const visita = await visitasService.getById(visitId);
            const nuevoProyecto = {
                origen: 'soporte',
                visita_id: visitId,
                folio: 'AUT-' + Date.now().toString().slice(-6),
                nombre: `Proyecto: ${visita.equipo || visita.cliente}`,
                cliente: visita.cliente,
                fecha: new Date().toISOString().split('T')[0],
                vendedor: visita.tecnico,
                notasGenerales: `Proyecto generado desde visita de soporte ${visita.folio}\n\nObjetivo: ${visita.objetivo}\nRecomendaciones: ${visita.recomendaciones}`,
                notasInternas: `Visita original: ${visita.folio}\nTécnico: ${visita.tecnico}\nActividades: ${visita.actividades?.join(', ')}`,
                estado: 'pendiente',
                avance: 0,
                actividades: [],
                materiales: [],
                epicas: []
            };
            await proyectosService.insert(nuevoProyecto, csrfToken);

            alert('✅ Visita confirmada y enviada a Automatización como proyecto');
            _addToFeed('✅', `Visita ${visita.folio} confirmada y enviada a proyectos`);
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    async function _cancelarVisita() {
        if (!visitId && !isNewVisit) {
            alert('Primero guarde la visita');
            return;
        }
        if (!confirm('¿Cancelar esta visita? Se marcará como cancelada.')) return;

        if (isNewVisit) {
            await _guardarVisita();
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        try {
            await visitasService.update(visitId, { estado: 'cancelado' }, csrfToken);
            alert('✅ Visita cancelada');
            _addToFeed('❌', `Visita cancelada`);
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        }
    }

    function _generarFolio() {
        const now = new Date();
        const folio = `SP-${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
        document.getElementById('folio').value = folio;
    }

    function _resetForm() {
        document.getElementById('folio').value = '';
        document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('cliente').value = '';
        document.getElementById('area').value = '';
        document.getElementById('ubicacion').value = '';
        document.getElementById('equipo').value = '';
        document.getElementById('responsableCliente').value = '';
        document.getElementById('tecnico').value = '';
        document.getElementById('departamento').value = 'Electrónica';
        document.getElementById('horaInicio').value = '';
        document.getElementById('horaFinal').value = '';
        document.getElementById('objetivo').value = '';
        document.getElementById('descripcionActividades').value = '';
        document.getElementById('pruebasRealizadas').value = '';
        document.getElementById('recomendaciones').value = '';
        document.getElementById('observacionesCliente').value = '';
        document.querySelectorAll('#actividadesCheckbox input').forEach(cb => cb.checked = false);
    }

    function _cerrarModal() {
        document.getElementById('wsModal').classList.remove('active');
        currentVisit = null;
        visitId = null;
        isNewVisit = true;
    }

    function _addToFeed(icono, mensaje) {
        const feed = document.getElementById('feedList');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-dot"></div>
            <div class="feed-meta">
                <span style="color:var(--c-proyectos);">SOPORTE</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="feed-body">${icono} ${mensaje}</div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 20) feed.removeChild(feed.lastChild);
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        document.getElementById('newVisitaBtn').addEventListener('click', _nuevaVisita);
        document.getElementById('closeWsBtn').addEventListener('click', _cerrarModal);
        document.getElementById('cancelWsBtn').addEventListener('click', _cerrarModal);
        document.getElementById('guardarVisitaBtn').addEventListener('click', _guardarVisita);
        document.getElementById('confirmarVisitaBtn').addEventListener('click', _confirmarVisita);
        document.getElementById('cancelarVisitaEstadoBtn').addEventListener('click', _cancelarVisita);

        document.getElementById('aplicarFiltrosBtn').addEventListener('click', () => {
            filtroFechaInicio = document.getElementById('filtroFechaInicio').valueAsDate;
            filtroFechaFin = document.getElementById('filtroFechaFin').valueAsDate;
            filtroTecnico = document.getElementById('filtroTecnico').value;
            filtroEstado = document.getElementById('filtroEstado').value;
            filtroBuscar = document.getElementById('filtroBuscar').value.trim();
            _applyFilters();
        });

        document.getElementById('vistaKanban').addEventListener('click', () => {
            vistaActual = 'kanban';
            document.getElementById('kanbanContainer').style.display = 'flex';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaKanban').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaLista').addEventListener('click', () => {
            vistaActual = 'lista';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'block';
            document.getElementById('graficaContainer').style.display = 'none';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaLista').classList.add('active');
            _applyFilters();
        });
        document.getElementById('vistaGrafica').addEventListener('click', () => {
            vistaActual = 'grafica';
            document.getElementById('kanbanContainer').style.display = 'none';
            document.getElementById('listaContainer').style.display = 'none';
            document.getElementById('graficaContainer').style.display = 'block';
            document.querySelectorAll('.vistas button').forEach(b => b.classList.remove('active'));
            document.getElementById('vistaGrafica').classList.add('active');
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

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _editarVisita
    };
})();

window.soporteModule = SoporteModule;