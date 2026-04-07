#!/usr/bin/env python3
"""
Servidor HTTP local (127.0.0.1) para recibir ventas/compras del ERP y crear pólizas en COI.

Uso (desde la carpeta mi-coi):
  python -m bridge.bridge_server

Variables opcionales:
  SSEPI_COI_BRIDGE_PORT  (default 8765)
  SSEPI_COI_BRIDGE_KEY   (si coincide, el cliente debe enviar header X-SSEPI-COI-KEY)
También: bridge_api_key en config_instituto.json
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import config  # noqa: F401, E402  — configura sys.path para backend

from bridge.poliza_mapper import ingest_bancos, ingest_compra, ingest_factura, ingest_nomina, ingest_venta
from bridge.supabase_log import push_coi_sync_log
from bridge.supabase_queue import claim_job, fetch_pending, heartbeat, mark_done, mark_error


def _bridge_key() -> str:
    k = os.environ.get("SSEPI_COI_BRIDGE_KEY", "").strip()
    if k:
        return k
    try:
        from config import get_instituto_config

        cfg = get_instituto_config() or {}
        return str(cfg.get("bridge_api_key") or "").strip()
    except Exception:
        return ""


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SSEPICOI-Bridge/1.0"

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-SSEPI-COI-KEY")

    def _auth_ok(self) -> bool:
        expected = _bridge_key()
        if not expected:
            return True
        got = (self.headers.get("X-SSEPI-COI-KEY") or "").strip()
        return got == expected

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/health":
            self.send_error(404, "Not Found")
            return
        if not self._auth_ok():
            self.send_response(401)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            b = b'{"ok":false,"error":"Unauthorized"}'
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        body = json.dumps({"ok": True, "service": "ssepi-coi-bridge"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if not self._auth_ok():
            b = json.dumps({"ok": False, "error": "Unauthorized"}, ensure_ascii=False).encode("utf-8")
            self.send_response(401)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return

        parsed = urlparse(self.path)
        try:
            ln = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            ln = 0
        raw = self.rfile.read(ln) if ln > 0 else b"{}"
        try:
            row = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            row = {}

        if parsed.path == "/ingest/venta":
            result = ingest_venta(row)
            push_coi_sync_log(source="venta", row=row, result=result)
        elif parsed.path == "/ingest/compra":
            result = ingest_compra(row)
            push_coi_sync_log(source="compra", row=row, result=result)
        else:
            self.send_error(404, "Not Found")
            return

        code = 200 if result.get("ok") else 400
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))


def main() -> None:
    host = "127.0.0.1"
    port = int(os.environ.get("SSEPI_COI_BRIDGE_PORT", "8765"))

    def _machine_id() -> str:
        return (os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "pc").strip() or "pc"

    def _queue_worker() -> None:
        mid = _machine_id()
        last_hb = 0.0
        while True:
            try:
                now = time.time()
                if now - last_hb > 25:
                    heartbeat(machine_id=mid)
                    last_hb = now

                for job in fetch_pending(limit=10):
                    jid = str(job.get("id") or "").strip()
                    if not jid:
                        continue
                    claimed = claim_job(jid)
                    if not claimed:
                        continue
                    src = (claimed.get("erp_source") or "").strip().lower()
                    payload = claimed.get("payload_json") or {}
                    if not isinstance(payload, dict):
                        payload = {}

                    if src == "venta":
                        result = ingest_venta(payload)
                        push_coi_sync_log(source="venta", row=payload, result=result)
                    elif src == "compra":
                        result = ingest_compra(payload)
                        push_coi_sync_log(source="compra", row=payload, result=result)
                    elif src == "factura":
                        result = ingest_factura(payload)
                        push_coi_sync_log(source="factura", row=payload, result=result)
                    elif src == "nomina":
                        result = ingest_nomina(payload)
                        push_coi_sync_log(source="nomina", row=payload, result=result)
                    elif src == "bancos":
                        result = ingest_bancos(payload)
                        push_coi_sync_log(source="bancos", row=payload, result=result)
                    else:
                        result = {"ok": False, "error": f"Fuente no soportada: {src or 'desconocida'}"}

                    if result.get("ok"):
                        mark_done(jid)
                    else:
                        mark_error(jid, str(result.get("error") or result.get("mensaje") or "Error"))
                time.sleep(2.0)
            except Exception as e:
                sys.stderr.write(f"[bridge] queue_worker: {e}\n")
                time.sleep(3.0)

    httpd = ThreadingHTTPServer((host, port), BridgeHandler)
    print(f"SSEPI COI bridge en http://{host}:{port}")
    print("GET /health | POST /ingest/venta | POST /ingest/compra")
    t = threading.Thread(target=_queue_worker, name="coi_sync_queue_worker", daemon=True)
    t.start()
    httpd.serve_forever()


if __name__ == "__main__":
    main()
