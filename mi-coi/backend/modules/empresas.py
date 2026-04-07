"""
Multi-empresa real (SQLite por empresa) usando config_instituto.json.

- Guarda lista de empresas con su archivo .db
- Selecciona empresa activa actualizando DB_FILE_OVERRIDE
- Copia catálogo/config básica entre empresas (catalogo_cuentas + codigos SAT + centros de costo)
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional

from config import get_project_root, get_instituto_config


def _config_path() -> str:
    return os.path.join(get_project_root(), "config_instituto.json")


def _slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "empresa"


class EmpresasManager:
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or _config_path()

    def cargar(self) -> Dict[str, Any]:
        d = get_instituto_config()
        # Normalizar estructura
        empresas = d.get("EMPRESAS")
        if isinstance(empresas, list):
            out = []
            for it in empresas:
                if isinstance(it, dict) and it.get("nombre") and it.get("db_file"):
                    out.append({"nombre": str(it["nombre"]), "db_file": str(it["db_file"])})
            d["EMPRESAS"] = out
        elif empresas is None:
            d["EMPRESAS"] = []
        else:
            d["EMPRESAS"] = []
        return d

    def _guardar_merge(self, patch: Dict[str, Any]) -> None:
        current = {}
        if os.path.isfile(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    current = json.load(f) or {}
            except Exception:
                current = {}
        if not isinstance(current, dict):
            current = {}
        updated = dict(current)
        updated.update(patch)
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(updated, f, indent=2, ensure_ascii=False)

    def listar(self) -> List[Dict[str, str]]:
        d = self.cargar()
        return list(d.get("EMPRESAS") or [])

    def _ruta_db_por_nombre(self, nombre: str) -> Optional[str]:
        nombre = (nombre or "").strip()
        for it in self.listar():
            if str(it.get("nombre") or "").strip() == nombre:
                return str(it.get("db_file") or "").strip() or None
        return None

    def crear_empresa(self, nombre: str) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "Nombre requerido"}
        # Ruta por defecto: backend/database/empresas/<slug>.db
        base_dir = os.path.join(get_project_root(), "backend", "database", "empresas")
        os.makedirs(base_dir, exist_ok=True)
        db_file = os.path.join(base_dir, f"{_slug(nombre)}.db")

        empresas = self.listar()
        if any(str(e.get("nombre") or "").strip() == nombre for e in empresas):
            return {"exito": False, "error": "La empresa ya existe"}

        empresas.append({"nombre": nombre, "db_file": db_file})
        self._guardar_merge({"EMPRESAS": empresas})

        # Crear archivo si no existe (schema se creará al abrir la app, pero lo tocamos aquí)
        try:
            os.makedirs(os.path.dirname(db_file), exist_ok=True)
            with sqlite3.connect(db_file) as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass

        return {"exito": True, "nombre": nombre, "db_file": db_file}

    def seleccionar_empresa(self, nombre: str) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "Nombre requerido"}
        db_file = self._ruta_db_por_nombre(nombre)
        if not db_file:
            return {"exito": False, "error": "Empresa no encontrada"}
        os.makedirs(os.path.dirname(db_file), exist_ok=True)
        # Set override global para que get_db_path() use esta BD
        self._guardar_merge({"EMPRESA_ACTIVA": nombre, "DB_FILE_OVERRIDE": db_file})
        return {"exito": True, "nombre": nombre, "db_file": db_file}

    def copiar_catalogo(self, origen: str, destino: str, *, reemplazar: bool = True) -> Dict[str, Any]:
        """
        Copia catálogos base entre BDs:
        - catalogo_cuentas (todas las columnas comunes)
        - codigos_agrupadores_sat
        - centros_costo
        """
        origen = (origen or "").strip()
        destino = (destino or "").strip()
        if not origen or not destino:
            return {"exito": False, "error": "Origen/destino requeridos"}
        src = self._ruta_db_por_nombre(origen)
        dst = self._ruta_db_por_nombre(destino)
        if not src or not dst:
            return {"exito": False, "error": "Empresa origen o destino no encontrada"}
        if os.path.abspath(src) == os.path.abspath(dst):
            return {"exito": False, "error": "Origen y destino son la misma empresa"}

        os.makedirs(os.path.dirname(dst), exist_ok=True)

        def cols(conn: sqlite3.Connection, table: str) -> List[str]:
            cur = conn.execute(f"PRAGMA table_info({table})")
            return [r[1] for r in cur.fetchall()]

        def copy_table(table: str) -> int:
            with sqlite3.connect(src) as csrc, sqlite3.connect(dst) as cdst:
                csrc.row_factory = sqlite3.Row
                # Asegurar tablas destino mínimas
                if table == "catalogo_cuentas":
                    cdst.execute(
                        """
                        CREATE TABLE IF NOT EXISTS catalogo_cuentas (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            num_cuenta TEXT UNIQUE NOT NULL,
                            nombre_cuenta TEXT NOT NULL,
                            nivel INTEGER NOT NULL,
                            naturaleza TEXT CHECK(naturaleza IN ('DEUDORA', 'ACREEDORA')) NOT NULL,
                            cuenta_mayor TEXT
                        );
                        """
                    )
                if table == "codigos_agrupadores_sat":
                    cdst.execute(
                        """
                        CREATE TABLE IF NOT EXISTS codigos_agrupadores_sat (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            codigo TEXT UNIQUE NOT NULL,
                            descripcion TEXT NOT NULL,
                            nivel INTEGER NOT NULL
                        );
                        """
                    )
                if table == "centros_costo":
                    cdst.execute(
                        """
                        CREATE TABLE IF NOT EXISTS centros_costo (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            codigo TEXT UNIQUE NOT NULL,
                            nombre TEXT NOT NULL,
                            padre_id INTEGER
                        );
                        """
                    )
                cdst.commit()

                src_cols = cols(csrc, table)
                dst_cols = cols(cdst, table)
                common = [c for c in src_cols if c in dst_cols and c != "id"]
                if not common:
                    return 0
                sel = f"SELECT {', '.join(common)} FROM {table}"
                rows = csrc.execute(sel).fetchall()

                if reemplazar:
                    cdst.execute(f"DELETE FROM {table}")
                    cdst.commit()

                ins = f"INSERT INTO {table} ({', '.join(common)}) VALUES ({', '.join(['?']*len(common))})"
                cdst.executemany(ins, [tuple(r[c] for c in common) for r in rows])
                cdst.commit()
                return len(rows)

        try:
            n1 = copy_table("codigos_agrupadores_sat")
            n2 = copy_table("catalogo_cuentas")
            n3 = copy_table("centros_costo")
            return {"exito": True, "copiados": {"codigos_sat": n1, "catalogo_cuentas": n2, "centros_costo": n3}}
        except Exception as e:
            return {"exito": False, "error": str(e)}

"""
Multiempresa (base) usando BD SQLite separada por empresa.

