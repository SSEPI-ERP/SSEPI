# -*- coding: utf-8 -*-
"""Catálogo de monedas (nombre, símbolo, tipo de cambio, clave fiscal ISO 4217).

En `tipo_cambio` se guarda siempre: MXN por 1 unidad de moneda extranjera (convención «1 = X» del ERP).
No almacenar tasas crudas «unidades extranjeras por 1 USD» sin aplicar la conversión correspondiente.
"""
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

# MXN por 1 unidad de moneda extranjera (regla ERP «1 = X MXN»; no guardar «unidades extranjeras por USD» sin convertir).
TIPOS_CAMBIO_REFERENCIA_MXN: Dict[str, float] = {
    "USD": 17.74,
    "EUR": 20.61,
    "GBP": 23.80,
    "JPY": 0.11,
    "CAD": 12.89,
    "CHF": 22.52,
    "COP": 0.0048,
    "CLP": 0.019,
    "BRL": 3.39,
    "PEN": 5.14,
}


def iso_permitidos_catalogo_tipos_actualizables() -> frozenset[str]:
    """
    Claves ISO que pueden recibir tipo de cambio automático en este proyecto:
    series Banxico (USD/EUR/GBP) y/o publicación Frankfurter/ECB.
    No incluye MXV/XXX (sin TC spot útil como el resto).
    """
    from backend.modules.tipo_cambio_auto import UI_MONEDA_A_ISO
    from backend.modules.tipo_cambio_masivo_frankfurter import ISO_FRANKFURTER_FIJO, monedas_frankfurter_soportadas

    s: Set[str] = set()
    s |= set(monedas_frankfurter_soportadas())
    s |= set(ISO_FRANKFURTER_FIJO)
    s.add("MXN")
    for iso in UI_MONEDA_A_ISO.values():
        if iso:
            s.add(str(iso).strip().upper()[:3])
    for bad in ("MXV", "XXX", ""):
        s.discard(bad)
    return frozenset(s)


def _tc_es_relleno_o_invalido(val: object) -> bool:
    try:
        v = float(val)
    except (TypeError, ValueError):
        return True
    if v <= 0:
        return True
    return 0.9999 <= v <= 1.0001


def _db_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "backend", "database", "contabilidad.db")


