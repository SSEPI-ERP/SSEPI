// ================================================
// ARCHIVO: proyectos.js
// DESCRIPCIÓN: Módulo de Soporte de Planta (Visitas Técnicas) adaptado a Supabase
// BASADO EN: soporte-core.js original, reestructurado con servicios core
// FUNCIONALIDAD: Gestión de visitas de soporte, conversión a proyectos de automatización
// ================================================

import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';

const ProyectosModule = (function() {
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

    function _supabase() { return window.supabase; }

    // Suscripciones
    let subscriptions = [];

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Proyectos] Conectado');
        _bindEvents();
        _setVistaInicial();
        try {
            await _initUI();
        } catch (e) {
            console.warn('[Proyectos] _initUI:', e);
        }
        try {
            await _loadInitialData();
        } catch (e) {
            console.warn('[Proyectos] _loadInitialData:', e);
            visits = visits || [];
            _applyFilters();
        }
        _startClock();
        try {
            _setupRealtime();
        } catch (e) {
            console.warn('[Proyectos] Realtime:', e);
        }
        console.log('✅ Módulo soporte iniciado');
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
        var savedTheme = localStorage.getItem('theme');
        var themeBtn = document.getElementById('themeBtn');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.removeAttribute('data-theme');
            if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-moon"></i>';
        }
        var fechaEl = document.getElementById('fecha');
        if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
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

    // ==================== CARGA DE DATOS INICIAL ====================
    async function _loadInitialData() {
        await _loadVisits();
    }

    async function _loadVisits() {
        try {
            visits = await visitasService.select({}, { orderBy: 'fecha', ascending: false }) || [];
        } catch (e) {
            console.warn('[Proyectos] _loadVisits:', e);
            visits = [];
        }
        _applyFilters();
    }

    function _setupRealtime() {
        const supabase = _supabase();
        if (!supabase) return;
        const subVisitas = supabase
            .channel('soporte_visitas_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'soporte_visitas' }, payload => {
                _loadVisits();
                _addToFeed('📋', 'Datos de visitas actualizados');
            })
            .subscribe();
        subscriptions.push(subVisitas);
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
            html += `<tr onclick="proyectosModule._editarVisita('${v.id}')">
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
        var list = visits || [];
        var elTotal = document.getElementById('kpiTotal');
        var elConf = document.getElementById('kpiConfirmacion');
        var elProy = document.getElementById('kpiProyecto');
        var elCanc = document.getElementById('kpiCancelado');
        if (elTotal) elTotal.innerText = list.length;
        if (elConf) elConf.innerText = list.filter(function (v) { return v.estado === 'confirmacion'; }).length;
        if (elProy) elProy.innerText = list.filter(function (v) { return v.estado === 'proyecto'; }).length;
        if (elCanc) elCanc.innerText = list.filter(function (v) { return v.estado === 'cancelado'; }).length;
    }

    // ==================== FUNCIONES DEL MODAL ====================
    function _nuevaVisita() {
        isNewVisit = true;
        currentVisit = null;
        visitId = null;
        _resetForm();
        _generarFolio();
        var modal = document.getElementById('wsModal');
        if (!modal) {
            console.error('[Proyectos] No se encontró #wsModal');
            alert('No se pudo abrir el formulario. Recarga la página.');
            return;
        }
        modal.classList.add('active');
    }

    async function _editarVisita(id) {
        var visita = visits.find(function (v) { return v.id === id; });
        if (!visita) return;
        currentVisit = visita;
        visitId = id;
        isNewVisit = false;
        _cargarDatosEnModal(visita);
        var modal = document.getElementById('wsModal');
        if (modal) modal.classList.add('active');
    }

    function _cargarDatosEnModal(visita) {
        document.getElementById('folio').value = visita.folio || '';
        document.getElementById('fecha').value = visita.fecha || '';
        document.getElementById('cliente').value = visita.cliente || '';
        document.getElementById('area').value = visita.area || '';
        document.getElementById('ubicacion').value = visita.ubicacion || '';
        document.getElementById('equipo').value = visita.equipo || '';
        document.getElementById('responsableCliente').value = visita.responsable_cliente || '';
        document.getElementById('tecnico').value = visita.tecnico || '';
        document.getElementById('departamento').value = visita.departamento || 'Electrónica';
        document.getElementById('horaInicio').value = visita.hora_inicio || '';
        document.getElementById('horaFinal').value = visita.hora_final || '';
        document.getElementById('objetivo').value = visita.objetivo || '';
        document.getElementById('descripcionActividades').value = visita.descripcion_actividades || '';
        document.getElementById('pruebasRealizadas').value = visita.pruebas_realizadas || '';
        document.getElementById('recomendaciones').value = visita.recomendaciones || '';
        document.getElementById('observacionesCliente').value = visita.observaciones_cliente || '';

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
            responsable_cliente: document.getElementById('responsableCliente').value,
            tecnico: document.getElementById('tecnico').value,
            departamento: document.getElementById('departamento').value,
            hora_inicio: document.getElementById('horaInicio').value,
            hora_final: document.getElementById('horaFinal').value,
            objetivo: document.getElementById('objetivo').value,
            actividades: [],
            descripcion_actividades: document.getElementById('descripcionActividades').value,
            pruebas_realizadas: document.getElementById('pruebasRealizadas').value,
            recomendaciones: document.getElementById('recomendaciones').value,
            observaciones_cliente: document.getElementById('observacionesCliente').value,
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
                notas_generales: `Proyecto generado desde visita de soporte ${visita.folio}\n\nObjetivo: ${visita.objetivo}\nRecomendaciones: ${visita.recomendaciones}`,
                notas_internas: `Visita original: ${visita.folio}\nTécnico: ${visita.tecnico}\nActividades: ${visita.actividades?.join(', ')}`,
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
        var now = new Date();
        var folio = 'SP-' + now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        var el = document.getElementById('folio');
        if (el) el.value = folio;
    }

    function _setField(id, value) {
        const el = document.getElementById(id);
        if (el && value != null && String(value).trim() !== '') el.value = String(value).trim();
    }

    function _parsearTextoHojaOrden(texto) {
        if (!texto || !texto.trim()) return;
        const t = texto.replace(/\r/g, '\n');
        const lineas = t.split(/\n/).map(l => l.trim()).filter(Boolean);
        const textoCompleto = t.toLowerCase();

        const buscarValor = (etiquetas) => {
            for (const etq of etiquetas) {
                for (let i = 0; i < lineas.length; i++) {
                    const linea = lineas[i].toLowerCase();
                    if (linea.startsWith(etq)) {
                        const resto = lineas[i].substring(etq.length).replace(/^[\s:\-]+/, '').trim();
                        if (resto) return resto;
                        if (i + 1 < lineas.length) return lineas[i + 1];
                        return null;
                    }
                }
                const idx = textoCompleto.indexOf(etq);
                if (idx >= 0) {
                    const despues = texto.substring(idx + etq.length).replace(/^[\s:\-]+/, '').trim();
                    const primeraLinea = despues.split(/\n/)[0].trim();
                    if (primeraLinea && primeraLinea.length < 200) return primeraLinea;
                }
            }
            return null;
        };

        _setField('cliente', buscarValor(['cliente', 'client']));
        _setField('folio', buscarValor(['folio', 'no.', 'numero', 'número']));
        _setField('area', buscarValor(['area', 'área', 'departamento']));
        _setField('ubicacion', buscarValor(['ubicacion', 'ubicación', 'direccion', 'dirección', 'lugar']));
        _setField('equipo', buscarValor(['equipo', 'maquina', 'máquina', 'sistema']));
        _setField('responsableCliente', buscarValor(['responsable', 'contacto', 'atencion', 'atención']));
        _setField('tecnico', buscarValor(['tecnico', 'técnico', 'ingeniero', 'tecnico asignado']));
        _setField('objetivo', buscarValor(['objetivo', 'motivo', 'trabajo a realizar']));
        _setField('descripcionActividades', buscarValor(['descripcion', 'descripción', 'actividades realizadas', 'trabajo realizado']));
        _setField('pruebasRealizadas', buscarValor(['pruebas', 'pruebas realizadas', 'verificacion', 'verificación']));
        _setField('recomendaciones', buscarValor(['recomendaciones', 'recomendacion']));
        _setField('observacionesCliente', buscarValor(['observaciones', 'observacion', 'comentarios']));

        const fechaMatch = texto.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
        if (fechaMatch) {
            const d = fechaMatch[1].padStart(2, '0'), m = fechaMatch[2].padStart(2, '0'), y = fechaMatch[3].length === 2 ? '20' + fechaMatch[3] : fechaMatch[3];
            _setField('fecha', `${y}-${m}-${d}`);
        }

        const actividadesCheckbox = document.querySelectorAll('#actividadesCheckbox input[type="checkbox"]');
        actividadesCheckbox.forEach(cb => {
            const valor = (cb.value || '').toLowerCase();
            if (!valor) return;
            const palabras = valor.split(/\s+/).filter(Boolean);
            const coincide = palabras.some(p => p.length >= 4 && textoCompleto.includes(p));
            if (coincide) cb.checked = true;
        });
    }

    async function _rellenarDesdeImagen() {
        const input = document.getElementById('fotoHojaOrden');
        const preview = document.getElementById('fotoPreview');
        const container = document.getElementById('fotoPreviewContainer');
        const progressEl = document.getElementById('ocrProgress');
        const progressText = progressEl ? progressEl.querySelector('.ocr-progress-text') : null;

        if (!input || !input.files || !input.files.length) {
            alert('Selecciona primero una foto de la hoja de orden.');
            return;
        }
        const file = input.files[0];
        if (!file.type.startsWith('image/')) {
            alert('El archivo debe ser una imagen (JPG, PNG, etc.).');
            return;
        }

        const Tesseract = window.Tesseract;
        if (!Tesseract || !Tesseract.recognize) {
            alert('No se pudo cargar el motor de reconocimiento de texto. Comprueba tu conexión.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            if (preview) {
                preview.src = e.target.result;
                if (container) container.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);

        if (progressEl) progressEl.style.display = 'block';
        if (progressText) progressText.textContent = 'Analizando imagen…';

        try {
            const result = await Tesseract.recognize(file, 'spa', {
                logger: progressText ? m => {
                    if (m.status && progressText) progressText.textContent = m.status;
                } : undefined
            });
            const texto = result && result.data && result.data.text ? result.data.text : '';
            if (progressEl) progressEl.style.display = 'none';
            _parsearTextoHojaOrden(texto);
            if (progressText) progressText.textContent = 'Datos extraídos. Revisa y completa si hace falta.';
            if (progressEl) {
                progressEl.style.display = 'block';
                progressEl.style.background = 'rgba(76, 175, 80, 0.9)';
                setTimeout(function () {
                    progressEl.style.display = 'none';
                    progressEl.style.background = '';
                }, 2500);
            }
            _addToFeed('📷', 'Formulario rellenado desde imagen de hoja de orden');
        } catch (err) {
            console.error(err);
            if (progressEl) progressEl.style.display = 'none';
            alert('Error al leer la imagen: ' + (err.message || err));
        }
    }

    function _resetForm() {
        var hoy = new Date().toISOString().split('T')[0];
        function set(id, val) { var el = document.getElementById(id); if (el) el.value = val; }
        set('folio', '');
        set('fecha', hoy);
        set('cliente', '');
        set('area', '');
        set('ubicacion', '');
        set('equipo', '');
        set('responsableCliente', '');
        set('tecnico', '');
        set('departamento', 'Electrónica');
        set('horaInicio', '');
        set('horaFinal', '');
        set('objetivo', '');
        set('descripcionActividades', '');
        set('pruebasRealizadas', '');
        set('recomendaciones', '');
        set('observacionesCliente', '');
        document.querySelectorAll('#actividadesCheckbox input').forEach(function (cb) { cb.checked = false; });
    }

    function _cerrarModal() {
        var modal = document.getElementById('wsModal');
        if (modal) modal.classList.remove('active');
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
        document.getElementById('feedCount').innerText = feed.children.length;
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        var toggleMenu = document.getElementById('toggleMenu');
        if (toggleMenu) toggleMenu.addEventListener('click', _toggleMenu);
        /* #themeBtn lo gestiona theme-clock.js */
        var newVisitaBtn = document.getElementById('newVisitaBtn');
        if (newVisitaBtn) newVisitaBtn.addEventListener('click', _nuevaVisita);
        var closeWsBtn = document.getElementById('closeWsBtn');
        if (closeWsBtn) closeWsBtn.addEventListener('click', _cerrarModal);
        var cancelWsBtn = document.getElementById('cancelWsBtn');
        if (cancelWsBtn) cancelWsBtn.addEventListener('click', _cerrarModal);
        var guardarVisitaBtn = document.getElementById('guardarVisitaBtn');
        if (guardarVisitaBtn) guardarVisitaBtn.addEventListener('click', _guardarVisita);
        var confirmarVisitaBtn = document.getElementById('confirmarVisitaBtn');
        if (confirmarVisitaBtn) confirmarVisitaBtn.addEventListener('click', _confirmarVisita);
        var cancelarVisitaEstadoBtn = document.getElementById('cancelarVisitaEstadoBtn');
        if (cancelarVisitaEstadoBtn) cancelarVisitaEstadoBtn.addEventListener('click', _cancelarVisita);

        var fotoInput = document.getElementById('fotoHojaOrden');
        if (fotoInput) fotoInput.addEventListener('change', function () {
            var preview = document.getElementById('fotoPreview');
            var container = document.getElementById('fotoPreviewContainer');
            if (!this.files || !this.files.length) {
                if (container) container.style.display = 'none';
                if (preview) preview.src = '';
                return;
            }
            var reader = new FileReader();
            reader.onload = function (e) {
                if (preview) preview.src = e.target.result;
                if (container) container.style.display = 'block';
            };
            reader.readAsDataURL(this.files[0]);
        });

        var rellenarBtn = document.getElementById('rellenarDesdeImagenBtn');
        if (rellenarBtn) rellenarBtn.addEventListener('click', function () { _rellenarDesdeImagen(); });

        var aplicarFiltros = document.getElementById('aplicarFiltrosBtn');
        if (aplicarFiltros) aplicarFiltros.addEventListener('click', function () {
            var fi = document.getElementById('filtroFechaInicio');
            var ff = document.getElementById('filtroFechaFin');
            filtroFechaInicio = fi ? fi.valueAsDate : null;
            filtroFechaFin = ff ? ff.valueAsDate : null;
            var ft = document.getElementById('filtroTecnico');
            filtroTecnico = ft ? ft.value : 'todos';
            var fe = document.getElementById('filtroEstado');
            filtroEstado = fe ? fe.value : 'todos';
            var fb = document.getElementById('filtroBuscar');
            filtroBuscar = fb ? fb.value.trim() : '';
            _applyFilters();
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
        _editarVisita
    };
})();

window.proyectosModule = ProyectosModule;