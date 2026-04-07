"""
Valida cuadre contable por periodo en SQL Server.

Uso:
  python scripts/validate_cuadre_sqlserver.py
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.db.sqlserver_connection import sqlserver_connection


def main() -> None:
    with sqlserver_connection(autocommit=False) as conn:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT p.ejercicio, p.periodo,
                   SUM(pp.cargo_mn) AS cargos_mn,
                   SUM(pp.abono_mn) AS abonos_mn
            FROM dbo.polizas p
            INNER JOIN dbo.partidas_poliza pp ON pp.id_poliza = p.id_poliza
            WHERE p.estatus = 'A'
            GROUP BY p.ejercicio, p.periodo
            ORDER BY p.ejercicio, p.periodo
            """
        )
        rows = cur.fetchall()

    if not rows:
        print("Sin pólizas afectadas para validar.")
        return

    print("Validación de cuadre por periodo (estatus='A'):")
    ok_total = True
    for r in rows:
        ej = int(r[0])
        pe = int(r[1])
        cargos = Decimal(str(r[2] or 0))
        abonos = Decimal(str(r[3] or 0))
        diff = cargos - abonos
        ok = abs(diff) <= Decimal("0.01")
        ok_total = ok_total and ok
        estado = "OK" if ok else "ERROR"
        print(f"- {ej:04d}-{pe:02d}: cargos={cargos} abonos={abonos} diff={diff} -> {estado}")

    if not ok_total:
        raise SystemExit("Se detectaron periodos descuadrados.")

    print("Cuadre global correcto.")


if __name__ == "__main__":
    main()

