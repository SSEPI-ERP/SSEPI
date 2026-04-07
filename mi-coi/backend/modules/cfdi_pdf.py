import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


def _local(tag: str) -> str:
    if not tag:
        return ""
    return tag.split("}", 1)[-1]


def _find_first(root: ET.Element, local_name: str) -> Optional[ET.Element]:
    for el in root.iter():
        if _local(el.tag) == local_name:
            return el
    return None


def _find_all(root: ET.Element, local_name: str) -> List[ET.Element]:
    out: List[ET.Element] = []
    for el in root.iter():
        if _local(el.tag) == local_name:
            out.append(el)
    return out


def _fmt_money(v: str) -> str:
    try:
        n = float(str(v).replace(",", ""))
        return f"{n:,.2f}"
    except Exception:
        return str(v)


def _wrap_text(c, text: str, x: float, y: float, max_width: float, font: str, size: int, leading: int) -> float:
    """Draw wrapped text lines; returns new y after drawing."""
    c.setFont(font, size)
    words = (text or "").split()
    line = ""
    for w in words:
        cand = (line + " " + w).strip()
        if c.stringWidth(cand, font, size) <= max_width:
            line = cand
        else:
            c.drawString(x, y, line)
            y -= leading
            line = w
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def parse_cfdi_timbrado(xml_str: str) -> Dict[str, Any]:
    root = ET.fromstring(xml_str)
    comp = _find_first(root, "Comprobante") or root
    em = _find_first(comp, "Emisor")
    re = _find_first(comp, "Receptor")
    tfd = _find_first(comp, "TimbreFiscalDigital") or _find_first(root, "TimbreFiscalDigital")

    conceptos_node = _find_first(comp, "Conceptos")
    conceptos: List[Dict[str, Any]] = []
    if conceptos_node is not None:
        for cpt in list(conceptos_node):
            if _local(cpt.tag) != "Concepto":
                continue
            tras = _find_first(cpt, "Traslado")
            conceptos.append(
                {
                    "ClaveProdServ": cpt.get("ClaveProdServ", ""),
                    "Cantidad": cpt.get("Cantidad", ""),
                    "ClaveUnidad": cpt.get("ClaveUnidad", ""),
                    "Unidad": cpt.get("Unidad", ""),
                    "Descripcion": cpt.get("Descripcion", ""),
                    "ValorUnitario": cpt.get("ValorUnitario", ""),
                    "Importe": cpt.get("Importe", ""),
                    "TipoFactor": tras.get("TipoFactor", "") if tras is not None else "",
                    "TasaOCuota": tras.get("TasaOCuota", "") if tras is not None else "",
                    "ImporteImpuesto": tras.get("Importe", "") if tras is not None else "",
                    "Impuesto": tras.get("Impuesto", "") if tras is not None else "",
                }
            )

    data = {
        "serie": comp.get("Serie", ""),
        "folio": comp.get("Folio", ""),
        "fecha": comp.get("Fecha", ""),
        "lugar_expedicion": comp.get("LugarExpedicion", ""),
        "tipo_comprobante": comp.get("TipoDeComprobante", ""),
        "moneda": comp.get("Moneda", ""),
        "forma_pago": comp.get("FormaPago", ""),
        "metodo_pago": comp.get("MetodoPago", ""),
        "condiciones_pago": comp.get("CondicionesDePago", ""),
        "exportacion": comp.get("Exportacion", ""),
        "subtotal": comp.get("SubTotal", "0"),
        "total": comp.get("Total", "0"),
        "total_traslados": (_find_first(comp, "Impuestos").get("TotalImpuestosTrasladados", "") if _find_first(comp, "Impuestos") is not None else ""),
        "emisor_rfc": em.get("Rfc", "") if em is not None else "",
        "emisor_nombre": em.get("Nombre", "") if em is not None else "",
        "emisor_regimen": em.get("RegimenFiscal", "") if em is not None else "",
        "receptor_rfc": re.get("Rfc", "") if re is not None else "",
        "receptor_nombre": re.get("Nombre", "") if re is not None else "",
        "receptor_cp": re.get("DomicilioFiscalReceptor", "") if re is not None else "",
        "receptor_regimen": re.get("RegimenFiscalReceptor", "") if re is not None else "",
        "uso_cfdi": re.get("UsoCFDI", "") if re is not None else "",
        "uuid": tfd.get("UUID", "") if tfd is not None else "",
        "fecha_timbrado": tfd.get("FechaTimbrado", "") if tfd is not None else "",
        "rfc_pac": tfd.get("RfcProvCertif", "") if tfd is not None else "",
        "no_cert_sat": tfd.get("NoCertificadoSAT", "") if tfd is not None else "",
        "sello_cfdi": tfd.get("SelloCFD", "") if tfd is not None else "",
        "sello_sat": tfd.get("SelloSAT", "") if tfd is not None else "",
        "cadena_original_tfd": "",
        "conceptos": conceptos,
    }
    # Cadena original del complemento TFD (formato estándar v1.1)
    try:
        if tfd is not None:
            # ||Version|UUID|FechaTimbrado|RfcProvCertif|SelloCFD|NoCertificadoSAT||
            ver = tfd.get("Version", "1.1")
            uuid = tfd.get("UUID", "")
            ft = tfd.get("FechaTimbrado", "")
            rfc_pac = tfd.get("RfcProvCertif", "")
            sello_cfd = tfd.get("SelloCFD", "")
            ncs = tfd.get("NoCertificadoSAT", "")
            data["cadena_original_tfd"] = f"||{ver}|{uuid}|{ft}|{rfc_pac}|{sello_cfd}|{ncs}||"
    except Exception:
        pass
    return data


