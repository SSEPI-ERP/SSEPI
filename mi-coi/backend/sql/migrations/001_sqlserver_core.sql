/*
Fase 1 - Núcleo COI interconectado para SQL Server.
*/

IF OBJECT_ID('dbo.cuentas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cuentas (
        id_cuenta INT IDENTITY(1,1) PRIMARY KEY,
        num_cuenta VARCHAR(30) NOT NULL UNIQUE,
        descripcion VARCHAR(180) NOT NULL,
        nivel TINYINT NOT NULL,
        tipo_cuenta CHAR(1) NOT NULL DEFAULT 'A', -- A acumulativa / D detalle
        naturaleza CHAR(1) NOT NULL, -- D deudora / A acreedora
        tipo_balance CHAR(1) NULL, -- B balance / R resultado
        moneda CHAR(3) NOT NULL DEFAULT 'MXN',
        codigo_agrupador VARCHAR(12) NULL,
        cuenta_mayor VARCHAR(30) NULL
    );
END
GO

IF OBJECT_ID('dbo.polizas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.polizas (
        id_poliza INT IDENTITY(1,1) PRIMARY KEY,
        tipo_poliza CHAR(1) NOT NULL, -- I/E/D
        numero_poliza INT NOT NULL,
        ejercicio SMALLINT NOT NULL,
        periodo TINYINT NOT NULL,
        fecha_poliza DATE NOT NULL,
        concepto VARCHAR(250) NOT NULL,
        id_moneda CHAR(3) NOT NULL DEFAULT 'MXN',
        tipo_cambio DECIMAL(18,6) NOT NULL DEFAULT 1.0,
        total_cargos DECIMAL(18,4) NOT NULL DEFAULT 0,
        total_abonos DECIMAL(18,4) NOT NULL DEFAULT 0,
        estatus CHAR(1) NOT NULL DEFAULT 'C', -- C/V/A
        fecha_captura DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_polizas_periodo_tipo ON dbo.polizas(ejercicio, periodo, tipo_poliza);
END
GO

IF OBJECT_ID('dbo.partidas_poliza', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.partidas_poliza (
        id_partida INT IDENTITY(1,1) PRIMARY KEY,
        id_poliza INT NOT NULL,
        numero_linea SMALLINT NOT NULL,
        num_cuenta VARCHAR(30) NOT NULL,
        concepto_linea VARCHAR(250) NULL,
        cargo DECIMAL(18,4) NOT NULL DEFAULT 0,
        abono DECIMAL(18,4) NOT NULL DEFAULT 0,
        cargo_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        abono_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        cliente_rfc VARCHAR(13) NULL,
        cliente_nombre VARCHAR(180) NULL,
        CONSTRAINT FK_partidas_poliza_poliza FOREIGN KEY(id_poliza) REFERENCES dbo.polizas(id_poliza)
    );
    CREATE INDEX IX_partidas_poliza_poliza ON dbo.partidas_poliza(id_poliza);
    CREATE INDEX IX_partidas_poliza_cuenta ON dbo.partidas_poliza(num_cuenta);
END
GO

IF OBJECT_ID('dbo.saldos_cuenta', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.saldos_cuenta (
        id_saldo INT IDENTITY(1,1) PRIMARY KEY,
        num_cuenta VARCHAR(30) NOT NULL,
        ejercicio SMALLINT NOT NULL,
        periodo TINYINT NOT NULL,
        saldo_inicial_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        cargos_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        abonos_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        saldo_final_mn DECIMAL(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT UQ_saldos_cuenta UNIQUE(num_cuenta, ejercicio, periodo)
    );
END
GO

IF OBJECT_ID('dbo.cfdi_poliza', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cfdi_poliza (
        id_cfdi_poliza INT IDENTITY(1,1) PRIMARY KEY,
        id_partida INT NOT NULL,
        uuid CHAR(36) NOT NULL,
        rfc_emisor VARCHAR(13) NULL,
        rfc_receptor VARCHAR(13) NULL,
        fecha_cfdi DATE NULL,
        subtotal DECIMAL(18,4) NULL,
        iva_trasladado DECIMAL(18,4) NULL,
        iva_retenido DECIMAL(18,4) NULL,
        isr_retenido DECIMAL(18,4) NULL,
        total_cfdi DECIMAL(18,4) NULL,
        tipo_comprobante CHAR(1) NULL,
        metodo_pago VARCHAR(3) NULL,
        forma_pago VARCHAR(3) NULL,
        xml_raw NVARCHAR(MAX) NULL,
        CONSTRAINT FK_cfdi_partida FOREIGN KEY(id_partida) REFERENCES dbo.partidas_poliza(id_partida),
        CONSTRAINT UQ_cfdi_uuid UNIQUE(uuid)
    );
END
GO

IF OBJECT_ID('dbo.monedas_catalogo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.monedas_catalogo (
        id_moneda INT IDENTITY(1,1) PRIMARY KEY,
        nombre VARCHAR(80) NOT NULL,
        simbolo VARCHAR(10) NOT NULL,
        clave_fiscal CHAR(3) NOT NULL UNIQUE,
        tipo_cambio DECIMAL(18,6) NOT NULL DEFAULT 1.0,
        fecha_ultimo_cambio DATE NULL
    );
END
GO

IF OBJECT_ID('dbo.tipos_cambio', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tipos_cambio (
        id_tc INT IDENTITY(1,1) PRIMARY KEY,
        fecha DATE NOT NULL,
        clave_fiscal CHAR(3) NOT NULL,
        tipo_cambio DECIMAL(18,6) NOT NULL,
        fuente VARCHAR(40) NULL,
        CONSTRAINT UQ_tipos_cambio UNIQUE(fecha, clave_fiscal)
    );
END
GO

