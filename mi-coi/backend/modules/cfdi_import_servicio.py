# backend/modules/cfdi_import_servicio.py
"""Importación CFDI 4.0, vinculación UUID, reportes y conciliación básica vs pólizas."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "backend",
            "database",
            "contabilidad.db",
        )


def _root_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _local(tag: str) -> str:
    if not tag:
        return ""
    return tag.split("}", 1)[-1]


def _find_first(root: ET.Element, local_name: str) -> Optional[ET.Element]:
    for el in root.iter():
        if _local(el.tag) == local_name:
            return el
    return None


def _tiene_complemento(root: ET.Element, nombre: str) -> bool:
    n = nombre.lower()
    for el in root.iter():
        t = _local(el.tag).lower()
        if n in t:
            return True
    return False


def _f_attr(el: Optional[ET.Element], name: str, default: float = 0.0) -> float:
    if el is None:
        return default
    try:
        return float(str(el.get(name) or "0").replace(",", ""))
    except (TypeError, ValueError):
        return default


def _parse_impuestos_totales(comp: ET.Element) -> Tuple[float, float]:
    """Suma Traslados/Retenciones a nivel Comprobante (si existen)."""
    tras = 0.0
    ret = 0.0
    imp = _find_first(comp, "Impuestos")
    if imp is None:
        return tras, ret
    for el in imp:
        loc = _local(el.tag)
        if loc == "Traslados":
            for t in el:
                if _local(t.tag) == "Traslado":
                    tras += _f_attr(t, "Importe")
        elif loc == "Retenciones":
            for t in el:
                if _local(t.tag) == "Retencion":
                    ret += _f_attr(t, "Importe")
    return round(tras, 2), round(ret, 2)


def _parse_nomina_desglose(root: ET.Element) -> Dict[str, float]:
    nom = _find_first(root, "Nomina")
    out: Dict[str, float] = {
        "nomina_total_percepciones": 0.0,
        "nomina_total_deducciones": 0.0,
        "nomina_total_otros_pagos": 0.0,
        "nomina_isr": 0.0,
        "nomina_imss_trabajador": 0.0,
        "nomina_imss_patron": 0.0,
    }
    if nom is None:
        return out
    tot = _find_first(nom, "Totales")
    if tot is not None:
        out["nomina_total_percepciones"] = _f_attr(tot, "TotalPercepciones")
        out["nomina_total_deducciones"] = _f_attr(tot, "TotalDeducciones")
        out["nomina_total_otros_pagos"] = _f_attr(tot, "TotalOtrosPagos")
        out["nomina_imss_patron"] = _f_attr(tot, "TotalCuotasPatronales")
    ded_block = _find_first(nom, "Deducciones")
    if ded_block is not None:
        for el in ded_block:
            if _local(el.tag) != "Deduccion":
                continue
            tipo = (el.get("TipoDeduccion") or "").strip()
            imp = _f_attr(el, "Importe")
            if tipo == "002":
                out["nomina_isr"] += imp
            elif tipo == "001":
                out["nomina_imss_trabajador"] += imp
    return out


def _parse_pago20_lineas(root: ET.Element) -> Tuple[float, List[Dict[str, Any]]]:
    """MontoTotalPagos y filas por DoctoRelacionado (Pago20)."""
    monto_hdr = 0.0
    lineas: List[Dict[str, Any]] = []
    for el in root.iter():
        if _local(el.tag) != "Pago":
            continue
        monto_hdr = max(monto_hdr, _f_attr(el, "MontoTotalPagos"))
        for sub in el:
            if _local(sub.tag) != "DoctoRelacionado":
                continue
            lineas.append(
                {
                    "uuid_relacionado": (sub.get("IdDocumento") or "").strip(),
                    "imp_pagado": _f_attr(sub, "ImpPagado"),
                    "imp_saldo_ant": _f_attr(sub, "ImpSaldoAnt"),
                    "parcialidad": (sub.get("NumParcialidad") or "").strip(),
                }
            )
    if not lineas and monto_hdr > 0:
        lineas.append({"uuid_relacionado": "", "imp_pagado": monto_hdr, "imp_saldo_ant": 0.0, "parcialidad": ""})
    return monto_hdr, lineas


def parse_cfdi40_xml(xml_str: str) -> Dict[str, Any]:
    """Parse CFDI 4.0; complementos Nomina12 / Pago20 y campos fiscales frecuentes."""
    root = ET.fromstring(xml_str)
    comp = _find_first(root, "Comprobante") or root
    comp_tag = comp.tag or ""
    version = (comp.get("Version") or "").strip()
    tcomp = ((comp.get("TipoDeComprobante") or "I").strip() or "I")[:1].upper()
    metodo = (comp.get("MetodoPago") or "").strip().upper()
    try:
        subtotal = float(str(comp.get("SubTotal") or "0").replace(",", ""))
    except ValueError:
        subtotal = 0.0
    try:
        total = float(str(comp.get("Total") or "0").replace(",", ""))
    except ValueError:
        total = 0.0
    em = _find_first(comp, "Emisor")
    re = _find_first(comp, "Receptor")
    tfd = _find_first(comp, "TimbreFiscalDigital") or _find_first(root, "TimbreFiscalDigital")
    uuid = (tfd.get("UUID") or "").strip()[:36] if tfd is not None else ""
    fecha = (comp.get("Fecha") or "")[:10]
    iva_tras, iva_ret = _parse_impuestos_totales(comp)
    iva_est = max(0.0, round(total - subtotal, 2))
    if iva_tras > 0:
        iva_est = iva_tras
    nomina = tcomp == "N" or _tiene_complemento(root, "nomina")
    pago = tcomp == "P" or _tiene_complemento(root, "pago")
    sello = (comp.get("Sello") or "").strip()
    nom_des = _parse_nomina_desglose(root) if nomina else {}
    monto_pagos, lineas_pago = _parse_pago20_lineas(root) if pago else (0.0, [])

    out: Dict[str, Any] = {
        "version": version,
        "comprobante_xml_ns": comp_tag,
        "serie": (comp.get("Serie") or "").strip(),
        "folio": (comp.get("Folio") or "").strip(),
        "lugar_expedicion": (comp.get("LugarExpedicion") or "").strip(),
        "exportacion": (comp.get("Exportacion") or "").strip(),
        "no_certificado": (comp.get("NoCertificado") or "").strip(),
        "sello_cfdi": sello,
        "sello_cfdi_preview": sello[-8:] if len(sello) >= 8 else sello,
        "tipo_comprobante": tcomp,
        "metodo_pago": metodo,
        "forma_pago": (comp.get("FormaPago") or "").strip(),
        "fecha": fecha,
        "subtotal": subtotal,
        "total": total,
        "iva_estimado": iva_est,
        "iva_trasladado_xml": iva_tras,
        "iva_retenido_xml": iva_ret,
        "moneda": (comp.get("Moneda") or "MXN").upper(),
        "uuid": uuid,
        "rfc_emisor": (em.get("Rfc") or em.get("RFC") or "").strip() if em is not None else "",
        "rfc_receptor": (re.get("Rfc") or re.get("RFC") or "").strip() if re is not None else "",
        "nombre_receptor": (re.get("Nombre") or "").strip() if re is not None else "",
        "nombre_emisor": (em.get("Nombre") or "").strip() if em is not None else "",
        "complemento_nomina": nomina,
        "complemento_pago": pago,
        "pago_monto_total": monto_pagos,
        "pago_documentos": lineas_pago,
        "xml_raw": xml_str,
    }
    out.update(nom_des)
    return out


def validar_cfdi40_estructura(parsed: Dict[str, Any]) -> Tuple[bool, str]:
    if not parsed.get("uuid"):
        return False, "Falta TimbreFiscalDigital / UUID."
    ver = (parsed.get("version") or "").strip()
    if ver and not ver.startswith("4"):
        return False, f"Versión Comprobante no es 4.0 (es {ver}). Revise el XML."
    if parsed.get("tipo_comprobante") not in ("I", "E", "N", "P", "T"):
        return False, f"TipoDeComprobante no reconocido: {parsed.get('tipo_comprobante')}"
    ns = (parsed.get("comprobante_xml_ns") or "")
    if ns and "cfd/4" not in ns and "cfdi/4" not in ns.lower():
        return False, "El Comprobante no parece ser CFDI 4.0 (namespace / versión)."
    return True, "OK"


def cargar_mapeo_cuentas() -> Dict[str, Any]:
    path = os.path.join(_root_dir(), "backend", "data", "cfdi_mapeo_cuentas.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"por_clave": {}}


def _clave_mapeo(parsed: Dict[str, Any]) -> str:
    t = parsed.get("tipo_comprobante") or "I"
    if t == "N" or parsed.get("complemento_nomina"):
        return "N"
    if t == "P" or parsed.get("complemento_pago"):
        return "P"
    if t == "E":
        m = (parsed.get("metodo_pago") or "PUE").upper()
        return f"E_{m}" if m in ("PUE", "PPD") else "E_PUE"
    m = (parsed.get("metodo_pago") or "PUE").upper()
    if m not in ("PUE", "PPD"):
        m = "PUE"
    return f"I_{m}"


def sugerir_movimientos_poliza(parsed: Dict[str, Any], mapeo: Optional[Dict[str, Any]] = None) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    Devuelve (movimientos, tipo_poliza, motivo_si_vacio).
    Si no hay mapeo, movimientos=[] y motivo explica.
    """
    mapeo = mapeo or cargar_mapeo_cuentas()
    por = mapeo.get("por_clave") or {}
    clave = _clave_mapeo(parsed)
    cfg = por.get(clave) or por.get("I_PUE")
    if not cfg:
        return [], "DIARIO", "sin_mapeo"
    tipo_pol = str(cfg.get("tipo_poliza") or "DIARIO").upper()
    total = float(parsed.get("total") or 0)
    subtotal = float(parsed.get("subtotal") or 0)
    iva = float(parsed.get("iva_estimado") or 0)
    uuid = parsed.get("uuid") or ""
    rfc_r = parsed.get("rfc_receptor") or ""
    nom_r = parsed.get("nombre_receptor") or ""
    fecha = parsed.get("fecha") or datetime.now().strftime("%Y-%m-%d")
    cliente = {"cliente_rfc": rfc_r or None, "cliente_nombre": nom_r or None}
    base_cfdi = {
        "uuid": uuid,
        "rfc_emisor": parsed.get("rfc_emisor"),
        "rfc_receptor": rfc_r,
        "fecha_cfdi": fecha[:10],
        "subtotal": subtotal,
        "iva_trasladado": iva if iva > 0 else None,
        "total_cfdi": total,
        "tipo_comprobante": parsed.get("tipo_comprobante"),
        "metodo_pago": parsed.get("metodo_pago"),
        "forma_pago": parsed.get("forma_pago"),
        "xml_raw": parsed.get("xml_raw"),
    }

    movs: List[Dict[str, Any]] = []
    t = parsed.get("tipo_comprobante") or "I"

    if t == "N" or parsed.get("complemento_nomina"):
        # Percepciones, deducciones ISR/IMSS y por pagar; cuadre al Total del comprobante (neto típico).
        c_per = str(cfg.get("cuenta_sueldos") or "601")
        c_pp = str(cfg.get("cuenta_por_pagar_nomina") or "201")
        c_isr = str(cfg.get("cuenta_isr_retenido") or "206")
        c_imss_t = str(cfg.get("cuenta_imss_trabajador") or "206")
        c_imss_p = str(cfg.get("cuenta_imss_patron") or "605")
        perc = float(parsed.get("nomina_total_percepciones") or 0)
        if perc <= 0:
            perc = total
        ded_tot = float(parsed.get("nomina_total_deducciones") or 0)
        isr = float(parsed.get("nomina_isr") or 0)
        imss_t = float(parsed.get("nomina_imss_trabajador") or 0)
        imss_p = float(parsed.get("nomina_imss_patron") or 0)
        otros_d = max(0.0, round(ded_tot - isr - imss_t, 2))
        net = round(total, 2)
        movs = [
            {
                "num_cuenta": c_per,
                "concepto": f"Percepciones nómina {uuid[:8]}…",
                "cargo": round(perc, 2),
                "abono": 0.0,
                **cliente,
                **base_cfdi,
            }
        ]
        if imss_p > 0.01:
            movs.append(
                {
                    "num_cuenta": c_imss_p,
                    "concepto": f"IMSS patronal {uuid[:8]}…",
                    "cargo": round(imss_p, 2),
                    "abono": 0.0,
                    **cliente,
                }
            )
        if isr > 0.01:
            movs.append(
                {
                    "num_cuenta": c_isr,
                    "concepto": f"ISR retenido {uuid[:8]}…",
                    "cargo": 0.0,
                    "abono": round(isr, 2),
                    **cliente,
                }
            )
        if imss_t > 0.01:
            movs.append(
                {
                    "num_cuenta": c_imss_t,
                    "concepto": f"IMSS obrero {uuid[:8]}…",
                    "cargo": 0.0,
                    "abono": round(imss_t, 2),
                    **cliente,
                }
            )
        if otros_d > 0.01:
            movs.append(
                {
                    "num_cuenta": c_pp,
                    "concepto": f"Otras deducciones {uuid[:8]}…",
                    "cargo": 0.0,
                    "abono": round(otros_d, 2),
                    **cliente,
                }
            )
        movs.append(
            {
                "num_cuenta": c_pp,
                "concepto": f"Por pagar nómina (neto) {uuid[:8]}…",
                "cargo": 0.0,
                "abono": net,
                **cliente,
            }
        )
        sc = sum(float(m.get("cargo") or 0) for m in movs)
        sa = sum(float(m.get("abono") or 0) for m in movs)
        if abs(sc - sa) > 0.03:
            adj = round(sa - sc, 2)
            movs[0]["cargo"] = round(float(movs[0].get("cargo") or 0) + adj, 2)
        return movs, tipo_pol, ""

    if t == "P" or parsed.get("complemento_pago"):
        c_b = str(cfg.get("cuenta_banco") or "102")
        c_cp = str(cfg.get("cuenta_cliente_proveedor") or "115")
        docs = list(parsed.get("pago_documentos") or [])
        if docs:
            tot_p = round(sum(float(d.get("imp_pagado") or 0) for d in docs), 2)
            if tot_p <= 0:
                tot_p = round(total, 2)
            movs = [
                {
                    "num_cuenta": c_b,
                    "concepto": f"Pago bancos {uuid[:8]}…",
                    "cargo": tot_p,
                    "abono": 0.0,
                    **cliente,
                    **base_cfdi,
                }
            ]
            for i, d in enumerate(docs):
                ip = round(float(d.get("imp_pagado") or 0), 2)
                if ip <= 0:
                    continue
                uid_rel = (d.get("uuid_relacionado") or "")[:8]
                movs.append(
                    {
                        "num_cuenta": c_cp,
                        "concepto": f"Aplica doc {uid_rel or i+1}… Pago {uuid[:8]}",
                        "cargo": 0.0,
                        "abono": ip,
                        **cliente,
                    }
                )
            sc = sum(float(m.get("cargo") or 0) for m in movs)
            sa = sum(float(m.get("abono") or 0) for m in movs)
            if abs(sc - sa) > 0.03 and movs:
                dif = round(sc - sa, 2)
                movs[-1]["abono"] = round(float(movs[-1].get("abono") or 0) + dif, 2)
            return movs, tipo_pol, ""
        movs = [
            {
                "num_cuenta": c_b,
                "concepto": f"Complemento pago {uuid[:8]}…",
                "cargo": round(total, 2),
                "abono": 0.0,
                **cliente,
                **base_cfdi,
            },
            {
                "num_cuenta": c_cp,
                "concepto": f"Aplicación PPD {uuid[:8]}…",
                "cargo": 0.0,
                "abono": round(total, 2),
                **cliente,
            },
        ]
        return movs, tipo_pol, ""

    if t == "E":
        cg = str(cfg.get("cuenta_gasto") or "501")
        iva_c = str(cfg.get("cuenta_iva_acreditable") or "118")
        if (parsed.get("metodo_pago") or "").upper() == "PPD":
            c_ab = str(cfg.get("cuenta_proveedor") or "201")
        else:
            c_ab = str(cfg.get("cuenta_abono_banco") or "102")
        movs.append(
            {
                "num_cuenta": cg,
                "concepto": f"Compra/Gasto CFDI {uuid[:8]}…",
                "cargo": round(subtotal, 2),
                "abono": 0.0,
                **cliente,
                **base_cfdi,
            }
        )
        if iva > 0:
            movs.append(
                {
                    "num_cuenta": iva_c,
                    "concepto": f"IVA acreditable {uuid[:8]}…",
                    "cargo": round(iva, 2),
                    "abono": 0.0,
                    **cliente,
                }
            )
        movs.append(
            {
                "num_cuenta": c_ab,
                "concepto": f"Contrapartida CFDI {uuid[:8]}…",
                "cargo": 0.0,
                "abono": round(total, 2),
                **cliente,
            }
        )
        return movs, tipo_pol, ""

    # Ingreso I
    c_ing = str(cfg.get("cuenta_ingresos") or "401")
    c_iva = str(cfg.get("cuenta_iva_trasladado") or "208")
    if cfg.get("usar_banco_en_cargo"):
        c_car = str(cfg.get("cuenta_cargo") or "102")
    else:
        c_car = str(cfg.get("cuenta_cargo") or "115")
    movs.append(
        {
            "num_cuenta": c_car,
            "concepto": f"Cobro CFDI {uuid[:8]}…",
            "cargo": round(total, 2),
            "abono": 0.0,
            **cliente,
            **base_cfdi,
        }
    )
    movs.append(
        {
            "num_cuenta": c_ing,
            "concepto": f"Ingreso CFDI {uuid[:8]}…",
            "cargo": 0.0,
            "abono": round(subtotal, 2),
            **cliente,
        }
    )
    if iva > 0:
        movs.append(
            {
                "num_cuenta": c_iva,
                "concepto": f"IVA trasladado {uuid[:8]}…",
                "cargo": 0.0,
                "abono": round(iva, 2),
                **cliente,
            }
        )
    return movs, tipo_pol, ""


