# -*- coding: utf-8 -*-
"""
Restructura ssepi_servicios_enterprise_v11.html para generar un flujo de 5 páginas
similar al PDF de ejemplo 'Cotización - SP-E0731.pdf':

  Página 1: Membrete institucional + Datos del cliente + Tabla de productos
  Página 2: Continuación de tabla (si aplica) + Totales
  Página 3: Tiempo de entrega
  Página 4: Notas importantes (políticas del departamento)
  Página 5: Términos de pago

CAMBIOS REALIZADOS:
1. Elimina el salto forzado a página 2. La tabla ahora inicia en la misma
   página 1, debajo del área del membrete.
2. Separa Tiempo de entrega, Notas y Términos de pago en páginas independientes.
3. Asegura que drawFooter() se ejecute en cada transición de página.
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_PATH = os.path.join(BASE, 'ssepi_servicios_enterprise_v11.html')

with open(HTML_PATH, 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

# ============================================================================
# 1. Reemplazar el inicio de PÁG 2: quitar doc.addPage() y drawHeader(),
#    iniciar tabla directamente en página 1 debajo del membrete.
# ============================================================================
OLD_START = """            // ================================================================
            // PÁG 2 — DATOS CLIENTE + TABLA
            // ================================================================
            doc.addPage(); pgNum++;
            let y = drawHeader();"""

NEW_START = """            // ================================================================
            // PÁG 1 (continuación) — DATOS CLIENTE + TABLA
            // La tabla inicia en la misma página del membrete.
            // ================================================================
            let y = 95;  // Coordenada Y debajo del área de encabezado del membrete
                           // AJUSTAR este valor según el diseño visual de cada PDF membrete."""

if OLD_START not in html:
    print('[ERROR] No se encontró el bloque de inicio de PÁG 2. ¿Ya fue parcheado?')
    exit(1)

html = html.replace(OLD_START, NEW_START)
print('[OK] 1/3: Tabla ahora inicia en página 1 (debajo del membrete).')

# ============================================================================
# 2. Restructurar post-tabla: separar en páginas independientes.
#    Buscar desde "// ── Notas Importantes" hasta "// ===== PÁGINA 3: TÉRMINOS DE PAGO"
# ============================================================================
OLD_POST_TABLE = """            // ── Notas Importantes (contenido dinámico según departamento) ──
            if(y+16>BODY_BOTTOM) newPage();
            tx('Notas Importantes', ML+4,y,'bold',13,BLK);
            y+=10;

            // Obtener políticas del departamento seleccionado
            const deptoNotes = document.getElementById('selDepto')?.value || 'automatizacion';
            const polNotes = DEPTO_POLICIES[deptoNotes];
            const noteLines = polNotes ? polNotes.lines : [];

            const newPageSolo=()=>{
                drawFooter(pgNum);
                doc.addPage(); pgNum++;
                y=drawHeader();
            };

            const NL=5.0;
            const NMAX=TW-12;

            noteLines.forEach((line, idx)=>{
                doc.setFont('helvetica','normal'); doc.setFontSize(8);
                const fullText = String.fromCharCode(149) + ' ' + line;
                const linesArr = doc.splitTextToSize(fullText, NMAX);
                const nH = linesArr.length*NL+1.5;
                if(y+nH>BODY_BOTTOM) newPageSolo();

                linesArr.forEach((l, i)=>{
                    doc.setFont('helvetica', i===0?'bold':'normal');
                    doc.setTextColor(...GR_TXT);
                    doc.text(l, ML+10, y+4+i*NL);
                });
                y+=nH;
            });

            // ── Forzar salto a Página 3 ──
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();

            // ===== PÁGINA 3: TÉRMINOS DE PAGO =====
            tx('Términos de Pago', ML+4, y, 'bold', 15, BLK);
            y += 10;
            tx('El cliente se obliga a pagar el importe total de esta cotización dentro de los 30 días naturales posteriores a la fecha de emisión.', ML+4, y, 'normal', 10, GR_TXT);
            y += 8;
            tx('En caso de incumplimiento, se aplicarán cargos por mora del 1.5% mensual sobre el saldo pendiente.', ML+4, y, 'normal', 10, GR_TXT);
            y += 14;

            const depto = document.getElementById('selDepto')?.value || 'automatizacion';
            const pol = DEPTO_POLICIES[depto];
            if (pol) {
                if (y > 230) {
                    drawFooter(pgNum);
                    doc.addPage(); pgNum++;
                    y = drawHeader();
                }
                // Tiempo de entrega
                doc.setFont('helvetica','bold'); doc.setFontSize(9);
                doc.setTextColor(...GR_TXT);
                doc.text('Tiempo de entrega: ' + pol.entrega, ML, y);
                y += 8;
            }"""

