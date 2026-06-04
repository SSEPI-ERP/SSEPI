import json
import re
from typing import Dict, List, Any, Tuple, Optional

def normalize_text(t: str) -> str:
    """Normalize text for comparison (same as in process_images_v2.js)"""
    if not t:
        return ""
    # Convert to uppercase, remove accents, remove special characters, normalize spaces
    import unicodedata
    t = unicodedata.normalize('NFD', t.upper())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')  # Remove accents
    t = re.sub(r'[^A-Z0-9\s]', '', t)  # Remove special characters
    t = re.sub(r'\s+', ' ', t).strip()  # Normalize spaces
    return t

def levenshtein_distance(a: str, b: str) -> int:
    """Calculate Levenshtein distance between two strings"""
    if not a:
        return len(b)
    if not b:
        return len(a)

    # Create a matrix
    m, n = len(a), len(b)
    d = [[0] * (n + 1) for _ in range(m + 1)]

    # Initialize first row and column
    for i in range(m + 1):
        d[i][0] = i
    for j in range(n + 1):
        d[0][j] = j

    # Fill the matrix
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,      # deletion
                d[i][j - 1] + 1,      # insertion
                d[i - 1][j - 1] + cost  # substitution
            )

    return d[m][n]

def similarity(a: str, b: str) -> int:
    """Calculate similarity percentage between two strings (same as in process_images_v2.js)"""
    s = normalize_text(a)
    t = normalize_text(b)
    if not s or not t:
        return 0
    dist = levenshtein_distance(s, t)
    max_len = max(len(s), len(t))
    if max_len == 0:
        return 100
    return round((1 - dist / max_len) * 100)

