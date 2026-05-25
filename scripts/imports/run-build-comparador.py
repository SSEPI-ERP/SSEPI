# -*- coding: utf-8 -*-
"""Puente: ejecuta build_comparador.py con rutas bajo simulaciones/escaner de imagenes."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / "simulaciones" / "SSEPI_Paquete_ERP" / "01_Comparador_Odoo_Excel"
sys.path.insert(0, str(PKG))

import build_comparador as bc  # noqa: E402

INFO = ROOT / "simulaciones" / "escaner de imagenes" / "info"

def _env_path(key, default):
    v = os.environ.get(key)
    return Path(v) if v else default

bc.EXCEL_FILE = _env_path("SSEPI_TABULADOR_XLSX", INFO / "TABULADOR DE COTIZACIÓN actualizado.xlsx")
if not bc.EXCEL_FILE.exists():
    for cand in [
        INFO / "TABULADOR DE COTIZACIÓN.xlsx",
        PKG / "TABULADOR DE COTIZACIÓN actualizado.xlsx",
        PKG / "TABULADOR DE COTIZACIÓN.xlsx",
    ]:
        if cand.exists():
            bc.EXCEL_FILE = cand
            break

bc.ODOO_CONTACTS_FILE = _env_path("SSEPI_CONTACTOS_ODOO_XLSX", INFO / "contactos_odoo.xlsx")
if not bc.ODOO_CONTACTS_FILE.exists():
    alt = PKG / "contactos_odoo.xlsx"
    if alt.exists():
        bc.ODOO_CONTACTS_FILE = alt

bc.IMG_DIR = _env_path("SSEPI_CAPTURAS_DIR", INFO / "Screenshots")
if not bc.IMG_DIR.exists():
    for d in [INFO / "SistemaContactos" / "CapturasOdoo", PKG / "SistemaContactos" / "CapturasOdoo"]:
        if d.exists():
            bc.IMG_DIR = d
            break

bc.OCR_FILE = _env_path("SSEPI_OCR_JSON", INFO / "ocr_results.json")
bc.RASTRO_FILE = _env_path("SSEPI_RASTRO_JSON", INFO / "rastro_capturas.json")
bc.OUT_FILE = _env_path("SSEPI_DATOS_COMPARADOR", INFO / "datos_comparador.json")

if __name__ == "__main__":
    bc.main()
