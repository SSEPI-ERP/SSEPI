# -*- coding: utf-8 -*-
"""
Parchea ssepi_servicios_enterprise_v11.html para:
  1. Inyectar el script de membretes_base64.js en el <head>.
  2. Reemplazar la PÁG 1 (portada genérica) por lógica de membrete por departamento.
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))
HTML_PATH = os.path.join(BASE, 'ssepi_servicios_enterprise_v11.html')
BACKUP_PATH = HTML_PATH + '.backup'

# 1. Backup
with open(HTML_PATH, 'r', encoding='utf-8', errors='replace') as f:
    original = f.read()

with open(BACKUP_PATH, 'w', encoding='utf-8') as f:
    f.write(original)
print(f'Backup guardado en: {BACKUP_PATH}')

# 2. Inyectar script de membretes en el <head>
SCRIPT_TAG = '    <script src="membretes_base64.js"></script>'
if SCRIPT_TAG not in original:
    # Insertar después de xlsx.full.min.js
    marker = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
    if marker in original:
        original = original.replace(marker, marker + '\n' + SCRIPT_TAG)
        print('[OK] Inyectado membretes_base64.js en <head>')
    else:
        print('[AVISO] No se encontró marcador xlsx para inyectar script.')
else:
    print('[INFO] Script de membretes ya presente.')

# 3. Reemplazar bloque de portada usando substrings robustos
START_MARKER = '// PÁG 1 — PORTADA (réplica del documento Word)'
END_MARKER   = '// ENCABEZADO REUTILIZABLE (páginas de contenido)'

if START_MARKER not in original:
    print('[ERROR] No se encontró el marcador de inicio de portada. Abortando.')
    exit(1)
if END_MARKER not in original:
    print('[ERROR] No se encontró el marcador de fin de portada. Abortando.')
    exit(1)

idx_start = original.index(START_MARKER)
# Retroceder al inicio de la línea para capturar indentación
idx_start = original.rfind('\n', 0, idx_start) + 1

idx_end = original.index(END_MARKER)
# Retroceder al inicio de la línea del bloque que precede al encabezado reutilizable
idx_end = original.rfind('\n', 0, idx_end) + 1

old_block = original[idx_start:idx_end]
print(f'[INFO] Bloque portada encontrado: {len(old_block)} chars ({old_block.count(chr(10))} líneas)')

# Nuevo bloque de membrete
NEW_BLOCK = '''            // ================================================================
            // PÁG 1 — MEMBRETE INSTITUCIONAL POR DEPARTAMENTO
            // ================================================================
            const deptoKey = document.getElementById('selDepto')?.value || 'automatizacion';
            const membreteB64 = window.MEMBRETES?.[deptoKey] || '';

            if (membreteB64) {
                try {
                    // Imagen PNG a 200 DPI escalada a A4 completo (capa más profunda)
                    doc.addImage(membreteB64, 'PNG', 0, 0, PW, PH);
                } catch(e) {
                    console.error('Error al cargar membrete del departamento:', deptoKey, e);
                    doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
                }
            } else {
                doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
            }

            // --- Datos dinámicos escritos POR ENCIMA del membrete ---
            // Ajusta coordenadas (x,y) según el diseño visual de cada PDF de membrete.
            // Valores de ejemplo basados en layout estándar A4:

            // Folio (esquina superior derecha)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(0, 47, 108);
            doc.text('Folio: ' + folio, PW - MR, 30, { align: 'right' });

            // Cliente
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(26, 26, 26);
            doc.text(cliente || 'Cliente no especificado', ML, 55);

            // Fecha
            doc.text(fecha, ML, 62);
            if (rfc) doc.text('RFC: ' + rfc, ML, 69);

            // Vendedor (derecha, alineado con cliente)
            doc.text(vendedor || '—', PW - MR, 55, { align: 'right' });

            // Contacto inferior (pie de página de la portada)
            doc.setFontSize(8);
            doc.setTextColor(130, 130, 130);
            doc.text('ventas@ssepi.org', ML, PH - 12);
            doc.text('477 737 3118', PW/2, PH - 12, { align: 'center' });
            doc.text('www.ssepi.org', PW - MR, PH - 12, { align: 'right' });

'''

original = original.replace(old_block, NEW_BLOCK)

with open(HTML_PATH, 'w', encoding='utf-8') as f:
    f.write(original)

print('[OK] ssepi_servicios_enterprise_v11.html parcheado exitosamente.')
print('Nota: Revisa las coordenadas (x,y) en el nuevo bloque y ajústalas al diseño exacto de cada membrete PDF.')
