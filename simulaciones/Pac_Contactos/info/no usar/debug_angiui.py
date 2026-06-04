import json

# Load enhanced clients (from clients_from_excel.json)
with open('clients_from_excel.json', 'r') as f:
    enhanced = json.load(f)

print("=== ANGUI clients in enhanced list (clients_from_excel.json) ===")
for client in enhanced:
    if 'ANGUI' in client['name']:
        print(f"Name: '{client['name']}'")
        print(f"  num: {client['num']}")
        print(f"  c1: {client['c1']}")
        print(f"  c2: {client['c2']}")
        print(f"  c3: {client['c3']}")
        print(f"  c4: {client['c4']}")
        print(f"  c5: {client['c5']}")
        print(f"  c6: {client['c6']}")
        print(f"  address: '{client['address']}'")
        print(f"  rfc: '{client['rfc']}'")
        print(f"  contact: '{client['contact']}'")
        print(f"  sheets: {client['sheets']}")
        print()

# Original DB_CLIENTS from process_images_v2.js (hardcoded)
original_db_clients = [
    {"num": 1, "name": "ANGUIPLAST", "c1": 234, "c2": 24.63, "c3": 665.05, "c4": 6, "c5": 750, "c6": 1415.05, "address": "Libramiento Norte Km. 2, Arandas, JAL", "rfc": "ANG101215PG0", "contact": "Ing. Compras"},
]

print("=== ANGUI clients in original DB_CLIENTS ===")
for client in original_db_clients:
    if 'ANGUI' in client['name']:
        print(f"Name: '{client['name']}'")
        print(f"  num: {client['num']}")
        print(f"  c1: {client['c1']}")
        print(f"  c2: {client['c2']}")
        print(f"  c3: {client['c3']}")
        print(f"  c4: {client['c4']}")
        print(f"  c5: {client['c5']}")
        print(f"  c6: {client['c6']}")
        print(f"  address: '{client['address']}'")
        print(f"  rfc: '{client['rfc']}'")
        print(f"  contact: '{client['contact']}'")
        print()