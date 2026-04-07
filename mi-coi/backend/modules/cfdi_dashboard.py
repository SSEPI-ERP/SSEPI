import json
import os
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path
except ImportError:
    def get_db_path():
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, "backend", "database", "contabilidad.db")


class CFDIDashboard:
    """Tablero CFDI local + diario de operaciones con análisis periódico."""

    def __init__(self, db_path: Optional[str] = None, project_root: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self.project_root = project_root or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.facturas_dir = os.path.join(self.project_root, "facturas_timbradas")
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS cfdi_tablero (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE,
                    fecha_cfdi TEXT,
                    fecha_timbrado TEXT,
                    rfc_emisor TEXT,
                    nombre_emisor TEXT,
                    rfc_receptor TEXT,
                    nombre_receptor TEXT,
                    folio TEXT,
                    moneda TEXT,
                    subtotal REAL DEFAULT 0,
                    total REAL DEFAULT 0,
                    status_sat TEXT DEFAULT 'TIMBRADO_LOCAL',
                    proveedor TEXT DEFAULT '',
                    xml_path TEXT,
                    pdf_path TEXT,
                    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS diario_operaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
                    categoria TEXT,
                    severidad TEXT,
                    mensaje TEXT,
                    referencia TEXT
                )
                """
            )
            conn.commit()
            for col_sql in (
                "ALTER TABLE cfdi_tablero ADD COLUMN serie TEXT DEFAULT ''",
                "ALTER TABLE cfdi_tablero ADD COLUMN tipo_cfdi TEXT DEFAULT 'I'",
                "ALTER TABLE cfdi_tablero ADD COLUMN version_cfdi TEXT DEFAULT ''",
                "ALTER TABLE cfdi_tablero ADD COLUMN estado_comprobante TEXT DEFAULT 'SIN_VALIDAR'",
                "ALTER TABLE cfdi_tablero ADD COLUMN efos_estado TEXT DEFAULT 'NINGUNO'",
                "ALTER TABLE cfdi_tablero ADD COLUMN en_contabilidad INTEGER DEFAULT 0",
            ):
                try:
                    cur.execute(col_sql)
                    conn.commit()
                except sqlite3.OperationalError:
                    pass

    def _find_first(self, root: ET.Element, contains: str) -> Optional[ET.Element]:
        for el in root.iter():
            if el.tag and contains in el.tag:
                return el
        return None

    def _parse_xml(self, xml_path: str) -> Optional[Dict]:
        try:
            with open(xml_path, "r", encoding="utf-8") as f:
                xml_str = f.read()
            root = ET.fromstring(xml_str)
            comp = self._find_first(root, "Comprobante") or root
            em = self._find_first(comp, "Emisor")
            re = self._find_first(comp, "Receptor")
            tfd = self._find_first(comp, "TimbreFiscalDigital") or self._find_first(root, "TimbreFiscalDigital")

            uuid_ = (tfd.get("UUID") if tfd is not None else "") or ""
            fecha_tim = (tfd.get("FechaTimbrado") if tfd is not None else "") or ""
            fecha_cfdi = (comp.get("Fecha") or "")[:19]
            folio = (comp.get("Folio") or "").strip()
            serie = (comp.get("Serie") or "").strip()
            subtotal = float((comp.get("SubTotal") or "0").replace(",", ""))
            total = float((comp.get("Total") or "0").replace(",", ""))
            moneda = (comp.get("Moneda") or "MXN").strip().upper()
            tipo_cfdi = ((comp.get("TipoDeComprobante") or "I").strip() or "I")[:1].upper()
            version_cfdi = (comp.get("Version") or "").strip() or "3.3"
            rfc_em = (em.get("Rfc") if em is not None else "") or ""
            nom_em = (em.get("Nombre") if em is not None else "") or ""
            rfc_re = (re.get("Rfc") if re is not None else "") or (re.get("RFC") if re is not None else "") or ""
            nom_re = (re.get("Nombre") if re is not None else "") or ""
            pdf = os.path.join(self.facturas_dir, f"Factura_{uuid_[:36]}.pdf") if uuid_ else ""
            estado_comp = "SIN_VALIDAR"
            if uuid_:
                estado_comp = "VIGENTE_LOCAL"
            # Cancelación (complemento en XML): heurística por nombre de etiqueta
            if any((el.tag or "").endswith("Cancelacion") for el in root.iter()):
                estado_comp = "CANCELADO_LOCAL"
            return {
                "uuid": uuid_.strip(),
                "fecha_cfdi": fecha_cfdi.replace("T", " "),
                "fecha_timbrado": fecha_tim.replace("T", " "),
                "rfc_emisor": rfc_em.strip(),
                "nombre_emisor": nom_em.strip(),
                "rfc_receptor": rfc_re.strip(),
                "nombre_receptor": nom_re.strip(),
                "folio": folio,
                "serie": serie,
                "moneda": moneda,
                "subtotal": subtotal,
                "total": total,
                "tipo_cfdi": tipo_cfdi,
                "version_cfdi": version_cfdi,
                "estado_comprobante": estado_comp,
                "status_sat": "TIMBRADO_LOCAL" if uuid_ else "SIN_UUID",
                "xml_path": xml_path,
                "pdf_path": pdf if pdf and os.path.isfile(pdf) else "",
            }
        except Exception:
            return None

    def _upsert_parsed(self, cur: sqlite3.Cursor, parsed: Dict, proveedor: str, fallback_name: str) -> Tuple[int, str]:
        """Inserta o actualiza un CFDI parseado. Devuelve (insertados_o_0, actualizados_o_0) como uno de los dos=1."""
        parsed = dict(parsed)
        serie = parsed.get("serie") or ""
        tipo_cfdi = parsed.get("tipo_cfdi") or "I"
        version_cfdi = parsed.get("version_cfdi") or ""
        estado_comp = parsed.get("estado_comprobante") or "SIN_VALIDAR"
        uuid_key = (parsed.get("uuid") or "").strip()
        if not uuid_key:
            uuid_key = f"SIN-UUID-{fallback_name}"
        cur.execute("SELECT id FROM cfdi_tablero WHERE uuid = ?", (uuid_key,))
        row = cur.fetchone()
        if row:
            cur.execute(
                """
                UPDATE cfdi_tablero
                SET fecha_cfdi = ?, fecha_timbrado = ?, rfc_emisor = ?, nombre_emisor = ?,
                    rfc_receptor = ?, nombre_receptor = ?, folio = ?, serie = ?, moneda = ?,
                    subtotal = ?, total = ?, tipo_cfdi = ?, version_cfdi = ?, estado_comprobante = ?,
                    status_sat = ?, proveedor = ?, xml_path = ?, pdf_path = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                """,
                (
                    parsed["fecha_cfdi"], parsed["fecha_timbrado"], parsed["rfc_emisor"], parsed["nombre_emisor"],
                    parsed["rfc_receptor"], parsed["nombre_receptor"], parsed["folio"], serie, parsed["moneda"],
                    parsed["subtotal"], parsed["total"], tipo_cfdi, version_cfdi, estado_comp,
                    parsed["status_sat"], proveedor, parsed["xml_path"], parsed["pdf_path"], row[0],
                ),
            )
            return 0, 1
        cur.execute(
            """
            INSERT INTO cfdi_tablero (
                uuid, fecha_cfdi, fecha_timbrado, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor,
                folio, serie, moneda, subtotal, total, tipo_cfdi, version_cfdi, estado_comprobante,
                status_sat, proveedor, xml_path, pdf_path, efos_estado, en_contabilidad
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NINGUNO', 0)
            """,
            (
                uuid_key,
                parsed["fecha_cfdi"], parsed["fecha_timbrado"], parsed["rfc_emisor"], parsed["nombre_emisor"],
                parsed["rfc_receptor"], parsed["nombre_receptor"], parsed["folio"], serie, parsed["moneda"],
                parsed["subtotal"], parsed["total"], tipo_cfdi, version_cfdi, estado_comp,
                parsed["status_sat"], proveedor, parsed["xml_path"], parsed["pdf_path"],
            ),
        )
        return 1, 0

    def sync_from_folder(self, proveedor: str = "") -> Dict[str, int]:
        if not os.path.isdir(self.facturas_dir):
            return {"leidos": 0, "insertados": 0, "actualizados": 0}
        leidos = 0
        insertados = 0
        actualizados = 0
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            for name in os.listdir(self.facturas_dir):
                if not name.lower().endswith(".xml"):
                    continue
                parsed = self._parse_xml(os.path.join(self.facturas_dir, name))
                if not parsed:
                    continue
                leidos += 1
                ins, upd = self._upsert_parsed(cur, parsed, proveedor, name)
                insertados += ins
                actualizados += upd
            conn.commit()
        return {"leidos": leidos, "insertados": insertados, "actualizados": actualizados}

    def _iter_xml_files(self, folder: str, recursive: bool, max_depth: int, depth: int = 0) -> List[str]:
        out: List[str] = []
        if not os.path.isdir(folder):
            return out
        try:
            names = sorted(os.listdir(folder))
        except OSError:
            return out
        for name in names:
            path = os.path.join(folder, name)
            if os.path.isdir(path):
                if recursive and depth < max_depth:
                    out.extend(self._iter_xml_files(path, recursive, max_depth, depth + 1))
            elif name.lower().endswith(".xml") and os.path.isfile(path):
                out.append(path)
        return out

    def indexar_carpeta_externa(
        self,
        carpeta: str,
        *,
        proveedor: str = "BUZON_SAT",
        recursive: bool = False,
        max_depth: int = 5,
        copiar_a_facturas: bool = False,
    ) -> Dict[str, Any]:
        """Recorre una carpeta (opcional recursiva), parsea CFDI y hace upsert en cfdi_tablero."""
        res: Dict[str, Any] = {
            "exito": False,
            "leidos": 0,
            "insertados": 0,
            "actualizados": 0,
            "errores": 0,
            "uuid_en_poliza": 0,
            "detalle_error": [],
        }
        carpeta = os.path.abspath(carpeta or "")
        if not os.path.isdir(carpeta):
            res["error"] = "Carpeta inválida."
            return res
        paths = self._iter_xml_files(carpeta, recursive, max_depth)
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cfdi_poliza'")
            tiene_cfdi_poliza = cur.fetchone() is not None
            for path in paths:
                res["leidos"] += 1
                dest = path
                if copiar_a_facturas:
                    os.makedirs(self.facturas_dir, exist_ok=True)
                    base = os.path.basename(path)
                    dest = os.path.join(self.facturas_dir, base)
                    try:
                        import shutil

                        shutil.copy2(path, dest)
                    except OSError as e:
                        res["errores"] += 1
                        res["detalle_error"].append({"archivo": path, "error": str(e)})
                        continue
                parsed = self._parse_xml(dest)
                if not parsed:
                    res["errores"] += 1
                    res["detalle_error"].append({"archivo": dest, "error": "No se pudo parsear CFDI"})
                    continue
                uid = (parsed.get("uuid") or "").strip()
                if tiene_cfdi_poliza and uid and not uid.startswith("SIN-UUID"):
                    cur.execute(
                        "SELECT 1 FROM cfdi_poliza WHERE TRIM(LOWER(uuid)) = TRIM(LOWER(?)) LIMIT 1",
                        (uid,),
                    )
                    if cur.fetchone():
                        res["uuid_en_poliza"] += 1
                try:
                    ins, upd = self._upsert_parsed(cur, parsed, proveedor, os.path.basename(dest))
                    res["insertados"] += ins
                    res["actualizados"] += upd
                except Exception as e:
                    res["errores"] += 1
                    res["detalle_error"].append({"archivo": dest, "error": str(e)})
            conn.commit()
        res["exito"] = True
        return res

    def indexar_carpeta_externa_por_rango(
        self,
        carpeta: str,
        *,
        desde_ymd: str,
        hasta_ymd: str,
        proveedor: str = "SERVICIO_INTERNO",
        recursive: bool = False,
        max_depth: int = 5,
        copiar_a_facturas: bool = False,
    ) -> Dict[str, Any]:
        """
        Igual que indexar_carpeta_externa pero filtra por fecha_cfdi (YYYY-MM-DD) dentro de [desde, hasta].
        Útil para implementar descarga interna por ventanas (hasta 4 meses por petición).
        """
        res = {
            "exito": False,
            "leidos": 0,
            "considerados": 0,
            "insertados": 0,
            "actualizados": 0,
            "errores": 0,
            "uuid_en_poliza": 0,
            "detalle_error": [],
        }
        carpeta = os.path.abspath(carpeta or "")
        if not os.path.isdir(carpeta):
            res["error"] = "Carpeta inválida."
            return res
        try:
            d0 = datetime.strptime((desde_ymd or "")[:10], "%Y-%m-%d").date()
            d1 = datetime.strptime((hasta_ymd or "")[:10], "%Y-%m-%d").date()
        except Exception:
            res["error"] = "Rango inválido (use YYYY-MM-DD)."
            return res
        if d1 < d0:
            d0, d1 = d1, d0
        paths = self._iter_xml_files(carpeta, recursive, max_depth)
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cfdi_poliza'")
            tiene_cfdi_poliza = cur.fetchone() is not None
            for path in paths:
                res["leidos"] += 1
                dest = path
                if copiar_a_facturas:
                    os.makedirs(self.facturas_dir, exist_ok=True)
                    base = os.path.basename(path)
                    dest = os.path.join(self.facturas_dir, base)
                    try:
                        import shutil

                        shutil.copy2(path, dest)
                    except OSError as e:
                        res["errores"] += 1
                        res["detalle_error"].append({"archivo": path, "error": str(e)})
                        continue
                parsed = self._parse_xml(dest)
                if not parsed:
                    res["errores"] += 1
                    res["detalle_error"].append({"archivo": dest, "error": "No se pudo parsear CFDI"})
                    continue
                f = (parsed.get("fecha_cfdi") or "")[:10]
                try:
                    fx = datetime.strptime(f, "%Y-%m-%d").date()
                except Exception:
                    continue
                if fx < d0 or fx > d1:
                    continue
                res["considerados"] += 1
                uid = (parsed.get("uuid") or "").strip()
                if tiene_cfdi_poliza and uid and not uid.startswith("SIN-UUID"):
                    cur.execute(
                        "SELECT 1 FROM cfdi_poliza WHERE TRIM(LOWER(uuid)) = TRIM(LOWER(?)) LIMIT 1",
                        (uid,),
                    )
                    if cur.fetchone():
                        res["uuid_en_poliza"] += 1
                try:
                    ins, upd = self._upsert_parsed(cur, parsed, proveedor, os.path.basename(dest))
                    res["insertados"] += ins
                    res["actualizados"] += upd
                except Exception as e:
                    res["errores"] += 1
                    res["detalle_error"].append({"archivo": dest, "error": str(e)})
            conn.commit()
        res["exito"] = True
        return res

    def importar_archivo_externo(self, path_xml: str, proveedor: str = "", copiar_a_carpeta: bool = True) -> Dict:
        """Importa un XML desde cualquier ruta; opcionalmente copia a facturas_timbradas."""
        path_xml = os.path.abspath(path_xml or "")
        if not path_xml.lower().endswith(".xml") or not os.path.isfile(path_xml):
            return {"exito": False, "error": "Seleccione un archivo XML válido."}
        dest = path_xml
        if copiar_a_carpeta:
            os.makedirs(self.facturas_dir, exist_ok=True)
            base = os.path.basename(path_xml)
            dest = os.path.join(self.facturas_dir, base)
            try:
                import shutil  # noqa: PLC0415

                shutil.copy2(path_xml, dest)
            except Exception as e:
                return {"exito": False, "error": str(e)}
        parsed = self._parse_xml(dest)
        if not parsed:
            return {"exito": False, "error": "No se pudo leer el CFDI."}
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            ins, upd = self._upsert_parsed(cur, parsed, proveedor, os.path.basename(dest))
            conn.commit()
            cur.execute("SELECT id FROM cfdi_tablero WHERE xml_path = ?", (dest,))
            rid = cur.fetchone()
            internal_id = int(rid[0]) if rid else None
        return {
            "exito": True,
            "insertado": bool(ins),
            "actualizado": bool(upd),
            "uuid": (parsed.get("uuid") or "").strip(),
            "id": internal_id,
            "ruta": dest,
        }

    def obtener_por_id(self, cid: int) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute("SELECT * FROM cfdi_tablero WHERE id = ?", (int(cid),))
            row = cur.fetchone()
            return dict(row) if row else None

    def lineas_conceptos_desde_xml(self, xml_path: str) -> List[Dict]:
        out: List[Dict] = []
        if not xml_path or not os.path.isfile(xml_path):
            return out
        try:
            root = ET.fromstring(open(xml_path, "r", encoding="utf-8").read())
            comp = self._find_first(root, "Comprobante") or root
            for el in comp.iter():
                if el.tag and el.tag.endswith("Concepto"):
                    out.append({
                        "clave": (el.get("ClaveProdServ") or ""),
                        "cantidad": (el.get("Cantidad") or ""),
                        "clave_unidad": (el.get("ClaveUnidad") or ""),
                        "unidad": (el.get("Unidad") or ""),
                        "descripcion": ((el.get("Descripcion") or "")[:120]),
                        "valor_unitario": (el.get("ValorUnitario") or ""),
                    })
        except Exception:
            pass
        return out

    def validacion_local_resumen(self, cids: List[int]) -> Dict[str, int]:
        """Resumen estilo Aspel (sin consulta SAT real): estado local y EFOS no consultado."""
        vigente = cancelado = no_encontrado = 0
        lista_ok = presunto = definitivo = 0
        for cid in cids:
            row = self.obtener_por_id(cid)
            if not row:
                no_encontrado += 1
                continue
            path = row.get("xml_path") or ""
            if not path or not os.path.isfile(path):
                no_encontrado += 1
                continue
            est = (row.get("estado_comprobante") or "").upper()
            if "CANCEL" in est:
                cancelado += 1
            elif (row.get("uuid") or "").strip():
                vigente += 1
            else:
                no_encontrado += 1
            lista_ok += 1
        return {
            "vigente": vigente,
            "cancelado": cancelado,
            "no_encontrado": no_encontrado,
            "lista_no_esta": lista_ok,
            "lista_presunto": presunto,
            "lista_definitivo": definitivo,
            "enviados": len(cids),
        }

    def aplicar_validacion_local_a_ids(self, cids: List[int]) -> None:
        """Relee XML y actualiza estado_comprobante heurístico."""
        for cid in cids:
            row = self.obtener_por_id(cid)
            if not row:
                continue
            path = row.get("xml_path") or ""
            p = self._parse_xml(path) if path and os.path.isfile(path) else None
            if not p:
                estado = "NO_ENCONTRADO"
            else:
                estado = p.get("estado_comprobante") or "SIN_VALIDAR"
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "UPDATE cfdi_tablero SET estado_comprobante = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                    (estado, cid),
                )
                conn.commit()

    def listar_cfdi_filtrado(
        self,
        texto: str = "",
        periodo: str = "todos",
        flujo: str = "todos",
        tipo_cfdi: str = "",
        estado: str = "",
        efos: str = "",
        rfc_empresa: str = "",
        limit: int = 800,
    ) -> List[Dict]:
        from datetime import datetime, timedelta

        where: List[str] = ["1=1"]
        params: List = []
        t = (texto or "").strip()
        if t:
            like = f"%{t}%"
            where.append(
                "(uuid LIKE ? OR rfc_receptor LIKE ? OR nombre_receptor LIKE ? OR folio LIKE ? OR rfc_emisor LIKE ? OR nombre_emisor LIKE ? OR serie LIKE ?)"
            )
            params.extend([like, like, like, like, like, like, like])

        fe_ref = "substr(COALESCE(fecha_timbrado, fecha_cfdi),1,10)"
        if periodo == "hoy":
            where.append(f"date({fe_ref}) = date('now','localtime')")
        elif periodo == "mes":
            where.append(f"strftime('%Y-%m', {fe_ref}) = strftime('%Y-%m','now','localtime')")
        elif periodo == "mes_anterior":
            d0 = datetime.now().replace(day=1) - timedelta(days=1)
            ym = d0.strftime("%Y-%m")
            where.append(f"strftime('%Y-%m', {fe_ref}) = ?")
            params.append(ym)

        rfc_empresa = (rfc_empresa or "").strip().upper()
        if flujo == "emitidos" and rfc_empresa:
            where.append("UPPER(TRIM(rfc_emisor)) = ?")
            params.append(rfc_empresa)
        elif flujo == "recibidos" and rfc_empresa:
            where.append("UPPER(TRIM(rfc_receptor)) = ?")
            params.append(rfc_empresa)

        if tipo_cfdi and tipo_cfdi != "todos":
            where.append("substr(UPPER(COALESCE(tipo_cfdi,'')),1,1) = ?")
            params.append(tipo_cfdi[:1].upper())

        if estado and estado != "todos":
            where.append("UPPER(COALESCE(estado_comprobante,'')) LIKE ?")
            params.append(f"%{estado.upper()}%")

        if efos and efos != "todos":
            where.append("UPPER(COALESCE(efos_estado,'NINGUNO')) = ?")
            params.append(efos.upper())

        params.append(limit)
        sql_with_flag = (
            "SELECT cfdi_tablero.*, "
            "CASE WHEN cfp.uuid IS NOT NULL THEN 1 ELSE 0 END AS en_contabilidad "
            "FROM cfdi_tablero "
            "LEFT JOIN cfdi_poliza cfp ON cfp.uuid = cfdi_tablero.uuid "
            f"WHERE {' AND '.join(where)} "
            "ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC "
            "LIMIT ?"
        )
        sql_fallback = (
            f"SELECT * FROM cfdi_tablero WHERE {' AND '.join(where)} "
            "ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC "
            "LIMIT ?"
        )
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            try:
                cur = conn.execute(sql_with_flag, params)
                return [dict(r) for r in cur.fetchall()]
            except sqlite3.OperationalError:
                cur = conn.execute(sql_fallback, params)
                rows = [dict(r) for r in cur.fetchall()]
                for row in rows:
                    row["en_contabilidad"] = 0
                return rows

    def listar_cfdi(self, filtro: str = "", limit: int = 500) -> List[Dict]:
        filtro = (filtro or "").strip()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            try:
                if filtro:
                    like = f"%{filtro}%"
                    cur.execute(
                        """
                        SELECT cfdi_tablero.*,
                               CASE WHEN cfp.uuid IS NOT NULL THEN 1 ELSE 0 END AS en_contabilidad
                        FROM cfdi_tablero
                        LEFT JOIN cfdi_poliza cfp ON cfp.uuid = cfdi_tablero.uuid
                        WHERE uuid LIKE ? OR rfc_receptor LIKE ? OR nombre_receptor LIKE ? OR folio LIKE ?
                        ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC
                        LIMIT ?
                        """,
                        (like, like, like, like, limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT cfdi_tablero.*,
                               CASE WHEN cfp.uuid IS NOT NULL THEN 1 ELSE 0 END AS en_contabilidad
                        FROM cfdi_tablero
                        LEFT JOIN cfdi_poliza cfp ON cfp.uuid = cfdi_tablero.uuid
                        ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC
                        LIMIT ?
                        """,
                        (limit,),
                    )
                return [dict(r) for r in cur.fetchall()]
            except sqlite3.OperationalError:
                if filtro:
                    like = f"%{filtro}%"
                    cur.execute(
                        """
                        SELECT * FROM cfdi_tablero
                        WHERE uuid LIKE ? OR rfc_receptor LIKE ? OR nombre_receptor LIKE ? OR folio LIKE ?
                        ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC
                        LIMIT ?
                        """,
                        (like, like, like, like, limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM cfdi_tablero
                        ORDER BY COALESCE(fecha_timbrado, fecha_cfdi) DESC, id DESC
                        LIMIT ?
                        """,
                        (limit,),
                    )
                rows = [dict(r) for r in cur.fetchall()]
                for row in rows:
                    row["en_contabilidad"] = 0
                return rows

    def guardar_evento_diario(self, categoria: str, severidad: str, mensaje: str, referencia: str = "") -> None:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO diario_operaciones (categoria, severidad, mensaje, referencia)
                VALUES (?, ?, ?, ?)
                """,
                ((categoria or "").strip(), (severidad or "INFO").strip().upper(), (mensaje or "").strip(), (referencia or "").strip()),
            )
            conn.commit()

    def ejecutar_analisis(self) -> Dict[str, int]:
        lista = self.listar_cfdi(limit=2000)
        alertas = 0
        revisados = len(lista)
        for x in lista:
            uuid_ = (x.get("uuid") or "").strip()
            moneda = (x.get("moneda") or "").strip().upper()
            total = float(x.get("total") or 0)
            receptor = (x.get("rfc_receptor") or "").strip()
            status = (x.get("status_sat") or "").strip()
            ref = uuid_ or (x.get("folio") or "")
            if not uuid_ or status == "SIN_UUID":
                alertas += 1
                self.guardar_evento_diario("CFDI", "WARN", "CFDI sin UUID timbrado", ref)
            if moneda not in ("MXN", "USD", "EUR", "GBP"):
                alertas += 1
                self.guardar_evento_diario("CFDI", "WARN", f"Moneda no estándar detectada: {moneda}", ref)
            if total <= 0:
                alertas += 1
                self.guardar_evento_diario("CFDI", "WARN", "CFDI con total <= 0", ref)
            if not receptor:
                alertas += 1
                self.guardar_evento_diario("CFDI", "WARN", "CFDI sin RFC receptor", ref)
        self.guardar_evento_diario("ANALISIS", "INFO", f"Análisis ejecutado: {revisados} CFDI revisados, {alertas} alerta(s).")
        return {"revisados": revisados, "alertas": alertas}

    def resumen(self) -> Dict[str, float]:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*), COALESCE(SUM(total), 0) FROM cfdi_tablero")
            total_cfdi, monto = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM cfdi_tablero WHERE status_sat = 'SIN_UUID'")
            sin_uuid = cur.fetchone()[0]
            return {
                "total_cfdi": int(total_cfdi or 0),
                "monto_total": float(monto or 0),
                "sin_uuid": int(sin_uuid or 0),
            }

    def obtener_diario(self, limit: int = 300) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, fecha_hora, categoria, severidad, mensaje, referencia
                FROM diario_operaciones
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

