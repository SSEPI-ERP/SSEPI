# backend/modules/estados_financieros_motor.py
"""
Motor completo de estados financieros (sin aproximaciones de un solo renglón).

- Estado de resultados mensual y acumulado (YTD) por movimientos del periodo.
- Balance general detallado por rubros 1xx / 2xx / 3xx con validación Activo = Pasivo + Capital.
- Estado de flujo de efectivo método indirecto (utilidad neta + ajustes + capital de trabajo + efectivo).
- Estado de cambios en el capital contable (3xx + resultado del periodo).
- Presentación comparativa (periodo actual vs anterior).
- Estados filtrados por centro de costo.
- Formatos configurables persistidos en SQLite (orden de secciones y etiquetas).
"""
from __future__ import annotations

import json
import os
import sqlite3
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

try:
    from config import get_db_path
except ImportError:

    def get_db_path():
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, "backend", "database", "contabilidad.db")


def _first_digit(num_cuenta: str) -> int:
    s = (num_cuenta or "").strip().split(".", 1)[0]
    if not s:
        return 0
    try:
        return int(s[0])
    except ValueError:
        return 0


def _first_two(num_cuenta: str) -> str:
    s = (num_cuenta or "").strip().split(".", 1)[0]
    return (s[:2] if len(s) >= 2 else s).upper()


def _rango_mes(anio: int, mes: int) -> Tuple[str, str]:
    ini = date(int(anio), int(mes), 1)
    if int(mes) == 12:
        fin = date(int(anio) + 1, 1, 1)
    else:
        fin = date(int(anio), int(mes) + 1, 1)
    return ini.strftime("%Y-%m-%d"), (fin - timedelta(days=1)).strftime("%Y-%m-%d")


def _rango_ytd(anio: int, mes_hasta: int) -> Tuple[str, str]:
    ini = date(int(anio), 1, 1).strftime("%Y-%m-%d")
    _, last = monthrange(int(anio), int(mes_hasta))
    fin = date(int(anio), int(mes_hasta), last).strftime("%Y-%m-%d")
    return ini, fin


