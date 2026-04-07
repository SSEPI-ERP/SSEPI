"""
Servicio interno CFDI (COI 11): cola persistente, bitácora y reintentos.

Las ventanas de hasta 4 meses y el tope de 5 años reutilizan la lógica de
cfdi_descarga_interna; la ejecución sigue siendo indexación desde carpeta XML
hasta conectar un conector real al SAT.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import get_db_path

from backend.modules.cfdi_dashboard import CFDIDashboard
from backend.modules.cfdi_descarga_interna import plan_ventanas_4_meses, validar_rango_5_anios


def _ensure_tables(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS cfdi_si_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                default_carpeta_xml TEXT DEFAULT '',
                fiel_cer_path TEXT DEFAULT '',
                fiel_key_path TEXT DEFAULT '',
                notas TEXT DEFAULT '',
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS cfdi_si_job (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lote_id TEXT NOT NULL,
                ventana_desde TEXT NOT NULL,
                ventana_hasta TEXT NOT NULL,
                carpeta_xml TEXT NOT NULL,
                copiar_facturas INTEGER DEFAULT 0,
                recursive INTEGER DEFAULT 1,
                proveedor TEXT DEFAULT 'SERVICIO_INTERNO',
                estatus TEXT DEFAULT 'PENDIENTE',
                intentos INTEGER DEFAULT 0,
                max_intentos INTEGER DEFAULT 3,
                mensaje TEXT DEFAULT '',
                stats_json TEXT DEFAULT '',
                creado_en TEXT DEFAULT (datetime('now', 'localtime')),
                procesado_en TEXT,
                usuario TEXT DEFAULT ''
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cfdi_si_job_estatus ON cfdi_si_job(estatus)")
        cur.execute("INSERT OR IGNORE INTO cfdi_si_config (id) VALUES (1)")
        conn.commit()


def obtener_config_si(db_path: Optional[str] = None) -> Dict[str, str]:
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM cfdi_si_config WHERE id = 1")
        row = cur.fetchone()
        if not row:
            return {
                "default_carpeta_xml": "",
                "fiel_cer_path": "",
                "fiel_key_path": "",
                "notas": "",
            }
        d = dict(row)
        return {
            "default_carpeta_xml": (d.get("default_carpeta_xml") or "").strip(),
            "fiel_cer_path": (d.get("fiel_cer_path") or "").strip(),
            "fiel_key_path": (d.get("fiel_key_path") or "").strip(),
            "notas": (d.get("notas") or "").strip(),
        }


def guardar_config_si(
    *,
    db_path: Optional[str] = None,
    default_carpeta_xml: str = "",
    fiel_cer_path: str = "",
    fiel_key_path: str = "",
    notas: str = "",
) -> None:
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE cfdi_si_config SET
                default_carpeta_xml = ?,
                fiel_cer_path = ?,
                fiel_key_path = ?,
                notas = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = 1
            """,
            (
                (default_carpeta_xml or "").strip(),
                (fiel_cer_path or "").strip(),
                (fiel_key_path or "").strip(),
                (notas or "").strip(),
            ),
        )
        conn.commit()


def solicitar_lote(
    *,
    db_path: Optional[str] = None,
    desde_ymd: str,
    hasta_ymd: str,
    carpeta_xml: str,
    usuario: str = "",
    copiar_facturas: bool = False,
    recursive: bool = True,
    proveedor: str = "SERVICIO_INTERNO",
) -> Dict[str, Any]:
    """Parte el rango en ventanas <=4 meses y crea un trabajo por ventana."""
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    err = validar_rango_5_anios(desde_ymd, hasta_ymd)
    if err:
        return {"exito": False, "error": err}
    ventanas = plan_ventanas_4_meses(desde_ymd, hasta_ymd)
    if not ventanas:
        return {"exito": False, "error": "Rango sin ventanas válidas."}
    carpeta = (carpeta_xml or "").strip()
    if not carpeta:
        return {"exito": False, "error": "Indique la carpeta XML."}
    lote_id = uuid.uuid4().hex[:12]
    dash = CFDIDashboard(db_path=db_path)
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        for d0, d1 in ventanas:
            cur.execute(
                """
                INSERT INTO cfdi_si_job (
                    lote_id, ventana_desde, ventana_hasta, carpeta_xml,
                    copiar_facturas, recursive, proveedor, estatus, usuario
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
                """,
                (
                    lote_id,
                    d0,
                    d1,
                    carpeta,
                    1 if copiar_facturas else 0,
                    1 if recursive else 0,
                    proveedor,
                    (usuario or "").strip(),
                ),
            )
        conn.commit()
    dash.guardar_evento_diario(
        "SERVICIO_INTERNO",
        "INFO",
        f"Lote {lote_id}: {len(ventanas)} ventana(s) encolada(s) ({desde_ymd} → {hasta_ymd}).",
        lote_id,
    )
    return {"exito": True, "lote_id": lote_id, "ventanas": len(ventanas), "detalle_ventanas": ventanas}


def listar_trabajos_si(*, db_path: Optional[str] = None, limit: int = 80) -> List[Dict[str, Any]]:
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, lote_id, ventana_desde, ventana_hasta, estatus, intentos, max_intentos,
                   mensaje, creado_en, procesado_en, usuario, carpeta_xml
            FROM cfdi_si_job
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(r) for r in cur.fetchall()]


