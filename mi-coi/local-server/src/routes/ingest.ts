/**
 * Ingest routes — POST /ingest/:source
 * Backward-compatible with the Python bridge.
 * Processes venta, compra, factura, nomina, bancos.
 */
import { Router, Request, Response } from 'express';
import { CoiService, PolizaInput } from '../services/coi-service';
import { SupabaseClient } from '@supabase/supabase-js';

// Default account mapping (falls back to this if Postgres is not available)
const DEFAULT_MAPPING: Record<string, string> = {
  tipo_poliza_venta: 'INGRESO',
  tipo_poliza_compra: 'EGRESO',
  tipo_poliza_factura: 'INGRESO',
  tipo_poliza_nomina: 'EGRESO',
  tipo_poliza_bancos: 'DIARIO',
  cuenta_caja_mn: '101.01',
  cuenta_banco_mn: '102.01',
  cuenta_ingresos_ventas: '401.01',
  cuenta_ingresos_servicios: '401.01',
  cuenta_iva_trasladado_por_pagar: '208.01',
  cuenta_compras_gasto: '501.01',
  cuenta_iva_acreditable: '118.01',
  cuenta_proveedores_por_pagar: '201.01',
  cuenta_nomina_gasto: '601.01',
  cuenta_isr_por_pagar: '213.01',
  cuenta_otras_deducciones: '209.99',
  cuenta_contrapartida_ingreso_bancos: '401.01',
  cuenta_contrapartida_egreso_bancos: '601.01',
  iva_default_rate: '0.16',
};

let mappingCache: Record<string, string> | null = null;
let mappingCacheTime = 0;

async function getMapping(supabase: SupabaseClient | null): Promise<Record<string, string>> {
  if (!supabase) return DEFAULT_MAPPING;
  const now = Date.now();
  if (mappingCache && (now - mappingCacheTime) < 300000) return mappingCache;
  try {
    const { data } = await supabase.from('coi_account_mapping').select('key, value');
    if (data && data.length > 0) {
      const mapping: Record<string, string> = { ...DEFAULT_MAPPING };
      for (const row of data) mapping[row.key] = row.value;
      mappingCache = mapping;
      mappingCacheTime = now;
      return mapping;
    }
  } catch (_) { /* fallback to default */ }
  mappingCache = { ...DEFAULT_MAPPING };
  mappingCacheTime = now;
  return mappingCache;
}

