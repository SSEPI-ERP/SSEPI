import os
import sys

# Obtener la ruta absoluta de la raíz del proyecto
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# Rutas importantes
BACKEND_PATH = os.path.join(PROJECT_ROOT, 'backend')
DATABASE_PATH = os.path.join(BACKEND_PATH, 'database')
DB_FILE = os.path.join(DATABASE_PATH, 'contabilidad.db')

# Crear carpetas si no existen
os.makedirs(DATABASE_PATH, exist_ok=True)

# Agregar al path de Python para imports
if BACKEND_PATH not in sys.path:
    sys.path.insert(0, BACKEND_PATH)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

def get_db_path():
    """Retorna la ruta absoluta de la base de datos"""
    return DB_FILE