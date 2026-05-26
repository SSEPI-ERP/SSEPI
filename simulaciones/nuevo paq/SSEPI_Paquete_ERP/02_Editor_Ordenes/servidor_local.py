"""
Servidor HTTP local + API para guardar ordenes editadas.
Escucha en todas las interfaces (0.0.0.0) para acceso desde otros dispositivos en la red.
"""
import json
import os
import socket
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get("SERVIDOR_PORT", "8765"))
HOST = os.environ.get("SERVIDOR_HOST", "0.0.0.0")
ROOT = Path(__file__).resolve().parent
JSON_EDITABLE = ROOT / "datos_ordenes_editables.json"
EDITOR_HTML = ROOT / "editor_ordenes.html"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server, directory=str(ROOT))

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "GET /reportes/" in msg and " 304 " in msg:
            return
        if "GET /reportes/" in msg and " 200 " in msg and ".jpg" in msg.lower():
            return
        print(f"  {msg}", flush=True)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/comparador", "/comparador/"):
            self.send_response(302)
            self.send_header("Location", "/comparador_clientes.html")
            self.end_headers()
            return
        if path == "/comparador_clientes.html":
            dest = ROOT / "info" / "comparador_clientes.html"
            if dest.exists():
                self.path = "/info/comparador_clientes.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/guardar-orden":
            self._guardar_orden()
            return
        self.send_error(404)

    def _guardar_orden(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
            ref = data.get("referencia_reparacion", "").strip()
            if not ref:
                self._json_response(400, {"ok": False, "error": "Falta referencia_reparacion"})
                return

            if not JSON_EDITABLE.exists():
                self._json_response(500, {"ok": False, "error": "No existe datos_ordenes_editables.json"})
                return

            with open(JSON_EDITABLE, encoding="utf-8") as f:
                records = json.load(f)

            found = False
            skip = {"imagenes_erp", "imagenes_servicio", "archivos_pdf", "_limpiado", "_source_images"}
            for i, row in enumerate(records):
                if row.get("referencia_reparacion") == ref:
                    for k, v in data.items():
                        if k in skip:
                            continue
                        records[i][k] = v
                    found = True
                    break

            if not found:
                new_row = {k: v for k, v in data.items() if k not in skip}
                records.append(new_row)

            with open(JSON_EDITABLE, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)

            self._json_response(200, {"ok": True, "referencia": ref})
        except Exception as e:
            self._json_response(500, {"ok": False, "error": str(e)})

    def _json_response(self, code, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def puerto_ocupado(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            return False
        except OSError:
            return True


def elegir_puerto(preferido: int) -> int:
    if not puerto_ocupado(preferido):
        return preferido
    for alt in (8766, 8767, 8770, 8780):
        if not puerto_ocupado(alt):
            print(f"  AVISO: Puerto {preferido} ocupado (otro CMD o carpeta info/). Usando {alt}.")
            return alt
    print(f"  ERROR: Puertos {preferido}-8780 ocupados. Cierra otras ventanas del servidor.")
    sys.exit(1)


def local_ips():
    """IPs LAN para abrir desde celular/tablet/otro PC en la misma red."""
    seen = set()
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            seen.add(ip)
            out.append(ip)
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip.startswith("127.") or ip in seen:
                continue
            seen.add(ip)
            out.append(ip)
    except OSError:
        pass
    return out


def main():
    global PORT
    os.chdir(ROOT)
    if not EDITOR_HTML.exists():
        print(f"  ERROR: No esta {EDITOR_HTML.name} en {ROOT}")
        sys.exit(1)

    PORT = elegir_puerto(PORT)

    print()
    print(f"  Carpeta: {ROOT}")
    if JSON_EDITABLE.exists():
        mb = JSON_EDITABLE.stat().st_size / 1024
        print(f"  Datos editables: {JSON_EDITABLE.name} ({mb:.0f} KB)")
    else:
        print("  AVISO: Ejecuta 4_limpiar_datos.bat antes del editor")
    print()
    print(f"  Escuchando en {HOST}:{PORT} (red local)")
    print()
    comp = ROOT / "info" / "comparador_clientes.html"
    print("  En este equipo:")
    print(f"    http://127.0.0.1:{PORT}/editor_ordenes.html")
    if comp.exists():
        print(f"    http://127.0.0.1:{PORT}/comparador_clientes.html  (Odoo vs Excel)")
        print(f"    http://127.0.0.1:{PORT}/info/comparador_clientes.html")
    print(f"    http://127.0.0.1:{PORT}/")
    ips = local_ips()
    if ips:
        print()
        print("  Desde otros dispositivos (misma WiFi/LAN):")
        for ip in ips:
            print(f"    http://{ip}:{PORT}/editor_ordenes.html")
            if comp.exists():
                print(f"    http://{ip}:{PORT}/comparador_clientes.html")
    else:
        print()
        print("  AVISO: No se detecto IP de red. Usa ipconfig y tu IPv4.")
    print()
    print("  Si no conecta desde el celular: Firewall de Windows -> permitir Python/puerto", PORT)
    print("  Solo red de confianza (cualquiera en la LAN puede ver y editar).")
    print()

    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print(f"  ERROR puerto {PORT}: {e}")
        sys.exit(1)

    url = f"http://127.0.0.1:{PORT}/editor_ordenes.html"
    threading.Thread(
        target=lambda: (webbrowser.open(url)),
        daemon=True,
    ).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")
        server.shutdown()


if __name__ == "__main__":
    main()