Estrategia: cada empresa tiene su archivo DB en backend/database/empresas/<slug>.db
Se guarda la empresa activa en config_instituto.json y config.get_db_path() la respeta.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from config import get_project_root, get_instituto_config


def _config_path() -> str:
    return os.path.join(get_project_root(), "config_instituto.json")


def _slug(nombre: str) -> str:
    s = (nombre or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "empresa"


def _empresas_dir() -> str:
    return os.path.join(get_project_root(), "backend", "database", "empresas")


def db_path_para_empresa(nombre: str) -> str:
    os.makedirs(_empresas_dir(), exist_ok=True)
    return os.path.join(_empresas_dir(), f"{_slug(nombre)}.db")


class EmpresasManager:
    def cargar(self) -> Dict[str, Any]:
        cfg = get_instituto_config() or {}
        if not isinstance(cfg, dict):
            cfg = {}
        empresas = cfg.get("EMPRESAS")
        if not isinstance(empresas, list):
            empresas = []
        active = str(cfg.get("EMPRESA_ACTIVA") or "").strip()
        return {"empresas": empresas, "activa": active}

    def guardar_cfg(self, cfg: Dict[str, Any]) -> None:
        path = _config_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)

    def crear_empresa(self, nombre: str) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "Nombre de empresa obligatorio"}
        cfg = get_instituto_config() or {}
        if not isinstance(cfg, dict):
            cfg = {}
        empresas = cfg.get("EMPRESAS")
        if not isinstance(empresas, list):
            empresas = []
        if nombre not in empresas:
            empresas.append(nombre)
        cfg["EMPRESAS"] = sorted(set(empresas), key=lambda s: str(s).lower())
        cfg.setdefault("EMPRESA_ACTIVA", nombre)
        # Guardar DB path explícito para compatibilidad
        cfg["DB_FILE_OVERRIDE"] = db_path_para_empresa(cfg["EMPRESA_ACTIVA"])
        self.guardar_cfg(cfg)
        # Crear archivo físico si no existe
        path_db = db_path_para_empresa(nombre)
        os.makedirs(os.path.dirname(path_db), exist_ok=True)
        if not os.path.isfile(path_db):
            open(path_db, "a", encoding="utf-8").close()
        return {"exito": True, "empresa": nombre, "db_path": path_db}

    def seleccionar_empresa(self, nombre: str) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "Empresa inválida"}
        cfg = get_instituto_config() or {}
        if not isinstance(cfg, dict):
            cfg = {}
        empresas = cfg.get("EMPRESAS")
        if not isinstance(empresas, list):
            empresas = []
        if nombre not in empresas:
            empresas.append(nombre)
        cfg["EMPRESAS"] = sorted(set(empresas), key=lambda s: str(s).lower())
        cfg["EMPRESA_ACTIVA"] = nombre
        cfg["DB_FILE_OVERRIDE"] = db_path_para_empresa(nombre)
        self.guardar_cfg(cfg)
        return {"exito": True, "empresa": nombre, "db_path": cfg["DB_FILE_OVERRIDE"]}

