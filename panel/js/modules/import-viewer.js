/**
 * Visor de importación Excel/CSV (estilo DataViewer) + guardado en Supabase.
 * No incluye datos embebidos: todo se carga desde archivos.
 * Imágenes dentro de celdas Excel: SheetJS no extrae dibujos; usar columnas URL o Storage.
 */
import { authService } from '../core/auth-service.js';
import { createDataService } from '../core/data-service.js';
import { generateCSRFToken } from '../core/security-middleware.js';

const contactosService = createDataService('contactos');
const inventarioService = createDataService('inventario');

let tables = {};
let activeTab = null;

function _log(msg) {
    const el = document.getElementById('ivLog');
    if (!el) return;
    const line = `[${new Date().toLocaleTimeString('es-MX')}] ${msg}\n`;
    el.textContent = line + el.textContent;
}

function _norm(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function _splitOdooNombreCompleto(fullRaw) {
    const full = String(fullRaw || '').trim();
    if (!full) return { nombre: '', empresa: '' };
    const lastComma = full.lastIndexOf(',');
    if (lastComma <= 0) return { nombre: full.toUpperCase(), empresa: '' };
    const left = full.slice(0, lastComma).trim();
    const right = full.slice(lastComma + 1).trim();
    const legalEntity = /\b(s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?|inc\.?|llc|corp\.?|c\.?\s*v\.?)\b/i;
    if (right && (legalEntity.test(left) || left.length > 3) && !legalEntity.test(right)) {
        return { nombre: right.toUpperCase(), empresa: left.toUpperCase() };
    }
    return { nombre: full.toUpperCase(), empresa: '' };
}

function _rowFromOdooExport(obj) {
    const full = obj['Nombre completo'] ?? obj['nombre completo'] ?? '';
    const email = String(obj['Correo electrónico'] ?? obj['correo electrónico'] ?? obj['email'] ?? '').trim();
    const telefono = String(obj['Teléfono'] ?? obj['telefono'] ?? '').trim();
    const { nombre, empresa } = _splitOdooNombreCompleto(full);
    if (!nombre && !empresa) return null;
    const displayNombre = nombre || empresa;
    let logo_url = '';
    for (const k of Object.keys(obj)) {
        const v = String(obj[k] || '').trim();
        if (/^https?:\/\//i.test(v) && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(v)) {
            logo_url = v;
            break;
        }
    }
    return {
        nombre: displayNombre,
        empresa: nombre ? empresa : '',
        email,
        telefono,
        rfc: '',
        tipo: 'client',
        avatar: displayNombre.charAt(0).toUpperCase(),
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        logo_url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

function _isOdooPartnerSheet(rows) {
    if (!rows || !rows.length) return false;
    const keys = Object.keys(rows[0] || {});
    const joined = keys.join('\u0000').toLowerCase();
    return joined.includes('nombre completo') && (joined.includes('correo') || joined.includes('telefono') || joined.includes('teléfono'));
}

function _claveDedupeContacto(c) {
    const email = (c.email || '').toString().toLowerCase().trim();
    const nom = (c.nombre || '').toString().toLowerCase().trim();
    const emp = (c.empresa || '').toString().toLowerCase().trim();
    if (email) return 'e:' + email + '|' + nom + '|' + emp;
    const tel = (c.telefono || '').toString().replace(/\D/g, '');
    if (tel.length >= 10) return 't:' + tel + '|' + nom + '|' + emp;
    if (nom || emp) return 'n:' + nom + '|' + emp;
    return 'id:' + (c.id || '');
}

function _rowsToObjects(cols, dataRows) {
    return dataRows.map((row) => {
        const o = {};
        cols.forEach((c, i) => {
            o[c] = row[i] != null ? String(row[i]).trim() : '';
        });
        return o;
    });
}

function _findColIndex(cols, patterns) {
    for (let i = 0; i < cols.length; i++) {
        const n = _norm(cols[i]);
        for (const p of patterns) {
            if (n.includes(_norm(p))) return i;
        }
    }
    return -1;
}

function _mapInventarioRow(cols, row, categoria) {
    const skuIdx = _findColIndex(cols, ['codigo marking', 'codigo', 'sku', 'num.parte', 'num parte', 'clave']);
    const nomIdx = _findColIndex(cols, ['descripcion', 'descripción', 'nombre', 'producto']);
    const stockIdx = _findColIndex(cols, ['existencia', 'stock', 'cantidad']);
    const ubiIdx = _findColIndex(cols, ['ubicacion', 'ubicación', 'almacen']);
    const costIdx = _findColIndex(cols, ['costo unitario', 'costo', 'precio unitario']);
    const precIdx = _findColIndex(cols, ['precio venta', 'venta', 'precio']);

    const get = (i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
    const sku = get(skuIdx);
    const nombre = get(nomIdx);
    if (!sku || !nombre) return null;
    const stock = parseFloat(String(get(stockIdx)).replace(/,/g, '')) || 0;
    const costo = parseFloat(String(get(costIdx)).replace(/,/g, '')) || 0;
    const precioVenta = precIdx >= 0 ? parseFloat(String(get(precIdx)).replace(/,/g, '')) || 0 : 0;
    const ubicacion = get(ubiIdx) || '';
    const now = new Date().toISOString();
    return {
        sku,
        nombre,
        categoria: categoria || 'refaccion',
        ubicacion,
        minimo: 0,
        costo,
        precio_venta: precioVenta,
        stock,
        created_at: now,
        updated_at: now
    };
}

function renderTabs() {
    const tabsEl = document.getElementById('ivTabs');
    const panelsEl = document.getElementById('ivPanels');
    if (!tabsEl || !panelsEl) return;

    const names = Object.keys(tables);
    if (names.length === 0) {
        tabsEl.innerHTML = '';
        panelsEl.innerHTML = '<div class="iv-empty">Importe un Excel o CSV para ver las hojas aquí. Luego puede guardar en Supabase.</div>';
        activeTab = null;
        return;
    }

    if (!activeTab || !tables[activeTab]) activeTab = names[0];

    tabsEl.innerHTML = names
        .map(
            (name, idx) =>
                `<button type="button" class="iv-tab${name === activeTab ? ' active' : ''}" data-iv-idx="${idx}">${escapeHtml(name)} <small>(${tables[name].data.length})</small></button>`
        )
        .join('');

    tabsEl.querySelectorAll('.iv-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-iv-idx'), 10);
            activeTab = names[idx];
            tabsEl.querySelectorAll('.iv-tab').forEach((b, j) => b.classList.toggle('active', j === idx));
            panelsEl.querySelectorAll('.iv-panel').forEach((p, j) => p.classList.toggle('active', j === idx));
        });
    });

    panelsEl.innerHTML = names
        .map((name, idx) => {
            const { cols, data } = tables[name];
            const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
            const body = data
                .slice(0, 500)
                .map((row) => `<tr>${cols.map((_, i) => `<td>${escapeHtml(String(row[i] ?? ''))}</td>`).join('')}</tr>`)
                .join('');
            const more = data.length > 500 ? `<p class="iv-hint">Mostrando 500 de ${data.length} filas.</p>` : '';
            return `<div class="iv-panel${name === activeTab ? ' active' : ''}" data-iv-idx="${idx}">
        <div class="iv-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}</div>`;
        })
        .join('');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function importFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                if (file.name.endsWith('.csv')) {
                    const text = evt.target.result;
                    const rows = text.split(/\r?\n/).map((r) => {
                        const out = [];
                        let cur = '';
                        let q = false;
                        for (let i = 0; i < r.length; i++) {
                            const ch = r[i];
                            if (ch === '"') {
                                q = !q;
                                continue;
                            }
                            if (!q && ch === ',') {
                                out.push(cur.trim());
                                cur = '';
                            } else cur += ch;
                        }
                        out.push(cur.trim());
                        return out;
                    });
                    const valid = rows.filter((r) => r.some((c) => c));
                    if (valid.length < 2) {
                        _log(`CSV vacío o sin encabezado: ${file.name}`);
                        return;
                    }
                    const cols = valid[0].map((c) => String(c).trim());
                    const data = valid.slice(1).map((r) => cols.map((_, i) => r[i] ?? ''));
                    const label = file.name.replace(/\.csv$/i, '');
                    tables[label] = { cols, data };
                } else if (window.XLSX) {
                    const wb = window.XLSX.read(evt.target.result, { type: 'binary' });
                    wb.SheetNames.forEach((sheetName) => {
                        const ws = wb.Sheets[sheetName];
                        const json = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                        if (json.length < 2) return;
                        const cols = json[0].map((c) => String(c).trim());
                        const data = json.slice(1).map((r) => cols.map((_, i) => (r[i] != null ? String(r[i]).trim() : '')));
                        const label = file.name.replace(/\.(xlsx?|xls)$/i, '') + (wb.SheetNames.length > 1 ? ' — ' + sheetName : '');
                        tables[label] = { cols, data };
                    });
                } else {
                    _log('Librería XLSX no cargada.');
                    return;
                }
                activeTab = Object.keys(tables)[Object.keys(tables).length - 1];
                renderTabs();
                _log(`Cargado: ${file.name}`);
            } catch (err) {
                _log(`Error: ${file.name} — ${err.message}`);
            }
        };
        if (file.name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
        else reader.readAsBinaryString(file);
    }
    e.target.value = '';
}

