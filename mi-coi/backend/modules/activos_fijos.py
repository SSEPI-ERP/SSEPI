# backend/modules/activos_fijos.py
import sqlite3
from datetime import datetime, date
from typing import List, Dict, Optional
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config import get_db_path

class ActivosFijos:
    def __init__(self, db_path: str = None):
        self.db_path = db_path if db_path else get_db_path()
        self.crear_tablas()
    
    def crear_tablas(self):
        """Crea las tablas necesarias para activos fijos"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS activos_fijos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codigo TEXT UNIQUE NOT NULL,
                    nombre TEXT NOT NULL,
                    descripcion TEXT,
                    fecha_adquisicion DATE NOT NULL,
                    costo_original REAL NOT NULL,
                    valor_residual REAL DEFAULT 0,
                    vida_util INTEGER NOT NULL,
                    metodo_depreciacion TEXT CHECK(metodo_depreciacion IN ('LINEA_RECTA', 'SDA', 'DOBLE_SALDO')) NOT NULL,
                    tasa_depreciacion REAL,
                    depreciacion_acumulada REAL DEFAULT 0,
                    valor_neto REAL,
                    cuenta_activo TEXT NOT NULL,
                    cuenta_depreciacion TEXT NOT NULL,
                    cuenta_gasto TEXT NOT NULL,
                    estado TEXT CHECK(estado IN ('ACTIVO', 'DEPRECIADO', 'VENDIDO', 'BAJA')) DEFAULT 'ACTIVO',
                    fecha_baja DATE,
                    motivo_baja TEXT,
                    FOREIGN KEY (cuenta_activo) REFERENCES catalogo_cuentas(num_cuenta),
                    FOREIGN KEY (cuenta_depreciacion) REFERENCES catalogo_cuentas(num_cuenta),
                    FOREIGN KEY (cuenta_gasto) REFERENCES catalogo_cuentas(num_cuenta)
                );
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS depreciaciones_mensuales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    activo_id INTEGER NOT NULL,
                    mes INTEGER NOT NULL,
                    anio INTEGER NOT NULL,
                    monto_depreciacion REAL NOT NULL,
                    depreciacion_acumulada REAL NOT NULL,
                    fecha_calculo DATE NOT NULL,
                    poliza_id INTEGER,
                    FOREIGN KEY (activo_id) REFERENCES activos_fijos(id),
                    FOREIGN KEY (poliza_id) REFERENCES polizas(id),
                    UNIQUE(activo_id, mes, anio)
                );
            ''')
            
            conn.commit()
    
    def agregar_activo(self, datos: Dict) -> Dict:
        """Agrega un nuevo activo fijo"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                if datos['metodo'] == 'LINEA_RECTA':
                    tasa = (1 / datos['vida_util']) * 100
                elif datos['metodo'] == 'DOBLE_SALDO':
                    tasa = (2 / datos['vida_util']) * 100
                else:
                    tasa = None
                
                valor_neto = datos['costo'] - datos.get('depreciacion_acumulada', 0)
                
                cursor.execute('''
                    INSERT INTO activos_fijos (
                        codigo, nombre, descripcion, fecha_adquisicion, costo_original,
                        valor_residual, vida_util, metodo_depreciacion, tasa_depreciacion,
                        depreciacion_acumulada, valor_neto, cuenta_activo, cuenta_depreciacion,
                        cuenta_gasto, estado
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    datos['codigo'], datos['nombre'], datos.get('descripcion', ''),
                    datos['fecha_adquisicion'], datos['costo'],
                    datos.get('valor_residual', 0), datos['vida_util'],
                    datos['metodo'], tasa, datos.get('depreciacion_acumulada', 0),
                    valor_neto, datos['cuenta_activo'], datos['cuenta_depreciacion'],
                    datos['cuenta_gasto'], 'ACTIVO'
                ))
                
                activo_id = cursor.lastrowid
                conn.commit()
                
                return {'exito': True, 'id': activo_id, 'mensaje': 'Activo agregado correctamente'}
                
        except Exception as e:
            return {'exito': False, 'error': str(e)}
    
    def obtener_activos(self, estado: str = None) -> List[Dict]:
        """Obtiene la lista de activos fijos"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            query = "SELECT * FROM activos_fijos"
            params = []
            
            if estado:
                query += " WHERE estado = ?"
                params.append(estado)
            
            query += " ORDER BY codigo"
            
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def calcular_depreciacion_mensual(self, activo_id: int, mes: int, anio: int) -> Dict:
        """Calcula la depreciación de un activo para un mes específico"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT costo_original, valor_residual, vida_util, metodo_depreciacion,
                       depreciacion_acumulada, fecha_adquisicion
                FROM activos_fijos WHERE id = ?
            ''', (activo_id,))
            
            activo = cursor.fetchone()
            if not activo:
                return {'exito': False, 'error': 'Activo no encontrado'}
            
            costo, residual, vida_util, metodo, dep_acum, fecha_adq = activo
            
            if metodo == 'LINEA_RECTA':
                base_depreciable = costo - residual
                depreciacion_anual = base_depreciable / vida_util
                depreciacion_mensual = depreciacion_anual / 12
            
            elif metodo == 'DOBLE_SALDO':
                valor_libros = costo - dep_acum
                tasa = (2 / vida_util)
                depreciacion_anual = valor_libros * tasa
                depreciacion_mensual = depreciacion_anual / 12
            
            else:  # SDA
                años_restantes = vida_util - (dep_acum / (costo / vida_util)) if dep_acum > 0 else vida_util
                if años_restantes < 0:
                    años_restantes = 0
                suma_digitos = vida_util * (vida_util + 1) / 2
                factor = años_restantes / suma_digitos
                depreciacion_anual = (costo - residual) * factor
                depreciacion_mensual = depreciacion_anual / 12
            
            if dep_acum + depreciacion_mensual > costo - residual:
                depreciacion_mensual = (costo - residual) - dep_acum
                if depreciacion_mensual < 0:
                    depreciacion_mensual = 0
            
            return {
                'exito': True,
                'activo_id': activo_id,
                'mes': mes,
                'anio': anio,
                'depreciacion': round(depreciacion_mensual, 2),
                'depreciacion_acumulada': round(dep_acum + depreciacion_mensual, 2),
                'valor_neto': round(costo - (dep_acum + depreciacion_mensual), 2)
            }
    
    def registrar_depreciacion_mensual(self, mes: int, anio: int, generar_poliza: bool = True) -> Dict:
        """Registra la depreciación de todos los activos para un mes"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, codigo, nombre, costo_original, depreciacion_acumulada,
                       cuenta_depreciacion, cuenta_gasto
                FROM activos_fijos 
                WHERE estado = 'ACTIVO'
            ''')
            
            activos = cursor.fetchall()
            total_depreciacion = 0
            movimientos_poliza = []
            
            for activo in activos:
                activo_id, codigo, nombre, costo, dep_acum, cta_dep, cta_gasto = activo
                
                resultado = self.calcular_depreciacion_mensual(activo_id, mes, anio)
                
                if resultado['exito'] and resultado['depreciacion'] > 0:
                    cursor.execute('''
                        INSERT OR REPLACE INTO depreciaciones_mensuales
                        (activo_id, mes, anio, monto_depreciacion, depreciacion_acumulada, fecha_calculo)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (activo_id, mes, anio, resultado['depreciacion'],
                          resultado['depreciacion_acumulada'], date.today().isoformat()))
                    
                    cursor.execute('''
                        UPDATE activos_fijos 
                        SET depreciacion_acumulada = ?, valor_neto = ?
                        WHERE id = ?
                    ''', (resultado['depreciacion_acumulada'], resultado['valor_neto'], activo_id))
                    
                    total_depreciacion += resultado['depreciacion']
            
            conn.commit()
            
            return {
                'exito': True,
                'total_depreciacion': total_depreciacion,
                'activos_procesados': len(activos),
                'poliza_id': None
            }