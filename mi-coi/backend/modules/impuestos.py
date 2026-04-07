"""
Reporte de impuestos por periodo (Fase 3 - fiscal/contable).

Fuente principal: cfdi_poliza (UUID -> partida) ligada a partidas_poliza/polizas.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List

from config import get_db_path


class ImpuestosManager:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or get_db_path()

    def _where_estatus_afectadas(self, cur: sqlite3.Cursor) -> str:
        cur.execute("PRAGMA table_info(polizas)")
        cols = [r[1] for r in cur.fetchall()]
        return " AND UPPER(COALESCE(p.estatus,'A')) = 'A' " if "estatus" in cols else ""

    def resumen_periodo(self, ejercicio: int, periodo: int) -> Dict[str, Any]:
        """
        Devuelve resumen fiscal básico (MXN) del periodo.
        - IVA trasladado
        - IVA retenido
        - ISR retenido
        - Subtotal / Total CFDI
        """
        ejercicio = int(ejercicio)
        periodo = int(periodo)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            est = self._where_estatus_afectadas(cur)

            try:
                cur.execute(
                    f"""
                    SELECT
                        COALESCE(SUM(COALESCE(c.subtotal,0)),0) AS subtotal,
                        COALESCE(SUM(COALESCE(c.iva_trasladado,0)),0) AS iva_trasladado,
                        COALESCE(SUM(COALESCE(c.iva_retenido,0)),0) AS iva_retenido,
                        COALESCE(SUM(COALESCE(c.isr_retenido,0)),0) AS isr_retenido,
                        COALESCE(SUM(COALESCE(c.total_cfdi,0)),0) AS total
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE CAST(strftime('%Y', p.fecha) AS INTEGER) = ?
                      AND CAST(strftime('%m', p.fecha) AS INTEGER) = ?
                      {est}
                    """,
                    (ejercicio, periodo),
                )
                row = cur.fetchone() or {}
            except sqlite3.OperationalError:
                # Si no existe cfdi_poliza/partidas_poliza, no hay fuente fiscal.
                row = {}

            return {
                "ejercicio": ejercicio,
                "periodo": periodo,
                "subtotal": float((row["subtotal"] if row and "subtotal" in row.keys() else 0) or 0),
                "iva_trasladado": float((row["iva_trasladado"] if row and "iva_trasladado" in row.keys() else 0) or 0),
                "iva_retenido": float((row["iva_retenido"] if row and "iva_retenido" in row.keys() else 0) or 0),
                "isr_retenido": float((row["isr_retenido"] if row and "isr_retenido" in row.keys() else 0) or 0),
                "total": float((row["total"] if row and "total" in row.keys() else 0) or 0),
            }

    def detalle_por_rfc(self, ejercicio: int, periodo: int, max_rows: int = 500) -> List[Dict[str, Any]]:
        """Detalle agregado por RFC receptor (útil para DIOT/auxiliar fiscal)."""
        ejercicio = int(ejercicio)
        periodo = int(periodo)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            est = self._where_estatus_afectadas(cur)
            try:
                cur.execute(
                    f"""
                    SELECT
                        COALESCE(NULLIF(TRIM(UPPER(c.rfc_receptor)),''),'(SIN RFC)') AS rfc_receptor,
                        COUNT(*) AS cfdi,
                        COALESCE(SUM(COALESCE(c.subtotal,0)),0) AS subtotal,
                        COALESCE(SUM(COALESCE(c.iva_trasladado,0)),0) AS iva_trasladado,
                        COALESCE(SUM(COALESCE(c.iva_retenido,0)),0) AS iva_retenido,
                        COALESCE(SUM(COALESCE(c.isr_retenido,0)),0) AS isr_retenido,
                        COALESCE(SUM(COALESCE(c.total_cfdi,0)),0) AS total
                    FROM cfdi_poliza c
                    INNER JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                    INNER JOIN polizas p ON p.id = pp.id_poliza
                    WHERE CAST(strftime('%Y', p.fecha) AS INTEGER) = ?
                      AND CAST(strftime('%m', p.fecha) AS INTEGER) = ?
                      {est}
                    GROUP BY COALESCE(NULLIF(TRIM(UPPER(c.rfc_receptor)),''),'(SIN RFC)')
                    ORDER BY total DESC
                    LIMIT ?
                    """,
                    (ejercicio, periodo, int(max_rows)),
                )
                return [dict(r) for r in cur.fetchall()]
            except sqlite3.OperationalError:
                return []