def reintentar_trabajo(*, db_path: Optional[str] = None, job_id: int) -> Dict[str, Any]:
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, estatus FROM cfdi_si_job WHERE id = ?", (job_id,))
        row = cur.fetchone()
        if not row:
            return {"exito": False, "error": "Trabajo no encontrado."}
        if row[1] != "ERROR":
            return {"exito": False, "error": "Solo se reencolan trabajos en ERROR."}
        cur.execute(
            """
            UPDATE cfdi_si_job SET estatus = 'PENDIENTE', mensaje = '', procesado_en = NULL
            WHERE id = ?
            """,
            (job_id,),
        )
        conn.commit()
    dash = CFDIDashboard(db_path=db_path)
    dash.guardar_evento_diario("SERVICIO_INTERNO", "INFO", f"Trabajo #{job_id} reencolado manualmente.", str(job_id))
    return {"exito": True}


def procesar_cola_si(
    *,
    db_path: Optional[str] = None,
    max_trabajos: int = 30,
) -> Dict[str, Any]:
    """Procesa trabajos PENDIENTE; en fallo reintenta hasta max_intentos por fila."""
    db_path = db_path or get_db_path()
    _ensure_tables(db_path)
    dash = CFDIDashboard(db_path=db_path)
    resumen = {"procesados": 0, "ok": 0, "error": 0, "omitidos": 0, "detalle": []}

    for _ in range(max_trabajos):
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT * FROM cfdi_si_job
                WHERE estatus = 'PENDIENTE'
                ORDER BY id ASC
                LIMIT 1
                """
            )
            job = cur.fetchone()
            if not job:
                break
            jid = job["id"]
            cur.execute("UPDATE cfdi_si_job SET estatus = 'PROCESANDO' WHERE id = ? AND estatus = 'PENDIENTE'", (jid,))
            if cur.rowcount != 1:
                conn.commit()
                resumen["omitidos"] += 1
                continue
            conn.commit()
            job = dict(job)

        r = dash.indexar_carpeta_externa_por_rango(
            job["carpeta_xml"],
            desde_ymd=job["ventana_desde"],
            hasta_ymd=job["ventana_hasta"],
            proveedor=job.get("proveedor") or "SERVICIO_INTERNO",
            recursive=bool(job.get("recursive")),
            copiar_a_facturas=bool(job.get("copiar_facturas")),
        )
        resumen["procesados"] += 1
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        stats = {
            "leidos": r.get("leidos", 0),
            "considerados": r.get("considerados", 0),
            "insertados": r.get("insertados", 0),
            "actualizados": r.get("actualizados", 0),
            "errores": r.get("errores", 0),
            "uuid_en_poliza": r.get("uuid_en_poliza", 0),
        }

        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            if r.get("exito"):
                cur.execute(
                    """
                    UPDATE cfdi_si_job SET
                        estatus = 'OK',
                        intentos = intentos + 1,
                        mensaje = '',
                        stats_json = ?,
                        procesado_en = ?
                    WHERE id = ?
                    """,
                    (json.dumps(stats, ensure_ascii=False), ahora, jid),
                )
                conn.commit()
                resumen["ok"] += 1
                resumen["detalle"].append({"id": jid, "estatus": "OK", "stats": stats})
                dash.guardar_evento_diario(
                    "SERVICIO_INTERNO",
                    "INFO",
                    f"Job #{jid} OK ventana {job['ventana_desde']}–{job['ventana_hasta']}: "
                    f"+{stats['insertados']} ins, {stats['actualizados']} act.",
                    str(jid),
                )
            else:
                msg = (r.get("error") or "Error desconocido")[:500]
                intentos_nuevos = int(job.get("intentos") or 0) + 1
                max_i = int(job.get("max_intentos") or 3)
                if intentos_nuevos < max_i:
                    cur.execute(
                        """
                        UPDATE cfdi_si_job SET
                            estatus = 'PENDIENTE',
                            intentos = ?,
                            mensaje = ?,
                            procesado_en = NULL
                        WHERE id = ?
                        """,
                        (intentos_nuevos, msg, jid),
                    )
                    conn.commit()
                    resumen["detalle"].append({"id": jid, "estatus": "REINTENTO", "mensaje": msg})
                    dash.guardar_evento_diario(
                        "SERVICIO_INTERNO",
                        "WARN",
                        f"Job #{jid} falló (reintento {intentos_nuevos}/{max_i}): {msg}",
                        str(jid),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE cfdi_si_job SET
                            estatus = 'ERROR',
                            intentos = ?,
                            mensaje = ?,
                            stats_json = ?,
                            procesado_en = ?
                        WHERE id = ?
                        """,
                        (intentos_nuevos, msg, json.dumps(stats, ensure_ascii=False), ahora, jid),
                    )
                    conn.commit()
                    resumen["error"] += 1
                    resumen["detalle"].append({"id": jid, "estatus": "ERROR", "mensaje": msg})
                    dash.guardar_evento_diario(
                        "SERVICIO_INTERNO",
                        "ERROR",
                        f"Job #{jid} ERROR definitivo: {msg}",
                        str(jid),
                    )

    return resumen
