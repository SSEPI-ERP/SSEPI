# Códigos de tipo de operación DIOT (por cuenta) — lista centralizada para UI y validación.
# Referencia: códigos usados en declaraciones informativas de operaciones con terceros.

from typing import List, Tuple

DIOT_OPERACIONES: Tuple[Tuple[str, str], ...] = (
    ("03", "Proveedor nacional — Prestación de servicios profesionales"),
    ("06", "Arrendamiento"),
    ("07", "Otros"),
    ("08", "Adquisición de bienes"),
    ("85", "Otros (compras / operaciones no clasificadas)"),
    ("04", "Honorarios asimilados a salarios"),
    ("05", "Arrendamiento en copropiedad"),
)

def diot_opciones_display() -> List[str]:
    return [f"{c} - {n}" for c, n in DIOT_OPERACIONES]

def diot_label_para_codigo(codigo: str) -> str:
    c = (codigo or "").strip()
    for code, name in DIOT_OPERACIONES:
        if code == c:
            return f"{code} - {name}"
    return diot_opciones_display()[0]
