/**
 * pdf-generator.js — Generador de PDFs unificado para todos los módulos de SSEPI
 * Formato premium basado en ssepi_servicios (6).html
 * Uso: window.pdfGenerator.generate({ departamento, datos, ... })
 */

import { authService } from './auth-service.js';

export class PDFGenerator {
    constructor() {
        this.jsPDF = window.jspdf.jsPDF;
    }

    /**
     * Genera PDF con formato premium SSEPI
     * @param {Object} opts - Opciones: { departamento, datos, tipo }
     * @param {string} opts.departamento - 'Taller Electrónica', 'Motores', 'Automatización', 'Ventas', 'Compras'
     * @param {Object} opts.datos - Datos del documento { folio, cliente, contacto, telefono, email, conceptos/items, total }
     * @param {string} opts.tipo - 'cotizacion' | 'reporte' | 'orden'
     * @param {Object} user - Usuario actual (para hash)
     */
    async generate(opts, user) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });

        // ═══════════════════════════════════════════════════════════════════
        // CONFIGURACIÓN DE PÁGINA
        // ═══════════════════════════════════════════════════════════════════
        const PW = 210, PH = 297;
        const ML = 15, MR = 15;
        const TW = PW - ML - MR;
        const MT = 20, MB = 20;
        const BODY_TOP = MT + 25;
        const BODY_BOTTOM = PH - MB - 15;

        let y = BODY_TOP;
        let pgNum = 1;

        // ═══════════════════════════════════════════════════════════════════
        // PALETA DE COLORES
        // ═══════════════════════════════════════════════════════════════════
        const COLORS = {
            TEAL: [23, 165, 152],
            TEAL_LT: [235, 247, 245],
            GR_HDR: [245, 245, 245],
            GR_ROW: [249, 249, 249],
            GR_SEP: [220, 220, 220],
            GR_TXT: [51, 51, 51],
            GR_LT: [130, 130, 130],
            BLK: [0, 0, 0],
            WHT: [255, 255, 255],
            COVER: [58, 68, 82],
            CARD_BL: [62, 92, 155],
            DEPT: {
                'Taller Electrónica': [46, 125, 50],
                'Taller': [46, 125, 50],
                'Motores': [239, 108, 0],
                'Automatización': [106, 27, 154],
                'Proyectos': [106, 27, 154],
                'Ventas': [255, 152, 0],
                'Compras': [123, 31, 162],
                'default': [0, 104, 71]
            }
        };

        const deptColor = COLORS.DEPT[opts.departamento] || COLORS.DEPT.default;
        const data = opts.datos || {};

        // ═══════════════════════════════════════════════════════════════════
        // FUNCIONES AUXILIARES
        // ═══════════════════════════════════════════════════════════════════
        const tx = (text, x, y, style = 'normal', size = 11, color = COLORS.GR_TXT, optsTx = {}) => {
            doc.setFont('helvetica', style);
            doc.setFontSize(size);
            doc.setTextColor(...color);
            const align = optsTx.align || 'left';
            const maxWidth = optsTx.maxWidth || null;
            if (maxWidth) {
                const lines = doc.splitTextToSize(text, maxWidth);
                doc.text(lines, x, y, { align });
                return lines.length * (size * 0.3527);
            }
            doc.text(text, x, y, { align });
            return size * 0.3527;
        };

        const fl = (x, y, w, h, color, radius = 0) => {
            doc.setFillColor(...color);
            if (radius > 0) {
                doc.roundedRect(x, y, w, h, radius, radius, 'F');
            } else {
                doc.rect(x, y, w, h, 'F');
            }
        };

        const hl = (x, y, w, color, thickness = 0.5) => {
            doc.setDrawColor(...color);
            doc.setLineWidth(thickness);
            doc.line(x, y, x + w, y);
        };

        const fmtMXN = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const newPage = () => {
            drawFooter(pgNum);
            doc.addPage();
            pgNum++;
            y = drawHeader();
        };

        // ═══════════════════════════════════════════════════════════════════
        // HEADER
        // ═══════════════════════════════════════════════════════════════════
        const drawHeader = () => {
            let yy = 15;
            // Logo placeholder
            fl(ML, 10, 20, 20, deptColor, 4);
            tx('S', ML + 7, 24, 'bold', 14, COLORS.WHT);

            tx(opts.departamento || 'SSEPI', 40, 18, 'bold', 16, deptColor);
            tx(opts.tipo === 'orden' ? 'Orden de Compra' : 'Cotización / Reporte', 40, 26, 'normal', 10, COLORS.GR_LT);

            const folio = data.folio || 'N/A';
            const fecha = data.fecha || new Date().toLocaleDateString('es-MX');
            const cliente = data.cliente || 'Cliente General';

            tx(`Folio: ${folio}`, PW - MR - 50, 18, 'normal', 9, COLORS.GR_TXT, { align: 'right' });
            tx(`Fecha: ${fecha}`, PW - MR - 50, 26, 'normal', 9, COLORS.GR_TXT, { align: 'right' });

            hl(ML, 45, TW, COLORS.TEAL, 1.5);
            return 50;
        };

        // ═══════════════════════════════════════════════════════════════════
        // FOOTER
        // ═══════════════════════════════════════════════════════════════════
        const drawFooter = (pageNum) => {
            const footerY = PH - 15;
            hl(ML, footerY - 5, TW, COLORS.GR_SEP, 0.3);
            tx('SSEPI - Soluciones de Servicios Enterprise', ML, footerY, 'normal', 8, COLORS.GR_LT);
            tx(`Página ${pageNum}`, PW - MR - 20, footerY, 'normal', 8, COLORS.GR_LT, { align: 'right' });
        };

        // ═══════════════════════════════════════════════════════════════════
        // DATOS DEL CLIENTE / PROVEEDOR
        // ═══════════════════════════════════════════════════════════════════
        const drawClientInfo = () => {
            const boxH = 25;
            fl(ML, y, TW, boxH, COLORS.GR_HDR, 4);
            tx(opts.tipo === 'orden' ? 'Datos del Proveedor' : 'Datos del Cliente', ML + 5, y + 8, 'bold', 11, COLORS.GR_TXT);

            const lines = [
                `${opts.tipo === 'orden' ? 'Proveedor' : 'Cliente'}: ${data.cliente || data.proveedor || 'N/A'}`,
                `Contacto: ${data.contacto || 'N/A'}`,
                `Teléfono: ${data.telefono || 'N/A'}`,
                `Email: ${data.email || 'N/A'}`
            ];

            let ly = y + 16;
            lines.forEach((line, i) => {
                tx(line, ML + 5, ly + (i * 5), 'normal', 9, COLORS.GR_TXT);
            });

            y += boxH + 8;
        };

        // ═══════════════════════════════════════════════════════════════════
        // TABLA DE CONCEPTOS
        // ═══════════════════════════════════════════════════════════════════
        const drawConceptsTable = () => {
            const conceptos = data.conceptos || data.items || [];
            if (!conceptos || !conceptos.length) return 0;

            const TBH = 8;
            const TRH = 7;
            const TBW = TW - 10;
            const TBX = ML + 5;

            fl(TBX, y, TBW, TBH, COLORS.TEAL, 2);
            tx('Concepto', TBX + 4, y + TBH * 0.65, 'bold', 9, COLORS.WHT);
            tx('Cant.', TBX + TBW - 65, y + TBH * 0.65, 'bold', 9, COLORS.WHT, { align: 'right' });
            tx('Precio Unit.', TBX + TBW - 45, y + TBH * 0.65, 'bold', 9, COLORS.WHT, { align: 'right' });
            tx('Total', TBX + TBW - 3, y + TBH * 0.65, 'bold', 9, COLORS.WHT, { align: 'right' });
            hl(TBX, y + TBH, TBW, COLORS.TEAL, 0.5);
            y += TBH + 2;

            let total = 0;
            conceptos.forEach((concepto, idx) => {
                const rowColor = idx % 2 === 0 ? COLORS.GR_ROW : COLORS.WHT;
                fl(TBX, y, TBW, TRH, rowColor, 0);

                const cant = Number(concepto.cantidad) || 1;
                const precio = Number(concepto.precio) || Number(concepto.precioUnitario) || 0;
                const subtotal = cant * precio;
                total += subtotal;

                tx(concepto.descripcion || concepto.nombre || 'N/A', TBX + 4, y + TRH * 0.65, 'normal', 9, COLORS.GR_TXT, { maxWidth: TBW - 80 });
                tx(String(cant), TBX + TBW - 65, y + TRH * 0.65, 'normal', 9, COLORS.GR_TXT, { align: 'right' });
                tx(fmtMXN(precio), TBX + TBW - 45, y + TRH * 0.65, 'normal', 9, COLORS.GR_TXT, { align: 'right' });
                tx(fmtMXN(subtotal), TBX + TBW - 3, y + TRH * 0.65, 'normal', 9, COLORS.GR_TXT, { align: 'right' });

                hl(TBX, y + TRH, TBW, COLORS.GR_SEP, 0.2);
                y += TRH;

                if (y > BODY_BOTTOM) newPage();
            });

            y += 3;
            fl(TBX, y, TBW, TRH + 2, COLORS.TEAL_LT, 2);
            tx('Total', TBX + 4, y + (TRH + 2) * 0.65, 'bold', 10, COLORS.TEAL);
            tx(fmtMXN(total), TBX + TBW - 3, y + (TRH + 2) * 0.65, 'bold', 10, COLORS.TEAL, { align: 'right' });
            hl(TBX, y + TRH + 2, TBW, COLORS.GR_SEP, 0.5);
            y += TRH + 12;

            return total;
        };

        // ═══════════════════════════════════════════════════════════════════
        // NOTAS IMPORTANTES
        // ═══════════════════════════════════════════════════════════════════
        const drawNotas = () => {
            if (y + 16 > BODY_BOTTOM) newPage();

            tx('Notas Importantes', ML + 4, y, 'bold', 13, COLORS.BLK);
            y += 8;

            const NOTAS = [
                { n: '1.', b: 'únicamente', post: ' los suministros y/o refacciones descritas.' },
                { n: '2.', b: 'sujeta a confirmación', post: ' al momento de la recepción del pago.' },
                { n: '3.', pre: 'Precios expresados en ', b: 'MXN', post: ', salvo indicación contraria.' },
                { n: '4.', pre: 'Los costos de envío ', b: 'no están incluidos', post: ', salvo que se indique explícitamente.' },
                { n: '5.', pre: 'Los tiempos de entrega son ', b: 'estimados', post: ' y comienzan tras confirmación de pago.' },
                { n: '6.', pre: 'Productos cuentan con ', b: 'garantía del fabricante', post: ', conforme a sus políticas.' }
            ];

            const NL = 5.0;
            const NMAX = TW - 12;

            NOTAS.forEach(nota => {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                const full = (nota.pre || '') + (nota.b || '') + (nota.post || '');
                const lines = doc.splitTextToSize(full, NMAX);
                const nH = lines.length * NL + 2;

                if (y + nH > BODY_BOTTOM) newPage();

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.TEAL);
                tx(nota.n, ML + 4, y, 'bold', 9, COLORS.TEAL);

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.GR_TXT);

                let xx = ML + 10;
                if (nota.pre) {
                    tx(nota.pre, xx, y, 'normal', 9, COLORS.GR_TXT);
                    xx += doc.getTextWidth(nota.pre);
                }
                if (nota.b) {
                    tx(nota.b, xx, y, 'bold', 9, COLORS.TEAL);
                    xx += doc.getTextWidth(nota.b);
                }
                if (nota.post) {
                    tx(nota.post, xx, y, 'normal', 9, COLORS.GR_TXT);
                }

                y += lines.length * NL + 1;
            });

            y += 5;
        };

        // ═══════════════════════════════════════════════════════════════════
        // FIRMAS
        // ═══════════════════════════════════════════════════════════════════
        const drawFirmas = () => {
            if (y + 50 > BODY_BOTTOM) newPage();

            const sigY = Math.max(y, BODY_BOTTOM - 60);
            const sigW = (TW - 20) / 2;

            hl(ML + 5, sigY, sigW, COLORS.GR_TXT, 0.5);
            hl(ML + 5 + sigW + 20, sigY, sigW, COLORS.GR_TXT, 0.5);

            tx('Por SSEPI', ML + 5 + sigW / 2, sigY + 8, 'normal', 9, COLORS.GR_TXT, { align: 'center' });
            tx(`Por el ${opts.tipo === 'orden' ? 'Proveedor' : 'Cliente'}`, ML + 5 + sigW + 20 + sigW / 2, sigY + 8, 'normal', 9, COLORS.GR_TXT, { align: 'center' });
        };

        // ═══════════════════════════════════════════════════════════════════
        // HASH DE SEGURIDAD
        // ═══════════════════════════════════════════════════════════════════
        const generateHash = async () => {
            const json = JSON.stringify(data);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(json);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        };

        // ═══════════════════════════════════════════════════════════════════
        // EJECUCIÓN PRINCIPAL
        // ═══════════════════════════════════════════════════════════════════
        y = drawHeader();
        drawClientInfo();
        drawConceptsTable();
        drawNotas();
        drawFirmas();
        drawFooter(pgNum);

        // Hash y usuario
        const hash = await generateHash();
        doc.setFontSize(6);
        doc.setTextColor(200, 200, 200);
        tx(`Generado por: ${user?.email || 'usuario'} | Hash: ${hash}`, ML, PH - 8, 'normal', 6, COLORS.GR_LT);

        // Descargar
        const tipo = opts.tipo || 'cotizacion';
        const fileName = `${tipo.charAt(0).toUpperCase() + tipo.slice(1)}_${opts.departamento?.replace(/\s+/g, '_') || 'SSEPI'}_${data.folio || Date.now()}.pdf`;
        doc.save(fileName);

        return doc;
    }

    // Alias para compatibilidad
    async generateCotizacion(data, user) {
        return this.generate({ departamento: data.departamento || 'Ventas', datos: data, tipo: 'cotizacion' }, user);
    }

    async generateOrdenCompra(data, user) {
        return this.generate({ departamento: 'Compras', datos: data, tipo: 'orden' }, user);
    }

    async generateReport(data, user) {
        return this.generate({ departamento: data.departamento || 'Taller', datos: data, tipo: 'reporte' }, user);
    }
}

export const pdfGenerator = new PDFGenerator();
window.pdfGenerator = pdfGenerator;