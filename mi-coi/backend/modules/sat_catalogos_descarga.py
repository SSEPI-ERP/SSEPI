"""
Herramientas para mantener catálogos fiscales: importación desde CSV/XML local
y merge en tablas SQLite. Las URLs del SAT cambian; se prioriza importación desde archivo.

Tipos soportados en `sat_catalogo_generico`: ClaveProdServ, Unidad, FormaPago, MetodoPago, RegimenFiscal, UsoCFDI.
También actualiza `codigos_agrupadores_sat` si el CSV trae columnas codigo,descripcion,nivel.
"""

from __future__ import annotations

import csv
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import get_db_path


def _ensure_generico(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sat_catalogo_generico (
            tipo TEXT NOT NULL,
            clave TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            actualizado_en TEXT NOT NULL,
            PRIMARY KEY (tipo, clave)
        )
        """
    )


def importar_csv_generico(
    db_path: str,
    tipo: str,
    ruta_csv: str,
    *,
    encoding: str = "utf-8-sig",
    delimitador: str = ",",
) -> Dict[str, Any]:
    """
    CSV con columnas: clave, descripcion (o clave, nombre).
    """
    tipo = (tipo or "").strip()
    path = os.path.abspath(ruta_csv or "")
    if not tipo:
        return {"exito": False, "error": "tipo requerido"}
    if not os.path.isfile(path):
        return {"exito": False, "error": "Archivo no encontrado."}
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    n = 0
    try:
        with open(path, "r", encoding=encoding, newline="") as f:
            sample = f.read(4096)
            f.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=delimitador)
            except csv.Error:
                dialect = csv.excel
                dialect.delimiter = delimitador
            reader = csv.reader(f, dialect)
            rows = list(reader)
    except OSError as e:
        return {"exito": False, "error": str(e)}

    if not rows:
        return {"exito": False, "error": "CSV vacío"}

    header = [str(x or "").strip().lower() for x in rows[0]]
    def col(*names: str) -> int:
        for name in names:
            if name in header:
                return header.index(name)
        return -1

    i_clave = col("clave", "c_claveprodserv", "codigo", "c_formapago", "c_metodopago", "c_regimenfiscal", "c_usocfdi")
    i_desc = col("descripcion", "descripción", "nombre", "texto")
    if i_clave < 0:
        i_clave = 0
    if i_desc < 0:
        i_desc = 1 if len(header) > 1 else 0

    data: List[tuple] = []
    for r in rows[1:]:
        if not r or len(r) <= i_clave:
            continue
        cl = str(r[i_clave] or "").strip()
        if not cl:
            continue
        ds = str(r[i_desc] if i_desc < len(r) else "").strip() or cl
        data.append((tipo[:40], cl[:80], ds[:500], ahora))

    with sqlite3.connect(db_path) as conn:
        _ensure_generico(conn)
        conn.executemany(
            """
            INSERT INTO sat_catalogo_generico (tipo, clave, descripcion, actualizado_en)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(tipo, clave) DO UPDATE SET
                descripcion = excluded.descripcion,
                actualizado_en = excluded.actualizado_en
            """,
            data,
        )
        conn.commit()
        n = len(data)
    return {"exito": True, "registros": n, "tipo": tipo}


def importar_agrupadores_csv(db_path: str, ruta_csv: str, *, encoding: str = "utf-8-sig") -> Dict[str, Any]:
    """CSV: codigo, descripcion, nivel"""
    path = os.path.abspath(ruta_csv or "")
    if not os.path.isfile(path):
        return {"exito": False, "error": "Archivo no encontrado."}
    rows: List[tuple] = []
    try:
        with open(path, "r", encoding=encoding, newline="") as f:
            reader = csv.DictReader(f)
            for d in reader:
                if not d:
                    continue
                cod = str(d.get("codigo") or d.get("Codigo") or "").strip()
                des = str(d.get("descripcion") or d.get("Descripción") or "").strip()
                if not cod:
                    continue
                try:
                    nv = int(d.get("nivel") or d.get("Nivel") or 1)
                except (TypeError, ValueError):
                    nv = 1
                rows.append((cod[:32], des[:500] or cod, nv))
    except OSError as e:
        return {"exito": False, "error": str(e)}

    if not rows:
        return {"exito": False, "error": "Sin filas válidas"}
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS codigos_agrupadores_sat (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                descripcion TEXT NOT NULL,
                nivel INTEGER NOT NULL
            )
            """
        )
        conn.executemany(
            """
            INSERT INTO codigos_agrupadores_sat (codigo, descripcion, nivel)
            VALUES (?, ?, ?)
            ON CONFLICT(codigo) DO UPDATE SET
                descripcion = excluded.descripcion,
                nivel = excluded.nivel
            """,
            rows,
        )
        conn.commit()
    return {"exito": True, "registros": len(rows)}


def contar_catalogos(db_path: Optional[str] = None) -> Dict[str, Any]:
    db_path = db_path or get_db_path()
    out: Dict[str, Any] = {"agrupadores": 0, "generico_por_tipo": {}}
    try:
        with sqlite3.connect(db_path) as conn:
            try:
                out["agrupadores"] = int(conn.execute("SELECT COUNT(*) FROM codigos_agrupadores_sat").fetchone()[0] or 0)
            except sqlite3.Error:
                pass
            _ensure_generico(conn)
            cur = conn.execute(
                "SELECT tipo, COUNT(*) FROM sat_catalogo_generico GROUP BY tipo ORDER BY tipo"
            )
            for t, c in cur.fetchall():
                out["generico_por_tipo"][str(t)] = int(c or 0)
    except sqlite3.Error:
        pass
    return out


def resumen_actualizacion_sat(db_path: Optional[str] = None) -> str:
    c = contar_catalogos(db_path)
    parts = [f"Códigos agrupadores SAT: {c['agrupadores']}"]
    for t, n in sorted(c.get("generico_por_tipo", {}).items()):
        parts.append(f"{t}: {n}")
    if len(parts) == 1:
        parts.append("Catálogo genérico: sin registros (importe CSV desde el portal SAT).")
    return "\n".join(parts)