function exportCurrentCsv() {
    if (!activeTab || !tables[activeTab]) {
        alert('Seleccione una pestaña con datos.');
        return;
    }
    const { cols, data } = tables[activeTab];
    const lines = [cols.join(','), ...data.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = activeTab.replace(/\s/g, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    _log(`CSV exportado: ${activeTab}`);
}

async function saveContactos() {
    if (!activeTab || !tables[activeTab]) {
        alert('No hay pestaña activa.');
        return;
    }
    const { cols, data } = tables[activeTab];
    if (!data.length) {
        alert('Sin filas.');
        return;
    }
    const csrf = sessionStorage.getItem('csrfToken');
    const objects = _rowsToObjects(cols, data);
    let imported = 0;
    let skipped = 0;
    const keySeen = new Set();
    let existingKeys = new Set();
    try {
        const exist = await contactosService.select({}, { orderBy: 'nombre', ascending: true, limit: 5000 });
        existingKeys = new Set((exist || []).map(_claveDedupeContacto));
    } catch (err) {
        _log('Aviso: no se pudieron leer contactos existentes: ' + (err.message || err));
    }

    const tryInsert = async (row) => {
        const k = _claveDedupeContacto(row);
        if (!k || k === 'id:') return;
        if (keySeen.has(k) || existingKeys.has(k)) {
            skipped++;
            return;
        }
        try {
            await contactosService.insert(row, csrf);
            keySeen.add(k);
            existingKeys.add(k);
            imported++;
        } catch (err) {
            _log(`Fila error: ${err.message || err}`);
        }
    };

    if (_isOdooPartnerSheet(objects)) {
        for (const obj of objects) {
            const row = _rowFromOdooExport(obj);
            if (row) await tryInsert(row);
            else skipped++;
        }
    } else {
        for (const obj of objects) {
            const nombre = String(obj[cols[0]] || Object.values(obj)[0] || '').trim();
            if (!nombre) {
                skipped++;
                continue;
            }
            const row = {
                nombre: nombre.toUpperCase(),
                email: '',
                telefono: '',
                empresa: '',
                rfc: '',
                tipo: 'client',
                avatar: nombre.charAt(0).toUpperCase(),
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                logo_url: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            cols.forEach((c) => {
                const v = String(obj[c] || '').trim();
                const lc = c.toLowerCase();
                if (lc.includes('correo') || lc === 'email') row.email = v;
                else if (lc.includes('tel')) row.telefono = v;
                else if (lc.includes('empresa') || lc.includes('company')) row.empresa = v.toUpperCase();
                else if (lc.includes('rfc')) row.rfc = v;
                else if (lc.includes('tipo') && v.toLowerCase().includes('prov')) row.tipo = 'provider';
                else if (/^https?:\/\//i.test(v) && /\.(png|jpe?g|gif|webp|svg)/i.test(v)) row.logo_url = v;
            });
            await tryInsert(row);
        }
    }

    _log(`Contactos → Supabase: ${imported} insertados, ${skipped} omitidos.`);
    alert(`Contactos: ${imported} guardados en Supabase · ${skipped} omitidos o vacíos.`);
}

async function saveInventario() {
    if (!activeTab || !tables[activeTab]) {
        alert('No hay pestaña activa.');
        return;
    }
    const catEl = document.getElementById('ivInvCategoria');
    const categoria = catEl ? catEl.value : 'refaccion';
    const { cols, data } = tables[activeTab];
    const csrf = sessionStorage.getItem('csrfToken');
    let importados = 0;
    let omitidos = 0;

    let productos = [];
    try {
        productos = await inventarioService.select({}, { limit: 8000 });
    } catch (e) {
        _log('Aviso inventario existente: ' + (e.message || e));
    }

    for (let i = 0; i < data.length; i++) {
        const mapped = _mapInventarioRow(cols, data[i], categoria);
        if (!mapped) {
            omitidos++;
            continue;
        }
        try {
            const existe = productos.find((p) => p.sku && mapped.sku && p.sku.toLowerCase() === mapped.sku.toLowerCase() && p.categoria === categoria);
            if (existe) {
                await inventarioService.update(
                    existe.id,
                    {
                        stock: mapped.stock,
                        ubicacion: mapped.ubicacion,
                        costo: mapped.costo,
                        precio_venta: mapped.precio_venta,
                        updated_at: mapped.updated_at
                    },
                    csrf
                );
                existe.stock = mapped.stock;
            } else {
                const ins = await inventarioService.insert(mapped, csrf);
                productos.push({ ...mapped, id: ins?.id });
            }
            importados++;
        } catch (err) {
            _log(`Inventario fila ${i + 1}: ${err.message || err}`);
        }
    }

    _log(`Inventario → Supabase: ${importados} filas · ${omitidos} omitidas.`);
    alert(`Inventario: ${importados} procesados en Supabase · ${omitidos} sin SKU/nombre.`);
}

export async function init() {
    try {
        await window.securityMiddleware?.initSecurity?.();
    } catch (e) {
        console.warn('security', e);
    }
    generateCSRFToken();

    const user = await authService.requireAuth('/panel/login.html');
    if (!user) return;

    const profile = await authService.getCurrentProfile();
    const okRol = ['admin', 'superadmin', 'contabilidad'].includes(profile?.rol);
    if (!okRol) {
        alert('Esta herramienta es solo para administración / contabilidad.');
        window.location.href = '/panel/panel.html';
        return;
    }
    try {
        if (profile?.rol) {
            sessionStorage.setItem('ssepi_rol', profile.rol);
            document.body.dataset.rol = profile.rol;
        }
    } catch (e) {}

    const nameEl = document.getElementById('userName');
    const avEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = (profile?.nombre?.split(' ')[0]) || 'Usuario';
    if (avEl) avEl.textContent = (profile?.nombre?.[0] || 'A').toUpperCase();

    document.getElementById('ivFile')?.addEventListener('change', importFiles);
    document.getElementById('ivExportCsv')?.addEventListener('click', exportCurrentCsv);
    document.getElementById('ivSaveContactos')?.addEventListener('click', () => saveContactos().catch((e) => alert(e.message)));
    document.getElementById('ivSaveInventario')?.addEventListener('click', () => saveInventario().catch((e) => alert(e.message)));

    tables = {};
    activeTab = null;
    renderTabs();
    _log('Listo. Importe Excel/CSV y use “Guardar en Supabase”.');
}

window.importViewerModule = { init };
