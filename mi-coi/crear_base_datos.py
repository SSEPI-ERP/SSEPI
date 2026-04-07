# crear_base_datos.py
import sqlite3
import os
from datetime import datetime

print("🔨 Creando base de datos desde cero...")

# Rutas
ruta_actual = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(ruta_actual, 'backend', 'database', 'contabilidad.db')
os.makedirs(os.path.dirname(db_path), exist_ok=True)

print(f"📁 Base de datos: {db_path}")

# Conectar y crear tablas
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Crear tablas (sin eñes en los nombres de columnas)
cursor.executescript('''
    -- Tabla de catálogo de cuentas
    CREATE TABLE IF NOT EXISTS catalogo_cuentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_cuenta TEXT UNIQUE NOT NULL,
        nombre_cuenta TEXT NOT NULL,
        nivel INTEGER NOT NULL,
        naturaleza TEXT CHECK(naturaleza IN ('DEUDORA', 'ACREEDORA')) NOT NULL,
        cuenta_mayor TEXT,
        FOREIGN KEY (cuenta_mayor) REFERENCES catalogo_cuentas(num_cuenta)
    );

    -- Tabla de pólizas
    CREATE TABLE IF NOT EXISTS polizas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_poliza INTEGER NOT NULL,
        tipo_poliza TEXT CHECK(tipo_poliza IN ('INGRESO', 'EGRESO', 'DIARIO')) NOT NULL,
        fecha DATE NOT NULL,
        concepto TEXT NOT NULL,
        UNIQUE(numero_poliza, tipo_poliza, fecha)
    );

    -- Tabla de movimientos
    CREATE TABLE IF NOT EXISTS movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poliza_id INTEGER NOT NULL,
        num_cuenta TEXT NOT NULL,
        concepto_mov TEXT,
        cargo REAL DEFAULT 0,
        abono REAL DEFAULT 0,
        FOREIGN KEY (poliza_id) REFERENCES polizas(id),
        FOREIGN KEY (num_cuenta) REFERENCES catalogo_cuentas(num_cuenta)
    );

    -- Tabla de saldos mensuales (sin eñes: anio en lugar de año)
    CREATE TABLE IF NOT EXISTS saldos_mensuales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_cuenta TEXT NOT NULL,
        mes INTEGER NOT NULL,
        anio INTEGER NOT NULL,
        saldo_inicial REAL DEFAULT 0,
        debe REAL DEFAULT 0,
        haber REAL DEFAULT 0,
        saldo_final REAL DEFAULT 0,
        FOREIGN KEY (num_cuenta) REFERENCES catalogo_cuentas(num_cuenta),
        UNIQUE(num_cuenta, mes, anio)
    );
''')

print("✅ Tablas creadas correctamente")

# Limpiar datos existentes para empezar fresco
cursor.execute("DELETE FROM saldos_mensuales")
cursor.execute("DELETE FROM movimientos")
cursor.execute("DELETE FROM polizas")
cursor.execute("DELETE FROM catalogo_cuentas")

print("🧹 Datos anteriores eliminados")

# Insertar datos de ejemplo
print("📝 Insertando datos de ejemplo...")

