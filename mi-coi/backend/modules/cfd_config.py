import json
import os
import shutil
from typing import Dict, List, Tuple


class CFDConfigManager:
    """Gestiona configuración CFD/CSD en config_instituto.json y carpeta csd."""

    def __init__(self, project_root: str):
        self.project_root = project_root
        self.config_path = os.path.join(project_root, "config_instituto.json")
        self.csd_dir = os.path.join(project_root, "csd")
        os.makedirs(self.csd_dir, exist_ok=True)

    def load(self) -> Dict:
        if not os.path.isfile(self.config_path):
            return {}
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f) or {}
        except Exception:
            return {}

    def save(self, updates: Dict) -> Tuple[bool, str]:
        data = self.load()
        data.update(updates or {})
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True, "Configuración CFD guardada."
        except Exception as e:
            return False, f"No se pudo guardar configuración: {e}"

    def copy_csd_files(self, cer_source: str = "", key_source: str = "") -> Tuple[str, str]:
        cer_dest = ""
        key_dest = ""
        if cer_source and os.path.isfile(cer_source):
            cer_dest = os.path.join(self.csd_dir, os.path.basename(cer_source))
            shutil.copy2(cer_source, cer_dest)
        if key_source and os.path.isfile(key_source):
            key_dest = os.path.join(self.csd_dir, os.path.basename(key_source))
            shutil.copy2(key_source, key_dest)
        return cer_dest, key_dest

    def list_csd_files(self) -> List[Dict]:
        out: List[Dict] = []
        if not os.path.isdir(self.csd_dir):
            return out
        for root, _, files in os.walk(self.csd_dir):
            for name in files:
                low = name.lower()
                if not (low.endswith(".cer") or low.endswith(".key")):
                    continue
                path = os.path.join(root, name)
                out.append(
                    {
                        "nombre": name,
                        "tipo": "cer" if low.endswith(".cer") else "key",
                        "ruta": path,
                    }
                )
        out.sort(key=lambda x: (x["tipo"], x["nombre"]))
        return out

    def get_profile(self) -> Dict[str, str]:
        data = self.load()
        return {
            "rfc": (data.get("FINKOK_ISSUER_RFC") or data.get("FACTURAMA_ISSUER_RFC") or "").strip(),
            "razon_social": (data.get("FINKOK_ISSUER_NAME") or data.get("FACTURAMA_ISSUER_NAME") or "").strip(),
            "lugar_expedicion": (data.get("FINKOK_LUGAR_EXPEDICION") or data.get("FACTURAMA_EXPEDITION_ZIP") or "").strip(),
            "regimen_fiscal": (data.get("FINKOK_REGIMEN") or data.get("FACTURAMA_ISSUER_REGIME") or "").strip(),
            "csd_password": (data.get("CSD_PASSWORD") or "").strip(),
            "cer_path": (data.get("CSD_CER_PATH") or "").strip(),
            "key_path": (data.get("CSD_KEY_PATH") or "").strip(),
            "layout_base": (data.get("UI_LAYOUT_BASE") or "4-3-3").strip(),
        }

