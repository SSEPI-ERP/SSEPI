# -*- coding: utf-8 -*-
"""Carpeta configurable para depósito de documentos (XML, PDF, etc.)."""
import json
import os
from typing import Any, Dict, List, Tuple


def _raiz_proyecto() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _ruta_config() -> str:
    return os.path.join(_raiz_proyecto(), "config_instituto.json")


def obtener_carpeta_deposito() -> str:
    """Ruta absoluta de la carpeta de depósito; por defecto deposito_doctos en el proyecto."""
    default = os.path.join(_raiz_proyecto(), "deposito_doctos")
    try:
        if os.path.isfile(_ruta_config()):
            with open(_ruta_config(), "r", encoding="utf-8") as f:
                cfg = json.load(f)
            p = (cfg.get("DEPOSITO_DOCTOS_FOLDER") or "").strip()
            if p:
                return os.path.abspath(p)
    except Exception:
        pass
    return default


def guardar_carpeta_deposito(ruta: str) -> Dict[str, Any]:
    ruta = (ruta or "").strip()
    if not ruta:
        return {"exito": False, "error": "Indique una carpeta."}
    ruta = os.path.abspath(ruta)
    try:
        os.makedirs(ruta, exist_ok=True)
    except OSError as e:
        return {"exito": False, "error": str(e)}
    try:
        cfg = {}
        if os.path.isfile(_ruta_config()):
            with open(_ruta_config(), "r", encoding="utf-8") as f:
                cfg = json.load(f)
        cfg["DEPOSITO_DOCTOS_FOLDER"] = ruta
        with open(_ruta_config(), "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        return {"exito": True, "mensaje": "Carpeta guardada.", "ruta": ruta}
    except Exception as e:
        return {"exito": False, "error": str(e)}


def listar_archivos() -> Tuple[List[Dict[str, Any]], str]:
    """Lista archivos en la carpeta (no recursivo)."""
    carpeta = obtener_carpeta_deposito()
    try:
        os.makedirs(carpeta, exist_ok=True)
    except OSError:
        pass
    out: List[Dict[str, Any]] = []
    if not os.path.isdir(carpeta):
        return out, carpeta
    try:
        for name in sorted(os.listdir(carpeta), key=str.lower):
            path = os.path.join(carpeta, name)
            if os.path.isfile(path):
                try:
                    st = os.stat(path)
                    out.append(
                        {
                            "nombre": name,
                            "tamano": st.st_size,
                            "modificado": st.st_mtime,
                        }
                    )
                except OSError:
                    out.append({"nombre": name, "tamano": 0, "modificado": 0.0})
    except OSError:
        pass
    return out, carpeta
