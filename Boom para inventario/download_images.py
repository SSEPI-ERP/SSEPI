"""
Descarga imagenes de productos del BOM SSEPI desde los enlaces de proveedores.
Guarda las imagenes en la carpeta 'images' y genera un JSON con el mapeo item -> imagen.
"""
import requests
from bs4 import BeautifulSoup
import os, json, re, time, csv, sys

IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images')
MAPPING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'image_map.json')
CSV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'BOM_SSEPI(BOM) (1).csv')

os.makedirs(IMG_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
}

def clean_url(url):
    """Remove tracking params and clean URL"""
    url = url.strip()
    # Remove common tracking params for cleaner URLs
    return url

def parse_csv(filepath):
    """Parse semicolon-delimited CSV"""
    items = []
    try:
        # Try UTF-8 first
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
    except:
        try:
            with open(filepath, 'r', encoding='windows-1252') as f:
                text = f.read()
        except:
            with open(filepath, 'r', encoding='latin-1') as f:
                text = f.read()

    lines = text.split('\n')
    for line in lines[2:]:  # Skip title and header rows
        fields = []
        field = ''
        in_quotes = False
        for ch in line:
            if in_quotes:
                if ch == '"':
                    in_quotes = False
                else:
                    field += ch
            else:
                if ch == '"':
                    in_quotes = True
                elif ch == ';':
                    fields.append(field.strip())
                    field = ''
                else:
                    field += ch
        fields.append(field.strip())

        if len(fields) < 6:
            continue

        item_num = fields[0].strip()
        part_number = fields[1].strip()
        has_image = 'imagen' in fields[3].lower() if len(fields) > 3 else False

        # Collect all links
        links = []
        for idx in [9, 13, 17, 21]:
            if len(fields) > idx and fields[idx].strip():
                link = fields[idx].strip()
                if link.startswith('http'):
                    links.append(link)

        if item_num or part_number:
            items.append({
                'item': item_num,
                'part_number': part_number,
                'has_image': has_image,
                'links': links
            })

    return items

