# -*- coding: utf-8 -*-
"""Persistencia de la última sincronización automática de tipos de cambio."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, Optional


def _ruta_archivo() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "tipos_cambio_sync.json")


def cargar() -> Dict[str, Any]:
    d: Dict[str, Any] = {
        "last_run": None,
        "last_ok": None,
        "last_error": None,
        "last_monedas": 0,
        "last_filas_catalogo": 0,
    }
    p = _ruta_archivo()
    if not os.path.isfile(p):
        return d
    try:
        with open(p, "r", encoding="utf-8") as f:
            m = json.load(f)
        if isinstance(m, dict):
            d.update(m)
    except Exception:
        pass
    return d


def guardar_resultado(
    ok: bool,
    *,
    monedas: int = 0,
    filas_catalogo: int = 0,
    error: Optional[str] = None,
) -> None:
    data = cargar()
    data["last_run"] = datetime.now().isoformat(timespec="seconds")
    data["last_ok"] = ok
    data["last_monedas"] = int(monedas)
    data["last_filas_catalogo"] = int(filas_catalogo)
    data["last_error"] = (error or "")[:500] if not ok else None
    p = _ruta_archivo()
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def texto_resumen_barra() -> str:
    """Una línea corta para la barra de estado."""
    from backend.modules.tipo_cambio_horario import (
        formatear_restante_hasta,
        proxima_sincronizacion_tipos_cambio,
    )

    d = cargar()
    prox = proxima_sincronizacion_tipos_cambio()
    rest = formatear_restante_hasta(prox)
    prox_txt = prox.strftime("%d/%m %H:%M")

    lr = d.get("last_run")
    if lr:
        try:
            t = datetime.fromisoformat(str(lr).replace("Z", ""))
            ult = t.strftime("%d/%m %H:%M")
        except Exception:
            ult = str(lr)[:16]
        ok = d.get("last_ok")
        n = int(d.get("last_monedas") or 0)
        fc = int(d.get("last_filas_catalogo") or 0)
        if ok:
            st = f"Última: {ult} ✓ ({n} monedas, cat. {fc})"
        else:
            err = (d.get("last_error") or "error")[:40]
            st = f"Última: {ult} ✗ ({err})"
    else:
        st = "Última: — (aún no hay corrida automática)"

    return f"{st}  |  Próx.: {prox_txt} ({rest})"
