# -*- coding: utf-8 -*-
"""Sincroniza tipos obtenidos por red con el catálogo SQLite (Monedas)."""
from __future__ import annotations

from typing import Dict, Tuple

from backend.models.monedas_catalogo import CatalogoMonedas
from backend.modules.tipo_cambio_auto import UI_MONEDA_A_ISO


def sincronizar_catalogo_monedas_desde_tipos(
    datos: Dict[str, Tuple[float, str, str]],
    mgr: CatalogoMonedas,
) -> int:
    """
    Aplica USD/EUR/GBP al catálogo según clave fiscal. `datos` es el dict devuelto por
    actualizar_historico_tres_monedas / obtener_tipos_tres_monedas_parallel.
    Devuelve número de filas actualizadas con éxito.
    """
    n = 0
    for nombre_ui in UI_MONEDA_A_ISO.keys():
        if nombre_ui not in datos:
            continue
        val, fobs, _fu = datos[nombre_ui]
        iso = UI_MONEDA_A_ISO.get(nombre_ui)
        if not iso:
            continue
        fecha = (fobs or "")[:10]
        r = mgr.actualizar_tc_por_clave_fiscal(iso, val, fecha)
        if r.get("exito") and r.get("actualizado"):
            n += 1
    return n
