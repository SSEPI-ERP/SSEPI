"""
Gestión básica de usuarios y permisos por módulo.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime
from typing import Any, Dict, List, Set

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "backend",
            "database",
            "contabilidad.db",
        )


PERMISOS_DISPONIBLES = [
    ("catalogo", "Catálogo de cuentas"),
    ("polizas", "Captura de pólizas"),
    ("reportes", "Reportes contables"),
    ("presupuestos", "Presupuestos"),
    ("fiscal", "Módulo fiscal"),
    ("configuracion", "Configuración CFD/proveedor"),
    ("auditoria", "Auditoría y periodos"),
]


class SistemaUsuarios:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or get_db_path()
        self._crear_tabla()
        self._seed_admin()

    def _crear_tabla(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario TEXT NOT NULL UNIQUE,
                    nombre TEXT NOT NULL,
                    activo INTEGER NOT NULL DEFAULT 1,
                    es_admin INTEGER NOT NULL DEFAULT 0,
                    permisos_json TEXT NOT NULL DEFAULT '[]',
                    creado_en TEXT NOT NULL,
                    actualizado_en TEXT
                )
                """
            )

    def _seed_admin(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM usuarios WHERE UPPER(usuario) = 'ADMINISTRADOR'")
            if cur.fetchone():
                return
            ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """
                INSERT INTO usuarios (usuario, nombre, activo, es_admin, permisos_json, creado_en)
                VALUES (?, ?, 1, 1, ?, ?)
                """,
                ("ADMINISTRADOR", "Administrador del sistema", json.dumps([]), ahora),
            )
            conn.commit()

    def listar(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, usuario, nombre, activo, es_admin, permisos_json, creado_en, actualizado_en
                FROM usuarios
                ORDER BY usuario
                """
            )
            out = []
            for r in cur.fetchall():
                d = dict(r)
                try:
                    d["permisos"] = json.loads(d.get("permisos_json") or "[]")
                except Exception:
                    d["permisos"] = []
                out.append(d)
            return out

    def obtener(self, usuario: str) -> Dict[str, Any] | None:
        u = (usuario or "").strip()
        if not u:
            return None
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, usuario, nombre, activo, es_admin, permisos_json, creado_en, actualizado_en
                FROM usuarios WHERE usuario = ?
                """,
                (u,),
            )
            r = cur.fetchone()
            if not r:
                return None
            d = dict(r)
            try:
                d["permisos"] = json.loads(d.get("permisos_json") or "[]")
            except Exception:
                d["permisos"] = []
            return d

    def crear_o_actualizar(
        self,
        *,
        usuario: str,
        nombre: str,
        activo: bool = True,
        es_admin: bool = False,
        permisos: List[str] | Set[str] | None = None,
    ) -> Dict[str, Any]:
        u = (usuario or "").strip().upper()
        n = (nombre or "").strip()
        if not u:
            return {"exito": False, "error": "Usuario obligatorio"}
        if not n:
            return {"exito": False, "error": "Nombre obligatorio"}
        perms = sorted(set(permisos or []))
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute("SELECT id FROM usuarios WHERE usuario = ?", (u,))
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        UPDATE usuarios
                        SET nombre=?, activo=?, es_admin=?, permisos_json=?, actualizado_en=?
                        WHERE usuario=?
                        """,
                        (n, 1 if activo else 0, 1 if es_admin else 0, json.dumps(perms), ahora, u),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO usuarios (usuario, nombre, activo, es_admin, permisos_json, creado_en)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (u, n, 1 if activo else 0, 1 if es_admin else 0, json.dumps(perms), ahora),
                    )
                conn.commit()
            return {"exito": True, "usuario": u}
        except Exception as ex:
            return {"exito": False, "error": str(ex)}

    def eliminar(self, usuario: str) -> Dict[str, Any]:
        u = (usuario or "").strip().upper()
        if u == "ADMINISTRADOR":
            return {"exito": False, "error": "No se puede eliminar ADMINISTRADOR"}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM usuarios WHERE usuario = ?", (u,))
                conn.commit()
            return {"exito": True}
        except Exception as ex:
            return {"exito": False, "error": str(ex)}

    def permisos_de(self, usuario: str) -> Dict[str, Any]:
        reg = self.obtener(usuario)
        if not reg:
            return {"activo": False, "es_admin": False, "permisos": []}
        return {
            "activo": bool(reg.get("activo")),
            "es_admin": bool(reg.get("es_admin")),
            "permisos": list(reg.get("permisos") or []),
        }

