"""
Wrapper Python para timbrado Finkok via SSEPI offline server.
Recibe JSON por stdin, devuelve JSON por stdout.
Uso: python finkok-timbrar-wrapper.py < payload.json
"""
import sys, json, os, base64
sys.path.insert(0, r'E:\SSEPI\mi-coi')

from backend.modules.fiscal import FiscalSAT

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"exito": False, "error": f"JSON invalido: {e}"}, ensure_ascii=False))
        return

    receptor = payload.get("receptor", {})
    conceptos = payload.get("conceptos", [])
    folio = payload.get("folio")

    if not conceptos:
        print(json.dumps({"exito": False, "error": "Debe agregar al menos un concepto"}, ensure_ascii=False))
        return

    try:
        fiscal = FiscalSAT(proveedor="finkok")
        resultado = fiscal.timbrar_factura_real(
            receptor=receptor,
            conceptos=conceptos,
            folio=folio
        )
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"exito": False, "error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
