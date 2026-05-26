"""
Esquema de importación alineado con Laboratorio · Orden de reparación (SSEPI / taller).

Uso:
    from formato_laboratorio import empty_orden, migrar_desde_legacy, validar_orden
"""
from __future__ import annotations

import copy
import re
from typing import Any

FORMATO_VERSION = "laboratorio-1"
MAX_IMAGENES_REPORTE = 5

ETAPAS = [
    {"n": 1, "nombre": "Registrado", "clave": "registrado"},
    {"n": 2, "nombre": "Diagnóstico", "clave": "diagnostico"},
    {"n": 3, "nombre": "Esperando Cotización / Confirmación", "clave": "cotizacion"},
    {"n": 4, "nombre": "Reparación / Reparado", "clave": "reparacion"},
    {"n": 5, "nombre": "Entregado / Facturado", "clave": "entregado"},
]

ESTADO_A_ETAPA = [
    (re.compile(r"entregad|facturad", re.I), 5),
    (re.compile(r"reparad|listo", re.I), 4),
    (re.compile(r"en\s+reparaci|reparaci[oó]n", re.I), 4),
    (re.compile(r"confirmad|cotizaci|esperando\s+confirm", re.I), 3),
    (re.compile(r"diagn[oó]stic", re.I), 2),
    (re.compile(r"nuevo|registrad", re.I), 1),
]


def empty_etapas() -> list[dict]:
    return [
        {"n": e["n"], "nombre": e["nombre"], "fecha": "", "estado": "pendiente"}
        for e in ETAPAS
    ]


def _ya_migrado(row: dict) -> bool:
    if row.get("formato") != FORMATO_VERSION:
        return False
    if not isinstance(row.get("datos_recepcion"), dict):
        return False
    etapas = row.get("etapas") or []
    if len(etapas) != 5:
        return False
    ea = int(row.get("etapa_actual") or 1)
    if ea > 1:
        return True
    return any(e.get("estado") not in ("", "pendiente") for e in etapas)


def empty_orden(referencia: str = "") -> dict:
    return {
        "referencia_reparacion": referencia,
        "numero_orden_wh": "",
        "etapa_actual": 1,
        "etapas": empty_etapas(),
        "datos_recepcion": {
            "cliente": "",
            "marca": "",
            "serie": "",
            "condiciones": "",
            "equipo": "",
            "modelo": "",
            "falla": "",
        },
        "resumen_diagnostico": "",
        "notas_reparacion": "",
        "reporte_tecnico": "",
        "imagenes_reporte": [],
        "componentes_extras": [],
        "componentes_inventario": [],
        "componentes_compra": [],
        "consumibles_usados": [],
        "bitacora": {"notas": [], "registro": []},
        # Campos planos (OCR / exportación / compatibilidad)
        "estado_actual": "",
        "numero_orden": "",
        "tipo_orden": "",
        "cliente": "",
        "cliente_rfc": "",
        "equipo": "",
        "componente": "",
        "bajo_garantia": "",
        "fecha_ingreso": "",
        "fecha": "",
        "encargado": "",
        "vendedor": "",
        "materiales": "",
        "descripcion": "",
        "notas": "",
        "diagnostico": "",
        "solucion": "",
        "historial_actividad": "",
        "imagenes_erp": [],
        "imagenes_servicio": [],
        "archivos_pdf": [],
    }


def _s(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (int, float)):
        return str(v)
    return str(v).strip() if isinstance(v, str) else ""


