# test_facturama_timbrado.py
import json
from backend.modules.facturama_integration import FacturamaClient

print("="*70)
print("PRUEBA DE TIMBRADO CON FACTURAMA SANDBOX")
print("="*70)

# Crear cliente (sandbox=True por defecto = GRATIS)
cliente = FacturamaClient()

print("\n📤 Intentando timbrar factura de prueba...")
resultado = cliente.timbrar_factura_prueba(1500.00, "Servicios contables de prueba")

print("\n📥 RESULTADO DEL TIMBRADO:")
print(json.dumps(resultado, indent=2, default=str))

if resultado['exito']:
    print("\n✅ ¡FACTURA TIMBRADA EXITOSAMENTE!")
    print(f"UUID: {resultado.get('uuid')}")
    print(f"Folio: {resultado.get('folio')}")
    print(f"PDF: {resultado.get('url_pdf')}")
    print(f"XML: {resultado.get('url_xml')}")
    print("\n🌐 Ambiente: SANDBOX (PRUEBAS GRATIS)")
    print("💰 Costo: $0.00 MXN")
else:
    print(f"\n❌ Error: {resultado.get('error')}")