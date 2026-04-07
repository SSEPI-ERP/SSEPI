"""
DIOT (base funcional).

Fuente: cfdi_poliza ligada a partidas_poliza/polizas (solo pólizas afectadas).
Agrupa por RFC emisor (proveedor) para CFDI "recibidos" (receptor = RFC de la empresa).
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List

from config import get_db_path


class DiotManager:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or get_db_path()

    def _where_estatus_afectadas(self, cur: sqlite3.Cursor) -> str:
        try:
            cur.execute("PRAGMA table_info(polizas)")
            cols = [r[1] for r in cur.fetchall()]
            if "estatus" in cols:
                return "AND UPPER(COALESCE(p.estatus,'A')) = 'A'"
        except sqlite3.Error:
            pass
        return ""

    def _where_periodo(self, cur: sqlite3.Cursor) -> str:
        """
        Compatibilidad: algunas BDs tienen p.ejercicio/p.periodo, otras solo p.fecha.
        Regresa el WHERE (con 2 parámetros: ejercicio, periodo).
        """
        try:
            cur.execute("PRAGMA table_info(polizas)")
            cols = {r[1] for r in cur.fetchall()}
            if "ejercicio" in cols and "periodo" in cols:
                return "p.ejercicio = ? AND p.periodo = ?"
        except sqlite3.Error:
            pass
        # Fallback: usar fecha (YYYY-MM-DD) -> año/mes
        return "CAST(strftime('%Y', p.fecha) AS INTEGER) = ? AND CAST(strftime('%m', p.fecha) AS INTEGER) = ?"

    def resumen_periodo(
        self,
        ejercicio: int,
        periodo: int,
        rfc_empresa: str = "",
        max_rows: int = 2000,
    ) -> List[Dict[str, Any]]:
        """
        Regresa resumen DIOT (proveedores) por periodo:
          rfc_proveedor, cfdi, subtotal, iva_trasladado, iva_retenido, isr_retenido, total
        """
        rfc_empresa = (rfc_empresa or "").strip().upper()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            where_afectadas = self._where_estatus_afectadas(cur)
            where_periodo = self._where_periodo(cur)

            where_rfc = ""
            params: List[Any] = [int(ejercicio), int(periodo)]
            if rfc_empresa:
                where_rfc = "AND UPPER(TRIM(cfp.rfc_receptor)) = ?"
                params.append(rfc_empresa)

            cur.execute(
                f"""
                SELECT
                    TRIM(COALESCE(cfp.rfc_emisor,'')) AS rfc_proveedor,
                    COUNT(1) AS cfdi,
                    SUM(COALESCE(cfp.subtotal,0)) AS subtotal,
                    SUM(COALESCE(cfp.iva_trasladado,0)) AS iva_trasladado,
                    SUM(COALESCE(cfp.iva_retenido,0)) AS iva_retenido,
                    SUM(COALESCE(cfp.isr_retenido,0)) AS isr_retenido,
                    SUM(COALESCE(cfp.total_cfdi,0)) AS total
                FROM polizas p
                JOIN partidas_poliza pp ON pp.id_poliza = p.id
                JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                WHERE {where_periodo}
                  {where_afectadas}
                  {where_rfc}
                GROUP BY TRIM(COALESCE(cfp.rfc_emisor,''))
                ORDER BY total DESC
                LIMIT ?
                """,
                (*params, int(max_rows)),
            )
            return [dict(r) for r in cur.fetchall()]

    def resumen_periodo_por_operacion(
        self,
        ejercicio: int,
        periodo: int,
        *,
        rfc_empresa: str = "",
        max_rows: int = 200000,
    ) -> List[Dict[str, Any]]:
        """
        Resumen DIOT por proveedor + tipo de operación (rubro_diot en catálogo).
        Agrupa por (RFC emisor, rubro_diot).
        """
        rfc_empresa = (rfc_empresa or "").strip().upper()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            where_afectadas = self._where_estatus_afectadas(cur)
            where_periodo = self._where_periodo(cur)

            where_rfc = ""
            params: List[Any] = [int(ejercicio), int(periodo)]
            if rfc_empresa:
                where_rfc = "AND UPPER(TRIM(cfp.rfc_receptor)) = ?"
                params.append(rfc_empresa)

            cur.execute(
                f"""
                SELECT
                    TRIM(COALESCE(cfp.rfc_emisor,'')) AS rfc_proveedor,
                    COALESCE(NULLIF(TRIM(c.rubro_diot),''), '03') AS tipo_operacion,
                    COUNT(1) AS cfdi,
                    SUM(COALESCE(cfp.subtotal,0)) AS subtotal,
                    SUM(COALESCE(cfp.iva_trasladado,0)) AS iva_trasladado,
                    SUM(COALESCE(cfp.iva_retenido,0)) AS iva_retenido,
                    SUM(COALESCE(cfp.isr_retenido,0)) AS isr_retenido,
                    SUM(COALESCE(cfp.total_cfdi,0)) AS total
                FROM polizas p
                JOIN partidas_poliza pp ON pp.id_poliza = p.id
                JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                LEFT JOIN catalogo_cuentas c ON c.num_cuenta = pp.num_cuenta
                WHERE {where_periodo}
                  {where_afectadas}
                  {where_rfc}
                GROUP BY TRIM(COALESCE(cfp.rfc_emisor,'')), COALESCE(NULLIF(TRIM(c.rubro_diot),''), '03')
                ORDER BY total DESC
                LIMIT ?
                """,
                (*params, int(max_rows)),
            )
            return [dict(r) for r in cur.fetchall()]

    def export_layout_txt_2025(
        self,
        ejercicio: int,
        periodo: int,
        *,
        rfc_empresa: str = "",
        output_path: str,
    ) -> Dict[str, Any]:
        """
        Genera archivo .txt separado por pipe '|' en UTF-8 (plataforma DIOT 2025+).

        Implementación: rellena los campos principales (RFC + montos base/IVA) y deja el resto vacío.
        Si un campo no aplica, va vacío pero conserva su pipe. Cada línea siempre tiene 54 campos.
        """
        # Ahora exportamos por proveedor + tipo de operación (varias líneas si hay rubros distintos)
        rows = self.resumen_periodo_por_operacion(int(ejercicio), int(periodo), rfc_empresa=rfc_empresa, max_rows=200000)

        def fmt_int_mxn(val: float) -> str:
            # DIOT batch suele esperar importes sin decimales (centavos truncados/redondeados).
            try:
                return str(int(round(float(val or 0.0), 0)))
            except Exception:
                return "0"

        # Campos (54): usamos un arreglo de 54 strings, llenando algunos por proveedor.
        # Nota: la especificación exacta puede variar por versión del SAT; aquí dejamos vacíos los no soportados.
        lines: list[str] = []
        for r in rows:
            rfc_prov = (r.get("rfc_proveedor") or "").strip().upper()
            tipo_oper = (r.get("tipo_operacion") or "03").strip() or "03"
            subtotal = float(r.get("subtotal") or 0.0)
            iva = float(r.get("iva_trasladado") or 0.0)
            iva_ret = float(r.get("iva_retenido") or 0.0)
            isr_ret = float(r.get("isr_retenido") or 0.0)

            campos = [""] * 54
            campos[0] = "04"
            campos[1] = tipo_oper
            campos[2] = rfc_prov
            # Actos gravados 16% + IVA acreditable vs actos 0%/exento (sin IVA desglosado en agregado)
            if subtotal > 0 and abs(iva) < 0.02:
                campos[7] = fmt_int_mxn(subtotal)
            elif subtotal > 0:
                campos[6] = fmt_int_mxn(subtotal)
                campos[19] = fmt_int_mxn(iva)
            campos[44] = fmt_int_mxn(iva_ret)
            campos[47] = fmt_int_mxn(isr_ret)

            lines.append("|".join(campos) + "|")

        with open(output_path, "w", encoding="utf-8") as f:
            for ln in lines:
                f.write(ln + "\n")

        return {"exito": True, "proveedores": len(rows), "archivo": output_path}

