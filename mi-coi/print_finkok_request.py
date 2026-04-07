from __future__ import annotations

import base64
from datetime import datetime

from backend.modules.finkok_integration import FinkokClient, _cfdi4_xml_factura_real


def main() -> None:
    c = FinkokClient()
    receptor = {
        "rfc": "RARF9311211S9",
        "nombre": "FRANCISCO SANTIAGO RAMIREZ ROSALES",
        "domicilio_fiscal": "06300",
        "regimen_fiscal": "605",
        "uso_cfdi": "G03",
    }
    conceptos = [
        {
            "descripcion": "Servicio prueba",
            "cantidad": 1,
            "valor_unitario": 100,
            "clave_prod_serv": "84111506",
            "unidad": "Servicio",
            "clave_unidad": "E48",
        }
    ]
    folio = datetime.now().strftime("%H%M%S")
    fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    xml = _cfdi4_xml_factura_real(
        receptor,
        conceptos,
        c.issuer_rfc,
        c.issuer_name,
        c.lugar_expedicion,
        c.regimen_fiscal,
        folio,
        fecha,
    )
    b64 = base64.b64encode(xml.encode("utf-8")).decode("ascii")
    soap = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:stam="http://facturacion.finkok.com/stamp">
  <soapenv:Header/>
  <soapenv:Body>
    <stam:sign_stamp>
      <stam:xml>{b64}</stam:xml>
      <stam:username>{c.username}</stam:username>
      <stam:password>{c.password}</stam:password>
    </stam:sign_stamp>
  </soapenv:Body>
</soapenv:Envelope>
"""
    print("ENDPOINT:", c.url)
    print("SOAPAction: sign_stamp")
    print(soap)


if __name__ == "__main__":
    main()

