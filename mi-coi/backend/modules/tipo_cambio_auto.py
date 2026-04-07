# Orquesta Banxico (principal) y DOF (respaldo para USD).

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Optional, Tuple

from backend.modules.banxico_tipo_cambio import (
    SERIES_POR_MONEDA_UI,
    append_historico,
    cargar_token_desde_config,
    consultar_serie_banxico,
)
from backend.modules.tipo_cambio_dof import consultar_dof_usd_mxn

_UI_A_ISO = {
    "Dólar Americano": "USD",
    "Euro": "EUR",
    "Libra Esterlina": "GBP",
    "Yen Japonés": "JPY",
    "Won Surcoreano": "KRW",
}

UI_MONEDA_A_ISO = dict(_UI_A_ISO)


def _proveedor_configurado(ruta_config: str) -> str:
    if not ruta_config or not os.path.isfile(ruta_config):
        return ""
    try:
        import json

        with open(ruta_config, "r", encoding="utf-8") as f:
            data = json.load(f)
        return str(data.get("PROVEEDOR_FISCAL") or "").strip().lower()
    except Exception:
        return ""


def obtener_tipo_mxn_automatico(
    fecha: str,
    nombre_moneda_ui: str,
    ruta_config: str,
) -> Tuple[float, str, str]:
    """
    Devuelve (valor_mxn_por_unidad, fecha_observacion, etiqueta_fuente).
    Intenta Banxico (principal) y para USD usa DOF como respaldo.
    """
    tok = cargar_token_desde_config(ruta_config)
    pair = SERIES_POR_MONEDA_UI.get(nombre_moneda_ui)
    if tok and pair:
        serie_id, cod_hist = pair
        try:
            val, iso, _ = consultar_serie_banxico(tok, fecha, serie_id)
            return val, iso, f"Banxico-{cod_hist}"
        except Exception:
            pass

    # Respaldo DOF solo para USD.
    if nombre_moneda_ui == "Dólar Americano":
        try:
            val, iso, fuente = consultar_dof_usd_mxn(fecha)
            return val, iso, fuente
        except Exception:
            pass

    proveedor = _proveedor_configurado(ruta_config)
    raise ValueError(
        "No se pudo obtener tipo de cambio con Banxico/DOF. "
        f"Proveedor actual: {proveedor or 'N/A'}. Verifique BANXICO_TOKEN y conectividad."
    )


def historico_tiene_auto_para_moneda_fecha(
    ruta_archivo: str,
    fecha_iso: str,
    moneda_codigo_hist: str,
) -> bool:
    """True si ya hay una línea automática (no manual) para esa fecha y par moneda/MXN."""
    if not ruta_archivo or not os.path.isfile(ruta_archivo):
        return False
    pref = (fecha_iso or "").strip()[:10]
    try:
        with open(ruta_archivo, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line.startswith(pref):
                    continue
                parts = line.split(None, 3)
                if len(parts) < 4:
                    continue
                if parts[1] != moneda_codigo_hist:
                    continue
                fuente = (parts[3] or "").lower()
                if "manual" in fuente:
                    continue
                return True
    except Exception:
        pass
    return False


def obtener_tipos_tres_monedas_parallel(
    fecha_ui: str,
    ruta_config: str,
) -> Dict[str, Tuple[float, str, str]]:
    """
    Consulta monedas principales vs MXN en paralelo (incluye USD/EUR/GBP/JPY/KRW).
    """
    out: Dict[str, Tuple[float, str, str]] = {}

    def _one(nombre_ui: str) -> Tuple[str, Optional[Tuple[float, str, str]]]:
        try:
            t = obtener_tipo_mxn_automatico(fecha_ui, nombre_ui, ruta_config)
            return nombre_ui, t
        except Exception:
            return nombre_ui, None

    nombres = list(_UI_A_ISO.keys())
    with ThreadPoolExecutor(max_workers=min(5, len(nombres))) as ex:
        futs = [ex.submit(_one, n) for n in nombres]
        for fut in as_completed(futs):
            nombre_ui, t = fut.result()
            if t is not None:
                out[nombre_ui] = t
    return out


def actualizar_historico_tres_monedas(
    fecha_ui: str,
    ruta_historico: str,
    ruta_config: str,
) -> Dict[str, Tuple[float, str, str]]:
    """
    Obtiene monedas principales vs MXN y añade al histórico si no hay ya entrada automática
    para la misma fecha publicada y par moneda.
    """
    out = obtener_tipos_tres_monedas_parallel(fecha_ui, ruta_config)
    for nombre_ui, iso in _UI_A_ISO.items():
        if nombre_ui not in out:
            continue
        val, fobs, fuente = out[nombre_ui]
        pair = SERIES_POR_MONEDA_UI.get(nombre_ui)
        cod_hist = pair[1] if pair else f"{iso}/MXN"
        if not historico_tiene_auto_para_moneda_fecha(ruta_historico, fobs, cod_hist):
            append_historico(ruta_historico, fobs, cod_hist, val, fuente)
    return out
