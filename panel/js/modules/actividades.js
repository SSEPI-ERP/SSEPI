// ================================================
// ARCHIVO: actividades.js
// DESCRIPCIÓN: Módulo de Actividades Automatización
// FUNCIONALIDAD: Bitácora semanal, subida de archivos, historial
// ================================================

const ActividadesModule = (function() {
    // ==================== ESTADO PRIVADO ====================
    let actividades = [];
    let historial = [];
    let tecnicos = [];
    let currentActividadId = null;
    let currentSemanaInicio = null;
    let subscriptions = [];
    let subtareasMap = {};
    let vistaActual = 'semanal';
    let draggedActividadId = null;
    let isAdmin = false;
    let jiraKeyMap = {};
    let currentUser = null;
    let sidebarActividadId = null;
    let departamentoActual = 'todos';
    let ordenesCache = {};

    const DEPARTAMENTOS = [
        { key: 'automatizacion', label: 'Automatización' },
        { key: 'electronicos', label: 'Laboratorio Electrónica' },
        { key: 'motores', label: 'Motores' },
        { key: 'soporte_planta', label: 'Soporte en Planta' },
        { key: 'administracion', label: 'Administración' }
    ];

    const ORDEN_MAP = {
        'automatizacion': { tabla: 'proyectos_automatizacion', label: 'Proyecto', displayField: 'nombre_proyecto', folioField: 'folio' },
        'electronicos': { tabla: 'ordenes_taller', label: 'Orden', displayField: 'equipo', folioField: 'folio' },
        'motores': { tabla: 'ordenes_motores', label: 'Orden', displayField: 'equipo', folioField: 'folio' },
        'soporte_planta': { tabla: 'proyectos_automatizacion', label: 'Proyecto Planta', displayField: 'nombre_proyecto', folioField: 'folio' }
    };

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diasSemanaCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Servicios de datos
    const actividadesService = createDataService('actividades_diarias');
    const historialService = createDataService('actividades_historial');
    const contactosService = createDataService('contactos');
    const subtareasService = createDataService('actividades_subtareas');

    function createDataService(tableName) {
        return {
            async select(query = {}) {
                if (!window.supabase) return [];
                let q = window.supabase.from(tableName).select('*');
                Object.entries(query).forEach(([key, value]) => {
                    q = q.eq(key, value);
                });
                const { data, error } = await q;
                if (error) throw error;
                return data || [];
            },
            async insert(row, csrfToken) {
                if (!window.supabase) return null;
                const { data, error } = await window.supabase.from(tableName).insert(row).select().single();
                if (error) throw error;
                return data;
            },
            async update(id, row, csrfToken) {
                if (!window.supabase) return null;
                const { data, error } = await window.supabase.from(tableName).update(row).eq('id', id).select().single();
                if (error) throw error;
                return data;
            },
            async delete(id, csrfToken) {
                if (!window.supabase) return;
                const { error } = await window.supabase.from(tableName).delete().eq('id', id);
                if (error) throw error;
            }
        };
    }

    // ==================== INICIALIZACIÓN ====================
    async function init() {
        console.log('✅ [Actividades] Conectado');

        // Leer departamento de URL si existe
        const urlParams = new URLSearchParams(window.location.search);
        const deptoUrl = urlParams.get('departamento');
        if (deptoUrl) departamentoActual = deptoUrl;

        await _detectarRol();
        _setSemanaActual();
        _bindEvents();
        await _loadInitialData();
        _startClock();
        _setupRealtime();

        console.log('✅ Módulo actividades iniciado');
    }

    async function _detectarRol() {
        try {
            const profile = await window.authService?.getCurrentProfile?.();
            currentUser = profile;
            isAdmin = profile && ['admin', 'superadmin'].includes(profile.rol);
            // Detectar departamento por rol para filtro default
            const rol = profile?.rol;
            const rolDepto = {
                'automatizacion': 'automatizacion',
                'taller': 'electronicos',
                'motores': 'motores',
                'soporte': 'soporte_planta',
                'administracion': 'administracion',
                'admin': 'todos',
                'superadmin': 'todos',
                'ventas': 'todos'
            };
            departamentoActual = rolDepto[rol] || 'todos';
        } catch (e) {
            console.warn('[Actividades] No se pudo detectar rol:', e);
            isAdmin = false;
            currentUser = null;
            departamentoActual = 'todos';
        }
    }

    function _setSemanaActual() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Lunes como inicio
        currentSemanaInicio = new Date(now.setDate(diff));
        currentSemanaInicio.setHours(0, 0, 0, 0);
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

    // ==================== CARGA DE DATOS ====================
    async function _loadInitialData() {
        await Promise.all([
            _loadActividades(),
            _loadTecnicos()
        ]);
        await _loadSubtareas();
        _buildJiraKeyMap();
        _renderGridSemanal();
        _renderActividadesLista();
        if (vistaActual === 'kanban') _renderKanban();
        _populateFiltroTecnicos();
    }

    async function _loadActividades() {
        if (!window.supabase) return;

        const inicioSemana = currentSemanaInicio;
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(finSemana.getDate() + 5); // Lunes a Sábado
        finSemana.setHours(23, 59, 59, 999);

        try {
            let q = window.supabase
                .from('actividades_diarias')
                .select('id, fecha, user_id, resumen, estado, archivo_url, archivo_tipo, creado_por, notas, completado_en, duracion_minutos, created_at, departamento, orden_origen_id, orden_origen_tipo')
                .gte('fecha', inicioSemana.toISOString().split('T')[0])
                .lte('fecha', finSemana.toISOString().split('T')[0]);

            if (departamentoActual !== 'todos') {
                q = q.eq('departamento', departamentoActual);
            }

            const { data, error } = await q.order('fecha', { ascending: true });

            if (error) throw error;
            // Resolve creado_por → nombre de usuario en segunda consulta
            let rawActividades = data || [];
            const userIds = [...new Set(rawActividades.map(a => a.creado_por).filter(Boolean))];
            let userMap = {};
            if (userIds.length > 0) {
                const { data: users } = await window.supabase
                    .from('usuarios')
                    .select('id, nombre, email')
                    .in('id', userIds);
                if (users) users.forEach(u => { userMap[u.id] = u; });
            }
            // Fallback modo local: si no hay usuarios en tabla 'usuarios', usar datos offline conocidos
            if (Object.keys(userMap).length === 0 && userIds.length > 0) {
                const fallback = {
                    'user-001': { nombre: 'Norberto Moro', email: 'norbertomoro4@gmail.com' },
                    'user-002': { nombre: 'Ventas 1', email: 'ventas1@ssepi.org' },
                    'user-003': { nombre: 'Laboratorio 1', email: 'laboratorio1@ssepi.org' },
                    'user-004': { nombre: 'Motores 1', email: 'motores1@ssepi.org' },
                    'user-005': { nombre: 'Automatizacion 1', email: 'automatizacion1@ssepi.org' },
                    'user-006': { nombre: 'Ivan Garcia', email: 'ivang.ssepi@gmail.com' },
                    'user-007': { nombre: 'Admin SSEPI', email: 'administracion@ssepi.org' }
                };
                userIds.forEach(id => { if (fallback[id]) userMap[id] = fallback[id]; });
            }
            actividades = rawActividades.map(a => ({
                ...a,
                creado_por_usuario: a.creado_por ? { nombre: userMap[a.creado_por]?.nombre, email: userMap[a.creado_por]?.email } : null
            }));
        } catch (error) {
            console.error('[Actividades] Error cargando actividades:', error);
            actividades = [];
        }
    }

    async function _loadTecnicos() {
        if (!window.supabase) return;

        try {
            const { data, error } = await window.supabase
                .from('contactos')
                .select('id, nombre, email')
                .eq('tipo', 'tecnico')
                .order('nombre');

            if (error) throw error;
            tecnicos = data || [];

            // Si no hay técnicos marcados como tal, cargar usuarios con rol automatizacion
            if (tecnicos.length === 0) {
                const { data: usuarios, error: err2 } = await window.supabase
                    .from('usuarios')
                    .select('id, nombre, email')
                    .in('rol', ['automatizacion', 'admin', 'superadmin']);

                if (!err2 && usuarios) {
                    tecnicos = usuarios;
                }
            }
        } catch (error) {
            console.error('[Actividades] Error cargando técnicos:', error);
            tecnicos = [];
        }
    }

    // ==================== KANBAN: CARGA Y UTILIDADES ====================
    async function _loadSubtareas() {
        if (!window.supabase || actividades.length === 0) return;
        const ids = actividades.map(a => a.id);
        try {
            const { data, error } = await window.supabase
                .from('actividades_subtareas')
                .select('*')
                .in('actividad_id', ids)
                .order('orden', { ascending: true });
            if (error) throw error;
            subtareasMap = {};
            (data || []).forEach(s => {
                if (!subtareasMap[s.actividad_id]) subtareasMap[s.actividad_id] = [];
                subtareasMap[s.actividad_id].push(s);
            });
        } catch (error) {
            console.error('[Actividades] Error cargando subtareas:', error);
            subtareasMap = {};
        }
    }

    function _buildJiraKeyMap() {
        const sorted = [...actividades].sort((a, b) => new Date(a.created_at || a.fecha) - new Date(b.created_at || b.fecha));
        jiraKeyMap = {};
        sorted.forEach((a, idx) => {
            jiraKeyMap[a.id] = 'ACT-' + String(idx + 1).padStart(3, '0');
        });
    }

    function _computeProgress(subtareas) {
        if (!subtareas || subtareas.length === 0) return 0;
        const done = subtareas.filter(s => s.done).length;
        return Math.round((done / subtareas.length) * 100);
    }

    function _getTecnicoIniciales(act) {
        const nombre = act.creado_por_usuario?.nombre || act.user_id || 'Técnico';
        const parts = nombre.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return (parts[0] || 'T').substring(0, 2).toUpperCase();
    }

    function _tiempoTranscurrido(act) {
        if (!act.completado_en || !act.created_at) return '';
        const inicio = new Date(act.created_at);
        const fin = new Date(act.completado_en);
        const diffMs = fin - inicio;
        const mins = Math.round(diffMs / 60000);
        if (mins < 60) return `${mins} min`;
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        if (hrs < 24) return `${hrs}h ${rem}m`;
        const days = Math.floor(hrs / 24);
        return `${days}d ${hrs % 24}h`;
    }

    // ==================== RENDERIZADO GRID SEMANAL ====================
    function _renderGridSemanal() {
        const container = document.getElementById('gridSemanal');
        if (!container) return;

        // Actualizar título de la semana
        const inicioSemana = currentSemanaInicio;
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(finSemana.getDate() + 5); // Lunes a Sábado

        const inicioStr = inicioSemana.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const finStr = finSemana.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
        const tituloEl = document.getElementById('semanaActualTitulo');
        if (tituloEl) {
            tituloEl.textContent = `Semana del ${inicioStr} al ${finStr}`;
        }

        // Generar cards para Lunes a Sábado
        let html = '';
        for (let i = 1; i <= 6; i++) { // 1 = Lunes, 6 = Sábado
            const fechaDia = new Date(inicioSemana);
            fechaDia.setDate(fechaDia.getDate() + i - 1);

            const diaNombre = diasSemana[fechaDia.getDay()];
            const diaFecha = fechaDia.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            const fechaStr = fechaDia.toISOString().split('T')[0];

            // Filtrar actividades de este día (aplica filtro departamento)
            const actividadesDia = _filtrarPorDepartamento(actividades).filter(a => a.fecha === fechaStr);

            const hasActividades = actividadesDia.length > 0;
            const cardClass = hasActividades ? 'dia-card' : 'dia-card sin-actividades';

            html += `
                <div class="${cardClass}" data-fecha="${fechaStr}">
                    <div class="dia-header">
                        <span class="dia-nombre">${diaNombre}</span>
                        <span class="dia-fecha">${diaFecha}</span>
                    </div>
                    <div class="dia-actividades">
                        ${hasActividades
                            ? actividadesDia.map(act => _renderActividadMini(act)).join('')
                            : '<p style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px 0;">Sin actividades</p>'
                        }
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll('.actividad-mini').forEach(el => {
            el.addEventListener('click', function() {
                const id = this.dataset.id;
                _verActividad(id);
            });
        });
    }

    // ==================== RENDERIZADO KANBAN ====================
    function _renderKanban() {
        const container = document.getElementById('kanbanBoard');
        if (!container) return;

        const cols = {
            pendiente: container.querySelector('.col-pendiente .kanban-card-list'),
            en_progreso: container.querySelector('.col-en_progreso .kanban-card-list'),
            completado: container.querySelector('.col-completado .kanban-card-list')
        };
        const counts = {
            pendiente: document.getElementById('count-pendiente'),
            en_progreso: document.getElementById('count-en_progreso'),
            completado: document.getElementById('count-completado')
        };

        const filtered = _filtrarPorDepartamento(_filtrarActividades());
        const grupos = { pendiente: [], en_progreso: [], completado: [] };
        filtered.forEach(a => {
            const st = a.estado || 'pendiente';
            if (grupos[st]) grupos[st].push(a);
            else grupos.pendiente.push(a);
        });

        Object.keys(cols).forEach(key => {
            if (cols[key]) {
                cols[key].innerHTML = grupos[key].map(a => _renderKanbanCard(a)).join('');
            }
            if (counts[key]) counts[key].textContent = grupos[key].length;
        });

        _bindKanbanDragEvents();
    }

    function _filtrarActividades() {
        const tecnicoId = document.getElementById('filtroTecnico')?.value || 'todos';
        const estadoVal = document.getElementById('filtroEstado')?.value || 'todos';
        const buscar = document.getElementById('filtroBuscar')?.value?.toLowerCase() || '';
        return actividades.filter(a => {
            if (tecnicoId !== 'todos' && a.user_id !== tecnicoId) return false;
            if (estadoVal !== 'todos' && a.estado !== estadoVal) return false;
            if (buscar && !(a.resumen || '').toLowerCase().includes(buscar)) return false;
            return true;
        });
    }

    function _filtrarPorDepartamento(lista) {
        const filtroDepto = document.getElementById('filtroDepartamento')?.value || 'todos';
        if (filtroDepto === 'todos') return lista;
        return lista.filter(a => a.departamento === filtroDepto);
    }

    function _renderKanbanCard(act) {
        const key = jiraKeyMap[act.id] || act.id?.slice(0, 6).toUpperCase();
        const subtareas = subtareasMap[act.id] || [];
        const progress = _computeProgress(subtareas);
        const iniciales = _getTecnicoIniciales(act);
        const nombre = act.creado_por_usuario?.nombre || 'Técnico';
        const prioridad = act.prioridad || 'media';
        const pClass = 'priority-' + prioridad;
        const pLabel = prioridad.charAt(0).toUpperCase() + prioridad.slice(1);
        const color = _getAvatarColor(act.creado_por || act.user_id);

        // Subtareas visibles en card (máx 3)
        const done = subtareas.filter(s => s.done).length;
        const total = subtareas.length;
        let subsHTML = '';
        if (total > 0) {
            const rows = subtareas.slice(0, 3).map(s => `
                <div class="kanban-subtask-row ${s.done ? 'done' : ''}" onclick="event.stopPropagation();window.actividadesModule._toggleSubtarea('${s.id}')">
                    <input type="checkbox" class="kanban-subtask-check" ${s.done ? 'checked' : ''} onclick="event.stopPropagation();window.actividadesModule._toggleSubtarea('${s.id}')">
                    <span class="kanban-subtask-text">${s.titulo || 'Subtarea'}</span>
                </div>
            `).join('');
            const mas = total > 3 ? `<div class="kanban-subtask-mas">+${total - 3} más</div>` : '';
            subsHTML = `<div class="kanban-subtasks">${rows}${mas}</div>`;
        }

        // Time badge para completadas
        let timeHTML = '';
        if (act.estado === 'completado' && act.completado_en && act.created_at) {
            const tiempo = _tiempoTranscurrido(act);
            timeHTML = `<div class="kanban-time-badge">⏱️ ${tiempo}</div>`;
        }

        return `
            <div class="kanban-card border-${prioridad}" draggable="true" data-id="${act.id}" data-estado="${act.estado || 'pendiente'}">
                <div class="kanban-card-top">
                    <div class="kanban-card-title">${(act.resumen || 'Sin resumen').substring(0, 120)}</div>
                    <span class="kanban-priority-badge ${pClass}">${pLabel}</span>
                </div>
                <div class="kanban-card-meta">
                    <div class="kanban-card-assignee">
                        <div class="kanban-card-avatar" style="background:${color}" title="${nombre}">${iniciales}</div>
                        <span>${nombre}</span>
                    </div>
                    <span class="kanban-card-key-mini">${key}</span>
                </div>
                ${subsHTML}
                <div class="kanban-card-progress-wrap">
                    <div class="kanban-card-progress-label">
                        <span>Progreso</span>
                        <span>${progress}%</span>
                    </div>
                    <div class="kanban-card-progress-bar"><div class="kanban-card-progress-fill" style="width:${progress}%"></div></div>
                </div>
                ${timeHTML}
            </div>
        `;
    }

    function _getAvatarColor(id) {
        const colors = ['#1976d2','#00796B','#7B1FA2','#C62828','#F57C00','#388E3C','#5D4037','#455A64'];
        let hash = 0;
        for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    function _renderActividadMini(act) {
        const estadoClass = act.estado || 'pendiente';
        const estadoLabel = _getEstadoLabel(act.estado);
        const tecnico = act.creado_por_usuario?.nombre || 'Técnico';
        const tieneArchivo = act.archivo_url ? true : false;

        return `
            <div class="actividad-mini" data-id="${act.id}">
                <div class="actividad-mini-header">
                    <span class="actividad-tecnico">${tecnico.split(' ')[0]}</span>
                    <span class="actividad-estado ${estadoClass}">${estadoLabel}</span>
                </div>
                <div class="actividad-resumen">${act.resumen || 'Sin resumen'}</div>
                ${tieneArchivo ? `
                    <div class="actividad-archivo-indicator">
                        <i class="fas fa-paperclip"></i> Archivo adjunto
                    </div>
                ` : ''}
            </div>
        `;
    }

    function _getEstadoLabel(estado) {
        const map = {
            'pendiente': 'Pendiente',
            'en_progreso': 'En Progreso',
            'completado': 'Completado',
            'revisado': 'Revisado'
        };
        return map[estado] || estado;
    }

    // ==================== RENDERIZADO LISTA ====================
    function _renderActividadesLista() {
        const container = document.getElementById('actividadesLista');
        if (!container) return;

        const visibles = _filtrarPorDepartamento(actividades);
        if (visibles.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size:48px; margin-bottom:16px; opacity:0.3;"></i>
                    <p>No hay actividades registradas esta semana.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = visibles.map(act => {
            const estadoClass = act.estado || 'pendiente';
            const estadoLabel = _getEstadoLabel(act.estado);
            const tecnico = act.creado_por_usuario?.nombre || 'Técnico';
            const fecha = act.fecha ? new Date(act.fecha).toLocaleDateString('es-MX') : '--/--/----';
            const tieneArchivo = act.archivo_url ? true : false;
            const iconClass = tieneArchivo
                ? (act.archivo_tipo === 'pdf' ? 'pdf' : 'doc')
                : 'sin-archivo';
            const icono = tieneArchivo
                ? (act.archivo_tipo === 'pdf' ? '<i class="fas fa-file-pdf"></i>' : '<i class="fas fa-file-word"></i>')
                : '<i class="fas fa-file-alt"></i>';

            return `
                <div class="actividad-card" data-id="${act.id}">
                    <div class="actividad-card-icon ${iconClass}">${icono}</div>
                    <div class="actividad-card-body">
                        <div class="actividad-card-header">
                            <span class="actividad-card-titulo">${tecnico}</span>
                            <span class="actividad-card-estado ${estadoClass}">${estadoLabel}</span>
                        </div>
                        <div class="actividad-card-meta">
                            <span><i class="fas fa-calendar"></i> ${fecha}</span>
                            ${tieneArchivo ? `<span><i class="fas fa-paperclip"></i> Archivo adjunto</span>` : ''}
                        </div>
                        <div class="actividad-card-resumen">${act.resumen || 'Sin resumen'}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind click events
        container.querySelectorAll('.actividad-card').forEach(el => {
            el.addEventListener('click', function() {
                const id = this.dataset.id;
                _verActividad(id);
            });
        });
    }

    async function _cargarOrdenesPorDepartamento(departamento, seleccionarId = null) {
        const ordenSelect = document.getElementById('actOrden');
        if (!ordenSelect || !window.supabase) return;
        ordenSelect.innerHTML = '<option value="">Sin orden vinculada</option>';
        if (!departamento || departamento === 'administracion') return;

        const config = ORDEN_MAP[departamento];
        if (!config) return;

        try {
            const { data, error } = await window.supabase
                .from(config.tabla)
                .select(`id, ${config.folioField}, ${config.displayField}`)
                .order(config.folioField, { ascending: false })
                .limit(50);
            if (error) throw error;
            (data || []).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.id;
                const label = o[config.displayField] || o[config.folioField] || 'Sin nombre';
                opt.textContent = `${o[config.folioField]} — ${label}`;
                if (seleccionarId && String(o.id) === String(seleccionarId)) opt.selected = true;
                ordenSelect.appendChild(opt);
            });
        } catch (e) {
            console.warn('[Actividades] Error cargando órdenes:', e);
        }
    }

    // ==================== MODAL: NUEVA/EDITAR ACTIVIDAD ====================
    function _abrirModalActividad(editId = null) {
        const modal = document.getElementById('actividadModal');
        const titleEl = document.getElementById('actividadModalTitle');
        if (!modal) return;

        // Reset form
        document.getElementById('actFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('actTecnico').value = '';
        document.getElementById('actResumen').value = '';
        document.getElementById('actNotas').value = '';
        document.getElementById('actArchivo').value = '';
        document.getElementById('actEstado').value = 'pendiente';
        const deptoSel = document.getElementById('actDepartamento');
        if (deptoSel) deptoSel.value = (departamentoActual !== 'todos' ? departamentoActual : 'automatizacion');
        currentActividadId = null;

        // Cargar órdenes default
        _cargarOrdenesPorDepartamento(deptoSel ? deptoSel.value : 'automatizacion');

        if (editId) {
            const act = actividades.find(a => String(a.id) === String(editId));
            if (act) {
                currentActividadId = editId;
                if (titleEl) titleEl.textContent = 'Editar Actividad';
                document.getElementById('actFecha').value = act.fecha || '';
                document.getElementById('actTecnico').value = act.user_id || '';
                document.getElementById('actResumen').value = act.resumen || '';
                document.getElementById('actNotas').value = act.notas || '';
                document.getElementById('actEstado').value = act.estado || 'pendiente';
                if (deptoSel) deptoSel.value = act.departamento || 'automatizacion';
                _cargarOrdenesPorDepartamento(act.departamento || 'automatizacion', act.orden_origen_id);
            }
        } else {
            if (titleEl) titleEl.textContent = 'Nueva Actividad';
        }

        // Populate técnicos
        const tecnicoSelect = document.getElementById('actTecnico');
        if (tecnicoSelect) {
            tecnicoSelect.innerHTML = '<option value="">Seleccionar...</option>';
            tecnicos.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.nombre;
                tecnicoSelect.appendChild(opt);
            });
        }

        modal.classList.add('active');
    }

    async function _guardarActividad() {
        const fecha = document.getElementById('actFecha')?.value || '';
        const user_id = document.getElementById('actTecnico')?.value || '';
        const resumen = document.getElementById('actResumen')?.value?.trim() || '';
        const notas = document.getElementById('actNotas')?.value?.trim() || '';
        const estado = document.getElementById('actEstado')?.value || 'pendiente';
        const archivoInput = document.getElementById('actArchivo');

        if (!fecha || !user_id || !resumen) {
            alert('❗ Fecha, técnico y resumen son obligatorios.');
            return;
        }

        const csrfToken = sessionStorage.getItem('csrfToken');
        const profile = await window.authService?.getCurrentProfile();

        try {
            let archivo_url = null;
            let archivo_tipo = null;

            // Subir archivo si existe
            if (archivoInput && archivoInput.files[0]) {
                const file = archivoInput.files[0];
                const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                if (!validTypes.includes(file.type)) {
                    alert('❗ Solo se permiten archivos PDF, DOC o DOCX.');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    alert('❗ El archivo no puede pesar más de 5MB.');
                    return;
                }

                // Subir a Supabase Storage
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await window.supabase.storage
                    .from('actividades')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                // Obtener URL pública
                const { data: { publicUrl } } = window.supabase.storage
                    .from('actividades')
                    .getPublicUrl(fileName);

                archivo_url = publicUrl;
                archivo_tipo = fileExt.toLowerCase();
            }

            const departamento = document.getElementById('actDepartamento')?.value || 'automatizacion';
            const ordenId = document.getElementById('actOrden')?.value || null;
            const config = ORDEN_MAP[departamento];

            const row = {
                fecha,
                user_id,
                resumen,
                notas,
                estado,
                archivo_url,
                archivo_tipo,
                departamento,
                orden_origen_id: ordenId,
                orden_origen_tipo: ordenId ? (config?.tabla || null) : null,
                creado_por: profile?.id
            };

            if (currentActividadId) {
                // Actualizar existente
                await actividadesService.update(currentActividadId, row, csrfToken);

                // Registrar en historial
                await _insertarHistorial(currentActividadId, 'edicion', 'Actividad editada', profile?.id);

                alert('✅ Actividad actualizada.');
            } else {
                // Insertar nueva
                const inserted = await actividadesService.insert(row, csrfToken);

                if (inserted?.id) {
                    // Registrar en historial
                    await _insertarHistorial(inserted.id, archivo_url ? 'archivo_subido' : 'creacion',
                        archivo_url ? 'Archivo subido' : 'Actividad creada', profile?.id);
                }

                alert('✅ Actividad guardada.');
            }

            document.getElementById('actividadModal').classList.remove('active');
            await _loadActividades();
            _renderGridSemanal();
            _renderActividadesLista();

        } catch (error) {
            console.error('[Actividades] Error guardando:', error);
            alert('❌ Error al guardar: ' + error.message);
        }
    }

    // ==================== VER ACTIVIDAD ====================
    async function _verActividad(id) {
        const act = actividades.find(a => String(a.id) === String(id));
        if (!act) return;

        const modal = document.getElementById('verActividadModal');
        const body = document.getElementById('verActividadBody');
        if (!body) return;

        const tecnico = act.creado_por_usuario?.nombre || 'Técnico';
        const fecha = act.fecha ? new Date(act.fecha).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '--';
        const estadoLabel = _getEstadoLabel(act.estado);
        const tieneArchivo = act.archivo_url ? true : false;

        // Cargar historial
        await _cargarHistorial(id);

        body.innerHTML = `
            <div class="ver-actividad-seccion">
                <h4>Información General</h4>
                <div class="ver-actividad-content">
                    <p><strong>Técnico:</strong> ${tecnico}</p>
                    <p><strong>Fecha:</strong> ${fecha}</p>
                    <p><strong>Estado:</strong> <span class="estado-badge ${act.estado}">${estadoLabel}</span></p>
                </div>
            </div>

            <div class="ver-actividad-seccion">
                <h4>Resumen de Actividades</h4>
                <div class="ver-actividad-content">
                    <p style="white-space: pre-wrap;">${act.resumen || 'Sin resumen'}</p>
                </div>
            </div>

            ${tieneArchivo ? `
                <div class="ver-actividad-seccion">
                    <h4>Archivos Adjuntos</h4>
                    <div class="ver-actividad-content">
                        <div class="ver-actividad-archivo">
                            <div class="ver-actividad-archivo-icon ${act.archivo_tipo === 'pdf' ? 'pdf' : 'doc'}">
                                <i class="fas fa-file-${act.archivo_tipo === 'pdf' ? 'pdf' : 'word'}"></i>
                            </div>
                            <div class="ver-actividad-archivo-info">
                                <div class="ver-actividad-archivo-nombre">archivo.${act.archivo_tipo}</div>
                                <div class="ver-actividad-archivo-meta">
                                    <a href="${act.archivo_url}" target="_blank" rel="noopener">
                                        <i class="fas fa-download"></i> Descargar archivo
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="ver-actividad-seccion">
                <h4>Historial</h4>
                <div class="ver-actividad-content ver-actividad-historial" id="verActividadHistorial">
                    ${historial.length === 0
                        ? '<p style="text-align:center; color:var(--text-muted); padding:20px;">Sin eventos en el historial</p>'
                        : historial.map(h => `
                            <div class="historial-item">
                                <div class="historial-icon">${_getHistorialIcon(h.evento)}</div>
                                <div class="historial-body">
                                    <div class="historial-header">
                                        <span class="historial-evento">${h.evento.replace(/_/g, ' ').toUpperCase()}</span>
                                        <span class="historial-fecha">${new Date(h.creado_en).toLocaleString('es-MX')}</span>
                                    </div>
                                    <p class="historial-descripcion">${h.descripcion || ''}</p>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    async function _cargarHistorial(actividadId) {
        if (!window.supabase) return;

        try {
            const { data, error } = await window.supabase
                .from('actividades_historial')
                .select('*')
                .eq('actividad_id', actividadId)
                .order('creado_en', { ascending: false });

            if (error) throw error;
            historial = data || [];
        } catch (error) {
            console.error('[Actividades] Error cargando historial:', error);
            historial = [];
        }
    }

    async function _insertarHistorial(actividadId, evento, descripcion, creado_por) {
        if (!window.supabase) return;

        try {
            await window.supabase.from('actividades_historial').insert({
                actividad_id: actividadId,
                evento,
                descripcion,
                creado_por
            });
        } catch (error) {
            console.warn('[Actividades] Error insertando historial:', error);
        }
    }

    function _getHistorialIcon(evento) {
        const map = {
            'creacion': '🆕',
            'archivo_subido': '📎',
            'edicion': '✏️',
            'revision': '👁️',
            'estado_cambiado': '🔄'
        };
        return map[evento] || '📝';
    }

    // ==================== NAVEGACIÓN SEMANAL ====================
    function _irSemanaAnterior() {
        currentSemanaInicio.setDate(currentSemanaInicio.getDate() - 7);
        _loadActividades().then(() => {
            _renderGridSemanal();
            _renderActividadesLista();
        });
    }

    function _irSemanaSiguiente() {
        currentSemanaInicio.setDate(currentSemanaInicio.getDate() + 7);
        _loadActividades().then(() => {
            _renderGridSemanal();
            _renderActividadesLista();
        });
    }

    // ==================== KANBAN: DRAG & DROP ====================
    function _bindKanbanDragEvents() {
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('dragstart', function(e) {
                draggedActividadId = this.dataset.id;
                this.classList.add('dragging');
                e.dataTransfer?.setData('text/plain', this.dataset.id);
                e.dataTransfer && (e.dataTransfer.effectAllowed = 'move');
            });
            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                draggedActividadId = null;
                document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
            });
            card.addEventListener('click', function(e) {
                _openSidebar(this.dataset.id);
            });
        });

        document.querySelectorAll('.kanban-column').forEach(col => {
            col.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.classList.add('drag-over');
                e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
            });
            col.addEventListener('dragleave', function(e) {
                this.classList.remove('drag-over');
            });
            col.addEventListener('drop', async function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');
                const id = draggedActividadId || e.dataTransfer?.getData('text/plain');
                const nuevoEstado = this.dataset.status;
                if (!id || !nuevoEstado) return;
                const act = actividades.find(a => String(a.id) === String(id));
                if (!act) return;
                if (!_canMoveCard(act)) {
                    _showToast('No tienes permiso para mover esta tarjeta', 'error');
                    return;
                }
                if (act.estado === nuevoEstado) return;
                await _updateActividadEstado(id, nuevoEstado);
            });
        });
    }

    function _canMoveCard(act) {
        if (isAdmin) return true;
        if (!currentUser) return false;
        return act.creado_por === currentUser.id || act.user_id === currentUser.id;
    }

    async function _updateActividadEstado(id, nuevoEstado) {
        const updates = { estado: nuevoEstado };
        if (nuevoEstado === 'completado') {
            updates.completado_en = new Date().toISOString();
            const act = actividades.find(a => String(a.id) === String(id));
            if (act && act.created_at) {
                const inicio = new Date(act.created_at);
                const fin = new Date();
                updates.duracion_minutos = Math.round((fin - inicio) / 60000);
            }
        }
        try {
            await actividadesService.update(id, updates);
            await _insertarHistorial(id, 'estado_cambiado', `Estado cambiado a ${nuevoEstado}`, currentUser?.id);
            _showToast('Estado actualizado', 'success');
            await _loadActividades();
            await _loadSubtareas();
            if (vistaActual === 'kanban') _renderKanban();
            else { _renderGridSemanal(); _renderActividadesLista(); }
            if (sidebarActividadId === id) _renderSidebar(id);
        } catch (err) {
            console.error('[Actividades] Error cambiando estado:', err);
            _showToast('Error al cambiar estado', 'error');
        }
    }

    // ==================== KANBAN: SIDEBAR ====================
    function _openSidebar(id) {
        sidebarActividadId = id;
        const sidebar = document.getElementById('kanbanSidebar');
        if (!sidebar) return;
        _renderSidebar(id);
        sidebar.classList.add('open');
        let overlay = document.getElementById('kanbanSidebarOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'kanbanSidebarOverlay';
            overlay.className = 'kanban-sidebar-overlay';
            overlay.addEventListener('click', _closeSidebar);
            document.body.appendChild(overlay);
        }
        overlay.classList.add('active');
    }

    function _closeSidebar() {
        const sidebar = document.getElementById('kanbanSidebar');
        if (sidebar) sidebar.classList.remove('open');
        const overlay = document.getElementById('kanbanSidebarOverlay');
        if (overlay) overlay.classList.remove('active');
        sidebarActividadId = null;
    }

    function _renderSidebar(id) {
        const act = actividades.find(a => String(a.id) === String(id));
        if (!act) return;
        const title = document.getElementById('sidebarTitle');
        const body = document.getElementById('sidebarBody');
        if (!body) return;
        const key = jiraKeyMap[id] || id?.slice(0, 6).toUpperCase();
        const subtareas = subtareasMap[id] || [];
        const progress = _computeProgress(subtareas);
        const tiempo = _tiempoTranscurrido(act);
        const estadoLabel = _getEstadoLabel(act.estado);
        const estadoClass = act.estado || 'pendiente';

        if (title) title.innerHTML = `<i class="fas fa-ticket-alt"></i> ${key}`;

        body.innerHTML = `
            <div class="sidebar-section">
                <div class="sidebar-key">${key}</div>
                <span class="sidebar-estado ${estadoClass}"><span class="kanban-dot dot-${estadoClass}"></span> ${estadoLabel}</span>
                ${tiempo ? `<div class="sidebar-tiempo"><i class="fas fa-clock"></i> Tiempo transcurrido: ${tiempo}</div>` : ''}
            </div>

            <div class="sidebar-section">
                <h4><i class="fas fa-align-left"></i> Resumen</h4>
                <p style="font-size:13px; color:var(--text-secondary); line-height:1.5;">${act.resumen || 'Sin resumen'}</p>
            </div>

            <div class="sidebar-section">
                <h4><i class="fas fa-sticky-note"></i> Notas</h4>
                <textarea class="sidebar-notas" id="sidebarNotas" placeholder="Escribe notas internas...">${act.notas || ''}</textarea>
                ${isAdmin ? `<button class="btn-ssepi btn-primario" style="margin-top:8px;" onclick="window.actividadesModule._guardarNotas('${id}')"><i class="fas fa-save"></i> Guardar Notas</button>` : ''}
            </div>

            <div class="sidebar-section">
                <h4><i class="fas fa-tasks"></i> Subtareas (${subtareas.filter(s=>s.done).length}/${subtareas.length})</h4>
                <div class="sidebar-progress-wrap">
                    <div class="sidebar-progress-bar"><div class="sidebar-progress-fill" style="width:${progress}%"></div></div>
                    <span class="sidebar-progress-text">${progress}%</span>
                </div>
                <div class="subtareas-list" id="sidebarSubtareas">
                    ${subtareas.map(s => _renderSubtareaItem(s)).join('')}
                </div>
                ${isAdmin ? `<button class="btn-add-subtarea" onclick="window.actividadesModule._addSubtarea('${id}')"><i class="fas fa-plus"></i> Agregar Subtarea</button>` : ''}
            </div>

            <div class="sidebar-section">
                <h4><i class="fas fa-user"></i> Técnico</h4>
                <p style="font-size:13px;">${act.creado_por_usuario?.nombre || 'Técnico'}</p>
            </div>

            <div class="sidebar-section">
                <h4><i class="fas fa-calendar"></i> Fecha</h4>
                <p style="font-size:13px;">${act.fecha ? new Date(act.fecha).toLocaleDateString('es-MX') : '--'}</p>
            </div>
        `;

        // Bind checkboxes inline
        document.querySelectorAll('.subtarea-check').forEach(ch => {
            ch.addEventListener('change', function() {
                const sid = this.dataset.id;
                window.actividadesModule._toggleSubtarea(sid);
            });
        });
    }

    function _renderSubtareaItem(s) {
        const images = Array.isArray(s.images) ? s.images : (typeof s.images === 'string' ? JSON.parse(s.images || '[]') : []);
        const thumbs = images.map(img => `
            <img class="subtarea-thumb" src="${img.url || img}" alt="" onclick="window.open('${img.url || img}', '_blank')">
        `).join('');
        return `
            <div class="subtarea-item ${s.done ? 'done' : ''}" data-id="${s.id}">
                <input type="checkbox" class="subtarea-check" data-id="${s.id}" ${s.done ? 'checked' : ''}>
                <div class="subtarea-body">
                    <input type="text" class="subtarea-title" value="${s.titulo || ''}" data-id="${s.id}"
                        onblur="window.actividadesModule._updateSubtareaTitle('${s.id}', this.value)"
                        ${!isAdmin ? 'readonly' : ''}>
                    <p class="subtarea-desc">${s.descripcion || ''}</p>
                    <div class="subtarea-images">${thumbs}</div>
                    ${isAdmin ? `<button class="btn-upload-image" onclick="document.getElementById('subtareaImgInput_${s.id}').click()"><i class="fas fa-image"></i> Adjuntar imagen</button>
                    <input type="file" id="subtareaImgInput_${s.id}" accept="image/*" style="display:none;"
                        onchange="window.actividadesModule._uploadSubtareaImage('${s.id}', this.files[0])">` : ''}
                </div>
                ${isAdmin ? `<button class="subtarea-delete" onclick="window.actividadesModule._deleteSubtarea('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;
    }

    // ==================== KANBAN: SUBTAREAS CRUD ====================
    async function _toggleSubtarea(subtareaId) {
        const s = (Object.values(subtareasMap).flat()).find(x => String(x.id) === String(subtareaId));
        if (!s) return;
        try {
            await subtareasService.update(subtareaId, { done: !s.done });
            s.done = !s.done;
            _showToast('Subtarea actualizada', 'success');
            if (sidebarActividadId === s.actividad_id) _renderSidebar(s.actividad_id);
            if (vistaActual === 'kanban') _renderKanban();
        } catch (err) {
            console.error('[Actividades] Error toggling subtarea:', err);
            _showToast('Error al actualizar subtarea', 'error');
        }
    }

    async function _addSubtarea(actividadId) {
        if (!isAdmin) return;
        try {
            const orden = (subtareasMap[actividadId] || []).length;
            const inserted = await subtareasService.insert({
                actividad_id: actividadId,
                titulo: 'Nueva subtarea',
                descripcion: '',
                done: false,
                images: [],
                orden
            });
            if (inserted) {
                if (!subtareasMap[actividadId]) subtareasMap[actividadId] = [];
                subtareasMap[actividadId].push(inserted);
                _showToast('Subtarea agregada', 'success');
                _renderSidebar(actividadId);
                if (vistaActual === 'kanban') _renderKanban();
            }
        } catch (err) {
            console.error('[Actividades] Error agregando subtarea:', err);
            _showToast('Error al agregar subtarea', 'error');
        }
    }

    async function _updateSubtareaTitle(subtareaId, nuevoTitulo) {
        if (!isAdmin || !nuevoTitulo.trim()) return;
        try {
            await subtareasService.update(subtareaId, { titulo: nuevoTitulo.trim() });
            const s = (Object.values(subtareasMap).flat()).find(x => String(x.id) === String(subtareaId));
            if (s) s.titulo = nuevoTitulo.trim();
            if (vistaActual === 'kanban') _renderKanban();
        } catch (err) {
            console.error('[Actividades] Error actualizando subtarea:', err);
        }
    }

    async function _deleteSubtarea(subtareaId) {
        if (!isAdmin) return;
        if (!confirm('¿Eliminar esta subtarea?')) return;
        try {
            const s = (Object.values(subtareasMap).flat()).find(x => String(x.id) === String(subtareaId));
            await subtareasService.delete(subtareaId);
            if (s && subtareasMap[s.actividad_id]) {
                subtareasMap[s.actividad_id] = subtareasMap[s.actividad_id].filter(x => x.id !== subtareaId);
            }
            _showToast('Subtarea eliminada', 'success');
            if (sidebarActividadId === s?.actividad_id) _renderSidebar(s.actividad_id);
            if (vistaActual === 'kanban') _renderKanban();
        } catch (err) {
            console.error('[Actividades] Error eliminando subtarea:', err);
            _showToast('Error al eliminar subtarea', 'error');
        }
    }

    async function _uploadSubtareaImage(subtareaId, file) {
        if (!file || !isAdmin) return;
        if (file.size > 5 * 1024 * 1024) {
            _showToast('La imagen no puede pesar más de 5MB', 'error'); return;
        }
        try {
            const ext = file.name.split('.').pop();
            const fileName = `subtareas/${subtareaId}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { data: uploadData, error: uploadError } = await window.supabase.storage
                .from('actividades')
                .upload(fileName, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = window.supabase.storage.from('actividades').getPublicUrl(fileName);

            const s = (Object.values(subtareasMap).flat()).find(x => String(x.id) === String(subtareaId));
            if (!s) return;
            const images = Array.isArray(s.images) ? s.images : (typeof s.images === 'string' ? JSON.parse(s.images || '[]') : []);
            images.push({ url: publicUrl, name: file.name });
            await subtareasService.update(subtareaId, { images });
            s.images = images;
            _showToast('Imagen adjuntada', 'success');
            if (sidebarActividadId === s.actividad_id) _renderSidebar(s.actividad_id);
        } catch (err) {
            console.error('[Actividades] Error subiendo imagen:', err);
            _showToast('Error al subir imagen', 'error');
        }
    }

    async function _guardarNotas(id) {
        if (!isAdmin) return;
        const val = document.getElementById('sidebarNotas')?.value || '';
        try {
            await actividadesService.update(id, { notas: val });
            const act = actividades.find(a => a.id === id);
            if (act) act.notas = val;
            _showToast('Notas guardadas', 'success');
        } catch (err) {
            console.error('[Actividades] Error guardando notas:', err);
            _showToast('Error al guardar notas', 'error');
        }
    }

    function _showToast(message, type = 'info') {
        if (typeof window.SSEPIToast !== 'undefined') {
            window.SSEPIToast.show(message, type);
        } else {
            console.log(`[Toast ${type}] ${message}`);
        }
    }

    // ==================== EVENTOS DOM ====================
    function _bindEvents() {
        // Toggle menu
        var toggleMenu = document.getElementById('toggleMenu');
        if (toggleMenu) toggleMenu.addEventListener('click', function() {
            const s = document.getElementById('sidebar'), b = document.body;
            if (window.innerWidth <= 768) s.classList.toggle('active');
            else b.classList.toggle('sidebar-closed');
        });

        // Theme button (gestionado por theme-clock.js)

        // Semana navegación
        const btnAnterior = document.getElementById('semanaAnterior');
        if (btnAnterior) btnAnterior.addEventListener('click', _irSemanaAnterior);

        const btnSiguiente = document.getElementById('semanaSiguiente');
        if (btnSiguiente) btnSiguiente.addEventListener('click', _irSemanaSiguiente);

        // Nueva actividad
        const btnNueva = document.getElementById('btnNuevaActividad');
        if (btnNueva) btnNueva.addEventListener('click', function() {
            _abrirModalActividad();
        });

        // Modal close buttons
        const closeActividad = document.getElementById('closeActividadModal');
        if (closeActividad) closeActividad.addEventListener('click', function() {
            document.getElementById('actividadModal').classList.remove('active');
        });

        const closeVerActividad = document.getElementById('closeVerActividadModal');
        if (closeVerActividad) closeVerActividad.addEventListener('click', function() {
            document.getElementById('verActividadModal').classList.remove('active');
        });

        const closeVerActividadBtn = document.getElementById('closeVerActividadBtn');
        if (closeVerActividadBtn) closeVerActividadBtn.addEventListener('click', function() {
            document.getElementById('verActividadModal').classList.remove('active');
        });

        // Guardar actividad
        const guardarBtn = document.getElementById('guardarActividadBtn');
        if (guardarBtn) guardarBtn.addEventListener('click', _guardarActividad);

        // Cancelar
        const cancelBtn = document.getElementById('cancelActividadBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() {
            document.getElementById('actividadModal').classList.remove('active');
        });

        // Toggle vista Semanal / Kanban
        const btnVistaSemanal = document.getElementById('btnVistaSemanal');
        const btnVistaKanban = document.getElementById('btnVistaKanban');
        if (btnVistaSemanal) {
            btnVistaSemanal.addEventListener('click', function() {
                vistaActual = 'semanal';
                btnVistaSemanal.classList.add('active');
                btnVistaKanban?.classList.remove('active');
                document.getElementById('vistaSemanalContainer').style.display = '';
                document.getElementById('kanbanContainer').style.display = 'none';
                _renderGridSemanal();
                _renderActividadesLista();
            });
        }
        if (btnVistaKanban) {
            btnVistaKanban.addEventListener('click', function() {
                vistaActual = 'kanban';
                btnVistaKanban.classList.add('active');
                btnVistaSemanal?.classList.remove('active');
                document.getElementById('vistaSemanalContainer').style.display = 'none';
                document.getElementById('kanbanContainer').style.display = '';
                _renderKanban();
            });
        }

        // Filtros
        const aplicarFiltrosBtn = document.getElementById('aplicarFiltrosBtn');
        if (aplicarFiltrosBtn) aplicarFiltrosBtn.addEventListener('click', _aplicarFiltros);

        const filtroDepto = document.getElementById('filtroDepartamento');
        if (filtroDepto) {
            filtroDepto.value = departamentoActual;
            filtroDepto.addEventListener('change', function() {
                departamentoActual = this.value;
                _aplicarFiltros();
            });
        }

        // Cambio de departamento en modal recarga órdenes
        const actDepto = document.getElementById('actDepartamento');
        if (actDepto) {
            actDepto.addEventListener('change', function() {
                _cargarOrdenesPorDepartamento(this.value);
            });
        }
    }

    function _aplicarFiltros() {
        _loadActividades().then(async function() {
            await _loadSubtareas();
            _buildJiraKeyMap();
            if (vistaActual === 'kanban') {
                _renderKanban();
            } else {
                _renderGridSemanal();
                _renderActividadesLista();
            }
        });
    }

    // ==================== REALTIME ====================
    function _populateFiltroTecnicos() {
        const sel = document.getElementById('filtroTecnico');
        if (!sel) return;
        sel.innerHTML = '<option value="">Todos</option>' + tecnicos.map(t =>
            `<option value="${t.id}">${t.nombre}</option>`
        ).join('');
    }
    function _setupRealtime() {
        if (!window.supabase) return;

        const subActividades = window.supabase
            .channel('actividades_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades_diarias' }, async payload => {
                await _loadActividades();
                await _loadSubtareas();
                _buildJiraKeyMap();
                if (vistaActual === 'kanban') _renderKanban();
                else { _renderGridSemanal(); _renderActividadesLista(); }
                if (sidebarActividadId) _renderSidebar(sidebarActividadId);
            })
            .subscribe();
        subscriptions.push(subActividades);

        const subSubtareas = window.supabase
            .channel('subtareas_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades_subtareas' }, async payload => {
                await _loadActividades();
                await _loadSubtareas();
                _buildJiraKeyMap();
                if (vistaActual === 'kanban') _renderKanban();
                else { _renderGridSemanal(); _renderActividadesLista(); }
                if (sidebarActividadId) _renderSidebar(sidebarActividadId);
            })
            .subscribe();
        subscriptions.push(subSubtareas);
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== WIDGET PARA MÓDULOS OPERATIVOS ====================
    async function renderWidgetActividades(containerId, ordenId, ordenTipo) {
        const container = document.getElementById(containerId);
        if (!container || !window.supabase) return;

        try {
            const { data, error } = await window.supabase
                .from('actividades_diarias')
                .select('id, estado, resumen, fecha, creado_por, departamento')
                .eq('orden_origen_id', ordenId)
                .eq('orden_origen_tipo', ordenTipo)
                .order('fecha', { ascending: false });
            if (error) throw error;

            const acts = data || [];
            const total = acts.length;
            const pendientes = acts.filter(a => a.estado === 'pendiente').length;
            const enProgreso = acts.filter(a => a.estado === 'en_progreso').length;
            const completadas = acts.filter(a => a.estado === 'completado').length;
            const progreso = total > 0 ? Math.round((completadas / total) * 100) : 0;

            const deptoLabel = (DEPARTAMENTOS.find(d => d.key === (acts[0]?.departamento || 'automatizacion'))?.label) || 'Actividades';

            container.innerHTML = `
                <div class="actividades-widget">
                    <div class="actividades-widget-header">
                        <div class="actividades-widget-title">
                            <i class="fas fa-tasks"></i> ${deptoLabel} — Avance
                        </div>
                        <div class="actividades-widget-counts">
                            <span class="count-pendiente">${pendientes} pend.</span>
                            <span class="count-en_progreso">${enProgreso} proc.</span>
                            <span class="count-completado">${completadas} comp.</span>
                        </div>
                    </div>
                    <div class="actividades-widget-progress">
                        <div class="actividades-widget-bar">
                            <div class="actividades-widget-fill" style="width:${progreso}%"></div>
                        </div>
                        <span class="actividades-widget-pct">${progreso}%</span>
                    </div>
                    ${acts.length > 0 ? `
                        <div class="actividades-widget-list">
                            ${acts.slice(0, 3).map(a => `
                                <div class="actividades-widget-item ${a.estado || 'pendiente'}">
                                    <span class="widget-dot dot-${a.estado || 'pendiente'}"></span>
                                    <span class="widget-resumen">${(a.resumen || 'Sin resumen').substring(0, 40)}${(a.resumen || '').length > 40 ? '...' : ''}</span>
                                    <span class="widget-fecha">${a.fecha ? new Date(a.fecha).toLocaleDateString('es-MX') : ''}</span>
                                </div>
                            `).join('')}
                            ${acts.length > 3 ? `<div class="actividades-widget-mas">+${acts.length - 3} más</div>` : ''}
                        </div>
                    ` : `<div class="actividades-widget-empty">No hay actividades vinculadas</div>`}
                    <div class="actividades-widget-actions">
                        <a href="/panel/pages/ssepi_actividades.html?departamento=${acts[0]?.departamento || 'automatizacion'}" class="btn-ssepi btn-sm btn-secondary">
                            <i class="fas fa-external-link-alt"></i> Ver actividades
                        </a>
                    </div>
                </div>
            `;
        } catch (e) {
            console.warn('[Actividades] Error renderizando widget:', e);
            container.innerHTML = `<div class="actividades-widget-empty">Error cargando actividades</div>`;
        }
    }

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirModalActividad,
        _guardarActividad,
        _verActividad,
        _irSemanaAnterior,
        _irSemanaSiguiente,
        _closeSidebar,
        _toggleSubtarea,
        _addSubtarea,
        _updateSubtareaTitle,
        _deleteSubtarea,
        _uploadSubtareaImage,
        _guardarNotas,
        renderWidgetActividades
    };
})();

// Exponer módulo globalmente
window.actividadesModule = ActividadesModule;
