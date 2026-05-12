@echo off
chcp 65001 >nul
cls
echo =========================================
echo   SSEPI - Cloudflare Tunnel (trycloudflare)
echo =========================================
echo.
echo  Iniciando tunel para localhost:3333...
echo  Esto puede tardar 5-10 segundos.
echo.

:: Ruta a cloudflared (ajustar si esta en otra ubicacion)
set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"

if not exist "%CF%" (
    echo ERROR: No se encontro cloudflared.exe en:
    echo   %CF%
    echo.
    echo Descargalo desde: https://github.com/cloudflare/cloudflared/releases
    echo Instalalo y reintenta.
    pause
    exit /b 1
)

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
"%CF%" tunnel --url http://localhost:3333

:: Si llega aqui, el tunel se ceró
echo.
echo [TUNEL] Tunel cerrado.
pause
