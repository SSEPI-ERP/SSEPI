/**
 * Tabla de costos tipo Excel (Automatización) — solo Ventas / admin.
 */
export const FILAS_COSTO_AUTO = [
    { key: 'empresa', label: 'EMPRESA', tipo: 'texto', editable: true },
    { key: 'programacion_plc_hmi', label: 'PROGRAMACIÓN PLC HMI', tipo: 'moneda', servicioMatch: /programaci[oó]n.*plc|plc.*hmi/i },
    { key: 'servomotor', label: 'SERVOMOTOR', tipo: 'moneda', servicioMatch: /servo/i },
    { key: 'diseno_tablero', label: 'DISEÑO TABLERO', tipo: 'moneda', servicioMatch: /tablero/i },
    { key: 'diseno_mecanico', label: 'DISEÑO MECANICO', tipo: 'moneda', servicioMatch: /mec[aá]nico|3d|herramental/i },
    { key: 'instalacion', label: 'INSTALACIÓN', tipo: 'moneda', servicioMatch: /instalaci[oó]n/i },
    { key: 'fabricacion', label: 'FABRICACIÓN', tipo: 'moneda', servicioMatch: /fabricaci[oó]n/i },
    { key: 'soporte', label: 'SOPORTE', tipo: 'moneda', servicioMatch: /soporte|diagn[oó]stico|capacitaci[oó]n/i },
    { key: 'arquitectura', label: 'ARQUITECTURA', tipo: 'moneda', servicioMatch: /arquitectura|ingenier[ií]a/i },
    { key: 'tiempo_planta', label: 'TIEMPO PLANTA', tipo: 'moneda', derivado: 'tiempo_planta' },
    { key: 'total_servicios', label: 'TOTAL', tipo: 'moneda', calculado: 'total_servicios' },
    { key: 'materiales', label: 'MATERIALES', tipo: 'moneda', editable: true },
    { key: 'total_30pct', label: 'TOTAL 30%', tipo: 'moneda', calculado: 'markup_30' },
    { key: 'viaticos', label: 'VIÁTICOS', tipo: 'moneda', editable: true },
    { key: 'hr_camioneta', label: 'HR CAMIONETA', tipo: 'moneda', editable: true },
    { key: 'gasolina', label: 'GASOLINA', tipo: 'moneda', editable: true },
    { key: 'tiempo_invest', label: 'TIEMPO INVEST', tipo: 'moneda', editable: true },
    { key: 'gastos_generales', label: 'GASTOS GENERALES', tipo: 'moneda', editable: true },
    { key: 'total', label: 'TOTAL', tipo: 'moneda', calculado: 'total' },
    { key: 'credito_2pct', label: '2% CRÉDITO', tipo: 'moneda', calculado: 'credito_2' },
    { key: 'total_venta', label: 'TOTAL VENTA', tipo: 'moneda', calculado: 'total_venta' },
    { key: 'descuento_5pct', label: 'DESCUENTO 5%', tipo: 'moneda', calculado: 'descuento_5' }
];

function n(v) {
    return Number(v) || 0;
}

export function matchServicioFila(act, fila) {
    if (!fila.servicioMatch || !act?.servicio) return false;
    const blob = `${act.area || ''} ${act.servicio || ''}`;
    return fila.servicioMatch.test(blob);
}

export function buildDesgloseDesdeFuentes(opts = {}) {
    const actividades = opts.actividades || [];
    const tarifas = opts.tarifas || {};
    const d = { ...(opts.base || {}) };
    const servicios = d.servicios || {};

    FILAS_COSTO_AUTO.forEach((f) => {
        if (f.tipo !== 'moneda' || f.calculado || f.derivado) return;
        actividades.forEach((act) => {
            if (!matchServicioFila(act, f)) return;
            const hrs = n(act.horas) || n(act.horas_plan);
            const tarifa = n(act.tarifa) || n(tarifas[f.key]) || n(act.valor_agregado) || 0;
            const monto = hrs * tarifa;
            servicios[f.key] = (servicios[f.key] || 0) + monto;
            d[f.key] = (d[f.key] || 0) + monto;
        });
    });

    let tiempoPlanta = n(d.tiempo_planta);
    if (!tiempoPlanta) {
        actividades.filter((a) => a.tipo === 'P').forEach((act) => {
            const hrs = n(act.horas) || n(act.horas_plan);
            const tarifa = n(act.tarifa) || 120;
            tiempoPlanta += hrs * tarifa;
        });
    }
    d.tiempo_planta = tiempoPlanta;
    d.servicios = servicios;
    return recalcularDesglose(d, opts);
}

