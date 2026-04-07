# test_facturapi_final.py
import requests
import json

# Usar Test Secret Key con URL CORRECTA (con www)
api_key = "sk_test_FmRoCPiogqBoCjhS5pRH4bMeRvmZbu9FsLazUd3GWW"
base_url = "https://www.facturapi.io/v2"  # URL CORREGIDA - con www
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

print("="*70)
print("PRUEBA DE CONEXIÓN CON FACTURAPI - URL OFICIAL")
print("="*70)
print(f"URL: {base_url}")
print(f"API Key: {api_key[:15]}...")
print("="*70)

# Probar primero un GET simple para verificar conectividad
try:
    print("\n📌 Probando conectividad básica...")
    test_response = requests.get("https://www.facturapi.io", timeout=5)
    print(f"✅ Sitio web accesible (código: {test_response.status_code})")
except Exception as e:
    print(f"❌ No se puede acceder a facturapi.io: {e}")
    print("Verifica tu conexión a internet o si el sitio está bloqueado")

print("\n📌 1. Creando cliente de prueba...")
customer_data = {
    "legal_name": "Cliente Prueba SAT",
    "tax_id": "EKU9003173C9",
    "tax_system": "601",
    "email": "cliente@prueba.com",
    "address": {
        "zip": "45079"
    }
}

print(f"Datos enviados: {json.dumps(customer_data, indent=2)}")

try:
    response = requests.post(
        f"{base_url}/customers",
        headers=headers,
        data=json.dumps(customer_data),
        timeout=10
    )

    print(f"\n📥 Código de respuesta: {response.status_code}")
    print(f"Respuesta: {json.dumps(response.json(), indent=2)}")

    if response.status_code in [200, 201]:
        customer = response.json()
        print(f"\n✅ Cliente creado exitosamente!")
        print(f"ID: {customer.get('id')}")
        
        # 2. Probar crear una factura
        print("\n📌 2. Creando factura de prueba...")
        invoice_data = {
            "customer": customer['id'],
            "items": [
                {
                    "quantity": 1,
                    "product": {
                        "description": "Servicio de prueba",
                        "product_key": "84111506",
                        "price": 1000.00,
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
            f"{base_url}/invoices",
            headers=headers,
            data=json.dumps(invoice_data),
            timeout=10
        )
        
        print(f"\n📥 Código de respuesta: {invoice_response.status_code}")
        print(f"Respuesta: {json.dumps(invoice_response.json(), indent=2)}")
        
        if invoice_response.status_code in [200, 201]:
            invoice = invoice_response.json()
            print(f"\n✅ FACTURA TIMBRADA EXITOSAMENTE!")
            print(f"UUID: {invoice.get('id')}")
            print(f"Folio: {invoice.get('folio_number')}")
            print(f"PDF: {invoice.get('pdf_url')}")
            print(f"XML: {invoice.get('xml_url')}")
        else:
            print(f"\n❌ Error al crear factura: {invoice_response.text}")
    else:
        print(f"\n❌ Error al crear cliente: {response.text}")

except requests.exceptions.ConnectionError as e:
    print(f"\n❌ Error de conexión: {e}")
    print("Posibles causas:")
    print("1. La URL es incorrecta (debería ser https://www.facturapi.io/v2)")
    print("2. No tienes conexión a internet")
    print("3. El firewall está bloqueando la conexión")
    print("4. El servicio de Facturapi está caído")
except Exception as e:
    print(f"\n❌ Error inesperado: {e}")