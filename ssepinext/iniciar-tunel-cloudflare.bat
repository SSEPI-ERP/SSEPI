@echo off
chcp 65001 >nul
cls
echo =========================================
echo   SSEPI - Cloudflare Tunnel (trycloudflare)
echo =========================================
echo.

:: Ruta a cloudflared (ajustar si esta en otra ubicacion)
set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "TUNNELLOG=%TEMP%\ssepi-tunnel.log"

if not exist "%CF%" (
    echo ERROR: No se encontro cloudflared.exe en:
    echo   %CF%
    echo.
    echo Descargalo desde: https://github.com/cloudflare/cloudflared/releases
    echo Instalalo y reintenta.
    pause
    exit /b 1
)

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

:: Iniciar cloudflared en background usando PowerShell (maneja espacios en ruta)
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
    echo [TUNEL] Revisa la ventana del tunel o el log en:
    echo   %TUNNELLOG%
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

:: Abrir Chrome con la URL publica
start chrome "%TUNNELURL%"

echo [TUNEL] Chrome abierto con la URL publica.
echo [TUNEL] El tunel sigue corriendo en segundo plano.
echo.
echo NOTA: Todo lo que guardes a traves de esta URL se guarda en tu
       base de datos local (ssepi-local.db). Los cambios se reflejan
       automaticamente en todos los modulos.
echo.
pause
