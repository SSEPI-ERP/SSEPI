"""
Reportes por Centro de costo (Fase 2 - COI-like).

- Balanza por centro: basada en partidas_poliza.centro_costo_id dentro del periodo.
- Estado de resultados por centro: suma de movimientos por cuentas de resultado dentro del periodo.

Nota:
Los saldos inicial/final por centro no existen en el motor (saldos_cuenta es global),
por lo que este reporte muestra SI=0 y SF calculado por naturaleza solo para el periodo.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Dict, List, Optional

try:
    from config import get_db_path
except Exception:

    def get_db_path():
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, "backend", "database", "contabilidad.db")


def _where_poliza_no_cancelada(cur: sqlite3.Cursor) -> str:
    """Incluye C/V/A; excluye canceladas (X)."""
    cur.execute("PRAGMA table_info(polizas)")
    pcols = [r[1] for r in cur.fetchall()]
    if "estatus" not in pcols:
        return ""
    return "AND UPPER(COALESCE(p.estatus,'C')) != 'X'"


class ReportesCentrosCosto:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def auxiliares_por_centro(self, ejercicio: int, periodo: int, centro_costo_id: int) -> List[Dict]:
        """
        Auxiliares (estilo COI) de un centro de costo por mes, agrupado por cuenta.
        Shape compatible con `AuxiliaresManager.reporte_mes()` para reutilizar export PDF/Excel COI.
        """
        centro_costo_id = int(centro_costo_id)
        periodo = int(periodo)
        ejercicio = int(ejercicio)

        def _rango_mes(anio: int, mes: int):
            from datetime import date, timedelta

            ini = date(int(anio), int(mes), 1)
            if int(mes) == 12:
                fin = date(int(anio) + 1, 1, 1) - timedelta(days=1)
            else:
                fin = date(int(anio), int(mes) + 1, 1) - timedelta(days=1)
            return ini.strftime("%Y-%m-%d"), fin.strftime("%Y-%m-%d")

        f_ini, f_fin = _rango_mes(ejercicio, periodo)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            where_estatus = _where_poliza_no_cancelada(cur)

            cur.execute(
                f"""
                SELECT
                    pp.num_cuenta AS num_cuenta,
                    COALESCE(c.nombre_cuenta,'') AS nombre_cuenta,
                    p.tipo_poliza AS tipo,
                    p.numero_poliza AS numero,
                    p.fecha AS fecha,
                    COALESCE(pp.concepto_linea,'') AS concepto_linea,
                    COALESCE(p.concepto,'') AS concepto_poliza,
                    COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                    COALESCE(pp.abono_mn, pp.abono, 0) AS abono
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE p.fecha BETWEEN ? AND ?
                  AND pp.centro_costo_id = ?
                  {where_estatus}
                ORDER BY pp.num_cuenta ASC, p.fecha ASC, p.numero_poliza ASC, pp.numero_linea ASC, pp.id_partida ASC
                """,
                (f_ini, f_fin, int(centro_costo_id)),
            )
            rows = cur.fetchall()

        # Agrupar en memoria por cuenta para mantener shape y totales
        by_cta: Dict[str, Dict] = {}
        for r in rows:
            cta = str(r["num_cuenta"] or "").strip()
            if not cta:
                continue
            if cta not in by_cta:
                by_cta[cta] = {
                    "num_cuenta": cta,
                    "nombre_cuenta": str(r["nombre_cuenta"] or ""),
                    "saldo_inicial": 0.0,
                    "movimientos": [],
                    "total_cargos": 0.0,
                    "total_abonos": 0.0,
                    "saldo_final": 0.0,
                    "fecha_inicio": f_ini,
                    "fecha_fin": f_fin,
                }
            cargo = float(r["cargo"] or 0.0)
            abono = float(r["abono"] or 0.0)
            desc = (str(r["concepto_linea"] or "") or str(r["concepto_poliza"] or "")).strip()
            by_cta[cta]["movimientos"].append(
                {
                    "tipo": str(r["tipo"] or ""),
                    "numero": str(r["numero"] or ""),
                    "fecha": str(r["fecha"] or "")[:10],
                    "descripcion": desc,
                    "cargo": cargo,
                    "abono": abono,
                }
            )
            by_cta[cta]["total_cargos"] += cargo
            by_cta[cta]["total_abonos"] += abono

        out: List[Dict] = []
        for cta in sorted(by_cta.keys()):
            d = by_cta[cta]
            si = float(d["saldo_inicial"] or 0.0)
            tc = float(d["total_cargos"] or 0.0)
            ta = float(d["total_abonos"] or 0.0)
            d["saldo_final"] = float(si + tc - ta)
            out.append(d)
        return out

    def balanza_por_centro(self, mes: int, anio: int, centro_costo_id: int) -> List[Dict]:
        """
        Regresa filas tipo balanza (como ReportesContables.balanza_comprobacion):
        {num_cuenta, nombre_cuenta, tipo_cuenta, naturaleza, saldo_inicial, debe, haber, saldo_final}
        """
        centro_costo_id = int(centro_costo_id)
        out: List[Dict] = []
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            where_estatus = _where_poliza_no_cancelada(cur)

            cur.execute(
                f"""
                SELECT
                    pp.num_cuenta AS num_cuenta,
                    COALESCE(c.nombre_cuenta,'') AS nombre_cuenta,
                    COALESCE(c.tipo_cuenta,'') AS tipo_cuenta,
                    COALESCE(c.naturaleza,'DEUDORA') AS naturaleza,
                    SUM(COALESCE(pp.cargo_mn, pp.cargo, 0)) AS debe,
                    SUM(COALESCE(pp.abono_mn, pp.abono, 0)) AS haber
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE CAST(strftime('%m', p.fecha) AS INTEGER) = ?
                  AND CAST(strftime('%Y', p.fecha) AS INTEGER) = ?
                  AND pp.centro_costo_id = ?
                  {where_estatus}
                GROUP BY pp.num_cuenta
                ORDER BY pp.num_cuenta
                """,
                (int(mes), int(anio), int(centro_costo_id)),
            )

            for r in cur.fetchall():
                debe = float(r["debe"] or 0.0)
                haber = float(r["haber"] or 0.0)
                nat = (r["naturaleza"] or "DEUDORA").strip().upper()
                saldo_inicial = 0.0
                if nat == "ACREEDORA":
                    saldo_final = saldo_inicial + haber - debe
                else:
                    saldo_final = saldo_inicial + debe - haber
                out.append(
                    {
                        "num_cuenta": str(r["num_cuenta"] or ""),
                        "nombre_cuenta": str(r["nombre_cuenta"] or ""),
                        "tipo_cuenta": str(r["tipo_cuenta"] or ""),
                        "naturaleza": nat,
                        "saldo_inicial": float(saldo_inicial),
                        "debe": float(debe),
                        "haber": float(haber),
                        "saldo_final": float(saldo_final),
                    }
                )
        return out

    def estado_resultados_por_centro(self, mes: int, anio: int, centro_costo_id: int) -> Dict:
        """
        Estado de resultados (COI-like) basado en movimientos del periodo y centro.
        Devuelve el mismo shape que ReportesContables.estado_resultados().
        """
        centro_costo_id = int(centro_costo_id)
        ingresos = 0.0
        costos = 0.0
        gastos = 0.0
        otros_ingresos = 0.0
        otros_gastos = 0.0

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            where_estatus = _where_poliza_no_cancelada(cur)

            cur.execute(
                f"""
                SELECT
                    pp.num_cuenta AS num_cuenta,
                    COALESCE(c.naturaleza,'DEUDORA') AS naturaleza,
                    SUM(COALESCE(pp.cargo_mn, pp.cargo, 0)) AS debe,
                    SUM(COALESCE(pp.abono_mn, pp.abono, 0)) AS haber
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE CAST(strftime('%m', p.fecha) AS INTEGER) = ?
                  AND CAST(strftime('%Y', p.fecha) AS INTEGER) = ?
                  AND pp.centro_costo_id = ?
                  {where_estatus}
                GROUP BY pp.num_cuenta, naturaleza
                """,
                (int(mes), int(anio), int(centro_costo_id)),
            )

            for r in cur.fetchall():
                nc = (str(r["num_cuenta"] or "").strip() or "")
                nat = str(r["naturaleza"] or "DEUDORA").upper().strip()
                debe = float(r["debe"] or 0.0)
                haber = float(r["haber"] or 0.0)

                # Delta por naturaleza (COI-like)
                val = (haber - debe) if nat == "ACREEDORA" else (debe - haber)

                try:
                    head = int(nc.split(".", 1)[0][:1])
                except Exception:
                    head = 0

                if head == 4:
                    ingresos += val
                elif head == 5:
                    costos += val
                elif head == 6:
                    gastos += val
                elif head == 7:
                    if nat == "ACREEDORA":
                        otros_ingresos += val
                    else:
                        otros_gastos += val

        utilidad_bruta = ingresos - costos
        utilidad_operacion = utilidad_bruta - gastos
        utilidad_neta = utilidad_operacion + otros_ingresos - otros_gastos

        return {
            "ventas": float(ingresos),
            "costos": float(costos),
            "utilidad_bruta": float(utilidad_bruta),
            "gastos": float(gastos),
            "utilidad_operacion": float(utilidad_operacion),
            "otros_ingresos": float(otros_ingresos),
            "otros_gastos": float(otros_gastos),
            "utilidad_neta": float(utilidad_neta),
            "mes": int(mes),
            "anio": int(anio),
        }

