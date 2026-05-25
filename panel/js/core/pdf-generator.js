/**
 * pdf-generator.js — Generador de PDFs unificado SSEPI
 * Funciones exactas copiadas de ssepi_servicios_enterprise_v11.html
 * Adaptación única: lecturas DOM reemplazadas por parámetro data.
 *
 * Requiere: jsPDF, jspdf-autotable, membretes_base64.js (window.MEMBRETES)
 */

import { authService } from './auth-service.js';

// ── Logo SSEPI exacto del Enterprise V11 ──
const LOGO_SQ = "data:image/png;base64,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";

// ── Políticas exactas del Enterprise V11 ──
const DEPTO_POLICIES = {
    electronicos: {
        title: 'Políticas para Reparación de Equipos Electrónicos',
        entrega: 'INMEDIATA a partir de la O.C. (Modificable)',
        lines: [
            'Precio en MONEDA NACIONAL.',
            'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
            'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
            'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
            'La reparación se limita exclusivamente a los componentes y/o fallas detectadas durante la inspección técnica inicial o reportadas por el cliente. En caso de no especificarse una falla concreta, el servicio se entenderá como reparación puntual de los daños visibles o componentes defectuosos identificados.',
            'La garantía NO cubre: fallas distintas o adicionales a la reportada y reparada; daños ocasionados por sobretensiones, picos de voltaje, mala calidad de energía eléctrica, conexiones incorrectas, inversión de fases o cableado defectuoso; manipulación, modificación o reparación por personal ajeno al taller; uso del equipo fuera de las especificaciones del fabricante; daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
            'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye reembolsos en efectivo ni daños indirectos, paros de producción o pérdidas operativas.',
            'El servicio no incluye instalación ni montaje del equipo en su posición original.'
        ]
    },
    motores: {
        title: 'Políticas para Reparación de Motores',
        entrega: '1 SEMANA a partir de la O.C. (Modificable)',
        lines: [
            'Precio en MONEDA NACIONAL.',
            'Se requiere ÓRDEN DE COMPRA para iniciar el servicio.',
            'Después de confirmado el servicio NO SE ACEPTAN CANCELACIONES.',
            'SSEPI ofrece garantía de la unidad por un período de 30 días, contando a partir de la fecha de entrega. La garantía aplica únicamente sobre la falla reparada y los componentes reemplazados durante el servicio realizado.',
            'La garantía NO cubre: fallas distintas o adicionales a la reportada y reparada; daños ocasionados por sobretensiones, picos de voltaje, mala calidad de energía eléctrica, conexiones incorrectas, inversión de fases o cableado defectuoso; manipulación, modificación o reparación por personal ajeno al taller; uso del equipo fuera de las especificaciones del fabricante; daños mecánicos, golpes, cortocircuitos externos o fallas en periféricos conectados.',
            'La garantía consiste únicamente en la revisión y corrección del problema reparado, no incluye reembolsos en efectivo ni daños indirectos, paros de producción o pérdidas operativas.',
            'El servicio no incluye instalación ni montaje del equipo en su posición original.'
        ]
    },
    suministros: {
        title: 'Políticas para Ventas de Suministro',
        entrega: 'Según disponibilidad de inventario',
        lines: [
            'La cotización incluye únicamente los suministros y/o refacciones descritas (número de parte, marca y cantidad).',
            'La disponibilidad de los productos está sujeta a confirmación al momento de la recepción del pago u orden de compra.',
            'La existencia mostrada en la cotización o sistema es referencial y puede variar sin previo aviso.',
            'Precios sujetos a cambio por: Tipo de cambio, Ajustes del fabricante, Disponibilidad de inventario.',
            'Precios expresados en USD, salvo indicación contraria. (Modificable)',
            'El pago podrá ser en Dólares Americanos o Pesos Mexicanos según el tipo de cambio del diario oficial de la fecha del pago.',
            'Los costos de envío no están incluidos, salvo que se indique explícitamente.',
            'Los tiempos de entrega son estimados y comienzan a partir de: Confirmación de pago, Autorización de la orden de compra.',
            'Los productos cuentan con garantía directa del fabricante, conforme a sus políticas.',
            'No se aceptan devoluciones en: Refacciones bajo pedido, Productos importados, Material eléctrico/electrónico abierto o usado.',
            'Una vez confirmado el pedido o realizado el pago: No se aceptan cancelaciones en productos bajo pedido; En productos en stock, se aplicarán cargos administrativos.',
            'El proveedor no se responsabiliza por errores en selección o aplicación del producto.',
            'La factura se emite una vez confirmado el pago.',
            'No se realizarán refacturaciones por errores imputables al cliente.'
        ]
    },
    automatizacion: {
        title: 'Políticas para Proyectos de Automatización',
        entrega: 'Según alcance del proyecto',
        lines: [
            'Condiciones de pago: 50% de anticipo, 50% al terminar las actividades y a las pruebas de funcionamiento.',
            'Se requiere Orden de Compra con el Folio de la cotización.',
            'La cotización incluye únicamente los conceptos, equipos, servicios y actividades descritos en el documento.',
            'Cualquier trabajo, material o modificación no especificada será considerada como trabajo adicional y deberá cotizarse por separado.',
            'El alcance está basado en la información técnica proporcionada por el cliente al momento de la cotización.',
            'Los precios están sujetos a cambio por variaciones en tipo de cambio, disponibilidad de materiales o ajustes de proveedor.',
            'El equipo y/o software entregado seguirá siendo propiedad del proveedor hasta la liquidación total.',
            'Los tiempos de entrega comienzan a contar a partir de la confirmación del anticipo y aprobación técnica del cliente.',
            'Retrasos por causas ajenas al proveedor (falta de información, cambios de alcance, paros del cliente) extienden automáticamente los plazos.',
            'Cualquier cambio solicitado después de aprobada la cotización será evaluado y cotizado como orden de cambio.',
            'Se otorga una garantía de 45 días naturales sobre: Programación PLC y HMI, Integración y funcionamiento del sistema, Mano de obra realizada.',
            'La garantía no cubre: Fallas por mal uso, sobrecargas eléctricas o mecánicas, manipulación por personal no autorizado, daños por condiciones ambientales fuera de especificación o fallas de equipos suministrados por el cliente.',
            'La lógica de control, diagramas y documentación desarrollada son propiedad del proveedor hasta la liquidación total. El cliente podrá usar el sistema únicamente para su operación interna.'
        ]
    },
    soporte: {
        title: 'Políticas para Soporte a Planta',
        entrega: 'Servicio urgente / Correctivo',
        lines: [
            'El servicio realizado corresponde a una atención correctiva puntual solicitada de manera urgente, enfocada en restablecer la operación del equipo en el menor tiempo posible.',
            'Las actividades efectuadas se limitaron a la falla identificada al momento de la intervención.',
            'Las acciones realizadas incluyeron diagnóstico técnico y corrección específica de la condición detectada durante la visita.',
            'No se realizó: Revisión integral del sistema, Ingeniería de mejora, Actualización de programas, Sustitución preventiva de componentes adicionales, salvo que se indique expresamente en el reporte.',
            'El servicio ejecutado no constituye una garantía integral del equipo, sino una intervención correctiva específica.',
            'En caso de presentarse una falla distinta o relacionada con otros componentes no intervenidos, se considerará como un nuevo servicio.',
            'Durante la intervención se pudieron detectar condiciones adicionales que podrían afectar el desempeño o confiabilidad del sistema. Estas observaciones y recomendaciones quedan documentadas en el Reporte de Servicio entregado al cliente.',
            'La no ejecución de dichas recomendaciones puede derivar en fallas posteriores ajenas a la intervención realizada.',
            'El proveedor no es responsable por: Daños derivados de condiciones externas (variaciones eléctricas, humedad, manipulación posterior), Fallas originadas por desgaste natural de componentes, Intervenciones posteriores realizadas por terceros.',
            'La firma del reporte de servicio confirma la conformidad con las actividades realizadas y el restablecimiento operativo al momento de la entrega.'
        ]
    }
};

