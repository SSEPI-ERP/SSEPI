import os
import requests
import json
from datetime import datetime
import base64


def _load_facturama_config():
    """Carga usuario, contraseña y datos de emisor desde config_instituto.json."""
    out = {}
    try:
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "config_instituto.json"
        )
        if os.path.isfile(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                out["user"] = (data.get("FACTURAMA_USER") or "").strip()
                out["password"] = (data.get("FACTURAMA_PASSWORD") or "").strip()
                out["rfc"] = (data.get("FACTURAMA_ISSUER_RFC") or "").strip()
                out["name"] = (data.get("FACTURAMA_ISSUER_NAME") or "").strip()
                out["zip"] = (data.get("FACTURAMA_EXPEDITION_ZIP") or "").strip()
                out["regime"] = (data.get("FACTURAMA_ISSUER_REGIME") or "").strip()
    except Exception:
        pass
    return out


class FacturamaClient:
    def __init__(self, username: str = None, password: str = None, sandbox: bool = True):
        """
        Cliente para Facturama usando requests
        sandbox=True = ambiente de pruebas (GRATIS)
        Lee usuario/contraseña y datos de emisor desde config_instituto.json si no se pasan.
        """
        cfg = _load_facturama_config()
        env_user = os.getenv("FACTURAMA_USER") or cfg.get("user")
        env_pass = os.getenv("FACTURAMA_PASSWORD") or cfg.get("password")
        env_mode = os.getenv("FACTURAMA_ENV", "").lower()
        self.username = (username or env_user or "Juanito2413").strip()
        self.password = (password or env_pass or "trabajos47").strip()
        
        credentials = f"{self.username}:{self.password}"
        self.token = base64.b64encode(credentials.encode()).decode()
        
        if env_mode in ["prod", "production", "producción", "produccion"]:
            sandbox = False
        if sandbox:
            self.base_url = "https://apisandbox.facturama.mx/"
        else:
            self.base_url = "https://api.facturama.mx/"
            
        self.headers = {
            "Content-Type": "application/json"
        }
        self.auth = (self.username, self.password)
        # Lugar de expedición y emisor: config_instituto.json o env
        self.expedition_zip = os.getenv("FACTURAMA_EXPEDITION_ZIP") or cfg.get("zip")
        self.issuer_regime = os.getenv("FACTURAMA_ISSUER_REGIME") or cfg.get("regime")
        self.issuer_rfc = os.getenv("FACTURAMA_ISSUER_RFC") or cfg.get("rfc")
        self.issuer_name = os.getenv("FACTURAMA_ISSUER_NAME") or cfg.get("name")
        if not self.expedition_zip:
            self.expedition_zip = "58000"  # EKU9003173C9
        if not self.issuer_regime:
            self.issuer_regime = "601"
    
    def _hydrate_issuer_from_account(self):
        try:
            resp = requests.get(f"{self.base_url}TaxEntity", auth=self.auth, headers=self.headers)
            if resp.status_code == 200:
                data = resp.json()
                self.issuer_rfc = self.issuer_rfc or data.get("Rfc") or data.get("RfcId")
                self.issuer_name = self.issuer_name or data.get("Name") or data.get("BusinessName") or data.get("TaxName")
                self.issuer_regime = self.issuer_regime or data.get("FiscalRegime") or data.get("TaxSystem")
                self.expedition_zip = self.expedition_zip or data.get("TaxZipCode") or data.get("ZipCode")
        except Exception:
            pass

    def subir_csd(self, cer_path: str, key_path: str, password: str, rfc: str = None) -> dict:
        """
        Sube el CSD a Facturama por API Multiemisor (api-lite).
        Los CSD subidos aquí son los que usa api-lite/3/cfdis al timbrar.
        No usa TaxEntity/UploadCsd (eso es para API Web).
        """
        try:
            if not os.path.isfile(cer_path):
                return {"exito": False, "error": f"No existe el archivo .cer: {cer_path}"}
            if not os.path.isfile(key_path):
                return {"exito": False, "error": f"No existe el archivo .key: {key_path}"}
            with open(cer_path, "rb") as f:
                cer_b64 = base64.b64encode(f.read()).decode("ascii")
            with open(key_path, "rb") as f:
                key_b64 = base64.b64encode(f.read()).decode("ascii")
            rfc_emisor = rfc or self.issuer_rfc
            if not rfc_emisor:
                self._hydrate_issuer_from_account()
                rfc_emisor = self.issuer_rfc or "EKU9003173C9"
            payload = {
                "Rfc": rfc_emisor,
                "Certificate": cer_b64,
                "PrivateKey": key_b64,
                "PrivateKeyPassword": password
            }
            resp = requests.post(
                f"{self.base_url}api-lite/csds",
                auth=self.auth,
                headers=self.headers,
                json=payload
            )
            if resp.status_code in [200, 201, 204]:
                return {"exito": True, "mensaje": "CSD subido correctamente (API Multiemisor). Ya puedes timbrar."}
            if resp.status_code == 400 and "Ya existe un CSD" in (resp.text or ""):
                # Actualizar CSD existente (PUT) para que Facturama refresque el nombre del certificado
                put_resp = requests.put(
                    f"{self.base_url}api-lite/csds/{rfc_emisor}",
                    auth=self.auth,
                    headers=self.headers,
                    json=payload
                )
                if put_resp.status_code in [200, 204]:
                    return {"exito": True, "mensaje": "CSD actualizado. Ya puedes timbrar."}
                return {"exito": True, "mensaje": "CSD ya registrado. Si falla el timbrado por nombre, vuelve a ejecutar."}
            err_msg = resp.text or f"Código {resp.status_code}"
            if resp.status_code == 401:
                err_msg = f"401 No autorizado. Revisa usuario/contraseña en config. Respuesta: {resp.text}"
            return {"exito": False, "error": err_msg}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def timbrar_factura_prueba(self, monto: float = 1000.0, descripcion: str = "Servicio de prueba") -> dict:
        """Timbra una factura de prueba usando Facturama (GRATIS en Sandbox)"""
        try:
            if not (self.issuer_rfc and self.issuer_name and self.issuer_regime and self.expedition_zip):
                self._hydrate_issuer_from_account()
            # 1. Crear cliente si no existe
            cliente_data = {
                "Email": "cliente@prueba.com",
                "Rfc": "EKU9003173C9",
                "Name": "CLIENTE PRUEBA SAT",
                "CfdiUse": "G03"
            }
            
            cliente_response = requests.post(
                f"{self.base_url}Client",
                auth=self.auth,
                headers=self.headers,
                data=json.dumps(cliente_data)
            )
            
            if cliente_response.status_code not in [200, 201]:
                err_detail = cliente_response.text or f"(sin cuerpo, código {cliente_response.status_code})"
                if cliente_response.status_code == 401:
                    err_detail = "Usuario o contraseña incorrectos. Usa el mismo usuario y contraseña con los que entras al portal de Facturama (sandbox)."
                return {"exito": False, "error": f"Error creando cliente: {err_detail}"}
            
            cliente = cliente_response.json()
            
            # 2. Crear la factura - VERSIÓN CORREGIDA
            print("Creando factura de prueba...")
            
            fecha_actual = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
            iva = round(monto * 0.16, 2)
            total = round(monto + iva, 2)
            # Facturama API Multiemisor: Name en MAYÚSCULAS y SIN régimen societario (ver guía Crear CFDI api-multi)
            nombre_emisor = (self.issuer_name or self.issuer_rfc or "Empresa Emisora Prueba").strip()
            if self.issuer_rfc == "EKU9003173C9":
                nombre_emisor = os.getenv("FACTURAMA_ISSUER_NAME") or "ESCUELA KEMPER URGATE SA DE CV"
            elif self.issuer_rfc == "RAFSF031015S":
                nombre_emisor = os.getenv("FACTURAMA_ISSUER_NAME") or "AC DEL SERVICIO DE ADMINISTRACION TRIBUTARIA"
            elif self.issuer_rfc == "RARF9311211S9":
                nombre_emisor = os.getenv("FACTURAMA_ISSUER_NAME") or "FRANCISCO SANTIAGO RAMIREZ ROSALES"
            for regimen in (" SA DE CV", " S.A. DE C.V.", " S.A. DE CV", " S DE RL DE CV", " S DE RL"):
                if nombre_emisor.upper().endswith(regimen.upper()):
                    nombre_emisor = nombre_emisor[: -len(regimen)].strip()
                    break
            nombre_emisor = nombre_emisor.upper()
            # Receptor para pruebas: mismo emisor (factura a sí mismo) con domicilio registrado en SAT
            if self.issuer_rfc == "EKU9003173C9":
                receiver_rfc = "EKU9003173C9"
                receiver_name = nombre_emisor
                receiver_zip = self.expedition_zip
                receiver_regime = "601"
                receiver_address = {
                    "Street": "Calzada Fray Antonio de San Miguel",
                    "ExteriorNumber": "308",
                    "InteriorNumber": "",
                    "Neighborhood": "Centro",
                    "ZipCode": "58000",
                    "Municipality": "Morelia",
                    "State": "Michoacán",
                    "Country": "México"
                }
            elif self.issuer_rfc == "RAFSF031015S":
                # Cuenta instituto (perfil fiscal CDMX 06300)
                receiver_rfc = "RAFSF031015S"
                receiver_name = nombre_emisor
                receiver_zip = self.expedition_zip  # 06300
                receiver_regime = "605"
                receiver_address = {
                    "Street": "v. Hidalgo",
                    "ExteriorNumber": "77",
                    "InteriorNumber": "",
                    "Neighborhood": "Guerrero",
                    "ZipCode": "06300",
                    "Municipality": "CUAUHTEMOC",
                    "State": "Ciudad de México",
                    "Country": "México"
                }
            elif self.issuer_rfc == "RARF9311211S9":
                # Certificado real (Av. Hidalgo 77, 06300, CDMX)
                receiver_rfc = "RARF9311211S9"
                receiver_name = nombre_emisor
                receiver_zip = self.expedition_zip or "06300"
                receiver_regime = self.issuer_regime or "605"
                receiver_address = {
                    "Street": "Av. Hidalgo",
                    "ExteriorNumber": "77",
                    "InteriorNumber": "",
                    "Neighborhood": "Guerrero",
                    "ZipCode": "06300",
                    "Municipality": "CUAUHTEMOC",
                    "State": "Ciudad de México",
                    "Country": "México"
                }
            else:
                receiver_rfc = self.issuer_rfc or "EKU9003173C9"
                receiver_name = nombre_emisor
                receiver_zip = self.expedition_zip or "06300"
                receiver_regime = self.issuer_regime or "605"
                receiver_address = None
            factura_data = {
                "Serie": "P",
                "Folio": 1,
                "CfdiType": "I",
                "ExpeditionPlace": self.expedition_zip,
                "PaymentMethod": "PUE",
                "PaymentForm": "01",
                "Currency": "MXN",
                "Issuer": {
                    "FiscalRegime": self.issuer_regime
                },
                "Receiver": {
                    "Rfc": receiver_rfc,
                    "Name": receiver_name,
                    "CfdiUse": "G03",
                    "FiscalRegime": receiver_regime,
                    "TaxZipCode": receiver_zip
                },
                "Items": [
                    {
                        "ProductCode": "84111506",
                        "Description": descripcion,
                        "Unit": "Servicio",
                        "UnitCode": "E48",
                        "UnitPrice": monto,
                        "Quantity": 1,
                        "Subtotal": monto,
                        "TaxObject": "02",
                        "Taxes": [
                            {
                                "Total": iva,
                                "Name": "IVA",
                                "Base": monto,
                                "Rate": 0.16,
                                "IsRetention": False
                            }
                        ],
                        "Total": total
                    }
                ],
                "SubTotal": monto,
                "Total": total
            }
            if self.issuer_rfc:
                factura_data["Issuer"]["Rfc"] = self.issuer_rfc
            factura_data["Issuer"]["Name"] = nombre_emisor
            if self.expedition_zip:
                factura_data["Issuer"]["TaxZipCode"] = self.expedition_zip
            if receiver_address:
                factura_data["Receiver"]["Address"] = receiver_address
            
            print("Datos enviados:")
            print(json.dumps(factura_data, indent=2))
            
            factura_response = requests.post(
                f"{self.base_url}api-lite/3/cfdis",
                auth=self.auth,
                headers=self.headers,
                json=factura_data
            )
            
            print(f"Código: {factura_response.status_code}")
            print(f"Respuesta: {factura_response.text}")
            
            if factura_response.status_code in [200, 201]:
                try:
                    resultado = factura_response.json()
                    if isinstance(resultado, dict) and resultado.get("success") is False:
                        return {"exito": False, "error": resultado.get("msj") or resultado}
                    return {
                        "exito": True,
                        "uuid": resultado.get("Id"),
                        "folio": resultado.get("Folio"),
                        "url_pdf": resultado.get("PdfUrl"),
                        "url_xml": resultado.get("XmlUrl"),
                        "mensaje": "✅ Factura timbrada exitosamente"
                    }
                except Exception as parse_err:
                    return {"exito": False, "error": str(parse_err) or factura_response.text}
            else:
                err_text = factura_response.text or ""
                if factura_response.status_code == 401:
                    err_text = "Credenciales incorrectas. Revisa FACTURAMA_USER y FACTURAMA_PASSWORD en config_instituto.json."
                elif "certificado" in err_text.lower() or "csd" in err_text.lower() or "certificate" in err_text.lower():
                    err_text += "\n\n💡 En Facturama (api-lite) debes subir el CSD del emisor antes de timbrar. Usa la función subir_csd() o el portal de Facturama."
                return {"exito": False, "error": err_text}
                
        except Exception as e:
            print(f"Excepcion: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"exito": False, "error": str(e)}
