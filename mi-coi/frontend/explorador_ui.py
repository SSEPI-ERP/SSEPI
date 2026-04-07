# -*- coding: utf-8 -*-
"""UI helpers para la barra de explorador superior (estilo Aspel COI, pero con símbolos propios).

La idea es replicar la *función* (agrupación visual + accesos) sin copiar íconos propietarios.
Aquí usamos abreviaturas y símbolos tipográficos consistentes.
"""

from __future__ import annotations

from typing import Dict


# Símbolos propios (texto corto) para tiles del explorador.
# Primera línea del botón (arriba del título corto).
SIMBOLOS_EXPLORADOR: Dict[str, str] = {
    # Integraciones
    "cfd_csd": "CFG",
    "cfdi_xml": "XML",
    "timbradas": "DIR",
    "clientes": "RFC",
    "cfdi_local": "CFD",
    "deposito": "DOC",
    # Módulos
    "catalogo": "CTA",
    "monedas": "MXN",
    "polizas": "POL",
    "bancos": "BAN",
    "cfdi": "TAB",
    "balanza": "BAL",
    "resultados": "RES",
    "balance": "BGE",
    "activos": "AFI",
    "sat": "SAT",
    "reportes": "RPT",
    "flujo": "FJO",
}


def simbolo_explorador(key: str, fallback: str = "•") -> str:
    k = (key or "").strip()
    return SIMBOLOS_EXPLORADOR.get(k, fallback)


def texto_separador(titulo: str) -> str:
    t = (titulo or "").strip().upper() or "SECCIÓN"
    return f"— {t} —"

