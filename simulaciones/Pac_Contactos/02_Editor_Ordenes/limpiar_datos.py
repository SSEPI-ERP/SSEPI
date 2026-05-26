"""
Limpia datos OCR y genera datos_ordenes_editables.json (ligero, rutas a imagenes).
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPORTES = BASE / "reportes"
JSON_OCR = BASE / "datos_reportes_ocr.json"
JSON_DATOS = BASE / "datos_reportes.json"
JSON_CONTACTOS = BASE / "contactos_odoo.json"
JSON_OUT = BASE / "datos_ordenes_editables.json"

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".pdf"}
INVALID_NUMERO = {
    "material", "materia", "equipo", "encontro", "ninguno", "reportada",
    "confirmado", "reparado", "nuevo", "cancelado", "adjuntar", "archivos",
}
UI_PHRASES = [
    "adjuntar archivos", "movimiento de inventario", "movimiento de inentario",
    "stock>stock", "referencia de reparacion", "referencia de reparación",
    "cliente?", "reportada.", "reportada", "datos generales", "orden en reparacion",
    "orden en reparación", "en reparacion de reparacion", "creado (estado)",
    "whatsapp", "actividad", "archivos", "material", "materia", "ninguno",
    "confirmado -", "nuevo de", "en cancelado",
]
GARBAGE_CLIENTE = re.compile(
    r"^[\?\*\#\@\;\:\%\=\+\<\>\[\]\{\}\\\|\^\~\`\"\'\,\.\_\-\s\d]{2,}$"
)

# Tipos de equipo validos (laboratorio industrial)
EQUIPO_TIPO = re.compile(
    r"\b(VARIADOR(?:\s+DE\s+FRECUENCIA)?|SERVODRIVE|SERVO[\s\-]?DRIVE|"
    r"INVERSOR|FUENTE(?:\s+AC/?DC)?|PLC|HMI|CNC|BASCULA|B[ÁA]SCULA|"
    r"ENCODER|CONTROLADOR(?:\s+DE\s+FLAMA)?|CONTROL\s+DE\s+CORTINA|"
    r"TARJETA\s+ELECTR[ÓO]NICA|TARIETA\s+ELECTR[ÓO]NICA|"
    r"COMPRESOR|MOTOR|ROBOT|PANEL|DISPLAY|DRIVE|CONVERSOR|"
    r"TRANSFORMADOR|RELEVADOR|SERVOMOTOR|ACTUADOR|ALINEADOR|ALNEADOR)\b",
    re.I,
)

# Texto que es diagnostico/notas, no nombre de equipo
EQUIPO_ES_DIAGNOSTICO = re.compile(
    r"se\s+(encontr[oó]|revis[oó]|comport[oó]|qued[oó]|les\s+)|porque|por\s+que|"
    r"llega\s+(por|sin|con)|lleg[oó]\s+(por|sin|con)|funcion[oó]|funion[oó]|"
    r"funciona\s+correctamente|encende|no\s+enciende|serevis|"
    r"relevador|fusible|mosfet|pista\s+abierta|corto\s+circuit|componentes?\s+explot|"
    r"dañad|dañad|danad|reparaci[oó]n\s+de\s+servicio|servicio\s+de\s+reparaci|"
    r"orden\s+(en\s+repar|de\s+reparaci|creado)|confimado|estado\)|adjuntar|movimiento\s+de|"
    r"stock>|notamos|sin\s+reparacion|mandar\s+a\s+probar|garantia\.|ya\s+que\s+es|"
    r"necesita\s+cargar|nececita|programa\s+para\s+seguir|ya\s+est[aá]\s+listo|"
    r"ya\s+hab[ií]a\s+sido|folio\s+sp|queda\s+sin|que\s+nos\s+lleg|"
    r"identifcar|identificar\s+su\s+valor|para\s+probar\s+\d|botones\s+y\s+las\s+tarjetas|"
    r"se\s+alarma|sobrecorriente|monmint\s+de\s+inentrio|movimiento\s+de\s+inventario|"
    r"^cliente[\s':]",
    re.I,
)

INVALID_EQUIPO_EXACT = {
    "funciono correctamente", "funcionó correctamente", "se quedo funcionando correctamente",
    "material", "materia", "reportada", "hml", "del", "del disponible",
    "al ser revizado", "ene un mosfet",
}


def norm_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def clean_text(s: str, max_len: int = 2000) -> str:
    if not s or not isinstance(s, str):
        return ""
    s = s.replace("\r", "\n")
    s = re.sub(r"[\u2018\u2019\u201c\u201d]", "'", s)
    s = re.sub(r"\s+", " ", s).strip()
    lo = s.lower()
    for phrase in UI_PHRASES:
        if phrase in lo:
            s = re.sub(re.escape(phrase), " ", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^[\?\*\.\,\;\:\-\s\'\"‘“]+", "", s)
    s = re.sub(r"[\?\*\'\"‘“]+$", "", s).strip()
    if len(s) > max_len:
        s = s[:max_len].rsplit(" ", 1)[0] + "..."
    return s


def clean_cliente(s: str) -> str:
    s = clean_text(s, 120)
    if not s:
        return ""
    s = re.sub(r"^(cliente|customer)\s*[\?:]?\s*", "", s, flags=re.I)
    s = s.strip(" -–—")
    if GARBAGE_CLIENTE.match(s):
        return ""
    letters = sum(1 for c in s if c.isalpha())
    if len(s) > 2 and letters / len(s) < 0.35:
        return ""
    if len(s) <= 2:
        return ""
    return s


def clean_numero_orden(s: str) -> str:
    s = clean_text(s, 40)
    if not s or s.lower() in INVALID_NUMERO:
        return ""
    if len(s) < 3 or s.lower() in INVALID_NUMERO:
        return ""
    return s


def clean_estado(s: str) -> str:
    s = clean_text(s, 50)
    valid = (
        "reparado", "en reparacion", "en reparación", "confirmado", "nuevo",
        "cancelado", "entregado", "en diagnostico", "diagnosticado",
        "pendiente", "esperando repuesto",
    )
    lo = s.lower()
    for v in valid:
        if v in lo:
            return v.title().replace("Diagnostico", "Diagnóstico").replace("Reparacion", "Reparación")
    if len(s) > 60 or any(x in lo for x in ("orden", "archivo", "estado)", "creado")):
        return ""
    return s


def normalize_equipo_name(s: str) -> str:
    s = clean_text(s, 120)
    s = re.sub(r"^(equipo|dispositivo|maquina|art[ií]culo|producto)\s*[\?:]?\s*", "", s, flags=re.I)
    s = re.sub(r"^servicio\s+de\s+reparaci[oó]n\s+de\s+", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" -–—'\"")
    s = re.sub(r"\bTARIETA\b", "TARJETA", s, flags=re.I)
    s = re.sub(r"\bALNEADOR\b", "ALINEADOR", s, flags=re.I)
    return s


def extract_equipo_tipo(s: str) -> str:
    """Si el texto contiene un tipo de equipo conocido, devuelve solo esa parte."""
    m = EQUIPO_TIPO.search(s)
    if not m:
        return ""
    return normalize_equipo_name(m.group(0).upper())


def clean_equipo(equipo: str, componente: str, diagnostico: str, notas: str) -> tuple:
    """
    Devuelve (equipo_limpio, componente_extra, diagnostico_extra, notas_extra).
    Mueve texto mal clasificado al campo correcto.
    """
    eq = normalize_equipo_name(equipo)
    comp_extra, diag_extra, notes_extra = "", "", ""

    if not eq:
        return "", componente, diagnostico, notas

    lo = eq.lower()
    if lo in INVALID_EQUIPO_EXACT:
        return "", componente, diagnostico, _append(eq, notas)

    tipo = extract_equipo_tipo(eq)

    if EQUIPO_ES_DIAGNOSTICO.search(eq):
        if tipo and len(eq) > len(tipo) + 15:
            diag_extra = eq
            eq = tipo
        else:
            diag_extra = eq
            eq = ""
        return eq, componente, _append(diag_extra, diagnostico), _append(notes_extra, notas)

    if len(eq) > 85:
        if tipo:
            resto = re.sub(re.escape(tipo), "", eq, count=1, flags=re.I).strip(" ,.-")
            if resto:
                diag_extra = resto
            return tipo, componente, _append(diag_extra, diagnostico), notas
        notes_extra = eq
        return "", componente, diagnostico, _append(notes_extra, notas)

    if tipo and len(eq) > len(tipo) + 10:
        resto = re.sub(re.escape(tipo), "", eq, count=1, flags=re.I).strip(" ,.-")
        return tipo, componente, _append(resto or eq, diagnostico), notas

    if re.match(r"^[Mm]\s*[—\-]\s*Orden", eq):
        return "", componente, diagnostico, notas

    if len(eq) < 80:
        return eq, componente, diagnostico, notas

    if tipo:
        return tipo, componente, diagnostico, notas

    notes_extra = eq
    return "", componente, diagnostico, _append(notes_extra, notas)


def _append(extra: str, field: str) -> str:
    if not extra:
        return field or ""
    field = (field or "").strip()
    if not field:
        return extra
    if extra in field:
        return field
    return field + "\n" + extra


def clean_componente(s: str) -> str:
    s = clean_text(s, 300)
    if EQUIPO_ES_DIAGNOSTICO.search(s) and len(s) > 40:
        return s
    if EQUIPO_TIPO.search(s) and len(s) < 60:
        return ""
    return s


def clean_person_name(s: str) -> str:
    s = clean_text(s, 80)
    if not s or len(s) < 4:
        return ""
    if sum(c.isalpha() for c in s) / max(len(s), 1) < 0.5:
        return ""
    if re.search(r"\d{3,}", s):
        return ""
    return s


def load_contactos():
    if not JSON_CONTACTOS.exists():
        return []
    with open(JSON_CONTACTOS, encoding="utf-8") as f:
        return json.load(f)


def match_contacto(cliente: str, contactos: list) -> str:
    if not cliente or not contactos:
        return cliente
    ck = norm_key(cliente)
    if len(ck) < 3:
        return cliente
    best, best_score = cliente, 0
    for c in contactos:
        for field in ("empresa", "nombre_completo", "contacto"):
            name = c.get(field) or ""
            nk = norm_key(name)
            if not nk:
                continue
            if ck == nk:
                return name
            if ck in nk or nk in ck:
                score = min(len(ck), len(nk))
                if score > best_score:
                    best_score, best = score, name
    return best if best_score >= 4 else cliente


def classify_file(name: str) -> str:
    n = name.lower()
    if n.endswith(".pdf"):
        return "pdf"
    if re.search(r"screenshot|captura|erp|odoo", n, re.I):
        return "erp"
    return "servicio"


def media_for_folder(folder: Path) -> dict:
    erp, servicio, pdfs = [], [], []
    if not folder.is_dir():
        return {"imagenes_erp": erp, "imagenes_servicio": servicio, "archivos_pdf": pdfs}
    for f in sorted(folder.iterdir()):
        if not f.is_file() or f.suffix.lower() not in ALLOWED_EXT:
            continue
        rel = f"reportes/{folder.name}/{f.name}".replace("\\", "/")
        k = classify_file(f.name)
        if k == "pdf":
            pdfs.append({"nombre": f.name, "url": rel})
        elif k == "erp":
            erp.append(rel)
        else:
            servicio.append(rel)
    return {"imagenes_erp": erp, "imagenes_servicio": servicio, "archivos_pdf": pdfs}


def canon_ref(name: str) -> str:
    n = re.sub(r"\s+", "-", (name or "").strip()).upper()
    m = re.match(r"^SP-E(\d{3,6})$", n, re.I)
    if m:
        return f"SP-E{m.group(1)}"
    m = re.match(r"^SP-(\d{3,6})$", n, re.I)
    if m:
        return f"SP-E{m.group(1)}"
    return n


def load_merged():
    by_ref = {}
    if JSON_OCR.exists():
        with open(JSON_OCR, encoding="utf-8") as f:
            for r in json.load(f):
                by_ref[canon_ref(r.get("referencia_reparacion", ""))] = dict(r)
    if JSON_DATOS.exists():
        with open(JSON_DATOS, encoding="utf-8") as f:
            for r in json.load(f):
                key = canon_ref(r.get("referencia_reparacion", ""))
                if key not in by_ref:
                    by_ref[key] = dict(r)
    return by_ref


def clean_record(row: dict, folder: Path, contactos: list) -> dict:
    ref = folder.name
    media = media_for_folder(folder)
    base = dict(row)
    base["referencia_reparacion"] = ref

    base["estado_actual"] = clean_estado(base.get("estado_actual", ""))
    base["numero_orden"] = clean_numero_orden(base.get("numero_orden", ""))
    base["tipo_orden"] = clean_text(base.get("tipo_orden", ""), 60)
    base["cliente"] = match_contacto(clean_cliente(base.get("cliente", "")), contactos)
    base["cliente_rfc"] = clean_text(base.get("cliente_rfc", ""), 20).upper()
    if base["cliente_rfc"] and not re.match(r"^[A-Z&Ñ]{3,4}\d{6,}", base["cliente_rfc"]):
        rfc_m = re.search(r"\b([A-Z&Ñ]{3,4}\d{6,}[A-Z0-9]{0,3})\b", base.get("cliente", "") + base.get("notas", ""))
        base["cliente_rfc"] = rfc_m.group(1).upper() if rfc_m else ""

    eq_raw = base.get("equipo", "")
    comp_raw = base.get("componente", "")
    diag_raw = base.get("diagnostico", "")
    notas_raw = base.get("notas", "")

    eq, comp_raw, diag_raw, notas_raw = clean_equipo(eq_raw, comp_raw, diag_raw, notas_raw)

    if not eq and comp_raw and EQUIPO_TIPO.search(comp_raw) and len(comp_raw) < 70:
        eq = extract_equipo_tipo(comp_raw) or normalize_equipo_name(comp_raw)
        comp_raw = ""

    base["equipo"] = eq
    base["componente"] = clean_componente(comp_raw)
    base["bajo_garantia"] = clean_text(base.get("bajo_garantia", ""), 20)
    base["fecha_ingreso"] = clean_text(base.get("fecha_ingreso", ""), 40)
    base["fecha"] = clean_text(base.get("fecha", ""), 30)
    base["encargado"] = clean_person_name(base.get("encargado", ""))
    base["vendedor"] = clean_person_name(base.get("vendedor", ""))
    base["materiales"] = clean_text(base.get("materiales", ""), 500)
    base["notas"] = clean_text(notas_raw, 800)
    base["diagnostico"] = clean_text(diag_raw, 800)
    base["solucion"] = clean_text(base.get("solucion", ""), 800)
    base["historial_actividad"] = clean_text(base.get("historial_actividad", ""), 1200)

    parts = [base.get(k) for k in ("notas", "diagnostico", "solucion") if base.get(k)]
    base["descripcion"] = "\n\n".join(parts)

    base.update(media)
    base["_limpiado"] = True
    return base


def main():
    print("Cargando y limpiando datos...")
    by_ref = load_merged()
    contactos = load_contactos()
    out = []
    for folder in sorted(REPORTES.iterdir()):
        if not folder.is_dir():
            continue
        key = canon_ref(folder.name)
        row = by_ref.get(key, {"referencia_reparacion": folder.name})
        out.append(clean_record(row, folder, contactos))

    for key, row in sorted(by_ref.items()):
        if not any(r["referencia_reparacion"] == key for r in out):
            fake = Path(REPORTES / key)
            out.append(clean_record(row, fake, contactos))

    out.sort(key=lambda x: x.get("referencia_reparacion", ""))
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    limpios_c = sum(1 for r in out if r.get("cliente"))
    limpios_e = sum(1 for r in out if r.get("equipo"))
    print(f"Generado: {JSON_OUT}")
    print(f"  Ordenes: {len(out)}")
    print(f"  Con cliente limpio: {limpios_c}")
    print(f"  Con equipo limpio: {limpios_e}")


if __name__ == "__main__":
    main()
