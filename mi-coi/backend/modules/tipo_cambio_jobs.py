# -*- coding: utf-8 -*-
"""Ejecución de consultas de tipo de cambio fuera del hilo de la UI (Tkinter)."""
from __future__ import annotations

import threading
from typing import Any, Callable, Dict, Optional, Tuple

from backend.models.monedas_catalogo import CatalogoMonedas
from backend.modules.tipo_cambio_auto import (
    actualizar_historico_tres_monedas,
    obtener_tipo_mxn_automatico,
    obtener_tipos_tres_monedas_parallel,
)
from backend.modules.tipo_cambio_catalogo_sync import sincronizar_catalogo_monedas_desde_tipos


def ejecutar_fetch_completo_en_hilo(
    *,
    fecha_ui: str,
    ruta_historico: str,
    ruta_config: str,
    db_path: Optional[str],
    on_done: Callable[[bool, Optional[Dict[str, Tuple[float, str, str]]], int, Optional[Exception]], Any],
) -> None:
    """
    En un hilo daemon: actualiza histórico + catálogo. `on_done` se invoca en ese hilo;
    el llamador debe programar la UI con root.after(0, ...).

    Args:
        on_done: (exito, datos_dict_o_none, n_filas_catalogo, error_o_none)
    """

    def worker() -> None:
        datos: Optional[Dict[str, Tuple[float, str, str]]] = None
        ncat = 0
        err_final: Optional[Exception] = None
        try:
            datos = actualizar_historico_tres_monedas(fecha_ui, ruta_historico, ruta_config)
        except Exception as e:
            datos = {}
            err_final = e
        try:
            mgr = CatalogoMonedas(db_path=db_path) if db_path else CatalogoMonedas()
            if datos:
                ncat = sincronizar_catalogo_monedas_desde_tipos(datos, mgr)
        except Exception as e:
            err_final = err_final or e
        if err_final is not None and ncat == 0 and not datos:
            on_done(False, datos or None, 0, err_final)
        else:
            on_done(True, datos, ncat, None)

    threading.Thread(target=worker, daemon=True).start()


def ejecutar_una_moneda_en_hilo(
    *,
    fecha_ui: str,
    nombre_moneda_ui: str,
    ruta_config: str,
    on_done: Callable[[bool, Optional[Tuple[float, str, str]], Optional[Exception]], Any],
) -> None:
    """Consulta una sola moneda (p. ej. al cambiar el combo) sin bloquear la UI."""

    def worker() -> None:
        try:
            t = obtener_tipo_mxn_automatico(fecha_ui, nombre_moneda_ui, ruta_config)
            on_done(True, t, None)
        except Exception as e:
            on_done(False, None, e)

    threading.Thread(target=worker, daemon=True).start()


def solo_paralelo_sin_persistir(
    fecha_ui: str,
    ruta_config: str,
) -> Dict[str, Tuple[float, str, str]]:
    """Solo consulta en paralelo (útil para pruebas o precarga)."""
    return obtener_tipos_tres_monedas_parallel(fecha_ui, ruta_config)
