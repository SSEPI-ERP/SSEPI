/**
 * vacaciones.js — Módulo Vacaciones: solicitudes, días disponibles, días feriados.
 * Todos los roles con permiso vacaciones pueden ver y solicitar; admin puede editar días asignados.
 */
(function() {
    'use strict';

    var DIAS_BASE = 15;
    var currentUserId = null;
    var currentYear = new Date().getFullYear();
    var feriados = [];
    var balance = null;
    var empleadosMap = {};
    var calendarYear = new Date().getFullYear();
    var calendarMonth = new Date().getMonth();
    var ocupacionPorDia = {};

    function supabase() {
        return window.supabase;
    }

    function auth() {
        return window.authService;
    }

    function dateKey(d) {
        var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
        return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }

    function loadEmpleadosAndUsers() {
        return Promise.all([
            supabase().from('vacaciones_empleados').select('id, user_id, nombre, rol, email, color').order('orden'),
            supabase().from('users').select('auth_user_id, email, nombre')
        ]).then(function(ress) {
            var empleados = ress[0].data || [];
            var users = ress[1].data || [];
            empleadosMap = {};
            var byEmail = {};
            empleados.forEach(function(e) {
                byEmail[(e.email || '').toLowerCase()] = { nombre: e.nombre, color: e.color || '#3b82f6' };
                if (e.user_id) empleadosMap[e.user_id] = { nombre: e.nombre, color: e.color || '#3b82f6' };
            });
            users.forEach(function(u) {
                var emp = byEmail[(u.email || '').toLowerCase()];
                if (emp) empleadosMap[u.auth_user_id] = emp;
                else empleadosMap[u.auth_user_id] = { nombre: u.nombre || u.email || 'Usuario', color: '#94a3b8' };
            });
            window._vacacionesEmpleadosByEmail = byEmail;
            renderListaEmpleados(empleados);
            return empleados;
        }).catch(function(e) {
            console.warn('[Vacaciones] Empleados/users:', e);
            return [];
        });
    }

    function renderListaEmpleados(empleados) {
        var tbody = document.getElementById('tablaEmpleadosBody');
        if (!tbody) return;
        var rolLabel = function(r) {
            var map = { ventas: 'Ventas', automatizacion: 'Automatización', taller: 'Taller', administracion: 'Administración', contabilidad: 'Contabilidad', admin: 'Admin', motores: 'Motores' };
            return map[r] || r;
        };
        tbody.innerHTML = (empleados || []).length === 0
            ? '<tr><td colspan="3">No hay empleados registrados.</td></tr>'
            : empleados.map(function(e) {
                return '<tr><td>' + (e.nombre || '') + '</td><td>' + rolLabel(e.rol || '') + '</td><td><span class="empleado-color" style="background:' + (e.color || '#3b82f6') + '"></span> ' + (e.color || '#3b82f6') + '</td></tr>';
            }).join('');
    }

    function loadOcupacionForMonth(year, month) {
        var start = new Date(year, month, 1);
        var end = new Date(year, month + 1, 0);
        var startStr = dateKey(start);
        var endStr = dateKey(end);
        return supabase()
            .from('vacaciones_solicitudes')
            .select('id, user_id, fecha_desde, fecha_hasta, estado')
            .in('estado', ['pendiente', 'aprobada'])
            .lte('fecha_desde', endStr)
            .gte('fecha_hasta', startStr)
            .then(function(r) {
                if (r.error) throw r.error;
                var map = {};
                (r.data || []).forEach(function(s) {
                    var d = new Date(s.fecha_desde + 'T12:00:00');
                    var h = new Date(s.fecha_hasta + 'T12:00:00');
                    var info = empleadosMap[s.user_id] || { nombre: 'Usuario', color: '#94a3b8' };
                    while (d <= h) {
                        var key = dateKey(d);
                        if (!map[key]) map[key] = [];
                        if (!map[key].some(function(x) { return x.nombre === info.nombre; })) map[key].push(info);
                        d.setDate(d.getDate() + 1);
                    }
                });
                ocupacionPorDia = map;
                return map;
            });
    }

    function loadOcupacionForYear(year) {
        var startStr = year + '-01-01';
        var endStr = year + '-12-31';
        return supabase()
            .from('vacaciones_solicitudes')
            .select('id, user_id, fecha_desde, fecha_hasta, estado')
            .in('estado', ['pendiente', 'aprobada'])
            .lte('fecha_desde', endStr)
            .gte('fecha_hasta', startStr)
            .then(function(r) {
                if (r.error) throw r.error;
                var map = {};
                (r.data || []).forEach(function(s) {
                    var d = new Date(s.fecha_desde + 'T12:00:00');
                    var h = new Date(s.fecha_hasta + 'T12:00:00');
                    var info = empleadosMap[s.user_id] || { nombre: 'Usuario', color: '#94a3b8' };
                    while (d <= h) {
                        var key = dateKey(d);
                        if (!map[key]) map[key] = [];
                        if (!map[key].some(function(x) { return x.nombre === info.nombre; })) map[key].push(info);
                        d.setDate(d.getDate() + 1);
                    }
                });
                ocupacionPorDia = map;
                return map;
            });
    }

    function buildMonthGridHtml(year, month, ocupacionMap, feriadoSet) {
        var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        var first = new Date(year, month, 1);
        var startPad = first.getDay();
        var html = '<div class="cal-head">Do</div><div class="cal-head">Lu</div><div class="cal-head">Ma</div><div class="cal-head">Mi</div><div class="cal-head">Ju</div><div class="cal-head">Vi</div><div class="cal-head">Sá</div>';
        var d = new Date(year, month, 1 - startPad);
        var done = false;
        var rows = 0;
        while (!done || d.getMonth() === month) {
            if (d.getMonth() === month) done = true;
            var key = dateKey(d);
            var other = d.getMonth() !== month;
            var feriado = feriadoSet[key];
            var list = (ocupacionMap || {})[key] || [];
            var dots = list.slice(0, 4).map(function(x) {
                return '<span class="cal-dot" style="background:' + x.color + '" title="' + x.nombre + '"></span>';
            }).join('');
            if (list.length > 4) dots += '<span>+</span>';
            var tipoClass = feriado ? ' feriado feriado-' + (feriado.tipo || 'legal') : '';
            var titleAttr = feriado ? ' title="' + (feriado.nombre || '').replace(/"/g, '&quot;') + ' (' + (feriado.tipo === 'religioso' ? 'Religioso' : feriado.tipo === 'suspension_labores' ? 'Suspensión labores' : 'Legal') + ')"' : '';
            html += '<div class="cal-cell' + (other ? ' other-month' : '') + (feriado ? tipoClass : '') + (list.length ? ' has-vacaciones' : '') + '" data-date="' + key + '"' + titleAttr + '>' +
                '<span>' + d.getDate() + '</span>' +
                (feriado ? '<span class="cal-feriado-label">' + (feriado.nombre || '').substring(0, 12) + '</span>' : '') +
                (dots ? '<div class="cal-dots">' + dots + '</div>' : '') +
                '</div>';
            d.setDate(d.getDate() + 1);
            if (d.getDay() === 0) rows++;
            if (rows >= 6 && d.getMonth() !== month) break;
        }
        return '<h4>' + monthNames[month] + ' ' + year + '</h4><div class="cal-grid">' + html + '</div>';
    }

    function renderYearView(year) {
        var container = document.getElementById('calAnualGrids');
        var yearSelect = document.getElementById('calAnualYear');
        if (!container) return;
        var feriadoSet = {};
        feriados.forEach(function(f) {
            if (f.fecha) feriadoSet[f.fecha] = { nombre: f.nombre || 'Feriado', tipo: f.tipo || 'legal' };
        });
        container.innerHTML = '';
        for (var m = 0; m < 12; m++) {
            var block = document.createElement('div');
            block.className = 'cal-month-block';
            block.innerHTML = buildMonthGridHtml(year, m, ocupacionPorDia, feriadoSet);
            container.appendChild(block);
        }
        container.querySelectorAll('.cal-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
                var key = this.getAttribute('data-date');
                var list = ocupacionPorDia[key] || [];
                var detail = document.getElementById('calDayDetail');
                var dateSpan = document.getElementById('calDayDetailDate');
                var listEl = document.getElementById('calDayDetailList');
                if (!detail || !dateSpan || !listEl) return;
                dateSpan.textContent = key;
                listEl.innerHTML = list.length === 0
                    ? '<li>Nadie con vacaciones este día.</li>'
                    : list.map(function(x) {
                        return '<li><span class="empleado-color" style="background:' + x.color + '"></span>' + x.nombre + '</li>';
                    }).join('');
                detail.classList.remove('hidden');
            });
        });
        if (yearSelect && yearSelect.value !== String(year)) {
            yearSelect.value = year;
        }
    }

    function openAnualView() {
        var section = document.getElementById('calAnualSection');
        var yearSelect = document.getElementById('calAnualYear');
        if (!section || !yearSelect) return;
        var year = parseInt(yearSelect.value, 10) || calendarYear;
        section.classList.remove('hidden');
        loadOcupacionForYear(year).then(function() {
            renderYearView(year);
        }).catch(function(e) {
            console.warn('[Vacaciones] Anual:', e);
            renderYearView(year);
        });
    }

    function closeAnualView() {
        var section = document.getElementById('calAnualSection');
        if (section) section.classList.add('hidden');
        loadCalendar();
    }

    function renderCalendar() {
        var grid = document.getElementById('calGrid');
        var monthYearEl = document.getElementById('calMonthYear');
        if (!grid || !monthYearEl) return;
        var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        monthYearEl.textContent = monthNames[calendarMonth] + ' ' + calendarYear;
        var first = new Date(calendarYear, calendarMonth, 1);
        var last = new Date(calendarYear, calendarMonth + 1, 0);
        var startPad = first.getDay();
        var feriadoSet = {};
        feriados.forEach(function(f) {
            if (f.fecha) feriadoSet[f.fecha] = { nombre: f.nombre || 'Feriado', tipo: f.tipo || 'legal' };
        });
        var html = '<div class="cal-head">Do</div><div class="cal-head">Lu</div><div class="cal-head">Ma</div><div class="cal-head">Mi</div><div class="cal-head">Ju</div><div class="cal-head">Vi</div><div class="cal-head">Sá</div>';
        var d = new Date(calendarYear, calendarMonth, 1 - startPad);
        var done = false;
        var rows = 0;
        while (!done || d.getMonth() === calendarMonth) {
            if (d.getMonth() === calendarMonth) done = true;
            var key = dateKey(d);
            var other = d.getMonth() !== calendarMonth;
            var feriado = feriadoSet[key];
            var list = ocupacionPorDia[key] || [];
            var dots = list.slice(0, 5).map(function(x) {
                return '<span class="cal-dot" style="background:' + x.color + '" title="' + x.nombre + '"></span>';
            }).join('');
            if (list.length > 5) dots += '<span title="+' + (list.length - 5) + ' más">+</span>';
            var tipoClass = feriado ? ' feriado feriado-' + (feriado.tipo || 'legal') : '';
            var titleAttr = feriado ? ' title="' + (feriado.nombre || '').replace(/"/g, '&quot;') + ' (' + (feriado.tipo === 'religioso' ? 'Religioso' : feriado.tipo === 'suspension_labores' ? 'Suspensión labores' : 'Legal') + ')"' : '';
            html += '<div class="cal-cell' + (other ? ' other-month' : '') + (feriado ? tipoClass : '') + (list.length ? ' has-vacaciones' : '') + '" data-date="' + key + '"' + titleAttr + '>' +
                '<span>' + d.getDate() + '</span>' +
                (feriado ? '<span class="cal-feriado-label">' + (feriado.nombre || '').substring(0, 12) + '</span>' : '') +
                (dots ? '<div class="cal-dots">' + dots + '</div>' : '') +
                '</div>';
            d.setDate(d.getDate() + 1);
            if (d.getDay() === 0) rows++;
            if (rows >= 6 && d.getMonth() !== calendarMonth) break;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('.cal-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
                var key = this.getAttribute('data-date');
                var list = ocupacionPorDia[key] || [];
                var detail = document.getElementById('calDayDetail');
                var dateSpan = document.getElementById('calDayDetailDate');
                var listEl = document.getElementById('calDayDetailList');
                if (!detail || !dateSpan || !listEl) return;
                dateSpan.textContent = key;
                listEl.innerHTML = list.length === 0
                    ? '<li>Nadie con vacaciones este día.</li>'
                    : list.map(function(x) {
                        return '<li><span class="empleado-color" style="background:' + x.color + '"></span>' + x.nombre + '</li>';
                    }).join('');
                detail.classList.remove('hidden');
            });
        });
    }

    function loadCalendar() {
        return loadOcupacionForMonth(calendarYear, calendarMonth).then(function() {
            renderCalendar();
        }).catch(function(e) {
            console.warn('[Vacaciones] Calendar:', e);
            renderCalendar();
        });
    }

    function ensureBalance(userId, anio) {
        return supabase()
            .from('vacaciones_balance')
            .select('*')
            .eq('user_id', userId)
            .eq('anio', anio)
            .maybeSingle()
            .then(function(r) {
                if (r.error) throw r.error;
                if (r.data) return r.data;
                return supabase()
                    .from('vacaciones_balance')
                    .insert({ user_id: userId, anio: anio, dias_asignados: DIAS_BASE, dias_solicitados: 0 })
                    .select()
                    .single()
                    .then(function(ins) {
                        if (ins.error) throw ins.error;
                        return ins.data;
                    });
            });
    }

    function loadFeriados() {
        return supabase()
            .from('vacaciones_dias_feriados')
            .select('id, fecha, nombre, tipo')
            .order('fecha', { ascending: true })
            .then(function(r) {
                if (r.error) throw r.error;
                feriados = r.data || [];
                var tbody = document.getElementById('tablaFeriadosBody');
                if (!tbody) return;
                tbody.innerHTML = feriados.map(function(f) {
                    var fecha = f.fecha ? new Date(f.fecha + 'T12:00:00').toLocaleDateString('es') : '';
                    var tipoLabel = f.tipo === 'legal' ? 'Legal' : (f.tipo === 'religioso' ? 'Religioso' : 'Suspensión labores');
                    return '<tr><td>' + fecha + '</td><td>' + (f.nombre || '') + '</td><td>' + tipoLabel + '</td></tr>';
                }).join('');
            });
    }

    function countDiasLaborables(desde, hasta) {
        var d = new Date(desde);
        var h = new Date(hasta);
        var count = 0;
        var setFeriado = {};
        feriados.forEach(function(f) {
            if (f.fecha) setFeriado[f.fecha] = true;
        });
        while (d <= h) {
            var day = d.getDay();
            var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            if (day !== 0 && day !== 6 && !setFeriado[key]) count++;
            d.setDate(d.getDate() + 1);
        }
        return count;
    }

    function loadBalance() {
        if (!currentUserId) return Promise.resolve();
        return ensureBalance(currentUserId, currentYear).then(function(b) {
            balance = b;
            document.getElementById('anioBalance').textContent = currentYear;
            var asignados = b.dias_asignados != null ? b.dias_asignados : DIAS_BASE;
            var usados = b.dias_solicitados != null ? b.dias_solicitados : 0;
            var disp = asignados - usados;
            document.getElementById('diasDisponibles').textContent = disp >= 0 ? disp : 0;
            document.getElementById('diasUsados').textContent = usados;
        }).catch(function(e) {
            console.warn('[Vacaciones] Error balance:', e);
            document.getElementById('diasDisponibles').textContent = '—';
            document.getElementById('diasUsados').textContent = '—';
        });
    }

    function loadSolicitudes() {
        if (!currentUserId) return Promise.resolve();
        return supabase()
            .from('vacaciones_solicitudes')
            .select('id, fecha_desde, fecha_hasta, dias_solicitados, estado')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false })
            .then(function(r) {
                if (r.error) throw r.error;
                var tbody = document.getElementById('tablaSolicitudesBody');
                if (!tbody) return;
                var list = r.data || [];
                tbody.innerHTML = list.length === 0
                    ? '<tr><td colspan="4">No hay solicitudes.</td></tr>'
                    : list.map(function(s) {
                        var desde = s.fecha_desde ? new Date(s.fecha_desde + 'T12:00:00').toLocaleDateString('es') : '';
                        var hasta = s.fecha_hasta ? new Date(s.fecha_hasta + 'T12:00:00').toLocaleDateString('es') : '';
                        return '<tr><td>' + desde + '</td><td>' + hasta + '</td><td>' + (s.dias_solicitados || 0) + '</td><td>' + (s.estado || 'pendiente') + '</td></tr>';
                    }).join('');
            }).catch(function(e) {
                console.warn('[Vacaciones] Error solicitudes:', e);
                var tbody = document.getElementById('tablaSolicitudesBody');
                if (tbody) tbody.innerHTML = '<tr><td colspan="4">Error al cargar.</td></tr>';
            });
    }

    function enviarSolicitud() {
        var desde = document.getElementById('solicitudDesde');
        var hasta = document.getElementById('solicitudHasta');
        if (!desde || !hasta || !desde.value || !hasta.value) {
            alert('Indica desde y hasta.');
            return;
        }
        var d = new Date(desde.value);
        var h = new Date(hasta.value);
        if (h < d) {
            alert('La fecha hasta debe ser posterior a desde.');
            return;
        }
        var dias = countDiasLaborables(desde.value, hasta.value);
        if (dias <= 0) {
            alert('No hay días laborables en ese rango.');
            return;
        }
        var disp = (balance && balance.dias_asignados != null && balance.dias_solicitados != null)
            ? (balance.dias_asignados - balance.dias_solicitados) : 0;
        if (dias > disp) {
            alert('No tienes suficientes días disponibles (' + disp + ').');
            return;
        }
        supabase()
            .from('vacaciones_solicitudes')
            .insert({
                user_id: currentUserId,
                fecha_desde: desde.value,
                fecha_hasta: hasta.value,
                dias_solicitados: dias,
                estado: 'pendiente'
            })
            .select()
            .single()
            .then(function(r) {
                if (r.error) throw r.error;
                return supabase()
                    .from('vacaciones_balance')
                    .update({ dias_solicitados: (balance.dias_solicitados || 0) + dias, updated_at: new Date().toISOString() })
                    .eq('user_id', currentUserId)
                    .eq('anio', currentYear);
            })
            .then(function(u) {
                if (u.error) throw u.error;
                balance.dias_solicitados = (balance.dias_solicitados || 0) + dias;
                loadBalance();
                loadSolicitudes();
                desde.value = '';
                hasta.value = '';
                alert('Solicitud enviada.');
            })
            .catch(function(e) {
                alert('Error: ' + (e.message || e));
            });
    }

    function loadAdminBalances() {
        return auth().getCurrentProfile().then(function(profile) {
            if (!profile || (profile.rol !== 'admin' && profile.rol !== 'superadmin')) return;
            document.getElementById('adminBalanceSection').classList.remove('hidden');
            return supabase()
                .from('vacaciones_balance')
                .select('*')
                .order('anio', { ascending: false })
                .order('user_id');
        }).then(function(r) {
            if (!r || r.error) return;
            var data = r.data || [];
            return supabase().from('users').select('auth_user_id, email, nombre').then(function(ur) {
                var users = (ur.data || []).reduce(function(acc, u) {
                    acc[u.auth_user_id] = u.nombre || u.email || u.auth_user_id;
                    return acc;
                }, {});
                var tbody = document.getElementById('tablaAdminBalanceBody');
                if (!tbody) return;
                tbody.innerHTML = data.map(function(b) {
                    var name = users[b.user_id] || b.user_id;
                    return '<tr data-id="' + b.id + '" data-user="' + b.user_id + '" data-anio="' + b.anio + '">' +
                        '<td>' + name + '</td><td>' + b.anio + '</td>' +
                        '<td><input type="number" min="0" class="input-dias-asignados" value="' + (b.dias_asignados || 0) + '" style="width:80px;"></td>' +
                        '<td>' + (b.dias_solicitados || 0) + '</td>' +
                        '<td><button type="button" class="btn-ssepi btn-taller btn-guardar-balance"><i class="fas fa-save"></i> Guardar</button></td></tr>';
                }).join('');
                tbody.querySelectorAll('.btn-guardar-balance').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var row = btn.closest('tr');
                        var id = row.dataset.id;
                        var input = row.querySelector('.input-dias-asignados');
                        var val = parseInt(input.value, 10);
                        if (isNaN(val) || val < 0) return;
                        supabase().from('vacaciones_balance').update({ dias_asignados: val }).eq('id', id).then(function(res) {
                            if (res.error) alert('Error: ' + res.error.message);
                            else loadBalance();
                        });
                    });
                });
            });
        }).catch(function(e) {
            console.warn('[Vacaciones] Admin balances:', e);
        });
    }

    function bindEvents() {
        var btn = document.getElementById('btnSolicitar');
        if (btn) btn.addEventListener('click', enviarSolicitud);
        var prev = document.getElementById('calPrevMonth');
        if (prev) prev.addEventListener('click', function() {
            calendarMonth--;
            if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
            loadCalendar();
        });
        var next = document.getElementById('calNextMonth');
        if (next) next.addEventListener('click', function() {
            calendarMonth++;
            if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
            loadCalendar();
        });
        var toggleAnual = document.getElementById('calToggleAnual');
        if (toggleAnual) toggleAnual.addEventListener('click', openAnualView);
        var cerrarAnual = document.getElementById('calAnualCerrar');
        if (cerrarAnual) cerrarAnual.addEventListener('click', closeAnualView);
        var yearSelect = document.getElementById('calAnualYear');
        if (yearSelect) yearSelect.addEventListener('change', function() {
            var y = parseInt(this.value, 10);
            if (!isNaN(y)) loadOcupacionForYear(y).then(function() { renderYearView(y); });
        });
        var toggle = document.getElementById('toggleMenu');
        if (toggle) toggle.addEventListener('click', function() { document.body.classList.toggle('sidebar-closed'); });
        /* El botón de tema (#themeBtn) lo gestiona theme-clock.js; no duplicar aquí para que funcione. */
    }

    function startClock() {
        var el = document.getElementById('clock');
        if (el) {
            function tick() {
                var d = new Date();
                var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
                el.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            }
            tick();
            setInterval(tick, 1000);
        }
    }

    async function init() {
        var profile = await auth().getCurrentProfile();
        if (!profile || !profile.id) return;
        currentUserId = profile.id;
        bindEvents();
        startClock();
        await loadEmpleadosAndUsers();
        await loadFeriados();
        await loadBalance();
        await loadSolicitudes();
        await loadCalendar();
        var anualYearEl = document.getElementById('calAnualYear');
        if (anualYearEl) {
            var y = new Date().getFullYear();
            for (var i = y - 1; i <= y + 2; i++) {
                var opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                if (i === y) opt.selected = true;
                anualYearEl.appendChild(opt);
            }
        }
        await loadAdminBalances();
        document.body.classList.remove('nav-loading');
        document.body.classList.add('nav-ready');
    }

    window.vacacionesMod = { init: init };
})();