def load_original_db_clients() -> List[Dict[str, Any]]:
    """Load the original DB_CLIENTS from process_images_v2.js"""
    # This is hardcoded based on what we saw in the file
    return [
        {"num": 1, "name": "ANGUIPLAST", "c1": 234, "c2": 24.63, "c3": 665.05, "c4": 6, "c5": 750, "c6": 1415.05, "address": "Libramiento Norte Km. 2, Arandas, JAL", "rfc": "ANG101215PG0", "contact": "Ing. Compras"},
        {"num": 2, "name": "BOLSAS DE LOS ALTOS", "c1": 226, "c2": 23.79, "c3": 642.32, "c4": 5, "c5": 625, "c6": 1267.32, "address": "Carr. Tepatitlán - Arandas, JAL", "rfc": "BAL050101AA1", "contact": "Lic. Adquisiciones"},
        {"num": 3, "name": "ECOBOLSAS", "c1": 216, "c2": 22.74, "c3": 613.89, "c4": 5, "c5": 625, "c6": 1238.89, "address": "Parque Industrial León, GTO", "rfc": "ECO990202BB2", "contact": "Gerente Planta"},
        {"num": 4, "name": "BADER TABACHINES", "c1": 17.2, "c2": 1.81, "c3": 48.88, "c4": 2, "c5": 250, "c6": 298.88, "address": "Blvd. J. Clouthier, León, GTO", "rfc": "BAD880303CC3", "contact": "Mantenimiento"},
        {"num": 5, "name": "BODYCOTE", "c1": 90.6, "c2": 9.54, "c3": 257.49, "c4": 3, "c5": 375, "c6": 632.49, "address": "Silao, Guanajuato Puerto Interior", "rfc": "BOD770404DD4", "contact": "Ing. Proyectos"},
        {"num": 6, "name": "COFICAB", "c1": 80, "c2": 8.42, "c3": 227.37, "c4": 3, "c5": 375, "c6": 602.37, "address": "Puerto Interior, Silao, GTO", "rfc": "COF660505EE5", "contact": "Ing. Eléctrico"},
        {"num": 7, "name": "CONDUMEX", "c1": 90.6, "c2": 9.54, "c3": 257.49, "c4": 3, "c5": 375, "c6": 632.49, "address": "Silao, GTO", "rfc": "CON550606FF6", "contact": "Compras"},
        {"num": 8, "name": "ECSA", "c1": 32, "c2": 3.37, "c3": 90.95, "c4": 2, "c5": 250, "c6": 340.95, "address": "León, GTO", "rfc": "ECS440707GG7", "contact": "Admin"},
        {"num": 9, "name": "EMMSA", "c1": 21.6, "c2": 2.27, "c3": 61.39, "c4": 2, "c5": 250, "c6": 311.39, "address": "León, GTO", "rfc": "EMM330808HH8", "contact": "Almacén"},
        {"num": 10, "name": "EPC 1", "c1": 400, "c2": 42.11, "c3": 1136.84, "c4": 7, "c5": 875, "c6": 2011.84, "address": "SLP", "rfc": "EPC220909II9", "contact": "Ingeniería"},
        {"num": 11, "name": "EPC 2", "c1": 402, "c2": 42.32, "c3": 1142.53, "c4": 8, "c5": 1000, "c6": 2142.53, "address": "SLP", "rfc": "EPC111010JJ0", "contact": "Ingeniería"},
        {"num": 12, "name": "FRAENKISCHE", "c1": 79.4, "c2": 8.36, "c3": 225.66, "c4": 3, "c5": 375, "c6": 600.66, "address": "Silao, GTO", "rfc": "FRA001111KK1", "contact": "Mtto"},
        {"num": 13, "name": "GEDNEY", "c1": 23.6, "c2": 2.48, "c3": 67.07, "c4": 3, "c5": 375, "c6": 442.07, "address": "León, GTO", "rfc": "GED991212LL2", "contact": "Compras"},
        {"num": 14, "name": "GRUPO ACERERO", "c1": 386, "c2": 40.63, "c3": 1097.05, "c4": 7, "c5": 875, "c6": 1972.05, "address": "SLP", "rfc": "GRU880101MM3", "contact": "Planta"},
        {"num": 15, "name": "HALL PLANTA 1", "c1": 73.8, "c2": 7.77, "c3": 209.75, "c4": 3, "c5": 375, "c6": 584.75, "address": "Parque Opción, San José Iturbide", "rfc": "HAL770202NN4", "contact": "Ing. Control"},
        {"num": 16, "name": "HIRUTA PLANTA 1", "c1": 58.4, "c2": 6.15, "c3": 165.98, "c4": 3, "c5": 375, "c6": 540.98, "address": "Parque Amistad, Celaya", "rfc": "HIR660303OO5", "contact": "Mtto"},
        {"num": 17, "name": "IK PLASTIC", "c1": 61.4, "c2": 6.46, "c3": 174.51, "c4": 3, "c5": 375, "c6": 549.51, "address": "Parque Stiva, León", "rfc": "IKP550404PP6", "contact": "Ing. Proc"},
        {"num": 18, "name": "IMPRENTA JM", "c1": 16.2, "c2": 1.71, "c3": 46.04, "c4": 2, "c5": 250, "c6": 296.04, "address": "Col. Obregón, León", "rfc": "IMP440505QQ7", "contact": "Dueño"},
        {"num": 19, "name": "JARDÍN LA ALEMANA", "c1": 12, "c2": 1.26, "c3": 34.11, "c4": 2, "c5": 250, "c6": 284.11, "address": "León, GTO", "rfc": "JAR330606RR8", "contact": "Admin"},
        {"num": 20, "name": "MAFLOW", "c1": 59.8, "c2": 6.29, "c3": 169.96, "c4": 3, "c5": 375, "c6": 544.96, "address": "Silao, GTO", "rfc": "MAF220707SS9", "contact": "Ingeniería"},
        {"num": 21, "name": "MARQUARDT", "c1": 125.4, "c2": 13.2, "c3": 356.4, "c4": 4, "c5": 500, "c6": 856.4, "address": "Irapuato, GTO", "rfc": "MAR110808TT0", "contact": "Compras"},
        {"num": 22, "name": "MICROONDA", "c1": 41.6, "c2": 4.38, "c3": 118.23, "c4": 3, "c5": 375, "c6": 493.23, "address": "León, GTO", "rfc": "MIC000909UU1", "contact": "Sistemas"},
        {"num": 23, "name": "MR LUCKY", "c1": 157, "c2": 16.53, "c3": 446.21, "c4": 4, "c5": 500, "c6": 946.21, "address": "Irapuato, GTO", "rfc": "MRL991010VV2", "contact": "Campo"},
        {"num": 24, "name": "NHK", "c1": 138.6, "c2": 14.59, "c3": 393.92, "c4": 4, "c5": 500, "c6": 893.92, "address": "Celaya, GTO", "rfc": "NHK881111WW3", "contact": "Mtto"},
        {"num": 25, "name": "NISHIKAWA", "c1": 61, "c2": 6.42, "c3": 173.37, "c4": 3, "c5": 375, "c6": 548.37, "address": "Silao, GTO", "rfc": "NIS771212XX4", "contact": "Ing. Prod"},
        {"num": 26, "name": "PIELES AZTECA", "c1": 5, "c2": 0.53, "c3": 14.21, "c4": 1, "c5": 125, "c6": 139.21, "address": "León, GTO", "rfc": "PIE660101YY5", "contact": "Almacén"},
        {"num": 27, "name": "RONGTAI", "c1": 28.2, "c2": 2.97, "c3": 80.15, "c4": 3, "c5": 375, "c6": 455.15, "address": "León, GTO", "rfc": "RON550202ZZ6", "contact": "Compras"},
        {"num": 28, "name": "SAFE DEMO", "c1": 61.6, "c2": 6.48, "c3": 175.07, "c4": 3, "c5": 375, "c6": 550.07, "address": "Silao, GTO", "rfc": "SAF440303A11", "contact": "Ingeniería"},
        {"num": 29, "name": "SERVIACERO ELECTROFORJADOS", "c1": 14.6, "c2": 1.54, "c3": 41.49, "c4": 2, "c5": 250, "c6": 291.49, "address": "León, GTO", "rfc": "SEE330404B22", "contact": "Mtto"},
        {"num": 30, "name": "SUACERO", "c1": 392, "c2": 41.26, "c3": 1114.11, "c4": 8, "c5": 1000, "c6": 2114.11, "address": "SLP", "rfc": "SUA220505C33", "contact": "Planta"},
        {"num": 31, "name": "TQ-1", "c1": 26, "c2": 2.74, "c3": 73.89, "c4": 2, "c5": 250, "c6": 323.89, "address": "León, GTO", "rfc": "TQ1110606D44", "contact": "Admin"},
        {"num": 32, "name": "MINO INDUSTRY", "c1": 29.2, "c2": 3.07, "c3": 82.99, "c4": 2, "c5": 250, "c6": 332.99, "address": "León, GTO", "rfc": "MIN000707E55", "contact": "Ing. Moldes"},
        {"num": 33, "name": "CURTIDOS BENGALA", "c1": 17.2, "c2": 1.81, "c3": 44.36, "c4": 2, "c5": 250, "c6": 298.88, "address": "Parque Piel", "rfc": "CUR880808F66", "contact": "Propietario"}
    ]

