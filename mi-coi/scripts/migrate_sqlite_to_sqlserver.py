"""
Migración base SQLite -> SQL Server (Fase 2).

Uso:
  python scripts/migrate_sqlite_to_sqlserver.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import get_db_path
from backend.db.sqlserver_connection import sqlserver_connection


def _exec_script_sqlserver(cur, script_path: str) -> None:
    with open(script_path, "r", encoding="utf-8") as f:
        sql = f.read()
    batches = [b.strip() for b in sql.split("\nGO") if b.strip()]
    for b in batches:
        cur.execute(b)


def _fecha_to_periodo(fecha_txt: str) -> tuple[int, int]:
    dt = datetime.strptime(str(fecha_txt)[:10], "%Y-%m-%d")
    return dt.year, dt.month


def main() -> None:
    sqlite_path = get_db_path()
    if not os.path.isfile(sqlite_path):
        raise SystemExit(f"No existe SQLite: {sqlite_path}")

    migration_sql = os.path.join(ROOT, "backend", "sql", "migrations", "001_sqlserver_core.sql")
    if not os.path.isfile(migration_sql):
        raise SystemExit("No existe migración SQL Server 001.")

    with sqlite3.connect(sqlite_path) as sq, sqlserver_connection(autocommit=False) as ms:
        sq.row_factory = sqlite3.Row
        sqc = sq.cursor()
        msc = ms.cursor()

        _exec_script_sqlserver(msc, migration_sql)

        # Limpieza controlada (idempotente para reintentos).
        for tbl in ("cfdi_poliza", "partidas_poliza", "polizas", "saldos_cuenta", "cuentas", "monedas_catalogo", "tipos_cambio"):
            msc.execute(f"DELETE FROM dbo.{tbl}")

        # Cuentas
        sqc.execute(
            """
            SELECT num_cuenta, nombre_cuenta, nivel, tipo_cuenta, naturaleza, moneda, codigo_agrupador_sat, cuenta_mayor
            FROM catalogo_cuentas
            ORDER BY num_cuenta
            """
        )
        for r in sqc.fetchall():
            tipo = "D" if str(r["tipo_cuenta"] or "").upper() == "DETALLE" else "A"
            nat = "A" if str(r["naturaleza"] or "").upper() == "ACREEDORA" else "D"
            msc.execute(
                """
                INSERT INTO dbo.cuentas
                (num_cuenta, descripcion, nivel, tipo_cuenta, naturaleza, tipo_balance, moneda, codigo_agrupador, cuenta_mayor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    r["num_cuenta"],
                    r["nombre_cuenta"],
                    int(r["nivel"] or 1),
                    tipo,
                    nat,
                    None,
                    (r["moneda"] or "MXN"),
                    r["codigo_agrupador_sat"],
                    r["cuenta_mayor"],
                ),
            )

        # Pólizas
        sqc.execute(
            """
            SELECT id, tipo_poliza, numero_poliza, fecha, concepto, moneda, tipo_cambio, estatus
            FROM polizas
            ORDER BY id
            """
        )
        poliza_map = {}
        for r in sqc.fetchall():
            ej, pe = _fecha_to_periodo(r["fecha"])
            tipo = str(r["tipo_poliza"] or "D").upper()[:1]
            st = str(r["estatus"] or "C").upper()[:1]
            msc.execute(
                """
                INSERT INTO dbo.polizas
                (tipo_poliza, numero_poliza, ejercicio, periodo, fecha_poliza, concepto, id_moneda, tipo_cambio, estatus)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tipo,
                    int(r["numero_poliza"] or 0),
                    ej,
                    pe,
                    r["fecha"],
                    r["concepto"],
                    (r["moneda"] or "MXN"),
                    float(r["tipo_cambio"] or 1.0),
                    st,
                ),
            )
            msc.execute("SELECT SCOPE_IDENTITY()")
            new_id = int(float(msc.fetchone()[0]))
            poliza_map[int(r["id"])] = new_id

        # Partidas
        sqc.execute(
            """
            SELECT id_partida, id_poliza, numero_linea, num_cuenta, concepto_linea, cargo, abono, cargo_mn, abono_mn, cliente_rfc, cliente_nombre
            FROM partidas_poliza
            ORDER BY id_partida
            """
        )
        partida_map = {}
        for r in sqc.fetchall():
            msc.execute(
                """
                INSERT INTO dbo.partidas_poliza
                (id_poliza, numero_linea, num_cuenta, concepto_linea, cargo, abono, cargo_mn, abono_mn, cliente_rfc, cliente_nombre)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    poliza_map[int(r["id_poliza"])],
                    int(r["numero_linea"] or 1),
                    r["num_cuenta"],
                    r["concepto_linea"],
                    float(r["cargo"] or 0),
                    float(r["abono"] or 0),
                    float(r["cargo_mn"] or 0),
                    float(r["abono_mn"] or 0),
                    r["cliente_rfc"],
                    r["cliente_nombre"],
                ),
            )
            msc.execute("SELECT SCOPE_IDENTITY()")
            partida_map[int(r["id_partida"])] = int(float(msc.fetchone()[0]))

        # CFDI
        sqc.execute(
            """
            SELECT id_partida, uuid, rfc_emisor, rfc_receptor, fecha_cfdi, subtotal, iva_trasladado, iva_retenido, isr_retenido, total_cfdi, tipo_comprobante, metodo_pago, forma_pago, xml_raw
            FROM cfdi_poliza
            ORDER BY id_cfdi_poliza
            """
        )
        for r in sqc.fetchall():
            old_partida = int(r["id_partida"])
            if old_partida not in partida_map:
                continue
            msc.execute(
                """
                INSERT INTO dbo.cfdi_poliza
                (id_partida, uuid, rfc_emisor, rfc_receptor, fecha_cfdi, subtotal, iva_trasladado, iva_retenido, isr_retenido, total_cfdi, tipo_comprobante, metodo_pago, forma_pago, xml_raw)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    partida_map[old_partida],
                    r["uuid"],
                    r["rfc_emisor"],
                    r["rfc_receptor"],
                    r["fecha_cfdi"],
                    r["subtotal"],
                    r["iva_trasladado"],
                    r["iva_retenido"],
                    r["isr_retenido"],
                    r["total_cfdi"],
                    r["tipo_comprobante"],
                    r["metodo_pago"],
                    r["forma_pago"],
                    r["xml_raw"],
                ),
            )

        # Saldos
        sqc.execute(
            """
            SELECT num_cuenta, ejercicio, periodo, saldo_inicial_mn, cargos_mn, abonos_mn, saldo_final_mn
            FROM saldos_cuenta
            ORDER BY num_cuenta, ejercicio, periodo
            """
        )
        for r in sqc.fetchall():
            msc.execute(
                """
                INSERT INTO dbo.saldos_cuenta
                (num_cuenta, ejercicio, periodo, saldo_inicial_mn, cargos_mn, abonos_mn, saldo_final_mn)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    r["num_cuenta"],
                    int(r["ejercicio"] or 0),
                    int(r["periodo"] or 0),
                    float(r["saldo_inicial_mn"] or 0),
                    float(r["cargos_mn"] or 0),
                    float(r["abonos_mn"] or 0),
                    float(r["saldo_final_mn"] or 0),
                ),
            )

    print("Migración SQLite -> SQL Server completada.")


if __name__ == "__main__":
    main()

