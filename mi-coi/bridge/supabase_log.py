"""
Registra eventos del bridge en Supabase (tabla coi_sync_log) para la UI online.
Requiere variables de entorno o archivo .env en la raíz de mi-coi:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
Si faltan, se omite el envío (el COI local sigue funcionando).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LOADED_ENV = False


def _load_dotenv_mi_coi() -> None:
    global _LOADED_ENV
    if _LOADED_ENV:
        return
    _LOADED_ENV = True
    path = os.path.join(_ROOT, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except OSError:
        pass


def _credentials() -> tuple[str, str]:
    _load_dotenv_mi_coi()
    try:
        from config import get_instituto_config

        cfg = get_instituto_config() or {}
    except Exception:
        cfg = {}
    url = (os.environ.get("SUPABASE_URL") or str(cfg.get("SUPABASE_URL") or "")).strip().rstrip("/")
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or str(cfg.get("SUPABASE_SERVICE_ROLE_KEY") or "")).strip()
    return url, key


def push_coi_sync_log(
    *,
    source: str,
    row: Dict[str, Any],
    result: Dict[str, Any],
) -> None:
    """Inserta una fila en coi_sync_log. No lanza si falla la red."""
    url, key = _credentials()
    if not url or not key:
        return

    eid = str(row.get("id") or "").strip()
    folio = (row.get("folio") or "") or None
    try:
        monto = float(row.get("total") or 0)
    except (TypeError, ValueError):
        monto = None

    if result.get("ok"):
        if result.get("skipped"):
            status = "skipped"
        else:
            status = "ok"
        err = None
    else:
        status = "error"
        err = str(result.get("error") or result.get("mensaje") or "Error desconocido")[:2000]

    np = result.get("numero_poliza")
    try:
        np = int(np) if np is not None and str(np).strip() != "" else None
    except (TypeError, ValueError):
        np = None

    body = {
        "source": source if source in ("venta", "compra", "nomina", "bancos", "factura") else "venta",
        "erp_id": eid or "unknown",
        "folio": folio,
        "status": status,
        "poliza_id": result.get("poliza_id"),
        "numero_poliza": np,
        "monto": monto,
        "error_message": err,
        "detail": ({ "mensaje": result.get("mensaje") } if result.get("mensaje") else {}),
    }

    endpoint = f"{url}/rest/v1/coi_sync_log"
    data = json.dumps(body, default=str).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            if resp.status >= 300:
                sys.stderr.write(f"[bridge] coi_sync_log HTTP {resp.status}\n")
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            msg = str(e)
        sys.stderr.write(f"[bridge] coi_sync_log error: {e.code} {msg}\n")
    except Exception as e:
        sys.stderr.write(f"[bridge] coi_sync_log: {e}\n")