// ── Mapeo de departamentos a claves de membrete/política ──
const DEPTO_KEY_MAP = {
    'Laboratorio de Electrónica': 'electronicos',
    'Taller': 'electronicos',
    'Laboratorio': 'electronicos',
    'Taller Motores': 'motores',
    'Motores': 'motores',
    'Automatización': 'automatizacion',
    'Proyectos': 'automatizacion',
    'Ventas': 'suministros',
    'Compras': 'suministros',
    'Soporte': 'soporte',
    'Soporte de Planta': 'soporte'
};

// ── Coordenadas zona blanca en Página 1 (membrete) por departamento ──
// Cada membrete tiene un diseño distinto; estos valores posicionan
// el texto dinámico en la zona blanca de cada encabezado.
// xRight = borde derecho de la zona blanca, alineación 'right'
const DEPTO_P1_COORDS = {
    electronicos:   { xRight: 145, folioY: 35,  clienteY: 88, fechaY: 96, rfcY: 104, vendedorY: 118 },
    motores:        { xRight: 80,  folioY: 35,  clienteY: 88, fechaY: 96, rfcY: 104, vendedorY: 118 },
    suministros:    { xRight: 145, folioY: 35,  clienteY: 88, fechaY: 96, rfcY: 104, vendedorY: 118 },
    automatizacion: { xRight: 135, folioY: 35,  clienteY: 88, fechaY: 96, rfcY: 104, vendedorY: 118 },
    soporte:        { xRight: 135, folioY: 35,  clienteY: 88, fechaY: 96, rfcY: 104, vendedorY: 118 }
};

