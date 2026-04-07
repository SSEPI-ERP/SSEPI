"""Idempotencia: evita duplicar pólizas para el mismo id del ERP."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional, Tuple


def _conn(db_path: str) -> sqlite3.Connection:
    return sqlite3.connect(db_path)


def ensure_sync_table(db_path: str) -> None:
    with _conn(db_path) as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS ssepi_erp_sync (
                source TEXT NOT NULL,
                erp_id TEXT NOT NULL,
                poliza_id INTEGER,
                created_at TEXT NOT NULL,
                PRIMARY KEY (source, erp_id)
            )
            """
        )
        c.commit()


def get_synced_poliza_id(db_path: str, source: str, erp_id: str) -> Optional[int]:
    ensure_sync_table(db_path)
    with _conn(db_path) as c:
        row = c.execute(
            "SELECT poliza_id FROM ssepi_erp_sync WHERE source = ? AND erp_id = ?",
            (source, erp_id),
        ).fetchone()
    if not row:
        return None
    return int(row[0]) if row[0] is not None else None


def mark_synced(db_path: str, source: str, erp_id: str, poliza_id: int) -> None:
    ensure_sync_table(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _conn(db_path) as c:
        c.execute(
            """
            INSERT INTO ssepi_erp_sync (source, erp_id, poliza_id, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(source, erp_id) DO UPDATE SET
                poliza_id = excluded.poliza_id,
                created_at = excluded.created_at
            """,
            (source, erp_id, poliza_id, now),
        )
        c.commit()