NEW_POST_TABLE = """            // ================================================================
            // PÁGINA 3: TIEMPO DE ENTREGA
            // ================================================================
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();

            tx('Tiempo de entrega', ML+4, y, 'bold', 15, BLK);
            y += 10;

            const deptoEnt = document.getElementById('selDepto')?.value || 'automatizacion';
            const polEnt = DEPTO_POLICIES[deptoEnt];
            if (polEnt) {
                doc.setFont('helvetica','normal'); doc.setFontSize(10);
                doc.setTextColor(...GR_TXT);
                doc.text(polEnt.entrega, ML+4, y);
                y += 8;
            }

            // ================================================================
            // PÁGINA 4: NOTAS IMPORTANTES
            // ================================================================
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();

            tx('Notas Importantes', ML+4, y, 'bold', 15, BLK);
            y += 10;

            const deptoNotes = document.getElementById('selDepto')?.value || 'automatizacion';
            const polNotes = DEPTO_POLICIES[deptoNotes];
            const noteLines = polNotes ? polNotes.lines : [];

            const newPageSolo=()=>{
                drawFooter(pgNum);
                doc.addPage(); pgNum++;
                y=drawHeader();
            };

            const NL=5.0;
            const NMAX=TW-12;

            noteLines.forEach((line, idx)=>{
                doc.setFont('helvetica','normal'); doc.setFontSize(8);
                const fullText = String.fromCharCode(149) + ' ' + line;
                const linesArr = doc.splitTextToSize(fullText, NMAX);
                const nH = linesArr.length*NL+1.5;
                if(y+nH>BODY_BOTTOM) newPageSolo();

                linesArr.forEach((l, i)=>{
                    doc.setFont('helvetica', i===0?'bold':'normal');
                    doc.setTextColor(...GR_TXT);
                    doc.text(l, ML+10, y+4+i*NL);
                });
                y+=nH;
            });

            // ================================================================
            // PÁGINA 5: TÉRMINOS DE PAGO
            // ================================================================
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();

            tx('Términos de Pago', ML+4, y, 'bold', 15, BLK);
            y += 10;
            tx('El cliente se obliga a pagar el importe total de esta cotización dentro de los 30 días naturales posteriores a la fecha de emisión.', ML+4, y, 'normal', 10, GR_TXT);
            y += 8;
            tx('En caso de incumplimiento, se aplicarán cargos por mora del 1.5% mensual sobre el saldo pendiente.', ML+4, y, 'normal', 10, GR_TXT);
            y += 14;"""

if OLD_POST_TABLE not in html:
    print('[ERROR] No se encontró el bloque post-tabla. ¿Ya fue parcheado o el HTML cambió?')
    exit(1)

html = html.replace(OLD_POST_TABLE, NEW_POST_TABLE)
print('[OK] 2/3: Tiempo de entrega, Notas y Términos de pago ahora son páginas separadas.')

# ============================================================================
# 3. Asegurar footer en la última página (llamar drawFooter antes de guardar)
# ============================================================================
OLD_END = """            // ================================================================
            if(preview) window.open(doc.output('bloburl'),'_blank');
            else        doc.save('Cotizacion_'+folio+'.pdf');"""

NEW_END = """            // Footer de la última página
            drawFooter(pgNum);

            // ================================================================
            if(preview) window.open(doc.output('bloburl'),'_blank');
            else        doc.save('Cotizacion_'+folio+'.pdf');"""

if OLD_END in html:
    html = html.replace(OLD_END, NEW_END)
    print('[OK] 3/3: Footer agregado a la última página.')
else:
    print('[AVISO] No se encontró el bloque final exacto; posiblemente ya tiene footer.')

with open(HTML_PATH, 'w', encoding='utf-8') as f:
    f.write(html)

print('\n[OK] ssepi_servicios_enterprise_v11.html reestructurado para flujo de 5 páginas.')
print('Abre el HTML en el navegador, llena los datos y presiona Generar PDF.')
print('Si la tabla es muy larga, ocupará P1/P2 y las secciones posteriores')
print('se desplazarán automáticamente (P3=Entrega, P4=Notas, P5=Términos).')
