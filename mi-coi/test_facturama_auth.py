"""
Prueba solo la autenticación con Facturama (cuenta instituto).
Muestra código de respuesta, cabeceras y cuerpo para diagnosticar 401.
Ejecutar: python test_facturama_auth.py
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Cargar config instituto
config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config_instituto.json")
if os.path.isfile(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    for k, v in cfg.items():
        if isinstance(v, str) and k.startswith("FACTURAMA_"):
            os.environ[k] = v.strip()

import requests

user = os.getenv("FACTURAMA_USER", "").strip()
password = os.getenv("FACTURAMA_PASSWORD", "").strip()
base_url = "https://apisandbox.facturama.mx/"

print("=" * 60)
print("Diagnóstico de autenticación Facturama (sandbox)")
print("=" * 60)
print(f"Usuario: {user}")
print(f"Contraseña: {'*' * len(password)} ({len(password)} caracteres)")
print(f"URL: {base_url}")
print()

# Probar GET TaxEntity (API Web) - a veces el permiso es distinto por modalidad
for name, url in [
    ("GET TaxEntity (API Web)", base_url + "TaxEntity"),
    ("GET api-lite/csds (API Multiemisor)", base_url + "api-lite/csds"),
    ("GET catalogs/PostalCodes (como en CURL de soporte)", base_url + "catalogs/PostalCodes?keyword=20001"),
]:
    print(f"--- {name} ---")
    try:
        r = requests.get(url, auth=(user, password), headers={"Content-Type": "application/json"}, timeout=10)
        print(f"  Código: {r.status_code}")
        print(f"  Cabeceras respuesta: {dict(r.headers)}")
        print(f"  Cuerpo: {r.text[:500] if r.text else '(vacío)'}")
    except Exception as e:
        print(f"  Error: {e}")
    print()

# Mostrar tu token Basic para que puedas pegarlo en el CURL de soporte
import base64
basic_token = base64.b64encode(f"{user}:{password}".encode()).decode()
print("--- Para el CURL que te pasó soporte ---")
print("Tu token Basic (usuario:contraseña en base64) es:")
print(basic_token)
print()
print("CURL completo (reemplaza ya está):")
print(f"""curl --location "https://apisandbox.facturama.mx/catalogs/PostalCodes?keyword=20001" -H "User-Agent: Juanperes" -H "Authorization: Basic {basic_token}" """)
print()

print("Si ambos dan 401, la API rechaza usuario/contraseña.")
print("Pregunta a soporte Facturama: ¿qué usuario y contraseña debo usar para Basic Auth en la API?")
