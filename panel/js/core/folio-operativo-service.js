/**
 * Folio operativo (cerebro comercial): sincroniza cotizaciones/ventas con ssepi_folio_operativo.
 * Requiere migraciones: folio-operativo-cerebro-v1.sql, folio-operativo-cotizaciones-v2.sql, folio-operativo-role-permissions.sql
 */
import { createDataService } from './data-service.js';

const folioService = createDataService('ssepi_folio_operativo');

function _norm(s) {
    return (s || '').toString().trim().toLowerCase();
}

/**
 * Arma snapshot JSON para ultima_evaluacion_cotizacion (stock heurístico por nombre de componente).
 * @param {Array<{nombre:string,cantidad:number,costo_unitario:number}>} componentes
 * @param {Array<Record<string, unknown>>} inventarioRows filas tabla inventario
 */
export function buildEvaluacionCotizacion(componentes, inventarioRows) {
    const rows = Array.isArray(inventarioRows) ? inventarioRows : [];
    const lineas = (componentes || []).map((c) => {
        const nombre = c.nombre || '';
        const n = _norm(nombre);
        const match = rows.find((inv) => {
            const p = _norm(inv.producto || inv.descripcion || inv.nombre || inv.codigo || '');
            return p && (p === n || p.includes(n) || n.includes(p));
        });
        const stock = match != null
            ? Number(match.cantidad ?? match.stock ?? match.existencia ?? 0)
            : null;
        const necesita = Number(c.cantidad) || 0;
        return {
            nombre,
            cantidad_pedida: necesita,
            cantidad_disponible: stock,
            suficiente: stock === null ? null : stock >= necesita,
            costo_unitario_lista: c.costo_unitario
        };
    });
    return {
        evaluado_at: new Date().toISOString(),
        lineas,
        resumen: {
            total_lineas: lineas.length,
            con_faltante: lineas.filter((l) => l.suficiente === false).length,
            sin_match_inventario: lineas.filter((l) => l.cantidad_disponible === null).length
        }
    };
}

function _ramoDesdeOrigen(origen) {
    const o = _norm(origen);
    if (o === 'taller' || o === 'motor' || o === 'motores') return 'taller_motores';
    if (o === 'proyecto' || o === 'proyectos' || o === 'automatizacion') return 'proyectos';
    return null;
}

/**
 * Tras INSERT en cotizaciones: crea fila folio en etapa cotizacion.
 * @param {{ id: string, origen?: string|null }} cotizacionRow
 * @param {{ componentes?: Array, inventario?: Array }} ctx
 */
export async function syncFolioAfterCotizacionInsert(cotizacionRow, ctx, csrfToken) {
    if (!cotizacionRow?.id) return { ok: false, reason: 'sin id' };
    const evalJson = buildEvaluacionCotizacion(ctx?.componentes || [], ctx?.inventario || []);
    const payload = {
        cotizacion_id: cotizacionRow.id,
        venta_id: null,
        ramo: _ramoDesdeOrigen(cotizacionRow.origen),
        etapa: 'cotizacion',
        ultima_evaluacion_cotizacion: evalJson,
        meta: { origen_cotizacion: cotizacionRow.origen || null }
    };
    try {
        const row = await folioService.insert(payload, csrfToken);
        return { ok: true, row };
    } catch (e) {
        console.warn('[folio-operativo] insert:', e?.message || e);
        return { ok: false, error: e };
    }
}