function f(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function calcIvaSubtotal(total: number, subtotal: number, iva: number, rate: number): { subtotal: number; iva: number } {
  let sub = subtotal;
  let ivaCalc = iva;
  if (sub <= 0 && total > 0) sub = Math.round(total / (1 + rate) * 100) / 100;
  if (ivaCalc <= 0 && total > 0) ivaCalc = Math.round((total - sub) * 100) / 100;
  if (Math.abs(sub + ivaCalc - total) > 0.02) ivaCalc = Math.round((total - sub) * 100) / 100;
  return { subtotal: sub, iva: ivaCalc };
}

function escStr(val: unknown): string { return val ? String(val).substring(0, 500) : ''; }

function fechaStr(val: unknown, fallback: string): string {
  if (!val) return fallback;
  const s = String(val).trim();
  return s.length >= 10 ? s.substring(0, 10) : fallback;
}

const BUILDERS: Record<string, (row: Record<string, unknown>, m: Record<string, string>) => PolizaInput> = {
  venta: (row, m) => {
    const total = f(row.total);
    const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
    return {
      tipo: m.tipo_poliza_venta, fecha: fechaStr(row.fecha_pago, fechaStr(row.fecha, new Date().toISOString().substring(0, 10))),
      concepto: `Venta ${row.folio || row.id || ''}`,
      movimientos: [
        { num_cuenta: m.cuenta_caja_mn, concepto_mov: `Venta ${row.folio || ''}`, cargo: total, abono: 0, cliente_rfc: escStr(row.rfc), cliente_nombre: escStr(row.cliente) },
        { num_cuenta: m.cuenta_ingresos_ventas, concepto_mov: `Ingreso venta`, cargo: 0, abono: subtotal },
        { num_cuenta: m.cuenta_iva_trasladado_por_pagar, concepto_mov: `IVA venta`, cargo: 0, abono: iva },
      ],
      erp_source: 'venta', erp_id: String(row.id),
    };
  },
  compra: (row, m) => {
    const total = f(row.total);
    const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
    return {
      tipo: m.tipo_poliza_compra, fecha: fechaStr(row.fecha_requerida, fechaStr(row.fecha_creacion, new Date().toISOString().substring(0, 10))),
      concepto: `Compra ${row.folio || row.id || ''}`,
      movimientos: [
        { num_cuenta: m.cuenta_compras_gasto, concepto_mov: `Compra`, cargo: subtotal, abono: 0 },
        { num_cuenta: m.cuenta_iva_acreditable, concepto_mov: `IVA compra`, cargo: iva, abono: 0 },
        { num_cuenta: m.cuenta_proveedores_por_pagar, concepto_mov: `Proveedor`, cargo: 0, abono: total },
      ],
      erp_source: 'compra', erp_id: String(row.id),
    };
  },
  factura: (row, m) => {
    const total = f(row.total);
    const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
    return {
      tipo: m.tipo_poliza_factura, fecha: fechaStr(row.fecha_emision, new Date().toISOString().substring(0, 10)),
      concepto: `Factura ${row.folio_factura || row.folio || ''}`,
      movimientos: [
        { num_cuenta: m.cuenta_caja_mn, concepto_mov: `Factura`, cargo: total, abono: 0, cliente_rfc: escStr(row.rfc), cliente_nombre: escStr(row.cliente) },
        { num_cuenta: m.cuenta_ingresos_servicios, concepto_mov: `Ingreso factura`, cargo: 0, abono: subtotal },
        { num_cuenta: m.cuenta_iva_trasladado_por_pagar, concepto_mov: `IVA factura`, cargo: 0, abono: iva },
      ],
      erp_source: 'factura', erp_id: String(row.id),
    };
  },
  nomina: (row, m) => {
    const total = f(row.total);
    const deducciones = f(row.deducciones, 0);
    const neto = Math.round((total - deducciones) * 100) / 100;
    const movs = [
      { num_cuenta: m.cuenta_nomina_gasto, concepto_mov: `Nómina ${row.empleado_nombre || row.referencia || ''}`, cargo: total, abono: 0 },
      { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Pago nómina`, cargo: 0, abono: neto },
    ];
    if (deducciones > 0) movs.push({ num_cuenta: m.cuenta_otras_deducciones, concepto_mov: `Deducciones`, cargo: 0, abono: deducciones });
    return {
      tipo: m.tipo_poliza_nomina, fecha: fechaStr(row.fecha_pago, fechaStr(row.fecha, new Date().toISOString().substring(0, 10))),
      concepto: `Nómina ${row.empleado_nombre || row.referencia || ''}`,
      movimientos: movs,
      erp_source: 'nomina', erp_id: String(row.id),
    };
  },
  bancos: (row, m) => {
    const monto = f(row.monto);
    const tipo = String(row.tipo || '').toLowerCase();
    if (tipo === 'ingreso') {
      return {
        tipo: m.tipo_poliza_bancos, fecha: fechaStr(row.fecha, new Date().toISOString().substring(0, 10)),
        concepto: `Ingreso banco: ${row.concepto || ''}`,
        movimientos: [
          { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Ingreso`, cargo: monto, abono: 0 },
          { num_cuenta: m.cuenta_contrapartida_ingreso_bancos, concepto_mov: `Contrapartida`, cargo: 0, abono: monto },
        ],
        erp_source: 'bancos', erp_id: String(row.id),
      };
    }
    return {
      tipo: m.tipo_poliza_bancos, fecha: fechaStr(row.fecha, new Date().toISOString().substring(0, 10)),
      concepto: `Egreso banco: ${row.concepto || ''}`,
      movimientos: [
        { num_cuenta: m.cuenta_contrapartida_egreso_bancos, concepto_mov: `Egreso`, cargo: monto, abono: 0 },
        { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Contrapartida`, cargo: 0, abono: monto },
      ],
      erp_source: 'bancos', erp_id: String(row.id),
    };
  },
};

export function ingestRouter(coiService: CoiService, supabase: SupabaseClient | null): Router {
  const router = Router();

  // POST /ingest/:source — Backward-compatible with Python bridge
  router.post('/:source', async (req: Request, res: Response) => {
    const source = req.params.source;
    if (!BUILDERS[source]) {
      res.status(400).json({ ok: false, error: `Unknown source: ${source}. Valid: venta, compra, factura, nomina, bancos` });
      return;
    }

    const row = req.body;
    if (!row || !row.id) {
      res.status(400).json({ ok: false, error: 'Missing row data or id' });
      return;
    }

    try {
      const mapping = await getMapping(supabase);
      const input = BUILDERS[source](row, mapping);
      const result = coiService.crearPolizaYAfectar(input);

      if (result.skipped) {
        res.json({ ok: true, skipped: true, poliza_id: result.poliza_id, message: 'Already synced' });
        return;
      }

      if (!result.ok) {
        res.status(500).json({ ok: false, error: result.error });
        return;
      }

      res.json({ ok: true, poliza_id: result.poliza_id, numero_poliza: result.numero_poliza });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}