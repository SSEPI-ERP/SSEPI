from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from config import get_db_path


class RevaluacionCambiaria:
    """
    Revaluación de saldos en moneda extranjera (ME) usando partidas_poliza.

    Calcula por cuenta+moneda:
    - saldo_me: saldo en moneda original (cargo/abono)
    - saldo_mn_libros: equivalente en MXN registrado (cargo_mn/abono_mn)
    - saldo_mn_revaluado: saldo_me * tc_corte
    - diferencia_mn: saldo_mn_revaluado - saldo_mn_libros
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def _where_estatus_afectadas(self, cur: sqlite3.Cursor) -> str:
        try:
            cur.execute("PRAGMA table_info(polizas)")
            cols = [r[1] for r in cur.fetchall()]
            if "estatus" in cols:
                # Solo afectadas para revaluación
                return "AND UPPER(COALESCE(p.estatus,'A')) = 'A'"
        except sqlite3.Error:
            pass
        return ""

    def _periodo_de_fecha(self, fecha: str) -> Tuple[int, int]:
        dt = datetime.strptime((fecha or "")[:10], "%Y-%m-%d")
        return int(dt.year), int(dt.month)

    def saldos_por_moneda(
        self,
        *,
        fecha_corte: str,
        moneda: str,
        incluir_ceros: bool = False,
        max_rows: int = 20000,
    ) -> Dict[str, Any]:
        """
        Devuelve lista de saldos por cuenta para una moneda extranjera.
        """
        moneda = (moneda or "").strip().upper()
        if moneda in ("", "MXN"):
            return {"exito": False, "error": "Moneda inválida (use una moneda extranjera activa del catálogo)."}
        fecha_corte = (fecha_corte or "").strip()[:10]
        try:
            datetime.strptime(fecha_corte, "%Y-%m-%d")
        except Exception:
            return {"exito": False, "error": "fecha_corte inválida (YYYY-MM-DD)."}

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            where_af = self._where_estatus_afectadas(cur)

            # Solo cuentas que tengan partidas con moneda != MXN; si la columna moneda no existe, no hay ME.
            try:
                cur.execute("PRAGMA table_info(partidas_poliza)")
                cols_pp = {r[1] for r in cur.fetchall()}
                if "moneda" not in cols_pp or "tipo_cambio" not in cols_pp:
                    return {"exito": True, "rows": [], "mensaje": "No hay columnas multimoneda en partidas_poliza."}
            except sqlite3.Error:
                return {"exito": False, "error": "No se pudo leer esquema de partidas_poliza."}

            cur.execute(
                f"""
                SELECT
                    pp.num_cuenta,
                    COALESCE(c.nombre_cuenta,'') as nombre_cuenta,
                    COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                    SUM(COALESCE(pp.cargo,0)) as cargo_me,
                    SUM(COALESCE(pp.abono,0)) as abono_me,
                    SUM(COALESCE(pp.cargo_mn,0)) as cargo_mn,
                    SUM(COALESCE(pp.abono_mn,0)) as abono_mn
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE COALESCE(UPPER(TRIM(pp.moneda)),'MXN') = ?
                  AND DATE(p.fecha) <= DATE(?)
                  {where_af}
                GROUP BY pp.num_cuenta, COALESCE(c.nombre_cuenta,''), COALESCE(c.naturaleza,'DEUDORA')
                ORDER BY pp.num_cuenta
                LIMIT ?
                """,
                (moneda, fecha_corte, int(max_rows)),
            )

            rows: List[Dict[str, Any]] = []
            for r in cur.fetchall():
                nat = (r["naturaleza"] or "DEUDORA").upper().strip()
                cargo_me = float(r["cargo_me"] or 0.0)
                abono_me = float(r["abono_me"] or 0.0)
                cargo_mn = float(r["cargo_mn"] or 0.0)
                abono_mn = float(r["abono_mn"] or 0.0)
                if nat == "ACREEDORA":
                    saldo_me = abono_me - cargo_me
                    saldo_mn = abono_mn - cargo_mn
                else:
                    saldo_me = cargo_me - abono_me
                    saldo_mn = cargo_mn - abono_mn
                if (not incluir_ceros) and abs(saldo_me) < 1e-9 and abs(saldo_mn) < 0.01:
                    continue
                rows.append(
                    {
                        "num_cuenta": r["num_cuenta"],
                        "nombre_cuenta": r["nombre_cuenta"],
                        "naturaleza": nat,
                        "cargo_me": cargo_me,
                        "abono_me": abono_me,
                        "saldo_me": saldo_me,
                        "saldo_mn_libros": saldo_mn,
                    }
                )

            return {"exito": True, "rows": rows, "moneda": moneda, "fecha_corte": fecha_corte}

    def previsualizar_revaluacion(
        self,
        *,
        fecha_corte: str,
        moneda: str,
        tipo_cambio_corte: float,
        incluir_ceros: bool = False,
    ) -> Dict[str, Any]:
        """
        Regresa filas con diferencia por revaluación en MXN.
        """
        try:
            tc = float(tipo_cambio_corte or 0.0)
        except Exception:
            tc = 0.0
        if tc <= 0:
            return {"exito": False, "error": "tipo_cambio_corte inválido."}

        base = self.saldos_por_moneda(fecha_corte=fecha_corte, moneda=moneda, incluir_ceros=incluir_ceros)
        if not base.get("exito"):
            return base
        out = []
        total_diff = 0.0
        for r in base.get("rows") or []:
            saldo_me = float(r.get("saldo_me") or 0.0)
            saldo_mn = float(r.get("saldo_mn_libros") or 0.0)
            reval = saldo_me * tc
            diff = reval - saldo_mn
            if not incluir_ceros and abs(diff) < 0.01:
                continue
            total_diff += diff
            rr = dict(r)
            rr["tipo_cambio_corte"] = tc
            rr["saldo_mn_revaluado"] = reval
            rr["diferencia_mn"] = diff
            out.append(rr)
        return {
            "exito": True,
            "rows": out,
            "moneda": (moneda or "").upper().strip(),
            "fecha_corte": (fecha_corte or "").strip()[:10],
            "tipo_cambio_corte": tc,
            "total_diferencia_mn": total_diff,
        }

    def reporte_posicion_moneda_extranjera(
        self,
        *,
        fecha_corte: str,
        tc_actual_por_iso: Dict[str, float],
        incluir_ceros: bool = False,
        max_rows: int = 20000,
    ) -> Dict[str, Any]:
        """
        Posición en moneda extranjera: saldo ME, TC implícito (MN/ME), TC actual del catálogo,
        ganancia o pérdida no realizada en MXN.
        """
        fecha_corte = (fecha_corte or "").strip()[:10]
        try:
            datetime.strptime(fecha_corte, "%Y-%m-%d")
        except Exception:
            return {"exito": False, "error": "fecha_corte inválida (YYYY-MM-DD)."}
        tc_map: Dict[str, float] = {}
        for k, v in (tc_actual_por_iso or {}).items():
            code = str(k).strip().upper()[:3]
            if not code or code == "MXN":
                continue
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            if fv > 0:
                tc_map[code] = fv

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            where_af = self._where_estatus_afectadas(cur)
            try:
                cur.execute("PRAGMA table_info(partidas_poliza)")
                cols_pp = {r[1] for r in cur.fetchall()}
                if "moneda" not in cols_pp or "tipo_cambio" not in cols_pp:
                    return {"exito": True, "rows": [], "mensaje": "No hay columnas multimoneda en partidas_poliza."}
            except sqlite3.Error:
                return {"exito": False, "error": "No se pudo leer esquema de partidas_poliza."}

            cur.execute(
                f"""
                SELECT
                    pp.num_cuenta,
                    COALESCE(UPPER(TRIM(pp.moneda)),'MXN') AS moneda_iso,
                    COALESCE(c.nombre_cuenta,'') AS nombre_cuenta,
                    COALESCE(c.naturaleza,'DEUDORA') AS naturaleza,
                    SUM(COALESCE(pp.cargo,0)) AS cargo_me,
                    SUM(COALESCE(pp.abono,0)) AS abono_me,
                    SUM(COALESCE(pp.cargo_mn,0)) AS cargo_mn,
                    SUM(COALESCE(pp.abono_mn,0)) AS abono_mn
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE COALESCE(UPPER(TRIM(pp.moneda)),'MXN') != 'MXN'
                  AND DATE(p.fecha) <= DATE(?)
                  {where_af}
                GROUP BY pp.num_cuenta, COALESCE(UPPER(TRIM(pp.moneda)),'MXN'),
                         COALESCE(c.nombre_cuenta,''), COALESCE(c.naturaleza,'DEUDORA')
                ORDER BY moneda_iso, pp.num_cuenta
                LIMIT ?
                """,
                (fecha_corte, int(max_rows)),
            )

            rows_out: List[Dict[str, Any]] = []
            eps = 1e-9
            for r in cur.fetchall():
                nat = (r["naturaleza"] or "DEUDORA").upper().strip()
                mon_iso = (r["moneda_iso"] or "").strip().upper()[:3]
                cargo_me = float(r["cargo_me"] or 0.0)
                abono_me = float(r["abono_me"] or 0.0)
                cargo_mn = float(r["cargo_mn"] or 0.0)
                abono_mn = float(r["abono_mn"] or 0.0)
                if nat == "ACREEDORA":
                    saldo_me = abono_me - cargo_me
                    saldo_mn = abono_mn - cargo_mn
                else:
                    saldo_me = cargo_me - abono_me
                    saldo_mn = cargo_mn - abono_mn
                if (not incluir_ceros) and abs(saldo_me) < eps and abs(saldo_mn) < 0.01:
                    continue
                tc_actual = float(tc_map.get(mon_iso) or 0.0)
                tc_prom: Optional[float]
                if abs(saldo_me) > eps:
                    tc_prom = saldo_mn / saldo_me
                else:
                    tc_prom = None
                if tc_actual > 0:
                    val_mrk = saldo_me * tc_actual
                    gp_nr = val_mrk - saldo_mn
                else:
                    val_mrk = None
                    gp_nr = None
                rows_out.append(
                    {
                        "num_cuenta": r["num_cuenta"],
                        "moneda": mon_iso,
                        "nombre_cuenta": r["nombre_cuenta"],
                        "naturaleza": nat,
                        "saldo_me": saldo_me,
                        "saldo_mn_libros": saldo_mn,
                        "tc_promedio_implicito": tc_prom,
                        "tipo_cambio_actual": tc_actual if tc_actual > 0 else None,
                        "valor_mn_mercado": val_mrk,
                        "ganancia_perdida_no_realizada_mn": gp_nr,
                    }
                )

        return {"exito": True, "rows": rows_out, "fecha_corte": fecha_corte}