def load_enhanced_clients() -> List[Dict[str, Any]]:
    """Load the enhanced clients from clients_from_excel.json"""
    with open('clients_from_excel.json', 'r') as f:
        return json.load(f)

def find_best_match(target_name: str, client_list: List[Dict], threshold: int = 50) -> Tuple[Optional[Dict], int]:
    """Find the best matching client from a list based on name similarity"""
    best_client = None
    best_score = -1

    for client in client_list:
        score = similarity(target_name, client['name'])
        if score > best_score:
            best_score = score
            best_client = client

    if best_score >= threshold:
        return best_client, best_score
    else:
        return None, best_score

def merge_client_lists(original_clients: List[Dict], enhanced_clients: List[Dict]) -> List[Dict]:
    """Merge the two client lists based on name similarity matching"""
    # We'll use the enhanced clients as our base (for sheet information)
    # and match them against original clients to get RFC and c1 data
    merged_clients = []
    used_originals = set()  # Track which original clients we've used

    for enhanced_client in enhanced_clients:
        # Find the best matching original client
        best_match, score = find_best_match(enhanced_client['name'], original_clients, threshold=50)

        # Start with enhanced client as base
        merged = enhanced_client.copy()

        # If we found a good match, override with original data
        if best_match:
            merged['rfc'] = best_match['rfc']
            merged['c1'] = float(best_match['c1'])
            # Also override other fields from original if they have meaningful values
            if best_match['c2'] != 0:
                merged['c2'] = float(best_match['c2'])
            if best_match['c3'] != 0:
                merged['c3'] = float(best_match['c3'])
            if best_match['c4'] != 0:
                merged['c4'] = float(best_match['c4'])
            if best_match['c5'] != 0:
                merged['c5'] = float(best_match['c5'])
            if best_match['c6'] != 0:
                merged['c6'] = float(best_match['c6'])
            if best_match['address']:
                merged['address'] = best_match['address']
            if best_match['contact']:
                merged['contact'] = best_match['contact']

            # Mark this original client as used
            used_originals.add(id(best_match))  # Using id as a simple way to track

        merged_clients.append(merged)

    # Add any original clients that weren't matched (these would be completely missing from enhanced data)
    for i, original_client in enumerate(original_clients):
        if id(original_client) not in used_originals:
            # Create a basic client entry for unmatched originals
            merged = {
                'name': original_client['name'],
                'num': 0,  # Will be reassigned later
                'sheets': [],  # No sheet info available
                'c1': float(original_client['c1']),
                'c2': float(original_client['c2']) if original_client['c2'] != 0 else 0.0,
                'c3': float(original_client['c3']) if original_client['c3'] != 0 else 0.0,
                'c4': float(original_client['c4']) if original_client['c4'] != 0 else 0.0,
                'c5': float(original_client['c5']) if original_client['c5'] != 0 else 0.0,
                'c6': float(original_client['c6']) if original_client['c6'] != 0 else 0.0,
                'address': original_client['address'],
                'rfc': original_client['rfc'],
                'contact': original_client['contact']
            }
            merged_clients.append(merged)

    # Sort by name for consistent ordering
    merged_clients.sort(key=lambda x: x['name'])

    # Reassign nums
    for i, client in enumerate(merged_clients):
        client['num'] = i + 1

    return merged_clients

