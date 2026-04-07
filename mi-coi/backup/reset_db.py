# reset_db.py
import sqlite3
import os
from datetime import datetime

print("=" * 50)
print("🔄 REINICIANDO BASE DE DATOS COMPLETAMENTE")
print("=" * 50)

# Rutas
ruta_actual = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(ruta_actual, 'backend', 'database', 'contabilidad.db')
os.makedirs(os.path.dirname(db_path), exist_ok=True)

print(f"📁 Base de datos: {db_path}")

# Eliminar archivo existente si existe
if os.path.exists(db_path):
    os.remove(db_path)
    print("🗑️ Base de datos anterior eliminada")

# Conectar (crea el archivo nuevo)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("🔨 Creando tablas...")

# Crear tablas con la estructura correcta
cursor.executescript('''
    -- Tabla de catálogo de cuentas
    CREATE TABLE catalogo_cuentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_cuenta TEXT UNIQUE NOT NULL,
        nombre_cuenta TEXT NOT NULL,
        nivel INTEGER NOT NULL,
        naturaleza TEXT CHECK(naturaleza IN ('DEUDORA', 'ACREEDORA')) NOT NULL,
        cuenta_mayor TEXT,
        FOREIGN KEY (cuenta_mayor) REFERENCES catalogo_cuentas(num_cuenta)
    );

    -- Tabla de pólizas
    CREATE TABLE polizas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_poliza INTEGER NOT NULL,
        tipo_poliza TEXT CHECK(tipo_poliza IN ('INGRESO', 'EGRESO', 'DIARIO')) NOT NULL,
        fecha DATE NOT NULL,
        concepto TEXT NOT NULL,
        UNIQUE(numero_poliza, tipo_poliza, fecha)
    );

    -- Tabla de movimientos
    CREATE TABLE movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poliza_id INTEGER NOT NULL,
        num_cuenta TEXT NOT NULL,
        concepto_mov TEXT,
        cargo REAL DEFAULT 0,
        abono REAL DEFAULT 0,
        FOREIGN KEY (poliza_id) REFERENCES polizas(id),
        FOREIGN KEY (num_cuenta) REFERENCES catalogo_cuentas(num_cuenta)
    );

    -- Tabla de saldos mensuales (ANIO sin acento)
    CREATE TABLE saldos_mensuales (
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

print("✅ Tablas creadas")

# Insertar catálogo de cuentas
print("📝 Insertando catálogo de cuentas...")

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
    cursor.execute('''
        INSERT INTO catalogo_cuentas (num_cuenta, nombre_cuenta, nivel, naturaleza, cuenta_mayor)
        VALUES (?, ?, ?, ?, ?)
    ''', cuenta)

print(f"✅ {len(cuentas)} cuentas insertadas")

# Insertar pólizas de ejemplo
print("📝 Insertando pólizas de ejemplo...")

fecha_actual = datetime.now().strftime('%Y-%m-%d')

# Póliza 1: Aportación de capital
cursor.execute('''
    INSERT INTO polizas (numero_poliza, tipo_poliza, fecha, concepto)
    VALUES (1, 'DIARIO', ?, 'Aportación inicial de capital')
''', (fecha_actual,))
poliza1_id = cursor.lastrowid

movimientos_poliza1 = [
    ('1101', 'Aportación en efectivo', 50000, 0),
    ('3101', 'Capital aportado', 0, 50000),
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
    ('1102', 'Pago con transferencia', 0, 25000),
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

print("✅ 6 pólizas insertadas")

# Calcular saldos mensuales
print("🧮 Calculando saldos mensuales...")

mes_actual = datetime.now().month
anio_actual = datetime.now().year

cursor.execute("SELECT num_cuenta, naturaleza FROM catalogo_cuentas")
cuentas = cursor.fetchall()

for num_cuenta, naturaleza in cuentas:
    # Sumar cargos y abonos del mes
    cursor.execute('''
        SELECT 
            COALESCE(SUM(m.cargo), 0) as total_cargos,
            COALESCE(SUM(m.abono), 0) as total_abonos
        FROM movimientos m
        JOIN polizas p ON m.poliza_id = p.id
        WHERE m.num_cuenta = ? 
        AND strftime('%Y-%m', p.fecha) = ?
    ''', (num_cuenta, f"{anio_actual}-{mes_actual:02d}"))
    
    total_cargos, total_abonos = cursor.fetchone()
    
    # Calcular saldo final según naturaleza
    if naturaleza == 'DEUDORA':
        saldo_final = total_cargos - total_abonos
    else:
        saldo_final = total_abonos - total_cargos
    
    # Insertar saldo mensual
    cursor.execute('''
        INSERT INTO saldos_mensuales 
        (num_cuenta, mes, anio, saldo_inicial, debe, haber, saldo_final)
        VALUES (?, ?, ?, 0, ?, ?, ?)
    ''', (num_cuenta, mes_actual, anio_actual, total_cargos, total_abonos, saldo_final))

conn.commit()

# Verificar que los saldos se insertaron
cursor.execute("SELECT COUNT(*) FROM saldos_mensuales")
num_saldos = cursor.fetchone()[0]
print(f"✅ {num_saldos} registros de saldos mensuales creados")

# Mostrar un resumen de los saldos más importantes
print("\n" + "=" * 50)
print("📊 RESUMEN DE SALDOS")
print("=" * 50)

cursor.execute('''
    SELECT c.num_cuenta, c.nombre_cuenta, s.saldo_final
    FROM saldos_mensuales s
    JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
    WHERE c.nivel = 1
    ORDER BY c.num_cuenta
''')

print("\nSaldos de cuentas de nivel 1:")
for cuenta in cursor.fetchall():
    print(f"  {cuenta[0]} - {cuenta[1]}: ${cuenta[2]:,.2f}")

# Verificar balance
cursor.execute('''
    SELECT 
        SUM(CASE WHEN c.num_cuenta LIKE '1%' THEN s.saldo_final ELSE 0 END) as activo,
        SUM(CASE WHEN c.num_cuenta LIKE '2%' THEN s.saldo_final ELSE 0 END) as pasivo,
        SUM(CASE WHEN c.num_cuenta LIKE '3%' THEN s.saldo_final ELSE 0 END) as capital
    FROM saldos_mensuales s
    JOIN catalogo_cuentas c ON s.num_cuenta = c.num_cuenta
    WHERE s.mes = ? AND s.anio = ?
''', (mes_actual, anio_actual))

activo, pasivo, capital = cursor.fetchone()
print(f"\n✅ VERIFICACIÓN DE BALANCE:")
print(f"   Activo:  ${activo:,.2f}")
print(f"   Pasivo:  ${pasivo:,.2f}")
print(f"   Capital: ${capital:,.2f}")
print(f"   Total Pasivo + Capital: ${pasivo + capital:,.2f}")

if abs(activo - (pasivo + capital)) < 0.01:
    print("   ✅ ¡EL BALANCE CUADRA CORRECTAMENTE!")
else:
    print(f"   ❌ DIFERENCIA: ${activo - (pasivo + capital):,.2f}")

conn.close()

print("\n" + "=" * 50)
print("🎉 BASE DE DATOS RECONSTRUIDA EXITOSAMENTE")
print("=" * 50)
print("\n📋 Para ver los datos de ejemplo en el programa:")
print("   1. Ejecuta: python main.py")
print("   2. Ve a 'Balanza' y selecciona el mes actual")
print("   3. Ve a 'Edo. Resultados' para ver ventas, costos y gastos")
print("   4. Ve a 'Balance General' para ver que todo cuadra")
print("\n💡 Los datos de ejemplo son:")
print("   - Aportación de capital: $50,000")
print("   - Compra de mobiliario: $15,000")
print("   - Compra de equipo: $25,000")
print("   - Ventas: $8,000")
print("   - Costo de ventas: $5,000")
print("   - Gastos administrativos: $3,000")
print("   - Utilidad neta: $0 (8,000 - 5,000 - 3,000 = 0)")