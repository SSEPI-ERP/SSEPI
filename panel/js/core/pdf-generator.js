/**
 * pdf-generator.js — Generador de PDFs unificado SSEPI
 * Funciones exactas copiadas de ssepi_servicios_enterprise_v11.html
 * Adaptación única: lecturas DOM reemplazadas por parámetro data.
 *
 * Requiere: jsPDF, jspdf-autotable, membretes_base64.js (window.MEMBRETES)
 */

import { authService } from './auth-service.js';

// Logo PNG del panel (preferir asset sin fondo blanco)
const LOGO_SSEPI_URL = '/panel/assets/logo-ssepi.png';
let LOGO_SSEPI_CACHE = null;

function _decodePdfText(s) {
    const raw = String(s || '');
    if (!raw) return '';
    try {
        const ta = document.createElement('textarea');
        ta.innerHTML = raw;
        return ta.value.replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');
    } catch {
        return raw.replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');
    }
}

/** En cotización PDF: materiales muestran solo nombre; la descripción no se repite. */
function _itemTituloPdf(c) {
    const nombre = String(c.nombre || '').trim();
    if (nombre) return nombre;
    const raw = String(c.descripcion || c.desc || '').trim();
    if (!raw) return 'Concepto';
    const sep = raw.indexOf(' — ');
    if (sep > 0) return raw.slice(0, sep).trim();
    return raw;
}

function _itemSpecsPdf(c, titulo) {
    const sku = String(c.sku || '').trim();
    if (sku && sku !== titulo) return sku;
    const specs = String(c.especificaciones || c.specs || '').trim();
    if (!specs || specs === titulo) return '';
    const tLow = titulo.toLowerCase();
    const sLow = specs.toLowerCase();
    if (sLow === tLow || sLow.startsWith(tLow + ' —')) return '';
    if (specs.includes(' — ') && specs.split(' — ').every((p) => p.trim().toLowerCase() === tLow)) return '';
    if (specs.length > 40) return '';
    return specs;
}

function _clienteFieldsFromData(data) {
    const c = data.clienteContacto || {};
    const nombre = String(c.nombre || data.cliente || '').trim();
    const empresa = String(c.empresa || data.clienteEmpresa || '').trim();
    return {
        nombre,
        empresa: empresa && empresa.toLowerCase() !== nombre.toLowerCase() ? empresa : '',
        email: String(c.email || data.email || '').trim(),
        telefono: String(c.telefono || data.telefono || '').trim(),
        rfc: String(c.rfc || data.rfc || '').trim(),
        direccion: String(c.direccion || data.direccion || data.dir || '').trim(),
        puesto: String(c.puesto || data.puesto || '').trim(),
        logo: String(c.logo_url || data.clienteLogo || window._clientLogoB64 || '').trim()
    };
}

/** Bloque cliente con foto + datos de contacto (debajo del membrete). Retorna nueva Y. */
function _drawClienteSectionPdf(doc, ctx, startY) {
    const { tx, ML, TW, PDF_SZ_TITLE, PDF_SZ_BODY, BLK, GR_TXT, GR_LT } = ctx;
    const cf = ctx.clienteFields;
    if (!cf.nombre && !cf.empresa) return startY;

    let y = startY;
    const photoSize = 20;
    const textX = cf.logo ? ML + photoSize + 4 : ML;
    const maxTextW = TW - (textX - ML) - 4;
    const rowStart = y;

    if (cf.logo) {
        try {
            doc.addImage(cf.logo, 'PNG', ML, y, photoSize, photoSize, undefined, 'FAST');
        } catch (_) { /* imagen no válida */ }
    }

    let ty = y + 5;
    const titulo = cf.empresa || cf.nombre;
    tx(titulo, textX, ty, 'bold', PDF_SZ_TITLE, BLK);
    ty += 5.5;

    if (cf.empresa && cf.nombre && cf.empresa.toLowerCase() !== cf.nombre.toLowerCase()) {
        const contacto = cf.puesto ? `${cf.nombre} · ${cf.puesto}` : cf.nombre;
        tx(contacto, textX, ty, 'normal', PDF_SZ_BODY, GR_TXT);
        ty += 5;
    }
    if (cf.rfc) {
        tx('RFC: ' + cf.rfc, textX, ty, 'normal', PDF_SZ_BODY, GR_TXT);
        ty += 5;
    }
    if (cf.direccion) {
        doc.splitTextToSize(cf.direccion, maxTextW).forEach((l) => {
            tx(l, textX, ty, 'normal', PDF_SZ_BODY, GR_TXT);
            ty += 4.8;
        });
    }
    const contactLine = [cf.telefono && ('Tel: ' + cf.telefono), cf.email].filter(Boolean).join('  ·  ');
    if (contactLine) {
        doc.splitTextToSize(contactLine, maxTextW).forEach((l) => {
            tx(l, textX, ty, 'normal', 10, GR_LT);
            ty += 4.8;
        });
    }

    const blockH = Math.max(cf.logo ? photoSize + 2 : 0, ty - rowStart);
    return rowStart + blockH + 4;
}

