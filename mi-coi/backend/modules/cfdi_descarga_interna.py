"""
Descarga interna de CFDIs (COI 11) - implementación local.

En COI 11 real, un "Servicio Interno" optimiza la descarga/consulta.
Aquí implementamos el comportamiento clave para el producto:
- Peticiones por ventana de hasta 4 meses.
- Hasta 5 años hacia atrás (validación).
- Persistencia/ejecución usando indexación de XML (carpeta) como fuente.

Esto permite que UI/flujo/BD queden listos sin depender de WS del SAT.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from config import get_db_path
from backend.modules.cfdi_dashboard import CFDIDashboard


def _parse_ymd(s: str) -> date:
    return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()


def _add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    # clamp day to last day in target month
    from calendar import monthrange

    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def plan_ventanas_4_meses(desde: str, hasta: str) -> List[Tuple[str, str]]:
    d0 = _parse_ymd(desde)
    d1 = _parse_ymd(hasta)
    if d1 < d0:
        d0, d1 = d1, d0
    out: List[Tuple[str, str]] = []
    cur = d0
    while cur <= d1:
        nxt = _add_months(cur, 4)
        # ventana: [cur, min(nxt - 1 día, d1)]
        end = min(date.fromordinal(nxt.toordinal() - 1), d1)
        out.append((cur.isoformat(), end.isoformat()))
        cur = nxt
    return out


def validar_rango_5_anios(desde: str, hasta: str) -> Optional[str]:
    try:
        d0 = _parse_ymd(desde)
        d1 = _parse_ymd(hasta)
    except Exception:
        return "Fechas inválidas (YYYY-MM-DD)."
    if d1 < d0:
        d0, d1 = d1, d0
    # Hasta 5 años hacia atrás desde hoy (regla del texto)
    hoy = date.today()
    limite = date(hoy.year - 5, hoy.month, min(hoy.day, 28))
    if d0 < limite:
        return f"El rango excede 5 años hacia atrás (desde {limite.isoformat()})."
    return None


def ejecutar_descarga_interna_desde_carpeta(
    *,
    db_path: Optional[str] = None,
    carpeta_xml: str,
    desde_ymd: str,
    hasta_ymd: str,
    proveedor: str = "SERVICIO_INTERNO",
    recursive: bool = False,
    copiar_a_facturas: bool = False,
) -> Dict[str, Any]:
    db_path = db_path or get_db_path()
    err = validar_rango_5_anios(desde_ymd, hasta_ymd)
    if err:
        return {"exito": False, "error": err}
    dash = CFDIDashboard(db_path=db_path)
    ventanas = plan_ventanas_4_meses(desde_ymd, hasta_ymd)
    tot = {
        "exito": True,
        "ventanas": ventanas,
        "leidos": 0,
        "considerados": 0,
        "insertados": 0,
        "actualizados": 0,
        "errores": 0,
        "uuid_en_poliza": 0,
        "detalle_error": [],
    }
    for d0, d1 in ventanas:
        r = dash.indexar_carpeta_externa_por_rango(
            carpeta_xml,
            desde_ymd=d0,
            hasta_ymd=d1,
            proveedor=proveedor,
            recursive=recursive,
            copiar_a_facturas=copiar_a_facturas,
        )
        if not r.get("exito"):
            return {"exito": False, "error": r.get("error", "No se pudo indexar carpeta.")}
        for k in ("leidos", "considerados", "insertados", "actualizados", "errores", "uuid_en_poliza"):
            tot[k] += int(r.get(k) or 0)
        if r.get("detalle_error"):
            tot["detalle_error"].extend(r["detalle_error"])
    return tot