def previsualizar_importacion(xml_str: str) -> Dict[str, Any]:
    """Parse, valida y sugiere partidas sin escribir en BD."""
    try:
        parsed = parse_cfdi40_xml(xml_str)
    except Exception as e:
        return {"exito": False, "error": f"XML inválido: {e}"}
    ok, msg = validar_cfdi40_estructura(parsed)
    movs, tipo_pol, sin_map = sugerir_movimientos_poliza(parsed)
    clave = _clave_mapeo(parsed)
    motivo = sin_map if not movs else ""
    return {
        "exito": True,
        "parsed": parsed,
        "ok_validacion": ok,
        "mensaje_validacion": msg,
        "movimientos_sugeridos": movs,
        "tipo_poliza_sugerido": tipo_pol,
        "clave_mapeo": clave,
        "motivo_sin_mapeo": motivo,
        "xml_str": xml_str,
    }


def uuid_en_cfdi_poliza(uuid: str, db_path: Optional[str] = None) -> bool:
    u = (uuid or "").strip()
    if not u:
        return False
    db_path = db_path or get_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM cfdi_poliza WHERE TRIM(LOWER(uuid)) = TRIM(LOWER(?)) LIMIT 1", (u,))
            return cur.fetchone() is not None
    except Exception:
        return False


