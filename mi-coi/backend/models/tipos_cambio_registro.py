# -*- coding: utf-8 -*-
"""Historial de tipos de cambio por fecha con fuente (Manual, Banxico, etc.)."""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Optional

try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, "backend", "database", "contabilidad.db")


class TiposCambioRegistro:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self._ensure_table()

    def _ensure_table(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tipos_cambio (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha TEXT NOT NULL,
                    clave_iso TEXT NOT NULL,
                    tipo_cambio REAL NOT NULL,
                    fuente TEXT NOT NULL DEFAULT 'Manual',
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_tipos_cambio_fecha_iso ON tipos_cambio (fecha, clave_iso)"
            )
            conn.commit()

    def registrar(
        self,
        fecha: str,
        clave_iso: str,
        tipo_cambio: float,
        fuente: str,
    ) -> Dict[str, Any]:
        fecha = (fecha or "")[:10]
        iso = (clave_iso or "").strip().upper()[:3]
        fuente = (fuente or "Manual").strip()[:40] or "Manual"
        try:
            tc = float(tipo_cambio)
        except (TypeError, ValueError):
            return {"exito": False, "error": "Tipo de cambio inválido."}
        if not fecha or len(fecha) < 10:
            return {"exito": False, "error": "Fecha inválida."}
        if not iso:
            return {"exito": False, "error": "Clave ISO inválida."}
        if tc <= 0:
            return {"exito": False, "error": "TC debe ser > 0."}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO tipos_cambio (fecha, clave_iso, tipo_cambio, fuente)
                    VALUES (?, ?, ?, ?)
                    """,
                    (fecha, iso, tc, fuente),
                )
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar(
        self,
        *,
        clave_iso: Optional[str] = None,
        fecha_desde: Optional[str] = None,
        fecha_hasta: Optional[str] = None,
        fuente: Optional[str] = None,
        limite: int = 500,
    ) -> List[Dict[str, Any]]:
        wh = []
        params: List[Any] = []
        if clave_iso:
            wh.append("UPPER(TRIM(clave_iso)) = ?")
            params.append((clave_iso or "").strip().upper()[:3])
        if fecha_desde:
            wh.append("fecha >= ?")
            params.append(fecha_desde[:10])
        if fecha_hasta:
            wh.append("fecha <= ?")
            params.append(fecha_hasta[:10])
        if fuente:
            wh.append("fuente = ?")
            params.append(fuente.strip())
        sql = "SELECT id, fecha, clave_iso, tipo_cambio, fuente, created_at FROM tipos_cambio"
        if wh:
            sql += " WHERE " + " AND ".join(wh)
        sql += " ORDER BY fecha DESC, clave_iso, id DESC LIMIT ?"
        params.append(int(limite))
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(sql, params)
                return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []
