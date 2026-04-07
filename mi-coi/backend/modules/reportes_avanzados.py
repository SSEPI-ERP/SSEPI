# backend/modules/reportes_avanzados.py
import sqlite3
from datetime import datetime
from typing import Dict, List
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config import get_db_path

class ReportesAvanzados:
    def __init__(self, db_path: str = None):
        self.db_path = db_path if db_path else get_db_path()
    
    def flujo_efectivo(self, fecha_inicio: str, fecha_fin: str) -> Dict:
        """Genera estado de flujo de efectivo detallado (cuentas 101,102 o 1101,1102)."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Cuentas de efectivo: compatibilidad 101/102 y 1101/1102
            where_cuentas = "c.num_cuenta IN ('101','102','1101','1102')"
            where_cuentas_m = "m.num_cuenta IN ('101','102','1101','1102')"
            
            fecha_ini = datetime.strptime(fecha_inicio, '%Y-%m-%d')
            
            cursor.execute(f"""
                SELECT COALESCE(SUM(s.saldo_final), 0)
                FROM saldos_mensuales s
                JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
                WHERE {where_cuentas}
                AND s.mes = ? AND s.anio = ?
            """, (fecha_ini.month, fecha_ini.year))
            
            efectivo_inicial = cursor.fetchone()[0] or 0
            
            cursor.execute(f"""
                SELECT COALESCE(SUM(m.cargo), 0)
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                WHERE {where_cuentas_m}
                AND m.cargo > 0
                AND p.fecha BETWEEN ? AND ?
            """, (fecha_inicio, fecha_fin))
            
            entradas = cursor.fetchone()[0] or 0
            
            cursor.execute(f"""
                SELECT COALESCE(SUM(m.abono), 0)
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                WHERE {where_cuentas_m}
                AND m.abono > 0
                AND p.fecha BETWEEN ? AND ?
            """, (fecha_inicio, fecha_fin))
            
            salidas = cursor.fetchone()[0] or 0
            
            cursor.execute(f"""
                SELECT c.nombre_cuenta, SUM(m.cargo)
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                JOIN catalogo_cuentas c ON m.num_cuenta = c.num_cuenta
                WHERE {where_cuentas_m.replace('m.num_cuenta', 'c.num_cuenta')}
                AND m.cargo > 0
                AND p.fecha BETWEEN ? AND ?
                GROUP BY c.nombre_cuenta
            """, (fecha_inicio, fecha_fin))
            
            detalle_entradas = cursor.fetchall()
            
            cursor.execute(f"""
                SELECT c.nombre_cuenta, SUM(m.abono)
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                JOIN catalogo_cuentas c ON m.num_cuenta = c.num_cuenta
                WHERE {where_cuentas_m.replace('m.num_cuenta', 'c.num_cuenta')}
                AND m.abono > 0
                AND p.fecha BETWEEN ? AND ?
                GROUP BY c.nombre_cuenta
            """, (fecha_inicio, fecha_fin))
            
            detalle_salidas = cursor.fetchall()
            
            return {
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'efectivo_inicial': efectivo_inicial,
                'entradas': entradas,
                'salidas': salidas,
                'efectivo_final': efectivo_inicial + entradas - salidas,
                'detalle_entradas': detalle_entradas,
                'detalle_salidas': detalle_salidas
            }
    
    def analisis_horizontal(self, mes1: int, anio1: int, mes2: int, anio2: int) -> List[Dict]:
        """Compara dos períodos (análisis horizontal)"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    c.num_cuenta,
                    c.nombre_cuenta,
                    COALESCE(s1.saldo_final, 0) as saldo_periodo1,
                    COALESCE(s2.saldo_final, 0) as saldo_periodo2,
                    COALESCE(s2.saldo_final, 0) - COALESCE(s1.saldo_final, 0) as variacion_absoluta,
                    CASE 
                        WHEN COALESCE(s1.saldo_final, 0) != 0 
                        THEN ((COALESCE(s2.saldo_final, 0) - COALESCE(s1.saldo_final, 0)) / ABS(COALESCE(s1.saldo_final, 0))) * 100
                        ELSE 0 
                    END as variacion_porcentual
                FROM catalogo_cuentas c
                LEFT JOIN saldos_mensuales s1 ON c.num_cuenta = s1.num_cuenta 
                    AND s1.mes = ? AND s1.anio = ?
                LEFT JOIN saldos_mensuales s2 ON c.num_cuenta = s2.num_cuenta 
                    AND s2.mes = ? AND s2.anio = ?
                WHERE c.nivel <= 2
                ORDER BY ABS(variacion_absoluta) DESC
            ''', (mes1, anio1, mes2, anio2))
            
            return [dict(row) for row in cursor.fetchall()]

    def movimientos_detallados(self, fecha_inicio: str, fecha_fin: str) -> List[Dict]:
        """Devuelve movimientos contables detallados (polizas + movimientos + catalogo)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT
                    p.fecha,
                    p.tipo_poliza,
                    p.numero_poliza,
                    p.concepto as concepto_poliza,
                    m.num_cuenta,
                    COALESCE(c.nombre_cuenta, '') as nombre_cuenta,
                    m.concepto_mov,
                    m.cargo,
                    m.abono,
                    COALESCE(m.cliente_nombre, '') as cliente_nombre,
                    COALESCE(m.cliente_rfc, '') as cliente_rfc
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                LEFT JOIN catalogo_cuentas c ON m.num_cuenta = c.num_cuenta
                WHERE p.fecha BETWEEN ? AND ?
                ORDER BY p.fecha DESC, p.numero_poliza DESC, m.id DESC
            ''', (fecha_inicio, fecha_fin))
            return [dict(r) for r in cursor.fetchall()]

    def auxiliar_cuenta(self, num_cuenta: str, fecha_inicio: str, fecha_fin: str) -> List[Dict]:
        """Movimientos de una sola cuenta en el rango de fechas (para ver timbres y descripciones en esa cuenta)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT
                    p.fecha,
                    p.tipo_poliza,
                    p.numero_poliza,
                    p.concepto as concepto_poliza,
                    m.concepto_mov,
                    m.cargo,
                    m.abono,
                    COALESCE(m.cliente_nombre, '') as cliente_nombre,
                    COALESCE(m.cliente_rfc, '') as cliente_rfc
                FROM movimientos m
                JOIN polizas p ON m.poliza_id = p.id
                WHERE m.num_cuenta = ? AND p.fecha BETWEEN ? AND ?
                ORDER BY p.fecha ASC, p.numero_poliza ASC, m.id ASC
            ''', (num_cuenta.strip(), fecha_inicio, fecha_fin))
            return [dict(r) for r in cursor.fetchall()]

    def _crear_tabla_catalogo_si_falta(self) -> None:
        """Crea la tabla catalogo_cuentas si no existe y agrega columnas faltantes."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='catalogo_cuentas'")
                if not cur.fetchone():
                    cur.execute("""
                        CREATE TABLE catalogo_cuentas (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            num_cuenta TEXT UNIQUE NOT NULL,
                            nombre_cuenta TEXT NOT NULL,
                            nivel INTEGER NOT NULL,
                            naturaleza TEXT CHECK(naturaleza IN ('DEUDORA', 'ACREEDORA')) NOT NULL,
                            cuenta_mayor TEXT,
                            tipo_cuenta TEXT DEFAULT 'ACUMULATIVA',
                            moneda TEXT DEFAULT 'MXN',
                            codigo_agrupador_sat TEXT,
                            no_incluir_xml INTEGER DEFAULT 0,
                            rubro_financiero TEXT,
                            saldo_inicial REAL DEFAULT 0,
                            saldo_final REAL DEFAULT 0
                        );
                    """)
                else:
                    # Añadir columnas que pueda faltar (ej. BD creada solo con crear_base_datos)
                    for col, defn in [
                        ("tipo_cuenta", "TEXT DEFAULT 'ACUMULATIVA'"),
                        ("moneda", "TEXT DEFAULT 'MXN'"),
                        ("codigo_agrupador_sat", "TEXT"),
                        ("no_incluir_xml", "INTEGER DEFAULT 0"),
                        ("rubro_financiero", "TEXT"),
                        ("saldo_inicial", "REAL DEFAULT 0"),
                        ("saldo_final", "REAL DEFAULT 0"),
                    ]:
                        try:
                            cur.execute(f"ALTER TABLE catalogo_cuentas ADD COLUMN {col} {defn}")
                        except sqlite3.OperationalError:
                            pass
                conn.commit()
        except Exception:
            pass

    def asegurar_cuentas_timbres(self) -> None:
        """Crea en el catálogo las cuentas 102, 401, 208 si no existen (usadas por timbres)."""
        self._crear_tabla_catalogo_si_falta()
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cuentas_timbres = [
                    ("102", "Bancos", "DEUDORA"),
                    ("401", "Ingresos / Ventas", "ACREEDORA"),
                    ("208", "IVA trasladado cobrado", "ACREEDORA"),
                ]
                for num, nombre, naturaleza in cuentas_timbres:
                    cur.execute("SELECT 1 FROM catalogo_cuentas WHERE num_cuenta = ?", (num,))
                    if cur.fetchone():
                        continue
                    cur.execute("""
                        INSERT INTO catalogo_cuentas (
                            num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor,
                            tipo_cuenta, moneda, codigo_agrupador_sat, no_incluir_xml,
                            rubro_financiero, saldo_inicial, saldo_final
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (num, nombre, 1, naturaleza, None, "ACUMULATIVA", "MXN", None, 0, None, 0, 0))
                conn.commit()
        except Exception:
            pass

    def buscar_cuentas_por_rfc_o_descripcion(self, texto: str) -> List[Dict]:
        """Busca pólizas cuyo concepto contenga el texto (RFC o descripción) y devuelve las cuentas involucradas con saldo.
        Si no hay pólizas con ese criterio, devuelve igual las cuentas de timbres (102, 401, 208) para que aparezcan en catálogo."""
        self.asegurar_cuentas_timbres()
        texto = (texto or "").strip()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if not texto:
                cursor.execute("""
                    SELECT DISTINCT m.num_cuenta
                    FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE p.concepto LIKE '%Factura timbrada%'
                    ORDER BY m.num_cuenta
                """)
            else:
                cursor.execute("""
                    SELECT DISTINCT m.num_cuenta
                    FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE p.concepto LIKE ?
                    ORDER BY m.num_cuenta
                """, ("%" + texto + "%",))
            nums = [row[0] for row in cursor.fetchall()]
            # Si no hay pólizas con ese RFC/descripción, mostrar igual las cuentas de timbres (102, 401, 208)
            if not nums:
                nums = ["102", "401", "208"]
            out = []
            for num in nums:
                cursor.execute("SELECT nombre_cuenta FROM catalogo_cuentas WHERE num_cuenta = ?", (num,))
                row = cursor.fetchone()
                nombre = (row[0] or "") if row else ""
                cursor.execute("""
                    SELECT saldo_final FROM saldos_mensuales
                    WHERE num_cuenta = ? ORDER BY anio DESC, mes DESC LIMIT 1
                """, (num,))
                saldo_row = cursor.fetchone()
                saldo = float(saldo_row[0]) if saldo_row and saldo_row[0] is not None else 0.0
                cursor.execute("""
                    SELECT COUNT(DISTINCT p.id) FROM movimientos m
                    JOIN polizas p ON m.poliza_id = p.id
                    WHERE m.num_cuenta = ? AND p.concepto LIKE ?
                """, (num, "%" + texto + "%" if texto else "%Factura timbrada%"))
                num_pol = cursor.fetchone()[0] or 0
                out.append({
                    "num_cuenta": num,
                    "nombre_cuenta": nombre,
                    "saldo_actual": saldo,
                    "num_polizas": num_pol,
                })
            return out
    
    def razones_financieras(self, mes: int, anio: int) -> Dict:
        """Calcula razones financieras"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    SUM(CASE WHEN c.num_cuenta LIKE '11%' THEN s.saldo_final ELSE 0 END) as activo_circulante,
                    SUM(CASE WHEN c.num_cuenta LIKE '21%' THEN s.saldo_final ELSE 0 END) as pasivo_circulante,
                    SUM(CASE WHEN c.num_cuenta LIKE '1%' THEN s.saldo_final ELSE 0 END) as activo_total,
                    SUM(CASE WHEN c.num_cuenta LIKE '2%' THEN s.saldo_final ELSE 0 END) as pasivo_total,
                    SUM(CASE WHEN c.num_cuenta IN ('1101', '1102') THEN s.saldo_final ELSE 0 END) as efectivo,
                    SUM(CASE WHEN c.num_cuenta LIKE '1105' THEN s.saldo_final ELSE 0 END) as inventarios,
                    SUM(CASE WHEN c.num_cuenta LIKE '1103' THEN s.saldo_final ELSE 0 END) as cuentas_cobrar
                FROM saldos_mensuales s
                JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
                WHERE s.mes = ? AND s.anio = ?
            ''', (mes, anio))
            
            ac, pc, at, pt, ef, inv, cxc = cursor.fetchone()
            ac = ac or 0
            pc = pc or 0
            at = at or 0
            pt = pt or 0
            inv = inv or 0
            cxc = cxc or 0
            
            # Ventas del período
            cursor.execute('''
                SELECT COALESCE(SUM(s.saldo_final), 0)
                FROM saldos_mensuales s
                JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
                WHERE c.num_cuenta LIKE '41%' AND s.mes = ? AND s.anio = ?
            ''', (mes, anio))
            
            ventas = cursor.fetchone()[0] or 0
            
            # Utilidad neta
            cursor.execute('''
                SELECT COALESCE(SUM(s.saldo_final), 0)
                FROM saldos_mensuales s
                JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
                WHERE c.num_cuenta = '3201' AND s.mes = ? AND s.anio = ?
            ''', (mes, anio))
            
            utilidad = cursor.fetchone()[0] or 0
            
            # Calcular razones
            razones = {
                'liquidez': {
                    'razon_circulante': round(ac / pc if pc > 0 else 0, 2),
                    'prueba_acida': round((ac - inv) / pc if pc > 0 else 0, 2),
                    'capital_trabajo': ac - pc
                },
                'rentabilidad': {
                    'margen_neto': round((utilidad / ventas * 100) if ventas > 0 else 0, 2),
                    'roe': round((utilidad / (at - pt) * 100) if (at - pt) > 0 else 0, 2),
                    'roa': round((utilidad / at * 100) if at > 0 else 0, 2)
                },
                'endeudamiento': {
                    'razon_endeudamiento': round((pt / at * 100) if at > 0 else 0, 2),
                    'apalancamiento': round((at / (at - pt)) if (at - pt) > 0 else 0, 2)
                },
                'eficiencia': {
                    'rotacion_cxc': round((ventas / cxc) if cxc > 0 else 0, 2),
                    'dias_cxc': round((cxc / ventas * 30) if ventas > 0 else 0, 2),
                    'rotacion_inventarios': round((ventas / inv) if inv > 0 else 0, 2)
                }
            }
            
            return razones