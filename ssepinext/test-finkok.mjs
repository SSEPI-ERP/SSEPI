import sys
sys.path.insert(0, r'E:\SSEPI\mi-coi')

from backend.modules.fiscal import FiscalSAT

print('[TEST] Probando Finkok con factura de prueba...')
print('[TEST] Usuario: administracion@ssepi.org')
print('[TEST] RFC emisor: RARF9311211S9')
print('[TEST] Modo: demo (sandbox)')
print()

fiscal = FiscalSAT(proveedor="finkok")
resultado = fiscal.timbrar_factura_prueba(monto=1500.0, descripcion="Servicio de reparacion motor")

print()
if resultado.get('exito'):
    print(f'✅ FINKOK FUNCIONA')
    print(f'   UUID: {resultado.get("uuid")}')
    print(f'   Folio: {resultado.get("folio")}')
    print(f'   Mensaje: {resultado.get("mensaje")}')
    if resultado.get('xml_timbrado'):
        print(f'   XML recibido: {len(resultado["xml_timbrado"])} caracteres')
else:
    print(f'❌ FINKOK FALLÓ')
    print(f'   Error: {resultado.get("error")}')
    if resultado.get('xml_sin_timbrar'):
        print(f'   XML sin timbrar generado: {len(resultado["xml_sin_timbrar"])} caracteres')

print()
print('[TEST] Fin.')
