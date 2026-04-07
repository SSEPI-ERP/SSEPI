from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Iterator, Optional


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_config() -> dict:
    path = os.path.join(_project_root(), "config_instituto.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def get_db_engine() -> str:
    cfg = _load_config()
    engine = str(cfg.get("DB_ENGINE") or os.getenv("DB_ENGINE") or "sqlite").strip().lower()
    return engine if engine in ("sqlite", "sqlserver") else "sqlite"


def get_sqlserver_dsn() -> str:
    cfg = _load_config()
    dsn = str(cfg.get("SQLSERVER_DSN") or os.getenv("SQLSERVER_DSN") or "").strip()
    if dsn:
        return dsn
    server = str(cfg.get("SQLSERVER_HOST") or os.getenv("SQLSERVER_HOST") or "localhost").strip()
    port = str(cfg.get("SQLSERVER_PORT") or os.getenv("SQLSERVER_PORT") or "").strip()
    database = str(cfg.get("SQLSERVER_DB") or os.getenv("SQLSERVER_DB") or "contabilidad").strip()
    user = str(cfg.get("SQLSERVER_USER") or os.getenv("SQLSERVER_USER") or "").strip()
    password = str(cfg.get("SQLSERVER_PASSWORD") or os.getenv("SQLSERVER_PASSWORD") or "").strip()
    driver = str(cfg.get("SQLSERVER_DRIVER") or os.getenv("SQLSERVER_DRIVER") or "ODBC Driver 18 for SQL Server").strip()
    trust = str(cfg.get("SQLSERVER_TRUST_SERVER_CERT") or os.getenv("SQLSERVER_TRUST_SERVER_CERT") or "yes").strip()
    server_part = f"{server},{port}" if port else server
    # Fallback: si el driver configurado no está instalado, usamos el mejor disponible.
    try:
        import pyodbc  # type: ignore

        drivers = [str(d) for d in pyodbc.drivers()]
    except Exception:
        drivers = []
    if driver and drivers and driver not in drivers:
        for candidate in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server", "ODBC Driver 13 for SQL Server", "SQL Server"):
            if candidate in drivers:
                driver = candidate
                break

    base = f"DRIVER={{{driver}}};SERVER={server_part};DATABASE={database};TrustServerCertificate={trust};"
    if user and password:
        return base + f"UID={user};PWD={password};"
    return base + "Trusted_Connection=yes;"


@contextmanager
def sqlserver_connection(autocommit: bool = False) -> Iterator[object]:
    """
    Conexión pyodbc a SQL Server.

    Nota: se importa pyodbc de forma diferida para no romper instalaciones SQLite-only.
    """
    try:
        import pyodbc  # type: ignore
    except Exception as ex:
        raise RuntimeError("pyodbc no disponible. Instala pyodbc para usar SQL Server.") from ex

    conn = pyodbc.connect(get_sqlserver_dsn(), autocommit=autocommit)
    try:
        yield conn
        if not autocommit:
            conn.commit()
    except Exception:
        if not autocommit:
            conn.rollback()
        raise
    finally:
        conn.close()


def sqlserver_available() -> bool:
    try:
        import pyodbc  # type: ignore # noqa
    except Exception:
        return False
    return True