def importar_xml_a_poliza_captura(
    xml_str: str,
    *,
    db_path: Optional[str] = None,
    usuario_captura: Optional[str] = None,
) -> Dict[str, Any]:
    """Valida CFDI, sugiere partidas, crea póliza en Captura (C) con xml_raw en cfdi_poliza."""
    db_path = db_path or get_db_path()
    try:
        parsed = parse_cfdi40_xml(xml_str)
    except Exception as e:
        return {"exito": False, "error": f"XML inválido: {e}"}
    ok, msg = validar_cfdi40_estructura(parsed)
    if not ok:
        return {"exito": False, "error": msg}
    uid = parsed["uuid"]
    if uuid_en_cfdi_poliza(uid, db_path):
        return {"exito": False, "error": f"UUID duplicado en sistema: {uid}", "uuid": uid, "codigo": "UUID_DUPLICADO"}
    movs, tipo_pol, sin_map = sugerir_movimientos_poliza(parsed)
    if not movs:
        return {
            "exito": False,
            "error": "No hay mapeo de cuentas para este tipo de CFDI. Revise backend/data/cfdi_mapeo_cuentas.json",
            "uuid": uid,
            "codigo": "SIN_MAPEO",
            "parsed": parsed,
        }
    concepto = f"CFDI {tipo_pol} {uid[:13]}… {parsed.get('nombre_receptor') or ''}"[:200]
    try:
        from backend.models.polizas import SistemaPolizas

        pol = SistemaPolizas(db_path=db_path)
        r = pol.crear_poliza(
            tipo_pol,
            parsed.get("fecha") or datetime.now().strftime("%Y-%m-%d"),
            concepto,
            movs,
            moneda=parsed.get("moneda") or "MXN",
            tipo_cambio=1.0,
            estatus="C",
            usuario_captura=(usuario_captura or "").strip() or None,
        )
        if r.get("exito"):
            return {
                "exito": True,
                "poliza_id": r.get("poliza_id"),
                "numero_poliza": r.get("numero_poliza"),
                "uuid": uid,
                "tipo_poliza": tipo_pol,
                "clave_mapeo": _clave_mapeo(parsed),
            }
        return {"exito": False, "error": r.get("error"), "uuid": uid}
    except Exception as e:
        return {"exito": False, "error": str(e), "uuid": uid}


