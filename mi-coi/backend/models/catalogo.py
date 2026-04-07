# backend/models/catalogo.py
import sqlite3
import os
from typing import List, Tuple, Optional, Dict, Any

# Importar la configuración
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
try:
    from config import get_db_path, DATABASE_PATH
except ImportError:
    # Configuración por defecto si no existe config.py
    def get_db_path():
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base_dir, 'backend', 'database', 'contabilidad.db')
    
    DATABASE_PATH = os.path.dirname(get_db_path())


def clase_contable_desde_codigo(num_cuenta: str) -> str:
    """
    Clase de cuenta según primer dígito del código (marco contable mexicano tipo COI/SAT):
    1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingreso, 5 Costo de venta, 6 Gasto.
    """
    s = (num_cuenta or "").strip()
    if not s:
        return "—"
    head = s.split(".", 1)[0].strip()
    if not head:
        return "—"
    try:
        d = int(head[0])
    except (ValueError, IndexError):
        return "—"
    return {
        1: "Activo",
        2: "Pasivo",
        3: "Patrimonio",
        4: "Ingreso",
        5: "Costo de venta",
        6: "Gasto",
    }.get(d, "—")


def es_cuenta_banco_codigo(num_cuenta: str) -> bool:
    """Cuentas tipo bancos (102.x, 112.x) para UI de línea de crédito."""
    n = (num_cuenta or "").replace("-", "").replace(".", "").strip()
    return n.startswith("102") or n.startswith("112")


def etiqueta_tipo_cuenta_ui(tipo_cuenta_db: Optional[str], num_cuenta: str) -> str:
    """Texto compacto para columnas: clase contable + DETALLE/ACUMULATIVA si aplica."""
    clase = clase_contable_desde_codigo(num_cuenta)
    tc = (tipo_cuenta_db or "").strip().upper()
    if tc in ("DETALLE", "ACUMULATIVA"):
        return f"{clase} · {tc.title()}" if clase != "—" else tc.title()
    return clase if clase != "—" else (tc or "—")