# Catálogo de cuentas básico (Sistema tradicional mexicano)
cuentas = [
    ('1000', 'ACTIVO', 1, 'DEUDORA', None),
    ('1100', 'ACTIVO CIRCULANTE', 2, 'DEUDORA', '1000'),
    ('1101', 'CAJA', 3, 'DEUDORA', '1100'),
    ('1102', 'BANCOS', 3, 'DEUDORA', '1100'),
    ('1103', 'CLIENTES', 3, 'DEUDORA', '1100'),
    ('1104', 'DEUDORES DIVERSOS', 3, 'DEUDORA', '1100'),
    ('1200', 'ACTIVO FIJO', 2, 'DEUDORA', '1000'),
    ('1201', 'MOBILIARIO Y EQUIPO', 3, 'DEUDORA', '1200'),
    ('1202', 'EQUIPO DE COMPUTO', 3, 'DEUDORA', '1200'),
    ('2000', 'PASIVO', 1, 'ACREEDORA', None),
    ('2100', 'PASIVO CIRCULANTE', 2, 'ACREEDORA', '2000'),
    ('2101', 'PROVEEDORES', 3, 'ACREEDORA', '2100'),
    ('2102', 'ACREEDORES DIVERSOS', 3, 'ACREEDORA', '2100'),
    ('2103', 'IMPUESTOS POR PAGAR', 3, 'ACREEDORA', '2100'),
    ('2200', 'PASIVO LARGO PLAZO', 2, 'ACREEDORA', '2000'),
    ('2201', 'PRESTAMOS BANCARIOS', 3, 'ACREEDORA', '2200'),
    ('3000', 'CAPITAL CONTABLE', 1, 'ACREEDORA', None),
    ('3100', 'CAPITAL SOCIAL', 2, 'ACREEDORA', '3000'),
    ('3101', 'CAPITAL APORTADO', 3, 'ACREEDORA', '3100'),
    ('3200', 'UTILIDADES ACUMULADAS', 2, 'ACREEDORA', '3000'),
    ('3201', 'UTILIDAD DEL EJERCICIO', 3, 'ACREEDORA', '3200'),
    ('4000', 'INGRESOS', 1, 'ACREEDORA', None),
    ('4100', 'VENTAS', 2, 'ACREEDORA', '4000'),
    ('4101', 'VENTAS NETAS', 3, 'ACREEDORA', '4100'),
    ('5000', 'COSTOS', 1, 'DEUDORA', None),
    ('5100', 'COSTO DE VENTAS', 2, 'DEUDORA', '5000'),
    ('5101', 'COSTO DE VENTAS NETO', 3, 'DEUDORA', '5100'),
    ('6000', 'GASTOS', 1, 'DEUDORA', None),
    ('6100', 'GASTOS DE OPERACIÓN', 2, 'DEUDORA', '6000'),
    ('6101', 'GASTOS ADMINISTRATIVOS', 3, 'DEUDORA', '6100'),
    ('6102', 'GASTOS DE VENTA', 3, 'DEUDORA', '6100'),
]

for cuenta in cuentas:
    try:
        cursor.execute('''
            INSERT INTO catalogo_cuentas (num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor)
            VALUES (?, ?, ?, ?, ?)
        ''', cuenta)
    except sqlite3.IntegrityError:
        print(f"  ⚠️ Cuenta {cuenta[0]} ya existe")

print("✅ Catálogo de cuentas creado")

# Pólizas de ejemplo (Apertura)
fecha_actual = datetime.now().strftime('%Y-%m-%d')

# Póliza 1: Aportación de capital
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (1, 'DIARIO', ?, 'Aportación inicial de capital')
''', (fecha_actual,))
poliza1_id = cursor.lastrowid

movimientos_poliza1 = [
    ('1101', 'Aportación en efectivo', 50000, 0),  # Caja
    ('3101', 'Capital aportado', 0, 50000),        # Capital
]

for mov in movimientos_poliza1:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza1_id, mov[0], mov[1], mov[2], mov[3]))

# Póliza 2: Compra de mobiliario
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (2, 'EGRESO', ?, 'Compra de mobiliario y equipo')
''', (fecha_actual,))
poliza2_id = cursor.lastrowid

movimientos_poliza2 = [
    ('1201', 'Escritorios y sillas', 15000, 0),
    ('1101', 'Pago en efectivo', 0, 15000),
]

for mov in movimientos_poliza2:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza2_id, mov[0], mov[1], mov[2], mov[3]))

# Póliza 3: Compra de equipo de cómputo
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (3, 'EGRESO', ?, 'Compra de equipo de cómputo')
''', (fecha_actual,))
poliza3_id = cursor.lastrowid

movimientos_poliza3 = [
    ('1202', 'Laptops y accesorios', 25000, 0),
    ('1102', 'Pago con transferencia', 0, 25000),  # Bancos
]

for mov in movimientos_poliza3:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza3_id, mov[0], mov[1], mov[2], mov[3]))

# Póliza 4: Venta de productos
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (4, 'INGRESO', ?, 'Venta de productos')
''', (fecha_actual,))
poliza4_id = cursor.lastrowid

