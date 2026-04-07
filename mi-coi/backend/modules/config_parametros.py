"""
Gestor de parámetros configurables (config_instituto.json) - Fase 2.

Objetivo: editar desde UI parámetros necesarios (SQL Server / motor),
minimizando el riesgo de romper configuración y evitando sobreescritura
de secretos si el campo queda vacío.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from config import get_project_root


CONFIG_PATH = os.path.join(get_project_root(), "config_instituto.json")


@dataclass
class ParametrosDB:
    DB_ENGINE: str = "sqlite"
    SQLSERVER_HOST: str = "localhost"
    SQLSERVER_PORT: str = ""
    SQLSERVER_DB: str = "contabilidad"
    SQLSERVER_USER: str = ""
    SQLSERVER_PASSWORD: str = ""
    SQLSERVER_DRIVER: str = "ODBC Driver 18 for SQL Server"
    SQLSERVER_TRUST_SERVER_CERT: str = "yes"


class ConfigParametros:
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path

    def cargar(self) -> Dict[str, Any]:
        if not os.path.isfile(self.config_path):
            return {}
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except Exception:
            return {}

    def obtener_parametros_db(self) -> ParametrosDB:
        d = self.cargar()
        return ParametrosDB(
            DB_ENGINE=str(d.get("DB_ENGINE") or "sqlite").strip().lower() or "sqlite",
            SQLSERVER_HOST=str(d.get("SQLSERVER_HOST") or "localhost").strip(),
            SQLSERVER_PORT=str(d.get("SQLSERVER_PORT") or "").strip(),
            SQLSERVER_DB=str(d.get("SQLSERVER_DB") or "contabilidad").strip(),
            SQLSERVER_USER=str(d.get("SQLSERVER_USER") or "").strip(),
            SQLSERVER_PASSWORD=str(d.get("SQLSERVER_PASSWORD") or "").strip(),
            SQLSERVER_DRIVER=str(d.get("SQLSERVER_DRIVER") or "ODBC Driver 18 for SQL Server").strip(),
            SQLSERVER_TRUST_SERVER_CERT=str(d.get("SQLSERVER_TRUST_SERVER_CERT") or "yes").strip(),
        )

    def guardar_db(
        self,
        *,
        DB_ENGINE: str,
        SQLSERVER_HOST: str,
        SQLSERVER_PORT: str,
        SQLSERVER_DB: str,
        SQLSERVER_USER: str,
        SQLSERVER_PASSWORD: str,
        SQLSERVER_DRIVER: str,
        SQLSERVER_TRUST_SERVER_CERT: str,
    ) -> Dict[str, Any]:
        """
        Si SQLSERVER_PASSWORD llega vacío, no se sobreescribe la contraseña previa.
        """
        current = self.cargar()
        updated = dict(current)

        updated["DB_ENGINE"] = str(DB_ENGINE).strip().lower()
        updated["SQLSERVER_HOST"] = str(SQLSERVER_HOST).strip()
        updated["SQLSERVER_PORT"] = str(SQLSERVER_PORT).strip()
        updated["SQLSERVER_DB"] = str(SQLSERVER_DB).strip()
        updated["SQLSERVER_USER"] = str(SQLSERVER_USER).strip()
        if str(SQLSERVER_PASSWORD or "").strip():
            updated["SQLSERVER_PASSWORD"] = str(SQLSERVER_PASSWORD).strip()
        updated["SQLSERVER_DRIVER"] = str(SQLSERVER_DRIVER).strip()
        updated["SQLSERVER_TRUST_SERVER_CERT"] = str(SQLSERVER_TRUST_SERVER_CERT).strip()

        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(updated, f, indent=2, ensure_ascii=False)

        return {"exito": True, "mensaje": "Parámetros DB guardados."}

    def obtener_ui_theme(self) -> str:
        """
        Tema UI (para frontend): 'light' o 'dark'.
        """
        d = self.cargar()
        v = str(d.get("UI_THEME") or "light").strip().lower()
        return v if v in ("light", "dark") else "light"

    def guardar_ui_theme(self, theme: str) -> Dict[str, Any]:
        t = str(theme or "").strip().lower()
        if t not in ("light", "dark"):
            return {"exito": False, "error": "UI_THEME inválido (use 'light' o 'dark')."}
        current = self.cargar()
        updated = dict(current)
        updated["UI_THEME"] = t
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(updated, f, indent=2, ensure_ascii=False)
        return {"exito": True, "mensaje": "Tema UI guardado."}

