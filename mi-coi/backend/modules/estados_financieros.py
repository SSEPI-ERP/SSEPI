"""
Estados financieros (motor completo) — COI-like.

Incluye:
- Estado de Resultados mensual y acumulado (YTD)
- Balance General a fecha de corte
- Flujo de Efectivo (método indirecto)
- Cambios en el Capital Contable
- Presentación comparativa (periodo vs periodo / año vs año)
- Formatos configurables persistidos en SQLite (orden de grupos, subtotales, mapeo de cuentas)

Este módulo está diseñado para ser consumido por la UI (frontend/main_window.py) sin aproximaciones:
retorna estructuras completas y consistentes, con secciones, renglones y totales.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

try:
    from config import get_db_path
except Exception:

    def get_db_path() -> str:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, "backend", "database", "contabilidad.db")


def _ultimo_dia_mes(mes: int, anio: int) -> int:
    mes = int(mes)
    anio = int(anio)
    if mes == 12:
        nxt = date(anio + 1, 1, 1)
    else:
        nxt = date(anio, mes + 1, 1)
    return int((nxt - timedelta(days=1)).day)


def _rango_mes(mes: int, anio: int) -> Tuple[str, str]:
    m = max(1, min(12, int(mes)))
    y = int(anio)
    ini = date(y, m, 1).strftime("%Y-%m-%d")
    fin = date(y, m, _ultimo_dia_mes(m, y)).strftime("%Y-%m-%d")
    return ini, fin


def _rango_ytd(mes: int, anio: int) -> Tuple[str, str]:
    m = max(1, min(12, int(mes)))
    y = int(anio)
    ini = date(y, 1, 1).strftime("%Y-%m-%d")
    fin = date(y, m, _ultimo_dia_mes(m, y)).strftime("%Y-%m-%d")
    return ini, fin


def _normalizar_moneda(moneda_reporte: str, tipo_cambio: float) -> Tuple[str, float]:
    mon = str(moneda_reporte or "MXN").strip().upper() or "MXN"
    tc = abs(float(tipo_cambio or 1.0))
    if tc <= 0:
        tc = 1.0
    return mon, tc


def _conv_monto_mxn(monto_mxn: float, moneda_reporte: str, tipo_cambio: float) -> float:
    mon, tc = _normalizar_moneda(moneda_reporte, tipo_cambio)
    v = float(monto_mxn or 0.0)
    if mon == "MXN":
        return v
    return v / tc


def _where_poliza_no_cancelada(cur: sqlite3.Cursor) -> str:
    """Incluye C/V/A; excluye canceladas (X) cuando la columna existe."""
    cur.execute("PRAGMA table_info(polizas)")
    cols = [r[1] for r in cur.fetchall()]
    if "estatus" not in cols:
        return ""
    return "AND UPPER(COALESCE(p.estatus,'C')) != 'X'"


def _tabla_existe(cur: sqlite3.Cursor, nombre: str) -> bool:
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (nombre,))
    return cur.fetchone() is not None


def _naturaleza_por_cuenta(cur: sqlite3.Cursor) -> Dict[str, str]:
    cur.execute("SELECT num_cuenta, COALESCE(naturaleza,'DEUDORA') FROM catalogo_cuentas")
    return {str(r[0]): str(r[1] or "DEUDORA").upper().strip() for r in cur.fetchall() if r and r[0]}


def _sum_delta_por_naturaleza(nat: str, debe: float, haber: float) -> float:
    """
    Convierte movimientos (debe/haber) a delta de saldo:
    - Naturaleza DEUDORA: +debe -haber
    - Naturaleza ACREEDORA: +haber -debe
    """
    nat = (nat or "DEUDORA").upper().strip()
    d = float(debe or 0.0)
    h = float(haber or 0.0)
    return (h - d) if nat == "ACREEDORA" else (d - h)


@dataclass(frozen=True)
class LineaEstado:
    key: str
    label: str
    monto: float


class EstadosFinancierosManager:
    """
    Motor de estados financieros con formatos configurables.

    NOTA: por diseño, todas las funciones pueden operar en:
    - Global (sin centro)
    - Por centro de costo (centro_costo_id) usando partidas_poliza.centro_costo_id
      y acumulando saldos por movimientos (ya que saldos_cuenta es global).
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_db_path()
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS estados_formatos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tipo TEXT NOT NULL,            -- 'ER','BG','FE','CC'
                    nombre TEXT NOT NULL,
                    json_config TEXT NOT NULL,
                    creado_en TEXT NOT NULL,
                    actualizado_en TEXT NOT NULL,
                    UNIQUE(tipo, nombre)
                )
                """
            )
            conn.commit()

    # ---------------------------
    # Formatos configurables
    # ---------------------------
    def guardar_formato(self, tipo: str, nombre: str, config: Dict[str, Any]) -> Dict[str, Any]:
        tipo = (tipo or "").strip().upper()
        nombre = (nombre or "").strip()
        if tipo not in ("ER", "BG", "FE", "CC"):
            return {"exito": False, "error": "Tipo inválido (use ER, BG, FE, CC)."}
        if not nombre:
            return {"exito": False, "error": "Nombre requerido."}
        try:
            js = json.dumps(config or {}, ensure_ascii=False)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO estados_formatos(tipo,nombre,json_config,creado_en,actualizado_en)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(tipo,nombre) DO UPDATE SET
                        json_config=excluded.json_config,
                        actualizado_en=excluded.actualizado_en
                    """,
                    (tipo, nombre, js, now, now),
                )
                conn.commit()
            return {"exito": True}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def listar_formatos(self, tipo: str) -> List[Dict[str, Any]]:
        tipo = (tipo or "").strip().upper()
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT tipo,nombre,creado_en,actualizado_en
                    FROM estados_formatos
                    WHERE tipo = ?
                    ORDER BY nombre
                    """,
                    (tipo,),
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []

    def obtener_formato(self, tipo: str, nombre: str) -> Dict[str, Any]:
        tipo = (tipo or "").strip().upper()
        nombre = (nombre or "").strip()
        if not tipo or not nombre:
            return {}
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    "SELECT json_config FROM estados_formatos WHERE tipo=? AND nombre=? LIMIT 1",
                    (tipo, nombre),
                )
                row = cur.fetchone()
                if not row:
                    return {}
                try:
                    return json.loads(row["json_config"] or "{}") or {}
                except Exception:
                    return {}
        except Exception:
            return {}

    def formato_default(self, tipo: str) -> Dict[str, Any]:
        """
        Default completo y editable. El usuario puede guardarlo con guardar_formato().
        """
        tipo = (tipo or "").strip().upper()
        if tipo == "ER":
            return {
                "grupos": [
                    {"key": "ingresos", "label": "Ingresos", "prefijos": ["4"]},
                    {"key": "costo", "label": "Costo de ventas", "prefijos": ["5"]},
                    {"key": "gastos", "label": "Gastos operativos", "prefijos": ["6"]},
                    {"key": "otros_ing", "label": "Otros ingresos", "prefijos": ["71", "72", "73", "74", "75", "76", "77", "78", "79"]},
                    {"key": "otros_gas", "label": "Otros gastos", "prefijos": ["70"]},
                    {"key": "isr", "label": "ISR", "prefijos": []},  # configurar prefijos o cuentas específicas si aplica
                ],
                "renglones": [
                    {"key": "utilidad_bruta", "label": "Utilidad bruta", "formula": "ingresos - costo"},
                    {"key": "utilidad_operacion", "label": "Utilidad de operación", "formula": "utilidad_bruta - gastos"},
                    {"key": "utilidad_antes_isr", "label": "Utilidad antes de ISR", "formula": "utilidad_operacion + otros_ing - otros_gas"},
                    {"key": "utilidad_neta", "label": "Utilidad neta", "formula": "utilidad_antes_isr - isr"},
                ],
                "precision": 2,
            }
        if tipo == "BG":
            return {
                "grupos": [
                    {"key": "activo", "label": "Activo", "prefijos": ["1"]},
                    {"key": "pasivo", "label": "Pasivo", "prefijos": ["2"]},
                    {"key": "capital", "label": "Capital contable", "prefijos": ["3"]},
                ],
                "precision": 2,
            }
        if tipo == "FE":
            # Flujo indirecto: util neta + no efectivo +/- variación capital trabajo.
            return {
                "efectivo_prefijos": ["101", "102", "1101", "1102"],
                "no_efectivo": [
                    {"key": "depreciacion", "label": "Depreciación y amortización", "prefijos": ["681", "682", "683", "684"]},
                ],
                "capital_trabajo": [
                    {"key": "clientes", "label": "Variación en cuentas por cobrar (Clientes)", "prefijos": ["115"]},
                    {"key": "inventarios", "label": "Variación en inventarios", "prefijos": ["113", "114"]},
                    {"key": "proveedores", "label": "Variación en proveedores", "prefijos": ["201"]},
                    {"key": "impuestos", "label": "Variación en impuestos por pagar/cobrar", "prefijos": ["208", "209", "118"]},
                ],
                "precision": 2,
            }
        if tipo == "CC":
            return {
                "capital_prefijos": ["3"],
                "aportaciones_prefijos": ["301", "302"],
                "retiros_prefijos": ["303"],
                "dividendos_prefijos": ["304"],
                "precision": 2,
            }
        return {}

    # ---------------------------
    # Capa de datos (movimientos / saldos)
    # ---------------------------
    def _sumas_por_prefijos_mov(
        self,
        fecha_ini: str,
        fecha_fin: str,
        prefijos: List[str],
        *,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, Dict[str, float]]:
        """
        Regresa dict por num_cuenta: {debe, haber} acumulados en el rango.
        Fuente:
        - Si existe partidas_poliza: usa pp.cargo_mn/abono_mn y filtra por centro_costo_id.
        - Si no: usa movimientos con p.fecha y filtra por movimientos.centro_costo_id si existe.
        """
        prefijos = [str(p).strip() for p in (prefijos or []) if str(p).strip()]
        if not prefijos:
            return {}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            where_est = _where_poliza_no_cancelada(cur)
            nat_map = _naturaleza_por_cuenta(cur)  # for completeness
            out: Dict[str, Dict[str, float]] = {}

            if _tabla_existe(cur, "partidas_poliza"):
                # Filtrado por prefijo con ORs
                likes = " OR ".join(["pp.num_cuenta LIKE ?" for _ in prefijos])
                params: List[Any] = [fecha_ini, fecha_fin] + [f"{p}%" for p in prefijos]
                where_cc = ""
                if centro_costo_id is not None:
                    where_cc = " AND pp.centro_costo_id = ? "
                    params.append(int(centro_costo_id))
                cur.execute(
                    f"""
                    SELECT
                      pp.num_cuenta AS num_cuenta,
                      COALESCE(SUM(COALESCE(pp.cargo_mn, pp.cargo, 0)),0) AS debe,
                      COALESCE(SUM(COALESCE(pp.abono_mn, pp.abono, 0)),0) AS haber
                    FROM partidas_poliza pp
                    JOIN polizas p ON p.id = pp.id_poliza
                    WHERE p.fecha BETWEEN ? AND ?
                      AND ({likes})
                      {where_cc}
                      {where_est}
                    GROUP BY pp.num_cuenta
                    ORDER BY pp.num_cuenta
                    """,
                    params,
                )
            else:
                likes = " OR ".join(["m.num_cuenta LIKE ?" for _ in prefijos])
                params2: List[Any] = [fecha_ini, fecha_fin] + [f"{p}%" for p in prefijos]
                # movimientos.centro_costo_id puede no existir
                where_cc2 = ""
                try:
                    cur.execute("PRAGMA table_info(movimientos)")
                    mcols = [r[1] for r in cur.fetchall()]
                except Exception:
                    mcols = []
                if centro_costo_id is not None and "centro_costo_id" in mcols:
                    where_cc2 = " AND m.centro_costo_id = ? "
                    params2.append(int(centro_costo_id))
                cur.execute(
                    f"""
                    SELECT
                      m.num_cuenta AS num_cuenta,
                      COALESCE(SUM(COALESCE(m.cargo,0)),0) AS debe,
                      COALESCE(SUM(COALESCE(m.abono,0)),0) AS haber
                    FROM movimientos m
                    JOIN polizas p ON p.id = m.poliza_id
                    WHERE p.fecha BETWEEN ? AND ?
                      AND ({likes})
                      {where_cc2}
                      {where_est}
                    GROUP BY m.num_cuenta
                    ORDER BY m.num_cuenta
                    """,
                    params2,
                )

            for r in cur.fetchall():
                nc = str(r["num_cuenta"] or "").strip()
                if not nc:
                    continue
                out[nc] = {"debe": float(r["debe"] or 0.0), "haber": float(r["haber"] or 0.0)}
                # nat_map exists; not returned here
                _ = nat_map.get(nc)
            return out

    def _saldos_corte_global(self, periodo: int, ejercicio: int, prefijos: List[str]) -> Dict[str, float]:
        """
        Saldos a corte usando motor saldos_cuenta (global).
        Retorna dict cuenta -> saldo_final_mn.
        """
        prefijos = [str(p).strip() for p in (prefijos or []) if str(p).strip()]
        if not prefijos:
            return {}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if not _tabla_existe(cur, "saldos_cuenta"):
                return {}
            likes = " OR ".join(["s.num_cuenta LIKE ?" for _ in prefijos])
            params: List[Any] = [int(ejercicio), int(periodo)] + [f"{p}%" for p in prefijos]
            cur.execute(
                f"""
                SELECT s.num_cuenta, COALESCE(s.saldo_final_mn,0) AS saldo_final
                FROM saldos_cuenta s
                WHERE s.ejercicio = ? AND s.periodo = ?
                  AND ({likes})
                ORDER BY s.num_cuenta
                """,
                params,
            )
            return {str(r["num_cuenta"]): float(r["saldo_final"] or 0.0) for r in cur.fetchall() if r["num_cuenta"]}

    def _saldos_corte_por_movimientos(
        self,
        fecha_ini: str,
        fecha_fin: str,
        prefijos: List[str],
        *,
        centro_costo_id: Optional[int] = None,
    ) -> Dict[str, float]:
        """
        Saldos a corte por acumulación de movimientos en rango (para centro de costo).
        Retorna dict cuenta -> delta (debe/haber ajustado por naturaleza) en el rango.
        """
        prefijos = [str(p).strip() for p in (prefijos or []) if str(p).strip()]
        if not prefijos:
            return {}
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            nat_map = _naturaleza_por_cuenta(cur)
            mov = self._sumas_por_prefijos_mov(
                fecha_ini,
                fecha_fin,
                prefijos,
                centro_costo_id=centro_costo_id,
            )
            out: Dict[str, float] = {}
            for nc, v in mov.items():
                nat = nat_map.get(nc, "DEUDORA")
                out[nc] = _sum_delta_por_naturaleza(nat, v.get("debe", 0.0), v.get("haber", 0.0))
            return out

    # ---------------------------
    # Estado de Resultados
    # ---------------------------
    def estado_resultados(
        self,
        mes: int,
        anio: int,
        *,
        acumulado: bool = False,
        centro_costo_id: Optional[int] = None,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        formato_nombre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Estado de Resultados completo:
        - mensual: movimientos del mes
        - acumulado: movimientos YTD (01..mes)
        Calcula utilidad bruta, operación y neta (incluye renglón ISR configurado si el formato lo define).
        """
        m = max(1, min(12, int(mes)))
        y = int(anio)
        mon, tc = _normalizar_moneda(moneda_reporte, tipo_cambio)

        cfg = self.obtener_formato("ER", formato_nombre) if formato_nombre else {}
        if not cfg:
            cfg = self.formato_default("ER")
        grupos = list(cfg.get("grupos") or [])
        renglones = list(cfg.get("renglones") or [])

        f_ini, f_fin = _rango_ytd(m, y) if acumulado else _rango_mes(m, y)

        # Naturalezas para convertir a delta.
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            nat_map = _naturaleza_por_cuenta(cur)

        valores: Dict[str, float] = {}
        detalle_grupos: List[Dict[str, Any]] = []
        for g in grupos:
            key = str(g.get("key") or "").strip()
            label = str(g.get("label") or key)
            prefijos = list(g.get("prefijos") or [])
            if not key:
                continue
            mov = self._sumas_por_prefijos_mov(f_ini, f_fin, prefijos, centro_costo_id=centro_costo_id)
            monto = 0.0
            # Sumamos delta por naturaleza por cuenta
            for nc, dv in mov.items():
                nat = nat_map.get(nc, "DEUDORA")
                monto += _sum_delta_por_naturaleza(nat, dv.get("debe", 0.0), dv.get("haber", 0.0))
            monto = _conv_monto_mxn(monto, mon, tc)
            valores[key] = monto
            detalle_grupos.append(
                {
                    "key": key,
                    "label": label,
                    "monto": float(monto),
                    "prefijos": prefijos,
                    "rango": {"inicio": f_ini, "fin": f_fin},
                }
            )

        # Evaluación de fórmulas soportadas (limitadas y determinísticas).
        def _eval_formula(expr: str, env: Dict[str, float]) -> float:
            allowed = set(env.keys())
            safe = str(expr or "").strip()
            # solo tokens simples: keys, +, -, *, /, paréntesis y espacios
            for ch in safe:
                if ch.isalnum() or ch in " _+-*/().":
                    continue
                raise ValueError("Fórmula contiene caracteres no permitidos.")
            # reemplazar keys por env['key'] de forma simple
            # Permitimos que la key aparezca como identificador separado por espacios u operadores.
            # Construimos un dict local y evaluamos con __builtins__ vacío.
            loc = {k: float(env.get(k) or 0.0) for k in allowed}
            return float(eval(safe, {"__builtins__": {}}, loc))  # noqa: S307 (intencional y acotado)

        lineas: List[Dict[str, Any]] = []
        for r in renglones:
            k = str(r.get("key") or "").strip()
            lbl = str(r.get("label") or k)
            formula = str(r.get("formula") or "").strip()
            if not k or not formula:
                continue
            try:
                val = _eval_formula(formula, valores)
            except Exception:
                val = 0.0
            valores[k] = float(val)
            lineas.append({"key": k, "label": lbl, "monto": float(val), "formula": formula})

        precision = int(cfg.get("precision") or 2)

        return {
            "exito": True,
            "tipo": "ER",
            "mes": m,
            "anio": y,
            "acumulado": bool(acumulado),
            "rango": {"inicio": f_ini, "fin": f_fin},
            "centro_costo_id": int(centro_costo_id) if centro_costo_id is not None else None,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "precision": precision,
            "grupos": detalle_grupos,
            "renglones": lineas,
            "totales": {
                "ingresos": float(valores.get("ingresos") or 0.0),
                "costo": float(valores.get("costo") or 0.0),
                "gastos": float(valores.get("gastos") or 0.0),
                "otros_ing": float(valores.get("otros_ing") or 0.0),
                "otros_gas": float(valores.get("otros_gas") or 0.0),
                "isr": float(valores.get("isr") or 0.0),
                "utilidad_bruta": float(valores.get("utilidad_bruta") or 0.0),
                "utilidad_operacion": float(valores.get("utilidad_operacion") or 0.0),
                "utilidad_antes_isr": float(valores.get("utilidad_antes_isr") or 0.0),
                "utilidad_neta": float(valores.get("utilidad_neta") or 0.0),
            },
            "formato": {"nombre": formato_nombre or "DEFAULT", "config": cfg},
        }

    # ---------------------------
    # Balance General
    # ---------------------------
    def balance_general(
        self,
        fecha_corte: str,
        *,
        centro_costo_id: Optional[int] = None,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        formato_nombre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Balance General completo.

        - Global: usa saldos_cuenta (si existe), sino saldos_mensuales.
        - Por centro: calcula saldos acumulando movimientos desde inicio del ejercicio hasta la fecha_corte.
        """
        mon, tc = _normalizar_moneda(moneda_reporte, tipo_cambio)
        try:
            fobj = datetime.strptime(fecha_corte, "%Y-%m-%d").date()
        except Exception:
            return {"exito": False, "error": "Fecha inválida (use AAAA-MM-DD)."}

        cfg = self.obtener_formato("BG", formato_nombre) if formato_nombre else {}
        if not cfg:
            cfg = self.formato_default("BG")
        grupos = list(cfg.get("grupos") or [])

        # prefijos del formato
        pref_act = next((g.get("prefijos") for g in grupos if g.get("key") == "activo"), ["1"])
        pref_pas = next((g.get("prefijos") for g in grupos if g.get("key") == "pasivo"), ["2"])
        pref_cap = next((g.get("prefijos") for g in grupos if g.get("key") == "capital"), ["3"])

        y = int(fobj.year)
        m = int(fobj.month)
        # Para centro acumulamos desde 1/enero hasta fecha corte
        if centro_costo_id is not None:
            ini = date(y, 1, 1).strftime("%Y-%m-%d")
            fin = fobj.strftime("%Y-%m-%d")
            act_map = self._saldos_corte_por_movimientos(ini, fin, list(pref_act), centro_costo_id=centro_costo_id)
            pas_map = self._saldos_corte_por_movimientos(ini, fin, list(pref_pas), centro_costo_id=centro_costo_id)
            cap_map = self._saldos_corte_por_movimientos(ini, fin, list(pref_cap), centro_costo_id=centro_costo_id)
            activo = sum(float(v or 0.0) for v in act_map.values())
            pasivo = sum(float(v or 0.0) for v in pas_map.values())
            capital = sum(float(v or 0.0) for v in cap_map.values())
        else:
            # Preferimos saldos_cuenta por periodo (mes de la fecha corte).
            act_map = self._saldos_corte_global(m, y, list(pref_act))
            pas_map = self._saldos_corte_global(m, y, list(pref_pas))
            cap_map = self._saldos_corte_global(m, y, list(pref_cap))
            if not act_map and not pas_map and not cap_map:
                # Fallback saldos_mensuales (si no existe motor)
                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    cur = conn.cursor()
                    likes = lambda alias, pf: " OR ".join([f"{alias}.num_cuenta LIKE ?" for _ in pf])
                    def _sum_saldos(pref: List[str]) -> float:
                        pf = [str(p).strip() for p in pref if str(p).strip()]
                        if not pf:
                            return 0.0
                        cur.execute(
                            f"""
                            SELECT COALESCE(SUM(COALESCE(s.saldo_final,0)),0) AS s
                            FROM saldos_mensuales s
                            WHERE s.anio = ? AND s.mes = ?
                              AND ({likes('s', pf)})
                            """,
                            [y, m] + [f"{p}%" for p in pf],
                        )
                        rr = cur.fetchone()
                        return float((rr["s"] if rr else 0.0) or 0.0)
                    activo = _sum_saldos(list(pref_act))
                    pasivo = _sum_saldos(list(pref_pas))
                    capital = _sum_saldos(list(pref_cap))
            else:
                activo = sum(float(v or 0.0) for v in act_map.values())
                pasivo = sum(float(v or 0.0) for v in pas_map.values())
                capital = sum(float(v or 0.0) for v in cap_map.values())

        activo = _conv_monto_mxn(activo, mon, tc)
        pasivo = _conv_monto_mxn(pasivo, mon, tc)
        capital = _conv_monto_mxn(capital, mon, tc)
        total_pc = pasivo + capital
        dif = activo - total_pc

        precision = int(cfg.get("precision") or 2)
        return {
            "exito": True,
            "tipo": "BG",
            "fecha": fobj.strftime("%Y-%m-%d"),
            "periodo": {"mes": m, "anio": y},
            "centro_costo_id": int(centro_costo_id) if centro_costo_id is not None else None,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "precision": precision,
            "secciones": [
                {"key": "activo", "label": "Activo", "monto": float(activo)},
                {"key": "pasivo", "label": "Pasivo", "monto": float(pasivo)},
                {"key": "capital", "label": "Capital contable", "monto": float(capital)},
            ],
            "totales": {
                "activo": float(activo),
                "pasivo": float(pasivo),
                "capital": float(capital),
                "total_pasivo_capital": float(total_pc),
                "diferencia": float(dif),
                "cuadra": bool(abs(dif) <= 0.01),
            },
            "formato": {"nombre": formato_nombre or "DEFAULT", "config": cfg},
        }

    # ---------------------------
    # Flujo de Efectivo (Indirecto)
    # ---------------------------
    def flujo_efectivo_indirecto(
        self,
        mes: int,
        anio: int,
        *,
        centro_costo_id: Optional[int] = None,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        formato_nombre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Flujo de efectivo (método indirecto) YTD:
        - Utilidad neta YTD
        + Ajustes no efectivo (depreciación, amortización, etc.)
        +/- Variación capital de trabajo (activos operativos y pasivos operativos)
        = Flujo neto de operación

        Además calcula Efectivo inicial/final si el formato define prefijos de efectivo.
        """
        m = max(1, min(12, int(mes)))
        y = int(anio)
        mon, tc = _normalizar_moneda(moneda_reporte, tipo_cambio)

        cfg = self.obtener_formato("FE", formato_nombre) if formato_nombre else {}
        if not cfg:
            cfg = self.formato_default("FE")

        # Utilidad neta YTD
        er = self.estado_resultados(
            m,
            y,
            acumulado=True,
            centro_costo_id=centro_costo_id,
            moneda_reporte=mon,
            tipo_cambio=tc,
        )
        util_neta = float((er.get("totales") or {}).get("utilidad_neta") or 0.0)

        # Ajustes no efectivo por movimientos YTD
        f_ini, f_fin = _rango_ytd(m, y)
        ajustes: List[Dict[str, Any]] = []
        total_ajustes = 0.0
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            nat_map = _naturaleza_por_cuenta(cur)
        for adj in list(cfg.get("no_efectivo") or []):
            k = str(adj.get("key") or "").strip()
            lbl = str(adj.get("label") or k)
            pref = list(adj.get("prefijos") or [])
            mov = self._sumas_por_prefijos_mov(f_ini, f_fin, pref, centro_costo_id=centro_costo_id)
            val = 0.0
            for nc, dv in mov.items():
                nat = nat_map.get(nc, "DEUDORA")
                val += _sum_delta_por_naturaleza(nat, dv.get("debe", 0.0), dv.get("haber", 0.0))
            val = _conv_monto_mxn(val, mon, tc)
            ajustes.append({"key": k, "label": lbl, "monto": float(val), "prefijos": pref})
            total_ajustes += val

        # Variación capital de trabajo: fin - inicio (a nivel balance).
        # Para global, podemos comparar saldos_cuenta periodo 1 vs periodo m.
        # Para centro, comparamos acumulación por movimientos del mes 1..m vs mes 1..(m-1) pero requiere corte; usamos inicio ejercicio como base.
        # Estrategia:
        # - saldo_inicio = corte al último día del mes anterior (o 0 si enero)
        # - saldo_fin = corte al último día del mes m
        def _corte_fecha(mm: int) -> str:
            return date(y, mm, _ultimo_dia_mes(mm, y)).strftime("%Y-%m-%d")

        if m == 1:
            fecha_ini_corte = date(y, 1, 1).strftime("%Y-%m-%d")
            bg_ini = self.balance_general(fecha_ini_corte, centro_costo_id=centro_costo_id, moneda_reporte=mon, tipo_cambio=tc)
        else:
            bg_ini = self.balance_general(_corte_fecha(m - 1), centro_costo_id=centro_costo_id, moneda_reporte=mon, tipo_cambio=tc)
        bg_fin = self.balance_general(_corte_fecha(m), centro_costo_id=centro_costo_id, moneda_reporte=mon, tipo_cambio=tc)

        # Ahora calculamos variaciones de rubros definidos por prefijos (capital_trabajo).
        variaciones: List[Dict[str, Any]] = []
        total_variaciones = 0.0

        # Para obtener saldo por prefijos necesitamos detalle por prefijos, no solo total activo/pasivo/capital.
        # Implementamos un helper rápido que suma saldo por prefijos usando el mismo método del balance (global vs centro).
        def _saldo_prefijos_a_fecha(prefijos: List[str], fecha: str) -> float:
            try:
                fobj2 = datetime.strptime(fecha, "%Y-%m-%d").date()
            except Exception:
                return 0.0
            if centro_costo_id is not None:
                ini2 = date(fobj2.year, 1, 1).strftime("%Y-%m-%d")
                fin2 = fobj2.strftime("%Y-%m-%d")
                mp = self._saldos_corte_por_movimientos(ini2, fin2, prefijos, centro_costo_id=centro_costo_id)
                return float(sum(float(v or 0.0) for v in mp.values()))
            # global: saldos_cuenta por mes de corte
            mp2 = self._saldos_corte_global(int(fobj2.month), int(fobj2.year), prefijos)
            if mp2:
                return float(sum(float(v or 0.0) for v in mp2.values()))
            # fallback saldos_mensuales
            with sqlite3.connect(self.db_path) as conn2:
                cur2 = conn2.cursor()
                likes = " OR ".join(["s.num_cuenta LIKE ?" for _ in prefijos])
                cur2.execute(
                    f"""
                    SELECT COALESCE(SUM(COALESCE(s.saldo_final,0)),0)
                    FROM saldos_mensuales s
                    WHERE s.anio = ? AND s.mes = ? AND ({likes})
                    """,
                    [int(fobj2.year), int(fobj2.month)] + [f"{p}%" for p in prefijos],
                )
                rr = cur2.fetchone()
                return float((rr[0] if rr else 0.0) or 0.0)

        fecha_ini_var = (date(y, 1, 1).strftime("%Y-%m-%d") if m == 1 else _corte_fecha(m - 1))
        fecha_fin_var = _corte_fecha(m)

        for it in list(cfg.get("capital_trabajo") or []):
            k = str(it.get("key") or "").strip()
            lbl = str(it.get("label") or k)
            pref = list(it.get("prefijos") or [])
            s_ini = _conv_monto_mxn(_saldo_prefijos_a_fecha(pref, fecha_ini_var), mon, tc)
            s_fin = _conv_monto_mxn(_saldo_prefijos_a_fecha(pref, fecha_fin_var), mon, tc)
            var = float(s_fin - s_ini)
            # En método indirecto:
            # - Aumento en activo circulante consume efectivo => restar variación
            # - Aumento en pasivo circulante aporta efectivo => sumar variación
            # Deducimos signo por prefijo principal:
            # Si empieza con 1 => activo => impacto = -var
            # Si empieza con 2 => pasivo => impacto = +var
            head = str(pref[0])[:1] if pref else ""
            impacto = -var if head == "1" else (var if head == "2" else -var)
            variaciones.append(
                {
                    "key": k,
                    "label": lbl,
                    "saldo_ini": float(s_ini),
                    "saldo_fin": float(s_fin),
                    "variacion": float(var),
                    "impacto_flujo": float(impacto),
                    "prefijos": pref,
                }
            )
            total_variaciones += impacto

        flujo_operacion = util_neta + float(total_ajustes) + float(total_variaciones)

        # Efectivo inicial/final por prefijos
        pref_ef = list(cfg.get("efectivo_prefijos") or [])
        efectivo_ini = _conv_monto_mxn(_saldo_prefijos_a_fecha(pref_ef, fecha_ini_var), mon, tc)
        efectivo_fin = _conv_monto_mxn(_saldo_prefijos_a_fecha(pref_ef, fecha_fin_var), mon, tc)
        delta_ef = efectivo_fin - efectivo_ini

        precision = int(cfg.get("precision") or 2)
        return {
            "exito": True,
            "tipo": "FE",
            "mes": m,
            "anio": y,
            "rango": {"inicio": f_ini, "fin": f_fin},
            "centro_costo_id": int(centro_costo_id) if centro_costo_id is not None else None,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "precision": precision,
            "utilidad_neta": float(util_neta),
            "ajustes_no_efectivo": ajustes,
            "total_ajustes_no_efectivo": float(total_ajustes),
            "variaciones_capital_trabajo": variaciones,
            "total_variaciones_capital_trabajo": float(total_variaciones),
            "flujo_neto_operacion": float(flujo_operacion),
            "efectivo": {
                "prefijos": pref_ef,
                "fecha_ini_corte": fecha_ini_var,
                "fecha_fin_corte": fecha_fin_var,
                "efectivo_inicial": float(efectivo_ini),
                "efectivo_final": float(efectivo_fin),
                "variacion": float(delta_ef),
            },
            "validaciones": {
                "bg_ini_cuadra": bool((bg_ini.get("totales") or {}).get("cuadra", False)),
                "bg_fin_cuadra": bool((bg_fin.get("totales") or {}).get("cuadra", False)),
            },
            "formato": {"nombre": formato_nombre or "DEFAULT", "config": cfg},
        }

    # ---------------------------
    # Cambios en el Capital Contable
    # ---------------------------
    def cambios_capital_contable(
        self,
        mes: int,
        anio: int,
        *,
        centro_costo_id: Optional[int] = None,
        moneda_reporte: str = "MXN",
        tipo_cambio: float = 1.0,
        formato_nombre: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Estado de cambios en el capital contable (YTD):
        - Capital inicial (corte mes anterior o 01/01)
        + aportaciones
        - retiros
        - dividendos
        + utilidad/pérdida del periodo (utilidad neta YTD)
        = Capital final
        """
        m = max(1, min(12, int(mes)))
        y = int(anio)
        mon, tc = _normalizar_moneda(moneda_reporte, tipo_cambio)

        cfg = self.obtener_formato("CC", formato_nombre) if formato_nombre else {}
        if not cfg:
            cfg = self.formato_default("CC")

        pref_capital = list(cfg.get("capital_prefijos") or ["3"])
        pref_aport = list(cfg.get("aportaciones_prefijos") or [])
        pref_ret = list(cfg.get("retiros_prefijos") or [])
        pref_div = list(cfg.get("dividendos_prefijos") or [])

        # cortes
        def _corte_fecha(mm: int) -> str:
            return date(y, mm, _ultimo_dia_mes(mm, y)).strftime("%Y-%m-%d")

        fecha_ini = date(y, 1, 1).strftime("%Y-%m-%d") if m == 1 else _corte_fecha(m - 1)
        fecha_fin = _corte_fecha(m)

        # capital inicial y final
        cap_ini = self._saldo_prefijos_fecha(pref_capital, fecha_ini, centro_costo_id=centro_costo_id)
        cap_fin = self._saldo_prefijos_fecha(pref_capital, fecha_fin, centro_costo_id=centro_costo_id)
        cap_ini = _conv_monto_mxn(cap_ini, mon, tc)
        cap_fin = _conv_monto_mxn(cap_fin, mon, tc)

        # movimientos YTD por rubro
        f_ytd_ini, f_ytd_fin = _rango_ytd(m, y)

        def _monto_ytd(pref: List[str]) -> float:
            if not pref:
                return 0.0
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                nat_map = _naturaleza_por_cuenta(cur)
            mov = self._sumas_por_prefijos_mov(f_ytd_ini, f_ytd_fin, pref, centro_costo_id=centro_costo_id)
            val = 0.0
            for nc, dv in mov.items():
                nat = nat_map.get(nc, "DEUDORA")
                val += _sum_delta_por_naturaleza(nat, dv.get("debe", 0.0), dv.get("haber", 0.0))
            return float(_conv_monto_mxn(val, mon, tc))

        aport = _monto_ytd(pref_aport)
        ret = _monto_ytd(pref_ret)
        div = _monto_ytd(pref_div)

        er = self.estado_resultados(
            m,
            y,
            acumulado=True,
            centro_costo_id=centro_costo_id,
            moneda_reporte=mon,
            tipo_cambio=tc,
        )
        util = float((er.get("totales") or {}).get("utilidad_neta") or 0.0)

        # reconciliación: cap_fin calculado por saldo vs cap_ini + movs + util
        cap_calculado = cap_ini + aport - ret - div + util
        dif = cap_fin - cap_calculado

        precision = int(cfg.get("precision") or 2)
        return {
            "exito": True,
            "tipo": "CC",
            "mes": m,
            "anio": y,
            "centro_costo_id": int(centro_costo_id) if centro_costo_id is not None else None,
            "moneda_reporte": mon,
            "tipo_cambio_reporte": tc,
            "precision": precision,
            "cortes": {"fecha_ini": fecha_ini, "fecha_fin": fecha_fin},
            "lineas": [
                {"key": "capital_inicial", "label": "Capital inicial", "monto": float(cap_ini)},
                {"key": "aportaciones", "label": "Aportaciones", "monto": float(aport), "prefijos": pref_aport},
                {"key": "retiros", "label": "Retiros", "monto": float(ret), "prefijos": pref_ret},
                {"key": "dividendos", "label": "Dividendos", "monto": float(div), "prefijos": pref_div},
                {"key": "utilidad_neta", "label": "Utilidad/Pérdida del periodo", "monto": float(util)},
                {"key": "capital_final", "label": "Capital final (saldo)", "monto": float(cap_fin)},
            ],
            "validaciones": {
                "capital_final_calculado": float(cap_calculado),
                "diferencia_vs_saldo": float(dif),
                "cuadra": bool(abs(dif) <= 0.01),
            },
            "formato": {"nombre": formato_nombre or "DEFAULT", "config": cfg},
        }

    def _saldo_prefijos_fecha(self, prefijos: List[str], fecha: str, *, centro_costo_id: Optional[int] = None) -> float:
        """
        Suma de saldos por prefijos a una fecha.
        - Global: saldos_cuenta por mes
        - Centro: acumulación de movimientos desde 1/enero hasta fecha
        """
        prefijos = [str(p).strip() for p in (prefijos or []) if str(p).strip()]
        if not prefijos:
            return 0.0
        try:
            fobj = datetime.strptime(fecha, "%Y-%m-%d").date()
        except Exception:
            return 0.0
        if centro_costo_id is not None:
            ini = date(fobj.year, 1, 1).strftime("%Y-%m-%d")
            fin = fobj.strftime("%Y-%m-%d")
            mp = self._saldos_corte_por_movimientos(ini, fin, prefijos, centro_costo_id=centro_costo_id)
            return float(sum(float(v or 0.0) for v in mp.values()))
        mp2 = self._saldos_corte_global(int(fobj.month), int(fobj.year), prefijos)
        if mp2:
            return float(sum(float(v or 0.0) for v in mp2.values()))
        # fallback saldos_mensuales
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            likes = " OR ".join(["s.num_cuenta LIKE ?" for _ in prefijos])
            cur.execute(
                f"""
                SELECT COALESCE(SUM(COALESCE(s.saldo_final,0)),0)
                FROM saldos_mensuales s
                WHERE s.anio = ? AND s.mes = ? AND ({likes})
                """,
                [int(fobj.year), int(fobj.month)] + [f"{p}%" for p in prefijos],
            )
            rr = cur.fetchone()
            return float((rr[0] if rr else 0.0) or 0.0)

    # ---------------------------
    # Comparativos (cualquier estado)
    # ---------------------------
    def comparativo(
        self,
        tipo: str,
        params_a: Dict[str, Any],
        params_b: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Ejecuta dos instancias del mismo estado (tipo ER/BG/FE/CC) y genera variaciones.
        params_* deben incluir los argumentos del método correspondiente.
        """
        tipo = (tipo or "").strip().upper()
        if tipo not in ("ER", "BG", "FE", "CC"):
            return {"exito": False, "error": "Tipo inválido."}

        def _run(t: str, p: Dict[str, Any]) -> Dict[str, Any]:
            if t == "ER":
                return self.estado_resultados(**p)
            if t == "BG":
                return self.balance_general(**p)
            if t == "FE":
                return self.flujo_efectivo_indirecto(**p)
            return self.cambios_capital_contable(**p)

        a = _run(tipo, params_a or {})
        b = _run(tipo, params_b or {})
        if not a.get("exito") or not b.get("exito"):
            return {"exito": False, "a": a, "b": b, "error": "No se pudieron generar ambos estados."}

        def _var(v1: float, v2: float) -> Dict[str, float]:
            v1 = float(v1 or 0.0)
            v2 = float(v2 or 0.0)
            dv = v2 - v1
            if abs(v1) > 1e-9:
                pct = (dv / abs(v1)) * 100.0
            else:
                pct = 0.0 if abs(dv) < 1e-9 else (100.0 if dv > 0 else -100.0)
            return {"variacion": float(dv), "variacion_pct": float(pct)}

        # Mapear totales según tipo
        def _totales(d: Dict[str, Any]) -> Dict[str, float]:
            if tipo == "BG":
                return {k: float((d.get("totales") or {}).get(k) or 0.0) for k in ("activo", "pasivo", "capital", "total_pasivo_capital")}
            if tipo == "ER":
                t = d.get("totales") or {}
                keys = (
                    "ingresos",
                    "costo",
                    "gastos",
                    "otros_ing",
                    "otros_gas",
                    "isr",
                    "utilidad_bruta",
                    "utilidad_operacion",
                    "utilidad_antes_isr",
                    "utilidad_neta",
                )
                return {k: float(t.get(k) or 0.0) for k in keys}
            if tipo == "FE":
                return {
                    "utilidad_neta": float(d.get("utilidad_neta") or 0.0),
                    "total_ajustes_no_efectivo": float(d.get("total_ajustes_no_efectivo") or 0.0),
                    "total_variaciones_capital_trabajo": float(d.get("total_variaciones_capital_trabajo") or 0.0),
                    "flujo_neto_operacion": float(d.get("flujo_neto_operacion") or 0.0),
                    "efectivo_inicial": float(((d.get("efectivo") or {}).get("efectivo_inicial")) or 0.0),
                    "efectivo_final": float(((d.get("efectivo") or {}).get("efectivo_final")) or 0.0),
                    "efectivo_variacion": float(((d.get("efectivo") or {}).get("variacion")) or 0.0),
                }
            # CC
            # lineas claves
            mp = {str(ln.get("key")): float(ln.get("monto") or 0.0) for ln in (d.get("lineas") or [])}
            return {k: float(mp.get(k) or 0.0) for k in ("capital_inicial", "aportaciones", "retiros", "dividendos", "utilidad_neta", "capital_final")}

        ta = _totales(a)
        tb = _totales(b)
        variaciones = {k: _var(ta.get(k, 0.0), tb.get(k, 0.0)) for k in sorted(set(list(ta.keys()) + list(tb.keys())))}
        return {"exito": True, "tipo": tipo, "a": a, "b": b, "variaciones": variaciones}

