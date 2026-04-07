# -*- coding: utf-8 -*-
"""Presupuesto anual por cuenta y centro de costo + comparativo vs ejecutado (cargos)."""
from __future__ import annotations

import os
import sqlite3
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, "backend", "database", "contabilidad.db")


def _ultimo_dia_mes(anio: int, mes: int) -> str:
    if mes == 12:
        fin = date(anio + 1, 1, 1)
    else:
        fin = date(anio, mes + 1, 1)
    fin = fin.fromordinal(fin.toordinal() - 1)
    return fin.strftime("%Y-%m-%d")


def _where_poliza_no_cancelada(cur: sqlite3.Cursor) -> str:
    cur.execute("PRAGMA table_info(polizas)")
    pcols = [r[1] for r in cur.fetchall()]
    if "estatus" not in pcols:
        return ""
    return "AND UPPER(COALESCE(p.estatus,'C')) != 'X'"


class PresupuestoCentroCosto:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self._ensure_table()

    def _ensure_table(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS presupuesto_centro_costo (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ejercicio INTEGER NOT NULL,
                    num_cuenta TEXT NOT NULL,
                    centro_costo_id INTEGER NOT NULL,
                    monto_anual REAL NOT NULL,
                    UNIQUE(ejercicio, num_cuenta, centro_costo_id)
                )
                """
            )
            conn.commit()

    def upsert(
        self,
        ejercicio: int,
        num_cuenta: str,
        centro_costo_id: int,
        monto_anual: float,
    ) -> Dict[str, Any]:
        ejercicio = int(ejercicio)
        num_cuenta = (num_cuenta or "").strip()
        centro_costo_id = int(centro_costo_id)
        try:
            ma = float(monto_anual)
        except (TypeError, ValueError):
            return {"exito": False, "error": "Monto anual inválido."}
        if not num_cuenta:
            return {"exito": False, "error": "Cuenta requerida."}
        if ma < 0:
            return {"exito": False, "error": "Monto anual no puede ser negativo."}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO presupuesto_centro_costo (ejercicio, num_cuenta, centro_costo_id, monto_anual)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(ejercicio, num_cuenta, centro_costo_id)
                    DO UPDATE SET monto_anual = excluded.monto_anual
                    """,
                    (ejercicio, num_cuenta, centro_costo_id, ma),
                )
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def eliminar(self, pres_id: int) -> Dict[str, Any]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM presupuesto_centro_costo WHERE id = ?", (int(pres_id),))
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar_por_ejercicio(self, ejercicio: int) -> List[Dict[str, Any]]:
        ejercicio = int(ejercicio)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """
                    SELECT p.id, p.ejercicio, p.num_cuenta, p.centro_costo_id, p.monto_anual,
                           c.codigo AS centro_codigo, c.nombre AS centro_nombre
                    FROM presupuesto_centro_costo p
                    LEFT JOIN centros_costo c ON c.id = p.centro_costo_id
                    WHERE p.ejercicio = ?
                    ORDER BY p.num_cuenta, c.codigo
                    """,
                    (ejercicio,),
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []

    def ejecutado_cargos_ytd(
        self,
        ejercicio: int,
        mes_hasta: int,
    ) -> Dict[Tuple[str, int], float]:
        """
        Suma de cargos (MN) por cuenta y centro en el año hasta el último día de mes_hasta.
        Convención simple para comparar contra presupuesto de gastos.
        """
        ejercicio = int(ejercicio)
        mes_hasta = int(mes_hasta)
        if mes_hasta < 1 or mes_hasta > 12:
            return {}
        f_ini = f"{ejercicio}-01-01"
        f_fin = _ultimo_dia_mes(ejercicio, mes_hasta)
        out: Dict[Tuple[str, int], float] = {}
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                where_est = _where_poliza_no_cancelada(cur)
                cur.execute(
                    f"""
                    SELECT pp.num_cuenta AS num_cuenta,
                           pp.centro_costo_id AS cid,
                           SUM(COALESCE(pp.cargo_mn, pp.cargo, 0)) AS tot
                    FROM partidas_poliza pp
                    JOIN polizas p ON p.id = pp.id_poliza
                    WHERE DATE(p.fecha) >= DATE(?)
                      AND DATE(p.fecha) <= DATE(?)
                      AND pp.centro_costo_id IS NOT NULL
                      {where_est}
                    GROUP BY pp.num_cuenta, pp.centro_costo_id
                    """,
                    (f_ini, f_fin),
                )
                for r in cur.fetchall():
                    cta = str(r[0] or "").strip()
                    try:
                        cid = int(r[1])
                    except (TypeError, ValueError):
                        continue
                    if cta:
                        out[(cta, cid)] = float(r[2] or 0.0)
        except Exception:
            pass
        return out

    def ejecutado_cargos_mes(
        self,
        ejercicio: int,
        mes: int,
    ) -> Dict[Tuple[str, int], float]:
        """
        Suma de cargos (MN) por cuenta y centro solo en el mes indicado del ejercicio.
        """
        ejercicio = int(ejercicio)
        mes = int(mes)
        if mes < 1 or mes > 12:
            return {}
        f_ini = f"{ejercicio}-{mes:02d}-01"
        f_fin = _ultimo_dia_mes(ejercicio, mes)
        out: Dict[Tuple[str, int], float] = {}
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                where_est = _where_poliza_no_cancelada(cur)
                cur.execute(
                    f"""
                    SELECT pp.num_cuenta AS num_cuenta,
                           pp.centro_costo_id AS cid,
                           SUM(COALESCE(pp.cargo_mn, pp.cargo, 0)) AS tot
                    FROM partidas_poliza pp
                    JOIN polizas p ON p.id = pp.id_poliza
                    WHERE DATE(p.fecha) >= DATE(?)
                      AND DATE(p.fecha) <= DATE(?)
                      AND pp.centro_costo_id IS NOT NULL
                      {where_est}
                    GROUP BY pp.num_cuenta, pp.centro_costo_id
                    """,
                    (f_ini, f_fin),
                )
                for r in cur.fetchall():
                    cta = str(r[0] or "").strip()
                    try:
                        cid = int(r[1])
                    except (TypeError, ValueError):
                        continue
                    if cta:
                        out[(cta, cid)] = float(r[2] or 0.0)
        except Exception:
            pass
        return out

    def reporte_comparativo(self, ejercicio: int, mes: int) -> List[Dict[str, Any]]:
        """Filas con presupuesto mensual, YTD, ejecutado mes/YTD, variaciones $ y %."""
        ejercicio = int(ejercicio)
        mes = int(mes)
        pres = self.listar_por_ejercicio(ejercicio)
        ej_map = self.ejecutado_cargos_ytd(ejercicio, mes)
        em_map = self.ejecutado_cargos_mes(ejercicio, mes)
        rows: List[Dict[str, Any]] = []
        for p in pres:
            cta = str(p.get("num_cuenta") or "").strip()
            try:
                cid = int(p.get("centro_costo_id") or 0)
            except (TypeError, ValueError):
                continue
            ma = float(p.get("monto_anual") or 0.0)
            pm = ma / 12.0
            pytd = ma * (mes / 12.0)
            ej = float(ej_map.get((cta, cid), 0.0))
            ej_mes = float(em_map.get((cta, cid), 0.0))
            var = pytd - ej
            var_pct = (var / pytd * 100.0) if abs(pytd) > 1e-6 else 0.0
            var_mes = pm - ej_mes
            var_mes_pct = (var_mes / pm * 100.0) if abs(pm) > 1e-6 else 0.0
            rows.append(
                {
                    "id": p.get("id"),
                    "num_cuenta": cta,
                    "centro_costo_id": cid,
                    "centro_codigo": p.get("centro_codigo") or "",
                    "centro_nombre": p.get("centro_nombre") or "",
                    "monto_anual": ma,
                    "presupuesto_mensual": pm,
                    "presupuesto_ytd": pytd,
                    "ejecutado_mes": ej_mes,
                    "ejecutado_ytd": ej,
                    "variacion_mn": var,
                    "variacion_pct": var_pct,
                    "variacion_mes_mn": var_mes,
                    "variacion_mes_pct": var_mes_pct,
                }
            )
        return rows
