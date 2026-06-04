# -*- coding: utf-8 -*-
"""Genera datos_comparador.json: Excel + 139 capturas Odoo + matching."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent.parent  # E:/SSEPI

from odoo_sin_tabulador_reglas import aplicar_reglas_odoo_sin
EXCEL_CANDIDATES = [
    ROOT / "TABULADOR DE COTIZACIÓN actualizado.xlsx",
    REPO / "simulaciones" / "SSEPI_Paquete_ERP" / "TABULADOR DE COTIZACIÓN actualizado.xlsx",
    REPO / "docs" / "TABULADOR DE COTIZACIÓN (1).xlsx",
    Path(r"c:\Users\norbe\Downloads\TABULADOR DE COTIZACIÓN actualizado.xlsx"),
    ROOT / "TABULADOR DE COTIZACIÓN.xlsx",
]


def resolve_excel_file():
    for p in EXCEL_CANDIDATES:
        if p.exists():
            return p
    return EXCEL_CANDIDATES[-1]


EXCEL_FILE = resolve_excel_file()
ODOO_CONTACTS_CANDIDATES = [
    ROOT / "contactos_odoo.xlsx",
    REPO / "scripts" / "imports" / "fuente" / "Contacto (res.partner).xlsx",
    REPO / "excel" / "Contacto (res.partner).xlsx",
    Path(r"c:\Users\norbe\Downloads\Contacto (res.partner) (1).xlsx"),
]
IMG_DIR = ROOT.parent / "CapturasOdoo"
OCR_FILE = ROOT / "ocr_results.json"
RASTRO_CANDIDATES = [
    ROOT / "rastro_capturas.json",
    ROOT / "rastro_capturas_ejemplo.json",
]
OUT_FILE = ROOT / "datos_comparador.json"


def resolve_odoo_contacts_file():
    for p in ODOO_CONTACTS_CANDIDATES:
        if p.exists():
            return p
    return ODOO_CONTACTS_CANDIDATES[0]


ODOO_CONTACTS_FILE = resolve_odoo_contacts_file()


def resolve_rastro_file():
    for p in RASTRO_CANDIDATES:
        if p.exists():
            return p
    return RASTRO_CANDIDATES[-1]


RASTRO_FILE = resolve_rastro_file()


def load_rastro_capturas():
    if not RASTRO_FILE.exists():
        return {}
    data = json.loads(RASTRO_FILE.read_text(encoding="utf-8"))
    return data.get("capturas", {})


def datos_imagen_desde_rastro(rastro_entry):
    """Convierte entrada del rastro a formato datosImagen."""
    if not rastro_entry:
        return None
    nombre = rastro_entry.get("nombreEnImagen", "")
    campos = {
        "nombreEnImagen": nombre,
        "nombreLineaCompleta": rastro_entry.get("nombreLineaCompleta") or nombre,
        "ubicacionImagen": rastro_entry.get("ubicacionImagen", ""),
        "emailImagen": rastro_entry.get("emailImagen", ""),
        "telImagen": rastro_entry.get("telImagen", ""),
        "rfcImagen": rastro_entry.get("rfcImagen", ""),
        "direccionImagen": rastro_entry.get("direccionImagen", ""),
        "puestoImagen": rastro_entry.get("puestoImagen", ""),
        "empresaImagen": rastro_entry.get("empresaImagen", ""),
        "personaImagen": rastro_entry.get("contactoPersona", ""),
        "sitioWebImagen": rastro_entry.get("sitioWebImagen", ""),
        "dominioImagen": "",
        "tipoImagen": rastro_entry.get("tipoImagen", ""),
        "verificadoCampos": {k: True for k in ("nombreEnImagen", "emailImagen", "telImagen")},
        "completitudImagen": rastro_entry.get("completitudImagen", 95),
        "nombreVerificado": rastro_entry.get("nombreVerificado", True),
        "textoOcrResumen": f"[RASTRO:{rastro_entry.get('fuente','')}]",
    }
    if campos.get("emailImagen") and "@" in campos["emailImagen"]:
        campos["dominioImagen"] = campos["emailImagen"].split("@", 1)[1]
    return campos

UI_SKIP = (
    "contactos", "ventas", "facturado", "reuniones", "compras", "documentos",
    "nuevo", "enviar mensaje", "registrar", "whatsapp", "actividad", "persona o empresa",
    "correo electronico", "puesto de trabajo", "sitio web", "idioma", "ninguno",
    "odoo.com", "kanban", "lista", "persona", "empresa",
)

LISTA_ODOO = "Catálogo Odoo (res.partner)"
LISTA_TABULADOR = "TABULADOR DE COTIZACIÓN.xlsx"

# Unificar nombres duplicados en Excel (nombre canónico del tabulador)
EXCEL_ALIASES = {
    "ANGUIPALST": "ANGUIPLAST",
    "ECSA": "ARCOSA",
    "ELECTROFORJADOS": "SERVIACERO ELECTROFORJADOS",
    "EMMSA LEÓN.": "EMMSA",
    "EMMSA LEON.": "EMMSA",
    "HALL PLANTA 1": "HALLIBURTON",
    "HIRUTA PLANTA 1": "HIRUTA",
    "DI CENTRAL": "DI-CENTRAL",
    "CARTO MICRO": "CARTOTEC",
}

# Si la fila del listado (50) no tiene km en Hoja1, copiar gastos de otra fila canónica
GASTOS_HEREDAR = {
    "EPC1": "EPC 1",
}

# RFC conocidos (tabulador + Odoo) para vincular por RFC
RFC_BY_COMPANY = {
    "ANGUIPLAST": "ANG101215PG0",
    "ARCOSA": "ECS440707GG7",
    "BADER TABACHINES": "BAD880303CC3",
    "BODYCOTE": "BOD770404DD4",
    "BOLSAS DE LOS ALTOS": "BAL050101AA1",
    "COFICAB": "COF660505EE5",
    "CONDUMEX": "CON550606FF6",
    "CURTIDOS BENGALA": "CUR880808F66",
    "ECOBOLSAS": "ECO990202BB2",
    "ELECTROFORJADOS": "SEE330404B22",
    "EMMSA": "EMM330808HH8",
    "EPC 1": "EPC220909II9",
    "EPC 2": "EPC111010JJ0",
    "FRAENKISCHE": "FRA001111KK1",
    "GEDNEY": "GED991212LL2",
    "GRUPO ACERERO": "GRU880101MM3",
    "HALLIBURTON": "HAL770202NN4",
    "HIRUTA": "HIR660303OO5",
    "IK PLASTIC": "IKP550404PP6",
    "IMPRENTA JM": "IMP440505QQ7",
    "JARDÍN LA ALEMANA": "JAR330606RR8",
    "MAFLOW": "MAF220707SS9",
    "MARQUARDT": "MAR110808TT0",
    "MICROONDA": "MIC000909UU1",
    "MINO INDUSTRY": "MIN000707E55",
    "MR LUCKY": "MRL991010VV2",
    "NHK": "NHK881111WW3",
    "NISHIKAWA": "NIS771212XX4",
    "PIELES AZTECA": "PIE660101YY5",
    "RONGTAI": "RON550202ZZ6",
    "SAFE DEMO": "SAF440303A11",
    "SERVIACERO ELECTROFORJADOS": "SEE330404B22",
    "SUACERO": "SUA220505C33",
    "TQ-1": "TQ1110606D44",
}


def canonical_excel_name(raw):
    """Nombre unificado para tabulador (Hoja1 + hojas de servicio)."""
    if not raw:
        return ""
    u = str(raw).strip().upper()
    return EXCEL_ALIASES.get(u, str(raw).strip())


def _blank_excel_client(name, name_excel=None):
    return {
        "name": name,
        "nameExcel": name_excel or name,
        "sheets": [],
        "modulos": {},
        "viajeDani": {},
        "c1": 0.0,
        "c2": 0.0,
        "c3": 0.0,
        "c4": 0.0,
        "c5": 0.0,
        "c6": 0.0,
        "rfc": "",
        "address": "",
        "contact": "",
        "enHoja1": False,
        "gastosHeredadosDe": "",
        "excelFuente": "",
    }


# Hoja1 = ejemplo viaje / HR Dani (referencia), no precio por módulo
MODULO_SHEET_KEYS = {
    "LABORATORIO": "laboratorio",
    "MOTORES": "motores",
    "SUMINISTROS": "suministros",
}


def _sheet_es_modulo(sheet_name):
    sn = norm(sheet_name)
    if "LABORATOR" in sn:
        return "laboratorio"
    if "MOTOR" in sn:
        return "motores"
    if "SUMINISTR" in sn:
        return "suministros"
    if "AUTOMAT" in sn:
        return "automatizacion"
    return None


def _row_val(row, *names):
    """Lee celda por nombre de columna (evita confundir TOTAL con TOTAL.1)."""
    import pandas as pd

    if not hasattr(row, "index"):
        return None
    cols = list(row.index)
    for want in names:
        w = norm(want)
        for c in cols:
            if norm(str(c)) == w:
                v = row[c]
                if pd.isna(v):
                    continue
                f = _excel_float(v)
                if f is not None:
                    return f
        for c in cols:
            cn = norm(str(c))
            if w in cn and "TOTAL" not in w:
                v = row[c]
                if pd.isna(v):
                    continue
                f = _excel_float(v)
                if f is not None:
                    return f
    return None


def _parse_modulo_estandar(row, modulo_key):
    """Replica columnas del tabulador por módulo (LAB / MOT / SUM)."""
    gasolina = _row_val(row, "GASOLINA") or 0.0
    ventas = _row_val(row, "VENTAS") or 0.0
    viaje = _row_val(row, "TOTAL") or 0.0
    camioneta = _row_val(row, "CAMIONETA X HORA") or 0.0
    out = {
        "gasolina": gasolina,
        "ventas": ventas,
        "viajeGasolinaVentas": viaje,
        "camioneta": camioneta,
        "precioFinal": 0.0,
    }
    if modulo_key == "laboratorio":
        out["tiempoInvertido"] = _row_val(row, "TIEMP. INVERTIDO") or 0.0
        out["gastosFijosHora"] = _row_val(row, "GASTOS FIJOS X HORA TOTAL") or 0.0
        out["refacciones"] = _row_val(row, "REFACCIONES") or 0.0
        out["gastosGenerales"] = _row_val(row, "GASTOS GENERALES") or 0.0
        out["utilidad"] = _row_val(row, "UTLIDAD 45%") or 0.0
        out["precioFinal"] = _row_val(row, "CREDITO 3%") or 0.0
        out["costoSinReparacion"] = out["gastosGenerales"]
    else:
        if modulo_key == "motores":
            out["becerra"] = _row_val(row, "BECERRA") or 0.0
        if modulo_key == "suministros":
            out["proveedor"] = _row_val(row, "PROVEEDOR") or 0.0
        out["gastosSinUtilidad"] = _row_val(row, "GASTOS S/U") or 0.0
        out["utilidad"] = _row_val(row, "UTLIDAD 45%") or 0.0
        out["precioFinal"] = _row_val(row, "CREDITO 3%") or 0.0
        out["costoSinReparacion"] = out["gastosSinUtilidad"]
    if not out["precioFinal"] and out.get("utilidad"):
        out["precioFinal"] = out["utilidad"]
    return out


def _parse_modulo_automatizacion(row):
    """Automatización: por servicio; precio al cliente = TOTAL VENTA."""
    import pandas as pd

    servicios = {}
    svc_names = [
        "PROGRAMACIÓN PLC HMI",
        "PROGRAMACION PLC HMI",
        "SERVOMOTOR",
        "DISEÑO TABLERO",
        "DISENO TABLERO",
        "DISEÑO MECANICO",
        "INSTALACIÓN",
        "INSTALACION",
        "FABRICACIÓN",
        "FABRICACION",
        "SOPORTE",
        "ARQUITECTURA",
    ]
    if hasattr(row, "index"):
        for c in row.index:
            cn = norm(str(c))
            if cn in ("EMPRESA", "TOTAL", "GASOLINA", "MATERIALES") or "CREDITO" in cn:
                continue
            if "TOTAL" in cn and "VENTA" in cn:
                continue
            if "VIATICO" in cn or "CAMIONETA" in cn or "INVEST" in cn or "GASTOS" in cn:
                continue
            v = _excel_float(row[c])
            if v and v > 0:
                servicios[str(c).strip()] = v
    total_serv = _row_val(row, "TOTAL") or 0.0
    if not total_serv and servicios:
        total_serv = sum(servicios.values())
    gasolina = _row_val(row, "GASOLINA") or 0.0
    credito = _row_val(row, "3% CREDITO", "CREDITO 3%") or 0.0
    total_venta = _row_val(row, "TOTAL VENTA") or 0.0
    gastos_gen = _row_val(row, "GASTOS GENERALES") or 0.0
    return {
        "gasolina": gasolina,
        "servicios": servicios,
        "totalServicios": total_serv,
        "gastosGenerales": gastos_gen,
        "credito3": credito,
        "totalVenta": total_venta,
        "precioFinal": total_venta or credito or total_serv,
        "costoSinReparacion": total_serv or gasolina,
    }


def _sync_resumen_desde_modulos(client):
    """Resumen legacy c1/c6 para compatibilidad: mejor precio por módulo."""
    mods = client.get("modulos") or {}
    precios = [
        float(m.get("precioFinal") or 0)
        for m in mods.values()
        if float(m.get("precioFinal") or 0) > 0
    ]
    if precios:
        client["c6"] = max(precios)
    gas = [
        float(m.get("gasolina") or 0)
        for m in mods.values()
        if float(m.get("gasolina") or 0) > 0
    ]
    if gas:
        client["c3"] = max(gas)
    vd = client.get("viajeDani") or {}
    if vd.get("km"):
        client["c1"] = vd["km"]


def _excel_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _apply_hoja1_row(client, cols):
    km = _excel_float(cols.get("KM  X2"))
    if km is not None:
        client["c1"] = km
    lit = _excel_float(cols.get("LITROS"))
    if lit is not None:
        client["c2"] = lit
    hrs = _excel_float(cols.get("HRS "))
    if hrs is not None:
        client["c4"] = hrs
    gas = _excel_float(cols.get("$ GASOLINA2"))
    if gas is not None:
        client["c3"] = gas
    tot = _excel_float(cols.get("TOTAL"))
    if tot is not None:
        client["c6"] = tot
    client["c5"] = client["c4"] * 125
    if not client["c6"]:
        client["c6"] = client.get("c3", 0) + client["c5"]
    if client["c1"] or client["c6"]:
        client["enHoja1"] = True
        if "Hoja1" not in client["sheets"]:
            client["sheets"].insert(0, "Hoja1")


def _copy_gastos_excel(dest, src, origen=""):
    for k in ("c1", "c2", "c3", "c4", "c5", "c6"):
        if src.get(k):
            dest[k] = src[k]
    if src.get("modulos"):
        dest["modulos"] = json.loads(json.dumps(src["modulos"], ensure_ascii=False))
    if src.get("viajeDani"):
        dest["viajeDani"] = dict(src["viajeDani"])
    if src.get("enHoja1"):
        dest["enHoja1"] = True
    if origen:
        dest["gastosHeredadosDe"] = origen
    if src.get("rfc") and not dest.get("rfc"):
        dest["rfc"] = src["rfc"]
    _sync_resumen_desde_modulos(dest)


def aplicar_gastos_heredados(clients_list):
    by_name = {norm(c["name"]): c for c in clients_list}
    for hijo, padre in GASTOS_HEREDAR.items():
        ck, pk = norm(hijo), norm(padre)
        if ck not in by_name or pk not in by_name:
            continue
        dest, src = by_name[ck], by_name[pk]
        if not dest.get("modulos") and src.get("modulos"):
            _copy_gastos_excel(dest, src, padre)
        elif not dest.get("c6") and src.get("c6"):
            _copy_gastos_excel(dest, src, padre)


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s).upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def levenshtein(a, b):
    if not a:
        return len(b)
    if not b:
        return len(a)
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    return d[len(a)][len(b)]


def similarity(a, b):
    s, t = norm(a), norm(b)
    if not s or not t:
        return 0
    d = levenshtein(s, t)
    m = max(len(s), len(t))
    return round((1 - d / m) * 100) if m else 100


def rfc_match(r1, r2):
    if not r1 or not r2:
        return False
    r1, r2 = norm(r1), norm(r2)
    if len(r1) < 10 or len(r2) < 10:
        return False
    return r1 == r2 or r1[:10] == r2[:10]


def digits_only(s):
    return re.sub(r"\D", "", s or "")


def is_placeholder_name(name):
    """Etiquetas vacías de Odoo que el OCR confunde con el nombre."""
    if not name:
        return True
    lo = str(name).lower().strip()
    if re.search(
        r"nombre\s*(de\s*|ce\s*|d[eé]\s+la\s*)?empresa|ombre\s+de\s+la\s+empresa|"
        r"correo\s*electr|tel[eé]fono|puesto\s*de\s*trabajo|sitio\s*web|"
        r"^calle\.?$|^c\.p\.?$|^ciudad$|^estado$|crector|director\s+de\s+ventas|"
        r"^empresa\s+nombre|^nombre\s+ce\s",
        lo,
    ):
        return True
    if "nombre" in lo and "empresa" in lo:
        return True
    if lo.startswith("empresa ") and len(lo) < 80:
        return True
    return False


def is_garbage_name(name):
    """OCR/UI: 'Persona © Empresa', menús, símbolos."""
    if is_placeholder_name(name):
        return True
    if not name or len(str(name).strip()) < 2:
        return True
    raw = str(name).strip()
    n = norm(raw)
    if not n:
        return True
    if n in ("PERSONA EMPRESA", "O PERSONA EMPRESA", "PERSONA O EMPRESA"):
        return True
    if re.search(r"PERSONA.*EMPRESA|EMPRESA.*PERSONA", n):
        return True
    if re.search(r"[\[\]$©|{}\\]", raw) and not re.match(
        r"^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s,\.&\-]{2,}$", raw
    ):
        return True
    alnum = sum(c.isalnum() for c in raw)
    if len(raw) > 6 and alnum / len(raw) < 0.45:
        return True
    return False


def _direccion_es_real(direccion):
    """Dirección con datos reales (no placeholders Calle…, Ciudad…)."""
    if not direccion or len(str(direccion).strip()) < 4:
        return False
    d = str(direccion).strip()
    if d in ("<= =", "==", "—", "-"):
        return False
    lo = d.lower()
    if re.search(r"rec\?\s*no\s+aplica", lo):
        return False
    if re.search(
        r"^calle\s*\.{2,}|^calle\s*2\s*\.{2,}|^c\.p\.?\s*$|^ciudad\s*$|^estado\s*$|^pa[ií]s\s*$",
        lo,
    ):
        return False
    if re.search(r"\d{4,5}", d) or re.search(
        r"(km|blvd|carr|parque|industrial|libramiento|panamericana|leon|guanajuato|jalisco|mexico|m[eé]xico|arandas|silao)",
        d,
        re.I,
    ):
        return True
    return len(d) > 18 and re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]{5,}", d)


def _ocr_direccion_de_la_empresa(ocr_text):
    return bool(
        re.search(r"direcci[oó]n\s+de\s+la\s+empresa", ocr_text or "", re.I)
    )


def _ocr_tiene_direccion_propia(ocr_text, direccion):
    """Empresa Odoo: bloque «Dirección» (no «Dirección de la empresa»)."""
    if _ocr_direccion_de_la_empresa(ocr_text):
        return False
    if _direccion_es_real(direccion):
        return True
    tras_etiqueta = False
    for ln in (ocr_text or "").split("\n"):
        lo = ln.lower().strip()
        if lo.startswith("dirección") or lo.startswith("direccion"):
            tras_etiqueta = True
            rest = re.sub(r"^direcci[oó]n\s*[:=\-«»\"\'\s]*", "", ln, flags=re.I).strip()
            rest = re.sub(r"RFC.*", "", rest, flags=re.I).strip()
            if _direccion_es_real(rest):
                return True
            continue
        if tras_etiqueta:
            if re.search(r"sitio\s*web|idioma|etiqueta|propiedad|contactos\s+ventas", lo):
                break
            if _direccion_es_real(ln):
                return True
    return False


def _valor_empresa_campo_valido(s):
    if not s or is_placeholder_name(s) or is_garbage_name(s):
        return False
    lo = str(s).lower()
    if re.search(
        r"direcci[oó]n|rec\?|no aplica|puesto de trabajo|nombre de la empresa|"
        r"^calle\s*\.{2}|^ciudad$|^estado$",
        lo,
    ):
        return False
    return len(s.strip()) >= 2


def extraer_empresa_campo(datos_img, parsed, ocr_text=""):
    """Valor del campo «Empresa» en ficha Persona (no placeholder)."""
    di = datos_img or {}
    for src in (
        di.get("empresaImagen"),
        _extraer_empresa_puesto(di.get("puestoImagen") or parsed.get("puesto", "")),
        parsed.get("empresaOdoo"),
    ):
        s = (src or "").strip()
        if _valor_empresa_campo_valido(s):
            return s
    for ln in (ocr_text or "").split("\n"):
        if re.match(r"^empresa\s+", ln, re.I):
            val = re.sub(r"^empresa\s+", "", ln, flags=re.I).strip()
            if _valor_empresa_campo_valido(val):
                return val
    return ""


def clasificar_tipo_ficha(datos_img, parsed, ocr_text=""):
    """
    empresa: ficha con Dirección propia (empresa cliente).
    contacto_empresa: Persona con campo Empresa lleno (vendedor).
    contacto_solo: Persona sin empresa en campo (contacto independiente).
    Retorna (tipo, empresa_asociada, nombre_persona).
    """
    di = datos_img or {}
    tipo_radio = (di.get("tipoImagen") or parsed.get("tipo") or "").strip().lower()
    emp_campo = extraer_empresa_campo(di, parsed, ocr_text)
    direccion = (di.get("direccionImagen") or parsed.get("direccion") or "").strip()
    persona = (di.get("personaImagen") or parsed.get("person") or "").strip()
    nombre = (di.get("nombreEnImagen") or parsed.get("displayName") or "").strip()
    if is_garbage_name(nombre):
        nombre = persona
    dir_hija = _ocr_direccion_de_la_empresa(ocr_text)
    dir_propia = _ocr_tiene_direccion_propia(ocr_text, direccion)

    # Empresa = Dirección propia con datos (no «Dirección de la empresa» ni placeholders)
    if dir_propia and not dir_hija:
        nom_emp = _nombre_empresa_display(nombre or persona or "")
        if nom_emp and not is_garbage_name(nom_emp):
            if not emp_campo or norm(emp_campo) == norm(nom_emp) or norm(emp_campo) in norm(
                nombre or ""
            ):
                return "empresa", "", nom_emp

    if emp_campo:
        nom_hdr = norm(persona or nombre)
        # Sin empresa real: OCR repite el nombre de la persona en el campo Empresa
        if nom_hdr and norm(emp_campo) == nom_hdr:
            emp_campo = ""
        elif is_placeholder_name(emp_campo):
            emp_campo = ""
    if emp_campo:
        nom_p = persona or nombre
        if is_garbage_name(nom_p):
            nom_p = ""
        return "contacto_empresa", emp_campo, nom_p

    nom_p = persona or nombre
    return "contacto_solo", "", nom_p


def rfc_confiable(rfc, datos_img, ocr_text):
    if not rfc or len(str(rfc).strip()) < 12:
        return False
    di = datos_img or {}
    if di.get("verificadoCampos", {}).get("rfcImagen"):
        return True
    return valor_en_texto(rfc, ocr_text or "")


def nombre_para_match_excel(tipo_ficha, empresa_asoc, nombre_contacto, nombre_base):
    if tipo_ficha == "contacto_empresa" and empresa_asoc:
        return empresa_asoc
    if tipo_ficha == "empresa":
        return nombre_base or nombre_contacto
    return nombre_contacto or nombre_base


def extract_nombre_principal_imagen(text):
    """
    Nombre grande visible en ficha Odoo: persona (Eduardo Amezcua) o empresa (ECSA, EIKI).
    Ignora placeholders «Nombre de la empresa».
    """
    if not text:
        return "", "", "persona"
    blocks = []
    if "[TITULO]" in text:
        blocks.append(text.split("[DETALLE]", 1)[0].replace("[TITULO]", ""))
    blocks.append(text)
    best_person, best_empresa = "", ""
    for block in blocks:
        for ln in block.split("\n"):
            ln = ln.strip()
            if not ln or is_garbage_name(ln) or is_placeholder_name(ln):
                continue
            lo = ln.lower()
            if any(u in lo for u in UI_SKIP) and len(ln) < 45:
                continue
            if "@" in ln or re.match(r"^[=+%]|^\+?\d", ln):
                continue
            if re.search(r"RFC|REC\?|direcci[oó]n", lo, re.I):
                continue
            # Persona: Nombre Apellido(s)
            if re.match(
                r"^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$",
                ln,
            ):
                if len(ln) > len(best_person):
                    best_person = ln
                continue
            # Empresa corta: ECSA, EIKI, MR LUCKY
            if re.match(r"^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s&.\-|]{1,40}$", ln) and 2 <= len(ln) <= 40:
                if len(ln) > len(best_empresa):
                    best_empresa = ln
                continue
            # Empresa larga con S.A. de C.V.
            if re.search(r"S\.?\s*A\.?|de\s+C\.?\s*V", ln, re.I) and len(ln) > 10:
                main = ln.split(",")[0].strip()
                if not is_placeholder_name(main):
                    return main, ln, "empresa"
            # Cabecera: EMPRESA, ciudad, México
            if re.match(r"^[A-ZÁÉÍÓÚÑ0-9].{2,},\s*.+", ln):
                main = ln.split(",")[0].strip()
                if not is_placeholder_name(main):
                    return main, ln, "empresa"

    if best_person:
        return best_person, best_person, "persona"
    if best_empresa:
        return best_empresa, best_empresa, "empresa"
    return "", "", "persona"


def score_catalog_vs_imagen(oc, parsed, raw_text, nombre_img):
    """Puntuación: catálogo solo si encaja con lo leído en la imagen."""
    if not oc:
        return 0
    s = 0
    nb, nn = norm(oc.get("nombreBase", "")), norm(oc.get("nombre", ""))
    ni = norm(nombre_img or "")
    person = norm(parsed.get("person", ""))
    if ni and (ni == nb or ni in nn or nn in ni):
        s = max(s, 98)
    if person and person in nn:
        s = max(s, 97)
    if nombre_img and valor_en_texto(oc["nombreBase"], raw_text):
        s = max(s, 92)
    if parsed.get("email") and oc.get("email"):
        if normalize_email_for_match(parsed["email"]) == normalize_email_for_match(oc["email"]):
            s = max(s, 70)
    td = digits_only(parsed.get("tel", ""))[-10:]
    if td and digits_only(oc.get("tel", ""))[-10:] == td:
        s = max(s, 68)
    if ni and person and ni != person:
        if nb not in ni and ni not in nb:
            s = min(s, 55)
    return s


def normalize_email_for_match(email):
    e = (email or "").lower().strip().replace(" ", "")
    if not e:
        return ""
    if "@" not in e and "." in e:
        e = re.sub(r"([a-z0-9.+\-]+)@?([a-z0-9\-]+\.[a-z]{2,})", r"\1@\2", e)
    return e


def emails_equivalent(a, b, text=""):
    a, b = normalize_email_for_match(a), normalize_email_for_match(b)
    if a and b and a == b:
        return True
    tfix = normalize_email_for_match((text or "").replace("E", "@"))
    for em in (a, b):
        if em and em in tfix:
            return True
    return False


def build_odoo_email_tel_index(odoo_list):
    by_email, by_tel = {}, {}
    for i, oc in enumerate(odoo_list):
        em = normalize_email_for_match(oc.get("email"))
        if em:
            by_email.setdefault(em, []).append(i)
        td = digits_only(oc.get("tel", ""))[-10:]
        if len(td) >= 10:
            by_tel.setdefault(td, []).append(i)
    return by_email, by_tel


def find_odoo_by_email_tel(parsed, text, odoo_list, by_email, by_tel, nombre_img=""):
    """Match por email/tel; prioriza registro cuyo nombre coincide con la imagen."""
    email = normalize_email_for_match(parsed.get("email") or "")
    tel = digits_only(parsed.get("tel", ""))[-10:]
    tfix = normalize_email_for_match(text.replace("E", "@").replace("©", ""))

    def pick_contact(indices, parsed=None, raw_text="", nombre_img=""):
        if not indices:
            return None
        best, best_s = None, -1
        for idx in indices:
            oc = odoo_list[idx]
            sc = score_catalog_vs_imagen(oc, parsed or {}, raw_text, nombre_img)
            if sc > best_s:
                best_s, best = sc, oc
        return best

    if email and email in by_email:
        oc = pick_contact(by_email[email], parsed, text, nombre_img)
        sc = score_catalog_vs_imagen(oc, parsed, text, nombre_img) if oc else 0
        return (oc, sc) if oc and sc >= 55 else (None, 0)

    hits = []
    for em, indices in by_email.items():
        if em and (em == email or em in tfix):
            hits.extend(indices)
    if hits:
        oc = pick_contact(hits, parsed, text, nombre_img)
        sc = score_catalog_vs_imagen(oc, parsed, text, nombre_img) if oc else 0
        return (oc, sc) if oc and sc >= 55 else (None, 0)

    if len(tel) >= 10 and tel in by_tel:
        oc = pick_contact(by_tel[tel], parsed, text, nombre_img)
        sc = score_catalog_vs_imagen(oc, parsed, text, nombre_img) if oc else 0
        return (oc, sc) if oc and sc >= 55 else (None, 0)
    tel_hits = []
    for td, indices in by_tel.items():
        if td in digits_only(text):
            tel_hits.extend(indices)
    if tel_hits:
        oc = pick_contact(tel_hits, parsed, text, nombre_img)
        sc = score_catalog_vs_imagen(oc, parsed, text, nombre_img) if oc else 0
        return (oc, sc) if oc and sc >= 55 else (None, 0)
    return None, 0


def extract_empresa_puesto(text):
    m = re.search(
        r"Empresa\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚñ0-9\s&.\-|]{2,}?)\s+Puesto",
        text or "",
        re.I,
    )
    return m.group(1).strip() if m else ""


def extract_line_catalog_names(text, odoo_list):
    """Nombres sueltos en OCR que existen en catálogo (ej. línea 'NHK')."""
    by_base = {}
    for oc in odoo_list:
        nb = norm(oc["nombreBase"])
        if nb and len(nb) >= 2:
            by_base[nb] = oc
    found = []
    for ln in (text or "").split("\n"):
        ln = ln.strip()
        if not ln or len(ln) > 80:
            continue
        key = norm(ln.split(",")[0])
        if key in by_base and not is_garbage_name(ln):
            found.append(by_base[key])
    return found


def load_odoo_contacts():
    """Excel exportado de Odoo: Nombre completo, email, teléfono."""
    import pandas as pd

    path = ODOO_CONTACTS_FILE
    if not path.exists():
        alt = Path(r"c:\Users\norbe\Downloads\Contacto (res.partner) (1).xlsx")
        path = alt if alt.exists() else path
    if not path.exists():
        print(f"AVISO: sin Excel Odoo en {ODOO_CONTACTS_FILE} — catálogo vacío")
        return []
    df = pd.read_excel(path)
    name_col = next(c for c in df.columns if "ombre" in str(c))
    email_col = next(c for c in df.columns if "orreo" in str(c))
    tel_col = next(c for c in df.columns if "Tel" in str(c) or "tel" in str(c).lower())
    out = []
    for _, row in df.iterrows():
        nombre = str(row[name_col]).strip() if pd.notna(row[name_col]) else ""
        if not nombre or nombre.lower() == "nan":
            continue
        parts = [p.strip() for p in nombre.split(",", 1)]
        email = str(row[email_col]).strip() if pd.notna(row[email_col]) else ""
        tel = str(row[tel_col]).strip() if pd.notna(row[tel_col]) else ""
        if email.lower() == "nan":
            email = ""
        if tel.lower() == "nan":
            tel = ""
        out.append(
            {
                "nombre": nombre,
                "nombreBase": parts[0],
                "contactoPersona": parts[1] if len(parts) > 1 else "",
                "email": email,
                "tel": tel,
            }
        )
    return out


def extract_titulo_odoo(text):
    """Nombre grande de la ficha Odoo: línea tipo 'MR LUCKY, Irapuato' o 'NHK'."""
    if not text:
        return ""
    emp = extract_empresa_puesto(text)
    if emp and not is_garbage_name(emp):
        return emp
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    best, best_len = "", 0
    for ln in lines:
        lo = ln.lower()
        if any(u in lo for u in UI_SKIP):
            continue
        if is_garbage_name(ln):
            continue
        if "@" in ln or re.match(r"^\+?\d", ln):
            continue
        if re.search(r"RFC|REC\?", lo, re.I):
            continue
        if len(ln) < 2 or len(ln) > 120:
            continue
        if re.match(r"^[A-ZÁÉÍÓÚÑ0-9]", ln):
            main = ln.split(",")[0].strip()
            min_len = 2 if re.match(r"^[A-Z0-9]{2,8}$", main) else 4
            if len(main) >= min_len and len(main) > best_len:
                if not main.lower().startswith("empresa"):
                    best, best_len = main, len(main)
    return best if not is_garbage_name(best) else ""


ODOO_OCR_ALIASES = {
    "MSLUCKY": "MR LUCKY",
    "MRIUCKY": "MR LUCKY",
    "MRUCKY": "MR LUCKY",
}


def build_odoo_index(odoo_list):
    """Índice por tokens para no comparar 140 contactos en cada imagen."""
    idx = {}
    for i, oc in enumerate(odoo_list):
        tokens = set(norm(oc["nombreBase"]).split()) | set(norm(oc["nombre"]).split())
        for w in tokens:
            if len(w) >= 3:
                idx.setdefault(w, []).append(i)
        for n in (4, 5, 6):
            base = norm(oc["nombreBase"])
            if len(base) >= n:
                idx.setdefault(base[:n], []).append(i)
    return idx


def find_odoo_contact_match(ocr_text, parsed, odoo_list, odoo_index=None):
    """Cruza OCR con el Excel de contactos Odoo (fuente de verdad de nombres)."""
    text = ocr_text or ""
    tnorm = norm(text)
    candidates = [extract_titulo_odoo(text), extract_empresa_puesto(text)]
    for oc in extract_line_catalog_names(text, odoo_list):
        candidates.append(oc["nombreBase"])
        candidates.append(oc["nombre"])
    for key in ("person", "empresaOdoo", "displayName"):
        if parsed.get(key):
            candidates.append(parsed[key])
            candidates.append(str(parsed[key]).split(",")[0].strip())
    for ln in text.split("\n"):
        ln = ln.strip()
        if "," in ln and 4 <= len(ln) <= 100:
            candidates.append(ln.split(",")[0].strip())

    candidate_ids = set()
    if odoo_index:
        for cand in candidates:
            if not cand:
                continue
            c0 = norm(cand.split(",")[0])
            alias = ODOO_OCR_ALIASES.get(c0.replace(" ", ""), "")
            if alias:
                candidates.append(alias)
            for w in c0.split():
                if len(w) >= 3:
                    candidate_ids.update(odoo_index.get(w, []))
            for n in (4, 5, 6):
                if len(c0) >= n:
                    candidate_ids.update(odoo_index.get(c0[:n], []))
        for w in tnorm.split():
            if len(w) >= 4:
                candidate_ids.update(odoo_index.get(w, []))
    pool = (
        [odoo_list[i] for i in candidate_ids]
        if candidate_ids
        else odoo_list
    )

    best, best_score = None, -1
    for oc in pool:
        score = 0
        nb, nn = norm(oc["nombreBase"]), norm(oc["nombre"])
        if nb and len(nb) >= 4 and nb in tnorm:
            score = max(score, 97)
        if nn and len(nn) >= 6 and nn in tnorm:
            score = max(score, 95)
        for cand in candidates:
            if not cand:
                continue
            c0 = cand.split(",")[0].strip()
            score = max(score, similarity(cand, oc["nombre"]))
            score = max(score, similarity(c0, oc["nombreBase"]))
            score = max(score, token_score(c0, oc["nombreBase"]))
        if oc.get("email") and (
            emails_equivalent(oc["email"], parsed.get("email"), text)
            or normalize_email_for_match(oc["email"]) in normalize_email_for_match(
                text.replace("E", "@")
            )
        ):
            score = max(score, 99)
        td = digits_only(oc.get("tel", ""))[-10:]
        if td and len(td) >= 10 and td in digits_only(text):
            score = max(score, 96)
        if score > best_score:
            best_score, best = score, oc
    if best:
        best_score = score_catalog_vs_imagen(
            best, parsed, text, extract_nombre_principal_imagen(text)[0]
        )
    return best, best_score


def load_excel_clients():
    import pandas as pd

    excel_path = resolve_excel_file()
    clients = {}
    xl = pd.ExcelFile(excel_path)

    for sheet in xl.sheet_names:
        mod_key = _sheet_es_modulo(sheet)
        if not mod_key:
            continue
        df = pd.read_excel(excel_path, sheet_name=sheet, header=1)
        if df.empty:
            continue
        for _, row in df.iterrows():
            raw = row.get("EMPRESA", row.iloc[0] if len(row) else None)
            if pd.isna(raw):
                continue
            name = str(raw).strip()
            if not name or name.upper() == "EMPRESA":
                continue
            canon = canonical_excel_name(name)
            key = norm(canon)
            if key not in clients:
                clients[key] = _blank_excel_client(canon, name)
            c = clients[key]
            c["excelFuente"] = excel_path.name
            if sheet not in c["sheets"]:
                c["sheets"].append(sheet)
            if mod_key == "automatizacion":
                c["modulos"][mod_key] = _parse_modulo_automatizacion(row)
            else:
                c["modulos"][mod_key] = _parse_modulo_estandar(row, mod_key)

    if "Hoja1" in xl.sheet_names:
        df1 = pd.read_excel(excel_path, sheet_name="Hoja1")
        for _, row in df1.iterrows():
            raw = row.iloc[0]
            if pd.isna(raw):
                continue
            name = str(raw).strip()
            if not name or name.upper() == "EMPRESA":
                continue
            canon = canonical_excel_name(name)
            key = norm(canon)
            if key not in clients:
                clients[key] = _blank_excel_client(canon, name)
            cols = {str(x).strip(): row[x] for x in df1.columns}
            c = clients[key]
            c["viajeDani"] = {
                "km": _excel_float(cols.get("KM  X2")) or 0.0,
                "litros": _excel_float(cols.get("LITROS")) or 0.0,
                "gasolina": _excel_float(cols.get("$ GASOLINA2")) or 0.0,
                "horas": _excel_float(cols.get("HRS ")) or 0.0,
                "hrDani": _excel_float(cols.get("HR DANI")) or 0.0,
                "costoDani": _excel_float(cols.get("$ DANI")) or 0.0,
                "totalViaje": _excel_float(cols.get("TOTAL")) or 0.0,
            }
            if c["viajeDani"].get("km"):
                c["enHoja1"] = True
                if "Hoja1" not in c["sheets"]:
                    c["sheets"].append("Hoja1")

    for c in clients.values():
        _sync_resumen_desde_modulos(c)

    result = sorted(clients.values(), key=lambda x: x["name"])
    aplicar_gastos_heredados(result)
    for i, c in enumerate(result, 1):
        c["num"] = i
        c["rfc"] = RFC_BY_COMPANY.get(c["name"], c.get("rfc", ""))
        c["soloEnExcelSinOdoo"] = True
    return result


def valor_en_texto(valor, text):
    """True si el valor aparece (total o parcial) en el OCR de la imagen."""
    if not valor or not text:
        return False
    v = norm(valor)
    t = norm(text)
    if not v:
        return False
    if v in t:
        return True
    if len(v) >= 6:
        words = [w for w in v.split() if len(w) >= 4]
        if words and sum(1 for w in words if w in t) >= max(1, len(words) - 1):
            return True
    if "@" in str(valor):
        em = normalize_email_for_match(valor)
        return bool(em and em in normalize_email_for_match(text.replace("E", "@")))
    td = digits_only(valor)[-10:]
    if len(td) >= 10 and td in digits_only(text):
        return True
    return False


def extract_datos_imagen(text):
    """
    Extrae solo lo legible en la captura (fuente = imagen/OCR).
    No rellena desde catálogo Excel.
    """
    parsed = parse_ocr_text(text)
    raw = text or ""
    nom_pri, linea_pri, tipo_pri = extract_nombre_principal_imagen(raw)
    lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
    # Bloque [TITULO] del re-OCR mejorado
    titulo_block = ""
    if "[TITULO]" in raw:
        parts = raw.split("[DETALLE]", 1)
        titulo_block = parts[0].replace("[TITULO]", "").strip()
        detalle_block = parts[1] if len(parts) > 1 else raw
    else:
        detalle_block = raw

    nombre_linea = ""
    ubicacion = ""
    for ln in lines + titulo_block.split("\n"):
        ln = ln.strip()
        if is_garbage_name(ln) or len(ln) < 3:
            continue
        lo = ln.lower()
        if any(u in lo for u in UI_SKIP) and len(ln) < 50:
            continue
        if "@" in ln or re.match(r"^\+?\d", ln):
            continue
        if re.search(r"RFC|REC\?", lo, re.I):
            continue
        # Cabecera Odoo: EMPRESA, ciudad, México
        if re.match(
            r"^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s&.\-|]{2,},\s*.+",
            ln,
        ):
            nombre_linea = ln
            parts = [p.strip() for p in ln.split(",")]
            if len(parts) > 1:
                ubicacion = ", ".join(parts[1:])
            break

    titulo = extract_titulo_odoo(titulo_block or raw)
    emp_puesto = extract_empresa_puesto(raw)
    nombre_img = nom_pri or ""
    nombre_linea = linea_pri or nombre_linea
    if not nombre_img and nombre_linea:
        nombre_img = nombre_linea.split(",")[0].strip()
    if not nombre_img and titulo and not is_garbage_name(titulo):
        nombre_img = titulo.split(",")[0].strip()
    if not nombre_img and emp_puesto and not is_garbage_name(emp_puesto):
        nombre_img = emp_puesto
    if not nombre_img and parsed.get("person") and not is_placeholder_name(parsed["person"]):
        nombre_img = parsed["person"]
    if (not nombre_img or is_placeholder_name(nombre_img)) and parsed.get("person"):
        nombre_img = parsed["person"]
    if nombre_img and is_placeholder_name(nombre_img):
        nombre_img = parsed.get("person") or nom_pri or ""

    sitio = ""
    for ln in lines:
        m = re.search(r"(https?://[\w./\-]+|www\.[\w.\-]+)", ln, re.I)
        if m:
            sitio = m.group(1)
            break

    tipo_ficha = tipo_pri or parsed.get("tipo", "")
    if re.search(r"Persona\s*©?\s*Empresa|Persona\s+O\s+Empresa", raw, re.I):
        if raw.lower().find("empresa") < raw.lower().find("persona"):
            tipo_ficha = "Empresa"
        elif nom_pri:
            tipo_ficha = tipo_pri

    emp_raw = extraer_empresa_campo(
        {"empresaImagen": parsed.get("empresaOdoo", ""), "puestoImagen": parsed.get("puesto", "") or emp_puesto},
        parsed,
        raw,
    )

    campos = {
        "nombreEnImagen": nombre_img,
        "nombreLineaCompleta": nombre_linea or titulo or nombre_img,
        "ubicacionImagen": ubicacion,
        "emailImagen": parsed.get("email", ""),
        "telImagen": parsed.get("tel", ""),
        "rfcImagen": parsed.get("rfc", ""),
        "direccionImagen": parsed.get("direccion", ""),
        "puestoImagen": parsed.get("puesto", "") or emp_puesto,
        "empresaImagen": emp_raw,
        "personaImagen": parsed.get("person", ""),
        "sitioWebImagen": sitio,
        "dominioImagen": parsed.get("dominio", ""),
        "tipoImagen": tipo_ficha,
    }
    verif = {}
    for k, v in campos.items():
        if k == "nombreLineaCompleta":
            verif[k] = bool(v) and valor_en_texto(v[:40], raw)
        elif v:
            verif[k] = valor_en_texto(v, raw)
        else:
            verif[k] = False
    keys_check = [
        "nombreEnImagen",
        "emailImagen",
        "telImagen",
        "rfcImagen",
        "direccionImagen",
        "ubicacionImagen",
    ]
    con_dato = sum(1 for k in keys_check if campos.get(k))
    verif_ok = sum(1 for k in keys_check if campos.get(k) and verif.get(k))
    pct = int(100 * verif_ok / con_dato) if con_dato else 0

    nombre_ok = bool(campos["nombreEnImagen"]) and verif.get("nombreEnImagen", False)
    return {
        **campos,
        "verificadoCampos": verif,
        "completitudImagen": pct,
        "nombreVerificado": nombre_ok,
        "textoOcrResumen": raw[:800],
    }


def parse_ocr_text(text):
    if not text:
        return {}
    t = text.replace("E", "@").replace("©", "")
    emails = re.findall(r"[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}", t, re.I)
    emails = [e.lower().replace(" ", "") for e in emails if "@" in e]
    phones = re.findall(r"\+52[\s\d]{10,16}|\+52\s*\d{3}[\s\d]{7,10}", t)
    rfcs = re.findall(r"\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b", t.upper())
    rfcs = [r for r in rfcs if len(r) >= 12 and "APLICA" not in r]

    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    ui = {"persona", "empresa", "correo", "direccion", "puesto", "nombre de la"}
    person = ""
    empresa_odoo = ""
    tipo = ""
    if re.search(r"\bPersona\b", text) and re.search(r"\bEmpresa\b", text):
        tipo = "Empresa" if text.find("Persona") > text.find("Empresa") else "Persona"
    for ln in lines:
        lo = ln.lower()
        if ln.startswith("=") or ln.startswith("%"):
            continue
        if any(u in lo for u in ui) and len(ln) < 40:
            continue
        if "@" in ln or re.match(r"^\+?\d", ln):
            continue
        if re.search(r"RFC|REC\?", lo):
            continue
        if re.match(r"^[A-Za-zÁÉÍÓÚñÑ]+\s+[A-Za-zÁÉÍÓÚñÑ]+", ln) and len(ln.split()) <= 5:
            if (
                not person
                and not is_placeholder_name(ln)
                and "anguiplast" not in lo
                and "empresa" not in lo
            ):
                person = ln.strip()
                continue
        if len(ln) > 4 and re.search(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,}", ln):
            if not empresa_odoo and not is_placeholder_name(ln) and (
                "s.a" in lo or "s de c" in lo or "c.v" in lo or "anguiplast" in lo or len(ln) > 18
            ):
                empresa_odoo = ln

    direccion = ""
    puesto = ""
    for ln in lines:
        lo = ln.lower()
        if lo.startswith("dirección") or lo.startswith("direccion"):
            direccion = re.sub(r"^direcci[oó]n\s*[:=\-]*\s*", "", ln, flags=re.I).strip()
            direccion = re.sub(r"REC\?.*", "", direccion, flags=re.I).strip()
        if "puesto" in lo and "trabajo" in lo and len(ln) < 80:
            puesto = ln

    email = emails[0] if emails else ""
    dominio = email.split("@")[1] if "@" in email else ""
    if not dominio:
        for ln in lines:
            m = re.search(r"([\w\-]+\.(?:com|mx|net|org))", ln, re.I)
            if m:
                d = m.group(1).lower()
                if "anguiplast" in d or len(d) > 6:
                    dominio = d.replace("anguiplastcom", "anguiplast.com")
                    break

    display = person or empresa_odoo or ""
    return {
        "email": email,
        "tel": phones[0].strip() if phones else "",
        "rfc": rfcs[0] if rfcs else "",
        "person": person,
        "empresaOdoo": empresa_odoo,
        "tipo": tipo or ("Empresa" if empresa_odoo else "Persona"),
        "dominio": dominio,
        "direccion": direccion[:120] if direccion else "",
        "puesto": puesto[:80] if puesto else "",
        "displayName": display,
    }


def _nombre_empresa_display(name):
    if not name:
        return ""
    return name.split(",")[0].strip()


def _extraer_empresa_puesto(puesto):
    """Ej. 'Empresa MR LUCKY Puesto de trabajo Ventas' → MR LUCKY."""
    if not puesto:
        return ""
    m = re.search(
        r"empresa\s+(.+?)(?:\s+puesto\s+de\s+trabajo|\s+puesto\b|\s*$)",
        str(puesto),
        re.IGNORECASE,
    )
    if m:
        cand = m.group(1).strip()
        if cand and not is_placeholder_name(cand) and not is_garbage_name(cand):
            return cand
    return ""


def _empresa_grupo_key(o):
    """Solo agrupa vendedores bajo empresaAsociada o ficha tipo empresa."""
    tipo = o.get("tipoFicha") or ""
    if tipo == "empresa":
        base = _nombre_empresa_display(o.get("nombreContacto") or o.get("nombreBase") or "")
        if base and not is_placeholder_name(base) and not is_garbage_name(base):
            return norm(base)
    if tipo == "contacto_empresa":
        base = (o.get("empresaAsociada") or "").strip()
        if base and not is_placeholder_name(base) and not is_garbage_name(base):
            return norm(base)
    return ""


def _es_vendedor_registro(o, empresa_key):
    return (o.get("tipoFicha") or "") == "contacto_empresa"


def build_empresas_odoo(odoo_list, odoo_catalog):
    """Empresas → ficha + vendedores (capturas + catálogo Excel sin captura)."""
    grupos = {}
    for o in odoo_list:
        key = _empresa_grupo_key(o)
        if not key:
            continue
        if key not in grupos:
            display = (
                o.get("empresaAsociada")
                or _nombre_empresa_display(o.get("nombreContacto") or "")
                or key
            )
            grupos[key] = {
                "key": key,
                "nombre": display or key,
                "ficha": None,
                "vendedores": [],
                "idsCapturas": [],
            }
        g = grupos[key]
        if o.get("empresaAsociada") and norm(o["empresaAsociada"]) == key:
            g["nombre"] = o["empresaAsociada"]
        g["idsCapturas"].append(o["id"])
        if (o.get("tipoFicha") or "") == "empresa":
            if not g["ficha"]:
                g["ficha"] = o
        elif _es_vendedor_registro(o, key):
            g["vendedores"].append({**o, "tipoRegistro": "captura"})

    captura_vendedores = set()
    captura_nombres = set()
    for x in odoo_list:
        captura_nombres.add(norm(x.get("nombreContacto") or ""))
        if x.get("contactoPersona"):
            ek = _empresa_grupo_key(x)
            if ek:
                captura_vendedores.add((ek, norm(x.get("contactoPersona") or x.get("person") or "")))
    for oc in odoo_catalog:
        if not oc.get("contactoPersona"):
            continue
        key = norm(oc.get("nombreBase") or "")
        if not key:
            continue
        nn = norm(oc["nombre"])
        pk = norm(oc["contactoPersona"])
        if (key, pk) in captura_vendedores:
            continue
        if nn in captura_nombres:
            continue
        if key not in grupos:
            grupos[key] = {
                "key": key,
                "nombre": oc["nombreBase"],
                "ficha": None,
                "vendedores": [],
                "idsCapturas": [],
            }
        grupos[key]["vendedores"].append(
            {
                "synthetic": True,
                "nombreContacto": oc["nombre"],
                "nombreBase": oc["nombreBase"],
                "contactoPersona": oc["contactoPersona"],
                "person": oc["contactoPersona"],
                "email": oc.get("email", ""),
                "tel": oc.get("tel", ""),
                "puesto": "",
                "rol": "contacto_cliente",
                "tipoRegistro": "catalogo",
            }
        )

    out = []
    for g in grupos.values():
        g["totalVendedores"] = len(g["vendedores"])
        g["totalCapturas"] = len(g["idsCapturas"])
        out.append(g)
    out.sort(key=lambda x: (-len(x["vendedores"]), -len(x["idsCapturas"]), x["nombre"]))
    return out


def contacto_vinculado_a_tabulador(o, ex_name, ex_key):
    """¿Esta captura Odoo pertenece a esta fila del tabulador (50 empresas)?"""
    if not o.get("excelMatch") or o.get("matchScore", 0) < 78:
        return False
    if norm(o["excelMatch"]) != ex_key:
        return False
    tipo = o.get("tipoFicha") or ""
    if tipo == "contacto_solo":
        return False
    if tipo == "empresa":
        nom = (o.get("nombreContacto") or o.get("nombreBase") or "").strip()
        if not nom:
            return False
        nk, ek = norm(nom), ex_key
        if nk == ek:
            return True
        if len(ek) >= 5 and ek in nk:
            return True
        if len(nk) >= 5 and nk in ek:
            return True
        return similarity(nom, ex_name) >= 85
    if tipo == "contacto_empresa":
        emp = (o.get("empresaAsociada") or "").strip()
        if not emp:
            return False
        return (
            norm(emp) == ex_key
            or similarity(emp, ex_name) >= 82
            or token_score(emp, ex_name) >= 85
        )
    return False


def build_tabulador_erp(excel, odoo):
    """
    Las 50 empresas del tabulador como base ERP: gastos (km, gasolina, total)
    + capturas Odoo vinculadas por nombre de empresa (no por persona suelta).
    """
    empresas = []
    relacion_erp = []
    for ex in excel:
        key = norm(ex["name"])
        contacts = [
            o for o in odoo if contacto_vinculado_a_tabulador(o, ex["name"], key)
        ]
        vd = ex.get("viajeDani") or {}
        g = {
            "km": round(float(vd.get("km") or ex.get("c1") or 0), 2),
            "litros": round(float(vd.get("litros") or ex.get("c2") or 0), 4),
            "gasolinaViajeDani": round(float(vd.get("gasolina") or 0), 2),
            "horasDani": round(float(vd.get("horas") or ex.get("c4") or 0), 2),
            "totalViajeDani": round(float(vd.get("totalViaje") or 0), 2),
            "modulos": ex.get("modulos") or {},
            "gasolina": round(float(ex.get("c3") or 0), 2),
            "ventas": round(float(ex.get("c5") or 0), 2),
            "total": round(float(ex.get("c6") or 0), 2),
        }
        entry = {
            "key": key,
            "nombreExcel": ex["name"],
            "nombreEnHoja": ex.get("nameExcel", ex["name"]),
            "rfc": ex.get("rfc", ""),
            "gastos": g,
            "sheets": ex.get("sheets", []),
            "excel": ex,
            "contacts": contacts,
            "contactCount": len(contacts),
            "tieneCapturasOdoo": len(contacts) > 0,
            "enHoja1": bool(ex.get("enHoja1") or g["km"]),
            "gastosHeredadosDe": ex.get("gastosHeredadosDe", ""),
            "soloEnExcelSinOdoo": len(contacts) == 0,
        }
        empresas.append(entry)
        relacion_erp.append(
            {
                "empresaTabulador": ex["name"],
                "rfc": ex.get("rfc", ""),
                "km": g["km"],
                "viajeDani": vd,
                "modulos": g["modulos"],
                "total": g["total"],
                "contactosOdoo": [
                    {
                        "id": c["id"],
                        "nombreEnImagen": c.get("nombreContacto"),
                        "persona": c.get("contactoPersona") or c.get("person"),
                        "tipoFicha": c.get("tipoFicha"),
                        "empresaAsociada": c.get("empresaAsociada"),
                        "email": c.get("email"),
                        "tel": c.get("tel"),
                        "matchScore": c.get("matchScore"),
                    }
                    for c in contacts
                ],
            }
        )

    empresas.sort(
        key=lambda x: (not x["tieneCapturasOdoo"], -x["contactCount"], x["nombreExcel"])
    )
    con_capturas = [e for e in empresas if e["tieneCapturasOdoo"]]
    sin_capturas = [e for e in empresas if not e["tieneCapturasOdoo"]]
    linked_ids = {c["id"] for e in empresas for c in e["contacts"]}
    odoo_sin = aplicar_reglas_odoo_sin([o for o in odoo if o["id"] not in linked_ids])
    return {
        "empresas": empresas,
        "conCapturasOdoo": con_capturas,
        "sinCapturasOdoo": sin_capturas,
        "odooSinTabulador": odoo_sin,
        "relacionErp": relacion_erp,
    }


def clasificar_registro(tipo_ficha, parsed, has_ocr, excel_match, empresa_asoc):
    if not has_ocr:
        return "pendiente_ocr", "Captura sin procesar (falta OCR)"
    if tipo_ficha == "contacto_empresa":
        msg = f"Vendedor/contacto de {empresa_asoc or 'empresa Odoo'}"
        if excel_match:
            msg += f" · tabulador: {excel_match}"
        return "contacto_cliente", msg
    if tipo_ficha == "empresa":
        if excel_match:
            return "ficha_cliente", f"Empresa cliente (con dirección) · tabulador: {excel_match}"
        return "ficha_cliente", "Empresa cliente Odoo (con dirección propia)"
    if excel_match:
        return "contacto_cliente", f"Contacto vinculado a tabulador: {excel_match}"
    if parsed.get("person") and not empresa_asoc:
        return "proveedor_persona", "Persona sin empresa en campo; no en tabulador"
    if parsed.get("rfc") and not excel_match:
        return "proveedor_rfc", "Tiene RFC pero no coincide con empresas del Excel"
    return "solo_odoo", "Registro Odoo sin equivalente en el tabulador SSEPI"


def token_score(odoo_name, ex_name):
    o, e = norm(odoo_name), norm(ex_name)
    if not o or not e:
        return 0
    if e in o or o in e:
        return 92
    words_e = [w for w in e.split() if len(w) >= 4]
    if not words_e:
        words_e = e.split()
    words_o = o.split()
    hits = 0
    for w in words_e:
        if any(w in wo or wo.startswith(w[:4]) for wo in words_o if len(wo) >= 3):
            hits += 1
    return int(85 * hits / len(words_e)) if hits else 0


def find_excel_match(odoo_name, rfc, excel_list, hint_name=None):
    best, best_score = None, -1
    names_to_try = [odoo_name, hint_name]
    for ex in excel_list:
        score = 0
        for n in names_to_try:
            if not n:
                continue
            score = max(
                score,
                similarity(n, ex["name"]),
                token_score(n, ex["name"]),
            )
            if ex.get("nameExcel"):
                score = max(score, similarity(n, ex["nameExcel"]), token_score(n, ex["nameExcel"]))
        if rfc and ex.get("rfc") and rfc_match(rfc, ex["rfc"]):
            score = max(score, 96)
        if score > best_score:
            best_score, best = score, ex
    return best, best_score


def main():
    excel = load_excel_clients()
    odoo_contacts = load_odoo_contacts()
    rastro_map = load_rastro_capturas()
    odoo_index = build_odoo_index(odoo_contacts)
    by_email, by_tel = build_odoo_email_tel_index(odoo_contacts)
    print(f"Contactos Odoo (Excel): {len(odoo_contacts)}")
    print(f"Rastro capturas: {len(rastro_map)}")
    ocr_by_file = {}
    if OCR_FILE.exists():
        for item in json.loads(OCR_FILE.read_text(encoding="utf-8")):
            ocr_by_file[item.get("file", "")] = item

    images = sorted(IMG_DIR.glob("Screenshot*.png"))
    odoo = []
    for i, img in enumerate(images, 1):
        fname = img.name
        ocr = ocr_by_file.get(fname, {})
        ocr_text = ocr.get("text", "")
        parsed = parse_ocr_text(ocr_text)
        if fname in rastro_map:
            datos_img = datos_imagen_desde_rastro(rastro_map[fname])
            parsed_from_rastro = {
                "email": datos_img.get("emailImagen", ""),
                "tel": datos_img.get("telImagen", ""),
                "rfc": datos_img.get("rfcImagen", ""),
                "person": datos_img.get("personaImagen", ""),
                "empresaOdoo": datos_img.get("nombreEnImagen", ""),
                "tipo": datos_img.get("tipoImagen", ""),
                "dominio": datos_img.get("dominioImagen", ""),
                "direccion": datos_img.get("direccionImagen", ""),
                "puesto": datos_img.get("puestoImagen", ""),
                "displayName": datos_img.get("nombreEnImagen", ""),
            }
            parsed = {**parsed, **{k: v for k, v in parsed_from_rastro.items() if v}}
        else:
            datos_img = extract_datos_imagen(ocr_text)
        titulo = datos_img.get("nombreEnImagen") or extract_titulo_odoo(ocr_text)
        nombre_img = datos_img.get("nombreEnImagen") or ""
        email_hit, email_score = find_odoo_by_email_tel(
            parsed, ocr_text, odoo_contacts, by_email, by_tel, nombre_img
        )
        odoo_contact, odoo_score = find_odoo_contact_match(
            ocr_text, parsed, odoo_contacts, odoo_index
        )
        if email_hit and email_score >= odoo_score:
            odoo_contact, odoo_score = email_hit, max(odoo_score, email_score)

        catalog_hits = extract_line_catalog_names(ocr_text, odoo_contacts)
        if catalog_hits and (not odoo_contact or odoo_score < 90):
            odoo_contact, odoo_score = catalog_hits[0], max(odoo_score, 95)

        # Prioridad: datos leídos de la imagen (OCR), no del catálogo Excel
        nombre_contacto = datos_img.get("nombreEnImagen") or ""
        nombre_base = nombre_contacto.split(",")[0].strip() if nombre_contacto else ""
        email = datos_img.get("emailImagen") or ""
        tel = datos_img.get("telImagen") or ""
        contacto_persona = datos_img.get("personaImagen") or ""
        if not nombre_contacto and titulo and not is_garbage_name(titulo):
            nombre_contacto = titulo
            nombre_base = titulo.split(",")[0].strip()
        if is_garbage_name(nombre_contacto):
            nombre_contacto = ""
            nombre_base = ""

        tipo_ficha, empresa_asoc, nombre_persona = clasificar_tipo_ficha(
            datos_img, parsed, ocr_text
        )
        if tipo_ficha == "empresa":
            if nombre_contacto and not is_garbage_name(nombre_contacto):
                nombre_base = _nombre_empresa_display(nombre_contacto)
            contacto_persona = ""
            empresa_asoc = ""
        elif tipo_ficha == "contacto_empresa":
            contacto_persona = nombre_persona or contacto_persona or datos_img.get("personaImagen", "")
            if contacto_persona and not is_garbage_name(contacto_persona):
                nombre_contacto = contacto_persona
                nombre_base = contacto_persona
            datos_img["empresaImagen"] = empresa_asoc
        else:
            contacto_persona = nombre_persona or contacto_persona or datos_img.get("personaImagen", "")
            if contacto_persona and not is_garbage_name(contacto_persona):
                nombre_contacto = contacto_persona
                nombre_base = contacto_persona
            empresa_asoc = ""

        nombre_coincide_catalogo = False
        catalogo_solo_email = False
        if odoo_contact and nombre_contacto:
            nombre_coincide_catalogo = score_catalog_vs_imagen(
                odoo_contact, parsed, ocr_text, nombre_contacto
            ) >= 85
            catalogo_solo_email = (
                not nombre_coincide_catalogo
                and odoo_score >= 55
                and bool(parsed.get("email"))
            )
        en_lista_odoo = bool(odoo_contact and odoo_score >= 55 and nombre_coincide_catalogo)

        lista_odoo = LISTA_ODOO if en_lista_odoo else (LISTA_ODOO if catalogo_solo_email else "")
        nombre_en_lista = (
            odoo_contact["nombre"]
            if en_lista_odoo
            else (
                f"{odoo_contact['nombre']} (solo email, ≠ imagen)"
                if catalogo_solo_email and odoo_contact
                else ""
            )
        )

        ocr_name = ocr.get("name") or ""
        rfc = datos_img.get("rfcImagen") or parsed.get("rfc") or ""
        if ocr.get("match", {}).get("client"):
            old = ocr["match"]["client"]
            if not rfc and old.get("rfc"):
                rfc = old["rfc"]
        if not rfc_confiable(rfc, datos_img, ocr_text):
            rfc = ""
        hint = None
        if ocr.get("match", {}).get("client"):
            hint = ocr["match"]["client"].get("name")
            hint = EXCEL_ALIASES.get(hint.upper(), hint) if hint else None
        match_nombre = nombre_para_match_excel(
            tipo_ficha, empresa_asoc, nombre_contacto, nombre_base
        )
        excel_match, score = find_excel_match(
            match_nombre or nombre_contacto or titulo,
            rfc,
            excel,
            hint_name=hint if tipo_ficha == "empresa" else None,
        )
        if rfc:
            for ex in excel:
                if ex.get("rfc") and rfc_match(rfc, ex["rfc"]):
                    excel_match, score = ex, 98
                    break
        if tipo_ficha == "contacto_solo" and score < 90:
            excel_match, score = None, 0
        elif tipo_ficha == "contacto_empresa" and score < 78:
            excel_match, score = None, score
        if score < 65 and hint and tipo_ficha == "empresa":
            excel_match2, score2 = find_excel_match(hint, rfc, excel)
            if score2 > score:
                excel_match, score = excel_match2, score2

        sugerencia, sug_score = find_excel_match(
            " ".join(
                filter(
                    None,
                    [
                        parsed.get("empresaOdoo"),
                        parsed.get("person"),
                        ocr_name,
                        parsed.get("dominio", "").split(".")[0],
                    ],
                )
            ),
            rfc,
            excel,
        )
        rol, motivo = clasificar_registro(
            tipo_ficha,
            parsed,
            bool(ocr),
            excel_match["name"] if excel_match else None,
            empresa_asoc,
        )
        odoo.append(
            {
                "id": i,
                "file": fname,
                "img": f"SistemaContactos/CapturasOdoo/{fname}",
                "nombreContacto": nombre_contacto,
                "nombreBase": nombre_base,
                "contactoPersona": contacto_persona,
                "tituloOcr": titulo,
                "ocrName": ocr_name,
                "person": datos_img.get("personaImagen") or parsed.get("person", ""),
                "tipoFicha": tipo_ficha,
                "empresaAsociada": empresa_asoc,
                "empresaOdoo": empresa_asoc or datos_img.get("empresaImagen") or "",
                "displayName": nombre_contacto or datos_img.get("nombreLineaCompleta") or fname,
                "email": email,
                "tel": tel,
                "datosImagen": datos_img,
                "fuenteDatos": rastro_map[fname].get("fuente", "ocr") if fname in rastro_map else "ocr",
                "completitudImagen": datos_img.get("completitudImagen", 0),
                "nombreVerificado": datos_img.get("nombreVerificado", False),
                "nombreCoincideCatalogo": nombre_coincide_catalogo,
                "catalogoSoloEmail": catalogo_solo_email,
                "ubicacion": datos_img.get("ubicacionImagen", ""),
                "sitioWeb": datos_img.get("sitioWebImagen", ""),
                "direccion": datos_img.get("direccionImagen") or parsed.get("direccion", ""),
                "puesto": datos_img.get("puestoImagen") or parsed.get("puesto", ""),
                "rfc": datos_img.get("rfcImagen") or parsed.get("rfc", ""),
                "tipo": datos_img.get("tipoImagen") or parsed.get("tipo", ""),
                "dominio": datos_img.get("dominioImagen") or parsed.get("dominio", ""),
                "odooMatch": odoo_contact["nombre"] if odoo_contact else None,
                "odooMatchScore": odoo_score,
                "odooEmail": odoo_contact.get("email", "") if odoo_contact else "",
                "odooTel": odoo_contact.get("tel", "") if odoo_contact else "",
                "enListaOdoo": en_lista_odoo,
                "listaOdoo": lista_odoo,
                "nombreEnListaOdoo": nombre_en_lista,
                "enListaTabulador": False,
                "listaTabulador": "",
                "hasOcr": bool(ocr),
                "rol": rol,
                "motivo": motivo,
                "excelMatch": excel_match["name"] if excel_match else None,
                "matchScore": score,
                "excel": excel_match,
                "sugerenciaExcel": sugerencia["name"] if sugerencia else None,
                "sugerenciaScore": sug_score,
            }
        )

    for o in odoo:
        if o["matchScore"] < 55:
            o["excelMatch"] = None
            o["excel"] = None
        o["enListaTabulador"] = bool(o.get("excelMatch"))
        o["listaTabulador"] = LISTA_TABULADOR if o["enListaTabulador"] else ""

    tabulador_erp = build_tabulador_erp(excel, odoo)
    grouped = [
        {
            "excel": e["excel"],
            "contacts": e["contacts"],
            "contactCount": e["contactCount"],
            "gastos": e["gastos"],
        }
        for e in tabulador_erp["empresas"]
        if e["contactCount"] > 0
    ]

    matched = sum(1 for o in odoo if o["excelMatch"] and o["matchScore"] >= 70)
    sin_grupo = [o for o in odoo if not o["excelMatch"]]
    contactos = [o for o in odoo if o["rol"] == "contacto_cliente"]
    empresas_odoo = build_empresas_odoo(odoo, odoo_contacts)
    data = {
        "generated": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "odooCatalog": odoo_contacts,
        "stats": {
            "totalImages": len(odoo),
            "totalExcel": len(excel),
            "totalOdooExcel": len(odoo_contacts),
            "odooMatched55": sum(1 for o in odoo if o.get("odooMatchScore", 0) >= 55),
            "withOcr": sum(1 for o in odoo if o["hasOcr"]),
            "matched70": matched,
            "multiContactCompanies": sum(1 for g in grouped if g["contactCount"] > 1),
            "contactosVendedores": len(contactos),
            "fichasEmpresa": sum(1 for o in odoo if o["rol"] == "ficha_cliente"),
            "sinMatchExcel": len(sin_grupo),
            "pendienteOcr": sum(1 for o in odoo if o["rol"] == "pendiente_ocr"),
            "proveedoresOdoo": sum(
                1 for o in odoo if o["rol"] in ("proveedor_persona", "proveedor_rfc", "solo_odoo")
            ),
            "totalEmpresasOdoo": len(empresas_odoo),
            "empresasConVendedores": sum(1 for e in empresas_odoo if e["totalVendedores"] > 0),
            "tabuladorConCapturas": len(tabulador_erp["conCapturasOdoo"]),
            "tabuladorSinCapturas": len(tabulador_erp["sinCapturasOdoo"]),
            "odooSinTabulador": len(tabulador_erp["odooSinTabulador"]),
        },
        "contactos": contactos,
        "excel": excel,
        "odoo": odoo,
        "empresasOdoo": empresas_odoo,
        "tabuladorErp": tabulador_erp,
        "relacionErp": tabulador_erp["relacionErp"],
        "groups": grouped,
        "unmatched": sin_grupo,
    }
    OUT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    embed = ROOT / "datos_embebidos.js"
    embed.write_text(
        "window.DATOS_COMPARADOR = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"Excel: {len(excel)} | Imagenes: {len(odoo)} | OCR: {data['stats']['withOcr']}")
    print(f"Match >=70%: {matched} | Empresas con 2+ contactos: {data['stats']['multiContactCompanies']}")
    print(f"Empresas Odoo (filtro): {len(empresas_odoo)} | Con vendedores: {data['stats']['empresasConVendedores']}")
    print(
        f"Tabulador ERP: {len(excel)} empresas | Con capturas: {data['stats']['tabuladorConCapturas']} | "
        f"Sin captura: {data['stats']['tabuladorSinCapturas']} | Odoo sin tabulador: {data['stats']['odooSinTabulador']}"
    )
    print(f"Guardado: {OUT_FILE}")


if __name__ == "__main__":
    main()
