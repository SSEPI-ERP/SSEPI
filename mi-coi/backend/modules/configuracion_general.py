"""
Parámetros generales por base de datos (empresa): fiscal, ejercicio, decimales UI,
periodo 13, márgenes de impresión y metadatos para reportes/XML.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import get_db_path


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS configuracion_general (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            rfc TEXT NOT NULL DEFAULT '',
            razon_social TEXT NOT NULL DEFAULT '',
            regimen_fiscal TEXT NOT NULL DEFAULT '',
            domicilio_fiscal TEXT NOT NULL DEFAULT '',
            telefono TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            logo_path TEXT NOT NULL DEFAULT '',
            ejercicio_mes_inicio INTEGER NOT NULL DEFAULT 1,
            decimales_ui INTEGER NOT NULL DEFAULT 2,
            periodo_13_habilitado INTEGER NOT NULL DEFAULT 0,
            margen_superior_mm REAL NOT NULL DEFAULT 10,
            margen_inferior_mm REAL NOT NULL DEFAULT 10,
            margen_izquierdo_mm REAL NOT NULL DEFAULT 10,
            margen_derecho_mm REAL NOT NULL DEFAULT 10,
            fuente_reporte_pt INTEGER NOT NULL DEFAULT 9,
            perfil_impresion TEXT NOT NULL DEFAULT 'default',
            actualizado_en TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS folios_mensuales_config (
            anio INTEGER NOT NULL,
            mes INTEGER NOT NULL,
            tipo_poliza TEXT NOT NULL,
            folio_inicial INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (anio, mes, tipo_poliza)
        )
        """
    )
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
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM configuracion_general WHERE id = 1")
    if not cur.fetchone():
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            INSERT INTO configuracion_general (id, actualizado_en) VALUES (1, ?)
            """,
            (ahora,),
        )


class ConfiguracionGeneral:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self._ensure()

    def _ensure(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            _ensure_tables(conn)
            conn.commit()

    def obtener(self) -> Dict[str, Any]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            _ensure_tables(conn)
            cur = conn.execute("SELECT * FROM configuracion_general WHERE id = 1")
            row = cur.fetchone()
            if not row:
                return self._defaults()
            return dict(row)

    @staticmethod
    def _defaults() -> Dict[str, Any]:
        return {
            "id": 1,
            "rfc": "",
            "razon_social": "",
            "regimen_fiscal": "",
            "domicilio_fiscal": "",
            "telefono": "",
            "email": "",
            "logo_path": "",
            "ejercicio_mes_inicio": 1,
            "decimales_ui": 2,
            "periodo_13_habilitado": 0,
            "margen_superior_mm": 10.0,
            "margen_inferior_mm": 10.0,
            "margen_izquierdo_mm": 10.0,
            "margen_derecho_mm": 10.0,
            "fuente_reporte_pt": 9,
            "perfil_impresion": "default",
            "actualizado_en": "",
        }

    def guardar(self, datos: Dict[str, Any]) -> Dict[str, Any]:
        cur = self.obtener()
        cur.update({k: v for k, v in (datos or {}).items() if k in cur and k != "id"})
        # Normalizar
        mes_ini = int(cur.get("ejercicio_mes_inicio") or 1)
        if mes_ini < 1 or mes_ini > 12:
            mes_ini = 1
        dec = int(cur.get("decimales_ui") or 2)
        if dec not in (2, 4):
            dec = 2
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with sqlite3.connect(self.db_path) as conn:
            _ensure_tables(conn)
            conn.execute(
                """
                INSERT INTO configuracion_general (
                    id, rfc, razon_social, regimen_fiscal, domicilio_fiscal, telefono, email, logo_path,
                    ejercicio_mes_inicio, decimales_ui, periodo_13_habilitado,
                    margen_superior_mm, margen_inferior_mm, margen_izquierdo_mm, margen_derecho_mm,
                    fuente_reporte_pt, perfil_impresion, actualizado_en
                ) VALUES (1, ?,?,?,?,?,?,?, ?,?,?, ?,?,?,?,?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    rfc=excluded.rfc,
                    razon_social=excluded.razon_social,
                    regimen_fiscal=excluded.regimen_fiscal,
                    domicilio_fiscal=excluded.domicilio_fiscal,
                    telefono=excluded.telefono,
                    email=excluded.email,
                    logo_path=excluded.logo_path,
                    ejercicio_mes_inicio=excluded.ejercicio_mes_inicio,
                    decimales_ui=excluded.decimales_ui,
                    periodo_13_habilitado=excluded.periodo_13_habilitado,
                    margen_superior_mm=excluded.margen_superior_mm,
                    margen_inferior_mm=excluded.margen_inferior_mm,
                    margen_izquierdo_mm=excluded.margen_izquierdo_mm,
                    margen_derecho_mm=excluded.margen_derecho_mm,
                    fuente_reporte_pt=excluded.fuente_reporte_pt,
                    perfil_impresion=excluded.perfil_impresion,
                    actualizado_en=excluded.actualizado_en
                """,
                (
                    str(cur.get("rfc") or ""),
                    str(cur.get("razon_social") or ""),
                    str(cur.get("regimen_fiscal") or ""),
                    str(cur.get("domicilio_fiscal") or ""),
                    str(cur.get("telefono") or ""),
                    str(cur.get("email") or ""),
                    str(cur.get("logo_path") or ""),
                    mes_ini,
                    dec,
                    1 if int(cur.get("periodo_13_habilitado") or 0) else 0,
                    float(cur.get("margen_superior_mm") or 10),
                    float(cur.get("margen_inferior_mm") or 10),
                    float(cur.get("margen_izquierdo_mm") or 10),
                    float(cur.get("margen_derecho_mm") or 10),
                    int(cur.get("fuente_reporte_pt") or 9),
                    str(cur.get("perfil_impresion") or "default")[:80],
                    ahora,
                ),
            )
            conn.commit()
        return {"exito": True}

    def periodo_13_activo(self) -> bool:
        return bool(int(self.obtener().get("periodo_13_habilitado") or 0))

    def listar_folios_mensuales(self, anio: int) -> List[Dict[str, Any]]:
        anio = int(anio)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT anio, mes, tipo_poliza, folio_inicial
                FROM folios_mensuales_config
                WHERE anio = ?
                ORDER BY mes, tipo_poliza
                """,
                (anio,),
            )
            return [dict(r) for r in cur.fetchall()]

    def guardar_folio_mensual(self, anio: int, mes: int, tipo_poliza: str, folio_inicial: int) -> Dict[str, Any]:
        anio, mes = int(anio), int(mes)
        tipo_poliza = str(tipo_poliza or "").strip().upper()
        if mes < 1 or mes > 12:
            return {"exito": False, "error": "Mes debe ser 1-12 (folios por mes calendario)."}
        if tipo_poliza not in ("INGRESO", "EGRESO", "DIARIO"):
            return {"exito": False, "error": "Tipo debe ser INGRESO, EGRESO o DIARIO."}
        fi = max(1, int(folio_inicial or 1))
        with sqlite3.connect(self.db_path) as conn:
            _ensure_tables(conn)
            conn.execute(
                """
                INSERT INTO folios_mensuales_config (anio, mes, tipo_poliza, folio_inicial)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(anio, mes, tipo_poliza) DO UPDATE SET folio_inicial = excluded.folio_inicial
                """,
                (anio, mes, tipo_poliza, fi),
            )
            conn.commit()
        return {"exito": True}