def procesar_carpeta_xml(
    carpeta: str,
    *,
    db_path: Optional[str] = None,
    usuario_captura: Optional[str] = None,
) -> Dict[str, Any]:
    """Procesa .xml en carpeta. Estadísticas: ok, uuid_duplicado, sin_mapeo, error_parse, errores_otros."""
    db_path = db_path or get_db_path()
    stats: Dict[str, Any] = {
        "ok": 0,
        "uuid_duplicado": 0,
        "sin_mapeo": 0,
        "error_parse": 0,
        "errores_otros": 0,
        "detalle": [],
    }
    if not os.path.isdir(carpeta):
        return {"exito": False, "error": "Carpeta inválida", "stats": stats}
    for fname in sorted(os.listdir(carpeta)):
        if not fname.lower().endswith(".xml"):
            continue
        path = os.path.join(carpeta, fname)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                xml_str = f.read()
        except Exception as e:
            stats["error_parse"] += 1
            stats["detalle"].append({"archivo": fname, "resultado": "ERROR_LECTURA", "mensaje": str(e)})
            continue
        try:
            r = importar_xml_a_poliza_captura(xml_str, db_path=db_path, usuario_captura=usuario_captura)
        except Exception as e:
            stats["errores_otros"] += 1
            stats["detalle"].append({"archivo": fname, "resultado": "ERROR", "mensaje": str(e)})
            continue
        if r.get("exito"):
            stats["ok"] += 1
            stats["detalle"].append({"archivo": fname, "resultado": "OK", "uuid": r.get("uuid"), "poliza": r.get("numero_poliza")})
        else:
            cod = r.get("codigo") or ""
            if cod == "UUID_DUPLICADO" or "duplicado" in (r.get("error") or "").lower():
                stats["uuid_duplicado"] += 1
                stats["detalle"].append({"archivo": fname, "resultado": "UUID_DUPLICADO", "mensaje": r.get("error")})
            elif cod == "SIN_MAPEO" or "mapeo" in (r.get("error") or "").lower():
                stats["sin_mapeo"] += 1
                stats["detalle"].append({"archivo": fname, "resultado": "SIN_MAPEO", "mensaje": r.get("error")})
            elif "inválido" in (r.get("error") or "") or "XML" in (r.get("error") or ""):
                stats["error_parse"] += 1
                stats["detalle"].append({"archivo": fname, "resultado": "ERROR_XML", "mensaje": r.get("error")})
            else:
                stats["errores_otros"] += 1
                stats["detalle"].append({"archivo": fname, "resultado": "ERROR", "mensaje": r.get("error")})
    return {"exito": True, "stats": stats}


