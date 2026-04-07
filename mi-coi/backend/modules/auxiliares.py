"""
Reporte de Auxiliares (estilo COI) — base funcional.

- Agrupa por cuenta
- Muestra saldo inicial del periodo, movimientos (Dr/Ig/...) y totales
- Fuente: movimientos + polizas + catalogo_cuentas; saldos iniciales desde saldos_cuenta o saldos_mensuales (fallback)
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from config import get_db_path


def _rango_mes(ejercicio: int, periodo: int) -> Tuple[str, str]:
    inicio = date(int(ejercicio), int(periodo), 1)
    if periodo == 12:
        fin = date(int(ejercicio) + 1, 1, 1) - timedelta(days=1)
    else:
        fin = date(int(ejercicio), int(periodo) + 1, 1) - timedelta(days=1)
    return inicio.strftime("%Y-%m-%d"), fin.strftime("%Y-%m-%d")


def _periodo_anterior(ejercicio: int, periodo: int) -> Tuple[int, int]:
    if int(periodo) <= 1:
        return int(ejercicio) - 1, 12
    return int(ejercicio), int(periodo) - 1


class AuxiliaresManager:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or get_db_path()

    def _saldo_inicial_mn(self, ejercicio: int, periodo: int, num_cuenta: str) -> float:
        pe, pp = _periodo_anterior(ejercicio, periodo)
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return 0.0
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            # Preferimos motor fase 1.
            try:
                cur.execute(
                    """
                    SELECT COALESCE(s.saldo_final_mn, 0)
                    FROM saldos_cuenta s
                    WHERE s.ejercicio=? AND s.periodo=? AND s.num_cuenta=?
                    """,
                    (int(pe), int(pp), num_cuenta),
                )
                r = cur.fetchone()
                if r is not None:
                    return float(r[0] or 0)
            except sqlite3.OperationalError:
                pass

            # Fallback legacy.
            try:
                cur.execute(
                    """
                    SELECT COALESCE(s.saldo_final, 0)
                    FROM saldos_mensuales s
                    WHERE s.anio=? AND s.mes=? AND s.num_cuenta=?
                    """,
                    (int(pe), int(pp), num_cuenta),
                )
                r = cur.fetchone()
                return float(r[0] or 0) if r else 0.0
            except sqlite3.OperationalError:
                return 0.0

    def reporte_mes(
        self,
        ejercicio: int,
        periodo: int,
        cuentas: List[str],
        solo_afectadas: bool = True,
        max_movs_por_cuenta: int = 5000,
    ) -> List[Dict[str, Any]]:
        """
        Regresa lista de cuentas con su auxiliar:
          {
            num_cuenta, nombre_cuenta, saldo_inicial,
            movimientos: [{tipo, numero, fecha, descripcion, cargo, abono}],
            total_cargos, total_abonos, saldo_final
          }
        """
        cuentas = [str(x).strip() for x in (cuentas or []) if str(x).strip()]
        if not cuentas:
            return []
        f_ini, f_fin = _rango_mes(int(ejercicio), int(periodo))
        out: List[Dict[str, Any]] = []

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            # Nombre cuenta.
            nombres: Dict[str, str] = {}
            try:
                qmarks = ",".join(["?"] * len(cuentas))
                cur.execute(
                    f"SELECT num_cuenta, COALESCE(nombre_cuenta,'') AS nombre_cuenta FROM catalogo_cuentas WHERE num_cuenta IN ({qmarks})",
                    tuple(cuentas),
                )
                for r in cur.fetchall():
                    nombres[str(r["num_cuenta"])] = str(r["nombre_cuenta"] or "")
            except sqlite3.Error:
                pass

            # Estatus afectadas si existe.
            where_af = ""
            if solo_afectadas:
                try:
                    cur.execute("PRAGMA table_info(polizas)")
                    cols = [r[1] for r in cur.fetchall()]
                    if "estatus" in cols:
                        where_af = "AND UPPER(COALESCE(p.estatus,'A')) = 'A'"
                except sqlite3.Error:
                    pass

            for cta in cuentas:
                si = self._saldo_inicial_mn(int(ejercicio), int(periodo), cta)
                movs: List[Dict[str, Any]] = []
                tc = ta = 0.0
                try:
                    cur.execute(
                        f"""
                        SELECT
                          p.tipo_poliza AS tipo,
                          p.numero_poliza AS numero,
                          p.fecha AS fecha,
                          COALESCE(m.concepto_mov,'') AS concepto_mov,
                          COALESCE(p.concepto,'') AS concepto_poliza,
                          COALESCE(m.cargo,0) AS cargo,
                          COALESCE(m.abono,0) AS abono
                        FROM movimientos m
                        JOIN polizas p ON p.id = m.poliza_id
                        WHERE m.num_cuenta = ?
                          AND p.fecha BETWEEN ? AND ?
                          {where_af}
                        ORDER BY p.fecha ASC, p.numero_poliza ASC, m.id ASC
                        LIMIT ?
                        """,
                        (cta, f_ini, f_fin, int(max_movs_por_cuenta)),
                    )
                    for r in cur.fetchall():
                        cargo = float(r["cargo"] or 0)
                        abono = float(r["abono"] or 0)
                        tc += cargo
                        ta += abono
                        desc = (str(r["concepto_mov"] or "") or str(r["concepto_poliza"] or "")).strip()
                        movs.append(
                            {
                                "tipo": str(r["tipo"] or ""),
                                "numero": str(r["numero"] or ""),
                                "fecha": str(r["fecha"] or "")[:10],
                                "descripcion": desc,
                                "cargo": cargo,
                                "abono": abono,
                            }
                        )
                except sqlite3.Error:
                    movs = []

                sf = float(si + tc - ta)
                out.append(
                    {
                        "num_cuenta": cta,
                        "nombre_cuenta": nombres.get(cta, ""),
                        "saldo_inicial": float(si),
                        "movimientos": movs,
                        "total_cargos": float(tc),
                        "total_abonos": float(ta),
                        "saldo_final": float(sf),
                        "fecha_inicio": f_ini,
                        "fecha_fin": f_fin,
                    }
                )
        return out

