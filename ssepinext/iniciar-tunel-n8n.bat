@echo off
chcp 65001 >nul
cls
echo =========================================
echo   n8n - Cloudflare Tunnel (trycloudflare)
echo =========================================
echo.
echo  Iniciando tunel para n8n localhost:5678...
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

echo [TUNEL] Conectando n8n a Cloudflare...
echo.
echo Nota: Si n8n no esta corriendo, abre otra terminal y corre:
echo   docker-compose up -d
echo.

"%CF%" tunnel --url http://localhost:5678

:: Si llega aqui, el tunel se ceró
echo.
echo [TUNEL] Tunel de n8n cerrado.
pause