export function recalcularDesglose(d, opts = {}) {
    const out = { ...d };
    const servicios = out.servicios || {};
    let totalServ = 0;
    FILAS_COSTO_AUTO.forEach((f) => {
        if (f.servicioMatch && n(out[f.key]) > 0) totalServ += n(out[f.key]);
        if (f.servicioMatch && n(servicios[f.key]) > 0) totalServ += n(servicios[f.key]);
    });
    if (!totalServ) {
        Object.values(servicios).forEach((v) => { totalServ += n(v); });
    }
    out.total_servicios = totalServ;
    const mat = n(out.materiales) || n(out.materiales_base);
    const pct30 = n(out.markup_materiales_pct) || 30;
    out.total_30pct = n(out.total_30pct) || mat * (pct30 / 100);
    const sub =
        totalServ +
        mat +
        n(out.total_30pct) +
        n(out.viaticos) +
        n(out.hr_camioneta) +
        n(out.gasolina) +
        n(out.tiempo_invest) +
        n(out.gastos_generales);
    out.total = sub;
    const pctCred = n(out.credito_pct) || 2;
    out.credito_2pct = sub * (pctCred / 100);
    out.total_venta = sub + out.credito_2pct;
    const pctDesc = n(out.descuento_pct) || 5;
    out.descuento_5pct = out.total_venta * (pctDesc / 100);
    out.total_final = out.total_venta - out.descuento_5pct;
    if (opts.aplicarIva) {
        out.iva = out.total_final * 0.16;
        out.total_con_iva = out.total_final + out.iva;
    }
    return out;
}

export function renderDesgloseTableHTML(desglose, editable) {
    const d = desglose || {};
    let rows = '';
    FILAS_COSTO_AUTO.forEach((f) => {
        const val = f.key === 'empresa' ? (d.empresa || d.empresa_nombre || '') : d[f.key];
        const isCalc = !!f.calculado || f.derivado === 'tiempo_planta';
        const ro = !editable || isCalc || f.key === 'total_servicios';
        if (f.tipo === 'texto') {
            rows += `<tr data-costo-key="${f.key}"><td>${f.label}</td><td colspan="2">${
                editable
                    ? `<input type="text" class="ventas-desglose-inp" data-key="${f.key}" value="${String(val || '').replace(/"/g, '&quot;')}" style="width:100%;padding:6px;">`
                    : _esc(String(val || '—'))
            }</td></tr>`;
        } else {
            const num = n(val);
            rows += `<tr data-costo-key="${f.key}" class="${isCalc ? 'desglose-calc' : ''}"><td>${f.label}</td><td style="text-align:right;width:120px;">${
                ro
                    ? `<strong>$${num.toFixed(2)}</strong>`
                    : `<input type="number" step="0.01" min="0" class="ventas-desglose-inp" data-key="${f.key}" value="${num || 0}" style="width:100%;padding:6px;text-align:right;">`
            }</td><td style="width:80px;font-size:11px;color:#64748b;">${isCalc ? 'auto' : ''}</td></tr>`;
        }
    });
    return `
    <div class="ventas-desglose-wrap" style="overflow-x:auto;margin-top:12px;">
        <table class="calc-table ventas-desglose-table" style="width:100%;min-width:520px;">
            <thead><tr><th>Concepto</th><th style="text-align:right;">Importe</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:10px;font-size:15px;font-weight:700;text-align:right;">
            Total final: $${n(d.total_final).toFixed(2)}
            ${d.total_con_iva ? ` · Con IVA: $${n(d.total_con_iva).toFixed(2)}` : ''}
        </div>
    </div>`;
}

function _esc(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Líneas comerciales para PDF (sin gasolina, viáticos ni markup interno). */
export function buildConceptosPDFPublicos(desglose) {
    const d = desglose || {};
    const items = [];
    const keysPublicos = new Set([
        'programacion_plc_hmi', 'servomotor', 'diseno_tablero', 'diseno_mecanico',
        'instalacion', 'fabricacion', 'soporte', 'arquitectura', 'tiempo_planta', 'materiales'
    ]);
    FILAS_COSTO_AUTO.forEach((f) => {
        if (!keysPublicos.has(f.key)) return;
        const amt = n(d[f.key]);
        if (amt <= 0) return;
        items.push({
            descripcion: f.label,
            cantidad: 1,
            precioUnitario: amt,
            importe: amt
        });
    });
    const totalFinal = n(d.total_final) || n(d.total_con_iva) || n(d.total_venta);
    let subtotal = totalFinal / 1.16;
    let iva = totalFinal - subtotal;
    if (!items.length && totalFinal > 0) {
        items.push({
            descripcion: 'Proyecto de automatización',
            cantidad: 1,
            precioUnitario: subtotal,
            importe: subtotal
        });
    } else if (items.length) {
        const sumItems = items.reduce((s, it) => s + n(it.importe), 0);
        if (sumItems > 0 && totalFinal > 0 && Math.abs(sumItems - subtotal) > 0.02) {
            subtotal = sumItems;
            iva = totalFinal - subtotal;
        }
    }
    return { items, subtotal, iva, total: totalFinal };
}

if (typeof window !== 'undefined') {
    window.SSEPIVentasCostoDesglose = {
        FILAS_COSTO_AUTO,
        buildDesgloseDesdeFuentes,
        recalcularDesglose,
        renderDesgloseTableHTML,
        buildConceptosPDFPublicos
    };
}
