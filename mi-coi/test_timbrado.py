# test_timbrado.py
from backend.modules.facturapi_integration import FacturapiClient

cliente = FacturapiClient()
resultado = cliente.timbrar_factura_prueba(1500.00, "Prueba directa desde script")
print(resultado)