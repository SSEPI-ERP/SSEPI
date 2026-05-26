#!/usr/bin/env python3
"""
scan_reportes.py
Escanea la carpeta 'reportes' localmente y genera un JSON con la lista de carpetas
y los datos extraidos (sin OCR, solo la estructura). Tambien puede ejecutar OCR
con pytesseract si esta instalado.

Uso:
    python scan_reportes.py
    # Genera datos_reportes.json

    # Para importar al HTML:
    # Abre lector_reportes.html y usa "Importar JSON/CSV"
"""

import json
import re
import sys
from pathlib import Path

from formato_laboratorio import empty_orden, migrar_desde_legacy

BASE_DIR = Path(__file__).parent
REPORTES_DIR = BASE_DIR / "reportes"
OUTPUT_JSON = BASE_DIR / "datos_reportes.json"


def get_image_files(folder: Path):
    """Devuelve rutas de imagenes y PDFs dentro de una carpeta."""
    exts = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".gif", ".pdf"}
    files = []
    for f in folder.iterdir():
        if f.is_file() and f.suffix.lower() in exts:
            files.append(str(f))
    # Ordenar alfabeticamente
    files.sort()
    return files


def scan_folders():
    if not REPORTES_DIR.exists():
        print(f"ERROR: No se encuentra la carpeta {REPORTES_DIR}")
        sys.exit(1)

    records = []
    subdirs = [d for d in REPORTES_DIR.iterdir() if d.is_dir()]
    subdirs.sort(key=lambda x: x.name)

    print(f"Encontradas {len(subdirs)} carpetas en {REPORTES_DIR}")

    for idx, folder in enumerate(subdirs, 1):
        images = get_image_files(folder)
        record = migrar_desde_legacy(empty_orden(folder.name))
        record["_source_images"] = images
        rel_servicio = []
        for p in images:
            name = Path(p).name
            if name.lower().endswith((".jpg", ".jpeg", ".png")):
                if not re.search(r"screenshot|captura|erp|odoo", name, re.I):
                    rel_servicio.append(f"reportes/{folder.name}/{name}".replace("\\", "/"))
        record["imagenes_servicio"] = rel_servicio
        record["imagenes_reporte"] = rel_servicio[:5]
        records.append(record)
        print(f"  [{idx}/{len(subdirs)}] {folder.name}: {len(images)} imagenes")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"\nGuardado: {OUTPUT_JSON}")
    print(f"Total registros: {len(records)}")
    print("Abre lector_reportes.html y usa 'Importar JSON/CSV' para cargar los datos.")


if __name__ == "__main__":
    scan_folders()
