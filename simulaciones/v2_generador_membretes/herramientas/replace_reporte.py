# -*- coding: utf-8 -*-
with open(r'../ssepi_servicios_enterprise_v11.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

start_marker = '        // ==========================================================================\n        // 5b. GENERAR REPORTE DE SERVICIO'
start = html.find(start_marker)
if start == -1:
    print('Start marker not found')
    exit(1)

end_marker = '        }\n\n        // ==========================================================================\n        // 5c. HANDLER DE IMÁGENES PARA REPORTE'
end = html.find(end_marker, start)
if end == -1:
    print('End marker not found')
    exit(1)

old_block = html[start:end]
print(f'Found block: {len(old_block)} chars, {old_block.count(chr(10))} lines')

new_block = """        // ==========================================================================
        // 5b. GENERAR REPORTE DE SERVICIO (con imágenes, header/footer en todas las páginas)
        // ==========================================================================
        async function generarReportePDF(preview = false) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit:'mm', format:'a4' });
            const PW=210, PH=297;
            const ML=15, MR=15, TW=PW-ML-MR;
            const BODY_BOTTOM = 260;

            const BLK=[0,0,0], GR_TXT=[51,51,51], GR_LT=[130,130,130], WHT=[255,255,255];
            const TEAL=[23,165,152], GR_SEP=[220,220,220];

            const $ = id => document.getElementById(id);
            const fmtMXN = n => '$ '+parseFloat(n||0).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');
            const tx=(t,x,y,fnt,sz,c,opts)=>{ doc.setFont('helvetica',fnt||'normal'); doc.setFontSize(sz||9); doc.setTextColor(...(c||GR_TXT)); doc.text(String(t||''),x,y,opts||{}); };
            const hl=(x,y,w,c,lw)=>{ doc.setDrawColor(...(c||GR_SEP)); doc.setLineWidth(lw||0.3); doc.line(x,y,x+w,y); };
            const fl=(x,y,w,h,c)=>{ doc.setFillColor(...c); doc.rect(x,y,w,h,'F'); };

            const deptoKey = document.getElementById('selDepto')?.value || 'automatizacion';
            const membreteB64 = window.MEMBRETES?.[deptoKey] || '';
            const folio    = ($('inpFolio')?.value||'SP-S000000').trim();
            const fecha    = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
            const cliente  = ($('inpClientSearch')?.value||'').trim();
            const dir      = ($('inpAddress')?.value||'').trim();
            const rfc      = ($('inpRFC')?.value||'').trim();
            const vendedor = ($('inpVendedor')?.value||$('inpContact')?.value||'').trim();

            const descServ  = ($('repDescripcion')?.value||'').trim();
            const hallazgos = ($('repHallazgos')?.value||'').trim();
            const refacc    = ($('repRefacciones')?.value||'').trim();
            const recomen   = ($('repRecomendaciones')?.value||'').trim();
            const imgs      = window._reportImages || [];

            // ================================================================
            // HEADER / FOOTER REUTILIZABLES
            // ================================================================
            const FY = PH-16;
            let totalPgs = '?';
            const drawHeader = ()=>{
                const HH=48.5, HR=38.2, DX1=74.5, DX2=91.0;
                {
                    const sf=doc.internal.scaleFactor;
                    const ph=doc.internal.pageSize.getHeight();
                    const px=(x)=>(x*sf).toFixed(3);
                    const py=(y)=>((ph-y)*sf).toFixed(3);
                    doc.setFillColor(0xEF,0xF6,0xF6);
                    doc.internal.write(
                        `${px(0)} ${py(0)} m `+
                        `${px(PW)} ${py(0)} l `+
                        `${px(PW)} ${py(HR)} l `+
                        `${px(DX2)} ${py(HR)} l `+
                        `${px(88.6)} ${py(39.5)} l `+
                        `${px(80.0)} ${py(46.9)} l `+
                        `${px(DX1)} ${py(HH)} l `+
                        `${px(0)} ${py(HH)} l `+
                        `h f`
                    );
                }
                try { doc.addImage(LOGO_SQ,'PNG',9,9,28,28); }
                catch(e){ tx('SSEPI',ML,20,'bold',13,TEAL); }
                tx('Bulevard Zodiaco 336, Los Limones,',  PW-5,13,'normal',9,[100,115,125],{align:'right'});
                tx('C.P. 37448, Leon, Guanajuato, México',PW-5,20,'normal',9,[100,115,125],{align:'right'});
                doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(0x3F,0x9E,0x9E);
                const tagLines=doc.splitTextToSize('Conectamos ingeniería, tecnología y productividad industrial',63);
                const tagY0 = tagLines.length>1 ? 39.0 : 42.0;
                tagLines.forEach((l,i)=>doc.text(l,9,tagY0+i*4.2));
                const folioLabel='Num. de cotización '+folio;
                const rightZoneW=PW-DX2-6;
                let fsz=16;
                doc.setFont('helvetica','normal'); doc.setFontSize(fsz);
                while(doc.getTextWidth(folioLabel)>rightZoneW-2 && fsz>10){ fsz--; doc.setFontSize(fsz); }
                doc.setTextColor(0x3F,0x9E,0x9E);
                doc.text(folioLabel, PW-5, HR-2, {align:'right'});
                return HH+5;
            };
            const drawFooter = (pn)=>{
                hl(ML,FY,TW,GR_SEP,0.3);
                tx('Num. de cotización '+folio,  ML,    FY+4,'normal',7,[160,160,160]);
                tx('Conectamos ingeniería, tecnología y productividad industrial', PW/2,FY+4,'italic',7,[160,160,160],{align:'center'});
                tx('Bulevard Zodiaco 336, Los Limones, C.P. 37448, León, Guanajuato, México', PW/2,FY+8,'normal',7,[160,160,160],{align:'center'});
                tx('Tel. 477 737 3118', ML,    FY+12,'normal',7,GR_LT);
                tx('ventas@ssepi.org',  ML+45, FY+12,'normal',7,GR_LT);
                tx('www.ssepi.org',    ML+90, FY+12,'normal',7,GR_LT);
                tx('Página '+pn+' / '+totalPgs, PW-MR,FY+12,'normal',8,GR_LT,{align:'right'});
            };

            // ================================================================
            // PÁGINA 1: MEMBRETE + DATOS BÁSICOS SOLAMENTE
            // ================================================================
            let pgNum=1;
            if (membreteB64) {
                try { doc.addImage(membreteB64, 'JPEG', 0, 0, PW, PH); }
                catch(e) { doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F'); }
            } else {
                doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
            }

            // Folio
            doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(0,47,108);
            doc.text('Folio: '+folio, PW-MR, 35, {align:'right'});

            // Cliente / Fecha / RFC / Vendedor
            doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(26,26,26);
            doc.text(cliente||'Cliente no especificado', ML, 90);
            doc.text(fecha, ML, 97);
            if(rfc) doc.text('RFC: '+rfc, ML, 104);
            doc.text(vendedor||'—', PW-MR, 90, {align:'right'});

            // Pie de contacto (página 1)
            doc.setFontSize(8); doc.setTextColor(130,130,130);
            doc.text('ventas@ssepi.org', ML, PH-12);
            doc.text('477 737 3118', PW/2, PH-12, {align:'center'});
            doc.text('www.ssepi.org', PW-MR, PH-12, {align:'right'});

            // ================================================================
            // SALTO A PÁGINA 2: HEADER + CONTENIDO DEL REPORTE
            // ================================================================
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            let y = drawHeader();

            // Título
            doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(0,47,108);
            doc.text('REPORTE DE SERVICIO TÉCNICO', ML, y);
            hl(ML, y+3, TW, [0,47,108], 1.0);
            y += 13;

            // ── Helper drawSection con salto de página inteligente ──
            const drawSection=(title, content)=>{
                if(!content) return;
                if(y+20 > BODY_BOTTOM){
                    drawFooter(pgNum);
                    doc.addPage(); pgNum++;
                    y = drawHeader();
                }
                doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,47,108);
                doc.text(title, ML, y);
                y+=6;
                doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...GR_TXT);
                const lines = doc.splitTextToSize(content, TW-10);
                lines.forEach(l=>{ doc.text(l, ML+5, y); y+=5; });
                y+=6;
            };

            drawSection('Descripción del servicio realizado', descServ);
            drawSection('Hallazgos / Observaciones', hallazgos);
            drawSection('Refacciones utilizadas', refacc);
            drawSection('Recomendaciones al cliente', recomen);

            // ── Imágenes ──
            if(imgs.length){
                if(y+40 > BODY_BOTTOM){
                    drawFooter(pgNum);
                    doc.addPage(); pgNum++;
                    y = drawHeader();
                }
                doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,47,108);
                doc.text('Evidencias fotográficas', ML, y); y+=10;

                const imgW = 85, imgH = 60, gap = 10;
                let ix = ML, iy = y;
                imgs.forEach((b64, i)=>{
                    try{
                        if(ix + imgW > PW-MR){ ix = ML; iy += imgH + gap + 8; }
                        if(iy + imgH > BODY_BOTTOM){
                            drawFooter(pgNum);
                            doc.addPage(); pgNum++;
                            iy = drawHeader();
                        }
                        doc.addImage(b64, 'JPEG', ix, iy, imgW, imgH);
                        doc.setDrawColor(...GR_SEP); doc.setLineWidth(0.3);
                        doc.rect(ix, iy, imgW, imgH, 'S');
                        ix += imgW + gap;
                    }catch(e){}
                });
            }

            // Footer de la última página
            drawFooter(pgNum);

            if(preview) window.open(doc.output('bloburl'),'_blank');
            else        doc.save('Reporte_'+folio+'.pdf');
            logSystem('Reporte PDF: '+folio+' — '+new Date().toLocaleTimeString());
        }"""

html = html[:start] + new_block + html[end:]

with open(r'../ssepi_servicios_enterprise_v11.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Done. Replaced generarReportePDF successfully.')
