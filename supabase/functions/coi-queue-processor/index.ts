// SSEPI COI Queue Processor — Supabase Edge Function
// Processes coi_sync_queue items, validates payloads, maps accounts,
// and writes poliza records to coi_polizas/coi_movimientos in Postgres.
//
// Trigger: invoked via Supabase pg_cron or manually via Supabase SQL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== TYPES ====================

interface QueueItem {
  id: string;
  erp_source: 'venta' | 'compra' | 'factura' | 'nomina' | 'bancos';
  erp_id: string;
  folio: string | null;
  idempotency_key: string;
  payload_json: Record<string, unknown>;
  status: string;
  created_at: string;
}

interface PolizaMovement {
  num_cuenta: string;
  concepto_mov: string;
  cargo: number;
  abono: number;
  cliente_rfc?: string;
  cliente_nombre?: string;
}

interface AccountMapping {
  [key: string]: string;
}

// ==================== ACCOUNT MAPPING ====================

const DEFAULT_MAPPING: AccountMapping = {
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

let mappingCache: AccountMapping | null = null;
let mappingCacheTime = 0;
const MAPPING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getMapping(supabase: any): Promise<AccountMapping> {
  const now = Date.now();
  if (mappingCache && (now - mappingCacheTime) < MAPPING_CACHE_TTL) {
    return mappingCache;
  }
  try {
    const { data, error } = await supabase
      .from('coi_account_mapping')
      .select('key, value');
    if (!error && data && data.length > 0) {
      const mapping: AccountMapping = { ...DEFAULT_MAPPING };
      for (const row of data) {
        mapping[row.key] = row.value;
      }
      mappingCache = mapping;
      mappingCacheTime = now;
      return mapping;
    }
  } catch (_) { /* fall through to default */ }
  mappingCache = { ...DEFAULT_MAPPING };
  mappingCacheTime = now;
  return mappingCache;
}

// ==================== HELPERS ====================

function f(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function calcIvaSubtotal(total: number, subtotal: number, iva: number, defaultRate: number): { subtotal: number; iva: number } {
  let sub = subtotal;
  let ivaCalc = iva;
  const rate = defaultRate || 0.16;
  if (sub <= 0 && total > 0) sub = Math.round(total / (1 + rate) * 100) / 100;
  if (ivaCalc <= 0 && total > 0) ivaCalc = Math.round((total - sub) * 100) / 100;
  if (Math.abs(sub + ivaCalc - total) > 0.02) ivaCalc = Math.round((total - sub) * 100) / 100;
  return { subtotal: sub, iva: ivaCalc };
}

function fechaStr(val: unknown, fallback: string): string {
  if (!val) return fallback;
  const s = String(val).trim();
  if (s.length >= 10) return s.substring(0, 10);
  return fallback;
}

function escStr(val: unknown): string {
  return val ? String(val).substring(0, 500) : '';
}

// ==================== POLIZA BUILDERS ====================

function buildMovimientosVenta(row: Record<string, unknown>, m: AccountMapping): PolizaMovement[] {
  const total = f(row.total);
  const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
  return [
    { num_cuenta: m.cuenta_caja_mn, concepto_mov: `Venta ${row.folio || row.id || ''}`, cargo: total, abono: 0, cliente_rfc: escStr(row.rfc), cliente_nombre: escStr(row.cliente) },
    { num_cuenta: m.cuenta_ingresos_ventas, concepto_mov: `Ingreso venta ${row.folio || ''}`, cargo: 0, abono: subtotal },
    { num_cuenta: m.cuenta_iva_trasladado_por_pagar, concepto_mov: `IVA venta ${row.folio || ''}`, cargo: 0, abono: iva },
  ];
}

function buildMovimientosCompra(row: Record<string, unknown>, m: AccountMapping): PolizaMovement[] {
  const total = f(row.total);
  const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
  return [
    { num_cuenta: m.cuenta_compras_gasto, concepto_mov: `Compra ${row.folio || row.id || ''}`, cargo: subtotal, abono: 0 },
    { num_cuenta: m.cuenta_iva_acreditable, concepto_mov: `IVA compra ${row.folio || ''}`, cargo: iva, abono: 0 },
    { num_cuenta: m.cuenta_proveedores_por_pagar, concepto_mov: `Proveedor ${row.proveedor || ''}`, cargo: 0, abono: total, cliente_rfc: escStr(row.rfc_proveedor), cliente_nombre: escStr(row.proveedor) },
  ];
}

function buildMovimientosFactura(row: Record<string, unknown>, m: AccountMapping): PolizaMovement[] {
  const total = f(row.total);
  const { subtotal, iva } = calcIvaSubtotal(total, f(row.subtotal), f(row.iva), f(m.iva_default_rate, 0.16));
  const cuentaCargo = (String(row.metodo_pago || '').toLowerCase().includes('transferencia') || String(row.metodo_pago || '').toLowerCase().includes('banco'))
    ? m.cuenta_banco_mn : m.cuenta_caja_mn;
  return [
    { num_cuenta: cuentaCargo, concepto_mov: `Factura ${row.folio_factura || row.folio || ''}`, cargo: total, abono: 0, cliente_rfc: escStr(row.rfc), cliente_nombre: escStr(row.cliente) },
    { num_cuenta: m.cuenta_ingresos_servicios, concepto_mov: `Ingreso factura`, cargo: 0, abono: subtotal },
    { num_cuenta: m.cuenta_iva_trasladado_por_pagar, concepto_mov: `IVA factura`, cargo: 0, abono: iva },
  ];
}

function buildMovimientosNomina(row: Record<string, unknown>, m: AccountMapping): PolizaMovement[] {
  const total = f(row.total);
  const deducciones = f(row.deducciones, 0);
  const neto = Math.round((total - deducciones) * 100) / 100;
  const movs: PolizaMovement[] = [
    { num_cuenta: m.cuenta_nomina_gasto, concepto_mov: `Nómina ${row.empleado_nombre || row.referencia || ''}`, cargo: total, abono: 0 },
    { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Pago nómina`, cargo: 0, abono: neto },
  ];
  if (deducciones > 0) {
    movs.push({ num_cuenta: m.cuenta_otras_deducciones, concepto_mov: `Deducciones nómina`, cargo: 0, abono: deducciones });
  }
  return movs;
}

function buildMovimientosBancos(row: Record<string, unknown>, m: AccountMapping): PolizaMovement[] {
  const monto = f(row.monto);
  const tipo = String(row.tipo || '').toLowerCase();
  if (tipo === 'ingreso') {
    return [
      { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Ingreso banco: ${row.concepto || ''}`, cargo: monto, abono: 0 },
      { num_cuenta: m.cuenta_contrapartida_ingreso_bancos, concepto_mov: `Contrapartida ingreso`, cargo: 0, abono: monto },
    ];
  }
  return [
    { num_cuenta: m.cuenta_contrapartida_egreso_bancos, concepto_mov: `Egreso banco: ${row.concepto || ''}`, cargo: monto, abono: 0 },
    { num_cuenta: m.cuenta_banco_mn, concepto_mov: `Contrapartida egreso`, cargo: 0, abono: monto },
  ];
}

const BUILDERS: Record<string, (row: Record<string, unknown>, m: AccountMapping) => PolizaMovement[]> = {
  venta: buildMovimientosVenta,
  compra: buildMovimientosCompra,
  factura: buildMovimientosFactura,
  nomina: buildMovimientosNomina,
  bancos: buildMovimientosBancos,
};

// ==================== ELIGIBILITY CHECKS ====================

function isEligible(source: string, row: Record<string, unknown>): boolean {
  switch (source) {
    case 'venta':
      return row.tipo !== 'cotizacion' && row.estatus_pago === 'Pagado';
    case 'compra':
      return Number(row.estado) >= 4;
    case 'factura':
    case 'nomina':
    case 'bancos':
      return true;
    default:
      return false;
  }
}

function getFecha(row: Record<string, unknown>, source: string): string {
  switch (source) {
    case 'venta':
      return fechaStr(row.fecha_pago, fechaStr(row.fecha, new Date().toISOString().substring(0, 10)));
    case 'compra':
      return fechaStr(row.fecha_requerida, fechaStr(row.fecha_creacion, fechaStr(row.updated_at, new Date().toISOString().substring(0, 10))));
    case 'factura':
      return fechaStr(row.fecha_emision, new Date().toISOString().substring(0, 10));
    case 'nomina':
      return fechaStr(row.fecha_pago, fechaStr(row.fecha, new Date().toISOString().substring(0, 10)));
    case 'bancos':
      return fechaStr(row.fecha, new Date().toISOString().substring(0, 10));
    default:
      return new Date().toISOString().substring(0, 10);
  }
}

function getConcepto(row: Record<string, unknown>, source: string, folio: string | null): string {
  const prefix: Record<string, string> = {
    venta: 'Venta',
    compra: 'Compra',
    factura: 'Factura',
    nomina: 'Nómina',
    bancos: 'Movimiento bancario',
  };
  return `${prefix[source] || source} ${folio || row.id || ''}`.trim();
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let processed = 0;
  let errors = 0;

  try {
    // Fetch pending items
    const { data: items, error: fetchError } = await supabase
      .from('coi_sync_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'No pending items' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mapping = await getMapping(supabase);

    for (const item of items as QueueItem[]) {
      // Claim the item (optimistic lock)
      const { data: claimed, error: claimError } = await supabase
        .from('coi_sync_queue')
        .update({ status: 'processing' })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (claimError || !claimed) {
        continue; // Another processor claimed it
      }

      const row = item.payload_json || {};
      const source = item.erp_source;

      try {
        // Eligibility check
        if (!isEligible(source, row)) {
          await supabase.from('coi_sync_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', item.id);
          await logResult(supabase, source, item, 'skipped', null, null, null, 'Not eligible');
          continue;
        }

        // Build poliza movements
        const builder = BUILDERS[source];
        if (!builder) throw new Error(`Unknown source: ${source}`);

        const movimientos = builder(row, mapping);
        const tipoPoliza = mapping[`tipo_poliza_${source}`] || 'DIARIO';
        const fecha = getFecha(row, source);
        const concepto = getConcepto(row, source, item.folio);
        const total = f(row.total || row.monto);

        // Insert poliza
        const { data: poliza, error: polizaError } = await supabase
          .from('coi_polizas')
          .insert({
            tipo_poliza: tipoPoliza,
            fecha: fecha,
            concepto: concepto,
            erp_source: source,
            erp_id: String(item.erp_id),
            estatus: 'V',
            moneda: 'MXN',
            tipo_cambio: 1.0,
          })
          .select()
          .single();

        if (polizaError) {
          // Check if it's a duplicate (unique constraint violation)
          if (polizaError.code === '23505') {
            await supabase.from('coi_sync_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', item.id);
            await logResult(supabase, source, item, 'skipped', null, null, total, 'Duplicate poliza');
            continue;
          }
          throw polizaError;
        }

        // Insert movements
        if (movimientos.length > 0) {
          const movsData = movimientos.map((m, i) => ({
            poliza_id: poliza.id,
            numero_linea: i + 1,
            num_cuenta: m.num_cuenta,
            concepto_mov: m.concepto_mov,
            cargo: m.cargo,
            abono: m.abono,
            cliente_rfc: m.cliente_rfc || null,
            cliente_nombre: m.cliente_nombre || null,
          }));

          const { error: movsError } = await supabase.from('coi_movimientos').insert(movsData);
          if (movsError) throw movsError;
        }

        // Mark queue item as done
        await supabase.from('coi_sync_queue').update({
          status: 'done',
          processed_at: new Date().toISOString(),
        }).eq('id', item.id);

        await logResult(supabase, source, item, 'ok', poliza.id, poliza.numero_poliza, total, null);
        processed++;

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from('coi_sync_queue').update({
          status: 'error',
          processed_at: new Date().toISOString(),
          last_error: errMsg.substring(0, 2000),
        }).eq('id', item.id);

        await logResult(supabase, source, item, 'error', null, null, null, errMsg.substring(0, 2000));
        errors++;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, processed, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// ==================== LOGGING ====================

async function logResult(
  supabase: any,
  source: string,
  item: QueueItem,
  status: string,
  polizaId: number | null,
  numeroPoliza: number | null,
  monto: number | null,
  errorMessage: string | null
) {
  try {
    await supabase.from('coi_sync_log').insert({
      source,
      erp_id: item.erp_id,
      folio: item.folio,
      status,
      poliza_id: polizaId,
      numero_poliza: numeroPoliza,
      monto,
      error_message: errorMessage,
      detail: { idempotency_key: item.idempotency_key },
    });
  } catch (_) { /* non-critical */ }
}