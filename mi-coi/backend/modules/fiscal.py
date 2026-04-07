# backend/modules/fiscal.py
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List
import os
import sys
from xml.dom import minidom

# Contabilidad electrónica SAT (esquemas 1.3)
NS_CATALOGOCUENTAS = "http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas"
NS_BCE = "http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion"
NS_PLZ = "http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo"
XSI = "http://www.w3.org/2001/XMLSchema-instance"


def _normaliza_tipo_envio_bce(codigo: str) -> str:
    c = (codigo or "N").strip().upper()
    if c in ("N", "NORMAL"):
        return "N"
    if c in ("C", "COMPLEMENTARIA", "COMP"):
        return "C"
    if c in ("E", "XC", "EXTEMPORANEO", "EXTEMPORÁNEO"):
        return "E"
    return "N"


def _normaliza_tipo_solicitud_plz(codigo: str) -> str:
    """PolizasPeriodo 1.3 — TipoSolicitud (SAT): AF, FC, DE, CO."""
    c = (codigo or "AF").strip().upper()
    return c if c in ("AF", "FC", "DE", "CO") else "AF"


def _rfc_tercero_cfdi(rfc_emisor: str, rfc_receptor: str, rfc_contribuyente: str) -> str:
    """
    En CompNal el RFC debe ser el del tercero distinto del contribuyente que envía el XML.
    """
    rc = (rfc_contribuyente or "").strip().upper()
    em = (rfc_emisor or "").strip().upper()
    rec = (rfc_receptor or "").strip().upper()
    if rc:
        if em and em != rc:
            return em
        if rec and rec != rc:
            return rec
    return em or rec or "XAXX010101000"

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config import get_db_path
from .facturapi_integration import FacturapiClient


def _rfc_contribuyente_resuelto(db_path: str, rfc_param: str) -> str:
    """
    RFC en raíz de XML de contabilidad electrónica: si el parámetro viene vacío,
    usa el guardado en configuracion_general de la misma BD.
    """
    p = (rfc_param or "").strip().upper()
    if p:
        return p
    try:
        from backend.modules.configuracion_general import ConfiguracionGeneral

        r = (ConfiguracionGeneral(db_path=db_path).obtener().get("rfc") or "").strip().upper()
        return r
    except Exception:
        return ""
from .facturama_integration import FacturamaClient
from .conectia_sw_integration import ConectiaSWClient
from .finkok_integration import FinkokClient

