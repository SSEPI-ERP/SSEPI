# backend/modules/conectia_sw_integration.py
"""
Cliente para timbrado CFDI vía Conectia / SW Sapien (services.test.sw.com.mx).
Los CFDIs timbrados aparecen en el portal: https://portal.test.sw.com.mx/
"""
import os
import json
import requests
from datetime import datetime


def _load_token():
    """Token desde variable de entorno o config_instituto.json."""
    token = os.getenv("CONECTIA_SW_TOKEN", "").strip()
    if token:
        return token
    try:
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "config_instituto.json"
        )
        if os.path.isfile(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return (data.get("CONECTIA_SW_TOKEN") or "").strip()
    except Exception:
        pass
    return ""


class ConectiaSWClient:
    """Cliente para timbrado por API SW (Conectia ambiente pruebas)."""

    BASE_TEST = "https://services.test.sw.com.mx"
    BASE_PROD = "https://services.sw.com.mx"

    def __init__(self, token: str = None, sandbox: bool = True):
        self.token = (token or _load_token()).strip()
        self.sandbox = sandbox
        self.base_url = self.BASE_TEST if sandbox else self.BASE_PROD
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/jsontoxml",
        }

    def timbrar_factura_prueba(self, monto: float = 1000.0, descripcion: str = "Servicio de prueba") -> dict:
        """
        Timbra una factura de prueba con CFDI 4.0 (JSON).
        Emisor y receptor según lista oficial Conectia/SW (RFCs y domicilios fiscales de pruebas).
        El CFDI aparecerá en https://portal.test.sw.com.mx/
        """
        if not self.token:
            return {
                "exito": False,
                "error": "Falta CONECTIA_SW_TOKEN. Ponlo en config_instituto.json o variable de entorno.",
            }

        try:
            iva = round(monto * 0.16, 2)
            total = round(monto + iva, 2)
            fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
            descripcion_limpia = (descripcion or "").strip() or "Servicio de prueba"
            folio = datetime.now().strftime("%H%M%S")

            payload = {
                "Version": "4.0",
                "FormaPago": "01",
                "Serie": "P",
                "Folio": folio,
                "Fecha": fecha,
                "Sello": "",
                "NoCertificado": "",
                "Certificado": "",
                "CondicionesDePago": "Pago en una sola exhibición",
                "SubTotal": f"{monto:.2f}",
                "Descuento": "0.00",
                "Moneda": "MXN",
                "TipoCambio": "1",
                "Total": f"{total:.2f}",
                "TipoDeComprobante": "I",
                "Exportacion": "01",
                "MetodoPago": "PUE",
                "LugarExpedicion": "20928",
                "Emisor": {
                    "Rfc": "EKU9003173C9",
                    "Nombre": "ESCUELA KEMPER URGATE",
                    "RegimenFiscal": "601",
                },
                "Receptor": {
                    "Rfc": "CTE950627K46",
                    "Nombre": "COMERCIALIZADORA TEODORIKAS",
                    "DomicilioFiscalReceptor": "57740",
                    "RegimenFiscalReceptor": "601",
                    "UsoCFDI": "G03",
                },
                "Conceptos": [
                    {
                        "ClaveProdServ": "84111506",
                        "NoIdentificacion": "PRUEBA",
                        "Cantidad": "1",
                        "ClaveUnidad": "E48",
                        "Unidad": "Servicio",
                        "Descripcion": descripcion_limpia[:1000],
                        "ValorUnitario": f"{monto:.4f}",
                        "Importe": f"{monto:.2f}",
                        "Descuento": "0.00",
                        "ObjetoImp": "02",
                        "Impuestos": {
                            "Traslados": [
                                {
                                    "Base": f"{monto:.4f}",
                                    "Impuesto": "002",
                                    "TipoFactor": "Tasa",
                                    "TasaOCuota": "0.160000",
                                    "Importe": f"{iva:.4f}",
                                }
                            ]
                        },
                    }
                ],
                "Impuestos": {
                    "TotalImpuestosTrasladados": f"{iva:.2f}",
                    "Traslados": [
                        {
                            "Base": f"{monto:.2f}",
                            "Impuesto": "002",
                            "TipoFactor": "Tasa",
                            "TasaOCuota": "0.160000",
                            "Importe": f"{iva:.2f}",
                        }
                    ],
                },
            }

            url = f"{self.base_url}/v3/cfdi33/issue/json/v4"
            resp = requests.post(url, headers=self.headers, json=payload, timeout=30)

            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success" and data.get("data"):
                    d = data["data"]
                    return {
                        "exito": True,
                        "uuid": d.get("uuid"),
                        "folio": folio,
                        "url_pdf": "",  # El portal no devuelve URL PDF en esta respuesta
                        "url_xml": "",  # El XML viene en d.get("cfdi")
                        "xml_timbrado": d.get("cfdi"),
                        "fecha_timbrado": d.get("fechaTimbrado"),
                        "mensaje": "✅ Factura timbrada con Conectia/SW. Consúltala en portal.test.sw.com.mx",
                    }
                msg = data.get("message") or data.get("messageDetail") or resp.text
                return {"exito": False, "error": msg}

            err = resp.text
            try:
                j = resp.json()
                err = j.get("message") or j.get("messageDetail") or err
            except Exception:
                pass
            return {"exito": False, "error": f"{resp.status_code}: {err}"}

        except requests.exceptions.RequestException as e:
            return {"exito": False, "error": str(e)}
        except Exception as e:
            return {"exito": False, "error": str(e)}
