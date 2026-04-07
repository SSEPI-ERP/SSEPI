import os
import requests
import json
from datetime import datetime

class FacturapiClient:
    def __init__(self, api_key: str = None):
        """
        Cliente para Facturapi usando requests directamente
        """
        env_key = os.getenv("FACTURAPI_API_KEY")
        self.api_key = api_key or env_key or "sk_test_FmRoCPiogqBoCjhS5pRH4bMeRvmZbu9FsLazUd3GWW"
        self.base_url = "https://www.facturapi.io/v2"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def timbrar_factura_prueba(self, monto: float = 1000.0, descripcion: str = "Servicio de prueba") -> dict:
        """
        Timbra una factura de prueba usando Facturapi
        """
        try:
            # Crear un cliente de prueba
            customer_data = {
                "legal_name": "Cliente de Prueba",
                "tax_id": "EKU9003173C9",
                "tax_system": "601",
                "email": "cliente@prueba.com",
                "address": {
                    "zip": "45079"
                }
            }
            
            customer_response = requests.post(
                f"{self.base_url}/customers",
                headers=self.headers,
                data=json.dumps(customer_data)
            )
            
            if customer_response.status_code not in [200, 201]:
                return {"exito": False, "error": f"Error creando cliente: {customer_response.text}"}
            
            customer = customer_response.json()
            
            # Crear la factura
            invoice_data = {
                "customer": customer['id'],
                "items": [
                    {
                        "quantity": 1,
                        "product": {
                            "description": descripcion,
                            "product_key": "84111506",
                            "price": monto,
                            "unit_key": "E48",
                            "unit_name": "Servicio"
                        }
                    }
                ],
                "payment_form": "01",
                "folio_number": 1,
                "series": "P",
                "use": "G03",
                "currency": "MXN",
                "exchange": 1
            }
            
            invoice_response = requests.post(
                f"{self.base_url}/invoices",
                headers=self.headers,
                data=json.dumps(invoice_data)
            )
            
            if invoice_response.status_code not in [200, 201]:
                return {
                    "exito": False, 
                    "error": f"Error creando factura: {invoice_response.text}"
                }
            
            invoice = invoice_response.json()
            
            return {
                "exito": True,
                "uuid": invoice.get("id"),
                "folio": invoice.get("folio_number"),
                "url_pdf": invoice.get("pdf_url"),
                "url_xml": invoice.get("xml_url"),
                "mensaje": "✅ Factura timbrada exitosamente en Facturapi"
            }
            
        except Exception as e:
            return {
                "exito": False,
                "error": str(e)
            }
