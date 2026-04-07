# backend/modules/periodos_bloqueados.py
"""
Bloqueo de períodos contables (Fase 1 - Informe Aspel COI).
Evita modificaciones en pólizas de períodos ya cerrados.
"""
import sqlite3
from datetime import datetime
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


def _leer_password_supervisor() -> str:
    try:
        from backend.models.polizas import SistemaPolizas

        return SistemaPolizas(db_path=None)._read_supervisor_polizas_password()
    except Exception:
        return ""


class PeriodosBloqueados:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or get_db_path()
        self._crear_tabla()

    def _mes_max_permitido(self) -> int:
        try:
            from backend.modules.configuracion_general import ConfiguracionGeneral

            if ConfiguracionGeneral(db_path=self.db_path).periodo_13_activo():
                return 13
        except Exception:
            pass
        return 12

    def _crear_tabla(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS periodos_bloqueados (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    anio INTEGER NOT NULL,
                    mes INTEGER NOT NULL,
                    bloqueado INTEGER NOT NULL DEFAULT 1,
                    fecha_bloqueo TEXT,
                    usuario TEXT,
                    UNIQUE(anio, mes)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS periodo_reapertura_bitacora (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    anio INTEGER NOT NULL,
                    mes INTEGER NOT NULL,
                    usuario TEXT,
                    motivo TEXT NOT NULL,
                    fecha TEXT NOT NULL
                )
            """)

    def esta_bloqueado(self, anio: int, mes: int) -> bool:
        """Indica si el período (año, mes) está bloqueado."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute(
                    "SELECT bloqueado FROM periodos_bloqueados WHERE anio = ? AND mes = ?",
                    (anio, mes),
                ).fetchone()
                return bool(row and row[0])
        except Exception:
            return False

    def bloquear(self, anio: int, mes: int, usuario: str = None) -> Dict[str, Any]:
        """Bloquea un período. Si ya existe, actualiza."""
        mx = self._mes_max_permitido()
        if int(mes) < 1 or int(mes) > mx:
            return {"exito": False, "error": f"Mes debe estar entre 1 y {mx} (13 solo si está habilitado en Configuración general)."}
        try:
            fecha = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO periodos_bloqueados (anio, mes, bloqueado, fecha_bloqueo, usuario)
                    VALUES (?, ?, 1, ?, ?)
                    ON CONFLICT(anio, mes) DO UPDATE SET
                        bloqueado = 1, fecha_bloqueo = ?, usuario = ?
                    """,
                    (anio, mes, fecha, usuario or "Sistema", fecha, usuario or "Sistema"),
                )
            return {"exito": True, "mensaje": f"Período {mes:02d}/{anio} bloqueado."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def desbloquear(self, anio: int, mes: int) -> Dict[str, Any]:
        """Desbloquea un período."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "DELETE FROM periodos_bloqueados WHERE anio = ? AND mes = ?",
                    (anio, mes),
                )
            return {"exito": True, "mensaje": f"Período {mes:02d}/{anio} desbloqueado."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def desbloquear_con_supervisor(
        self,
        anio: int,
        mes: int,
        *,
        password_supervisor: str,
        usuario: str,
        motivo: str,
    ) -> Dict[str, Any]:
        """Desbloquea con contraseña de supervisor (config/env) y deja constancia en bitácora."""
        mx = self._mes_max_permitido()
        if int(mes) < 1 or int(mes) > mx:
            return {"exito": False, "error": f"Mes inválido (1–{mx})."}
        motivo = (motivo or "").strip()
        if len(motivo) < 5:
            return {"exito": False, "error": "Indique el motivo de reapertura (mínimo 5 caracteres)."}
        cfg = _leer_password_supervisor()
        if not cfg:
            return {
                "exito": False,
                "error": "No hay contraseña de supervisor configurada (config_instituto.json SUPERVISOR_POLIZAS_PASSWORD o env COI_SUPERVISOR_POLIZAS_PASSWORD).",
            }
        if (password_supervisor or "").strip() != cfg:
            return {"exito": False, "error": "Contraseña de supervisor incorrecta."}
        if not self.esta_bloqueado(int(anio), int(mes)):
            return {"exito": False, "error": "El período no está bloqueado."}
        try:
            fecha = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO periodo_reapertura_bitacora (anio, mes, usuario, motivo, fecha)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (int(anio), int(mes), (usuario or "")[:120], motivo[:2000], fecha),
                )
                conn.execute(
                    "DELETE FROM periodos_bloqueados WHERE anio = ? AND mes = ?",
                    (int(anio), int(mes)),
                )
            return {"exito": True, "mensaje": f"Período {mes:02d}/{anio} reabierto y registrado en bitácora."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar_reaperturas(self, limit: int = 200) -> List[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """
                    SELECT id, anio, mes, usuario, motivo, fecha
                    FROM periodo_reapertura_bitacora
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (int(limit),),
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []

    def listar(self) -> List[Dict[str, Any]]:
        """Lista todos los períodos bloqueados."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    "SELECT id, anio, mes, bloqueado, fecha_bloqueo, usuario FROM periodos_bloqueados ORDER BY anio DESC, mes DESC"
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []
