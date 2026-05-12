@echo off
chcp 65001 >nul
cls
echo =========================================
echo   SSEPI - Cloudflare Tunnel (trycloudflare)
echo =========================================
echo.

:: Buscar cloudflared.exe en PATH o ubicaciones comunes
set "CF="
for /f "usebackq delims=" %%a in (`where cloudflared.exe 2>nul`) do (
    set "CF=%%a"
    goto :found
)
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
    goto :found
)
if exist "C:\Program Files\cloudflared\cloudflared.exe" (
    set "CF=C:\Program Files\cloudflared\cloudflared.exe"
    goto :found
)
if exist "%LOCALAPPDATA%\cloudflared\cloudflared.exe" (
    set "CF=%LOCALAPPDATA%\cloudflared\cloudflared.exe"
    goto :found
)
:found

set "TUNNELLOG=%TEMP%\ssepi-tunnel.log"

if "%CF%"=="" (
    echo ERROR: No se encontro cloudflared.exe.
    echo.
    echo Descargalo desde: https://github.com/cloudflare/cloudflared/releases
    echo Instalalo y reintenta.
    pause
    exit /b 1
)

echo [TUNEL] cloudflared encontrado:
echo   %CF%
echo.

:: Limpiar log anterior
if exist "%TUNNELLOG%" del /q "%TUNNELLOG%"

:: Verificar que el servidor local este activo
curl -s http://localhost:3333/api/health >nul 2>nul
if %errorlevel% neq 0 (
    echo AVISO: El servidor local (localhost:3333) no responde.
    echo Asegurate de correr reiniciar-ssepi.bat primero.
    echo.
    echo Continuando de todos modos...
    echo.
)

echo [TUNEL] Conectando a Cloudflare...
echo [TUNEL] Espera ~15 segundos para obtener la URL publica...
echo.

:: Iniciar cloudflared en background usando PowerShell
powershell -WindowStyle Hidden -Command "Start-Process '%CF%' -ArgumentList 'tunnel','--url','http://localhost:3333' -RedirectStandardOutput '%TUNNELLOG%' -RedirectStandardError '%TUNNELLOG%' -WindowStyle Hidden"

:: Esperar a que genere la URL
timeout /t 15 /nobreak >nul

:: Parsear URL del log
echo [TUNEL] Obteniendo URL publica...
set "TUNNELURL="
for /f "usebackq delims=" %%a in (`powershell -Command "$txt=Get-Content '%TUNNELLOG%' -Raw; if($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $matches[0] } else { 'NOT_FOUND' }"`) do (
    set "TUNNELURL=%%a"
)

if "%TUNNELURL%"=="NOT_FOUND" (
    echo.
    echo [TUNEL] No se pudo obtener la URL automaticamente.
    echo [TUNEL] Revisa el log en: %TUNNELLOG%
    pause
    exit /b 1
)

echo.
echo =========================================
echo   TUNEL ACTIVO
echo.
echo   URL PUBLICA:
echo     %TUNNELURL%
echo.
echo   Esta URL es temporal.
echo   Cada vez que reinicies el tunel cambia.
echo =========================================
echo.

:: Abrir Chrome con la URL publica al login
echo [TUNEL] Abriendo Chrome...
start chrome "%TUNNELURL%/panel/login.html"

echo.
echo [TUNEL] Chrome abierto con la URL publica.
echo [TUNEL] El tunel sigue corriendo en segundo plano.
echo.
echo NOTA: Todo lo que guardes a traves de esta URL se guarda en tu
echo       base de datos local (ssepi-local.db). Los cambios se reflejan
echo       automaticamente en todos los modulos.
echo.
pause
