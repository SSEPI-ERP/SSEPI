# -*- coding: utf-8 -*-
"""
Convierte los PDFs de encabezado de la carpeta 'formatos/' a imágenes JPEG
comprimidas y genera el archivo membretes_base64.js listo para usar con jsPDF.

CAMBIOS vs version anterior:
- Usa JPEG (mucho más ligero que PNG).
- DPI 150 (suficiente para impresión nítida en A4; 200 era excesivo).
- Calidad JPEG 85 (punto óptimo peso/calidad).
- Resultado: de ~15 MB (PNG 200 DPI) a ~1 MB (JPEG 150 DPI).
"""
import os
import fitz  # PyMuPDF
import base64

MAPEO = {
    'Encabezado AutoM.pdf': 'automatizacion',
    'Encabezado ELectronica.pdf': 'electronicos',
    'Encabezado motores.pdf': 'motores',
    'Encabezado suministro.pdf': 'suministros',
}

# Calcula rutas: este script está en v2_generador_membretes/herramientas/
# Subimos 2 niveles para llegar a la carpeta v2_generador_membretes/
# Subimos 3 niveles para llegar a la raiz (pdfs/) donde está formatos/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
V2_DIR     = os.path.dirname(SCRIPT_DIR)                 # v2_generador_membretes/
ROOT_DIR   = os.path.dirname(os.path.dirname(SCRIPT_DIR)) # raiz del proyecto
FORMATOS_DIR = os.path.join(ROOT_DIR, 'formatos')
OUTPUT_JS    = os.path.join(V2_DIR, 'membretes_base64.js')

membretes = {}

for pdf_name, depto_key in MAPEO.items():
    pdf_path = os.path.join(FORMATOS_DIR, pdf_name)
    if not os.path.exists(pdf_path):
        print(f'[AVISO] No encontrado: {pdf_path}')
        continue

    doc = fitz.open(pdf_path)
    page = doc.load_page(0)

    # Renderizar a 150 DPI (nítido para impresión, mucho más ligero que 200)
    zoom = 150 / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)

    # Eliminar canal alpha para compatibilidad JPEG
    if pix.n > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    # Exportar como JPEG calidad 85 (punto óptimo peso/calidad)
    jpeg_bytes = pix.tobytes('jpeg', jpg_quality=85)
    b64 = base64.b64encode(jpeg_bytes).decode('ascii')
    membretes[depto_key] = f'data:image/jpeg;base64,{b64}'
    print(f'[OK] {pdf_name} -> {depto_key} ({len(b64)} chars base64 / {len(jpeg_bytes)//1024} KB)')
    doc.close()

js_lines = [
    '// ================================================================',
    '// MEMBRETES INSTITUCIONALES SSEPI – JPEG 150 DPI (generado automáticamente)',
    '// No editar manualmente. Ejecutar convert_membretes.py para regenerar.',
    '// ================================================================',
    'window.MEMBRETES = {',
]
for key, val in membretes.items():
    js_lines.append(f'    {key}: "{val}",')
js_lines.append('};')

with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

print(f'\nGenerado: {OUTPUT_JS}')
total_kb = sum(len(v.split(",")[1]) * 3 // 4 // 1024 for v in membretes.values())
print(f'Peso total estimado: ~{total_kb} KB')
print(f'Departamentos incluidos: {list(membretes.keys())}')
