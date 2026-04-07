# backend/modules/centros_costo.py
"""
Centros de costo con distribución (Fase 2 - Informe Aspel COI).
Tabla de centros de costo y relación opcional con movimientos.
"""
import sqlite3
from typing import List, Dict, Any, Optional
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


class CentrosCosto:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or get_db_path()
        self._crear_tablas()

    def _crear_tablas(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS centros_costo (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codigo TEXT UNIQUE NOT NULL,
                    nombre TEXT NOT NULL,
                    descripcion TEXT,
                    padre_id INTEGER REFERENCES centros_costo(id)
                )
            """)
            try:
                conn.execute("ALTER TABLE centros_costo ADD COLUMN descripcion TEXT")
            except sqlite3.OperationalError:
                pass
            # Agregar columna centro_costo_id a movimientos si no existe
            cur = conn.execute("PRAGMA table_info(movimientos)")
            columnas = [row[1] for row in cur.fetchall()]
            if "centro_costo_id" not in columnas:
                conn.execute("ALTER TABLE movimientos ADD COLUMN centro_costo_id INTEGER")

    def agregar(
        self,
        codigo: str,
        nombre: str,
        padre_id: Optional[int] = None,
        descripcion: str = "",
    ) -> Dict[str, Any]:
        desc = (descripcion or "").strip() or None
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "INSERT INTO centros_costo (codigo, nombre, descripcion, padre_id) VALUES (?, ?, ?, ?)",
                    (codigo.strip(), nombre.strip(), desc, padre_id),
                )
            return {"exito": True, "mensaje": "Centro de costo registrado."}
        except sqlite3.IntegrityError:
            return {"exito": False, "error": "El código ya existe."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def actualizar(
        self,
        codigo: str,
        nombre: str,
        padre_id: Optional[int] = None,
        descripcion: str = "",
    ) -> Dict[str, Any]:
        codigo = (codigo or "").strip()
        nombre = (nombre or "").strip()
        desc = (descripcion or "").strip() or None
        if not codigo:
            return {"exito": False, "error": "codigo requerido"}
        if not nombre:
            return {"exito": False, "error": "nombre requerido"}
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE centros_costo SET nombre=?, descripcion=?, padre_id=? WHERE codigo=?",
                    (nombre, desc, padre_id, codigo),
                )
                if cur.rowcount == 0:
                    return {"exito": False, "error": "Centro no existe"}
                conn.commit()
            return {"exito": True, "mensaje": "Centro actualizado."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def eliminar(self, codigo: str) -> Dict[str, Any]:
        codigo = (codigo or "").strip()
        if not codigo:
            return {"exito": False, "error": "codigo requerido"}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM centros_costo WHERE codigo=?", (codigo,))
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar(self) -> List[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """
                    SELECT id, codigo, nombre, COALESCE(descripcion,'') AS descripcion, padre_id
                    FROM centros_costo ORDER BY codigo
                    """
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []

    def listar_para_combo(self) -> List[tuple]:
        """Retorna [(id, codigo - nombre), ...] para ttk.Combobox."""
        rows = self.listar()
        return [(r["id"], f"{r['codigo']} - {r['nombre']}") for r in rows]

    def obtener_por_codigo(self, codigo: str) -> Optional[Dict[str, Any]]:
        codigo = (codigo or "").strip()
        if not codigo:
            return None
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, codigo, nombre, COALESCE(descripcion,'') AS descripcion, padre_id
                    FROM centros_costo WHERE codigo=?
                    """,
                    (codigo,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception:
            return None

    def obtener_por_id(self, cid: int) -> Optional[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """
                    SELECT id, codigo, nombre, COALESCE(descripcion,'') AS descripcion, padre_id
                    FROM centros_costo WHERE id=?
                    """,
                    (int(cid),),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception:
            return None
