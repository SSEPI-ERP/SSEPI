from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from config import get_db_path


class ConciliacionCFDI:
    """Conciliación CFDI vs pólizas (uuid/montos/estado de vínculo)."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()

    def _existe_tabla(self, cur: sqlite3.Cursor, tabla: str) -> bool:
        cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (tabla,))
        return cur.fetchone() is not None

    def _where_periodo(self, ejercicio: int, periodo: int) -> str:
        # cfdi_tablero guarda fecha_cfdi/fecha_timbrado como texto
        return (
            "CAST(strftime('%Y', substr(COALESCE(NULLIF(fecha_cfdi,''), fecha_timbrado),1,10)) AS INTEGER) = "
            f"{int(ejercicio)} AND "
            "CAST(strftime('%m', substr(COALESCE(NULLIF(fecha_cfdi,''), fecha_timbrado),1,10)) AS INTEGER) = "
            f"{int(periodo)}"
        )

    def resumen_periodo(self, ejercicio: int, periodo: int, *, tolerancia_monto: float = 1.0) -> Dict[str, Any]:
        tolerancia_monto = abs(float(tolerancia_monto or 0.0))
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            if not self._existe_tabla(cur, "cfdi_tablero"):
                return {"exito": False, "error": "No existe cfdi_tablero."}
            if not self._existe_tabla(cur, "cfdi_poliza"):
                return {"exito": False, "error": "No existe cfdi_poliza."}

            wp = self._where_periodo(int(ejercicio), int(periodo))

            # CFDI en tablero (periodo)
            cur.execute(f"SELECT COUNT(*) FROM cfdi_tablero WHERE {wp}")
            total_tablero = int(cur.fetchone()[0] or 0)

            # Vinculados / no vinculados por UUID
            cur.execute(
                f"""
                SELECT
                    SUM(CASE WHEN cfp.uuid IS NOT NULL THEN 1 ELSE 0 END) AS vinculados,
                    SUM(CASE WHEN cfp.uuid IS NULL THEN 1 ELSE 0 END) AS no_vinculados
                FROM cfdi_tablero t
                LEFT JOIN cfdi_poliza cfp
                  ON TRIM(COALESCE(cfp.uuid,'')) = TRIM(COALESCE(t.uuid,''))
                WHERE {wp}
                """
            )
            row = cur.fetchone()
            vinculados = int(row["vinculados"] or 0)
            no_vinculados = int(row["no_vinculados"] or 0)

            # UUID duplicados en tablero
            cur.execute(
                f"""
                SELECT COALESCE(SUM(cnt-1),0) as duplicados
                FROM (
                    SELECT TRIM(COALESCE(uuid,'')) as uuid_key, COUNT(*) as cnt
                    FROM cfdi_tablero
                    WHERE {wp}
                      AND TRIM(COALESCE(uuid,'')) <> ''
                      AND TRIM(COALESCE(uuid,'')) NOT LIKE 'SIN-UUID-%'
                    GROUP BY TRIM(COALESCE(uuid,''))
                    HAVING COUNT(*) > 1
                ) q
                """
            )
            uuid_duplicados = int(cur.fetchone()["duplicados"] or 0)

            # Monto diferente (tabla vs póliza) en vinculados
            cur.execute(
                f"""
                SELECT COUNT(*) as difs
                FROM (
                    SELECT
                        t.uuid,
                        ABS(COALESCE(t.total,0) - COALESCE(cfp.total_cfdi,0)) as dif
                    FROM cfdi_tablero t
                    JOIN cfdi_poliza cfp
                      ON TRIM(COALESCE(cfp.uuid,'')) = TRIM(COALESCE(t.uuid,''))
                    WHERE {wp}
                ) z
                WHERE dif > ?
                """,
                (tolerancia_monto,),
            )
            monto_diferente = int(cur.fetchone()["difs"] or 0)

            # En póliza pero no en tablero (periodo por fecha_cfdi en cfdi_poliza)
            cur.execute(
                """
                SELECT COUNT(*) as faltantes
                FROM cfdi_poliza cfp
                LEFT JOIN cfdi_tablero t ON TRIM(COALESCE(t.uuid,'')) = TRIM(COALESCE(cfp.uuid,''))
                WHERE CAST(strftime('%Y', substr(COALESCE(cfp.fecha_cfdi,''),1,10)) AS INTEGER) = ?
                  AND CAST(strftime('%m', substr(COALESCE(cfp.fecha_cfdi,''),1,10)) AS INTEGER) = ?
                  AND t.id IS NULL
                """,
                (int(ejercicio), int(periodo)),
            )
            en_poliza_no_tablero = int(cur.fetchone()["faltantes"] or 0)

            # Complementos de pago (P) no vinculados
            cur.execute(
                f"""
                SELECT COUNT(*) as c
                FROM cfdi_tablero t
                LEFT JOIN cfdi_poliza cfp ON TRIM(COALESCE(cfp.uuid,'')) = TRIM(COALESCE(t.uuid,''))
                WHERE {wp}
                  AND UPPER(COALESCE(t.tipo_cfdi,'')) = 'P'
                  AND cfp.uuid IS NULL
                """
            )
            complementos_p_no_vinculados = int(cur.fetchone()["c"] or 0)

            # Complementos de pago (P) con monto total <= 0 (incidencia común)
            cur.execute(
                f"""
                SELECT COUNT(*) as c
                FROM cfdi_tablero t
                WHERE {wp}
                  AND UPPER(COALESCE(t.tipo_cfdi,'')) = 'P'
                  AND COALESCE(t.total,0) <= 0
                """
            )
            complementos_p_monto_cero = int(cur.fetchone()["c"] or 0)

            return {
                "exito": True,
                "ejercicio": int(ejercicio),
                "periodo": int(periodo),
                "tolerancia_monto": tolerancia_monto,
                "total_tablero": total_tablero,
                "vinculados": vinculados,
                "no_vinculados": no_vinculados,
                "uuid_duplicados": uuid_duplicados,
                "monto_diferente": monto_diferente,
                "en_poliza_no_tablero": en_poliza_no_tablero,
                "complementos_p_no_vinculados": complementos_p_no_vinculados,
                "complementos_p_monto_cero": complementos_p_monto_cero,
            }

    def detalle_periodo(self, ejercicio: int, periodo: int, *, tolerancia_monto: float = 1.0) -> Dict[str, Any]:
        tolerancia_monto = abs(float(tolerancia_monto or 0.0))
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if not self._existe_tabla(cur, "cfdi_tablero"):
                return {"exito": False, "error": "No existe cfdi_tablero."}
            if not self._existe_tabla(cur, "cfdi_poliza"):
                return {"exito": False, "error": "No existe cfdi_poliza."}

            wp = self._where_periodo(int(ejercicio), int(periodo))

            cur.execute(
                f"""
                SELECT
                    t.id,
                    substr(COALESCE(NULLIF(t.fecha_cfdi,''), t.fecha_timbrado),1,10) as fecha,
                    COALESCE(t.uuid,'') as uuid,
                    COALESCE(t.tipo_cfdi,'') as tipo_cfdi,
                    COALESCE(t.rfc_emisor,'') as rfc_emisor,
                    COALESCE(t.rfc_receptor,'') as rfc_receptor,
                    COALESCE(t.total,0) as total_tablero,
                    COALESCE(cfp.total_cfdi,0) as total_poliza,
                    CASE WHEN cfp.uuid IS NOT NULL THEN 1 ELSE 0 END as vinculado,
                    COALESCE(cfp.tipo_comprobante,'') as tipo_poliza_cfdi,
                    COALESCE(cfp.id_partida,0) as id_partida_vinculada
                FROM cfdi_tablero t
                LEFT JOIN cfdi_poliza cfp
                  ON TRIM(COALESCE(cfp.uuid,'')) = TRIM(COALESCE(t.uuid,''))
                WHERE {wp}
                ORDER BY fecha DESC, t.id DESC
                """
            )
            rows = []
            for r in cur.fetchall():
                total_tab = float(r["total_tablero"] or 0.0)
                total_pol = float(r["total_poliza"] or 0.0)
                dif = total_tab - total_pol
                tipo = (r["tipo_cfdi"] or "").upper().strip()
                estado = "VINCULADO_OK"
                vinculado = int(r["vinculado"] or 0)
                if tipo == "P":
                    tipo_pol = (r["tipo_poliza_cfdi"] or "").upper().strip()
                    if total_tab <= 0:
                        estado = "P_MONTO_CERO"
                    elif vinculado == 0:
                        estado = "P_NO_VINCULADO"
                    elif tipo_pol and tipo_pol != "P":
                        estado = "P_TIPO_MISMATCH"
                    elif abs(dif) > tolerancia_monto:
                        estado = "P_MONTO_DIFERENTE"
                else:
                    if vinculado == 0:
                        estado = "NO_VINCULADO"
                    elif abs(dif) > tolerancia_monto:
                        estado = "MONTO_DIFERENTE"
                rows.append(
                    {
                        "id": int(r["id"]),
                        "fecha": r["fecha"] or "",
                        "uuid": r["uuid"] or "",
                        "tipo_cfdi": r["tipo_cfdi"] or "",
                        "rfc_emisor": r["rfc_emisor"] or "",
                        "rfc_receptor": r["rfc_receptor"] or "",
                        "total_tablero": total_tab,
                        "total_poliza": total_pol,
                        "diferencia": dif,
                        "estado_conciliacion": estado,
                        "id_partida_vinculada": int(r["id_partida_vinculada"] or 0),
                    }
                )
            return {"exito": True, "rows": rows}

    def sugerir_partidas_vinculo(
        self,
        id_cfdi_tablero: int,
        *,
        tolerancia_monto: float = 5.0,
        limit: int = 60,
    ) -> Dict[str, Any]:
        """Sugiere partidas candidatas para vincular UUID desde conciliación."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if not self._existe_tabla(cur, "cfdi_tablero"):
                return {"exito": False, "error": "No existe cfdi_tablero."}
            if not self._existe_tabla(cur, "partidas_poliza"):
                return {"exito": False, "error": "No existe partidas_poliza."}

            cur.execute(
                """
                SELECT id, uuid, fecha_cfdi, fecha_timbrado, rfc_emisor, rfc_receptor, total
                FROM cfdi_tablero
                WHERE id = ?
                """,
                (int(id_cfdi_tablero),),
            )
            cfdi = cur.fetchone()
            if not cfdi:
                return {"exito": False, "error": "CFDI no encontrado."}

            uuid = (cfdi["uuid"] or "").strip()
            if not uuid:
                return {"exito": False, "error": "El CFDI no tiene UUID."}
            total = float(cfdi["total"] or 0.0)
            fecha = (cfdi["fecha_cfdi"] or cfdi["fecha_timbrado"] or "")[:10]
            rfc_emisor = (cfdi["rfc_emisor"] or "").strip().upper()
            rfc_receptor = (cfdi["rfc_receptor"] or "").strip().upper()
            tol = abs(float(tolerancia_monto or 0.0))

            cur.execute("SELECT 1 FROM cfdi_poliza WHERE TRIM(COALESCE(uuid,'')) = ? LIMIT 1", (uuid,))
            if cur.fetchone():
                return {"exito": False, "error": f"UUID ya vinculado: {uuid}"}

            sql = """
                SELECT
                    pp.id_partida,
                    pp.id_poliza,
                    p.numero_poliza,
                    p.tipo_poliza,
                    p.fecha,
                    pp.numero_linea,
                    COALESCE(pp.num_cuenta,'') AS num_cuenta,
                    COALESCE(pp.concepto_linea,'') AS concepto_linea,
                    COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo_ref,
                    COALESCE(pp.abono_mn, pp.abono, 0) AS abono_ref,
                    COALESCE(pp.cliente_rfc,'') AS cliente_rfc,
                    CASE
                        WHEN ABS(COALESCE(pp.cargo_mn, pp.cargo, 0) - ?) < ABS(COALESCE(pp.abono_mn, pp.abono, 0) - ?)
                        THEN ABS(COALESCE(pp.cargo_mn, pp.cargo, 0) - ?)
                        ELSE ABS(COALESCE(pp.abono_mn, pp.abono, 0) - ?)
                    END AS dif_monto,
                    CASE
                        WHEN UPPER(TRIM(COALESCE(pp.cliente_rfc,''))) IN (?, ?) THEN 1
                        ELSE 0
                    END AS match_rfc
                FROM partidas_poliza pp
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                WHERE cfp.id_cfdi_poliza IS NULL
                  AND ABS(
                    CASE
                        WHEN ABS(COALESCE(pp.cargo_mn, pp.cargo, 0) - ?) < ABS(COALESCE(pp.abono_mn, pp.abono, 0) - ?)
                        THEN COALESCE(pp.cargo_mn, pp.cargo, 0) - ?
                        ELSE COALESCE(pp.abono_mn, pp.abono, 0) - ?
                    END
                  ) <= ?
            """
            params: List[Any] = [
                total, total, total, total,
                rfc_emisor, rfc_receptor,
                total, total, total, total,
                max(tol, 0.01),
            ]
            if fecha:
                sql += " AND substr(COALESCE(p.fecha,''),1,7) = substr(?,1,7) "
                params.append(fecha)
            sql += " ORDER BY match_rfc DESC, dif_monto ASC, p.fecha DESC, pp.id_partida DESC LIMIT ? "
            params.append(int(max(1, min(int(limit or 60), 200))))
            cur.execute(sql, params)

            out: List[Dict[str, Any]] = []
            for r in cur.fetchall():
                cargo_ref = float(r["cargo_ref"] or 0.0)
                abono_ref = float(r["abono_ref"] or 0.0)
                importe_ref = cargo_ref if abs(cargo_ref - total) <= abs(abono_ref - total) else abono_ref
                out.append(
                    {
                        "id_partida": int(r["id_partida"]),
                        "id_poliza": int(r["id_poliza"]),
                        "numero_poliza": int(r["numero_poliza"] or 0),
                        "tipo_poliza": r["tipo_poliza"] or "",
                        "fecha_poliza": r["fecha"] or "",
                        "numero_linea": int(r["numero_linea"] or 0),
                        "num_cuenta": r["num_cuenta"] or "",
                        "concepto_linea": r["concepto_linea"] or "",
                        "cliente_rfc": r["cliente_rfc"] or "",
                        "importe_referencia": float(importe_ref),
                        "diferencia_abs": float(r["dif_monto"] or 0.0),
                        "match_rfc": int(r["match_rfc"] or 0),
                    }
                )
            return {
                "exito": True,
                "cfdi": {
                    "id": int(cfdi["id"]),
                    "uuid": uuid,
                    "fecha": fecha,
                    "total": total,
                    "rfc_emisor": rfc_emisor,
                    "rfc_receptor": rfc_receptor,
                },
                "rows": out,
            }

    def vincular_uuid_a_partida(self, id_cfdi_tablero: int, id_partida: int) -> Dict[str, Any]:
        """Vincula CFDI del tablero a una partida específica."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if not self._existe_tabla(cur, "cfdi_tablero") or not self._existe_tabla(cur, "cfdi_poliza"):
                return {"exito": False, "error": "Faltan tablas requeridas para vincular CFDI."}
            cur.execute(
                """
                SELECT id, uuid, fecha_cfdi, rfc_emisor, rfc_receptor, subtotal, total, tipo_cfdi
                FROM cfdi_tablero WHERE id = ?
                """,
                (int(id_cfdi_tablero),),
            )
            t = cur.fetchone()
            if not t:
                return {"exito": False, "error": "CFDI no encontrado."}
            uuid = (t["uuid"] or "").strip()
            if not uuid:
                return {"exito": False, "error": "CFDI sin UUID."}
            cur.execute("SELECT 1 FROM partidas_poliza WHERE id_partida = ? LIMIT 1", (int(id_partida),))
            if not cur.fetchone():
                return {"exito": False, "error": "Partida no existe."}
            cur.execute("SELECT 1 FROM cfdi_poliza WHERE TRIM(COALESCE(uuid,'')) = ? LIMIT 1", (uuid,))
            if cur.fetchone():
                return {"exito": False, "error": f"UUID duplicado: {uuid}"}

            cur.execute(
                """
                INSERT INTO cfdi_poliza
                (id_partida, uuid, rfc_emisor, rfc_receptor, fecha_cfdi, subtotal, iva_trasladado, iva_retenido, isr_retenido, total_cfdi, tipo_comprobante, metodo_pago, forma_pago, xml_raw)
                VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, '', '', '')
                """,
                (
                    int(id_partida),
                    uuid,
                    t["rfc_emisor"],
                    t["rfc_receptor"],
                    t["fecha_cfdi"],
                    float(t["subtotal"] or 0.0),
                    float(t["total"] or 0.0),
                    t["tipo_cfdi"],
                ),
            )
            conn.commit()
            return {"exito": True, "mensaje": "UUID vinculado a partida", "uuid": uuid, "id_partida": int(id_partida)}

