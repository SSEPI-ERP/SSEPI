        async function generarReportePDF(preview = false) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit:'mm', format:'a4' });
            const PW=210, PH=297;
            const ML=15, MR=15, TW=PW-ML-MR;

            // ── Paleta ──
            const BLK=[0,0,0], GR_TXT=[51,51,51], GR_LT=[130,130,130], WHT=[255,255,255];
            const TEAL=[23,165,152], GR_SEP=[220,220,220];

            const $ = id => document.getElementById(id);
            const fmtMXN = n => '$ '+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
            const tx=(t,x,y,fnt,sz,c,opts)=>{ doc.setFont('helvetica',fnt||'normal'); doc.setFontSize(sz||9); doc.setTextColor(...(c||GR_TXT)); doc.text(String(t||''),x,y,opts||{}); };
            const hl=(x,y,w,c,lw)=>{ doc.setDrawColor(...(c||GR_SEP)); doc.setLineWidth(lw||0.3); doc.line(x,y,x+w,y); };

            // ── Datos ──
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
            // PÁG 1: MEMBRETE + DATOS DEL CLIENTE
            // ================================================================
            if (membreteB64) {
                try { doc.addImage(membreteB64, 'JPEG', 0, 0, PW, PH); }
                catch(e) { doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F'); }
            } else {
                doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
            }

            // Folio
            doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(0,47,108);
            doc.text('Folio: '+folio, PW-MR, 35, {align:'right'});

            // Cliente / Fecha / Vendedor (empujados +35mm para respetar membrete)
            doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(26,26,26);
            doc.text(cliente||'Cliente no especificado', ML, 90);
            doc.text(fecha, ML, 97);
            if(rfc) doc.text('RFC: '+rfc, ML, 104);
            doc.text(vendedor||'—', PW-MR, 90, {align:'right'});

            // Título Reporte
            doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(0,47,108);
            doc.text('REPORTE DE SERVICIO TÉCNICO', ML, 120);
            hl(ML, 123, TW, [0,47,108], 1.0);

            let y = 133; // Inicio de secciones dinámicas debajo del título
            const drawSection=(title, content)=>{
                if(!content) return;
                if(y+20 > PH-40) { doc.addPage(); y=20; }
                doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,47,108);
                doc.text(title, ML, y);
                y+=6;
                doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...GR_TXT);
                const lines = doc.splitTextToSize(content, TW-10);
                lines.forEach(l=>{ doc.text(l, ML+5, y); y+=5; });
                y+=4;
            };

            drawSection('Descripción del servicio realizado', descServ);
            drawSection('Hallazgos / Observaciones', hallazgos);
            drawSection('Refacciones utilizadas', refacc);
            drawSection('Recomendaciones al cliente', recomen);

            // ── Imágenes ──
            if(imgs.length){
                if(y+40 > PH-40) { doc.addPage(); y=20; }
                doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,47,108);
                doc.text('Evidencias fotográficas', ML, y); y+=10;

                const imgW = 85, imgH = 60, gap = 10;
                let ix = ML, iy = y;
                imgs.forEach((b64, i)=>{
                    try{
                        if(ix + imgW > PW-MR){ ix = ML; iy += imgH + gap + 8; }
                        if(iy + imgH > PH-20){ doc.addPage(); iy = 20; }
                        doc.addImage(b64, 'JPEG', ix, iy, imgW, imgH);
                        // Borde sutil
                        doc.setDrawColor(...GR_SEP); doc.setLineWidth(0.3);
                        doc.rect(ix, iy, imgW, imgH, 'S');
                        ix += imgW + gap;
                    }catch(e){}
                });
            }

            // Pie de contacto
            doc.setFontSize(8); doc.setTextColor(130,130,130);
            doc.text('ventas@ssepi.org', ML, PH-12);
            doc.text('477 737 3118', PW/2, PH-12, {align:'center'});
            doc.text('www.ssepi.org', PW-MR, PH-12, {align:'right'});

            if(preview) window.open(doc.output('bloburl'),'_blank');
            else        doc.save('Reporte_'+folio+'.pdf');
            logSystem('Reporte PDF: '+folio+' — '+new Date().toLocaleTimeString());
        }