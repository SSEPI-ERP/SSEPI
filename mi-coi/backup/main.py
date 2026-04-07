#!/usr/bin/env python3
"""
Mi COI - Sistema Contable Personal
Punto de entrada principal
"""

import sys
import os

# Agregar el directorio actual al path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Importar configuración primero
from config import PROJECT_ROOT, DATABASE_PATH, DB_FILE

print(f"📁 Proyecto raíz: {PROJECT_ROOT}")
print(f"📁 Base de datos: {DB_FILE}")
print(f"📁 Carpeta database: {DATABASE_PATH}")

# Verificar que la carpeta database existe
os.makedirs(DATABASE_PATH, exist_ok=True)

from frontend.main_window import VentanaPrincipal

if __name__ == "__main__":
    print("🚀 Iniciando Mi COI - Sistema Contable")
    print("✅ Configuración cargada correctamente")
    app = VentanaPrincipal()
    app.mainloop()