class CatalogoCuentas:
    def __init__(self, db_path: str = None):
        # Si no se proporciona ruta, usar la ruta absoluta
        self.db_path = db_path if db_path else get_db_path()
        # Asegurar que el directorio existe
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.crear_tablas_codigos_sat()
    
    def crear_tablas_codigos_sat(self):
        """Crea la tabla de códigos agrupadores SAT y actualiza tabla de cuentas"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                # Base: asegurar tabla catalogo_cuentas (si BD nueva)
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS catalogo_cuentas (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        num_cuenta TEXT UNIQUE NOT NULL,
                        nombre_cuenta TEXT NOT NULL,
                        nivel INTEGER NOT NULL,
                        naturaleza TEXT CHECK(naturaleza IN ('DEUDORA', 'ACREEDORA')) NOT NULL,
                        cuenta_mayor TEXT,
                        FOREIGN KEY (cuenta_mayor) REFERENCES catalogo_cuentas(num_cuenta)
                    );
                    """
                )
                
                # Tabla de códigos agrupadores SAT
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS codigos_agrupadores_sat (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        codigo TEXT UNIQUE NOT NULL,
                        descripcion TEXT NOT NULL,
                        nivel INTEGER NOT NULL
                    );
                ''')
                
                # Verificar si ya hay datos
                cursor.execute("SELECT COUNT(*) FROM codigos_agrupadores_sat")
                if cursor.fetchone()[0] == 0:
                    # Insertar códigos SAT base
                    codigos_sat = [
                        ('101', 'Caja', 1),
                        ('102', 'Bancos', 1),
                        ('103', 'Inversiones', 1),
                        ('104', 'Otros instrumentos financieros', 1),
                        ('105', 'Cuentas y documentos por cobrar a corto plazo', 1),
                        ('106', 'Contribuciones a favor', 1),
                        ('107', 'Impuestos acreditables pagados', 1),
                        ('108', 'Impuestos acreditables por pagar', 1),
                        ('109', 'Anticipo a proveedores', 1),
                        ('110', 'Otros activos circulantes', 1),
                        ('111', 'Terrenos', 1),
                        ('112', 'Edificios', 1),
                        ('113', 'Maquinaria y Equipo', 1),
                        ('114', 'Equipo de Transporte', 1),
                        ('115', 'Clientes', 1),
                        ('118', 'Inventarios', 1),
                        ('119', 'Pagos Anticipados', 1),
                        ('120', 'Activo Fijo (Propiedades, Planta y Equipo)', 1),
                        ('121', 'Depreciación acumulada de activos fijos', 1),
                        ('201', 'Proveedores', 2),
                        ('202', 'Cuentas por pagar a corto plazo', 2),
                        ('205', 'Impuestos retenidos', 2),
                        ('208', 'Impuestos trasladados cobrados', 2),
                        ('209', 'Impuestos trasladados no cobrados', 2),
                        ('301', 'Capital Social', 3),
                        ('401', 'Ingresos / Ventas', 4),
                        ('601', 'Gastos Generales', 6),
                        ('701', 'Gastos Financieros', 7)
                    ]
                    
                    for codigo, descripcion, nivel in codigos_sat:
                        cursor.execute('''
                            INSERT OR IGNORE INTO codigos_agrupadores_sat (codigo, descripcion, nivel)
                            VALUES (?, ?, ?)
                        ''', (codigo, descripcion, nivel))
                
                # Verificar y agregar columnas faltantes a catalogo_cuentas
                cursor.execute("PRAGMA table_info(catalogo_cuentas)")
                columnas_existentes = [col[1] for col in cursor.fetchall()]
                
                columnas_nuevas = [
                    ('tipo_cuenta', "TEXT DEFAULT 'ACUMULATIVA'"),
                    ('moneda', "TEXT DEFAULT 'MXN'"),
                    ('codigo_agrupador_sat', "TEXT"),
                    ('no_incluir_xml', "INTEGER DEFAULT 0"),
                    ('rubro_financiero', "TEXT"),
                    ('rubro_diot', "TEXT"),
                    ('activa', "INTEGER DEFAULT 1"),
                    ('saldo_inicial', "REAL DEFAULT 0"),
                    ('saldo_final', "REAL DEFAULT 0"),
                    ('limite_credito_mxn', "REAL"),
                    ('centro_costo_id_default', "INTEGER"),
                ]
                
                for col_name, col_def in columnas_nuevas:
                    if col_name not in columnas_existentes:
                        try:
                            cursor.execute(f"ALTER TABLE catalogo_cuentas ADD COLUMN {col_name} {col_def}")
                        except:
                            pass
                
                conn.commit()
        except Exception as e:
            print(f"Error creando tablas: {e}")

    def cuenta_tiene_movimientos(self, num_cuenta: str) -> bool:
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return False
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM movimientos WHERE num_cuenta = ?", (num_cuenta,))
                return (cur.fetchone()[0] or 0) > 0
        except Exception:
            return False

    def cuenta_tiene_movimientos_directos(self, num_cuenta: str) -> bool:
        """Movimientos contables registrados directamente sobre esta cuenta."""
        return self.cuenta_tiene_movimientos(num_cuenta)

    def cuenta_tiene_hijas(self, num_cuenta: str) -> bool:
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return False
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT COUNT(*) FROM catalogo_cuentas WHERE TRIM(cuenta_mayor) = ?",
                    (num_cuenta,),
                )
                return (cur.fetchone()[0] or 0) > 0
        except Exception:
            return False

    def validar_padre_para_alta(self, cuenta_mayor: Optional[str]) -> Tuple[bool, str]:
        padre = (cuenta_mayor or "").strip() or None
        if not padre:
            return True, ""
        row = self.obtener_cuenta(padre)
        if not row:
            return False, f"La cuenta padre «{padre}» no existe en el catálogo."
        tipo = str(row.get("tipo_cuenta") or "ACUMULATIVA").strip().upper()
        if tipo != "ACUMULATIVA":
            return False, "Solo pueden crearse subcuentas bajo una cuenta padre de tipo Acumulativa."
        return True, ""

    @staticmethod
    def nivel_desde_codigo(num_cuenta: str, layout_mask: Optional[str] = None) -> int:
        """Nivel jerárquico según profundidad del código (segmentos con punto o máscara 4-3-3)."""
        s = (num_cuenta or "").strip()
        if not s:
            return 1
        if "." in s:
            parts = [p for p in s.split(".") if str(p).strip()]
            return max(1, len(parts))
        d = "".join(ch for ch in s if ch.isdigit())
        if not d:
            return 1
        mask = (layout_mask or "4-3-3").strip()
        segs: List[int] = []
        for x in mask.replace(" ", "").split("-"):
            if x.isdigit():
                n = int(x)
                if 1 <= n <= 12:
                    segs.append(n)
        if not segs:
            segs = [4, 3, 3]
        depth = 0
        pos = 0
        for ln in segs:
            if pos >= len(d):
                break
            piece = d[pos : pos + ln]
            pos += ln
            try:
                if int(piece or "0") != 0:
                    depth += 1
            except ValueError:
                depth += 1
        return max(1, depth if depth else 1)
    
    def obtener_codigos_sat(self, nivel: int = None) -> List[Tuple]:
        """Obtiene los códigos agrupadores SAT"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                if nivel:
                    cursor.execute('''
                        SELECT codigo, descripcion, nivel FROM codigos_agrupadores_sat
                        WHERE nivel = ?
                        ORDER BY codigo
                    ''', (nivel,))
                else:
                    cursor.execute('''
                        SELECT codigo, descripcion, nivel FROM codigos_agrupadores_sat
                        ORDER BY codigo
                    ''')
                return cursor.fetchall()
        except:
            return []
    
    def agregar_cuenta_completa(self, datos: Dict) -> tuple:
        """Agrega una cuenta con todos los campos nuevos"""
        ok_padre, msg_padre = self.validar_padre_para_alta(datos.get("cuenta_mayor"))
        if not ok_padre:
            return False, msg_padre
        if datos['tipo_cuenta'] == 'DETALLE' and not datos.get('codigo_agrupador_sat'):
            return False, "El código agrupador SAT es obligatorio para cuentas de detalle"
        limite = datos.get('limite_credito_mxn')
        if limite is not None and limite != '':
            try:
                limite = float(limite)
            except (TypeError, ValueError):
                limite = None
        else:
            limite = None
        cc_def = datos.get("centro_costo_id_default")
        if cc_def is not None and str(cc_def).strip() != "":
            try:
                cc_def = int(cc_def)
            except (TypeError, ValueError):
                cc_def = None
        else:
            cc_def = None
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA foreign_keys = ON")
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO catalogo_cuentas (
                        num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor,
                        tipo_cuenta, moneda, codigo_agrupador_sat, no_incluir_xml,
                        rubro_financiero, rubro_diot, activa, saldo_inicial, saldo_final, limite_credito_mxn,
                        centro_costo_id_default
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    datos['num_cuenta'],
                    datos['nombre_cuenta'],
                    datos['nivel'],
                    datos['naturaleza'],
                    datos.get('cuenta_mayor'),
                    datos['tipo_cuenta'],
                    datos.get('moneda', 'MXN'),
                    datos.get('codigo_agrupador_sat'),
                    1 if datos.get('no_incluir_xml') else 0,
                    datos.get('rubro_financiero'),
                    datos.get('rubro_diot'),
                    1 if datos.get('activa', True) else 0,
                    datos.get('saldo_inicial', 0),
                    datos.get('saldo_final', 0),
                    limite,
                    cc_def,
                ))
                conn.commit()
                return True, "Cuenta agregada correctamente"
        except sqlite3.IntegrityError:
            return False, "El número de cuenta ya existe"
        except Exception as e:
            return False, f"Error: {str(e)}"

    def actualizar_cuenta_completa(self, num_cuenta: str, datos: Dict) -> tuple:
        """Actualiza una cuenta existente (mismos campos que alta). num_cuenta = clave actual."""
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return False, "Número de cuenta inválido"
        try:
            prev = self.obtener_cuenta(num_cuenta)
            if prev:
                old_tipo = str(prev.get("tipo_cuenta") or "ACUMULATIVA").strip().upper()
                new_tipo = str(datos.get("tipo_cuenta") or "ACUMULATIVA").strip().upper()
                if old_tipo == "DETALLE" and new_tipo == "ACUMULATIVA":
                    if self.cuenta_tiene_movimientos_directos(num_cuenta):
                        return (
                            False,
                            "No puede cambiar de Detalle a Acumulativa: la cuenta tiene movimientos en pólizas.",
                        )
            ok_padre, msg_padre = self.validar_padre_para_alta(datos.get("cuenta_mayor"))
            if not ok_padre:
                return False, msg_padre
            if datos.get('tipo_cuenta') == 'DETALLE' and not datos.get('codigo_agrupador_sat'):
                return False, "El código agrupador SAT es obligatorio para cuentas de detalle"
            limite = datos.get('limite_credito_mxn')
            if limite is not None and limite != '':
                try:
                    limite = float(limite)
                except (TypeError, ValueError):
                    limite = None
            else:
                limite = None
            cc_def = datos.get("centro_costo_id_default")
            if cc_def is not None and str(cc_def).strip() != "":
                try:
                    cc_def = int(cc_def)
                except (TypeError, ValueError):
                    cc_def = None
            else:
                cc_def = None
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA foreign_keys = ON")
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE catalogo_cuentas SET
                        nombre_cuenta = ?, nivel = ?, naturaleza = ?, cuenta_mayor = ?,
                        tipo_cuenta = ?, moneda = ?, codigo_agrupador_sat = ?, no_incluir_xml = ?,
                        rubro_financiero = ?, rubro_diot = ?, activa = ?, saldo_inicial = ?, saldo_final = ?,
                        limite_credito_mxn = ?, centro_costo_id_default = ?
                    WHERE num_cuenta = ?
                    """,
                    (
                        datos['nombre_cuenta'],
                        datos['nivel'],
                        datos['naturaleza'],
                        datos.get('cuenta_mayor'),
                        datos['tipo_cuenta'],
                        datos.get('moneda', 'MXN'),
                        datos.get('codigo_agrupador_sat'),
                        1 if datos.get('no_incluir_xml') else 0,
                        datos.get('rubro_financiero'),
                        datos.get('rubro_diot'),
                        1 if datos.get('activa', True) else 0,
                        datos.get('saldo_inicial', 0),
                        datos.get('saldo_final', 0),
                        limite,
                        cc_def,
                        num_cuenta,
                    ),
                )
                conn.commit()
                if cursor.rowcount == 0:
                    return False, "La cuenta no existe"
                return True, "Cuenta actualizada correctamente"
        except Exception as e:
            return False, f"Error: {str(e)}"
    
    def obtener_cuentas(self, nivel: Optional[int] = None, *, incluir_inactivas: bool = False) -> List[Tuple]:
        """Obtiene cuentas (por defecto solo activas)."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                where_activa = "" if incluir_inactivas else "AND COALESCE(activa,1)=1"
                if nivel:
                    cursor.execute("""
                        SELECT num_cuenta, nombre_cuenta, nivel, naturaleza, tipo_cuenta, moneda, codigo_agrupador_sat, no_incluir_xml
                        FROM catalogo_cuentas 
                        WHERE nivel = ? {where_activa}
                        ORDER BY num_cuenta
                    """.format(where_activa=where_activa), (nivel,))
                else:
                    cursor.execute("""
                        SELECT num_cuenta, nombre_cuenta, nivel, naturaleza, tipo_cuenta, moneda, codigo_agrupador_sat, no_incluir_xml
                        FROM catalogo_cuentas 
                        WHERE 1=1 {where_activa}
                        ORDER BY num_cuenta
                    """.format(where_activa=where_activa))
                return cursor.fetchall()
        except:
            return []

    def obtener_cuentas_para_arbol(self, *, incluir_inactivas: bool = True) -> List[Tuple]:
        """Cuentas para árbol: ... + activa."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                where_activa = "" if incluir_inactivas else "WHERE COALESCE(activa,1)=1"
                cursor.execute("""
                    SELECT num_cuenta, nombre_cuenta, nivel, naturaleza,
                           COALESCE(codigo_agrupador_sat, '') as codigo_agrupador_sat,
                           cuenta_mayor,
                           COALESCE(tipo_cuenta, '') as tipo_cuenta,
                           COALESCE(activa,1) as activa
                    FROM catalogo_cuentas
                    {where_activa}
                    ORDER BY num_cuenta
                """.format(where_activa=where_activa))
                return cursor.fetchall()
        except Exception:
            return []

    def set_activa(self, num_cuenta: str, activa: bool) -> tuple[bool, str]:
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return False, "Número de cuenta inválido"
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE catalogo_cuentas SET activa = ? WHERE num_cuenta = ?",
                    (1 if activa else 0, num_cuenta),
                )
                conn.commit()
                if cur.rowcount == 0:
                    return False, "La cuenta no existe"
            return True, "Cuenta actualizada"
        except Exception as e:
            return False, str(e)
    
    def obtener_cuenta(self, num_cuenta: str) -> Optional[Dict]:
        """Obtiene una cuenta específica con todos sus detalles"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM catalogo_cuentas 
                    WHERE num_cuenta = ?
                """, (num_cuenta,))
                row = cursor.fetchone()
                return dict(row) if row else None
        except:
            return None

    def saldo_actual(self, num_cuenta: str) -> float:
        """Saldo al último periodo: prioriza saldos_cuenta (motor), si no hay fila usa saldos_mensuales."""
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return 0.0
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute(
                        """
                        SELECT s1.saldo_final_mn
                        FROM saldos_cuenta s1
                        INNER JOIN (
                            SELECT num_cuenta AS nc, MAX(ejercicio * 100 + periodo) AS ord
                            FROM saldos_cuenta
                            WHERE num_cuenta = ?
                            GROUP BY num_cuenta
                        ) u ON s1.num_cuenta = u.nc
                            AND (s1.ejercicio * 100 + s1.periodo) = u.ord
                        WHERE s1.num_cuenta = ?
                        """,
                        (num_cuenta, num_cuenta),
                    )
                    row = cursor.fetchone()
                    if row and row[0] is not None:
                        return float(row[0])
                except sqlite3.OperationalError:
                    pass
                cursor.execute(
                    """
                    SELECT saldo_final FROM saldos_mensuales
                    WHERE num_cuenta = ?
                    ORDER BY anio DESC, mes DESC LIMIT 1
                    """,
                    (num_cuenta,),
                )
                row = cursor.fetchone()
                return float(row[0]) if row and row[0] is not None else 0.0
        except Exception:
            return 0.0

    def saldo_por_periodo(self, num_cuenta: str, ejercicio: int, periodo: int) -> Dict[str, Any]:
        """
        Devuelve saldos por periodo.
        Preferencia: saldos_cuenta (motor fase 1), fallback: saldos_mensuales.
        """
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return {"exito": False, "error": "num_cuenta requerido"}
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                # Motor fase 1
                try:
                    cur.execute(
                        """
                        SELECT saldo_inicial_mn, cargos_mn, abonos_mn, saldo_final_mn
                        FROM saldos_cuenta
                        WHERE num_cuenta = ? AND ejercicio = ? AND periodo = ?
                        """,
                        (num_cuenta, int(ejercicio), int(periodo)),
                    )
                    row = cur.fetchone()
                    if row:
                        return {
                            "exito": True,
                            "fuente": "saldos_cuenta",
                            "saldo_inicial": float(row[0] or 0.0),
                            "debe": float(row[1] or 0.0),
                            "haber": float(row[2] or 0.0),
                            "saldo_final": float(row[3] or 0.0),
                        }
                except sqlite3.OperationalError:
                    pass

                # Legacy
                try:
                    cur.execute(
                        """
                        SELECT saldo_inicial, debe, haber, saldo_final
                        FROM saldos_mensuales
                        WHERE num_cuenta = ? AND anio = ? AND mes = ?
                        """,
                        (num_cuenta, int(ejercicio), int(periodo)),
                    )
                    row = cur.fetchone()
                    if row:
                        return {
                            "exito": True,
                            "fuente": "saldos_mensuales",
                            "saldo_inicial": float(row[0] or 0.0),
                            "debe": float(row[1] or 0.0),
                            "haber": float(row[2] or 0.0),
                            "saldo_final": float(row[3] or 0.0),
                        }
                except sqlite3.OperationalError:
                    pass
            return {
                "exito": True,
                "fuente": "sin_datos",
                "saldo_inicial": 0.0,
                "debe": 0.0,
                "haber": 0.0,
                "saldo_final": 0.0,
            }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def obtener_clientes_desglose(self, num_cuenta: str, max_items: Optional[int] = 3) -> List[Dict[str, Any]]:
        """
        Devuelve un desglose de clientes por cuenta con el adeudo calculado por movimientos.

        Adeudo:
        - DEUDORA: cargo - abono
        - ACREEDORA: abono - cargo

        Si faltan `cliente_rfc/cliente_nombre`, intenta extraerlos desde `concepto_mov`
        (formato esperado: "Factura timbrada <UUID> - <RFC> <Nombre>").
        """
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return []

        # Obtener naturaleza desde el catálogo
        naturaleza = "DEUDORA"
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT naturaleza FROM catalogo_cuentas WHERE num_cuenta = ? LIMIT 1",
                    (num_cuenta,),
                )
                row = cur.fetchone()
                if row and row[0] in ("DEUDORA", "ACREEDORA"):
                    naturaleza = row[0]
        except Exception:
            pass

        # Regex de apoyo para extraer RFC/Nombre desde concepto_mov
        # Ej: "Factura timbrada 3f1...-...-... - XAXX010101000 Nombre del cliente"
        import re
        patron = re.compile(
            r"Factura\s+timbrada\s+\S+\s*-\s*([A-Za-z0-9]{10,13})\s+(.+)$",
            re.IGNORECASE,
        )

        adeudo_por_cliente: Dict[Tuple[str, str], float] = {}

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                # Intentar usar campos cliente si existen
                try:
                    cur.execute(
                        """
                        SELECT
                            m.cliente_rfc,
                            m.cliente_nombre,
                            p.concepto as concepto_poliza,
                            m.concepto_mov,
                            m.cargo,
                            m.abono
                        FROM movimientos m
                        JOIN polizas p ON m.poliza_id = p.id
                        WHERE m.num_cuenta = ?
                        """,
                        (num_cuenta,),
                    )
                except sqlite3.OperationalError:
                    cur.execute(
                        """
                        SELECT
                            NULL as cliente_rfc,
                            NULL as cliente_nombre,
                            p.concepto as concepto_poliza,
                            m.concepto_mov,
                            m.cargo,
                            m.abono
                        FROM movimientos m
                        JOIN polizas p ON m.poliza_id = p.id
                        WHERE m.num_cuenta = ?
                        """,
                        (num_cuenta,),
                    )

                for row in cur.fetchall():
                    cargo = float(row["cargo"] or 0.0)
                    abono = float(row["abono"] or 0.0)
                    if naturaleza == "ACREEDORA":
                        delta = abono - cargo
                    else:
                        delta = cargo - abono

                    rfc = (row["cliente_rfc"] or "").strip() if "cliente_rfc" in row.keys() else ""
                    nombre = (row["cliente_nombre"] or "").strip() if "cliente_nombre" in row.keys() else ""
                    concepto_poliza = (row["concepto_poliza"] or "").strip() if "concepto_poliza" in row.keys() else ""
                    concepto_mov = row["concepto_mov"] or ""

                    # Si falta información del cliente en la tabla, intentar completar desde concepto_mov.
                    if (not rfc or not nombre) and concepto_poliza:
                        m = patron.search(concepto_poliza)
                        if m:
                            rfc_parsed = (m.group(1) or "").strip()
                            nombre_parsed = (m.group(2) or "").strip()
                            rfc = rfc or rfc_parsed
                            nombre = nombre or nombre_parsed
                    if (not rfc or not nombre) and concepto_mov:
                        m = patron.search(concepto_mov)
                        if m:
                            rfc_parsed = (m.group(1) or "").strip()
                            nombre_parsed = (m.group(2) or "").strip()
                            rfc = rfc or rfc_parsed
                            nombre = nombre or nombre_parsed

                    if not rfc and not nombre:
                        continue

                    key = (rfc, nombre)
                    adeudo_por_cliente[key] = adeudo_por_cliente.get(key, 0.0) + delta
        except Exception:
            return []

        # Convertir a lista y ordenar por |adeudo|
        items = [
            {"cliente_rfc": k[0], "cliente_nombre": k[1], "adeudo": float(v)}
            for k, v in adeudo_por_cliente.items()
            if abs(float(v)) > 0.009  # filtra ruido
        ]
        items.sort(key=lambda d: abs(d.get("adeudo") or 0.0), reverse=True)
        if max_items is None:
            return items
        if max_items <= 0:
            # Caso seguro: si se pide 0 o negativo, devolvemos todos.
            return items
        return items[:max_items]

    def renumerar_cuentas(
        self,
        num_cuenta_origen: str,
        num_cuenta_destino: str,
        *,
        incluir_hijos: bool = True,
    ) -> Dict[str, Any]:
        """
        Reordenamiento / renumeración de cuentas:
        - Cambia num_cuenta de una cuenta (y opcionalmente de sus descendientes)
        - Actualiza referencias por num_cuenta en tablas existentes (movimientos, partidas, saldos, presupuestos, etc.)
        - Actualiza catalogo_cuentas.cuenta_mayor si aplica

        Estrategia: 2 pasos con valores temporales para evitar colisiones UNIQUE.
        """
        o = (num_cuenta_origen or "").strip()
        n = (num_cuenta_destino or "").strip()
        if not o or not n:
            return {"exito": False, "error": "Origen/Destino requeridos"}
        if o == n:
            return {"exito": False, "error": "Origen y destino son iguales"}

        def _like_desc(s: str) -> str:
            # Descendientes por prefijo "o."
            return s + ".%"

        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                try:
                    cur.execute("PRAGMA foreign_keys = OFF;")
                except sqlite3.Error:
                    pass

                cur.execute("SELECT 1 FROM catalogo_cuentas WHERE num_cuenta=? LIMIT 1", (o,))
                if not cur.fetchone():
                    return {"exito": False, "error": "La cuenta origen no existe"}
                cur.execute("SELECT 1 FROM catalogo_cuentas WHERE num_cuenta=? LIMIT 1", (n,))
                if cur.fetchone():
                    return {"exito": False, "error": "La cuenta destino ya existe"}

                # Origen + hijos
                cuentas: List[str] = [o]
                if incluir_hijos:
                    cur.execute(
                        """
                        SELECT num_cuenta FROM catalogo_cuentas
                        WHERE num_cuenta LIKE ?
                        ORDER BY LENGTH(num_cuenta) DESC, num_cuenta DESC
                        """,
                        (_like_desc(o),),
                    )
                    cuentas += [str(r["num_cuenta"]) for r in cur.fetchall() if str(r["num_cuenta"]) != o]

                mapping: Dict[str, str] = {}
                for old in cuentas:
                    if old == o:
                        mapping[old] = n
                    else:
                        if old.startswith(o + "."):
                            mapping[old] = n + old[len(o) :]
                        else:
                            mapping[old] = old

                # Verificar colisiones por destino
                for old, newv in mapping.items():
                    if old == newv:
                        continue
                    cur.execute("SELECT 1 FROM catalogo_cuentas WHERE num_cuenta=? LIMIT 1", (newv,))
                    if cur.fetchone():
                        return {"exito": False, "error": f"Colisión: ya existe {newv} (al renumerar {old})"}

                # Descubrir tablas con columna num_cuenta
                cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tablas = [r[0] for r in cur.fetchall()]
                tablas_con_num: List[str] = []
                for t in tablas:
                    try:
                        cur.execute(f"PRAGMA table_info({t})")
                        cols = [x[1] for x in cur.fetchall()]
                        if "num_cuenta" in cols:
                            tablas_con_num.append(t)
                    except sqlite3.Error:
                        continue

                tmp_prefix = "__TMP_RENUM__"
                tmp_map = {old: f"{tmp_prefix}{i}__{old}" for i, old in enumerate(mapping.keys(), start=1)}

                def _update_refs(old_val: str, new_val: str) -> None:
                    for t in tablas_con_num:
                        try:
                            cur.execute(f"UPDATE {t} SET num_cuenta=? WHERE num_cuenta=?", (new_val, old_val))
                        except sqlite3.Error:
                            pass
                    try:
                        cur.execute(
                            "UPDATE catalogo_cuentas SET cuenta_mayor=? WHERE cuenta_mayor=?",
                            (new_val, old_val),
                        )
                    except sqlite3.Error:
                        pass

                # Paso 1: old -> tmp
                for old in mapping.keys():
                    _update_refs(old, tmp_map[old])
                # Paso 2: tmp -> new
                for old, newv in mapping.items():
                    _update_refs(tmp_map[old], newv)

                conn.commit()
                try:
                    cur.execute("PRAGMA foreign_keys = ON;")
                except sqlite3.Error:
                    pass

                return {
                    "exito": True,
                    "renumeradas": len(mapping),
                    "origen": o,
                    "destino": n,
                    "incluir_hijos": incluir_hijos,
                }
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def obtener_saldos_actuales(self) -> Dict[str, float]:
        """
        num_cuenta -> saldo al último periodo conocido.
        Prioriza saldos_cuenta (motor fase 1); completa cuentas faltantes con saldos_mensuales.
        """
        out: Dict[str, float] = {}
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute(
                        """
                        SELECT s1.num_cuenta, s1.saldo_final_mn
                        FROM saldos_cuenta s1
                        INNER JOIN (
                            SELECT num_cuenta, MAX(ejercicio * 100 + periodo) AS ord
                            FROM saldos_cuenta
                            GROUP BY num_cuenta
                        ) u ON s1.num_cuenta = u.num_cuenta
                            AND (s1.ejercicio * 100 + s1.periodo) = u.ord
                        """
                    )
                    for row in cursor.fetchall():
                        out[str(row[0])] = float(row[1]) if row[1] is not None else 0.0
                except sqlite3.OperationalError:
                    pass

                try:
                    cursor.execute(
                        """
                        SELECT s1.num_cuenta, s1.saldo_final FROM saldos_mensuales s1
                        INNER JOIN (
                            SELECT num_cuenta, MAX(anio * 100 + mes) AS ord
                            FROM saldos_mensuales GROUP BY num_cuenta
                        ) u ON s1.num_cuenta = u.num_cuenta
                            AND (s1.anio * 100 + s1.mes) = u.ord
                        """
                    )
                    for row in cursor.fetchall():
                        k = str(row[0])
                        if k not in out:
                            out[k] = float(row[1]) if row[1] is not None else 0.0
                except Exception:
                    pass
        except Exception:
            pass
        return out

    def saldos_por_cuentas_periodo(self, ejercicio: int, periodo: int) -> Dict[str, float]:
        """Saldo final por cuenta para ejercicio/periodo (saldos_cuenta o saldos_mensuales)."""
        out: Dict[str, float] = {}
        e, p = int(ejercicio), int(periodo)
        try:
            with sqlite3.connect(self.db_path) as conn:
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        SELECT num_cuenta, saldo_final_mn FROM saldos_cuenta
                        WHERE ejercicio = ? AND periodo = ?
                        """,
                        (e, p),
                    )
                    for row in cur.fetchall():
                        out[str(row[0])] = float(row[1] or 0.0)
                    if out:
                        return out
                except sqlite3.OperationalError:
                    pass
                try:
                    cur.execute(
                        """
                        SELECT num_cuenta, saldo_final FROM saldos_mensuales
                        WHERE anio = ? AND mes = ?
                        """,
                        (e, p),
                    )
                    for row in cur.fetchall():
                        out[str(row[0])] = float(row[1] or 0.0)
                except sqlite3.OperationalError:
                    pass
        except Exception:
            pass
        return out

    def verificar_integridad_catalogo(self) -> List[Dict[str, Any]]:
        """Inconsistencias: padre inexistente, acumulativa con movimientos, detalle sin SAT."""
        hallazgos: List[Dict[str, Any]] = []
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT num_cuenta, nombre_cuenta, cuenta_mayor, tipo_cuenta,
                           COALESCE(codigo_agrupador_sat,'') AS sat, COALESCE(activa,1) AS activa
                    FROM catalogo_cuentas
                    ORDER BY num_cuenta
                    """
                )
                rows = [dict(r) for r in cur.fetchall()]
                nums = {str(r["num_cuenta"]).strip() for r in rows}
                for r in rows:
                    num = str(r["num_cuenta"]).strip()
                    padre = (r.get("cuenta_mayor") or "").strip() or None
                    if padre and padre not in nums:
                        hallazgos.append(
                            {
                                "tipo": "padre_inexistente",
                                "cuenta": num,
                                "detalle": f"Cuenta mayor «{padre}» no existe en el catálogo.",
                            }
                        )
                    tipo = str(r.get("tipo_cuenta") or "").strip().upper()
                    if tipo == "ACUMULATIVA":
                        cur.execute(
                            "SELECT COUNT(*) FROM movimientos WHERE num_cuenta = ?",
                            (num,),
                        )
                        if (cur.fetchone()[0] or 0) > 0:
                            hallazgos.append(
                                {
                                    "tipo": "acumulativa_con_movimientos",
                                    "cuenta": num,
                                    "detalle": "Cuenta acumulativa con movimientos directos en pólizas.",
                                }
                            )
                    if tipo == "DETALLE" and not (r.get("sat") or "").strip():
                        hallazgos.append(
                            {
                                "tipo": "detalle_sin_sat",
                                "cuenta": num,
                                "detalle": "Cuenta de detalle sin código agrupador SAT.",
                            }
                        )
        except Exception as e:
            hallazgos.append(
                {"tipo": "error", "cuenta": "", "detalle": str(e)}
            )
        return hallazgos

    def exportar_catalogo_xlsx(
        self,
        path: str,
        ejercicio: int,
        periodo: int,
    ) -> Dict[str, Any]:
        """Exporta catálogo con atributos y saldos del periodo indicado."""
        try:
            from openpyxl import Workbook
        except Exception as e:
            return {"exito": False, "error": f"Falta openpyxl: {e}"}
        saldos = self.saldos_por_cuentas_periodo(ejercicio, periodo)
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM catalogo_cuentas ORDER BY num_cuenta")
                filas = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            return {"exito": False, "error": str(e)}
        wb = Workbook()
        ws = wb.active
        ws.title = "Catalogo"
        headers = [
            "num_cuenta",
            "nombre_cuenta",
            "nivel",
            "naturaleza",
            "tipo_cuenta",
            "cuenta_mayor",
            "codigo_agrupador_sat",
            "rubro_diot",
            "rubro_financiero",
            "activa",
            "moneda",
            f"saldo_final_{ejercicio}_{periodo:02d}",
        ]
        ws.append(headers)
        for r in filas:
            num = str(r.get("num_cuenta") or "").strip()
            ws.append(
                [
                    num,
                    r.get("nombre_cuenta") or "",
                    r.get("nivel"),
                    r.get("naturaleza") or "",
                    r.get("tipo_cuenta") or "",
                    r.get("cuenta_mayor") or "",
                    r.get("codigo_agrupador_sat") or "",
                    r.get("rubro_diot") or "",
                    r.get("rubro_financiero") or "",
                    "1" if int(r.get("activa") or 1) else "0",
                    r.get("moneda") or "MXN",
                    float(saldos.get(num, 0.0)),
                ]
            )
        try:
            wb.save(path)
        except Exception as e:
            return {"exito": False, "error": str(e)}
        return {"exito": True, "cuentas": len(filas), "path": path}

    def obtener_centro_costo_default(self, num_cuenta: str) -> Optional[int]:
        row = self.obtener_cuenta((num_cuenta or "").strip())
        if not row:
            return None
        v = row.get("centro_costo_id_default")
        if v is None or str(v).strip() == "":
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None
    
    def eliminar_cuenta(self, num_cuenta: str) -> Tuple[bool, str]:
        """Elimina cuenta si no tiene hijas ni movimientos. Mensaje vacío si OK."""
        num_cuenta = (num_cuenta or "").strip()
        if not num_cuenta:
            return False, "Número de cuenta inválido"
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA foreign_keys = ON")
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT COUNT(*) FROM catalogo_cuentas WHERE TRIM(cuenta_mayor) = ?",
                    (num_cuenta,),
                )
                if (cursor.fetchone()[0] or 0) > 0:
                    return False, "La cuenta tiene subcuentas; elimine o reubique las hijas primero."
                cursor.execute(
                    "SELECT COUNT(*) FROM movimientos WHERE num_cuenta = ?",
                    (num_cuenta,),
                )
                if (cursor.fetchone()[0] or 0) > 0:
                    return False, "La cuenta tiene movimientos históricos; use desactivar en su lugar."
                cursor.execute("DELETE FROM catalogo_cuentas WHERE num_cuenta = ?", (num_cuenta,))
                conn.commit()
                if cursor.rowcount > 0:
                    return True, ""
                return False, "Cuenta no encontrada"
        except Exception as e:
            return False, str(e)

    def _naturaleza_por_codigo(self, codigo: str) -> str:
        """Devuelve DEUDORA o ACREEDORA según el primer dígito del código (catálogo SAT)."""
        base = codigo.split('.')[0]
        try:
            d = int(base[:1])
        except ValueError:
            return 'DEUDORA'
        if d in (1, 5, 6):
            return 'DEUDORA'
        if d in (2, 3, 4, 8):
            return 'ACREEDORA'
        if d == 7:
            try:
                sub = int(base)
                return 'DEUDORA' if sub == 701 else 'ACREEDORA'
            except ValueError:
                return 'ACREEDORA'
        return 'DEUDORA'

    def _cuenta_mayor_por_codigo(self, codigo: str) -> Optional[str]:
        """Obtiene la cuenta mayor (padre) para el código dado."""
        if '.' in codigo:
            return codigo.rsplit('.', 1)[0]
        try:
            base = int(codigo.split('.')[0])
        except ValueError:
            return None
        if base in (100, 200, 300, 400, 500, 600, 700, 800):
            return None
        if 101 <= base <= 121:
            return '100.01'
        if 151 <= base <= 191:
            return '100.02'
        if 201 <= base <= 218:
            return '200.01'
        if 251 <= base <= 260:
            return '200.02'
        if 301 <= base <= 306:
            return '300'
        if 401 <= base <= 403:
            return '400'
        if 501 <= base <= 505:
            return '500'
        if 601 <= base <= 614:
            return '600'
        if 701 <= base <= 704:
            return '700'
        if 801 <= base <= 899:
            return '800'
        if codigo in ('100.01', '100.02'):
            return '100'
        if codigo in ('200.01', '200.02'):
            return '200'
        return None

    def _codigo_agrupador_sat(self, num_cuenta: str) -> str:
        """Formato tipo determinación XXX-XX-XXX (ej. 101-00-000, 101.01 -> 101-01-000)."""
        if '.' in num_cuenta:
            base, sub = num_cuenta.split('.', 1)
            sub = (sub[:2] if len(sub) >= 2 else sub).zfill(2)
        else:
            base = num_cuenta.strip()
            sub = '00'
        base = base.strip()
        if base.isdigit() and len(base) < 3:
            base = base.zfill(3)
        return f"{base}-{sub}-000"

    def cargar_catalogo_oficial_sat(self, regimen: str = "PM") -> Dict[str, Any]:
        """Carga catálogo estándar SAT desde backend/data/. regimen: PM (moral) o PF (física).
        Reemplaza todas las cuentas actuales."""
        import os
        reg = (regimen or "PM").strip().upper()
        data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
        fname = "catalogo_sat_oficial_pf.txt" if reg in ("PF", "FISICA", "PERSONA_FISICA") else "catalogo_sat_oficial.txt"
        data_path = os.path.join(data_dir, fname)
        if not os.path.isfile(data_path) and fname != "catalogo_sat_oficial.txt":
            data_path = os.path.join(data_dir, "catalogo_sat_oficial.txt")
        if not os.path.isfile(data_path):
            return {"exito": False, "error": f"No se encuentra el archivo {data_path}"}
        filas = []
        with open(data_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split('\t')
                if len(parts) < 3:
                    continue
                nivel_raw, codigo, nombre = parts[0], parts[1].strip(), parts[2].strip()
                try:
                    nivel_int = 2 if '.' in codigo else 1
                    if nivel_raw in ('100', '100.01', '100.02', '200', '200.01', '200.02', '300', '400', '500', '600', '700', '800'):
                        nivel_int = 0 if '.' not in codigo else 1
                except Exception:
                    nivel_int = 1
                filas.append((nivel_int, codigo, nombre))
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA foreign_keys=OFF")
                cursor.execute("DELETE FROM catalogo_cuentas")
                cursor.execute("PRAGMA foreign_keys=ON")
                for _n, codigo, nombre in filas:
                    nivel_int = 2 if '.' in codigo else (0 if codigo in ('100', '200', '300', '400', '500', '600', '700', '800') else 1)
                    naturaleza = self._naturaleza_por_codigo(codigo)
                    cuenta_mayor = self._cuenta_mayor_por_codigo(codigo)
                    cod_agrup = self._codigo_agrupador_sat(codigo)
                    tipo_cuenta = 'DETALLE' if nivel_int == 2 else 'ACUMULATIVA'
                    cursor.execute("""
                        INSERT INTO catalogo_cuentas (
                            num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor,
                            tipo_cuenta, moneda, codigo_agrupador_sat, no_incluir_xml
                        ) VALUES (?, ?, ?, ?, ?, ?, 'MXN', ?, 0)
                    """, (codigo, nombre, nivel_int, naturaleza, cuenta_mayor, tipo_cuenta, cod_agrup))
                conn.commit()
            return {
                "exito": True,
                "mensaje": (
                    f"Catálogo estándar SAT ({reg}) cargado: {len(filas)} cuentas. "
                    "Agrupador SAT (codigo_agrupador_sat) en formato estándar."
                ),
                "regimen": reg,
            }
        except Exception as e:
            return {"exito": False, "error": str(e)}