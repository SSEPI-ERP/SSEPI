@echo off
chcp 65001 >nul
echo =========================================
echo  URL del tunel Cloudflare (SSEPI)
echo =========================================
echo.

if exist "%~dp0URL-TUNEL-ACTIVA.txt" (
    type "%~dp0URL-TUNEL-ACTIVA.txt"
    echo.
) else if exist "%~dp0..\logs\ultima-url-tunel.txt" (
    echo Ultima URL guardada ^(puede estar CADUCADA si cerraste el tunel^):
    type "%~dp0..\logs\ultima-url-tunel.txt"
    echo.
) else (
    echo No hay URL guardada.
    echo.
)

echo Si la URL no abre ^(DNS_PROBE_FINISHED_NXDOMAIN^):
echo   1. Ejecuta reiniciar-ssepi.bat  ^(servidor + tunel^)
echo   2. O solo: ssepinext\iniciar-tunel-cloudflare.bat
echo   3. Usa la URL NUEVA que aparece en la ventana del tunel
echo.
pause
