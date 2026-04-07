import os
import requests
import base64
import json

username = os.getenv("FACTURAMA_USER") or "Juanito2413"
password = os.getenv("FACTURAMA_PASSWORD") or "trabajos47"

credentials = f"{username}:{password}"
token = base64.b64encode(credentials.encode()).decode()

headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json"
}

print("="*50)
print("PRUEBA DE CONEXIÓN CON FACTURAMA")
print(f"Usuario: {username}")
print("="*50)

# Probar obteniendo la lista de clientes
response = requests.get(
    "https://apisandbox.facturama.mx/Client",
    headers=headers
)

print(f"Código: {response.status_code}")
if response.status_code == 200:
    print("✅ CONEXIÓN EXITOSA!")
    print(f"Clientes encontrados: {len(response.json())}")
else:
    print(f"❌ Error: {response.text}")
