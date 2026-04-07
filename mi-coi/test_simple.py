# test_simple.py
import requests
import json

api_key = "sk_test_FmRoCPiogqBoCjhS5pRH4bMeRvmZbu9FsLazUd3GWW"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

# Probar crear un cliente
customer_data = {
    "legal_name": "Cliente Prueba",
    "tax_id": "EKU9003173C9",
    "email": "test@test.com"
}

response = requests.post(
    "https://www.facturapi.io/v2/customers",
    headers=headers,
    data=json.dumps(customer_data)
)

print(f"Código: {response.status_code}")
print(f"Respuesta: {response.text}")