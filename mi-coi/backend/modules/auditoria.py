# backend/modules/auditoria.py
"""
Log de auditoría completo por acción y usuario (Fase 1 - Informe Aspel COI).
Registra: quien, que, cuando, modulo, detalle.
"""
import sqlite3
from datetime import datetime
from typing import Optional
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


def _get_ip() -> str:
    """Obtiene IP del equipo si es posible (opcional)."""
    try:
        import socket
        return socket.gethostbyname(socket.gethostname()) or ""
    except Exception:
        return ""


class LogAuditoria:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or get_db_path()
        self._crear_tabla()

    def _crear_tabla(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS log_auditoria (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario TEXT NOT NULL,
                    accion TEXT NOT NULL,
                    modulo TEXT NOT NULL,
                    detalle TEXT,
                    fecha TEXT NOT NULL,
                    ip TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON log_auditoria(fecha)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON log_auditoria(modulo)
            """)

    def registrar(
        self,
        usuario: str,
        accion: str,
        modulo: str,
        detalle: Optional[str] = None,
        ip: Optional[str] = None,
    ) -> bool:
        """Registra una acción en el log de auditoría."""
        try:
            fecha = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ip_val = ip or _get_ip()
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO log_auditoria (usuario, accion, modulo, detalle, fecha, ip)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (usuario or "Sistema", accion, modulo, detalle or "", fecha, ip_val),
                )
            return True
        except Exception:
            return False

    def obtener_ultimos(self, limite: int = 100, modulo: Optional[str] = None) -> list:
        """Obtiene los últimos registros del log, opcionalmente filtrados por módulo."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                if modulo:
                    cur = conn.execute(
                        """
                        SELECT id, usuario, accion, modulo, detalle, fecha, ip
                        FROM log_auditoria WHERE modulo = ? ORDER BY id DESC LIMIT ?
                        """,
                        (modulo, limite),
                    )
                else:
                    cur = conn.execute(
                        """
                        SELECT id, usuario, accion, modulo, detalle, fecha, ip
                        FROM log_auditoria ORDER BY id DESC LIMIT ?
                        """,
                        (limite,),
                    )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []
