# -*- coding: utf-8 -*-
"""
Reglas manuales para capturas Odoo sin fila en tabulador.
1 = columna Nombre (limpiada)
2 = Sugerencia tabulador
Texto libre = nombre definido (opcional sufijo (empresa) o (vendedor))
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

ORDEN_IDS: list[int] = [
    1, 2, 3, 4, 5, 6, 7, 11, 16, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53, 55,
    56, 57, 58, 59, 60, 61, 62, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
    79, 80, 81, 82, 84, 85, 86, 87, 89, 90, 91, 92, 93, 95, 96, 99, 100, 101,
    102, 105, 106, 107, 108, 109, 110, 111, 114, 117, 118, 119, 120, 121, 122,
    123, 124, 125, 126, 127, 128, 132, 133, 134, 135, 136, 137, 139,
]

# Reglas 1/2 por fila (104). Fila 16 = basura OCR → "1".
_REGLAS_FILA: list[str] = [
    "1", "1", "2", "1", "1", "1", "1", "1", "1", "1", "1", "1", "2", "1", "1", "1",
    "1", "1", "1", "1", "1", "1", "1", "1", "2", "2", "1", "1", "1",
    "1", "1", "1", "1", "1", "1", "1", "1", "2", "1", "1", "1", "1", "1", "1", "1",
    "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "2",
    "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1",
    "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1",
    "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1",
]

# Nombre literal visible en la captura (titulo de la ficha Odoo).
NOMBRE_LITERAL_BY_ID: dict[int, str] = {
    26: "DOMUM",
    27: "Ariel Diaz",
}

# Nombres definidos manualmente (captura por id).
MANUAL_BY_ID: dict[int, str] = {
    26: "DOMUM",
    27: "Ariel Diaz",
    29: "Demo technicS. de RL.de W. Leon",
    30: "Demo technic Leon",
    31: "Lic. Blanca Vanesa",
    32: "EBAY",
    43: "Envases Plasticos del centro SA de CV",
    52: "Granos y Servicios Integrales SA de CV",
    69: "IK Plastic",
    75: "Javier Cruz",
    79: "Laura Elena Ramirez Perez",
    80: "Marq",
    84: "MARQUARDT MEXIVO",
    93: "NHK",
    107: "Productos Industriales de Leon SA de CV",
    114: "Ramiro",
    119: "Aron Garcia",
    120: "SEPPI",
    122: "Daniel zuniga",
    123: "Ivan Gutierrez",
    127: "SUCOM/ Suministros y Control en Movimiento",
    128: "Soluciones Industriales Tau-phi SA de CV",
    132: "TACSA",
    133: "Delfino Ortega",
    134: "Torno",
    136: "Triple M",
    137: "Teneria Vargas SA de CV",
}

PERSONA_FIXES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\ba+a+r+o+n\b", re.I), "Aron"),
    (re.compile(r"\bdaniel\s+zu[nñ][ií]g\w*", re.I), "Daniel Zuñiga"),
    (re.compile(r"\blaura\s+elena\s+ram[ií]rez\s+p[eé]rez\b", re.I), "Laura Elena Ramírez Pérez"),
    (re.compile(r"\bivan\s+gut[ií]errez\b", re.I), "Ivan Gutierrez"),
    (re.compile(r"\bjavier\s+cruz\b", re.I), "Javier Cruz"),
    (re.compile(r"\bdelfino\s+ortega\b", re.I), "Delfino Ortega"),
    (re.compile(r"^da\s+ariel\s+diaz\b", re.I), "Ariel Diaz"),
    (re.compile(r"\bariel\s+diaz\b", re.I), "Ariel Diaz"),
]

MANUAL_CANON: dict[str, tuple[str, str]] = {
    "arieldiaz": ("Ariel Diaz", "vendedor"),
    "domum": ("DOMUM", "empresa"),
    "demotechnicleon": ("Demo Technic León", "empresa"),
    "licblancavanesa": ("Lic. Blanca Vanesa", "vendedor"),
    "demotechnicsderldecv": ("Demo Technic S. de R.L. de C.V.", "empresa"),
    "demotechnicsderldeleon": ("Demo Technic S. de R.L. de C.V.", "empresa"),
    "ebay": ("EBAY", "empresa"),
    "envasesplasticosdelcentrosadecv": (
        "Envases Plásticos del Centro, S.A. de C.V.",
        "empresa",
    ),
    "granosyserviciosintegralessadecv": (
        "Granos y Servicios Integrales, S.A. de C.V.",
        "empresa",
    ),
    "ikplastic": ("IK Plastic Compound México, S.A. de C.V.", "empresa"),
    "ivangutierrez": ("Ivan Gutierrez", "vendedor"),
    "javiercruz": ("Javier Cruz", "vendedor"),
    "lauraelenaramirezperez": ("Laura Elena Ramírez Pérez", "vendedor"),
    "marq": ("MARQ", "empresa"),
    "marquardtmexivo": ("MARQUARDT MÉXICO", "empresa"),
    "nhk": ("NHK Spring México", "empresa"),
    "productosindustrialesdeleonsadecv": (
        "Productos Industriales de León, S.A. de C.V.",
        "empresa",
    ),
    "ramiro": ("Ramiro", "vendedor"),
    "seppi": ("SSEPI", "empresa"),
    "arongarcia": ("Aron Garcia", "vendedor"),
    "danielzuniga": ("Daniel Zuñiga", "vendedor"),
    "sucomsuministrosycontrolenmovimiento": (
        "SUCOM / Suministros y Control en Movimiento",
        "empresa",
    ),
    "solucionesindustrialestauphisadecv": (
        "Soluciones Industriales Tau-phi, S.A. de C.V.",
        "empresa",
    ),
    "tacsa": ("TACSA", "empresa"),
    "delfinoortega": ("Delfino Ortega", "vendedor"),
    "torno": ("Tornomaster", "empresa"),
    "triplem": ("Triple M", "empresa"),
    "teneriavargassadecv": ("Tenería Vargas, S.A. de C.V.", "empresa"),
}

GARBAGE_UI = re.compile(
    r"enviar mensaje|registrar una nota|whatsapp|contacto creado|agregar contacto|"
    r"persona o e|contactos vc|contactos ventas|^\+\d|calle \d|clie mah",
    re.I,
)

EMPRESA_CANON: dict[str, str] = {
    "aybeuroservicios": "A Y B EUROSERVICIOS",
    "agelectronica": "AG ELECTRÓNICA",
    "automatichetechnikmexico": "AUTOMATISCHE TECHNIK MEXICO",
    "bigbenuniformes": "BIG BEN UNIFORMES",
    "brendaiselamartinezmorales": "Brenda Isela Martínez Morales",
    "componentesdeleon": "Componentes de León, S.A. de C.V.",
    "centrodeinvestigacionencomputoaplicado": (
        "Centro de Investigación en Cómputo Aplicado, S.A. de C.V."
    ),
    "cristiansanluis": "Cristian san luis",
    "distribuidoraliverpool": "DISTRIBUIDORA LIVERPOOL",
    "dmtcortesuniversales": "DMT CORTES UNIVERSALES",
    "donpulcro": "DON PULCRO",
    "ecsa": "ARCOSA",
    "elki": "EIKI",
    "estaciondeserviciolashuertas": "Estación de Servicio Las Huertas, S.A. de C.V.",
    "euroelectrica": "EUROELÉCTRICA",
    "fantasiasmiguel": "FANTASÍAS MIGUEL",
    "grupoamigosdesanangel": "GRUPO AMIGOS DE SAN ÁNGEL",
    "grupocomercialczocarnavallia": "GRUPO COMERCIAL CZO CARNAVALLIA",
    "grupoplasmaautomation": "Grupo Plasma Automation, S.A. de C.V.",
    "gustavonassergonzalez": "Gustavo Nasser González",
    "estgranosyserviciosintegrales": "Granos y Servicios Integrales, S.A. de C.V.",
    "hallaluminium": "HALL ALUMINIUM",
    "homedepotmexico": "HOME DEPOT MÉXICO",
    "hospedajepotosinoinmobiliaria": "HOSPEDAJE POTOSINO INMOBILIARIA",
    "ht6ingenieriasderldecv": "HT6 INGENIERÍA S. de R.L. de C.V.",
    "hebillasyherrajesrobor": "Hebillas y Herrajes Robor, S.A. de C.V.",
    "hieloregia": "HIELO REGIA",
    "iceman": "ICEMAN",
    "institutomexicanodelsegurosocial": "INSTITUTO MEXICANO DEL SEGURO SOCIAL",
    "itxretailmexico": "ITX RETAIL MÉXICO",
    "industriasfivax": "Industrias Fivax",
    "lamaneradeestarsegurosegma": "LA MANERA DE ESTAR SEGURO SEG-MA",
    "miguelangelgarciasantacruz": "Miguel Ángel García Santacruz",
    "mouserelectronics": "MOUSER ELECTRONICS",
    "mdelektronikdemexico": "MD Elektronik de México",
    "nikedemexico": "NIKE DE MÉXICO",
    "nuevawalmartdemexico": "NUEVA WAL MART DE MÉXICO",
    "odotechnologies": "ODOO TECHNOLOGIES",
    "officedepotdemexico": "OFFICE DEPOT DE MÉXICO",
    "oscarramirezmoreno": "Óscar Ramírez Moreno",
    "polimerosyderivados": "Polímeros y Derivados",
    "prefabricadoradelosas": "Prefabricadora de Losas",
    "reddecarreterasdeoccidente": "RED DE CARRETERAS DE OCCIDENTE",
    "renatoguzmanmunoz": "Renato Guzmán Muñoz",
    "ricardosilvestremendezcaldera": "Ricardo Silvestre Méndez Caldera",
    "scotiabankinverlat": "SCOTIABANK INVERLAT",
    "seiviernolbertomoranfernandez": "Seivier Nolberto Morán Fernández",
    "arturomore": "Arturo Moreno",
    "arturomoreno": "Arturo Moreno",
    "ssepi": "SSEPI",
    "seroccorrugados": "Seroc Corrugados",
    "serviacerocomercial": "Serviacero Comercial",
    "rezatacsa": "REZA TACSA",
    "misaelalejandromorenomendez": "Misael Alejandro Moreno Méndez",
    "volkerbrunksanchez": "Volker Brunk Sánchez",
    "almasalcido": "Alma salcido",
    "anamoreno": "Ana Moreno",
    "eduardoamezcua": "Eduardo Amezcua",
    "mauriciosantiago": "Mauricio Santiago",
    "ingurielpadilla": "Ing. Uriel Padilla",
    "mariadelucia": "María Delucia",
    "ingeduardotorres": "Ing. Eduardo Torres",
    "jorgevillanueva": "Jorge Villanueva",
    "jonathanfalcon": "Jonathan Falcón",
    "juanbujanda": "Juan Bujanda",
    "victorgarnica": "Victor Garnica",
    "misaelmoreno": "Misael Moreno",
    "milsacproductosindustrialesdeleon": "Productos Industriales de León, S.A. de C.V.",
    "sitemesdetuberioie": "Sistemas de Tuberías IE, S.A. de C.V.",
}


def _regla_para_id(oid: int) -> str:
    if oid in MANUAL_BY_ID:
        return MANUAL_BY_ID[oid]
    try:
        idx = ORDEN_IDS.index(oid)
    except ValueError:
        return "1"
    return _REGLAS_FILA[idx] if idx < len(_REGLAS_FILA) else "1"


def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)


def _titulo(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _fix_persona(s: str) -> str:
    t = _titulo(s)
    for pat, repl in PERSONA_FIXES:
        t = pat.sub(repl, t)
    return t


def _strip_ocr_prefix(n: str) -> str:
    n = _titulo(n)
    if re.match(r"^[A-Z]\s+[A-Z]\s", n):
        n = re.sub(r"^[A-Z]\s+", "", n, count=1)
    for px in (
        "Le ", "Cc ", "EST ", "pre ", "Ns ", "SE ", "UT ", "ENE ", "BE ", "EN ",
        "OP ", "Ic ", "MI ", "s ", "a ", "B ", "D ", "E ", "G ", "H ", "F ", "U ", "A ",
    ):
        if n.startswith(px) and len(n) > len(px) + 2:
            return n[len(px) :].strip(" .,-—_|")
    return n.strip(" .,-—_|")


def _parece_empresa(n: str) -> bool:
    if re.search(
        r"\b(S\.?\s*A|S\.?\s*DE\s*R\.?\s*L|DE\s+C\.?\s*V|ELECTR|EUROSERV|MEXICO|"
        r"UNIFORMES|DEPOT|BANK|TECHNOLOG|INDUSTRI|GRUPO|SERVIC|COMPONENTES)\b",
        n,
        re.I,
    ):
        return True
    words = n.split()
    return len(words) >= 3 and sum(1 for w in words if w.isupper() or w.istitle()) >= 2


def _es_basura(n: str) -> bool:
    if not n or len(n) < 3:
        return True
    if GARBAGE_UI.search(n):
        return True
    letters = sum(c.isalpha() for c in n)
    if letters < max(3, len(n) * 0.35):
        return True
    if re.search(r"ce ne|ce i|ombre de|novo ce|ic i|coors ce", n, re.I):
        return True
    return False


def _mejor_nombre_captura(entry: dict) -> str:
    limpio = _limpiar_nombre_columna(entry)
    if limpio and not _es_basura(limpio):
        return limpio
    for src in (
        entry.get("odooMatch"),
        entry.get("empresaAsociada"),
        (entry.get("datosImagen") or {}).get("nombreLineaCompleta"),
        (entry.get("datosImagen") or {}).get("nombreEnImagen"),
    ):
        s = _strip_ocr_prefix(_titulo(src or ""))
        if s and not _es_basura(s):
            if entry.get("id") == 5:
                return "Aaron Garcia"
            return _fix_persona(s) if len(s.split()) <= 4 and not _parece_empresa(s) else s
    return limpio


def _limpiar_nombre_columna(entry: dict) -> str:
    raw = _titulo(entry.get("nombreContacto") or entry.get("contactoPersona") or "")
    if GARBAGE_UI.search(raw):
        raw = _titulo(
            entry.get("empresaAsociada")
            or entry.get("odooMatch")
            or entry.get("datosImagen", {}).get("nombreLineaCompleta")
            or ""
        )
    raw = _strip_ocr_prefix(raw)
    if entry.get("id") == 5:
        return "Aaron Garcia"
    if entry.get("id") == 32 and entry.get("empresaAsociada"):
        return _titulo(entry["empresaAsociada"])
    return _fix_persona(raw) if raw else ""


def _empresa_desde_nombre(nombre: str, entry: dict) -> str:
    n = _strip_ocr_prefix(_titulo(nombre))
    key = _norm_key(n)
    if key in EMPRESA_CANON:
        return EMPRESA_CANON[key]
    if _parece_empresa(n) and "sadecv" not in key and not re.search(
        r"S\.?\s*A|S\.?\s*DE\s*R\.?\s*L", n, re.I
    ):
        if len(n) > 12:
            return _titulo(n) + ", S.A. de C.V."
    return _titulo(n)


def _parse_manual(regla: str) -> tuple[str, str] | None:
    t = _titulo(regla)
    m = re.match(r"^(.+?)\s*\((empresa|vendedor)\)\s*$", t, re.I)
    if m:
        base = _titulo(m.group(1))
        tipo = m.group(2).lower()
        k = _norm_key(base)
        if k in MANUAL_CANON:
            return MANUAL_CANON[k]
        if tipo == "empresa":
            return f"{base}, S.A. de C.V.", tipo
        return base, tipo
    k = _norm_key(t)
    if k in MANUAL_CANON:
        return MANUAL_CANON[k]
    return None


def resolver_nombre_definido(entry: dict, regla: str) -> dict[str, Any]:
    regla = _titulo(regla)
    sugerencia = _titulo(entry.get("sugerenciaExcel") or "")
    tipo_ficha = entry.get("tipoFicha") or ""
    oid = entry.get("id")

    if regla == "1":
        fuente = "nombre"
        limpio = _mejor_nombre_captura(entry)
        if tipo_ficha == "contacto_empresa":
            persona = _fix_persona(entry.get("contactoPersona") or limpio)
            empresa = _empresa_desde_nombre(entry.get("empresaAsociada") or limpio, entry)
            if persona and not GARBAGE_UI.search(persona) and not _parece_empresa(persona):
                nombre, tipo = persona, "vendedor"
            else:
                nombre, tipo = empresa or _empresa_desde_nombre(limpio, entry), "empresa"
        elif tipo_ficha == "empresa" or _parece_empresa(limpio):
            nombre = _empresa_desde_nombre(limpio or entry.get("odooMatch") or "", entry)
            tipo = "empresa"
        elif oid == 102 and entry.get("empresaAsociada"):
            nombre, tipo = _titulo(entry["empresaAsociada"]), "empresa"
        else:
            nombre, tipo = limpio, "vendedor"
    elif regla == "2":
        fuente = "sugerencia"
        nombre, tipo = sugerencia, "empresa"
    else:
        fuente = "manual"
        parsed = _parse_manual(regla)
        if parsed:
            nombre, tipo = parsed
        else:
            nombre, tipo = _titulo(regla), "empresa"

    if tipo == "vendedor":
        nombre = _fix_persona(nombre)

    return {
        "nombreDefinido": nombre or "—",
        "nombreDefinidoTipo": tipo,
        "reglaFuente": fuente,
        "reglaOriginal": regla,
    }


def nombre_literal_imagen(entry: dict) -> str:
    """Titulo legible en la captura (no basura OCR de direccion/UI)."""
    oid = entry.get("id")
    if oid in NOMBRE_LITERAL_BY_ID:
        return NOMBRE_LITERAL_BY_ID[oid]

    di = entry.get("datosImagen") or {}
    tipo_img = (di.get("tipoImagen") or entry.get("tipo") or "").lower()
    persona = _strip_ocr_prefix(
        di.get("contactoPersona") or di.get("personaImagen") or entry.get("person") or ""
    )
    titulo = _strip_ocr_prefix(
        di.get("nombreEnImagen") or entry.get("nombreContacto") or entry.get("tituloOcr") or ""
    )

    if tipo_img == "persona" and persona and not _es_basura(persona):
        limpio = _fix_persona(re.sub(r"^[A-Z]{1,2}\s+", "", persona))
        if limpio and not _parece_empresa(limpio):
            return limpio

    if titulo and not _es_basura(titulo):
        if _parece_empresa(titulo) or tipo_img == "empresa":
            return _empresa_desde_nombre(titulo, entry)
        return _fix_persona(titulo)

    if entry.get("odooMatch"):
        base = _titulo(str(entry["odooMatch"]).split(",")[0])
        if base and not _es_basura(base):
            return base

    return _mejor_nombre_captura(entry) or titulo or "—"


def aplicar_reglas_odoo_sin(odoo_sin: list[dict]) -> list[dict]:
    out = []
    for entry in odoo_sin:
        regla = _regla_para_id(entry.get("id"))
        extra = resolver_nombre_definido(entry, regla)
        row = dict(entry)
        row.update(extra)
        row["nombreLiteralImagen"] = nombre_literal_imagen(row)
        out.append(row)
    return out