class CatalogoMonedas:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or _db_path()
        self._ensure_table()

    def _ensure_table(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS catalogo_monedas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL UNIQUE,
                    simbolo TEXT,
                    tipo_cambio REAL NOT NULL DEFAULT 0,
                    fecha_ultimo_cambio TEXT,
                    clave_fiscal TEXT NOT NULL DEFAULT 'MXN',
                    activa INTEGER NOT NULL DEFAULT 1
                )
                """
            )
            try:
                conn.execute("ALTER TABLE catalogo_monedas ADD COLUMN activa INTEGER NOT NULL DEFAULT 1")
            except sqlite3.OperationalError:
                pass
            # Semilla mínima si está vacío
            cur = conn.execute("SELECT COUNT(*) FROM catalogo_monedas")
            if cur.fetchone()[0] == 0:
                hoy = datetime.now().strftime("%Y-%m-%d")
                usd_tc = float(TIPOS_CAMBIO_REFERENCIA_MXN.get("USD", 1.0))
                conn.execute(
                    """
                    INSERT INTO catalogo_monedas (nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal, activa)
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    ("Pesos Mexicanos", "$", 1.0, hoy, "MXN"),
                )
                conn.execute(
                    """
                    INSERT INTO catalogo_monedas (nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal, activa)
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    ("Dólar Americano", "US", usd_tc, hoy, "USD"),
                )
        self.asegurar_monedas_estandar()

    def asegurar_monedas_estandar(self) -> None:
        """Catálogo acotado a monedas con tipo de cambio actualizable (Banxico en app + Frankfurter)."""
        self.asegurar_catalogo_monedas_completo()

    def asegurar_catalogo_monedas_completo(self) -> None:
        """
        Elimina monedas sin fuente de TC automática y asegura una fila por ISO permitido.
        Tipo de cambio: MXN por 1 unidad; semilla 1.0 salvo TIPOS_CAMBIO_REFERENCIA_MXN.
        """
        from backend.modules.claves_fiscales_iso4217 import CLAVES_FISCALES_MONEDA, codigo_desde_combo

        allowed = iso_permitidos_catalogo_tipos_actualizables()
        hoy = datetime.now().strftime("%Y-%m-%d")
        nombre_por_iso: Dict[str, str] = {}
        for line in CLAVES_FISCALES_MONEDA:
            code = codigo_desde_combo(line)
            if not code:
                continue
            if "=" in line:
                nombre_por_iso[code] = line.split("=", 1)[1].strip()
            else:
                nombre_por_iso[code] = code
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.execute("SELECT id, clave_fiscal FROM catalogo_monedas")
                for rid, clf in cur.fetchall():
                    cf = (clf or "").strip().upper()[:3]
                    if cf not in allowed:
                        conn.execute("DELETE FROM catalogo_monedas WHERE id = ?", (rid,))
                for code in sorted(allowed):
                    cur = conn.execute(
                        "SELECT id FROM catalogo_monedas WHERE UPPER(TRIM(clave_fiscal)) = ?",
                        (code,),
                    )
                    if cur.fetchone():
                        continue
                    nombre = nombre_por_iso.get(code) or f"Moneda {code}"
                    sim = code
                    if code == "MXN":
                        tc = 1.0
                    else:
                        tc = float(TIPOS_CAMBIO_REFERENCIA_MXN.get(code, 1.0))
                    try:
                        conn.execute(
                            """
                            INSERT INTO catalogo_monedas (nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal, activa)
                            VALUES (?, ?, ?, ?, ?, 1)
                            """,
                            (nombre, sim, tc, hoy, code),
                        )
                    except sqlite3.IntegrityError:
                        pass
                conn.commit()
        except Exception:
            pass
        self.corregir_tipos_cambio_relleno_mxn()

    def corregir_tipos_cambio_relleno_mxn(self) -> int:
        """
        Sustituye tipo_cambio ~1.0 o inválido por valores de TIPOS_CAMBIO_REFERENCIA_MXN
        (1 unidad extranjera = X MXN). No pisa tipos ya cargados desde red si son distintos de la semilla.
        """
        hoy = datetime.now().strftime("%Y-%m-%d")
        n = 0
        try:
            with sqlite3.connect(self.db_path) as conn:
                for iso, val in TIPOS_CAMBIO_REFERENCIA_MXN.items():
                    cur = conn.execute(
                        "SELECT id, tipo_cambio FROM catalogo_monedas WHERE UPPER(TRIM(clave_fiscal)) = ?",
                        (iso,),
                    )
                    row = cur.fetchone()
                    if not row:
                        continue
                    if not _tc_es_relleno_o_invalido(row[1]):
                        continue
                    conn.execute(
                        """
                        UPDATE catalogo_monedas
                        SET tipo_cambio = ?, fecha_ultimo_cambio = ?
                        WHERE id = ?
                        """,
                        (float(val), hoy, row[0]),
                    )
                    n += 1
                conn.commit()
        except Exception:
            pass
        return n

    def listar(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal,
                       COALESCE(activa, 1) AS activa
                FROM catalogo_monedas ORDER BY nombre COLLATE NOCASE
                """
            )
            return [dict(r) for r in cur.fetchall()]

    def listar_claves_activas(self) -> List[str]:
        """Claves ISO activas para captura de pólizas y reportes."""
        rows = self.listar()
        active: Set[str] = set()
        for r in rows:
            if int(r.get("activa") or 1) != 1:
                continue
            cf = (r.get("clave_fiscal") or "").strip().upper()[:3]
            if cf:
                active.add(cf)
        if not active:
            return ["MXN", "USD", "EUR", "GBP"]
        rest = sorted(x for x in active if x != "MXN")
        if "MXN" in active:
            return ["MXN"] + rest
        return rest

    def obtener(self, mid: int) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal,
                       COALESCE(activa, 1) AS activa
                FROM catalogo_monedas WHERE id = ?
                """,
                (mid,),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def agregar(
        self,
        nombre: str,
        simbolo: str,
        tipo_cambio: float,
        clave_fiscal: str,
        fecha: Optional[str] = None,
        *,
        activa: bool = True,
    ) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "El nombre es obligatorio."}
        clave_fiscal = (clave_fiscal or "MXN").strip().upper()[:3]
        fecha = fecha or datetime.now().strftime("%Y-%m-%d")
        try:
            tc = float(tipo_cambio)
        except (TypeError, ValueError):
            return {"exito": False, "error": "Tipo de cambio inválido."}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO catalogo_monedas (nombre, simbolo, tipo_cambio, fecha_ultimo_cambio, clave_fiscal, activa)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (nombre, (simbolo or "").strip(), tc, fecha, clave_fiscal, 1 if activa else 0),
                )
            return {"exito": True, "mensaje": "Moneda registrada."}
        except sqlite3.IntegrityError:
            return {"exito": False, "error": "Ya existe una moneda con ese nombre."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def actualizar(
        self,
        mid: int,
        nombre: str,
        simbolo: str,
        tipo_cambio: float,
        clave_fiscal: str,
        fecha: Optional[str] = None,
        *,
        activa: bool = True,
    ) -> Dict[str, Any]:
        nombre = (nombre or "").strip()
        if not nombre:
            return {"exito": False, "error": "El nombre es obligatorio."}
        clave_fiscal = (clave_fiscal or "MXN").strip().upper()[:3]
        fecha = fecha or datetime.now().strftime("%Y-%m-%d")
        try:
            tc = float(tipo_cambio)
        except (TypeError, ValueError):
            return {"exito": False, "error": "Tipo de cambio inválido."}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    UPDATE catalogo_monedas SET nombre = ?, simbolo = ?, tipo_cambio = ?,
                    fecha_ultimo_cambio = ?, clave_fiscal = ?, activa = ? WHERE id = ?
                    """,
                    (nombre, (simbolo or "").strip(), tc, fecha, clave_fiscal, 1 if activa else 0, mid),
                )
            return {"exito": True, "mensaje": "Moneda actualizada."}
        except sqlite3.IntegrityError:
            return {"exito": False, "error": "Ya existe otra moneda con ese nombre."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def eliminar(self, mid: int) -> Dict[str, Any]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM catalogo_monedas WHERE id = ?", (mid,))
            return {"exito": True, "mensaje": "Moneda eliminada."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def actualizar_tc_por_clave_fiscal(
        self,
        clave_iso: str,
        tipo_cambio: float,
        fecha: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Actualiza tipo de cambio y fecha para la fila cuya clave_fiscal coincide (p. ej. USD, EUR, GBP).
        Usado al sincronizar desde Banxico / referencia web para mantener el catálogo alineado al histórico.
        """
        clave_iso = (clave_iso or "").strip().upper()[:3]
        if not clave_iso:
            return {"exito": False, "error": "Clave vacía."}
        if clave_iso == "MXN":
            return {"exito": True, "mensaje": "MXN sin cambio de TC.", "actualizado": False}
        try:
            tc = float(tipo_cambio)
        except (TypeError, ValueError):
            return {"exito": False, "error": "Tipo de cambio inválido."}
        fecha = (fecha or datetime.now().strftime("%Y-%m-%d"))[:10]
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.execute(
                    "SELECT id FROM catalogo_monedas WHERE UPPER(TRIM(clave_fiscal)) = ?",
                    (clave_iso,),
                )
                row = cur.fetchone()
                if row:
                    conn.execute(
                        """
                        UPDATE catalogo_monedas
                        SET tipo_cambio = ?, fecha_ultimo_cambio = ?
                        WHERE id = ?
                        """,
                        (tc, fecha, row[0]),
                    )
                    return {"exito": True, "mensaje": f"TC {clave_iso} actualizado.", "actualizado": True}
                nombres = {
                    "USD": "Dólar Americano",
                    "EUR": "Euro",
                    "GBP": "Libra Esterlina",
                }
                nom = nombres.get(clave_iso)
                if nom:
                    cur = conn.execute(
                        "SELECT id FROM catalogo_monedas WHERE nombre = ? COLLATE NOCASE",
                        (nom,),
                    )
                    row2 = cur.fetchone()
                    if row2:
                        conn.execute(
                            """
                            UPDATE catalogo_monedas
                            SET tipo_cambio = ?, fecha_ultimo_cambio = ?, clave_fiscal = ?
                            WHERE id = ?
                            """,
                            (tc, fecha, clave_iso, row2[0]),
                        )
                        return {"exito": True, "mensaje": f"TC {clave_iso} actualizado.", "actualizado": True}
            return {"exito": False, "error": f"No hay moneda con clave {clave_iso} en el catálogo.", "actualizado": False}
        except Exception as e:
            return {"exito": False, "error": str(e), "actualizado": False}
