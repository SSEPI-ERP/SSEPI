# Consulta tipo de cambio FIX USD/MXN vía API SieAPIRest de Banxico.
# Documentación: https://www.banxico.org.mx/SieAPIRest/service/v1/docs/
# Requiere token (Bmx-Token) obtenido en el portal de Banxico.

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

SERIE_FIX_USD_MXN = "SF43718"
# Tipos de cambio vs peso (SIE); ver directorio de series en Banxico.
SERIE_EUR_MXN = "SF46410"
SERIE_GBP_MXN = "SF46407"
BASE_URL = "https://www.banxico.org.mx/SieAPIRest/service/v1"

# Nombre en UI del diálogo Monedas -> (serie Banxico, etiqueta en histórico)
SERIES_POR_MONEDA_UI: Dict[str, Tuple[str, str]] = {
    "Dólar Americano": (SERIE_FIX_USD_MXN, "USD/MXN"),
    "Euro": (SERIE_EUR_MXN, "EUR/MXN"),
    "Libra Esterlina": (SERIE_GBP_MXN, "GBP/MXN"),
}


def cargar_token_desde_config(ruta_config: str) -> str:
    if not ruta_config or not os.path.isfile(ruta_config):
        return ""
    try:
        with open(ruta_config, "r", encoding="utf-8") as f:
            data = json.load(f)
        return str(data.get("BANXICO_TOKEN") or "").strip()
    except Exception:
        return ""


def _normalizar_fecha_api(fecha: str) -> str:
    """Acepta YYYY-MM-DD y devuelve la misma cadena para la API."""
    s = (fecha or "").strip()[:10]
    datetime.strptime(s, "%Y-%m-%d")
    return s


def _parsear_valor(dato: str) -> float:
    s = (dato or "").strip()
    if not s:
        raise ValueError("Dato vacío")
    s = s.replace(",", "")
    return float(s)


def _extraer_series(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    bmx = payload.get("bmx") or {}
    series = bmx.get("series")
    if isinstance(series, list):
        return [x for x in series if isinstance(x, dict)]
    return []


def _extraer_datos(serie: Dict[str, Any]) -> List[Dict[str, Any]]:
    datos = serie.get("datos")
    if isinstance(datos, list):
        return [x for x in datos if isinstance(x, dict)]
    return []


def _fecha_dd_mm_yyyy_a_iso(fecha: str) -> str:
    """Convierte DD/MM/YYYY a YYYY-MM-DD si aplica."""
    fecha = (fecha or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", fecha)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        return f"{y}-{mo}-{d}"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", fecha):
        return fecha
    return fecha


def consultar_serie_banxico(
    token: str,
    fecha: str,
    serie: str,
    timeout: int = 30,
) -> Tuple[float, str, List[Dict[str, Any]]]:
    """
    Consulta una serie SIE (misma fecha inicio/fin).
    Devuelve (valor, fecha_observacion_iso, datos_crudos_filas).
    """
    if not token:
        raise ValueError("Falta BANXICO_TOKEN en config_instituto.json (portal SieAPIRest de Banxico).")
    f0 = _normalizar_fecha_api(fecha)
    url = f"{BASE_URL}/series/{serie}/datos/{f0}/{f0}"
    headers = {
        "Bmx-Token": token,
        "User-Agent": "mi-coi/1.0 (SieAPIRest)",
    }
    resp = requests.get(url, headers=headers, timeout=timeout)
    if resp.status_code == 401:
        raise ValueError("Token Banxico no válido o expirado (401).")
    if resp.status_code != 200:
        raise ValueError(f"Banxico HTTP {resp.status_code}: {resp.text[:200]}")

    payload = resp.json()
    series = _extraer_series(payload)
    if not series:
        raise ValueError("Respuesta Banxico sin series.")

    todas: List[Tuple[str, float]] = []
    for s in series:
        for row in _extraer_datos(s):
            f_raw = str(row.get("fecha") or "")
            dato = row.get("dato")
            if dato is None or dato == "N/E":
                continue
            try:
                val = _parsear_valor(str(dato))
            except (ValueError, TypeError):
                continue
            todas.append((_fecha_dd_mm_yyyy_a_iso(f_raw) or f0, val))

    if not todas:
        raise ValueError("No hay dato FIX para esa fecha (festivo o sin publicación).")

    # Último dato del día solicitado o el más reciente devuelto
    for iso, val in reversed(todas):
        if iso == f0:
            return val, iso, [{"fecha": iso, "valor": val}]
    iso, val = todas[-1]
    return val, iso, [{"fecha": iso, "valor": val}]


def consultar_fix_usd_mxn(
    token: str,
    fecha: str,
    serie: str = SERIE_FIX_USD_MXN,
    timeout: int = 30,
) -> Tuple[float, str, List[Dict[str, Any]]]:
    """FIX USD/MXN (compatibilidad con código existente)."""
    return consultar_serie_banxico(token, fecha, serie, timeout=timeout)


def append_historico(
    ruta_archivo: str,
    fecha_iso: str,
    moneda: str,
    valor: float,
    fuente: str,
) -> None:
    line = f"{fecha_iso}  {moneda}  {valor:.4f}  {fuente}\n"
    d = os.path.dirname(os.path.abspath(ruta_archivo))
    if d:
        os.makedirs(d, exist_ok=True)
    with open(ruta_archivo, "a", encoding="utf-8") as f:
        f.write(line)


def leer_ultimo_fix_desde_historico(ruta_archivo: str, fecha_iso: str) -> Optional[float]:
    """
    Tipo USD vs MXN para una fecha: prioriza USD/MXN en histórico; si no hay,
    acepta líneas manuales cuya moneda sea Dólar (compatibilidad).
    """
    if not os.path.isfile(ruta_archivo):
        return None
    try:
        with open(ruta_archivo, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception:
        return None
    pref = fecha_iso.strip()[:10]

    def _valor(parts: List[str]) -> Optional[float]:
        if len(parts) < 3:
            return None
        try:
            return float(parts[2].replace(",", ""))
        except ValueError:
            return None

    for line in reversed(lines):
        line = line.strip()
        if not line.startswith(pref):
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "USD/MXN":
            v = _valor(parts)
            if v is not None:
                return v
    for line in reversed(lines):
        line = line.strip()
        if not line.startswith(pref):
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1].startswith("Dólar"):
            v = _valor(parts)
            if v is not None:
                return v
    return None
