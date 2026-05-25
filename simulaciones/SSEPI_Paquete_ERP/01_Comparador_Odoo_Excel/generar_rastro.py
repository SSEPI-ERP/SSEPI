# -*- coding: utf-8 -*-
"""
Genera rastro_capturas.json: datos leídos de pantalla (visión manual + OCR bueno).
Uso: python generar_rastro.py
"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATOS = ROOT / "datos_comparador.json"
OUT = ROOT / "rastro_capturas.json"

# Lectura directa de capturas donde el OCR falló (revisión visual)
VISION_MANUAL = {
    "Screenshot 2026-05-14 111841.png": {
        "nombreEnImagen": "BADER",
        "tipoImagen": "persona",
        "rfcImagen": "no aplica",
    },
    "Screenshot 2026-05-14 112124.png": {
        "nombreEnImagen": "EBAY",
        "tipoImagen": "persona",
        "rfcImagen": "no aplica",
    },
    "Screenshot 2026-05-14 112138.png": {
        "nombreEnImagen": "ECSA",
        "tipoImagen": "persona",
        "rfcImagen": "no aplica",
    },
    "Screenshot 2026-05-14 112230.png": {
        "nombreEnImagen": "FAS",
        "tipoImagen": "persona",
        "rfcImagen": "no aplica",
    },
    "Screenshot 2026-05-14 112308.png": {
        "nombreEnImagen": "GRUPO PLASMA AUTOMATION",
        "tipoImagen": "empresa",
        "rfcImagen": "GODE561231GR8",
        "direccionImagen": "Cam. Rancho Alegre 100A, Fracciones de el Alto, 37295 León, Guanajuato (MX), México",
        "ubicacionImagen": "León, Guanajuato, México",
    },
    "Screenshot 2026-05-14 112416.png": {
        "nombreEnImagen": "Hiruta México, S.A. de C.V.",
        "tipoImagen": "empresa",
        "emailImagen": "keiji-kayakiri@hiruta.com.mx",
        "telImagen": "+52 472 103 2600",
        "rfcImagen": "HME120411N64",
        "direccionImagen": "Circuito Mexiamora Pte. No. 150, Parque Industrial Santa Fe, 36275 Silao de la Victoria, Guanajuato (MX), México",
        "ubicacionImagen": "Silao de la Victoria, Guanajuato, México",
    },
    "Screenshot 2026-05-14 112441.png": {
        "nombreEnImagen": "IK Plastic Compound México, S.A. de C.V.",
        "tipoImagen": "empresa",
        "emailImagen": "torres.eduardo@ikpc-mx.com",
        "telImagen": "+52 472 103 9700",
        "rfcImagen": "IPC121114BX2",
        "sitioWebImagen": "http://www.mx.inabata.com",
        "contactoPersona": "Ing. Eduardo Torres",
        "direccionImagen": "Av. Mina de Guadalupe No. 462, Parque Industrial Santa Fe, 36275 Silao de la Victoria, Guanajuato (MX), México",
        "ubicacionImagen": "Silao de la Victoria, Guanajuato, México",
    },
    "Screenshot 2026-05-14 112500.png": {
        "nombreEnImagen": "Industrias Fivax",
        "tipoImagen": "empresa",
        "emailImagen": "sac@fivax.mx",
        "telImagen": "+52 477 710 8700",
        "rfcImagen": "GODE561231GR8",
        "sitioWebImagen": "https://fivax.mx/",
        "direccionImagen": "Blvd. union de curtidores 315A, Parque piel leon, 37490 leon, Guanajuato (MX), México",
        "ubicacionImagen": "León, Guanajuato, México",
    },
    "Screenshot 2026-05-19 120547.png": {
        "nombreEnImagen": "RONGTAI",
        "tipoImagen": "empresa",
        "emailImagen": "compras3@rtco.com.cn",
        "telImagen": "+52 479 262 7503",
        "rfcImagen": "RID151210DQ9",
        "contactoPersona": "Joatam álvarez",
        "direccionImagen": "Avenida Paseo de las Colinas 3, PARQUE INDUSTRIAL COLINAS DE LEÓN, 37668 LEÓN, Guanajuato (MX), México",
        "ubicacionImagen": "LEÓN, Guanajuato, México",
    },
    "Screenshot 2026-05-19 120849.png": {
        "nombreEnImagen": "Soser Soluciones Industriales, S.A. de C.V.",
        "tipoImagen": "empresa",
        "emailImagen": "contacto@soser.com.mx",
        "telImagen": "+52 477 348 2191",
        "rfcImagen": "SSI2102227V5",
        "sitioWebImagen": "http://www.soser.com.mx",
        "contactoPersona": "Ing. Victor Flores",
        "direccionImagen": "Nardos No. 403, Jardines de Jerez, 37530 León, Guanajuato (MX), México",
        "ubicacionImagen": "León, Guanajuato, México",
    },
}


def entry_from_odoo(o):
    di = o.get("datosImagen") or {}
    nombre = o.get("nombreContacto") or di.get("nombreEnImagen") or ""
    if not nombre:
        return None
    return {
        "nombreEnImagen": nombre,
        "nombreLineaCompleta": di.get("nombreLineaCompleta") or nombre,
        "contactoPersona": o.get("contactoPersona") or di.get("personaImagen") or "",
        "emailImagen": o.get("email") or di.get("emailImagen") or "",
        "telImagen": o.get("tel") or di.get("telImagen") or "",
        "rfcImagen": o.get("rfc") or di.get("rfcImagen") or "",
        "direccionImagen": o.get("direccion") or di.get("direccionImagen") or "",
        "ubicacionImagen": o.get("ubicacion") or di.get("ubicacionImagen") or "",
        "puestoImagen": o.get("puesto") or di.get("puestoImagen") or "",
        "sitioWebImagen": o.get("sitioWeb") or di.get("sitioWebImagen") or "",
        "tipoImagen": di.get("tipoImagen") or o.get("tipo") or "",
        "fuente": "ocr_validado",
        "nombreVerificado": True,
        "completitudImagen": o.get("completitudImagen", 80),
    }


def main():
    capturas = {}
    if DATOS.exists():
        data = json.loads(DATOS.read_text(encoding="utf-8"))
        for o in data.get("odoo", []):
            fname = o.get("file", "")
            if not fname or fname in VISION_MANUAL:
                continue
            ent = entry_from_odoo(o)
            if ent:
                capturas[fname] = ent

    for fname, manual in VISION_MANUAL.items():
        capturas[fname] = {
            **manual,
            "nombreLineaCompleta": manual.get("nombreLineaCompleta") or manual["nombreEnImagen"],
            "fuente": "vision_manual",
            "nombreVerificado": True,
            "completitudImagen": 95,
        }

    out = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "total": len(capturas),
        "vision_manual": len(VISION_MANUAL),
        "descripcion": "Rastro fiable por captura. Prioridad sobre OCR automático en build_comparador.py",
        "capturas": capturas,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Rastro: {len(capturas)} capturas ({len(VISION_MANUAL)} visión manual)")
    print(f"Guardado: {OUT}")


if __name__ == "__main__":
    main()
