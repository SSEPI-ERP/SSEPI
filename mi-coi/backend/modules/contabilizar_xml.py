# backend/modules/contabilizar_xml.py
"""Contabiliza facturas timbradas desde XML (carpeta o archivo)."""
import os
import sqlite3
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "backend", "database", "contabilidad.db"
        )


def _find_first(root_el, contains: str):
    for el in root_el.iter():
        if el.tag and contains in el.tag:
            return el
    return None


def ya_contabilizado(uuid: str, db_path: Optional[str] = None) -> bool:
    """True si ya existe una póliza cuyo concepto contenga este UUID."""
    if not (uuid or "").strip():
        return True
    db_path = db_path or get_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM polizas WHERE concepto LIKE ? LIMIT 1",
                ("%" + uuid.strip()[:36] + "%",)
            )
            return cur.fetchone() is not None
    except Exception:
        return False


def contabilizar_xml_timbrado(xml_content: str, db_path: Optional[str] = None) -> Dict:
    """
    Contabiliza una factura timbrada a partir del XML (string o ruta).
    xml_content: puede ser ruta a archivo .xml o el XML como string.
    Retorna: { "exito": bool, "mensaje": str, "uuid": str, "numero_poliza": int, "error": str }
    """
    db_path = db_path or get_db_path()
    result = {"exito": False, "mensaje": "", "uuid": "", "numero_poliza": None, "error": ""}
    try:
        if os.path.isfile(xml_content):
            with open(xml_content, "r", encoding="utf-8") as f:
                xml_str = f.read()
        else:
            xml_str = xml_content
        root = ET.fromstring(xml_str)
    except Exception as e:
        result["error"] = str(e)
        result["mensaje"] = f"No se pudo leer XML: {e}"
        return result

    try:
        from backend.services.contabilidad_service import ContabilidadService
        from backend.models.catalogo import CatalogoCuentas
    except ImportError:
        try:
            from services.contabilidad_service import ContabilidadService
            from models.catalogo import CatalogoCuentas
        except ImportError:
            result["error"] = "No se pudo importar ContabilidadService/CatalogoCuentas"
            return result

    comp = _find_first(root, "Comprobante") or root
    re_el = _find_first(comp, "Receptor")
    tfd = _find_first(comp, "TimbreFiscalDigital") or _find_first(root, "TimbreFiscalDigital")
    uuid_pol = (tfd.get("UUID") or "").strip()[:36] if tfd is not None else ""
    if not uuid_pol:
        result["error"] = "UUID no encontrado en el XML"
        result["mensaje"] = "El XML no contiene TimbreFiscalDigital con UUID."
        return result

    if ya_contabilizado(uuid_pol, db_path):
        result["exito"] = True
        result["mensaje"] = "Ya estaba contabilizada"
        result["uuid"] = uuid_pol
        return result

    fecha_cfdi = (comp.get("Fecha") or "")[:10]
    if not fecha_cfdi:
        fecha_cfdi = None  # SistemaPolizas puede requerir fecha; usamos hoy si falta
    try:
        subtotal = float((comp.get("SubTotal") or "0").replace(",", ""))
    except Exception:
        subtotal = 0.0
    try:
        total = float((comp.get("Total") or "0").replace(",", ""))
    except Exception:
        total = 0.0
    iva = round(max(0.0, total - subtotal), 2)
    rfc_rep = (re_el.get("Rfc") or re_el.get("RFC") or "").strip() if re_el is not None else ""
    nom_rep = (re_el.get("Nombre") or "").strip() if re_el is not None else ""
    em_el = _find_first(comp, "Emisor")
    rfc_em = (em_el.get("Rfc") or em_el.get("RFC") or "").strip() if em_el is not None else ""

    from datetime import datetime
    if not fecha_cfdi:
        fecha_cfdi = datetime.now().strftime("%Y-%m-%d")

    cta_bancos = "102"
    cta_ingresos = "401"
    cta_iva_tras = "208"

    cat = CatalogoCuentas(db_path=db_path)
    for num, nombre, naturaleza in [
        (cta_bancos, "Bancos", "DEUDORA"),
        (cta_ingresos, "Ingresos / Ventas", "ACREEDORA"),
        (cta_iva_tras, "IVA trasladado cobrado", "ACREEDORA"),
    ]:
        if not cat.obtener_cuenta(num):
            cat.agregar_cuenta_completa({
                "num_cuenta": num,
                "nombre_cuenta": nombre,
                "nivel": 1,
                "naturaleza": naturaleza,
                "cuenta_mayor": None,
                "tipo_cuenta": "ACUMULATIVA",
                "moneda": "MXN",
                "codigo_agrupador_sat": None,
                "no_incluir_xml": False,
                "rubro_financiero": None,
                "saldo_inicial": 0,
                "saldo_final": 0,
            })

    # Payload mínimo para UUID -> partida (cfdi_poliza)
    tipo_comprobante = ((comp.get("TipoDeComprobante") or "I").strip() or "I")[:1].upper()
    metodo_pago = (comp.get("MetodoPago") or "").strip()
    forma_pago = (comp.get("FormaPago") or "").strip()
    fecha_cfdi_payload = str(fecha_cfdi or "")[:10] or None

    concepto_poliza = f"Factura timbrada {uuid_pol} - {rfc_rep} {nom_rep}".strip()[:180]
    # Cliente (receptor) en cada movimiento para catálogo y reportes tipo COI
    cliente = {"cliente_rfc": rfc_rep or None, "cliente_nombre": nom_rep or None}
    # Nota: el UUID es UNIQUE globalmente, por eso lo asignamos SOLO a un movimiento (primer renglón).
    movimientos = [
        {
            "num_cuenta": cta_bancos,
            "concepto": f"Cobro factura {uuid_pol}",
            "cargo": round(total, 2),
            "abono": 0.0,
            **cliente,
            "uuid": uuid_pol,
            "rfc_emisor": rfc_em or None,
            "rfc_receptor": rfc_rep or None,
            "fecha_cfdi": fecha_cfdi_payload,
            "subtotal": subtotal,
            "iva_trasladado": iva if iva > 0 else None,
            "iva_retenido": None,
            "isr_retenido": None,
            "total_cfdi": total,
            "tipo_comprobante": tipo_comprobante,
            "metodo_pago": metodo_pago or None,
            "forma_pago": forma_pago or None,
            "xml_raw": xml_str,
        },
        {
            "num_cuenta": cta_ingresos,
            "concepto": f"Ingreso factura {uuid_pol}",
            "cargo": 0.0,
            "abono": round(subtotal, 2),
            **cliente,
        },
    ]
    if iva > 0:
        movimientos.append(
            {
                "num_cuenta": cta_iva_tras,
                "concepto": f"IVA factura {uuid_pol}",
                "cargo": 0.0,
                "abono": round(iva, 2),
                **cliente,
            }
        )

    svc = ContabilidadService(db_path=db_path)
    rpol = svc.crear_poliza_y_afectar("INGRESO", fecha_cfdi, concepto_poliza, movimientos, moneda="MXN", tipo_cambio=1.0)
    if rpol.get("exito"):
        result["exito"] = True
        result["mensaje"] = f"Póliza #{rpol.get('numero_poliza')} creada"
        result["uuid"] = uuid_pol
        result["numero_poliza"] = rpol.get("numero_poliza")
    else:
        result["error"] = rpol.get("error", "Error al crear póliza")
        result["mensaje"] = result["error"]
    return result


def contabilizar_carpeta(carpeta: str, db_path: Optional[str] = None) -> List[Dict]:
    """
    Recorre la carpeta de facturas timbradas y contabiliza cada XML que aún no tenga póliza.
    Retorna lista de dicts con resultado por archivo: { "archivo", "uuid", "exito", "mensaje" }
    """
    results = []
    if not os.path.isdir(carpeta):
        return results
    for fname in sorted(os.listdir(carpeta)):
        if not fname.lower().endswith(".xml"):
            continue
        path = os.path.join(carpeta, fname)
        try:
            r = contabilizar_xml_timbrado(path, db_path)
            results.append({
                "archivo": fname,
                "uuid": r.get("uuid", ""),
                "exito": r.get("exito", False),
                "mensaje": r.get("mensaje", r.get("error", "")),
            })
        except Exception as e:
            results.append({
                "archivo": fname,
                "uuid": "",
                "exito": False,
                "mensaje": str(e),
            })
    return results
