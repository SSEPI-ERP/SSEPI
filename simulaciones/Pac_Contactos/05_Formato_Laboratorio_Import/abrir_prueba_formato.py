#!/usr/bin/env python3
"""Sirve la carpeta del proyecto y abre prueba_formato_laboratorio.html en el navegador."""
import os
import socket
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PRUEBA_PORT", "8765"))
PAGE = "/prueba_formato_laboratorio.html"


def puerto_libre(p: int) -> int:
    for port in (p, p + 1, p + 2):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
    return p


def main():
    port = puerto_libre(PORT)
    url = f"http://127.0.0.1:{port}{PAGE}"

    class H(SimpleHTTPRequestHandler):
        def __init__(self, request, client_address, server):
            super().__init__(request, client_address, server, directory=str(ROOT))

        def log_message(self, fmt, *args):
            if PAGE in (fmt % args):
                print(f"  {fmt % args}", flush=True)

    server = ThreadingHTTPServer(("127.0.0.1", port), H)
    print(f"Prueba formato: {url}")
    print("  (Ctrl+C para cerrar)\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrado.")
        server.shutdown()


if __name__ == "__main__":
    main()
