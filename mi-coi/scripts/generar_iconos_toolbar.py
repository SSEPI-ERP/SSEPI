#!/usr/bin/env python3
"""Genera PNG 18x18 distintos para la barra lateral (assets/toolbar). Ejecutar desde la raíz del proyecto."""
from __future__ import annotations

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Instala Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "toolbar")
SIZE = 18


def _save(name: str, draw_fn) -> None:
    os.makedirs(OUT, exist_ok=True)
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    draw_fn(dr)
    path = os.path.join(OUT, name)
    im.save(path, "PNG")
    print("OK", path)


def main() -> None:
    s = SIZE

    def add_cuenta(dr):
        dr.rounded_rectangle([2, 2, s - 3, s - 3], radius=3, fill=(5, 150, 105, 230))
        dr.line([9, 5, 9, s - 6], fill=(255, 255, 255, 255), width=2)
        dr.line([5, 9, s - 6, 9], fill=(255, 255, 255, 255), width=2)

    def add_poliza(dr):
        dr.rectangle([3, 3, s - 4, s - 4], outline=(37, 99, 235, 255), width=2)
        dr.line([9, 5, 9, s - 6], fill=(37, 99, 235, 255), width=2)
        dr.line([5, 9, s - 6, 9], fill=(37, 99, 235, 255), width=2)

    def edit_cuenta(dr):
        dr.line([4, s - 5, s - 5, 4], fill=(100, 116, 139, 255), width=2)
        dr.polygon([(s - 6, 3), (s - 3, 6), (s - 7, 7), (s - 8, 4)], fill=(148, 163, 184, 255))

    def edit_poliza(dr):
        dr.line([5, s - 4, s - 4, 5], fill=(234, 88, 12, 255), width=2)
        dr.rectangle([11, 3, s - 4, 7], outline=(234, 88, 12, 255), width=1)

    def del_cuenta(dr):
        dr.line([4, 4, s - 5, s - 5], fill=(220, 38, 38, 255), width=2)
        dr.line([s - 5, 4, 4, s - 5], fill=(220, 38, 38, 255), width=2)

    def del_poliza(dr):
        dr.rectangle([5, 6, s - 6, s - 5], outline=(71, 85, 105, 255), width=2)
        dr.line([4, 6, s - 5, 6], fill=(71, 85, 105, 255), width=2)
        dr.line([7, 9, 7, s - 6], fill=(148, 163, 184, 255), width=1)
        dr.line([11, 9, 11, s - 6], fill=(148, 163, 184, 255), width=1)

    def sync_cat(dr):
        dr.arc([2, 2, s - 3, s - 3], start=200, end=340, fill=(5, 150, 105, 255), width=2)
        dr.polygon([(s - 5, 8), (s - 2, 5), (s - 2, 11)], fill=(5, 150, 105, 255))
        dr.arc([4, 4, s - 5, s - 5], start=20, end=160, fill=(5, 150, 105, 255), width=2)
        dr.polygon([(3, 10), (6, 7), (6, 13)], fill=(5, 150, 105, 255))

    def sync_pol(dr):
        dr.line([3, 9, s - 4, 9], fill=(37, 99, 235, 255), width=2)
        dr.polygon([(s - 5, 9), (s - 9, 6), (s - 9, 12)], fill=(37, 99, 235, 255))
        dr.polygon([(4, 9), (8, 6), (8, 12)], fill=(37, 99, 235, 255))

    for name, fn in (
        ("add_cuenta.png", add_cuenta),
        ("add_poliza.png", add_poliza),
        ("edit_cuenta.png", edit_cuenta),
        ("edit_poliza.png", edit_poliza),
        ("del_cuenta.png", del_cuenta),
        ("del_poliza.png", del_poliza),
        ("sync_catalogo.png", sync_cat),
        ("sync_polizas.png", sync_pol),
    ):
        _save(name, fn)

    # Compatibilidad con nombres antiguos del README (mismas piezas que cuenta/póliza)
    import shutil

    shutil.copy2(os.path.join(OUT, "add_cuenta.png"), os.path.join(OUT, "add.png"))
    shutil.copy2(os.path.join(OUT, "edit_cuenta.png"), os.path.join(OUT, "edit.png"))
    shutil.copy2(os.path.join(OUT, "del_cuenta.png"), os.path.join(OUT, "del.png"))
    shutil.copy2(os.path.join(OUT, "sync_catalogo.png"), os.path.join(OUT, "sync.png"))


if __name__ == "__main__":
    main()
