"""
Generación automática de pólizas desde CFDI (COI 11).

Fuente: cfdi_tablero (xml_path) -> parse_cfdi40_xml -> sugerir_movimientos_poliza -> crear y afectar póliza.
El UUID se vincula a una partida vía tabla cfdi_poliza cuando un movimiento incluye campos uuid/*.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, Optional

from config import get_db_path
from backend.modules.cfdi_import_servicio import (
    cargar_mapeo_cuentas,
    parse_cfdi40_xml,
    sugerir_movimientos_poliza,
    validar_cfdi40_estructura,
)
from backend.services.contabilidad_service import ContabilidadService


def _uuid_ya_en_cfdi_poliza(conn: sqlite3.Connection, uuid: str) -> bool:
    u = (uuid or "").strip()[:36]
    if not u:
        return False
    try:
        row = conn.execute("SELECT 1 FROM cfdi_poliza WHERE TRIM(LOWER(uuid)) = TRIM(LOWER(?)) LIMIT 1", (u,)).fetchone()
        return row is not None
    except sqlite3.Error:
        return False


def generar_poliza_desde_cfdi_tablero(
    *,
    cfdi_id: int,
    usuario: str,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    db_path = db_path or get_db_path()
    usuario = (usuario or "Sistema").strip()[:120]
    cfdi_id = int(cfdi_id)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM cfdi_tablero WHERE id = ?", (cfdi_id,)).fetchone()
        if not row:
            return {"exito": False, "error": "CFDI no encontrado."}
        d = dict(row)
        xml_path = (d.get("xml_path") or "").strip()
        if not xml_path or not os.path.isfile(xml_path):
            return {"exito": False, "error": "XML no encontrado en disco."}
        uuid = (d.get("uuid") or "").strip()[:36]
        if _uuid_ya_en_cfdi_poliza(conn, uuid):
            # ya vinculado por UUID a una partida
            conn.execute("UPDATE cfdi_tablero SET en_contabilidad = 1 WHERE id = ?", (cfdi_id,))
            conn.commit()
            return {"exito": True, "mensaje": "Ya estaba contabilizado (UUID ya vinculado).", "uuid": uuid}

    xml_str = open(xml_path, "r", encoding="utf-8").read()
    parsed = parse_cfdi40_xml(xml_str)
    ok, msg = validar_cfdi40_estructura(parsed)
    if not ok:
        return {"exito": False, "error": msg}

    mapeo = cargar_mapeo_cuentas()
    movimientos, tipo_poliza, motivo = sugerir_movimientos_poliza(parsed, mapeo)
    if not movimientos:
        return {"exito": False, "error": f"No hay mapeo para generar póliza ({motivo}). Configure cfdi_mapeo_cuentas.json."}

    fecha = (parsed.get("fecha") or "").strip()[:10]
    if not fecha:
        from datetime import datetime

        fecha = datetime.now().strftime("%Y-%m-%d")

    uuid = (parsed.get("uuid") or "").strip()[:36]
    concepto = f"CFDI {uuid} {parsed.get('rfc_emisor','')}→{parsed.get('rfc_receptor','')}".strip()[:180]

    svc = ContabilidadService(db_path=db_path)
    r = svc.crear_poliza_y_afectar(
        tipo_poliza,
        fecha,
        concepto,
        movimientos,
        moneda=str(parsed.get("moneda") or "MXN").upper()[:3] or "MXN",
        tipo_cambio=1.0,
        usuario=usuario,
    )
    if not r.get("exito"):
        return {"exito": False, "error": r.get("error", "No se pudo crear póliza.")}

    # marcar tablero
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute("UPDATE cfdi_tablero SET en_contabilidad = 1 WHERE id = ?", (cfdi_id,))
            conn.commit()
    except sqlite3.Error:
        pass

    return {
        "exito": True,
        "uuid": uuid,
        "tipo_poliza": tipo_poliza,
        "numero_poliza": r.get("numero_poliza"),
        "poliza_id": r.get("poliza_id"),
        "mensaje": "Póliza generada y afectada.",
    }

