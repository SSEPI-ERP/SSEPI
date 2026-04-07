# backend/models/clientes.py - Catálogo de clientes (RFC) para facturación
import sqlite3
import os
from typing import List, Dict, Any, Optional

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'backend', 'database', 'contabilidad.db'
        )


class CatalogoClientes:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or get_db_path()
        self._crear_tabla()

    def _crear_tabla(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rfc TEXT NOT NULL,
                    razon_social TEXT NOT NULL,
                    uso_cfdi TEXT DEFAULT 'G03',
                    domicilio_fiscal TEXT,
                    codigo_postal TEXT,
                    email TEXT,
                    regimen_fiscal TEXT DEFAULT '601',
                    UNIQUE(rfc)
                )
            """)
            try:
                conn.execute("ALTER TABLE clientes ADD COLUMN regimen_fiscal TEXT DEFAULT '601'")
            except Exception:
                pass
            cur = conn.execute("SELECT COUNT(*) FROM clientes")
            if cur.fetchone()[0] == 0:
                for rfc, razon, uso, cp, regimen in [
                    ("XAXX010101000", "PUBLICO EN GENERAL", "S01", "06300", "616"),
                    ("EKU9003173C9", "ESCUELA KEMPER URGATE S.A. DE C.V.", "G03", "03900", "601"),
                    ("RARF9311211S9", "FRANCISCO SANTIAGO RAMIREZ ROSALES", "G03", "37000", "601"),
                ]:
                    conn.execute("""
                        INSERT OR IGNORE INTO clientes (rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, regimen_fiscal)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (rfc, razon, uso, cp, cp, regimen))
            conn.execute("""
                INSERT OR IGNORE INTO clientes (rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, regimen_fiscal)
                VALUES ('RARF9311211S9', 'FRANCISCO SANTIAGO RAMIREZ ROSALES', 'G03', '37000', '37000', '601')
            """)
            # Asegurar receptor de pruebas (XAXX) con datos correctos para CFDI 4.0 en DEMO.
            conn.execute("""
                INSERT OR IGNORE INTO clientes (rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, regimen_fiscal)
                VALUES ('XAXX010101000', 'PUBLICO EN GENERAL', 'S01', '06300', '06300', '616')
            """)
            conn.execute("""
                UPDATE clientes
                SET razon_social = 'PUBLICO EN GENERAL',
                    uso_cfdi = 'S01',
                    domicilio_fiscal = '06300',
                    codigo_postal = '06300',
                    regimen_fiscal = '616'
                WHERE rfc = 'XAXX010101000'
            """)
            conn.commit()

    def listar(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                "SELECT id, rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, email, COALESCE(regimen_fiscal,'601') as regimen_fiscal FROM clientes ORDER BY razon_social"
            )
            return [dict(row) for row in cur.fetchall()]

    def agregar(self, rfc: str, razon_social: str, uso_cfdi: str = "G03",
                domicilio_fiscal: str = "", codigo_postal: str = "", email: str = "") -> Dict[str, Any]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO clientes (rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, email)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (rfc.strip().upper(), razon_social.strip(), (uso_cfdi or "G03").strip(),
                      (domicilio_fiscal or "").strip(), (codigo_postal or "").strip(), (email or "").strip()))
            return {"exito": True, "mensaje": "Cliente agregado."}
        except sqlite3.IntegrityError:
            return {"exito": False, "error": "Ya existe un cliente con ese RFC."}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def por_rfc(self, rfc: str) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT id, rfc, razon_social, uso_cfdi, domicilio_fiscal, codigo_postal, email, COALESCE(regimen_fiscal,'601') as regimen_fiscal FROM clientes WHERE rfc = ?",
                (rfc.strip().upper(),)
            ).fetchone()
            return dict(row) if row else None

    def listar_para_combo(self) -> List[tuple]:
        """[(rfc, razon_social), ...] para ttk.Combobox."""
        return [(c["rfc"], f"{c['rfc']} - {c['razon_social']}") for c in self.listar()]
