# Tipos de cambio vía API pública (sin token). Referencia ECB vía Frankfurter.
# https://www.frankfurter.app/docs/
#
# Convención ERP (SSEPI / catálogo Monedas):
#   tipo_cambio guardado y mostrado = cuántos MXN equivalen a **1 unidad** de moneda extranjera
#   (pregunta: «¿cuántos pesos necesito para 1 USD / 1 COP / 1 JPY?»).
#   Ej.: 1 USD = 16.70 MXN → 16.70 ; 1 COP = 0.0043 MXN → 0.0043 ; 1 JPY = 0.11 MXN → 0.11.
#
# Trampa típica de APIs con base USD: devuelven «cuántas unidades de moneda extranjera por 1 USD»
# (p. ej. COP=3850 significa 1 USD compra 3850 COP, no el valor de 1 COP en México).
#   MXN por 1 unidad de extranjero = (MXN por 1 USD) / (unidades de extranjero por 1 USD)
#   Ej.: 16.70 / 3850 ≈ 0.00433 MXN por 1 COP.
# Aquí se usa Frankfurter con pares «from=ISO&to=MXN» o cruce vía USD multiplicando
# (1 ISO = x USD) × (1 USD = y MXN), algebraicamente equivalente a la regla de tres anterior.

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple

import requests

FRANKFURTER_BASE = "https://api.frankfurter.app"


def mxn_por_unidad_desde_base_usd(mxn_por_usd: float, unidades_extranjero_por_usd: float) -> float:
    """
    Convierte tasas en convención «1 USD = … MXN» y «1 USD = … extranjero» al formato ERP
    «1 unidad extranjera = X MXN».

    Args:
        mxn_por_usd: pesos mexicanos por un dólar (p. ej. 16.70).
        unidades_extranjero_por_usd: cuántas unidades de la moneda extranjera equivalen a 1 USD
            (p. ej. 3850 COP por USD; no confundir con «USD por 1 COP»).

    Returns:
        MXN por 1 unidad de moneda extranjera.
    """
    if unidades_extranjero_por_usd <= 0:
        raise ValueError("unidades_extranjero_por_usd debe ser > 0.")
    return float(mxn_por_usd) / float(unidades_extranjero_por_usd)


def _frankfurter_pair(
    from_c: str,
    to_c: str,
    fecha: str,
    timeout: int,
) -> Tuple[float, str]:
    """1 unidad de `from_c` equivale a `valor` unidades de `to_c`."""
    f0 = (fecha or "").strip()[:10]
    datetime.strptime(f0, "%Y-%m-%d")
    from_c = (from_c or "").strip().upper()
    to_c = (to_c or "").strip().upper()
    resp = requests.get(
        f"{FRANKFURTER_BASE}/{f0}",
        params={"from": from_c, "to": to_c},
        timeout=timeout,
        headers={"User-Agent": "mi-coi/1.0 (tipo cambio referencia)"},
    )
    if resp.status_code != 200:
        raise ValueError(f"Referencia web HTTP {resp.status_code}: {resp.text[:120]}")
    data = resp.json()
    rates = data.get("rates") or {}
    v = rates.get(to_c)
    if v is None:
        raise ValueError(f"Sin par {from_c}/{to_c} en la respuesta.")
    fecha_pub = str(data.get("date") or f0)[:10]
    return float(v), fecha_pub


def consultar_frankfurter_a_mxn(
    codigo_moneda: str,
    fecha: str,
    timeout: int = 25,
) -> Tuple[float, str]:
    """
    MXN por 1 unidad de moneda (USD, EUR o GBP).
    Intenta par directo; si falla, cruza vía USD (típico para EUR/GBP).
    Reintenta hasta 5 días hacia atrás (fin de semana / festivos).
    """
    c = (codigo_moneda or "").strip().upper()
    if c not in ("USD", "EUR", "GBP"):
        raise ValueError("Solo USD, EUR o GBP para referencia web.")
    f0 = (fecha or "").strip()[:10]
    d0 = datetime.strptime(f0, "%Y-%m-%d")

    def _una_fecha(day: str) -> Tuple[float, str]:
        if c == "USD":
            return _frankfurter_pair("USD", "MXN", day, timeout)
        try:
            return _frankfurter_pair(c, "MXN", day, timeout)
        except Exception:
            # 1 c = x USD, 1 USD = y MXN  => 1 c = x*y MXN
            unit_en_usd, d1 = _frankfurter_pair(c, "USD", day, timeout)
            mxn_por_usd, d2 = _frankfurter_pair("USD", "MXN", day, timeout)
            return unit_en_usd * mxn_por_usd, d2

    err: Optional[Exception] = None
    for i in range(5):
        day = (d0 - timedelta(days=i)).strftime("%Y-%m-%d")
        try:
            return _una_fecha(day)
        except Exception as e:
            err = e
            continue
    raise err if err else ValueError("Sin tipo de cambio de referencia.")


def consultar_frankfurter_iso_a_mxn(
    codigo_moneda: str,
    fecha: str,
    timeout: int = 20,
) -> Tuple[float, str]:
    """
    MXN por 1 unidad para cualquier ISO que publique Frankfurter (no solo USD/EUR/GBP).
    Intenta directo a MXN; si falla, cruza vía USD. Reintenta hasta 5 días atrás.
    """
    c = (codigo_moneda or "").strip().upper()[:3]
    if not c or len(c) != 3:
        raise ValueError("Código ISO inválido.")
    if c == "MXN":
        raise ValueError("MXN es moneda base.")
    f0 = (fecha or "").strip()[:10]
    d0 = datetime.strptime(f0, "%Y-%m-%d")

    def _una_fecha(day: str) -> Tuple[float, str]:
        if c == "USD":
            return _frankfurter_pair("USD", "MXN", day, timeout)
        try:
            return _frankfurter_pair(c, "MXN", day, timeout)
        except Exception:
            # 1 c = u USD ; 1 USD = m MXN  →  1 c = u·m MXN (equiv. a m / (1/u) si tuvieras «unidades c por USD»).
            unit_en_usd, _ = _frankfurter_pair(c, "USD", day, timeout)
            mxn_por_usd, d2 = _frankfurter_pair("USD", "MXN", day, timeout)
            return unit_en_usd * mxn_por_usd, d2

    err: Optional[Exception] = None
    for i in range(5):
        day = (d0 - timedelta(days=i)).strftime("%Y-%m-%d")
        try:
            return _una_fecha(day)
        except Exception as e:
            err = e
            continue
    raise err if err else ValueError("Sin tipo de cambio para esta moneda.")