async function _loadLogoSsepiTransparent() {
    if (LOGO_SSEPI_CACHE) return LOGO_SSEPI_CACHE;
    try {
        const res = await fetch(LOGO_SSEPI_URL, { cache: 'force-cache' });
        if (!res.ok) throw new Error('logo fetch');
        const blob = await res.blob();
        LOGO_SSEPI_CACHE = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
        return LOGO_SSEPI_CACHE;
    } catch {
        return null;
    }
}

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
    'Ventas y Suministros': 'suministros',
    'Compras': 'suministros',
    'Soporte': 'soporte',
    'Soporte de Planta': 'soporte',
    'Soporte a Planta': 'soporte'
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
        return this._generarPDFV11({
            ...data,
            departamento: data.departamento || 'Automatización',
            omitirPoliticas: data.omitirPoliticas !== false,
            tipoDoc: data.tipoDoc || 'orden_compra'
        }, user, preview);
    }

    async generateReport(data, user, preview = false) {
        return this._generarReportePDFV11(data, user, preview);
    }

    /** PDF de póliza / políticas (Laboratorio, Motores, Auto…) — mismo layout que Compras v8. */
    async generatePolitica(data, user, preview = false, opts = {}) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const PW = 210, PH = 297, ML = 15, MR = 15, TW = PW - ML - MR;
        const BODY_BOTTOM = PH - 20;
        const logoSsepi = await _loadLogoSsepiTransparent();
        const TEAL = [23, 165, 152], GR_SEP = [220, 220, 220], GR_TXT = [51, 51, 51];
        const GR_LT = [130, 130, 130], BLK = [0, 0, 0], WHT = [255, 255, 255];
        const FOLDER = [239, 246, 246], GR_HDR = [245, 245, 245];
        const PDF_FONT = 'helvetica', PDF_SZ_BODY = 11, PDF_SZ_TITLE = 12;
        const folio = _decodePdfText(data.folio || ('POL-' + Date.now().toString().slice(-6))).trim();
        const deptoKey = DEPTO_KEY_MAP[data.departamento] || 'automatizacion';
        const membreteB64 = window.MEMBRETES?.[deptoKey] || '';
        const hl = (x, y, w, c, lw) => { doc.setDrawColor(...(c || GR_SEP)); doc.setLineWidth(lw || 0.3); doc.line(x, y, x + w, y); };
        const fl = (x, y, w, h, c) => { doc.setFillColor(...c); doc.rect(x, y, w, h, 'F'); };
        const tx = (t, x, y, fnt, sz, c, optsTx) => {
            doc.setFont(PDF_FONT, fnt || 'normal'); doc.setFontSize(sz || PDF_SZ_BODY);
            doc.setTextColor(...(c || GR_TXT)); doc.text(String(t || ''), x, y, optsTx || {});
        };
        const drawFolder = (x, y, w, h, fillColor, borderColor, lw) => {
            doc.setFillColor(...fillColor); doc.setDrawColor(...(borderColor || GR_SEP));
            doc.setLineWidth(lw || 0.4); doc.rect(x, y, w, h, 'FD');
        };

        if (membreteB64) {
            try { doc.addImage(membreteB64, 'JPEG', 0, 0, PW, PH); }
            catch (_) { fl(0, 0, PW, PH, WHT); }
        } else {
            fl(0, 0, PW, PH, WHT);
            tx('SSEPI', PW / 2, 70, 'bold', 22, TEAL, { align: 'center' });
        }

        const drawHeader = () => {
            const HH = 48.5, HR = 38.2, DX1 = 74.5, DX2 = 91.0, LOGO_S = 20;
            const sf = doc.internal.scaleFactor;
            const ph = doc.internal.pageSize.getHeight();
            const px = (x) => (x * sf).toFixed(3);
            const py = (y) => ((ph - y) * sf).toFixed(3);
            doc.setFillColor(0xEF, 0xF6, 0xF6);
            doc.internal.write(
                `${px(0)} ${py(0)} m ${px(PW)} ${py(0)} l ${px(PW)} ${py(HR)} l ${px(DX2)} ${py(HR)} l ` +
                `${px(88.6)} ${py(39.5)} l ${px(80.0)} ${py(46.9)} l ${px(DX1)} ${py(HH)} l ${px(0)} ${py(HH)} l h f`
            );
            try {
                if (logoSsepi) doc.addImage(logoSsepi, 'PNG', 9, 8, LOGO_S, LOGO_S, undefined, 'FAST');
                else throw new Error('no logo');
            } catch (_) { tx('SSEPI', ML, 18, 'bold', 12, TEAL); }
            tx('Bulevard Zodiaco 336, Los Limones,', PW - 5, 12, 'normal', 8.5, [100, 115, 125], { align: 'right' });
            tx('C.P. 37448, Leon, Guanajuato, México', PW - 5, 18, 'normal', 8.5, [100, 115, 125], { align: 'right' });
            doc.setFont(PDF_FONT, 'italic'); doc.setFontSize(8.5); doc.setTextColor(0x3F, 0x9E, 0x9E);
            doc.splitTextToSize('Conectamos ingeniería, tecnología y productividad industrial', 58)
                .slice(0, 2).forEach((l, i) => doc.text(l, 9, 30 + i * 3.8));
            const folioLabel = 'Num. de póliza ' + folio;
            let fsz = 14;
            doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(fsz);
            const rightZoneW = PW - DX2 - 6;
            while (doc.getTextWidth(folioLabel) > rightZoneW - 2 && fsz > 9) { fsz--; doc.setFontSize(fsz); }
            doc.setTextColor(0x3F, 0x9E, 0x9E);
            doc.text(folioLabel, PW - 5, HR - 2, { align: 'right' });
            return HH + 5;
        };

        let totalPgs = '?';
        const FY = PH - 16;
        const drawFooter = (pn) => {
            hl(ML, FY, TW, GR_SEP, 0.3);
            tx('Num. de póliza ' + folio, ML, FY + 4, 'normal', 7, [160, 160, 160]);
            tx('Conectamos ingeniería, tecnología y productividad industrial', PW / 2, FY + 4, 'italic', 7, [160, 160, 160], { align: 'center' });
            tx('Bulevard Zodiaco 336, Los Limones, C.P. 37448, León, Guanajuato, México', PW / 2, FY + 8, 'normal', 7, [160, 160, 160], { align: 'center' });
            tx('Tel. 477 737 3118', ML, FY + 12, 'normal', 7, GR_LT);
            tx('ventas@ssepi.org', ML + 45, FY + 12, 'normal', 7, GR_LT);
            tx('www.ssepi.org', ML + 90, FY + 12, 'normal', 7, GR_LT);
            tx('Página ' + pn + ' / ' + totalPgs, PW - MR, FY + 12, 'normal', 8, GR_LT, { align: 'right' });
        };

        let pgNum = 1;
        doc.addPage(); pgNum++;
        let y = drawHeader();
        const newPageSolo = () => { drawFooter(pgNum); doc.addPage(); pgNum++; y = drawHeader(); };

        const cc = data.clienteContacto || {};
        const clienteCtx = {
            tx, ML, TW, PDF_SZ_TITLE, PDF_SZ_BODY, BLK, GR_TXT, GR_LT,
            clienteFields: _clienteFieldsFromData({
                ...data,
                cliente: cc.nombre || cc.empresa || data.cliente,
                clienteContacto: cc,
                clienteLogo: cc.logo_url || data.clienteLogo
            })
        };
        y = _drawClienteSectionPdf(doc, clienteCtx, y);
        if (y > drawHeader() + 2) y += 2;

        const s2pad = 5;
        let s2y = y, s2h = s2pad + 2;
        tx('Detalles del Servicio', ML + s2pad, s2y + s2h, 'bold', PDF_SZ_TITLE, TEAL);
        hl(ML + s2pad, s2y + s2h + 2, 28, TEAL, 0.8);
        s2h += 10;
        const drawPair = (lab1, val1, lab2, val2, yy) => {
            const colW = TW / 2 - 8;
            if (lab1) { tx(lab1, ML + s2pad, yy, 'normal', 9, GR_LT); tx(val1 || '—', ML + s2pad + 50, yy, 'bold', 10, BLK); }
            if (lab2) { tx(lab2, ML + colW + 4, yy, 'normal', 9, GR_LT); tx(val2 || '—', ML + colW + 56, yy, 'bold', 10, BLK); }
            return yy + 6.5;
        };
        if (data.tiempoEntrega || data.garantia) { drawPair('Tiempo de entrega:', data.tiempoEntrega, 'Garantía:', data.garantia, s2y + s2h); s2h += 6.5; }
        if (data.moneda || data.servicio) { drawPair('Moneda:', data.moneda, 'Servicio:', data.servicio, s2y + s2h); s2h += 6.5; }
        s2h += s2pad;
        if (s2h < 28) s2h = 28;
        drawFolder(ML, s2y, TW, s2h, WHT, GR_SEP, 0.5);
        y = s2y + s2h + 4;

        const polDef = DEPTO_POLICIES[deptoKey];
        const notas = (data.notas && data.notas.length) ? data.notas : (polDef ? polDef.lines : []);
        const s3pad = 5;
        let s3y = y;
        const NL = 5.5, NMAX = TW - 12;
        let s3h = s3pad + 8;
        notas.forEach((nota) => {
            const lines = doc.splitTextToSize(String(nota || ''), NMAX);
            s3h += lines.length * NL + 2;
        });
        s3h += 10;
        if (s3y + s3h > BODY_BOTTOM) { newPageSolo(); s3y = y; }
        drawFolder(ML, s3y, TW, s3h, FOLDER, GR_SEP, 0.5);
        y = s3y + s3pad;
        tx('Notas Importantes', ML + s3pad, y, 'bold', 14, BLK); y += 7;
        if (!notas.length) tx('No hay políticas configuradas.', ML + 10, y, 'italic', 10, [150, 150, 150]);
        notas.forEach((nota, idx) => {
            const lines = doc.splitTextToSize(String(nota || ''), NMAX);
            const nH = lines.length * NL + 2;
            if (y + nH > BODY_BOTTOM) { drawFooter(pgNum); doc.addPage(); pgNum++; y = drawHeader() + s3pad; }
            tx((idx + 1) + '.', ML + s3pad, y + 4, 'normal', 9, GR_TXT);
            lines.forEach((l, i) => tx(l, ML + 10, y + 4 + i * NL, 'normal', 9, GR_TXT));
            y += nH;
        });
        y += 4;
        tx('Para mayor información revise nuestros términos y condiciones en: ' + (data.urlTerminos || 'https://www.ssepi.org/terms'), ML + s3pad, y, 'normal', 8, GR_LT);

        totalPgs = doc.internal.pages ? String(doc.internal.pages.length - 1) : '?';
        drawFooter(pgNum);

        const fname = 'Politicas_' + (data.departamento || 'SSEPI').replace(/\s+/g, '_') + '_' + folio + '.pdf';
        if (opts.returnDoc) return doc;
        if (preview) {
            const blobUrl = doc.output('bloburl');
            const a = document.createElement('a');
            a.href = blobUrl; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } else {
            doc.save(fname);
        }
        return doc;
    }

    // ═══════════════════════════════════════════════════════════════════
    // GENERAR COTIZACIÓN / ORDEN (5 páginas con membrete Enterprise V11)
    // ═══════════════════════════════════════════════════════════════════
    async _generarPDFV11(data, user, preview = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit:'mm', format:'a4' });
        const PW=210, PH=297;
        const ML=15, MR=15, TW=PW-ML-MR;
        const logoSsepi = await _loadLogoSsepiTransparent();
        const omitirPoliticas = !!data.omitirPoliticas;

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
        const PDF_FONT = 'helvetica';
        const PDF_SZ_BODY = 12;
        const PDF_SZ_TITLE = 12;
        const tx=(t,x,y,fnt,sz,c,optsTx)=>{
            doc.setFont(PDF_FONT, fnt||'normal');
            doc.setFontSize(sz||PDF_SZ_BODY);
            doc.setTextColor(...(c||GR_TXT));
            doc.text(String(t||''), x, y, optsTx||{});
        };

        // ── Datos del objeto data ──
        const folio    = _decodePdfText(data.folio || 'SP-S000000').trim();
        const fecha    = data.fecha || new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
        const vence    = _decodePdfText(data.vence || '').trim();
        const vendedor = _decodePdfText(data.vendedor || data.contacto || '').trim();
        const cliente  = _decodePdfText(data.cliente || '').trim();
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
            // Portada: solo imagen de membrete; folio/cliente van en página 2 (drawHeader).
        } else {
            doc.setFillColor(255,255,255); doc.rect(0,0,PW,PH,'F');
            // Sin membrete: campos en portada
            const p1c = DEPTO_P1_COORDS[deptoKey] || DEPTO_P1_COORDS.automatizacion;
            const P1Y   = p1c.folioY;
            const P1LX  = ML + 5;
            const P1VX  = ML + 35;
            const P1RLX = Math.round(p1c.xRight - 65);
            const P1RVX = Math.round(p1c.xRight - 28);
            const INST_BLUE = [0, 47, 108];

            doc.setFont(PDF_FONT,'bold'); doc.setFontSize(PDF_SZ_TITLE); doc.setTextColor(...INST_BLUE);
            doc.text('Folio:', P1LX, P1Y);
            doc.text('Fecha:', P1RLX, P1Y);
            doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY); doc.setTextColor(...GR_TXT);
            doc.text(folio, P1VX, P1Y);
            doc.text(fecha, P1RVX, P1Y);

            const P1Y2 = P1Y + 12;
            doc.setFont(PDF_FONT,'bold'); doc.setFontSize(PDF_SZ_TITLE); doc.setTextColor(...INST_BLUE);
            doc.text('Vendedor:', P1LX, P1Y2);
            doc.text('Cliente:', P1RLX, P1Y2);
            doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY); doc.setTextColor(...GR_TXT);
            doc.text(vendedor || '—', P1VX, P1Y2);
            doc.text(cliente || '—', P1RVX, P1Y2);

            if(rfc){
                const P1Y3 = P1Y2 + 12;
                doc.setFont(PDF_FONT,'bold'); doc.setFontSize(PDF_SZ_TITLE); doc.setTextColor(...INST_BLUE);
                doc.text('RFC:', P1LX, P1Y3);
                doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY); doc.setTextColor(...GR_TXT);
                doc.text(rfc, P1VX, P1Y3);
            }
        }

        // ================================================================
        // ENCABEZADO REUTILIZABLE (páginas de contenido)
        // Retorna Y de inicio del contenido
        // ================================================================
        const drawHeader = ()=>{
            const HH=48.5, HR=38.2, DX1=74.5, DX2=91.0;
            const LOGO_S = 20;
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
            try {
                if (logoSsepi) doc.addImage(logoSsepi, 'PNG', 9, 8, LOGO_S, LOGO_S, undefined, 'FAST');
                else throw new Error('no logo');
            } catch(e){ tx('SSEPI',ML,18,'bold',12,TEAL); }
            tx('Bulevard Zodiaco 336, Los Limones,',  PW-5,12,'normal',8.5,[100,115,125],{align:'right'});
            tx('C.P. 37448, Leon, Guanajuato, México',PW-5,18,'normal',8.5,[100,115,125],{align:'right'});
            doc.setFont(PDF_FONT,'italic'); doc.setFontSize(8.5); doc.setTextColor(0x3F,0x9E,0x9E);
            const tagLines=doc.splitTextToSize('Conectamos ingeniería, tecnología y productividad industrial',58);
            const tagY0 = 30;
            tagLines.slice(0, 2).forEach((l,i)=>doc.text(l,9,tagY0+i*3.8));
            const cfHdr = _clienteFieldsFromData(data);
            if (cfHdr.nombre || cfHdr.empresa) {
                const lbl = cfHdr.empresa || cfHdr.nombre;
                doc.setFont(PDF_FONT,'normal'); doc.setFontSize(8); doc.setTextColor(...GR_LT);
                const short = lbl.length > 42 ? lbl.slice(0, 40) + '…' : lbl;
                doc.text('Cliente: ' + short, 9, tagY0 + (tagLines.length > 1 ? 8 : 5));
            }
            const docLabel = data.tipoDoc === 'orden_compra' ? 'Orden de compra ' : 'Num. de cotización ';
            const folioLabel = docLabel + folio;
            const rightZoneW=PW-DX2-6;
            let fsz=15;
            doc.setFont(PDF_FONT,'bold'); doc.setFontSize(fsz);
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
                const precio = Number(c.precio) || Number(c.precioUnitario) || Number(c.precio_unitario) || 0;
                const titulo = _itemTituloPdf(c);
                prods.push({
                    desc:    titulo,
                    specs:   _itemSpecsPdf(c, titulo),
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
        const clienteCtx = {
            tx, ML, TW, PDF_SZ_TITLE, PDF_SZ_BODY, BLK, GR_TXT, GR_LT,
            clienteFields: _clienteFieldsFromData(data)
        };
        y = _drawClienteSectionPdf(doc, clienteCtx, y);

        // Línea separadora antes de fecha/vendedor
        hl(ML,y,TW,GR_SEP,0.4);
        y+=7;

        // ── Fecha / Vencimiento / Vendedor ──
        const fechaLabel = data.tipoDoc === 'orden_compra' ? 'Fecha de orden' : 'Fecha de cotización';
        const C3=TW/3;
        tx(fechaLabel,ML,      y,'bold',PDF_SZ_TITLE,BLK);
        tx('Vencimiento',        ML+C3,   y,'bold',PDF_SZ_TITLE,BLK);
        tx('Vendedor',           ML+C3*2, y,'bold',PDF_SZ_TITLE,BLK);
        y+=5;
        tx(fecha,          ML,      y,'normal',PDF_SZ_BODY,GR_TXT);
        tx(vence||'—',     ML+C3,   y,'normal',PDF_SZ_BODY,GR_TXT);
        tx(vendedor||'—',  ML+C3*2, y,'normal',PDF_SZ_BODY,GR_TXT);
        y+=9;

        // ── Encabezado de tabla ──
        const CD=85,CC=20,CP=33,CI=20,CM=22;
        const BODY_BOTTOM = 260;

        const drawTH=()=>{
            fl(ML,y,TW,7,GR_HDR);
            hl(ML,y,TW,GR_SEP,0.3);
            tx('Descripción',     ML+3,         y+5,'bold',PDF_SZ_TITLE,GR_LT);
            tx('Cantidad',        ML+CD+CC/2,   y+5,'bold',PDF_SZ_TITLE,GR_LT,{align:'center'});
            tx('Precio unitario', ML+CD+CC+CP/2,y+5,'bold',PDF_SZ_TITLE,GR_LT,{align:'center'});
            tx('Impuestos',       ML+CD+CC+CP+CI/2,y+5,'bold',PDF_SZ_TITLE,GR_LT,{align:'center'});
            tx('Importe',         ML+TW-CM/2,   y+5,'bold',PDF_SZ_TITLE,GR_LT,{align:'center'});
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
            doc.setFont(PDF_FONT,'bold'); doc.setFontSize(PDF_SZ_TITLE);
            const titleLns = doc.splitTextToSize(p.desc, CD-5);
            const specsRaw = String(p.specs || '').trim();
            const descRaw = String(p.desc || '').trim();
            const specLns = specsRaw && specsRaw !== descRaw
                ? doc.splitTextToSize(specsRaw, CD-5)
                : [];
            doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY);
            const totalLns = titleLns.length + specLns.length;
            const rowH     = Math.max(totalLns*4.8+4, 12);
            const entH     = p.entrega ? 6.5 : 0;

            if(y+rowH+entH > BODY_BOTTOM) newPage();

            fl(ML,y,TW,rowH, alt?GR_ROW:WHT);

            tx(titleLns[0]||'', ML+3,y+5,'bold',PDF_SZ_TITLE,BLK);
            if(titleLns.length>1){
                let dy2=y+9.8;
                titleLns.slice(1).forEach(l=>{tx(l,ML+3,dy2,'bold',PDF_SZ_TITLE,BLK);dy2+=5.5;});
            }
            if(specLns.length){
                let dy3=y+5+(titleLns.length*5.5);
                specLns.forEach(l=>{tx(l,ML+3,dy3,'normal',PDF_SZ_BODY,GR_TXT);dy3+=5.5;});
            }

            tx(p.qty.toFixed(2), ML+CD+CC-2,y+5,'normal',PDF_SZ_BODY,GR_TXT,{align:'right'});
            tx(p.unidad,         ML+CD+CC-2,y+9.5,'normal',PDF_SZ_BODY,GR_LT,{align:'right'});
            tx(fmtMXN(p.precio), ML+CD+CC+CP-2,y+5,'normal',PDF_SZ_BODY,GR_TXT,{align:'right'});
            tx('IVA(16%)', ML+CD+CC+CP+CI/2,y+5,'normal',PDF_SZ_BODY,GR_TXT,{align:'center'});
            tx(fmtMXN(importe), ML+TW-2,y+5,'normal',PDF_SZ_BODY,GR_TXT,{align:'right'});

            [CD,CD+CC,CD+CC+CP,CD+CC+CP+CI].forEach(xo=>{
                doc.setDrawColor(...GR_SEP);doc.setLineWidth(0.15);
                doc.line(ML+xo,y,ML+xo,y+rowH);
            });
            hl(ML,y+rowH,TW,GR_SEP,0.2);
            y+=rowH; alt=!alt;

            if(p.entrega){
                if(y+entH>BODY_BOTTOM) newPage();
                fl(ML,y,TW,entH,alt?GR_ROW:WHT);
                tx('Tiempo de entrega: '+p.entrega, ML+5,y+entH*0.68,'italic',PDF_SZ_BODY,GR_LT);
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
        tx('Subtotal',   TBX+4,     y+TRH*.68,'bold',PDF_SZ_TITLE,GR_TXT);
        tx(fmtMXN(sub),  TBX+TBW-3, y+TRH*.68,'normal',PDF_SZ_BODY,GR_TXT,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.3); y+=TRH;

        fl(TBX,y,TBW,TRH,WHT);
        tx('IVA 16%',    TBX+4,     y+TRH*.68,'bold',PDF_SZ_TITLE,GR_TXT);
        tx(fmtMXN(iva),  TBX+TBW-3, y+TRH*.68,'normal',PDF_SZ_BODY,GR_TXT,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.3); y+=TRH;

        fl(TBX,y,TBW,TRH,TEAL_LT);
        tx('Total',      TBX+4,     y+TRH*.68,'bold',PDF_SZ_TITLE,TEAL);
        tx(fmtMXN(tot),  TBX+TBW-3, y+TRH*.68,'bold',PDF_SZ_TITLE,TEAL,{align:'right'});
        hl(TBX,y+TRH,TBW,GR_SEP,0.4); y+=TRH+12;

        if (!omitirPoliticas) {
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();
            tx('Tiempo de entrega', ML+4, y, 'bold', PDF_SZ_TITLE, BLK);
            y += 10;
            const polEnt = DEPTO_POLICIES[deptoKey];
            if (polEnt) {
                doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY);
                doc.setTextColor(...GR_TXT);
                doc.text(polEnt.entrega, ML+4, y);
            }
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();
            tx('Notas Importantes', ML+4, y, 'bold', PDF_SZ_TITLE, BLK);
            y += 10;
            const polNotes = DEPTO_POLICIES[deptoKey];
            const noteLines = polNotes ? polNotes.lines : [];
            const NL=5.0;
            const NMAX=TW-12;
            noteLines.forEach((line) => {
                doc.setFont(PDF_FONT,'normal'); doc.setFontSize(PDF_SZ_BODY);
                const fullText = String.fromCharCode(149) + ' ' + line;
                const linesArr = doc.splitTextToSize(fullText, NMAX);
                const nH = linesArr.length*NL+1.5;
                if (y+nH > BODY_BOTTOM) {
                    drawFooter(pgNum);
                    doc.addPage(); pgNum++;
                    y = drawHeader();
                }
                linesArr.forEach((l, i) => {
                    doc.setFont(PDF_FONT, i===0?'bold':'normal');
                    doc.setTextColor(...GR_TXT);
                    doc.text(l, ML+10, y+4+i*NL);
                });
                y += nH;
            });
            drawFooter(pgNum);
            doc.addPage(); pgNum++;
            y = drawHeader();
            tx('Términos de Pago', ML+4, y, 'bold', PDF_SZ_TITLE, BLK);
            y += 10;
            tx('El cliente se obliga a pagar el importe total de esta cotización dentro de los 30 días naturales posteriores a la fecha de emisión.', ML+4, y, 'normal', PDF_SZ_BODY, GR_TXT);
            y += 8;
            tx('En caso de incumplimiento, se aplicarán cargos por mora del 1.5% mensual sobre el saldo pendiente.', ML+4, y, 'normal', PDF_SZ_BODY, GR_TXT);
            drawFooter(pgNum);
        } else {
            drawFooter(pgNum);
        }

        if (preview) {
            const blobUrl = doc.output('bloburl');
            const embedId = data.embedPreviewId;
            if (embedId) {
                const el = document.getElementById(embedId);
                if (el) {
                    if (el.tagName === 'IFRAME') el.src = blobUrl;
                    else {
                        el.innerHTML = '<iframe src="' + blobUrl + '" title="Vista previa cotización" style="width:100%;height:100%;border:0;"></iframe>';
                    }
                    return blobUrl;
                }
            }
            const a = document.createElement('a');
            a.href = blobUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return blobUrl;
        }
        doc.save('Cotizacion_' + folio + '.pdf');
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
        const logoSsepi = await _loadLogoSsepiTransparent();

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
            try {
                if (logoSsepi) doc.addImage(logoSsepi, 'PNG', 9, 9, 28, 28, undefined, 'FAST');
                else throw new Error('no logo');
            } catch(e){ tx('SSEPI',ML,20,'bold',13,TEAL); }
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
