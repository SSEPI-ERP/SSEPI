import requests, base64, xml.etree.ElementTree as ET, json, os
from datetime import datetime

# Cargar config
config_path = r'E:\SSEPI\mi-coi\config_instituto.json'
with open(config_path, 'r', encoding='utf-8') as f:
    cfg = json.load(f)

user = cfg.get('FINKOK_USER', '').strip()
password = cfg.get('FINKOK_PASSWORD', '').strip()
rfc = cfg.get('FINKOK_ISSUER_RFC', 'RARF9311211S9').strip()
name = cfg.get('FINKOK_ISSUER_NAME', '').strip()
lugar = cfg.get('FINKOK_LUGAR_EXPEDICION', '06300').strip()
regimen = cfg.get('FINKOK_REGIMEN', '605').strip()

url = "https://demo-facturacion.finkok.com/servicios/soap/stamp"

monto = 1500.0
iva = round(monto * 0.16, 2)
total = round(monto + iva, 2)
fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
folio = datetime.now().strftime("%H%M%S")

# Generar XML CFDI 4.0
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
root.set("LugarExpedicion", lugar)
root.set(f"{{{ns_xsi}}}schemaLocation", schema)

emisor = ET.SubElement(root, f"{{{ns_cfdi}}}Emisor")
emisor.set("Rfc", rfc)
emisor.set("Nombre", name[:300])
emisor.set("RegimenFiscal", regimen)

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
concepto.set("Descripcion", "Servicio de reparacion motor")
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

xml_str = ET.tostring(root, encoding="unicode", method="xml")
xml_b64 = base64.b64encode(xml_str.encode("utf-8")).decode("ascii")

soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
   <soapenv:Header/>
   <soapenv:Body>
      <stam:sign_stamp>
         <stam:xml>{xml_b64}</stam:xml>
         <stam:username>{user}</stam:username>
         <stam:password>{password}</stam:password>
      </stam:sign_stamp>
   </soapenv:Body>
</soapenv:Envelope>"""

print(f"Enviando a {url}")
print(f"Usuario: {user}")
print(f"RFC emisor: {rfc}")
print()

headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": "sign_stamp"}
resp = requests.post(url, data=soap_body.encode("utf-8"), headers=headers, timeout=30)

print(f"HTTP Status: {resp.status_code}")
print()

if resp.status_code == 200:
    print("Respuesta SOAP recibida. Parseando...")
    root_resp = ET.fromstring(resp.content)
    ns = {"soap": "http://schemas.xmlsoap.org/soap/envelope/", "stam": "http://facturacion.finkok.com/stamp"}
    result = root_resp.find(".//stam:sign_stampResponse/stam:sign_stampResult", ns)
    if result is None:
        for elem in root_resp.iter():
            if elem.tag and "sign_stampResult" in elem.tag:
                result = elem
                break

    if result is not None:
        def local_tag(elem):
            return elem.tag.split("}")[-1] if elem is not None and elem.tag else ""
        def text_of(parent, local_name):
            if parent is None: return None
            for c in parent.iter():
                if local_tag(c) == local_name:
                    t = (c.text or "").strip()
                    if t: return t
                    for sub in c:
                        if sub.text and sub.text.strip():
                            return sub.text.strip()
            return None

        uuid_ = text_of(result, "UUID")
        cod = text_of(result, "CodEstatus")
        msg = text_of(result, "Mensaje")

        if uuid_:
            print(f"EXITO: UUID = {uuid_}")
            print(f"Folio: {folio}")
            print(f"CodEstatus: {cod}")
            print(f"Mensaje: {msg}")
        else:
            print(f"Sin UUID. CodEstatus: {cod}")
            print(f"Mensaje: {msg}")

            incidencias = []
            for inc in result.iter():
                if local_tag(inc) == "Incidencia":
                    for d in inc:
                        if local_tag(d) == "Mensaje":
                            m = (d.text or "").strip()
                            if m: incidencias.append(m)
                        elif local_tag(d) == "CodigoError":
                            incidencias.append(f"Cod: {(d.text or '').strip()}")
            if incidencias:
                print("Incidencias:")
                for i in incidencias:
                    print(f"  - {i}")
    else:
        print("No se encontro sign_stampResult")
        print("Primeros 500 chars:")
        print(resp.text[:500])
else:
    print(f"HTTP error: {resp.status_code}")
    print(resp.text[:500])