class FiscalSAT:
    def __init__(self, db_path: str = None, proveedor: str = "facturapi"):
        self.db_path = db_path if db_path else get_db_path()
        self.proveedor = proveedor.lower()
        
        if self.proveedor == "facturapi":
            self.cliente = FacturapiClient()
        elif self.proveedor == "facturama":
            self.cliente = FacturamaClient()
        elif self.proveedor == "conectia":
            self.cliente = ConectiaSWClient()
        elif self.proveedor == "finkok":
            self.cliente = FinkokClient()
        else:
            raise ValueError(f"Proveedor no soportado: {proveedor}")
    
    def timbrar_factura_prueba(self, monto: float = 1000.0, descripcion: str = "Servicio de prueba") -> dict:
        """Timbra una factura de prueba usando el proveedor seleccionado"""
        try:
            print(f"Enviando a timbrar con {self.proveedor}: ${monto} - {descripcion}")
            resultado = self.cliente.timbrar_factura_prueba(monto, descripcion)
            print(f"Resultado: {resultado}")
            return resultado
        except Exception as e:
            print(f"Error en timbrado: {str(e)}")
            return {"exito": False, "error": str(e)}

    def timbrar_factura_real(self, receptor: dict, conceptos: list, folio: str = None) -> dict:
        """Timbra una factura real (receptor y conceptos). Solo Finkok implementado por ahora."""
        try:
            if hasattr(self.cliente, "timbrar_factura_real"):
                return self.cliente.timbrar_factura_real(receptor=receptor, conceptos=conceptos, folio=folio)
            return {"exito": False, "error": f"Factura real no implementada para {self.proveedor}. Use Finkok o agregue el método en el cliente."}
        except Exception as e:
            return {"exito": False, "error": str(e)}
    
    # ... resto de métodos XML igual ...
    
    def generar_xml_catalogo_cuentas(self, mes: int, anio: int, rfc: str) -> str:
        """
        Catálogo de cuentas — esquema CatalogoCuentas 1.3 (namespace SAT).
        Por cuenta: CodAgrup, NumCta, Desc, Nivel, Natur (D/A), SubCtaDe opcional.
        """
        rfc = _rfc_contribuyente_resuelto(self.db_path, rfc)
        if not rfc:
            return "<!-- Error: RFC no indicado. Captúrelo en Administración → Datos de empresa o en el diálogo de exportación. -->"
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor,
                           codigo_agrupador_sat, no_incluir_xml
                    FROM catalogo_cuentas
                    WHERE no_incluir_xml = 0 OR no_incluir_xml IS NULL
                    ORDER BY num_cuenta
                    """
                )
                cuentas = cursor.fetchall()

                root = ET.Element(f"{{{NS_CATALOGOCUENTAS}}}Catalogo")
                root.set("Version", "1.3")
                root.set("RFC", (rfc or "").strip().upper())
                root.set("Mes", f"{int(mes):02d}")
                root.set("Anio", str(int(anio)))
                root.set("TotalCtas", str(len(cuentas)))
                root.set(
                    f"{{{XSI}}}schemaLocation",
                    f"{NS_CATALOGOCUENTAS} http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd",
                )

                for cuenta in cuentas:
                    num_cuenta, nombre, nivel, naturaleza, cuenta_mayor, cod_agrup, _no_xml = cuenta
                    cod = (cod_agrup or "").strip() or f"{str(num_cuenta)[:3]}00"
                    desc = (nombre or num_cuenta or "").strip()[:400] or str(num_cuenta)
                    nv = int(nivel) if nivel is not None and str(nivel).strip().isdigit() else 1
                    nat = str(naturaleza or "DEUDORA").upper().strip()
                    natur_sat = "D" if nat.startswith("D") else "A"

                    ct = ET.SubElement(root, f"{{{NS_CATALOGOCUENTAS}}}Ctas")
                    ct.set("CodAgrup", cod)
                    ct.set("NumCta", str(num_cuenta))
                    ct.set("Desc", desc)
                    ct.set("Nivel", str(nv))
                    ct.set("Natur", natur_sat)
                    if cuenta_mayor:
                        cm = str(cuenta_mayor).strip()
                        if cm:
                            ct.set("SubCtaDe", cm)

                ET.register_namespace("cce", NS_CATALOGOCUENTAS)
                ET.register_namespace("xsi", XSI)
                try:
                    ET.register_namespace("", NS_CATALOGOCUENTAS)
                except Exception:
                    pass
                xml_string = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                dom = minidom.parseString(xml_string)
                return dom.toprettyxml(indent="  ")
        except Exception as e:
            return f"<!-- Error generando XML: {str(e)} -->"
    
    def generar_xml_balanza(
        self,
        mes: int,
        anio: int,
        rfc: str,
        tipo_envio: str = "N",
    ) -> str:
        """
        Balanza de comprobación BCE 1.3. tipo_envio: N (Normal), C (Complementaria), E (Extemporáneo).
        Alias comunes: XC o EXTEMPORANEO → E.
        """
        te = _normaliza_tipo_envio_bce(tipo_envio)
        rfc = _rfc_contribuyente_resuelto(self.db_path, rfc)
        if not rfc:
            return "<!-- Error: RFC no indicado. Captúrelo en Administración → Datos de empresa o en el diálogo de exportación. -->"
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()

                try:
                    cursor.execute(
                        """
                        SELECT 
                            c.num_cuenta,
                            COALESCE(s.saldo_inicial_mn, 0) as saldo_ini,
                            COALESCE(s.cargos_mn, 0) as debe,
                            COALESCE(s.abonos_mn, 0) as haber,
                            COALESCE(s.saldo_final_mn, 0) as saldo_fin
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_cuenta s ON c.num_cuenta = s.num_cuenta
                            AND s.periodo = ? AND s.ejercicio = ?
                        WHERE c.no_incluir_xml = 0 OR c.no_incluir_xml IS NULL
                        ORDER BY c.num_cuenta
                        """,
                        (mes, anio),
                    )
                    cuentas = cursor.fetchall()
                except sqlite3.OperationalError:
                    cursor.execute(
                        """
                        SELECT 
                            c.num_cuenta,
                            COALESCE(s.saldo_inicial, 0) as saldo_ini,
                            COALESCE(s.debe, 0) as debe,
                            COALESCE(s.haber, 0) as haber,
                            COALESCE(s.saldo_final, 0) as saldo_fin
                        FROM catalogo_cuentas c
                        LEFT JOIN saldos_mensuales s ON c.num_cuenta = s.num_cuenta 
                            AND s.mes = ? AND s.anio = ?
                        WHERE c.no_incluir_xml = 0 OR c.no_incluir_xml IS NULL
                        ORDER BY c.num_cuenta
                        """,
                        (mes, anio),
                    )
                    cuentas = cursor.fetchall()

                root = ET.Element(f"{{{NS_BCE}}}Balanza")
                root.set("Version", "1.3")
                root.set("RFC", (rfc or "").strip().upper())
                root.set("Mes", f"{int(mes):02d}")
                root.set("Anio", str(int(anio)))
                root.set("TipoEnvio", te)
                root.set("FechaModBal", datetime.now().strftime("%Y-%m-%d"))
                root.set(
                    f"{{{XSI}}}schemaLocation",
                    f"{NS_BCE} http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd",
                )

                for cuenta in cuentas:
                    cta_elem = ET.SubElement(root, f"{{{NS_BCE}}}Ctas")
                    cta_elem.set("NumCta", str(cuenta[0]))
                    cta_elem.set("SaldoIni", f"{float(cuenta[1] or 0):.2f}")
                    cta_elem.set("Debe", f"{float(cuenta[2] or 0):.2f}")
                    cta_elem.set("Haber", f"{float(cuenta[3] or 0):.2f}")
                    cta_elem.set("SaldoFin", f"{float(cuenta[4] or 0):.2f}")

                ET.register_namespace("BCE", NS_BCE)
                ET.register_namespace("xsi", XSI)
                try:
                    ET.register_namespace("", NS_BCE)
                except Exception:
                    pass
                xml_string = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                dom = minidom.parseString(xml_string)
                return dom.toprettyxml(indent="  ")
        except Exception as e:
            return f"<!-- Error generando XML: {str(e)} -->"
    
    def generar_xml_polizas(
        self,
        mes: int,
        anio: int,
        rfc: str,
        *,
        tipo_solicitud: str = "AF",
    ) -> str:
        """
        Pólizas del periodo — PolizasPeriodo 1.3 (XSD SAT / satcfdi PLZ13).

        - Raíz: TipoSolicitud (AF|FC|DE|CO), Version, RFC, Mes, Anio.
        - Poliza: NumUnIdenPol, Fecha (AAAAMMDD), Concepto (sin atributo Tipo en 1.3).
        - Transaccion: NumCta, DesCta, Concepto, Debe, Haber.
        - CompNal: UUID_CFDI, RFC (tercero), MontoTotal; Moneda y TipCamb si moneda extranjera.
        """
        rfc_root = _rfc_contribuyente_resuelto(self.db_path, rfc)
        if not rfc_root:
            return "<!-- Error: RFC no indicado. Captúrelo en Administración → Datos de empresa o en el diálogo de exportación. -->"
        ts = _normaliza_tipo_solicitud_plz(tipo_solicitud)
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(polizas)")
                pcols = [r[1] for r in cursor.fetchall()]
                where_est = ""
                if "estatus" in pcols:
                    where_est = " AND UPPER(COALESCE(p.estatus,'C')) != 'X' "

                cursor.execute(
                    f"""
                    SELECT p.id, p.numero_poliza, p.tipo_poliza, p.fecha, p.concepto,
                           COALESCE(p.moneda,'MXN') AS moneda_pol
                    FROM polizas p
                    WHERE strftime('%Y', p.fecha) = ? AND strftime('%m', p.fecha) = ?
                    {where_est}
                    ORDER BY p.fecha, p.tipo_poliza, p.numero_poliza, p.id
                    """,
                    (str(int(anio)), f"{int(mes):02d}"),
                )
                polizas = cursor.fetchall()

                root = ET.Element(f"{{{NS_PLZ}}}Polizas")
                root.set("Version", "1.3")
                root.set("RFC", rfc_root)
                root.set("Mes", f"{int(mes):02d}")
                root.set("Anio", str(int(anio)))
                root.set("TipoSolicitud", ts)
                root.set(
                    f"{{{XSI}}}schemaLocation",
                    f"{NS_PLZ} http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd",
                )

                for poliza in polizas:
                    poliza_id = poliza[0]
                    num = poliza[1]
                    tipo = poliza[2]
                    fecha = poliza[3]
                    concepto = poliza[4] or ""
                    moneda_pol = (poliza[5] or "MXN").strip().upper()[:3] or "MXN"

                    poliza_elem = ET.SubElement(root, f"{{{NS_PLZ}}}Poliza")
                    tpref = (str(tipo) or "D")[:1].upper()
                    try:
                        num_clean = str(int(num)) if str(num).strip().isdigit() else str(num).strip()
                    except Exception:
                        num_clean = str(num)
                    poliza_elem.set("NumUnIdenPol", f"{tpref}{num_clean}-{poliza_id}")
                    f_str = str(fecha or "")[:10].replace("-", "")
                    poliza_elem.set("Fecha", f_str)
                    poliza_elem.set("Concepto", (str(concepto)[:300] if concepto else "Póliza") or "Póliza")

                    try:
                        cursor.execute(
                            """
                            SELECT
                                pp.num_cuenta,
                                pp.concepto_linea,
                                COALESCE(pp.cargo_mn, pp.cargo, 0) AS cargo,
                                COALESCE(pp.abono_mn, pp.abono, 0) AS abono,
                                COALESCE(pp.moneda,'') AS moneda_lin,
                                COALESCE(pp.tipo_cambio, 0) AS tipo_cambio_lin,
                                TRIM(COALESCE(cfp.uuid,'')) AS uuid,
                                TRIM(COALESCE(cfp.rfc_emisor,'')) AS rfc_cfdi_em,
                                TRIM(COALESCE(cfp.rfc_receptor,'')) AS rfc_cfdi_rec,
                                COALESCE(cfp.total_cfdi,0) AS total_cfdi,
                                COALESCE(NULLIF(TRIM(cat.nombre_cuenta),''), pp.num_cuenta) AS nombre_cuenta
                            FROM partidas_poliza pp
                            LEFT JOIN cfdi_poliza cfp ON cfp.id_partida = pp.id_partida
                            LEFT JOIN catalogo_cuentas cat ON cat.num_cuenta = pp.num_cuenta
                            WHERE pp.id_poliza = ?
                            ORDER BY pp.numero_linea, pp.id_partida
                            """,
                            (poliza_id,),
                        )
                        movs = cursor.fetchall()
                        for mov in movs:
                            num_cta = str(mov[0] or "")
                            concepto_lin = (mov[1] or "").strip()
                            cargo_f = float(mov[2] or 0)
                            abono_f = float(mov[3] or 0)
                            mon_lin = (mov[4] or "").strip().upper()[:3] or moneda_pol
                            tip_camb = float(mov[5] or 0)
                            uuid = (mov[6] or "").strip()
                            rfc_em = mov[7] or ""
                            rfc_rec = mov[8] or ""
                            total_cfdi = float(mov[9] or 0)
                            nombre_cta = (mov[10] or num_cta or "Cuenta").strip()

                            des_cta = (nombre_cta or num_cta)[:400]
                            concepto_tx = (concepto_lin or des_cta)[:400]

                            transaccion = ET.SubElement(poliza_elem, f"{{{NS_PLZ}}}Transaccion")
                            transaccion.set("NumCta", num_cta)
                            transaccion.set("DesCta", des_cta)
                            transaccion.set("Concepto", concepto_tx)
                            transaccion.set("Debe", f"{cargo_f:.2f}")
                            transaccion.set("Haber", f"{abono_f:.2f}")
                            if uuid:
                                monto = total_cfdi if total_cfdi > 0 else (cargo_f + abono_f)
                                rfc_ter = _rfc_tercero_cfdi(rfc_em, rfc_rec, rfc_root)
                                comp = ET.SubElement(transaccion, f"{{{NS_PLZ}}}CompNal")
                                comp.set("UUID_CFDI", uuid)
                                comp.set("RFC", rfc_ter)
                                comp.set("MontoTotal", f"{monto:.2f}")
                                if mon_lin and mon_lin != "MXN":
                                    comp.set("Moneda", mon_lin)
                                    if tip_camb and tip_camb > 0:
                                        comp.set("TipCamb", f"{tip_camb:.6f}".rstrip("0").rstrip("."))
                    except sqlite3.OperationalError:
                        cursor.execute(
                            """
                            SELECT num_cuenta, concepto_mov, cargo, abono
                            FROM movimientos
                            WHERE poliza_id = ?
                            ORDER BY id
                            """,
                            (poliza_id,),
                        )
                        for mov in cursor.fetchall():
                            nc = str(mov[0] or "")
                            cm = (mov[1] or nc or "Movimiento").strip()[:400]
                            transaccion = ET.SubElement(poliza_elem, f"{{{NS_PLZ}}}Transaccion")
                            transaccion.set("NumCta", nc)
                            transaccion.set("DesCta", cm)
                            transaccion.set("Concepto", cm)
                            transaccion.set("Debe", f"{float(mov[2] or 0):.2f}")
                            transaccion.set("Haber", f"{float(mov[3] or 0):.2f}")

                ET.register_namespace("PLZ", NS_PLZ)
                ET.register_namespace("xsi", XSI)
                try:
                    ET.register_namespace("", NS_PLZ)
                except Exception:
                    pass
                xml_string = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                dom = minidom.parseString(xml_string)
                return dom.toprettyxml(indent="  ")
        except Exception as e:
            return f"<!-- Error generando XML: {str(e)} -->"
    
    def guardar_xml(self, contenido: str, nombre_archivo: str, carpeta: str = "xml_sat") -> str:
        """Guarda el XML en un archivo"""
        try:
            ruta_carpeta = os.path.join(os.path.dirname(self.db_path), carpeta)
            os.makedirs(ruta_carpeta, exist_ok=True)
            
            ruta_completa = os.path.join(ruta_carpeta, nombre_archivo)
            
            with open(ruta_completa, 'w', encoding='utf-8') as f:
                f.write(contenido)
            
            return ruta_completa
        except Exception as e:
            return f"Error guardando XML: {str(e)}"
    
    def generar_todos_xml(
        self,
        mes: int,
        anio: int,
        rfc: str,
        tipo_envio_balanza: str = "N",
        tipo_solicitud_polizas: str = "AF",
    ) -> Dict:
        """Genera catálogo, balanza (con TipoEnvio) y pólizas del periodo."""
        resultados: Dict[str, str] = {}
        rfc = _rfc_contribuyente_resuelto(self.db_path, rfc)
        if not rfc:
            return {"error": "RFC del contribuyente no indicado y no hay RFC en Datos de empresa / configuración general."}

        try:
            catalogo_xml = self.generar_xml_catalogo_cuentas(mes, anio, rfc)
            archivo = f"CatalogoCuentas_{rfc}_{anio}{int(mes):02d}.xml"
            ruta = self.guardar_xml(catalogo_xml, archivo)
            resultados["catalogo"] = ruta

            balanza_xml = self.generar_xml_balanza(mes, anio, rfc, tipo_envio=tipo_envio_balanza)
            archivo = f"Balanza_{rfc}_{anio}{int(mes):02d}.xml"
            ruta = self.guardar_xml(balanza_xml, archivo)
            resultados["balanza"] = ruta

            polizas_xml = self.generar_xml_polizas(mes, anio, rfc, tipo_solicitud=tipo_solicitud_polizas)
            if polizas_xml and not polizas_xml.startswith("<!-- Error"):
                archivo = f"Polizas_{rfc}_{anio}{int(mes):02d}.xml"
                ruta = self.guardar_xml(polizas_xml, archivo)
                resultados["polizas"] = ruta

        except Exception as e:
            resultados["error"] = str(e)

        return resultados