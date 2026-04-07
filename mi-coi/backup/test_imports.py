# test_imports.py
import sys
print("Python path:", sys.path)

try:
    from backend.models.catalogo import CatalogoCuentas
    print("✅ backend.models.catalogo OK")
except Exception as e:
    print("❌ Error catalogo:", e)

try:
    from frontend.main_window import VentanaPrincipal
    print("✅ frontend.main_window OK")
except Exception as e:
    print("❌ Error frontend:", e)