class EstadosFinancierosMotor:
    """Cálculos contables completos sobre partidas_poliza (preferido) o movimientos."""

    # Prefijos para flujo de efectivo (capital de trabajo y caja) — ampliables
    PREFIX_CXC = ("115", "116", "117", "118", "119")
    PREFIX_INVENTARIO = ("12", "13", "14")
    PREFIX_PROVEEDORES = ("201", "202", "203", "204", "205", "206", "210", "211", "212")
    PREFIX_EFECTIVO = ("101", "102", "1101", "1102", "111", "112")
    PREFIX_DEPRECIACION_GASTO = ("681", "682", "683", "684")
    PREFIX_DIVIDENDOS = ("521", "522", "523", "551", "552")

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self._ensure_formatos_table()

    def _ensure_formatos_table(self) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS formatos_estado_financiero (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nombre TEXT NOT NULL,
                        tipo_estado TEXT NOT NULL,
                        config_json TEXT NOT NULL,
                        creado_en TEXT NOT NULL
                    )
                    """
                )
                conn.commit()
        except Exception:
            pass

    def _where_poliza_activa(self, cur: sqlite3.Cursor) -> str:
        cur.execute("PRAGMA table_info(polizas)")
        cols = [r[1] for r in cur.fetchall()]
        if "estatus" in cols:
            return "AND UPPER(COALESCE(p.estatus,'C')) <> 'X'"
        return ""

    def _tiene_partidas(self, conn: sqlite3.Connection) -> bool:
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM partidas_poliza LIMIT 1")
            return (cur.fetchone() or [0])[0] >= 0
        except sqlite3.Error:
            return False

    def _lineas_movimiento_periodo(
        self,
        conn: sqlite3.Connection,
        fecha_ini: str,
        fecha_fin: str,
        centro_costo_id: Optional[int] = None,
    ) -> List[sqlite3.Row]:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        w_est = self._where_poliza_activa(cur)
        cc = ""
        params: List[Any] = [fecha_ini, fecha_fin]
        if centro_costo_id is not None:
            cc = " AND pp.centro_costo_id = ? "
            params.append(int(centro_costo_id))
        try:
            cur.execute(
                f"""
                SELECT pp.num_cuenta AS num_cuenta,
                       COALESCE(c.nombre_cuenta,'') AS nombre_cuenta,
                       COALESCE(c.naturaleza,'DEUDORA') AS naturaleza,
                       COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                       COALESCE(pp.abono_mn, pp.abono, 0) AS abono
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE p.fecha BETWEEN ? AND ? {w_est} {cc}
                """,
                tuple(params),
            )
            rows = cur.fetchall()
            if rows:
                return rows
        except sqlite3.Error:
            pass
        params2: List[Any] = [fecha_ini, fecha_fin]
        cc2 = ""
        if centro_costo_id is not None:
            cc2 = " AND COALESCE(m.centro_costo_id, -1) = ? "
            params2.append(int(centro_costo_id))
        cur.execute(
            f"""
            SELECT m.num_cuenta AS num_cuenta,
                   COALESCE(c.nombre_cuenta,'') AS nombre_cuenta,
                   COALESCE(c.naturaleza,'DEUDORA') AS naturaleza,
                   COALESCE(m.cargo,0) AS cargo,
                   COALESCE(m.abono,0) AS abono
            FROM movimientos m
            JOIN polizas p ON p.id = m.poliza_id
            LEFT JOIN catalogo_cuentas c ON c.num_cuenta = m.num_cuenta
            WHERE p.fecha BETWEEN ? AND ? {w_est} {cc2}
            """,
            tuple(params2),
        )
        return cur.fetchall()

    @staticmethod
    def _clasificar_resultado(nc: str, nombre: str, nat: str, cargo: float, abono: float) -> Dict[str, float]:
        """Devuelve aportaciones a buckets de estado de resultados (importes con signo económico típico)."""
        d = _first_digit(nc)
        nup = (nombre or "").upper()
        natu = (nat or "DEUDORA").upper().strip()
        out = {
            "ingresos": 0.0,
            "costo_ventas": 0.0,
            "gastos_operativos": 0.0,
            "isr_ptu": 0.0,
            "otros_ingresos": 0.0,
            "otros_gastos": 0.0,
        }
        f2 = _first_two(nc)
        if f2 in ("81", "82") or "ISR" in nup or "PTU" in nup or "ISPTU" in nup:
            out["isr_ptu"] += cargo - abono
            return out
        if d == 4:
            if natu == "ACREEDORA":
                out["ingresos"] += abono - cargo
            else:
                out["ingresos"] += cargo - abono
        elif d == 5:
            if natu == "DEUDORA":
                out["costo_ventas"] += cargo - abono
            else:
                out["costo_ventas"] += abono - cargo
        elif d == 6:
            out["gastos_operativos"] += cargo - abono if natu == "DEUDORA" else abono - cargo
        elif d == 7:
            if natu == "ACREEDORA":
                out["otros_ingresos"] += abono - cargo
            else:
                out["otros_gastos"] += cargo - abono
        elif d == 8 and f2 not in ("81", "82"):
            out["otros_gastos"] += cargo - abono if natu == "DEUDORA" else abono - cargo
        return out

    def estado_resultados_mensual(
        self,
        mes: int,
        anio: int,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
        incluir_detalle_cuentas: bool = True,
    ) -> Dict[str, Any]:
        m = max(1, min(12, int(mes)))
        y = int(anio)
        fi, ff = _rango_mes(y, m)
        return self._estado_resultados_rango(
            fi,
            ff,
            m,
            y,
            acumulado=False,
            moneda_reporte=moneda_reporte,
            tipo_cambio=tipo_cambio,
            centro_costo_id=centro_costo_id,
            incluir_detalle_cuentas=incluir_detalle_cuentas,
        )

    def estado_resultados_acumulado(
        self,
        mes_hasta: int,
        anio: int,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
        incluir_detalle_cuentas: bool = True,
    ) -> Dict[str, Any]:
        m = max(1, min(12, int(mes_hasta)))
        y = int(anio)
        fi, ff = _rango_ytd(y, m)
        return self._estado_resultados_rango(
            fi,
            ff,
            m,
            y,
            acumulado=True,
            moneda_reporte=moneda_reporte,
            tipo_cambio=tipo_cambio,
            centro_costo_id=centro_costo_id,
            incluir_detalle_cuentas=incluir_detalle_cuentas,
        )

    def _estado_resultados_rango(
        self,
        fecha_ini: str,
        fecha_fin: str,
        mes_ref: int,
        anio_ref: int,
        *,
        acumulado: bool,
        moneda_reporte: str,
        tipo_cambio: float,
        centro_costo_id: Optional[int],
        incluir_detalle_cuentas: bool,
    ) -> Dict[str, Any]:
        tc = abs(float(tipo_cambio or 1.0)) or 1.0
        mon = (moneda_reporte or "MXN").strip().upper() or "MXN"

        tot = {
            "ingresos": 0.0,
            "costo_ventas": 0.0,
            "gastos_operativos": 0.0,
            "isr_ptu": 0.0,
            "otros_ingresos": 0.0,
            "otros_gastos": 0.0,
        }
        detalle: Dict[str, Dict[str, float]] = {}

        try:
            with sqlite3.connect(self.db_path) as conn:
                for r in self._lineas_movimiento_periodo(conn, fecha_ini, fecha_fin, centro_costo_id):
                    nc = str(r["num_cuenta"] or "").strip()
                    nom = str(r["nombre_cuenta"] or "")
                    nat = str(r["naturaleza"] or "DEUDORA")
                    cargo = float(r["cargo"] or 0)
                    abono = float(r["abono"] or 0)
                    if mon != "MXN":
                        cargo /= tc
                        abono /= tc
                    part = self._clasificar_resultado(nc, nom, nat, cargo, abono)
                    for k, v in part.items():
                        tot[k] += v
                    if incluir_detalle_cuentas and nc and any(abs(part[x]) > 1e-9 for x in part):
                        if nc not in detalle:
                            detalle[nc] = {
                                "nombre_cuenta": nom,
                                "ingresos": 0.0,
                                "costo_ventas": 0.0,
                                "gastos_operativos": 0.0,
                                "isr_ptu": 0.0,
                                "otros_ingresos": 0.0,
                                "otros_gastos": 0.0,
                            }
                        for k, v in part.items():
                            detalle[nc][k] += v
        except Exception as e:
            return {
                "exito": False,
                "error": str(e),
                "fecha_inicio": fecha_ini,
                "fecha_fin": fecha_fin,
            }

        ing = tot["ingresos"]
        cv = tot["costo_ventas"]
        go = tot["gastos_operativos"]
        imp = tot["isr_ptu"]
        oi = tot["otros_ingresos"]
        og = tot["otros_gastos"]

        utilidad_bruta = ing - cv
        utilidad_operacion = utilidad_bruta - go
        utilidad_antes_impuestos = utilidad_operacion + oi - og
        utilidad_neta = utilidad_antes_impuestos - imp

        cuentas_list = []
        for cta, d in sorted(detalle.items()):
            if sum(abs(d[k]) for k in tot) < 1e-9:
                continue
            cuentas_list.append({"num_cuenta": cta, **d})

        return {
            "exito": True,
            "tipo": "estado_resultados_acumulado" if acumulado else "estado_resultados_mensual",
            "mes": mes_ref,
            "anio": anio_ref,
            "fecha_inicio": fecha_ini,
            "fecha_fin": fecha_fin,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "centro_costo_id": centro_costo_id,
            "secciones": {
                "ingresos": ing,
                "costo_de_ventas": cv,
                "utilidad_bruta": utilidad_bruta,
                "gastos_operativos": go,
                "utilidad_de_operacion": utilidad_operacion,
                "otros_ingresos": oi,
                "otros_gastos": og,
                "utilidad_antes_de_isr_ptu": utilidad_antes_impuestos,
                "isr_y_ptu": imp,
                "utilidad_neta": utilidad_neta,
            },
            "detalle_cuentas": cuentas_list,
        }

    def _saldos_por_cuenta_mes(self, conn: sqlite3.Connection, mes: int, anio: int) -> Dict[str, float]:
        """Saldo final por cuenta al cierre del mes (motor o legacy)."""
        out: Dict[str, float] = {}
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT c.num_cuenta, COALESCE(s.saldo_final_mn, 0)
                FROM catalogo_cuentas c
                LEFT JOIN saldos_cuenta s ON s.num_cuenta = c.num_cuenta
                  AND s.periodo = ? AND s.ejercicio = ?
                """,
                (int(mes), int(anio)),
            )
            for num, sf in cur.fetchall():
                out[str(num)] = float(sf or 0)
            if out:
                return out
        except sqlite3.Error:
            pass
        cur.execute(
            """
            SELECT c.num_cuenta, COALESCE(s.saldo_final, 0)
            FROM catalogo_cuentas c
            LEFT JOIN saldos_mensuales s ON s.num_cuenta = c.num_cuenta
              AND s.mes = ? AND s.anio = ?
            """,
            (int(mes), int(anio)),
        )
        for num, sf in cur.fetchall():
            out[str(num)] = float(sf or 0)
        return out

    @staticmethod
    def _suma_prefijos(saldos: Dict[str, float], digitos: int, valores: Tuple[int, ...]) -> float:
        s = 0.0
        for cta, sal in saldos.items():
            if not cta:
                continue
            try:
                head = int(cta.split(".", 1)[0][:digitos])
            except ValueError:
                continue
            if head in valores:
                s += sal
        return s

    @staticmethod
    def _suma_prefijo_texto(saldos: Dict[str, float], prefijos: Tuple[str, ...]) -> float:
        s = 0.0
        for cta, sal in saldos.items():
            c = cta.strip()
            for px in prefijos:
                if c.startswith(px):
                    s += sal
                    break
        return s

    def balance_general_detallado(
        self,
        fecha_corte: str,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Balance a fecha de corte (mes/año del último día del mes que contiene fecha_corte).
        Si centro_costo_id se indica, solo suma movimientos del centro en el periodo acumulado para armar
        un balance analítico por centro (saldos globales del catálogo no aplican por cuenta individual).
        """
        tc = abs(float(tipo_cambio or 1.0)) or 1.0
        mon = (moneda_reporte or "MXN").strip().upper() or "MXN"
        try:
            fd = datetime.strptime(fecha_corte[:10], "%Y-%m-%d").date()
        except ValueError:
            return {"exito": False, "error": "fecha_corte inválida (use AAAA-MM-DD)"}

        mes, anio = fd.month, fd.year
        activo_cuentas: List[Dict[str, Any]] = []
        pasivo_cuentas: List[Dict[str, Any]] = []
        capital_cuentas: List[Dict[str, Any]] = []

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                saldos = self._saldos_por_cuenta_mes(conn, mes, anio)
                if centro_costo_id is None:
                    for cta, sal in sorted(saldos.items()):
                        if abs(sal) < 1e-9:
                            continue
                        adj = sal / tc if mon != "MXN" else sal
                        d = _first_digit(cta)
                        row = {"num_cuenta": cta, "saldo": adj}
                        if d == 1:
                            activo_cuentas.append(row)
                        elif d == 2:
                            pasivo_cuentas.append(row)
                        elif d == 3:
                            capital_cuentas.append(row)
                    activo = sum(x["saldo"] for x in activo_cuentas)
                    pasivo = sum(x["saldo"] for x in pasivo_cuentas)
                    capital = sum(x["saldo"] for x in capital_cuentas)
                else:
                    fi, ff = _rango_ytd(anio, mes)
                    nets: Dict[str, float] = {}
                    for r in self._lineas_movimiento_periodo(conn, fi, ff, centro_costo_id):
                        nc = str(r["num_cuenta"] or "").strip()
                        nat = str(r["naturaleza"] or "DEUDORA").upper()
                        cargo = float(r["cargo"] or 0)
                        abono = float(r["abono"] or 0)
                        if mon != "MXN":
                            cargo /= tc
                            abono /= tc
                        if nc not in nets:
                            nets[nc] = 0.0
                        if nat == "ACREEDORA":
                            nets[nc] += abono - cargo
                        else:
                            nets[nc] += cargo - abono
                    for cta, sal in sorted(nets.items()):
                        if abs(sal) < 1e-9:
                            continue
                        d = _first_digit(cta)
                        row = {"num_cuenta": cta, "saldo": sal}
                        if d == 1:
                            activo_cuentas.append(row)
                        elif d == 2:
                            pasivo_cuentas.append(row)
                        elif d == 3:
                            capital_cuentas.append(row)
                    activo = sum(x["saldo"] for x in activo_cuentas)
                    pasivo = sum(x["saldo"] for x in pasivo_cuentas)
                    capital = sum(x["saldo"] for x in capital_cuentas)

            pcap = pasivo + capital
            dif = activo - pcap
            return {
                "exito": True,
                "tipo": "balance_general",
                "fecha_corte": fecha_corte,
                "mes": mes,
                "anio": anio,
                "moneda_reporte": mon,
                "tipo_cambio_reporte": tc,
                "centro_costo_id": centro_costo_id,
                "activo_total": activo,
                "pasivo_total": pasivo,
                "capital_total": capital,
                "pasivo_mas_capital": pcap,
                "diferencia": dif,
                "cuadra": abs(dif) <= 0.02,
                "activo_detalle": activo_cuentas,
                "pasivo_detalle": pasivo_cuentas,
                "capital_detalle": capital_cuentas,
            }
        except Exception as e:
            return {"exito": False, "error": str(e), "fecha_corte": fecha_corte}

    def flujo_efectivo_indirecto(
        self,
        fecha_ini: str,
        fecha_fin: str,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        tc = abs(float(tipo_cambio or 1.0)) or 1.0
        mon = (moneda_reporte or "MXN").strip().upper() or "MXN"

        try:
            di = datetime.strptime(fecha_ini[:10], "%Y-%m-%d").date()
            df = datetime.strptime(fecha_fin[:10], "%Y-%m-%d").date()
        except ValueError:
            return {"exito": False, "error": "Rango de fechas inválido"}

        er = self._estado_resultados_rango(
            fecha_ini,
            fecha_fin,
            df.month,
            df.year,
            acumulado=True,
            moneda_reporte=mon,
            tipo_cambio=tc,
            centro_costo_id=centro_costo_id,
            incluir_detalle_cuentas=False,
        )
        if not er.get("exito"):
            return er
        utilidad_neta = float(er["secciones"]["utilidad_neta"])

        mes_a, anio_a = di.month, di.year
        mes_b, anio_b = df.month, df.year
        prev_m, prev_y = (mes_a - 1, anio_a) if mes_a > 1 else (12, anio_a - 1)

        depreciacion_periodo = 0.0
        dividendos_periodo = 0.0
        try:
            with sqlite3.connect(self.db_path) as conn:
                for r in self._lineas_movimiento_periodo(conn, fecha_ini, fecha_fin, centro_costo_id):
                    nc = str(r["num_cuenta"] or "").strip()
                    cargo = float(r["cargo"] or 0)
                    abono = float(r["abono"] or 0)
                    if mon != "MXN":
                        cargo /= tc
                        abono /= tc
                    if any(nc.startswith(p) for p in self.PREFIX_DEPRECIACION_GASTO):
                        depreciacion_periodo += cargo - abono
                    if any(nc.startswith(p) for p in self.PREFIX_DIVIDENDOS):
                        dividendos_periodo += cargo - abono

                sa = self._saldos_por_cuenta_mes(conn, prev_m, prev_y)
                sb = self._saldos_por_cuenta_mes(conn, mes_b, anio_b)

                def adj(dct):
                    return {k: (v / tc if mon != "MXN" else v) for k, v in dct.items()}

                saa, sbb = adj(sa), adj(sb)
                var_cxc = self._suma_prefijo_texto(sbb, self.PREFIX_CXC) - self._suma_prefijo_texto(
                    saa, self.PREFIX_CXC
                )
                var_inv = self._suma_prefijo_texto(sbb, self.PREFIX_INVENTARIO) - self._suma_prefijo_texto(
                    saa, self.PREFIX_INVENTARIO
                )
                var_prov = self._suma_prefijo_texto(sbb, self.PREFIX_PROVEEDORES) - self._suma_prefijo_texto(
                    saa, self.PREFIX_PROVEEDORES
                )

                caja_ini = self._suma_prefijo_texto(saa, self.PREFIX_EFECTIVO)
                caja_fin = self._suma_prefijo_texto(sbb, self.PREFIX_EFECTIVO)
        except Exception as e:
            return {"exito": False, "error": str(e)}

        ajuste_capital_trabajo = (-var_cxc) + (-var_inv) + var_prov
        flujo_operacion = utilidad_neta + depreciacion_periodo + ajuste_capital_trabajo
        flujo_financiamiento = -dividendos_periodo
        flujo_libre_estimado = flujo_operacion + flujo_financiamiento
        variacion_caja_real = caja_fin - caja_ini

        return {
            "exito": True,
            "tipo": "flujo_efectivo_indirecto",
            "fecha_inicio": fecha_ini,
            "fecha_fin": fecha_fin,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "centro_costo_id": centro_costo_id,
            "actividades_operacion": {
                "utilidad_neta": utilidad_neta,
                "mas_depreciacion_y_amortizacion_no_efectivo": depreciacion_periodo,
                "variacion_cuentas_por_cobrar": -var_cxc,
                "variacion_inventarios": -var_inv,
                "variacion_proveedores_y_acreedores": var_prov,
                "ajuste_capital_trabajo_neto": ajuste_capital_trabajo,
                "flujo_neto_operacion": flujo_operacion,
            },
            "actividades_financiamiento": {
                "dividendos_y_utilidades_repartidas": dividendos_periodo,
                "flujo_neto_financiamiento": flujo_financiamiento,
            },
            "reconciliacion_caja": {
                "efectivo_inicial_periodo": caja_ini,
                "efectivo_final_periodo": caja_fin,
                "variacion_caja_en_balance": variacion_caja_real,
                "variacion_estimada_por_estado": flujo_libre_estimado,
            },
        }

    def cambios_capital_contable(
        self,
        anio: int,
        mes_desde: int = 1,
        mes_hasta: int = 12,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        tc = abs(float(tipo_cambio or 1.0)) or 1.0
        mon = (moneda_reporte or "MXN").strip().upper() or "MXN"
        y = int(anio)
        md = max(1, min(12, int(mes_desde)))
        mh = max(1, min(12, int(mes_hasta)))
        fi, _ = _rango_mes(y, md)
        _, ff = _rango_mes(y, mh)

        saldo_ini = 0.0
        saldo_fin = 0.0
        aportaciones = 0.0
        retiros = 0.0
        mov_capital: List[Dict[str, Any]] = []

        try:
            with sqlite3.connect(self.db_path) as conn:
                if centro_costo_id is None:
                    if md == 1:
                        s0 = self._saldos_por_cuenta_mes(conn, 12, y - 1)
                    else:
                        s0 = self._saldos_por_cuenta_mes(conn, md - 1, y)
                    s1 = self._saldos_por_cuenta_mes(conn, mh, y)
                    for cta, sal in s0.items():
                        if _first_digit(cta) == 3:
                            saldo_ini += sal
                    for cta, sal in s1.items():
                        if _first_digit(cta) == 3:
                            saldo_fin += sal
                    if mon != "MXN":
                        saldo_ini /= tc
                        saldo_fin /= tc

                for r in self._lineas_movimiento_periodo(conn, fi, ff, centro_costo_id):
                    nc = str(r["num_cuenta"] or "").strip()
                    if _first_digit(nc) != 3:
                        continue
                    cargo = float(r["cargo"] or 0)
                    abono = float(r["abono"] or 0)
                    if mon != "MXN":
                        cargo /= tc
                        abono /= tc
                    net = abono - cargo
                    nup = str(r["nombre_cuenta"] or "").upper()
                    tipo_mov = "otro"
                    if net > 0.009:
                        if "APORT" in nup:
                            tipo_mov = "aportacion"
                            aportaciones += net
                        else:
                            tipo_mov = "incremento_capital"
                            aportaciones += net
                    elif net < -0.009:
                        if "RETIRO" in nup:
                            tipo_mov = "retiro"
                            retiros += -net
                        else:
                            tipo_mov = "disminucion_capital"
                            retiros += -net
                    mov_capital.append(
                        {
                            "num_cuenta": nc,
                            "nombre_cuenta": r["nombre_cuenta"],
                            "cargo": cargo,
                            "abono": abono,
                            "tipo_clasificado": tipo_mov,
                        }
                    )

            er_ytd = self.estado_resultados_acumulado(
                mh,
                y,
                moneda_reporte=mon,
                tipo_cambio=tc,
                centro_costo_id=centro_costo_id,
                incluir_detalle_cuentas=False,
            )
            resultado_periodo = float(er_ytd.get("secciones", {}).get("utilidad_neta", 0) or 0)

            if centro_costo_id is not None:
                saldo_ini = 0.0
                saldo_fin = 0.0

            saldo_calculado = saldo_ini + aportaciones - retiros + resultado_periodo
            return {
                "exito": True,
                "tipo": "cambios_capital_contable",
                "anio": y,
                "mes_desde": md,
                "mes_hasta": mh,
                "fecha_inicio": fi,
                "fecha_fin": ff,
                "moneda_reporte": mon,
                "tipo_cambio_reporte": tc,
                "centro_costo_id": centro_costo_id,
                "capital_inicial": saldo_ini,
                "mas_aportaciones": aportaciones,
                "menos_retiros": retiros,
                "mas_resultado_del_periodo": resultado_periodo,
                "capital_final_calculado": saldo_calculado,
                "capital_final_balance": saldo_fin,
                "diferencia_reconciliacion": saldo_fin - saldo_calculado if centro_costo_id is None else None,
                "movimientos_capital": mov_capital,
            }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def estado_comparativo(
        self,
        tipo: str,
        *,
        mes_actual: int,
        anio_actual: int,
        mes_anterior: int,
        anio_anterior: int,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        tipo = (tipo or "").strip().upper()
        if tipo == "ER":
            a = self.estado_resultados_mensual(
                mes_actual,
                anio_actual,
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=centro_costo_id,
                incluir_detalle_cuentas=False,
            )
            b = self.estado_resultados_mensual(
                mes_anterior,
                anio_anterior,
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=centro_costo_id,
                incluir_detalle_cuentas=False,
            )
            if not a.get("exito") or not b.get("exito"):
                return {"exito": False, "error": "No se pudo generar uno de los periodos"}
            keys = list(a["secciones"].keys())
            filas = []
            for k in keys:
                va = float(a["secciones"][k])
                vb = float(b["secciones"].get(k, 0))
                filas.append(
                    {
                        "concepto": k,
                        "periodo_actual": va,
                        "periodo_anterior": vb,
                        "variacion": va - vb,
                        "variacion_pct": ((va - vb) / abs(vb) * 100.0) if abs(vb) > 1e-6 else (0.0 if abs(va - vb) < 1e-6 else 100.0),
                    }
                )
            return {
                "exito": True,
                "tipo": "comparativo_estado_resultados",
                "periodo_actual": f"{mes_actual:02d}/{anio_actual}",
                "periodo_anterior": f"{mes_anterior:02d}/{anio_anterior}",
                "filas": filas,
            }
        if tipo == "BALANCE":
            fa = f"{anio_actual}-{mes_actual:02d}-{monthrange(anio_actual, mes_actual)[1]:02d}"
            fb = f"{anio_anterior}-{mes_anterior:02d}-{monthrange(anio_anterior, mes_anterior)[1]:02d}"
            ba = self.balance_general_detallado(
                fa, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=centro_costo_id
            )
            bb = self.balance_general_detallado(
                fb, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=centro_costo_id
            )
            if not ba.get("exito") or not bb.get("exito"):
                return {"exito": False, "error": "Balance comparativo falló"}
            conceptos = [
                ("activo_total", "Activo"),
                ("pasivo_total", "Pasivo"),
                ("capital_total", "Capital"),
                ("pasivo_mas_capital", "Pasivo + Capital"),
            ]
            filas = []
            for key, etiqueta in conceptos:
                va = float(ba.get(key, 0) or 0)
                vb = float(bb.get(key, 0) or 0)
                filas.append(
                    {
                        "concepto": etiqueta,
                        "periodo_actual": va,
                        "periodo_anterior": vb,
                        "variacion": va - vb,
                        "variacion_pct": ((va - vb) / abs(vb) * 100.0) if abs(vb) > 1e-6 else 0.0,
                    }
                )
            return {
                "exito": True,
                "tipo": "comparativo_balance",
                "corte_actual": fa,
                "corte_anterior": fb,
                "filas": filas,
            }
        if tipo == "FLUJO":
            ia, fa = _rango_mes(anio_actual, mes_actual)
            ib, fb = _rango_mes(anio_anterior, mes_anterior)
            a = self.flujo_efectivo_indirecto(
                ia, fa, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=centro_costo_id
            )
            b = self.flujo_efectivo_indirecto(
                ib, fb, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=centro_costo_id
            )
            if not a.get("exito") or not b.get("exito"):
                return {"exito": False, "error": "Flujo comparativo falló"}
            va = float(a["actividades_operacion"]["flujo_neto_operacion"])
            vb = float(b["actividades_operacion"]["flujo_neto_operacion"])
            return {
                "exito": True,
                "tipo": "comparativo_flujo",
                "filas": [
                    {
                        "concepto": "Flujo neto operación",
                        "periodo_actual": va,
                        "periodo_anterior": vb,
                        "variacion": va - vb,
                        "variacion_pct": ((va - vb) / abs(vb) * 100.0) if abs(vb) > 1e-6 else 0.0,
                    }
                ],
            }
        if tipo == "CAPITAL":
            ca = self.cambios_capital_contable(
                anio_actual,
                1,
                mes_actual,
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=centro_costo_id,
            )
            cb = self.cambios_capital_contable(
                anio_anterior,
                1,
                mes_anterior,
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=centro_costo_id,
            )
            if not ca.get("exito") or not cb.get("exito"):
                return {"exito": False, "error": "Capital comparativo falló"}
            filas = []
            for key, lab in (
                ("capital_inicial", "Capital inicial"),
                ("mas_aportaciones", "Aportaciones"),
                ("menos_retiros", "Retiros"),
                ("mas_resultado_del_periodo", "Resultado"),
                ("capital_final_calculado", "Capital final"),
            ):
                va = float(ca.get(key, 0) or 0)
                vb = float(cb.get(key, 0) or 0)
                filas.append(
                    {
                        "concepto": lab,
                        "periodo_actual": va,
                        "periodo_anterior": vb,
                        "variacion": va - vb,
                        "variacion_pct": ((va - vb) / abs(vb) * 100.0) if abs(vb) > 1e-6 else 0.0,
                    }
                )
            return {"exito": True, "tipo": "comparativo_capital", "filas": filas}

        return {"exito": False, "error": f"tipo no soportado: {tipo} (use ER, BALANCE, FLUJO, CAPITAL)"}

    def estados_por_centro(
        self,
        centro_costo_id: int,
        mes: int,
        anio: int,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
    ) -> Dict[str, Any]:
        cc = int(centro_costo_id)
        fc = f"{int(anio)}-{int(mes):02d}-{monthrange(int(anio), int(mes))[1]:02d}"
        return {
            "exito": True,
            "centro_costo_id": cc,
            "mes": int(mes),
            "anio": int(anio),
            "estado_resultados_mensual": self.estado_resultados_mensual(
                mes, anio, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=cc
            ),
            "estado_resultados_acumulado": self.estado_resultados_acumulado(
                mes, anio, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=cc
            ),
            "balance_general": self.balance_general_detallado(
                fc, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio, centro_costo_id=cc
            ),
            "flujo_efectivo": self.flujo_efectivo_indirecto(
                *_rango_mes(int(anio), int(mes)),
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=cc,
            ),
            "cambios_capital": self.cambios_capital_contable(
                int(anio),
                1,
                int(mes),
                moneda_reporte=moneda_reporte,
                tipo_cambio=tipo_cambio,
                centro_costo_id=cc,
            ),
        }

    # --- Formatos configurables ---
    def formato_guardar(self, nombre: str, tipo_estado: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO formatos_estado_financiero (nombre, tipo_estado, config_json, creado_en)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        nombre.strip(),
                        tipo_estado.strip(),
                        json.dumps(config, ensure_ascii=False),
                        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    ),
                )
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def formato_listar(self, tipo_estado: Optional[str] = None) -> List[Dict[str, Any]]:
        out = []
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                if tipo_estado:
                    cur = conn.execute(
                        "SELECT id, nombre, tipo_estado, config_json, creado_en FROM formatos_estado_financiero WHERE tipo_estado = ? ORDER BY id DESC",
                        (tipo_estado.strip(),),
                    )
                else:
                    cur = conn.execute(
                        "SELECT id, nombre, tipo_estado, config_json, creado_en FROM formatos_estado_financiero ORDER BY id DESC"
                    )
                for r in cur.fetchall():
                    out.append(
                        {
                            "id": r["id"],
                            "nombre": r["nombre"],
                            "tipo_estado": r["tipo_estado"],
                            "config": json.loads(r["config_json"] or "{}"),
                            "creado_en": r["creado_en"],
                        }
                    )
        except Exception:
            pass
        return out

    def formato_obtener(self, formato_id: int) -> Optional[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    "SELECT id, nombre, tipo_estado, config_json FROM formatos_estado_financiero WHERE id = ?",
                    (int(formato_id),),
                )
                r = cur.fetchone()
                if not r:
                    return None
                return {
                    "id": r["id"],
                    "nombre": r["nombre"],
                    "tipo_estado": r["tipo_estado"],
                    "config": json.loads(r["config_json"] or "{}"),
                }
        except Exception:
            return None

    def formato_eliminar(self, formato_id: int) -> Dict[str, Any]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM formatos_estado_financiero WHERE id = ?", (int(formato_id),))
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    @staticmethod
    def aplicar_formato_secciones(
        datos_er: Dict[str, Any], config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        config esperado: { "orden_secciones": ["ingresos", "costo_de_ventas", ...], "etiquetas": { "ingresos": "Ventas netas" } }
        """
        if not datos_er.get("secciones"):
            return datos_er
        orden = config.get("orden_secciones") or list(datos_er["secciones"].keys())
        etiquetas = config.get("etiquetas") or {}
        ordered = {k: datos_er["secciones"][k] for k in orden if k in datos_er["secciones"]}
        for k, v in datos_er["secciones"].items():
            if k not in ordered:
                ordered[k] = v
        return {
            **datos_er,
            "secciones_ordenadas": ordered,
            "etiquetas_aplicadas": etiquetas,
        }
