# backend/modules/finkok_integration.py
"""
Cliente para timbrado CFDI vía Finkok (SOAP).
Demo: https://demo-facturacion.finkok.com/servicios/soap/stamp
Prod:  https://facturacion.finkok.com/servicios/soap/stamp

Wiki Finkok - metodo_stamp:
- Método: https://wiki.finkok.com/home/webservices/ws_timbrado/metodo_stamp
- Respuesta correcta (envoltura SOAP): #envoltura-soapresponse-respuesta-correcta
- Respuesta incorrecta (envoltura SOAP): #envoltura-soapresponse-respuesta-incorrecta
- Sign_stamp: https://wiki.finkok.com/home/webservices/ws_timbrado/Sign_stamp
- Token (opcional): https://wiki.finkok.com/en/home/crear-token-panel

Flujo confirmado por soporte Finkok: se envia XML (sign_stamp o stamp); Finkok agrega el timbre
fiscal, lo envia al SAT y devuelve en el response el XML ya timbrado para guardarlo en carpeta.
No hay vigencia del motor; en produccion depende de los folios adquiridos.
"""
import os
import json
import base64
import requests
from datetime import datetime
import xml.etree.ElementTree as ET


def _xml_escape(s):
    """Escapa caracteres especiales para contenido XML."""
    if not s:
        return ""
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def _load_config():
    """Usuario, contraseña, datos del emisor y ambiente (demo/producción) desde config_instituto.json o variables de entorno."""
    out = {"user": "", "password": "", "user_alt": "", "password_alt": "", "rfc": "", "nombre": "", "lugar_expedicion": "", "regimen": "626", "sandbox": True}
    out["user"] = os.getenv("FINKOK_USER", "").strip()
    out["password"] = os.getenv("FINKOK_PASSWORD", "").strip()
    out["user_alt"] = os.getenv("FINKOK_USER_ALTERNATIVO", "").strip()
    out["password_alt"] = os.getenv("FINKOK_PASSWORD_ALTERNATIVO", "").strip()
    out["rfc"] = os.getenv("FINKOK_ISSUER_RFC", "").strip()
    out["nombre"] = os.getenv("FINKOK_ISSUER_NAME", "").strip()
    out["lugar_expedicion"] = os.getenv("FINKOK_LUGAR_EXPEDICION", "").strip()
    out["regimen"] = os.getenv("FINKOK_REGIMEN", "").strip() or "626"
    sb = os.getenv("FINKOK_SANDBOX", "").strip().lower()
    if sb in ("0", "false", "no", "produccion", "production"):
        out["sandbox"] = False
    try:
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        config_path = os.path.join(root_dir, "config_instituto.json")
        if not os.path.isfile(config_path):
            config_path = os.path.join(os.getcwd(), "config_instituto.json")
        if os.path.isfile(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                out["user"] = out["user"] or (data.get("FINKOK_USER") or "").strip()
                out["password"] = out["password"] or (data.get("FINKOK_PASSWORD") or "").strip()
                out["user_alt"] = out["user_alt"] or (data.get("FINKOK_USER_ALTERNATIVO") or "").strip()
                out["password_alt"] = out["password_alt"] or (data.get("FINKOK_PASSWORD_ALTERNATIVO") or "").strip()
                out["rfc"] = out["rfc"] or (data.get("FINKOK_ISSUER_RFC") or "").strip()
                out["nombre"] = out["nombre"] or (data.get("FINKOK_ISSUER_NAME") or "").strip()
                out["lugar_expedicion"] = out["lugar_expedicion"] or (data.get("FINKOK_LUGAR_EXPEDICION") or "").strip()
                if data.get("FINKOK_REGIMEN"):
                    out["regimen"] = (data.get("FINKOK_REGIMEN") or "").strip() or "626"
                if "FINKOK_SANDBOX" in data:
                    v = data["FINKOK_SANDBOX"]
                    out["sandbox"] = bool(v) if isinstance(v, bool) else str(v).strip().lower() not in ("0", "false", "no")
    except Exception:
        pass
    if not out["rfc"]:
        out["rfc"] = "EKU9003173C9"
        out["nombre"] = out["nombre"] or "ESCUELA KEMPER URGATE"
        out["lugar_expedicion"] = out["lugar_expedicion"] or "20928"
        out["regimen"] = out["regimen"] or "601"
    return out


def _cfdi4_xml(monto: float, total: float, iva: float, descripcion: str, folio: str, fecha: str,
               rfc_emisor: str, nombre_emisor: str, lugar_expedicion: str, regimen_fiscal: str) -> str:
    """Genera CFDI 4.0 XML con Sello/Certificado/NoCertificado vacíos para sign_stamp."""
    ns_cfdi = "http://www.sat.gob.mx/cfd/4"
    ns_xsi = "http://www.w3.org/2001/XMLSchema-instance"
    schema = "http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
    ET.register_namespace("cfdi", ns_cfdi)
    ET.register_namespace("xsi", ns_xsi)
    root = ET.Element(f"{{{ns_cfdi}}}Comprobante")
    root.set("Version", "4.0")
    root.set("Serie", "P")
    root.set("Folio", folio)
    root.set("Fecha", fecha)
    root.set("Sello", "")
    root.set("NoCertificado", "")
    root.set("Certificado", "")
    root.set("FormaPago", "01")
    root.set("SubTotal", f"{monto:.2f}")
    root.set("Descuento", "0.00")
    root.set("Moneda", "MXN")
    root.set("TipoCambio", "1")
    root.set("Total", f"{total:.2f}")
    root.set("TipoDeComprobante", "I")
    root.set("Exportacion", "01")
    root.set("MetodoPago", "PUE")
    root.set("LugarExpedicion", lugar_expedicion or "37448")
    root.set(f"{{{ns_xsi}}}schemaLocation", schema)

    emisor = ET.SubElement(root, f"{{{ns_cfdi}}}Emisor")
    emisor.set("Rfc", rfc_emisor or "VAZD9407305PA")
    emisor.set("Nombre", (nombre_emisor or "DANIEL YUSEL VALDES ZUÑIGA")[:300])
    emisor.set("RegimenFiscal", regimen_fiscal or "626")

    receptor = ET.SubElement(root, f"{{{ns_cfdi}}}Receptor")
    receptor.set("Rfc", "CTE950627K46")
    receptor.set("Nombre", "COMERCIALIZADORA TEODORIKAS")
    receptor.set("DomicilioFiscalReceptor", "57740")
    receptor.set("RegimenFiscalReceptor", "601")
    receptor.set("UsoCFDI", "G03")

    conceptos = ET.SubElement(root, f"{{{ns_cfdi}}}Conceptos")
    concepto = ET.SubElement(conceptos, f"{{{ns_cfdi}}}Concepto")
    concepto.set("ClaveProdServ", "84111506")
    concepto.set("NoIdentificacion", "PRUEBA")
    concepto.set("Cantidad", "1")
    concepto.set("ClaveUnidad", "E48")
    concepto.set("Unidad", "Servicio")
    concepto.set("Descripcion", descripcion[:1000])
    concepto.set("ValorUnitario", f"{monto:.2f}")
    concepto.set("Importe", f"{monto:.2f}")
    concepto.set("Descuento", "0.00")
    concepto.set("ObjetoImp", "02")
    impuestos_c = ET.SubElement(concepto, f"{{{ns_cfdi}}}Impuestos")
    traslados_c = ET.SubElement(impuestos_c, f"{{{ns_cfdi}}}Traslados")
    tras = ET.SubElement(traslados_c, f"{{{ns_cfdi}}}Traslado")
    tras.set("Base", f"{monto:.2f}")
    tras.set("Impuesto", "002")
    tras.set("TipoFactor", "Tasa")
    tras.set("TasaOCuota", "0.160000")
    tras.set("Importe", f"{iva:.2f}")

    impuestos = ET.SubElement(root, f"{{{ns_cfdi}}}Impuestos")
    impuestos.set("TotalImpuestosTrasladados", f"{iva:.2f}")
    traslados = ET.SubElement(impuestos, f"{{{ns_cfdi}}}Traslados")
    tr = ET.SubElement(traslados, f"{{{ns_cfdi}}}Traslado")
    tr.set("Base", f"{monto:.2f}")
    tr.set("Impuesto", "002")
    tr.set("TipoFactor", "Tasa")
    tr.set("TasaOCuota", "0.160000")
    tr.set("Importe", f"{iva:.2f}")

    return ET.tostring(root, encoding="unicode", method="xml")


def _cfdi4_xml_factura_real(
    receptor: dict,
    conceptos: list,
    rfc_emisor: str,
    nombre_emisor: str,
    lugar_expedicion: str,
    regimen_fiscal: str,
    folio: str,
    fecha: str,
) -> str:
    """Genera CFDI 4.0 con receptor y conceptos variables para factura real. conceptos: [{'descripcion','cantidad','valor_unitario','clave_prod_serv','unidad','clave_unidad'}, ...]"""
    ns_cfdi = "http://www.sat.gob.mx/cfd/4"
    ns_xsi = "http://www.w3.org/2001/XMLSchema-instance"
    schema = "http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
    ET.register_namespace("cfdi", ns_cfdi)
    ET.register_namespace("xsi", ns_xsi)
    rfc_r = (receptor.get("rfc") or "").strip() or "CTE950627K46"
    nombre_r = (receptor.get("nombre") or receptor.get("razon_social") or "RECEPTOR")[:300]
    dom_r = (receptor.get("domicilio_fiscal") or receptor.get("codigo_postal") or "57740").strip()
    regimen_r = (receptor.get("regimen_fiscal") or "601").strip()
    uso_r = (receptor.get("uso_cfdi") or "G03").strip()

    # Para receptor genérico XAXX010101000 ("PUBLICO EN GENERAL"), SAT exige:
    # - InformacionGlobal (CFDI40130)
    # - DomicilioFiscalReceptor igual a LugarExpedicion (CFDI40149)
    if rfc_r.upper() == "XAXX010101000" and "PUBLICO EN GENERAL" in (nombre_r or "").upper():
        dom_r = (lugar_expedicion or dom_r).strip()
        # Defaults de pruebas recomendados para receptor genérico:
        # UsoCFDI válido y régimen receptor genérico.
        uso_r = "S01"
        regimen_r = "616"

    subtotal = 0.0
    total_iva = 0.0
    for c in conceptos:
        qty = max(0.01, float(c.get("cantidad") or 1))
        vunit = max(1.0, float(c.get("valor_unitario") or 0))
        importe = round(qty * vunit, 2)
        iva_linea = round(importe * 0.16, 2)
        subtotal += importe
        total_iva += iva_linea
    total = round(subtotal + total_iva, 2)
    subtotal = round(subtotal, 2)
    total_iva = round(total_iva, 2)

    root = ET.Element(f"{{{ns_cfdi}}}Comprobante")
    root.set("Version", "4.0")
    root.set("Serie", "P")
    root.set("Folio", folio)
    root.set("Fecha", fecha)
    root.set("Sello", "")
    root.set("NoCertificado", "")
    root.set("Certificado", "")
    root.set("FormaPago", "01")
    root.set("SubTotal", f"{subtotal:.2f}")
    root.set("Descuento", "0.00")
    root.set("Moneda", "MXN")
    root.set("TipoCambio", "1")
    root.set("Total", f"{total:.2f}")
    root.set("TipoDeComprobante", "I")
    root.set("Exportacion", "01")
    root.set("MetodoPago", "PUE")
    root.set("LugarExpedicion", lugar_expedicion or "37448")
    root.set(f"{{{ns_xsi}}}schemaLocation", schema)

    # Regla CFDI 4.0: Si Receptor es XAXX010101000 y Nombre contiene "PUBLICO EN GENERAL",
    # debe existir InformacionGlobal (CFDI40130). El orden del nodo importa.
    if (rfc_r or "").upper() == "XAXX010101000" and "PUBLICO EN GENERAL" in (nombre_r or "").upper():
        info = ET.SubElement(root, f"{{{ns_cfdi}}}InformacionGlobal")
        info.set("Periodicidad", "01")  # Diario (catPeriodicidad)
        info.set("Meses", datetime.now().strftime("%m"))  # 01-12 (catMeses)
        info.set("Año", datetime.now().strftime("%Y"))

    emisor = ET.SubElement(root, f"{{{ns_cfdi}}}Emisor")
    emisor.set("Rfc", rfc_emisor or "VAZD9407305PA")
    emisor.set("Nombre", (nombre_emisor or "EMISOR")[:300])
    emisor.set("RegimenFiscal", regimen_fiscal or "626")

    rec = ET.SubElement(root, f"{{{ns_cfdi}}}Receptor")
    rec.set("Rfc", rfc_r)
    rec.set("Nombre", nombre_r)
    rec.set("DomicilioFiscalReceptor", dom_r)
    rec.set("RegimenFiscalReceptor", regimen_r)
    rec.set("UsoCFDI", uso_r)

    conceptos_el = ET.SubElement(root, f"{{{ns_cfdi}}}Conceptos")
    for i, c in enumerate(conceptos):
        qty = max(0.01, float(c.get("cantidad") or 1))
        vunit = max(1.0, float(c.get("valor_unitario") or 0))
        importe = round(qty * vunit, 2)
        iva_linea = round(importe * 0.16, 2)
        desc = (c.get("descripcion") or "Concepto")[:1000]
        clave = (c.get("clave_prod_serv") or "84111506").strip()
        unidad = (c.get("unidad") or "Servicio").strip()
        clave_und = (c.get("clave_unidad") or "E48").strip()
        con = ET.SubElement(conceptos_el, f"{{{ns_cfdi}}}Concepto")
        con.set("ClaveProdServ", clave)
        con.set("NoIdentificacion", str(i + 1))
        con.set("Cantidad", f"{qty:.2f}")
        con.set("ClaveUnidad", clave_und)
        con.set("Unidad", unidad)
        con.set("Descripcion", desc)
        con.set("ValorUnitario", f"{vunit:.2f}")
        con.set("Importe", f"{importe:.2f}")
        con.set("Descuento", "0.00")
        con.set("ObjetoImp", "02")
        imp_c = ET.SubElement(con, f"{{{ns_cfdi}}}Impuestos")
        tras_c = ET.SubElement(imp_c, f"{{{ns_cfdi}}}Traslados")
        tr = ET.SubElement(tras_c, f"{{{ns_cfdi}}}Traslado")
        tr.set("Base", f"{importe:.2f}")
        tr.set("Impuesto", "002")
        tr.set("TipoFactor", "Tasa")
        tr.set("TasaOCuota", "0.160000")
        tr.set("Importe", f"{iva_linea:.2f}")

    impuestos = ET.SubElement(root, f"{{{ns_cfdi}}}Impuestos")
    impuestos.set("TotalImpuestosTrasladados", f"{total_iva:.2f}")
    traslados = ET.SubElement(impuestos, f"{{{ns_cfdi}}}Traslados")
    tr = ET.SubElement(traslados, f"{{{ns_cfdi}}}Traslado")
    tr.set("Base", f"{subtotal:.2f}")
    tr.set("Impuesto", "002")
    tr.set("TipoFactor", "Tasa")
    tr.set("TasaOCuota", "0.160000")
    tr.set("Importe", f"{total_iva:.2f}")

    return ET.tostring(root, encoding="unicode", method="xml")


class FinkokClient:
    """Cliente Finkok SOAP (sign_stamp = sella y timbra)."""

    URL_DEMO = "https://demo-facturacion.finkok.com/servicios/soap/stamp"
    URL_PROD = "https://facturacion.finkok.com/servicios/soap/stamp"

    def __init__(self, username: str = None, password: str = None, sandbox: bool = None):
        cfg = _load_config()
        self.username = (username or cfg["user"]).strip()
        self.password = (password or cfg["password"]).strip()
        self.username_alt = (cfg.get("user_alt") or "").strip()
        self.password_alt = (cfg.get("password_alt") or "").strip()
        self.issuer_rfc = (cfg["rfc"] or "VAZD9407305PA").strip()
        self.issuer_name = (cfg["nombre"] or "DANIEL YUSEL VALDES ZUÑIGA").strip()
        self.lugar_expedicion = (cfg["lugar_expedicion"] or "37448").strip()
        self.regimen_fiscal = (cfg["regimen"] or "626").strip()
        self.sandbox = sandbox if sandbox is not None else cfg.get("sandbox", True)
        self.url = self.URL_DEMO if self.sandbox else self.URL_PROD

    def timbrar_factura_prueba(self, monto: float = 1000.0, descripcion: str = "Servicio de prueba") -> dict:
        """
        Timbra una factura de prueba. Finkok sella y timbra (sign_stamp) con certificados de prueba.
        Requiere FINKOK_USER y FINKOK_PASSWORD en config_instituto.json (cuenta demo en finkok.com).
        """
        if not self.username or not self.password:
            return {
                "exito": False,
                "error": "Faltan FINKOK_USER y FINKOK_PASSWORD. Regístrate en demo-facturacion.finkok.com y ponlos en config_instituto.json.",
            }

        try:
            # SAT CFDI 4.0: el Importe del Traslado debe estar en rango permitido (CFDI40180).
            # Montos muy pequeños (ej. 0.10) generan IVA/redondeos fuera de rango. Mínimo 1.00 MXN.
            monto_validado = max(1.0, float(monto)) if monto is not None else 1.0
            iva = round(monto_validado * 0.16, 2)
            total = round(monto_validado + iva, 2)
            fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
            descripcion_limpia = (descripcion or "").strip() or "Servicio de prueba"
            folio = datetime.now().strftime("%H%M%S")

            xml_str = _cfdi4_xml(
                monto_validado, total, iva, descripcion_limpia, folio, fecha,
                rfc_emisor=self.issuer_rfc,
                nombre_emisor=self.issuer_name,
                lugar_expedicion=self.lugar_expedicion,
                regimen_fiscal=self.regimen_fiscal,
            )
            xml_b64 = base64.b64encode(xml_str.encode("utf-8")).decode("ascii")

            soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:sign_stamp>
         <stam:xml>{xml_b64}</stam:xml>
         <stam:username>{_xml_escape(self.username)}</stam:username>
         <stam:password>{_xml_escape(self.password)}</stam:password>
      </stam:sign_stamp>
   </soapenv:Body>
</soapenv:Envelope>"""

            headers = {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": "sign_stamp",
            }
            resp = requests.post(self.url, data=soap_body.encode("utf-8"), headers=headers, timeout=30)

            if resp.status_code != 200:
                return {"exito": False, "error": f"HTTP {resp.status_code}: {resp.text[:500]}"}

            root = ET.fromstring(resp.content)
            ns = {"soap": "http://schemas.xmlsoap.org/soap/envelope/", "stam": "http://facturacion.finkok.com/stamp"}
            result = root.find(".//stam:sign_stampResponse/stam:sign_stampResult", ns)
            if result is None:
                for elem in root.iter():
                    if elem.tag and "sign_stampResult" in elem.tag:
                        result = elem
                        break
            if result is None:
                fault = root.find(".//soap:Fault", ns) or root.find(".//{http://schemas.xmlsoap.org/soap/envelope/}Fault")
                if fault is not None:
                    for node in fault:
                        if node.tag and "faultstring" in (node.tag or ""):
                            return {"exito": False, "error": (node.text or "").strip() or resp.text[:400]}
                return {"exito": False, "error": f"Respuesta inesperada: {resp.text[:400]}"}

            def local_tag(elem):
                if elem is None or not elem.tag:
                    return ""
                return elem.tag.split("}")[-1]

            def text_of(parent, local_name):
                if parent is None:
                    return None
                for c in parent.iter():
                    if local_tag(c) == local_name:
                        t = (c.text or "").strip()
                        if t:
                            return t
                        for sub in c:
                            if sub.text and sub.text.strip():
                                return sub.text.strip()
                return None

            uuid_ = text_of(result, "UUID")
            xml_timbrado = text_of(result, "xml")
            cod_estatus = text_of(result, "CodEstatus")
            faultcode = text_of(result, "faultcode")
            faultstring = text_of(result, "faultstring")
            incidencias = []
            for inc in result.iter():
                if local_tag(inc) == "Incidencia":
                    for d in inc:
                        if local_tag(d) == "Mensaje":
                            msg = (d.text or "").strip()
                            if msg:
                                incidencias.append(msg)
                        elif local_tag(d) == "CodigoError":
                            incidencias.append(f"Código: {(d.text or '').strip()}")

            if faultcode or (faultstring and "0" not in (cod_estatus or "")):
                err = faultstring or "; ".join(incidencias) or cod_estatus or "Error Finkok"
                return {"exito": False, "error": err}

            if uuid_:
                return {
                    "exito": True,
                    "uuid": uuid_,
                    "folio": folio,
                    "url_pdf": "",
                    "url_xml": "",
                    "xml_timbrado": xml_timbrado,
                    "mensaje": "✅ Factura timbrada con Finkok (sign_stamp).",
                }

            err_detail = faultstring or "; ".join(incidencias) if incidencias else cod_estatus
            if err_detail:
                inc_str = "; ".join(incidencias)
                if "702" in str(cod_estatus or "") or "702" in inc_str:
                    err_detail = (
                        "702 - Finkok no aceptó usuario/contraseña. Revisa:\n"
                        "(1) Si te registraste en facturacion.finkok.com (producción), en config_instituto.json pon \"FINKOK_SANDBOX\": false.\n"
                        "(2) Usuario y contraseña son los del portal (mismo correo y contraseña con los que entras).\n"
                        "(3) Si aun así falla, confirma con soporte@finkok.com que tu cuenta tenga acceso a Web Services."
                    )
                elif "300" in str(cod_estatus or "") or "300" in inc_str:
                    err_detail = (
                        "300 - El RFC del emisor no está dado de alta en Finkok.\n\n"
                        "En el portal Finkok (Facturación → Clientes) solo puedes timbrar con los RFC que aparecen en \"Timbres por Cliente\". "
                        "Debes agregar el RFC " + (self.issuer_rfc or "del emisor") + " como cliente y subir el CSD (certificado .cer y llave .key).\n\n"
                        "Mientras tanto, para probar el timbrado puedes usar un RFC que ya esté en tu panel: en config_instituto.json pon "
                        "FINKOK_ISSUER_RFC, FINKOK_ISSUER_NAME, FINKOK_LUGAR_EXPEDICION y FINKOK_REGIMEN de ese cliente (ej. RARF9311211S9 si es el que tienes)."
                    )
                return {"exito": False, "error": err_detail}
            return {"exito": False, "error": "No se obtuvo UUID en la respuesta. Revisa que la cuenta demo esté activa y que el XML sea válido (Finkok puede devolver errores dentro del cuerpo SOAP)."}

        except requests.exceptions.RequestException as e:
            return {"exito": False, "error": str(e)}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def timbrar_factura_real(
        self,
        receptor: dict,
        conceptos: list,
        folio: str = None,
    ) -> dict:
        """Timbra una factura real con receptor y conceptos indicados. receptor: rfc, nombre, domicilio_fiscal, regimen_fiscal, uso_cfdi. conceptos: [{'descripcion','cantidad','valor_unitario','clave_prod_serv','unidad','clave_unidad'}, ...]"""
        if not self.username or not self.password:
            return {"exito": False, "error": "Faltan FINKOK_USER y FINKOK_PASSWORD en config_instituto.json."}
        if not conceptos:
            return {"exito": False, "error": "Debe agregar al menos un concepto."}
        folio = (folio or datetime.now().strftime("%H%M%S")).strip()
        fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        try:
            xml_str = _cfdi4_xml_factura_real(
                receptor, conceptos,
                self.issuer_rfc, self.issuer_name, self.lugar_expedicion, self.regimen_fiscal,
                folio, fecha,
            )
            xml_b64 = base64.b64encode(xml_str.encode("utf-8")).decode("ascii")

            def local_tag(elem):
                if elem is None or not elem.tag:
                    return ""
                return elem.tag.split("}")[-1]

            def text_of(parent, local_name):
                if parent is None:
                    return None
                for c in parent.iter():
                    if local_tag(c) == local_name:
                        t = (c.text or "").strip()
                        if t:
                            return t
                        for sub in c:
                            if sub.text and sub.text.strip():
                                return sub.text.strip()
                return None

            def _elem_text(elem):
                if elem is None:
                    return ""
                return ("".join(elem.itertext()) or (elem.text or "")).strip()

            def _enviar_soap(operacion: str, soap_action: str, u: str, p: str) -> "requests.Response":
                tag = "sign_stamp" if operacion == "sign_stamp" else "stamp"
                soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:{tag}>
         <stam:xml>{xml_b64}</stam:xml>
         <stam:username>{_xml_escape(u)}</stam:username>
         <stam:password>{_xml_escape(p)}</stam:password>
      </stam:{tag}>
   </soapenv:Body>
</soapenv:Envelope>"""
                headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": soap_action}
                return requests.post(self.url, data=soap_body.encode("utf-8"), headers=headers, timeout=30)

            def intento_timbrar(u: str, p: str):
                for operacion, soap_action in [("sign_stamp", "sign_stamp"), ("stamp", "stamp")]:
                    r = _enviar_soap(operacion, soap_action, u, p)
                    if r.status_code != 200:
                        return {"exito": False, "error": f"HTTP {r.status_code}: {r.text[:400]}"}
                    root = ET.fromstring(r.content)
                    ns = {"soap": "http://schemas.xmlsoap.org/soap/envelope/", "stam": "http://facturacion.finkok.com/stamp"}
                    result = root.find(".//stam:sign_stampResponse/stam:sign_stampResult", ns) or root.find(".//stam:stampResponse/stam:stampResult", ns)
                    if result is None:
                        for elem in root.iter():
                            if elem.tag and ("sign_stampResult" in elem.tag or "stampResult" in elem.tag):
                                result = elem
                                break
                    if result is not None:
                        break
                    fault = root.find(".//soap:Fault", ns)
                    if fault is None:
                        break
                if result is None:
                    fault = root.find(".//soap:Fault", ns)
                    if fault is not None:
                        for node in fault:
                            if node.tag and "faultstring" in (node.tag or ""):
                                return {"exito": False, "error": (node.text or "").strip() or r.text[:300]}
                    return {"exito": False, "error": r.text[:300]}
                uuid_ = text_of(result, "UUID") or ""
                if not uuid_ and result is not None:
                    for child in result:
                        if local_tag(child) == "UUID":
                            uuid_ = _elem_text(child)
                            break
                xml_timbrado = text_of(result, "xml") or ""
                if not xml_timbrado and result is not None:
                    for child in result:
                        if local_tag(child) == "xml":
                            xml_timbrado = _elem_text(child)
                            break
                if uuid_:
                    modo = "modo pruebas (demo)" if self.sandbox else "produccion"
                    return {"exito": True, "uuid": uuid_, "folio": folio, "xml_timbrado": xml_timbrado, "mensaje": f"Factura timbrada correctamente. [{modo}: {self.url}]"}
                cod = text_of(result, "CodEstatus") or ""
                mensaje = text_of(result, "Mensaje") or ""
                incidencias = []
                for inc in result.iter():
                    if local_tag(inc) == "Incidencia":
                        msg_inc = None
                        cod_inc = None
                        for d in inc:
                            if local_tag(d) in ("Mensaje", "MensajeIncidencia"):
                                msg_inc = (d.text or "").strip() or _elem_text(d)
                            elif local_tag(d) == "CodigoError":
                                cod_inc = (d.text or "").strip() or _elem_text(d)
                        if cod_inc and msg_inc:
                            incidencias.append(f"{cod_inc} - {msg_inc}")
                        elif msg_inc:
                            incidencias.append(msg_inc)
                        elif cod_inc:
                            incidencias.append(f"Codigo: {cod_inc}")
                err_parts = [x for x in [cod, mensaje] if x]
                if incidencias:
                    err_parts.append("; ".join(incidencias))
                if not err_parts:
                    raw_snippet = (r.text or "")[:550].replace("\r", "").replace("\n", " ")
                    err_parts.append("No se obtuvo UUID. Revisa usuario/contraseña, receptor dado de alta en Finkok y XML valido (valor unit. >= 1.00).")
                    if raw_snippet:
                        err_parts.append("Respuesta Finkok: " + raw_snippet)
                err_msg = " ".join(err_parts)
                if cod.strip() == "702" or any(i.strip() == "Codigo: 702" for i in incidencias):
                    err_msg = "702 - Usuario o contraseña Finkok incorrectos. Verifica FINKOK_USER y FINKOK_PASSWORD en config_instituto.json (cuenta demo-facturacion.finkok.com)."
                elif "705" in err_msg or any("705" in i for i in incidencias):
                    modo_actual = "modo pruebas (demo)" if self.sandbox else "produccion"
                    err_msg = (
                        "705 - No hay timbres disponibles para el emisor " + (self.issuer_rfc or "") + ". "
                        "Se esta usando: " + self.url + " [" + modo_actual + "]. "
                        "Si sus timbres estan en el otro portal, cambie en config_instituto.json: FINKOK_SANDBOX = true para demo, false para produccion. "
                        "Entra al portal correspondiente, inicia sesion y revisa Clientes/Timbres para ese RFC."
                    )
                elif "300" in err_msg or any("300" in i for i in incidencias):
                    err_msg = f"300 - El RFC del emisor ({self.issuer_rfc}) no esta dado de alta en Finkok. En el portal agrega el cliente/emisor y sube el CSD, o usa en config el RFC de un cliente que ya tengas en Finkok."
                return {"exito": False, "error": err_msg, "xml_sin_timbrar": xml_str}

            res = intento_timbrar(self.username, self.password)
            if not res.get("exito") and self.username_alt and self.password_alt:
                res = intento_timbrar(self.username_alt, self.password_alt)
            if not res.get("exito") and not res.get("xml_sin_timbrar"):
                res["xml_sin_timbrar"] = xml_str
            return res
        except Exception as e:
            return {"exito": False, "error": str(e)}
