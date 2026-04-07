"""
Interfaz base Aspel SAE <-> COI (COI 11).

Este módulo es una implementación "base" para poder probar el flujo UI/BD:
- Generar código de invitación desde COI.
- Conectar una empresa SAE usando ese código (simulación / handshake local).
- Listar empresas integradas y un diario de operaciones descargadas (dummy por ahora).

La sincronización real con SAE requiere su API/servicio (no implementado aquí).
"""

from __future__ import annotations

import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from config import get_db_path


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class SaeInterfacesManager:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sae_invitaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT NOT NULL UNIQUE,
                    creado_en TEXT NOT NULL,
                    creado_por TEXT NOT NULL,
                    expiracion_en TEXT NOT NULL,
                    frecuencia_sync_min INTEGER NOT NULL DEFAULT 60,
                    nombre_empresa_sae TEXT,
                    estatus TEXT NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | CONECTADO | EXPIRADO
                    conectado_en TEXT,
                    conectado_por TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sae_empresas_integradas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invitacion_id INTEGER NOT NULL UNIQUE,
                    token TEXT NOT NULL UNIQUE,
                    nombre_empresa_sae TEXT,
                    frecuencia_sync_min INTEGER NOT NULL DEFAULT 60,
                    estatus TEXT NOT NULL DEFAULT 'CONECTADO', -- CONECTADO | SUSPENDIDO
                    conectado_en TEXT NOT NULL,
                    conectado_por TEXT NOT NULL,
                    FOREIGN KEY(invitacion_id) REFERENCES sae_invitaciones(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sae_diario_operaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    empresa_integrada_id INTEGER NOT NULL,
                    fecha_operacion TEXT NOT NULL,
                    tipo_operacion TEXT NOT NULL,
                    referencia TEXT,
                    monto_mn REAL NOT NULL DEFAULT 0,
                    estatus_contabilizacion TEXT NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | DESCARGADA | CAPTURADA
                    fecha_descarga TEXT,
                    raw_json TEXT,
                    FOREIGN KEY(empresa_integrada_id) REFERENCES sae_empresas_integradas(id) ON DELETE CASCADE
                )
                """
            )
            conn.commit()

    def generar_codigo_invitacion(
        self,
        *,
        creado_por: str = "Sistema",
        frecuencia_sync_min: int = 60,
        expiracion_horas: int = 72,
        nombre_empresa_sae: str = "",
    ) -> Dict[str, Any]:
        frecuencia_sync_min = int(frecuencia_sync_min or 60)
        expiracion_horas = int(expiracion_horas or 72)
        token = secrets.token_urlsafe(20)
        creado_en = _now_str()
        expiracion_en = (datetime.now() + timedelta(hours=expiracion_horas)).strftime("%Y-%m-%d %H:%M:%S")

        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO sae_invitaciones (token, creado_en, creado_por, expiracion_en, frecuencia_sync_min, nombre_empresa_sae, estatus)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE')
                """,
                (token, creado_en, (creado_por or "Sistema")[:120], expiracion_en, frecuencia_sync_min, (nombre_empresa_sae or "")[:200]),
            )
            conn.commit()
        return {"exito": True, "token": token, "expira_en": expiracion_en}

    def conectar_con_codigo(
        self,
        *,
        token: str,
        conectado_por: str = "Usuario",
        nombre_empresa_sae: str = "",
    ) -> Dict[str, Any]:
        token = (token or "").strip()
        if not token:
            return {"exito": False, "error": "Token requerido."}
        conectado_por = (conectado_por or "Usuario").strip()[:120]

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            row = cur.execute("SELECT * FROM sae_invitaciones WHERE token = ?", (token,)).fetchone()
            if not row:
                return {"exito": False, "error": "Invitación no encontrada (token inválido)."}

            expiracion_en = datetime.strptime(row["expiracion_en"], "%Y-%m-%d %H:%M:%S")
            if expiracion_en <= datetime.now():
                return {"exito": False, "error": "Invitación expirada."}
            if row["estatus"] != "PENDIENTE":
                return {"exito": False, "error": f"Invitación con estatus: {row['estatus']}"}

            conectado_en = _now_str()
            cur.execute(
                "UPDATE sae_invitaciones SET estatus='CONECTADO', conectado_en=?, conectado_por=? WHERE id=?",
                (conectado_en, conectado_por, int(row["id"])),
            )
            cur.execute(
                """
                INSERT INTO sae_empresas_integradas (invitacion_id, token, nombre_empresa_sae, frecuencia_sync_min, estatus, conectado_en, conectado_por)
                VALUES (?, ?, ?, ?, 'CONECTADO', ?, ?)
                """,
                (
                    int(row["id"]),
                    token,
                    (nombre_empresa_sae or row["nombre_empresa_sae"] or "").strip()[:200],
                    int(row["frecuencia_sync_min"] or 60),
                    conectado_en,
                    conectado_por,
                ),
            )
            conn.commit()
            emp_id = int(cur.lastrowid or 0)
        return {"exito": True, "empresa_integrada_id": emp_id, "conectado_en": conectado_en}

    def listar_empresas_integradas(self, limit: int = 200) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, token, nombre_empresa_sae, frecuencia_sync_min, estatus, conectado_en, conectado_por
                FROM sae_empresas_integradas
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(limit),),
            )
            return [dict(r) for r in cur.fetchall()]

    def listar_diario_operaciones(self, empresa_integrada_id: int, limit: int = 200) -> List[Dict[str, Any]]:
        empresa_integrada_id = int(empresa_integrada_id)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT id, fecha_operacion, tipo_operacion, referencia, monto_mn, estatus_contabilizacion, fecha_descarga
                FROM sae_diario_operaciones
                WHERE empresa_integrada_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (empresa_integrada_id, int(limit)),
            )
            return [dict(r) for r in cur.fetchall()]

    def descargar_operaciones_manual(self, empresa_integrada_id: int, *, usuario: str = "Sistema", meses: int = 1) -> Dict[str, Any]:
        """
        Stub "descarga manual": inserta operaciones dummy para poder validar UI + flujo.
        """
        empresa_integrada_id = int(empresa_integrada_id)
        meses = max(1, int(meses or 1))
        usuario = (usuario or "Sistema").strip()[:120]

        base_dt = datetime.now().replace(day=1)
        ops_insert = []
        for i in range(min(25, meses * 5)):
            dt = (base_dt.replace(month=max(1, base_dt.month - (i % 3))))  # dummy para variedad
            tipo = "VENTA" if i % 2 == 0 else "COMPRA"
            referencia = f"{tipo}-{dt.strftime('%Y%m%d')}-{i}"
            monto = round(1000.0 + (i * 37.5), 2)
            ops_insert.append(
                (
                    empresa_integrada_id,
                    dt.strftime("%Y-%m-%d"),
                    tipo,
                    referencia,
                    monto,
                    "DESCARGADA",
                    _now_str(),
                    f'{{"dummy": true, "usuario": "{usuario}"}}',
                )
            )

        with sqlite3.connect(self.db_path) as conn:
            conn.executemany(
                """
                INSERT INTO sae_diario_operaciones (
                    empresa_integrada_id, fecha_operacion, tipo_operacion, referencia, monto_mn,
                    estatus_contabilizacion, fecha_descarga, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                ops_insert,
            )
            conn.commit()

        return {"exito": True, "ops_insertadas": len(ops_insert), "mensajes": ["Descarga dummy para UI (pendiente integración real)."]}

