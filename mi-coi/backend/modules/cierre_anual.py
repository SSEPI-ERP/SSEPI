from __future__ import annotations

import os
import shutil
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from config import get_db_path
from backend.models.polizas import SistemaPolizas
from backend.modules.periodos_bloqueados import PeriodosBloqueados


class CierreAnual:
    """
    Cierre anual completo (base funcional):
    - Respaldo obligatorio de la BD
    - Póliza DIARIO de cierre de resultados (4/5/6) contra cuenta utilidad/pérdida
    - Póliza DIARIO de apertura (1/2/3) al 01/01 del siguiente año
    - Bloqueo de los 12 meses del ejercicio

    Nota: genera pólizas en estatus 'C' (capturada). El usuario puede Verificar/Afectar después.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        self.polizas = SistemaPolizas(db_path=self.db_path)

    def respaldar_bd(self, *, out_dir: Optional[str] = None) -> Dict[str, Any]:
        src = self.db_path
        if not os.path.isfile(src):
            return {"exito": False, "error": "BD no encontrada."}
        out_dir = out_dir or os.path.join(os.path.dirname(src), "backups")
        os.makedirs(out_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        dst = os.path.join(out_dir, f"contabilidad_backup_{ts}.db")
        try:
            shutil.copy2(src, dst)
            return {"exito": True, "archivo": dst}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def _tabla_existe(self, cur: sqlite3.Cursor, name: str) -> bool:
        try:
            cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,))
            return bool(cur.fetchone())
        except sqlite3.Error:
            return False

    def _saldos_periodo_12(self, ejercicio: int) -> List[Dict[str, Any]]:
        """
        Saldos finales al periodo 12 del ejercicio:
        preferencia: saldos_cuenta (motor fase 1), fallback: saldos_mensuales.
        """
        ejercicio = int(ejercicio)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if self._tabla_existe(cur, "saldos_cuenta"):
                cur.execute(
                    """
                    SELECT
                        c.num_cuenta,
                        COALESCE(c.nombre_cuenta,'') as nombre_cuenta,
                        COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                        COALESCE(s.saldo_final_mn,0) as saldo_final
                    FROM catalogo_cuentas c
                    LEFT JOIN saldos_cuenta s
                      ON s.num_cuenta = c.num_cuenta AND s.ejercicio = ? AND s.periodo = 12
                    ORDER BY c.num_cuenta
                    """,
                    (ejercicio,),
                )
                return [dict(r) for r in cur.fetchall()]

            # fallback legacy
            cur.execute(
                """
                SELECT
                    c.num_cuenta,
                    COALESCE(c.nombre_cuenta,'') as nombre_cuenta,
                    COALESCE(c.naturaleza,'DEUDORA') as naturaleza,
                    COALESCE(s.saldo_final,0) as saldo_final
                FROM catalogo_cuentas c
                LEFT JOIN saldos_mensuales s
                  ON s.num_cuenta = c.num_cuenta AND s.anio = ? AND s.mes = 12
                ORDER BY c.num_cuenta
                """,
                (ejercicio,),
            )
            return [dict(r) for r in cur.fetchall()]

    def previsualizar(
        self,
        *,
        ejercicio: int,
        cuenta_utilidad: str,
        fecha_cierre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Calcula movimientos propuestos para póliza cierre y apertura.
        """
        ejercicio = int(ejercicio)
        cuenta_utilidad = (cuenta_utilidad or "").strip()
        if not cuenta_utilidad:
            return {"exito": False, "error": "Cuenta utilidad/pérdida requerida."}
        fecha_cierre = (fecha_cierre or f"{ejercicio}-12-31")[:10]
        try:
            datetime.strptime(fecha_cierre, "%Y-%m-%d")
        except Exception:
            return {"exito": False, "error": "fecha_cierre inválida (YYYY-MM-DD)."}

        saldos = self._saldos_periodo_12(ejercicio)
        # Cuentas de resultados: 4/5/6
        cierre_movs: List[Dict[str, Any]] = []
        utilidad_neta = 0.0  # positiva = utilidad, negativa = pérdida

        for r in saldos:
            num = str(r.get("num_cuenta") or "").strip()
            if not num:
                continue
            head = num.split(".", 1)[0].strip()
            if not head or head[0] not in ("4", "5", "6"):
                continue
            saldo = float(r.get("saldo_final") or 0.0)
            if abs(saldo) < 0.01:
                continue
            nat = str(r.get("naturaleza") or "DEUDORA").upper().strip()
            # saldo_final ya viene con signo según naturaleza (motor), pero igual manejamos signo:
            # Queremos dejarla en 0. Se hace asiento contrario al saldo.
            if saldo > 0:
                # si saldo positivo y DEUDORA: tiene cargo -> cerrar con abono
                # si saldo positivo y ACREEDORA: tiene abono -> cerrar con cargo
                if nat == "ACREEDORA":
                    cierre_movs.append({"num_cuenta": num, "concepto": "Cierre anual resultados", "cargo": saldo, "abono": 0.0})
                else:
                    cierre_movs.append({"num_cuenta": num, "concepto": "Cierre anual resultados", "cargo": 0.0, "abono": saldo})
            else:
                amt = abs(saldo)
                if nat == "ACREEDORA":
                    cierre_movs.append({"num_cuenta": num, "concepto": "Cierre anual resultados", "cargo": 0.0, "abono": amt})
                else:
                    cierre_movs.append({"num_cuenta": num, "concepto": "Cierre anual resultados", "cargo": amt, "abono": 0.0})

            # Utilidad neta: ingresos (4) normalmente acreedor, gastos (5/6) deudor.
            # Usamos regla simple por dígito:
            if head[0] == "4":
                utilidad_neta += saldo
            else:
                utilidad_neta -= saldo

        # Contrapartida a cuenta utilidad/pérdida
        if abs(utilidad_neta) >= 0.01:
            if utilidad_neta > 0:
                # utilidad: cuenta utilidad (acreedor) -> abono
                cierre_movs.append({"num_cuenta": cuenta_utilidad, "concepto": "Utilidad del ejercicio", "cargo": 0.0, "abono": utilidad_neta})
            else:
                amt = abs(utilidad_neta)
                cierre_movs.append({"num_cuenta": cuenta_utilidad, "concepto": "Pérdida del ejercicio", "cargo": amt, "abono": 0.0})

        # Apertura: cuentas de balance 1/2/3 a 01/01 siguiente
        fecha_apertura = f"{ejercicio + 1}-01-01"
        apertura_movs: List[Dict[str, Any]] = []
        for r in saldos:
            num = str(r.get("num_cuenta") or "").strip()
            if not num:
                continue
            head = num.split(".", 1)[0].strip()
            if not head or head[0] not in ("1", "2", "3"):
                continue
            saldo = float(r.get("saldo_final") or 0.0)
            if abs(saldo) < 0.01:
                continue
            nat = str(r.get("naturaleza") or "DEUDORA").upper().strip()
            # Registrar saldo inicial igual al saldo final
            if saldo > 0:
                if nat == "ACREEDORA":
                    apertura_movs.append({"num_cuenta": num, "concepto": "Apertura ejercicio", "cargo": 0.0, "abono": saldo})
                else:
                    apertura_movs.append({"num_cuenta": num, "concepto": "Apertura ejercicio", "cargo": saldo, "abono": 0.0})
            else:
                amt = abs(saldo)
                if nat == "ACREEDORA":
                    apertura_movs.append({"num_cuenta": num, "concepto": "Apertura ejercicio", "cargo": amt, "abono": 0.0})
                else:
                    apertura_movs.append({"num_cuenta": num, "concepto": "Apertura ejercicio", "cargo": 0.0, "abono": amt})

        def tot(movs: List[Dict[str, Any]]) -> Tuple[float, float]:
            tc = sum(float(x.get("cargo") or 0.0) for x in movs)
            ta = sum(float(x.get("abono") or 0.0) for x in movs)
            return tc, ta

        c_tc, c_ta = tot(cierre_movs)
        a_tc, a_ta = tot(apertura_movs)

        return {
            "exito": True,
            "ejercicio": ejercicio,
            "fecha_cierre": fecha_cierre,
            "fecha_apertura": fecha_apertura,
            "cuenta_utilidad": cuenta_utilidad,
            "utilidad_neta": utilidad_neta,
            "cierre": {"movimientos": cierre_movs, "tot_cargo": c_tc, "tot_abono": c_ta},
            "apertura": {"movimientos": apertura_movs, "tot_cargo": a_tc, "tot_abono": a_ta},
        }

    def ejecutar(
        self,
        *,
        ejercicio: int,
        cuenta_utilidad: str,
        usuario: str = "Sistema",
        fecha_cierre: Optional[str] = None,
        hacer_respaldo: bool = True,
        bloquear_periodos: bool = True,
    ) -> Dict[str, Any]:
        ejercicio = int(ejercicio)
        cuenta_utilidad = (cuenta_utilidad or "").strip()
        prev = self.previsualizar(ejercicio=ejercicio, cuenta_utilidad=cuenta_utilidad, fecha_cierre=fecha_cierre)
        if not prev.get("exito"):
            return prev

        # Respaldo
        backup_path = None
        if hacer_respaldo:
            r = self.respaldar_bd()
            if not r.get("exito"):
                return {"exito": False, "error": f"No se pudo respaldar BD: {r.get('error')}"}
            backup_path = r.get("archivo")

        # Recalcular saldos antes
        try:
            self.polizas.recalcular_saldos_mensuales()
        except Exception:
            pass

        # Generar pólizas (capturadas)
        cierre_movs = prev["cierre"]["movimientos"]
        apertura_movs = prev["apertura"]["movimientos"]

        # Validar cuadre
        if abs(float(prev["cierre"]["tot_cargo"]) - float(prev["cierre"]["tot_abono"])) > 0.01:
            return {"exito": False, "error": "La póliza de cierre no cuadra (revise cuenta utilidad y saldos)."}
        if abs(float(prev["apertura"]["tot_cargo"]) - float(prev["apertura"]["tot_abono"])) > 0.01:
            return {"exito": False, "error": "La póliza de apertura no cuadra (revise saldos de balance)."}

        r_cierre = {"exito": True, "poliza_id": None}
        r_ap = {"exito": True, "poliza_id": None}

        if cierre_movs:
            r_cierre = self.polizas.crear_poliza(
                "DIARIO",
                prev["fecha_cierre"],
                f"Cierre anual {ejercicio} (Resultados)",
                cierre_movs,
                moneda="MXN",
                tipo_cambio=1.0,
                estatus="C",
            )
            if not r_cierre.get("exito"):
                return {"exito": False, "error": f"Error póliza cierre: {r_cierre.get('error')}", "backup": backup_path}

        if apertura_movs:
            r_ap = self.polizas.crear_poliza(
                "DIARIO",
                prev["fecha_apertura"],
                f"Apertura ejercicio {ejercicio + 1}",
                apertura_movs,
                moneda="MXN",
                tipo_cambio=1.0,
                estatus="C",
            )
            if not r_ap.get("exito"):
                return {"exito": False, "error": f"Error póliza apertura: {r_ap.get('error')}", "backup": backup_path}

        # Bloqueo periodos (12 meses)
        bloqueados = 0
        if bloquear_periodos:
            pb = PeriodosBloqueados(db_path=self.db_path)
            for mes in range(1, 13):
                rr = pb.bloquear(ejercicio, mes, usuario)
                if rr.get("exito"):
                    bloqueados += 1

        return {
            "exito": True,
            "backup": backup_path,
            "poliza_cierre_id": r_cierre.get("poliza_id"),
            "poliza_apertura_id": r_ap.get("poliza_id"),
            "periodos_bloqueados": bloqueados,
        }

