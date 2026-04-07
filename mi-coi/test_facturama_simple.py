import os
import requests
import base64
import json
from datetime import datetime

username = os.getenv("FACTURAMA_USER") or "Juanito2413"
password = os.getenv("FACTURAMA_PASSWORD") or "trabajos47"

# Credenciales
credentials = f"{username}:{password}"
token = base64.b64encode(credentials.encode()).decode()
headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json"
}

print("="*60)
print("PRUEBA SIMPLE DE FACTURAMA")
print("="*60)

# 1. Crear factura mínima
fecha = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
factura_data = {
    "Folio": 1,
    "Serie": "P",
    "Fecha": fecha,
    "Receptor": {
        "Rfc": "EKU9003173C9",
        "Name": "Cliente Prueba SAT",
        "CfdiUse": "G03"
    },
    "Conceptos": [
        {
            "ClaveProdServ": "84111506",
            "Cantidad": 1,
            "ClaveUnidad": "E48",
            "Unidad": "Servicio",
            "Descripcion": "Prueba simple",
            "ValorUnitario": 100.0,
            "Importe": 100.0
        }
    ],
    "TipoCFDI": "I",
    "Moneda": "MXN",
    "LugarExpedicion": "45079",
    "MetodoPago": "PUE",
    "FormaPago": "01",
    "Total": 100.0,
    "Email": "cliente@prueba.com",
    "CfdiType": "I"
}

print("\n📤 Enviando factura...")
response = requests.post(
    "https://apisandbox.facturama.mx/Cfdi",
    headers=headers,
    data=json.dumps(factura_data)
)

print(f"📥 Código: {response.status_code}")
print(f"📥 Respuesta: {response.text}")
