# backend/models/conceptos_poliza.py - Catálogo de conceptos para pólizas (filtro por código/nombre)
import sqlite3
import os
from typing import List, Dict, Any

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

def _db():
    return get_db_path()

def _crear_tabla():
    with sqlite3.connect(_db()) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conceptos_poliza (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT NOT NULL,
                nombre TEXT NOT NULL,
                UNIQUE(codigo)
            )
        """)
        cur = conn.execute("SELECT COUNT(*) FROM conceptos_poliza")
        if cur.fetchone()[0] == 0:
            for cod, nom in [
                ("VENTA", "Venta de mercancía"),
                ("VENTAS", "Ventas"),
                ("COMPRA", "Compra de mercancía"),
                ("GASTO", "Gasto general"),
                ("HONORARIOS", "Honorarios profesionales"),
                ("NOMINA", "Nómina"),
                ("SERVICIO", "Servicios"),
                ("DEPREC", "Depreciación"),
                ("AJUSTE", "Ajuste contable"),
                ("CIERRE", "Cierre de ejercicio"),
                ("PAGO", "Pago a proveedor"),
                ("COBRO", "Cobro a cliente"),
                ("IVA", "IVA trasladado"),
                ("RET", "Retención de impuestos"),
            ]:
                conn.execute(
                    "INSERT OR IGNORE INTO conceptos_poliza (codigo, nombre) VALUES (?, ?)",
                    (cod, nom)
                )

def buscar_por_texto(texto: str, limite: int = 15) -> List[Dict[str, Any]]:
    """Filtra conceptos por código o nombre (para autocompletado)."""
    _crear_tabla()
    texto = (texto or "").strip()
    if not texto:
        with sqlite3.connect(_db()) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                "SELECT id, codigo, nombre FROM conceptos_poliza ORDER BY nombre LIMIT ?",
                (limite,)
            )
            return [dict(r) for r in cur.fetchall()]
    t = f"%{texto}%"
    with sqlite3.connect(_db()) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            """SELECT id, codigo, nombre FROM conceptos_poliza
               WHERE codigo LIKE ? OR nombre LIKE ? ORDER BY nombre LIMIT ?""",
            (t, t, limite)
        )
        return [dict(r) for r in cur.fetchall()]

def listar_todos() -> List[Dict[str, Any]]:
    _crear_tabla()
    with sqlite3.connect(_db()) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute("SELECT id, codigo, nombre FROM conceptos_poliza ORDER BY nombre")
        return [dict(r) for r in cur.fetchall()]
