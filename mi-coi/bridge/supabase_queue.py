"""
Consume trabajos de Supabase (coi_sync_queue) usando SERVICE ROLE.

- La web encola con RLS (authenticated).
- El bridge (service_role) procesa, marca status y escribe en coi_sync_log.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bridge.supabase_log import _credentials  # type: ignore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _request(method: str, path: str, body: Optional[Dict[str, Any]] = None, *, prefer: str = "return=representation") -> Tuple[int, str]:
    url, key = _credentials()
    if not url or not key:
        return 0, "missing_supabase_credentials"
    endpoint = f"{url}/rest/v1/{path.lstrip('/')}"
    data = None if body is None else json.dumps(body, default=str).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(endpoint, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return int(resp.status), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8", errors="replace")
        except Exception:
            msg = str(e)
        return int(e.code), msg
    except Exception as e:
        return 0, str(e)


def fetch_pending(limit: int = 10) -> List[Dict[str, Any]]:
    status, txt = _request("GET", f"coi_sync_queue?status=eq.pending&order=created_at.asc&limit={int(limit)}", None, prefer="")
    if status != 200:
        return []
    try:
        rows = json.loads(txt or "[]")
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def claim_job(job_id: str) -> Optional[Dict[str, Any]]:
    # Claim solo si sigue pending (evita doble proceso)
    payload = {"status": "processing", "last_error": None}
    status, txt = _request(
        "PATCH",
        f"coi_sync_queue?id=eq.{job_id}&status=eq.pending",
        payload,
        prefer="return=representation",
    )
    if status not in (200, 204):
        return None
    if not txt:
        return None
    try:
        rows = json.loads(txt)
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception:
        return None
    return None


def mark_done(job_id: str) -> None:
    _request(
        "PATCH",
        f"coi_sync_queue?id=eq.{job_id}",
        {"status": "done", "processed_at": _now_iso(), "last_error": None},
        prefer="return=minimal",
    )


def mark_error(job_id: str, message: str) -> None:
    _request(
        "PATCH",
        f"coi_sync_queue?id=eq.{job_id}",
        {"status": "error", "processed_at": _now_iso(), "last_error": (message or "")[:2000]},
        prefer="return=minimal",
    )


def heartbeat(*, machine_id: str, user_id: Optional[str] = None, app_version: str = "bridge/1.1") -> None:
    url, key = _credentials()
    if not url or not key:
        return
    body = {
        "machine_id": machine_id,
        "user_id": user_id,
        "app_version": app_version,
        "last_seen": _now_iso(),
        "detail": {"pid": os.getpid()},
    }
    # upsert by unique (machine_id, user_id)
    path = "coi_connection_state?on_conflict=machine_id,user_id"
    _request("POST", path, body, prefer="resolution=merge-duplicates,return=minimal")