def consultar_estatus_uuid_sat_html(uuid: str, rfc_emisor: str, rfc_receptor: str, total: float, sello_cfdi: str) -> Dict[str, Any]:
    """
    Consulta heurística vía portal VerificaCFDI (HTML). No reemplaza el servicio web oficial con FIEL.
    """
    try:
        import requests
    except ImportError:
        return {"exito": False, "error": "Instale requests para consultar el SAT."}
    url = ""
    try:
        from backend.modules.cfdi_pdf import build_sat_qr_url

        data = {
            "uuid": uuid,
            "emisor_rfc": rfc_emisor,
            "receptor_rfc": rfc_receptor,
            "total": str(total),
            "sello_cfdi": sello_cfdi or "",
        }
        url = build_sat_qr_url(data)
    except Exception:
        tt = f"{float(total):.6f}"
        fe = (sello_cfdi or "")[-8:] if len(sello_cfdi or "") >= 8 else ""
        url = (
            f"https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?"
            f"id={uuid}&re={rfc_emisor}&rr={rfc_receptor}&tt={tt}&fe={fe}"
        )
    try:
        r = requests.get(url, timeout=25, headers={"User-Agent": "COI-Client/1.0"})
        raw = r.text or ""
        text = raw.lower()
        fecha_cancel: Optional[str] = None
        for pat in (
            r"fecha\s+de\s+cancelaci[oó]n[:\s]*(\d{1,2}/\d{1,2}/\d{4})",
            r"cancelaci[oó]n[:\s]*(\d{4}-\d{2}-\d{2})",
            r"(\d{4}-\d{2}-\d{2})\s*cancel",
        ):
            m = re.search(pat, raw, re.I)
            if m:
                fecha_cancel = m.group(1).strip()
                break
        est = "DESCONOCIDO"
        if "no se encontr" in text or "no encontró" in text or "no existe el cfdi" in text:
            est = "POSIBLE_NO_EXISTE"
        elif "cancelado" in text or "cancelación" in text or "cancelada" in text:
            est = "POSIBLE_CANCELADO"
        elif "vigente" in text:
            est = "POSIBLE_VIGENTE"
        return {
            "exito": True,
            "estatus": est,
            "estatus_heuristico": est,
            "fecha_cancelacion": fecha_cancel,
            "http_status": r.status_code,
            "url_consulta": url,
            "nota": "Consulta pública VerificaCFDI (no certificada). Confirme en el portal SAT o con su PAC si es crítico.",
        }
    except Exception as e:
        return {"exito": False, "error": str(e), "url_consulta": url}


