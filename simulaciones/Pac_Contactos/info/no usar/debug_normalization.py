import re

def normalize_name(name: str) -> str:
    """Normalize client name for comparison"""
    if not name:
        return ""
    # Convert to uppercase, remove extra spaces, remove special characters
    normalized = re.sub(r'[^A-Z0-9\s]', '', name.upper())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized

# Test the problematic names
name1 = "ANGUIPLAST"
name2 = "ANGUIPALST"

print(f"Original name 1: '{name1}'")
print(f"Normalized name 1: '{normalize_name(name1)}'")
print(f"Original name 2: '{name2}'")
print(f"Normalized name 2: '{normalize_name(name2)}'")

# Let's also check what's actually in the files
print("\n--- Checking actual data ---")
import json

with open('clients_from_excel.json', 'r') as f:
    enhanced = json.load(f)

for client in enhanced:
    if 'ANGUI' in client['name']:
        print(f"Enhanced: '{client['name']}' -> normalized: '{normalize_name(client['name'])}'")

# Check original DB_CLIENTS (hardcoded in our script)
original_names = [
    "ANGUIPLAST",
    "BOLSAS DE LOS ALTOS",
    "ECOBOLSAS",
    "BADER TABACHINES",
    "BODYCOTE",
    "COFICAB",
    "CONDUMEX",
    "ECSA",
    "EMMSA",
    "EPC 1",
    "EPC 2",
    "FRAENKISCHE",
    "GEDNEY",
    "GRUPO ACERERO",
    "HALL PLANTA 1",
    "HIRUTA PLANTA 1",
    "IK PLASTIC",
    "IMPRENTA JM",
    "JARDÍN LA ALEMANA",
    "MAFLOW",
    "MARQUARDT",
    "MICROONDA",
    "MR LUCKY",
    "NHK",
    "NISHIKAWA",
    "PIELES AZTECA",
    "RONGTAI",
    "SAFE DEMO",
    "SERVIACERO ELECTROFORJADOS",
    "SUACERO",
    "TQ-1",
    "MINO INDUSTRY",
    "CURTIDOS BENGALA"
]

print("\nOriginal DB_CLIENTS:")
for name in original_names:
    if 'ANGUI' in name:
        print(f"Original: '{name}' -> normalized: '{normalize_name(name)}'")