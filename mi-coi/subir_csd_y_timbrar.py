"""
Script para subir el CSD a Facturama (API Multiemisor / api-lite) y luego timbrar.
Usa POST api-lite/csds (no TaxEntity/UploadCsd). Los CSD subidos aquí son los que
usa api-lite/3/cfdis al timbrar.

Uso:
  1. Pon tus archivos .cer y .key en la carpeta csd (o en una subcarpeta).
  2. Ejecuta:
       set FACTURAMA_CSD_PASSWORD=tu_contraseña_del_sello
       python subir_csd_y_timbrar.py

  Cuenta instituto (pruebas RAFSF031015S, CDMX 06300):
       python subir_csd_y_timbrar.py --instituto
       (lee config_instituto.json; no depende de variables de PowerShell)

  En PowerShell, para definir el nombre del emisor (si hace falta):
       $env:FACTURAMA_ISSUER_NAME="Nombre exacto del .cer"
"""
import os
import sys
import json

# Asegurar que el backend esté en el path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Si se pasa --instituto, cargar config desde config_instituto.json (así no depende de env en PowerShell)
if "--instituto" in sys.argv or "-i" in sys.argv:
    sys.argv = [a for a in sys.argv if a not in ("--instituto", "-i")]
    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base_dir, "config_instituto.json")
    if os.path.isfile(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        for k, v in cfg.items():
            if isinstance(v, str) and k.startswith("FACTURAMA_"):
                os.environ[k] = v.strip()
        os.environ["FACTURAMA_CSD_PREFER_REAL"] = "1"  # Buscar .cer/.key primero en csd/Real
        print("(Perfil instituto cargado desde config_instituto.json)")
    else:
        print("Error: --instituto requiere el archivo config_instituto.json en la carpeta del proyecto.")
        sys.exit(1)

from backend.modules.facturama_integration import FacturamaClient


def leer_nombre_desde_cer(cer_path: str) -> str | None:
    """Obtiene el nombre/razón social del certificado .cer (DER). Usa O (Organization) o CN (Common Name)."""
    try:
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend
        from cryptography.x509.oid import NameOID
        with open(cer_path, "rb") as f:
            data = f.read()
        cert = x509.load_der_x509_certificate(data, default_backend())
        # En CSD mexicanos suele estar en O (organization) o en CN
        for oid in (NameOID.ORGANIZATION_NAME, NameOID.COMMON_NAME):
            attrs = cert.subject.get_attributes_for_oid(oid)
            if attrs:
                return attrs[0].value.strip()
    except Exception:
        pass
    return None


def leer_rfc_desde_cer(cer_path: str) -> str | None:
    """Obtiene el RFC del titular del certificado .cer (DER). En CSD mexicanos suele estar en serialNumber o x500UniqueIdentifier."""
    try:
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend
        from cryptography.x509.oid import NameOID
        import re
        with open(cer_path, "rb") as f:
            data = f.read()
        cert = x509.load_der_x509_certificate(data, default_backend())
        # serialNumber típico: " / VADA800927HSRSRL05" -> RFC 13 chars
        for oid in (NameOID.SERIAL_NUMBER, NameOID.X500_UNIQUE_IDENTIFIER):
            attrs = cert.subject.get_attributes_for_oid(oid)
            if attrs:
                val = attrs[0].value.strip()
                # Buscar RFC: 12-13 caracteres alfanuméricos (ej. EKU9003173C9 o VADA800927HS)
                m = re.search(r"[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{2,3}", val)
                if m:
                    return m.group(0)
    except Exception:
        pass
    return None


def buscar_cer_key(carpeta_base: str):
    """
    Busca archivos .cer y .key. Si hay un par con el mismo nombre base
    (ej. algo__CSD.cer y algo__CSD.key), usa ese; si no, el primer .cer y primer .key.
    """
    cer_path = key_path = None
    candidatos_cer = []
    candidatos_key = []
    for root, _, files in os.walk(carpeta_base):
        for f in files:
            low = f.lower()
            full = os.path.join(root, f)
            if low.endswith(".cer"):
                candidatos_cer.append(full)
            if low.endswith(".key"):
                candidatos_key.append(full)
    if not candidatos_cer or not candidatos_key:
        return (candidatos_cer[0] if candidatos_cer else None), (candidatos_key[0] if candidatos_key else None)
    # Preferir par con mismo nombre base (ej. EKU9003173C9Juanito2413__CSD)
    for c in candidatos_cer:
        base = os.path.splitext(os.path.basename(c))[0]
        for k in candidatos_key:
            base_k = os.path.splitext(os.path.basename(k))[0]
            if base == base_k:
                return c, k
    return candidatos_cer[0], candidatos_key[0]

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csd_dir = os.path.join(base_dir, "csd")
    password = os.getenv("FACTURAMA_CSD_PASSWORD", "12345678a")

    cer_path = key_path = None
    if len(sys.argv) >= 3:
        cer_path, key_path = sys.argv[1], sys.argv[2]
        if len(sys.argv) >= 4:
            password = sys.argv[3]
    elif os.path.isdir(csd_dir):
        # Con --instituto, buscar primero en csd/Real (certificado real RARF931121159)
        if os.getenv("FACTURAMA_CSD_PREFER_REAL"):
            real_dir = os.path.join(csd_dir, "Real")
            if os.path.isdir(real_dir):
                cer_path, key_path = buscar_cer_key(real_dir)
        if not cer_path or not key_path:
            cer_path, key_path = buscar_cer_key(csd_dir)
    else:
        cer_path, key_path = buscar_cer_key(base_dir)

    print("=" * 60)
    print("FACTURAMA: Subir CSD y timbrar")
    print("=" * 60)

    client = FacturamaClient()

    if cer_path and key_path:
        print("\nArchivos CSD encontrados:")
        print("  .cer:", cer_path)
        print("  .key:", key_path)
        nombre_cert = leer_nombre_desde_cer(cer_path)
        if nombre_cert:
            client.issuer_name = nombre_cert
            print("  Nombre (desde .cer):", nombre_cert)
        # Si usamos certificado de csd/Real, el RFC del emisor debe ser el del certificado
        # Si en config hay FACTURAMA_ISSUER_RFC (ej. RARF9311211S9), se usa ese; si no, el leído del .cer
        if os.getenv("FACTURAMA_CSD_PREFER_REAL") and "Real" in cer_path:
            rfc_config = os.getenv("FACTURAMA_ISSUER_RFC")
            rfc_cert = leer_rfc_desde_cer(cer_path)
            if rfc_config:
                client.issuer_rfc = rfc_config.strip()
                print("  RFC (config/certificado):", client.issuer_rfc)
            elif rfc_cert:
                client.issuer_rfc = rfc_cert
                print("  RFC (desde .cer):", rfc_cert)
        print("\n1. Subiendo CSD a Facturama (misma cuenta sandbox)...")
        r = client.subir_csd(cer_path, key_path, password)
        if not r.get("exito"):
            print("   Error:", r.get("error", r))
            return
        print("   OK:", r.get("mensaje", r))
    else:
        print("\n(No se encontraron .cer y .key en la carpeta 'csd'.")
        print(" Si ya subiste el CSD en la pagina, se intenta timbrar igual.)")
        print(" Para subir por codigo: pon .cer y .key en csd/ y vuelve a ejecutar,")
        print(" o: python subir_csd_y_timbrar.py ruta/cert.cer ruta/cert.key [password]")
        print(" Portal SANDBOX (mismo usuario): https://dev.facturama.mx -> Sellos Digitales)\n")

    print("2. Timbrar factura de prueba...")
    r = client.timbrar_factura_prueba(1000, "Servicio de prueba")
    print("\nResultado:", r)
    if r.get("exito"):
        print("UUID:", r.get("uuid"), "| Folio:", r.get("folio"))
    elif r.get("error") and "Nombre del emisor" in str(r.get("error", "")):
        print("\nSi falla por nombre del emisor, define FACTURAMA_ISSUER_NAME con el nombre exacto del certificado (.cer).")
    return r

if __name__ == "__main__":
    main()
