"""
Servidor solo para comparador_clientes.html (carpeta info/).
Puerto 8766 por defecto — no choca con editor_ordenes en 8765 (carpeta padre).
"""
import os
import socket
import sys
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = int(os.environ.get("COMPARADOR_PORT", "8766"))
HOST = os.environ.get("COMPARADOR_HOST", "0.0.0.0")
ROOT = Path(__file__).resolve().parent
HTML = ROOT / "comparador_clientes.html"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server, directory=str(ROOT))

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {fmt % args}", flush=True)


def puerto_libre(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def elegir_puerto(preferido: int) -> int:
    if puerto_libre(preferido):
        return preferido
    for alt in (8767, 8768, 8771):
        if puerto_libre(alt):
            print(f"  AVISO: Puerto {preferido} ocupado. Usando {alt}.")
            return alt
    print("  ERROR: Puertos 8766-8771 ocupados.")
    sys.exit(1)


def local_ips():
    seen, out = set(), []
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
    return out


def main():
    global PORT
    os.chdir(ROOT)
    if not HTML.exists():
        print(f"  ERROR: Falta {HTML.name} en {ROOT}")
        sys.exit(1)

    PORT = elegir_puerto(PORT)
    print()
    print(f"  Carpeta: {ROOT}")
    print(f"  Comparador Odoo / Excel — puerto {PORT}")
    print()
    print("  En este PC:")
    print(f"    http://127.0.0.1:{PORT}/comparador_clientes.html")
    for ip in local_ips():
        print(f"    http://{ip}:{PORT}/comparador_clientes.html")
    print()
    print("  Editor de ordenes sigue en puerto 8765 (carpeta padre, iniciar_servidor.bat).")
    print()

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/comparador_clientes.html"
    try:
        webbrowser.open(url)
    except OSError:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Comparador detenido.")
        server.shutdown()


if __name__ == "__main__":
    main()
