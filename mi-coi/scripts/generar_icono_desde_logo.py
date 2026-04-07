"""
Genera mi-coi/assets/app.ico a partir de logo.png (o ssepi_logo.png).
Uso: python scripts/generar_icono_desde_logo.py
Requiere Pillow (ya suele estar en el venv del COI).
"""
from __future__ import annotations

import os
import sys

try:
    from PIL import Image
except ImportError:
    print("Instala Pillow: pip install Pillow")
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
CANDIDATES = [
    os.path.join(ASSETS, "logo.png"),
    os.path.join(ROOT, "logo.png"),
    os.path.join(ASSETS, "ssepi_logo.png"),
    os.path.join(os.path.dirname(ROOT), "logo.png"),
]


def main() -> None:
    src = None
    for p in CANDIDATES:
        if os.path.isfile(p):
            src = p
            break
    if not src:
        print("No se encontro logo. Coloca logo.png en mi-coi/ o mi-coi/assets/")
        sys.exit(1)

    os.makedirs(ASSETS, exist_ok=True)
    out = os.path.join(ASSETS, "app.ico")
    img = Image.open(src).convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = [img.resize(s, Image.Resampling.LANCZOS) for s in sizes]
    images[0].save(
        out,
        format="ICO",
        sizes=[im.size for im in images],
        append_images=images[1:],
    )
    print(f"OK: {out} (desde {src})")


if __name__ == "__main__":
    main()
