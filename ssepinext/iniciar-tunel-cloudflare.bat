@echo off
chcp 65001 >nul
title Cloudflare Tunnel SSEPI
echo.
echo  Tunel publico SSEPI ^(trycloudflare.com^)
echo.
echo  ORDEN CORRECTO:
echo    - Primera vez o tras error: reiniciar-ssepi.bat ^(servidor + tunel^)
echo    - Si el servidor YA corre ^(ventana SSEPI SERVER^): puedes ejecutar SOLO este bat
echo.
echo  NO ejecutes node offline-server.mjs a mano si ya hay ventana SSEPI SERVER
echo  ^(sale EADDRINUSE puerto 3443^).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-tunel-cloudflare.ps1"
echo.
pause