movimientos_poliza4 = [
    ('1101', 'Venta de contado', 8000, 0),
    ('4101', 'Ventas del día', 0, 8000),
]

for mov in movimientos_poliza4:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza4_id, mov[0], mov[1], mov[2], mov[3]))

# Póliza 5: Registro de costo de ventas
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (5, 'DIARIO', ?, 'Registro de costo de ventas')
''', (fecha_actual,))
poliza5_id = cursor.lastrowid

movimientos_poliza5 = [
    ('5101', 'Costo de lo vendido', 5000, 0),
    ('1101', 'Salida de inventario', 0, 5000),
]

for mov in movimientos_poliza5:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza5_id, mov[0], mov[1], mov[2], mov[3]))

# Póliza 6: Pago de gastos administrativos
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (6, 'EGRESO', ?, 'Pago de gastos administrativos')
''', (fecha_actual,))
poliza6_id = cursor.lastrowid

movimientos_poliza6 = [
    ('6101', 'Renta, luz, teléfono', 3000, 0),
    ('1101', 'Pago en efectivo', 0, 3000),
]

for mov in movimientos_poliza6:
    cursor.execute('''
        INSERT INTO movimientos (poliza_id, num_cuenta, concepto_mov, cargo, abono)
        VALUES (?, ?, ?, ?, ?)
    ''', (poliza6_id, mov[0], mov[1], mov[2], mov[3]))

print("✅ Pólizas de ejemplo creadas")

# Calcular y actualizar saldos mensuales
print("🧮 Calculando saldos mensuales...")

mes_actual = datetime.now().month
anio_actual = datetime.now().year

# Obtener todas las cuentas
cursor.execute("SELECT num_cuenta FROM catalogo_cuentas")
cuentas = cursor.fetchall()

for cuenta in cuentas:
    num_cuenta = cuenta[0]
    
    # Calcular saldo inicial (de meses anteriores, para este ejemplo es 0)
    saldo_inicial = 0
    
    # Sumar todos los cargos y abonos del mes actual
    cursor.execute('''
        SELECT 
            COALESCE(SUM(m.cargo), 0) as total_cargos,
            COALESCE(SUM(m.abono), 0) as total_abonos
        FROM movimientos m
        JOIN polizas p ON m.poliza_id = p.id
        WHERE m.num_cuenta = ? 
        AND strftime('%Y-%m', p.fecha) = ?
    ''', (num_cuenta, f"{anio_actual}-{mes_actual:02d}"))
    
    resultado = cursor.fetchone()
    total_cargos = resultado[0]
    total_abonos = resultado[1]
    
    # Determinar naturaleza de la cuenta
    cursor.execute("SELECT naturaleza FROM catalogo_cuentas WHERE num_cuenta = ?", (num_cuenta,))
    naturaleza = cursor.fetchone()[0]
    
    # Calcular saldo final según naturaleza
    if naturaleza == 'DEUDORA':
        saldo_final = saldo_inicial + total_cargos - total_abonos
    else:  # ACREEDORA
        saldo_final = saldo_inicial + total_abonos - total_cargos
    
    # Insertar saldo mensual (usando 'anio' sin eñe)
    cursor.execute('''
        INSERT OR REPLACE INTO saldos_mensuales 
        (num_cuenta, mes, anio, saldo_inicial, debe, haber, saldo_final)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (num_cuenta, mes_actual, anio_actual, saldo_inicial, 
          total_cargos, total_abonos, saldo_final))

conn.commit()
conn.close()

print("🎉 ¡Base de datos creada exitosamente!")
print("📊 Datos de prueba cargados:")
print("   - 32 cuentas contables")
print("   - 6 pólizas de ejemplo")
print("   - Saldos mensuales calculados")
print("\n🚀 Ahora ejecuta: python main.py")