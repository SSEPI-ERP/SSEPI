@echo off
chcp 65001 >nul
cls
echo =========================================
echo   SSEPI ERP - VPS LOCAL V12
echo   %date% %time%
echo   Esta PC es la VPS de conexion de modulos
echo =========================================

:: Mostrar IPs locales para acceso desde red
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4" ^| findstr /V "169.254"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        echo.
        echo   ACCESO RED LAN: http://%%~nb:3333/panel/panel.html
    )
)
echo.

:: [1] Matar procesos Node y liberar puerto
echo [1] Matando procesos Node y limpiando puerto 3333...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
netstat -ano | findstr ":3333" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo      AUN hay algo en 3333. Matando por PID...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak >nul
)
echo      Puerto 3333 libre.

:: [2] Limpiar cache y journal de SQLite (NO borrar la base)
echo [2] Limpiando cache local...
if exist "%~dp0ssepinext\data\ssepi-local.db-journal" del /q "%~dp0ssepinext\data\ssepi-local.db-journal" 2>nul
echo      OK.

:: [2a] Seed: usuarios offline (si no existen)
echo [2a] Verificando usuarios offline...
cd /d "%~dp0ssepinext"
node seed-usuarios.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Usuarios offline verificados.
) else (
    echo      (Error en usuarios - continuando)
)

:: [2b] Seed: contactos reales
echo [2b] Contactos reales (32 clientes + 10 proveedores)...
cd /d "%~dp0ssepinext"
node seed-limpiar-contactos.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Contactos insertados.
) else (
    echo      (Error en contactos - continuando)
)

:: [3] Seed: ordenes demo para PDFs
echo [3] Ordenes demo (reportes PDF)...
node seed-ordenes-terminadas.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Ordenes demo insertadas.
) else (
    echo      (Si ya existen se omiten duplicados)
)

:: [3b] Seed: pipeline conectado
echo [3b] Pipeline (cotizaciones, ventas, compras, facturas)...
node seed-pipeline.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Pipeline conectado.
) else (
    echo      (Si ya existen se omiten duplicados)
)

:: [3c] Recalcular costos con CostosEngine
echo [3c] CostosEngine - recalculando costos...
node seed-costos-ventas.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Costos calculados y ventas actualizadas.
) else (
    echo      (Error en recalculo de costos)
)

:: [3d] Seed: inventario electronica (97 componentes)
echo [3d] Inventario electronica (97 items, 383 pzas)...
node seed-inventario.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Electronica importada.
) else (
    echo      (Error en inventario electronica)
)

:: [3e] Seed: consumibles de taller (14 items)
echo [3e] Consumibles de taller (14 items, 69 pzas)...
node seed-consumibles.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Consumibles importados.
) else (
    echo      (Error en consumibles)
)

:: [3f] Seed: BOM automatizacion (292 articulos)
echo [3f] BOM automatizacion (292 articulos, 48 proveedores)...
node seed-bom.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - BOM automatizacion importado.
) else (
    echo      (Error en BOM automatizacion)
)

:: [3g] Seed: cotizacion de suministro demo
echo [3g] Cotizacion de suministro demo...
node seed-suministro-demo.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Cotizacion suministro SP-S2605001.
) else (
    echo      (Si ya existe se omite)
)

:: [3h] Seed: actividades Kanban demo (6 actividades + 18 subtareas)
echo [3h] Actividades Kanban demo...
node seed-actividades.mjs 2>nul
if %errorlevel%==0 (
    echo      OK - Actividades Kanban insertadas.
) else (
    echo      (Error en actividades - continuando)
)

:: [4] Iniciar servidor VPS (esta PC es la VPS)
echo [4] Arrancando servidor VPS SSEPI NEXT...
start "SSEPI VPS SERVER" cmd /k "node offline-server.mjs"

:: [5] Esperar a que levante
echo [5] Esperando servidor (4s)...
timeout /t 4 /nobreak >nul

:: [6] Verificar que el servidor respondio
echo [6] Verificando servidor...
curl -s http://localhost:3333/api/health >nul 2>nul
if %errorlevel%==0 (
    echo      OK - Servidor VPS activo.
) else (
    echo      AVISO: No se recibio respuesta del servidor.
    echo      Puede tardar unos segundos mas en arrancar.
)

