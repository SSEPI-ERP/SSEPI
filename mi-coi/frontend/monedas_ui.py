# -*- coding: utf-8 -*-
"""Helpers de UI para el módulo Monedas (estilo Aspel COI).

Convención de negocio:
  - El valor mostrado es MXN por 1 unidad de la moneda de la fila (1 = X MXN).

Este archivo solo contiene utilidades de presentación y listas para combos/tablas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Iterable, List, Sequence, Tuple


# Separador simple (ASCII) para verse bien en Windows y evitar problemas de encoding.
SEPARADOR_PREFIX = "-------- "
SEPARADOR_SUFFIX = " --------"


def es_separador_combo(valor: str) -> bool:
    s = (valor or "").strip()
    return s.startswith(SEPARADOR_PREFIX) and s.endswith(SEPARADOR_SUFFIX)


def crear_separador_combo(titulo: str) -> str:
    t = (titulo or "").strip() or "SECCIÓN"
    return f"{SEPARADOR_PREFIX}{t}{SEPARADOR_SUFFIX}"


def fmt_fecha_ddmmyyyy(s: object) -> str:
    if not s:
        return ""
    t = str(s)[:10]
    try:
        d0 = datetime.strptime(t, "%Y-%m-%d")
        return d0.strftime("%d/%m/%Y")
    except Exception:
        return t


def tc_aparenta_semilla_uno(tc: object, cf: str) -> bool:
    """True si el TC parece relleno 1.0000 o inválido (excepto MXN)."""
    if (cf or "").strip().upper()[:3] == "MXN":
        return False
    try:
        v = float(tc)
    except (TypeError, ValueError):
        return True
    return v <= 0 or 0.9999 <= v <= 1.0001


def fmt_valor_mxn_por_unidad(tc: object, cf: str) -> str:
    """Texto único: $X MXN por 1 unidad (con más decimales si es muy pequeño)."""
    cf = (cf or "").strip().upper()[:3] or "MXN"
    if cf == "MXN":
        return "$1.00 MXN"
    try:
        v = float(tc)
    except (TypeError, ValueError):
        return "—"
    if v <= 0:
        return "—"

    abs_tc = abs(v)
    if abs_tc >= 0.01:
        dec = 4
    elif abs_tc >= 0.0001:
        dec = 6
    else:
        dec = 8
    s = f"{v:,.{dec}f}"
    if "." in s:
        i = s.rindex(".")
        ip, fp = s[:i], s[i + 1 :]
        fp = fp.rstrip("0")
        s = ip + ("." + fp if fp else "")
    return f"${s} MXN"


def construir_combo_claves_monedas(
    *,
    lineas_sat: Sequence[str],
    codigo_desde_combo,
    isos_permitidos: Iterable[str],
    isos_banxico: Iterable[str],
) -> List[str]:
    """Lista de valores para combobox con separadores estilo Aspel."""
    allow = {str(x).strip().upper()[:3] for x in (isos_permitidos or []) if x}
    banx = {str(x).strip().upper()[:3] for x in (isos_banxico or []) if x}
    banx.discard("")

    # Secciones
    out: List[str] = []
    out.append(crear_separador_combo("BANXICO (USD/EUR/GBP)"))
    seen = set()

    # Primero Banxico en orden natural del SAT (si existe)
    for ln in lineas_sat:
        c = codigo_desde_combo(ln)
        if c in banx and c in allow and c not in seen:
            out.append(ln)
            seen.add(c)

    # Asegurar MXN siempre visible aunque no estuviera arriba
    if "MXN" in allow and "MXN" not in seen:
        out.append("MXN=Peso mexicano")
        seen.add("MXN")

    out.append(crear_separador_combo("FRANKFURTER / ECB"))
    for ln in lineas_sat:
        c = codigo_desde_combo(ln)
        if c in allow and c not in seen:
            out.append(ln)
            seen.add(c)

    # Si hay ISO permitidos que no estén en la lista SAT, agregarlos al final
    restantes = sorted(allow - seen)
    for code in restantes:
        if not code:
            continue
        out.append(f"{code}=Moneda {code} (TC vía Frankfurter)")
        seen.add(code)

    return out


def filas_monedas_con_separadores(
    rows: Sequence[Dict[str, object]],
    *,
    q: str,
    iso_defecto: Iterable[str],
    iso_banxico: Iterable[str],
) -> List[Tuple[str, Tuple[str, str, str, str, str, str, str], bool]]:
    """
    Devuelve lista de (iid, values_tuple, is_separator_row).
    Inserta separadores cuando hay búsqueda (vista completa).
    """
    q = (q or "").strip().lower()
    buscar_todas = bool(q)
    iso_def = {str(x).strip().upper()[:3] for x in (iso_defecto or []) if x}
    iso_bx = {str(x).strip().upper()[:3] for x in (iso_banxico or []) if x}

    def _fila_vals(r: Dict[str, object]) -> Tuple[str, str, str, str, str, str, str]:
        cf = (r.get("clave_fiscal") or "MXN").strip().upper()[:3]
        par = "—" if cf == "MXN" else f"{cf}/MXN"
        tc = r.get("tipo_cambio") or 0
        act = "Sí" if int(r.get("activa") or 1) == 1 else "No"
        return (
            str(r.get("nombre") or ""),
            str(r.get("simbolo") or ""),
            par,
            fmt_fecha_ddmmyyyy(r.get("fecha_ultimo_cambio")),
            fmt_valor_mxn_por_unidad(tc, cf),
            cf,
            act,
        )

    # Orden base: MXN primero, luego alfabético por ISO
    ordered = list(rows or [])
    ordered.sort(
        key=lambda r: (
            0 if (str(r.get("clave_fiscal") or "MXN").strip().upper()[:3] == "MXN") else 1,
            str(r.get("clave_fiscal") or "").strip().upper(),
        )
    )

    out: List[Tuple[str, Tuple[str, str, str, str, str, str, str], bool]] = []

    if not buscar_todas:
        for r in ordered:
            cf = (str(r.get("clave_fiscal") or "MXN")).strip().upper()[:3]
            if cf not in iso_def:
                continue
            if tc_aparenta_semilla_uno(r.get("tipo_cambio"), cf):
                continue
            vals = _fila_vals(r)
            out.append((str(r.get("id") or ""), vals, False))
        return out

    # Vista completa: agrupar con separadores
    def _match(vals: Tuple[str, ...]) -> bool:
        if not q:
            return True
        return q in " ".join(str(x).lower() for x in vals)

    # Grupo Banxico
    out.append(("sep-banxico", (crear_separador_combo("BANXICO"), "", "", "", "", "", ""), True))
    for r in ordered:
        cf = (str(r.get("clave_fiscal") or "MXN")).strip().upper()[:3]
        if cf not in iso_bx and cf != "MXN":
            continue
        vals = _fila_vals(r)
        if _match(vals):
            out.append((str(r.get("id") or ""), vals, False))

    # Grupo resto
    out.append(("sep-resto", (crear_separador_combo("RESTO (FRANKFURTER/ECB)"), "", "", "", "", "", ""), True))
    for r in ordered:
        cf = (str(r.get("clave_fiscal") or "MXN")).strip().upper()[:3]
        if cf in iso_bx or cf == "MXN":
            continue
        vals = _fila_vals(r)
        if _match(vals):
            out.append((str(r.get("id") or ""), vals, False))

    return out

