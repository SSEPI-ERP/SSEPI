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
    var simAutoTarifas = [];

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

    // --- Modal Cliente ---
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
                var first = sheetNames[0] ? workbook.Sheets[sheetNames[0]] : null;
                if (!first) {
                    document.getElementById('importPreview').innerHTML = '<p class="form-hint">No se encontraron hojas en el archivo.</p>';
                    return;
                }
                var json = XLSX.utils.sheet_to_json(first, { header: 1, defval: '' });
                excelDataPreview = json;
                var preview = document.getElementById('importPreview');
                var rows = (json || []).slice(0, 6);
                var html = '<p class="form-hint">Vista previa (primeras filas):</p><table class="lista-table"><tbody>';
                rows.forEach(function(row, i) {
                    html += '<tr>' + (row.map(function(cell) { return '<td>' + (cell != null ? String(cell).substring(0, 50) : '') + '</td>'; }).join('')) + '</tr>';
                });
                html += '</tbody></table><p class="form-hint">Filas totales: ' + (json.length || 0) + '. Haz clic en "Agregar / Actualizar" para procesar.</p>';
                preview.innerHTML = html;
                document.getElementById('btnProcesarImport').style.display = 'inline-flex';
            } catch (err) {
                console.error(err);
                document.getElementById('importPreview').innerHTML = '<p class="form-hint" style="color:var(--c-error);">Error al leer el archivo.</p>';
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
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
            alert('Importación completada. Agregados: ' + added + ', Actualizados: ' + updated);
            excelDataPreview = null;
            document.getElementById('importPreview').innerHTML = '';
            document.getElementById('btnProcesarImport').style.display = 'none';
            document.getElementById('excelFileCalculadoras').value = '';
            return loadCalculadoras();
        }).then(function() {
            renderFunciones();
            fillSelectCalculadoras('modalCostoCalculadora');
            fillSelectCalculadoras('modalClienteCalculadora');
            updateAnalisis();
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

        [document.getElementById('modalCalc'), document.getElementById('modalCosto'), document.getElementById('modalCliente')].forEach(function(modal) {
            if (modal) modal.addEventListener('click', function(ev) { if (ev.target === modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); } });
        });
    }

    async function init() {
        bindEvents();
        try {
            await loadCalculadoras();
            await loadCostos();
            await loadClientes();
            renderFunciones();
            renderCostos();
            renderClientes();
            updateAnalisis();
            renderSimAutoTable();
            syncAutoGasDefault();
        } catch (e) {
            console.warn('[Calculadoras] init:', e);
            var tbody = document.getElementById('tablaFuncionesBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5">Error al cargar (¿ejecutaste la migración calculadoras-modulo.sql?).</td></tr>';
        }
    }

    window.calculadorasMod = { init: init };
})();
