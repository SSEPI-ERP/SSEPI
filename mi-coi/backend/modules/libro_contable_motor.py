# backend/modules/libro_contable_motor.py
"""
Libro Diario, Libro Mayor (con CFDI) y vista Diario–Mayor integrada.

Prioriza partidas_poliza + cfdi_poliza; si no hay partidas, usa movimientos (sin UUID).
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Optional

try:
    from config import get_db_path
except ImportError:

    def get_db_path():
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, "backend", "database", "contabilidad.db")


class LibroContableMotor:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def _where_activa(self, cur: sqlite3.Cursor) -> str:
        cur.execute("PRAGMA table_info(polizas)")
        cols = [r[1] for r in cur.fetchall()]
        if "estatus" in cols:
            return "AND UPPER(COALESCE(p.estatus,'C')) <> 'X'"
        return ""

    def libro_diario(
        self,
        fecha_ini: str,
        fecha_fin: str,
        *,
        tipos_poliza: Optional[List[str]] = None,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Todas las pólizas del rango en orden cronológico, cada una con sus partidas
        (cuenta, concepto, cargo, abono, id_partida, datos_cfdi si existe).
        """
        tipos = [t.strip().upper() for t in (tipos_poliza or []) if t and str(t).strip()]
        out_polizas: List[Dict[str, Any]] = []
        total_cargo = total_abono = 0.0
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                w = self._where_activa(cur)
                tp_sql = ""
                params: List[Any] = [fecha_ini, fecha_fin]
                if tipos:
                    tp_sql = f" AND UPPER(p.tipo_poliza) IN ({','.join(['?']*len(tipos))}) "
                    params.extend(tipos)
                cur.execute(
                    f"""
                    SELECT p.id, p.numero_poliza, p.tipo_poliza, p.fecha, p.concepto, COALESCE(p.estatus,'C') AS estatus
                    FROM polizas p
                    WHERE p.fecha BETWEEN ? AND ? {w} {tp_sql}
                    ORDER BY p.fecha ASC, p.tipo_poliza ASC, p.numero_poliza ASC, p.id ASC
                    """,
                    tuple(params),
                )
                pol_rows = cur.fetchall()
                ids = [int(r["id"]) for r in pol_rows]

                partidas_por_pol: Dict[int, List[Dict[str, Any]]] = {i: [] for i in ids}
                try:
                    cc = ""
                    prm: List[Any] = []
                    if centro_costo_id is not None:
                        cc = " AND pp.centro_costo_id = ? "
                        prm.append(int(centro_costo_id))
                    if ids:
                        ph = ",".join(["?"] * len(ids))
                        qparams = tuple(ids) + tuple(prm)
                        cur.execute(
                            f"""
                            SELECT pp.id_partida, pp.id_poliza, pp.numero_linea, pp.num_cuenta,
                                   COALESCE(pp.concepto_linea,'') AS concepto_linea,
                                   COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                                   COALESCE(pp.abono_mn, pp.abono, 0) AS abono,
                                   COALESCE(cfp.uuid,'') AS uuid,
                                   COALESCE(cfp.rfc_emisor,'') AS rfc_emisor,
                                   COALESCE(cfp.rfc_receptor,'') AS rfc_receptor,
                                   COALESCE(cfp.subtotal,0) AS subtotal,
                                   COALESCE(cfp.iva_trasladado,0) AS iva_trasladado,
                                   COALESCE(cfp.total_cfdi,0) AS total_cfdi
                            FROM partidas_poliza pp
                            LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                            WHERE pp.id_poliza IN ({ph}) {cc}
                            ORDER BY pp.id_poliza ASC, pp.numero_linea ASC, pp.id_partida ASC
                            """,
                            qparams,
                        )
                        for r in cur.fetchall():
                            pid = int(r["id_poliza"])
                            cargo = float(r["cargo"] or 0)
                            abono = float(r["abono"] or 0)
                            total_cargo += cargo
                            total_abono += abono
                            cfdi = None
                            uid = (r["uuid"] or "").strip()
                            if uid:
                                cfdi = {
                                    "uuid": uid,
                                    "rfc_emisor": r["rfc_emisor"],
                                    "rfc_receptor": r["rfc_receptor"],
                                    "subtotal": float(r["subtotal"] or 0),
                                    "iva_trasladado": float(r["iva_trasladado"] or 0),
                                    "total_cfdi": float(r["total_cfdi"] or 0),
                                }
                            partidas_por_pol[pid].append(
                                {
                                    "id_partida": int(r["id_partida"]),
                                    "numero_linea": int(r["numero_linea"] or 0),
                                    "num_cuenta": r["num_cuenta"],
                                    "concepto_linea": r["concepto_linea"],
                                    "cargo": cargo,
                                    "abono": abono,
                                    "cfdi": cfdi,
                                }
                            )
                except sqlite3.Error:
                    partidas_por_pol = {i: [] for i in ids}

                for pr in pol_rows:
                    pid = int(pr["id"])
                    lineas = partidas_por_pol.get(pid) or []
                    if not lineas:
                        cur.execute(
                            """
                            SELECT m.id, m.num_cuenta, COALESCE(m.concepto_mov,'') AS concepto_mov,
                                   COALESCE(m.cargo,0) AS cargo, COALESCE(m.abono,0) AS abono
                            FROM movimientos m
                            WHERE m.poliza_id = ?
                            ORDER BY m.id ASC
                            """,
                            (pid,),
                        )
                        for r in cur.fetchall():
                            cargo = float(r["cargo"] or 0)
                            abono = float(r["abono"] or 0)
                            total_cargo += cargo
                            total_abono += abono
                            lineas.append(
                                {
                                    "id_partida": None,
                                    "numero_linea": int(r["id"]),
                                    "num_cuenta": r["num_cuenta"],
                                    "concepto_linea": r["concepto_mov"],
                                    "cargo": cargo,
                                    "abono": abono,
                                    "cfdi": None,
                                }
                            )
                    out_polizas.append(
                        {
                            "poliza_id": pid,
                            "numero_poliza": pr["numero_poliza"],
                            "tipo_poliza": pr["tipo_poliza"],
                            "fecha": pr["fecha"],
                            "concepto": pr["concepto"],
                            "estatus": pr["estatus"],
                            "partidas": lineas,
                            "totales_poliza": {
                                "cargo": sum(x["cargo"] for x in lineas),
                                "abono": sum(x["abono"] for x in lineas),
                            },
                        }
                    )

            return {
                "exito": True,
                "tipo": "libro_diario",
                "fecha_inicio": fecha_ini,
                "fecha_fin": fecha_fin,
                "polizas": out_polizas,
                "totales": {"cargo": total_cargo, "abono": total_abono},
            }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def libro_mayor_cuenta(
        self,
        num_cuenta: str,
        fecha_ini: str,
        fecha_fin: str,
        *,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        cuenta = (num_cuenta or "").strip()
        if not cuenta:
            return {"exito": False, "error": "Indique cuenta"}
        lineas: List[Dict[str, Any]] = []
        saldo = 0.0
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    "SELECT COALESCE(naturaleza,'DEUDORA') FROM catalogo_cuentas WHERE num_cuenta = ? LIMIT 1",
                    (cuenta,),
                )
                row = cur.fetchone()
                naturaleza = (row[0] if row else "DEUDORA") or "DEUDORA"
                natu = str(naturaleza).upper()
                w = self._where_activa(cur)
                cc = ""
                params: List[Any] = [cuenta, fecha_ini, fecha_fin]
                if centro_costo_id is not None:
                    cc = " AND pp.centro_costo_id = ? "
                    params.append(int(centro_costo_id))
                try:
                    cur.execute(
                        f"""
                        SELECT pp.id_partida, p.fecha, p.tipo_poliza, p.numero_poliza, p.concepto AS concepto_poliza,
                               COALESCE(pp.concepto_linea,'') AS concepto_linea,
                               COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                               COALESCE(pp.abono_mn, pp.abono, 0) AS abono,
                               COALESCE(cfp.uuid,'') AS uuid,
                               COALESCE(cfp.rfc_emisor,'') AS rfc_emisor,
                               COALESCE(cfp.rfc_receptor,'') AS rfc_receptor,
                               COALESCE(cfp.subtotal,0) AS subtotal,
                               COALESCE(cfp.iva_trasladado,0) AS iva_trasladado,
                               COALESCE(cfp.total_cfdi,0) AS total_cfdi
                        FROM partidas_poliza pp
                        JOIN polizas p ON p.id = pp.id_poliza
                        LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                        WHERE pp.num_cuenta = ? AND p.fecha BETWEEN ? AND ? {w} {cc}
                        ORDER BY p.fecha ASC, p.numero_poliza ASC, pp.numero_linea ASC, pp.id_partida ASC
                        """,
                        tuple(params),
                    )
                    rows = cur.fetchall()
                except sqlite3.Error:
                    rows = []
                if not rows:
                    cc_m = ""
                    pm: List[Any] = [cuenta, fecha_ini, fecha_fin]
                    if centro_costo_id is not None:
                        cc_m = " AND COALESCE(m.centro_costo_id, -1) = ? "
                        pm.append(int(centro_costo_id))
                    cur.execute(
                        f"""
                        SELECT NULL AS id_partida, p.fecha, p.tipo_poliza, p.numero_poliza, p.concepto AS concepto_poliza,
                               COALESCE(m.concepto_mov,'') AS concepto_linea,
                               COALESCE(m.cargo,0) AS cargo, COALESCE(m.abono,0) AS abono,
                               '' AS uuid, '' AS rfc_emisor, '' AS rfc_receptor,
                               0 AS subtotal, 0 AS iva_trasladado, 0 AS total_cfdi
                        FROM movimientos m
                        JOIN polizas p ON p.id = m.poliza_id
                        WHERE m.num_cuenta = ? AND p.fecha BETWEEN ? AND ? {w} {cc_m}
                        ORDER BY p.fecha ASC, p.numero_poliza ASC, m.id ASC
                        """,
                        tuple(pm),
                    )
                    rows = cur.fetchall()
                for r in rows:
                    cargo = float(r["cargo"] or 0)
                    abono = float(r["abono"] or 0)
                    if natu == "ACREEDORA":
                        saldo += abono - cargo
                    else:
                        saldo += cargo - abono
                    uid = (r["uuid"] or "").strip()
                    cfdi = None
                    if uid:
                        cfdi = {
                            "uuid": uid,
                            "rfc_emisor": r["rfc_emisor"],
                            "rfc_receptor": r["rfc_receptor"],
                            "subtotal": float(r["subtotal"] or 0),
                            "iva_trasladado": float(r["iva_trasladado"] or 0),
                            "total_cfdi": float(r["total_cfdi"] or 0),
                        }
                    lineas.append(
                        {
                            "id_partida": r["id_partida"],
                            "fecha": r["fecha"],
                            "tipo_poliza": r["tipo_poliza"],
                            "numero_poliza": r["numero_poliza"],
                            "concepto_poliza": r["concepto_poliza"],
                            "concepto_linea": r["concepto_linea"],
                            "cargo": cargo,
                            "abono": abono,
                            "saldo": saldo,
                            "cfdi": cfdi,
                        }
                    )
            return {
                "exito": True,
                "tipo": "libro_mayor",
                "num_cuenta": cuenta,
                "naturaleza": naturaleza,
                "fecha_inicio": fecha_ini,
                "fecha_fin": fecha_fin,
                "lineas": lineas,
                "saldo_final": saldo,
            }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def diario_mayor_integrado(
        self,
        fecha_ini: str,
        fecha_fin: str,
        *,
        tipos_poliza: Optional[List[str]] = None,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Libro diario + por cada póliza un resumen del efecto por cuenta (cargos/abonos de esa póliza).
        """
        diario = self.libro_diario(
            fecha_ini, fecha_fin, tipos_poliza=tipos_poliza, centro_costo_id=centro_costo_id
        )
        if not diario.get("exito"):
            return diario
        for p in diario.get("polizas") or []:
            por_cta: Dict[str, Dict[str, float]] = {}
            for ln in p.get("partidas") or []:
                cta = str(ln.get("num_cuenta") or "").strip()
                if not cta:
                    continue
                if cta not in por_cta:
                    por_cta[cta] = {"cargo": 0.0, "abono": 0.0}
                por_cta[cta]["cargo"] += float(ln.get("cargo") or 0)
                por_cta[cta]["abono"] += float(ln.get("abono") or 0)
            p["impacto_por_cuenta"] = [
                {"num_cuenta": k, "cargo": v["cargo"], "abono": v["abono"]}
                for k, v in sorted(por_cta.items())
            ]
        diario["tipo"] = "diario_mayor_integrado"
        return diario

    def cfdi_por_partida(self, id_partida: int) -> Optional[Dict[str, Any]]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT uuid, rfc_emisor, rfc_receptor, fecha_cfdi, subtotal, iva_trasladado,
                           iva_retenido, isr_retenido, total_cfdi, tipo_comprobante
                    FROM cfdi_poliza WHERE id_partida = ?
                    """,
                    (int(id_partida),),
                )
                r = cur.fetchone()
                if not r:
                    return None
                return dict(r)
        except Exception:
            return None