export class PDFGenerator {
    constructor() {
        this.jsPDF = window.jspdf.jsPDF;
    }

    async generateCotizacion(data, user, preview = false) {
        return this._generarPDFV11(data, user, preview);
    }

    async generateOrdenCompra(data, user, preview = false) {
        return this._generarPDFV11({ ...data, departamento: data.departamento || 'Compras' }, user, preview);
    }

    async generateReport(data, user, preview = false) {
        return this._generarReportePDFV11(data, user, preview);
    }

    // ═══════════════════════════════════════════════════════════════════
    // GENERAR COTIZACIÓN / ORDEN (5 páginas con membrete Enterprise V11)
    // ═══════════════════════════════════════════════════════════════════
    async _generarPDFV11(data, user, preview = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit:'mm', format:'a4' });
        const PW=210, PH=297;
        const ML=15, MR=15, TW=PW-ML-MR;

        // ── Paleta exacta Enterprise V11 ──
        const TEAL    = [23,165,152];
        const TEAL_LT = [235,247,245];
        const GR_HDR  = [245,245,245];
        const GR_ROW  = [249,249,249];
        const GR_SEP  = [220,220,220];
        const GR_TXT  = [51,51,51];
        const GR_LT   = [130,130,130];
        const BLK     = [0,0,0];
        const WHT     = [255,255,255];

        // ── Helpers ──
        const fmtMXN = n => '$ '+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
        const hl=(x,y,w,c,lw)=>{ doc.setDrawColor(...(c||GR_SEP)); doc.setLineWidth(lw||0.3); doc.line(x,y,x+w,y); };
        const fl=(x,y,w,h,c)=>{ doc.setFillColor(...c); doc.rect(x,y,w,h,'F'); };
        const tx=(t,x,y,fnt,sz,c,optsTx)=>{
            doc.setFont('times', fnt||'normal');
            doc.setFontSize(sz||9);
            doc.setTextColor(...(c||GR_TXT));
            doc.text(String(t||''), x, y, optsTx||{});
        };

        // ── Datos del objeto data ──
        const folio    = (data.folio||'SP-S000000').trim();
        const fecha    = data.fecha || new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
        const vence    = (data.vence||'').trim();
        const vendedor = (data.vendedor||data.contacto||'').trim();
        const cliente  = (data.cliente||'').trim();
        const dir      = (data.direccion||data.dir||'').trim();
        const rfc      = (data.rfc||'').trim();

        // ================================================================
        // PÁG 1 — MEMBRETE INSTITUCIONAL POR DEPARTAMENTO
        // ================================================================
        const deptoKey = DEPTO_KEY_MAP[data.departamento] || 'automatizacion';
        const membreteB64 = window.MEMBRETES?.[deptoKey] || '';

        if (membreteB64) {
            try { doc.addImage(membreteB64, 'JPEG', 0, 0, PW, PH); }
            catch(e) { doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F'); }
        } else {
            doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
        }

        // ── Página 1: campos horizontales (etiqueta + valor misma línea) ──
        const p1c = DEPTO_P1_COORDS[deptoKey] || DEPTO_P1_COORDS.automatizacion;
        const P1Y   = p1c.folioY;
        const P1LX  = ML + 5;       // etiqueta izquierda
        const P1VX  = ML + 35;      // valor izquierda
        const P1RLX = Math.round(p1c.xRight - 65);  // etiqueta derecha
        const P1RVX = Math.round(p1c.xRight - 28);  // valor derecha
        const INST_BLUE = [0, 47, 108];

        // Fila 1: Folio + Fecha
        doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...INST_BLUE);
        doc.text('Folio:', P1LX, P1Y);
        doc.text('Fecha:', P1RLX, P1Y);
        doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
        doc.text(folio, P1VX, P1Y);
        doc.text(fecha, P1RVX, P1Y);

        // Fila 2: Vendedor + Cliente
        const P1Y2 = P1Y + 12;
        doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...INST_BLUE);
        doc.text('Vendedor:', P1LX, P1Y2);
        doc.text('Cliente:', P1RLX, P1Y2);
        doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
        doc.text(vendedor || '—', P1VX, P1Y2);
        doc.text(cliente || '—', P1RVX, P1Y2);

        // Fila 3: RFC (si aplica)
        if(rfc){
            const P1Y3 = P1Y2 + 12;
            doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...INST_BLUE);
            doc.text('RFC:', P1LX, P1Y3);
            doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
            doc.text(rfc, P1VX, P1Y3);
        }

        // ================================================================
        // ENCABEZADO REUTILIZABLE (páginas de contenido)
        // Retorna Y de inicio del contenido
        // ================================================================
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
            doc.setFont('times','italic'); doc.setFontSize(8.5); doc.setTextColor(0x3F,0x9E,0x9E);
            const tagLines=doc.splitTextToSize('Conectamos ingeniería, tecnología y productividad industrial',63);
            const tagY0 = tagLines.length>1 ? 39.0 : 42.0;
            tagLines.forEach((l,i)=>doc.text(l,9,tagY0+i*4.2));
            const folioLabel='Num. de cotización '+folio;
            const rightZoneW=PW-DX2-6;
            let fsz=16;
            doc.setFont('times','normal'); doc.setFontSize(fsz);
            while(doc.getTextWidth(folioLabel)>rightZoneW-2 && fsz>10){ fsz--; doc.setFontSize(fsz); }
            doc.setTextColor(0x3F,0x9E,0x9E);
            doc.text(folioLabel, PW-5, HR-2, {align:'right'});
            return HH+5;
        };

        // ================================================================
        // FOOTER REUTILIZABLE
        // ================================================================
        const FY = PH-16;
        let totalPgs = '?';
        const drawFooter = (pn)=>{
            hl(ML,FY,TW,GR_SEP,0.3);
            tx('Num. de cotización '+folio,  ML,    FY+4,'normal',7,[160,160,160]);
            tx('Conectamos ingeniería, tecnología y productividad industrial',
               PW/2,FY+4,'italic',7,[160,160,160],{align:'center'});
            tx('Bulevard Zodiaco 336, Los Limones, C.P. 37448, León, Guanajuato, México',
               PW/2,FY+8,'normal',7,[160,160,160],{align:'center'});
            tx('Tel. 477 737 3118', ML,    FY+12,'normal',7,GR_LT);
            tx('ventas@ssepi.org',  ML+45, FY+12,'normal',7,GR_LT);
            tx('www.ssepi.org',    ML+90, FY+12,'normal',7,GR_LT);
            tx('Página '+pn+' / '+totalPgs, PW-MR,FY+12,'normal',8,GR_LT,{align:'right'});
        };

        // ================================================================
        // SALTO A PÁGINA 2: HEADER + CONTENIDO DE LA COTIZACIÓN
        // ================================================================
        let pgNum = 1;
        doc.addPage(); pgNum++;
        let y = drawHeader();

        // ================================================================
        // RECOLECTAR PRODUCTOS DEL OBJETO data
        // ================================================================
        let prods = [];
        const conceptos = data.conceptos || data.items || [];
        if (conceptos && conceptos.length) {
            conceptos.forEach(c => {
                const cant = Number(c.cantidad) || Number(c.qty) || 1;
                const precio = Number(c.precio) || Number(c.precioUnitario) || 0;
                prods.push({
                    desc:    c.descripcion || c.nombre || c.desc || 'Concepto',
                    specs:   c.especificaciones || c.specs || c.especificaciones || '',
                    unidad:  c.unidad || 'Unidades',
                    precio:  precio,
                    qty:     cant,
                    entrega: c.entrega || ''
                });
            });
        }
        if(!prods.length) prods=[{desc:'(Sin conceptos)',specs:'',unidad:'Unidades',precio:0,qty:1,entrega:''}];

        // ================================================================
        // PÁGINA 2: DATOS CLIENTE + TABLA
        // ================================================================
        tx(cliente,ML,y+5,'bold',10,BLK);
        y+=9;
        const dirLines = doc.splitTextToSize(dir,115);
        dirLines.forEach(l=>{ tx(l,ML,y,'normal',9,GR_TXT); y+=5; });
        if(rfc){ tx('RFC: '+rfc,ML,y,'normal',9,GR_TXT); y+=5; }

        // Logo del cliente debajo de la dirección
        if(data.clienteLogo || window._clientLogoB64){
            try{
                const logoSrc = data.clienteLogo || window._clientLogoB64;
                doc.addImage(logoSrc,'PNG',ML,y+1,35,22,'','FAST');
                y+=27;
            }catch(_){y+=3;}
        } else { y+=3; }

        // Línea separadora antes de fecha/vendedor
        hl(ML,y,TW,GR_SEP,0.4);
        y+=7;

        // ── Fecha / Vencimiento / Vendedor ──
        const C3=TW/3;
        tx('Fecha de cotización',ML,      y,'bold',9,BLK);
        tx('Vencimiento',        ML+C3,   y,'bold',9,BLK);
        tx('Vendedor',           ML+C3*2, y,'bold',9,BLK);
        y+=5;
        tx(fecha,          ML,      y,'normal',9,GR_TXT);
        tx(vence||'—',     ML+C3,   y,'normal',9,GR_TXT);
        tx(vendedor||'—',  ML+C3*2, y,'normal',9,GR_TXT);
        y+=9;

        // ── Encabezado de tabla ──
        const CD=85,CC=20,CP=33,CI=20,CM=22;
        const BODY_BOTTOM = 260;

        const drawTH=()=>{
            fl(ML,y,TW,7,GR_HDR);
            hl(ML,y,TW,GR_SEP,0.3);
            tx('Descripción',     ML+3,         y+5,'normal',8,GR_LT);
            tx('Cantidad',        ML+CD+CC/2,   y+5,'normal',8,GR_LT,{align:'center'});
            tx('Precio unitario', ML+CD+CC+CP/2,y+5,'normal',8,GR_LT,{align:'center'});
            tx('Impuestos',       ML+CD+CC+CP+CI/2,y+5,'normal',8,GR_LT,{align:'center'});
            tx('Importe',         ML+TW-CM/2,   y+5,'normal',8,GR_LT,{align:'center'});
            hl(ML,y+7,TW,GR_SEP,0.3);
            [CD,CD+CC,CD+CC+CP,CD+CC+CP+CI].forEach(xo=>{
                doc.setDrawColor(...GR_SEP); doc.setLineWidth(0.2);
                doc.line(ML+xo,y,ML+xo,y+7);
            });
            y+=7;
        };
        drawTH();

        const newPage=()=>{
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y=drawHeader();
            drawTH();
        };

        // ── Filas de productos ──
        let alt=false;
        prods.forEach(p=>{
            const importe = p.precio * p.qty;
            doc.setFont('times','bold'); doc.setFontSize(8.5);
            const titleLns = doc.splitTextToSize(p.desc, CD-5);
            doc.setFont('times','normal'); doc.setFontSize(8);
            const specLns  = p.specs ? doc.splitTextToSize(p.specs, CD-5) : [];
            const totalLns = titleLns.length + specLns.length;
            const rowH     = Math.max(totalLns*4.8+4, 12);
            const entH     = p.entrega ? 6.5 : 0;

            if(y+rowH+entH > BODY_BOTTOM) newPage();

            fl(ML,y,TW,rowH, alt?GR_ROW:WHT);

            tx(titleLns[0]||'', ML+3,y+5,'bold',8.5,BLK);
            if(titleLns.length>1){
                let dy2=y+9.8;
                titleLns.slice(1).forEach(l=>{tx(l,ML+3,dy2,'bold',8.5,BLK);dy2+=4.8;});
            }
            if(specLns.length){
                let dy3=y+5+(titleLns.length*4.8);
                specLns.forEach(l=>{tx(l,ML+3,dy3,'normal',8,GR_TXT);dy3+=4.8;});
            }

            tx(p.qty.toFixed(2), ML+CD+CC-2,y+5,'normal',8.5,GR_TXT,{align:'right'});
            tx(p.unidad,         ML+CD+CC-2,y+9.5,'normal',7,GR_LT,{align:'right'});
            tx(fmtMXN(p.precio), ML+CD+CC+CP-2,y+5,'normal',8.5,GR_TXT,{align:'right'});
            tx('IVA(16%)', ML+CD+CC+CP+CI/2,y+5,'normal',8.5,GR_TXT,{align:'center'});
            tx(fmtMXN(importe), ML+TW-2,y+5,'normal',8.5,GR_TXT,{align:'right'});

            [CD,CD+CC,CD+CC+CP,CD+CC+CP+CI].forEach(xo=>{
                doc.setDrawColor(...GR_SEP);doc.setLineWidth(0.15);
                doc.line(ML+xo,y,ML+xo,y+rowH);
            });
            hl(ML,y+rowH,TW,GR_SEP,0.2);
            y+=rowH; alt=!alt;

            if(p.entrega){
                if(y+entH>BODY_BOTTOM) newPage();
                fl(ML,y,TW,entH,alt?GR_ROW:WHT);
                tx('Tiempo de entrega: '+p.entrega, ML+5,y+entH*0.68,'italic',8.5,GR_LT);
                hl(ML,y+entH,TW,GR_SEP,0.2);
                y+=entH; alt=!alt;
            }
        });

        // ── Totales ──
        y+=5;
        let sub  = parseFloat(data.subtotal||0);
        let iva  = parseFloat(data.iva||0);
        let tot  = parseFloat(data.total||0);
        if(sub===0){ sub=prods.reduce((s,p)=>s+p.precio*p.qty,0); iva=sub*0.16; tot=sub+iva; }

        const TBW=90, TBX=ML+TW-TBW, TRH=8;
        if(y+TRH*3+80>BODY_BOTTOM){ newPage(); y+=5; }

        fl(TBX,y,TBW,TRH,WHT); hl(TBX,y,TBW,GR_SEP,0.3);
        tx('Subtotal',   TBX+4,     y+TRH*.68,'normal',9,GR_TXT);
        tx(fmtMXN(sub),  TBX+TBW-3, y+TRH*.68,'normal',9,GR_TXT,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.3); y+=TRH;

        fl(TBX,y,TBW,TRH,WHT);
        tx('IVA 16%',    TBX+4,     y+TRH*.68,'normal',9,GR_TXT);
        tx(fmtMXN(iva),  TBX+TBW-3, y+TRH*.68,'normal',9,GR_TXT,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.3); y+=TRH;

        fl(TBX,y,TBW,TRH,TEAL_LT);
        tx('Total',      TBX+4,     y+TRH*.68,'bold',9,TEAL);
        tx(fmtMXN(tot),  TBX+TBW-3, y+TRH*.68,'bold',9,TEAL,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.4); y+=TRH+12;

        // ================================================================
        // PÁGINA 3: TIEMPO DE ENTREGA
        // ================================================================
        drawFooter(pgNum);
        doc.addPage(); pgNum++;
        y = drawHeader();

        tx('Tiempo de entrega', ML+4, y, 'bold', 15, BLK);
        y += 10;

        const polEnt = DEPTO_POLICIES[deptoKey];
        if (polEnt) {
            doc.setFont('times','normal'); doc.setFontSize(10);
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

        const polNotes = DEPTO_POLICIES[deptoKey];
        const noteLines = polNotes ? polNotes.lines : [];

        const newPageSolo=()=>{
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y=drawHeader();
        };

        const NL=5.0;
        const NMAX=TW-12;

        noteLines.forEach((line, idx)=>{
            doc.setFont('times','normal'); doc.setFontSize(8);
            const fullText = String.fromCharCode(149) + ' ' + line;
            const linesArr = doc.splitTextToSize(fullText, NMAX);
            const nH = linesArr.length*NL+1.5;
            if(y+nH>BODY_BOTTOM) newPageSolo();

            linesArr.forEach((l, i)=>{
                doc.setFont('times', i===0?'bold':'normal');
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
        y += 14;

        drawFooter(pgNum);

        if(preview){
            const blobUrl = doc.output('bloburl');
            const a = document.createElement('a');
            a.href = blobUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        else        doc.save('Cotizacion_'+folio+'.pdf');
    }

    // ═══════════════════════════════════════════════════════════════════
    // GENERAR REPORTE DE SERVICIO (Enterprise V11 exacto)
    // ═══════════════════════════════════════════════════════════════════
    async _generarReportePDFV11(data, user, preview = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit:'mm', format:'a4' });
        const PW=210, PH=297;
        const ML=15, MR=15, TW=PW-ML-MR;
        const BODY_BOTTOM = 260;

        const BLK=[0,0,0], GR_TXT=[51,51,51], GR_LT=[130,130,130], WHT=[255,255,255];
        const TEAL=[23,165,152], GR_SEP=[220,220,220];

        const fmtMXN = n => '$ '+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
        const tx=(t,x,y,fnt,sz,c,opts)=>{ doc.setFont('helvetica',fnt||'normal'); doc.setFontSize(sz||9); doc.setTextColor(...(c||GR_TXT)); doc.text(String(t||''),x,y,opts||{}); };
        const hl=(x,y,w,c,lw)=>{ doc.setDrawColor(...(c||GR_SEP)); doc.setLineWidth(lw||0.3); doc.line(x,y,x+w,y); };
        const fl=(x,y,w,h,c)=>{ doc.setFillColor(...c); doc.rect(x,y,w,h,'F'); };

        const deptoKey = DEPTO_KEY_MAP[data.departamento] || 'automatizacion';
        const membreteB64 = window.MEMBRETES?.[deptoKey] || '';
        const folio    = (data.folio||'SP-S000000').trim();
        const fecha    = data.fecha || new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
        const cliente  = (data.cliente||'').trim();
        const dir      = (data.direccion||data.dir||'').trim();
        const rfc      = (data.rfc||'').trim();
        const vendedor = (data.vendedor||data.contacto||'').trim();

        const descServ  = (data.repDescripcion||data.descripcion||'').trim();
        const hallazgos = (data.repHallazgos||data.hallazgos||'').trim();
        const refacc    = (data.repRefacciones||data.refacciones||'').trim();
        const recomen   = (data.repRecomendaciones||data.recomendaciones||'').trim();
        const imgs      = data.imagenes || data._reportImages || [];

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
        // PORTADA (MEMBRETE) – opcional
        // ================================================================
        let pgNum = 1;
        let y;
        const sinPortada = data.sinPortada === true;
        const partirSecciones = data.partirSecciones === true && imgs.length > 0;

        if (!sinPortada) {
            if (membreteB64) {
                try { doc.addImage(membreteB64, 'JPEG', 0, 0, PW, PH); }
                catch(e) { doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F'); }
            } else {
                doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
            }

            const p1c = DEPTO_P1_COORDS[deptoKey] || DEPTO_P1_COORDS.automatizacion;
            const P1Y   = p1c.folioY;
            const P1LX  = ML + 5;
            const P1VX  = ML + 35;
            const P1RLX = Math.round(p1c.xRight - 65);
            const P1RVX = Math.round(p1c.xRight - 28);
            const AZUL=[0,47,108];

            doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
            doc.text('Folio:', P1LX, P1Y);
            doc.text('Fecha:', P1RLX, P1Y);
            doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
            doc.text(folio, P1VX, P1Y);
            doc.text(fecha, P1RVX, P1Y);

            const P1Y2 = P1Y + 12;
            doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
            doc.text('Vendedor:', P1LX, P1Y2);
            doc.text('Cliente:', P1RLX, P1Y2);
            doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
            doc.text(vendedor||'—', P1VX, P1Y2);
            doc.text(cliente||'Cliente no especificado', P1RVX, P1Y2);

            if(rfc){
                const P1Y3 = P1Y2 + 12;
                doc.setFont('times','bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
                doc.text('RFC:', P1LX, P1Y3);
                doc.setFont('times','normal'); doc.setFontSize(11); doc.setTextColor(...GR_TXT);
                doc.text(rfc, P1VX, P1Y3);
            }

            doc.setFontSize(8); doc.setTextColor(130,130,130);
            doc.text('ventas@ssepi.org', ML, PH-12);
            doc.text('477 737 3118', PW/2, PH-12, {align:'center'});
            doc.text('www.ssepi.org', PW-MR, PH-12, {align:'right'});

            drawFooter(pgNum);
            doc.addPage(); pgNum++;
        }

        y = drawHeader();

        // Título
        doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(0,47,108);
        doc.text('REPORTE DE SERVICIO TÉCNICO', ML, y);
        hl(ML, y+3, TW, [0,47,108], 1.0);
        y += 13;

        // ── Helper drawSection con salto de página inteligente ──
        let primeraSeccion = true;
        const drawSection=(title, content)=>{
            if(!content) return;
            if(partirSecciones && !primeraSeccion){
                drawFooter(pgNum);
                doc.addPage(); pgNum++;
                y = drawHeader();
            } else if(y+20 > BODY_BOTTOM){
                drawFooter(pgNum);
                doc.addPage(); pgNum++;
                y = drawHeader();
            }
            primeraSeccion = false;
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
                    const fmt = (b64||'').startsWith('data:image/png') ? 'PNG' : 'JPEG';
                    doc.addImage(b64, fmt, ix, iy, imgW, imgH);
                    doc.setDrawColor(...GR_SEP); doc.setLineWidth(0.3);
                    doc.rect(ix, iy, imgW, imgH, 'S');
                    ix += imgW + gap;
                }catch(e){}
            });
        }

        drawFooter(pgNum);

        if(preview){
            const blobUrl = doc.output('bloburl');
            const a = document.createElement('a');
            a.href = blobUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        else        doc.save('Reporte_'+folio+'.pdf');
    }
}

export const pdfGenerator = new PDFGenerator();
window.pdfGenerator = pdfGenerator;
