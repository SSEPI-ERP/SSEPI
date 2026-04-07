# test_facturama.py
import json
from backend.modules.facturama_integration import FacturamaClient

print("="*60)
print("PRUEBA DE CONEXIÓN CON FACTURAMA")
print("="*60)

cliente = FacturamaClient()
resultado = cliente.timbrar_factura_prueba(1500.00, "Prueba con Facturama")

print("\n📥 RESULTADO:")
print(json.dumps(resultado, indent=2, default=str))