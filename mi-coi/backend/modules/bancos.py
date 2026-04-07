import os
import sqlite3
from typing import Dict, List, Optional, Tuple

import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, "backend", "database", "contabilidad.db")


class SistemaBancos:
    """Catálogo interno de bancos para usar en transacciones."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path if db_path else get_db_path()
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._crear_tabla()

    def _crear_tabla(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS bancos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre_banco TEXT NOT NULL,
                    alias TEXT,
                    numero_cuenta TEXT NOT NULL,
                    clabe TEXT,
                    moneda TEXT NOT NULL DEFAULT 'MXN',
                    saldo_inicial REAL NOT NULL DEFAULT 0,
                    cuenta_contable TEXT,
                    activo INTEGER NOT NULL DEFAULT 1,
                    creado_en TEXT DEFAULT (datetime('now', 'localtime')),
                    actualizado_en TEXT DEFAULT (datetime('now', 'localtime'))
                )
                """
            )
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_bancos_numero_cuenta ON bancos(numero_cuenta)")
            conn.commit()

    def obtener_bancos(self, solo_activos: bool = False) -> List[Dict]:
        query = """
            SELECT id, nombre_banco, COALESCE(alias, ''), numero_cuenta, COALESCE(clabe, ''),
                   moneda, saldo_inicial, COALESCE(cuenta_contable, ''), activo
            FROM bancos
        """
        params: Tuple = tuple()
        if solo_activos:
            query += " WHERE activo = 1"
        query += " ORDER BY nombre_banco, numero_cuenta"
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(query, params)
            rows = cur.fetchall()
        out = []
        for r in rows:
            out.append(
                {
                    "id": r[0],
                    "nombre_banco": r[1],
                    "alias": r[2],
                    "numero_cuenta": r[3],
                    "clabe": r[4],
                    "moneda": r[5],
                    "saldo_inicial": float(r[6] or 0),
                    "cuenta_contable": r[7],
                    "activo": bool(r[8]),
                }
            )
        return out

    def obtener_banco(self, banco_id: int) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, nombre_banco, COALESCE(alias, ''), numero_cuenta, COALESCE(clabe, ''),
                       moneda, saldo_inicial, COALESCE(cuenta_contable, ''), activo
                FROM bancos WHERE id = ?
                """,
                (banco_id,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "nombre_banco": row[1],
            "alias": row[2],
            "numero_cuenta": row[3],
            "clabe": row[4],
            "moneda": row[5],
            "saldo_inicial": float(row[6] or 0),
            "cuenta_contable": row[7],
            "activo": bool(row[8]),
        }

    def agregar_banco(self, datos: Dict) -> Tuple[bool, str]:
        nombre = (datos.get("nombre_banco") or "").strip()
        numero = (datos.get("numero_cuenta") or "").strip()
        if not nombre:
            return False, "El nombre del banco es obligatorio."
        if not numero:
            return False, "El número de cuenta es obligatorio."
        moneda = (datos.get("moneda") or "MXN").strip().upper()
        if moneda not in ("MXN", "USD", "EUR", "GBP"):
            moneda = "MXN"
        try:
            saldo = float(datos.get("saldo_inicial") or 0)
        except (TypeError, ValueError):
            return False, "Saldo inicial inválido."

        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO bancos (
                        nombre_banco, alias, numero_cuenta, clabe, moneda,
                        saldo_inicial, cuenta_contable, activo, actualizado_en
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
                    """,
                    (
                        nombre,
                        (datos.get("alias") or "").strip(),
                        numero,
                        (datos.get("clabe") or "").strip(),
                        moneda,
                        saldo,
                        (datos.get("cuenta_contable") or "").strip(),
                        1 if datos.get("activo", True) else 0,
                    ),
                )
                conn.commit()
            return True, "Banco agregado correctamente."
        except sqlite3.IntegrityError:
            return False, "Ese número de cuenta ya existe."
        except Exception as e:
            return False, f"Error al agregar banco: {e}"

    def actualizar_banco(self, banco_id: int, datos: Dict) -> Tuple[bool, str]:
        banco_id = int(banco_id)
        nombre = (datos.get("nombre_banco") or "").strip()
        numero = (datos.get("numero_cuenta") or "").strip()
        if not nombre:
            return False, "El nombre del banco es obligatorio."
        if not numero:
            return False, "El número de cuenta es obligatorio."
        moneda = (datos.get("moneda") or "MXN").strip().upper()
        if moneda not in ("MXN", "USD", "EUR", "GBP"):
            moneda = "MXN"
        try:
            saldo = float(datos.get("saldo_inicial") or 0)
        except (TypeError, ValueError):
            return False, "Saldo inicial inválido."
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    UPDATE bancos
                    SET nombre_banco = ?, alias = ?, numero_cuenta = ?, clabe = ?, moneda = ?,
                        saldo_inicial = ?, cuenta_contable = ?, activo = ?,
                        actualizado_en = datetime('now', 'localtime')
                    WHERE id = ?
                    """,
                    (
                        nombre,
                        (datos.get("alias") or "").strip(),
                        numero,
                        (datos.get("clabe") or "").strip(),
                        moneda,
                        saldo,
                        (datos.get("cuenta_contable") or "").strip(),
                        1 if datos.get("activo", True) else 0,
                        banco_id,
                    ),
                )
                conn.commit()
                if cur.rowcount == 0:
                    return False, "El banco no existe."
            return True, "Banco actualizado correctamente."
        except sqlite3.IntegrityError:
            return False, "Ese número de cuenta ya existe."
        except Exception as e:
            return False, f"Error al actualizar banco: {e}"

    def eliminar_banco(self, banco_id: int) -> Tuple[bool, str]:
        banco_id = int(banco_id)
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute("DELETE FROM bancos WHERE id = ?", (banco_id,))
                conn.commit()
                if cur.rowcount == 0:
                    return False, "El banco no existe."
            return True, "Banco eliminado."
        except Exception as e:
            return False, f"No se pudo eliminar: {e}"

    def obtener_cuentas_contables_bancos(self) -> List[str]:
        """Sugiere cuentas contables de bancos (102.x y 101.x)."""
        out: List[str] = []
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT num_cuenta, nombre_cuenta
                    FROM catalogo_cuentas
                    WHERE num_cuenta LIKE '102%' OR num_cuenta LIKE '101%'
                    ORDER BY num_cuenta
                    """
                )
                for num, nom in cur.fetchall():
                    out.append(f"{num} - {nom}")
        except Exception:
            pass
        return out
