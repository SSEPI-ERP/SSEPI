# -*- coding: utf-8 -*-
"""Actualización masiva de tipos (MXN por unidad) vía ECB/Frankfurter con base EUR."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

import requests

from backend.models.monedas_catalogo import CatalogoMonedas
from backend.modules.tipo_cambio_referencia import consultar_frankfurter_iso_a_mxn

FRANKFURTER_BASE = "https://api.frankfurter.app"

# Si /currencies falla o devuelve vacío, no pedir 150 ISO a la vez (rompe la API).
# Lista de referencia alineada con Frankfurter/ECB (se actualiza vía red cuando hay conexión).
ISO_FRANKFURTER_FIJO: frozenset[str] = frozenset({
    "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
    "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
    "NOK", "NZD", "PHP", "PLN", "RON", "RUB", "SEK", "SGD", "THB", "TRY",
    "USD", "ZAR", "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AWG",
    "AZN", "BAM", "BBD", "BDT", "BHD", "BIF", "BMD", "BND", "BOB", "BSD",
    "BWP", "BYN", "BZD", "CLP", "COP", "CRC", "CUP", "CVE", "DJF", "DOP",
    "DZD", "EGP", "ERN", "ETB", "FJD", "FKP", "GEL", "GHS", "GIP", "GMD",
    "GNF", "GTQ", "GYD", "HNL", "HTG", "IQD", "IRR", "JMD", "JOD", "KES",
    "KGS", "KHR", "KMF", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD",
    "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU",
    "MUR", "MVR", "MWK", "MXV", "MZN", "NAD", "NGN", "NIO", "NPR", "OMR",
    "PAB", "PEN", "PGK", "PKR", "PYG", "QAR", "RSD", "RWF", "SAR", "SBD",
    "SCR", "SDG", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC",
    "SZL", "TJS", "TMT", "TND", "TOP", "TTD", "TWD", "TZS", "UAH", "UGX",
    "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR",
    "XOF", "XPF", "YER", "ZMW", "ZWL",
})

_soportados_cache: Optional[Set[str]] = None


def monedas_frankfurter_soportadas() -> Set[str]:
    global _soportados_cache
    if _soportados_cache is not None and len(_soportados_cache) > 0:
        return _soportados_cache
    try:
        r = requests.get(
            f"{FRANKFURTER_BASE}/currencies",
            timeout=25,
            headers={"User-Agent": "mi-coi/1.0 (tipo cambio masivo)"},
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and len(data) > 5:
            _soportados_cache = {str(k).upper()[:3] for k in data.keys()}
            return _soportados_cache
    except Exception:
        pass
    _soportados_cache = set(ISO_FRANKFURTER_FIJO)
    return _soportados_cache


def _fetch_rates_eur_chunks(
    fecha: str,
    codigos: List[str],
    timeout: int,
    permitidos: Set[str],
) -> Tuple[Dict[str, float], str]:
    """
    `codigos`: ISO (sin EUR). Se pide base EUR y `to` incluye MXN y cada código.
    Devuelve rates[XXX] = unidades de XXX por 1 EUR, y fecha publicada.
    """
    codigos = sorted({c.strip().upper()[:3] for c in codigos if c and c.upper()[:3] != "EUR"})
    codigos = [c for c in codigos if c in permitidos]
    if "MXN" not in codigos:
        codigos = ["MXN"] + codigos
    rates: Dict[str, float] = {}
    fecha_pub = fecha
    url = f"{FRANKFURTER_BASE}/{fecha}"
    # Frankfurter admite varios `to` separados por coma; troceamos por longitud de URL
    i = 0
    while i < len(codigos):
        chunk = codigos[i : i + 22]
        i += len(chunk)
        to_param = ",".join(chunk)
        resp = requests.get(
            url,
            params={"from": "EUR", "to": to_param},
            timeout=timeout,
            headers={"User-Agent": "mi-coi/1.0 (tipo cambio masivo)"},
        )
        if resp.status_code != 200:
            raise ValueError(f"Frankfurter HTTP {resp.status_code}: {resp.text[:160]}")
        data = resp.json()
        fecha_pub = str(data.get("date") or fecha)[:10]
        for k, v in (data.get("rates") or {}).items():
            kk = str(k).upper()[:3]
            try:
                rates[kk] = float(v)
            except (TypeError, ValueError):
                pass
    mxn = rates.get("MXN")
    if mxn is None or mxn <= 0:
        raise ValueError("Frankfurter no devolvió MXN en las tasas EUR.")
    return rates, fecha_pub


def _tc_es_placeholder(val: object) -> bool:
    """Semilla del catálogo ~1.0; no confundir con divisas fuertes (p. ej. JPY << 1 MXN)."""
    try:
        v = float(val)
    except (TypeError, ValueError):
        return True
    if v <= 0:
        return True
    return 0.9999 <= v <= 1.0001


def actualizar_catalogo_tipos_frankfurter_eur(
    mgr: CatalogoMonedas,
    fecha_ui: str,
    timeout: int = 40,
) -> int:
    """
    Para cada moneda del catálogo (excepto MXN), si Frankfurter publica par vía EUR,
    actualiza tipo_cambio = MXN por 1 unidad de esa moneda.
    Reintenta hasta 5 días hacia atrás si el día solicitado no tiene datos.
    Devuelve número de filas actualizadas.
    """
    soport = monedas_frankfurter_soportadas()
    permitidos = soport | ISO_FRANKFURTER_FIJO
    rows = mgr.listar()
    codigos: List[str] = []
    # MXV (UDI) y similares no son tipo de cambio spot como divisas
    excluir = {"MXN", "MXV", "XXX"}
    for row in rows:
        cf = (row.get("clave_fiscal") or "").strip().upper()[:3]
        if cf in excluir:
            continue
        if cf not in soport:
            continue
        if cf == "EUR":
            continue
        codigos.append(cf)
    has_eur = any((row.get("clave_fiscal") or "").strip().upper()[:3] == "EUR" for row in rows)
    if not codigos and not has_eur:
        return 0
    codigos_fetch = sorted(set(codigos))
    if "MXN" not in codigos_fetch:
        codigos_fetch = ["MXN"] + codigos_fetch

    f0 = (fecha_ui or "").strip()[:10]
    d0 = datetime.strptime(f0, "%Y-%m-%d")
    rates: Dict[str, float] = {}
    fecha_pub = f0
    last_err: Optional[Exception] = None
    for off in range(5):
        day = (d0 - timedelta(days=off)).strftime("%Y-%m-%d")
        try:
            rates, fecha_pub = _fetch_rates_eur_chunks(day, codigos_fetch, timeout, permitidos)
            last_err = None
            break
        except Exception as e:
            last_err = e
            continue

    n = 0
    ref_fecha = f0
    if last_err is None and rates:
        mxn_per_eur = rates["MXN"]
        ref_fecha = fecha_pub
        for row in rows:
            cf = (row.get("clave_fiscal") or "").strip().upper()[:3]
            if cf in excluir:
                continue
            if cf not in soport:
                continue
            if cf == "EUR":
                tc = float(mxn_per_eur)
            else:
                r = rates.get(cf)
                if r is None or r <= 0:
                    continue
                # Frankfurter EUR-base: r[cf] = unidades de cf por 1 EUR → MXN por 1 cf = MXN/EUR ÷ (cf/EUR).
                # Misma idea que MXN/USD ÷ (extranjero/USD) con base dólar.
                tc = float(mxn_per_eur) / float(r)
            res = mgr.actualizar_tc_por_clave_fiscal(cf, tc, fecha_pub)
            if res.get("exito") and res.get("actualizado"):
                n += 1

    # Monedas que sigan en ~1.0 (no en Frankfurter por lote o sin tasa EUR): par a par.
    rows2 = mgr.listar()
    pendientes: List[str] = []
    for row in rows2:
        cf = (row.get("clave_fiscal") or "").strip().upper()[:3]
        if not cf or len(cf) != 3 or cf in excluir:
            continue
        if not _tc_es_placeholder(row.get("tipo_cambio")):
            continue
        pendientes.append(cf)
    pendientes = sorted(set(pendientes))
    cap = 180
    if len(pendientes) > cap:
        pendientes = pendientes[:cap]
    workers = min(12, max(1, len(pendientes)))
    t_iso = min(timeout, 22)

    def _uno(cf_iso: str) -> Tuple[str, Optional[float], Optional[str]]:
        try:
            tc, d = consultar_frankfurter_iso_a_mxn(cf_iso, ref_fecha, t_iso)
            if tc is not None and float(tc) > 0:
                return cf_iso, float(tc), d
        except Exception:
            pass
        return cf_iso, None, None

    if pendientes:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = [pool.submit(_uno, cf) for cf in pendientes]
            for fut in as_completed(futs):
                cf_iso, tc, d = fut.result()
                if tc is None:
                    continue
                res = mgr.actualizar_tc_por_clave_fiscal(cf_iso, tc, (d or ref_fecha)[:10])
                if res.get("exito") and res.get("actualizado"):
                    n += 1
    return n
