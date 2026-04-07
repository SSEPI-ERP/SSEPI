import os
import sys
import json

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
    # Multiempresa (base): permite override desde config_instituto.json
    try:
        cfg = get_instituto_config()
        override = str((cfg or {}).get("DB_FILE_OVERRIDE") or "").strip()
        if override:
            os.makedirs(os.path.dirname(override), exist_ok=True)
            return override
    except Exception:
        pass
    return DB_FILE


def get_project_root() -> str:
    return PROJECT_ROOT


def get_instituto_config() -> dict:
    path = os.path.join(PROJECT_ROOT, "config_instituto.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}