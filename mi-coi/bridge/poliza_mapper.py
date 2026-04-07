"""
Construye movimientos para ContabilidadService a partir de filas ERP (JSON).
Las cuentas deben existir en el catálogo COI — editar ssepi_erp_mapping.json.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple

from config import get_db_path
from backend.services.contabilidad_service import ContabilidadService

from .sync_state import ensure_sync_table, get_synced_poliza_id, mark_synced


def _mapping_path() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "ssepi_erp_mapping.json")


def load_mapping() -> Dict[str, Any]:
    path = _mapping_path()
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    return d if isinstance(d, dict) else {}


def _f(x: Any) -> float:
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def _fecha_venta(row: Dict[str, Any]) -> str:
    fp = (row.get("fecha_pago") or "").strip()
    if fp and len(fp) >= 10:
        return fp[:10]
    f = (row.get("fecha") or "").strip()
    if f and len(f) >= 10:
        return f[:10]
    return f[:10] if f else ""


def _fecha_compra(row: Dict[str, Any]) -> str:
    fr = (row.get("fecha_requerida") or "").strip()
    if fr and len(fr) >= 10:
        return fr[:10]
    fc = row.get("fecha_creacion") or row.get("updated_at") or ""
    s = str(fc).strip()
    if len(s) >= 10:
        return s[:10]
    return s[:10] if s else ""


def build_movimientos_venta(row: Dict[str, Any], m: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    total = _f(row.get("total"))
    sub = _f(row.get("subtotal"))
    iva = _f(row.get("iva"))
    if sub <= 0 and total > 0:
        sub = round(total / 1.16, 2)
    if iva <= 0 and total > 0:
        iva = round(total - sub, 2)
    # Ajuste fino por redondeo
    if abs(sub + iva - total) > 0.02 and total > 0:
        iva = round(total - sub, 2)

    caja = m.get("cuenta_caja_mn") or "101.01"
    ing = m.get("cuenta_ingresos_ventas") or "401.01"
    ivac = m.get("cuenta_iva_trasladado_por_pagar") or "208.01"

    movs: List[Dict[str, Any]] = [
        {
            "num_cuenta": str(caja).strip(),
            "concepto_mov": f"COBRO SSEPI Venta {row.get('folio') or row.get('id')}",
            "cargo": total,
            "abono": 0,
            "cliente_rfc": (row.get("rfc") or "") or "",
            "cliente_nombre": (row.get("cliente") or "") or "",
        },
        {
            "num_cuenta": str(ing).strip(),
            "concepto_mov": f"Ingreso venta {row.get('folio') or ''}",
            "cargo": 0,
            "abono": sub,
        },
        {
            "num_cuenta": str(ivac).strip(),
            "concepto_mov": "IVA trasladado",
            "cargo": 0,
            "abono": iva,
        },
    ]
    fecha = _fecha_venta(row)
    concepto = f"SSEPI ERP Venta {row.get('folio') or row.get('id')}"
    return movs, fecha, concepto


def build_movimientos_compra(row: Dict[str, Any], m: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    total = _f(row.get("total"))
    sub = _f(row.get("subtotal"))
    iva = _f(row.get("iva"))
    if sub <= 0 and total > 0:
        sub = round(total / 1.16, 2)
    if iva <= 0 and total > 0:
        iva = round(total - sub, 2)
    if abs(sub + iva - total) > 0.02 and total > 0:
        iva = round(total - sub, 2)

    gasto = m.get("cuenta_compras_gasto") or "501.01"
    ivac = m.get("cuenta_iva_acreditable") or "118.01"
    prov = m.get("cuenta_proveedores_por_pagar") or "201.01"

    movs = [
        {
            "num_cuenta": str(gasto).strip(),
            "concepto_mov": f"Compra {row.get('folio') or row.get('id')}",
            "cargo": sub,
            "abono": 0,
        },
        {
            "num_cuenta": str(ivac).strip(),
            "concepto_mov": "IVA acreditable",
            "cargo": iva,
            "abono": 0,
        },
        {
            "num_cuenta": str(prov).strip(),
            "concepto_mov": f"Proveedor {row.get('proveedor') or ''}",
            "cargo": 0,
            "abono": total,
        },
    ]
    fecha = _fecha_compra(row)
    concepto = f"SSEPI ERP Compra {row.get('folio') or row.get('id')}"
    return movs, fecha, concepto


def build_movimientos_factura(row: Dict[str, Any], m: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    total = _f(row.get("total") or row.get("monto_total"))
    sub = _f(row.get("subtotal"))
    iva = _f(row.get("iva"))
    if sub <= 0 and total > 0:
        sub = round(total / 1.16, 2)
    if iva <= 0 and total > 0:
        iva = round(total - sub, 2)
    if abs(sub + iva - total) > 0.02 and total > 0:
        iva = round(total - sub, 2)

    banco = m.get("cuenta_banco_mn") or m.get("cuenta_caja_mn") or "101.01"
    ing = m.get("cuenta_ingresos_servicios") or m.get("cuenta_ingresos_ventas") or "401.01"
    ivac = m.get("cuenta_iva_trasladado_por_pagar") or "208.01"

    folio = row.get("folio_factura") or row.get("folio") or row.get("id")
    movs: List[Dict[str, Any]] = [
        {
            "num_cuenta": str(banco).strip(),
            "concepto_mov": f"COBRO SSEPI Factura {folio}",
            "cargo": total,
            "abono": 0,
            "cliente_rfc": (row.get("rfc") or "") or "",
            "cliente_nombre": (row.get("cliente") or "") or "",
        },
        {
            "num_cuenta": str(ing).strip(),
            "concepto_mov": f"Ingreso factura {folio}",
            "cargo": 0,
            "abono": sub,
        },
        {
            "num_cuenta": str(ivac).strip(),
            "concepto_mov": "IVA trasladado",
            "cargo": 0,
            "abono": iva,
        },
    ]
    fecha = (str(row.get("fecha_emision") or row.get("created_at") or row.get("fecha_pago") or "")[:10]).strip()
    concepto = f"SSEPI ERP Factura {folio}"
    return movs, fecha, concepto


def build_movimientos_nomina(row: Dict[str, Any], m: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    total = _f(row.get("total"))
    ded = _f(row.get("deducciones"))
    # Simplificación: gasto por nómina (total bruto aprox) contra banco;
    # deducciones opcionalmente a cuenta puente si vienen capturadas.
    banco = m.get("cuenta_banco_mn") or m.get("cuenta_caja_mn") or "101.01"
    gasto = m.get("cuenta_nomina_gasto") or "601.01"
    ded_cta = m.get("cuenta_otras_deducciones") or "209.99"

    nombre = row.get("empleado_nombre") or ""
    ref = row.get("referencia") or row.get("id") or ""
    concepto_base = f"Nómina {ref} {nombre}".strip()

    movs: List[Dict[str, Any]] = [
        {"num_cuenta": str(gasto).strip(), "concepto_mov": concepto_base, "cargo": total, "abono": 0},
        {"num_cuenta": str(banco).strip(), "concepto_mov": f"Pago nómina {ref}", "cargo": 0, "abono": max(total - ded, 0.0)},
    ]
    if ded > 0:
        movs.append({"num_cuenta": str(ded_cta).strip(), "concepto_mov": "Deducciones nómina", "cargo": 0, "abono": ded})

    fecha = (str(row.get("fecha_pago") or "")[:10]).strip()
    concepto = f"SSEPI ERP Nómina {ref}".strip()
    return movs, fecha, concepto


def build_movimientos_bancos(row: Dict[str, Any], m: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str, str]:
    monto = _f(row.get("monto"))
    tipo = str(row.get("tipo") or "").strip().lower()  # ingreso/egreso
    concepto = (row.get("concepto") or "Movimiento banco").strip()
    fecha = (str(row.get("fecha") or row.get("fecha_creacion") or "")[:10]).strip()

    banco = m.get("cuenta_banco_mn") or m.get("cuenta_caja_mn") or "101.01"
    cta_ing = m.get("cuenta_contrapartida_ingreso_bancos") or "401.01"
    cta_egr = m.get("cuenta_contrapartida_egreso_bancos") or "601.01"

    if tipo == "ingreso":
        movs = [
            {"num_cuenta": str(banco).strip(), "concepto_mov": concepto, "cargo": monto, "abono": 0},
            {"num_cuenta": str(cta_ing).strip(), "concepto_mov": "Contrapartida ingreso", "cargo": 0, "abono": monto},
        ]
    else:
        movs = [
            {"num_cuenta": str(cta_egr).strip(), "concepto_mov": "Contrapartida egreso", "cargo": monto, "abono": 0},
            {"num_cuenta": str(banco).strip(), "concepto_mov": concepto, "cargo": 0, "abono": monto},
        ]
    return movs, fecha, f"SSEPI ERP Bancos {concepto}"


def ingest_venta(row: Dict[str, Any]) -> Dict[str, Any]:
    db_path = get_db_path()
    ensure_sync_table(db_path)
    eid = str(row.get("id") or "").strip()
    if not eid:
        return {"ok": False, "error": "Falta id de venta"}

    if row.get("tipo") == "cotizacion":
        return {"ok": False, "error": "No es venta contable (cotización)"}
    if (row.get("estatus_pago") or "") != "Pagado":
        return {"ok": False, "error": "Venta no está Pagado"}

    existing = get_synced_poliza_id(db_path, "venta", eid)
    if existing is not None:
        return {"ok": True, "skipped": True, "poliza_id": existing, "mensaje": "Ya sincronizada"}

    m = load_mapping()
    tipo = (m.get("tipo_poliza_venta") or "INGRESO").strip().upper()
    movs, fecha, concepto = build_movimientos_venta(row, m)
    if not fecha:
        return {"ok": False, "error": "Sin fecha válida (fecha_pago/fecha)"}

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(tipo, fecha, concepto, movs)
    if not r.get("exito"):
        return {"ok": False, "error": r.get("error") or r.get("mensaje") or str(r)}

    pid = int(r["poliza_id"])
    mark_synced(db_path, "venta", eid, pid)
    return {"ok": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}


def ingest_compra(row: Dict[str, Any]) -> Dict[str, Any]:
    db_path = get_db_path()
    ensure_sync_table(db_path)
    eid = str(row.get("id") or "").strip()
    if not eid:
        return {"ok": False, "error": "Falta id de compra"}

    try:
        est = int(row.get("estado"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "Estado de compra inválido"}
    if est < 4:
        return {"ok": False, "error": "Compra debe estar Recibida (4) o Entregada (5)"}

    existing = get_synced_poliza_id(db_path, "compra", eid)
    if existing is not None:
        return {"ok": True, "skipped": True, "poliza_id": existing, "mensaje": "Ya sincronizada"}

    m = load_mapping()
    tipo = (m.get("tipo_poliza_compra") or "EGRESO").strip().upper()
    movs, fecha, concepto = build_movimientos_compra(row, m)
    if not fecha:
        return {"ok": False, "error": "Sin fecha válida"}

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(tipo, fecha, concepto, movs)
    if not r.get("exito"):
        return {"ok": False, "error": r.get("error") or r.get("mensaje") or str(r)}

    pid = int(r["poliza_id"])
    mark_synced(db_path, "compra", eid, pid)
    return {"ok": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}


def ingest_factura(row: Dict[str, Any]) -> Dict[str, Any]:
    db_path = get_db_path()
    ensure_sync_table(db_path)
    eid = str(row.get("id") or row.get("uuid_cfdi") or row.get("folio_factura") or "").strip()
    if not eid:
        return {"ok": False, "error": "Falta id/uuid de factura"}

    existing = get_synced_poliza_id(db_path, "factura", eid)
    if existing is not None:
        return {"ok": True, "skipped": True, "poliza_id": existing, "mensaje": "Ya sincronizada"}

    m = load_mapping()
    tipo = (m.get("tipo_poliza_factura") or "INGRESO").strip().upper()
    movs, fecha, concepto = build_movimientos_factura(row, m)
    if not fecha:
        return {"ok": False, "error": "Sin fecha válida (fecha_emision)"}

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(tipo, fecha, concepto, movs)
    if not r.get("exito"):
        return {"ok": False, "error": r.get("error") or r.get("mensaje") or str(r)}

    pid = int(r["poliza_id"])
    mark_synced(db_path, "factura", eid, pid)
    return {"ok": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}


def ingest_nomina(row: Dict[str, Any]) -> Dict[str, Any]:
    db_path = get_db_path()
    ensure_sync_table(db_path)
    eid = str(row.get("id") or row.get("referencia") or "").strip()
    if not eid:
        return {"ok": False, "error": "Falta id/referencia de nómina"}

    existing = get_synced_poliza_id(db_path, "nomina", eid)
    if existing is not None:
        return {"ok": True, "skipped": True, "poliza_id": existing, "mensaje": "Ya sincronizada"}

    m = load_mapping()
    tipo = (m.get("tipo_poliza_nomina") or "EGRESO").strip().upper()
    movs, fecha, concepto = build_movimientos_nomina(row, m)
    if not fecha:
        return {"ok": False, "error": "Sin fecha válida (fecha_pago)"}

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(tipo, fecha, concepto, movs)
    if not r.get("exito"):
        return {"ok": False, "error": r.get("error") or r.get("mensaje") or str(r)}

    pid = int(r["poliza_id"])
    mark_synced(db_path, "nomina", eid, pid)
    return {"ok": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}


def ingest_bancos(row: Dict[str, Any]) -> Dict[str, Any]:
    db_path = get_db_path()
    ensure_sync_table(db_path)
    eid = str(row.get("id") or "").strip()
    if not eid:
        # para movimientos creados sin id en payload, usa combinación fecha+concepto+monto
        eid = f"{row.get('fecha')}-{row.get('concepto')}-{row.get('monto')}"

    existing = get_synced_poliza_id(db_path, "bancos", eid)
    if existing is not None:
        return {"ok": True, "skipped": True, "poliza_id": existing, "mensaje": "Ya sincronizada"}

    m = load_mapping()
    tipo = (m.get("tipo_poliza_bancos") or "DIARIO").strip().upper()
    movs, fecha, concepto = build_movimientos_bancos(row, m)
    if not fecha:
        return {"ok": False, "error": "Sin fecha válida (fecha)"}

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(tipo, fecha, concepto, movs)
    if not r.get("exito"):
        return {"ok": False, "error": r.get("error") or r.get("mensaje") or str(r)}

    pid = int(r["poliza_id"])
    mark_synced(db_path, "bancos", eid, pid)
    return {"ok": True, "poliza_id": pid, "numero_poliza": r.get("numero_poliza")}