def extract_image_url(url, part_number=''):
    """Try to extract product image URL from a page"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, 'lxml')

        # 1. Try og:image (most reliable)
        og = soup.find('meta', property='og:image')
        if og and og.get('content'):
            img_url = og['content']
            if img_url.startswith('//'):
                img_url = 'https:' + img_url
            elif img_url.startswith('/'):
                from urllib.parse import urlparse
                parsed = urlparse(url)
                img_url = f'{parsed.scheme}://{parsed.netloc}{img_url}'
            return img_url

        # 2. Try twitter:image
        tw = soup.find('meta', attrs={'name': 'twitter:image', 'property': 'twitter:image'})
        if tw and tw.get('content'):
            return tw['content']

        # 3. Try itemprop="image"
        item_img = soup.find(attrs={'itemprop': 'image'})
        if item_img:
            src = item_img.get('src') or item_img.get('content') or item_img.get('href')
            if src:
                if src.startswith('//'):
                    src = 'https:' + src
                return src

        # 4. Try common product image selectors
        selectors = [
            'img.product-image', 'img[class*="product"]',
            'img[class*="Product"]', '.product-image img',
            '.gallery-image img', 'img[class*="gallery"]',
            'img[class*="main-image"]', '#main-image img',
            'img[itemprop="image"]', '.product img',
            'figure img', '.carousel img',
        ]
        for sel in selectors:
            imgs = soup.select(sel)
            for img in imgs:
                src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or ''
                if src and not src.endswith('.svg') and 'logo' not in src.lower() and 'icon' not in src.lower():
                    if src.startswith('//'):
                        src = 'https:' + src
                    elif src.startswith('/'):
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        src = f'{parsed.scheme}://{parsed.netloc}{src}'
                    return src

        # 5. Last resort: find the largest image
        all_imgs = soup.find_all('img')
        best = None
        best_area = 0
        for img in all_imgs:
            src = img.get('src') or img.get('data-src') or ''
            if not src or src.endswith('.svg') or 'logo' in src.lower() or 'icon' in src.lower() or 'banner' in src.lower():
                continue
            w = int(img.get('width', 0) or 0)
            h = int(img.get('height', 0) or 0)
            area = w * h
            if area > best_area:
                best_area = area
                best = src

        if best:
            if best.startswith('//'):
                best = 'https:' + best
            elif best.startswith('/'):
                from urllib.parse import urlparse
                parsed = urlparse(url)
                best = f'{parsed.scheme}://{parsed.netloc}{best}'
            return best

        return None

    except Exception as e:
        return None

def download_image(img_url, save_path):
    """Download an image"""
    try:
        resp = requests.get(img_url, headers={
            **HEADERS,
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }, timeout=20, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 500:  # At least 500 bytes
            with open(save_path, 'wb') as f:
                f.write(resp.content)
            return True
    except:
        pass
    return False

def safe_filename(part_number, item_num):
    """Create a safe filename"""
    name = part_number.strip().replace(' ', '_').replace('/', '_').replace('\\', '_')
    name = re.sub(r'[^\w\-.]', '_', name)
    if not name:
        name = f'item_{item_num}'
    # Limit length
    if len(name) > 80:
        name = name[:80]
    return name

def main():
    print("Leyendo CSV...")
    items = parse_csv(CSV_FILE)
    print(f"Encontrados {len(items)} artículos")

    # Load existing mapping
    mapping = {}
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
            mapping = json.load(f)

    # Filter items that need images (have image placeholder in Excel)
    items_with_image = [i for i in items if i['has_image'] and i['links']]
    items_without_image = [i for i in items if not i['has_image'] and i['links']]

    print(f"Artículos con indicador de imagen: {len(items_with_image)}")
    print(f"Artículos sin indicador pero con enlace: {len(items_without_image)}")

    total = len(items_with_image) + len(items_without_image)
    done = 0
    success = 0
    skipped = 0

    # Process items with image indicator first
    all_to_process = items_with_image + items_without_image

    for item in all_to_process:
        item_key = item['item'] or item['part_number']

        # Skip if already downloaded
        if item_key in mapping and mapping[item_key].get('local'):
            local_path = os.path.join(IMG_DIR, mapping[item_key]['local'])
            if os.path.exists(local_path):
                skipped += 1
                done += 1
                continue

        filename = safe_filename(item['part_number'], item['item'])

        img_found = False
        for link in item['links']:
            if not link or not link.startswith('http'):
                continue

            # Skip known problematic URLs (very long tracking URLs)
            if len(link) > 2000:
                # Try to shorten Mercado Libre / Amazon URLs
                pass

            print(f"  [{done+1}/{total}] {item['part_number'][:30]} -> {link[:60]}...")

            img_url = extract_image_url(link, item['part_number'])

            if img_url:
                # Try to download
                for ext in ['.jpg', '.png', '.webp', '']:
                    save_name = filename + ext if ext else filename
                    save_path = os.path.join(IMG_DIR, save_name)

                    # Determine extension from URL
                    url_ext = os.path.splitext(img_url.split('?')[0])[1]
                    if url_ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                        save_path = os.path.join(IMG_DIR, filename + url_ext)
                    else:
                        save_path = os.path.join(IMG_DIR, filename + '.jpg')

                    if download_image(img_url, save_path):
                        local_name = os.path.basename(save_path)
                        mapping[item_key] = {
                            'part_number': item['part_number'],
                            'source_url': img_url,
                            'product_url': link,
                            'local': local_name
                        }
                        img_found = True
                        success += 1
                        print(f"    OK -> {local_name}")
                        break

                if img_found:
                    break

            time.sleep(0.5)

        if not img_found:
            mapping[item_key] = {
                'part_number': item['part_number'],
                'source_url': None,
                'product_url': item['links'][0] if item['links'] else None,
                'local': None
            }
            print(f"    No se encontró imagen")

        done += 1

        # Save mapping periodically
        if done % 10 == 0:
            with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
                json.dump(mapping, f, ensure_ascii=False, indent=2)

        time.sleep(0.3)

    # Final save
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"\n=== RESULTADO ===")
    print(f"Procesados: {done}")
    print(f"Imágenes descargadas: {success}")
    print(f"Sin imagen: {done - success}")
    print(f"Omitidos (ya existían): {skipped}")
    print(f"Imágenes guardadas en: {IMG_DIR}")
    print(f"Mapeo guardado en: {MAPPING_FILE}")

if __name__ == '__main__':
    main()