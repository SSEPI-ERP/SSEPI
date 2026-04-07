"""
Reportes fiscales SAT (CFDI vinculados a pólizas): IVA emitido/acreditable, retenciones,
operaciones con terceros y CFDIs importados sin póliza.

Fuente principal: cfdi_poliza + partidas_poliza + polizas (solo pólizas afectadas).
CFDI sin vincular: cfdi_tablero LEFT JOIN cfdi_poliza (módulo cfdi_import_servicio).
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from config import get_db_path


def _where_poliza_no_cancelada(cur: sqlite3.Cursor) -> str:
    cur.execute("PRAGMA table_info(polizas)")
    cols = [r[1] for r in cur.fetchall()]
    if "estatus" not in cols:
        return ""
    return "AND UPPER(COALESCE(p.estatus,'C')) != 'X'"


def _where_periodo_params(cur: sqlite3.Cursor) -> Tuple[str, bool]:
    """Retorna (fragmento SQL, usa_ejercicio_periodo). Params: año, mes o ejercicio, periodo."""
    cur.execute("PRAGMA table_info(polizas)")
    cols = {r[1] for r in cur.fetchall()}
    if "ejercicio" in cols and "periodo" in cols:
        return "p.ejercicio = ? AND p.periodo = ?", True
    return (
        "CAST(strftime('%Y', p.fecha) AS INTEGER) = ? AND CAST(strftime('%m', p.fecha) AS INTEGER) = ?",
        False,
    )


def _infer_tasa_iva(subtotal: float, iva: float) -> str:
    s = abs(float(subtotal or 0))
    i = abs(float(iva or 0))
    if s < 0.01:
        return "—"
    if i < 0.01:
        return "0%/Exento"
    ratio = i / s
    if 0.155 <= ratio <= 0.17:
        return "16%"
    if 0.07 <= ratio <= 0.09:
        return "8%"
    return f"~{ratio * 100:.1f}%"


class ReportesFiscalesSATManager:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def _sum_movimientos_cuenta_periodo(
        self,
        cur: sqlite3.Cursor,
        num_cuenta: str,
        ejercicio: int,
        periodo: int,
        *,
        natural_cargo_abono_iva: str = "haber",
    ) -> float:
        """
        Suma cargo/abono MN en partidas del mes sobre la cuenta (patrón LIKE si termina en %).
        Para IVA trasladado cobrado suele acreditarse haber en pasivo; ajuste según su catálogo.
        """
        nc = (num_cuenta or "").strip()
        if not nc:
            return 0.0
        w_est = _where_poliza_no_cancelada(cur)
        period_clause, uses_ep = _where_periodo_params(cur)
        like_op = "LIKE" if ("%" in nc or nc.endswith("*")) else "="
        val = nc.replace("*", "%") if "*" in nc else nc
        params = (val, int(ejercicio), int(periodo))
        col = "COALESCE(pp.cargo_mn, pp.cargo, 0)" if natural_cargo_abono_iva == "cargo" else "COALESCE(pp.abono_mn, pp.abono, 0)"
        try:
            cur.execute(
                f"""
                SELECT COALESCE(SUM({col}), 0)
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                WHERE pp.num_cuenta {like_op} ?
                  AND {period_clause}
                  {w_est}
                """,
                params,
            )
            row = cur.fetchone()
            return float((row[0] if row else 0) or 0)
        except sqlite3.Error:
            return 0.0

    def cfdi_emitidos_periodo(
        self,
        ejercicio: int,
        periodo: int,
        rfc_empresa: str,
        *,
        max_rows: int = 5000,
    ) -> Dict[str, Any]:
        """CFDI donde la empresa es emisor (ventas)."""
        rfc = (rfc_empresa or "").strip().upper()
        if not rfc:
            return {"exito": False, "error": "Indique RFC de la empresa (emisor).", "filas": []}
        w_est = ""
        period_clause = ""
        params: List[Any] = []
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            w_est = _where_poliza_no_cancelada(cur)
            period_clause, uses_ep = _where_periodo_params(cur)
            if uses_ep:
                params = [rfc, int(ejercicio), int(periodo)]
            else:
                params = [rfc, int(ejercicio), int(periodo)]
            try:
                cur.execute(
                    f"""
                    SELECT
                        c.uuid,
                        MAX(substr(COALESCE(c.fecha_cfdi,''),1,10)) AS fecha,
                        MAX(TRIM(COALESCE(c.rfc_receptor,''))) AS rfc_contraparte,
                        MAX(COALESCE(c.subtotal,0)) AS subtotal,
                        MAX(COALESCE(c.iva_trasladado,0)) AS iva_trasladado,
                        MAX(COALESCE(c.iva_retenido,0)) AS iva_retenido,
                        MAX(COALESCE(c.isr_retenido,0)) AS isr_retenido,
                        MAX(COALESCE(c.total_cfdi,0)) AS total_cfdi,
                        MAX(COALESCE(c.tipo_comprobante,'')) AS tipo_comprobante,
                        MIN(p.id) AS id_poliza,
                        MIN(p.numero_poliza) AS numero_poliza,
                        MAX(p.tipo_poliza) AS tipo_poliza
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE UPPER(TRIM(COALESCE(c.rfc_emisor,''))) = ?
                      AND {period_clause}
                      {w_est}
                    GROUP BY c.uuid
                    ORDER BY fecha, c.uuid
                    LIMIT ?
                    """,
                    (*params, int(max_rows)),
                )
                filas = [dict(r) for r in cur.fetchall()]
            except sqlite3.Error as e:
                return {"exito": False, "error": str(e), "filas": []}

        for r in filas:
            r["tasa_inferida"] = _infer_tasa_iva(r.get("subtotal") or 0, r.get("iva_trasladado") or 0)

        agg = {"16%": 0.0, "8%": 0.0, "0%/Exento": 0.0, "otros": 0.0}
        tot_base = tot_iva = 0.0
        for r in filas:
            st = float(r.get("subtotal") or 0)
            iv = float(r.get("iva_trasladado") or 0)
            tot_base += st
            tot_iva += iv
            t = r.get("tasa_inferida") or ""
            if t == "16%":
                agg["16%"] += iv
            elif t == "8%":
                agg["8%"] += iv
            elif t == "0%/Exento":
                agg["0%/Exento"] += iv
            else:
                agg["otros"] += iv

        return {
            "exito": True,
            "tipo": "iva_emitidos",
            "filas": filas,
            "totales": {"subtotal": tot_base, "iva_trasladado": tot_iva, "por_tasa": agg},
        }

    def cfdi_recibidos_periodo(
        self,
        ejercicio: int,
        periodo: int,
        rfc_empresa: str,
        *,
        max_rows: int = 5000,
    ) -> Dict[str, Any]:
        """CFDI donde la empresa es receptor (compras/gastos)."""
        rfc = (rfc_empresa or "").strip().upper()
        if not rfc:
            return {"exito": False, "error": "Indique RFC de la empresa (receptor).", "filas": []}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            w_est = _where_poliza_no_cancelada(cur)
            period_clause, uses_ep = _where_periodo_params(cur)
            if uses_ep:
                params = [rfc, int(ejercicio), int(periodo)]
            else:
                params = [rfc, int(ejercicio), int(periodo)]
            try:
                cur.execute(
                    f"""
                    SELECT
                        c.uuid,
                        MAX(substr(COALESCE(c.fecha_cfdi,''),1,10)) AS fecha,
                        MAX(TRIM(COALESCE(c.rfc_emisor,''))) AS rfc_proveedor,
                        MAX(COALESCE(c.subtotal,0)) AS subtotal,
                        MAX(COALESCE(c.iva_trasladado,0)) AS iva_trasladado,
                        MAX(COALESCE(c.iva_retenido,0)) AS iva_retenido,
                        MAX(COALESCE(c.isr_retenido,0)) AS isr_retenido,
                        MAX(COALESCE(c.total_cfdi,0)) AS total_cfdi,
                        MAX(COALESCE(c.tipo_comprobante,'')) AS tipo_comprobante,
                        MIN(p.id) AS id_poliza,
                        MIN(p.numero_poliza) AS numero_poliza,
                        MAX(p.tipo_poliza) AS tipo_poliza
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE UPPER(TRIM(COALESCE(c.rfc_receptor,''))) = ?
                      AND {period_clause}
                      {w_est}
                    GROUP BY c.uuid
                    ORDER BY fecha, c.uuid
                    LIMIT ?
                    """,
                    (*params, int(max_rows)),
                )
                filas = [dict(r) for r in cur.fetchall()]
            except sqlite3.Error as e:
                return {"exito": False, "error": str(e), "filas": []}

        for r in filas:
            r["tasa_inferida"] = _infer_tasa_iva(r.get("subtotal") or 0, r.get("iva_trasladado") or 0)

        tot_base = tot_iva = 0.0
        for r in filas:
            tot_base += float(r.get("subtotal") or 0)
            tot_iva += float(r.get("iva_trasladado") or 0)

        return {
            "exito": True,
            "tipo": "iva_recibidos",
            "filas": filas,
            "totales": {"subtotal": tot_base, "iva_acreditable_cfdi": tot_iva},
        }

    def cuadre_iva_cuenta(
        self,
        ejercicio: int,
        periodo: int,
        num_cuenta_patron: str,
        monto_cfdi: float,
        *,
        usar_abono: bool = True,
    ) -> Dict[str, Any]:
        """Compara suma de movimientos en cuenta vs monto CFDI (referencia)."""
        num_cuenta_patron = (num_cuenta_patron or "").strip()
        if not num_cuenta_patron:
            return {"exito": True, "contable": 0.0, "cfdi": float(monto_cfdi), "diferencia": -float(monto_cfdi)}
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            col = "abono" if usar_abono else "cargo"
            cont = self._sum_movimientos_cuenta_periodo(cur, num_cuenta_patron, ejercicio, periodo, natural_cargo_abono_iva=col)
        cfdi = float(monto_cfdi or 0)
        return {
            "exito": True,
            "contable": cont,
            "cfdi": cfdi,
            "diferencia": cont - cfdi,
            "cuenta": num_cuenta_patron,
        }

    def retenciones_por_proveedor(
        self,
        ejercicio: int,
        periodo: int,
        rfc_empresa: str,
        *,
        max_rows: int = 2000,
    ) -> Dict[str, Any]:
        """ISR e IVA retenido por RFC emisor (proveedor) en CFDI recibidos."""
        rfc = (rfc_empresa or "").strip().upper()
        if not rfc:
            return {"exito": False, "error": "RFC empresa requerido.", "filas": []}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            w_est = _where_poliza_no_cancelada(cur)
            period_clause, uses_ep = _where_periodo_params(cur)
            if uses_ep:
                params = [rfc, int(ejercicio), int(periodo)]
            else:
                params = [rfc, int(ejercicio), int(periodo)]
            try:
                cur.execute(
                    f"""
                    SELECT
                        TRIM(COALESCE(c.rfc_emisor,'')) AS rfc_proveedor,
                        COUNT(DISTINCT c.uuid) AS cfdi,
                        COALESCE(SUM(COALESCE(c.iva_retenido,0)),0) AS iva_retenido,
                        COALESCE(SUM(COALESCE(c.isr_retenido,0)),0) AS isr_retenido,
                        COALESCE(SUM(COALESCE(c.subtotal,0)),0) AS subtotal
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE UPPER(TRIM(COALESCE(c.rfc_receptor,''))) = ?
                      AND {period_clause}
                      {w_est}
                    GROUP BY TRIM(COALESCE(c.rfc_emisor,''))
                    HAVING ABS(SUM(COALESCE(c.iva_retenido,0))) > 0.01 OR ABS(SUM(COALESCE(c.isr_retenido,0))) > 0.01
                    ORDER BY (SUM(COALESCE(c.isr_retenido,0)) + SUM(COALESCE(c.iva_retenido,0))) DESC
                    LIMIT ?
                    """,
                    (*params, int(max_rows)),
                )
                filas = [dict(r) for r in cur.fetchall()]
            except sqlite3.Error as e:
                return {"exito": False, "error": str(e), "filas": []}
        return {"exito": True, "filas": filas}

    def operaciones_terceros_periodo(
        self,
        ejercicio: int,
        periodo: int,
        rfc_empresa: str,
        *,
        max_rows: int = 3000,
    ) -> Dict[str, Any]:
        """
        Por RFC de contraparte: compras (empresa receptor), ventas (empresa emisor),
        IVA involucrado y lista de id póliza.
        """
        rfc = (rfc_empresa or "").strip().upper()
        if not rfc:
            return {"exito": False, "error": "RFC empresa requerido.", "filas": []}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            w = _where_poliza_no_cancelada(cur)
            period_clause, _uses_ep = _where_periodo_params(cur)
            if _uses_ep:
                pcom = [rfc, int(ejercicio), int(periodo)]
                pven = [rfc, int(ejercicio), int(periodo)]
            else:
                pcom = [rfc, int(ejercicio), int(periodo)]
                pven = [rfc, int(ejercicio), int(periodo)]
            compras: Dict[str, Dict[str, Any]] = {}
            ventas: Dict[str, Dict[str, Any]] = {}
            try:
                cur.execute(
                    f"""
                    SELECT
                        TRIM(COALESCE(c.rfc_emisor,'')) AS rfc_t,
                        c.uuid,
                        COALESCE(c.subtotal,0) AS subtotal,
                        COALESCE(c.iva_trasladado,0) AS iva,
                        COALESCE(c.total_cfdi,0) AS total,
                        p.id AS id_poliza
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE UPPER(TRIM(COALESCE(c.rfc_receptor,''))) = ?
                      AND {period_clause}
                      {w}
                    """,
                    tuple(pcom),
                )
                for r in cur.fetchall():
                    k = (r["rfc_t"] or "").strip().upper() or "(SIN RFC)"
                    if k not in compras:
                        compras[k] = {"compras_sub": 0.0, "compras_iva": 0.0, "compras_total": 0.0, "polizas_compra": set()}
                    compras[k]["compras_sub"] += float(r["subtotal"] or 0)
                    compras[k]["compras_iva"] += float(r["iva"] or 0)
                    compras[k]["compras_total"] += float(r["total"] or 0)
                    compras[k]["polizas_compra"].add(int(r["id_poliza"]))

                cur.execute(
                    f"""
                    SELECT
                        TRIM(COALESCE(c.rfc_receptor,'')) AS rfc_t,
                        c.uuid,
                        COALESCE(c.subtotal,0) AS subtotal,
                        COALESCE(c.iva_trasladado,0) AS iva,
                        COALESCE(c.total_cfdi,0) AS total,
                        p.id AS id_poliza
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE UPPER(TRIM(COALESCE(c.rfc_emisor,''))) = ?
                      AND {period_clause}
                      {w}
                    """,
                    tuple(pven),
                )
                for r in cur.fetchall():
                    k = (r["rfc_t"] or "").strip().upper() or "(SIN RFC)"
                    if k not in ventas:
                        ventas[k] = {"ventas_sub": 0.0, "ventas_iva": 0.0, "ventas_total": 0.0, "polizas_venta": set()}
                    ventas[k]["ventas_sub"] += float(r["subtotal"] or 0)
                    ventas[k]["ventas_iva"] += float(r["iva"] or 0)
                    ventas[k]["ventas_total"] += float(r["total"] or 0)
                    ventas[k]["polizas_venta"].add(int(r["id_poliza"]))
            except sqlite3.Error as e:
                return {"exito": False, "error": str(e), "filas": []}

        all_rfc = sorted(set(compras.keys()) | set(ventas.keys()))
        filas = []
        for k in all_rfc:
            c = compras.get(k, {})
            v = ventas.get(k, {})
            pc = c.get("polizas_compra") or set()
            pv = v.get("polizas_venta") or set()
            filas.append(
                {
                    "rfc": k,
                    "compras_subtotal": float(c.get("compras_sub") or 0),
                    "compras_iva": float(c.get("compras_iva") or 0),
                    "compras_total": float(c.get("compras_total") or 0),
                    "ventas_subtotal": float(v.get("ventas_sub") or 0),
                    "ventas_iva": float(v.get("ventas_iva") or 0),
                    "ventas_total": float(v.get("ventas_total") or 0),
                    "polizas_compra": ",".join(str(x) for x in sorted(pc)),
                    "polizas_venta": ",".join(str(x) for x in sorted(pv)),
                }
            )
        filas = [x for x in filas if any(abs(x[y]) > 0.01 for y in ("compras_subtotal", "ventas_subtotal"))]
        filas.sort(key=lambda x: -(x["compras_total"] + x["ventas_total"]))
        return {"exito": True, "filas": filas[: int(max_rows)]}

    def cfdis_importados_sin_poliza(self, ejercicio: int, mes: int) -> Dict[str, Any]:
        """CFDI en tablero de importación sin vínculo a cfdi_poliza (mismo periodo)."""
        try:
            from backend.modules.cfdi_import_servicio import reporte_cfdis_tablero_sin_vincular
        except Exception as e:
            return {"exito": False, "error": str(e), "filas": []}
        filas = reporte_cfdis_tablero_sin_vincular(int(ejercicio), int(mes), self.db_path)
        return {"exito": True, "filas": filas}
