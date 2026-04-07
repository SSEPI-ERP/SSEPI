# backend/modules/polizas_avanzadas.py
import sqlite3
from datetime import datetime
from typing import List, Dict
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config import get_db_path

class PolizasAvanzadas:
    def __init__(self, db_path: str = None):
        self.db_path = db_path if db_path else get_db_path()
    
    def obtener_polizas_por_tipo(self, tipo: str, mes: int, anio: int) -> List[Dict]:
        """Obtiene pólizas filtradas por tipo"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            fecha_inicio = f"{anio}-{mes:02d}-01"
            if mes == 12:
                fecha_fin = f"{anio}-12-31"
            else:
                from datetime import date, timedelta
                ultimo_dia = (date(anio, mes + 1, 1) - timedelta(days=1)).day
                fecha_fin = f"{anio}-{mes:02d}-{ultimo_dia}"
            
            cursor.execute('''
                SELECT p.*, 
                       COUNT(m.id) as num_movimientos,
                       SUM(m.cargo) as total_cargos,
                       SUM(m.abono) as total_abonos
                FROM polizas p
                LEFT JOIN movimientos m ON p.id = m.poliza_id
                WHERE p.tipo_poliza = ? AND p.fecha BETWEEN ? AND ?
                GROUP BY p.id
                ORDER BY p.fecha, p.numero_poliza
            ''', (tipo, fecha_inicio, fecha_fin))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def resumen_polizas_mensual(self, mes: int, anio: int) -> Dict:
        """Genera resumen de pólizas por mes"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    tipo_poliza,
                    COUNT(*) as cantidad,
                    SUM(total_cargos) as total_cargos,
                    SUM(total_abonos) as total_abonos
                FROM (
                    SELECT p.tipo_poliza,
                           SUM(m.cargo) as total_cargos,
                           SUM(m.abono) as total_abonos
                    FROM polizas p
                    JOIN movimientos m ON p.id = m.poliza_id
                    WHERE strftime('%Y', p.fecha) = ? AND strftime('%m', p.fecha) = ?
                    GROUP BY p.id
                )
                GROUP BY tipo_poliza
            ''', (str(anio), f"{mes:02d}"))
            
            resultados = cursor.fetchall()
            
            resumen = {
                'INGRESO': {'cantidad': 0, 'cargos': 0, 'abonos': 0},
                'EGRESO': {'cantidad': 0, 'cargos': 0, 'abonos': 0},
                'DIARIO': {'cantidad': 0, 'cargos': 0, 'abonos': 0},
                'total': {'cantidad': 0, 'cargos': 0, 'abonos': 0}
            }
            
            for tipo, cantidad, cargos, abonos in resultados:
                if tipo in resumen:
                    resumen[tipo]['cantidad'] = cantidad
                    resumen[tipo]['cargos'] = cargos or 0
                    resumen[tipo]['abonos'] = abonos or 0
                    resumen['total']['cantidad'] += cantidad
                    resumen['total']['cargos'] += cargos or 0
                    resumen['total']['abonos'] += abonos or 0
            
            return resumen
    
    def polizas_por_cuenta(self, num_cuenta: str, fecha_inicio: str, fecha_fin: str) -> List[Dict]:
        """Obtiene todas las pólizas donde participa una cuenta específica"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT p.fecha, p.tipo_poliza, p.numero_poliza, p.concepto,
                       m.cargo, m.abono, m.concepto_mov
                FROM polizas p
                JOIN movimientos m ON p.id = m.poliza_id
                WHERE m.num_cuenta = ? AND p.fecha BETWEEN ? AND ?
                ORDER BY p.fecha, p.numero_poliza
            ''', (num_cuenta, fecha_inicio, fecha_fin))
            
            return [dict(row) for row in cursor.fetchall()]