def build_sat_qr_url(data: Dict[str, Any]) -> str:
    uuid = (data.get("uuid") or "").strip()
    re_rfc = (data.get("emisor_rfc") or "").strip()
    rr_rfc = (data.get("receptor_rfc") or "").strip()
    tt = _fmt_money(data.get("total") or "0").replace(",", "")
    sello = (data.get("sello_cfdi") or "").strip()
    fe = sello[-8:] if len(sello) >= 8 else sello
    # URL oficial SAT (estándar)
    return f"https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id={uuid}&re={re_rfc}&rr={rr_rfc}&tt={tt}&fe={fe}"


def generar_pdf_cfdi_estilo_foto(
    xml_timbrado: str,
    output_pdf_path: str,
    empresa_titulo: str = "SSEPI",
    logo_path: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Genera un PDF con layout similar a la foto (encabezado, tabla conceptos, sellos, QR).
    Requiere reportlab.
    """
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.utils import ImageReader
        from reportlab.graphics.barcode import qr
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF
    except Exception:
        return False, "Para generar PDF instale: pip install reportlab"

    try:
        data = parse_cfdi_timbrado(xml_timbrado)
    except Exception as e:
        return False, f"No se pudo leer el XML timbrado: {e}"

    os.makedirs(os.path.dirname(os.path.abspath(output_pdf_path)), exist_ok=True)

    c = canvas.Canvas(output_pdf_path, pagesize=letter)
    W, H = letter
    m = 24

    # Colores / estilos
    blue = (0.10, 0.34, 0.63)  # similar a la foto
    gray = (0.35, 0.35, 0.35)

    # ===== Encabezado =====
    y = H - m

    # Logo (sin recuadro)
    logo_box_w = 120
    logo_box_h = 72

    if logo_path and os.path.exists(logo_path):
        try:
            img = ImageReader(logo_path)
            iw, ih = img.getSize()
            th = 64
            tw = int((iw / ih) * th) if ih else 120
            # Ajustar para usar espacio sin pasarse del ancho reservado
            if tw > logo_box_w:
                tw = logo_box_w
                th = int((ih / iw) * tw) if iw else th
            px = m
            py = (y - logo_box_h) + (logo_box_h - th) / 2
            c.drawImage(img, px, py, width=tw, height=th, mask="auto", preserveAspectRatio=True, anchor="c")
        except Exception:
            pass
    else:
        c.setFont("Helvetica-Bold", 9)
        c.setFillColorRGB(*blue)
        c.drawCentredString(m + logo_box_w / 2, y - 40, "SSEPI")
        c.setFillColorRGB(0, 0, 0)

    # Caja folio fiscal (derecha) — definir primero para reservar espacio y evitar superposición
    box_w = 210
    box_h = 78
    bx = W - m - box_w
    by = y - box_h

    # Título empresa: a la izquierda del recuadro, sin invadir la caja
    c.setFont("Helvetica-Bold", 12)
    c.setFillColorRGB(*blue)
    max_title_width = bx - m - 12
    titulo_bruto = (empresa_titulo or "")[:80]
    # Ajustar a una o dos líneas para que no se superponga con la tabla
    words = titulo_bruto.split()
    lines_titulo = []
    current = ""
    for w in words:
        test = (current + " " + w).strip() if current else w
        if c.stringWidth(test, "Helvetica-Bold", 12) <= max_title_width:
            current = test
        else:
            if current:
                lines_titulo.append(current)
            current = w
    if current:
        lines_titulo.append(current)
    titulo_y = y - 18
    for i, line in enumerate(lines_titulo[:2]):  # máximo 2 líneas
        c.drawString(m, titulo_y - i * 14, line[:60] if i > 0 else line)
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.8)
    c.rect(bx, by, box_w, box_h, stroke=1, fill=0)

    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*gray)
    c.drawString(bx + 8, y - 16, "Folio fiscal:")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Courier-Bold", 7)
    c.drawString(bx + 8, y - 28, (data.get("uuid") or "")[:80])

    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*gray)
    c.drawString(bx + 8, y - 42, "No. de serie del CSD:")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Courier-Bold", 7)
    c.drawString(bx + 110, y - 42, (data.get("serie") or "")[:10])

    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*gray)
    c.drawString(bx + 8, y - 54, "Código postal, fecha y hora de emisión:")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Courier", 7)
    fe = (data.get("fecha") or "").replace("T", " ")
    c.drawString(bx + 8, y - 66, f"{data.get('lugar_expedicion','')}  {fe[:19]}")

    # Línea bajo encabezado
    y = y - logo_box_h - 10
    c.setStrokeColorRGB(*blue)
    c.setLineWidth(1.2)
    c.line(m, y, W - m, y)
    y -= 10

    # ===== Bloques emisor / receptor =====
    col_gap = 10
    col_w = (W - 2 * m - col_gap) / 2
    box_h2 = 92

    def draw_box(title: str, x: float, ytop: float):
        # header
        c.setFillColorRGB(*blue)
        c.rect(x, ytop - 14, col_w, 14, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 6, ytop - 11, title.upper())
        c.setFillColorRGB(0, 0, 0)
        # body
        c.setStrokeColorRGB(0.78, 0.82, 0.85)
        c.rect(x, ytop - box_h2, col_w, box_h2 - 14, stroke=1, fill=0)

    left_x = m
    right_x = m + col_w + col_gap
    top_y = y

    draw_box("RFC emisor", left_x, top_y)
    draw_box("RFC receptor", right_x, top_y)

    def kv(x: float, yline: float, k: str, v: str):
        c.setFont("Helvetica-Bold", 7)
        c.setFillColorRGB(*gray)
        c.drawString(x + 6, yline, k)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica", 7)
        c.drawString(x + 110, yline, (v or "")[:65])

    yk = top_y - 28
    kv(left_x, yk, "RFC emisor:", data.get("emisor_rfc", ""))
    kv(right_x, yk, "RFC receptor:", data.get("receptor_rfc", ""))
    yk -= 12
    kv(left_x, yk, "Nombre emisor:", data.get("emisor_nombre", ""))
    kv(right_x, yk, "Nombre receptor:", data.get("receptor_nombre", ""))
    yk -= 12
    kv(left_x, yk, "Folio:", f"{data.get('serie','')}{data.get('folio','')}")
    kv(right_x, yk, "Código postal:", data.get("receptor_cp", ""))
    yk -= 12
    kv(left_x, yk, "Régimen fiscal:", data.get("emisor_regimen", ""))
    kv(right_x, yk, "Régimen fiscal:", data.get("receptor_regimen", ""))
    yk -= 12
    kv(left_x, yk, "Exportación:", data.get("exportacion", ""))
    kv(right_x, yk, "Uso CFDI:", data.get("uso_cfdi", ""))

    y = top_y - box_h2 - 12

    # ===== Tabla conceptos =====
    c.setStrokeColorRGB(0.82, 0.86, 0.90)
    c.setLineWidth(0.8)
    table_x = m
    table_w = W - 2 * m
    header_h = 16

    # columnas parecidas a la foto
    cols = [
        ("Clave del producto\ny servicio", 110),
        ("Cantidad", 44),
        ("Cve\nunid", 44),
        ("Unidad", 54),
        ("Descripción", 210),
        ("Valor\nunitario", 60),
        ("Importe", 60),
        ("Tipo", 28),
        ("Factor", 46),
        ("Tasa o\nCuota", 50),
        ("Importe\nimpuesto", 60),
    ]
    # ajustar a ancho total
    fixed = sum(w for _, w in cols)
    if fixed != table_w:
        # distribuir la diferencia en la columna descripción
        diff = int(table_w - fixed)
        cols = [(t, (w + diff) if "Descripción" in t else w) for (t, w) in cols]

    # header azul
    c.setFillColorRGB(*blue)
    c.rect(table_x, y - header_h, table_w, header_h, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 6)
    cx = table_x
    for title, wcol in cols:
        c.drawCentredString(cx + wcol / 2, y - 12, title.replace("\n", " "))
        c.setStrokeColorRGB(1, 1, 1)
        c.setLineWidth(0.5)
        c.line(cx, y - header_h, cx, y)
        cx += wcol
    c.setStrokeColorRGB(1, 1, 1)
    c.line(table_x + table_w, y - header_h, table_x + table_w, y)
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0.82, 0.86, 0.90)

    y -= header_h

    row_h = 14
    c.setFont("Helvetica", 6.7)
    conceptos = data.get("conceptos") or []
    if not conceptos:
        conceptos = [{"ClaveProdServ": "", "Cantidad": "", "ClaveUnidad": "", "Unidad": "", "Descripcion": "", "ValorUnitario": "", "Importe": ""}]

    for i, r in enumerate(conceptos[:14]):
        # zebra
        if i % 2 == 1:
            c.setFillColorRGB(0.96, 0.97, 0.99)
            c.rect(table_x, y - row_h, table_w, row_h, stroke=0, fill=1)
            c.setFillColorRGB(0, 0, 0)
        cx = table_x
        vals = [
            r.get("ClaveProdServ", ""),
            r.get("Cantidad", ""),
            r.get("ClaveUnidad", ""),
            r.get("Unidad", ""),
            (r.get("Descripcion", "") or "")[:60],
            _fmt_money(r.get("ValorUnitario", "")),
            _fmt_money(r.get("Importe", "")),
            "T",
            "Traslado",
            (r.get("TasaOCuota", "") or ""),
            _fmt_money(r.get("ImporteImpuesto", "")),
        ]
        for (title, wcol), v in zip(cols, vals):
            if "Descripción" in title:
                c.drawString(cx + 2, y - 10, str(v))
            else:
                c.drawCentredString(cx + wcol / 2, y - 10, str(v))
            c.setStrokeColorRGB(0.87, 0.90, 0.94)
            c.setLineWidth(0.4)
            c.line(cx, y - row_h, cx, y)
            cx += wcol
        c.line(table_x + table_w, y - row_h, table_x + table_w, y)
        c.setStrokeColorRGB(0.87, 0.90, 0.94)
        c.line(table_x, y - row_h, table_x + table_w, y - row_h)
        y -= row_h

    y -= 14

    # ===== Totales (sin empalmes) =====
    # Se dibuja DEBAJO de la tabla, alineado a la derecha.
    tot_w = 210
    tot_h = 74
    tot_x = W - m - tot_w
    tot_y = y - tot_h

    c.setStrokeColorRGB(0.78, 0.82, 0.85)
    c.setLineWidth(0.8)
    c.rect(tot_x, tot_y, tot_w, tot_h, stroke=1, fill=0)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(*gray)
    c.drawString(tot_x + 10, tot_y + tot_h - 20, "Subtotal")
    c.drawString(tot_x + 10, tot_y + tot_h - 36, "Impuestos trasladados")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Courier-Bold", 8)
    c.drawRightString(tot_x + tot_w - 10, tot_y + tot_h - 20, _fmt_money(data.get("subtotal", "0")))
    c.drawRightString(tot_x + tot_w - 10, tot_y + tot_h - 36, _fmt_money(data.get("total_traslados", "0")))

    # Total (franja azul)
    c.setFillColorRGB(*blue)
    c.rect(tot_x, tot_y + 10, tot_w, 18, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(tot_x + 10, tot_y + 15, "Total")
    c.setFont("Courier-Bold", 9)
    c.drawRightString(tot_x + tot_w - 10, tot_y + 15, _fmt_money(data.get("total", "0")))
    c.setFillColorRGB(0, 0, 0)

    # continuar debajo del bloque de totales (para no empalmar sellos)
    y = tot_y - 10

    # ===== Sellos + Cadena original + QR =====
    def _draw_double_column_box(title: str, content: str, y_top: float, height: float) -> float:
        c.setStrokeColorRGB(0.78, 0.82, 0.85)
        c.rect(m, y_top - height, W - 2 * m, height, stroke=1, fill=0)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColorRGB(*gray)
        c.drawString(m + 8, y_top - 14, title)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Courier", 6)
        inner_x = m + 8
        inner_w = W - 2 * m - 16
        col_gap = 10
        col_w = (inner_w - col_gap) / 2
        y_txt = y_top - 26
        # Partir en líneas por ancho (palabras muy largas: forzar corte)
        tokens = re.findall(r"\S+", content or "")
        lines: List[str] = []
        line = ""
        for t in tokens:
            cand = (line + " " + t).strip()
            if c.stringWidth(cand, "Courier", 6) <= col_w:
                line = cand
            else:
                if line:
                    lines.append(line)
                # si el token es más largo que col_w, cortarlo
                if c.stringWidth(t, "Courier", 6) > col_w:
                    chunk = ""
                    for ch in t:
                        cc = chunk + ch
                        if c.stringWidth(cc, "Courier", 6) <= col_w:
                            chunk = cc
                        else:
                            lines.append(chunk)
                            chunk = ch
                    if chunk:
                        line = chunk
                    else:
                        line = ""
                else:
                    line = t
        if line:
            lines.append(line)

        # Dibujar en dos columnas
        max_lines_per_col = int((height - 30) / 8)
        left = lines[:max_lines_per_col]
        right = lines[max_lines_per_col : max_lines_per_col * 2]
        yy = y_txt
        for ln in left:
            c.drawString(inner_x, yy, ln)
            yy -= 8
        yy = y_txt
        for ln in right:
            c.drawString(inner_x + col_w + col_gap, yy, ln)
            yy -= 8
        return y_top - height - 8

    y_sellos = y - 10
    y_sellos = _draw_double_column_box("Sello digital del CFDI:", data.get("sello_cfdi") or "", y_sellos, 84)
    y_sellos = _draw_double_column_box("Sello digital del SAT:", data.get("sello_sat") or "", y_sellos, 84)
    y_sellos = _draw_double_column_box(
        "Cadena original del complemento de certificación digital del SAT:",
        data.get("cadena_original_tfd") or "",
        y_sellos,
        72,
    )

    # Footer con QR
    y4 = y_sellos - 6
    qr_size = 92
    qr_x = W - m - qr_size
    qr_y = y4 - qr_size + 10
    url = build_sat_qr_url(data)

    try:
        widget = qr.QrCodeWidget(url)
        bounds = widget.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        d = Drawing(qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0])
        d.add(widget)
        renderPDF.draw(d, c, qr_x, qr_y)
    except Exception:
        # si falla QR, dibujar caja
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.rect(qr_x, qr_y, qr_size, qr_size, stroke=1, fill=0)
        c.setFont("Helvetica", 7)
        c.drawCentredString(qr_x + qr_size / 2, qr_y + qr_size / 2, "QR")

    # Leyenda + timbre info
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*gray)
    c.drawString(m, qr_y + qr_size - 8, "Este documento es una representación impresa de un CFDI.")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 7)
    c.drawString(m, qr_y + qr_size - 22, f"RFC PAC: {data.get('rfc_pac','')}   No. cert SAT: {data.get('no_cert_sat','')}")
    c.drawString(m, qr_y + qr_size - 36, f"Fecha timbrado: {(data.get('fecha_timbrado','') or '').replace('T',' ')[:19]}")

    # Página
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*gray)
    c.drawRightString(W - m, m - 2, "Página 1 de 1")
    c.setFillColorRGB(0, 0, 0)

    c.showPage()
    c.save()
    return True, output_pdf_path

