# backend/models/reportes.py
import sqlite3
from calendar import monthrange
from datetime import datetime
from typing import List, Dict, Any, Tuple
from collections import OrderedDict
import os
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, 'backend', 'database', 'contabilidad.db')

try:
    from backend.models.catalogo import etiqueta_tipo_cuenta_ui
except ImportError:
    from models.catalogo import etiqueta_tipo_cuenta_ui

class ReportesContables:
    def __init__(self, db_path: str = None):
        self.db_path = db_path if db_path else get_db_path()
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
    
    def _normalizar_moneda_reporte(self, moneda_reporte: str, tipo_cambio: float) -> tuple[str, float]:
        mon = str(moneda_reporte or "MXN").strip().upper() or "MXN"
        tc = abs(float(tipo_cambio or 1.0))
        if tc <= 0:
            tc = 1.0
        return mon, tc

    def _conv_monto(self, monto_mxn: float, moneda_reporte: str, tipo_cambio: float) -> float:
        mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)
        v = float(monto_mxn or 0.0)
        if mon == "MXN":
            return v
        return v / tc

    def balanza_comprobacion(self, mes: int, anio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """Genera balanza de comprobación para un mes específico (incluye tipo/clase y respaldo por movimientos)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT m.num_cuenta,
                           SUM(m.cargo) as debe_mov,
                           SUM(m.abono) as haber_mov
                    FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE CAST(strftime('%m', p.fecha) AS INTEGER) = ?
                      AND CAST(strftime('%Y', p.fecha) AS INTEGER) = ?
                    GROUP BY m.num_cuenta
                """, (mes, anio))
                mov_map = {
                    r[0]: (float(r[1] or 0), float(r[2] or 0))
                    for r in cursor.fetchall()
                }

                cursor.execute("""
                    SELECT 
                        c.num_cuenta,
                        c.nombre_cuenta,
                        COALESCE(c.tipo_cuenta, '') as tipo_cuenta,
                        COALESCE(c.naturaleza, 'DEUDORA') as naturaleza,
                        COALESCE(s.saldo_inicial, 0) as saldo_inicial,
                        COALESCE(s.debe, 0) as debe,
                        COALESCE(s.haber, 0) as haber,
                        COALESCE(s.saldo_final, 0) as saldo_final
                    FROM catalogo_cuentas c
                    LEFT JOIN saldos_mensuales s ON c.num_cuenta = s.num_cuenta 
                        AND s.mes = ? AND s.anio = ?
                    ORDER BY c.num_cuenta
                """, (mes, anio))

                out = []
                mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)
                for row in cursor.fetchall():
                    d = dict(row)
                    nc = d["num_cuenta"]
                    d["tipo_clase"] = etiqueta_tipo_cuenta_ui(d.get("tipo_cuenta"), nc)
                    debe_s = float(d.get("debe") or 0)
                    haber_s = float(d.get("haber") or 0)
                    if nc in mov_map:
                        md, mh = mov_map[nc]
                        if abs(debe_s) < 0.009 and abs(haber_s) < 0.009 and (
                            abs(md) >= 0.009 or abs(mh) >= 0.009
                        ):
                            d["debe"] = md
                            d["haber"] = mh
                            si = float(d.get("saldo_inicial") or 0)
                            nat = (d.get("naturaleza") or "DEUDORA").strip()
                            if nat == "ACREEDORA":
                                d["saldo_final"] = si + mh - md
                            else:
                                d["saldo_final"] = si + md - mh
                    d["saldo_inicial"] = self._conv_monto(d.get("saldo_inicial"), mon, tc)
                    d["debe"] = self._conv_monto(d.get("debe"), mon, tc)
                    d["haber"] = self._conv_monto(d.get("haber"), mon, tc)
                    d["saldo_final"] = self._conv_monto(d.get("saldo_final"), mon, tc)
                    d["moneda_reporte"] = mon
                    d["tipo_cambio_reporte"] = tc
                    out.append(d)
                return out
        except Exception as e:
            print(f"Error en balanza: {e}")
            return []

    def balanza_desde_saldos_cuenta(self, periodo: int, ejercicio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """Balanza rápida desde saldos_cuenta (motor fase 1)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT
                        c.num_cuenta,
                        c.nombre_cuenta,
                        COALESCE(c.tipo_cuenta, '') as tipo_cuenta,
                        COALESCE(c.naturaleza, 'DEUDORA') as naturaleza,
                        COALESCE(s.saldo_inicial_mn, 0) as saldo_inicial,
                        COALESCE(s.cargos_mn, 0) as debe,
                        COALESCE(s.abonos_mn, 0) as haber,
                        COALESCE(s.saldo_final_mn, 0) as saldo_final
                    FROM catalogo_cuentas c
                    LEFT JOIN saldos_cuenta s ON s.num_cuenta = c.num_cuenta
                        AND s.periodo = ? AND s.ejercicio = ?
                    ORDER BY c.num_cuenta
                """, (periodo, ejercicio))
                out = []
                mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)
                for row in cursor.fetchall():
                    d = dict(row)
                    d["tipo_clase"] = etiqueta_tipo_cuenta_ui(d.get("tipo_cuenta"), d.get("num_cuenta", ""))
                    d["saldo_inicial"] = self._conv_monto(d.get("saldo_inicial"), mon, tc)
                    d["debe"] = self._conv_monto(d.get("debe"), mon, tc)
                    d["haber"] = self._conv_monto(d.get("haber"), mon, tc)
                    d["saldo_final"] = self._conv_monto(d.get("saldo_final"), mon, tc)
                    d["moneda_reporte"] = mon
                    d["tipo_cambio_reporte"] = tc
                    out.append(d)
                return out
        except Exception:
            return []

    def balanza_agrupar_nivel(self, rows: List[Dict], nivel: int) -> List[Dict]:
        """
        Agrupa filas de balanza por prefijo de cuenta (segmentos separados por punto).
        nivel=1 → primer segmento (ej. 604 en 604.10.02); nivel=2 → 604.10; etc.
        nivel <= 0 o >= 99 devuelve copia sin agrupar.
        """
        if not rows or nivel <= 0 or nivel >= 99:
            return [dict(r) for r in rows]
        agg: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        for r in rows:
            nc = str(r.get("num_cuenta") or "").strip()
            if not nc:
                continue
            parts = [p for p in nc.split(".") if p != ""]
            if parts:
                take = min(int(nivel), len(parts))
                key = ".".join(parts[:take])
            else:
                key = nc
            if key not in agg:
                agg[key] = {
                    "num_cuenta": key,
                    "nombre_cuenta": f"Subtotal nivel {nivel} — {key}",
                    "tipo_cuenta": str(r.get("tipo_cuenta") or ""),
                    "tipo_clase": str(r.get("tipo_clase") or etiqueta_tipo_cuenta_ui(r.get("tipo_cuenta"), key)),
                    "naturaleza": str(r.get("naturaleza") or "DEUDORA"),
                    "saldo_inicial": 0.0,
                    "debe": 0.0,
                    "haber": 0.0,
                    "saldo_final": 0.0,
                    "moneda_reporte": r.get("moneda_reporte"),
                    "tipo_cambio_reporte": r.get("tipo_cambio_reporte"),
                }
            a = agg[key]
            a["saldo_inicial"] += float(r.get("saldo_inicial") or 0.0)
            a["debe"] += float(r.get("debe") or 0.0)
            a["haber"] += float(r.get("haber") or 0.0)
        out: List[Dict] = []
        for key in sorted(agg.keys()):
            x = agg[key]
            nat = str(x.get("naturaleza") or "DEUDORA").upper()
            si = float(x.get("saldo_inicial") or 0.0)
            debe = float(x.get("debe") or 0.0)
            haber = float(x.get("haber") or 0.0)
            if nat == "ACREEDORA":
                sf = si + haber - debe
            else:
                sf = si + debe - haber
            x["saldo_final"] = sf
            out.append(x)
        return out

    def _balanza_periodo_base(self, periodo: int, ejercicio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """
        Balanza base por periodo (preferencia motor saldos_cuenta).
        Retorna lista con num_cuenta, nombre_cuenta, naturaleza, saldo_inicial, debe, haber, saldo_final.
        """
        # 1) Intentar motor fase 1
        rows = self.balanza_desde_saldos_cuenta(
            int(periodo),
            int(ejercicio),
            moneda_reporte=moneda_reporte,
            tipo_cambio=tipo_cambio,
        )
        if rows:
            return rows
        # 2) Fallback legacy
        return self.balanza_comprobacion(
            int(periodo),
            int(ejercicio),
            moneda_reporte=moneda_reporte,
            tipo_cambio=tipo_cambio,
        )

    def balanza_por_periodo(self, mes: int, anio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """
        Balanza del periodo para pantalla, cuadre y totales coherentes con el XML SAT (motor).
        Usa saldos_cuenta si la tabla y los datos aplican; si no, saldos_mensuales + movimientos (legacy).
        """
        m = max(1, min(12, int(mes)))
        y = int(anio)
        return self._balanza_periodo_base(m, y, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio)

    def balanza_acumulada(self, periodo_desde: int, periodo_hasta: int, ejercicio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """
        Balanza acumulada en rango de periodos [desde..hasta] del mismo ejercicio.
        """
        p1 = int(periodo_desde)
        p2 = int(periodo_hasta)
        e = int(ejercicio)
        if p1 > p2:
            p1, p2 = p2, p1
        p1 = max(1, min(12, p1))
        p2 = max(1, min(12, p2))

        acumulado: Dict[str, Dict] = {}
        for p in range(p1, p2 + 1):
            for r in self._balanza_periodo_base(p, e, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio):
                nc = str(r.get("num_cuenta") or "").strip()
                if not nc:
                    continue
                base = acumulado.get(nc)
                if not base:
                    base = {
                        "num_cuenta": nc,
                        "nombre_cuenta": r.get("nombre_cuenta", ""),
                        "tipo_cuenta": r.get("tipo_cuenta", ""),
                        "tipo_clase": r.get("tipo_clase", etiqueta_tipo_cuenta_ui(r.get("tipo_cuenta"), nc)),
                        "naturaleza": r.get("naturaleza", "DEUDORA"),
                        "saldo_inicial": float(r.get("saldo_inicial") or 0.0),
                        "debe": 0.0,
                        "haber": 0.0,
                        "saldo_final": float(r.get("saldo_inicial") or 0.0),
                        "moneda_reporte": r.get("moneda_reporte") or str(moneda_reporte or "MXN").upper(),
                        "tipo_cambio_reporte": float(r.get("tipo_cambio_reporte") or tipo_cambio or 1.0),
                    }
                    acumulado[nc] = base
                base["debe"] += float(r.get("debe") or 0.0)
                base["haber"] += float(r.get("haber") or 0.0)

        out = []
        for nc in sorted(acumulado.keys()):
            x = acumulado[nc]
            nat = str(x.get("naturaleza") or "DEUDORA").upper()
            si = float(x.get("saldo_inicial") or 0.0)
            debe = float(x.get("debe") or 0.0)
            haber = float(x.get("haber") or 0.0)
            if nat == "ACREEDORA":
                sf = si + haber - debe
            else:
                sf = si + debe - haber
            x["saldo_final"] = sf
            out.append(x)
        return out

    def balanza_comparativa(self, periodo_1: int, periodo_2: int, ejercicio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> List[Dict]:
        """
        Balanza comparativa entre dos periodos del mismo ejercicio.
        Retorna saldo_final_1, saldo_final_2 y variacion.
        """
        p1 = max(1, min(12, int(periodo_1)))
        p2 = max(1, min(12, int(periodo_2)))
        e = int(ejercicio)
        b1 = {
            str(r.get("num_cuenta") or "").strip(): r
            for r in self._balanza_periodo_base(p1, e, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio)
        }
        b2 = {
            str(r.get("num_cuenta") or "").strip(): r
            for r in self._balanza_periodo_base(p2, e, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio)
        }
        cuentas = sorted(set([k for k in b1.keys() if k] + [k for k in b2.keys() if k]))

        out: List[Dict] = []
        for nc in cuentas:
            r1 = b1.get(nc, {})
            r2 = b2.get(nc, {})
            sf1 = float(r1.get("saldo_final") or 0.0)
            sf2 = float(r2.get("saldo_final") or 0.0)
            var = sf2 - sf1
            if abs(sf1) > 1e-6:
                var_pct = (var / abs(sf1)) * 100.0
            else:
                var_pct = 0.0 if abs(var) < 1e-6 else (100.0 if var > 0 else -100.0)
            out.append(
                {
                    "num_cuenta": nc,
                    "nombre_cuenta": (r1.get("nombre_cuenta") or r2.get("nombre_cuenta") or ""),
                    "tipo_cuenta": (r1.get("tipo_cuenta") or r2.get("tipo_cuenta") or ""),
                    "tipo_clase": (r1.get("tipo_clase") or r2.get("tipo_clase") or etiqueta_tipo_cuenta_ui((r1.get("tipo_cuenta") or r2.get("tipo_cuenta")), nc)),
                    "naturaleza": (r1.get("naturaleza") or r2.get("naturaleza") or "DEUDORA"),
                    "saldo_final_1": sf1,
                    "saldo_final_2": sf2,
                    "variacion": var,
                    "variacion_pct": var_pct,
                    "periodo_1": p1,
                    "periodo_2": p2,
                    "ejercicio": e,
                    "moneda_reporte": (r1.get("moneda_reporte") or r2.get("moneda_reporte") or str(moneda_reporte or "MXN").upper()),
                    "tipo_cambio_reporte": float(r1.get("tipo_cambio_reporte") or r2.get("tipo_cambio_reporte") or tipo_cambio or 1.0),
                }
            )
        return out

    def balanza_comparativa_ejercicios(
        self,
        mes: int,
        ejercicio_1: int,
        ejercicio_2: int,
        *,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
    ) -> List[Dict]:
        """
        Balanza comparativa: mismo mes, dos ejercicios distintos (ej. 2025 vs 2024).
        Columnas: saldo_final por año, variación $ y %.
        """
        m = max(1, min(12, int(mes)))
        y1 = int(ejercicio_1)
        y2 = int(ejercicio_2)
        b1 = {
            str(r.get("num_cuenta") or "").strip(): r
            for r in self.balanza_por_periodo(m, y1, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio)
        }
        b2 = {
            str(r.get("num_cuenta") or "").strip(): r
            for r in self.balanza_por_periodo(m, y2, moneda_reporte=moneda_reporte, tipo_cambio=tipo_cambio)
        }
        cuentas = sorted(set([k for k in b1.keys() if k] + [k for k in b2.keys() if k]))
        out: List[Dict] = []
        for nc in cuentas:
            r1 = b1.get(nc, {})
            r2 = b2.get(nc, {})
            sf1 = float(r1.get("saldo_final") or 0.0)
            sf2 = float(r2.get("saldo_final") or 0.0)
            var = sf2 - sf1
            if abs(sf1) > 1e-6:
                var_pct = (var / abs(sf1)) * 100.0
            else:
                var_pct = 0.0 if abs(var) < 1e-6 else (100.0 if var > 0 else -100.0)
            out.append(
                {
                    "num_cuenta": nc,
                    "nombre_cuenta": (r1.get("nombre_cuenta") or r2.get("nombre_cuenta") or ""),
                    "tipo_cuenta": (r1.get("tipo_cuenta") or r2.get("tipo_cuenta") or ""),
                    "tipo_clase": (r1.get("tipo_clase") or r2.get("tipo_clase") or etiqueta_tipo_cuenta_ui((r1.get("tipo_cuenta") or r2.get("tipo_cuenta")), nc)),
                    "naturaleza": (r1.get("naturaleza") or r2.get("naturaleza") or "DEUDORA"),
                    "saldo_final_1": sf1,
                    "saldo_final_2": sf2,
                    "variacion": var,
                    "variacion_pct": var_pct,
                    "ejercicio_1": y1,
                    "ejercicio_2": y2,
                    "mes": m,
                    "moneda_reporte": (r1.get("moneda_reporte") or r2.get("moneda_reporte") or str(moneda_reporte or "MXN").upper()),
                    "tipo_cambio_reporte": float(r1.get("tipo_cambio_reporte") or r2.get("tipo_cambio_reporte") or tipo_cambio or 1.0),
                }
            )
        return out

    @staticmethod
    def _saldo_presentacion_deudor_acreedor(saldo_final: float, naturaleza: str) -> Tuple[float, float]:
        """Reparte saldo final en columnas clásicas Deudor / Acreedor según naturaleza de cuenta."""
        sf = float(saldo_final or 0.0)
        nat = (naturaleza or "DEUDORA").strip().upper()
        deudor, acreedor = 0.0, 0.0
        if nat == "ACREEDORA":
            if sf >= 0:
                acreedor = sf
            else:
                deudor = abs(sf)
        else:
            if sf >= 0:
                deudor = sf
            else:
                acreedor = abs(sf)
        return deudor, acreedor
    
    def estado_resultados(self, mes: int, anio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> Dict:
        """Genera estado de resultados (mejorado: usa saldos_cuenta si existe)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()

                # Preferimos motor: saldos_cuenta (saldo_final_mn). Fallback: saldos_mensuales (saldo_final).
                try:
                    cursor.execute(
                        """
                        SELECT
                            c.num_cuenta,
                            COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                            COALESCE(s.saldo_final_mn,0) as saldo_final
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_cuenta s ON s.num_cuenta = c.num_cuenta
                            AND s.periodo = ? AND s.ejercicio = ?
                        """,
                        (int(mes), int(anio)),
                    )
                except sqlite3.OperationalError:
                    cursor.execute(
                        """
                        SELECT
                            c.num_cuenta,
                            COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                            COALESCE(s.saldo_final,0) as saldo_final
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_mensuales s ON s.num_cuenta = c.num_cuenta
                            AND s.mes = ? AND s.anio = ?
                        """,
                        (int(mes), int(anio)),
                    )

                ingresos = 0.0
                costos = 0.0
                gastos = 0.0
                otros_ingresos = 0.0
                otros_gastos = 0.0

                for num, nat, saldo_final in cursor.fetchall():
                    nc = (str(num or "").strip() or "")
                    try:
                        head = int(nc.split(".", 1)[0][:1])
                    except Exception:
                        head = 0
                    val = float(saldo_final or 0.0)
                    # Clasificación base por primer dígito (COI / SAT México: 5xx costos, 6xx gastos)
                    if head == 4:
                        ingresos += val
                    elif head == 5:
                        costos += val
                    elif head == 6:
                        gastos += val
                    elif head == 7:
                        # En algunos catálogos 7 son resultados/financieros: tratamos como otros gastos/ingresos por naturaleza
                        if str(nat or "").upper() == "ACREEDORA":
                            otros_ingresos += val
                        else:
                            otros_gastos += val

                mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)
                ingresos = self._conv_monto(ingresos, mon, tc)
                costos = self._conv_monto(costos, mon, tc)
                gastos = self._conv_monto(gastos, mon, tc)
                otros_ingresos = self._conv_monto(otros_ingresos, mon, tc)
                otros_gastos = self._conv_monto(otros_gastos, mon, tc)

                utilidad_bruta = ingresos - costos
                utilidad_operacion = utilidad_bruta - gastos
                utilidad_neta = utilidad_operacion + otros_ingresos - otros_gastos

                return {
                    "ventas": ingresos,
                    "costos": costos,
                    "utilidad_bruta": utilidad_bruta,
                    "gastos": gastos,
                    "utilidad_operacion": utilidad_operacion,
                    "otros_ingresos": otros_ingresos,
                    "otros_gastos": otros_gastos,
                    "utilidad_neta": utilidad_neta,
                    "mes": int(mes),
                    "anio": int(anio),
                    "moneda_reporte": mon,
                    "tipo_cambio_reporte": tc,
                }
        except Exception as e:
            print(f"Error en resultados: {e}")
            return {
                'ventas': 0, 'costos': 0, 'utilidad_bruta': 0,
                'gastos': 0, 'utilidad_neta': 0, 'mes': mes, 'anio': anio
            }
    
    def balance_general(self, fecha: str, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> Dict:
        """Genera balance general (mejorado: usa saldos_cuenta si existe)."""
        try:
            fecha_obj = datetime.strptime(fecha, '%Y-%m-%d')
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()

                mes = int(fecha_obj.month)
                anio = int(fecha_obj.year)

                try:
                    cursor.execute(
                        """
                        SELECT
                            c.num_cuenta,
                            COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                            COALESCE(s.saldo_final_mn,0) as saldo_final
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_cuenta s ON s.num_cuenta = c.num_cuenta
                            AND s.periodo = ? AND s.ejercicio = ?
                        """,
                        (mes, anio),
                    )
                except sqlite3.OperationalError:
                    cursor.execute(
                        """
                        SELECT
                            c.num_cuenta,
                            COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                            COALESCE(s.saldo_final,0) as saldo_final
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_mensuales s ON s.num_cuenta = c.num_cuenta
                            AND s.mes = ? AND s.anio = ?
                        """,
                        (mes, anio),
                    )

                activo = 0.0
                pasivo = 0.0
                capital = 0.0
                for num, _nat, saldo_final in cursor.fetchall():
                    nc = (str(num or "").strip() or "")
                    try:
                        head = int(nc.split(".", 1)[0][:1])
                    except Exception:
                        head = 0
                    val = float(saldo_final or 0.0)
                    if head == 1:
                        activo += val
                    elif head == 2:
                        pasivo += val
                    elif head == 3:
                        capital += val

                mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)
                activo = self._conv_monto(activo, mon, tc)
                pasivo = self._conv_monto(pasivo, mon, tc)
                capital = self._conv_monto(capital, mon, tc)

                return {
                    "activo": activo,
                    "pasivo": pasivo,
                    "capital": capital,
                    "total_pasivo_capital": pasivo + capital,
                    "diferencia": activo - (pasivo + capital),
                    "fecha": fecha,
                    "moneda_reporte": mon,
                    "tipo_cambio_reporte": tc,
                }
        except Exception as e:
            print(f"Error en balance: {e}")
            return {
                'activo': 0, 'pasivo': 0, 'capital': 0,
                'total_pasivo_capital': 0, 'fecha': fecha
            }
    
    def flujo_efectivo(self, fecha_inicio: str, fecha_fin: str) -> Dict:
        """Genera estado de flujo de efectivo"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                fecha_ini = datetime.strptime(fecha_inicio, '%Y-%m-%d')
                
                cursor.execute("""
                    SELECT COALESCE(SUM(s.saldo_final), 0)
                    FROM saldos_mensuales s
                    JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
                    WHERE c.num_cuenta IN ('1101', '1102')
                    AND s.mes = ? AND s.anio = ?
                """, (fecha_ini.month, fecha_ini.year))
                
                efectivo_inicial = cursor.fetchone()[0] or 0
                
                cursor.execute("""
                    SELECT COALESCE(SUM(m.cargo), 0)
                    FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE m.num_cuenta IN ('1101', '1102')
                    AND m.cargo > 0
                    AND p.fecha BETWEEN ? AND ?
                """, (fecha_inicio, fecha_fin))
                
                entradas = cursor.fetchone()[0] or 0
                
                cursor.execute("""
                    SELECT COALESCE(SUM(m.abono), 0)
                    FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE m.num_cuenta IN ('1101', '1102')
                    AND m.abono > 0
                    AND p.fecha BETWEEN ? AND ?
                """, (fecha_inicio, fecha_fin))
                
                salidas = cursor.fetchone()[0] or 0
                
                return {
                    'fecha_inicio': fecha_inicio,
                    'fecha_fin': fecha_fin,
                    'efectivo_inicial': efectivo_inicial,
                    'entradas': entradas,
                    'salidas': salidas,
                    'efectivo_final': efectivo_inicial + entradas - salidas
                }
        except Exception as e:
            print(f"Error en flujo de efectivo: {e}")
            return {
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'efectivo_inicial': 0,
                'entradas': 0,
                'salidas': 0,
                'efectivo_final': 0
            }

    def libro_mayor(self, cuenta: str, fecha_inicio: str, fecha_fin: str) -> List[Dict]:
        """Mayor auxiliar de una cuenta con saldo acumulado por movimiento."""
        cuenta = str(cuenta or "").strip()
        if not cuenta:
            return []
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    "SELECT COALESCE(naturaleza,'DEUDORA') FROM catalogo_cuentas WHERE num_cuenta = ? LIMIT 1",
                    (cuenta,),
                )
                row_nat = cur.fetchone()
                naturaleza = (row_nat[0] if row_nat else "DEUDORA") or "DEUDORA"
                cur.execute(
                    """
                    SELECT p.fecha, p.tipo_poliza, p.numero_poliza, p.concepto,
                           m.concepto_mov, COALESCE(m.cargo,0) AS cargo, COALESCE(m.abono,0) AS abono
                    FROM movimientos m
                    INNER JOIN polizas p ON p.id = m.poliza_id
                    WHERE m.num_cuenta = ?
                      AND p.fecha BETWEEN ? AND ?
                    ORDER BY p.fecha, p.numero_poliza, m.id
                    """,
                    (cuenta, fecha_inicio, fecha_fin),
                )
                out: List[Dict] = []
                saldo = 0.0
                for r in cur.fetchall():
                    cargo = float(r["cargo"] or 0)
                    abono = float(r["abono"] or 0)
                    if str(naturaleza).upper() == "ACREEDORA":
                        saldo += abono - cargo
                    else:
                        saldo += cargo - abono
                    out.append(
                        {
                            "fecha": r["fecha"],
                            "tipo_poliza": r["tipo_poliza"],
                            "numero_poliza": r["numero_poliza"],
                            "concepto_poliza": r["concepto"],
                            "concepto_mov": r["concepto_mov"],
                            "cargo": cargo,
                            "abono": abono,
                            "saldo": saldo,
                        }
                    )
                return out
        except Exception:
            return []

    def verificacion_cuadre(self, mes: int, anio: int, *, moneda_reporte: str = "MXN", tipo_cambio: float = 1.0) -> Dict:
        """
        Reporte formal de cuadre:
        - Balanza: Debe vs Haber (misma fuente que la vista Balanza y que balanza_por_periodo: motor saldos_cuenta o legacy).
        - Columnas clásicas: Σ saldo en columna Deudor vs Σ saldo en columna Acreedor (por naturaleza y signo del saldo final).
        - Balance: Activo vs Pasivo+Capital.
        """
        m = max(1, min(12, int(mes)))
        y = int(anio)
        mon, tc = self._normalizar_moneda_reporte(moneda_reporte, tipo_cambio)

        bal = self.balanza_por_periodo(m, y, moneda_reporte=mon, tipo_cambio=tc)
        debe = sum(float(r.get("debe") or 0.0) for r in bal)
        haber = sum(float(r.get("haber") or 0.0) for r in bal)
        dif_balanza = debe - haber

        tot_deudor = 0.0
        tot_acreedor = 0.0
        candidatos_saldos: List[Dict[str, Any]] = []
        for r in bal:
            sf = float(r.get("saldo_final") or 0.0)
            nat = str(r.get("naturaleza") or "DEUDORA")
            col_d, col_a = self._saldo_presentacion_deudor_acreedor(sf, nat)
            tot_deudor += col_d
            tot_acreedor += col_a
            if abs(col_d) >= 0.009 or abs(col_a) >= 0.009:
                candidatos_saldos.append(
                    {
                        "num_cuenta": str(r.get("num_cuenta") or ""),
                        "nombre_cuenta": str(r.get("nombre_cuenta") or ""),
                        "saldo_final": sf,
                        "columna_deudor": col_d,
                        "columna_acreedor": col_a,
                        "score": max(abs(col_d), abs(col_a)),
                    }
                )
        dif_saldos = tot_deudor - tot_acreedor
        candidatos_saldos.sort(key=lambda x: -float(x.get("score") or 0.0))
        candidatos_saldos = candidatos_saldos[:25]

        fecha = f"{y:04d}-{m:02d}-01"
        bg = self.balance_general(fecha, moneda_reporte=mon, tipo_cambio=tc)
        activo = float(bg.get("activo") or 0.0)
        pcap = float(bg.get("total_pasivo_capital") or 0.0)
        dif_balance = activo - pcap

        candidatos = []
        for r in bal:
            d = float(r.get("debe") or 0.0)
            h = float(r.get("haber") or 0.0)
            if abs(d) < 0.009 and abs(h) < 0.009:
                continue
            one = abs(d - h)
            candidatos.append(
                {
                    "num_cuenta": str(r.get("num_cuenta") or ""),
                    "nombre_cuenta": str(r.get("nombre_cuenta") or ""),
                    "debe": d,
                    "haber": h,
                    "diff_debe_haber": d - h,
                    "score": one,
                }
            )
        candidatos.sort(key=lambda x: -float(x.get("score") or 0.0))
        candidatos = candidatos[:25]

        saldos_cuadra = abs(dif_saldos) <= 0.01
        balanza_cuadra = abs(dif_balanza) <= 0.01
        balance_cuadra = abs(dif_balance) <= 0.01

        return {
            "exito": True,
            "mes": m,
            "anio": y,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "balanza_debe": debe,
            "balanza_haber": haber,
            "balanza_diferencia": dif_balanza,
            "balanza_cuadra": balanza_cuadra,
            "saldos_deudor": tot_deudor,
            "saldos_acreedor": tot_acreedor,
            "saldos_diferencia": dif_saldos,
            "saldos_cuadra": saldos_cuadra,
            "balance_activo": activo,
            "balance_pasivo_capital": pcap,
            "balance_diferencia": dif_balance,
            "balance_cuadra": balance_cuadra,
            "cuadra_global": (balanza_cuadra and saldos_cuadra and balance_cuadra),
            "candidatos_balanza": candidatos,
            "candidatos_saldos": candidatos_saldos,
        }