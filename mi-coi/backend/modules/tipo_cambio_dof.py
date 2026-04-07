# -*- coding: utf-8 -*-
"""Consulta del tipo de cambio USD/MXN desde DOF (Diario Oficial)."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Tuple

import requests

DOF_INDICADORES_URL = "https://www.dof.gob.mx/indicadores.php"


def _ddmmyyyy_a_iso(texto: str) -> str:
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", texto or "")
    if not m:
        raise ValueError("No se encontró fecha de publicación DOF.")
    d, mo, y = m.group(1), m.group(2), m.group(3)
    return f"{y}-{mo}-{d}"


def _parse_valor_dolar(html: str) -> float:
    # En la página aparece un bloque similar a:
    # <span class="tituloBloque4">DOLAR</span> <br /> 17.7548
    pat = re.compile(
        r'<span[^>]*class\s*=\s*["\']tituloBloque4["\'][^>]*>\s*DOLAR\s*</span>\s*<br\s*/?>\s*([0-9][0-9,\.]*)',
        re.IGNORECASE,
    )
    m = pat.search(html or "")
    if not m:
        raise ValueError("No se encontró el valor DOLAR en DOF.")
    s = (m.group(1) or "").strip().replace(",", "")
    v = float(s)
    if v <= 0:
        raise ValueError("Valor DOLAR inválido en DOF.")
    return v


def _parse_fecha_publicacion(html: str) -> str:
    # Texto visible típico: "Tipo de Cambio y Tasas al 26/03/2026"
    pat = re.compile(r"Tipo\s+de\s+Cambio\s+y\s+Tasas\s+al\s+(\d{2}/\d{2}/\d{4})", re.IGNORECASE)
    m = pat.search(html or "")
    if not m:
        raise ValueError("No se encontró la fecha de publicación en DOF.")
    return _ddmmyyyy_a_iso(m.group(1))


def consultar_dof_usd_mxn(fecha: str, timeout: int = 30) -> Tuple[float, str, str]:
    """
    Devuelve (valor_usd_mxn, fecha_publicacion_iso, fuente).

    Si DOF publica una fecha distinta a la solicitada, se devuelve el dato publicado
    y se deja que el llamador decida si lo acepta o hace fallback.
    """
    f0 = (fecha or "").strip()[:10]
    datetime.strptime(f0, "%Y-%m-%d")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.dof.gob.mx/",
    }

    # Intento normal TLS; si el equipo no tiene cadena de certificados completa, reintenta sin verify.
    try:
        resp = requests.get(DOF_INDICADORES_URL, headers=headers, timeout=timeout)
    except requests.exceptions.SSLError:
        resp = requests.get(DOF_INDICADORES_URL, headers=headers, timeout=timeout, verify=False)

    if resp.status_code != 200:
        raise ValueError(f"DOF HTTP {resp.status_code}")

    html = resp.text or ""
    valor = _parse_valor_dolar(html)
    fecha_pub = _parse_fecha_publicacion(html)
    return valor, fecha_pub, "DOF"