def main():
    print("Loading original DB_CLIENTS...")
    original_clients = load_original_db_clients()
    print(f"Loaded {len(original_clients)} original clients")

    print("Loading enhanced clients from clients_from_excel.json...")
    enhanced_clients = load_enhanced_clients()
    print(f"Loaded {len(enhanced_clients)} enhanced clients")

    print("Merging client lists using similarity matching (threshold=50)...")
    merged_clients = merge_client_lists(original_clients, enhanced_clients)
    print(f"Merged to {len(merged_clients)} unique clients")

    # Save merged list
    with open('clients_merged.json', 'w') as f:
        json.dump(merged_clients, f, indent=2)

    print("Saved merged list to clients_merged.json")

    # Show some examples of merged clients, especially the problematic ones
    print("\nExamples of merged clients (checking for ANGUIPLAST/ANGUIPALST):")
    for i, client in enumerate(merged_clients):
        if 'ANGUI' in client['name']:
            print(f"{i+1}. {client['name']} (num: {client['num']})")
            print(f"   RFC: {client['rfc']}, KM (c1): {client['c1']}")
            print(f"   Sheets: {', '.join(client['sheets'])}")
            print()

    # Show statistics
    print(f"Summary: {len(enhanced_clients)} enhanced + {len(original_clients)} original = {len(merged_clients)} merged clients")

if __name__ == "__main__":
    main()