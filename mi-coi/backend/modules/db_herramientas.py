"""
Respaldo, restauración y mantenimiento de SQLite (Firebird/PostgreSQL: mensaje guía).
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from datetime import datetime
from typing import Any, Dict, Optional


def respaldar_sqlite(db_path: str, *, out_dir: Optional[str] = None) -> Dict[str, Any]:
    src = os.path.abspath(db_path or "")
    if not src or not os.path.isfile(src):
        return {"exito": False, "error": "Archivo de base de datos no encontrado."}
    out_dir = out_dir or os.path.join(os.path.dirname(src), "backups")
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as e:
        return {"exito": False, "error": str(e)}
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.splitext(os.path.basename(src))[0] or "contabilidad"
    dst = os.path.join(out_dir, f"{base}_backup_{ts}.db")
    try:
        shutil.copy2(src, dst)
        return {"exito": True, "archivo": dst}
    except OSError as e:
        return {"exito": False, "error": str(e)}


def restaurar_sqlite(db_path: str, archivo_backup: str) -> Dict[str, Any]:
    """Sobrescribe db_path con la copia indicada (la app debe cerrar conexiones)."""
    src = os.path.abspath(archivo_backup or "")
    dst = os.path.abspath(db_path or "")
    if not src or not os.path.isfile(src):
        return {"exito": False, "error": "Archivo de respaldo inválido."}
    if not dst:
        return {"exito": False, "error": "Ruta de BD destino inválida."}
    try:
        shutil.copy2(src, dst)
        return {"exito": True, "mensaje": "Base de datos restaurada."}
    except OSError as e:
        return {"exito": False, "error": str(e)}


def compactar_sqlite(db_path: str) -> Dict[str, Any]:
    """VACUUM + ANALYZE en SQLite (equivalente conceptual a compactar Firebird / VACUUM FULL en PG)."""
    p = os.path.abspath(db_path or "")
    if not os.path.isfile(p):
        return {"exito": False, "error": "BD no encontrada."}
    try:
        with sqlite3.connect(p) as conn:
            conn.execute("VACUUM")
            conn.execute("ANALYZE")
        return {"exito": True, "mensaje": "SQLite: VACUUM y ANALYZE ejecutados."}
    except sqlite3.Error as e:
        return {"exito": False, "error": str(e)}


def motor_bd_actual() -> str:
    try:
        from backend.modules.config_parametros import ConfigParametros

        return (ConfigParametros().obtener_parametros_db().DB_ENGINE or "sqlite").lower()
    except Exception:
        return "sqlite"
