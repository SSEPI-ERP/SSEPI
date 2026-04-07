// ================================================
// ARCHIVO: pdf-generator.js
// DESCRIPCIÓN: Generador de PDF estilo "Ironclad Folder Edition"
// SEGURIDAD: Incluye marca de agua con usuario y hash de integridad
// ================================================

import { authService } from './auth-service.js';

export class PDFGenerator {
    constructor() {
        this.jsPDF = window.jspdf.jsPDF;
    }

    async generateCotizacion(data, user) {
        const doc = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const verde = '#006847';
        const dorado = '#c49a6c';
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado verde
        doc.setFillColor(verde);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('COTIZACIÓN', pageWidth / 2, 13, { align: 'center' });

        // Logo y datos de la empresa
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('SSEPI Automatización Industrial', 20, 30);
        doc.text('Blvd. Zodiaco 336, León, GTO', 20, 35);
        doc.text('RFC: SSE240317XXX', 20, 40);
        doc.text('Tel: +52 477-737-3118', 20, 45);

        // Datos de la cotización
        doc.setFont('helvetica', 'bold');
        doc.text(`Folio: ${data.folio}`, pageWidth - 20, 30, { align: 'right' });
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 20, 35, { align: 'right' });
        doc.text(`Cliente: ${data.cliente}`, pageWidth - 20, 40, { align: 'right' });
        doc.text(`RFC: ${data.rfc || 'XAXX010101000'}`, pageWidth - 20, 45, { align: 'right' });

        // Línea separadora
        doc.setDrawColor(verde);
        doc.setLineWidth(0.5);
        doc.line(20, 50, pageWidth - 20, 50);

        // Tabla de conceptos
        const tableColumn = ['Cant.', 'Descripción', 'Precio Unit.', 'Importe'];
        const tableRows = data.items.map(item => [
            item.cantidad,
            item.descripcion,
            `$${item.precioUnitario.toFixed(2)}`,
            `$${item.importe.toFixed(2)}`
        ]);

