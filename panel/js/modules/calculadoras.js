/**
 * calculadoras.js — Módulo Calculadoras (solo admin): funciones, costos, clientes, importar Excel, validar, analizar.
 * Filas editables: Editar / Guardar / Eliminar en modales.
 */
(function() {
    'use strict';

    function supabase() { return window.supabase; }
    function auth() { return window.authService; }

    var calculadorasList = [];
    var costosList = [];
    var clientesList = [];
    var excelDataPreview = null;
    /** @type {{ name: string, rows: any[][] }[]|null} */
    var excelSheetsPreview = null;
    var simAutoTarifas = [];
    var hojaFilasList = [];
    var bomList = [];
    var serviciosList = [];

    function loadCalculadoras() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('calculadoras').select('*').order('nombre').then(function(r) {
            if (r.error) throw r.error;
            calculadorasList = r.data || [];
            return calculadorasList;
        });
    }

    function loadCostos() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('calculadora_costos').select('*, calculadoras(nombre)').order('concepto').then(function(r) {
            if (r.error) throw r.error;
            costosList = r.data || [];
            return costosList;
        });
    }

    function loadClientes() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('calculadora_clientes').select('*, calculadoras(nombre)').order('cliente_nombre').then(function(r) {
            if (r.error) throw r.error;
            clientesList = r.data || [];
            return clientesList;
        });
    }

    function loadBOM() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('bom_automatizacion').select('*').order('item').then(function(r) {
            if (r.error) throw r.error;
            bomList = r.data || [];
            return bomList;
        });
    }

    function loadServicios() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('servicios_automatizacion').select('*').order('nombre').then(function(r) {
            if (r.error) throw r.error;
            serviciosList = r.data || [];
            return serviciosList;
        });
    }

    // Tabulador de clientes (viáticos) - carga desde clientes_tabulador
    var clientesTabulador = [];
    function loadClientesTabulador() {
        if (!supabase()) return Promise.resolve([]);
        return supabase().from('clientes_tabulador').select('*').order('nombre_cliente').then(function(r) {
            if (r.error) throw r.error;
            clientesTabulador = r.data || [];
            return clientesTabulador;
        });
    }

    function esc(s) {
        if (s == null || s === '') return '—';
        var t = String(s);
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderFunciones() {
        var tbody = document.getElementById('tablaFuncionesBody');
        if (!tbody) return;
        tbody.innerHTML = (calculadorasList.length === 0)
            ? '<tr><td colspan="5">No hay calculadoras registradas. Importa desde la plantilla Excel o crea una nueva.</td></tr>'
            : calculadorasList.map(function(c) {
                return '<tr><td>' + esc(c.nombre) + '</td><td>' + esc(c.tipo) + '</td><td>' + esc(c.funciones) + '</td><td>' + (c.activo ? 'Activa' : 'Inactiva') + '</td><td><button type="button" class="btn-ssepi btn-edit" data-calc-id="' + esc(c.id) + '"><i class="fas fa-edit"></i> Editar</button></td></tr>';
            }).join('');
        tbody.querySelectorAll('[data-calc-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalCalculadora(btn.getAttribute('data-calc-id')); });
        });
    }

    function renderCostos() {
        var tbody = document.getElementById('tablaCostosBody');
        if (!tbody) return;
        var calcByName = {};
        calculadorasList.forEach(function(c) { calcByName[c.id] = c.nombre; });
        tbody.innerHTML = (costosList.length === 0)
            ? '<tr><td colspan="5">No hay costos registrados.</td></tr>'
            : costosList.map(function(co) {
                var calcNombre = (co.calculadoras && co.calculadoras.nombre) || calcByName[co.calculadora_id] || '—';
                return '<tr><td>' + esc(calcNombre) + '</td><td>' + esc(co.concepto) + '</td><td>' + (co.costo != null ? Number(co.costo).toFixed(2) : '—') + '</td><td>' + esc(co.moneda || 'MXN') + '</td><td><button type="button" class="btn-ssepi btn-edit" data-costo-id="' + esc(co.id) + '"><i class="fas fa-edit"></i> Editar</button></td></tr>';
            }).join('');
        tbody.querySelectorAll('[data-costo-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalCosto(btn.getAttribute('data-costo-id')); });
        });
    }

    function renderClientes() {
        var tbody = document.getElementById('tablaClientesBody');
        if (!tbody) return;
        tbody.innerHTML = (clientesList.length === 0)
            ? '<tr><td colspan="4">No hay clientes vinculados.</td></tr>'
            : clientesList.map(function(cl) {
                var calcNombre = (cl.calculadoras && cl.calculadoras.nombre) || '—';
                return '<tr><td>' + esc(calcNombre) + '</td><td>' + esc(cl.cliente_nombre) + '</td><td>' + esc(cl.cliente_email) + '</td><td><button type="button" class="btn-ssepi btn-edit" data-cliente-id="' + esc(cl.id) + '"><i class="fas fa-edit"></i> Editar</button></td></tr>';
            }).join('');
        tbody.querySelectorAll('[data-cliente-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalCliente(btn.getAttribute('data-cliente-id')); });
        });
    }

    function fillSelectCalculadoras(selectId, selectedId) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = calculadorasList.map(function(c) {
            return '<option value="' + esc(c.id) + '"' + (selectedId === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>';
        }).join('');
    }

    function renderBOM() {
        var tbody = document.getElementById('tablaBOMBody');
        if (!tbody) return;

        if (!bomList || bomList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">No hay materiales registrados en el BOM</td></tr>';
            return;
        }

        tbody.innerHTML = bomList.map(function(m) {
            return '<tr>' +
                '<td>' + (m.item || '—') + '</td>' +
                '<td>' + esc(m.numero_parte || '—') + '</td>' +
                '<td>' + esc(m.descripcion || '—') + '</td>' +
                '<td>' + esc(m.categoria || '—') + '</td>' +
                '<td>' + esc(m.proveedor || '—') + '</td>' +
                '<td style="text-align: right;">$' + (m.precio_unitario != null ? Number(m.precio_unitario).toFixed(2) : '0.00') + '</td>' +
                '<td><span class="status-badge ' + (m.estado === 'Activo' ? 'status-success' : 'status-error') + '">' + esc(m.estado || 'Inactivo') + '</span></td>' +
                '<td><button type="button" class="btn-ssepi btn-edit" data-bom-id="' + esc(m.id) + '"><i class="fas fa-edit"></i> Editar</button></td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-bom-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalBOM(btn.getAttribute('data-bom-id')); });
        });

        updateBOMTotals();
    }

    function updateBOMTotals() {
        var totalMateriales = 0;
        var costoPlanta = 0;
        var costoOficina = 0;

        bomList.forEach(function(m) {
            if (m.estado === 'Activo' && m.precio_unitario) {
                var precio = Number(m.precio_unitario);
                totalMateriales += precio;
                // Desglose estimado: 70% planta, 30% oficina
                costoPlanta += precio * 0.7;
                costoOficina += precio * 0.3;
            }
        });

        var fmt = function(n) { return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

        var elTotalMat = document.getElementById('bomTotalMateriales');
        var elPlanta = document.getElementById('bomCostoPlanta');
        var elOficina = document.getElementById('bomCostoOficina');
        var elTotal = document.getElementById('bomCostoTotal');

        if (elTotalMat) elTotalMat.textContent = fmt(totalMateriales);
        if (elPlanta) elPlanta.textContent = fmt(costoPlanta);
        if (elOficina) elOficina.textContent = fmt(costoOficina);
        if (elTotal) elTotal.textContent = fmt(totalMateriales);
    }

    function renderServicios() {
        var tbody = document.getElementById('tablaServiciosBody');
        if (!tbody) return;

        if (!serviciosList || serviciosList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">No hay servicios registrados</td></tr>';
            return;
        }

        tbody.innerHTML = serviciosList.map(function(s) {
            var costoPlanta = s.costo_planta != null ? Number(s.costo_planta) : 0;
            var costoOficina = s.costo_oficina != null ? Number(s.costo_oficina) : 0;
            var costoTotal = costoPlanta + costoOficina;
            return '<tr>' +
                '<td>' + esc(s.nombre) + '</td>' +
                '<td>' + esc(s.area || '—') + '</td>' +
                '<td style="text-align: right;">$' + costoPlanta.toFixed(2) + '</td>' +
                '<td style="text-align: right;">$' + costoOficina.toFixed(2) + '</td>' +
                '<td style="text-align: right; font-weight: 600;">$' + costoTotal.toFixed(2) + '</td>' +
                '<td>' + (s.horas_estimadas != null ? s.horas_estimadas : '—') + '</td>' +
                '<td><span class="status-badge ' + (s.activo ? 'status-success' : 'status-error') + '">' + (s.activo ? 'Activo' : 'Inactivo') + '</span></td>' +
                '<td><button type="button" class="btn-ssepi btn-edit" data-servicio-id="' + esc(s.id) + '"><i class="fas fa-edit"></i> Editar</button></td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-servicio-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalServicio(btn.getAttribute('data-servicio-id')); });
        });
    }

    // Renderizar tablas de viáticos (t1-t5)
    function renderTabuladorViaticos() {
        // t1: Taller Electrónica
        renderTablaViatico('tablaViaticoT1Body', clientesTabulador, 'taller');
        // t2: Laboratorio
        renderTablaViatico('tablaViaticoT2Body', clientesTabulador, 'laboratorio');
        // t3: Motores
        renderTablaViatico('tablaViaticoT3Body', clientesTabulador, 'motores');
        // t4: Automatización
        renderTablaViatico('tablaViaticoT4Body', clientesTabulador, 'automatizacion');
        // t5: Suministros
        renderTablaViatico('tablaViaticoT5Body', clientesTabulador, 'suministros');
    }

    function renderTablaViatico(tbodyId, clientes, tipo) {
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        if (!clientes || clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">No hay datos - Ejecuta migración de clientes_tabulador</td></tr>';
            return;
        }

        tbody.innerHTML = clientes.map(function(c) {
            var km = Number(c.km) || 0;
            var horas = Number(c.horas_viaje) || 0;

            // Usar CostosEngine para cálculos consistentes
            var litros = window.CostosEngine ? window.CostosEngine.calcularLitros(km) : (km > 0 ? km / 9.5 : 0);
            var costoGasolina = window.CostosEngine ? window.CostosEngine.calcularCostoGasolina(km) : (litros * 24.50);
            var costoTecnico = window.CostosEngine ? window.CostosEngine.calcularCostoTrasladoTecnico(horas) : (horas * 104.16);
            var total = costoGasolina + costoTecnico;

            return '<tr>' +
                '<td>' + esc(c.nombre_cliente) + '</td>' +
                '<td style="text-align: right;">' + km.toFixed(1) + '</td>' +
                '<td style="text-align: right;">' + (km * 2).toFixed(2) + '</td>' +
                '<td style="text-align: right;">' + litros.toFixed(2) + '</td>' +
                '<td style="text-align: right;">$' + (window.CostosEngine ? window.CostosEngine.CONFIG.gasolina.toFixed(2) : '24.50') + '</td>' +
                '<td style="text-align: right;">$' + costoGasolina.toFixed(2) + '</td>' +
                '<td style="text-align: right;">' + horas.toFixed(0) + '</td>' +
                '<td style="text-align: right;">$' + costoTecnico.toFixed(2) + '</td>' +
                '<td style="text-align: right; font-weight: bold;">$' + total.toFixed(2) + '</td>' +
                '</tr>';
        }).join('');
    }

    // Renderizar tabla de clientes del tabulador (para gestión)
    function renderClientesTabuladorTabla() {
        var tbody = document.getElementById('tablaClientesTabuladorBody');
        if (!tbody) return;

        if (!clientesTabulador || clientesTabulador.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No hay clientes en el tabulador</td></tr>';
            return;
        }

        tbody.innerHTML = clientesTabulador.map(function(c) {
            return '<tr>' +
                '<td>' + esc(c.nombre_cliente) + '</td>' +
                '<td style="text-align: right;">' + (c.km || 0).toFixed(1) + '</td>' +
                '<td style="text-align: right;">' + (c.horas_viaje || 0).toFixed(0) + '</td>' +
                '<td style="text-align: right;">$' + (window.CostosEngine ? window.CostosEngine.calcularCostoGasolina(c.km).toFixed(2) : '0.00') + '</td>' +
                '<td style="text-align: right;">$' + (window.CostosEngine ? window.CostosEngine.calcularCostoTrasladoTecnico(c.horas_viaje).toFixed(2) : '0.00') + '</td>' +
                '<td style="text-align: right; font-weight: bold;">$' + ((window.CostosEngine ? window.CostosEngine.calcularCostoGasolina(c.km) : 0) + (window.CostosEngine ? window.CostosEngine.calcularCostoTrasladoTecnico(c.horas_viaje) : 0)).toFixed(2) + '</td>' +
                '<td><button type="button" class="btn-ssepi btn-edit" data-tabulador-id="' + esc(c.id) + '"><i class="fas fa-edit"></i> Editar</button></td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-tabulador-id]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                openModalTabuladorCliente(btn.getAttribute('data-tabulador-id'));
            });
        });
    }

    function fillBOMFiltros() {
        var sel = document.getElementById('bomFiltroCategoria');
        if (!sel) return;

        var categorias = {};
        bomList.forEach(function(m) {
            if (m.categoria) categorias[m.categoria] = true;
        });

        var current = sel.value;
        sel.innerHTML = '<option value="">Todas</option>' +
            Object.keys(categorias).sort().map(function(c) {
                return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
            }).join('');

        if (current && categorias[current]) sel.value = current;
    }

    function applyBOMFiltros() {
        var catFilter = document.getElementById('bomFiltroCategoria') ? document.getElementById('bomFiltroCategoria').value : '';
        var estFilter = document.getElementById('bomFiltroEstado') ? document.getElementById('bomFiltroEstado').value : '';

        var filtered = bomList.filter(function(m) {
            var matchCat = !catFilter || m.categoria === catFilter;
            var matchEst = !estFilter || m.estado === estFilter;
            return matchCat && matchEst;
        });

        var tbody = document.getElementById('tablaBOMBody');
        if (!tbody) return;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">No hay materiales con estos filtros</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(function(m) {
            return '<tr>' +
                '<td>' + (m.item || '—') + '</td>' +
                '<td>' + esc(m.numero_parte || '—') + '</td>' +
                '<td>' + esc(m.descripcion || '—') + '</td>' +
                '<td>' + esc(m.categoria || '—') + '</td>' +
                '<td>' + esc(m.proveedor || '—') + '</td>' +
                '<td style="text-align: right;">$' + (m.precio_unitario != null ? Number(m.precio_unitario).toFixed(2) : '0.00') + '</td>' +
                '<td><span class="status-badge ' + (m.estado === 'Activo' ? 'status-success' : 'status-error') + '">' + esc(m.estado || 'Inactivo') + '</span></td>' +
                '<td><button type="button" class="btn-ssepi btn-edit" data-bom-id="' + esc(m.id) + '"><i class="fas fa-edit"></i> Editar</button></td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('[data-bom-id]').forEach(function(btn) {
            btn.addEventListener('click', function() { openModalBOM(btn.getAttribute('data-bom-id')); });
        });
    }

    function fillHojaCalcSelect() {
        var sel = document.getElementById('hojaCalcSelect');
        if (!sel) return;
        var prev = sel.value;
        sel.innerHTML = calculadorasList.map(function(c) {
            return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>';
        }).join('');
        if (prev && calculadorasList.some(function(c) { return c.id === prev; })) sel.value = prev;
    }

    function loadHojaFilas() {
        var cid = document.getElementById('hojaCalcSelect') && document.getElementById('hojaCalcSelect').value;
        if (!cid || !supabase()) {
            hojaFilasList = [];
            renderHojaTable();
            return Promise.resolve();
        }
        return supabase().from('calculadora_hoja_filas').select('*').eq('calculadora_id', cid).order('fila_orden', { ascending: true }).then(function(r) {
            if (r.error) {
                hojaFilasList = [];
                renderHojaTable();
                return;
            }
            hojaFilasList = r.data || [];
            renderHojaTable();
        });
    }

    function renderHojaTable() {
        var tbody = document.getElementById('tablaHojaExcelBody');
        if (!tbody) return;
        if (!calculadorasList.length) {
            tbody.innerHTML = '<tr><td colspan="6">Crea primero una calculadora.</td></tr>';
            return;
        }
        if (!hojaFilasList.length) {
            tbody.innerHTML = '<tr><td colspan="6">Sin filas. Pulsa «Nueva fila» o importa un Excel con columnas concepto / fórmula / valor.</td></tr>';
            return;
        }
        tbody.innerHTML = hojaFilasList.map(function(row, i) {
            var vid = esc(row.id);
            var vconc = esc(row.concepto || '');
            var vform = esc(row.formula_text || '');
            var vval = row.valor != null && row.valor !== '' ? esc(String(row.valor)) : '';
            var chk = row.solo_valor ? ' checked' : '';
            return '<tr data-hoja-id="' + vid + '"><td>' + (i + 1) + '</td><td><input type="text" class="form-control hoja-inp-conc" value="' + vconc + '"></td>' +
                '<td><input type="text" class="form-control hoja-inp-form" value="' + vform + '"></td>' +
                '<td><input type="number" step="any" class="form-control hoja-inp-val" value="' + vval + '"></td>' +
                '<td style="text-align:center"><input type="checkbox" class="hoja-inp-solo"' + chk + '></td>' +
                '<td><button type="button" class="btn-ssepi btn-edit hoja-btn-save"><i class="fas fa-save"></i></button> ' +
                '<button type="button" class="btn-ssepi btn-danger hoja-btn-del"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
        tbody.querySelectorAll('.hoja-btn-save').forEach(function(btn) {
            btn.addEventListener('click', function() { saveHojaRowFromTr(btn.closest('tr')); });
        });
        tbody.querySelectorAll('.hoja-btn-del').forEach(function(btn) {
            btn.addEventListener('click', function() { deleteHojaRowFromTr(btn.closest('tr')); });
        });
    }

    function nextHojaOrden() {
        var m = 0;
        hojaFilasList.forEach(function(r) {
            var o = parseInt(r.fila_orden, 10);
            if (!isNaN(o) && o > m) m = o;
        });
        return m + 1;
    }

    function saveHojaRowFromTr(tr) {
        if (!tr || !supabase()) return;
        var id = tr.getAttribute('data-hoja-id');
        var cid = document.getElementById('hojaCalcSelect').value;
        var conc = tr.querySelector('.hoja-inp-conc') && tr.querySelector('.hoja-inp-conc').value.trim();
        var form = tr.querySelector('.hoja-inp-form') && tr.querySelector('.hoja-inp-form').value.trim();
        var valInp = tr.querySelector('.hoja-inp-val');
        var valRaw = valInp && valInp.value !== '' ? parseFloat(valInp.value) : null;
        var solo = tr.querySelector('.hoja-inp-solo') && tr.querySelector('.hoja-inp-solo').checked;
        var payload = {
            calculadora_id: cid,
            concepto: conc || null,
            formula_text: form || null,
            valor: valRaw != null && !isNaN(valRaw) ? valRaw : null,
            solo_valor: solo,
            updated_at: new Date().toISOString()
        };
        var prom;
        if (id && id !== 'new') {
            prom = supabase().from('calculadora_hoja_filas').update(payload).eq('id', id);
        } else {
            payload.fila_orden = nextHojaOrden();
            delete payload.updated_at;
            prom = supabase().from('calculadora_hoja_filas').insert(payload);
        }
        prom.then(function(r) {
            if (r.error) throw r.error;
            return loadHojaFilas();
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function deleteHojaRowFromTr(tr) {
        if (!tr || !supabase()) return;
        var id = tr.getAttribute('data-hoja-id');
        if (!id || id === 'new') {
            tr.remove();
            var tbody = document.getElementById('tablaHojaExcelBody');
            if (tbody && !tbody.querySelector('tr')) loadHojaFilas();
            return;
        }
        if (!confirm('¿Eliminar esta fila?')) return;
        supabase().from('calculadora_hoja_filas').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            return loadHojaFilas();
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function appendEmptyHojaRow() {
        var tbody = document.getElementById('tablaHojaExcelBody');
        if (!tbody) return;
        var first = tbody.querySelector('tr[data-hoja-id]');
        if (first && first.getAttribute('data-hoja-id') === 'new') {
            alert('Ya hay una fila nueva sin guardar.');
            return;
        }
        if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
        var tr = document.createElement('tr');
        tr.setAttribute('data-hoja-id', 'new');
        tr.innerHTML = '<td>—</td><td><input type="text" class="form-control hoja-inp-conc"></td>' +
            '<td><input type="text" class="form-control hoja-inp-form"></td>' +
            '<td><input type="number" step="any" class="form-control hoja-inp-val"></td>' +
            '<td style="text-align:center"><input type="checkbox" class="hoja-inp-solo"></td>' +
            '<td><button type="button" class="btn-ssepi btn-edit hoja-btn-save"><i class="fas fa-save"></i></button> ' +
            '<button type="button" class="btn-ssepi btn-danger hoja-btn-del"><i class="fas fa-trash"></i></button></td>';
        tbody.appendChild(tr);
        tr.querySelector('.hoja-btn-save').addEventListener('click', function() { saveHojaRowFromTr(tr); });
        tr.querySelector('.hoja-btn-del').addEventListener('click', function() { deleteHojaRowFromTr(tr); });
    }

    function normHeaderCell(h) {
        return String(h == null ? '' : h).toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /** Detecta columnas tipo hoja Excel (concepto, fórmula, valor) con criterios flexibles. */
    function detectHojaIndices(headers) {
        function firstMatch(hdrs, predicates) {
            for (var i = 0; i < hdrs.length; i++) {
                var s = normHeaderCell(hdrs[i]);
                for (var p = 0; p < predicates.length; p++) {
                    if (predicates[p](s)) return i;
                }
            }
            return -1;
        }
        var concI = firstMatch(headers, [
            function(s) { return /^(concepto|descripción|descripcion|rubro|servicio|producto|ítem|item|clave)$/i.test(s); },
            function(s) { return /\bconcepto\b/.test(s) && !/\bcosto\s+de\s+concepto\b/i.test(s); }
        ]);
        var formI = firstMatch(headers, [
            function(s) { return /\bf[oó]rmula\b/.test(s) || /^expr/i.test(s) || /\breferencia\b/.test(s) || /^fmla$/i.test(s); }
        ]);
        var valI = firstMatch(headers, [
            function(s) { return /^(valor|value|importe|monto|total)$/i.test(s); },
            function(s) { return /\b(valor|importe|monto)\b/.test(s) && !/\bunitario\b/.test(s); },
            function(s) { return /^(costo|precio)$/i.test(s); }
        ]);
        var ok = (concI >= 0 && (formI >= 0 || valI >= 0)) || (formI >= 0 && valI >= 0);
        return { concI: concI, formI: formI, valI: valI, ok: ok };
    }

    /**
     * Inserta filas de una o varias hojas en calculadora_hoja_filas (mismo calculadora_id, fila_orden continua).
     * @returns {Promise<{ n: number, sheets: number }>}
     */
    function importHojasMultiSheets(sheetList, calculadoraId) {
        if (!calculadoraId || !supabase()) return Promise.resolve({ n: 0, sheets: 0 });
        var list = sheetList || [];
        return supabase().from('calculadora_hoja_filas').select('fila_orden').eq('calculadora_id', calculadoraId).order('fila_orden', { ascending: false }).limit(1).maybeSingle().then(function(ordRes) {
            if (ordRes.error) throw ordRes.error;
            var orden = 1;
            if (ordRes.data && ordRes.data.fila_orden != null && !isNaN(parseInt(ordRes.data.fila_orden, 10))) {
                orden = parseInt(ordRes.data.fila_orden, 10) + 1;
            }
            var inserts = [];
            var sheetsHit = 0;
            list.forEach(function(sheet) {
                if (!sheet || !sheet.rows || sheet.rows.length < 2) return;
                var headers = sheet.rows[0] || [];
                var idx = detectHojaIndices(headers);
                if (!idx.ok) return;
                sheetsHit++;
                var body = sheet.rows.slice(1).filter(function(row) {
                    return row.some(function(c) { return c != null && String(c).trim() !== ''; });
                });
                body.forEach(function(row) {
                    var c = idx.concI >= 0 && row[idx.concI] != null ? String(row[idx.concI]).trim() : '';
                    var f = idx.formI >= 0 && row[idx.formI] != null ? String(row[idx.formI]).trim() : '';
                    var v = idx.valI >= 0 && row[idx.valI] != null && row[idx.valI] !== '' ? parseFloat(row[idx.valI]) : null;
                    if (!c && !f && (v == null || isNaN(v))) return;
                    inserts.push({
                        calculadora_id: calculadoraId,
                        fila_orden: orden++,
                        concepto: c || null,
                        formula_text: f || null,
                        valor: v != null && !isNaN(v) ? v : null,
                        solo_valor: false
                    });
                });
            });
            if (!inserts.length) return { n: 0, sheets: sheetsHit };
            return supabase().from('calculadora_hoja_filas').insert(inserts).then(function(r) {
                if (r.error) throw r.error;
                return { n: inserts.length, sheets: sheetsHit };
            });
        });
    }

    function renderImportPreviewHtml() {
        var preview = document.getElementById('importPreview');
        if (!preview || !excelDataPreview) return;
        var rows = (excelDataPreview || []).slice(0, 6);
        var html = '<p class="form-hint">Vista previa (primeras filas de la hoja seleccionada):</p><table class="lista-table"><tbody>';
        rows.forEach(function(row) {
            html += '<tr>' + (row.map(function(cell) { return '<td>' + (cell != null ? String(cell).substring(0, 50) : '') + '</td>'; }).join('')) + '</tr>';
        });
        html += '</tbody></table><p class="form-hint">Filas en esta hoja: ' + (excelDataPreview.length || 0) + '. Haz clic en «Agregar / Actualizar» para procesar.</p>';
        preview.innerHTML = html;
    }

    // --- Modal Calculadora ---
    function openModalCalculadora(id) {
        var title = document.getElementById('modalCalcTitle');
        var modal = document.getElementById('modalCalc');
        var idInp = document.getElementById('modalCalcId');
        var nombre = document.getElementById('modalCalcNombre');
        var tipo = document.getElementById('modalCalcTipo');
        var funciones = document.getElementById('modalCalcFunciones');
        var activo = document.getElementById('modalCalcActivo');
        var delBtn = document.getElementById('modalCalcEliminar');
        if (!modal || !idInp) return;
        if (id) {
            var c = calculadorasList.find(function(x) { return x.id === id; });
            if (!c) return;
            title.textContent = 'Editar calculadora';
            idInp.value = c.id;
            nombre.value = c.nombre || '';
            tipo.value = c.tipo || '';
            funciones.value = c.funciones || '';
            activo.checked = c.activo !== false;
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Nueva calculadora';
            idInp.value = '';
            nombre.value = '';
            tipo.value = '';
            funciones.value = '';
            activo.checked = true;
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
    function saveModalCalculadora() {
        var idInp = document.getElementById('modalCalcId');
        var nombre = document.getElementById('modalCalcNombre');
        var tipo = document.getElementById('modalCalcTipo');
        var funciones = document.getElementById('modalCalcFunciones');
        var activo = document.getElementById('modalCalcActivo');
        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var nom = (nombre && nombre.value) ? nombre.value.trim() : '';
        if (!nom) { alert('El nombre es obligatorio.'); return; }
        var payload = { nombre: nom, tipo: tipo ? tipo.value.trim() || null : null, funciones: funciones ? funciones.value.trim() || null : null, activo: activo ? activo.checked : true, updated_at: new Date().toISOString() };
        var prom;
        if (id) {
            prom = supabase().from('calculadoras').update(payload).eq('id', id);
        } else {
            payload.config_json = {};
            delete payload.updated_at;
            prom = supabase().from('calculadoras').insert(payload);
        }
        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalCalculadora();
            loadCalculadoras().then(function() { renderFunciones(); fillSelectCalculadoras('modalCostoCalculadora'); fillSelectCalculadoras('modalClienteCalculadora'); updateAnalisis(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function deleteModalCalculadora() {
        var idInp = document.getElementById('modalCalcId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar esta calculadora? Se eliminarán también sus costos y clientes vinculados.')) return;
        supabase().from('calculadoras').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalCalculadora();
            loadCalculadoras();
            loadCostos();
            loadClientes();
            renderFunciones();
            renderCostos();
            renderClientes();
            fillSelectCalculadoras('modalCostoCalculadora');
            fillSelectCalculadoras('modalClienteCalculadora');
            updateAnalisis();
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function closeModalCalculadora() {
        var modal = document.getElementById('modalCalc');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    // --- Modal Costo ---
    function openModalCosto(id) {
        var title = document.getElementById('modalCostoTitle');
        var modal = document.getElementById('modalCosto');
        var idInp = document.getElementById('modalCostoId');
        var concepto = document.getElementById('modalCostoConcepto');
        var costo = document.getElementById('modalCostoCosto');
        var moneda = document.getElementById('modalCostoMoneda');
        var delBtn = document.getElementById('modalCostoEliminar');
        if (!modal || !idInp) return;
        fillSelectCalculadoras('modalCostoCalculadora', null);
        if (id) {
            var co = costosList.find(function(x) { return x.id === id; });
            if (!co) return;
            title.textContent = 'Editar costo';
            idInp.value = co.id;
            fillSelectCalculadoras('modalCostoCalculadora', co.calculadora_id);
            concepto.value = co.concepto || '';
            costo.value = co.costo != null ? co.costo : '';
            moneda.value = co.moneda || 'MXN';
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Nuevo costo';
            idInp.value = '';
            if (calculadorasList.length) fillSelectCalculadoras('modalCostoCalculadora', calculadorasList[0].id);
            concepto.value = '';
            costo.value = '';
            moneda.value = 'MXN';
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
    function saveModalCosto() {
        var idInp = document.getElementById('modalCostoId');
        var calcSel = document.getElementById('modalCostoCalculadora');
        var concepto = document.getElementById('modalCostoConcepto');
        var costo = document.getElementById('modalCostoCosto');
        var moneda = document.getElementById('modalCostoMoneda');
        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var calcId = calcSel && calcSel.value ? calcSel.value : (calculadorasList[0] && calculadorasList[0].id);
        var conc = (concepto && concepto.value) ? concepto.value.trim() : '';
        var costVal = (costo && costo.value) ? parseFloat(costo.value) : 0;
        if (!conc) { alert('El concepto es obligatorio.'); return; }
        if (isNaN(costVal)) costVal = 0;
        var payload = { calculadora_id: calcId, concepto: conc, costo: costVal, moneda: (moneda && moneda.value) ? moneda.value.trim() : 'MXN', updated_at: new Date().toISOString() };
        var prom;
        if (id) {
            prom = supabase().from('calculadora_costos').update(payload).eq('id', id);
        } else {
            delete payload.updated_at;
            prom = supabase().from('calculadora_costos').insert(payload);
        }
        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalCosto();
            loadCostos().then(function() { renderCostos(); updateAnalisis(); renderSimAutoTable(); syncAutoGasDefault(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function deleteModalCosto() {
        var idInp = document.getElementById('modalCostoId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar este costo?')) return;
        supabase().from('calculadora_costos').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalCosto();
            loadCostos().then(function() { renderCostos(); updateAnalisis(); renderSimAutoTable(); syncAutoGasDefault(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function closeModalCosto() {
        var modal = document.getElementById('modalCosto');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    // --- Modal Cliente (calculadora_clientes) ---
    function openModalCliente(id) {
        var title = document.getElementById('modalClienteTitle');
        var modal = document.getElementById('modalCliente');
        var idInp = document.getElementById('modalClienteId');
        var nombre = document.getElementById('modalClienteNombre');
        var email = document.getElementById('modalClienteEmail');
        var delBtn = document.getElementById('modalClienteEliminar');
        if (!modal || !idInp) return;
        fillSelectCalculadoras('modalClienteCalculadora', null);
        if (id) {
            var cl = clientesList.find(function(x) { return x.id === id; });
            if (!cl) return;
            title.textContent = 'Editar cliente';
            idInp.value = cl.id;
            fillSelectCalculadoras('modalClienteCalculadora', cl.calculadora_id);
            nombre.value = cl.cliente_nombre || '';
            email.value = cl.cliente_email || '';
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Nuevo cliente';
            idInp.value = '';
            if (calculadorasList.length) fillSelectCalculadoras('modalClienteCalculadora', calculadorasList[0].id);
            nombre.value = '';
            email.value = '';
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    // --- Modal Tabulador Cliente (clientes_tabulador) ---
    function openModalTabuladorCliente(id) {
        var title = document.getElementById('modalTabuladorTitle');
        var modal = document.getElementById('modalTabuladorCliente');
        var idInp = document.getElementById('modalTabuladorId');
        var nombre = document.getElementById('modalTabuladorNombre');
        var kmInput = document.getElementById('modalTabuladorKm');
        var horasInput = document.getElementById('modalTabuladorHoras');
        var preview = document.getElementById('tabuladorPreview');
        var delBtn = document.getElementById('modalTabuladorEliminar');

        if (!modal || !idInp) return;

        if (id) {
            var cl = clientesTabulador.find(function(x) { return x.id === id; });
            if (!cl) return;
            title.textContent = 'Editar cliente en tabulador';
            idInp.value = cl.id;
            nombre.value = cl.nombre_cliente || '';
            kmInput.value = cl.km || '';
            horasInput.value = cl.horas_viaje || '';
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Agregar cliente al tabulador';
            idInp.value = '';
            nombre.value = '';
            kmInput.value = '';
            horasInput.value = '';
            delBtn.style.display = 'none';
        }

        // Actualizar preview de cálculos
        if (preview) {
            preview.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Ingresa KM para ver cálculos automáticos</p>';
        }

        // Event listener para cálculos en tiempo real
        if (kmInput) {
            kmInput.addEventListener('input', function() {
                actualizarPreviewTabulador(kmInput, horasInput, preview);
            });
        }
        if (horasInput) {
            horasInput.addEventListener('input', function() {
                actualizarPreviewTabulador(kmInput, horasInput, preview);
            });
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    function actualizarPreviewTabulador(kmInput, horasInput, previewEl) {
        if (!previewEl || !window.CostosEngine) return;

        var km = Number(kmInput.value) || 0;
        var horas = Number(horasInput.value) || 0;

        var litros = window.CostosEngine.calcularLitros(km);
        var costoGasolina = window.CostosEngine.calcularCostoGasolina(km);
        var costoTecnico = window.CostosEngine.calcularCostoTrasladoTecnico(horas);
        var total = costoGasolina + costoTecnico;

        previewEl.innerHTML = '<div style="background: var(--bg-subtle); padding: 12px; border-radius: 8px; font-size: 13px;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">' +
            '<div><strong>KM:</strong> ' + km.toFixed(1) + ' km</div>' +
            '<div><strong>×2:</strong> ' + (km * 2).toFixed(2) + ' km (ida y vuelta)</div>' +
            '<div><strong>Litros:</strong> ' + litros.toFixed(2) + ' L</div>' +
            '<div><strong>$ Gasolina:</strong> $' + costoGasolina.toFixed(2) + '</div>' +
            '<div><strong>Hrs viaje:</strong> ' + horas.toFixed(0) + ' hrs</div>' +
            '<div><strong>$ Técnico:</strong> $' + costoTecnico.toFixed(2) + '</div>' +
            '<div style="grid-column: span 2; text-align: right; font-weight: bold; font-size: 15px; color: var(--c-ventas);"><strong>TOTAL VIÁTICO:</strong> $' + total.toFixed(2) + '</div>' +
            '</div></div>';
    }

    function saveModalTabuladorCliente() {
        var idInp = document.getElementById('modalTabuladorId');
        var nombre = document.getElementById('modalTabuladorNombre');
        var kmInput = document.getElementById('modalTabuladorKm');
        var horasInput = document.getElementById('modalTabuladorHoras');

        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var nom = (nombre && nombre.value) ? nombre.value.trim() : '';
        var km = Number(kmInput && kmInput.value ? kmInput.value : 0);
        var horas = Number(horasInput && horasInput.value ? horasInput.value : 0);

        if (!nom) { alert('El nombre del cliente es obligatorio.'); return; }

        var payload = {
            nombre_cliente: nom,
            km: km,
            horas_viaje: horas,
            actualizado_en: new Date().toISOString()
        };

        var prom;
        if (id) {
            prom = supabase().from('clientes_tabulador').update(payload).eq('id', id);
        } else {
            delete payload.actualizado_en;
            prom = supabase().from('clientes_tabulador').insert(payload);
        }

        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalTabuladorCliente();
            loadClientesTabulador().then(function() {
                renderTabuladorViaticos();
                renderClientesTabuladorTabla();
            });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function deleteModalTabuladorCliente() {
        var idInp = document.getElementById('modalTabuladorId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar este cliente del tabulador?')) return;

        supabase().from('clientes_tabulador').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalTabuladorCliente();
            loadClientesTabulador().then(function() {
                renderTabuladorViaticos();
                renderClientesTabuladorTabla();
            });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function closeModalTabuladorCliente() {
        var modal = document.getElementById('modalTabuladorCliente');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }
    function saveModalCliente() {
        var idInp = document.getElementById('modalClienteId');
        var calcSel = document.getElementById('modalClienteCalculadora');
        var nombre = document.getElementById('modalClienteNombre');
        var email = document.getElementById('modalClienteEmail');
        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var calcId = calcSel && calcSel.value ? calcSel.value : (calculadorasList[0] && calculadorasList[0].id);
        var nom = (nombre && nombre.value) ? nombre.value.trim() : '';
        if (!nom) { alert('El nombre del cliente es obligatorio.'); return; }
        var payload = { calculadora_id: calcId, cliente_nombre: nom, cliente_email: (email && email.value) ? email.value.trim() : null, updated_at: new Date().toISOString() };
        var prom;
        if (id) {
            prom = supabase().from('calculadora_clientes').update(payload).eq('id', id);
        } else {
            delete payload.updated_at;
            payload.datos_json = {};
            prom = supabase().from('calculadora_clientes').insert(payload);
        }
        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalCliente();
            loadClientes().then(function() { renderClientes(); updateAnalisis(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function deleteModalCliente() {
        var idInp = document.getElementById('modalClienteId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar este cliente?')) return;
        supabase().from('calculadora_clientes').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalCliente();
            loadClientes().then(function() { renderClientes(); updateAnalisis(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }
    function closeModalCliente() {
        var modal = document.getElementById('modalCliente');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    // --- Modal BOM ---
    function openModalBOM(id) {
        var title = document.getElementById('modalBOMTitle');
        var modal = document.getElementById('modalBOM');
        var idInp = document.getElementById('modalBOMId');
        var item = document.getElementById('modalBOMItem');
        var numeroParte = document.getElementById('modalBOMNumeroParte');
        var descripcion = document.getElementById('modalBOMDescripcion');
        var categoria = document.getElementById('modalBOMCategoria');
        var proveedor = document.getElementById('modalBOMProveedor');
        var precio = document.getElementById('modalBOMPrecio');
        var moneda = document.getElementById('modalBOMMoneda');
        var estado = document.getElementById('modalBOMEstado');
        var link = document.getElementById('modalBOMLink');
        var delBtn = document.getElementById('modalBOMEliminar');

        if (!modal || !idInp) return;

        if (id) {
            var m = bomList.find(function(x) { return x.id === id; });
            if (!m) return;
            title.textContent = 'Editar material BOM';
            idInp.value = m.id;
            item.value = m.item || '';
            numeroParte.value = m.numero_parte || '';
            descripcion.value = m.descripcion || '';
            categoria.value = m.categoria || '';
            proveedor.value = m.proveedor || '';
            precio.value = m.precio_unitario != null ? m.precio_unitario : '';
            moneda.value = m.moneda || 'MXN';
            estado.value = m.estado || 'Activo';
            link.value = m.link || '';
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Nuevo material BOM';
            idInp.value = '';
            item.value = bomList.length > 0 ? Math.max.apply(null, bomList.map(function(x) { return x.item || 0; })) + 1 : 1;
            numeroParte.value = '';
            descripcion.value = '';
            categoria.value = '';
            proveedor.value = '';
            precio.value = '';
            moneda.value = 'MXN';
            estado.value = 'Activo';
            link.value = '';
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    function saveModalBOM() {
        var idInp = document.getElementById('modalBOMId');
        var item = document.getElementById('modalBOMItem');
        var numeroParte = document.getElementById('modalBOMNumeroParte');
        var descripcion = document.getElementById('modalBOMDescripcion');
        var categoria = document.getElementById('modalBOMCategoria');
        var proveedor = document.getElementById('modalBOMProveedor');
        var precio = document.getElementById('modalBOMPrecio');
        var moneda = document.getElementById('modalBOMMoneda');
        var estado = document.getElementById('modalBOMEstado');
        var link = document.getElementById('modalBOMLink');

        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var payload = {
            item: item && item.value ? parseInt(item.value, 10) : null,
            numero_parte: numeroParte && numeroParte.value ? numeroParte.value.trim() : null,
            descripcion: descripcion && descripcion.value ? descripcion.value.trim() : null,
            categoria: categoria && categoria.value ? categoria.value.trim() : null,
            proveedor: proveedor && proveedor.value ? proveedor.value.trim() : null,
            precio_unitario: precio && precio.value ? parseFloat(precio.value) : 0,
            moneda: moneda && moneda.value ? moneda.value.trim() : 'MXN',
            estado: estado && estado.value ? estado.value.trim() : 'Activo',
            link: link && link.value ? link.value.trim() : null,
            updated_at: new Date().toISOString()
        };

        if (!payload.descripcion) { alert('La descripción es obligatoria.'); return; }

        var prom;
        if (id) {
            prom = supabase().from('bom_automatizacion').update(payload).eq('id', id);
        } else {
            delete payload.updated_at;
            prom = supabase().from('bom_automatizacion').insert(payload);
        }

        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalBOM();
            loadBOM().then(function() { renderBOM(); fillBOMFiltros(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function deleteModalBOM() {
        var idInp = document.getElementById('modalBOMId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar este material del BOM?')) return;

        supabase().from('bom_automatizacion').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalBOM();
            loadBOM().then(function() { renderBOM(); fillBOMFiltros(); });
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function closeModalBOM() {
        var modal = document.getElementById('modalBOM');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    // --- Modal Servicio ---
    function openModalServicio(id) {
        var title = document.getElementById('modalServicioTitle');
        var modal = document.getElementById('modalServicio');
        var idInp = document.getElementById('modalServicioId');
        var nombre = document.getElementById('modalServicioNombre');
        var descripcion = document.getElementById('modalServicioDescripcion');
        var area = document.getElementById('modalServicioArea');
        var tipo = document.getElementById('modalServicioTipo');
        var costoPlanta = document.getElementById('modalServicioCostoPlanta');
        var costoOficina = document.getElementById('modalServicioCostoOficina');
        var horas = document.getElementById('modalServicioHoras');
        var activo = document.getElementById('modalServicioActivo');
        var delBtn = document.getElementById('modalServicioEliminar');

        if (!modal || !idInp) return;

        if (id) {
            var s = serviciosList.find(function(x) { return x.id === id; });
            if (!s) return;
            title.textContent = 'Editar servicio';
            idInp.value = s.id;
            nombre.value = s.nombre || '';
            descripcion.value = s.descripcion || '';
            area.value = s.area || '';
            tipo.value = s.tipo || '';
            costoPlanta.value = s.costo_planta != null ? s.costo_planta : '';
            costoOficina.value = s.costo_oficina != null ? s.costo_oficina : '';
            horas.value = s.horas_estimadas != null ? s.horas_estimadas : '';
            activo.checked = s.activo !== false;
            delBtn.style.display = 'inline-flex';
        } else {
            title.textContent = 'Nuevo servicio';
            idInp.value = '';
            nombre.value = '';
            descripcion.value = '';
            area.value = '';
            tipo.value = '';
            costoPlanta.value = '';
            costoOficina.value = '';
            horas.value = '';
            activo.checked = true;
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    function saveModalServicio() {
        var idInp = document.getElementById('modalServicioId');
        var nombre = document.getElementById('modalServicioNombre');
        var descripcion = document.getElementById('modalServicioDescripcion');
        var area = document.getElementById('modalServicioArea');
        var tipo = document.getElementById('modalServicioTipo');
        var costoPlanta = document.getElementById('modalServicioCostoPlanta');
        var costoOficina = document.getElementById('modalServicioCostoOficina');
        var horas = document.getElementById('modalServicioHoras');
        var activo = document.getElementById('modalServicioActivo');

        var id = (idInp && idInp.value) ? idInp.value.trim() : '';
        var payload = {
            nombre: nombre && nombre.value ? nombre.value.trim() : '',
            descripcion: descripcion && descripcion.value ? descripcion.value.trim() : '',
            area: area && area.value ? area.value.trim() : null,
            tipo: tipo && tipo.value ? tipo.value.trim() : null,
            costo_planta: costoPlanta && costoPlanta.value ? parseFloat(costoPlanta.value) : 0,
            costo_oficina: costoOficina && costoOficina.value ? parseFloat(costoOficina.value) : 0,
            horas_estimadas: horas && horas.value ? parseFloat(horas.value) : 0,
            activo: activo ? activo.checked : true,
            updated_at: new Date().toISOString()
        };

        if (!payload.nombre) { alert('El nombre del servicio es obligatorio.'); return; }

        var prom;
        if (id) {
            prom = supabase().from('servicios_automatizacion').update(payload).eq('id', id);
        } else {
            delete payload.updated_at;
            prom = supabase().from('servicios_automatizacion').insert(payload);
        }

        prom.then(function(r) {
            if (r.error) throw r.error;
            closeModalServicio();
            loadServicios().then(renderServicios);
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function deleteModalServicio() {
        var idInp = document.getElementById('modalServicioId');
        var id = idInp && idInp.value ? idInp.value.trim() : '';
        if (!id || !confirm('¿Eliminar este servicio?')) return;

        supabase().from('servicios_automatizacion').delete().eq('id', id).then(function(r) {
            if (r.error) throw r.error;
            closeModalServicio();
            loadServicios().then(renderServicios);
        }).catch(function(e) { alert('Error: ' + (e.message || e)); });
    }

    function closeModalServicio() {
        var modal = document.getElementById('modalServicio');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    }

    function updateAnalisis() {
        var elCalc = document.getElementById('analisisTotalCalc');
        var elCostos = document.getElementById('analisisTotalCostos');
        var elClientes = document.getElementById('analisisTotalClientes');
        if (elCalc) elCalc.textContent = calculadorasList.length;
        if (elCostos) elCostos.textContent = costosList.length;
        if (elClientes) elClientes.textContent = clientesList.length;
    }

    function handleFileSelect(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var data = new Uint8Array(ev.target.result);
                var workbook = XLSX.read(data, { type: 'array' });
                var sheetNames = workbook.SheetNames || [];
                if (!sheetNames.length) {
                    document.getElementById('importPreview').innerHTML = '<p class="form-hint">No se encontraron hojas en el archivo.</p>';
                    excelSheetsPreview = null;
                    excelDataPreview = null;
                    return;
                }
                excelSheetsPreview = sheetNames.map(function(name) {
                    return {
                        name: name,
                        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
                    };
                });
                var sel = document.getElementById('importSheetSelect');
                if (sel) {
                    sel.innerHTML = excelSheetsPreview.map(function(s, i) {
                        return '<option value="' + i + '">' + esc(s.name) + '</option>';
                    }).join('');
                    sel.style.display = excelSheetsPreview.length > 1 ? 'inline-block' : 'none';
                    sel.value = '0';
                }
                excelDataPreview = excelSheetsPreview[0].rows;
                renderImportPreviewHtml();
                document.getElementById('btnProcesarImport').style.display = 'inline-flex';
            } catch (err) {
                console.error(err);
                document.getElementById('importPreview').innerHTML = '<p class="form-hint" style="color:var(--c-error);">Error al leer el archivo.</p>';
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    }

    function onImportSheetSelectChange() {
        var sel = document.getElementById('importSheetSelect');
        if (!sel || !excelSheetsPreview || !excelSheetsPreview.length) return;
        var i = parseInt(sel.value, 10);
        if (isNaN(i) || !excelSheetsPreview[i]) return;
        excelDataPreview = excelSheetsPreview[i].rows;
        renderImportPreviewHtml();
    }

    function procesarImportacion() {
        if (!excelDataPreview || !excelDataPreview.length) {
            alert('Selecciona primero un archivo Excel.');
            return;
        }
        if (!supabase()) {
            alert('Supabase no disponible.');
            return;
        }
        var headers = excelDataPreview[0] || [];
        var rows = excelDataPreview.slice(1).filter(function(row) { return row.some(function(c) { return c != null && String(c).trim() !== ''; }); });
        var added = 0, updated = 0;
        var nombreIdx = headers.findIndex(function(h) { return /nombre|producto|descripcion|articulo/i.test(String(h || '')); });
        if (nombreIdx < 0) nombreIdx = 0;
        var tipoIdx = headers.findIndex(function(h) { return /tipo|modelo|categoria/i.test(String(h || '')); });
        var costoIdx = headers.findIndex(function(h) { return /costo|precio|importe/i.test(String(h || '')) && !/venta|venta/i.test(String(h)); });
        Promise.all(rows.map(function(row) {
            var nombre = row[nombreIdx] != null ? String(row[nombreIdx]).trim() : '';
            if (!nombre) return Promise.resolve();
            var tipo = tipoIdx >= 0 && row[tipoIdx] != null ? String(row[tipoIdx]).trim() : null;
            var costoVal = costoIdx >= 0 && row[costoIdx] != null ? parseFloat(row[costoIdx]) : null;
            if (isNaN(costoVal)) costoVal = null;
            var existente = calculadorasList.find(function(c) { return (c.nombre || '').toLowerCase() === nombre.toLowerCase(); });
            if (existente) {
                var up = { updated_at: new Date().toISOString() };
                if (tipo) up.tipo = tipo;
                return supabase().from('calculadoras').update(up).eq('id', existente.id).then(function() { updated++; });
            }
            return supabase().from('calculadoras').insert({
                nombre: nombre,
                tipo: tipo || 'importado',
                funciones: null,
                config_json: {},
                activo: true
            }).then(function() { added++; });
        })).then(function() {
            var cid = document.getElementById('hojaCalcSelect') && document.getElementById('hojaCalcSelect').value;
            var allHojas = document.getElementById('importAllSheetsHoja') && document.getElementById('importAllSheetsHoja').checked;
            var sheetList = (allHojas && excelSheetsPreview && excelSheetsPreview.length)
                ? excelSheetsPreview.slice()
                : [{ name: 'seleccionada', rows: excelDataPreview }];
            return importHojasMultiSheets(sheetList, cid).then(function(hj) {
                return { hj: hj };
            }).catch(function() {
                return { hj: { n: 0, sheets: 0 } };
            });
        }).then(function(extra) {
            var hojaN = (extra && extra.hj && extra.hj.n) ? extra.hj.n : 0;
            var hojaS = (extra && extra.hj && extra.hj.sheets) ? extra.hj.sheets : 0;
            var hojaMsg = '';
            if (hojaN) {
                hojaMsg = ' Filas en hoja Excel: ' + hojaN + '.';
                if (hojaS) hojaMsg += ' Hojas con columnas detectadas: ' + hojaS + '.';
            }
            alert('Importación completada. Calculadoras — agregados: ' + added + ', actualizados: ' + updated + '.' + hojaMsg);
            excelDataPreview = null;
            excelSheetsPreview = null;
            var impSel = document.getElementById('importSheetSelect');
            if (impSel) {
                impSel.innerHTML = '';
                impSel.style.display = 'none';
            }
            document.getElementById('importPreview').innerHTML = '';
            document.getElementById('btnProcesarImport').style.display = 'none';
            document.getElementById('excelFileCalculadoras').value = '';
            return loadCalculadoras();
        }).then(function() {
            renderFunciones();
            fillSelectCalculadoras('modalCostoCalculadora');
            fillSelectCalculadoras('modalClienteCalculadora');
            fillHojaCalcSelect();
            updateAnalisis();
            return loadHojaFilas();
        }).catch(function(err) {
            console.error(err);
            alert('Error al importar: ' + (err.message || err));
        });
    }

    function findCalculadoraNombre(substr) {
        var s = (substr || '').toLowerCase();
        for (var i = 0; i < calculadorasList.length; i++) {
            if ((calculadorasList[i].nombre || '').toLowerCase().indexOf(s) !== -1) return calculadorasList[i];
        }
        return null;
    }

    function costosMapByCalculadoraId(calcId) {
        var m = {};
        for (var i = 0; i < costosList.length; i++) {
            if (costosList[i].calculadora_id === calcId) m[costosList[i].concepto] = Number(costosList[i].costo);
        }
        return m;
    }

    function renderSimAutoTable() {
        var tbody = document.getElementById('simAutoBody');
        if (!tbody) return;
        var calc = findCalculadoraNombre('automatiz');
        if (!calc) {
            tbody.innerHTML = '<tr><td colspan="3">Importa <code>formulas</code> o crea la calculadora <strong>Automatización</strong> en Supabase.</td></tr>';
            simAutoTarifas = [];
            return;
        }
        var tarifas = costosList.filter(function(co) {
            return co.calculadora_id === calc.id && String(co.concepto || '').indexOf('Tarifa:') === 0;
        });
        tarifas.sort(function(a, b) { return (a.concepto || '').localeCompare(b.concepto || ''); });
        simAutoTarifas = tarifas;
        if (!tarifas.length) {
            tbody.innerHTML = '<tr><td colspan="3">Sin filas <code>Tarifa: …</code>. Ejecuta <code>node import.mjs formulas --apply</code>.</td></tr>';
            return;
        }
        tbody.innerHTML = tarifas.map(function(t, idx) {
            var label = String(t.concepto || '').replace(/^Tarifa:\s*/i, '');
            var rate = t.costo != null ? Number(t.costo).toFixed(2) : '—';
            return '<tr data-tarifa-i="' + idx + '"><td>' + esc(label) + '</td><td><input type="number" class="form-control sim-auto-hr" step="0.5" min="0" value="0" style="max-width:6rem"></td><td>' + rate + '</td></tr>';
        }).join('');
    }

    function syncAutoGasDefault() {
        var calc = findCalculadoraNombre('automatiz');
        if (!calc) return;
        var m = costosMapByCalculadoraId(calc.id);
        var inp = document.getElementById('autoGasolina');
        if (inp && m['auto:paramGasolina'] != null && String(inp.value).trim() === '') {
            inp.placeholder = 'Defecto: ' + String(m['auto:paramGasolina']);
        }
    }

    function runLaboratorioSim() {
        var CE = window.CostosEngine;
        if (!CE) { alert('Motor CostosEngine no cargado.'); return; }
        var calc = findCalculadoraNombre('laboratorio');
        if (!calc) { alert('No hay calculadora "Laboratorio (electrónica)". Importa formulas o créala.'); return; }
        var m = costosMapByCalculadoraId(calc.id);
        CE.applyConfig({
            gasolina: m.gasolina != null ? m.gasolina : CE.CONFIG.gasolina,
            rendimiento: m.rendimiento != null ? m.rendimiento : CE.CONFIG.rendimiento,
            costoTecnico: m.costoTecnico != null ? m.costoTecnico : CE.CONFIG.costoTecnico,
            gastosFijosHora: m.gastosFijosHora != null ? m.gastosFijosHora : CE.CONFIG.gastosFijosHora,
            camionetaHora: m.camionetaHora != null ? m.camionetaHora : CE.CONFIG.camionetaHora,
            utilidad: m.utilidad != null ? m.utilidad : CE.CONFIG.utilidad,
            credito: m.credito != null ? m.credito : CE.CONFIG.credito,
            iva: m.iva != null ? m.iva : CE.CONFIG.iva
        });
        var km = parseFloat(document.getElementById('labKm').value) || 0;
        var hvIn = parseFloat(document.getElementById('labHorasViaje').value);
        var horasViaje = !isNaN(hvIn) && hvIn > 0 ? hvIn : (km > 0 ? Math.ceil(km / 50) : 0);
        var ht = parseFloat(document.getElementById('labHorasTaller').value) || 0;
        var ref = parseFloat(document.getElementById('labRefacciones').value) || 0;
        var r = CE.calcularPrecioFinal({ km: km, horasViaje: horasViaje, horasTaller: ht, costoRefacciones: ref });
        var el = document.getElementById('labSimResult');
        if (!el) return;
        el.innerHTML = '<div class="calc-sim-breakdown"><p>Gasolina: <strong>' + r.gasolina.toFixed(2) + '</strong> · Traslado técn.: <strong>' + r.trasladoTecnico.toFixed(2) + '</strong> · MO: <strong>' + r.manoObra.toFixed(2) + '</strong> · G.fijos: <strong>' + r.gastosFijos.toFixed(2) + '</strong> · Camioneta: <strong>' + r.camioneta.toFixed(2) + '</strong> · Refacc.: <strong>' + r.refacciones.toFixed(2) + '</strong></p><p>Gastos generales: <strong>' + r.gastosGenerales.toFixed(2) + '</strong> · + Utilidad: <strong>' + r.precioConUtilidad.toFixed(2) + '</strong> · + Crédito (antes IVA): <strong>' + r.precioAntesIVA.toFixed(2) + '</strong> · IVA: <strong>' + r.iva.toFixed(2) + '</strong></p><p class="calc-sim-total">Total con IVA: <strong>' + r.total.toFixed(2) + '</strong></p></div>';
    }

    function runAutomatizacionSim() {
        var calc = findCalculadoraNombre('automatiz');
        if (!calc) { alert('No hay calculadora Automatización.'); return; }
        var m = costosMapByCalculadoraId(calc.id);
        var lines = 0;
        document.querySelectorAll('#simAutoBody tr[data-tarifa-i]').forEach(function(tr) {
            var idx = parseInt(tr.getAttribute('data-tarifa-i'), 10);
            var t = simAutoTarifas[idx];
            if (!t) return;
            var hr = parseFloat(tr.querySelector('.sim-auto-hr') && tr.querySelector('.sim-auto-hr').value) || 0;
            var rate = Number(t.costo);
            if (hr > 0 && !isNaN(rate)) lines += hr * rate;
        });
        var tPlantaHr = parseFloat(document.getElementById('autoHrPlanta').value) || 0;
        var tPlantaRate = m['auto:tarifaTiempoPlanta'];
        if (tPlantaRate != null && tPlantaHr > 0) lines += tPlantaHr * tPlantaRate;
        var mat = parseFloat(document.getElementById('autoMateriales').value) || 0;
        var via = parseFloat(document.getElementById('autoViaticos').value) || 0;
        var hrCam = parseFloat(document.getElementById('autoHrCamioneta').value) || 0;
        var camH = m['auto:camionetaHora'] || 0;
        var hrGG = parseFloat(document.getElementById('autoHrGastoGen').value) || 0;
        var ggH = m['auto:horaGastoGeneral'] || 0;
        var gasInp = document.getElementById('autoGasolina');
        var gasVal = parseFloat(gasInp && gasInp.value);
        var gas = !isNaN(gasVal) ? gasVal : (m['auto:paramGasolina'] != null ? m['auto:paramGasolina'] : 0);
        var markupPct = m['auto:markupMaterialesPct'] != null ? m['auto:markupMaterialesPct'] : 0;
        var markup = mat * (markupPct / 100);
        var base = lines + markup + via + hrCam * camH + gas + hrGG * ggH;
        var credPct = m['auto:creditoPct'] != null ? m['auto:creditoPct'] : 0;
        var descPct = m['auto:descuentoPct'] != null ? m['auto:descuentoPct'] : 0;
        var conCred = base * (1 + credPct / 100);
        var final = conCred * (1 - descPct / 100);
        var el = document.getElementById('autoSimResult');
        if (!el) return;
        el.innerHTML = '<div class="calc-sim-breakdown"><p>Servicios (líneas): <strong>' + lines.toFixed(2) + '</strong></p><p>Materiales + ' + markupPct + '%: <strong>' + (mat + markup).toFixed(2) + '</strong> · Viáticos: <strong>' + via.toFixed(2) + '</strong> · Camioneta: <strong>' + (hrCam * camH).toFixed(2) + '</strong> · Gas/trasl.: <strong>' + gas.toFixed(2) + '</strong> · G.gral: <strong>' + (hrGG * ggH).toFixed(2) + '</strong></p><p>Base: <strong>' + base.toFixed(2) + '</strong> · +Crédito ' + credPct + '%: <strong>' + conCred.toFixed(2) + '</strong> · −Desc. ' + descPct + '%: <strong>' + final.toFixed(2) + '</strong></p></div>';
    }

    function validar() {
        var div = document.getElementById('validacionResultado');
        if (!div) return;
        var ok = true;
        var msgs = [];
        if (calculadorasList.length === 0) {
            msgs.push('No hay calculadoras registradas. Importa desde la plantilla.');
            ok = false;
        } else {
            msgs.push('Calculadoras: ' + calculadorasList.length + ' registros.');
        }
        calculadorasList.forEach(function(c) {
            if (!c.nombre || !c.nombre.trim()) {
                msgs.push('Calculadora sin nombre (id: ' + c.id + ')');
                ok = false;
            }
        });
        div.innerHTML = '<p class="form-hint">' + msgs.join('<br>') + '</p><p class="form-hint">' + (ok ? 'Validación correcta.' : 'Revisa los puntos anteriores.') + '</p>';
    }

    function bindEvents() {
        var btnExcel = document.getElementById('btnSeleccionarExcel');
        var inputFile = document.getElementById('excelFileCalculadoras');
        if (btnExcel && inputFile) {
            btnExcel.addEventListener('click', function() { inputFile.click(); });
            inputFile.addEventListener('change', handleFileSelect);
        }
        var btnProcesar = document.getElementById('btnProcesarImport');
        if (btnProcesar) btnProcesar.addEventListener('click', procesarImportacion);
        var importSheetSel = document.getElementById('importSheetSelect');
        if (importSheetSel) importSheetSel.addEventListener('change', onImportSheetSelectChange);
        var btnValidar = document.getElementById('btnValidar');
        if (btnValidar) btnValidar.addEventListener('click', validar);
        var toggle = document.getElementById('toggleMenu');
        if (toggle) toggle.addEventListener('click', function() { document.body.classList.toggle('sidebar-closed'); });

        var bLab = document.getElementById('btnCalcLaboratorio');
        if (bLab) bLab.addEventListener('click', runLaboratorioSim);
        var bAuto = document.getElementById('btnCalcAutomatizacion');
        if (bAuto) bAuto.addEventListener('click', runAutomatizacionSim);

        if (document.getElementById('btnNuevaCalculadora')) document.getElementById('btnNuevaCalculadora').addEventListener('click', function() { openModalCalculadora(null); });
        if (document.getElementById('btnNuevoCosto')) document.getElementById('btnNuevoCosto').addEventListener('click', function() { openModalCosto(null); });
        if (document.getElementById('btnNuevoCliente')) document.getElementById('btnNuevoCliente').addEventListener('click', function() { openModalCliente(null); });

        var hojaSel = document.getElementById('hojaCalcSelect');
        if (hojaSel) hojaSel.addEventListener('change', function() { loadHojaFilas(); });
        if (document.getElementById('btnHojaNuevaFila')) document.getElementById('btnHojaNuevaFila').addEventListener('click', appendEmptyHojaRow);
        if (document.getElementById('btnHojaRecargar')) document.getElementById('btnHojaRecargar').addEventListener('click', function() { loadHojaFilas(); });

        document.getElementById('modalCalcClose') && document.getElementById('modalCalcClose').addEventListener('click', closeModalCalculadora);
        document.getElementById('modalCalcGuardar') && document.getElementById('modalCalcGuardar').addEventListener('click', saveModalCalculadora);
        document.getElementById('modalCalcEliminar') && document.getElementById('modalCalcEliminar').addEventListener('click', deleteModalCalculadora);
        document.getElementById('modalCalcCancelar') && document.getElementById('modalCalcCancelar').addEventListener('click', closeModalCalculadora);

        document.getElementById('modalCostoClose') && document.getElementById('modalCostoClose').addEventListener('click', closeModalCosto);
        document.getElementById('modalCostoGuardar') && document.getElementById('modalCostoGuardar').addEventListener('click', saveModalCosto);
        document.getElementById('modalCostoEliminar') && document.getElementById('modalCostoEliminar').addEventListener('click', deleteModalCosto);
        document.getElementById('modalCostoCancelar') && document.getElementById('modalCostoCancelar').addEventListener('click', closeModalCosto);

        document.getElementById('modalClienteClose') && document.getElementById('modalClienteClose').addEventListener('click', closeModalCliente);
        document.getElementById('modalClienteGuardar') && document.getElementById('modalClienteGuardar').addEventListener('click', saveModalCliente);
        document.getElementById('modalClienteEliminar') && document.getElementById('modalClienteEliminar').addEventListener('click', deleteModalCliente);
        document.getElementById('modalClienteCancelar') && document.getElementById('modalClienteCancelar').addEventListener('click', closeModalCliente);

        // Tabulador Cliente Event listeners
        var btnNuevoTabulador = document.getElementById('btnNuevoTabuladorCliente');
        if (btnNuevoTabulador) btnNuevoTabulador.addEventListener('click', function() { openModalTabuladorCliente(null); });
        document.getElementById('modalTabuladorClose') && document.getElementById('modalTabuladorClose').addEventListener('click', closeModalTabuladorCliente);
        document.getElementById('modalTabuladorGuardar') && document.getElementById('modalTabuladorGuardar').addEventListener('click', saveModalTabuladorCliente);
        document.getElementById('modalTabuladorEliminar') && document.getElementById('modalTabuladorEliminar').addEventListener('click', deleteModalTabuladorCliente);
        document.getElementById('modalTabuladorCancelar') && document.getElementById('modalTabuladorCancelar').addEventListener('click', closeModalTabuladorCliente);

        // BOM Event listeners
        if (document.getElementById('btnBOMNuevo')) document.getElementById('btnBOMNuevo').addEventListener('click', function() { openModalBOM(null); });
        if (document.getElementById('btnBOMRecargar')) document.getElementById('btnBOMRecargar').addEventListener('click', function() { loadBOM().then(renderBOM).then(fillBOMFiltros); });
        if (document.getElementById('bomFiltroCategoria')) document.getElementById('bomFiltroCategoria').addEventListener('change', applyBOMFiltros);
        if (document.getElementById('bomFiltroEstado')) document.getElementById('bomFiltroEstado').addEventListener('change', applyBOMFiltros);

        // Servicios Event listeners
        if (document.getElementById('btnServicioNuevo')) document.getElementById('btnServicioNuevo').addEventListener('click', function() { openModalServicio(null); });

        // BOM Modal handlers
        document.getElementById('modalBOMClose') && document.getElementById('modalBOMClose').addEventListener('click', closeModalBOM);
        document.getElementById('modalBOMGuardar') && document.getElementById('modalBOMGuardar').addEventListener('click', saveModalBOM);
        document.getElementById('modalBOMEliminar') && document.getElementById('modalBOMEliminar').addEventListener('click', deleteModalBOM);
        document.getElementById('modalBOMCancelar') && document.getElementById('modalBOMCancelar').addEventListener('click', closeModalBOM);

        // Servicio Modal handlers
        document.getElementById('modalServicioClose') && document.getElementById('modalServicioClose').addEventListener('click', closeModalServicio);
        document.getElementById('modalServicioGuardar') && document.getElementById('modalServicioGuardar').addEventListener('click', saveModalServicio);
        document.getElementById('modalServicioEliminar') && document.getElementById('modalServicioEliminar').addEventListener('click', deleteModalServicio);
        document.getElementById('modalServicioCancelar') && document.getElementById('modalServicioCancelar').addEventListener('click', closeModalServicio);

        [document.getElementById('modalCalc'), document.getElementById('modalCosto'), document.getElementById('modalCliente'),
         document.getElementById('modalBOM'), document.getElementById('modalServicio')].forEach(function(modal) {
            if (modal) modal.addEventListener('click', function(ev) { if (ev.target === modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); } });
        });
    }

    async function init() {
        bindEvents();
        try {
            await loadCalculadoras();
            await loadCostos();
            await loadClientes();
            await loadClientesTabulador();
            renderFunciones();
            renderCostos();
            renderClientes();
            renderTabuladorViaticos();
            renderClientesTabuladorTabla();
            fillHojaCalcSelect();
            await loadHojaFilas();
            updateAnalisis();
            renderSimAutoTable();
            syncAutoGasDefault();

            // Cargar BOM y Servicios (solo para admins)
            var profile = await auth().getCurrentProfile();
            if (profile && (profile.rol === 'admin' || profile.rol === 'superadmin')) {
                try {
                    await loadBOM();
                    await loadServicios();
                    renderBOM();
                    renderServicios();
                    fillBOMFiltros();
                } catch (bomErr) {
                    console.warn('[Calculadoras] BOM/Servicios:', bomErr);
                }
            }
        } catch (e) {
            console.warn('[Calculadoras] init:', e);
        }
    }

    window.calculadorasMod = { init: init };
})();