:: [7] Abrir navegador via Cloudflare Tunnel (URL publica)
echo [7] Abriendo tunel Cloudflare y navegador...

echo.
echo =========================================
echo   SSEPI VPS LOCAL - LISTO
echo.
echo   Esta PC es la VPS de conexion.
echo   Todos los modulos corren localmente.
echo.
echo   SERVIDOR:
echo     URL local: http://localhost:3333
echo     Login:    http://localhost:3333/panel/login.html
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4" ^| findstr /V "169.254"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        echo     URL red:  http://%%~nb:3333/panel/panel.html
    )
)
echo     Health:   http://localhost:3333/api/health
echo     BOM:      http://localhost:3333/api/bom-search
echo     Inventario: http://localhost:3333/api/inventory-search
echo.
echo   USUARIOS OFFLINE:
echo     norbertomoro4@gmail.com  /  Ssepi2025!
echo     ventas1@ssepi.org       /  Ssepi2025!
echo     laboratorio1@ssepi.org  /  Ssepi2025!
echo     motores1@ssepi.org      /  Ssepi2025!
echo     automatizacion1         /  Ssepi2025!
echo     ivang.ssepi@gmail.com   /  Ssepi2025!
echo.
echo   MODULOS V12:
echo     - Laboratorio   (cotizacion + reporte + PDF)
echo     - Motores        (cotizacion + reporte + PDF)
echo     - Automatizacion (cotizacion + reporte + cronograma + PDF)
echo     - Ventas          (cotizacion + wizard 4 pasos + PDF)
echo     - Compras        (Kanban 6 estados + vinculacion)
echo     - Suministros    (catalogo BOM + inventario + cotizacion SP-S)
echo     - Facturacion    (CFDI 4.0 + timbrado)
echo     - Inventario     (CRUD + Excel + movimientos)
echo     - Contactos      (32 clientes + 10 proveedores)
echo.
echo   INVENTARIO TOTAL:
echo     Electronica:  97 items, 383 pzas, $19,585
echo     Consumibles:  14 items, 69 pzas, $7,920
echo     BOM Auto:     292 articulos, 48 proveedores, $2,174,920
echo     TOTAL:        403 items, 452+ piezas
echo.
echo   ORDENES DEMO PDF:
echo     Laboratorio: SP-E2605001 (ABB ACS580), SP-E2605002 (AB L33ER)
echo     Auto:    SP-A2605/1 (Linea Ensamble C3), SP-A2605/2 (Extrusora PID)
echo.
echo   PIPELINE (cotizacion ^> venta ^> compra ^> factura):
echo     Laboratorio 1: COT-2605-001 ^> V-2605-001 ^> CMP-SP-E2605001 ^> FAC-2605-001
echo     Laboratorio 2: COT-2605-002 ^> V-2605-002 ^> CMP-SP-E2605002 ^> FAC-2605-002
echo     Auto 1:   COT-2605-A01 ^> V-2605-A01 ^> CMP-SP-A2605-1 ^> FAC-2605-A01
echo     Auto 2:   COT-2605-A02 ^> V-2605-A02 ^> CMP-SP-A2605-2 ^> FAC-2605-A02
echo.
echo   COSTOS ENGINE:
echo     Laboratorio BODYCOTE:    $16,282.93
echo     Laboratorio NISHIKAWA:   $23,173.29
echo     Auto    BOLSAS ALTOS:    $345,318.95
echo     Auto    CONDUMEX:        $161,211.07
echo =========================================
:: [8] Iniciar tunel Cloudflare automaticamente (URL publica)
echo [8] Iniciando tunel Cloudflare...
start "Cloudflare Tunnel SSEPI" /D "%~dp0ssepinext" cmd /k iniciar-tunel-cloudflare.bat
echo.
echo =========================================
echo   SSEPI LOCAL + TUNEL PUBLICO - LISTO
echo.
echo   Tunel Cloudflare iniciando...
echo   Chrome se abrira solo con la URL publica.
echo   Espera ~15 segundos.
echo =========================================
echo.
pause