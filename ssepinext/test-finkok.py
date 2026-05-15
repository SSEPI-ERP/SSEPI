import sys, os, json
sys.path.insert(0, r'E:\SSEPI\mi-coi')

from backend.modules.fiscal import FiscalSAT

print('[TEST] Probando Finkok con factura de prueba...')
print('[TEST] Usuario: administracion@ssepi.org')
print('[TEST] RFC emisor: RARF9311211S9')
print('[TEST] Modo: demo (sandbox)')
print()

fiscal = FiscalSAT(proveedor="finkok")
resultado = fiscal.timbrar_factura_prueba(monto=1500.0, descripcion="Servicio de reparacion motor")

print(json.dumps(resultado, indent=2, ensure_ascii=False))