def _lista(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def etapa_desde_estado(estado: str) -> int:
    s = _s(estado)
    if not s:
        return 1
    for pat, n in ESTADO_A_ETAPA:
        if pat.search(s):
            return n
    return 1


def aplicar_etapa(orden: dict, etapa: int, fecha: str = "", estado_etapa: str = "") -> None:
    etapa = max(1, min(5, int(etapa or 1)))
    orden["etapa_actual"] = etapa
    for e in orden.get("etapas") or []:
        n = e.get("n", 0)
        if n < etapa:
            e["estado"] = "completado"
        elif n == etapa:
            e["estado"] = estado_etapa or "en_curso"
            if fecha:
                e["fecha"] = fecha
        else:
            e["estado"] = "pendiente"


def _imagenes_reporte_desde(row: dict) -> list[str]:
    servicio = _lista(row.get("imagenes_servicio"))
    if servicio:
        return servicio[:MAX_IMAGENES_REPORTE]
    legacy = _lista(row.get("imagenes_reporte"))
    if legacy:
        return legacy[:MAX_IMAGENES_REPORTE]
    src = _lista(row.get("_source_images"))
    out = []
    for p in src:
        p = _s(p)
        if not p:
            continue
        if re.search(r"screenshot|captura|erp|odoo", p, re.I):
            continue
        if re.search(r"\.(jpe?g|png)$", p, re.I):
            out.append(p)
        if len(out) >= MAX_IMAGENES_REPORTE:
            break
    return out


def _texto_trabajo_realizado(row: dict) -> str:
    for key in ("resumen_diagnostico", "reporte_tecnico", "descripcion"):
        t = _s(row.get(key))
        if t:
            return t
    parts = [_s(row.get(k)) for k in ("notas", "diagnostico", "solucion") if _s(row.get(k))]
    return "\n\n".join(parts)


def _sync_planos_desde_anidado(orden: dict) -> None:
    rec = orden.get("datos_recepcion") or {}
    orden["cliente"] = _s(rec.get("cliente")) or _s(orden.get("cliente"))
    orden["equipo"] = _s(rec.get("equipo")) or _s(orden.get("equipo"))
    orden["componente"] = _s(orden.get("componente")) or _s(rec.get("modelo"))
    orden["numero_orden"] = _s(orden.get("numero_orden_wh")) or _s(orden.get("numero_orden"))
    if not orden.get("estado_actual") and orden.get("etapa_actual"):
        n = int(orden["etapa_actual"])
        for e in orden.get("etapas") or []:
            if e.get("n") == n:
                est = e.get("estado", "")
                orden["estado_actual"] = (
                    ETAPAS[n - 1]["nombre"] if est in ("en_curso", "pendiente", "") else est
                )
                break
    trabajo = _texto_trabajo_realizado(orden)
    if trabajo:
        orden["reporte_tecnico"] = trabajo
        if not orden.get("resumen_diagnostico"):
            orden["resumen_diagnostico"] = trabajo


def _sync_anidado_desde_planos(orden: dict) -> None:
    rec = orden.setdefault("datos_recepcion", empty_orden()["datos_recepcion"])
    if _s(orden.get("cliente")):
        rec["cliente"] = _s(orden["cliente"])
    if _s(orden.get("equipo")):
        rec["equipo"] = _s(orden["equipo"])
    if _s(orden.get("componente")) and not rec.get("modelo"):
        rec["modelo"] = _s(orden["componente"])
    if _s(orden.get("diagnostico")) and not rec.get("falla"):
        rec["falla"] = _s(orden["diagnostico"])
    wh = _s(orden.get("numero_orden_wh")) or _s(orden.get("numero_orden"))
    if wh:
        orden["numero_orden_wh"] = wh
    etapa = orden.get("etapa_actual")
    if not etapa and orden.get("estado_actual"):
        etapa = etapa_desde_estado(orden["estado_actual"])
    if not orden.get("etapas"):
        orden["etapas"] = empty_etapas()
    ea = int(etapa or 1)
    aplicar_etapa(orden, ea, _s(orden.get("fecha_ingreso")), "en_curso")
    if not _s(orden.get("estado_actual")):
        orden["estado_actual"] = ETAPAS[ea - 1]["nombre"]
    trabajo = _texto_trabajo_realizado(orden)
    if trabajo:
        orden["resumen_diagnostico"] = trabajo
        orden["reporte_tecnico"] = trabajo
    orden["imagenes_reporte"] = _imagenes_reporte_desde(orden)
    hist = _s(orden.get("historial_actividad"))
    if hist:
        reg = orden.setdefault("bitacora", {"notas": [], "registro": []})
        if isinstance(reg.get("registro"), list) and not reg["registro"]:
            reg["registro"] = [ln.strip() for ln in hist.split("\n") if ln.strip()]
    notas = _s(orden.get("notas_reparacion")) or _s(orden.get("notas"))
    if notas:
        orden["notas_reparacion"] = notas
        bit = orden.setdefault("bitacora", {"notas": [], "registro": []})
        if isinstance(bit.get("notas"), list) and not bit["notas"]:
            bit["notas"] = [notas]


def migrar_desde_legacy(row: dict) -> dict:
    """Convierte registro plano (scan/OCR) al formato laboratorio-1."""
    if not row:
        o = empty_orden()
        _sync_anidado_desde_planos(o)
        o["formato"] = FORMATO_VERSION
        return o
    if _ya_migrado(row):
        out = copy.deepcopy(row)
        _sync_planos_desde_anidado(out)
        out["imagenes_reporte"] = _imagenes_reporte_desde(out)
        return out

    ref = _s(row.get("referencia_reparacion"))
    out = empty_orden(ref)
    for k, v in row.items():
        if k.startswith("_"):
            out[k] = v
        elif k in out and k not in ("etapas", "datos_recepcion", "bitacora"):
            out[k] = v

    _sync_anidado_desde_planos(out)
    out["formato"] = FORMATO_VERSION
    return out


def validar_orden(orden: dict) -> list[str]:
    """Devuelve lista de errores; vacía = válido."""
    errs = []
    if orden.get("formato") != FORMATO_VERSION:
        errs.append("formato distinto de laboratorio-1")
    if not _s(orden.get("referencia_reparacion")):
        errs.append("falta referencia_reparacion")
    rec = orden.get("datos_recepcion")
    if not isinstance(rec, dict):
        errs.append("datos_recepcion debe ser objeto")
    etapas = orden.get("etapas")
    if not isinstance(etapas, list) or len(etapas) != 5:
        errs.append("etapas debe tener 5 elementos")
    ea = orden.get("etapa_actual")
    if ea is not None and not (1 <= int(ea) <= 5):
        errs.append("etapa_actual fuera de rango 1-5")
    imgs = orden.get("imagenes_reporte")
    if imgs is not None and len(_lista(imgs)) > MAX_IMAGENES_REPORTE:
        errs.append(f"imagenes_reporte max {MAX_IMAGENES_REPORTE}")
    for extra in _lista(orden.get("componentes_extras")):
        if not isinstance(extra, dict):
            errs.append("componente_extra invalido")
            break
        for fld in ("nombre", "descripcion", "cantidad", "costo_unitario", "subtotal"):
            if fld not in extra:
                errs.append(f"componentes_extras falta {fld}")
                break
    return errs
