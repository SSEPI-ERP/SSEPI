# backend/modules/plantillas_poliza.py
"""
Pólizas plantilla reutilizables (Fase 2 - Informe Aspel COI).
Plantillas con N líneas predefinidas, clonables al nuevo período.
"""
import sqlite3
from typing import List, Dict, Any
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'backend', 'database', 'contabilidad.db'
        )


class PlantillasPoliza:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or get_db_path()
        self._crear_tablas()

    def _crear_tablas(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS plantillas_poliza (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL,
                    tipo_poliza TEXT NOT NULL,
                    concepto_base TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS plantilla_movimientos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    plantilla_id INTEGER NOT NULL REFERENCES plantillas_poliza(id) ON DELETE CASCADE,
                    num_cuenta TEXT NOT NULL,
                    concepto_mov TEXT,
                    cargo REAL DEFAULT 0,
                    abono REAL DEFAULT 0
                )
            """)

    def crear_plantilla(
        self,
        nombre: str,
        tipo_poliza: str,
        concepto_base: str,
        movimientos: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Crea una plantilla con sus líneas. movimientos: [{'num_cuenta','concepto_mov','cargo','abono'}, ...]"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO plantillas_poliza (nombre, tipo_poliza, concepto_base) VALUES (?, ?, ?)",
                    (nombre.strip(), tipo_poliza.strip(), (concepto_base or "").strip()),
                )
                plantilla_id = cursor.lastrowid
                for m in movimientos:
                    cursor.execute(
                        """
                        INSERT INTO plantilla_movimientos (plantilla_id, num_cuenta, concepto_mov, cargo, abono)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            plantilla_id,
                            m.get("num_cuenta", ""),
                            m.get("concepto_mov", ""),
                            float(m.get("cargo", 0)),
                            float(m.get("abono", 0)),
                        ),
                    )
            return {"exito": True, "id": plantilla_id, "mensaje": "Plantilla guardada."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar(self) -> List[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    "SELECT id, nombre, tipo_poliza, concepto_base FROM plantillas_poliza ORDER BY nombre"
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []

    def obtener_movimientos(self, plantilla_id: int) -> List[Dict[str, Any]]:
        """Devuelve los movimientos de una plantilla para clonar en una póliza nueva."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """
                    SELECT num_cuenta, concepto_mov, cargo, abono
                    FROM plantilla_movimientos WHERE plantilla_id = ? ORDER BY id
                    """,
                    (plantilla_id,),
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []

    def obtener_plantilla_completa(self, plantilla_id: int) -> Dict[str, Any]:
        """Devuelve plantilla con sus movimientos."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT id, nombre, tipo_poliza, concepto_base FROM plantillas_poliza WHERE id = ?",
                (plantilla_id,),
            ).fetchone()
        if not row:
            return {}
        d = dict(row)
        d["movimientos"] = self.obtener_movimientos(plantilla_id)
        return d
