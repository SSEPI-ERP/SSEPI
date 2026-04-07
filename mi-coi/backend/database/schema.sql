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

-- Tabla de movimientos (detalle de pólizas)
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

-- Tabla de saldos (para acumulados mensuales)
CREATE TABLE saldos_mensuales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num_cuenta TEXT NOT NULL,
    mes INTEGER NOT NULL,
    año INTEGER NOT NULL,
    saldo_inicial REAL DEFAULT 0,
    debe REAL DEFAULT 0,
    haber REAL DEFAULT 0,
    saldo_final REAL DEFAULT 0,
    FOREIGN KEY (num_cuenta) REFERENCES catalogo_cuentas(num_cuenta),
    UNIQUE(num_cuenta, mes, año)
);