def desvincular_cfdi_por_id(id_cfdi_poliza: int, db_path: Optional[str] = None) -> Dict[str, Any]:
    from backend.models.polizas import SistemaPolizas

    return SistemaPolizas(db_path=db_path).desvincular_cfdi(int(id_cfdi_poliza))


def reporte_cfdis_vinculados_periodo(fecha_ini: str, fecha_fin: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    db_path = db_path or get_db_path()
    out: List[Dict[str, Any]] = []
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cfdi_tablero'")
            tiene_tab = cur.fetchone() is not None
            if tiene_tab:
                sql = """
                SELECT c.id_cfdi_poliza, c.uuid, c.total_cfdi, c.rfc_emisor, c.rfc_receptor,
                       c.tipo_comprobante, p.id AS poliza_id, p.numero_poliza, p.tipo_poliza,
                       p.fecha, UPPER(COALESCE(p.estatus,'')) AS estatus,
                       COALESCE(tb.estado_comprobante, '') AS estado_tablero,
                       pp.numero_linea
                FROM cfdi_poliza c
                JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                JOIN polizas p ON p.id = pp.id_poliza
                LEFT JOIN cfdi_tablero tb
                  ON TRIM(LOWER(COALESCE(tb.uuid,''))) = TRIM(LOWER(COALESCE(c.uuid,'')))
                WHERE p.fecha BETWEEN ? AND ?
                ORDER BY p.fecha, p.tipo_poliza, p.numero_poliza
                """
            else:
                sql = """
                SELECT c.id_cfdi_poliza, c.uuid, c.total_cfdi, c.rfc_emisor, c.rfc_receptor,
                       c.tipo_comprobante, p.id AS poliza_id, p.numero_poliza, p.tipo_poliza,
                       p.fecha, UPPER(COALESCE(p.estatus,'')) AS estatus,
                       '' AS estado_tablero, pp.numero_linea
                FROM cfdi_poliza c
                JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                JOIN polizas p ON p.id = pp.id_poliza
                WHERE p.fecha BETWEEN ? AND ?
                ORDER BY p.fecha, p.tipo_poliza, p.numero_poliza
                """
            cur.execute(sql, (fecha_ini, fecha_fin))
            for r in cur.fetchall():
                row = dict(r)
                et = (row.get("estado_tablero") or "").strip()
                ep = (row.get("estatus") or "").strip()
                row["estatus_display"] = f"Póliza:{ep}" + (f" | Tablero:{et}" if et else "")
                out.append(row)
    except Exception:
        pass
    return out


def reporte_cfdis_tablero_sin_vincular(
    ejercicio: int,
    mes: int,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """CFDI en cfdi_tablero del periodo sin fila en cfdi_poliza."""
    db_path = db_path or get_db_path()
    out: List[Dict[str, Any]] = []
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cfdi_tablero'")
            if not cur.fetchone():
                return []
            cur.execute(
                """
                SELECT t.uuid,
                       substr(COALESCE(NULLIF(t.fecha_cfdi,''), t.fecha_timbrado),1,10) AS fecha,
                       t.rfc_emisor, t.rfc_receptor, COALESCE(t.total,0) AS total,
                       t.tipo_cfdi
                FROM cfdi_tablero t
                LEFT JOIN cfdi_poliza c ON TRIM(LOWER(COALESCE(c.uuid,''))) = TRIM(LOWER(COALESCE(t.uuid,'')))
                WHERE c.id_cfdi_poliza IS NULL
                  AND CAST(strftime('%Y', substr(COALESCE(NULLIF(t.fecha_cfdi,''), t.fecha_timbrado),1,10)) AS INTEGER) = ?
                  AND CAST(strftime('%m', substr(COALESCE(NULLIF(t.fecha_cfdi,''), t.fecha_timbrado),1,10)) AS INTEGER) = ?
                  AND TRIM(COALESCE(t.uuid,'')) <> ''
                ORDER BY fecha
                """,
                (int(ejercicio), int(mes)),
            )
            hoy = datetime.now().date()
            for r in cur.fetchall():
                row = dict(r)
                try:
                    fd = datetime.strptime((row.get("fecha") or "")[:10], "%Y-%m-%d").date()
                    row["dias_sin_vincular"] = (hoy - fd).days
                except Exception:
                    row["dias_sin_vincular"] = None
                out.append(row)
    except Exception:
        pass
    return out


def reporte_polizas_afectadas_sin_cfdi(fecha_ini: str, fecha_fin: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    db_path = db_path or get_db_path()
    out: List[Dict[str, Any]] = []
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT p.id, p.fecha, p.tipo_poliza, p.numero_poliza, p.concepto
                FROM polizas p
                WHERE UPPER(COALESCE(p.estatus,'')) = 'A'
                  AND p.fecha BETWEEN ? AND ?
                  AND NOT EXISTS (
                    SELECT 1 FROM partidas_poliza pp
                    INNER JOIN cfdi_poliza c ON c.id_partida = pp.id_partida
                    WHERE pp.id_poliza = p.id
                  )
                ORDER BY p.fecha, p.numero_poliza
                """,
                (fecha_ini, fecha_fin),
            )
            for r in cur.fetchall():
                out.append(dict(r))
    except Exception:
        pass
    return out


def conciliar_montos_poliza_cfdi(poliza_id: int, *, tolerancia: float = 0.01, db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Compara la suma de total_cfdi de vínculos vs la suma de importes MN de partidas vinculadas
    (max(cargo_mn, abono_mn) por línea) y añade detalle por UUID si alguna línea no cuadra.
    """
    db_path = db_path or get_db_path()
    tol = abs(float(tolerancia))
    alertas: List[str] = []
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT c.uuid, c.total_cfdi, pp.cargo_mn, pp.abono_mn, pp.cargo, pp.abono, pp.tipo_cambio
                FROM cfdi_poliza c
                JOIN partidas_poliza pp ON pp.id_partida = c.id_partida
                WHERE pp.id_poliza = ?
                """,
                (int(poliza_id),),
            )
            rows = cur.fetchall()
            suma_cfdi = 0.0
            suma_part = 0.0
            for r in rows:
                tc = float(r["total_cfdi"] or 0)
                suma_cfdi += tc
                cm = float(r["cargo_mn"] if r["cargo_mn"] is not None else (float(r["cargo"] or 0) * float(r["tipo_cambio"] or 1)))
                am = float(r["abono_mn"] if r["abono_mn"] is not None else (float(r["abono"] or 0) * float(r["tipo_cambio"] or 1)))
                ref = cm if cm >= am else am
                suma_part += ref
                if abs(tc - ref) > tol:
                    alertas.append(f"UUID {(r['uuid'] or '')[:8]}… CFDI {tc:,.2f} vs partida {ref:,.2f}")
            if rows and abs(suma_cfdi - suma_part) > tol:
                alertas.insert(
                    0,
                    f"Suma CFDIs {suma_cfdi:,.2f} vs suma partidas vinculadas {suma_part:,.2f}",
                )
        from backend.models.polizas import SistemaPolizas

        pol = SistemaPolizas(db_path=db_path)
        pol.actualizar_alerta_cfdi_poliza(int(poliza_id), "; ".join(alertas) if alertas else None)
        return {"exito": True, "poliza_id": poliza_id, "cuadre_ok": len(alertas) == 0, "alertas": alertas}
    except Exception as e:
        return {"exito": False, "error": str(e)}


def conciliar_periodo_polizas_afectadas(ejercicio: int, mes: int, db_path: Optional[str] = None) -> Dict[str, Any]:
    fi = f"{ejercicio}-{mes:02d}-01"
    if mes == 12:
        ff = f"{ejercicio}-12-31"
    else:
        from datetime import date, timedelta

        ult = (date(ejercicio, mes + 1, 1) - timedelta(days=1)).day
        ff = f"{ejercicio}-{mes:02d}-{ult}"
    db_path = db_path or get_db_path()
    res = {"procesadas": 0, "con_alerta": 0, "ok": 0}
    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT DISTINCT p.id FROM polizas p
                INNER JOIN partidas_poliza pp ON pp.id_poliza = p.id
                INNER JOIN cfdi_poliza c ON c.id_partida = pp.id_partida
                WHERE UPPER(COALESCE(p.estatus,'')) = 'A' AND p.fecha BETWEEN ? AND ?
                """,
                (fi, ff),
            )
            ids = [int(x[0]) for x in cur.fetchall()]
        for pid in ids:
            r = conciliar_montos_poliza_cfdi(pid, db_path=db_path)
            res["procesadas"] += 1
            if r.get("cuadre_ok"):
                res["ok"] += 1
            else:
                res["con_alerta"] += 1
        return {"exito": True, **res}
    except Exception as e:
        return {"exito": False, "error": str(e)}


def descarga_sat_buzon_stub() -> Dict[str, Any]:
    """Texto de ayuda para flujo híbrido (sin SOAP FIEL en COI)."""
    return {
        "exito": True,
        "modo": "hibrido",
        "mensaje": (
            "Descargue los XML con el SAT (descarga masiva u otra herramienta) y use «Indexar carpeta» "
            "para registrarlos en el tablero CFDI. COI no envía credenciales FIEL al SAT en esta versión."
        ),
    }


def indexar_carpeta_buzon_en_tablero(
    carpeta: str,
    *,
    db_path: Optional[str] = None,
    proveedor: str = "BUZON_SAT",
    recursive: bool = False,
    max_depth: int = 5,
    copiar_a_facturas: bool = False,
) -> Dict[str, Any]:
    """Indexa XML de una carpeta en cfdi_tablero (flujo buzón híbrido)."""
    from backend.modules.cfdi_dashboard import CFDIDashboard

    dash = CFDIDashboard(db_path=db_path or get_db_path())
    return dash.indexar_carpeta_externa(
        carpeta,
        proveedor=proveedor,
        recursive=recursive,
        max_depth=max_depth,
        copiar_a_facturas=copiar_a_facturas,
    )
