# backend/modules/poliza_documentos.py
"""PDF de póliza y reimpresión de folios (ReportLab)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _money(x: Any) -> str:
    try:
        return f"{float(x or 0):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def generar_pdf_poliza(
    path: str,
    *,
    empresa: str = "",
    cabecera: Dict[str, Any],
    movimientos: List[Dict[str, Any]],
    sello_contador: str = "",
) -> None:
    """Formato tipo oficial: cabecera, tabla de partidas, totales, espacio firma."""
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.65 * inch, bottomMargin=0.65 * inch)
    styles = getSampleStyleSheet()
    story = []
    title = styles["Title"]
    title.fontSize = 14
    story.append(Paragraph("Póliza contable", title))
    story.append(Spacer(1, 0.15 * inch))
    nh = cabecera or {}
    bloque = (
        f"<b>Empresa:</b> {empresa or '—'}<br/>"
        f"<b>Tipo:</b> {nh.get('tipo_poliza', '—')} &nbsp; "
        f"<b>Folio:</b> {nh.get('numero_poliza', '—')} &nbsp; "
        f"<b>Fecha:</b> {nh.get('fecha', '—')} &nbsp; "
        f"<b>Estatus:</b> {nh.get('estatus', '—')}<br/>"
        f"<b>Concepto:</b> {nh.get('concepto', '—')}"
    )
    story.append(Paragraph(bloque, styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))
    data: List[List[str]] = [
        ["Cuenta", "Concepto", "Cargo", "Abono", "Cargo MN", "Abono MN"],
    ]
    tcm = tam = 0.0
    for m in movimientos or []:
        c = float(m.get("cargo") or 0)
        a = float(m.get("abono") or 0)
        cm = float(m.get("cargo_mn") if m.get("cargo_mn") is not None else c * float(m.get("tipo_cambio") or 1.0))
        am = float(m.get("abono_mn") if m.get("abono_mn") is not None else a * float(m.get("tipo_cambio") or 1.0))
        tcm += cm
        tam += am
        data.append(
            [
                str(m.get("num_cuenta") or ""),
                str(m.get("concepto_mov") or m.get("concepto") or "")[:48],
                _money(c) if c else "",
                _money(a) if a else "",
                _money(cm) if cm else "",
                _money(am) if am else "",
            ]
        )
    data.append(["", "Totales MN", "", "", _money(tcm), _money(tam)])
    colw = [0.85 * inch, 2.2 * inch, 0.75 * inch, 0.75 * inch, 0.85 * inch, 0.85 * inch]
    t = Table(data, colWidths=colw, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -2), 0.25, colors.grey),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8f4f8")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 0.35 * inch))
    story.append(Paragraph(f"<b>Sello / datos del contador:</b> {sello_contador or '________________________'}", styles["Normal"]))
    story.append(Spacer(1, 0.45 * inch))
    story.append(Paragraph("<b>Firma de autorización</b><br/><br/>_____________________________", styles["Normal"]))
    doc.build(story)


def generar_pdf_reimpresion_folios(
    path: str,
    *,
    empresa: str = "",
    periodo_etiqueta: str = "",
    filas: Sequence[Dict[str, Any]],
    analisis_por_tipo: Optional[Dict[str, Dict[str, Any]]] = None,
) -> None:
    """Listado correlativo del periodo con avisos de huecos/duplicados por tipo."""
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("Reimpresión de folios de pólizas", styles["Title"]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(
        Paragraph(
            f"<b>Empresa:</b> {empresa or '—'}<br/><b>Periodo:</b> {periodo_etiqueta or '—'}",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    if analisis_por_tipo:
        for tipo, info in sorted(analisis_por_tipo.items()):
            dup = info.get("duplicados") or []
            fal = info.get("faltantes") or []
            txt = f"<b>{tipo}</b>: registros {info.get('conteo', 0)}"
            if dup:
                txt += f" — <font color='red'>Duplicados: {dup}</font>"
            if fal:
                txt += f" — <font color='orange'>Faltantes: {fal}</font>"
            story.append(Paragraph(txt, styles["Normal"]))
        story.append(Spacer(1, 0.12 * inch))
    data: List[List[str]] = [["Fecha", "Tipo", "Folio", "Estatus", "Concepto", "Id"]]
    for r in filas:
        data.append(
            [
                str(r.get("fecha") or ""),
                str(r.get("tipo_poliza") or ""),
                str(r.get("numero_poliza") or ""),
                str(r.get("estatus") or ""),
                str(r.get("concepto") or "")[:42],
                str(r.get("id") or ""),
            ]
        )
    colw = [0.85 * inch, 0.8 * inch, 0.55 * inch, 0.45 * inch, 3.2 * inch, 0.55 * inch]
    t = Table(data, colWidths=colw, repeatRows=1, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.lightgrey),
            ]
        )
    )
    story.append(t)
    doc.build(story)
