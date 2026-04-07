"""
Libro Diario y Libro Mayor (motor completo).

- Libro diario: pólizas del periodo en orden cronológico con todas las partidas; con cfdi_poliza,
  cada línea puede traer UUID y bloque cfdi para export / UI.
- Libro mayor: historial por cuenta con saldo acumulado; si existen partidas_poliza y cfdi_poliza,
  incluye UUID y metadatos del CFDI vinculado a la partida.
- Diario–Mayor integrado: misma ventana consume estructura con resumen por cuenta por póliza.

Fuente de líneas:
1) partidas_poliza (cargo_mn/abono_mn) + polizas
2) movimientos legacy si no hay partidas
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

try:
    from config import get_db_path
except Exception:

    def get_db_path() -> str:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, "backend", "database", "contabilidad.db")


def _where_poliza_no_cancelada(cur: sqlite3.Cursor) -> str:
    cur.execute("PRAGMA table_info(polizas)")
    cols = [r[1] for r in cur.fetchall()]
    if "estatus" not in cols:
        return ""
    return "AND UPPER(COALESCE(p.estatus,'C')) != 'X'"


def _tabla_existe(cur: sqlite3.Cursor, nombre: str) -> bool:
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (nombre,))
    return cur.fetchone() is not None


def _naturaleza_cuenta(cur: sqlite3.Cursor, num_cuenta: str) -> str:
    cur.execute(
        "SELECT COALESCE(naturaleza,'DEUDORA') FROM catalogo_cuentas WHERE num_cuenta = ? LIMIT 1",
        (num_cuenta,),
    )
    row = cur.fetchone()
    return str((row[0] if row else "DEUDORA") or "DEUDORA").upper().strip()


def _delta_mov(naturaleza: str, cargo: float, abono: float) -> float:
    naturaleza = (naturaleza or "DEUDORA").upper().strip()
    c = float(cargo or 0.0)
    a = float(abono or 0.0)
    return (a - c) if naturaleza == "ACREEDORA" else (c - a)


class LibroContableManager:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def _usar_partidas(self, cur: sqlite3.Cursor) -> bool:
        return _tabla_existe(cur, "partidas_poliza")

    def libro_diario(
        self,
        fecha_ini: str,
        fecha_fin: str,
        tipos_poliza: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Todas las pólizas del rango con líneas detalladas.
        tipos_poliza: ej. ['INGRESO','EGRESO','DIARIO'] o None = todas.
        """
        fecha_ini = (fecha_ini or "").strip()
        fecha_fin = (fecha_fin or "").strip()
        if not fecha_ini or not fecha_fin:
            return {"exito": False, "error": "Indique fecha inicial y final."}

        tipos = None
        if tipos_poliza:
            tipos = [str(t).strip().upper() for t in tipos_poliza if str(t).strip()]
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                where_est = _where_poliza_no_cancelada(cur)
                where_tipo = ""
                params: List[Any] = [fecha_ini, fecha_fin]
                if tipos:
                    ph = ",".join(["?"] * len(tipos))
                    where_tipo = f" AND UPPER(p.tipo_poliza) IN ({ph}) "
                    params.extend(tipos)

                cur.execute(
                    f"""
                    SELECT p.id, p.numero_poliza, p.tipo_poliza, p.fecha, p.concepto,
                           COALESCE(p.moneda,'MXN') AS moneda, COALESCE(p.tipo_cambio,1) AS tipo_cambio
                    FROM polizas p
                    WHERE p.fecha BETWEEN ? AND ?
                    {where_tipo}
                    {where_est}
                    ORDER BY p.fecha ASC, p.tipo_poliza ASC, p.numero_poliza ASC, p.id ASC
                    """,
                    params,
                )
                pol_rows = cur.fetchall()

                polizas: List[Dict[str, Any]] = []
                tot_cargo = tot_abono = 0.0

                if self._usar_partidas(cur):
                    join_cfdi = ""
                    sel_cfdi = (
                        ", '' AS uuid_cfdi, NULL AS rfc_emisor_cfdi, NULL AS rfc_receptor_cfdi, "
                        "NULL AS cfdi_subtotal, NULL AS cfdi_iva, NULL AS cfdi_total"
                    )
                    if _tabla_existe(cur, "cfdi_poliza"):
                        join_cfdi = "LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida"
                        sel_cfdi = (
                            ", COALESCE(cfp.uuid,'') AS uuid_cfdi, cfp.rfc_emisor AS rfc_emisor_cfdi, "
                            "cfp.rfc_receptor AS rfc_receptor_cfdi, cfp.subtotal AS cfdi_subtotal, "
                            "cfp.iva_trasladado AS cfdi_iva, cfp.total_cfdi AS cfdi_total"
                        )
                    for pr in pol_rows:
                        pid = int(pr["id"])
                        cur.execute(
                            f"""
                            SELECT
                              pp.id_partida,
                              pp.numero_linea,
                              pp.num_cuenta,
                              COALESCE(pp.concepto_linea,'') AS concepto_linea,
                              COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                              COALESCE(pp.abono_mn, pp.abono, 0) AS abono
                              {sel_cfdi}
                            FROM partidas_poliza pp
                            {join_cfdi}
                            WHERE pp.id_poliza = ?
                            ORDER BY pp.numero_linea ASC, pp.id_partida ASC
                            """,
                            (pid,),
                        )
                        lineas = []
                        for lr in cur.fetchall():
                            cargo = float(lr["cargo"] or 0.0)
                            abono = float(lr["abono"] or 0.0)
                            tot_cargo += cargo
                            tot_abono += abono
                            uuid_s = str(lr["uuid_cfdi"] or "").strip()
                            item: Dict[str, Any] = {
                                "id_partida": int(lr["id_partida"]),
                                "numero_linea": int(lr["numero_linea"] or 0),
                                "num_cuenta": str(lr["num_cuenta"] or ""),
                                "concepto_linea": str(lr["concepto_linea"] or ""),
                                "cargo": cargo,
                                "abono": abono,
                                "uuid": uuid_s,
                            }
                            if uuid_s:
                                item["cfdi"] = {
                                    "uuid": uuid_s,
                                    "rfc_emisor": str(lr["rfc_emisor_cfdi"] or ""),
                                    "rfc_receptor": str(lr["rfc_receptor_cfdi"] or ""),
                                    "subtotal": lr["cfdi_subtotal"],
                                    "iva_trasladado": lr["cfdi_iva"],
                                    "total_cfdi": lr["cfdi_total"],
                                }
                            else:
                                item["cfdi"] = {}
                            lineas.append(item)
                        polizas.append(
                            {
                                "id_poliza": pid,
                                "numero_poliza": int(pr["numero_poliza"] or 0),
                                "tipo_poliza": str(pr["tipo_poliza"] or ""),
                                "fecha": str(pr["fecha"] or "")[:10],
                                "concepto": str(pr["concepto"] or ""),
                                "moneda": str(pr["moneda"] or "MXN"),
                                "tipo_cambio": float(pr["tipo_cambio"] or 1.0),
                                "lineas": lineas,
                                "total_cargo": sum(l["cargo"] for l in lineas),
                                "total_abono": sum(l["abono"] for l in lineas),
                            }
                        )
                else:
                    for pr in pol_rows:
                        pid = int(pr["id"])
                        cur.execute(
                            """
                            SELECT
                              m.id AS id_movimiento,
                              m.num_cuenta,
                              COALESCE(m.concepto_mov,'') AS concepto_mov,
                              COALESCE(m.cargo,0) AS cargo,
                              COALESCE(m.abono,0) AS abono
                            FROM movimientos m
                            WHERE m.poliza_id = ?
                            ORDER BY m.id ASC
                            """,
                            (pid,),
                        )
                        lineas = []
                        for lr in cur.fetchall():
                            cargo = float(lr["cargo"] or 0.0)
                            abono = float(lr["abono"] or 0.0)
                            tot_cargo += cargo
                            tot_abono += abono
                            lineas.append(
                                {
                                    "id_partida": None,
                                    "numero_linea": len(lineas) + 1,
                                    "num_cuenta": str(lr["num_cuenta"] or ""),
                                    "concepto_linea": str(lr["concepto_mov"] or ""),
                                    "cargo": cargo,
                                    "abono": abono,
                                    "uuid": "",
                                    "cfdi": {},
                                }
                            )
                        polizas.append(
                            {
                                "id_poliza": pid,
                                "numero_poliza": int(pr["numero_poliza"] or 0),
                                "tipo_poliza": str(pr["tipo_poliza"] or ""),
                                "fecha": str(pr["fecha"] or "")[:10],
                                "concepto": str(pr["concepto"] or ""),
                                "moneda": str(pr["moneda"] or "MXN"),
                                "tipo_cambio": float(pr["tipo_cambio"] or 1.0),
                                "lineas": lineas,
                                "total_cargo": sum(l["cargo"] for l in lineas),
                                "total_abono": sum(l["abono"] for l in lineas),
                            }
                        )

                return {
                    "exito": True,
                    "fuente": "partidas_poliza" if self._usar_partidas(cur) else "movimientos",
                    "fecha_ini": fecha_ini,
                    "fecha_fin": fecha_fin,
                    "polizas": polizas,
                    "totales_periodo": {"cargo": float(tot_cargo), "abono": float(tot_abono)},
                }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def cfdi_por_partida(self, id_partida: int) -> Dict[str, Any]:
        """Detalle CFDI ligado a una partida (cfdi_poliza)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                if not _tabla_existe(cur, "cfdi_poliza"):
                    return {"exito": False, "error": "No existe tabla cfdi_poliza."}
                cur.execute(
                    """
                    SELECT uuid, rfc_emisor, rfc_receptor, fecha_cfdi, subtotal,
                           iva_trasladado, iva_retenido, isr_retenido, total_cfdi,
                           tipo_comprobante, metodo_pago, forma_pago
                    FROM cfdi_poliza
                    WHERE id_partida = ?
                    LIMIT 1
                    """,
                    (int(id_partida),),
                )
                r = cur.fetchone()
                if not r:
                    return {"exito": False, "error": "Esta partida no tiene CFDI vinculado."}
                return {"exito": True, "cfdi": dict(r)}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def libro_mayor_cuenta(self, cuenta: str, fecha_ini: str, fecha_fin: str) -> Dict[str, Any]:
        """
        Mayor de una cuenta con saldo acumulado.
        Incluye saldo inicial (movimientos anteriores al periodo) y columnas CFDI cuando aplique.
        """
        cuenta = str(cuenta or "").strip()
        fecha_ini = (fecha_ini or "").strip()
        fecha_fin = (fecha_fin or "").strip()
        if not cuenta or not fecha_ini or not fecha_fin:
            return {"exito": False, "error": "Cuenta y fechas requeridas.", "lineas": []}

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                nat = _naturaleza_cuenta(cur, cuenta)
                where_est = _where_poliza_no_cancelada(cur)

                lineas: List[Dict[str, Any]] = []
                fuente = "partidas_poliza" if self._usar_partidas(cur) else "movimientos"

                if fuente == "partidas_poliza":
                    cur.execute(
                        f"""
                        SELECT COALESCE(SUM(COALESCE(pp.cargo_mn, pp.cargo,0)),0) AS sc,
                               COALESCE(SUM(COALESCE(pp.abono_mn, pp.abono,0)),0) AS sa
                        FROM partidas_poliza pp
                        JOIN polizas p ON p.id = pp.id_poliza
                        WHERE pp.num_cuenta = ?
                          AND p.fecha < ?
                          {where_est}
                        """,
                        (cuenta, fecha_ini),
                    )
                    row0 = cur.fetchone()
                    c0 = float(row0["sc"] or 0.0) if row0 else 0.0
                    a0 = float(row0["sa"] or 0.0) if row0 else 0.0
                    saldo = _delta_mov(nat, c0, a0)

                    join_cfdi = ""
                    sel_cfdi = ", '' AS uuid, NULL AS subtotal_cfdi, NULL AS iva_cfdi, NULL AS total_cfdi"
                    if _tabla_existe(cur, "cfdi_poliza"):
                        join_cfdi = "LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida"
                        sel_cfdi = (
                            ", COALESCE(cfp.uuid,'') AS uuid, cfp.subtotal AS subtotal_cfdi, "
                            "cfp.iva_trasladado AS iva_cfdi, cfp.total_cfdi AS total_cfdi"
                        )

                    cur.execute(
                        f"""
                        SELECT
                          pp.id_partida,
                          p.fecha,
                          p.tipo_poliza,
                          p.numero_poliza,
                          p.concepto AS concepto_poliza,
                          COALESCE(pp.concepto_linea,'') AS concepto_mov,
                          COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                          COALESCE(pp.abono_mn, pp.abono, 0) AS abono
                          {sel_cfdi}
                        FROM partidas_poliza pp
                        JOIN polizas p ON p.id = pp.id_poliza
                        {join_cfdi}
                        WHERE pp.num_cuenta = ?
                          AND p.fecha BETWEEN ? AND ?
                          {where_est}
                        ORDER BY p.fecha ASC, p.numero_poliza ASC, pp.numero_linea ASC, pp.id_partida ASC
                        """,
                        (cuenta, fecha_ini, fecha_fin),
                    )
                    for r in cur.fetchall():
                        cargo = float(r["cargo"] or 0.0)
                        abono = float(r["abono"] or 0.0)
                        saldo += _delta_mov(nat, cargo, abono)
                        lineas.append(
                            {
                                "id_partida": int(r["id_partida"]),
                                "fecha": str(r["fecha"] or "")[:10],
                                "tipo_poliza": str(r["tipo_poliza"] or ""),
                                "numero_poliza": r["numero_poliza"],
                                "concepto_poliza": str(r["concepto_poliza"] or ""),
                                "concepto_mov": str(r["concepto_mov"] or ""),
                                "cargo": cargo,
                                "abono": abono,
                                "saldo": saldo,
                                "uuid": str(r["uuid"] or "").strip(),
                                "subtotal_cfdi": r["subtotal_cfdi"],
                                "iva_cfdi": r["iva_cfdi"],
                                "total_cfdi": r["total_cfdi"],
                            }
                        )
                else:
                    cur.execute(
                        f"""
                        SELECT COALESCE(SUM(COALESCE(m.cargo,0)),0) AS sc,
                               COALESCE(SUM(COALESCE(m.abono,0)),0) AS sa
                        FROM movimientos m
                        JOIN polizas p ON p.id = m.poliza_id
                        WHERE m.num_cuenta = ?
                          AND p.fecha < ?
                          {where_est}
                        """,
                        (cuenta, fecha_ini),
                    )
                    row0 = cur.fetchone()
                    c0 = float(row0["sc"] or 0.0) if row0 else 0.0
                    a0 = float(row0["sa"] or 0.0) if row0 else 0.0
                    saldo = _delta_mov(nat, c0, a0)

                    cur.execute(
                        f"""
                        SELECT
                          m.id AS id_movimiento,
                          p.fecha,
                          p.tipo_poliza,
                          p.numero_poliza,
                          p.concepto AS concepto_poliza,
                          COALESCE(m.concepto_mov,'') AS concepto_mov,
                          COALESCE(m.cargo,0) AS cargo,
                          COALESCE(m.abono,0) AS abono
                        FROM movimientos m
                        JOIN polizas p ON p.id = m.poliza_id
                        WHERE m.num_cuenta = ?
                          AND p.fecha BETWEEN ? AND ?
                          {where_est}
                        ORDER BY p.fecha ASC, p.numero_poliza ASC, m.id ASC
                        """,
                        (cuenta, fecha_ini, fecha_fin),
                    )
                    for r in cur.fetchall():
                        cargo = float(r["cargo"] or 0.0)
                        abono = float(r["abono"] or 0.0)
                        saldo += _delta_mov(nat, cargo, abono)
                        lineas.append(
                            {
                                "id_partida": None,
                                "id_movimiento": int(r["id_movimiento"]),
                                "fecha": str(r["fecha"] or "")[:10],
                                "tipo_poliza": str(r["tipo_poliza"] or ""),
                                "numero_poliza": r["numero_poliza"],
                                "concepto_poliza": str(r["concepto_poliza"] or ""),
                                "concepto_mov": str(r["concepto_mov"] or ""),
                                "cargo": cargo,
                                "abono": abono,
                                "saldo": saldo,
                                "uuid": "",
                                "subtotal_cfdi": None,
                                "iva_cfdi": None,
                                "total_cfdi": None,
                            }
                        )

                return {
                    "exito": True,
                    "cuenta": cuenta,
                    "naturaleza": nat,
                    "fecha_ini": fecha_ini,
                    "fecha_fin": fecha_fin,
                    "fuente": fuente,
                    "saldo_inicial": float(_delta_mov(nat, c0, a0)),
                    "lineas": lineas,
                }
        except Exception as e:
            return {"exito": False, "error": str(e), "lineas": []}

    def diario_mayor_integrado(
        self,
        fecha_ini: str,
        fecha_fin: str,
        tipos_poliza: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Estructura para vista combinada: cada póliza incluye líneas y resumen por cuenta afectada.
        """
        base = self.libro_diario(fecha_ini, fecha_fin, tipos_poliza=tipos_poliza)
        if not base.get("exito"):
            return base
        for p in base.get("polizas") or []:
            res: Dict[str, Dict[str, float]] = {}
            for ln in p.get("lineas") or []:
                nc = str(ln.get("num_cuenta") or "").strip()
                if not nc:
                    continue
                if nc not in res:
                    res[nc] = {"cargo": 0.0, "abono": 0.0}
                res[nc]["cargo"] += float(ln.get("cargo") or 0.0)
                res[nc]["abono"] += float(ln.get("abono") or 0.0)
            p["resumen_por_cuenta"] = [
                {"num_cuenta": k, "cargo": v["cargo"], "abono": v["abono"]}
                for k, v in sorted(res.items(), key=lambda x: x[0])
            ]
        return base