        doc.autoTable({
            startY: 55,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [0, 104, 71], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 20 },
                1: { halign: 'left', cellWidth: 90 },
                2: { halign: 'right', cellWidth: 35 },
                3: { halign: 'right', cellWidth: 35 }
            },
            margin: { left: 20, right: 20 }
        });

        // Totales
        const finalY = doc.lastAutoTable.finalY + 8;
        doc.setFont('helvetica', 'bold');
        doc.text('Subtotal:', pageWidth - 80, finalY);
        doc.text(`$${data.subtotal.toFixed(2)}`, pageWidth - 20, finalY, { align: 'right' });
        doc.text('IVA 16%:', pageWidth - 80, finalY + 6);
        doc.text(`$${data.iva.toFixed(2)}`, pageWidth - 20, finalY + 6, { align: 'right' });
        doc.text('Total:', pageWidth - 80, finalY + 12);
        doc.setFontSize(14);
        doc.text(`$${data.total.toFixed(2)}`, pageWidth - 20, finalY + 12, { align: 'right' });

        // Notas legales
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        const notas = [
            '1. Esta cotización tiene una validez de 30 días.',
            '2. Los precios incluyen IVA, a menos que se indique lo contrario.',
            '3. El tiempo de entrega es aproximado y sujeto a disponibilidad.',
            '4. Cualquier cambio en las especificaciones podría afectar el precio.',
            '5. El pago deberá realizarse antes de la entrega, salvo acuerdo previo.',
            '6. La reparación incluye garantía de 90 días por defectos de mano de obra.',
            '7. No se aceptan devoluciones una vez iniciado el trabajo.',
            '8. Los equipos que no sean reclamados en 60 días se consideran abandonados.',
            '9. El cliente es responsable de la veracidad de los datos proporcionados.',
            '10. Para facturación, se requiere RFC y uso de CFDI.',
            '11. Esta cotización no constituye una factura.',
            '12. Los precios están sujetos a cambio sin previo aviso.',
            '13. Cualquier disputa será resuelta en los tribunales de León, Gto.'
        ];
        let yNotas = pageHeight - 60;
        doc.text('NOTAS LEGALES:', 20, yNotas);
        yNotas += 5;
        notas.forEach((nota, i) => {
            doc.text(`${i+1}. ${nota}`, 20, yNotas + (i * 4));
        });

        // Marca de agua con usuario y hash
        doc.setFontSize(6);
        doc.setTextColor(200, 200, 200);
        const hash = await this.generateHash(data);
        doc.text(`Generado por: ${user?.email || 'usuario'} | Hash: ${hash}`, 20, pageHeight - 10);

        // Guardar
        doc.save(`Cotizacion_${data.folio}.pdf`);
    }

    /**
     * Orden de compra — mismo estilo folder (folio SP-OC...).
     * @param {Object} data - { folio, proveedor, fecha_requerida?, items: [{ desc, sku?, qty, price }], total }
     * @param {Object} user - usuario actual
     */
    async generateOrdenCompra(data, user) {
        const doc = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const verde = '#006847';
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFillColor(verde);
        doc.rect(0, 0, pageWidth, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('ORDEN DE COMPRA', pageWidth / 2, 13, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('SSEPI Automatización Industrial', 20, 30);
        doc.text('Blvd. Zodiaco 336, León, GTO', 20, 35);
        doc.text('RFC: SSE240317XXX', 20, 40);
        doc.text('Tel: +52 477-737-3118', 20, 45);

        doc.setFont('helvetica', 'bold');
        doc.text('Folio: ' + (data.folio || ''), pageWidth - 20, 30, { align: 'right' });
        doc.text('Fecha: ' + (data.fecha ? new Date(data.fecha).toLocaleDateString() : new Date().toLocaleDateString()), pageWidth - 20, 35, { align: 'right' });
        doc.text('Proveedor: ' + (data.proveedor || 'N/A'), pageWidth - 20, 40, { align: 'right' });
        if (data.fecha_requerida) doc.text('Fecha requerida: ' + new Date(data.fecha_requerida).toLocaleDateString(), pageWidth - 20, 45, { align: 'right' });

        doc.setDrawColor(verde);
        doc.setLineWidth(0.5);
        doc.line(20, 50, pageWidth - 20, 50);

        const tableColumn = ['Cant.', 'Descripción', 'P. Unit.', 'Importe'];
        const tableRows = (data.items || []).map(item => [
            item.qty || item.cantidad || 0,
            item.desc || item.descripcion || '',
            '$' + (item.price != null ? Number(item.price).toFixed(2) : (item.precio_unitario != null ? Number(item.precio_unitario).toFixed(2) : '0.00')),
            '$' + ((item.qty || item.cantidad || 0) * (item.price != null ? item.price : item.precio_unitario || 0)).toFixed(2)
        ]);

        doc.autoTable({
            startY: 55,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [0, 104, 71], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 20 },
                1: { halign: 'left', cellWidth: 90 },
                2: { halign: 'right', cellWidth: 35 },
                3: { halign: 'right', cellWidth: 35 }
            },
            margin: { left: 20, right: 20 }
        });

        const finalY = doc.lastAutoTable.finalY + 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Total: $' + (data.total != null ? Number(data.total).toFixed(2) : '0.00'), pageWidth - 20, finalY, { align: 'right' });

        doc.setFontSize(6);
        doc.setTextColor(200, 200, 200);
        const hash = await this.generateHash(data);
        doc.text('Generado por: ' + (user?.email || 'usuario') + ' | Hash: ' + hash, 20, pageHeight - 10);

        doc.save('Orden_compra_' + (data.folio || '') + '.pdf');
    }

    async generateHash(data) {
        const json = JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(json);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    }
}

export const pdfGenerator = new PDFGenerator();
window.pdfGenerator = pdfGenerator;