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

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diasSemanaCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Servicios de datos
    const actividadesService = createDataService('actividades_diarias');
    const historialService = createDataService('actividades_historial');
    const contactosService = createDataService('contactos');

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

        _setSemanaActual();
        _bindEvents();
        await _loadInitialData();
        _startClock();
        _setupRealtime();

        console.log('✅ Módulo actividades iniciado');
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
        _renderGridSemanal();
        _renderActividadesLista();
        _populateFiltroTecnicos();
    }

    async function _loadActividades() {
        if (!window.supabase) return;

        const inicioSemana = currentSemanaInicio;
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(finSemana.getDate() + 5); // Lunes a Sábado
        finSemana.setHours(23, 59, 59, 999);

        try {
            const { data, error } = await window.supabase
                .from('actividades_diarias')
                .select('*, creado_por_usuario:usuarios (nombre, email)')
                .gte('fecha', inicioSemana.toISOString().split('T')[0])
                .lte('fecha', finSemana.toISOString().split('T')[0])
                .order('fecha', { ascending: true });

            if (error) throw error;
            actividades = data || [];
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

            // Filtrar actividades de este día
            const actividadesDia = actividades.filter(a => a.fecha === fechaStr);

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

        if (actividades.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size:48px; margin-bottom:16px; opacity:0.3;"></i>
                    <p>No hay actividades registradas esta semana.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = actividades.map(act => {
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

    // ==================== MODAL: NUEVA/EDITAR ACTIVIDAD ====================
    function _abrirModalActividad(editId = null) {
        const modal = document.getElementById('actividadModal');
        const titleEl = document.getElementById('actividadModalTitle');
        if (!modal) return;

        // Reset form
        document.getElementById('actFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('actTecnico').value = '';
        document.getElementById('actResumen').value = '';
        document.getElementById('actArchivo').value = '';
        document.getElementById('actEstado').value = 'pendiente';
        currentActividadId = null;

        if (editId) {
            const act = actividades.find(a => a.id === editId);
            if (act) {
                currentActividadId = editId;
                if (titleEl) titleEl.textContent = 'Editar Actividad';
                document.getElementById('actFecha').value = act.fecha || '';
                document.getElementById('actTecnico').value = act.user_id || '';
                document.getElementById('actResumen').value = act.resumen || '';
                document.getElementById('actEstado').value = act.estado || 'pendiente';
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

            const row = {
                fecha,
                user_id,
                resumen,
                estado,
                archivo_url,
                archivo_tipo,
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
        const act = actividades.find(a => a.id === id);
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

        // Filtros
        const aplicarFiltrosBtn = document.getElementById('aplicarFiltrosBtn');
        if (aplicarFiltrosBtn) aplicarFiltrosBtn.addEventListener('click', _aplicarFiltros);
    }

    // ==================== REALTIME ====================
    function _setupRealtime() {
        if (!window.supabase) return;

        const subActividades = window.supabase
            .channel('actividades_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades_diarias' }, payload => {
                _loadActividades().then(() => {
                    _renderGridSemanal();
                    _renderActividadesLista();
                });
            })
            .subscribe();
        subscriptions.push(subActividades);
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirModalActividad,
        _guardarActividad,
        _verActividad,
        _irSemanaAnterior,
        _irSemanaSiguiente
    };
})();

// Exponer módulo globalmente
window.actividadesModule = ActividadesModule;

    // ==================== FILTROS ====================
    function _populateFiltroTecnicos() {
        const select = document.getElementById('filtroTecnico');
        if (!select) return;

        select.innerHTML = '<option value="todos">Todos</option>';
        tecnicos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nombre;
            select.appendChild(opt);
        });
    }

    function _aplicarFiltros() {
        const tecnicoId = document.getElementById('filtroTecnico')?.value || 'todos';
        const estado = document.getElementById('filtroEstado')?.value || 'todos';
        const buscar = document.getElementById('filtroBuscar')?.value.trim().toLowerCase() || '';

        let filtradas = actividades;

        if (tecnicoId !== 'todos') {
            filtradas = filtradas.filter(a => a.user_id === tecnicoId);
        }

        if (estado !== 'todos') {
            filtradas = filtradas.filter(a => a.estado === estado);
        }

        if (buscar) {
            filtradas = filtradas.filter(a =>
                (a.resumen && a.resumen.toLowerCase().includes(buscar)) ||
                (a.creado_por_usuario?.nombre && a.creado_por_usuario.nombre.toLowerCase().includes(buscar))
            );
        }

        // Re-renderizar con filtradas
        _renderActividadesListaFiltradas(filtradas);
    }

    function _renderActividadesListaFiltradas(filtradas) {
        const container = document.getElementById('actividadesLista');
        if (!container) return;

        if (filtradas.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:48px; margin-bottom:16px; opacity:0.3;"></i>
                    <p>No se encontraron actividades con estos filtros.</p>
                </div>
            `;
            return;
        }

        // Reutilizar lógica de renderizado
        container.innerHTML = filtradas.map(act => {
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

        container.querySelectorAll('.actividad-card').forEach(el => {
            el.addEventListener('click', function() {
                const id = this.dataset.id;
                _verActividad(id);
            });
        });
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
        document.getElementById('actArchivo').value = '';
        document.getElementById('actEstado').value = 'pendiente';
        currentActividadId = null;

        if (editId) {
            const act = actividades.find(a => a.id === editId);
            if (act) {
                currentActividadId = editId;
                if (titleEl) titleEl.textContent = 'Editar Actividad';
                document.getElementById('actFecha').value = act.fecha || '';
                document.getElementById('actTecnico').value = act.user_id || '';
                document.getElementById('actResumen').value = act.resumen || '';
                document.getElementById('actEstado').value = act.estado || 'pendiente';
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

            const row = {
                fecha,
                user_id,
                resumen,
                estado,
                archivo_url,
                archivo_tipo,
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
        const act = actividades.find(a => a.id === id);
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

        // Filtros
        const aplicarFiltrosBtn = document.getElementById('aplicarFiltrosBtn');
        if (aplicarFiltrosBtn) aplicarFiltrosBtn.addEventListener('click', _aplicarFiltros);
    }

    // ==================== REALTIME ====================
    function _setupRealtime() {
        if (!window.supabase) return;

        const subActividades = window.supabase
            .channel('actividades_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades_diarias' }, payload => {
                _loadActividades().then(() => {
                    _renderGridSemanal();
                    _renderActividadesLista();
                });
            })
            .subscribe();
        subscriptions.push(subActividades);
    }

    // ==================== LIMPIEZA ====================
    function _cleanup() {
        subscriptions.forEach(sub => sub.unsubscribe());
    }
    window.addEventListener('beforeunload', _cleanup);

    // ==================== EXPOSICIÓN PÚBLICA ====================
    return {
        init,
        _abrirModalActividad,
        _guardarActividad,
        _verActividad,
        _irSemanaAnterior,
        _irSemanaSiguiente
    };
})();

// Exponer módulo globalmente
window.actividadesModule = ActividadesModule;
