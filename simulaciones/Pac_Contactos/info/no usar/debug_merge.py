import json
import re
from typing import Dict, List, Any, Tuple, Optional, Set

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
    return [
        {"num": 1, "name": "ANGUIPLAST", "c1": 234, "c2": 24.63, "c3": 665.05, "c4": 6, "c5": 750, "c6": 1415.05, "address": "Libramiento Norte Km. 2, Arandas, JAL", "rfc": "ANG101215PG0", "contact": "Ing. Compras"},
    ]

def load_enhanced_clients() -> List[Dict[str, Any]]:
    """Load a subset of enhanced clients for debugging"""
    with open('clients_from_excel.json', 'r') as f:
        all_clients = json.load(f)
    # Filter to just the ANGUI clients for debugging
    return [c for c in all_clients if 'ANGUI' in c['name']]

def find_all_matches(target_name: str, client_list: List[Dict], threshold: int = 50) -> List[Tuple[Dict, int]]:
    """Find all matching clients from a list based on name similarity above threshold"""
    matches = []
    for client in client_list:
        score = similarity(target_name, client['name'])
        if score >= threshold:
            matches.append((client, score))
    # Sort by score descending
    matches.sort(key=lambda x: x[1], reverse=True)
    return matches

def main():
    print("Loading original DB_CLIENTS (subset)...")
    original_clients = load_original_db_clients()
    print(f"Loaded {len(original_clients)} original clients")
    for orig in original_clients:
        print(f"  Original: '{orig['name']}'")

    print("\nLoading enhanced clients (ANGUI subset)...")
    enhanced_clients = load_enhanced_clients()
    print(f"Loaded {len(enhanced_clients)} enhanced clients")
    for enh in enhanced_clients:
        print(f"  Enhanced: '{enh['name']}'")

    print("\nChecking matches:")
    for enh in enhanced_clients:
        matches = find_all_matches(enh['name'], original_clients, threshold=50)
        print(f"\nEnhanced '{enh['name']}' matches:")
        if matches:
            for orig, score in matches:
                print(f"  -> Original '{orig['name']}' (score: {score}%)")
        else:
            print("  -> No matches above threshold")

if __name__ == "__main__":
    main()