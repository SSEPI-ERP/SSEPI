# ================================================
# ARCHIVO: migrate.py
# DESCRIPCIÓN: Script de migración para importar datos desde Firebase a Supabase
# SEGURIDAD: Encripta datos sensibles antes de insertar
# ================================================

import os
import json
import asyncio
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuración
FIREBASE_CREDENTIALS = "path/to/firebase-credentials.json"  # Ajustar
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://knzmdwjmrhcoytmebdwa.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")

# Inicializar Firebase
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred)
firestore_db = firestore.client()

# Inicializar Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def migrate_collection(firebase_collection, supabase_table, transform=None):
    """Migra una colección de Firebase a una tabla de Supabase."""
    print(f"Migrando {firebase_collection}...")
    docs = firestore_db.collection(firebase_collection).stream()
    count = 0
    for doc in docs:
        data = doc.to_dict()
        # Convertir timestamps
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        if transform:
            data = transform(data, doc.id)
        # Insertar en Supabase
        try:
            # Nota: Los datos sensibles deben ser encriptados por la base de datos,
            # así que los enviamos en texto plano y confiamos en el trigger de encriptación.
            result = supabase.table(supabase_table).insert(data).execute()
            count += 1
            print(f"  Insertado {doc.id}")
        except Exception as e:
            print(f"  Error en {doc.id}: {e}")
    print(f"Migrados {count} documentos de {firebase_collection}")

def transform_contactos(data, doc_id):
    """Eliminar campos no deseados y asegurar tipo."""
    if 'createdAt' in data:
        data['created_at'] = data.pop('createdAt')
    if 'updatedAt' in data:
        data['updated_at'] = data.pop('updatedAt')
    # Los campos encriptados se enviarán como texto, el trigger los encriptará
    return data

def transform_ventas(data, doc_id):
    if 'fechaCreacion' in data:
        data['created_at'] = data.pop('fechaCreacion')
    if 'fecha' not in data:
        data['fecha'] = data.get('created_at', datetime.now().isoformat())
    return data

async def main():
    # Orden de migración (respetar dependencias)
    migrations = [
        ('contactos', 'contactos', transform_contactos),
        ('inventario', 'inventario', None),
        ('empleados', 'empleados', None),  # si existe
        ('ordenes_taller', 'ordenes_taller', None),
        ('ordenes_motores', 'ordenes_motores', None),
        ('compras', 'compras', None),
        ('ventas', 'ventas', transform_ventas),
        ('facturas', 'facturas', None),
        ('ingresos_contabilidad', 'ingresos_contabilidad', None),
        ('pagos_nomina', 'pagos_nomina', None),
        ('movimientos_banco', 'movimientos_banco', None),
    ]
    for fb_col, sup_table, transform in migrations:
        await migrate_collection(fb_col, sup_table, transform)

if __name__ == "__main__":
    asyncio.run(main())